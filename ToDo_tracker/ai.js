'use strict';

/* =====================================================
   TaskFlow — интеграция с AI DeepSeek
   Ключ хранится локально в localStorage (settings.aiKey).
   ===================================================== */

const AI = (() => {

  const SYSTEM_PROMPT = 'Ты — интеллектуальный ассистент трекера рабочих задач. Отвечай на русском языке, кратко и по делу.';

  function cfg() {
    return App.getSettings();
  }

  function baseUrl() {
    return (cfg().aiBaseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  }

  function assertKey() {
    if (!cfg().aiKey || !cfg().aiKey.trim()) {
      const err = new Error('Сначала укажите API-ключ DeepSeek (кнопка «✨ AI DeepSeek» → Настройки).');
      err.code = 'NO_KEY';
      throw err;
    }
  }

  async function chat(messages, opts = {}) {
    assertKey();
    const s = cfg();
    const isReasoner = s.aiModel === 'deepseek-reasoner';
    const body = {
      model: s.aiModel || 'deepseek-chat',
      messages,
      stream: false,
    };
    if (opts.json && !isReasoner) body.response_format = { type: 'json_object' };
    if (!isReasoner) body.temperature = opts.temperature ?? 0.3;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout || 90000);

    let res;
    try {
      res = await fetch(baseUrl() + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + s.aiKey.trim(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const err = new Error(e.name === 'AbortError'
        ? 'Превышено время ожидания ответа от DeepSeek (90 с). Попробуйте ещё раз или выберите модель deepseek-chat.'
        : 'Ошибка сети при обращении к API DeepSeek. Проверьте интернет-соединение. Если страница открыта как file://, откройте её в Chrome/Edge (современной версии) — либо через локальный сервер: python -m http.server');
      err.code = 'NETWORK';
      throw err;
    }
    clearTimeout(timer);

    if (!res.ok) {
      let msg = `Ошибка API: HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error?.message) msg = j.error.message;
      } catch (_) { /* ignore */ }
      if (res.status === 401) msg = 'Неверный API-ключ DeepSeek. Проверьте ключ в настройках.';
      if (res.status === 402) msg = 'Недостаточно средств на балансе DeepSeek (HTTP 402).';
      const err = new Error(msg);
      err.code = 'API';
      throw err;
    }

    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('Пустой ответ от API');
    return text;
  }

  function extractJson(text) {
    let s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(s); } catch (_) { /* try harder */ }
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch (_) { /* give up */ }
    }
    throw new Error('Не удалось разобрать JSON из ответа модели');
  }

  function withBusy(btn, busyText, fn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyText;
    return Promise.resolve()
      .then(fn)
      .finally(() => { btn.disabled = false; btn.textContent = original; });
  }

  /* ---------- Функции AI ---------- */

  async function ping() {
    assertKey();
    let res;
    try {
      res = await fetch(baseUrl() + '/models', {
        headers: { 'Authorization': 'Bearer ' + cfg().aiKey.trim() },
      });
    } catch (e) {
      throw new Error('Ошибка сети. Проверьте интернет и откройте страницу в Chrome/Edge (или через локальный сервер).');
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      const j = await res.json().catch(() => ({}));
      if (j?.error?.message) msg = j.error.message;
      if (res.status === 401) msg = 'Неверный API-ключ.';
      throw new Error(msg);
    }
    const j = await res.json();
    const ids = (j.data || []).map(m => m.id).join(', ') || 'модели недоступны';
    return `Подключение успешно ✅ Доступные модели: ${ids}`;
  }

  async function summarize(text) {
    if (!text.trim()) throw new Error('Описание пустое — нечего суммаризировать');
    const out = await chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Суммаризируй описание рабочей задачи в 3–5 коротких пунктов на русском. Сохрани суть, сроки, цифры и имена.\n\nЗадача:\n${text.trim().slice(0, 4000)}` },
    ], { temperature: 0.2 });
    return out.trim();
  }

  async function subtasksFrom(title, desc) {
    const text = [title, desc].filter(Boolean).join('\n');
    if (!text.trim()) throw new Error('Введите название или описание задачи');
    const out = await chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Разбей рабочую задачу на 3–8 конкретных подзадач. Верни строго JSON без пояснений:\n{"subtasks": [{"title": "…"}, …]}\n\nЗадача:\n${text.trim().slice(0, 4000)}` },
    ], { json: true });
    const data = extractJson(out);
    if (!Array.isArray(data.subtasks) || !data.subtasks.length) throw new Error('Модель не вернула подзадачи');
    return data.subtasks.filter(s => String(s.title || '').trim());
  }

  async function textToTasks(text) {
    if (text.trim().length < 10) throw new Error('Вставьте текст длиной хотя бы в пару предложений');
    const out = await chat([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Извлеки из текста все рабочие задачи (письма, протоколы, поручения). Верни строго JSON без пояснений:
{"tasks": [{"title": "краткое название", "description": "контекст из текста", "priority": "high|medium|low", "dueDate": "YYYY-MM-DD или null", "tags": ["метка"]}]}
Правила: title — глагол в инфинитиве, максимум 12 слов; description — только факты из текста; priority: high если есть слова «срочно/немедленно/важно» или жёсткий дедлайн; dueDate — только если дата явно указана в тексте (сегодня: ${todayIso()}).\n\nТекст:\n${text.trim().slice(0, 12000)}`,
      },
    ], { json: true, temperature: 0.1 });
    const data = extractJson(out);
    if (!Array.isArray(data.tasks) || !data.tasks.length) throw new Error('Модель не нашла задач в тексте');
    return data.tasks.filter(t => String(t.title || '').trim());
  }

  async function aiReport(summariesText) {
    const out = await chat([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Ты готовишь отчёт руководителю по списку рабочих задач. Составь краткий отчёт на русском в формате Markdown:
1) **Итоги** — 2–4 предложения о состоянии дел;
2) **Приоритеты** — что требует внимания в первую очередь;
3) **Риски** — просроченное и застрявшее;
4) **Рекомендации** — 2–3 конкретных совета.
Без воды, максимум 250 слов.\n\nДанные о задачах:\n${summariesText.slice(0, 14000)}`,
      },
    ], { temperature: 0.3 });
    return out.trim();
  }

  async function journalSummary(text) {
    if (text.trim().length < 20) throw new Error('Текст слишком короткий для резюме');
    const out = await chat([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Составь подробное резюме по записи журнала на русском, в формате Markdown:
1) **Краткое содержание** — 2–3 предложения;
2) **Ключевые темы** — списком;
3) **Решения** — что решено;
4) **Поручения** — кому, что и к какому сроку (если указано);
5) **Открытые вопросы и риски**.
Сохраняй факты, не выдумывай. Если чего-то нет в тексте — пропусти пункт.\n\nЗапись:\n${text.trim().slice(0, 16000)}`,
      },
    ], { temperature: 0.2 });
    return out.trim();
  }

  async function meetingMinutes(text) {
    if (text.trim().length < 20) throw new Error('Текст слишком короткий для протокола');
    const out = await chat([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Оформи протокол совещания на русском, в формате Markdown, по шаблону:
**Дата:** (если не указана — пропусти)
**Участники:** …
**Повестка:** …
**Обсуждение:** кратко по пунктам
**Решения:** …
**Поручения:** список «кому — что — срок»
**Следующее совещание:** (если указано)
Только факты из текста, ничего не выдумывай.\n\nСтенограмма / заметки:\n${text.trim().slice(0, 16000)}`,
      },
    ], { temperature: 0.2 });
    return out.trim();
  }

  async function kbAssist(text) {
    if (text.trim().length < 20) throw new Error('Текст слишком короткий');
    const out = await chat([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Преобразуй текст в структурированную статью для базы знаний на русском, в формате Markdown:
1) краткое введение (1–2 предложения);
2) разделы с подзаголовками ##;
3) шаги/факты — списками;
4) в конце — раздел **Важно** с ключевыми моментами, если есть.
Сохрани все факты и цифры.\n\nТекст:\n${text.trim().slice(0, 16000)}`,
      },
    ], { temperature: 0.3 });
    return out.trim();
  }

  /* ---------- Привязка к UI ---------- */

  function init() {
    // Настройки
    const keyInput = document.getElementById('aiKey');
    const modelInput = document.getElementById('aiModel');
    const baseInput = document.getElementById('aiBaseUrl');

    keyInput.value = cfg().aiKey || '';
    modelInput.value = cfg().aiModel || 'deepseek-chat';
    baseInput.value = cfg().aiBaseUrl || 'https://api.deepseek.com';

    keyInput.addEventListener('change', () => App.setSettings({ aiKey: keyInput.value.trim() }));
    modelInput.addEventListener('change', () => App.setSettings({ aiModel: modelInput.value }));
    baseInput.addEventListener('change', () => App.setSettings({ aiBaseUrl: baseInput.value.trim() || 'https://api.deepseek.com' }));

    document.getElementById('btnTestAi').addEventListener('click', async (e) => {
      const result = document.getElementById('aiTestResult');
      try {
        await App.setSettings({ aiKey: keyInput.value.trim() });
        const msg = await withBusy(e.currentTarget, '⏳ Проверяем…', ping);
        result.textContent = msg;
        result.style.color = 'var(--green)';
      } catch (err) {
        result.textContent = '❌ ' + err.message;
        result.style.color = 'var(--red)';
      }
    });

    // Заполнить выпадающий список папок для разбора текста
    const targetSelect = document.getElementById('aiTargetFolder');
    targetSelect.innerHTML = App.getFolderOptionsHtml('inbox');

    // Разбор текста → задачи
    let parsedTasks = [];
    document.getElementById('btnAiParse').addEventListener('click', async (e) => {
      const text = document.getElementById('aiText').value.trim();
      const outBox = document.getElementById('aiParseOutput');
      try {
        const tasks = await withBusy(e.currentTarget, '⏳ DeepSeek анализирует…', () => textToTasks(text));
        parsedTasks = tasks;
        document.getElementById('aiParseList').innerHTML = tasks.map((t, i) => `
          <div class="ai-parse-item">
            <input type="checkbox" checked data-parse-idx="${i}">
            <div>
              <div class="t">${App.esc(t.title || '')}</div>
              ${t.description ? `<div class="d">${App.esc(String(t.description).slice(0, 220))}</div>` : ''}
              ${t.dueDate ? `<div class="d">📅 срок: ${App.esc(t.dueDate)}</div>` : ''}
            </div>
          </div>`).join('');
        outBox.classList.remove('hidden');
        App.toast(`Найдено задач: ${tasks.length}`, 'success');
      } catch (err) {
        outBox.classList.add('hidden');
        App.toast(err.message, 'error');
      }
    });

    document.getElementById('btnAiApply').addEventListener('click', () => {
      const selected = parsedTasks.filter((_, i) =>
        document.querySelector(`[data-parse-idx="${i}"]`)?.checked);
      if (!selected.length) { App.toast('Отметьте хотя бы одну задачу', 'error'); return; }
      const folderId = targetSelect.value || 'inbox';
      const added = App.addTasksFromList(selected, folderId);
      document.getElementById('aiParseOutput').classList.add('hidden');
      document.getElementById('aiText').value = '';
      App.toast(`Добавлено задач: ${added}`, 'success');
    });

    // Кнопки в окне задачи
    document.getElementById('aiTaskSummarize').addEventListener('click', async (e) => {
      const desc = App.getTaskModalDraft().desc;
      try {
        const out = await withBusy(e.currentTarget, '⏳ Генерируем…', () => summarize(desc));
        App.setTaskModalDescription(out);
        App.toast('Описание суммаризировано', 'success');
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });

    document.getElementById('aiTaskSubtasks').addEventListener('click', async (e) => {
      const { title, desc } = App.getTaskModalDraft();
      try {
        const subs = await withBusy(e.currentTarget, '⏳ Генерируем…', () => subtasksFrom(title, desc));
        App.setTaskModalSubtasks(subs);
        App.toast(`Подзадач: ${subs.length}`, 'success');
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });

    // ---------- AI-отчёт с выбором задач ----------
    let aiReportText = '';
    let aiReportIds = [];
    const scopeSel = document.getElementById('aiReportScope');
    const folderSel = document.getElementById('aiReportFolder');
    const scopeCount = document.getElementById('aiScopeCount');
    const pickerBox = document.getElementById('aiReportPicker');
    const outBox = document.getElementById('aiReportOutput');
    const copyBtn = document.getElementById('btnCopyAiReport');
    const dlBtn = document.getElementById('btnDownloadAiReport');
    const dlHtmlBtn = document.getElementById('btnDownloadAiReportHtml');

    function fillScopeFolderOptions() {
      folderSel.innerHTML = App.getFolderOptionsHtml(App.state.folders[0]?.id);
    }

    function updateScope() {
      const scope = scopeSel.value;
      folderSel.classList.toggle('hidden', scope !== 'folder');
      pickerBox.classList.toggle('hidden', scope !== 'select');
      if (scope === 'select') {
        renderScopePicker();
        return;
      }
      const tasks = App.getScopeTasks(scope, folderSel.value);
      aiReportIds = tasks.map(t => t.id);
      scopeCount.textContent = tasks.length ? `Будет проанализировано задач: ${tasks.length}` : 'Нет задач для отчёта';
    }

    function renderScopePicker() {
      const tasks = App.state.tasks.slice().sort((a, b) => {
        const fa = (App.state.folders.find(f => f.id === a.folderId)?.name || '');
        const fb = (App.state.folders.find(f => f.id === b.folderId)?.name || '');
        return fa.localeCompare(fb, 'ru') || a.title.localeCompare(b.title, 'ru');
      });
      aiReportIds = tasks.map(t => t.id);
      if (!tasks.length) {
        pickerBox.innerHTML = '<p class="muted" style="font-size:12px">Нет задач</p>';
        scopeCount.textContent = '';
        return;
      }
      pickerBox.innerHTML = `
        <div class="picker-toolbar">
          <label><input type="checkbox" id="aiPickerAll" checked> Выбрать все</label>
          <span class="muted" id="aiPickerCount"></span>
        </div>` +
        tasks.map(t => {
          const f = App.state.folders.find(x => x.id === t.folderId);
          return `
          <div class="picker-item">
            <input type="checkbox" checked data-ai-pick="${t.id}">
            <span>${App.esc(t.title)}</span>
            <span class="muted" style="font-size:11px">${App.esc(f?.name || '')}</span>
          </div>`;
        }).join('');
      updatePickerCount();
      scopeCount.textContent = '';
    }

    function updatePickerCount() {
      const boxes = pickerBox.querySelectorAll('[data-ai-pick]');
      const n = Array.from(boxes).filter(b => b.checked).length;
      const c = document.getElementById('aiPickerCount');
      if (c) c.textContent = `Отмечено: ${n} из ${boxes.length}`;
    }

    pickerBox.addEventListener('change', (e) => {
      if (e.target.id === 'aiPickerAll') {
        pickerBox.querySelectorAll('[data-ai-pick]').forEach(b => { b.checked = e.target.checked; });
      }
      updatePickerCount();
      aiReportIds = Array.from(pickerBox.querySelectorAll('[data-ai-pick]:checked')).map(b => b.dataset.aiPick);
    });

    scopeSel.addEventListener('change', updateScope);
    folderSel.addEventListener('change', updateScope);
    fillScopeFolderOptions();
    updateScope();

    document.getElementById('btnAiReport').addEventListener('click', async (e) => {
      try {
        if (!cfg().aiKey) {
          outBox.innerHTML = `<p>Сначала укажите API-ключ DeepSeek.</p>
            <button class="btn btn-ai btn-sm" id="aiGoSettings">⚙️ Открыть настройки AI</button>`;
          document.getElementById('aiGoSettings').addEventListener('click', () => App.openAiSettings());
          App.toast('Укажите API-ключ DeepSeek в настройках', 'error');
          return;
        }
        if (!aiReportIds.length) {
          App.toast('Нет задач для отчёта — измените область выбора', 'error');
          return;
        }
        const data = App.getTaskSummariesByIds(aiReportIds);
        const text = await withBusy(e.currentTarget, '⏳ DeepSeek готовит отчёт…', () => aiReport(data));
        aiReportText = text;
        outBox.textContent = text;
        copyBtn.classList.remove('hidden');
        dlBtn.classList.remove('hidden');
        dlHtmlBtn.classList.remove('hidden');
      } catch (err) {
        outBox.textContent = '❌ ' + err.message;
        App.toast(err.message, 'error');
      }
    });

    document.getElementById('btnCopyAiReport').addEventListener('click', async () => {
      const ok = await App.copyText(aiReportText);
      App.toast(ok ? 'AI-отчёт скопирован' : 'Не удалось скопировать', ok ? 'success' : 'error');
    });
    document.getElementById('btnDownloadAiReport').addEventListener('click', () => {
      App.download('ai-отчёт-' + new Date().toISOString().slice(0, 10) + '.md', aiReportText, 'text/markdown');
    });
    dlHtmlBtn.addEventListener('click', () => {
      const doc = App.markdownToHtmlDoc('AI-отчёт по задачам — TaskFlow', aiReportText);
      App.download('ai-отчёт-' + new Date().toISOString().slice(0, 10) + '.html', doc, 'text/html');
      App.toast('HTML-отчёт сохранён', 'success');
    });

    // ---------- AI для журнала и базы знаний ----------

    document.getElementById('btnJournalSummary').addEventListener('click', async (e) => {
      const text = App.getNoteDraft().text;
      try {
        const out = await withBusy(e.currentTarget, '⏳ DeepSeek анализирует…', () => journalSummary(text));
        App.showJournalAiOutput(out);
        App.toast('Резюме готово', 'success');
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });

    document.getElementById('btnJournalMinutes').addEventListener('click', async (e) => {
      const text = App.getNoteDraft().text;
      try {
        const out = await withBusy(e.currentTarget, '⏳ DeepSeek оформляет протокол…', () => meetingMinutes(text));
        App.showJournalAiOutput(out);
        App.toast('Протокол готов', 'success');
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });

    document.getElementById('btnJournalToTasks').addEventListener('click', () => {
      const text = App.getNoteDraft().text;
      if (!text) { App.toast('Введите текст заметки', 'error'); return; }
      App.openAiParseWithText(text);
      App.toast('Текст передан в «Разбор текста → задачи»', 'success');
    });

    document.getElementById('btnKbAssist').addEventListener('click', async (e) => {
      const content = App.getKbDraft().content;
      try {
        const out = await withBusy(e.currentTarget, '⏳ DeepSeek структурирует…', () => kbAssist(content));
        App.showKbAiOutput(out);
        App.toast('Статья структурирована', 'success');
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
  }

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  return { init, ping, summarize, subtasksFrom, textToTasks, aiReport, journalSummary, meetingMinutes, kbAssist };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', AI.init);
} else {
  AI.init();
}
