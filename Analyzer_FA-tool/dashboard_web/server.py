#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrillingLogs Web Dashboard — backend.

Reads drilling curves (ROP, RPM, TFLO, ECD, GR) from DrillingLogs_full.accdb
and serves a professional HTML dashboard plus a JSON API:

  GET  /              -> dashboard page (index.html)
  GET  /static/*      -> static assets (plotly.min.js, app.js, styles.css)
  GET  /api/meta      -> wells, curves, depth ranges, data availability
  GET  /api/data      -> downsampled curve data for selected wells
  POST /api/export    -> .xlsx report of the current selection (openpyxl)

Usage:
  python server.py [--port 8000] [--host 127.0.0.1] [--db <path>] [--no-browser]

Requires: pyodbc (Microsoft Access ODBC driver), openpyxl (for Excel export).
"""

import argparse
import gzip
import json
import os
import re
import sys
import threading
import time
import urllib.parse
import webbrowser
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pyodbc

# ---------------------------------------------------------------------------
# Paths / configuration
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent          # .../Analyzer_FA-tool/dashboard_web
STATIC_DIR = BASE_DIR / 'static'
DB_PATH = (BASE_DIR.parent / 'DrillingLogs_full.accdb').resolve()

DEFAULT_POINTS = 1500        # buckets per curve for the chart (min/max decimation)
EXPORT_POINTS = 8000         # buckets per curve for the Excel export

# Curve catalogue. 'track' groups curves into vertically stacked tracks.
CURVES = [
    {'id': 'ROP',  'name': 'ROP',  'label': 'Механическая скорость проходки (ROP)',
     'unit': 'м/ч',   'track': 'drill'},
    {'id': 'RPM',  'name': 'RPM',  'label': 'Скорость вращения ротора (RPM)',
     'unit': 'об/мин', 'track': 'drill'},
    {'id': 'TFLO', 'name': 'TFLO', 'label': 'Суммарный расход насосов (TFLO)',
     'unit': 'гал/мин', 'track': 'drill'},
    {'id': 'ECD',  'name': 'ECD',  'label': 'Эквивалентная плотность циркуляции (ECD)',
     'unit': 'ppg',  'track': 'ecd'},
    {'id': 'GR',   'name': 'GR',   'label': 'Гамма-каротаж (GR)',
     'unit': 'gAPI', 'track': 'gr'},
    {'id': 'RHOB', 'name': 'RHOB', 'label': 'Плотность пород (RHOB)',
     'unit': 'г/см³', 'track': 'rho'},
    {'id': 'CALI', 'name': 'CALI', 'label': 'Кавернометрия (CALI)',
     'unit': 'дюйм', 'track': 'cali'},
]
CURVE_BY_ID = {c['id']: c for c in CURVES}

# Columns available in each logging table.
TABLE_COLS = {
    'MSEDA': {'DEPT', 'ROP', 'RPM', 'TFLO', 'ECD', 'GR'},
    'MSETA': {'DEPT', 'ROP', 'RPM', 'TFLO', 'ECD', 'GR'},
    'LWDD':  {'DEPT', 'GR', 'RHOB', 'UCAV', 'DCAV'},
}


def brack(name):
    return '[' + str(name).replace(']', ']]') + ']'


def connect():
    conn_str = r'DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=' + str(DB_PATH) + ';'
    return pyodbc.connect(conn_str, timeout=60)


# ---------------------------------------------------------------------------
# Metadata (wells / curves / ranges) — cached, invalidated when the DB changes
# ---------------------------------------------------------------------------
_meta_cache = {'mtime': None, 'payload': None}
data_cache = OrderedDict()
DATA_CACHE_MAX = 32


def get_meta():
    """Return {db, curves, wells, depth_min, depth_max}; cached per DB mtime."""
    try:
        mtime = DB_PATH.stat().st_mtime
    except OSError:
        mtime = None
    if _meta_cache['payload'] is not None and _meta_cache['mtime'] == mtime:
        return _meta_cache['payload']

    conn = connect()
    cur = conn.cursor()
    try:
        cur.execute('SELECT WellID, WellName, Company, Field, Rig, RigType '
                    'FROM Wells ORDER BY WellName')
        well_rows = {r[0]: r for r in cur.fetchall()}

        stats = {}   # well_id -> {'MSEDA': {...}, 'MSETA': {...}, 'LWDD': {...}}
        for table, cols in (('MSEDA', ('ROP', 'RPM', 'TFLO', 'ECD', 'GR')),
                            ('MSETA', ('ROP', 'RPM', 'TFLO', 'ECD', 'GR')),
                            ('LWDD',  ('GR', 'RHOB', 'UCAV', 'DCAV'))):
            agg = ', '.join('COUNT(%s)' % brack(c) for c in cols)
            sql = ('SELECT WellID, COUNT(ID), %s, MIN(DEPT), MAX(DEPT) '
                   'FROM %s GROUP BY WellID' % (agg, brack(table)))
            cur.execute(sql)
            for r in cur.fetchall():
                wid = r[0]
                stats.setdefault(wid, {})[table] = {
                    'rows': r[1],
                    'counts': {c: (r[2 + i] or 0) for i, c in enumerate(cols)},
                    'dmin': float(r[2 + len(cols)]) if r[2 + len(cols)] is not None else None,
                    'dmax': float(r[3 + len(cols)]) if r[3 + len(cols)] is not None else None,
                }

        wells = []
        depth_min = depth_max = None
        for wid, row in well_rows.items():
            st = stats.get(wid, {})
            mseda = st.get('MSEDA')
            mseta = st.get('MSETA')
            lwdd = st.get('LWDD')

            # Preferred source table: MSEDA first, MSETA as fallback.
            main = mseda if (mseda and mseda['rows']) else (
                mseta if (mseta and mseta['rows']) else None)

            counts = {}
            for cid in CURVE_BY_ID:
                if cid == 'RHOB':
                    counts[cid] = lwdd['counts'].get('RHOB', 0) if lwdd else 0
                elif cid == 'CALI':
                    u = lwdd['counts'].get('UCAV', 0) if lwdd else 0
                    d = lwdd['counts'].get('DCAV', 0) if lwdd else 0
                    counts[cid] = u if u > 0 else d
                else:
                    n = 0
                    for t in (mseda, mseta, lwdd):
                        if t:
                            n += t['counts'].get(cid, 0) if cid in t['counts'] else 0
                    counts[cid] = n

            gr_source = None
            if main and main['counts'].get('GR', 0) > 0:
                gr_source = main is mseda and 'MSEDA' or 'MSETA'
            elif lwdd and lwdd['counts'].get('GR', 0) > 0:
                gr_source = 'LWDD'

            cali_source = None
            if lwdd:
                if lwdd['counts'].get('UCAV', 0) > 0:
                    cali_source = 'UCAV'
                elif lwdd['counts'].get('DCAV', 0) > 0:
                    cali_source = 'DCAV'

            dmin = dmax = None
            for t in (mseda, mseta, lwdd):
                if t and t['dmin'] is not None:
                    dmin = t['dmin'] if dmin is None else min(dmin, t['dmin'])
                    dmax = t['dmax'] if dmax is None else max(dmax, t['dmax'])
            if dmin is not None:
                depth_min = dmin if depth_min is None else min(depth_min, dmin)
                depth_max = dmax if depth_max is None else max(depth_max, dmax)

            wells.append({
                'id': wid,
                'name': row[1] or ('Well %d' % wid),
                'company': row[2],
                'field': row[3],
                'rig': row[4],
                'rig_type': row[5],
                'main_table': 'MSEDA' if (mseda and mseda['rows']) else
                              ('MSETA' if (mseta and mseta['rows']) else None),
                'gr_source': gr_source,
                'cali_source': cali_source,
                'curves': counts,
                'dmin': dmin,
                'dmax': dmax,
                'has_data': any(counts.values()),
            })
    finally:
        conn.close()

    payload = {
        'ok': True,
        'db': {
            'path': str(DB_PATH),
            'name': DB_PATH.name,
            'size_mb': round(DB_PATH.stat().st_size / 1048576.0, 1)
            if DB_PATH.exists() else 0.0,
        },
        'curves': CURVES,
        'wells': wells,
        'depth_min': depth_min,
        'depth_max': depth_max,
        'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    }
    _meta_cache.update(mtime=mtime, payload=payload)
    return payload


# ---------------------------------------------------------------------------
# Downsampling — min/max per depth bucket (preserves spikes), streaming
# ---------------------------------------------------------------------------
def downsample(cur, sql, params, n_buckets, dmin, dmax, curve_names):
    """Run `sql` (first column must be DEPT), return list of
    (depth[], value[], n_raw) per curve — min/max decimated to n_buckets."""
    cur.execute(sql, params)
    span = (dmax - dmin) or 1.0
    bucket_size = span / max(1, n_buckets)
    buckets = {}          # curve index -> {bucket: [min_v, max_v, min_d, max_d]}
    n_raw = [0] * len(curve_names)

    for row in cur:
        d = row[0]
        if d is None:
            continue
        b = int((d - dmin) / bucket_size)
        for j in range(len(curve_names)):
            v = row[j + 1]
            if v is None:
                continue
            n_raw[j] += 1
            st = buckets.setdefault(j, {})
            s = st.get(b)
            if s is None:
                st[b] = [v, v, d, d]
            else:
                if v < s[0]:
                    s[0] = v
                    s[2] = d
                if v > s[1]:
                    s[1] = v
                    s[3] = d

    result = []
    for j in range(len(curve_names)):
        dd, vv = [], []
        for b in sorted(buckets.get(j, {})):
            vmin, vmax, dmin_b, dmax_b = buckets[j][b]
            if dmin_b <= dmax_b:
                dd.extend((dmin_b, dmax_b))
                vv.extend((vmin, vmax))
            else:
                dd.extend((dmax_b, dmin_b))
                vv.extend((vmax, vmin))
        result.append((dd, vv, n_raw[j]))
    return result


def get_data(well_ids, curve_ids, dmin, dmax, points=DEFAULT_POINTS):
    """Fetch and downsample curves. Returns a dict (Python values)."""
    cache_key = ('data', tuple(well_ids), tuple(curve_ids),
                 round(dmin, 3), round(dmax, 3), points)
    if cache_key in data_cache:
        data_cache.move_to_end(cache_key)
        payload = json.loads(data_cache[cache_key])
        payload['elapsed_ms'] = 0
        payload['generated_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
        payload['cached'] = True
        return payload

    meta = get_meta()
    well_map = {w['id']: w for w in meta['wells']}
    t0 = time.time()

    conn = connect()
    cur = conn.cursor()
    result = {}
    try:
        for wid in well_ids:
            w = well_map.get(int(wid))
            if not w or not w['has_data']:
                continue
            curves_out = {}
            main_table = w['main_table']

            # --- drilling curves from the well's main table (shared depth grid)
            main_cols = [c for c in curve_ids
                         if c != 'GR' and c in TABLE_COLS.get(main_table or '', ())
                         and w['curves'].get(c, 0) > 0]
            # GR stays in the main grid when its preferred source is MSEDA/MSETA
            if ('GR' in curve_ids and w['gr_source'] in ('MSEDA', 'MSETA')
                    and w['curves'].get('GR', 0) > 0):
                main_cols.append('GR')
            if main_cols:
                sel = ', '.join(brack(c) for c in main_cols)
                sql = ('SELECT %s, %s FROM %s WHERE WellID=? '
                       'AND DEPT>=? AND DEPT<=? ORDER BY DEPT'
                       % (brack('DEPT'), sel, brack(main_table)))
                series = downsample(cur, sql, (wid, dmin, dmax),
                                    points, dmin, dmax, main_cols)
                for cid, (dd, vv, n_raw) in zip(main_cols, series):
                    curves_out[cid] = {
                        'unit': CURVE_BY_ID[cid]['unit'],
                        'source': main_table,
                        'depth': dd, 'value': vv, 'n_raw': n_raw,
                    }

            # --- LWDD curves (GR fallback, RHOB, caliper) — own depth grid
            lwdd_cols = []
            for cid in curve_ids:
                if cid == 'RHOB' and w['curves'].get('RHOB', 0) > 0:
                    lwdd_cols.append('RHOB')
                elif cid == 'CALI' and w.get('cali_source'):
                    lwdd_cols.append(w['cali_source'])
                elif cid == 'GR' and w['gr_source'] == 'LWDD' and w['curves'].get('GR', 0) > 0:
                    lwdd_cols.append('GR')
            if lwdd_cols:
                sel = ', '.join(brack(c) for c in lwdd_cols)
                sql = ('SELECT %s, %s FROM [LWDD] WHERE WellID=? '
                       'AND DEPT>=? AND DEPT<=? ORDER BY DEPT'
                       % (brack('DEPT'), sel))
                series = downsample(cur, sql, (wid, dmin, dmax),
                                    points, dmin, dmax, lwdd_cols)
                for col, (dd, vv, n_raw) in zip(lwdd_cols, series):
                    cid = 'CALI' if col == w.get('cali_source') else col
                    curves_out[cid] = {
                        'unit': CURVE_BY_ID[cid]['unit'],
                        'source': 'LWDD',
                        'depth': dd, 'value': vv, 'n_raw': n_raw,
                    }

            if curves_out:
                result[str(wid)] = {
                    'id': w['id'], 'name': w['name'], 'field': w['field'],
                    'company': w['company'], 'curves': curves_out,
                }
    finally:
        conn.close()

    payload = {
        'ok': True,
        'wells': result,
        'depth_min': dmin,
        'depth_max': dmax,
        'points': points,
        'elapsed_ms': int((time.time() - t0) * 1000),
        'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    }
    data_cache[cache_key] = json.dumps(payload, ensure_ascii=False)
    if len(data_cache) > DATA_CACHE_MAX:
        data_cache.popitem(last=False)
    return payload


# ---------------------------------------------------------------------------
# Excel export (openpyxl)
# ---------------------------------------------------------------------------
_SHEET_BAD = re.compile(r'[\[\]:*?/\\\x00-\x1f]')


def build_xlsx(well_ids, curve_ids, dmin, dmax):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    data = get_data(well_ids, curve_ids, dmin, dmax, points=EXPORT_POINTS)
    meta = get_meta()
    well_map = {w['id']: w for w in meta['wells']}
    curve_map = {c['id']: c for c in meta['curves']}

    wb = Workbook()

    # ---------------- summary sheet ----------------
    ws = wb.active
    ws.title = 'Сводка'
    ws.sheet_view.showGridLines = False

    title_font = Font(bold=True, size=14, color='0F3A57')
    head_font = Font(bold=True, color='0F3A57')
    note_font = Font(size=9, color='6B7B89')

    ws['A1'] = 'Отчёт по данным бурения — %s' % meta['db']['name']
    ws['A1'].font = title_font
    ws['A3'] = 'Сформирован:'
    ws['B3'] = time.strftime('%d.%m.%Y %H:%M:%S')
    ws['A4'] = 'Скважины (%d):' % len(well_ids)
    names = [well_map.get(int(w), {}).get('name', str(w)) for w in well_ids
             if well_map.get(int(w))]
    ws['B4'] = ', '.join(n for n in names if n)
    ws['A5'] = 'Кривые:'
    ws['B5'] = ', '.join('%s [%s]' % (curve_map[c]['name'], curve_map[c]['unit'])
                         for c in curve_ids if c in curve_map)
    ws['A6'] = 'Интервал глубин:'
    ws['B6'] = '%.2f – %.2f м' % (dmin, dmax)
    ws['A7'] = 'База данных:'
    ws['B7'] = meta['db']['path']
    ws['A9'] = ('Примечание: данные прорежены по глубине методом min/max '
                '(до %d отсчётов на кривую) для сохранения пиков и компактности файла.'
                % EXPORT_POINTS)
    ws['A9'].font = note_font

    for cell in ('A3', 'A4', 'A5', 'A6', 'A7'):
        ws[cell].font = head_font
    ws.column_dimensions['A'].width = 20
    ws.column_dimensions['B'].width = 100
    for row in (4, 5, 7):
        ws['B%d' % row].alignment = Alignment(wrap_text=True, vertical='top')

    # ---------------- one sheet per well ----------------
    header_fill = PatternFill('solid', fgColor='DCEBF5')
    header_font = Font(bold=True, color='0F3A57')
    thin = Side(style='thin', color='B9C6D2')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    used_names = set()
    for wid in well_ids:
        w = well_map.get(int(wid))
        if not w:
            continue
        curves = data['wells'].get(str(wid), {}).get('curves', {})
        if not curves:
            continue

        sheet_name = _SHEET_BAD.sub('_', w['name'])[:31] or ('Well %d' % wid)
        base, i = sheet_name, 1
        while sheet_name.lower() in used_names:
            i += 1
            sheet_name = ('%s_%d' % (base[:28], i))[:31]
        used_names.add(sheet_name.lower())

        ws = wb.create_sheet(sheet_name)
        ws.sheet_view.showGridLines = False

        # drilling grid (MSEDA/MSETA, shared depth) + LWDD grid (GR/RHOB/CALI)
        main_cols = [c for c in curve_ids
                     if c in curves and curves[c]['source'] in ('MSEDA', 'MSETA')]
        lwdd_cols = [c for c in curve_ids
                     if c in curves and curves[c]['source'] == 'LWDD']

        headers = ['Глубина, м']
        headers += ['%s, %s' % (curve_map[c]['name'], curve_map[c]['unit'])
                    for c in main_cols]
        lwdd_offset = None
        if lwdd_cols:
            headers += ['']                        # blank separator column
            lwdd_offset = len(headers) + 1         # first LWDD header column
            headers += ['Глубина (LWDD), м']
            headers += ['%s, %s' % (curve_map[c]['name'], curve_map[c]['unit'])
                        for c in lwdd_cols]

        for j, h in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=j, value=h if h else None)
            cell.font = header_font
            cell.fill = header_fill
            cell.border = border
            cell.alignment = Alignment(horizontal='center')

        # drilling block (shared depth grid)
        if main_cols:
            depth = curves[main_cols[0]]['depth']
            n = len(depth)
            for j in range(len(main_cols)):
                c = main_cols[j]
                vals = curves[c]['value']
                for i in range(min(n, len(vals))):
                    ws.cell(row=i + 2, column=1, value=round(depth[i], 3))
                    ws.cell(row=i + 2, column=2 + j,
                            value=None if vals[i] is None else round(vals[i], 4))

        # LWDD block (own depth grid: GR, RHOB, CALI)
        if lwdd_cols:
            depth = curves[lwdd_cols[0]]['depth']
            for j in range(len(lwdd_cols)):
                c = lwdd_cols[j]
                vals = curves[c]['value']
                for i in range(min(len(depth), len(vals))):
                    ws.cell(row=i + 2, column=lwdd_offset,
                            value=round(depth[i], 3))
                    ws.cell(row=i + 2, column=lwdd_offset + 1 + j,
                            value=None if vals[i] is None else round(vals[i], 4))

        n_rows = max(
            len(curves[main_cols[0]]['depth']) if main_cols else 0,
            len(curves[lwdd_cols[0]]['depth']) if lwdd_cols else 0,
        )
        ws.freeze_panes = 'A2'
        ws.auto_filter.ref = 'A1:%s%d' % (
            get_column_letter(len(headers)), max(2, n_rows + 1))
        ws.column_dimensions['A'].width = 12
        for j in range(2, len(headers) + 1):
            ws.column_dimensions[get_column_letter(j)].width = 14
        if lwdd_offset:
            ws.column_dimensions[get_column_letter(lwdd_offset)].width = 14

    from io import BytesIO
    out = BytesIO()
    wb.save(out)
    return out.getvalue()


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------
MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
}


class Handler(BaseHTTPRequestHandler):
    server_version = 'DrillingDashboard/2.0'

    # ---- helpers ----------------------------------------------------------
    def _send(self, code, body, ctype, extra=None, gzip_ok=False):
        if isinstance(body, str):
            body = body.encode('utf-8')
        if gzip_ok and len(body) > 1024 and 'gzip' in (
                self.headers.get('Accept-Encoding', '')):
            body = gzip.compress(body)
            enc = {'Content-Encoding': 'gzip'}
        else:
            enc = {}
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        for k, v in enc.items():
            self.send_header(k, v)
        try:
            self.end_headers()
            self.wfile.write(body)
        except OSError:
            # client disconnected mid-response (e.g. browser reload) — ignore
            self.close_connection = True

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False),
                   'application/json; charset=utf-8', gzip_ok=True)

    def _error(self, code, msg):
        self._json({'ok': False, 'error': msg}, code)

    def log_message(self, fmt, *args):   # compact one-line log
        sys.stdout.write('[%s] %s\n' % (self.log_date_time_string(), fmt % args))
        sys.stdout.flush()

    # ---- GET --------------------------------------------------------------
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(url.path)
        query = urllib.parse.parse_qs(url.query)

        if path in ('/', '/index.html'):
            return self._send(200, self._read_text('index.html'),
                              'text/html; charset=utf-8')

        if path.startswith('/static/'):
            return self._serve_static(path)

        if path == '/api/meta':
            try:
                return self._json(get_meta())
            except Exception as e:
                return self._error(500, 'Ошибка чтения базы данных: %s' % e)

        if path == '/api/data':
            return self._handle_data(query)

        if path == '/favicon.ico':
            return self._serve_static('/static/favicon.svg')

        self._error(404, 'Not found')

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == '/api/export':
            try:
                length = int(self.headers.get('Content-Length', 0))
                raw = self.rfile.read(length) if length else b'{}'
                req = json.loads(raw.decode('utf-8'))
                return self._handle_export(req)
            except ValueError as e:
                return self._error(400, 'Неверный JSON: %s' % e)
        self._error(404, 'Not found')

    # ---- routes -----------------------------------------------------------
    def _read_text(self, name):
        with open(STATIC_DIR.parent / name, 'rb') as f:
            return f.read()

    def _serve_static(self, path):
        rel = path[len('/static/'):]
        target = (STATIC_DIR / rel).resolve()
        if not str(target).startswith(str(STATIC_DIR.resolve())) or not target.is_file():
            return self._error(404, 'Not found')
        ext = target.suffix.lower()
        if ext == '.js' and rel == 'plotly.min.js':
            self.send_response(200)
            self.send_header('Content-Type', MIME.get(ext, 'application/octet-stream'))
            self.send_header('Content-Length', str(target.stat().st_size))
            self.send_header('Cache-Control', 'max-age=86400')
            self.end_headers()
            try:
                with open(target, 'rb') as f:
                    while chunk := f.read(1 << 16):
                        self.wfile.write(chunk)
            except OSError:
                # client disconnected mid-download — ignore
                self.close_connection = True
            return
        return self._send(200, target.read_bytes(),
                          MIME.get(ext, 'application/octet-stream'))

    def _parse_list(self, query, name):
        raw = query.get(name, [''])
        items = []
        for part in raw:
            items.extend(part.replace(';', ',').split(','))
        return [it.strip() for it in items if it.strip()]

    def _handle_data(self, query):
        try:
            meta = get_meta()
            valid_wells = {str(w['id']) for w in meta['wells']}
            valid_curves = {c['id'] for c in CURVES}

            wells = [w for w in self._parse_list(query, 'wells') if w in valid_wells]
            curves = [c for c in self._parse_list(query, 'curves') if c in valid_curves]
            if not wells:
                return self._error(400, 'Не выбрана ни одна скважина (wells=…)')
            if not curves:
                return self._error(400, 'Не выбрана ни одна кривая (curves=…)')

            depth_min = meta['depth_min'] or 0.0
            depth_max = meta['depth_max'] or 10000.0
            try:
                if query.get('dmin'):
                    depth_min = float(query['dmin'][0])
                if query.get('dmax'):
                    depth_max = float(query['dmax'][0])
            except ValueError:
                return self._error(400, 'dmin/dmax должны быть числами')
            if depth_max <= depth_min:
                return self._error(400, 'dmax должен быть больше dmin')

            try:
                points = int(query.get('points', [DEFAULT_POINTS])[0])
            except ValueError:
                points = DEFAULT_POINTS
            points = max(100, min(20000, points))

            payload = get_data(wells, curves, depth_min, depth_max, points)
            return self._json(payload)
        except Exception as e:
            return self._error(500, 'Ошибка запроса данных: %s' % e)

    def _handle_export(self, req):
        try:
            meta = get_meta()
            valid_wells = {w['id'] for w in meta['wells']}
            valid_curves = {c['id'] for c in CURVES}
            wells = [w for w in req.get('wells', []) if int(w) in valid_wells]
            curves = [c for c in req.get('curves', []) if c in valid_curves]
            if not wells or not curves:
                return self._error(400, 'Укажите wells и curves')
            depth_min = float(req.get('dmin') or (meta['depth_min'] or 0.0))
            depth_max = float(req.get('dmax') or (meta['depth_max'] or 10000.0))
            if depth_max <= depth_min:
                return self._error(400, 'dmax должен быть больше dmin')
            xlsx = build_xlsx(wells, curves, depth_min, depth_max)
            fname = 'DrillingLogs_export_%s.xlsx' % time.strftime('%Y%m%d_%H%M%S')
            return self._send(
                200, xlsx,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                extra={'Content-Disposition': 'attachment; filename="%s"' % fname})
        except Exception as e:
            return self._error(500, 'Ошибка экспорта: %s' % e)


def main():
    ap = argparse.ArgumentParser(description='DrillingLogs web dashboard server')
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--db', default=None, help='path to .accdb (default: ../DrillingLogs_full.accdb)')
    ap.add_argument('--no-browser', action='store_true')
    args = ap.parse_args()

    if args.db:
        global DB_PATH
        DB_PATH = Path(args.db).resolve()
        if not DB_PATH.exists():
            sys.exit('Database not found: %s' % DB_PATH)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    url = 'http://%s:%d/' % (args.host, args.port)

    print('-' * 64)
    print('DrillingLogs dashboard')
    print('  database : %s' % DB_PATH)
    print('  dashboard: %s' % url)
    print('  stop     : Ctrl+C')
    print('-' * 64)

    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
