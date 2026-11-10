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
  // 端末の現在時刻 HH:MM
  function clockStr() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
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

  function renderChips() {
    const today = todayStr();
    const open = state.tasks.filter((t) => !t.done);
    const chip = (view, label, count) =>
      `<button class="chip" data-view="${view}" aria-current="${state.view === view}">${esc(label)}${count ? `<span class="count">${count}</span>` : ''}</button>`;
    els.chips.innerHTML =
      chip('today', '今日', open.filter((t) => t.date && t.date <= today).length) + chip('upcoming', '予定') +
      state.lists.map((l) => chip('list:' + l.id, l.name, open.filter((t) => t.listId === l.id).length)).join('') +
      `<button class="chip add" data-action="new-list">＋ リスト</button>`;
  }

  function render() {
    const v = viewInfo();
    renderChips();
    els.listMenuBtn.hidden = !v.list || v.list.id === 'inbox';

    const tasks = state.tasks.filter(v.filter).sort(sortTasks);
    const imp = tasks.filter((t) => t.important);
    const todo = tasks.filter((t) => !t.important);

    els.main.innerHTML =
      `<div class="label-row"><span class="label">Important Task</span><span class="brand">${esc(v.name)}<small>${shortDate(todayStr())} <span class="clock">${clockStr()}</span></small></span></div>` +
      rows('important', imp, v.hide) +
      `<div class="label-row"><span class="label">ToDo List</span></div>` +
      rows('todo', todo, v.hide);

    if (document.activeElement !== els.memo) els.memo.value = state.memos[state.view] || '';

    const doneCount = tasks.filter((t) => t.done).length;
    els.foot.innerHTML = `<span>→ なぞって完了　← なぞって削除　長押しで編集</span>` + (doneCount ? `<button data-action="clear-done">済みを消す（${doneCount}）</button>` : '');
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
      <div class="del-bg" aria-hidden="true"><span>削除</span></div>
      <div class="slide">
        <button class="box" data-action="toggle" aria-label="${t.done ? '未完了に戻す' : '完了にする'}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>
        <div class="text"><span class="t">${esc(t.title)}</span><span class="meta">${meta.join(' ')}</span></div>
        <span class="strike"></span>
      </div>
    </li>`;
  }

  // ---------- 空行に直接書く ----------
  // 入力欄は1つを使い回す。Enterで追加したら、入力欄はそのままに上へタスク行を差し込む。
  // （入力欄を作り直すと、スマホのキーボードが確定した文字を新しい欄にもう一度入れて二重追加になるため）
  function startInline(row) {
    const section = row.dataset.section;
    const ul = row.parentElement;
    row.classList.remove('blank');
    row.classList.add('editor');
    row.innerHTML = `<span class="box ghost"></span><form class="inline-form" autocomplete="off"><input class="inline-input" type="text" enterkeyhint="enter"
      placeholder="${section === 'important' ? '重要なことを書く' : '例: 明日15時 歯医者'}"></form><span class="meta"></span>`;
    const form = row.querySelector('form');
    const input = row.querySelector('input');
    const meta = row.querySelector('.meta');
    let closed = false;
    let composing = false;
    let compositionEndedAt = -Infinity;
    let last = null; // 直前に追加した文字と時刻

    // 日本語変換中かどうかを自前で管理（iPhoneのSafariは確定のEnterを普通のEnterとして送ってくるため）
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; compositionEndedAt = performance.now(); });

    const updateMeta = () => {
      const v = input.value.trim();
      if (!v) { meta.textContent = ''; return; }
      const p = parseTask(v);
      meta.textContent = [p.date && dateLabel(p.date), p.time, p.repeat && '↻' + REPEAT_LABEL[p.repeat], p.list && '#' + p.list].filter(Boolean).join(' ');
    };
    input.addEventListener('input', () => {
      // 追加した直後に、同じ文字がキーボードから勝手に入ってきたら消す
      if (last && performance.now() - last.at < 1200 && input.value.trim() === last.text) input.value = '';
      updateMeta();
    });

    const placeRow = (t) => {
      const target = els.main.querySelector(`.rows.${t.important ? 'important' : 'todo'}`);
      const tmp = document.createElement('ul');
      tmp.innerHTML = taskRow(t, viewInfo().hide);
      target.insertBefore(tmp.firstElementChild, target === ul ? row : target.querySelector('.row.blank'));
      // 空行を1つ減らす（紙の行数を保つ。最低1行は空ける）
      const sec = target.classList.contains('important') ? 'important' : 'todo';
      const blanks = target.querySelectorAll('.row.blank');
      const empties = blanks.length + (target === ul ? 1 : 0);
      if (blanks.length && empties > Math.max(MIN_ROWS[sec] - target.querySelectorAll('.row.task').length, 1)) blanks[blanks.length - 1].remove();
    };
    const commit = () => {
      const v = input.value.trim();
      input.value = '';
      meta.textContent = '';
      if (!v) return;
      // 直前に追加したものと同じ文字なら追加しない。
      // スマホのキーボードは確定済みの文字を覚えていて、Enterを連打すると同じ文字を何度も入れ直してくるため。
      if (last && v === last.text) return;
      last = { text: v, at: performance.now() };
      const r = addTask(v, section === 'important');
      if (r && r.visible) placeRow(r.task);
      renderChips();
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // 日本語変換の確定Enterは無視（変換終了直後のEnterも確定扱い）
      if (composing || performance.now() - compositionEndedAt < 150) return;
      commit();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; input.blur(); }
    });
    input.addEventListener('blur', () => {
      if (closed) return;
      closed = true;
      commit();
      render();
    });
    input.focus();
  }

  // 同じ内容が短時間に2回来たら1回だけ追加する（念のための二重追加防止）
  let lastAdd = null;
  function addTask(raw, important) {
    const key = raw + '|' + !!important;
    if (lastAdd && lastAdd.key === key && Date.now() - lastAdd.at < 1500) { lastAdd.at = Date.now(); return null; } // 連打中はずっと防ぐ
    lastAdd = { key, at: Date.now() };

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
    return { task: t, visible: !!visible };
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

  // ---------- 削除 ----------
  function deleteTask(id, li) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const snap = snapshot(t);
    const index = state.tasks.indexOf(t);
    state.tasks.splice(index, 1);
    save();
    if (navigator.vibrate) navigator.vibrate(12);
    toast('削除しました', () => { state.tasks.splice(index, 0, snap); save(); render(); });
    if (li) {
      li.style.height = li.offsetHeight + 'px';
      li.classList.add('removing');
      requestAnimationFrame(() => { li.style.height = '0px'; });
      setTimeout(render, 260);
    } else render();
  }

  // ---------- なぞる（→完了 / ←削除）・長押し（編集） ----------
  const LONG_PRESS_MS = 500;
  let drag = null, suppressClick = false;
  const blockClicks = (ms) => { suppressClick = true; setTimeout(() => (suppressClick = false), ms); };

  els.main.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.row.task');
    if (!li || e.button > 0) return;
    const strike = li.querySelector('.strike');
    drag = {
      li, strike, slide: li.querySelector('.slide'), bg: li.querySelector('.del-bg'),
      x: e.clientX, y: e.clientY, id: e.pointerId, mode: null, p: 0,
      w: li.clientWidth, sw: strike.offsetWidth || li.clientWidth /* transformの影響を受けない幅 */,
      done: li.classList.contains('done'),
    };
    // 長押しで編集
    drag.timer = setTimeout(() => {
      if (!drag || drag.mode) return;
      const id = drag.li.dataset.id;
      drag = null;
      blockClicks(600);
      if (navigator.vibrate) navigator.vibrate(15);
      openEdit(id);
    }, LONG_PRESS_MS);
  });
  els.main.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.mode) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(drag.timer); // 動いたら長押しではない
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // 縦スクロール
      if (Math.abs(dx) < 10) return;
      if (dx > 0 && drag.done) { drag = null; return; } // 完了済みを右へ → 何もしない
      drag.mode = dx > 0 ? 'strike' : 'delete';
      try { drag.li.setPointerCapture(e.pointerId); } catch (err) { /* 取得できなくても続行 */ }
      drag.strike.style.transition = 'none';
      drag.slide.style.transition = 'none';
    }
    if (drag.mode === 'strike') {
      drag.p = Math.max(0, Math.min(1, (dx - 4) / (drag.sw * 0.85)));
      drag.strike.style.transform = `rotate(-.6deg) scaleX(${drag.p})`;
    } else {
      const off = Math.min(0, dx);
      drag.slide.style.transform = `translateX(${off}px)`;
      drag.bg.style.width = -off + 'px';
      drag.p = -off / drag.w;
      drag.li.classList.toggle('will-delete', drag.p > 0.35);
    }
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    clearTimeout(drag.timer);
    const d = drag; drag = null;
    if (!d.mode) return;
    blockClicks(80);
    const id = d.li.dataset.id;
    if (d.mode === 'strike') {
      d.strike.style.transition = 'transform .2s ease';
      if (d.p > 0.6 && e.type === 'pointerup') {
        d.strike.style.transform = 'rotate(-.6deg) scaleX(1)';
        complete(id, d.li, true);
      } else {
        d.strike.style.transform = '';
        setTimeout(() => { d.strike.style.transition = ''; }, 220);
      }
    } else {
      d.slide.style.transition = 'transform .2s ease';
      d.bg.style.transition = 'width .2s ease';
      if (d.p > 0.35 && e.type === 'pointerup') {
        d.slide.style.transform = 'translateX(-100%)';
        d.bg.style.width = '100%';
        deleteTask(id, d.li);
      } else {
        d.slide.style.transform = '';
        d.bg.style.width = '0px';
        d.li.classList.remove('will-delete');
      }
    }
  }
  els.main.addEventListener('pointerup', endDrag);
  els.main.addEventListener('pointercancel', endDrag);
  els.main.addEventListener('contextmenu', (e) => { if (e.target.closest('.row.task')) e.preventDefault(); }); // 長押しメニューを出さない

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
    dialogOpenedAt = performance.now();
  }
  let dialogOpenedAt = 0;
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
  els.dialog.addEventListener('click', (e) => {
    // 長押しで開いた直後の指離れで閉じないように
    if (e.target === els.dialog && performance.now() - dialogOpenedAt > 600) els.dialog.close();
  });
  els.deleteBtn.addEventListener('click', () => {
    els.dialog.close();
    deleteTask(editingId);
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
    // 文字のタップでは何もしない（誤タップ防止）。編集は長押し。
    if (el.dataset.action === 'toggle') {
      li.classList.contains('done') ? uncomplete(li.dataset.id, li) : complete(li.dataset.id, li);
    }
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
  // ---------- 端末の時計に合わせる ----------
  // 日付が変わっていたら描き直し、変わっていなければ時刻表示だけ更新する
  let lastDay = todayStr();
  function syncClock(forceRender) {
    const day = todayStr();
    if ((day !== lastDay || forceRender) && !typing()) {
      lastDay = day;
      render();
    } else {
      document.querySelectorAll('.brand .clock').forEach((el) => { el.textContent = clockStr(); });
    }
    checkReminders();
  }
  // 分が変わるちょうどのタイミングで更新（端末の時計とずれないように）
  (function scheduleTick() {
    setTimeout(() => { syncClock(false); scheduleTick(); }, 60000 - (Date.now() % 60000) + 50);
  })();
  // バックグラウンドから戻ったとき（iPhoneのホーム画面アプリは visibilitychange が来ないことがあるので複数で拾う）
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncClock(true); });
  window.addEventListener('pageshow', () => syncClock(true));
  window.addEventListener('focus', () => syncClock(false));
  document.addEventListener('pointerdown', () => { if (todayStr() !== lastDay) syncClock(false); }, true);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  render();
  checkReminders();
})();
