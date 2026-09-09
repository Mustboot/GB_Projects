#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build the interactive drilling dashboard workbook (DrillingLogs_Dashboard.xlsm).

Creates an Excel workbook with:
  * a "Dashboard" sheet holding the controls (well multi-select list, curve
    checkboxes, depth-range cells, refresh button) and a vertically stacked,
    depth-synchronized set of track charts;
  * a hidden "Data" sheet that receives a per-series summary on each refresh;
  * the VBA module modDashboard (imported from DashboardVBA.bas) that queries
    DrillingLogs_full.accdb via ADO and draws the tracks.

Requires (Windows): Excel 16, pywin32, and the ACE OLEDB provider.
Programmatic VBA injection needs "Trust access to the VBA project object model"
(HKCU\\...\\Excel\\Security\\AccessVBOM = 1) — enabled automatically here.
"""

import os
import time
import tempfile
import winreg
import win32com.client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'DrillingLogs_full.accdb')
BAS_PATH = os.path.join(BASE_DIR, 'DashboardVBA.bas')
OUT_PATH = os.path.join(BASE_DIR, 'DrillingLogs_Dashboard.xlsm')

XLSM_FORMAT = 52  # xlOpenXMLWorkbookMacroEnabled

# (key, checkbox caption) — order as shown on the Dashboard
CURVES = [
    ('ROP', 'ROP (m/h)'),
    ('RPM', 'RPM (rpm)'),
    ('TFLO', 'TFLO (gal/min)'),
    ('SPPA', 'SPPA (psi)'),
    ('ECD', 'ECD (ppg)'),
    ('GR', 'GR (gapi)'),
    ('RHOB', 'RHOB (g/cc)'),
]


def _rgb(r, g, b):
    """Excel colour as a BGR long (matches VBA RGB())."""
    return (b << 16) | (g << 8) | r


# beige / earth theme
C_SHEET = _rgb(242, 237, 226)   # cream sheet background
C_PANEL = _rgb(233, 224, 205)   # controls panel fill
C_TEXT = _rgb(31, 77, 46)       # dark green text
C_MUTE = _rgb(120, 110, 90)     # muted secondary text


def ensure_vbom_access():
    """Allow programmatic access to the VBA object model (needed to inject code)."""
    key = r'Software\Microsoft\Office\16.0\Excel\Security'
    prev = None
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_READ) as k:
            prev, _ = winreg.QueryValueEx(k, 'AccessVBOM')
    except FileNotFoundError:
        pass
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_SET_VALUE) as k:
        winreg.SetValueEx(k, 'AccessVBOM', 0, winreg.REG_DWORD, 1)
    print('AccessVBOM: %r -> 1' % prev)
    return prev


def read_vba_source():
    with open(BAS_PATH, encoding='utf-8') as f:
        text = f.read()
    lines = text.splitlines()
    if lines and lines[0].startswith('Attribute VB_Name'):
        lines = lines[1:]
    return '\r\n'.join(lines)


def excel_save(wb, tmp, fmt, attempts=8, delay=2.0):
    """Let Excel write the workbook to a local (non-OneDrive) temp path."""
    last = None
    for _ in range(attempts):
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
            wb.SaveAs(tmp, FileFormat=fmt)
            return
        except Exception as e:
            last = e
            time.sleep(delay)
    raise last


def move_file(tmp, path, attempts=8, delay=2.0):
    """Move the saved file into the (possibly OneDrive-locked) target folder."""
    last = None
    for _ in range(attempts):
        try:
            if os.path.exists(path):
                os.remove(path)
            os.replace(tmp, path)
            return
        except Exception as e:
            last = e
            time.sleep(delay)
    raise last


def build():
    app = win32com.client.Dispatch('Excel.Application')
    app.Visible = False
    app.DisplayAlerts = False
    app.EnableEvents = False

    wb = None
    try:
        wb = app.Workbooks.Add()

        # ---- Dashboard sheet -----------------------------------------------
        ws = wb.Worksheets(1)
        ws.Name = 'Dashboard'

        # beige theme: cream sheet, darker beige controls panel
        ws.Cells.Interior.Color = C_SHEET

        # title
        ws.Range('A1:J1').Merge()
        ws.Range('A1').Value = 'Дашборд: Глубина vs параметры бурения / каротаж'
        ws.Range('A1').Font.Bold = True
        ws.Range('A1').Font.Size = 14
        ws.Range('A1').Font.Color = C_TEXT
        ws.Rows('1').RowHeight = 24

        # database path cell (+ workbook-scoped name)
        ws.Range('A2').Value = 'База данных:'
        ws.Range('A2').Font.Bold = True
        ws.Range('A2').Font.Color = C_TEXT
        ws.Range('B2:G2').Merge()
        ws.Range('B2').Value = DB_PATH
        ws.Range('B2').Font.Size = 8
        ws.Range('B2').Font.Color = C_MUTE

        # controls panel (subtle beige fill to group the controls)
        ws.Range('A3:E36').Interior.Color = C_PANEL

        # section labels
        ws.Range('A4').Value = 'Скважины'
        ws.Range('A4').Font.Bold = True
        ws.Range('A4').Font.Color = C_TEXT
        ws.Range('A20').Value = 'Данные (кривые)'
        ws.Range('A20').Font.Bold = True
        ws.Range('A20').Font.Color = C_TEXT

        # wells multi-select list (ActiveX)
        ole = ws.OLEObjects().Add(ClassType='Forms.ListBox.1', Left=10, Top=70,
                                  Width=180, Height=215)
        ole.Name = 'lbWells'
        ole.Object.MultiSelect = 2  # fmMultiSelectMulti (click toggles)
        try:
            ole.Object.Font.Size = 9
        except Exception:
            pass

        # well selection buttons
        btn_all = ws.Buttons().Add(10, 292, 85, 20)
        btn_all.Name = 'btnAll'
        btn_all.Caption = 'Выбрать все'
        btn_all.OnAction = 'SelectAllWells'

        btn_clear = ws.Buttons().Add(100, 292, 70, 20)
        btn_clear.Name = 'btnClear'
        btn_clear.Caption = 'Сбросить'
        btn_clear.OnAction = 'ClearWells'

        # curve checkboxes
        top = 320
        for key, label in CURVES:
            cb = ws.CheckBoxes().Add(10, top, 140, 16)
            cb.Name = 'chk' + key
            cb.Caption = label
            cb.Value = 1  # checked by default
            top += 20

        # refresh button
        btn_refresh = ws.Buttons().Add(10, 470, 150, 28)
        btn_refresh.Name = 'btnRefresh'
        btn_refresh.Caption = 'Обновить'
        btn_refresh.OnAction = 'RefreshDashboard'

        # depth range (row 35)
        ws.Range('A35').Value = 'Глубина, м:'
        ws.Range('A35').Font.Bold = True
        ws.Range('A35').Font.Color = C_TEXT
        ws.Range('B35').Value = 'от'
        ws.Range('D35').Value = 'до'
        ws.Range('C35').Interior.Color = _rgb(255, 253, 246)
        ws.Range('E35').Interior.Color = _rgb(255, 253, 246)

        # column widths so labels/path are readable
        ws.Columns('A').ColumnWidth = 15
        ws.Columns('B').ColumnWidth = 4
        ws.Columns('C').ColumnWidth = 10
        ws.Columns('D').ColumnWidth = 4
        ws.Columns('E').ColumnWidth = 10

        # ---- named ranges --------------------------------------------------
        wb.Names.Add(Name='DBPath', RefersTo='=Dashboard!$B$2')
        wb.Names.Add(Name='DepthMin', RefersTo='=Dashboard!$C$35')
        wb.Names.Add(Name='DepthMax', RefersTo='=Dashboard!$E$35')

        # ---- Data sheet (hidden summary) ----------------------------------
        ws_data = wb.Worksheets.Add(After=ws)
        ws_data.Name = 'Data'
        ws_data.Visible = 0  # xlSheetHidden

        # ---- VBA -----------------------------------------------------------
        vba = read_vba_source()
        comp = wb.VBProject.VBComponents.Add(1)  # vbext_ct_StdModule
        comp.Name = 'modDashboard'
        comp.CodeModule.AddFromString(vba)

        # Workbook_Open hook
        thiswb = wb.VBProject.VBComponents('ThisWorkbook')
        thiswb.CodeModule.AddFromString(
            'Private Sub Workbook_Open()\r\n'
            '    On Error Resume Next\r\n'
            '    InitDashboard\r\n'
            '    On Error GoTo 0\r\n'
            'End Sub\r\n'
        )

        # ---- save (via temp to avoid OneDrive lock contention) ------------
        tmp = os.path.join(tempfile.gettempdir(), os.path.basename(OUT_PATH))
        excel_save(wb, tmp, XLSM_FORMAT)   # Excel writes outside OneDrive
        wb.Close(False)                     # release the file handle
        move_file(tmp, OUT_PATH)            # then move into the target folder
        print('Saved:', OUT_PATH)
    finally:
        try:
            app.Quit()
        except Exception:
            pass


if __name__ == '__main__':
    ensure_vbom_access()
    build()
