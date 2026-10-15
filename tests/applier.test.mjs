/**
 * applier.test.mjs — 挂载决策逻辑（不依赖 cordis，纯逻辑验证）。
 * 覆盖：成功挂载 / 无 token 提示 / disableRuntimeMount / failOnStartupError 抛错 /
 *      挂载失败降级不抛 / token 永不进日志。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountMcpClient } from '../lib/applier.js';

const SECRET = 'aabbccddeeff00112233445566778899';
const logs = [];
const mkLogger = () => ({ info: (m) => logs.push(['info', m]), warn: (m) => logs.push(['warn', m]) });

const mkLoader = ({ fail = false } = {}) => ({
  created: null,
  async create(arg) { this.created = arg; return 'entry-id'; },
  async resolve(id) { if (fail) throw new Error('resolve boom'); return id; },
});

test('有 token → 挂载成功，config 正确，日志无明文', async () => {
  const loader = mkLoader();
  await mountMcpClient({ loader, logger: mkLogger(), cfg: {}, token: SECRET, source: 'vault' });
  assert.equal(loader.created.name, '@deepseek-ai/dsh-mcp-client');
  const cfg = loader.created.config;
  assert.equal(cfg.serverName, 'tencent-docs');
  assert.equal(cfg.transport, 'streamable-http');
  assert.equal(cfg.headers.Authorization, `Bearer ${SECRET}`);
  const all = logs.map((x) => x[1]).join(' ');
  assert.ok(!all.includes(SECRET), '日志不得含 token 明文');
  assert.ok(all.includes('vault'));
});

test('无 token → 不挂载、只 warn、不抛错', async () => {
  let created = false;
  const loader = { async create() { created = true; throw new Error('不应调用'); }, async resolve() {} };
  const r = await mountMcpClient({ loader, logger: mkLogger(), cfg: {}, token: '', source: 'none' });
  assert.equal(created, false);
  assert.equal(r.mounted, false);
  assert.equal(r.reason, 'no-token');
  assert.ok(logs.some(([lv]) => lv === 'warn'));
});

test('disableRuntimeMount → 直接跳过', async () => {
  const r = await mountMcpClient({ loader: mkLoader(), logger: mkLogger(), cfg: { disableRuntimeMount: true }, token: SECRET });
  assert.equal(r.reason, 'declarative');
});

test('failOnStartupError + 无 token → 抛错', async () => {
  await assert.rejects(
    () => mountMcpClient({ loader: mkLoader(), logger: mkLogger(), cfg: { failOnStartupError: true }, token: '', source: 'none' }),
    /未找到腾讯文档 token/
  );
});

test('loader.create 失败 → 降级不抛（默认），failOnStartupError 时抛', async () => {
  const badLoader = {
    async create() { throw new Error('boom'); },
    async resolve() {},
  };
  const r = await mountMcpClient({ loader: badLoader, logger: mkLogger(), cfg: {}, token: SECRET });
  assert.equal(r.mounted, false);
  assert.equal(r.reason, 'mount-error');

  await assert.rejects(
    () => mountMcpClient({ loader: badLoader, logger: mkLogger(), cfg: { failOnStartupError: true }, token: SECRET }),
    /挂载官方 mcp-client 失败/
  );
});

test('resolve 失败也走 mount-error 分支', async () => {
  const r = await mountMcpClient({ loader: mkLoader({ fail: true }), logger: mkLogger(), cfg: {}, token: SECRET });
  assert.equal(r.reason, 'mount-error');
});