/**
 * login.js — 一键取票（tdoc-auth login）：自动弹出系统浏览器扫码登录，
 * 从登录态经官方 create_secret 接口取 space_secret 写入本地 vault。
 *
 * 全程纯 Node 内置（>=22.6）：http 探测 CDP / node 自带全局 WebSocket。
 * 零外部依赖、零内置凭据、不残留任何明文（COMPLIANCE.md §4 语义不变）。
 *
 * 流程：
 *   1. locateBrowser 定位系统 Chrome/Edge（TDOC_BROWSER 可覆盖）
 *   2. 选空闲端口，spawn 浏览器 - 独立 profile，打开 docs.qq.com/desktop/
 *   3. 轮询 CDP 直到就绪（waitCdpReady）
 *   4. 提示用户在弹窗中扫码；轮询登录态（fetchSecretFromPage 直到 ret=0）
 *   5. 写入 vault（_source='cdp-login'）
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { accessSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { writeVault, tightenAcl } from './vault.js';

/** 候选浏览器可执行文件（Windows / macOS / Linux 常规路径；TDOC_BROWSER 优先）。 */
const BROWSER_CANDIDATES = [
  // Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];

/** 从 PATH 里找命令（Linux 场景兜底）。 */
function whichInPath(name, env) {
  const path = (env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
  for (const dir of path) {
    const exe = join(dir, name + (process.platform === 'win32' ? '.exe' : ''));
    try { accessSync(exe); return exe; } catch { /* continue */ }
  }
  return '';
}

/** 定位浏览器可执行文件；找不到返回 ''。env.TDOC_BROWSER 优先。 */
export function locateBrowser(env = process.env) {
  const preferred = (env.TDOC_BROWSER || '').trim();
  if (preferred) return preferred;
  for (const cand of BROWSER_CANDIDATES) {
    try { accessSync(cand); return cand; } catch { /* continue */ }
  }
  const linuxFallback = whichInPath('google-chrome', env) || whichInPath('chromium', env) || whichInPath('microsoft-edge', env);
  return linuxFallback;
}

/** 探测一个空闲 TCP 端口（listen(0) 拿分配端口后释放，交给浏览器进程）。 */
export function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/** 小 HTTP GET（127.0.0.1 的 CDP 接口用）。 */
export function httpGetJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = get({ host: '127.0.0.1', port, path, timeout: 3000 }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('CDP 返回非 JSON: ' + String(d).slice(0, 120))); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('CDP 超时')); });
    req.on('error', reject);
  });
}

/** 轮询 CDP /json/version 直到就绪或超时（ms）。 */
export async function waitCdpReady(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try { await httpGetJson(port, '/json/version'); return true; } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`浏览器调试端口未就绪: ${lastErr?.message ?? 'timeout'}`);
}

/** 在 CDP WebSocket 上执行一次性 Runtime.evaluate，返回 result.value。 */
export async function evalInPage(wsUrl, expression, timeoutMs = 30000) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('CDP WebSocket 连接失败'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error('页面计算超时')); }, timeoutMs);
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id !== 1) return;
        clearTimeout(timer);
        ws.close();
        const v = m.result?.result?.value;
        if (m.error || m.result?.exceptionDetails) {
          reject(new Error(m.error?.message || '页面内执行异常'));
        } else {
          resolve(v);
        }
      };
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }));
    });
  } finally {
    try { ws.close(); } catch { /* ignore */ }
  }
}

/** 构造在已登录页面里调用 create_secret 的 JS（refresh=0 取当前 / =1 轮换）。 */
export function createSecretExpression(refresh) {
  return `(async () => {
    const tok = document.cookie.match(/(?:^|; )TOK=([^;]*)/);
    const xsrf = tok ? tok[1] : '';
    const r = await fetch('https://docs.qq.com/oauth/v2/space/create_secret?refresh=${refresh ? 1 : 0}&mcp_source=desktop&xsrf=' + encodeURIComponent(xsrf), {
      credentials: 'include', redirect: 'manual', headers: { 'X-XSRF-TOKEN': xsrf } });
    const t = await r.text().catch(() => '');
    let parsed = null; try { parsed = JSON.parse(t); } catch (e) {}
    return JSON.stringify({ status: r.status, body: parsed || t.slice(0, 300), xsrf_len: xsrf.length, pageUrl: location.href.slice(0, 120) });
  })()`;
}

/** 找 docs.qq.com 页面 target（优先 open-claw 登录页，其次任意 docs.qq.com）。 */
export async function findDocsTarget(port) {
  const tabs = await httpGetJson(port, '/json');
  const list = Array.isArray(tabs) ? tabs : [];
  return list.find((t) => t.type === 'page' && t.url && t.url.includes('open-claw'))
    || list.find((t) => t.type === 'page' && t.url && t.url.includes('docs.qq.com'))
    || null;
}

/**
 * 从已登录页面取 space_secret。返回 { ok, secret?, fingerprint?, detail? }。
 * 未登录 / 未扫码：ok=false, detail 说明。
 */
export function parseSecretResponse(raw) {
  try {
    const d = JSON.parse(raw || '');
    if (d.status === 200 && d.body?.ret === 0 && d.body?.data?.space_secret) {
      const secret = d.body.data.space_secret;
      return { ok: true, secret, fingerprint: `len${secret.length}:${secret.slice(0, 4)}…`, expired: !!d.body.data.expired };
    }
    if (d.status === 302 || d.status === 401 || d.status === 403) {
      return { ok: false, detail: '尚未登录（页面跳转登录），请在弹出的浏览器中扫码' };
    }
    return { ok: false, detail: `官方返回 status=${d.status} body=${JSON.stringify(d.body ?? d).slice(0, 160)}` };
  } catch {
    return { ok: false, detail: `无法解析官方响应: ${String(raw).slice(0, 160)}` };
  }
}

/** 轮询取票：每 2s 找 docs 页面并尝试 create_secret，直到成功或超时。 */
export async function waitForSecret({ port, refresh = false, timeoutMs = 180000, onStatus }) {
  const deadline = Date.now() + timeoutMs;
  let lastDetail = '';
  while (Date.now() < deadline) {
    const target = await findDocsTarget(port).catch(() => null);
    if (!target) {
      lastDetail = '未找到腾讯文档页面（请勿关闭弹出的浏览器窗口）';
      onStatus?.(lastDetail);
    } else {
      const raw = await evalInPage(target.webSocketDebuggerUrl, createSecretExpression(refresh)).catch(() => '');
      const parsed = parseSecretResponse(raw);
      if (parsed.ok) return parsed;
      lastDetail = parsed.detail || '';
      onStatus?.(lastDetail);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, detail: `等待扫码超时（${Math.round(timeoutMs / 1000)}s）：${lastDetail}` };
}

/**
 * 一键取票主流程（依赖可注入，便于单测）。
 * deps 默认全部用真实实现；测试可覆盖 spawnBrowser / waitCdpReady 等。
 */
export async function runLogin({
  env = process.env,
  vault = undefined,
  refresh = false,
  timeoutMs = 180000,
  onStatus = () => {},
  deps = {},
}) {
  const locate = deps.locateBrowser || locateBrowser;
  const pickPort = deps.pickFreePort || pickFreePort;
  const spawnBrowser = deps.spawnBrowser || defaultSpawnBrowser;
  const waitReady = deps.waitCdpReady || waitCdpReady;
  const waitSecret = deps.waitForSecret || waitForSecret;

  const browser = locate(env);
  if (!browser) {
    return { ok: false, reason: 'no-browser', detail: '未找到 Chrome/Edge。请安装任一浏览器，或用 TDOC_BROWSER 指定路径。' };
  }

  const port = await pickPort();
  const profileDir = mkdtempSync(join(tmpdir(), 'dsh-tdoc-login-'));
  onStatus(`正在启动浏览器并打开 docs.qq.com …`);
  try {
    const proc = await spawnBrowser(browser, port, profileDir);
    await waitReady(port, 20000);
    onStatus('请在弹出的浏览器窗口中用微信/QQ 扫码登录腾讯文档（此窗口与你日常浏览器隔离）');
    const result = await waitSecret({ port, refresh, timeoutMs, onStatus });
    if (!result.ok) return { ok: false, reason: 'timeout', detail: result.detail };
    if (typeof result.secret !== 'string' || result.secret.length !== 32) {
      return { ok: false, reason: 'bad-secret', detail: '官方返回的 space_secret 非 32 位，已中止写入' };
    }
    writeVault({ access_token: result.secret, _source: 'cdp-login' }, vault);
    tightenAcl(vault);
    // 主动关掉临时 profile 里的浏览器窗口（不杀用户其它浏览器进程）
    try { proc.kill(); } catch { /* ignore */ }
    onStatus(`已写入 vault（${result.fingerprint}）。可运行 \`tdoc-auth probe\` 验证。`);
    return { ok: true, fingerprint: result.fingerprint, source: 'cdp-login' };
  } finally {
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* temp 清理失败可忽略 */ }
  }
}

/** 默认浏览器启动：独立 profile + CDP 端口 + 打开目标 URL。 */
async function defaultSpawnBrowser(browser, port, profileDir) {
  const url = 'https://docs.qq.com/desktop/';
  return spawn(browser, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    url,
  ], { stdio: 'ignore', detached: false });
}