(function () {
  'use strict';
  const { parseTask, nextDueDate, fmtDate, parseDate, addDays, startOfDay } = window.TodoParser;

  const STORE_KEY = 'simple-todo-v1';
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  const REPEAT_LABEL = { daily: '毎日', weekdays: '平日', weekly: '毎週', monthly: '毎月', yearly: '毎年' };
  const MIN_ROWS = { important: 5, todo: 10 }; // 紙の罫線の最低行数

  const $ = (id) => document.getElementById(id);
  const els = {
    chips: $('chips'), main: $('main'), memo: $('memo'), foot: $('paperFoot'),
    notifyBtn: $('notifyBtn'), listMenuBtn: $('listMenuBtn'),
    dialog: $('editDialog'), editForm: $('editForm'), editTitle: $('editTitle'), editImportant: $('editImportant'),
    editDate: $('editDate'), editTime: $('editTime'), editRepeat: $('editRepeat'), editList: $('editList'),
    deleteBtn: $('deleteBtn'), cancelBtn: $('cancelBtn'),
    toast: $('toast'), toastText: $('toastText'), toastUndo: $('toastUndo'),
  };

  // ---------- 保存 ----------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.tasks) && Array.isArray(s.lists)) return s;
    } catch (e) { /* 壊れていたら初期化 */ }
    return { tasks: [], lists: [{ id: 'inbox', name: '受信箱' }], view: 'today' };
  }
  let state = load();
  state.memos = state.memos || {};
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('保存できませんでした（容量不足の可能性）'); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- 日付 ----------
  const todayStr = () => fmtDate(new Date());
  const doneToday = (t) => t.done && t.doneAt && fmtDate(new Date(t.doneAt)) === todayStr();
  function dateLabel(ds) {
    const d = parseDate(ds), t = startOfDay(new Date());
    const diff = Math.round((d - t) / 86400000);
    if (diff === 0) return '今日';
    if (diff === 1) return '明日';
    if (diff === -1) return '昨日';
    const sameYear = d.getFullYear() === t.getFullYear();
    return `${sameYear ? '' : d.getFullYear() + '/'}${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
  }
  function shortDate(ds) { const d = parseDate(ds); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`; }
  function esc(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  const listById = (id) => state.lists.find((l) => l.id === id) || state.lists[0];
  const sortTasks = (a, b) =>
    (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99').localeCompare(b.time || '99') || a.createdAt - b.createdAt;

  // ---------- 描画 ----------
  function viewInfo() {
    const today = todayStr();
    if (state.view === 'today') {
      return { name: '今日', sub: shortDate(today), filter: (t) => t.date && t.date <= today && (!t.done || doneToday(t)), hide: { today: true } };
    }
    if (state.view === 'upcoming') {
      return { name: '予定', sub: '明日以降', filter: (t) => t.date && t.date > today && (!t.done || doneToday(t)), hide: {} };
    }
    const list = state.lists.find((l) => 'list:' + l.id === state.view);
    if (!list) { state.view = 'today'; return viewInfo(); }
    return { name: list.name, sub: 'リスト', list, filter: (t) => t.listId === list.id, hide: { list: true } };
  }

  function render() {
    const today = todayStr();
    const open = state.tasks.filter((t) => !t.done);
    const v = viewInfo();

    const chip = (view, label, count) =>
      `<button class="chip" data-view="${view}" aria-current="${state.view === view}">${esc(label)}${count ? `<span class="count">${count}</span>` : ''}</button>`;
    els.chips.innerHTML =
      chip('today', '今日', open.filter((t) => t.date && t.date <= today).length) + chip('upcoming', '予定') +
      state.lists.map((l) => chip('list:' + l.id, l.name, open.filter((t) => t.listId === l.id).length)).join('') +
      `<button class="chip add" data-action="new-list">＋ リスト</button>`;
    els.listMenuBtn.hidden = !v.list || v.list.id === 'inbox';

    const tasks = state.tasks.filter(v.filter).sort(sortTasks);
    const imp = tasks.filter((t) => t.important);
    const todo = tasks.filter((t) => !t.important);

    els.main.innerHTML =
      `<div class="label-row"><span class="label">Important Task</span><span class="brand">${esc(v.name)}<small>${esc(v.sub)}</small></span></div>` +
      rows('important', imp, v.hide) +
      `<div class="label-row"><span class="label">ToDo List</span></div>` +
      rows('todo', todo, v.hide);

    if (document.activeElement !== els.memo) els.memo.value = state.memos[state.view] || '';

    const doneCount = tasks.filter((t) => t.done).length;
    els.foot.innerHTML = `<span>左→右になぞると完了</span>` + (doneCount ? `<button data-action="clear-done">済みを消す（${doneCount}）</button>` : '');
    updateNotifyBtn();
  }

  function rows(section, tasks, hide) {
    const blanks = Math.max(MIN_ROWS[section] - tasks.length, 1);
    return `<ul class="rows ${section}">` +
      tasks.map((t) => taskRow(t, hide)).join('') +
      `<li class="row blank" data-section="${section}"><span class="box ghost"></span></li>`.repeat(blanks) +
      '</ul>';
  }

  function taskRow(t, hide) {
    const meta = [];
    if (t.date) {
      const label = dateLabel(t.date);
      const late = !t.done && t.date < todayStr();
      const dateText = hide.today && label === '今日' ? '' : label;
      const s = [dateText, t.time].filter(Boolean).join(' ');
      if (s) meta.push(late ? `<span class="late">${s}</span>` : s);
    }
    if (t.repeat) meta.push('↻' + REPEAT_LABEL[t.repeat]);
    if (!hide.list && t.listId !== 'inbox') meta.push('#' + esc(listById(t.listId).name));
    return `<li class="row task${t.done ? ' done' : ''}" data-id="${t.id}">
      <button class="box" data-action="toggle" aria-label="${t.done ? '未完了に戻す' : '完了にする'}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>
      <div class="text" data-action="edit"><span class="t">${esc(t.title)}</span><span class="meta">${meta.join(' ')}</span></div>
      <span class="strike"></span>
    </li>`;
  }

  // ---------- 空行に直接書く ----------
  function startInline(row) {
    const section = row.dataset.section;
    row.classList.remove('blank');
    row.innerHTML = `<span class="box ghost"></span><input class="inline-input" type="text" enterkeyhint="next" autocomplete="off"
      placeholder="${section === 'important' ? '重要なことを書く' : '例: 明日15時 歯医者'}"><span class="meta"></span>`;
    const input = row.querySelector('input');
    const meta = row.querySelector('.meta');
    let finished = false;

    input.addEventListener('input', () => {
      const v = input.value.trim();
      if (!v) { meta.textContent = ''; return; }
      const p = parseTask(v);
      meta.textContent = [p.date && dateLabel(p.date), p.time, p.repeat && '↻' + REPEAT_LABEL[p.repeat], p.list && '#' + p.list].filter(Boolean).join(' ');
    });
    const finish = (next) => {
      if (finished) return;
      finished = true;
      const v = input.value.trim();
      if (v) addTask(v, section === 'important');
      render();
      if (v && next) {
        const nextRow = els.main.querySelector(`.rows.${section} .row.blank`);
        if (nextRow) startInline(nextRow);
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 日本語変換の確定Enterは無視
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { input.value = ''; finish(false); }
    });
    input.addEventListener('blur', () => finish(false));
    input.focus();
  }

  function addTask(raw, important) {
    const p = parseTask(raw);
    let listId = state.view.startsWith('list:') ? state.view.slice(5) : 'inbox';
    if (p.list) {
      let l = state.lists.find((x) => x.name === p.list);
      if (!l) { l = { id: uid(), name: p.list }; state.lists.push(l); }
      listId = l.id;
    }
    let date = p.date;
    if (!date && state.view === 'today') date = todayStr();
    if (!date && state.view === 'upcoming') date = fmtDate(addDays(new Date(), 1));
    const t = {
      id: uid(), title: p.title, date, time: p.time, repeat: p.repeat, listId,
      important: !!(important || p.important), done: false, createdAt: Date.now(), notifiedFor: null,
    };
    state.tasks.push(t);
    save();

    const today = todayStr();
    const visible = state.view === 'today' ? date && date <= today
      : state.view === 'upcoming' ? date && date > today
        : state.view === 'list:' + listId;
    if (!visible) toast(`追加しました（${date ? dateLabel(date) : listById(listId).name}）`);
    else if (t.time && 'Notification' in window && Notification.permission === 'default') toast('時刻に通知するには右上の🔔をタップ');
  }

  // ---------- 完了・取り消し ----------
  let undoFn = null, toastTimer = null;
  function toast(text, undo) {
    els.toastText.textContent = text;
    undoFn = undo || null;
    els.toastUndo.hidden = !undo;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; undoFn = null; }, 4000);
  }
  els.toastUndo.addEventListener('click', () => { if (undoFn) undoFn(); undoFn = null; els.toast.hidden = true; });

  const snapshot = (t) => JSON.parse(JSON.stringify(t));
  function restore(snap) {
    const i = state.tasks.findIndex((x) => x.id === snap.id);
    if (i >= 0) state.tasks[i] = snap; else state.tasks.push(snap);
    save(); render();
  }

  function complete(id, li, alreadyDrawn) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t || t.done) return;
    const snap = snapshot(t);
    if (navigator.vibrate) navigator.vibrate(12);
    if (!alreadyDrawn) li.classList.add('striking');
    li.classList.add('done');
    if (t.repeat && t.date) {
      t.date = nextDueDate(t.date, t.repeat);
      t.notifiedFor = null;
      save();
      toast(`次回は ${dateLabel(t.date)}`, () => restore(snap));
      setTimeout(render, 700); // 線を見せてから次回へ移動
    } else {
      t.done = true; t.doneAt = Date.now();
      save();
      toast('完了！', () => restore(snap));
      setTimeout(render, 350);
    }
  }
  function uncomplete(id, li) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t || !t.done) return;
    t.done = false; t.doneAt = null;
    save();
    li.classList.remove('done');
    li.classList.add('unstriking');
    setTimeout(render, 260);
  }

  // ---------- なぞって横線 ----------
  let drag = null, suppressClick = false;
  els.main.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.row.task');
    if (!li || e.button > 0) return;
    const strike = li.querySelector('.strike');
    drag = { li, strike, x: e.clientX, y: e.clientY, w: strike.offsetWidth || li.clientWidth /* transformの影響を受けない幅 */, swiping: false, done: li.classList.contains('done'), p: 0, id: e.pointerId };
  });
  els.main.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.swiping) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // 縦スクロール
      if (Math.abs(dx) < 10) return;
      // 未完了は右へ、完了済みは左へなぞったときだけ反応
      if ((!drag.done && dx < 0) || (drag.done && dx > 0)) { drag = null; return; }
      drag.swiping = true;
      try { drag.li.setPointerCapture(e.pointerId); } catch (err) { /* 取得できなくても続行 */ }
      drag.strike.style.transition = 'none';
    }
    const reach = drag.w * 0.85;
    drag.p = drag.done ? Math.max(0, Math.min(1, 1 + dx / reach)) : Math.max(0, Math.min(1, (dx - 4) / reach));
    drag.strike.style.transform = `rotate(-.6deg) scaleX(${drag.p})`;
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.swiping) return;
    suppressClick = true; setTimeout(() => (suppressClick = false), 50);
    d.strike.style.transition = 'transform .2s ease';
    const id = d.li.dataset.id;
    if (!d.done && d.p > 0.6) {
      d.strike.style.transform = 'rotate(-.6deg) scaleX(1)';
      complete(id, d.li, true);
    } else if (d.done && d.p < 0.4) {
      d.strike.style.transform = 'rotate(-.6deg) scaleX(0)';
      uncomplete(id, d.li);
    } else {
      d.strike.style.transform = '';
      setTimeout(() => { d.strike.style.transition = ''; }, 220);
    }
  }
  els.main.addEventListener('pointerup', endDrag);
  els.main.addEventListener('pointercancel', endDrag);

  // ---------- 編集シート ----------
  let editingId = null;
  function openEdit(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    els.editTitle.value = t.title;
    els.editImportant.checked = !!t.important;
    els.editDate.value = t.date || '';
    els.editTime.value = t.time || '';
    els.editRepeat.value = t.repeat || '';
    els.editList.innerHTML = state.lists.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    els.editList.value = t.listId;
    els.dialog.showModal();
  }
  els.editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = state.tasks.find((x) => x.id === editingId);
    if (t) {
      t.title = els.editTitle.value.trim() || t.title;
      t.important = els.editImportant.checked;
      t.time = els.editTime.value || null;
      t.date = els.editDate.value || (t.time ? todayStr() : null);
      t.repeat = els.editRepeat.value || null;
      if (t.repeat && !t.date) t.date = todayStr();
      t.listId = els.editList.value;
      t.notifiedFor = null;
      save(); render();
    }
    els.dialog.close();
  });
  els.cancelBtn.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', (e) => { if (e.target === els.dialog) els.dialog.close(); });
  els.deleteBtn.addEventListener('click', () => {
    const t = state.tasks.find((x) => x.id === editingId);
    if (t) {
      const snap = snapshot(t);
      state.tasks = state.tasks.filter((x) => x.id !== editingId);
      save(); render();
      toast('削除しました', () => restore(snap));
    }
    els.dialog.close();
  });

  // ---------- リスト ----------
  function newList() {
    const name = (prompt('新しいリストの名前') || '').trim();
    if (!name) return;
    const l = { id: uid(), name };
    state.lists.push(l);
    state.view = 'list:' + l.id;
    save(); render();
  }
  els.listMenuBtn.addEventListener('click', () => {
    const list = listById(state.view.slice(5));
    if (!list || list.id === 'inbox') return;
    const name = prompt('リスト名を変更（空にすると削除）', list.name);
    if (name === null) return;
    if (name.trim()) { list.name = name.trim(); save(); render(); return; }
    const count = state.tasks.filter((t) => t.listId === list.id).length;
    if (!confirm(`「${list.name}」を削除しますか？\n中のタスク${count}件は受信箱に移動します。`)) return;
    state.tasks.forEach((t) => { if (t.listId === list.id) t.listId = 'inbox'; });
    state.lists = state.lists.filter((l) => l.id !== list.id);
    delete state.memos['list:' + list.id];
    state.view = 'list:inbox';
    save(); render();
  });

  // ---------- イベント ----------
  els.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.action === 'new-list') return newList();
    state.view = b.dataset.view;
    save(); render();
    window.scrollTo({ top: 0 });
  });
  els.main.addEventListener('click', (e) => {
    if (suppressClick) return;
    const blank = e.target.closest('.row.blank');
    if (blank) return startInline(blank);
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const li = el.closest('.row.task');
    if (el.dataset.action === 'toggle') {
      li.classList.contains('done') ? uncomplete(li.dataset.id, li) : complete(li.dataset.id, li);
    } else if (el.dataset.action === 'edit') openEdit(li.dataset.id);
  });
  els.foot.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="clear-done"]')) return;
    const v = viewInfo();
    const removed = state.tasks.filter((t) => t.done && v.filter(t));
    state.tasks = state.tasks.filter((t) => !(t.done && v.filter(t)));
    save(); render();
    toast(`${removed.length}件消しました`, () => { state.tasks.push(...removed); save(); render(); });
  });
  let memoTimer = null;
  els.memo.addEventListener('input', () => {
    clearTimeout(memoTimer);
    memoTimer = setTimeout(() => { state.memos[state.view] = els.memo.value; save(); }, 300);
  });
  els.memo.addEventListener('blur', () => { state.memos[state.view] = els.memo.value; save(); });

  // ---------- 通知 ----------
  function updateNotifyBtn() {
    els.notifyBtn.hidden = !('Notification' in window) || Notification.permission !== 'default';
  }
  els.notifyBtn.addEventListener('click', async () => {
    const r = await Notification.requestPermission();
    updateNotifyBtn();
    toast(r === 'granted' ? '通知をオンにしました' : '通知はオフのままです');
  });
  async function notify(t) {
    const body = `${dateLabel(t.date)} ${t.time}`;
    try {
      const reg = 'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration());
      if (reg) { await reg.showNotification(t.title, { body, tag: t.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }); return; }
    } catch (e) { /* フォールバック */ }
    new Notification(t.title, { body, tag: t.id, icon: 'icons/icon-192.png' });
  }
  function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = Date.now();
    let changed = false;
    for (const t of state.tasks) {
      if (t.done || !t.date || !t.time) continue;
      const key = t.date + 'T' + t.time;
      if (t.notifiedFor === key) continue;
      const [y, m, d] = t.date.split('-').map(Number);
      const [hh, mm] = t.time.split(':').map(Number);
      const due = new Date(y, m - 1, d, hh, mm).getTime();
      if (due <= now && now - due < 12 * 3600 * 1000) { notify(t); t.notifiedFor = key; changed = true; }
    }
    if (changed) save();
  }
  setInterval(checkReminders, 15000);

  // 入力中は描き直さない（書きかけが消えないように）
  const typing = () => document.activeElement && (document.activeElement.classList.contains('inline-input') || document.activeElement === els.memo);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { if (!typing()) render(); checkReminders(); }
  });
  let lastDay = todayStr();
  setInterval(() => { if (todayStr() !== lastDay && !typing()) { lastDay = todayStr(); render(); } }, 60000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  render();
  checkReminders();
})();
