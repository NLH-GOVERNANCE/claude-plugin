// prepare.mjs: Loa's launcher marks the first questions of Claude Code as answered, so a hidden Loa is not stuck on an English screen.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepare } from '../plugins/tinh-nlh/speaker/prepare.mjs';

const script = fileURLToPath(new URL('../plugins/tinh-nlh/speaker/prepare.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'loa-prepare-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const write = (name, value) => {
  const file = join(dir, name);
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  return file;
};
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('máy mới: đánh dấu đã qua câu hỏi đầu, chọn kiểu chữ, tin thư mục của Loa (khoá thư mục viết xuôi dấu gạch)', () => {
  const file = write('fresh.json', { userID: 'x', projects: { 'C:/Users/An/Khac': { hasTrustDialogAccepted: false } } });
  assert.equal(prepare(file, 'C:\\Users\\An\\TinhNhiLe'), true);
  const after = json(file);
  assert.equal(after.hasCompletedOnboarding, true);
  assert.equal(after.theme, 'dark');
  assert.equal(after.projects['C:/Users/An/TinhNhiLe'].hasTrustDialogAccepted, true);
  assert.deepEqual(after.projects['C:/Users/An/Khac'], { hasTrustDialogAccepted: false }, 'thư mục khác không đụng tới');
  assert.equal(after.userID, 'x');
});

test('đã đủ thì không ghi lại; kiểu chữ người dùng đã chọn được giữ', () => {
  const file = write('done.json', { hasCompletedOnboarding: true, theme: 'light', projects: { 'C:/Users/An/TinhNhiLe': { hasTrustDialogAccepted: true, lastCost: 1 } } });
  const before = readFileSync(file, 'utf8');
  assert.equal(prepare(file, 'C:\\Users\\An\\TinhNhiLe'), false);
  assert.equal(readFileSync(file, 'utf8'), before);
  const half = write('half.json', { hasCompletedOnboarding: false, theme: 'light' });
  assert.equal(prepare(half, 'C:\\Users\\An\\TinhNhiLe'), true);
  assert.equal(json(half).theme, 'light');
});

test('file không đọc được hoặc không phải đối tượng JSON thì để nguyên; không để lại file tạm', () => {
  const broken = write('broken.json', '{ not json');
  assert.equal(prepare(broken, 'C:\\x'), false);
  assert.equal(readFileSync(broken, 'utf8'), '{ not json');
  assert.equal(prepare(write('list.json', '[]'), 'C:\\x'), false);
  assert.equal(prepare(join(dir, 'khong-co.json'), 'C:\\x'), false);
  assert.deepEqual(readdirSync(dir).filter((name) => name.includes('.loa-')), []);
});

test('chạy bằng dòng lệnh như start.ps1: --file và --work, im lặng, thoát 0', () => {
  const file = write('cli.json', {});
  const out = spawnSync(process.execPath, [script, '--file', file, '--work', 'C:\\Users\\An\\TinhNhiLe'], { encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.equal(out.stdout + out.stderr, '');
  assert.equal(json(file).hasCompletedOnboarding, true);
});
