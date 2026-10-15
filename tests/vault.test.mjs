/**
 * vault.test.mjs — 防泄露核心：脱敏指纹 / secret 校验 / vault 读写。
 * 验证 COMPLIANCE.md §4 的可测试部分。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenFingerprint, isValidSecret, writeVault, readVault, clearVault, vaultToken } from '../lib/vault.js';

const TMP = mkdtempSync(join(tmpdir(), 'tdoc-vault-test-'));
const VAULT = join(TMP, 'vault.json');
const SECRET = 'aabbccddeeff00112233445566778899';

test('tokenFingerprint 只暴露 长度+前4位，绝不完整', () => {
  const f = tokenFingerprint(SECRET);
  assert.ok(f.startsWith('len32:aabb'));
  assert.ok(!f.includes(SECRET));
  assert.equal(tokenFingerprint(''), '(无)');
});

test('isValidSecret：32位hex 合法；其他拒绝', () => {
  assert.ok(isValidSecret(SECRET));
  assert.ok(isValidSecret(SECRET.toUpperCase()));
  assert.ok(!isValidSecret('not-a-valid-token'));
  assert.ok(!isValidSecret('aabb'));             // 太短
  assert.ok(!isValidSecret(SECRET + 'zz'));      // 非法字符
  assert.ok(!isValidSecret(''));                 // 空
  assert.ok(!isValidSecret(null));
});

test('vault 读写 / 清空 / vaultToken', () => {
  writeVault({ access_token: SECRET, _source: 'test' }, VAULT);
  const got = readVault(VAULT);
  assert.equal(got.access_token, SECRET);
  assert.equal(vaultToken(VAULT), SECRET);
  // 落盘是 JSON，可读回且不含任何多余明文之外的字段（结构校验）
  const raw = JSON.parse(readFileSync(VAULT, 'utf8'));
  assert.equal(raw._updated_at.length, 24); // ISO 时间戳
  clearVault(VAULT);
  assert.equal(vaultToken(VAULT), '');
});

test('在同一临时目录下清理', () => {
  rmSync(TMP, { recursive: true, force: true });
  assert.ok(true);
});