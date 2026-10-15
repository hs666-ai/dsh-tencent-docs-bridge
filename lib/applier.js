/**
 * applier.js — 挂载决策的纯逻辑（与 cordis 解耦，便于单元测试）。
 *
 * apply(index.js) 只负责把 ctx.loader / ctx.logger / ctx.config 传进来；
 * 这里完成「是否挂载 / 挂什么 / 失败怎么处理」的全部分支。
 */
import { buildMcpConfig, TDOC_MCP } from './mcp.js';

/**
 * 尝试挂载官方 mcp-client。
 * @param {object} deps
 * @param {any} deps.loader ctx.loader 实例（create/resolve）
 * @param {any} deps.logger ctx.logger（info/warn）
 * @param {object} deps.cfg   插件配置（failOnStartupError/disableRuntimeMount）
 * @param {string} deps.token 已解析的 space_secret（可能为空）
 * @param {string} deps.source token 来源（env/vault/gateway/none）
 * @returns {Promise<{mounted: boolean, reason?: string}>}
 */
export async function mountMcpClient({ loader, logger, cfg = {}, token = '', source = 'none' }) {
  if (cfg.disableRuntimeMount) {
    logger?.info('[tencent-docs-bridge] 已禁用运行时挂载（declarative 模式）。');
    return { mounted: false, reason: 'declarative' };
  }

  if (!token) {
    const msg =
      '未找到腾讯文档 token。请设置 TDOC_OAUTH_ACCESS_TOKEN、写入 vault，或运行本地网关。' +
      ' 详见 README「自足取票」。';
    if (cfg.failOnStartupError) throw new Error(msg);
    logger?.warn('[tencent-docs-bridge] ' + msg);
    return { mounted: false, reason: 'no-token' };
  }

  try {
    const id = await loader.create({
      name: '@deepseek-ai/dsh-mcp-client',
      config: buildMcpConfig(token),
    });
    await loader.resolve(id);
    logger?.info(
      `[tencent-docs-bridge] 已挂载官方 mcp-client（serverName=${TDOC_MCP.serverName}，` +
      `token 来源=${source}，未落任何配置文件）`
    );
    return { mounted: true };
  } catch (e) {
    const msg = `挂载官方 mcp-client 失败（需先安装 @deepseek-ai/dsh-mcp-client）：${e?.message ?? e}`;
    if (cfg.failOnStartupError) throw new Error(msg);
    logger?.warn('[tencent-docs-bridge] ' + msg);
    return { mounted: false, reason: 'mount-error' };
  }
}