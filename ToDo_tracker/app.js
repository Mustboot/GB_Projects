'use strict';

/* =====================================================
   TaskFlow — трекер рабочих задач (локальный, офлайн)
   Данные хранятся в localStorage браузера.
   ===================================================== */

const LS_KEY = 'taskflow.data.v1';

const PRIORITIES = {
  high:   { label: 'Высокий', mark: 'P1' },
  medium: { label: 'Средний', mark: 'P2' },
  low:    { label: 'Низкий',  mark: 'P3' },
};
const PRIORITY_ORDER = { high: 3, medium: 2, low: 1 };
const STATUSES = {
  todo:     { label: 'К выполнению' },
  progress: { label: 'В работе' },
  done:     { label: 'Выполнено' },
};
const FOLDER_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

// Направление сортировки по умолчанию для каждого поля
const SORT_DEFAULT_DIR = {
  priority: 'desc', due: 'asc', created: 'desc', updated: 'desc',
  title: 'asc', folder: 'asc', assignee: 'asc', team: 'asc', status: 'asc',
};

const STATE_VERSION = 3;

/* ---------------- Утилиты ---------------- */

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function fmtDateLong(d) {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function shortDesc(desc) {
  if (!desc || !desc.trim()) return '';
  let t = desc.trim().replace(/\s+/g, ' ');
  const firstStop = t.search(/[.!?]\s/);
  if (firstStop > 0 && firstStop < 160) t = t.slice(0, firstStop + 1);
  if (t.length > 160) t = t.slice(0, 157).trimEnd() + '…';
  return t;
}

/* ---------------- Состояние ---------------- */

function seedState() {
  const t = todayStr();
  const addDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const ts = Date.now();
  return {
    version: STATE_VERSION,
    folders: [
      { id: 'inbox', name: 'Входящие', parentId: null, color: '#64748b', system: true, collapsed: false },
      { id: 'f1', name: 'Проект «Одопту»', parentId: null, color: '#6366f1', collapsed: false },
      { id: 'f2', name: 'Отчётность', parentId: 'f1', color: '#0ea5e9', collapsed: false },
      { id: 'f3', name: 'Личное', parentId: null, color: '#10b981', collapsed: false },
    ],
    fileFolders: [
      { id: 'ff1', name: 'Документы', parentId: null, collapsed: false },
      { id: 'ff2', name: 'Данные скважин', parentId: 'ff1', collapsed: false },
    ],
    teams: [
      { id: 'team1', name: 'Геология' },
      { id: 'team2', name: 'Бурение' },
    ],
    people: [
      { id: 'p1', name: 'Иванов И.И.', teamId: 'team1' },
      { id: 'p2', name: 'Петров П.П.', teamId: 'team2' },
    ],
    tasks: [
      {
        id: uid(), title: 'Подготовить сводный отчёт по бурению', folderId: 'f2',
        desc: 'Собрать данные из LAS-файлов по скважинам O5RD и O42, подготовить краткую сводку по интервалам.',
        status: 'progress', priority: 'high', dueDate: addDays(1), tags: ['отчёт', 'данные'],
        teamId: 'team1', assigneeId: 'p1',
        subtasks: [
          { id: uid(), title: 'Выгрузить LAS-файлы', done: true },
          { id: uid(), title: 'Построить графики', done: false },
          { id: uid(), title: 'Оформить выводы', done: false },
        ],
        links: [{ id: uid(), name: 'Папка с данными', url: 'data_import', kind: 'manual' }],
        createdAt: ts - 86400000 * 2, updatedAt: ts - 86400000, completedAt: null,
      },
      {
        id: uid(), title: 'Согласовать план работ с заказчиком', folderId: 'f1',
        desc: 'Позвонить Иванову, обсудить сроки бурения и отправить протокол на согласование.',
        status: 'todo', priority: 'medium', dueDate: addDays(3), tags: ['звонок'],
        teamId: 'team2', assigneeId: 'p2',
        subtasks: [], links: [], createdAt: ts - 86400000, updatedAt: ts - 86400000, completedAt: null,
      },
      {
        id: uid(), title: 'Обновить базу данных Access', folderId: 'f1',
        desc: 'Импортировать новые данные в DrillingLogs_full.accdb, проверить целостность.',
        status: 'todo', priority: 'low', dueDate: addDays(7), tags: [],
        teamId: null, assigneeId: null,
        subtasks: [], links: [{ id: uid(), name: 'База данных', url: 'DrillingLogs_full.accdb', kind: 'manual' }],
        createdAt: ts - 86400000 * 3, updatedAt: ts - 86400000 * 3, completedAt: null,
      },
      {
        id: uid(), title: 'Проверить скрипт импорта LAS', folderId: 'inbox',
        desc: 'Прошлый запуск import_las_to_accdb.py завершился с ошибкой — разобраться.',
        status: 'todo', priority: 'high', dueDate: t, tags: ['баг'],
        teamId: null, assigneeId: null,
        subtasks: [], links: [], createdAt: ts - 86400000 * 4, updatedAt: ts - 86400000 * 4, completedAt: null,
      },
      {
        id: uid(), title: 'Заполнить табель за прошлую неделю', folderId: 'f3',
        desc: '', status: 'done', priority: 'low', dueDate: null, tags: [],
        teamId: null, assigneeId: null,
        subtasks: [], links: [], createdAt: ts - 86400000 * 6, updatedAt: ts - 86400000, completedAt: ts - 86400000,
      },
    ],
    notes: [
      {
        id: uid(), title: 'Совещание по бурению — протокол',
        text: 'Участники: Иванов И.И., Петров П.П.\n1. Обсудили план бурения на октябрь.\n2. Решили: подготовить сводный отчёт до пятницы (Иванов).\n3. Петров обновит базу Access к среде.\n4. Следующее совещание — понедельник, 10:00.',
        tags: ['совещание', 'протокол'],
        createdAt: ts - 86400000, updatedAt: ts - 86400000,
      },
    ],
    kb: [
      {
        id: uid(), title: 'Как импортировать LAS в Access',
        content: '1. Положить файлы в папку data_import.\n2. Запустить import_las_to_accdb.py.\n3. Проверить целостность в DrillingLogs_full.accdb.\n\nТипичные ошибки связаны с кодировкой и глубинами вне допустимого диапазона.',
        tags: ['las', 'access', 'импорт'],
        createdAt: ts - 86400000 * 2, updatedAt: ts - 86400000,
      },
      {
        id: uid(), title: 'Регламент отчётности',
        content: 'Еженедельный отчёт — до четверга 18:00.\nСводка по бурению — первый понедельник месяца.\nОтчёт клиенту — после каждого этапа работ.',
        tags: ['регламент', 'отчёты'],
        createdAt: ts - 86400000 * 3, updatedAt: ts - 86400000 * 3,
      },
    ],
    settings: { theme: 'dark', aiKey: '', aiModel: 'deepseek-chat', aiBaseUrl: 'https://api.deepseek.com', nativeOpen: true },
    ui: { filterType: 'all', folderId: null, search: '', status: 'all', priority: 'all', sort: 'priority', sortDir: 'desc', team: 'all', assignee: 'all' },
  };
}

// Обновление данных старых версий до актуальной (без потерь)
function migrate(s) {
  const v = s.version || 1;
  if (v >= STATE_VERSION && Array.isArray(s.notes) && Array.isArray(s.kb)) {
    s.version = STATE_VERSION;
    return s;
  }
  s.version = STATE_VERSION;
  s.teams = Array.isArray(s.teams) ? s.teams : [];
  s.people = Array.isArray(s.people) ? s.people : [];
  s.fileFolders = Array.isArray(s.fileFolders) ? s.fileFolders : [];
  s.notes = Array.isArray(s.notes) ? s.notes : [];
  s.kb = Array.isArray(s.kb) ? s.kb : [];
  s.settings = Object.assign({ theme: 'dark', aiKey: '', aiModel: 'deepseek-chat', aiBaseUrl: 'https://api.deepseek.com', nativeOpen: true }, s.settings || {});
  s.ui = Object.assign({ filterType: 'all', folderId: null, search: '', status: 'all', priority: 'all', sort: 'priority', sortDir: 'desc', team: 'all', assignee: 'all' }, s.ui || {});
  s.tasks.forEach(t => {
    if (t.teamId === undefined) t.teamId = null;
    if (t.assigneeId === undefined) t.assigneeId = null;
    if (!t.updatedAt) t.updatedAt = t.createdAt || Date.now();
    t.subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
    t.tags = Array.isArray(t.tags) ? t.tags : [];
    t.links = Array.isArray(t.links) ? t.links.map(l => Object.assign({ kind: 'manual' }, l)) : [];
    if (!t.desc) t.desc = '';
  });
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.folders)) {
        // Резервная копия предыдущей версии — защита от потерь при обновлении
        const oldVersion = parsed.version || 1;
        if (oldVersion < STATE_VERSION) {
          try { localStorage.setItem('taskflow.backup.v' + oldVersion, raw); } catch (_) { /* ignore */ }
        }
        return migrate(parsed);
      }
    }
  } catch (e) { console.warn('Не удалось загрузить данные', e); }
  return seedState();
}

let state = load();

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('Не удалось сохранить', e); }
}

/* ---------------- Папки ---------------- */

function getFolder(id) { return state.folders.find(f => f.id === id); }

function folderChildren(parentId) {
  return state.folders
    .filter(f => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function folderAndDescendants(id) {
  const out = [id];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const f of state.folders) {
      if (f.parentId === cur) { out.push(f.id); stack.push(f.id); }
    }
  }
  return out;
}

function folderTaskCount(folderId) {
  const ids = folderAndDescendants(folderId);
  return state.tasks.filter(t => ids.includes(t.folderId)).length;
}

function folderOpenCount(folderId) {
  const ids = folderAndDescendants(folderId);
  return state.tasks.filter(t => ids.includes(t.folderId) && t.status !== 'done').length;
}

function isDescendant(folderId, possibleParentId) {
  let cur = getFolder(folderId);
  while (cur) {
    if (cur.parentId === possibleParentId) return true;
    cur = getFolder(cur.parentId);
  }
  return false;
}

/* ---------------- Задачи ---------------- */

function getTask(id) { return state.tasks.find(t => t.id === id); }

function getTeam(id) { return state.teams.find(x => x.id === id); }
function getPerson(id) { return state.people.find(x => x.id === id); }
function personName(id) { return getPerson(id)?.name || ''; }

function isOverdue(t) {
  return t.status !== 'done' && t.dueDate && t.dueDate < todayStr();
}

function getFilteredTasks() {
  const ui = state.ui;
  let tasks = state.tasks.slice();

  const q = (ui.search || '').trim().toLowerCase();
  if (q) {
    tasks = tasks.filter(t => {
      const fName = getFolder(t.folderId)?.name || '';
      const hay = [t.title, t.desc, t.tags.join(' '), fName, personName(t.assigneeId), getTeam(t.teamId)?.name || ''].join('\n').toLowerCase();
      return hay.includes(q);
    });
  }

  switch (ui.filterType) {
    case 'inbox':    tasks = tasks.filter(t => t.folderId === 'inbox'); break;
    case 'today':    tasks = tasks.filter(t => t.status !== 'done' && (t.dueDate === todayStr() || isOverdue(t))); break;
    case 'progress': tasks = tasks.filter(t => t.status === 'progress'); break;
    case 'done':     tasks = tasks.filter(t => t.status === 'done'); break;
    case 'folder': {
      const ids = folderAndDescendants(ui.folderId);
      tasks = tasks.filter(t => ids.includes(t.folderId));
      break;
    }
    default: break; // all
  }

  if (ui.status !== 'all') tasks = tasks.filter(t => t.status === ui.status);
  if (ui.priority !== 'all') tasks = tasks.filter(t => t.priority === ui.priority);
  if (ui.team && ui.team !== 'all') tasks = tasks.filter(t => t.teamId === ui.team);
  if (ui.assignee && ui.assignee !== 'all') tasks = tasks.filter(t => t.assigneeId === ui.assignee);

  applySort(tasks);
  return tasks;
}

/* Гибкая сортировка с направлением */
function applySort(tasks) {
  const key = state.ui.sort || 'priority';
  const dir = state.ui.sortDir || SORT_DEFAULT_DIR[key] || 'asc';

  const prioCmp = (a, b) => (PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority])
    || (isOverdue(b) - isOverdue(a))
    || ((a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    || ((b.createdAt || 0) - (a.createdAt || 0));
  const titleCmp = (a, b) => a.title.localeCompare(b.title, 'ru');
  const folderName = (t) => getFolder(t.folderId)?.name || '';
  const teamName = (t) => getTeam(t.teamId)?.name || '';
  const assignee = (t) => personName(t.assigneeId);
  const statusOrder = { todo: 0, progress: 1, done: 2 };

  let cmp;
  switch (key) {
    case 'due':
      cmp = (a, b) => ((a.dueDate || '9999').localeCompare(b.dueDate || '9999')) || prioCmp(a, b);
      break;
    case 'created':
      cmp = (a, b) => ((a.createdAt || 0) - (b.createdAt || 0)) || prioCmp(a, b);
      break;
    case 'updated':
      cmp = (a, b) => (((a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0))) || prioCmp(a, b);
      break;
    case 'title':
      cmp = (a, b) => titleCmp(a, b) || prioCmp(a, b);
      break;
    case 'folder':
      cmp = (a, b) => folderName(a).localeCompare(folderName(b), 'ru') || titleCmp(a, b);
      break;
    case 'assignee':
      cmp = (a, b) => assignee(a).localeCompare(assignee(b), 'ru') || prioCmp(a, b);
      break;
    case 'team':
      cmp = (a, b) => teamName(a).localeCompare(teamName(b), 'ru') || assignee(a).localeCompare(assignee(b), 'ru') || prioCmp(a, b);
      break;
    case 'status':
      cmp = (a, b) => (statusOrder[a.status] - statusOrder[b.status]) || prioCmp(a, b);
      break;
    default: // priority: «по возрастанию» = низкий приоритет первый,
      // направление по умолчанию desc даёт привычный порядок (высокий приоритет сверху)
      cmp = (a, b) => (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
        || (isOverdue(a) - isOverdue(b))
        || ((a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
        || ((a.createdAt || 0) - (b.createdAt || 0));
  }

  tasks.sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a, b));
}

/* ---------------- Рендер: сайдбар ---------------- */

const els = {
  folderTree: document.getElementById('folderTree'),
  taskList: document.getElementById('taskList'),
  emptyState: document.getElementById('emptyState'),
  viewTitle: document.getElementById('viewTitle'),
  listCount: document.getElementById('listCount'),
  statsMini: document.getElementById('statsMini'),
  searchInput: document.getElementById('searchInput'),
  filterChips: document.getElementById('filterChips'),
  priorityFilter: document.getElementById('priorityFilter'),
  teamFilter: document.getElementById('teamFilter'),
  assigneeFilter: document.getElementById('assigneeFilter'),
  sortSelect: document.getElementById('sortSelect'),
  sortDirBtn: document.getElementById('sortDirBtn'),
  viewsNav: document.getElementById('viewsNav'),
};

function renderFolderTree() {
  const rows = [];
  const walk = (parentId, depth) => {
    for (const f of folderChildren(parentId)) {
      rows.push([f, depth]);
      if (!f.collapsed) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);

  els.folderTree.innerHTML = rows.map(([f, depth]) => {
    const hasKids = folderChildren(f.id).length > 0;
    const active = state.ui.filterType === 'folder' && state.ui.folderId === f.id;
    const open = folderOpenCount(f.id);
    return `
      <div class="folder-row ${active ? 'active' : ''}" data-fid="${f.id}" style="padding-left:${8 + depth * 16}px">
        <button class="folder-toggle" data-toggle-folder="${f.id}" title="Свернуть/развернуть">${hasKids ? (f.collapsed ? '▶' : '▼') : ''}</button>
        <span class="folder-dot" style="background:${f.color}"></span>
        <span class="folder-name" title="${esc(f.name)}">${esc(f.name)}</span>
        <span class="folder-count">${open}</span>
        <span class="folder-actions">
          <button class="icon-btn" data-add-child="${f.id}" title="Подпапка">➕</button>
          <button class="icon-btn" data-edit-folder="${f.id}" title="Переименовать">✏️</button>
          ${f.system ? '' : `<button class="icon-btn" data-del-folder="${f.id}" title="Удалить">🗑️</button>`}
        </span>
      </div>`;
  }).join('');
}

function renderViewCounts() {
  const counts = {
    inbox: state.tasks.filter(t => t.folderId === 'inbox' && t.status !== 'done').length,
    today: state.tasks.filter(t => t.status !== 'done' && (t.dueDate === todayStr() || isOverdue(t))).length,
    progress: state.tasks.filter(t => t.status === 'progress').length,
    all: state.tasks.filter(t => t.status !== 'done').length,
    done: state.tasks.filter(t => t.status === 'done').length,
  };
  document.querySelectorAll('.view-count').forEach(el => {
    const key = el.dataset.count;
    const n = counts[key] || 0;
    el.textContent = n;
    el.classList.toggle('hidden', n === 0 && key !== 'done');
  });
}

function renderStatsMini() {
  const todo = state.tasks.filter(t => t.status === 'todo').length;
  const progress = state.tasks.filter(t => t.status === 'progress').length;
  const done = state.tasks.filter(t => t.status === 'done').length;
  const overdue = state.tasks.filter(isOverdue).length;
  els.statsMini.innerHTML = `
    <div class="stat-mini todo"><span class="num">${todo}</span><span class="lbl">К выполнению</span></div>
    <div class="stat-mini progress"><span class="num">${progress}</span><span class="lbl">В работе</span></div>
    <div class="stat-mini done"><span class="num">${done}</span><span class="lbl">Выполнено</span></div>
    <div class="stat-mini overdue"><span class="num">${overdue}</span><span class="lbl">Просрочено</span></div>`;
}

/* ---------------- Рендер: список задач ---------------- */

function linkChipHtml(l) {
  const name = l.name || l.url || 'ссылка';
  if (l.kind === 'library') {
    return `<a class="link-chip lib" href="javascript:void(0)" data-open-lib="${esc(l.fileId || '')}"
      title="Открыть файл из библиотеки: ${esc(name)}">📎 ${esc(name)}</a>`;
  }
  const folder = isFolderLink(l);
  const href = linkHref(l);
  if (href) {
    return `<a class="link-chip ${folder ? 'folder' : ''}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"
      title="${folder ? 'Открыть папку в Проводнике' : 'Открыть в приложении'}: ${esc(l.url || name)}">${folder ? '📁' : '🔗'} ${esc(name)}</a>`;
  }
  return `<span class="link-chip dead" title="Ссылка без адреса">🔗 ${esc(name)}</span>`;
}

function taskItemHtml(t) {
  const folder = getFolder(t.folderId);
  const pr = PRIORITIES[t.priority];
  const overdue = isOverdue(t);
  const done = t.status === 'done';
  const progress = t.status === 'progress';

  const subDone = t.subtasks.filter(s => s.done).length;
  const subTotal = t.subtasks.length;
  const subPct = subTotal ? Math.round((subDone / subTotal) * 100) : 0;

  const badges = [];
  badges.push(`<span class="badge badge-p-${t.priority}" title="Приоритет: ${pr.label}">${pr.mark} ${pr.label}</span>`);
  if (progress) badges.push(`<span class="badge badge-status">▶ В работе</span>`);
  if (t.dueDate) {
    const cls = overdue ? 'overdue' : '';
    const lbl = overdue ? 'просрочено' : (t.dueDate === todayStr() && !done ? 'сегодня' : '');
    badges.push(`<span class="badge badge-due ${cls}" title="Срок">📅 ${fmtDate(t.dueDate)}${lbl ? ' · ' + lbl : ''}</span>`);
  }

  const meta = [];
  if (folder) meta.push(`<span class="folder-tag"><span style="width:8px;height:8px;border-radius:50%;background:${folder.color};display:inline-block"></span>${esc(folder.name)}</span>`);
  const person = getPerson(t.assigneeId);
  if (person) {
    const team = getTeam(person.teamId);
    meta.push(`<span class="assignee-tag" title="Ответственный: ${esc(person.name)}${team ? ' · ' + esc(team.name) : ''}">👤 ${esc(person.name)}</span>`);
  } else if (t.teamId) {
    const team = getTeam(t.teamId);
    if (team) meta.push(`<span class="team-tag" title="Команда">👥 ${esc(team.name)}</span>`);
  }
  if (t.links.length) meta.push(...t.links.map(linkChipHtml));
  if (t.tags.length) meta.push(t.tags.map(x => `<span class="tag">#${esc(x)}</span>`).join(' '));

  const descPreview = shortDesc(t.desc);

  return `
    <div class="task-item ${done ? 'done' : ''}" data-task-id="${t.id}">
      <button class="task-check ${done ? 'done' : ''}" data-toggle-done="${t.id}" title="${done ? 'Вернуть в работу' : 'Отметить выполненной'}">✓</button>
      <div class="task-body">
        <div class="task-title-row">
          <span class="task-title">${esc(t.title)}</span>
          ${badges.join('')}
        </div>
        ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
        ${descPreview ? `<div class="task-desc-preview">${esc(descPreview)}</div>` : ''}
        ${subTotal ? `
          <div class="subtask-progress">
            <span>☑ ${subDone}/${subTotal}</span>
            <span class="progress-track"><span class="progress-fill" style="width:${subPct}%"></span></span>
          </div>` : ''}
      </div>
      <div class="task-actions">
        ${t.status === 'todo' ? `<button class="task-start" data-start-task="${t.id}" title="Начать работу">▶</button>` : ''}
      </div>
    </div>`;
}

function renderTasks() {
  const list = getFilteredTasks();
  els.taskList.innerHTML = list.map(taskItemHtml).join('');
  els.emptyState.classList.toggle('hidden', list.length > 0);
  els.listCount.textContent = list.length ? `${list.length} ${plural(list.length)}` : '';
  updateViewTitle();
}

function plural(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'задача';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'задачи';
  return 'задач';
}

const VIEW_TITLES = {
  inbox: 'Входящие',
  today: 'Сегодня',
  progress: 'В работе',
  done: 'Выполненные',
  all: 'Все задачи',
  folder: 'Проект',
};

function updateViewTitle() {
  if (state.ui.filterType === 'folder') {
    const f = getFolder(state.ui.folderId);
    els.viewTitle.textContent = f ? f.name : 'Проект';
  } else {
    els.viewTitle.textContent = VIEW_TITLES[state.ui.filterType] || 'Все задачи';
  }
}

function renderAll() {
  renderFolderTree();
  renderTasks();
  renderViewCounts();
  renderStatsMini();
  fillPeopleFilters();
  syncControls();
}

// Заполнение выпадающих списков фильтров по командам и ответственным
function fillPeopleFilters() {
  const keepTeam = els.teamFilter.value;
  const keepAssignee = els.assigneeFilter.value;
  els.teamFilter.innerHTML = '<option value="all">Все команды</option>' +
    state.teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  els.assigneeFilter.innerHTML = '<option value="all">Все ответственные</option>' +
    state.people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (state.teams.some(t => t.id === keepTeam)) els.teamFilter.value = keepTeam;
  if (state.people.some(p => p.id === keepAssignee)) els.assigneeFilter.value = keepAssignee;
  els.teamFilter.classList.toggle('hidden', !state.teams.length);
  els.assigneeFilter.classList.toggle('hidden', !state.people.length);
}

function syncControls() {
  const ui = state.ui;
  els.searchInput.value = ui.search || '';
  els.priorityFilter.value = ui.priority || 'all';
  els.teamFilter.value = ui.team || 'all';
  els.assigneeFilter.value = ui.assignee || 'all';
  els.sortSelect.value = ui.sort || 'priority';
  els.sortDirBtn.textContent = (ui.sortDir || SORT_DEFAULT_DIR[ui.sort] || 'asc') === 'desc' ? '⬇️' : '⬆️';
  els.filterChips.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.status === (ui.status || 'all'));
  });
  els.viewsNav.querySelectorAll('.view-item').forEach(v => {
    v.classList.toggle('active', v.dataset.view === ui.filterType);
  });
}

/* ---------------- Модальные окна ---------------- */

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function bindModalClosing() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) ov.classList.add('hidden'); });
  });
}

/* ---------- Окно задачи ---------- */

let editingId = null;
let subtaskDraft = [];
let linkDraft = [];

function folderOptionsHtml(selectedId, excludeId) {
  const rows = [];
  const walk = (parentId, depth) => {
    for (const f of folderChildren(parentId)) {
      if (f.id === excludeId) continue;
      rows.push(`<option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${'— '.repeat(depth)}${esc(f.name)}</option>`);
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows.join('');
}

// Опции выбора РОДИТЕЛЬСКОЙ папки: без «Входящих», с пунктом «(корень)»
function parentFolderOptionsHtml(selectedParentId, excludeId) {
  const rows = [];
  const walk = (parentId, depth) => {
    for (const f of folderChildren(parentId)) {
      if (f.id === excludeId || f.system) continue;
      rows.push(`<option value="${f.id}" ${f.id === selectedParentId ? 'selected' : ''}>${'— '.repeat(depth)}${esc(f.name)}</option>`);
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return `<option value="" ${!selectedParentId ? 'selected' : ''}>(корневая папка)</option>` + rows.join('');
}

function teamOptionsHtml(selectedId) {
  return `<option value="">—</option>` +
    state.teams.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
}

function assigneeOptionsHtml(selectedId) {
  const rows = ['<option value="">—</option>'];
  state.teams.forEach(team => {
    const list = state.people.filter(p => p.teamId === team.id);
    if (list.length) {
      rows.push(`<optgroup label="${esc(team.name)}">` +
        list.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)}</option>`).join('') +
        '</optgroup>');
    }
  });
  const solo = state.people.filter(p => !p.teamId);
  if (solo.length) {
    rows.push('<optgroup label="Без команды">' +
      solo.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)}</option>`).join('') +
      '</optgroup>');
  }
  return rows.join('');
}

function openTaskModal(id) {
  editingId = id || null;
  const t = id ? getTask(id) : null;
  document.getElementById('taskModalTitle').textContent = t ? 'Редактирование задачи' : 'Новая задача';
  document.getElementById('btnDeleteTask').classList.toggle('hidden', !t);

  document.getElementById('fTitle').value = t ? t.title : '';
  document.getElementById('fDesc').value = t ? t.desc : '';
  document.getElementById('fStatus').value = t ? t.status : 'todo';
  document.getElementById('fDueDate').value = t && t.dueDate ? t.dueDate : '';
  document.getElementById('fTags').value = t ? t.tags.join(', ') : '';

  const defaultFolder = t
    ? t.folderId
    : (state.ui.filterType === 'folder' ? state.ui.folderId : (state.ui.filterType === 'inbox' ? 'inbox' : 'inbox'));
  document.getElementById('fFolder').innerHTML = folderOptionsHtml(defaultFolder);

  document.getElementById('fTeam').innerHTML = teamOptionsHtml(t ? t.teamId : null);
  document.getElementById('fAssignee').innerHTML = assigneeOptionsHtml(t ? t.assigneeId : null);

  setPriorityActive(t ? t.priority : 'medium');

  subtaskDraft = t ? t.subtasks.map(s => ({ ...s })) : [];
  linkDraft = t ? t.links.map(l => ({ ...l })) : [];
  renderSubtaskDraft();
  renderLinkDraft();

  openModal('taskModal');
  setTimeout(() => document.getElementById('fTitle').focus(), 50);
}

function setPriorityActive(p) {
  document.querySelectorAll('#fPriority button').forEach(b => {
    b.classList.toggle('active', b.dataset.val === p);
  });
}

function renderSubtaskDraft() {
  const box = document.getElementById('subtaskList');
  if (!subtaskDraft.length) {
    box.innerHTML = '<p class="muted" style="font-size:12px">Нет подзадач</p>';
    return;
  }
  box.innerHTML = subtaskDraft.map((s, i) => `
    <div class="subtask-row" data-idx="${i}">
      <input type="checkbox" ${s.done ? 'checked' : ''} data-subtask-done="${i}" title="Выполнена">
      <input type="text" value="${esc(s.title)}" placeholder="Подзадача…" data-subtask-text="${i}" class="${s.done ? 'done-text' : ''}">
      <button class="icon-btn" data-subtask-del="${i}" title="Удалить">✕</button>
    </div>`).join('');
}

function linkKind(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return 'url';
  if (/^[a-zA-Z]:[\\/]/.test(u) || u.includes('\\') || u.startsWith('files/') || u.startsWith('./') || u.startsWith('../')) return 'file';
  return 'url';
}

/* Является ли ссылка папкой/директорией */
function isFolderLink(l) {
  if (!l) return false;
  if (l.isFolder) return true;
  const u = (l.url || '').trim();
  if (!u || /^https?:/i.test(u)) return false;
  if (/[\\/]$/.test(u)) return true;
  const seg = u.split(/[\\/]/).pop();
  return !seg.includes('.'); // нет расширения — считаем папкой
}

/* Приводит file:///C:/x или относительный путь к виду C:\x */
function normalizeLocalPath(p) {
  let s = p;
  if (s.startsWith('file:///')) s = s.slice(8);
  else if (s.startsWith('file://')) s = s.slice(7);
  try { s = decodeURIComponent(s); } catch (_) { /* ignore */ }
  return s.replace(/\//g, '\\');
}

/* Преобразование ссылки в href для открытия.
   При включённой интеграции Windows файлы открываются в родных
   приложениях (taskflow-open:), папки — в Проводнике (taskflow-folder:). */
function linkHref(l) {
  const u = (l && l.url ? l.url : '').trim();
  if (!u) return null;
  if (/^javascript:/i.test(u)) return null; // не пропускаем опасные схемы
  if (/^https?:\/\//i.test(u)) return u;

  const folder = isFolderLink(l);
  const native = state.settings.nativeOpen !== false;

  if (native) {
    let p = u;
    if (/^[a-zA-Z]:[\\/]/.test(u) || u.startsWith('\\\\')) {
      p = u; // абсолютный Windows-путь
    } else if (u.startsWith('file://')) {
      p = normalizeLocalPath(u);
    } else {
      // Относительный путь — разрешаем относительно index.html
      try {
        if (window.location.protocol === 'file:') {
          p = normalizeLocalPath(new URL(u, window.location.href).href);
        }
      } catch (_) { /* ignore */ }
    }
    return (folder ? 'taskflow-folder:' : 'taskflow-open:') + encodeURIComponent(p);
  }

  // Запасной режим без интеграции
  if (u.startsWith('file://')) return u;
  if (/^[a-zA-Z]:[\\/]/.test(u)) return 'file:///' + u.replace(/\\/g, '/');
  if (u.startsWith('\\\\')) return 'file:' + u.replace(/\\/g, '/');
  return u;
}

/* Можно ли показать файл во встроенном просмотрщике браузера */
function previewableType(name, type) {
  const PREVIEW_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
    'txt', 'csv', 'json', 'md', 'log', 'xml', 'html', 'htm', 'js', 'css', 'las', 'wav', 'mp3'];
  if (/^(image|text|audio)\//.test(type || '')) return true;
  if ((type || '').includes('pdf')) return true;
  const ext = (name || '').split('.').pop().toLowerCase();
  return PREVIEW_EXTS.includes(ext);
}

/* Открытие файла из библиотеки в новой вкладке.
   Просматриваемые форматы открываются во встроенном просмотрщике,
   остальные предлагаются к скачиванию (браузер не умеет их показывать). */
async function openLibraryFile(fileId) {
  if (!fileId) { toast('Файл недоступен', 'error'); return; }
  let rec = null;
  try { rec = await FileStore.get(fileId); } catch (_) { /* ignore */ }
  if (!rec || !rec.blob) { toast('Файл не найден в библиотеке', 'error'); return; }

  if (!previewableType(rec.name, rec.type)) {
    if (confirm(`Браузер не умеет показывать файл «${rec.name}».\n\nЧтобы он открывался в Word/Excel и других приложениях, добавьте его как ссылку на файл с диска (нужна интеграция Windows — ⚙️ Система).\n\nСкачать файл сейчас?`)) {
      downloadBlob(rec.name, rec.blob);
    }
    return;
  }

  const url = URL.createObjectURL(rec.blob);
  const w = window.open('', '_blank');
  if (!w) {
    downloadBlob(rec.name, rec.blob);
    URL.revokeObjectURL(url);
    return;
  }
  w.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function renderLinkDraft() {
  const box = document.getElementById('linkList');
  if (!linkDraft.length) {
    box.innerHTML = '<p class="muted" style="font-size:12px">Нет ссылок</p>';
    return;
  }
  box.innerHTML = linkDraft.map((l, i) => {
    if (l.kind === 'library') {
      return `
      <div class="link-row" data-idx="${i}">
        <span class="link-kind lib" title="Файл из встроенной библиотеки">🗂 файл</span>
        <a class="lib-name" href="javascript:void(0)" data-lib-open="${i}" title="Открыть файл">${esc(l.name)}</a>
        <button class="icon-btn" data-lib-open="${i}" title="Открыть файл">↗️</button>
        <button class="icon-btn" data-lib-download="${i}" title="Скачать файл">⬇️</button>
        <button class="icon-btn" data-link-del="${i}" title="Удалить">✕</button>
      </div>`;
    }
    const kind = linkKind(l.url);
    const folder = isFolderLink(l);
    const href = linkHref(l);
    return `
    <div class="link-row" data-idx="${i}">
      <input type="text" class="link-name" placeholder="Название" value="${esc(l.name)}" data-link-name="${i}">
      <input type="text" class="link-url" placeholder="URL или путь к файлу/папке" value="${esc(l.url)}" data-link-url="${i}">
      ${folder ? '<span class="link-kind folder" title="Папка откроется в Проводнике">📁 папка</span>'
        : (kind ? `<span class="link-kind ${kind === 'file' ? 'file' : 'url'}">${kind === 'file' ? '📄 файл' : '🔗 url'}</span>` : '')}
      ${href ? `<a class="link-open-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${folder ? 'Открыть папку в Проводнике' : 'Открыть ссылку'}">↗️</a>` : ''}
      <button class="icon-btn" data-link-del="${i}" title="Удалить">✕</button>
    </div>`;
  }).join('');
}

function saveTask() {
  const title = document.getElementById('fTitle').value.trim();
  if (!title) { toast('Введите название задачи', 'error'); return; }

  const payload = {
    title,
    desc: document.getElementById('fDesc').value.trim(),
    folderId: document.getElementById('fFolder').value || 'inbox',
    status: document.getElementById('fStatus').value,
    priority: document.querySelector('#fPriority button.active')?.dataset.val || 'medium',
    dueDate: document.getElementById('fDueDate').value || null,
    tags: document.getElementById('fTags').value.split(',').map(x => x.trim()).filter(Boolean),
    teamId: document.getElementById('fTeam').value || null,
    assigneeId: document.getElementById('fAssignee').value || null,
    subtasks: subtaskDraft.filter(s => s.title.trim()),
    links: linkDraft.filter(l => l.kind === 'library' ? true : (l.name.trim() || l.url.trim())),
  };

  if (editingId) {
    const t = getTask(editingId);
    Object.assign(t, payload, { updatedAt: Date.now() });
    t.completedAt = (payload.status === 'done') ? (t.completedAt || Date.now()) : null;
    toast('Задача обновлена', 'success');
  } else {
    state.tasks.push({
      id: uid(), ...payload,
      createdAt: Date.now(), completedAt: payload.status === 'done' ? Date.now() : null,
    });
    toast('Задача создана', 'success');
  }
  save();
  closeModal('taskModal');
  renderAll();
}

function deleteTask() {
  if (!editingId) return;
  const t = getTask(editingId);
  if (!confirm(`Удалить задачу «${t.title}»?`)) return;
  state.tasks = state.tasks.filter(x => x.id !== editingId);
  save();
  closeModal('taskModal');
  renderAll();
  toast('Задача удалена');
}

/* ---------- Окно папки ---------- */

let editingFolderId = null;
let folderColorDraft = FOLDER_COLORS[0];

function openNewFolder(parentId) {
  editingFolderId = null;
  folderColorDraft = FOLDER_COLORS[Math.floor(Math.random() * (FOLDER_COLORS.length - 1))];
  document.getElementById('folderModalTitle').textContent = parentId ? 'Новая подпапка' : 'Новая папка';
  document.getElementById('fFolderName').value = '';
  document.getElementById('fFolderParent').innerHTML = parentFolderOptionsHtml(parentId || null);
  document.getElementById('btnDeleteFolder').classList.add('hidden');
  renderSwatches();
  openModal('folderModal');
  setTimeout(() => document.getElementById('fFolderName').focus(), 50);
}

function openEditFolder(id) {
  const f = getFolder(id);
  if (!f) return;
  editingFolderId = id;
  folderColorDraft = f.color || FOLDER_COLORS[0];
  document.getElementById('folderModalTitle').textContent = 'Настройки папки';
  document.getElementById('fFolderName').value = f.name;
  document.getElementById('fFolderParent').innerHTML = parentFolderOptionsHtml(f.parentId, f.id);
  document.getElementById('btnDeleteFolder').classList.toggle('hidden', !!f.system);
  renderSwatches();
  openModal('folderModal');
}

function renderSwatches() {
  document.getElementById('fFolderColor').innerHTML = FOLDER_COLORS.map(c =>
    `<span class="swatch ${c === folderColorDraft ? 'active' : ''}" data-color="${c}" style="background:${c}"></span>`
  ).join('');
}

function saveFolder() {
  const name = document.getElementById('fFolderName').value.trim();
  if (!name) { toast('Введите название папки', 'error'); return; }
  let parentId = document.getElementById('fFolderParent').value || null;
  if (parentId === 'inbox') parentId = null; // Входящие не может быть родителем

  if (editingFolderId) {
    const f = getFolder(editingFolderId);
    if (parentId && (parentId === f.id || isDescendant(parentId, f.id))) {
      toast('Папку нельзя вложить в саму себя', 'error');
      return;
    }
    f.name = name;
    f.parentId = parentId;
    f.color = folderColorDraft;
    toast('Папка обновлена', 'success');
  } else {
    state.folders.push({
      id: uid(), name, parentId, color: folderColorDraft, collapsed: false,
    });
    toast('Папка создана', 'success');
  }
  save();
  closeModal('folderModal');
  renderAll();
}

function deleteFolder() {
  const f = getFolder(editingFolderId);
  if (!f) return;
  const ids = folderAndDescendants(f.id);
  const taskCount = state.tasks.filter(t => ids.includes(t.folderId)).length;
  const msg = taskCount
    ? `Удалить папку «${f.name}» вместе с подпапками? ${taskCount} ${plural(taskCount)} будут перенесены во «Входящие».`
    : `Удалить папку «${f.name}»?`;
  if (!confirm(msg)) return;

  state.tasks.forEach(t => { if (ids.includes(t.folderId)) t.folderId = 'inbox'; });
  state.folders = state.folders.filter(x => !ids.includes(x.id));
  if (state.ui.filterType === 'folder' && ids.includes(state.ui.folderId)) {
    state.ui.filterType = 'all';
    state.ui.folderId = null;
  }
  save();
  closeModal('folderModal');
  renderAll();
  toast('Папка удалена');
}

/* ---------------- Журнал и заметки ---------------- */

let editingNoteId = null;
let journalAiText = '';

function renderJournalList() {
  const box = document.getElementById('journalList');
  const q = (document.getElementById('journalSearch').value || '').trim().toLowerCase();
  let list = state.notes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (q) list = list.filter(n => (n.title + '\n' + n.text + '\n' + (n.tags || []).join(' ')).toLowerCase().includes(q));

  if (!list.length) {
    box.innerHTML = '<p class="muted" style="font-size:12px;padding:10px">' + (q ? 'Ничего не найдено' : 'Заметок пока нет — создайте первую') + '</p>';
    return;
  }
  box.innerHTML = list.map(n => `
    <div class="note-item" data-note-id="${n.id}">
      <div class="note-title">${esc(n.title || 'Без названия')}</div>
      <div class="note-snippet">${esc(shortDesc(n.text) || '—')}</div>
      <div class="note-meta">${n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('ru-RU') : ''}${(n.tags || []).length ? ' · ' + n.tags.map(t => '#' + esc(t)).join(' ') : ''}</div>
    </div>`).join('');
}

function showJournalEditor(show) {
  document.getElementById('journalEditor').classList.toggle('hidden', !show);
  document.getElementById('journalListCol').classList.toggle('hidden', show);
}

function openNoteEditor(id) {
  editingNoteId = id || null;
  const n = id ? state.notes.find(x => x.id === id) : null;
  document.getElementById('jTitle').value = n ? n.title : '';
  document.getElementById('jText').value = n ? n.text : '';
  document.getElementById('jTags').value = n ? (n.tags || []).join(', ') : '';
  document.getElementById('btnDeleteNote').classList.toggle('hidden', !n);
  document.getElementById('journalAiOut').classList.add('hidden');
  document.getElementById('journalAiOut').textContent = '';
  showJournalEditor(true);
}

function saveNote() {
  const text = document.getElementById('jText').value.trim();
  const title = document.getElementById('jTitle').value.trim();
  if (!text && !title) { toast('Введите текст заметки', 'error'); return; }
  const tags = document.getElementById('jTags').value.split(',').map(x => x.trim()).filter(Boolean);
  if (editingNoteId) {
    const n = state.notes.find(x => x.id === editingNoteId);
    Object.assign(n, { title: title || shortDesc(text), text, tags, updatedAt: Date.now() });
    toast('Заметка обновлена', 'success');
  } else {
    state.notes.push({ id: uid(), title: title || shortDesc(text), text, tags, createdAt: Date.now(), updatedAt: Date.now() });
    toast('Заметка создана', 'success');
  }
  save();
  renderJournalList();
  showJournalEditor(false);
}

function deleteNote() {
  if (!editingNoteId) return;
  if (!confirm('Удалить заметку?')) return;
  state.notes = state.notes.filter(x => x.id !== editingNoteId);
  save();
  renderJournalList();
  showJournalEditor(false);
  toast('Заметка удалена');
}

/* ---------------- База знаний ---------------- */

let editingKbId = null;
let kbAiText = '';

function renderKbList() {
  const box = document.getElementById('kbList');
  const q = (document.getElementById('kbSearch').value || '').trim().toLowerCase();
  let list = state.kb.slice().sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  if (q) {
    list = list.filter(a =>
      (a.title + '\n' + a.content + '\n' + (a.tags || []).join(' ')).toLowerCase().includes(q));
  }
  // Подсветка совпадений
  const hl = (s) => {
    if (!q) return esc(s);
    const i = s.toLowerCase().indexOf(q);
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
  };

  if (!list.length) {
    box.innerHTML = '<p class="muted" style="font-size:12px;padding:10px">' + (q ? 'Ничего не найдено' : 'База знаний пуста — добавьте первую статью') + '</p>';
    return;
  }
  box.innerHTML = list.map(a => `
    <div class="note-item" data-kb-id="${a.id}">
      <div class="note-title">${hl(a.title)}</div>
      <div class="note-snippet">${hl(shortDesc(a.content) || '—')}</div>
      <div class="note-meta">${(a.tags || []).length ? a.tags.map(t => '#' + esc(t)).join(' ') : ''}</div>
    </div>`).join('');
}

function showKbEditor(show) {
  document.getElementById('kbEditor').classList.toggle('hidden', !show);
  document.getElementById('kbListCol').classList.toggle('hidden', show);
}

function openKbEditor(id) {
  editingKbId = id || null;
  const a = id ? state.kb.find(x => x.id === id) : null;
  document.getElementById('kTitle').value = a ? a.title : '';
  document.getElementById('kContent').value = a ? a.content : '';
  document.getElementById('kTags').value = a ? (a.tags || []).join(', ') : '';
  document.getElementById('btnDeleteKb').classList.toggle('hidden', !a);
  document.getElementById('kbAiOut').classList.add('hidden');
  document.getElementById('kbAiOut').textContent = '';
  showKbEditor(true);
}

function saveKb() {
  const title = document.getElementById('kTitle').value.trim();
  const content = document.getElementById('kContent').value.trim();
  if (!title) { toast('Введите название статьи', 'error'); return; }
  if (!content) { toast('Введите содержимое статьи', 'error'); return; }
  const tags = document.getElementById('kTags').value.split(',').map(x => x.trim()).filter(Boolean);
  if (editingKbId) {
    const a = state.kb.find(x => x.id === editingKbId);
    Object.assign(a, { title, content, tags, updatedAt: Date.now() });
    toast('Статья обновлена', 'success');
  } else {
    state.kb.push({ id: uid(), title, content, tags, createdAt: Date.now(), updatedAt: Date.now() });
    toast('Статья добавлена в базу знаний', 'success');
  }
  save();
  renderKbList();
  showKbEditor(false);
}

function deleteKb() {
  if (!editingKbId) return;
  if (!confirm('Удалить статью из базы знаний?')) return;
  state.kb = state.kb.filter(x => x.id !== editingKbId);
  save();
  renderKbList();
  showKbEditor(false);
  toast('Статья удалена');
}

/* ---------------- Команда и ответственные ---------------- */

function renderTeamManager() {
  const teamBox = document.getElementById('teamList');
  const personBox = document.getElementById('personList');

  teamBox.innerHTML = state.teams.length
    ? state.teams.map(t => `
      <div class="team-edit-row">
        <input type="text" value="${esc(t.name)}" placeholder="Название команды" data-team-name="${t.id}">
        <button class="icon-btn" data-team-del="${t.id}" title="Удалить команду">🗑️</button>
      </div>`).join('')
    : '<p class="muted" style="font-size:12px">Пока нет команд</p>';

  personBox.innerHTML = state.people.length
    ? state.people.map(p => `
      <div class="team-edit-row">
        <input type="text" value="${esc(p.name)}" placeholder="Имя сотрудника" data-person-name="${p.id}">
        <select data-person-team="${p.id}">${teamOptionsHtml(p.teamId)}</select>
        <button class="icon-btn" data-person-del="${p.id}" title="Удалить сотрудника">🗑️</button>
      </div>`).join('')
    : '<p class="muted" style="font-size:12px">Пока нет сотрудников</p>';
}

function bindTeamManagerEvents() {
  document.getElementById('btnAddTeam').addEventListener('click', () => {
    state.teams.push({ id: uid(), name: 'Новая команда' });
    save();
    renderTeamManager();
    renderAll();
  });

  // При закрытии окна команды обновляем селекты в открытом окне задачи
  document.querySelectorAll('#teamModal [data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (document.getElementById('taskModal').classList.contains('hidden')) return;
      const fTeam = document.getElementById('fTeam');
      const fAssignee = document.getElementById('fAssignee');
      const oldTeam = fTeam.value;
      const oldAssignee = fAssignee.value;
      fTeam.innerHTML = teamOptionsHtml(oldTeam || null);
      fAssignee.innerHTML = assigneeOptionsHtml(oldAssignee || null);
    });
  });

  document.getElementById('btnAddPerson').addEventListener('click', () => {
    state.people.push({ id: uid(), name: '', teamId: state.teams[0]?.id || null });
    save();
    renderTeamManager();
    renderAll();
    const rows = document.querySelectorAll('#personList [data-person-name]');
    rows[rows.length - 1]?.focus();
  });

  document.getElementById('teamList').addEventListener('input', (e) => {
    const id = e.target.dataset.teamName;
    if (!id) return;
    const t = getTeam(id);
    if (t) { t.name = e.target.value.trim() || t.name; save(); }
    else renderAll();
  });

  document.getElementById('teamList').addEventListener('click', (e) => {
    const id = e.target.dataset.teamDel;
    if (!id) return;
    if (!confirm('Удалить команду? Сотрудники останутся без команды.')) return;
    state.teams = state.teams.filter(x => x.id !== id);
    state.people.forEach(p => { if (p.teamId === id) p.teamId = null; });
    state.tasks.forEach(t => { if (t.teamId === id) t.teamId = null; });
    save();
    renderTeamManager();
    renderAll();
  });

  document.getElementById('personList').addEventListener('input', (e) => {
    const id = e.target.dataset.personName;
    if (!id) return;
    const p = getPerson(id);
    if (p) { p.name = e.target.value.trim() || p.name; save(); }
    else renderAll();
  });

  document.getElementById('personList').addEventListener('change', (e) => {
    const id = e.target.dataset.personTeam;
    if (!id) return;
    const p = getPerson(id);
    if (p) { p.teamId = e.target.value || null; save(); }
  });

  document.getElementById('personList').addEventListener('click', (e) => {
    const id = e.target.dataset.personDel;
    if (!id) return;
    if (!confirm('Удалить сотрудника? Задачи останутся без ответственного.')) return;
    state.people = state.people.filter(x => x.id !== id);
    state.tasks.forEach(t => { if (t.assigneeId === id) t.assigneeId = null; });
    save();
    renderTeamManager();
    renderAll();
  });
}

/* ---------------- Отчёты ---------------- */

// Текущая область отчёта: по команде / по сотруднику
let reportScope = { team: 'all', person: 'all' };

function scopedTasks() {
  return state.tasks.filter(t =>
    (reportScope.team === 'all' || t.teamId === reportScope.team) &&
    (reportScope.person === 'all' || t.assigneeId === reportScope.person));
}

function fillReportFilters() {
  const teamSel = document.getElementById('reportTeamFilter');
  const personSel = document.getElementById('reportPersonFilter');
  const keepTeam = teamSel.value;
  const keepPerson = personSel.value;
  teamSel.innerHTML = '<option value="all">Все команды</option>' +
    state.teams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  personSel.innerHTML = '<option value="all">Все сотрудники</option>' +
    state.people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  teamSel.value = reportScope.team || 'all';
  personSel.value = reportScope.person || 'all';
  void keepTeam; void keepPerson;
}

function refreshReportContent() {
  document.getElementById('reportText').textContent = buildReportText();
  renderReportSummary();
}

function buildReportText() {
  const L = [];
  const all = scopedTasks();
  const todo = all.filter(t => t.status === 'todo');
  const progress = all.filter(t => t.status === 'progress');
  const done = all.filter(t => t.status === 'done');
  const overdue = all.filter(isOverdue);

  const scopeName = [];
  if (reportScope.team !== 'all') scopeName.push('команда: ' + (getTeam(reportScope.team)?.name || '—'));
  if (reportScope.person !== 'all') scopeName.push('сотрудник: ' + (personName(reportScope.person) || '—'));

  L.push(`# Отчёт по задачам — ${fmtDateLong(new Date())}${scopeName.length ? ' (' + scopeName.join(', ') + ')' : ''}`);
  L.push('');
  L.push('## Сводка');
  L.push(`- Всего задач: **${all.length}**`);
  L.push(`- К выполнению: **${todo.length}**`);
  L.push(`- В работе: **${progress.length}**`);
  L.push(`- Выполнено: **${done.length}**`);
  L.push(`- Просрочено: **${overdue.length}**`);

  const taskLine = (t) => {
    const pr = PRIORITIES[t.priority];
    const folder = getFolder(t.folderId)?.name;
    const d = t.desc ? ' — ' + shortDesc(t.desc) : '';
    const due = t.dueDate ? `, срок: ${fmtDate(t.dueDate)}` : '';
    const ov = isOverdue(t) ? ' ⚠️ ПРОСРОЧЕНО' : '';
    const assignee = personName(t.assigneeId);
    const team = getTeam(t.teamId)?.name;
    const who = assignee ? `, отв.: ${assignee}${team ? ' (' + team + ')' : ''}` : (team ? `, команда: ${team}` : '');
    return `- [${pr.mark}] **${t.title}**${d}${due}${folder ? `, папка: ${folder}` : ''}${who}${ov}`;
  };

  const section = (title, arr) => {
    L.push('');
    L.push(`## ${title} (${arr.length})`);
    if (!arr.length) L.push('- нет задач');
    else arr.slice().sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]).forEach(t => L.push(taskLine(t)));
  };

  section('Все задачи', all);
  section('В работе', progress);
  section('Выполненные', done);

  if (overdue.length) {
    L.push('');
    L.push(`## ⚠️ Просроченные задачи (${overdue.length})`);
    overdue.forEach(t => L.push(taskLine(t)));
  }

  // Разбивки по командам и сотрудникам (когда отчёт без фильтра)
  const unfiltered = reportScope.team === 'all' && reportScope.person === 'all';

  if (unfiltered && state.teams.length) {
    L.push('');
    L.push(`## По командам (${state.teams.length})`);
    state.teams.forEach(team => {
      const tt = state.tasks.filter(t => t.teamId === team.id);
      L.push('');
      L.push(`### ${team.name} — всего ${tt.length}, открыто ${tt.filter(t => t.status !== 'done').length}`);
      if (!tt.length) L.push('- нет задач');
      else tt.filter(t => t.status !== 'done')
        .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority])
        .forEach(t => L.push(taskLine(t)));
    });
  }

  if (unfiltered && state.people.length) {
    L.push('');
    L.push(`## По сотрудникам (${state.people.length})`);
    state.people.forEach(p => {
      const tt = state.tasks.filter(t => t.assigneeId === p.id);
      L.push('');
      L.push(`### ${p.name} — всего ${tt.length}, открыто ${tt.filter(t => t.status !== 'done').length}`);
      if (!tt.length) L.push('- нет задач');
      else tt.filter(t => t.status !== 'done')
        .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority])
        .forEach(t => L.push(taskLine(t)));
    });
  }

  // При фильтре по команде — раскладка по её сотрудникам
  if (reportScope.team !== 'all' && state.people.length) {
    const members = state.people.filter(p => p.teamId === reportScope.team);
    if (members.length) {
      L.push('');
      L.push(`## Сотрудники команды (${members.length})`);
      members.forEach(p => {
        const tt = all.filter(t => t.assigneeId === p.id);
        L.push(`### ${p.name} — всего ${tt.length}, открыто ${tt.filter(t => t.status !== 'done').length}`);
        tt.filter(t => t.status !== 'done').forEach(t => L.push(taskLine(t)));
      });
    }
  }

  return L.join('\n');
}

function renderReportSummary() {
  const all = scopedTasks();
  const todo = all.filter(t => t.status === 'todo');
  const progress = all.filter(t => t.status === 'progress');
  const done = all.filter(t => t.status === 'done');
  const overdue = all.filter(isOverdue);
  const done7 = all.filter(t => t.status === 'done' && t.completedAt && t.completedAt > Date.now() - 7 * 86400000);
  const total = all.length || 1;

  let folderRows = '';
  state.folders.forEach(f => {
    const cnt = all.filter(t => folderAndDescendants(f.id).includes(t.folderId)).length;
    if (cnt || f.system) folderRows += `<tr><td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:${f.color};display:inline-block"></span>${esc(f.name)}</span></td><td>${cnt}</td><td>${all.filter(t => folderAndDescendants(f.id).includes(t.folderId) && t.status !== 'done').length}</td></tr>`;
  });

  document.getElementById('reportSummary').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><span class="num">${all.length}</span><span class="lbl">Всего задач</span></div>
      <div class="stat-card blue"><span class="num">${todo.length}</span><span class="lbl">К выполнению</span></div>
      <div class="stat-card amber"><span class="num">${progress.length}</span><span class="lbl">В работе</span></div>
      <div class="stat-card green"><span class="num">${done.length}</span><span class="lbl">Выполнено</span></div>
      <div class="stat-card red"><span class="num">${overdue.length}</span><span class="lbl">Просрочено</span></div>
    </div>
    <div class="report-section">
      <h4>Прогресс</h4>
      <div class="subtask-progress">
        <span class="progress-track" style="flex:1;height:10px">
          <span class="progress-fill" style="width:${Math.round(done.length / total * 100)}%;background:var(--green)"></span>
        </span>
        <span>${Math.round(done.length / total * 100)}% выполнено</span>
      </div>
    </div>
    ${done7.length ? `
    <div class="report-section">
      <h4>Выполнено за последние 7 дней (${done7.length})</h4>
      ${done7.map(t => `<div class="report-line"><span class="check">✔</span><span class="title">${esc(t.title)}</span><span class="muted">${t.completedAt ? new Date(t.completedAt).toLocaleDateString('ru-RU') : ''}</span></div>`).join('')}
    </div>` : ''}
    ${overdue.length ? `
    <div class="report-section">
      <h4>⚠️ Требуют внимания (${overdue.length})</h4>
      ${overdue.map(t => `<div class="report-line"><span class="over">⚠</span><span class="title">${esc(t.title)}</span><span class="muted">срок: ${fmtDate(t.dueDate)}</span></div>`).join('')}
    </div>` : ''}
    <div class="report-section">
      <h4>Задачи по папкам</h4>
      <table class="report-table">
        <tr><th>Папка</th><th>Всего</th><th>Открыто</th></tr>
        ${folderRows}
      </table>
    </div>
    ${state.teams.length ? `
    <div class="report-section">
      <h4>Задачи по командам</h4>
      <table class="report-table">
        <tr><th>Команда</th><th>Всего</th><th>Открыто</th><th>Выполнено</th></tr>
        ${state.teams.map(team => {
          const tt = all.filter(t => t.teamId === team.id);
          return `<tr><td>${esc(team.name)}</td><td>${tt.length}</td><td>${tt.filter(t => t.status !== 'done').length}</td><td>${tt.filter(t => t.status === 'done').length}</td></tr>`;
        }).join('')}
      </table>
    </div>` : ''}
    ${state.people.length ? `
    <div class="report-section">
      <h4>Задачи по ответственным</h4>
      <table class="report-table">
        <tr><th>Сотрудник</th><th>Всего</th><th>Открыто</th><th>Выполнено</th></tr>
        ${state.people.map(p => {
          const tt = all.filter(t => t.assigneeId === p.id);
          return `<tr><td>${esc(p.name)}</td><td>${tt.length}</td><td>${tt.filter(t => t.status !== 'done').length}</td><td>${tt.filter(t => t.status === 'done').length}</td></tr>`;
        }).join('')}
      </table>
    </div>` : ''}`;
}

/* Простой конвертер Markdown → HTML для автономного отчёта */
function mdInline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/⚠️/g, '<span style="color:#dc2626">⚠️</span>');
}

function mdToHtml(md) {
  const lines = String(md).split('\n');
  const out = [];
  let listOpen = false;
  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false; } };

  for (const ln of lines) {
    if (ln.startsWith('# ')) { closeList(); out.push(`<h1>${mdInline(ln.slice(2))}</h1>`); }
    else if (ln.startsWith('## ')) { closeList(); out.push(`<h2>${mdInline(ln.slice(3))}</h2>`); }
    else if (ln.startsWith('- ')) {
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      out.push(`<li>${mdInline(ln.slice(2))}</li>`);
    }
    else if (!ln.trim()) { closeList(); }
    else { closeList(); out.push(`<p>${mdInline(ln)}</p>`); }
  }
  closeList();
  return out.join('\n');
}

function htmlDoc(title, body) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 820px; margin: 28px auto; padding: 0 18px; color: #1c2030; line-height: 1.6; background: #fff; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 { font-size: 17px; margin-top: 26px; padding-bottom: 6px; border-bottom: 1px solid #d8dce8; color: #303650; }
  ul { list-style: none; padding-left: 4px; }
  li { margin: 6px 0; padding: 7px 10px; background: #f4f6fb; border-radius: 8px; font-size: 14px; }
  p { margin: 6px 0; }
  @media print { body { margin: 12mm; } li { background: none; border-bottom: 1px solid #eee; border-radius: 0; } }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function buildReportHtml() {
  return htmlDoc('Отчёт по задачам — TaskFlow', mdToHtml(buildReportText()));
}

function copyText(text) {
  return new Promise((resolve) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => resolve(true)).catch(() => resolve(fallbackCopy(text)));
    } else {
      resolve(fallbackCopy(text));
    }
  });
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch (e) { return false; }
}

function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------------- Интеграция Windows ---------------- */

// PowerShell -EncodedCommand принимает UTF-16LE base64
function toBase64Unicode(str) {
  const bytes = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    bytes[i * 2] = str.charCodeAt(i) & 0xFF;
    bytes[i * 2 + 1] = str.charCodeAt(i) >> 8;
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Самодостаточный .bat: разворачивает open_in_app.ps1 и регистрирует
// протоколы taskflow-open: / taskflow-folder: в HKCU (без прав администратора)
function buildInstallerBat() {
  const ps = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dir = Join-Path $env:APPDATA 'TaskFlow'",
    "New-Item -ItemType Directory -Force -Path $dir | Out-Null",
    "$script = @'",
    "param([string]$Url)",
    "try {",
    "  if ($Url -like 'taskflow-folder:*') {",
    "    $p = [System.Uri]::UnescapeDataString($Url.Substring(16))",
    "    if (Test-Path -LiteralPath $p) { Start-Process explorer.exe -ArgumentList ('\"' + $p + '\"') }",
    "    else { [System.Windows.Forms.MessageBox]::Show('Папка не найдена:' + [Environment]::NewLine + $p, 'TaskFlow') | Out-Null }",
    "  } elseif ($Url -like 'taskflow-open:*') {",
    "    $p = [System.Uri]::UnescapeDataString($Url.Substring(14))",
    "    if ($p -eq '__ping__') { [System.Windows.Forms.MessageBox]::Show('Интеграция TaskFlow работает! Файлы будут открываться в приложениях Windows.', 'TaskFlow') | Out-Null }",
    "    elseif (Test-Path -LiteralPath $p) { Start-Process -FilePath $p }",
    "    else { [System.Windows.Forms.MessageBox]::Show('Файл не найден:' + [Environment]::NewLine + $p, 'TaskFlow') | Out-Null }",
    "  }",
    "} catch { }",
    "'@",
    "Set-Content -Path (Join-Path $dir 'open_in_app.ps1') -Value $script -Encoding UTF8",
    "$reg = 'HKCU:\\Software\\Classes'",
    "foreach ($proto in @('taskflow-open','taskflow-folder')) {",
    "  New-Item -Path (Join-Path $reg ($proto + '\\shell\\open\\command')) -Force | Out-Null",
    "  New-ItemProperty -Path (Join-Path $reg $proto) -Name '(default)' -Value ('URL:TaskFlow ' + $proto) -PropertyType String -Force | Out-Null",
    "  New-ItemProperty -Path (Join-Path $reg $proto) -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null",
    "  Set-ItemProperty -Path (Join-Path $reg ($proto + '\\shell\\open\\command')) -Name '(default)' -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"' + (Join-Path $dir 'open_in_app.ps1') + '\" \"%1\"')",
    "}",
    "[System.Windows.Forms.MessageBox]::Show('Интеграция TaskFlow установлена.' + [Environment]::NewLine + 'Файлы будут открываться в приложениях Windows, папки — в Проводнике.', 'TaskFlow') | Out-Null",
  ].join('\r\n');
  return '@echo off\r\nchcp 65001 >nul\r\n' +
    'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + toBase64Unicode(ps) +
    '\r\necho.\r\npause\r\n';
}

function openSystemModal() {
  document.getElementById('nativeOpenCheck').checked = state.settings.nativeOpen !== false;
  openModal('systemModal');
}

function printReport(htmlDoc) {
  const w = window.open('', '_blank');
  if (!w) { toast('Браузер заблокировал всплывающее окно', 'error'); return; }
  w.document.write(htmlDoc);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

/* ---------------- Экспорт / импорт (с переносом файлов) ---------------- */

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then(r => r.blob());
}

async function collectFilesForExport() {
  if (!(await FileStore.isSupported())) return [];
  const all = await FileStore.all();
  const files = [];
  for (const f of all) {
    const data = f.blob ? await blobToDataUrl(f.blob) : null;
    if (data) files.push({ id: f.id, name: f.name, type: f.type, size: f.size, folderId: f.folderId || null, addedAt: f.addedAt, data });
  }
  return files;
}

async function exportData() {
  toast('Готовим резервную копию…');
  const files = await collectFilesForExport();
  const payload = {
    app: 'taskflow',
    format: 2,
    exportedAt: new Date().toISOString(),
    state: { ...state, settings: { ...state.settings, aiKey: '' } }, // ключ AI не экспортируем
    files,
  };
  download('taskflow-backup-' + todayStr() + '.json', JSON.stringify(payload, null, 2), 'application/json');
  toast(`Резервная копия сохранена (задач: ${state.tasks.length}, файлов: ${files.length})`, 'success');
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const s = data.state || data; // поддержка как нового, так и старого формата
    if (!s || !Array.isArray(s.tasks) || !Array.isArray(s.folders)) {
      throw new Error('bad shape');
    }

    // --- Папки задач ---
    const map = new Map();
    for (const f of s.folders) {
      const existing = state.folders.find(x => x.name === f.name && ((x.parentId || null) === (f.parentId || null)));
      if (existing) map.set(f.id, existing.id);
    }
    let foldersAdded = 0;
    for (const f of s.folders) {
      if (map.has(f.id)) continue;
      const parentId = f.parentId ? (map.get(f.parentId) || null) : null;
      const newId = uid();
      map.set(f.id, newId);
      state.folders.push({ ...f, id: newId, parentId, system: false });
      foldersAdded++;
    }

    // --- Команды и сотрудники ---
    const teamMap = new Map();
    for (const t of (s.teams || [])) {
      const existing = state.teams.find(x => x.name === t.name);
      if (existing) teamMap.set(t.id, existing.id);
      else {
        const nid = uid();
        teamMap.set(t.id, nid);
        state.teams.push({ id: nid, name: t.name });
      }
    }
    const personMap = new Map();
    for (const p of (s.people || [])) {
      const existing = state.people.find(x => x.name === p.name);
      if (existing) personMap.set(p.id, existing.id);
      else {
        const nid = uid();
        personMap.set(p.id, nid);
        state.people.push({ id: nid, name: p.name, teamId: p.teamId ? (teamMap.get(p.teamId) || null) : null });
      }
    }

    // --- Папки файлов ---
    const ffMap = new Map();
    for (const f of (s.fileFolders || [])) {
      const existing = state.fileFolders.find(x => x.name === f.name && ((x.parentId || null) === (f.parentId || null)));
      if (existing) ffMap.set(f.id, existing.id);
      else {
        const nid = uid();
        ffMap.set(f.id, nid);
        state.fileFolders.push({ id: nid, name: f.name, parentId: f.parentId ? (ffMap.get(f.parentId) || null) : null, collapsed: false });
      }
    }

    // --- Задачи ---
    let tasksAdded = 0;
    for (const t of s.tasks) {
      if (state.tasks.some(x => x.id === t.id)) continue;
      state.tasks.push({
        ...t,
        id: uid(),
        folderId: map.get(t.folderId) || 'inbox',
        teamId: t.teamId ? (teamMap.get(t.teamId) || null) : null,
        assigneeId: t.assigneeId ? (personMap.get(t.assigneeId) || null) : null,
        subtasks: (t.subtasks || []).map(x => ({ ...x, id: uid() })),
        links: (t.links || []).map(l => ({ ...l, kind: l.kind || 'manual', id: uid() })),
        createdAt: t.createdAt || Date.now(),
        updatedAt: t.updatedAt || t.createdAt || Date.now(),
        completedAt: t.completedAt || (t.status === 'done' ? Date.now() : null),
      });
      tasksAdded++;
    }

    // --- Заметки и база знаний ---
    let notesAdded = 0;
    for (const n of (s.notes || [])) {
      if (!n.id || state.notes.some(x => x.id === n.id)) continue;
      state.notes.push({ ...n, createdAt: n.createdAt || Date.now(), updatedAt: n.updatedAt || Date.now() });
      notesAdded++;
    }
    let kbAdded = 0;
    for (const a of (s.kb || [])) {
      if (!a.id || state.kb.some(x => x.id === a.id)) continue;
      state.kb.push({ ...a, createdAt: a.createdAt || Date.now(), updatedAt: a.updatedAt || Date.now() });
      kbAdded++;
    }

    save();
    renderAll();

    // --- Файлы библиотеки ---
    let filesAdded = 0;
    if (Array.isArray(data.files) && data.files.length && (await FileStore.isSupported())) {
      const existing = await FileStore.all();
      const have = new Set(existing.map(f => f.id));
      for (const f of data.files) {
        if (!f.id || have.has(f.id) || !f.data) continue;
        const blob = await dataUrlToBlob(f.data);
        await FileStore.put({
          id: f.id, name: f.name || 'file', type: f.type || '', size: f.size || blob.size,
          folderId: f.folderId ? (ffMap.get(f.folderId) || null) : null,
          blob, addedAt: f.addedAt || Date.now(),
        });
        filesAdded++;
      }
    }

    toast(`Импортировано: задач — ${tasksAdded}, папок — ${foldersAdded}, заметок — ${notesAdded}, статей БЗ — ${kbAdded}, файлов — ${filesAdded}`, 'success');
  } catch (e) {
    console.warn(e);
    toast('Ошибка импорта: файл повреждён или не является резервной копией', 'error');
  }
}

/* ---------------- Тема ---------------- */

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.getElementById('btnTheme').innerHTML = state.settings.theme === 'dark' ? '☀️ Светлая тема' : '🌙 Тёмная тема';
}

/* ---------------- Toast ---------------- */

let toastTimer = null;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

/* ---------------- События ---------------- */

function bindEvents() {
  bindModalClosing();

  // Новая задача
  document.getElementById('btnNewTask').addEventListener('click', () => openTaskModal(null));
  els.viewsNav.querySelectorAll('.view-item').forEach(v => {
    v.addEventListener('click', () => {
      state.ui.filterType = v.dataset.view;
      state.ui.folderId = null;
      save();
      renderAll();
    });
  });

  // Дерево папок
  els.folderTree.addEventListener('click', (e) => {
    const row = e.target.closest('.folder-row');
    if (!row) return;
    const fid = row.dataset.fid;
    const toggle = e.target.closest('[data-toggle-folder]');
    const addChild = e.target.closest('[data-add-child]');
    const edit = e.target.closest('[data-edit-folder]');
    const del = e.target.closest('[data-del-folder]');

    if (toggle) {
      const f = getFolder(fid);
      f.collapsed = !f.collapsed;
      save();
      renderAll();
    } else if (addChild) {
      openNewFolder(fid);
    } else if (edit) {
      openEditFolder(fid);
    } else if (del) {
      editingFolderId = fid;
      deleteFolder();
    } else {
      state.ui.filterType = 'folder';
      state.ui.folderId = fid;
      save();
      renderAll();
    }
  });

  document.getElementById('btnNewFolder').addEventListener('click', () => openNewFolder(null));

  // Список задач
  els.taskList.addEventListener('click', (e) => {
    const openLib = e.target.closest('[data-open-lib]');
    if (openLib) {
      e.preventDefault();
      e.stopPropagation();
      openLibraryFile(openLib.dataset.openLib);
      return;
    }
    const item = e.target.closest('.task-item');
    if (!item) return;
    const id = item.dataset.taskId;
    const doneBtn = e.target.closest('[data-toggle-done]');
    const startBtn = e.target.closest('[data-start-task]');

    if (doneBtn) {
      const t = getTask(id);
      t.status = t.status === 'done' ? 'todo' : 'done';
      t.completedAt = t.status === 'done' ? Date.now() : null;
      save();
      renderAll();
    } else if (startBtn) {
      const t = getTask(id);
      t.status = 'progress';
      save();
      renderAll();
    } else {
      openTaskModal(id);
    }
  });

  // Поиск / фильтры
  let searchTimer = null;
  els.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.ui.search = els.searchInput.value;
      save();
      renderTasks();
    }, 150);
  });

  els.filterChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.ui.status = chip.dataset.status;
    save();
    renderAll();
  });

  els.priorityFilter.addEventListener('change', () => {
    state.ui.priority = els.priorityFilter.value;
    save();
    renderTasks();
  });

  els.teamFilter.addEventListener('change', () => {
    state.ui.team = els.teamFilter.value;
    save();
    renderTasks();
  });

  els.assigneeFilter.addEventListener('change', () => {
    state.ui.assignee = els.assigneeFilter.value;
    save();
    renderTasks();
  });

  els.sortSelect.addEventListener('change', () => {
    state.ui.sort = els.sortSelect.value;
    state.ui.sortDir = SORT_DEFAULT_DIR[els.sortSelect.value] || 'asc';
    save();
    renderTasks();
  });

  els.sortDirBtn.addEventListener('click', () => {
    state.ui.sortDir = (state.ui.sortDir || 'asc') === 'desc' ? 'asc' : 'desc';
    save();
    renderTasks();
  });

  // Окно задачи
  document.getElementById('btnSaveTask').addEventListener('click', saveTask);
  document.getElementById('btnDeleteTask').addEventListener('click', deleteTask);
  document.getElementById('fPriority').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (btn) setPriorityActive(btn.dataset.val);
  });
  document.getElementById('btnAddSubtask').addEventListener('click', () => {
    subtaskDraft.push({ id: uid(), title: '', done: false });
    renderSubtaskDraft();
    const box = document.getElementById('subtaskList');
    box.lastElementChild?.querySelector('input[type="text"]')?.focus();
  });
  document.getElementById('subtaskList').addEventListener('input', (e) => {
    const idx = +e.target.dataset.subtaskText;
    if (Number.isInteger(idx)) subtaskDraft[idx].title = e.target.value;
  });
  document.getElementById('subtaskList').addEventListener('change', (e) => {
    const idx = +e.target.dataset.subtaskDone;
    if (Number.isInteger(idx)) {
      subtaskDraft[idx].done = e.target.checked;
      renderSubtaskDraft();
    }
  });
  document.getElementById('subtaskList').addEventListener('click', (e) => {
    const idx = +e.target.dataset.subtaskDel;
    if (Number.isInteger(idx)) {
      subtaskDraft.splice(idx, 1);
      renderSubtaskDraft();
    }
  });

  document.getElementById('btnAddLink').addEventListener('click', () => {
    linkDraft.push({ id: uid(), name: '', url: '' });
    renderLinkDraft();
  });
  document.getElementById('btnAddFolderLink').addEventListener('click', () => {
    linkDraft.push({ id: uid(), kind: 'manual', name: '', url: '', isFolder: true });
    renderLinkDraft();
  });
  document.getElementById('linkList').addEventListener('input', (e) => {
    const iName = +e.target.dataset.linkName;
    const iUrl = +e.target.dataset.linkUrl;
    if (Number.isInteger(iName)) linkDraft[iName].name = e.target.value;
    if (Number.isInteger(iUrl)) {
      linkDraft[iUrl].url = e.target.value;
      renderLinkDraft();
    }
  });
  document.getElementById('linkList').addEventListener('click', async (e) => {
    const idx = +e.target.dataset.linkDel;
    if (Number.isInteger(idx)) {
      linkDraft.splice(idx, 1);
      renderLinkDraft();
      return;
    }
    const open = +e.target.dataset.libOpen;
    if (Number.isInteger(open) && linkDraft[open]) {
      const l = linkDraft[open];
      if (l.kind === 'library' && l.fileId) openLibraryFile(l.fileId);
      else {
        const href = linkHref(l);
        if (href) window.open(href, '_blank', 'noopener');
        else toast('Ссылка пуста — введите URL или путь', 'error');
      }
      return;
    }
    const dl = +e.target.dataset.libDownload;
    if (Number.isInteger(dl) && linkDraft[dl] && linkDraft[dl].fileId) {
      const rec = await FileStore.get(linkDraft[dl].fileId).catch(() => null);
      if (rec && rec.blob) downloadBlob(rec.name, rec.blob);
      else toast('Файл не найден в библиотеке', 'error');
    }
  });
  document.getElementById('btnPickFile').addEventListener('click', () => document.getElementById('taskFilePicker').click());
  document.getElementById('taskFilePicker').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const supported = await FileStore.isSupported();
    for (const file of files) {
      if (supported) {
        const fileId = uid();
        await FileStore.put({
          id: fileId, name: file.name, type: file.type, size: file.size,
          folderId: null, blob: file, addedAt: Date.now(),
        });
        linkDraft.push({ id: uid(), kind: 'library', fileId, name: file.name, size: file.size });
      } else {
        // Запасной вариант: хранилище недоступно — добавим просто название
        linkDraft.push({ id: uid(), kind: 'library', fileId: null, name: file.name });
      }
    }
    renderLinkDraft();
    toast(supported
      ? `Файлы сохранены в библиотеку и прикреплены (${files.length})`
      : 'Браузер не поддерживает IndexedDB — файлы не сохранены', supported ? 'success' : 'error');
  });

  // Команда и ответственные
  document.getElementById('btnManageTeam').addEventListener('click', () => {
    renderTeamManager();
    openModal('teamModal');
  });
  bindTeamManagerEvents();

  // Папки
  document.getElementById('btnSaveFolder').addEventListener('click', saveFolder);
  document.getElementById('btnDeleteFolder').addEventListener('click', deleteFolder);
  document.getElementById('fFolderColor').addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    folderColorDraft = sw.dataset.color;
    renderSwatches();
  });

  // Отчёты
  document.getElementById('btnReports').addEventListener('click', () => {
    fillReportFilters();
    refreshReportContent();
    document.querySelector('#reportTabs .tab').click();
    openModal('reportModal');
  });
  document.getElementById('reportTeamFilter').addEventListener('change', (e) => {
    reportScope.team = e.target.value;
    if (e.target.value !== 'all') reportScope.person = 'all';
    fillReportFilters();
    refreshReportContent();
  });
  document.getElementById('reportPersonFilter').addEventListener('change', (e) => {
    reportScope.person = e.target.value;
    if (e.target.value !== 'all') reportScope.team = 'all';
    fillReportFilters();
    refreshReportContent();
  });
  document.getElementById('btnCopyReport').addEventListener('click', async () => {
    const ok = await copyText(document.getElementById('reportText').textContent);
    toast(ok ? 'Отчёт скопирован' : 'Не удалось скопировать', ok ? 'success' : 'error');
  });
  document.getElementById('btnDownloadReport').addEventListener('click', () => {
    download('отчёт-' + todayStr() + '.md', document.getElementById('reportText').textContent, 'text/markdown');
  });
  document.getElementById('btnDownloadReportHtml').addEventListener('click', () => {
    download('отчёт-' + todayStr() + '.html', buildReportHtml(), 'text/html');
    toast('HTML-отчёт сохранён', 'success');
  });
  document.getElementById('btnPrintReport').addEventListener('click', () => {
    printReport(buildReportHtml());
  });

  // Вкладки
  bindTabs('reportTabs');
  bindTabs('aiTabs');

  // Очистить выполненные
  document.getElementById('btnClearDone').addEventListener('click', () => {
    const n = state.tasks.filter(t => t.status === 'done').length;
    if (!n) { toast('Нет выполненных задач'); return; }
    if (!confirm(`Удалить ${n} выполненных задач?`)) return;
    state.tasks = state.tasks.filter(t => t.status !== 'done');
    save();
    renderAll();
    toast('Выполненные задачи удалены', 'success');
  });

  // Экспорт / импорт
  document.getElementById('btnExport').addEventListener('click', exportData);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  // Тема
  document.getElementById('btnTheme').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    save();
    applyTheme();
  });

  // Система и интеграция Windows
  document.getElementById('btnSystem').addEventListener('click', openSystemModal);
  document.getElementById('nativeOpenCheck').addEventListener('change', (e) => {
    state.settings.nativeOpen = e.target.checked;
    save();
    renderTasks();
  });
  document.getElementById('btnDownloadInstaller').addEventListener('click', () => {
    download('Установить_интеграцию.bat', buildInstallerBat(), 'application/bat');
    toast('Установщик скачан — запустите .bat и подтвердите установку', 'success');
  });
  document.getElementById('btnTestIntegration').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = 'taskflow-open:__ping__';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('Если интеграция установлена — появится окно подтверждения', 'success');
  });

  // AI окно
  document.getElementById('btnAI').addEventListener('click', () => openModal('aiModal'));

  // Журнал и заметки
  document.getElementById('btnJournal').addEventListener('click', () => {
    renderJournalList();
    showJournalEditor(false);
    openModal('journalModal');
  });
  document.getElementById('journalSearch').addEventListener('input', renderJournalList);
  document.getElementById('journalList').addEventListener('click', (e) => {
    const item = e.target.closest('[data-note-id]');
    if (item) openNoteEditor(item.dataset.noteId);
  });
  document.getElementById('btnNewNote').addEventListener('click', () => openNoteEditor(null));
  document.getElementById('btnSaveNote').addEventListener('click', saveNote);
  document.getElementById('btnDeleteNote').addEventListener('click', deleteNote);
  document.getElementById('btnJournalBack').addEventListener('click', () => {
    renderJournalList();
    showJournalEditor(false);
  });
  document.getElementById('journalAiOut').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const out = document.getElementById('journalAiOut');
    if (btn.dataset.act === 'append') {
      document.getElementById('jText').value = (document.getElementById('jText').value.trim() + '\n\n' + journalAiText.trim()).trim();
    } else if (btn.dataset.act === 'replace') {
      document.getElementById('jText').value = journalAiText.trim();
    }
    out.classList.add('hidden');
    out.textContent = '';
    journalAiText = '';
    toast('Текст обновлён', 'success');
  });

  // База знаний
  document.getElementById('btnKb').addEventListener('click', () => {
    renderKbList();
    showKbEditor(false);
    openModal('kbModal');
  });
  document.getElementById('kbSearch').addEventListener('input', renderKbList);
  document.getElementById('kbList').addEventListener('click', (e) => {
    const item = e.target.closest('[data-kb-id]');
    if (item) openKbEditor(item.dataset.kbId);
  });
  document.getElementById('btnNewKb').addEventListener('click', () => openKbEditor(null));
  document.getElementById('btnSaveKb').addEventListener('click', saveKb);
  document.getElementById('btnDeleteKb').addEventListener('click', deleteKb);
  document.getElementById('btnKbBack').addEventListener('click', () => {
    renderKbList();
    showKbEditor(false);
  });
  document.getElementById('kbAiOut').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const out = document.getElementById('kbAiOut');
    if (btn.dataset.act === 'append') {
      document.getElementById('kContent').value = (document.getElementById('kContent').value.trim() + '\n\n' + kbAiText.trim()).trim();
    } else if (btn.dataset.act === 'replace') {
      document.getElementById('kContent').value = kbAiText.trim();
    }
    out.classList.add('hidden');
    out.textContent = '';
    kbAiText = '';
    toast('Текст обновлён', 'success');
  });

  // Горячие клавиши
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
      return;
    }
    if (typing) return;
    if (e.key === '/' || (e.key.toLowerCase() === 'f' && e.ctrlKey)) {
      e.preventDefault();
      els.searchInput.focus();
    } else if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openTaskModal(null);
    }
  });
}

function bindTabs(tabsId) {
  const box = document.getElementById(tabsId);
  box.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    const prefix = tabsId === 'reportTabs' ? 'reportPanel' : 'aiPanel';
    box.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll(`[id^="${prefix}"]`).forEach(p => {
      p.classList.toggle('active', p.id === prefix + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
    });
  });
}

/* ---------------- Публичный API (используется ai.js и files.js) ---------------- */

window.App = {
  state,
  save,
  uid,
  refreshAll: renderAll,
  getSettings: () => state.settings,
  setSettings(patch) {
    Object.assign(state.settings, patch);
    save();
  },
  toast,
  esc,
  copyText,
  download,
  downloadBlob,
  previewableType,
  linkHref,
  buildReportText,
  buildReportHtml,
  markdownToHtmlDoc: (title, md) => htmlDoc(title, mdToHtml(md)),
  newTask: () => openTaskModal(null),
  getTaskModalDraft: () => ({
    title: document.getElementById('fTitle').value.trim(),
    desc: document.getElementById('fDesc').value.trim(),
  }),
  setTaskModalSubtasks(list) {
    subtaskDraft = list.map(s => ({ id: uid(), title: String(s.title || ''), done: !!s.done }));
    renderSubtaskDraft();
  },
  setTaskModalDescription(desc) {
    document.getElementById('fDesc').value = desc;
  },
  getFolderOptionsHtml: (selectedId) => folderOptionsHtml(selectedId),
  openAiSettings() {
    openModal('aiModal');
    const tab = document.querySelector('#aiTabs .tab[data-tab="settings"]');
    if (tab) tab.click();
  },
  openAiParseWithText(text) {
    closeModal('journalModal');
    closeModal('kbModal');
    openModal('aiModal');
    const tab = document.querySelector('#aiTabs .tab[data-tab="parse"]');
    if (tab) tab.click();
    document.getElementById('aiText').value = text || '';
  },
  /* --- Журнал --- */
  getNoteDraft: () => ({
    title: document.getElementById('jTitle').value.trim(),
    text: document.getElementById('jText').value.trim(),
  }),
  setNoteText(text) { document.getElementById('jText').value = text; },
  showJournalAiOutput(text) {
    journalAiText = String(text || '');
    const out = document.getElementById('journalAiOut');
    out.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(journalAiText)}</pre>
      <div class="report-tools" style="margin-top:8px">
        <button class="btn btn-ghost btn-sm" data-act="replace">🔄 Заменить текст</button>
        <button class="btn btn-ghost btn-sm" data-act="append">📥 Добавить в конец</button>
      </div>`;
    out.classList.remove('hidden');
  },
  /* --- База знаний --- */
  getKbDraft: () => ({
    title: document.getElementById('kTitle').value.trim(),
    content: document.getElementById('kContent').value.trim(),
  }),
  setKbContent(text) { document.getElementById('kContent').value = text; },
  showKbAiOutput(text) {
    kbAiText = String(text || '');
    const out = document.getElementById('kbAiOut');
    out.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(kbAiText)}</pre>
      <div class="report-tools" style="margin-top:8px">
        <button class="btn btn-ghost btn-sm" data-act="replace">🔄 Заменить текст</button>
        <button class="btn btn-ghost btn-sm" data-act="append">📥 Добавить в конец</button>
      </div>`;
    out.classList.remove('hidden');
  },
  addLibraryLinksToTaskDraft(list) {
    let added = 0;
    for (const f of list) {
      if (!f || !f.id) continue;
      if (linkDraft.some(l => l.kind === 'library' && l.fileId === f.id)) continue;
      linkDraft.push({ id: uid(), kind: 'library', fileId: f.id, name: f.name, size: f.size });
      added++;
    }
    renderLinkDraft();
    return added;
  },
  addTasksFromList(list, folderId) {
    let added = 0;
    for (const raw of list) {
      const title = String(raw.title || '').trim();
      if (!title) continue;
      state.tasks.push({
        id: uid(),
        title,
        desc: String(raw.description || '').trim(),
        folderId: folderId || 'inbox',
        status: 'todo',
        priority: ['high', 'medium', 'low'].includes(raw.priority) ? raw.priority : 'medium',
        dueDate: raw.dueDate || null,
        tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
        teamId: null,
        assigneeId: null,
        subtasks: (raw.subtasks || []).map(s => ({ id: uid(), title: String(s.title || ''), done: false })),
        links: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
      });
      added++;
    }
    save();
    renderAll();
    return added;
  },
  getTaskSummariesByIds(ids) {
    const set = new Set(ids);
    return state.tasks.filter(t => set.has(t.id)).slice(0, 300).map(t => {
      const f = getFolder(t.folderId)?.name || '';
      const team = getTeam(t.teamId)?.name || '';
      const assignee = personName(t.assigneeId);
      return [
        `# ${t.title}`,
        `Статус: ${STATUSES[t.status].label}`,
        `Приоритет: ${PRIORITIES[t.priority].label}`,
        t.dueDate ? `Срок: ${fmtDate(t.dueDate)}${isOverdue(t) ? ' (просрочено)' : ''}` : '',
        f ? `Папка: ${f}` : '',
        team ? `Команда: ${team}` : '',
        assignee ? `Ответственный: ${assignee}` : '',
        t.desc ? `Описание: ${shortDesc(t.desc)}` : '',
        t.tags.length ? `Теги: ${t.tags.join(', ')}` : '',
        t.subtasks.length ? `Подзадачи: ${t.subtasks.map(s => (s.done ? '[x]' : '[ ]') + ' ' + s.title).join('; ')}` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');
  },
  getAllTaskSummaries() {
    return this.getTaskSummariesByIds(state.tasks.map(t => t.id));
  },
  /* Отбор задач по области для AI-отчёта */
  getScopeTasks(scope, folderId) {
    switch (scope) {
      case 'open': return state.tasks.filter(t => t.status !== 'done');
      case 'done': return state.tasks.filter(t => t.status === 'done');
      case 'overdue': return state.tasks.filter(isOverdue);
      case 'folder': {
        const ids = folderAndDescendants(folderId || state.folders[0]?.id);
        return state.tasks.filter(t => ids.includes(t.folderId));
      }
      default: return state.tasks.slice();
    }
  },
};

/* ---------------- Инициализация ---------------- */

// Сохраняем состояние при загрузке: фиксирует демо-данные первого запуска
// и переносит данные предыдущих версий после миграции (без потерь)
save();

applyTheme();
renderAll();
bindEvents();

console.log('%c☑️ TaskFlow загружен', 'color:#6366f1;font-weight:bold');
console.log(`Задач: ${state.tasks.length} | Папок: ${state.folders.length} | Файловых папок: ${state.fileFolders.length} | Версия: ${state.version}`);
