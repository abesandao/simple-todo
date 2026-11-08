// 日本語の自然言語入力パーサー
// 例: 「明日15時 歯医者」「毎週月曜 ゴミ出し」「金曜までにレポート #仕事」
(function (global) {
  'use strict';

  const WD = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
  const P = '(?:までに|まで|には|に|の|から)?'; // 日付・時刻の後ろに付く助詞

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

  function normalize(s) {
    return s
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/：/g, ':')
      .replace(/／/g, '/')
      .replace(/　/g, ' ');
  }

  // 月日から「次に来るその日」を返す（過ぎていれば来年）
  function upcomingMonthDay(today, m, d) {
    let r = new Date(today.getFullYear(), m - 1, d);
    if (r < today) r = new Date(today.getFullYear() + 1, m - 1, d);
    return r;
  }
  // 日だけから「次に来るその日」を返す（過ぎていれば来月）
  function upcomingDay(today, d) {
    let r = new Date(today.getFullYear(), today.getMonth(), d);
    if (r < today) r = new Date(today.getFullYear(), today.getMonth() + 1, d);
    return r;
  }
  function nextWeekday(today, wd) { return addDays(today, (wd - today.getDay() + 7) % 7); }
  function weekStart(today) { return addDays(today, -((today.getDay() + 6) % 7)); } // 月曜始まり

  function parseTask(input, now) {
    now = now || new Date();
    const today = startOfDay(now);
    let text = ' ' + normalize(input) + ' ';
    let date = null, hour = null, minute = 0, repeat = null, list = null, period = null;
    const tokens = [];

    function take(re, fn) {
      const m = text.match(re);
      if (!m) return false;
      if (fn(m) === false) return false;
      tokens.push(m[0].trim());
      text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
      return true;
    }

    // リスト: #仕事
    take(/[#＃](\S+)/, (m) => { list = m[1]; });

    // 重要: 「!レポート」「レポート !」「重要 レポート」
    let important = false;
    take(/(?<=\s)[!！]+/, () => { important = true; }) ||
      take(/\s(重要|大事)(?=\s)/, () => { important = true; });

    // 繰り返し
    take(new RegExp('毎週([月火水木金土日])曜?日?' + P), (m) => { repeat = 'weekly'; date = nextWeekday(today, WD[m[1]]); }) ||
      take(new RegExp('毎月(\\d{1,2})日' + P), (m) => { repeat = 'monthly'; date = upcomingDay(today, +m[1]); }) ||
      take(new RegExp('(?:毎)?平日' + P), () => { repeat = 'weekdays'; }) ||
      take(new RegExp('毎朝' + P), () => { repeat = 'daily'; period = 'morning'; }) ||
      take(new RegExp('(毎晩|毎夜)' + P), () => { repeat = 'daily'; period = 'night'; }) ||
      take(new RegExp('毎日' + P), () => { repeat = 'daily'; }) ||
      take(new RegExp('毎週' + P), () => { repeat = 'weekly'; }) ||
      take(new RegExp('毎月' + P), () => { repeat = 'monthly'; }) ||
      take(new RegExp('毎年' + P), () => { repeat = 'yearly'; });

    // 時間帯ワード（今夜・今晩は日付も今日）
    take(new RegExp('(今夜|今晩)' + P), () => { period = 'night'; date = date || today; });
    // 「朝ごはん」などの誤検出を避けるため、後ろが空白・数字・助詞・末尾のときだけ
    take(new RegExp('(午前|午後|朝|昼|夕方|夜)(?=\\s|\\d|に|の|まで|から)' + P), (m) => {
      period = { 午前: 'am', 午後: 'pm', 朝: 'morning', 昼: 'noon', 夕方: 'evening', 夜: 'night' }[m[1]];
    });

    // 日付
    if (!date) {
      take(new RegExp('(今日|きょう|本日)' + P), () => { date = today; }) ||
        take(new RegExp('(明後日|あさって)' + P), () => { date = addDays(today, 2); }) ||
        take(new RegExp('(明日|あした|あす)' + P), () => { date = addDays(today, 1); }) ||
        take(new RegExp('(\\d+)日後' + P), (m) => { date = addDays(today, +m[1]); }) ||
        take(new RegExp('(\\d+)週間後' + P), (m) => { date = addDays(today, 7 * m[1]); }) ||
        take(new RegExp('再来週の?([月火水木金土日])曜日?' + P), (m) => { date = addDays(weekStart(today), 14 + (WD[m[1]] + 6) % 7); }) ||
        take(new RegExp('来週の?([月火水木金土日])曜日?' + P), (m) => { date = addDays(weekStart(today), 7 + (WD[m[1]] + 6) % 7); }) ||
        take(new RegExp('今週の?([月火水木金土日])曜日?' + P), (m) => { date = addDays(weekStart(today), (WD[m[1]] + 6) % 7); }) ||
        take(new RegExp('([月火水木金土日])曜日?' + P), (m) => { date = nextWeekday(today, WD[m[1]]); }) ||
        take(new RegExp('(今週末|週末)' + P), () => { date = nextWeekday(today, 6); }) ||
        take(new RegExp('再来週' + P), () => { date = addDays(weekStart(today), 14); }) ||
        take(new RegExp('来週' + P), () => { date = addDays(weekStart(today), 7); }) ||
        take(new RegExp('来月' + P), () => { date = new Date(today.getFullYear(), today.getMonth() + 1, 1); }) ||
        take(new RegExp('(\\d{1,2})月(\\d{1,2})日' + P), (m) => {
          if (+m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 31) return false;
          date = upcomingMonthDay(today, +m[1], +m[2]);
        }) ||
        take(new RegExp('(?<![\\d:])(\\d{1,2})/(\\d{1,2})(?![\\d:])' + P), (m) => {
          if (+m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 31) return false;
          date = upcomingMonthDay(today, +m[1], +m[2]);
        }) ||
        take(new RegExp('(?<![\\d月])(\\d{1,2})日(?![間後])' + P), (m) => {
          if (+m[1] < 1 || +m[1] > 31) return false;
          date = upcomingDay(today, +m[1]);
        });
    }

    // 時刻
    take(new RegExp('(?<!\\d)(\\d{1,2}):(\\d{2})' + P), (m) => {
      if (+m[1] > 23 || +m[2] > 59) return false;
      hour = +m[1]; minute = +m[2];
    }) ||
      take(new RegExp('(?<!\\d)(\\d{1,2})時(?:(半)|(\\d{1,2})分)?' + P), (m) => {
        if (+m[1] > 24) return false;
        hour = +m[1] % 24; minute = m[2] ? 30 : m[3] ? +m[3] : 0;
        if (minute > 59) return false;
      });

    if (hour !== null) {
      if ((period === 'pm' || period === 'evening' || period === 'night') && hour < 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;
    } else if (period) {
      const defaults = { morning: 9, noon: 12, evening: 17, night: 20 };
      if (defaults[period] !== undefined) hour = defaults[period];
    }

    let time = hour !== null ? `${pad(hour)}:${pad(minute)}` : null;

    // 時刻だけ指定 → 今日（過ぎていれば明日）
    if (time && !date) {
      const t = new Date(today); t.setHours(hour, minute);
      date = t > now ? today : addDays(today, 1);
    }
    // 繰り返しだけ指定 → 次に該当する日
    if (repeat && !date) date = today;
    if (repeat === 'weekdays') while (date.getDay() === 0 || date.getDay() === 6) date = addDays(date, 1);

    let title = text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(までに|まで|には|に|の|は|、|,)\s*/, '')
      .replace(/\s*(までに|まで|には|に|の|、|,)$/, '')
      .trim();
    if (!title) title = normalize(input).trim();

    return { title, date: date ? fmtDate(date) : null, time, repeat, list, important, tokens };
  }

  // 繰り返しタスクの次回日付（今日以降になるまで進める）
  function nextDueDate(dateStr, repeat, now) {
    const today = startOfDay(now || new Date());
    const base = parseDate(dateStr);
    const origDay = base.getDate();
    let d = new Date(base);
    let i = 0;
    const step = () => {
      i++;
      switch (repeat) {
        case 'daily': d = addDays(d, 1); break;
        case 'weekdays': do { d = addDays(d, 1); } while (d.getDay() === 0 || d.getDay() === 6); break;
        case 'weekly': d = addDays(d, 7); break;
        case 'monthly': {
          const y = base.getFullYear(), m = base.getMonth() + i;
          const last = new Date(y, m + 1, 0).getDate();
          d = new Date(y, m, Math.min(origDay, last)); break;
        }
        case 'yearly': d = new Date(base.getFullYear() + i, base.getMonth(), origDay); break;
        default: return;
      }
    };
    step();
    while (d < today && i < 10000) step();
    return fmtDate(d);
  }

  const api = { parseTask, nextDueDate, fmtDate, parseDate, addDays, startOfDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.TodoParser = api;
})(this);
