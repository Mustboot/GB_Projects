/* ==========================================================================
   DrillingLogs Dashboard — frontend logic
   Two separate, depth-synchronized Plotly plots:
     plot 1 (top) : ECD — эквивалентная плотность циркуляции
     plot 2 (bot) : БУРЕНИЕ (ROP | RPM | TFLO — three Y axes) + GR
   Zoom/pan is mirrored between the plots (shared depth axis).
   ========================================================================== */

'use strict';

/* ------------------------------------------------------------------ state */
const state = {
  meta: null,
  selectedWells: new Set(),
  selectedCurves: new Set(['ROP', 'RPM', 'TFLO', 'ECD', 'GR', 'RHOB', 'CALI']),
  wellColor: {},          // wellId -> color
  lastData: null,
  busy: false,
  depthEdited: false,     // user manually changed the depth inputs
  zoomSyncBusy: false,    // guards cross-plot zoom mirroring
  lastPlotsCount: 0,      // number of rendered plot figures
};

/* Colorblind-safe palette for wells (stable order = wells sorted by name) */
const WELL_COLORS = [
  '#0072B2', '#D55E00', '#009E73', '#CC79A7', '#6F4E37', '#56B4E9',
  '#8C1D40', '#1E8449', '#34495E', '#E69F00', '#7A1FA2', '#00A5B5',
];

/* Curve identity: axis color + dash style (drill track) */
const CURVE_STYLE = {
  ROP:  { axis: '#c0392b', dash: 'solid', chip: '#c0392b', axisLabel: 'ROP, м/ч' },
  RPM:  { axis: '#1f618d', dash: 'dash',  chip: '#1f618d', axisLabel: 'RPM, об/мин' },
  TFLO: { axis: '#1e8449', dash: 'dot',   chip: '#1e8449', axisLabel: 'TFLO, гал/мин' },
  ECD:  { axis: '#7d3c98', dash: 'solid', chip: '#7d3c98', axisLabel: 'ECD, ppg' },
  GR:   { axis: '#b7791f', dash: 'solid', chip: '#b7791f', axisLabel: 'GR, gAPI' },
  RHOB: { axis: '#0e7c7b', dash: 'solid', chip: '#0e7c7b', axisLabel: 'Плотность, г/см³' },
  CALI: { axis: '#a04000', dash: 'solid', chip: '#a04000', axisLabel: 'Кавернометрия, дюйм' },
};

const TRACK_ORDER = ['gr', 'ecd', 'drill'];   // bottom -> top

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------- dom */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function toast(msg, kind) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + (kind || '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 6000);
}

function showLoading(text) {
  $('loadingText').textContent = text || 'Загрузка данных…';
  $('loading').classList.remove('hidden');
}

function hideLoading() { $('loading').classList.add('hidden'); }

function showEmpty(title, msg) {
  const box = document.querySelector('#empty .empty-box');
  box.querySelector('strong').textContent = title;
  box.querySelector('p').textContent = msg;
  $('empty').classList.remove('hidden');
}

function hideEmpty() { $('empty').classList.add('hidden'); }

/* ------------------------------------------------------------- meta / UI */
async function init() {
  if (typeof Plotly === 'undefined') {
    showEmpty('Не удалось загрузить Plotly',
      'Библиотека графиков недоступна (нет локальной копии и нет доступа к CDN).');
    toast('Plotly не загрузился — проверьте подключение к интернету или файл static/plotly.min.js');
    return;
  }

  try {
    const r = await fetch('/api/meta');
    const meta = await r.json();
    if (!meta.ok) throw new Error(meta.error || 'Ошибка сервера');
    state.meta = meta;

    meta.wells.forEach((w, i) => { state.wellColor[w.id] = WELL_COLORS[i % WELL_COLORS.length]; });

    renderWellList();
    renderCurveList();

    // default selection: first 6 wells with drilling data
    const withDrilling = meta.wells.filter((w) => w.main_table);
    const def = withDrilling.slice(0, 6).map((w) => w.id);
    state.selectedWells = new Set(def);
    syncWellChecks();
    setDepthToUnion();

    $('dbInfo').textContent =
      'База: ' + meta.db.name + ' · скважин: ' + meta.wells.length +
      ' · глубина: ' + fmt(meta.depth_min) + '–' + fmt(meta.depth_max) + ' м';

    updateCounters();
    apply();
  } catch (e) {
    showEmpty('База данных недоступна',
      'Не удалось прочитать ' + (state.meta ? state.meta.db.name : 'DrillingLogs_full.accdb') +
      '. Проверьте, что сервер запущен и установлен драйвер Microsoft Access (ODBC).');
    toast('Ошибка чтения базы: ' + e.message);
    $('dbInfo').textContent = 'База данных недоступна';
  }
}

function renderWellList() {
  const list = $('wellList');
  list.innerHTML = '';
  for (const w of state.meta.wells) {
    const li = el('li');
    if (!w.has_data) li.classList.add('disabled');
    li.dataset.id = w.id;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selectedWells.has(w.id);
    if (!w.has_data) cb.disabled = true;
    cb.addEventListener('change', () => {
      if (cb.checked) state.selectedWells.add(w.id);
      else state.selectedWells.delete(w.id);
      updateCounters();
      // keep a manually set depth range when the well set changes
      if (!state.depthEdited) setDepthToUnion();
    });

    const dot = el('span', 'well-dot');
    dot.style.background = state.wellColor[w.id];

    const name = el('span', 'well-name', w.name);
    const sub = el('span', 'well-sub',
      (w.field || '') + (w.has_data ? '' : ' · нет данных'));

    li.append(cb, dot, name, sub);
    li.addEventListener('click', (ev) => {
      if (ev.target === cb) return;
      if (!w.has_data) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });
    list.appendChild(li);
  }
}

function syncWellChecks() {
  document.querySelectorAll('#wellList li').forEach((li) => {
    const id = Number(li.dataset.id);
    const cb = li.querySelector('input[type=checkbox]');
    if (cb && !cb.disabled) cb.checked = state.selectedWells.has(id);
  });
}

function renderCurveList() {
  const box = $('curveList');
  box.innerHTML = '';
  for (const c of state.meta.curves) {
    const item = el('label', 'curve-item');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selectedCurves.has(c.id);
    cb.addEventListener('change', () => {
      if (cb.checked) state.selectedCurves.add(c.id);
      else state.selectedCurves.delete(c.id);
      updateCounters();
    });
    const chip = el('span', 'curve-chip');
    chip.style.background = CURVE_STYLE[c.id].chip;
    const label = el('span', 'curve-label', c.name);
    const unit = el('span', 'curve-unit', c.unit);
    item.append(cb, chip, label, unit);
    box.appendChild(item);
  }
}

function updateCounters() {
  $('wellCount').textContent = state.selectedWells.size;
  $('curveCount').textContent = state.selectedCurves.size;
}

function setDepthToUnion() {
  const wells = [...state.selectedWells]
    .map((id) => state.meta.wells.find((w) => w.id === id))
    .filter((w) => w && w.dmin !== null);
  if (wells.length) {
    const dmin = Math.floor(Math.min(...wells.map((w) => w.dmin)));
    const dmax = Math.ceil(Math.max(...wells.map((w) => w.dmax)));
    $('dmin').value = dmin;
    $('dmax').value = dmax;
    $('rangeHint').textContent = 'по выбранным скважинам';
  } else {
    $('dmin').value = state.meta.depth_min ? Math.floor(state.meta.depth_min) : '';
    $('dmax').value = state.meta.depth_max ? Math.ceil(state.meta.depth_max) : '';
    $('rangeHint').textContent = 'по всей базе';
  }
}

function fmt(v) {
  return (v === null || v === undefined) ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

/* -------------------------------------------------------------- data load */
function activeTracks() {
  const sel = state.selectedCurves;
  const tracks = [];
  if (sel.has('CALI')) tracks.push('cali');
  if (sel.has('RHOB')) tracks.push('rho');
  if (sel.has('GR')) tracks.push('gr');
  if (sel.has('ECD')) tracks.push('ecd');
  if (['ROP', 'RPM', 'TFLO'].some((c) => sel.has(c))) tracks.push('drill');
  return tracks;
}

async function apply() {
  if (!state.meta || state.busy) return;
  const wells = [...state.selectedWells];
  const curves = [...state.selectedCurves];
  const dmin = parseFloat($('dmin').value);
  const dmax = parseFloat($('dmax').value);

  hideEmpty();
  if (!wells.length) return showEmpty('Не выбраны скважины', 'Отметьте скважины в списке слева.');
  if (!curves.length) return showEmpty('Не выбраны кривые', 'Отметьте хотя бы одну кривую.');
  if (!(dmax > dmin)) {
    toast('Проверьте интервал глубин: «до» должно быть больше «от».');
    return;
  }

  state.busy = true;
  $('btnRefresh').disabled = true;
  showLoading('Загрузка данных из базы…');

  try {
    const q = new URLSearchParams({
      wells: wells.join(','), curves: curves.join(','),
      dmin: dmin, dmax: dmax,
    });
    const r = await fetch('/api/data?' + q.toString());
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Ошибка сервера');
    state.lastData = data;
    render(data);
    updateStatus(data);
  } catch (e) {
    toast('Ошибка загрузки данных: ' + e.message);
  } finally {
    hideLoading();
    state.busy = false;
    $('btnRefresh').disabled = false;
  }
}

/* ---------------------------------------------------------------- render */
const BASE_CONFIG = {
  responsive: true,
  displaylogo: false,
  scrollZoom: true,
  modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
  toImageButtonOptions: {
    format: 'png', scale: 2, filename: 'DrillingLogs_tracks',
    width: 1600, height: 900,
  },
};

const TRACK_TITLES = {
  drill: 'БУРЕНИЕ · ROP (—) · RPM (- -) · TFLO (•)',
  ecd: 'ECD — ЭКВИВАЛЕНТНАЯ ПЛОТНОСТЬ ЦИРКУЛЯЦИИ',
  gr: 'GR — ГАММА-КАРОТАЖ',
  rho: 'ПЛОТНОСТЬ ПОРОД · RHOB',
  cali: 'КАВЕРНОМЕТРИЯ · UCAV / DCAV',
};

const PLOT_ORDER = ['ecd', 'drill', 'gr', 'cali'];   // main plots, top -> bottom

function baseLayout() {
  return {
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: { family: '"Segoe UI", system-ui, sans-serif', size: 11.5, color: '#1f2d3a' },
    legend: {
      orientation: 'h', x: 0.0, xanchor: 'left', y: 1.02, yanchor: 'bottom',
      font: { size: 11 }, itemwidth: 30,
      itemclick: 'toggle', itemdoubleclick: 'toggleothers',
    },
    annotations: [],
  };
}

function depthAxisCfg() {
  return {
    domain: [0.0, 1.0],
    showgrid: false,
    zeroline: false,
    showticklabels: false,
    ticks: '',
    showspikes: true,
    spikemode: 'across',
    spikedash: 'dot',
    spikecolor: '#7d94a6',
    spikethickness: 1,
    spikedistance: -1,
  };
}

function lineTrace(w, curveId, yaxis, opts) {
  const c = w.curves[curveId];
  if (!c) return null;
  const curveTag = curveId + (c.source === 'LWDD' ? ' (LWDD)' : '');
  return Object.assign({
    x: c.depth, y: c.value,
    type: 'scatter', mode: 'lines',
    name: w.name,
    legendgroup: w.name,
    hovertemplate: '<b>%{fullData.name}</b> · ' + curveTag +
      ': %{y:.2f} ' + c.unit + '<br>Глубина: %{x:.1f} м<extra></extra>',
    line: { color: state.wellColor[w.id], width: 1.4, dash: CURVE_STYLE[curveId].dash },
    yaxis: yaxis,
  }, opts || {});
}

function render(data) {
  const sel = state.selectedCurves;
  const wells = [...state.selectedWells].map((id) => data.wells[id]).filter(Boolean);
  const hasAny = wells.some((w) => Object.keys(w.curves).length > 0);
  hideEmpty();
  if (!hasAny) {
    showEmpty('Нет данных в выбранном интервале',
      'Попробуйте расширить интервал глубин или выбрать другие скважины.');
    const gb = $('geoPlots');
    gb.innerHTML = '';
    $('geoSection').hidden = true;
    return;
  }

  const drillCurves = ['ROP', 'RPM', 'TFLO'].filter((c) => sel.has(c));

  // ---------- traces for the main plots ----------
  const plots = {
    ecd:   { curves: sel.has('ECD') ? ['ECD'] : [], traces: [] },
    drill: { curves: drillCurves, traces: [] },
    gr:    { curves: sel.has('GR') ? ['GR'] : [], traces: [] },
    cali:  { curves: sel.has('CALI') ? ['CALI'] : [], traces: [] },
  };

  for (const w of wells) {
    let firstForWell = true;
    const color = state.wellColor[w.id];
    const add = (plotKey, curveId, yaxis, opts) => {
      const t = lineTrace(w, curveId, yaxis, opts);
      if (!t) return;
      t.showlegend = firstForWell;
      firstForWell = false;
      plots[plotKey].traces.push(t);
    };
    if (plots.drill.curves.length) {
      plots.drill.curves.forEach((cid) => {
        const axis = cid === 'ROP' ? 'y' : (cid === 'RPM' ? 'y2' : 'y3');
        add('drill', cid, axis);
      });
    }
    if (plots.ecd.curves.length) {
      add('ecd', 'ECD', 'y', wells.length === 1
        ? { fill: 'tozeroy', fillcolor: withAlpha(color, 0.10) } : {});
    }
    if (plots.gr.curves.length) {
      add('gr', 'GR', 'y', wells.length === 1
        ? { fill: 'tozeroy', fillcolor: withAlpha(color, 0.16) } : {});
    }
    if (plots.cali.curves.length) {
      add('cali', 'CALI', 'y');
    }
  }

  const divOf = {
    ecd: $('plotEcd'), drill: $('plotDrill'), gr: $('plotGr'), cali: $('plotCali'),
  };
  const wrapOf = {
    ecd: $('wrapEcd'), drill: $('wrapDrill'), gr: $('wrapGr'), cali: $('wrapCali'),
  };
  const active = PLOT_ORDER.filter((k) => plots[k].curves.length && plots[k].traces.length);

  // reset cross-plot listeners before rebuilding figures
  document.querySelectorAll('.chart-card .plot > div').forEach((d) => {
    if (typeof d.removeAllListeners === 'function') {
      d.removeAllListeners('plotly_relayout');
      d.removeAllListeners('plotly_restyle');
    }
  });

  const bottomKey = active[active.length - 1];

  active.forEach((key) => {
    const div = divOf[key];
    const isBottom = key === bottomKey;
    const traces = plots[key].traces;
    const layout = baseLayout();
    layout.hovermode = key === 'drill' ? 'x unified' : 'x';
    layout.showlegend = isBottom;   // single well legend on the bottom plot
    // identical left/right margins for ALL plots => strictly equal plot widths
    layout.margin = isBottom
      ? { l: 64, r: 100, t: 40, b: 40 }
      : { l: 64, r: 100, t: 12, b: 2 };
    layout.xaxis = depthAxisCfg();
    layout.xaxis.range = [data.depth_min, data.depth_max];
    layout.xaxis.showticklabels = isBottom;
    layout.xaxis.title = isBottom
      ? { text: 'Глубина, м', font: { size: 12.5, color: '#1f2d3a' } } : undefined;
    if (isBottom) {
      layout.xaxis.rangeslider = {
        visible: true, thickness: 0.08,
        bgcolor: '#eef4f8', bordercolor: '#c6d6e2', borderwidth: 1,
      };
    }
    layout.yaxis = {
      showgrid: true, gridcolor: '#e3eaf0', gridwidth: 0.7, zeroline: false,
      title: { text: axisTitleFor(key), font: { size: 11, color: axisColorFor(key) } },
      tickfont: { size: 10.5, color: axisColorFor(key) },
    };
    if (key === 'drill') {
      layout.yaxis2 = {
        overlaying: 'y', anchor: 'x', side: 'right',
        showgrid: false, zeroline: false,
        title: { text: CURVE_STYLE.RPM.axisLabel, font: { size: 11, color: CURVE_STYLE.RPM.axis } },
        tickfont: { size: 10.5, color: CURVE_STYLE.RPM.axis },
      };
      layout.yaxis3 = {
        overlaying: 'y', anchor: 'x', side: 'right', position: 1,
        showgrid: false, zeroline: false,
        title: { text: CURVE_STYLE.TFLO.axisLabel, font: { size: 11, color: CURVE_STYLE.TFLO.axis } },
        tickfont: { size: 10.5, color: CURVE_STYLE.TFLO.axis },
      };
    }
    layout.annotations.push({
      xref: 'paper', yref: 'paper', x: 0.01, y: 1.0,
      xanchor: 'left', yanchor: 'top',
      text: TRACK_TITLES[key],
      showarrow: false, font: { size: 9.5, color: '#5f7486' },
    });
    wrapOf[key].style.display = '';
    Plotly.newPlot(div, traces, layout, BASE_CONFIG);
  });

  // hide inactive main plots
  PLOT_ORDER.forEach((key) => {
    if (active.includes(key)) return;
    wrapOf[key].style.display = 'none';
    const d = divOf[key];
    if (d && d._fullLayout !== undefined) Plotly.purge(d);
  });

  // ---------- geology section: per-well pair (lithology band + density line) ----------
  const geoBox = $('geoPlots');
  geoBox.innerHTML = '';
  $('geoSection').hidden = false;   // must be visible while Plotly measures size
  const geoGds = [];
  const geoRhoDivs = [];
  const geoWells = [];
  const geoWrapsByWell = {};          // well name -> wraps to toggle with the legend
  if (sel.has('RHOB')) {
    for (const w of wells) {
      const c = w.curves.RHOB;
      if (!c || !c.value || !c.value.length) continue;
      geoWells.push(w);

      const bandWrap = el('div', 'plot plot-band');
      const bandDiv = el('div');
      bandDiv.id = 'plotBand' + w.id;
      bandWrap.appendChild(bandDiv);

      const rhoWrap = el('div', 'plot plot-rho');
      const rhoDiv = el('div');
      rhoDiv.id = 'plotRho' + w.id;
      rhoWrap.appendChild(rhoDiv);

      geoBox.appendChild(bandWrap);
      geoBox.appendChild(rhoWrap);
      geoWrapsByWell[w.name] = [bandWrap, rhoWrap];

      // band: lithology as full-height background fill, depth-synced
      const bandLayout = baseLayout();
      bandLayout.hovermode = 'x';
      bandLayout.showlegend = false;
      bandLayout.margin = { l: 64, r: 100, t: 18, b: 2 };
      bandLayout.xaxis = depthAxisCfg();
      bandLayout.xaxis.range = [data.depth_min, data.depth_max];
      bandLayout.xaxis.spikemode = 'toaxis';
      bandLayout.shapes = buildLithoShapes(c.depth, c.value);
      bandLayout.yaxis = {
        showticklabels: false, showgrid: false, zeroline: false,
        range: [0, 1], fixedrange: true,
      };
      bandLayout.annotations.push({
        xref: 'paper', yref: 'paper', x: 0.01, y: 1.0,
        xanchor: 'left', yanchor: 'top',
        text: 'ЛИТОЛОГИЯ · ' + w.name,
        showarrow: false, font: { size: 9.5, color: '#5f7486' },
      });
      Plotly.newPlot(bandDiv, [{
        x: [data.depth_min, data.depth_max], y: [0, 0],
        type: 'scatter', mode: 'lines', line: { width: 0 },
        name: w.name, legendgroup: w.name, showlegend: false, hoverinfo: 'skip',
      }], bandLayout, BASE_CONFIG);

      // density line coloured by lithology class
      const rhoLayout = baseLayout();
      rhoLayout.hovermode = 'x';
      rhoLayout.showlegend = false;
      rhoLayout.margin = { l: 64, r: 100, t: 18, b: 2 };
      rhoLayout.xaxis = depthAxisCfg();
      rhoLayout.xaxis.range = [data.depth_min, data.depth_max];
      rhoLayout.xaxis.spikemode = 'toaxis';
      rhoLayout.yaxis = {
        showgrid: true, gridcolor: '#e3eaf0', gridwidth: 0.7, zeroline: false,
        title: { text: CURVE_STYLE.RHOB.axisLabel, font: { size: 11, color: CURVE_STYLE.RHOB.axis } },
        tickfont: { size: 10.5, color: CURVE_STYLE.RHOB.axis },
      };
      rhoLayout.annotations.push({
        xref: 'paper', yref: 'paper', x: 0.01, y: 1.0,
        xanchor: 'left', yanchor: 'top',
        text: 'ПЛОТНОСТЬ · ' + w.name,
        showarrow: false, font: { size: 9.5, color: '#5f7486' },
      });
      Plotly.newPlot(rhoDiv, buildRhoSegments(w, c), rhoLayout, BASE_CONFIG);

      geoGds.push(bandDiv, rhoDiv);
      geoRhoDivs.push(rhoDiv);
    }
  }
  $('geoSection').hidden = geoGds.length === 0;

  // nothing to show at all?
  if (!active.length && !geoGds.length) {
    showEmpty('Нет данных в выбранном интервале',
      'Попробуйте расширить интервал глубин или выбрать другие скважины.');
    return;
  }

  // geo-only mode: the bottom-most density plot hosts the well legend and depth axis
  let geoLegendHost = null;
  if (!active.length && geoRhoDivs.length) {
    const host = geoRhoDivs[geoRhoDivs.length - 1];
    // dummy legend traces so the legend lists ALL selected wells, not just the host's
    Plotly.addTraces(host, geoWells.map((w) => ({
      x: [data.depth_min, data.depth_min], y: [null, null],
      type: 'scatter', mode: 'lines',
      name: w.name, legendgroup: w.name, showlegend: true,
      line: { color: state.wellColor[w.id], width: 1.4 },
    })));
    Plotly.relayout(host, {
      'showlegend': true,
      'margin.t': 40, 'margin.b': 40,
      'xaxis.showticklabels': true,
      'xaxis.title': { text: 'Глубина, м', font: { size: 12.5, color: '#1f2d3a' } },
      'xaxis.rangeslider': { visible: true, thickness: 0.08, bgcolor: '#eef4f8', bordercolor: '#c6d6e2', borderwidth: 1 },
    });
    geoLegendHost = host;
  }

  // ---------- depth-zoom sync + legend mirror across ALL plots ----------
  const mainGds = active.map((k) => divOf[k]).filter((d) => d._fullLayout !== undefined);
  const allGds = mainGds.concat(geoGds).filter((d) => d._fullLayout !== undefined);
  if (allGds.length > 1) {
    const legendGd = mainGds.length ? mainGds[mainGds.length - 1] : geoLegendHost;
    allGds.forEach((gd, gi) => {
      gd.on('plotly_relayout', (evt) => {
        if (!evt || state.zoomSyncBusy) return;
        let r = null;
        if (evt['xaxis.range[0]'] !== undefined && evt['xaxis.range[1]'] !== undefined) {
          r = [evt['xaxis.range[0]'], evt['xaxis.range[1]']];
        } else if (Array.isArray(evt['xaxis.range'])) {
          r = evt['xaxis.range'];
        }
        if (!r) return;
        state.zoomSyncBusy = true;
        const others = allGds.filter((_, j) => j !== gi);
        Promise.all(others.map((o) => Plotly.relayout(o, { 'xaxis.range': r }).catch(() => {})))
          .then(() => { state.zoomSyncBusy = false; })
          .catch(() => { state.zoomSyncBusy = false; });
      });
    });
    legendGd.on('plotly_restyle', (evt) => {
      const upd = evt[0] || {};
      if (!('visible' in upd) || !Array.isArray(evt[1])) return;
      const others = allGds.filter((g) => g !== legendGd);
      evt[1].forEach((idx, k) => {
        const name = legendGd.data[idx] && legendGd.data[idx].name;
        const vis = Array.isArray(upd.visible) ? upd.visible[k] : upd.visible;
        others.forEach((o) => {
          const targets = [];
          o.data.forEach((t, j) => { if (t.name === name) targets.push(j); });
          if (targets.length) Plotly.restyle(o, { visible: vis }, targets);
        });
        (geoWrapsByWell[name] || []).forEach((wrap) => {
          wrap.style.display = vis === true ? '' : 'none';
        });
      });
    });
  }
  state.lastPlotsCount = active.length + geoGds.length;
  state.zoomSyncBusy = false;
  resizeAllPlots();   // normalize sizes after the final layout settles
  setTimeout(resizeAllPlots, 80);   // again once the scrollbar has settled
}

/* lithology zones by density: песчаник < 2.2, алевролит 2.2–2.5, аргиллит ≥ 2.5 */
function buildLithoShapes(depthArr, valArr) {
  const zones = [];
  let cur = null;
  for (let i = 0; i < valArr.length; i++) {
    const v = valArr[i];
    if (v === null || v === undefined || !isFinite(v)) { cur = null; continue; }
    const cls = v < 2.2 ? 0 : (v < 2.5 ? 1 : 2);
    if (cur && cur.cls === cls) {
      cur.d1 = depthArr[i];
    } else {
      cur = { cls: cls, d0: depthArr[i], d1: depthArr[i] };
      zones.push(cur);
    }
  }
  // merge same-class zones separated by less than 1 m
  const merged = [];
  for (const z of zones) {
    const last = merged[merged.length - 1];
    if (last && last.cls === z.cls && z.d0 - last.d1 < 1.0) last.d1 = z.d1;
    else merged.push(z);
  }
  const colors = ['#f4d03f', '#e67e22', '#7f8c8d'];
  // full-height background bands across the whole plot, depth-synced
  return merged.map((z) => ({
    type: 'rect', xref: 'x', yref: 'paper',
    x0: z.d0, x1: z.d1, y0: 0, y1: 1,
    fillcolor: colors[z.cls], opacity: 0.32,
    line: { width: 0 }, layer: 'below',
  }));
}

/* density line split into segments coloured by lithology class */
function buildRhoSegments(w, c) {
  const depth = c.depth;
  const vals = c.value;
  const colors = ['#f4d03f', '#e67e22', '#7f8c8d'];
  const segs = [];
  let cur = null;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v === null || v === undefined || !isFinite(v)) { cur = null; continue; }
    const cls = v < 2.2 ? 0 : (v < 2.5 ? 1 : 2);
    if (cur && cur.cls === cls) {
      cur.d.push(depth[i]);
      cur.v.push(v);
    } else {
      cur = { cls: cls, d: [depth[i]], v: [v] };
      segs.push(cur);
    }
  }
  // merge same-class segments separated by less than 1 m (limits trace count)
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.cls === s.cls && s.d[0] - last.d[last.d.length - 1] < 1.0) {
      last.d = last.d.concat(s.d);
      last.v = last.v.concat(s.v);
    } else {
      merged.push(s);
    }
  }
  return merged.map((s) => ({
    x: s.d, y: s.v,
    type: 'scatter', mode: 'lines',
    name: w.name, legendgroup: w.name, showlegend: false,
    hovertemplate: '<b>%{fullData.name}</b> · RHOB: %{y:.2f} г/см³<br>Глубина: %{x:.1f} м<extra></extra>',
    line: { color: colors[s.cls], width: 1.8 },
  }));
}

function axisTitleFor(track) {
  switch (track) {
    case 'drill': return CURVE_STYLE.ROP.axisLabel;
    case 'ecd': return CURVE_STYLE.ECD.axisLabel;
    case 'gr': return CURVE_STYLE.GR.axisLabel;
    case 'rho': return CURVE_STYLE.RHOB.axisLabel;
    case 'cali': return CURVE_STYLE.CALI.axisLabel;
  }
}

function axisColorFor(track) {
  switch (track) {
    case 'drill': return CURVE_STYLE.ROP.axis;
    case 'ecd': return CURVE_STYLE.ECD.axis;
    case 'gr': return CURVE_STYLE.GR.axis;
    case 'rho': return CURVE_STYLE.RHOB.axis;
    case 'cali': return CURVE_STYLE.CALI.axis;
  }
}

function withAlpha(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function updateStatus(data) {
  let pts = 0;
  for (const wid of Object.keys(data.wells)) {
    for (const cid of Object.keys(data.wells[wid].curves)) {
      pts += (data.wells[wid].curves[cid].value || []).length;
    }
  }
  const activeWells = Object.keys(data.wells).length;
  const tracks = activeTracks().length;
  const plots = state.lastPlotsCount || 0;
  $('statusLeft').textContent =
    'Скважин: ' + activeWells + ' · плотов: ' + plots + ' · треков: ' + tracks +
    ' · интервал: ' + fmt(data.depth_min) + '–' + fmt(data.depth_max) + ' м';
  $('statusRight').textContent =
    'Точек: ' + pts.toLocaleString('ru-RU') +
    ' · запрос: ' + ((data.elapsed_ms || 0) / 1000).toFixed(1) + ' с' +
    (data.cached ? ' (кэш)' : '') +
    ' · ' + (data.generated_at || '');
}

/* ------------------------------------------------------------- export / print */
async function exportExcel() {
  if (state.busy) return;
  const wells = [...state.selectedWells];
  const curves = [...state.selectedCurves];
  const dmin = parseFloat($('dmin').value);
  const dmax = parseFloat($('dmax').value);
  if (!wells.length || !curves.length || !(dmax > dmin)) {
    toast('Сначала выберите скважины, кривые и интервал глубин.');
    return;
  }
  $('btnExcel').disabled = true;
  try {
    const r = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wells: wells, curves: curves, dmin: dmin, dmax: dmax }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'HTTP ' + r.status);
    }
    const blob = await r.blob();
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^";]+)"?/);
    const fname = (m && m[1]) || 'DrillingLogs_export.xlsx';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Файл ' + fname + ' сформирован и скачан.', 'ok');
  } catch (e) {
    toast('Ошибка экспорта: ' + e.message);
  } finally {
    $('btnExcel').disabled = false;
  }
}

function printReport() {
  const p = $('printSummary');
  const wells = [...state.selectedWells]
    .map((id) => state.meta.wells.find((w) => w.id === id))
    .filter(Boolean).map((w) => w.name).join(', ');
  const curves = [...state.selectedCurves].join(', ');
  p.textContent =
    'База: ' + state.meta.db.name +
    ' · Скважины: ' + (wells || '—') +
    ' · Кривые: ' + curves +
    ' · Глубина: ' + $('dmin').value + '–' + $('dmax').value + ' м' +
    ' · Сформировано: ' + new Date().toLocaleString('ru-RU');
  window.print();
}

/* ---------------------------------------------------------------- events */
$('btnRefresh').addEventListener('click', apply);
$('btnExcel').addEventListener('click', exportExcel);
$('btnPrint').addEventListener('click', printReport);

$('wellSearch').addEventListener('input', () => {
  const q = $('wellSearch').value.trim().toLowerCase();
  document.querySelectorAll('#wellList li').forEach((li) => {
    const name = li.querySelector('.well-name').textContent.toLowerCase();
    const sub = li.querySelector('.well-sub').textContent.toLowerCase();
    li.style.display = (!q || name.includes(q) || sub.includes(q)) ? '' : 'none';
  });
});

$('btnAllWells').addEventListener('click', () => {
  state.meta.wells.forEach((w) => { if (w.has_data) state.selectedWells.add(w.id); });
  syncWellChecks(); updateCounters();
  if (!state.depthEdited) setDepthToUnion();
});

$('btnNoWells').addEventListener('click', () => {
  state.selectedWells.clear();
  syncWellChecks(); updateCounters();
});

$('btnFullRange').addEventListener('click', () => {
  $('dmin').value = state.meta.depth_min ? Math.floor(state.meta.depth_min) : '';
  $('dmax').value = state.meta.depth_max ? Math.ceil(state.meta.depth_max) : '';
  state.depthEdited = false;
  $('rangeHint').textContent = 'по всей базе';
});

// manual depth edits must survive well-selection changes
['dmin', 'dmax'].forEach((id) => {
  $(id).addEventListener('input', () => {
    state.depthEdited = true;
    $('rangeHint').textContent = 'вручную';
  });
});

function resizeAllPlots() {
  document.querySelectorAll('.chart-card .plot > div').forEach((d) => {
    try { Plotly.Plots.resize(d); } catch (e) { /* noop */ }
  });
}

window.addEventListener('resize', resizeAllPlots);

window.addEventListener('beforeprint', resizeAllPlots);
window.addEventListener('afterprint', resizeAllPlots);

/* ----------------------------------------------------------------- start */
document.addEventListener('DOMContentLoaded', init);
