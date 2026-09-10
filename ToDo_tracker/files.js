'use strict';

/* =====================================================
   Библиотека файлов: папки, загрузка, перемещение,
   скачивание и прикрепление файлов к задачам.
   Хранилище: IndexedDB (FileStore из storage.js).
   ===================================================== */

(() => {

  const fileFolders = () => App.state.fileFolders;

  // Текущая выбранная папка в окне библиотеки (null = все файлы/корень)
  let selectedFolderId = null;

  // Отмеченные файлы в списке библиотеки
  const checkedFiles = new Set();

  // Отмеченные файлы в окне выбора для задачи
  const pickerChecked = new Set();

  /* ---------- Утилиты ---------- */

  function ffChildren(parentId) {
    return fileFolders().filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  function ffDescendants(id) {
    const out = [id];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const f of fileFolders()) {
        if (f.parentId === cur) { out.push(f.id); stack.push(f.id); }
      }
    }
    return out;
  }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / 1024 / 1024).toFixed(2) + ' МБ';
  }

  async function loadFiles() {
    try {
      return await FileStore.all();
    } catch (_) {
      return [];
    }
  }

  /* ---------- Рендер дерева папок ---------- */

  function renderFileFolderTree() {
    const box = document.getElementById('fileFolderTree');
    const rows = [];
    const walk = (parentId, depth) => {
      for (const f of ffChildren(parentId)) {
        rows.push([f, depth]);
        if (!f.collapsed) walk(f.id, depth + 1);
      }
    };
    walk(null, 0);

    const rootActive = selectedFolderId === null;
    box.innerHTML = `
      <div class="file-folder-row ${rootActive ? 'active' : ''}" data-ffid="" style="padding-left:8px">
        <span class="folder-dot" style="background:#64748b"></span>
        <span class="folder-name">📁 Все файлы</span>
      </div>` + rows.map(([f, depth]) => `
      <div class="file-folder-row ${selectedFolderId === f.id ? 'active' : ''}" data-ffid="${f.id}" style="padding-left:${8 + depth * 16}px">
        <button class="folder-toggle" data-ff-toggle="${f.id}">${ffChildren(f.id).length ? (f.collapsed ? '▶' : '▼') : ''}</button>
        <span class="folder-dot" style="background:#0ea5e9"></span>
        <span class="folder-name" title="${App.esc(f.name)}">${App.esc(f.name)}</span>
        <span class="folder-actions">
          <button class="icon-btn" data-ff-rename="${f.id}" title="Переименовать">✏️</button>
          <button class="icon-btn" data-ff-del="${f.id}" title="Удалить (файлы переедут в корень)">🗑️</button>
        </span>
      </div>`).join('');

    // Папки для перемещения файлов
    document.getElementById('fileMoveTarget').innerHTML =
      '<option value="">— корень —</option>' +
      fileFolders().map(f => `<option value="${f.id}">${App.esc(f.name)}</option>`).join('');
  }

  /* ---------- Рендер списка файлов ---------- */

  function trashedFileIds() {
    return new Set((App.state.trash || []).filter(x => x.type === 'file').map(x => x.refId));
  }

  async function renderFileList() {
    const box = document.getElementById('fileList');
    const q = (document.getElementById('fileSearchInput').value || '').trim().toLowerCase();
    let all = await loadFiles();
    const trashed = trashedFileIds();
    all = all.filter(f => !trashed.has(f.id));

    if (selectedFolderId) {
      const ids = ffDescendants(selectedFolderId);
      all = all.filter(f => ids.includes(f.folderId));
    }
    if (q) all = all.filter(f => f.name.toLowerCase().includes(q));
    all.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    if (!all.length) {
      box.innerHTML = `<div class="file-empty">
        <div style="font-size:30px">🗃️</div>
        <p>${q ? 'Ничего не найдено' : 'Здесь пока нет файлов'}</p>
        <p class="muted" style="font-size:12px">Нажмите «Добавить файлы» — файлы сохранятся прямо в браузере и будут доступны без сервера.</p>
      </div>`;
      return;
    }

    box.innerHTML = all.map(f => {
      const folderName = f.folderId ? (fileFolders().find(x => x.id === f.folderId)?.name || '') : '';
      const used = App.state.tasks.filter(t => (t.links || []).some(l => l.kind === 'library' && l.fileId === f.id)).length;
      return `
      <div class="file-row" data-fid="${f.id}">
        <input type="checkbox" ${checkedFiles.has(f.id) ? 'checked' : ''} data-file-check="${f.id}" title="Отметить">
        <span class="file-ico">${fileIcon(f.type, f.name)}</span>
        <div class="file-info">
          <a class="file-name" href="javascript:void(0)" data-file-open="${f.id}" title="Открыть файл">${App.esc(f.name)}</a>
          <div class="file-meta">${fmtSize(f.size)} · ${f.addedAt ? new Date(f.addedAt).toLocaleDateString('ru-RU') : ''}${folderName ? ' · ' + App.esc(folderName) : ''}${used ? ` · 🔗 ${used} ${App.esc(pluralWord(used))}` : ''}</div>
        </div>
        <span class="spacer"></span>
        <button class="icon-btn" data-file-open="${f.id}" title="Открыть файл">↗️</button>
        <button class="icon-btn" data-file-download="${f.id}" title="Скачать файл">⬇️</button>
        <button class="icon-btn" data-file-del="${f.id}" title="Удалить из библиотеки">🗑️</button>
      </div>`;
    }).join('');
  }

  function pluralWord(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'задача';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'задачи';
    return 'задач';
  }

  function fileIcon(type, name) {
    if (/image\//.test(type || '')) return '🖼️';
    if (/pdf/.test((type || '') + ' ' + name)) return '📕';
    if (/text\/|json|csv|xml/.test((type || '') + ' ' + name)) return '📄';
    if (/sheet|excel|xlsx/.test((type || '') + ' ' + name)) return '📊';
    if (/word|docx/.test((type || '') + ' ' + name)) return '📝';
    if (/zip|rar|7z/.test((type || '') + ' ' + name)) return '🗜️';
    if (name.endsWith('.las')) return '📈';
    return '📎';
  }

  /* ---------- Действия с файлами ---------- */

  async function addFilesFromInput(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!(await FileStore.isSupported())) {
      App.toast('Браузер не поддерживает IndexedDB — хранилище файлов недоступно', 'error');
      return;
    }
    let added = 0;
    for (const file of files) {
      try {
        await FileStore.put({
          id: App.uid ? App.uid() : crypto.randomUUID(),
          name: file.name, type: file.type, size: file.size,
          folderId: selectedFolderId, blob: file, addedAt: Date.now(),
        });
        added++;
      } catch (e) {
        console.warn('Не удалось сохранить файл', e);
      }
    }
    await renderFileList();
    App.toast(`Файлов добавлено: ${added}`, 'success');
  }

  async function downloadFile(id) {
    const rec = await FileStore.get(id).catch(() => null);
    if (rec && rec.blob) App.downloadBlob(rec.name, rec.blob);
    else App.toast('Файл не найден в библиотеке', 'error');
  }

  async function openFile(id) {
    const rec = await FileStore.get(id).catch(() => null);
    if (!rec || !rec.blob) { App.toast('Файл не найден в библиотеке', 'error'); return; }

    if (!App.previewableType(rec.name, rec.type)) {
      if (confirm(`Браузер не умеет показывать файл «${rec.name}».\n\nЧтобы он открывался в Word/Excel и других приложениях, добавьте его как ссылку на файл с диска (⚙️ Система → интеграция).\n\nСкачать файл сейчас?`)) {
        App.downloadBlob(rec.name, rec.blob);
      }
      return;
    }

    const url = URL.createObjectURL(rec.blob);
    const w = window.open('', '_blank');
    if (!w) {
      App.downloadBlob(rec.name, rec.blob);
      URL.revokeObjectURL(url);
      return;
    }
    w.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function deleteFiles(ids) {
    if (!ids.length) return;
    if (!confirm(`Переместить ${ids.length} файл(ов) в корзину? Файлы исчезнут из библиотеки; ссылки в задачах сохранятся и снова заработают после восстановления.`)) return;
    const all = await loadFiles();
    let moved = 0;
    for (const id of ids) {
      const rec = all.find(f => f.id === id);
      if (!rec) continue;
      App.state.trash.push({
        id: App.uid(), type: 'file', refId: rec.id,
        data: { name: rec.name, size: rec.size, type: rec.type, folderId: rec.folderId || null, addedAt: rec.addedAt || Date.now() },
        deletedAt: Date.now(),
      });
      checkedFiles.delete(id);
      moved++;
    }
    App.save();
    await renderFileList();
    App.toast(`В корзину перемещено файлов: ${moved}`, 'success');
  }

  async function moveChecked(targetFolderId) {
    if (!checkedFiles.size) { App.toast('Отметьте файлы для перемещения', 'error'); return; }
    let moved = 0;
    for (const id of Array.from(checkedFiles)) {
      const rec = await FileStore.get(id).catch(() => null);
      if (!rec) continue;
      rec.folderId = targetFolderId || null;
      await FileStore.put(rec);
      moved++;
    }
    checkedFiles.clear();
    await renderFileList();
    App.toast(`Перемещено файлов: ${moved}`, 'success');
  }

  /* ---------- Окно выбора файлов для задачи ---------- */

  async function openFilePicker() {
    if (!(await FileStore.isSupported())) {
      App.toast('Библиотека файлов недоступна в этом браузере', 'error');
      return;
    }
    pickerChecked.clear();
    document.getElementById('filePickerSearch').value = '';
    await renderPickerList();
    openModal('filePickerModal');
  }

  async function renderPickerList() {
    const box = document.getElementById('filePickerList');
    const q = (document.getElementById('filePickerSearch').value || '').trim().toLowerCase();
    let all = await loadFiles();
    const trashed = trashedFileIds();
    all = all.filter(f => !trashed.has(f.id));
    if (q) all = all.filter(f => f.name.toLowerCase().includes(q));
    all.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    if (!all.length) {
      box.innerHTML = '<p class="muted" style="font-size:12px;text-align:center;padding:16px">' +
        (q ? 'Ничего не найдено' : 'Библиотека пуста. Добавьте файлы через 🗂 Файлы или кнопку «📎 Файл с диска».') + '</p>';
      return;
    }
    box.innerHTML = all.map(f => `
      <div class="picker-item">
        <input type="checkbox" ${pickerChecked.has(f.id) ? 'checked' : ''} data-picker-check="${f.id}">
        <span>${fileIcon(f.type, f.name)}</span>
        <span class="picker-name">${App.esc(f.name)}</span>
        <span class="muted" style="font-size:11px">${fmtSize(f.size)}</span>
      </div>`).join('');
  }

  /* ---------- События ---------- */

  function init() {
    document.getElementById('btnFiles').addEventListener('click', async () => {
      selectedFolderId = null;
      checkedFiles.clear();
      renderFileFolderTree();
      await renderFileList();
      openModal('fileModal');
    });

    // Дерево папок файлов
    document.getElementById('fileFolderTree').addEventListener('click', async (e) => {
      const row = e.target.closest('.file-folder-row');
      if (!row) return;
      const fid = row.dataset.ffid || null;
      const toggle = e.target.closest('[data-ff-toggle]');
      const rename = e.target.closest('[data-ff-rename]');
      const del = e.target.closest('[data-ff-del]');

      if (toggle) {
        const f = fileFolders().find(x => x.id === fid);
        if (f) { f.collapsed = !f.collapsed; App.save(); renderFileFolderTree(); }
        return;
      }
      if (rename) {
        const f = fileFolders().find(x => x.id === fid);
        const name = prompt('Новое название папки файлов:', f?.name || '');
        if (name && name.trim() && f) { f.name = name.trim(); App.save(); renderFileFolderTree(); }
        return;
      }
      if (del) {
        const f = fileFolders().find(x => x.id === fid);
        if (!f) return;
        if (!confirm(`Удалить папку файлов «${f.name}»? Файлы будут перенесены в корень, папка попадёт в корзину.`)) return;
        const ids = ffDescendants(f.id);
        const all = await loadFiles();
        const trashed = trashedFileIds();
        for (const rec of all) {
          if (ids.includes(rec.folderId) && !trashed.has(rec.id)) {
            rec.folderId = null;
            await FileStore.put(rec).catch(() => {});
          }
        }
        const removed = fileFolders().filter(x => ids.includes(x.id));
        removed.forEach(x => {
          App.state.trash.push({ id: App.uid(), type: 'fileFolder', refId: x.id, data: { ...x }, deletedAt: Date.now() });
        });
        App.state.fileFolders = fileFolders().filter(x => !ids.includes(x.id));
        if (selectedFolderId && ids.includes(selectedFolderId)) selectedFolderId = null;
        App.save();
        renderFileFolderTree();
        await renderFileList();
        App.toast('Папка файлов перемещена в корзину', 'success');
        return;
      }
      selectedFolderId = fid;
      renderFileFolderTree();
      await renderFileList();
    });

    document.getElementById('btnNewFileFolder').addEventListener('click', () => {
      const name = prompt('Название новой папки файлов:');
      if (!name || !name.trim()) return;
      App.state.fileFolders.push({ id: crypto.randomUUID(), name: name.trim(), parentId: null, collapsed: false });
      App.save();
      renderFileFolderTree();
    });

    // Список файлов
    document.getElementById('fileList').addEventListener('click', async (e) => {
      const open = e.target.closest('[data-file-open]');
      const dl = e.target.closest('[data-file-download]');
      const del = e.target.closest('[data-file-del]');
      if (open) { await openFile(open.dataset.fileOpen); return; }
      if (dl) { await downloadFile(dl.dataset.fileDownload); return; }
      if (del) { await deleteFiles([del.dataset.fileDel]); }
    });

    document.getElementById('fileList').addEventListener('change', (e) => {
      const id = e.target.dataset.fileCheck;
      if (!id) return;
      if (e.target.checked) checkedFiles.add(id);
      else checkedFiles.delete(id);
    });

    document.getElementById('fileSearchInput').addEventListener('input', () => renderFileList());

    document.getElementById('btnAddFiles').addEventListener('click', () => document.getElementById('filePickerInput').click());
    document.getElementById('filePickerInput').addEventListener('change', (e) => {
      addFilesFromInput(e.target.files);
      e.target.value = '';
    });
    document.getElementById('btnMoveFiles').addEventListener('click', () => {
      const target = document.getElementById('fileMoveTarget').value || null;
      moveChecked(target);
    });

    // Окно выбора файлов для задачи
    document.getElementById('btnPickLibraryFile').addEventListener('click', () => openFilePicker());
    document.getElementById('filePickerSearch').addEventListener('input', () => renderPickerList());
    document.getElementById('filePickerList').addEventListener('change', (e) => {
      const id = e.target.dataset.pickerCheck;
      if (!id) return;
      if (e.target.checked) pickerChecked.add(id);
      else pickerChecked.delete(id);
    });
    document.getElementById('btnFilePickerAdd').addEventListener('click', async () => {
      const all = await loadFiles();
      const selected = all.filter(f => pickerChecked.has(f.id));
      const added = App.addLibraryLinksToTaskDraft(selected.map(f => ({ id: f.id, name: f.name, size: f.size })));
      closeModal('filePickerModal');
      App.toast(`Файлов прикреплено: ${added}`, 'success');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
