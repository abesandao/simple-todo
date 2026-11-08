// 実行: node tests/parser.test.js
const assert = require('assert');
const { parseTask, nextDueDate } = require('../parser.js');

// 基準: 2026-11-07(土) 10:00
const NOW = new Date(2026, 10, 7, 10, 0);
const cases = [
  ['明日15時 歯医者', { title: '歯医者', date: '2026-11-08', time: '15:00' }],
  ['明日15時に歯医者', { title: '歯医者', date: '2026-11-08', time: '15:00' }],
  ['歯医者 明日の午後3時半', { title: '歯医者', date: '2026-11-08', time: '15:30' }],
  ['牛乳を買う', { title: '牛乳を買う', date: null, time: null }],
  ['朝ごはんを作る', { title: '朝ごはんを作る', date: null, time: null }],
  ['今日 9:30 会議', { title: '会議', date: '2026-11-07', time: '09:30' }],
  ['8時 ジム', { title: 'ジム', date: '2026-11-08', time: '08:00' }], // 過ぎているので明日
  ['夜 電話する', { title: '電話する', date: '2026-11-07', time: '20:00' }],
  ['夜8時 電話', { title: '電話', date: '2026-11-07', time: '20:00' }],
  ['今夜 映画', { title: '映画', date: '2026-11-07', time: '20:00' }],
  ['あさって 美容院', { title: '美容院', date: '2026-11-09' }],
  ['3日後 返却', { title: '返却', date: '2026-11-10' }],
  ['金曜までにレポート提出', { title: 'レポート提出', date: '2026-11-13' }],
  ['土曜 掃除', { title: '掃除', date: '2026-11-07' }],
  ['来週月曜 打ち合わせ', { title: '打ち合わせ', date: '2026-11-09' }],
  ['来週の水曜日 歯医者', { title: '歯医者', date: '2026-11-11' }],
  ['来週 企画書', { title: '企画書', date: '2026-11-09' }],
  ['12月25日 プレゼント', { title: 'プレゼント', date: '2026-12-25' }],
  ['1/5 初詣', { title: '初詣', date: '2027-01-05' }],
  ['20日 支払い', { title: '支払い', date: '2026-11-20' }],
  ['３日 支払い', { title: '支払い', date: '2026-12-03' }],
  ['毎日 薬を飲む', { title: '薬を飲む', date: '2026-11-07', repeat: 'daily' }],
  ['毎週月曜 ゴミ出し', { title: 'ゴミ出し', date: '2026-11-09', repeat: 'weekly' }],
  ['毎月25日 家賃', { title: '家賃', date: '2026-11-25', repeat: 'monthly' }],
  ['平日 9時 日報', { title: '日報', date: '2026-11-09', time: '09:00', repeat: 'weekdays' }],
  ['毎朝 ストレッチ', { title: 'ストレッチ', date: '2026-11-08', time: '09:00', repeat: 'daily' }],
  ['毎朝7時 ストレッチ', { title: 'ストレッチ', date: '2026-11-08', time: '07:00', repeat: 'daily' }],
  ['毎晩 日記', { title: '日記', date: '2026-11-07', time: '20:00', repeat: 'daily' }],
  ['資料作成 #仕事 明日', { title: '資料作成', date: '2026-11-08', list: '仕事' }],
  ['週末 洗車', { title: '洗車', date: '2026-11-07' }],
  ['!レポート 明日', { title: 'レポート', date: '2026-11-08', important: true }],
  ['レポート ！', { title: 'レポート', important: true }],
  ['重要 契約書を送る', { title: '契約書を送る', important: true }],
  ['重要書類を探す', { title: '重要書類を探す', important: false }],
];

let fail = 0;
for (const [input, expected] of cases) {
  const r = parseTask(input, NOW);
  try {
    for (const k of Object.keys(expected)) assert.strictEqual(r[k], expected[k], `${k}`);
    console.log('ok   ', input);
  } catch (e) {
    fail++;
    console.log('FAIL ', input, '→', JSON.stringify(r), '期待', JSON.stringify(expected));
  }
}

// 繰り返しの次回日付
const nd = [
  ['2026-11-07', 'daily', '2026-11-08'],
  ['2026-11-01', 'daily', '2026-11-07'], // 過去分は今日まで進める
  ['2026-11-06', 'weekdays', '2026-11-09'],
  ['2026-11-07', 'weekly', '2026-11-14'],
  ['2026-11-30', 'monthly', '2026-12-30'],
  ['2027-01-31', 'monthly', '2027-02-28'],
  ['2026-11-07', 'yearly', '2027-11-07'],
];
for (const [d, rep, exp] of nd) {
  const got = nextDueDate(d, rep, NOW);
  if (got === exp) console.log('ok   ', d, rep);
  else { fail++; console.log('FAIL ', d, rep, '→', got, '期待', exp); }
}

console.log(fail ? `\n${fail} 件失敗` : '\nすべて成功');
process.exit(fail ? 1 : 0);
