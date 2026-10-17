/**
 * e2e-login.mjs — `tdoc-auth login` 端到端离线自测（不依赖真人扫码、不依赖真实 Chrome）。
 *
 * 链路：测试进程预起 fake-cdp（独立 node 子进程，模拟 Chrome CDP + create_secret 成功）
 * → runLogin（真实 lib/login.js：waitCdpReady → 轮询 findDocsTarget → 页面取票 → 写 vault）。
 * 仅「浏览器启动/端口分配」两处注入（沙箱无法真起 GUI 浏览器），其余全真实。
 *
 * 用法：node scripts/e2e-login.mjs
 */
import { runLogin } from '../lib/login.js';
import { readVault } from '../lib/vault.js';
import { pickFreePort, waitCdpReady } from '../lib/login.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EXPECTED = 'cafe' + '0'.repeat(26) + 'dd'; // 与 fake-cdp 的 FAKE_SECRET 一致
const TMP = mkdtempSync(join(tmpdir(), 'tdoc-e2e-'));
const VAULT = join(TMP, 'vault.json');

async function main() {
  const fake = join(ROOT, 'fake-cdp-browser.mjs');
  if (!existsSync(fake)) throw new Error('缺少 fake-cdp-browser.mjs');

  // 1) 预起假浏览器（真实 CDP 端口），stdio ignore 规避沙箱 spawn EPERM
  const port = await pickFreePort();
  const proc = spawn(process.execPath, [fake, `--remote-debugging-port=${port}`], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  });
  try {
    await waitCdpReady(port, 10000);
    console.log('[e2e] fake-cdp 就绪于 127.0.0.1:' + port);

    // 2) 真实 runLogin，仅注入 spawnBrowser 与端口（其余 waitCdpReady/waitForSecret 全真实）
    const events = [];
    const r = await runLogin({
      env: { ...process.env, TDOC_VAULT: VAULT },
      vault: VAULT,
      timeoutMs: 30000,
      onStatus: (m) => { events.push(m); console.log('[login]', m); },
      deps: {
        pickFreePort: async () => port,
        spawnBrowser: async () => ({ kill: () => {} }),
      },
    });

    if (!r.ok) {
      console.error('✖ E2E 失败:', r.reason, r.detail);
      return 1;
    }

    // 3) 断言 vault 落盘且状态消息无明文
    const v = readVault(VAULT);
    if (v.access_token !== EXPECTED) {
      console.error('✖ vault 内容不符（指纹: ' + r.fingerprint + '）');
      return 1;
    }
    if (events.join(' ').includes(EXPECTED)) {
      console.error('✖ 状态消息泄露明文 token');
      return 1;
    }
    console.log('✓ E2E 通过: CDP 就绪 → 轮询页面 → create_secret → vault');
    console.log('  vault._source =', v._source, '| 指纹 =', r.fingerprint);
    return 0;
  } finally {
    try { proc.kill(); } catch { /* ignore */ }
  }
}

try {
  const code = await main();
  await new Promise((r) => setTimeout(r, 1000));
  rmSync(TMP, { recursive: true, force: true });
  process.exit(code);
} catch (e) {
  console.error('✖ E2E 异常:', e?.message ?? e);
  rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
}