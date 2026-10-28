// Phép thử nút "Cho phép" cấp khoá Loa (mục D, phía gói): máy tự sinh khoá, chỉ gửi bản băm, mở trang Cho phép, hỏi vòng,
// chỉ khi allowed mới cất khoá; mã hết hạn thì xin mã mới; mọi lỗi ra một câu lời thường. Không mạng, không kho khoá thật.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { keyHash, newKey, pair, pairPageUrl } from '../plugins/tinh-nlh/speaker/pair.mjs';

const ORIGIN = 'https://api.nlh.vn';
const MACHINE = `m-${'a1'.repeat(16)}`;
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// Hub giả: /tower/pair trả mã theo kịch bản, /tower/pair/status trả lần lượt các trạng thái.
function fakeHub({ asks, statuses }) {
  const calls = [];
  let ask = 0;
  let poll = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/tower/pair')) return typeof asks === 'function' ? asks(ask++, init) : json(201, asks[ask++]);
    return json(200, { status: statuses[Math.min(poll++, statuses.length - 1)] });
  };
  return { fetchImpl, calls };
}

const harness = (over = {}) => {
  const said = [];
  const opened = [];
  const saved = [];
  let t = 0;
  return {
    said,
    opened,
    saved,
    args: {
      origin: ORIGIN,
      machine: MACHINE,
      save: (key) => saved.push(key),
      say: (line) => said.push(line),
      openUrl: (url) => opened.push(url),
      sleep: async () => {
        t += 3000;
      },
      now: () => t,
      pollMs: 3000,
      ...over,
    },
  };
};

test('khoá: nlh_tower_ cộng 64 chữ số hex, mỗi lần một khoá khác; bản băm là SHA-256 hex của chính khoá', () => {
  const a = newKey();
  assert.match(a, /^nlh_tower_[0-9a-f]{64}$/);
  assert.notEqual(a, newKey());
  assert.equal(keyHash('nlh_tower_x'), createHash('sha256').update('nlh_tower_x').digest('hex'));
});

test('đường thuận: chỉ gửi mã máy và bản băm, mở đúng trang, hỏi vòng tới allowed mới cất khoá', async () => {
  const hub = fakeHub({ asks: [{ code: 'ABCD-2345', expires_at: new Date(Date.now() + 600_000).toISOString() }], statuses: ['pending', 'pending', 'allowed'] });
  const h = harness({ fetchImpl: hub.fetchImpl, makeKey: () => `nlh_tower_${'b'.repeat(64)}` });
  const result = await pair(h.args);
  assert.deepEqual(result, { ok: true });
  const key = `nlh_tower_${'b'.repeat(64)}`;
  const ask = hub.calls[0];
  assert.equal(ask.url, `${ORIGIN}/tower/pair`);
  assert.deepEqual(JSON.parse(ask.init.body), { machine_id: MACHINE, key_hash: keyHash(key) });
  assert.ok(!ask.init.body.includes(key), 'khoá không đi trong lời xin');
  assert.deepEqual(h.opened, ['https://nep.nlh.vn/app/pair?code=ABCD-2345']);
  assert.deepEqual(h.saved, [key]);
  const polls = hub.calls.filter((call) => call.url.endsWith('/tower/pair/status'));
  assert.equal(polls.length, 3);
  assert.ok(polls.every((call) => call.init.headers.Authorization === `Bearer ${key}`));
  assert.match(h.said.join('\n'), /mã ABCD-2345/);
  // Khoá không hiện ra ở dòng nào người dùng đọc.
  assert.ok(!h.said.join('\n').includes('nlh_tower_'));
});

test('khoá chưa được cất khi chưa ai bấm: hỏi vòng hết hạn thì không lưu gì và nói một câu', async () => {
  const hub = fakeHub({ asks: [{ code: 'ABCD-2345', expires_at: new Date(Date.now() + 9000).toISOString() }, { code: 'WXYZ-6789', expires_at: new Date(Date.now() + 9000).toISOString() }], statuses: ['pending'] });
  const h = harness({ fetchImpl: hub.fetchImpl });
  const result = await pair(h.args);
  assert.equal(result.ok, false);
  assert.match(result.message, /Chưa thấy ai bấm Cho phép/);
  assert.deepEqual(h.saved, []);
});

test('mã hết hạn: xin mã mới với khoá mới, vòng hai bấm được thì cất khoá của vòng hai', async () => {
  const keys = [`nlh_tower_${'1'.repeat(64)}`, `nlh_tower_${'2'.repeat(64)}`];
  let made = 0;
  const hub = fakeHub({
    asks: [{ code: 'ABCD-2345', expires_at: new Date(Date.now() + 600_000).toISOString() }, { code: 'WXYZ-6789', expires_at: new Date(Date.now() + 600_000).toISOString() }],
    statuses: ['expired', 'allowed'],
  });
  const h = harness({ fetchImpl: hub.fetchImpl, makeKey: () => keys[made++] });
  const result = await pair(h.args);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(h.saved, [keys[1]]);
  assert.equal(h.opened.length, 2);
  assert.equal(JSON.parse(hub.calls.find((call) => call.url.endsWith('/tower/pair') && JSON.parse(call.init.body).key_hash === keyHash(keys[1])).init.body).key_hash, keyHash(keys[1]));
});

test('lỗi ra một câu lời thường: xin quá nhiều lần, hub lỗi, không có mạng, mã lạ, cất khoá hỏng, chưa có mã máy, địa chỉ lạ', async () => {
  let h = harness({ fetchImpl: async () => json(429, {}) });
  assert.match((await pair(h.args)).message, /vừa xin mã mấy lần/);
  h = harness({ fetchImpl: async () => json(502, {}) });
  assert.match((await pair(h.args)).message, /chưa nhận lời xin/);
  h = harness({
    fetchImpl: async () => {
      throw new Error('net');
    },
  });
  assert.match((await pair(h.args)).message, /Chưa nối được Nếp/);
  h = harness({ fetchImpl: async () => json(201, { code: 'javascript:alert(1)', expires_at: new Date(Date.now() + 60_000).toISOString() }) });
  assert.match((await pair(h.args)).message, /mã lạ/);
  assert.deepEqual(h.opened, []);
  const hub = fakeHub({ asks: [{ code: 'ABCD-2345', expires_at: new Date(Date.now() + 60_000).toISOString() }], statuses: ['allowed'] });
  h = harness({
    fetchImpl: hub.fetchImpl,
    save: () => {
      throw new Error('keychain');
    },
  });
  assert.match((await pair(h.args)).message, /Chưa lưu được khoá/);
  assert.match((await pair(harness({ machine: null }).args)).message, /Chưa có mã máy/);
  assert.match((await pair(harness({ origin: null }).args)).message, /không phải https của nlh\.vn/);
});

test('chỉ mở trang của nlh.vn (https) hay của chính máy thử, mã đúng dạng', () => {
  assert.equal(pairPageUrl('https://nep.nlh.vn', 'ABCD-2345'), 'https://nep.nlh.vn/app/pair?code=ABCD-2345');
  assert.equal(pairPageUrl('http://localhost:8787', 'ABCD-2345'), 'http://localhost:8787/app/pair?code=ABCD-2345');
  assert.equal(pairPageUrl('https://evil.example.com', 'ABCD-2345'), null);
  assert.equal(pairPageUrl('http://nep.nlh.vn', 'ABCD-2345'), null);
  assert.equal(pairPageUrl('https://nep.nlh.vn', 'x&y=1'), null);
});
