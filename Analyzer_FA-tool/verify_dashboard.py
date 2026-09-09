#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Smoke-test the built dashboard workbook: open it, run RefreshDashboard via COM,
and report the track charts that were produced. Uses a depth window (5000-5100 m)
that contains data for every curve so all tracks should appear.

Note: run with Excel closed; the workbook lives in a OneDrive folder so opening
it through automation can be slow.
"""

import os
import time
import win32com.client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(BASE_DIR, 'DrillingLogs_Dashboard.xlsm')

MODE_AUTOMATION_SECURITY_LOW = 1  # msoAutomationSecurityLow


def main():
    app = win32com.client.Dispatch('Excel.Application')
    app.Visible = False
    app.DisplayAlerts = False
    app.AutomationSecurity = MODE_AUTOMATION_SECURITY_LOW
    app.EnableEvents = True  # let Workbook_Open -> InitDashboard run

    wb = app.Workbooks.Open(OUT_PATH)
    ws = wb.Worksheets('Dashboard')

    lb = ws.OLEObjects('lbWells').Object
    print('Wells in listbox:', lb.ListCount)

    # depth window that holds data for every curve (RHOB is logged below ~2485 m)
    ws.Range('C35').Value = 5000
    ws.Range('E35').Value = 5100

    t0 = time.perf_counter()
    try:
        app.Run('RefreshDashboard')
        print('RefreshDashboard OK  (%.2f s)' % (time.perf_counter() - t0))
    except Exception as e:
        print('RefreshDashboard FAILED after %.2f s:' % (time.perf_counter() - t0), e)

    n = ws.ChartObjects().Count
    print('Track charts:', n)
    for i in range(1, n + 1):
        ch = ws.ChartObjects(i).Chart
        series = ch.SeriesCollection().Count
        sec = sum(1 for s in range(1, series + 1) if ch.SeriesCollection(s).AxisGroup == 2)
        print('  %d) %r  series=%d (secondary=%d)'
              % (i, ch.ChartTitle.Text, series, sec))

    wb.Saved = True
    wb.Close(False)
    app.Quit()


if __name__ == '__main__':
    main()
