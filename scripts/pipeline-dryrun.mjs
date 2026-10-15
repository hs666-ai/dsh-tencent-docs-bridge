#!/usr/bin/env node
/**
 * pipeline-dryrun.mjs — 插件启动路径的只读演练（不发任何网络请求）。
 *
 * 模拟 lib/index.js 的真实动作序列：
 *   resolveToken(env) → buildMcpConfig(token) → { loader.create 的参数 }
 * 并验证「token 只出现在 config.headers.Authorization」，日志只见指纹。
 *
 * 安全：只读 vault；打印中绝不包含完整 token；不调用官方端点。
 */
import { resolveToken, summarize } from '../lib/resolver.js';
import { buildMcpConfig, TDOC_MCP } from '../lib/mcp.js';
import { tokenFingerprint } from '../lib/vault.js';

const r = await resolveToken();
console.log('[1/3] 取票链    :', summarize(r));

if (!r.token) {
  console.log('→ 未持有 token，模拟对应日志：插件仅提示、不挂载、不报错。');
  process.exit(0);
}

const cfg = buildMcpConfig(r.token);
console.log('[2/3] mcp config :', JSON.stringify({
  serverName: cfg.serverName,
  transport: cfg.transport,
  url: cfg.url,
  headersKeys: Object.keys(cfg.headers),
  authPrefix: cfg.headers.Authorization.split(' ')[0], // 只允许 "Bearer"
  toolCallTimeoutMs: cfg.toolCallTimeoutMs,
}));

// 防泄露断言：整个 config 序列化里，除 Bearer 头之外不得再出现 token 片段
const payload = JSON.stringify(cfg);
const withoutAuth = payload.replace(`Bearer ${r.token}`, '');
if (withoutAuth.includes(r.token)) {
  console.error('✖ 违规：token 出现在 Authorization 之外的位置！');
  process.exit(1);
}

console.log('[3/3] 挂载参数  :', JSON.stringify({
  name: '@deepseek-ai/dsh-mcp-client',
  configFingerprint: {
    serverName: cfg.serverName,
    transport: cfg.transport,
    url: cfg.url,
    token: tokenFingerprint(r.token),
  },
}));
console.log('✅ 演练通过：token 仅存在于 Authorization 头；日志只见', tokenFingerprint(r.token));