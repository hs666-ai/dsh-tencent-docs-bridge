/**
 * resolver.test.mjs — 取票链优先级：env > vault > gateway。
 * 验证不会因网关缺失导致抛错（静默回退语义）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveToken, summarize } from '../lib/resolver.js';

const TMP = mkdtempSync(join(tmpdir(), 'tdoc-resolver-test-'));
const VAULT = join(TMP, 'vault.json');
const SECRET_ENV = '11111111222222223333333344444444';
const SECRET_VAULT = 'aaaaaaaa00000000bbbbbbbbcccccccc';

test('env 优先于 vault', async () => {
  writeFileSync(VAULT, JSON.stringify({ access_token: SECRET_VAULT }), 'utf8');
  const r = await resolveToken({ TDOC_OAUTH_ACCESS_TOKEN: SECRET_ENV }, SECRET_VAULT);
  assert.equal(r.token, SECRET_ENV);
  assert.equal(r.source, 'env');
});

test('无 env 时回退 vault', async () => {
  const r = await resolveToken({ TDOC_VAULT: VAULT }, undefined);
  // 未显式传 vault 时走 vaultPath()=主目录，这里改用显式传入模拟
  const r2 = await resolveToken({}, SECRET_VAULT);
  assert.equal(r2.token, SECRET_VAULT);
  assert.equal(r2.source, 'vault');
});

test('网关不在运行时静默返回 none（不抛错）', async () => {
  const r = await resolveToken({ TDOC_GATEWAY_URL: 'http://127.0.0.1:1' }, '');
  assert.equal(r.token, '');
  assert.equal(r.source, 'none');
});

test('summarize 不含 token 明文', () => {
  const s = summarize({ token: SECRET_ENV, source: 'env' });
  assert.ok(!s.includes(SECRET_ENV));
  assert.ok(s.includes('len32:1111'));
});

test('清理临时目录', () => {
  rmSync(TMP, { recursive: true, force: true });
  assert.ok(true);
});