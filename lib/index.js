/**
 * index.js — dsh-tencent-docs-bridge 插件入口（服务端）。
 *
 * 职责（方案 A：复用官方 mcp-client）：
 *  1. 启动时解析本地 token（env > vault > 网关）；
 *  2. 若持有 token，动态挂载 @deepseek-ai/dsh-mcp-client 指向官方 MCP 端点；
 *  3. 不持有 token 时给出指引，不阻塞 harness 启动；
 *  4. 挂载决策与分支集中在 lib/applier.js（纯逻辑，可单测）。
 *
 * 加载兼容性（重要）：
 *  运行时不 import '@deepseek-ai/cordis' —— 插件装在 profile node_modules 时
 *  cordis 属宿主注入（peer dep 不落地），顶层 import 会导致模块加载即失败
 *  （"failed to import"）。按官方 dsh-plugin 的写法，host 上下文经 apply(ctx)
 *  传入，ctx.loader / ctx.logger 由 cordis 注入后可用。
 *
 * 零明文约束见 COMPLIANCE.md §4：token 仅存 vault/内存/请求头。
 */
import { resolveToken, summarize } from './resolver.js';
import { mountMcpClient } from './applier.js';

export const name = 'dsh-tencent-docs-bridge';

/**
 * 配置项（全部可选，随 apply 第二参数传入）：
 *  - failOnStartupError: 无 token / 挂载失败是否作为硬失败（默认 false）
 *  - disableRuntimeMount: 显式关闭运行时挂载（declarative 模式，默认 false）
 */

/**
 * @param {any} ctx cordis host 上下文（含 loader/logger；由宿主注入）
 * @param {object} config 插件配置
 */
export async function apply(ctx, config = {}) {
  const loader = ctx?.loader;
  if (!loader || typeof loader.create !== 'function') {
    ctx?.logger?.warn?.('[tencent-docs-bridge] 当前宿主未提供 loader 服务，跳过 MCP 挂载。');
    return;
  }

  const r = await resolveToken(process.env);
  ctx.logger?.info?.(`[tencent-docs-bridge] token 状态: ${summarize(r)}`);

  await mountMcpClient({
    loader,
    logger: ctx.logger,
    cfg: config ?? {},
    token: r.token,
    source: r.source,
  });
}

export default { name, apply };