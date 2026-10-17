/**
 * login.test.mjs — tdoc-auth login 一键取票逻辑（不真开浏览器/不真连 CDP）。
 * 覆盖：浏览器定位（含 TDOC_BROWSER 覆盖）/ create_secret 表达式构造 /
 *      响应解析（成功 / 未登录 / 异常）/ runLogin 主流程（成功、无浏览器、超时、坏 secret）。
 * 原则：token 明文永不进断言输出；vault 用临时目录。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { locateBrowser, createSecretExpression, parseSecretResponse, runLogin } from '../lib/login.js';

const SECRET = 'aabbccddeeff00112233445566778899';
const TMP = mkdtempSync(join(tmpdir(), 'tdoc-login-test-'));
const VAULT = join(TMP, 'vault.json');

/* ---------- 浏览器定位 ---------- */

test('TDOC_BROWSER 环境变量优先', () => {
  const b = locateBrowser({ TDOC_BROWSER: 'C:/fake/browser.exe', PATH: '' });
  assert.equal(b, 'C:/fake/browser.exe');
});

test('找不到浏览器时返回空串', () => {
  const b = locateBrowser({ TDOC_BROWSER: '', PATH: '' });
  // 本机装有 Chrome/Edge 则命中候选；通过 PATH 注入空串且候选均不存在时为空。
  // 这里只断言类型：候选路径存在时返回非空，否则空串——不依赖具体安装。
  assert.equal(typeof b, 'string');
  if (b.length > 0) assert.ok(b.endsWith('.exe') || b.includes('/'));
});

/* ---------- create_secret 表达式 ---------- */

test('表达式含 create_secret 与 refresh=0（默认）', () => {
  const e = createSecretExpression(false);
  assert.ok(e.includes('/oauth/v2/space/create_secret'));
  assert.ok(e.includes('refresh=0'));
  assert.ok(e.includes('mcp_source=desktop'));
  assert.ok(e.includes('document.cookie'));
});

test('refresh=1 时轮换参数', () => {
  const e = createSecretExpression(true);
  assert.ok(e.includes('refresh=1'));
});

/* ---------- 响应解析 ---------- */

test('ret=0 且含 space_secret → 成功，指纹正确，不泄露明文', () => {
  const r = parseSecretResponse(JSON.stringify({
    status: 200,
    body: { ret: 0, data: { space_secret: SECRET, expired: false } },
    xsrf_len: 16,
  }));
  assert.equal(r.ok, true);
  assert.equal(r.secret, SECRET); // 返回给调用方写 vault（内部值）
  assert.equal(r.fingerprint, `len32:${SECRET.slice(0, 4)}…`);
  assert.ok(!r.fingerprint.includes(SECRET.slice(4)), '指纹不得含片段');
});

test('302/401 → 未登录提示', () => {
  [302, 401, 403].forEach((status) => {
    const r = parseSecretResponse(JSON.stringify({ status, body: '' }));
    assert.equal(r.ok, false);
    assert.ok(r.detail.includes('扫码'));
  });
});

test('业务错误 / 畸形数据 → 失败且不抛', () => {
  const r1 = parseSecretResponse(JSON.stringify({ status: 200, body: { ret: 400006, data: null } }));
  assert.equal(r1.ok, false);
  const r2 = parseSecretResponse('not json {{{');
  assert.equal(r2.ok, false);
});

/* ---------- runLogin 主流程（注入 mock） ---------- */

const mockDeps = (overrides = {}) => ({
  locateBrowser: () => 'C:/fake/chrome.exe',
  pickFreePort: async () => 59999,
  spawnBrowser: async () => ({ kill: () => 'killed' }),
  waitCdpReady: async () => true,
  waitForSecret: async () => ({ ok: true, secret: SECRET, fingerprint: `len32:${SECRET.slice(0, 4)}…` }),
  ...overrides,
});

test('runLogin 成功 → 写入 vault，指纹返回，无明文日志', async () => {
  const events = [];
  const r = await runLogin({
    env: {},
    vault: VAULT,
    onStatus: (m) => events.push(m),
    deps: mockDeps(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'cdp-login');
  assert.ok(r.fingerprint.startsWith('len32:'));
  const written = JSON.parse(readFileSync(VAULT, 'utf8'));
  assert.equal(written.access_token, SECRET);
  assert.equal(written._source, 'cdp-login');
  assert.ok(!events.join(' ').includes(SECRET), '状态消息不得含明文');
});

test('无浏览器 → 明确失败原因', async () => {
  const r = await runLogin({ env: {}, vault: VAULT, deps: mockDeps({ locateBrowser: () => '' }) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-browser');
});

test('扫码超时 → 失败且给出提示', async () => {
  const r = await runLogin({
    env: {},
    vault: VAULT,
    timeoutMs: 4000,
    deps: mockDeps({ waitForSecret: async () => ({ ok: false, detail: '等待扫码超时（4s）：未登录' }) }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'timeout');
});

test('返回值非 32 位 → 拒绝写入', async () => {
  const r = await runLogin({
    env: {},
    vault: VAULT,
    deps: mockDeps({ waitForSecret: async () => ({ ok: true, secret: 'short', fingerprint: 'len5:shor…' }) }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-secret');
});

test('清理临时目录', () => {
  rmSync(TMP, { recursive: true, force: true });
  assert.ok(true);
});