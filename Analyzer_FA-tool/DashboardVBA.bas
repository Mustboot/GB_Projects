Attribute VB_Name = "modDashboard"
Option Explicit

'==============================================================================
'  Dashboard:  Depth vs. drilling / logging curves
'  Data source: DrillingLogs_full.accdb  (via ADO / ACE OLEDB)
'
'  Layout: one full-width "track" chart stacked vertically, all sharing the
'  same depth (X) range so they read as a synchronized log (beige/earth theme).
'
'    Track 1  DRILL  ROP + RPM (left Y),  TFLO (right Y)          <- MSEDA
'    Track 2  SPPA   stand pipe pressure                           <- MSEDA
'    Track 3  ECD    equivalent circulating density                <- MSEDA
'    Track 4  GR     gamma ray                                      <- MSEDA + LWDD
'    Track 5  RHOB   bulk density                                   <- LWDD
'
'  Performance: instead of streaming millions of raw rows into Excel, the data
'  is bucketed by depth inside SQL (one GROUP BY query per source table), so
'  Excel only ever receives a few hundred points per well.
'==============================================================================

' ---- worksheet / named-range names ----------------------------------------
Private Const WS_DASH     As String = "Dashboard"
Private Const WS_DATA     As String = "Data"
Private Const RNG_DBPATH  As String = "DBPath"
Private Const RNG_DEP_MIN As String = "DepthMin"
Private Const RNG_DEP_MAX As String = "DepthMax"

' ---- control names ---------------------------------------------------------
Private Const LST_WELLS   As String = "lbWells"

' ---- tuning ----------------------------------------------------------------
Private Const PERC_LO     As Double = 0.02   ' low  percentile for Y limits
Private Const PERC_HI     As Double = 0.98   ' high percentile for Y limits
Private Const DEFAULT_WELLS As Long = 8      ' wells selected on open

' ---- layout (points) -------------------------------------------------------
Private Const PANEL_W     As Double = 330    ' left controls panel width
Private Const CHART_GAP   As Double = 14     ' vertical gap between tracks
Private Const TOP0        As Double = 60     ' first track top


' ---- module-level state ----------------------------------------------------
Private mDataWS       As Worksheet
Private mDataNextRow  As Long
Private mCharts       As Collection          ' ChartObject per track
Private mChartTracks  As Collection          ' track key per chart (parallel)
Private mChartByTrack As Object              ' trackKey -> Chart
Private mValueCache   As Object              ' curveKey -> Collection of values
Private mPLo          As Object              ' curveKey -> P2
Private mPHi          As Object              ' curveKey -> P98
Private mDepthMin     As Double
Private mDepthMax     As Double
Private mHasDepth     As Boolean
Private mBucketSize   As Double


'==============================================================================
'  public entry points (assigned to buttons / Workbook_Open)
'==============================================================================

Public Sub InitDashboard()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)

    ' all curves checked by default
    Dim i As Long
    Dim keys As Variant
    keys = CurveKeys()
    For i = 0 To UBound(keys)
        ws.CheckBoxes("chk" & keys(i)).Value = xlOn
    Next i

    PopulateWells
    SelectFirstWells DEFAULT_WELLS
End Sub


Public Sub RefreshDashboard()
    On Error GoTo Fail

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.StatusBar = "Подключение к базе данных..."

    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)

    Dim wells As Collection
    Set wells = SelectedWells()
    If wells.Count = 0 Then
        If Application.UserControl Then _
            MsgBox "Выберите хотя бы одну скважину в списке слева.", _
                   vbExclamation, "Дашборд"
        GoTo Done
    End If

    Dim curves As Collection
    Set curves = SelectedCurves()
    If curves.Count = 0 Then
        If Application.UserControl Then _
            MsgBox "Отметьте хотя бы одну кривую (данные).", _
                   vbExclamation, "Дашборд"
        GoTo Done
    End If

    ' ensure the wells list is populated (in case Workbook_Open was blocked)
    Dim lb As Object
    Set lb = ws.OLEObjects(LST_WELLS).Object
    If lb.ListCount = 0 Then PopulateWells

    Dim conn As Object
    Set conn = OpenConnection()

    ' well id <-> name maps + stable colour per well
    Dim nameToId As Object, idToName As Object
    LoadWellMaps conn, nameToId, idToName
    Dim nameToColor As Object
    Set nameToColor = BuildNameToColor()

    ' reset per-refresh state
    Set mCharts = New Collection
    Set mChartTracks = New Collection
    Set mChartByTrack = CreateObject("Scripting.Dictionary")
    Set mValueCache = CreateObject("Scripting.Dictionary")
    mDepthMin = 0: mDepthMax = 0: mHasDepth = False
    mBucketSize = ResolveBucketSize()

    PrepareDataSheet
    ClearCharts

    ' which tracks to build, and create their empty charts up front
    Dim tracks As Collection
    Set tracks = TracksToBuild(curves)

    Dim tk As Variant
    Dim chartIndex As Long
    chartIndex = 0
    For Each tk In tracks
        Application.StatusBar = "Подготовка: " & CStr(tk) & " ..."
        BuildEmptyTrackChart CStr(tk), chartIndex, tracks.Count
        chartIndex = chartIndex + 1
    Next tk

    ' load data: one bucketed GROUP BY query per source table
    Dim tbl As Variant
    For Each tbl In Array("MSEDA", "LWDD")
        Dim tblCurves As Collection
        Set tblCurves = TableSelectedCurves(CStr(tbl), curves)
        If tblCurves.Count > 0 Then
            Application.StatusBar = "Загрузка: " & CStr(tbl) & " ..."
            LoadTable conn, CStr(tbl), tblCurves, wells, nameToId, idToName, nameToColor
        End If
    Next tbl

    conn.Close

    ' drop tracks that ended up with no data, then style everything
    PruneEmptyCharts
    ComputePercentiles
    FinalizeCharts

    WriteWellLegend wells, nameToColor

    Application.StatusBar = False
    If Application.UserControl Then _
        MsgBox "Готово. Построено графиков: " & mCharts.Count, vbInformation, "Дашборд"

Done:
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    Exit Sub

Fail:
    Application.StatusBar = False
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    If Application.UserControl Then
        MsgBox "Ошибка обновления: " & Err.Description, vbCritical, "Дашборд"
    Else
        Err.Raise vbObjectError + 2000, "modDashboard", Err.Description
    End If
End Sub


Public Sub SelectAllWells()
    SetWellsSelection True
End Sub


Public Sub ClearWells()
    SetWellsSelection False
End Sub


'==============================================================================
'  curve / track registry
'==============================================================================

Private Function CurveKeys() As Variant
    CurveKeys = Array("ROP", "RPM", "TFLO", "SPPA", "ECD", "GR", "RHOB")
End Function


Private Function TrackKeys() As Variant
    TrackKeys = Array("DRILL", "SPPA", "ECD", "GR", "RHOB")
End Function


Private Function TrackTitle(ByVal key As String) As String
    Select Case key
        Case "DRILL": TrackTitle = "Параметры бурения (ROP · RPM · TFLO)"
        Case "SPPA":  TrackTitle = "SPPA — давление на стояке"
        Case "ECD":   TrackTitle = "ECD — эквивалентная циркуляционная плотность"
        Case "GR":    TrackTitle = "GR — гамма-каротаж"
        Case "RHOB":  TrackTitle = "RHOB — плотность пород"
    End Select
End Function


Private Function TrackCurves(ByVal key As String) As Variant
    Select Case key
        Case "DRILL": TrackCurves = Array("ROP", "RPM", "TFLO")
        Case "SPPA":  TrackCurves = Array("SPPA")
        Case "ECD":   TrackCurves = Array("ECD")
        Case "GR":    TrackCurves = Array("GR")
        Case "RHOB":  TrackCurves = Array("RHOB")
    End Select
End Function


Private Function TrackOfCurve(ByVal key As String) As String
    Select Case key
        Case "ROP", "RPM", "TFLO": TrackOfCurve = "DRILL"
        Case "SPPA":  TrackOfCurve = "SPPA"
        Case "ECD":   TrackOfCurve = "ECD"
        Case "GR":    TrackOfCurve = "GR"
        Case "RHOB":  TrackOfCurve = "RHOB"
    End Select
End Function


Private Function CurveUnit(ByVal key As String) As String
    Select Case key
        Case "ROP":  CurveUnit = "m/h"
        Case "RPM":  CurveUnit = "rpm"
        Case "TFLO": CurveUnit = "gal/min"
        Case "SPPA": CurveUnit = "psi"
        Case "ECD":  CurveUnit = "ppg"
        Case "GR":   CurveUnit = "gapi"
        Case "RHOB": CurveUnit = "g/cc"
    End Select
End Function


Private Function CurveAxis(ByVal key As String) As Long
    If key = "TFLO" Then CurveAxis = xlSecondary Else CurveAxis = xlPrimary
End Function


Private Function CurveDash(ByVal key As String) As Boolean
    CurveDash = (key = "RPM")
End Function


Private Function TrackAxisTitle(ByVal key As String, ByVal axisSide As Long) As String
    If key = "DRILL" Then
        If axisSide = xlPrimary Then
            TrackAxisTitle = "ROP (m/h) ——    RPM (rpm) - -"
        Else
            TrackAxisTitle = "TFLO (gal/min)"
        End If
    ElseIf key = "GR" Then
        TrackAxisTitle = "GR (gapi)  —— MSEDA    - - LWDD"
    Else
        Dim arr As Variant
        arr = TrackCurves(key)
        TrackAxisTitle = CStr(arr(LBound(arr))) & " (" & CurveUnit(CStr(arr(LBound(arr)))) & ")"
    End If
End Function


' curves available in a source table
Private Function TableCurves(ByVal tbl As String) As Variant
    If tbl = "MSEDA" Then
        TableCurves = Array("ROP", "RPM", "TFLO", "SPPA", "ECD", "GR")
    ElseIf tbl = "LWDD" Then
        TableCurves = Array("GR", "RHOB")
    End If
End Function


Private Function TableSelectedCurves(ByVal tbl As String, ByVal curves As Collection) As Collection
    Dim all As Variant
    all = TableCurves(tbl)
    Dim result As New Collection
    Dim i As Long
    For i = 0 To UBound(all)
        If CollectionContains(curves, CStr(all(i))) Then result.Add CStr(all(i))
    Next i
    Set TableSelectedCurves = result
End Function


Private Function TracksToBuild(ByVal curves As Collection) As Collection
    Dim result As New Collection
    Dim tks As Variant
    tks = TrackKeys()
    Dim i As Long
    For i = 0 To UBound(tks)
        Dim tk As String
        tk = CStr(tks(i))
        Dim tcurves As Variant
        tcurves = TrackCurves(tk)
        Dim j As Long
        For j = 0 To UBound(tcurves)
            If CollectionContains(curves, CStr(tcurves(j))) Then
                result.Add tk
                Exit For
            End If
        Next j
    Next i
    Set TracksToBuild = result
End Function


Private Function CollectionContains(ByVal col As Collection, ByVal s As String) As Boolean
    Dim v As Variant
    For Each v In col
        If CStr(v) = s Then
            CollectionContains = True
            Exit Function
        End If
    Next v
End Function


'==============================================================================
'  database access
'==============================================================================

Private Function GetDBPath() As String
    On Error Resume Next
    GetDBPath = CStr(ThisWorkbook.Names(RNG_DBPATH).RefersToRange.Value)
    On Error GoTo 0
End Function


Private Function OpenConnection() As Object
    Dim dbPath As String
    dbPath = Trim(GetDBPath())
    If dbPath = "" Then
        Err.Raise vbObjectError + 1001, "modDashboard", _
            "Не задан путь к базе данных (именованный диапазон '" & RNG_DBPATH & "')."
    End If

    Dim conn As Object
    Set conn = CreateObject("ADODB.Connection")

    Dim opened As Boolean
    opened = False
    On Error Resume Next
    conn.Open "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=" & dbPath & ";"
    If Err.Number = 0 Then opened = True Else Err.Clear
    If Not opened Then
        conn.Open "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" & dbPath & ";"
        If Err.Number = 0 Then opened = True
    End If
    On Error GoTo 0

    If Not opened Then
        Err.Raise vbObjectError + 1002, "modDashboard", _
            "Не удалось подключиться к базе данных: " & dbPath
    End If

    Set OpenConnection = conn
End Function


Private Sub LoadWellMaps(ByVal conn As Object, ByRef nameToId As Object, ByRef idToName As Object)
    Set nameToId = CreateObject("Scripting.Dictionary")
    Set idToName = CreateObject("Scripting.Dictionary")

    Dim rs As Object
    Set rs = CreateObject("ADODB.Recordset")
    rs.Open "SELECT WellName, WellID FROM Wells", conn, 3, 1
    Do While Not rs.EOF
        If Not IsNull(rs.Fields(0).Value) Then
            nameToId(CStr(rs.Fields(0).Value)) = CLng(rs.Fields(1).Value)
            idToName(CLng(rs.Fields(1).Value)) = CStr(rs.Fields(0).Value)
        End If
        rs.MoveNext
    Loop
    rs.Close
End Sub


Private Sub PopulateWells()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)
    Dim lb As Object
    Set lb = ws.OLEObjects(LST_WELLS).Object

    Dim conn As Object
    Set conn = OpenConnection()

    Dim rs As Object
    Set rs = CreateObject("ADODB.Recordset")
    rs.Open "SELECT WellName FROM Wells ORDER BY WellName", conn, 3, 1

    lb.Clear
    Do While Not rs.EOF
        lb.AddItem CStr(rs.Fields(0).Value)
        rs.MoveNext
    Loop

    rs.Close
    conn.Close
End Sub


'==============================================================================
'  UI state helpers
'==============================================================================

Private Function SelectedWells() As Collection
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)
    Dim lb As Object
    Set lb = ws.OLEObjects(LST_WELLS).Object

    Dim col As New Collection
    Dim i As Long
    For i = 0 To lb.ListCount - 1
        If lb.Selected(i) Then col.Add CStr(lb.List(i))
    Next i
    Set SelectedWells = col
End Function


Private Function SelectedCurves() As Collection
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)
    Dim keys As Variant
    keys = CurveKeys()

    Dim col As New Collection
    Dim i As Long
    For i = 0 To UBound(keys)
        If ws.CheckBoxes("chk" & keys(i)).Value = xlOn Then col.Add CStr(keys(i))
    Next i
    Set SelectedCurves = col
End Function


Private Sub SetWellsSelection(ByVal sel As Boolean)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)
    Dim lb As Object
    Set lb = ws.OLEObjects(LST_WELLS).Object

    Dim i As Long
    For i = 0 To lb.ListCount - 1
        lb.Selected(i) = sel
    Next i
End Sub


Private Sub SelectFirstWells(ByVal n As Long)
    SetWellsSelection False
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)
    Dim lb As Object
    Set lb = ws.OLEObjects(LST_WELLS).Object

    If n > lb.ListCount Then n = lb.ListCount
    Dim i As Long
    For i = 0 To n - 1
        lb.Selected(i) = True
    Next i
End Sub


Private Function BuildIdList(ByVal wells As Collection, ByVal nameToId As Object) As String
    Dim s As String
    s = ""
    Dim w As Variant
    For Each w In wells
        If nameToId.Exists(CStr(w)) Then
            If s <> "" Then s = s & ","
            s = s & nameToId(CStr(w))
        End If
    Next w
    BuildIdList = s
End Function


Private Function DepthFilter() As String
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)

    Dim dmin As Variant, dmax As Variant
    dmin = ws.Range(RNG_DEP_MIN).Value
    dmax = ws.Range(RNG_DEP_MAX).Value

    Dim clause As String
    clause = ""
    If Not IsEmpty(dmin) And IsNumeric(dmin) Then clause = clause & " AND DEPT >= " & CDbl(dmin)
    If Not IsEmpty(dmax) And IsNumeric(dmax) Then clause = clause & " AND DEPT <= " & CDbl(dmax)
    DepthFilter = clause
End Function


Private Function ResolveBucketSize() As Double
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)
    Dim dmin As Variant, dmax As Variant
    dmin = ws.Range(RNG_DEP_MIN).Value
    dmax = ws.Range(RNG_DEP_MAX).Value

    Dim rng As Double
    If Not IsEmpty(dmin) And Not IsEmpty(dmax) And IsNumeric(dmin) And IsNumeric(dmax) Then
        rng = CDbl(dmax) - CDbl(dmin)
    Else
        rng = 15000   ' full-depth overview
    End If

    If rng <= 500 Then
        ResolveBucketSize = 0.5
    ElseIf rng <= 1500 Then
        ResolveBucketSize = 1
    ElseIf rng <= 4000 Then
        ResolveBucketSize = 2
    ElseIf rng <= 10000 Then
        ResolveBucketSize = 5
    Else
        ResolveBucketSize = 10
    End If
End Function


Private Function FmtNum(ByVal x As Double) As String
    FmtNum = Replace(CStr(x), ",", ".")
End Function


' stable colour per well, keyed by the sorted listbox order
Private Function BuildNameToColor() As Object
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)
    Dim lb As Object
    Set lb = ws.OLEObjects(LST_WELLS).Object

    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    Dim i As Long
    For i = 0 To lb.ListCount - 1
        d(CStr(lb.List(i))) = SeriesColor(i)
    Next i
    Set BuildNameToColor = d
End Function


'==============================================================================
'  data loading (one bucketed GROUP BY query per table)
'==============================================================================

Private Sub PrepareDataSheet()
    On Error Resume Next
    Set mDataWS = ThisWorkbook.Worksheets(WS_DATA)
    On Error GoTo 0
    If mDataWS Is Nothing Then
        Set mDataWS = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(WS_DASH))
        mDataWS.Name = WS_DATA
    End If

    mDataWS.Cells.Clear
    mDataWS.Range("A1:H1").Value = Array("Curve", "Well", "Source", "Buckets", _
                                          "DepthMin", "DepthMax", "ValueMin", "ValueMax")
    mDataNextRow = 2
End Sub


Private Sub ClearCharts()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)
    Dim co As ChartObject
    For Each co In ws.ChartObjects
        co.Delete
    Next co
End Sub


Private Sub BuildEmptyTrackChart(ByVal trackKey As String, ByVal index As Long, ByVal totalTracks As Long)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)

    Dim co As ChartObject
    Set co = ws.ChartObjects.Add(0, 0, 1, 1)
    PositionChart co, index, totalTracks

    Dim ch As Chart
    Set ch = co.Chart
    ch.ChartType = xlXYScatterLinesNoMarkers
    ch.HasLegend = False

    ch.HasTitle = True
    ch.ChartTitle.Text = TrackTitle(trackKey)
    ch.ChartTitle.Font.Size = 11
    ch.ChartTitle.Font.Bold = True
    ch.ChartTitle.Font.Color = C_TEXT
    ch.ChartTitle.Left = 0
    ch.ChartTitle.Top = 0

    mCharts.Add co
    mChartTracks.Add trackKey
    Set mChartByTrack(trackKey) = ch
End Sub


Private Sub LoadTable(ByVal conn As Object, ByVal tbl As String, _
                      ByVal tblCurves As Collection, _
                      ByVal wells As Collection, _
                      ByVal nameToId As Object, ByVal idToName As Object, _
                      ByVal nameToColor As Object)
    Dim inList As String
    inList = BuildIdList(wells, nameToId)
    If inList = "" Then Exit Sub

    ' build the SELECT / GROUP BY with one AVG() column per selected curve
    Dim bucketExpr As String
    bucketExpr = "Int(DEPT / " & FmtNum(mBucketSize) & ") * " & FmtNum(mBucketSize)

    Dim sql As String
    sql = "SELECT WellID, " & bucketExpr & " AS D"

    Dim colIdx As Object
    Set colIdx = CreateObject("Scripting.Dictionary")
    Dim ci As Long
    ci = 2   ' GetRows column 0 = WellID, 1 = D, 2+ = curves

    Dim c As Variant
    For Each c In tblCurves
        sql = sql & ", AVG(" & CStr(c) & ") AS V" & CStr(ci)
        colIdx(CStr(c)) = ci
        ci = ci + 1
    Next c

    sql = sql & " FROM " & tbl & _
          " WHERE WellID IN (" & inList & ")" & DepthFilter() & _
          " AND DEPT IS NOT NULL" & _
          " GROUP BY WellID, " & bucketExpr & _
          " ORDER BY 1, 2"

    Dim rs As Object
    Set rs = CreateObject("ADODB.Recordset")
    rs.Open sql, conn, 3, 1
    If Not rs.EOF Then
        Dim data As Variant
        data = rs.GetRows()
        Dim n As Long
        n = UBound(data, 2) + 1

        Dim segStart As Long
        segStart = 0
        Dim curWid As Long
        curWid = -1
        Dim i As Long
        For i = 0 To n - 1
            Dim wid As Long
            wid = CLng(data(0, i))
            If wid <> curWid Then
                If curWid <> -1 Then
                    EmitWell data, segStart, i - 1, curWid, tbl, tblCurves, colIdx, idToName, nameToColor
                End If
                segStart = i
                curWid = wid
            End If
        Next i
        If curWid <> -1 Then
            EmitWell data, segStart, n - 1, curWid, tbl, tblCurves, colIdx, idToName, nameToColor
        End If
    End If
    rs.Close
End Sub


Private Sub EmitWell(ByVal data As Variant, ByVal i0 As Long, ByVal i1 As Long, _
                     ByVal wid As Long, ByVal tbl As String, _
                     ByVal tblCurves As Collection, ByVal colIdx As Object, _
                     ByVal idToName As Object, ByVal nameToColor As Object)
    Dim wname As String
    wname = idToName(wid)
    Dim color As Long
    color = CLng(nameToColor(wname))

    Dim n As Long
    n = i1 - i0 + 1

    Dim c As Variant
    For Each c In tblCurves
        Dim key As String
        key = CStr(c)
        Dim ci As Long
        ci = colIdx(key)

        Dim xs() As Variant, ys() As Variant
        ReDim xs(1 To n)
        ReDim ys(1 To n)

        If Not mValueCache.Exists(key) Then
            Set mValueCache(key) = New Collection
        End If
        Dim vcol As Collection
        Set vcol = mValueCache(key)

        Dim cnt As Long
        cnt = 0
        Dim i As Long
        For i = i0 To i1
            Dim v As Variant
            v = data(ci, i)
            If Not IsNull(v) And Not IsNull(data(1, i)) Then
                cnt = cnt + 1
                xs(cnt) = data(1, i)
                ys(cnt) = v
                vcol.Add v
            End If
        Next i

        If cnt > 0 Then
            ReDim Preserve xs(1 To cnt)
            ReDim Preserve ys(1 To cnt)

            Dim trackKey As String
            trackKey = TrackOfCurve(key)
            Dim ch As Chart
            Set ch = mChartByTrack(trackKey)

            AddSeries ch, xs, ys, SeriesName(trackKey, key, tbl, wname), _
                      color, CurveAxis(key), SeriesDashed(trackKey, key, tbl)
            WriteSummaryRow key, wname, tbl, xs, ys
        End If
    Next c
End Sub


Private Sub AddSeries(ByVal ch As Chart, ByVal xs As Variant, ByVal ys As Variant, _
                      ByVal sname As String, ByVal color As Long, _
                      ByVal axisSide As Long, ByVal dashed As Boolean)
    Dim s As Series
    Set s = ch.SeriesCollection.NewSeries()
    s.Name = sname
    s.XValues = xs
    s.Values = ys
    s.AxisGroup = axisSide
    s.Format.Line.ForeColor.RGB = color
    s.Format.Line.Weight = 1.5
    If dashed Then
        s.Format.Line.DashStyle = msoLineDash
    End If
End Sub


Private Sub WriteSummaryRow(ByVal curveKey As String, ByVal wname As String, _
                            ByVal tbl As String, ByVal xs As Variant, ByVal ys As Variant)
    Dim n As Long
    n = UBound(xs)

    Dim dmin As Double, dmax As Double, vmin As Double, vmax As Double
    dmin = xs(1): dmax = dmin
    vmin = ys(1): vmax = vmin

    Dim i As Long
    For i = 1 To n
        If xs(i) < dmin Then dmin = xs(i)
        If xs(i) > dmax Then dmax = xs(i)
        If ys(i) < vmin Then vmin = ys(i)
        If ys(i) > vmax Then vmax = ys(i)
    Next i

    If Not mHasDepth Then
        mDepthMin = dmin: mDepthMax = dmax: mHasDepth = True
    Else
        If dmin < mDepthMin Then mDepthMin = dmin
        If dmax > mDepthMax Then mDepthMax = dmax
    End If

    mDataWS.Cells(mDataNextRow, 1).Value = curveKey
    mDataWS.Cells(mDataNextRow, 2).Value = wname
    mDataWS.Cells(mDataNextRow, 3).Value = tbl
    mDataWS.Cells(mDataNextRow, 4).Value = n
    mDataWS.Cells(mDataNextRow, 5).Value = dmin
    mDataWS.Cells(mDataNextRow, 6).Value = dmax
    mDataWS.Cells(mDataNextRow, 7).Value = vmin
    mDataWS.Cells(mDataNextRow, 8).Value = vmax
    mDataNextRow = mDataNextRow + 1
End Sub


Private Function SeriesName(ByVal trackKey As String, ByVal curveKey As String, _
                            ByVal tbl As String, ByVal wname As String) As String
    If trackKey = "DRILL" Then
        SeriesName = wname & " · " & curveKey
    ElseIf curveKey = "GR" Then
        SeriesName = wname & " · " & tbl
    Else
        SeriesName = wname
    End If
End Function


Private Function SeriesDashed(ByVal trackKey As String, ByVal curveKey As String, _
                              ByVal tbl As String) As Boolean
    If trackKey = "DRILL" Then
        SeriesDashed = CurveDash(curveKey)
    ElseIf curveKey = "GR" Then
        SeriesDashed = (tbl = "LWDD")
    Else
        SeriesDashed = False
    End If
End Function


Private Function HasSecondarySeries(ByVal ch As Chart) As Boolean
    Dim s As Series
    For Each s In ch.SeriesCollection
        If s.AxisGroup = xlSecondary Then
            HasSecondarySeries = True
            Exit Function
        End If
    Next s
End Function


'==============================================================================
'  finalize: shared depth range + percentile Y limits + beige styling
'==============================================================================

Private Sub PruneEmptyCharts()
    Dim i As Long
    For i = mCharts.Count To 1 Step -1
        Dim co As ChartObject
        Set co = mCharts(i)
        Dim tk As String
        tk = mChartTracks(i)
        If co.Chart.SeriesCollection.Count = 0 Then
            co.Delete
            mCharts.Remove i
            mChartTracks.Remove i
            If mChartByTrack.Exists(tk) Then mChartByTrack.Remove tk
        End If
    Next i
End Sub


Private Sub ComputePercentiles()
    Set mPLo = CreateObject("Scripting.Dictionary")
    Set mPHi = CreateObject("Scripting.Dictionary")

    Dim key As Variant
    For Each key In mValueCache.Keys
        Dim col As Collection
        Set col = mValueCache(key)
        If col.Count > 1 Then
            Dim arr() As Variant
            ReDim arr(1 To col.Count)
            Dim i As Long
            For i = 1 To col.Count
                arr(i) = col(i)
            Next i
            mPLo(key) = Application.WorksheetFunction.Percentile_Inc(arr, PERC_LO)
            mPHi(key) = Application.WorksheetFunction.Percentile_Inc(arr, PERC_HI)
        End If
    Next key
End Sub


Private Sub FinalizeCharts()
    Dim dmin As Double, dmax As Double
    Dim haveRange As Boolean
    haveRange = ResolveDepthRange(dmin, dmax)

    Dim i As Long
    For i = 1 To mCharts.Count
        Dim co As ChartObject
        Set co = mCharts(i)
        Dim ch As Chart
        Set ch = co.Chart
        Dim tk As String
        tk = mChartTracks(i)
        StyleChart ch, tk, dmin, dmax, haveRange
    Next i
End Sub


Private Function ResolveDepthRange(ByRef dmin As Double, ByRef dmax As Double) As Boolean
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)

    Dim mn As Variant, mx As Variant
    mn = ws.Range(RNG_DEP_MIN).Value
    mx = ws.Range(RNG_DEP_MAX).Value

    If Not IsEmpty(mn) And Not IsEmpty(mx) And IsNumeric(mn) And IsNumeric(mx) Then
        dmin = CDbl(mn): dmax = CDbl(mx)
        ResolveDepthRange = True
    ElseIf mHasDepth Then
        dmin = mDepthMin: dmax = mDepthMax
        If dmax - dmin < 1 Then
            dmin = dmin - 1: dmax = dmax + 1
        End If
        ResolveDepthRange = True
    Else
        ResolveDepthRange = False
    End If
End Function


Private Sub StyleChart(ByVal ch As Chart, ByVal tk As String, _
                       ByVal dmin As Double, ByVal dmax As Double, ByVal haveRange As Boolean)
    ' X (depth)
    ch.Axes(xlCategory).HasTitle = True
    ch.Axes(xlCategory).AxisTitle.Text = "Глубина, м (MD)"
    ch.Axes(xlCategory).AxisTitle.Font.Color = C_TEXT
    ch.Axes(xlCategory).TickLabels.Font.Color = C_TEXT
    If haveRange Then
        ch.Axes(xlCategory).MinimumScale = dmin
        ch.Axes(xlCategory).MaximumScale = dmax
    End If
    ch.Axes(xlCategory).TickLabels.NumberFormat = "#,##0"

    ' Y primary
    ch.Axes(xlValue, xlPrimary).HasTitle = True
    ch.Axes(xlValue, xlPrimary).AxisTitle.Text = TrackAxisTitle(tk, xlPrimary)
    ch.Axes(xlValue, xlPrimary).AxisTitle.Font.Color = C_TEXT
    ch.Axes(xlValue, xlPrimary).TickLabels.Font.Color = C_TEXT

    Dim lo As Variant, hi As Variant
    GetAxisLimits tk, xlPrimary, lo, hi
    If Not IsEmpty(lo) Then
        ch.Axes(xlValue, xlPrimary).MinimumScale = lo
        ch.Axes(xlValue, xlPrimary).MaximumScale = hi
    End If
    ch.Axes(xlValue, xlPrimary).TickLabels.NumberFormat = "#,##0.##"

    ' Y secondary
    If HasSecondarySeries(ch) Then
        ch.Axes(xlValue, xlSecondary).HasTitle = True
        ch.Axes(xlValue, xlSecondary).AxisTitle.Text = TrackAxisTitle(tk, xlSecondary)
        ch.Axes(xlValue, xlSecondary).AxisTitle.Font.Color = C_TEXT
        ch.Axes(xlValue, xlSecondary).TickLabels.Font.Color = C_TEXT

        GetAxisLimits tk, xlSecondary, lo, hi
        If Not IsEmpty(lo) Then
            ch.Axes(xlValue, xlSecondary).MinimumScale = lo
            ch.Axes(xlValue, xlSecondary).MaximumScale = hi
        End If
        ch.Axes(xlValue, xlSecondary).TickLabels.NumberFormat = "#,##0.##"
    End If

    ' beige gridlines + axis lines
    Dim ax As Axis
    For Each ax In ch.Axes
        If ax.HasMajorGridlines Then
            ax.MajorGridlines.Format.Line.ForeColor.RGB = C_GRID
            ax.MajorGridlines.Format.Line.Weight = 0.75
        End If
        ax.Format.Line.ForeColor.RGB = C_AXIS
    Next ax

    ' chart + plot area background
    ch.ChartArea.Format.Fill.ForeColor.RGB = C_PLOT
    ch.PlotArea.Format.Fill.ForeColor.RGB = C_PLOT
    ch.PlotArea.Format.Line.Visible = msoFalse
End Sub


Private Sub GetAxisLimits(ByVal tk As String, ByVal axisSide As Long, _
                          ByRef lo As Variant, ByRef hi As Variant)
    Dim got As Boolean
    got = False
    Dim vlo As Double, vhi As Double

    Dim curves As Variant
    curves = TrackCurves(tk)
    Dim c As Variant
    For Each c In curves
        Dim key As String
        key = CStr(c)
        If CurveAxis(key) = axisSide And mPLo.Exists(key) Then
            If Not got Then
                vlo = mPLo(key): vhi = mPHi(key): got = True
            Else
                If mPLo(key) < vlo Then vlo = mPLo(key)
                If mPHi(key) > vhi Then vhi = mPHi(key)
            End If
        End If
    Next c

    If got Then
        Dim span As Double
        span = vhi - vlo
        If span <= 0 Then span = Abs(vhi) * 0.05 + 1
        lo = vlo - span * 0.05
        hi = vhi + span * 0.05
    Else
        lo = Empty: hi = Empty
    End If
End Sub


' one coloured row per selected well, so every line colour on the charts is
' traceable back to a well name (charts themselves carry no legend).
Private Sub WriteWellLegend(ByVal wells As Collection, ByVal nameToColor As Object)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(WS_DASH)

    ws.Range("A37:A90").Clear

    ws.Range("A37").Value = "Легенда (скважины):"
    ws.Range("A37").Font.Bold = True
    ws.Range("A37").Font.Size = 10
    ws.Range("A37").Font.Color = C_TEXT

    Dim i As Long
    i = 0
    Dim w As Variant
    For Each w In wells
        Dim r As Long
        r = 38 + i
        ws.Cells(r, 1).Value = CStr(w)
        ws.Cells(r, 1).Font.Color = CLng(nameToColor(CStr(w)))
        ws.Cells(r, 1).Font.Bold = True
        ws.Cells(r, 1).Font.Size = 9
        i = i + 1
    Next w
End Sub


'==============================================================================
'  theme colours + layout
'==============================================================================

' beige / earth theme (adapted from the reference dashboards)
Private Function C_TEXT() As Long
    C_TEXT = RGB(31, 77, 46)     ' dark green text
End Function

Private Function C_GRID() As Long
    C_GRID = RGB(221, 212, 191)  ' light tan grid
End Function

Private Function C_AXIS() As Long
    C_AXIS = RGB(200, 190, 168)  ' tan axis line
End Function

Private Function C_PLOT() As Long
    C_PLOT = RGB(251, 248, 240)  ' near-white cream plot
End Function


Private Function SeriesColor(ByVal idx As Long) As Long
    Select Case idx Mod 12
        Case 0:  SeriesColor = RGB(46, 107, 79)    ' dark green
        Case 1:  SeriesColor = RGB(166, 69, 46)    ' brick
        Case 2:  SeriesColor = RGB(192, 138, 30)   ' ochre
        Case 3:  SeriesColor = RGB(46, 125, 116)   ' teal
        Case 4:  SeriesColor = RGB(63, 110, 158)   ' dusty blue
        Case 5:  SeriesColor = RGB(123, 74, 138)   ' plum
        Case 6:  SeriesColor = RGB(110, 123, 46)   ' olive
        Case 7:  SeriesColor = RGB(154, 91, 40)    ' sienna
        Case 8:  SeriesColor = RGB(90, 107, 138)   ' slate
        Case 9:  SeriesColor = RGB(58, 125, 68)    ' forest
        Case 10: SeriesColor = RGB(196, 101, 74)   ' terracotta
        Case 11: SeriesColor = RGB(47, 75, 110)    ' navy
    End Select
End Function


Private Sub PositionChart(ByVal co As ChartObject, ByVal index As Long, ByVal totalTracks As Long)
    Dim usableW As Double
    usableW = Application.UsableWidth
    If usableW <= 0 Then usableW = 1400

    Dim usableH As Double
    usableH = Application.UsableHeight
    If usableH <= 0 Then usableH = 900

    Dim chartW As Double
    chartW = usableW - PANEL_W - 30
    If chartW < 600 Then chartW = 600

    Dim chartH As Double
    chartH = (usableH - TOP0 - CHART_GAP * (totalTracks - 1)) / totalTracks
    If chartH < 170 Then chartH = 170
    If chartH > 240 Then chartH = 240

    co.Left = PANEL_W
    co.Top = TOP0 + index * (chartH + CHART_GAP)
    co.Width = chartW
    co.Height = chartH
End Sub
