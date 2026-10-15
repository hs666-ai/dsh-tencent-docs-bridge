# SELF-SERVE.md —— 自足取票指南（space_secret 获取）

> 本插件**不内置、不代管**任何腾讯文档凭据。你需要为**自己的账号**获取一次
> `space_secret`（32 位 hex）。以下全部指向 docs.qq.com 官方登录态/官方端点，
> 不依赖 WorkBuddy、不依赖任何浏览器自动化组件（仅需一次人工扫码）。

---

## 背景：space_secret 是什么

腾讯文档开放平台基于 Open API 兼容 MCP 协议（官方文档 [MCP 概述](https://docs.qq.com/open/document/mcp/)），
其鉴权凭据即「空间密钥 space_secret」（32 位小写 hex）：

```
Authorization: Bearer <space_secret>
```

space_secret 由 docs.qq.com 网页登录态（QQ/微信扫码）下发，可通过官方`
OAuth v2 space/create_secret` 接口获取或轮换：

```
GET https://docs.qq.com/oauth/v2/space/create_secret?refresh=0|1&mcp_source=desktop&xsrf=<TOK>
```

- `refresh=0`：返回当前 secret（不轮换）
- `refresh=1`：轮换出新 secret，**旧 secret 立即全局失效**（4 个 MCP 端点通用）

官方错误码页印证该体系（[错误码](https://docs.qq.com/open/document/mcp/error-code/)）：
`400006 UNAUTHENTICATED`（mcp token 是否合法）与 `400012 OAUTH_EXPIRED`
（mcp token 是否已失效）。

---

## 获取步骤（推荐：完全自足，一次扫码）

1. **启动带远程调试的 Chrome** 并登录腾讯文档：
   ```bash
   chrome.exe --remote-debugging-port=<PORT> https://docs.qq.com/desktop/
   ```
   用微信/QQ 扫码完成登录（会话保持）。

2. **从登录态取 space_secret**，写入本插件 vault：
   ```bash
   npx tdoc-auth inject --token <32位hex>
   ```
   （`<32位hex>` 来自上述接口返回；若你已有字符串则直接粘贴。）

   > 取到 secret 的工程细节：登录态 Cookie（TOK 即 xsrf）+ `create_secret` 调用。
   > 若你想自动化这一步而非手工粘贴，可用你本地的 `tdoc_token.py`
   > （`self-get --port <PORT>`），语义与上方接口一致——本插件只负责保管与使用，
   > 不把取票做成必须项。

3. **验证**：
   ```bash
   npx tdoc-auth probe
   ```
   → `✅ 官方端点返回 200（工具数 …）` 即成功。

---

## 备选方案（都不影响插件使用）

| 方式 | 做法 | 适用 |
|---|---|---|
| 环境变量 | `export TDOC_OAUTH_ACCESS_TOKEN=<32位hex>` | 脚本/CI 场景 |
| 本地网关 | 在 `127.0.0.1:18761` 跑兼容 `/internal/tencent-docs/tokens` 的网关 | 已用 tdoc_gateway.py 的用户 |
| 手动写 vault | 编辑 `~/.dsh/tencent-docs/vault.json` 的 `access_token` 字段 | 无 CLI 场景 |

---

## 安全提醒

- space_secret 拥有你账号在腾讯文档的 API 访问能力：**不要分享给任何人**、
  不要提交进任何 git 仓库、不要在对话/日志里出现完整值。
- **轮换即旧值永久失效**：怀疑泄露时，回到登录态 `refresh=1` 轮换一个新值，
  旧值即刻不可用——这是最快的"改密码"手段。
- 本插件只在以下三处用到 token：本地 vault / 进程内存 / 发往 docs.qq.com 的
  Authorization 请求头。日志与模型上下文一律只见脱敏指纹（`len32:83ca…`）。