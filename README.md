# dsh-tencent-docs-bridge · 腾讯文档 MCP 桥

> **社区 · 非官方** 项目。连接腾讯文档开放平台**官方 MCP 端点**的 DSH 插件，
> 复用官方 `@deepseek-ai/dsh-mcp-client`，配以完全自足的取票链路
> （扫码 → 本地 vault → 动态挂载）。**仓库零内嵌凭据。**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.6-green.svg)](package.json)
[![Topic](https://img.shields.io/badge/topic-dsh--plugin-0e7490.svg)](https://github.com/topics/dsh-plugin)

- [免责声明](DISCLAIMER.md)（安装/使用前必读）
- [合规调研与约束矩阵](COMPLIANCE.md)

---

## 这是什么

DeepSeek Harness（DSH）插件，作用一句话：**让你在 DSH 里直接对腾讯文档说人话**
（"把这张表第 5 行改成 100 并标黄"），底层走腾讯文档官方 MCP。

| 项 | 值 |
|---|---|
| 连接目标 | 腾讯文档开放平台官方 MCP 端点 `https://docs.qq.com/openapi/mcp` |
| 方案 | **方案 A**：复用官方 `@deepseek-ai/dsh-mcp-client`（streamable-http），插件只做「取票 + 配置注入」 |
| 凭据 | 用户**自己的** space_secret，仅存本地 vault / 环境变量，仓库与配置文件零明文 |
| 官方参考 | [MCP 概述](https://docs.qq.com/open/document/mcp/) · [服务使用须知](https://docs.qq.com/doc/p/ebfba6637ebd4b6b6e0ee20ee890bcbf64d5273a) · [错误码](https://docs.qq.com/open/document/mcp/error-code/) |

---

## ⚠️ 重要声明（务必先读）

1. **非官方**：本项目是社区项目，与腾讯无隶属/授权关系，不使用腾讯商标素材。
2. **自担风险**：所有对官方端点的调用发生在**你的**腾讯账号责任范围内；
   官方频率限制（免费 2000 次/天）由官方执行，本项目不绕过。
3. **凭据安全**：`space_secret` = 你账号的 API 凭据，**只保存在本地**，
   请勿分享；轮换会使旧值立即失效。
4. **不存不传**：本项目**不存储、不传输、不托管**你的文档内容与登录凭据，
   凭据仅存本地 vault / 环境变量，可随时清除。
5. **无担保**：项目按"现状"（AS-IS）提供，作者不对兼容性、可用性做保证。
6. 完整条款见 [DISCLAIMER.md](DISCLAIMER.md)，设计约束见 [COMPLIANCE.md](COMPLIANCE.md)。

---

## 快速开始

### 前置条件

- DSH（DeepSeek Harness）环境，Node.js ≥ 22.6
- 一个腾讯文档账号（支持个人版，QQ/微信登录）
- 官方 mcp-client 包已就位（通常随 profile 自带；如缺：
  `npm i -g @deepseek-ai/dsh-mcp-client`）

### 安装插件

```bash
# 从 npm（发布后）：
dsh plugin --profile web add dsh-tencent-docs-bridge

# 或从 GitHub（推荐提交市场时使用）：
dsh plugin --profile web add github:hs666-ai/dsh-tencent-docs-bridge
```

> 支持 profile：`web`（GUI 桌面）等任意 profile；安装后需重启 `dsh web` 生效。

### 自足取票（第一步：准备凭据）

插件**不内置任何 token**。你需要先拿到自己账号的 `space_secret`（32 位 hex）：

**方式 1（推荐，完全自足）—— 用本插件自带 CLI：**
```bash
# 1) 在浏览器登录 https://docs.qq.com/desktop/ （微信/QQ 扫码）
# 2) 从登录态获取 space_secret，写入本地 vault：
npx tdoc-auth inject --token <32位hex>
# 3) 验证：
npx tdoc-auth probe
```
> `space_secret` 获取细节见 [docs/SELF-SERVE.md](docs/SELF-SERVE.md)
> （含 create_secret 接口说明——这是 docs.qq.com 官方登录态下的标准取票口）。

**方式 2 —— 环境变量：**
```bash
export TDOC_OAUTH_ACCESS_TOKEN=<32位hex>
```

**方式 3 —— 本地网关：** 若你已在 127.0.0.1:18761 跑了一个兼容
`/internal/tencent-docs/tokens` 的网关，插件启动时也会从那里取。

### 重启并验证

重启 `dsh web` 后，插件会自动把官方 mcp-client 挂上（`serverName=tencent-docs`）。
工具以 `mcp__tencent-docs__*` 出现，例如：

- `mcp__tencent-docs__get_sheet_info`
- `mcp__tencent-docs__set_cell_value`
- `mcp__tencent-docs__manage_search_file`
- …

对模型说一句"列出我最近的腾讯文档"即可验证。

---

## 工作方式（方案 A 细节）

```
┌──────────────┐   loader.create    ┌──────────────────────┐   HTTP/JSON-RPC   ┌────────────────────┐
│ dsh 插件入口  │ ─────────────────▶ │ @deepseek-ai/         │ ────────────────▶ │ docs.qq.com        │
│ lib/index.js │   (动态挂载，        │ dsh-mcp-client        │   Bearer          │ /openapi/mcp 官方  │
│              │    token 来自 vault)│ (streamable-http)     │   space_secret    │ MCP 端点           │
└──────┬───────┘                     └──────────────────────┘                   └────────────────────┘
       │
       ▼ 取票链（见 lib/resolver.js）
 env TDOC_OAUTH_ACCESS_TOKEN  →  本地 vault.json  →  本地网关 127.0.0.1:18761
```

| 文件 | 职责 |
|---|---|
| `lib/index.js` | 插件入口：启动时取票 → `ctx.loader.create` 挂载官方 mcp-client |
| `lib/resolver.js` | 取票链：env > vault > 本地网关（兼容） |
| `lib/vault.js` | 本地凭据箱：读写 + 权限收紧 + 脱敏指纹 |
| `lib/mcp.js` | 端点定义唯一来源 + mcp-client config 构造（两种模式共用） |
| `bin/tdoc-auth.mjs` | 取票 CLI：inject / probe / status / clear |
| `cordis.patch.yml` | 把插件自身插入 profile 层（mcp 条目由运行时挂载，绝无明文） |

---

## Declarative 模式（可选）

如果你**不想用运行时挂载**，也可以自己把手动 mcp-client 条目贴在
profile 的 `cordis.patch.yml`，token 走环境变量（**不要贴明文**）：

```yaml
- insert:
    - id: mcp-tencent-docs
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: tencent-docs
        transport: streamable-http
        url: https://docs.qq.com/openapi/mcp
        headers:
          Authorization: !!js `Bearer ${process.env.TDOC_OAUTH_ACCESS_TOKEN}`
        toolCallTimeoutMs: 60000
```

然后用 `--disable-runtime-mount` 启动插件（或直接从 profile 移除本插件，只留上方条目也行）。

---

## 安全设计（COMPLIANCE.md §4 的落地）

- ✅ 仓库、cordis.patch.yml、README 中**零 token 明文**（CI 有检查，见下）
- ✅ token 只存在：本地 vault（权限 0600 / Windows ACL 收紧）+ 进程内存 + 发往官方端点的请求头
- ✅ 日志只输出「长度+前 4 位」指纹（`len32:83ca…`），绝无完整 token
- ✅ 模型只见 MCP 工具结果（业务数据），不见 token
- ✅ 卸载 = 本文档 + `npx tdoc-auth clear` 清空 vault，即完全断连
- ✅ `npx tdoc-auth status` 可随时查看 vault 摘要（无明文）

## 开发 / 测试

```bash
npm run check      # typecheck + test（沙箱内可用 node tests/*.mjs 单跑）
```

## 本地验证记录（v0.1.0 装机实测）

在 DeepSeek Harness v0.2.0-rc.2 上做过**真实装机验证**（独立 profile，测完即卸）：

| 验证项 | 结果 |
|---|---|
| `dsh plugin add` 本地 tgz 安装 | ✅ exit 0 |
| `--dump-config` 合成树含 `- id: dsh-tencent-docs-bridge` | ✅ |
| 插件入口模块加载（`import()`） | ✅ `OK exports: name,apply` |
| boot 宿主加载 | ✅ 无 `failed to import`（修复前会报 `warning: entry did not activate`） |
| 测试 / 防泄露扫描 | ✅ 18/18 单测 + 零硬编码凭据 |

> 曾发现并修复一个加载兼容性问题：插件入口顶层 `import '@deepseek-ai/cordis'`
> 会导致真实宿主 `failed to import`（cordis 为宿主注入的 peer dep，插件自身
> node_modules 中解析不到）。已改为官方同款 `apply(ctx)` 模式，运行时不依赖
> cordis 模块解析。发布前防泄露检查见 [docs/RELEASE.md](docs/RELEASE.md)。

## 发布（维护者）

1. 建独立 GitHub 仓库，打 `dsh-plugin` topic（市场自动收录）
2. `npm publish`
3. 更新 [docs/RELEASE.md](docs/RELEASE.md)

---

## 许可与合规

- 代码：[MIT](LICENSE)
- 免责：[DISCLAIMER.md](DISCLAIMER.md)
- 合规基线：[COMPLIANCE.md](COMPLIANCE.md)（含官方条款出处、Do/Don't、泄露防护清单）

**本插件独立于腾讯文档官方发布；"腾讯文档"为腾讯公司商标，仅用于客观指称其官方产品。**