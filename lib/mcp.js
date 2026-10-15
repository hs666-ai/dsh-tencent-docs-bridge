/**
 * mcp.js — 腾讯文档官方 MCP 端点的「静态配置声明」，供插件两种模式复用：
 *
 *  - runtime 模式：插件启动时用 ctx.loader.create 动态挂载 mcp-client，
 *    token 来自本地 vault（见 index.js）——仓库里永远没有明文。
 *  - declarative 模式：用户自己把以下条目贴在 profile 的 cordis.patch.yml，
 *    headers 用 !!js 表达式从环境变量取（也禁止贴明文）。
 *
 * 只维护「一份端点定义」，官方端点变更时改这里一处即可（COMPLIANCE.md §2 注意）。
 */
export const TDOC_MCP = {
  serverName: 'tencent-docs',
  description: '腾讯文档官方 MCP（docs.qq.com 开放平台）——非官方桥接插件，仅声明连接配置',
  endpoint: 'https://docs.qq.com/openapi/mcp',
};

/**
 * 构造 JSON-RPC 2.0 请求体（MCP protocol，官方端点实现）。
 * @param {string} method MCP 方法名（tools/list / tools/call / initialize…）
 * @param {object} params 方法参数
 * @returns {string} 序列化后的 JSON 字符串
 */
export function jsonRpcRequest(method, params = {}) {
  return JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
}

/**
 * 生成 mcp-client 的 config（streamable-http）。
 * @param {string} token 已解析出的 space_secret
 * @returns {object} 可直接传给 ctx.loader.create 的 config
 */
export function buildMcpConfig(token) {
  return {
    serverName: TDOC_MCP.serverName,
    transport: 'streamable-http',
    url: TDOC_MCP.endpoint,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // 官方频控（免费 2000/天 等）由官方执行，客户端不做任何规避；
    // 这里仅设置工具调用超时。
    toolCallTimeoutMs: 60000,
  };
}

/** declarative 模式供用户粘贴的 YAML 片段（headers 用 !!js 引环境变量）。 */
export function declarativePatchSnippet() {
  return `
# 粘贴到 profile 的 cordis.patch.yml 的 - insert: 段下（示例）：
# - insert:
#     - id: mcp-tencent-docs
#       name: '@deepseek-ai/dsh-mcp-client'
#       config:
#         serverName: ${TDOC_MCP.serverName}
#         transport: streamable-http
#         url: ${TDOC_MCP.endpoint}
#         headers:
#           Authorization: !!js \`Bearer \${process.env.TDOC_OAUTH_ACCESS_TOKEN}\`
#         toolCallTimeoutMs: 60000
`.trim();
}