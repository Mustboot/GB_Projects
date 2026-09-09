#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Import Schlumberger LAS drilling-log files into DrillingLogs_full.accdb.

Filename convention:  <WELL>_<TYPE>_<date>[_<range>].las
  * WELL = well name (everything before the first '_') -> links every row to a well
  * TYPE = record type (MSEDA, MSETA, LWDD, ...)        -> one unified table per type

Database schema produced:
  Wells            one row per well (identity + metadata)
  <TYPE>           one table per type, unified across all files of that type
  CurveDictionary  metadata for each curve column (mnemonic, unit, source, description)
  ImportLog        import tracking -> idempotent / incremental re-runs

Column selection: each record type is mapped by an explicit COLUMN_SPEC (ordered
target columns, source mnemonics, optional unit conversion and density
correction); anything not listed is dropped. Multiple source mnemonics for the
same column are coalesced (first non-null value wins).
"""

import os
import re
import sys
import hashlib
import datetime as _dt
from collections import defaultdict, OrderedDict

import pyodbc
import win32com.client

# ---------------------------------------------------------------------------
# configuration
# ---------------------------------------------------------------------------
# When frozen by PyInstaller, `__file__` points into a temp extraction dir, so
# resolve the base directory from the executable location instead.
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data_import')
DB_PATH = os.path.join(BASE_DIR, 'DrillingLogs_full.accdb')
ENCODING = 'latin-1'
DEFAULT_NULL = -999.25
NULL_TO_DB_NULL = True   # store the LAS null sentinel as SQL NULL instead of a number

CONN_STR = r'DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=' + DB_PATH + ';'

# ~WELL INFORMATION key -> Wells table column
WELL_COLUMN_MAP = OrderedDict([
    ('WELL',    'WellName_LAS'),
    ('COMP',    'Company'),
    ('FLD',     'Field'),
    ('RIGN',    'Rig'),
    ('RIGTYP',  'RigType'),
    ('SRVC',    'ServiceCompany'),
    ('CTRY',    'Country'),
    ('STAT',    'StateProvince'),
    ('CNTY',    'County'),
    ('DATE',    'LogDate'),
    ('UWI',     'UWI'),
    ('LATI',    'Latitude'),
    ('LONG',    'Longitude'),
    ('SOURCE',  'SourceRun'),
])

# Shared source-mnemonic groups (see COLUMN_SPEC).
_GR = ['GR', 'GRAM', 'GR1AFM', 'GRMA_CAL', 'GR_ARC_CAL', 'GR_ARC_RT',
       'ARC_GR_RT', 'GRMA', 'GRMA_FILT', 'GRMA_FINAL', 'GR_CAL',
       'GR_ARC', 'GR_ARC_FILT']
_INCL = ['INCL_CONT', 'CINCL', 'INCL', 'INCL_CONT_RT']
_ROP = ['ROP', 'ROP5', 'ROP5_RM', 'ROP_AVG']
_RPM = ['RPM', 'RPM_ADN', 'BIT_RPM_AVG']
_SPPA = ['SPPA', 'PUMP', 'PUMP_AVG']
_TFLO = ['TFLO', 'FLOWIN']
_DHAP = ['DHAP', 'DHAP_ON', 'APRESM', 'APRS_ARC', 'APRS_ARC_RT', 'APRS_RT']
_DHAT = ['DHAT', 'TCDM']
_ECD = ['ECD', 'ECD_ARC', 'ECD_RT', 'ACTECDM']

# Final column specification per record type, in the exact output order.
# Each entry:
#   name        -> final column name
#   sources     -> source LAS mnemonics coalesced into this column
#   convert     -> {normalised unit: multiplier} applied to values (default x1)
#   correction  -> source mnemonic whose value is ADDED to this column
# The first entry of each type is used as the depth/time index.
COLUMN_SPEC = {
    'MSEDA': [
        {'name': 'DEPT', 'sources': ['DEPT', 'DEPTH']},
        {'name': 'TVD', 'sources': ['TVD']},
        {'name': 'AZIM', 'sources': ['AZIM_CONT']},
        {'name': 'INCL', 'sources': _INCL},
        {'name': 'ROP', 'sources': _ROP},
        {'name': 'RPM', 'sources': _RPM},
        {'name': 'SPPA', 'sources': _SPPA, 'convert': {'kpa': 0.1450377}},
        {'name': 'TFLO', 'sources': _TFLO},
        {'name': 'DHAP', 'sources': _DHAP, 'convert': {'kpa': 0.1450377}},
        {'name': 'DHAT', 'sources': _DHAT},
        {'name': 'ECD', 'sources': _ECD, 'convert': {'g/cc': 8.3454}},
        {'name': 'GR', 'sources': _GR},
    ],
    'MSETA': [
        {'name': 'TIME_1900', 'sources': ['TIME_1900']},
        {'name': 'DEPT', 'sources': ['DEPT', 'DEPTH']},
        {'name': 'INCL', 'sources': _INCL},
        {'name': 'AZIM', 'sources': ['AZIM_CONT']},
        {'name': 'ROP', 'sources': _ROP},
        {'name': 'RPM', 'sources': _RPM},
        {'name': 'TFLO', 'sources': _TFLO},
        {'name': 'DHAP', 'sources': _DHAP, 'convert': {'kpa': 0.1450377}},
        {'name': 'DHAT', 'sources': _DHAT},
        {'name': 'GR', 'sources': _GR},
        {'name': 'ECD', 'sources': _ECD, 'convert': {'g/cc': 8.3454}},
        {'name': 'SPPA', 'sources': _SPPA, 'convert': {'kpa': 0.1450377}},
    ],
    'LWDD': [
        {'name': 'DEPT', 'sources': ['DEPT', 'DEPTH']},
        {'name': 'TVD', 'sources': ['TVD']},
        {'name': 'INCL', 'sources': ['DEVI', 'INCL']},
        {'name': 'DCAV', 'sources': ['DCAV']},
        {'name': 'DCHO', 'sources': ['DCHO']},
        {'name': 'DCVE', 'sources': ['DCVE']},
        {'name': 'UCAV', 'sources': ['UCAV']},
        {'name': 'UCHO', 'sources': ['UCHO']},
        {'name': 'UCVE', 'sources': ['UCVE']},
        {'name': 'GR', 'sources': _GR},
        {'name': 'RHOB', 'sources': ['RHOB'], 'correction': 'DRHO'},
        {'name': 'ROBB', 'sources': ['ROBB'], 'correction': 'DRHB'},
        {'name': 'ROBL', 'sources': ['ROBL'], 'correction': 'DRHL'},
        {'name': 'ROBR', 'sources': ['ROBR'], 'correction': 'DRHR'},
        {'name': 'ROBU', 'sources': ['ROBU'], 'correction': 'DRHU'},
    ],
}

# Record types recognised in filenames (used to locate the type token).
KNOWN_TYPES = ('MSEDA', 'MSETA', 'LWDD')

# Types that carry a RunType column (LWDD -> DRCAL / BRCAL).
RUN_TYPE_TYPES = {'LWDD'}

# Equivalent unit notations -> canonical unit.
UNIT_ALIASES = {
    'lbm/gal': 'ppg',
    'lb/gal': 'ppg',
    'lb/g': 'ppg',
    'm/hr': 'm/h',
    'c/min': 'rpm',
    'rev/min': 'rpm',
    'api': 'gapi',
    'usgal/min': 'gal/min',
    'usgl/min': 'gal/min',
    'gpm': 'gal/min',
    'g/cm3': 'g/cc',
    'g/c3': 'g/cc',
    'gm/cc': 'g/cc',
}


# ---------------------------------------------------------------------------
# LAS parsing
# ---------------------------------------------------------------------------
def normalize_well_name(name):
    """Canonicalise a well name to the hyphenated form.

    Uppercases, normalises dash characters to a hyphen, and inserts a hyphen
    between the letter prefix and the numeric suffix, so 'OP40' and 'OP-40'
    both map to 'OP-40' (while 'OP6ST1' stays 'OP-6ST1').
    """
    s = (name or '').strip()
    for ch in ('\u2013', '\u2014', '\u2010', '\u2212'):
        s = s.replace(ch, '-')
    s = re.sub(r'\s*-\s*', '-', s)
    s = re.sub(r'(?<=[A-Za-z])(?=\d)', '-', s, count=1)
    s = re.sub(r'\s+', '_', s).strip()
    return s.upper()


def parse_las(path):
    with open(path, encoding=ENCODING) as f:
        lines = f.read().splitlines()

    sections = {}
    current = None
    for ln in lines:
        if ln.startswith('~'):
            name = ln[1:].strip().upper()
            # LAS section names are identified by their first letter (V/W/C/A/O),
            # but files spell them differently: '~WELL INFORMATION' vs
            # '~WELL INFORMATION BLOCK', '~ASCII' vs '~A'.
            current = name[0] if name else ''
            sections.setdefault(current, [])
        elif current is not None:
            sections[current].append(ln)

    well_info = {}
    for ln in sections.get('W', []):
        if ln.startswith('#') or not ln.strip():
            continue
        left, _sep, right = ln.partition(':')
        toks = left.split()
        if not toks:
            continue
        mnemonic = toks[0]
        if '.' in mnemonic:
            # LAS 2.0 joined form 'MNEMONIC.UNIT' -> value follows directly
            mnemonic = mnemonic.split('.', 1)[0]
            value = ' '.join(toks[1:]).strip()
        else:
            # 'MNEMONIC  .UNIT  VALUE' -> value follows the unit token
            value = ' '.join(toks[2:]).strip()
        well_info[mnemonic.upper()] = (None, value, right.strip())

    curves = []
    for ln in sections.get('C', []):
        if ln.startswith('#') or not ln.strip():
            continue
        left, _sep, right = ln.partition(':')
        toks = left.split()
        if not toks:
            continue
        mnemonic = toks[0]
        unit_tokens = toks[1:]
        if '.' in mnemonic:
            # LAS 2.0 joined form 'MNEMONIC.UNIT' as a single token
            mnemonic, unit_part = mnemonic.split('.', 1)
            unit_tokens = [unit_part] + unit_tokens
        unit = ' '.join(unit_tokens).strip().lstrip('.').strip()
        parens = re.findall(r'\(([^)]*)\)', right)
        api = [p.strip() for p in parens if ' ' not in p]
        source = None
        if 'RT' in api:
            i = api.index('RT')
            if i + 1 < len(api):
                source = api[i + 1]
        description = right
        for p in parens:
            if ' ' not in p:
                description = description.replace('(' + p + ')', '')
        description = re.sub(r'\s+', ' ', description).strip()
        curves.append({
            'mnemonic': mnemonic,
            'unit': unit,
            'source': source,
            'description': description,
        })

    data = []
    for ln in sections.get('A', []):
        if ln.startswith('#') or not ln.strip():
            continue
        data.append(ln.split())

    null_value = DEFAULT_NULL
    if 'NULL' in well_info:
        try:
            null_value = float(well_info['NULL'][1])
        except ValueError:
            pass

    filename = os.path.basename(path)
    parts = filename.split('_')
    well_part = parts[0]
    # "Slot_5_..." filenames split the slot number into a separate token -> "SLOT-5"
    if well_part.upper() == 'SLOT' and len(parts) > 1 and parts[1].isdigit():
        well_part = '%s-%s' % (well_part, parts[1])
    well = normalize_well_name(well_part)
    rtype = next((p for p in parts[1:] if p.upper() in KNOWN_TYPES), 'UNKNOWN')

    return {
        'filename': filename,
        'well': well,
        'type': rtype,
        'well_info': well_info,
        'curves': curves,
        'data': data,
        'null_value': null_value,
    }


def normalize_mnemonic(m):
    """Normalise a mnemonic: strip quotes/whitespace and uppercase."""
    return (m or '').strip().strip('"').strip("'").upper()


def normalize_unit(unit):
    """Normalise a unit string: strip the leading dot, lowercase, collapse spaces,
    and map equivalent notations to a canonical form (UNIT_ALIASES)."""
    u = (unit or '').strip().lstrip('.').lower().strip()
    return UNIT_ALIASES.get(u, u)


def detect_run_type(parsed):
    """DRCAL (caliper while drilling) / BRCAL (caliper during back-reaming).

    Inspects the filename and the LAS SOURCE header (e.g. 'Run 03-Reaming').
    Only meaningful for LWDD; returns None otherwise.
    """
    if parsed['type'] != 'LWDD':
        return None
    source = (parsed['well_info'].get('SOURCE', (None, ''))[1] or '').lower()
    fname = parsed['filename'].lower()
    tokens = re.split(r'[^a-z0-9]+', fname)
    ream = {'brcal', 'brc', 'br', 'rdcal', 'reamup', 'reaming', 'reame', 'backream'}
    if any(t in ream for t in tokens) or 'ream' in source or 'backream' in source:
        return 'BRCAL'
    if 'drcal' in tokens or 'drilling' in source:
        return 'DRCAL'
    return None


def filter_curves(parsed):
    """Keep only the source mnemonics used by this record type's COLUMN_SPEC.

    Returns (curves, data) trimmed to the kept columns. Types without a spec
    are kept unchanged.
    """
    spec = COLUMN_SPEC.get(parsed['type'])
    if spec is None:
        return parsed['curves'], parsed['data']
    keep = set()
    for col in spec:
        for m in col['sources']:
            keep.add(normalize_mnemonic(m))
        if col.get('correction'):
            keep.add(normalize_mnemonic(col['correction']))
    idx = [i for i, c in enumerate(parsed['curves'])
           if normalize_mnemonic(c['mnemonic']) in keep]
    curves = [parsed['curves'][i] for i in idx]
    n_curves = len(parsed['curves'])
    data = []
    for row in parsed['data']:
        if len(row) >= n_curves:
            data.append([row[i] for i in idx])
        else:
            data.append([row[i] for i in idx if i < len(row)])
    return curves, data


# ---------------------------------------------------------------------------
# Access helpers
# ---------------------------------------------------------------------------
def brack(name):
    return '[' + str(name).replace(']', ']]') + ']'


def get_table_names(cur):
    return [r.table_name for r in cur.tables(tableType='TABLE')]


def get_columns(cur, table):
    return [r.column_name for r in cur.columns(table=table)]


def get_or_create_well(cur, well_name, well_info, cache):
    if well_name in cache:
        return cache[well_name]

    cur.execute('SELECT WellID FROM Wells WHERE WellName = ?', (well_name,))
    row = cur.fetchone()
    if row is not None:
        cache[well_name] = row[0]
        return row[0]

    cols = ['WellName']
    vals = [well_name]
    for las_key, col in WELL_COLUMN_MAP.items():
        cols.append(col)
        if las_key in well_info:
            vals.append(well_info[las_key][1])
        else:
            vals.append(None)
    sql = ('INSERT INTO Wells (%s) VALUES (%s)'
           % (', '.join(brack(c) for c in cols), ', '.join('?' * len(cols))))
    cur.execute(sql, vals)
    cur.execute('SELECT @@IDENTITY')
    well_id = cur.fetchone()[0]
    cache[well_name] = well_id
    return well_id


def to_db_value(s, is_numeric, null_value):
    if s is None:
        return None
    if is_numeric:
        try:
            v = float(s)
        except (ValueError, TypeError):
            return None
        if NULL_TO_DB_NULL and abs(v - null_value) < 1e-6:
            return None
        return v
    return s


# ---------------------------------------------------------------------------
# schema
# ---------------------------------------------------------------------------
def create_wells_table(cur):
    cols = ['WellID COUNTER PRIMARY KEY', 'WellName VARCHAR(255)']
    for col in WELL_COLUMN_MAP.values():
        cols.append('%s VARCHAR(255)' % brack(col))
    cur.execute('CREATE TABLE Wells (%s)' % ', '.join(cols))
    cur.execute('CREATE UNIQUE INDEX UX_Wells_WellName ON Wells (WellName)')


def create_dictionary_table(cur):
    cur.execute(
        'CREATE TABLE CurveDictionary ('
        'ID COUNTER PRIMARY KEY, '
        'TypeName VARCHAR(255), ColumnName VARCHAR(255), Mnemonic VARCHAR(255), '
        'Unit VARCHAR(255), Source VARCHAR(255), Description VARCHAR(255))')


def create_log_table(cur):
    cur.execute(
        'CREATE TABLE ImportLog ('
        'ID COUNTER PRIMARY KEY, FileName VARCHAR(255), TypeName VARCHAR(255), '
        'WellName VARCHAR(255), RowCount LONG, FileHash VARCHAR(64), '
        'ImportedAt DATETIME)')


def ensure_type_table(cur, type_name, data_cols, index_name):
    has_run_type = type_name in RUN_TYPE_TYPES

    if type_name not in get_table_names(cur):
        defs = ['ID COUNTER PRIMARY KEY', 'WellID LONG', 'SourceFile VARCHAR(255)']
        if has_run_type:
            defs.append('RunType VARCHAR(255)')
        for name in data_cols:
            defs.append('%s DOUBLE' % brack(name))
        cur.execute('CREATE TABLE %s (%s)' % (brack(type_name), ', '.join(defs)))
        cur.execute('CREATE INDEX IX_%s_WellID ON %s (%s)'
                    % (type_name, brack(type_name), brack('WellID')))
        cur.execute('CREATE INDEX IX_%s_Index ON %s (%s, %s)'
                    % (type_name, brack(type_name), brack('WellID'), brack(index_name)))
    else:
        existing = set(get_columns(cur, type_name))
        if has_run_type and 'RunType' not in existing:
            cur.execute('ALTER TABLE %s ADD COLUMN RunType VARCHAR(255)'
                        % brack(type_name))
        for name in data_cols:
            if name in existing:
                continue
            cur.execute('ALTER TABLE %s ADD COLUMN %s DOUBLE'
                        % (brack(type_name), brack(name)))

    return data_cols, has_run_type


def resolve_value(sources, row, file_map, null_value, convert):
    """Return the coalesced value for a column from its source mnemonics.

    Iterates source mnemonics in order; the first non-null value wins. Values are
    converted by `convert` (unit -> multiplier, default x1).
    """
    for m in sources:
        for idx, unit in file_map.get(normalize_mnemonic(m), []):
            if idx < len(row):
                v = to_db_value(row[idx], True, null_value)
                if v is not None:
                    return v * convert.get(normalize_unit(unit), 1.0)
    return None


# ---------------------------------------------------------------------------
# DAO helpers (fast bulk insert + relationships)
# ---------------------------------------------------------------------------
def dao_insert_rows(db, ws, table, row_dicts, delete_file=None):
    """Insert rows into a local Access table via DAO (fast, in-process)."""
    db.TableDefs.Refresh()
    ws.BeginTrans()
    rs = None
    try:
        if delete_file:
            qd = db.CreateQueryDef(
                '', 'DELETE FROM %s WHERE SourceFile = [pFile]' % brack(table))
            qd.Parameters('[pFile]').Value = delete_file
            qd.Execute()
        rs = db.OpenRecordset(table, 2)  # dbOpenDynaset
        for rd in row_dicts:
            rs.AddNew()
            for col, val in rd.items():
                if val is not None:
                    rs.Fields(col).Value = val
            rs.Update()
        ws.CommitTrans()
    except Exception:
        ws.Rollback()
        raise
    finally:
        if rs is not None:
            rs.Close()


def create_relation(db, name, parent, parent_col, child, child_col):
    for rel in list(db.Relations):
        if rel.Name == name:
            db.Relations.Delete(name)
            break
    rel = db.CreateRelation(name, parent, child)
    fld = rel.CreateField(parent_col)
    fld.ForeignName = child_col
    rel.Fields.Append(fld)
    db.Relations.Append(rel)


# ---------------------------------------------------------------------------
# import
# ---------------------------------------------------------------------------
def hash_file(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def import_all(reset=False):
    files = sorted(os.path.join(DATA_DIR, f)
                   for f in os.listdir(DATA_DIR)
                   if f.lower().endswith('.las'))

    if not files:
        print('No .las files found in %s' % DATA_DIR)
        return

    parsed = [parse_las(p) for p in files]
    for p in parsed:
        for c in p['curves']:
            c['unit'] = normalize_unit(c['unit'])

    # keep only the source mnemonics used by each type's spec
    dropped_by_type = defaultdict(int)
    for p in parsed:
        orig = len(p['curves'])
        p['curves'], p['data'] = filter_curves(p)
        dropped_by_type[p['type']] += orig - len(p['curves'])

    by_type = defaultdict(list)
    for p in parsed:
        by_type[p['type']].append(p)

    # ---- reset: drop relationships and import tables via DAO (before pyodbc) ----
    if reset:
        drop_targets = {'Wells', 'CurveDictionary', 'ImportLog'} | set(by_type)
        dao = win32com.client.Dispatch('DAO.DBEngine.120')
        db = dao.OpenDatabase(DB_PATH)
        for rel in list(db.Relations):
            try:
                db.Relations.Delete(rel.Name)
            except Exception:
                pass
        for td in list(db.TableDefs):
            if td.Name in drop_targets:
                try:
                    db.TableDefs.Delete(td.Name)
                except Exception:
                    pass
        db.Close()

    conn = pyodbc.connect(CONN_STR)
    conn.autocommit = False
    cur = conn.cursor()

    # ---- phase 1: build the full schema ----
    existing_tables = get_table_names(cur)
    if 'Wells' not in existing_tables:
        create_wells_table(cur)
    if 'CurveDictionary' not in existing_tables:
        create_dictionary_table(cur)
    if 'ImportLog' not in existing_tables:
        create_log_table(cur)

    warnings = []
    type_info = {}
    for type_name, files_data in sorted(by_type.items()):
        spec = COLUMN_SPEC.get(type_name)
        if spec is None:
            warnings.append('%s: no column spec, skipped (%d files)'
                            % (type_name, len(files_data)))
            continue
        data_cols = [col['name'] for col in spec]
        index_name = spec[0]['name']
        data_cols, has_run_type = ensure_type_table(cur, type_name, data_cols, index_name)

        # mnemonic -> target column name (for CurveDictionary)
        mnem_to_col = {}
        for col in spec:
            for m in col['sources']:
                mnem_to_col[normalize_mnemonic(m)] = col['name']
            if col.get('correction'):
                mnem_to_col[normalize_mnemonic(col['correction'])] = col['name']

        dict_rows = []
        seen_dict = set()
        for fd in files_data:
            for c in fd['curves']:
                m = normalize_mnemonic(c['mnemonic'])
                target = mnem_to_col.get(m)
                if target is None:
                    continue
                dk = (target, m)
                if dk not in seen_dict:
                    seen_dict.add(dk)
                    dict_rows.append((type_name, target, c['mnemonic'], c['unit'],
                                      c['source'], c['description']))

        type_info[type_name] = {
            'spec': spec, 'data_cols': data_cols, 'has_run_type': has_run_type,
            'files_data': files_data, 'dict_rows': dict_rows,
        }
    conn.commit()

    # ---- phase 2: open DAO (all tables exist now) and load data ----
    dao = win32com.client.Dispatch('DAO.DBEngine.120')
    db = dao.OpenDatabase(DB_PATH)
    ws = dao.Workspaces(0)

    well_cache = {}

    for type_name, info in sorted(type_info.items()):
        spec = info['spec']
        has_run_type = info['has_run_type']

        # fill CurveDictionary (idempotent: replace this type's rows)
        cur.execute('DELETE FROM CurveDictionary WHERE TypeName = ?', (type_name,))
        for row in info['dict_rows']:
            cur.execute(
                'INSERT INTO CurveDictionary '
                '(TypeName, ColumnName, Mnemonic, Unit, Source, Description) '
                'VALUES (?,?,?,?,?,?)', row)
        conn.commit()

        for fd in info['files_data']:
            file_hash = hash_file(os.path.join(DATA_DIR, fd['filename']))
            cur.execute('SELECT ID, FileHash FROM ImportLog WHERE FileName = ?',
                        (fd['filename'],))
            log = cur.fetchone()

            if log is not None and log[1] == file_hash:
                continue  # already imported, unchanged

            well_id = get_or_create_well(cur, fd['well'], fd['well_info'], well_cache)
            run_type = detect_run_type(fd)

            # mnemonic -> list of (curve_index, unit) for this file
            file_map = {}
            for i, c in enumerate(fd['curves']):
                m = normalize_mnemonic(c['mnemonic'])
                file_map.setdefault(m, []).append((i, c['unit']))

            row_dicts = []
            for row in fd['data']:
                rd = {'WellID': well_id, 'SourceFile': fd['filename']}
                if has_run_type:
                    rd['RunType'] = run_type
                for col in spec:
                    value = resolve_value(col['sources'], row, file_map,
                                          fd['null_value'], col.get('convert', {}))
                    if value is not None and col.get('correction'):
                        cv = resolve_value([col['correction']], row, file_map,
                                           fd['null_value'], {})
                        if cv is not None:
                            value += cv
                    rd[col['name']] = value
                row_dicts.append(rd)

            conn.commit()  # commit the well row before DAO writes to the type table
            dao_insert_rows(db, ws, type_name, row_dicts,
                            delete_file=(fd['filename'] if log is not None else None))

            if log is not None:
                cur.execute('DELETE FROM ImportLog WHERE FileName = ?',
                            (fd['filename'],))
            cur.execute(
                'INSERT INTO ImportLog '
                '(FileName, TypeName, WellName, RowCount, FileHash, ImportedAt) '
                'VALUES (?,?,?,?,?,?)',
                (fd['filename'], type_name, fd['well'], len(row_dicts),
                 file_hash, _dt.datetime.now()))
            conn.commit()
            print('  %-45s -> %-8s %6d rows (well=%s)'
                  % (fd['filename'], type_name, len(row_dicts), fd['well']))

        if dropped_by_type.get(type_name):
            warnings.append('%s: dropped %d column(s) not in the spec'
                            % (type_name, dropped_by_type[type_name]))

    # relationships: Wells.WellID -> <TYPE>.WellID
    for type_name in sorted(by_type):
        create_relation(db, 'Rel_Wells_%s' % type_name,
                        'Wells', 'WellID', type_name, 'WellID')

    conn.commit()
    db.Close()
    conn.close()

    print('\nDone.')
    if warnings:
        print('\nNotes:')
        for w in sorted(set(warnings)):
            print('  - ' + w)


def main():
    reset = '--reset' in sys.argv
    try:
        import_all(reset=reset)
    finally:
        # When run as a frozen .exe by double-click, keep the console window open
        # so the summary stays visible (no-op when stdout is piped/redirected).
        if getattr(sys, 'frozen', False):
            try:
                if sys.stdout and sys.stdout.isatty():
                    input('\nPress Enter to close...')
            except Exception:
                pass


if __name__ == '__main__':
    main()
