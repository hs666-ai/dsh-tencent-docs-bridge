# 合规调研与约束矩阵 —— dsh-tencent-docs-bridge

> 调研日期：2026-10-15（基于公开可访问的腾讯文档开放平台官方文档）
> 用途：本文件是插件开发的合规基线。开发、打包、发布每一步都按本表约束执行。

---

## 1. 关键事实（官方公开信息）

腾讯文档开放平台**官方提供 MCP 能力**，不是我们逆向发明的接口：

| 事实 | 出处 |
|---|---|
| 官方文档「MCP 概述」：腾讯文档开放平台基于 Open API 能力兼容 MCP 协议，需登录 QQ/微信后操作对应账号数据 | https://docs.qq.com/open/document/mcp/ |
| 官方"服务使用须知"（使用 MCP 前必须阅读） | https://docs.qq.com/doc/p/ebfba6637ebd4b6b6e0ee20ee890bcbf64d5273a |
| 官方频率控制：免费用户 2000 次/天；超级会员 20000/天；超级会员 Plus 40000/天 | https://docs.qq.com/open/document/mcp/ |
| 官方错误码：400006 UNAUTHENTICATED（mcp token 是否合法）、400012 OAUTH_EXPIRED（mcp token 是否已失效）——证明"mcp token"是官方概念，与云端 space_secret 一致 | https://docs.qq.com/open/document/mcp/error-code/ |
| 官方 Skill 能力清单（自然语言驱动文档/表格操作，MCP 工具集） | https://docs.qq.com/open/document/mcp/skill/ |
| 官方 MCP 使用指南（AIO 文档，需登录可见） | https://docs.qq.com/aio/p/scscyt11f44r7mn |
| 官方认证规范：token 经 QQ/微信登录态获得（docs.qq.com OAuth v2 space/create_secret，32 位 hex space_secret） | 本地实测 + 官方错误码印证 |
| DSH 官方 mcp-client 包：`@deepseek-ai/dsh-mcp-client`，支持 streamable-http，headers 可用 `!js` 表达式引用环境变量（token 可走 env，不进仓库/配置文件） | https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/mcp/mcp-client |

---

## 2. 约束矩阵（Do / Don't）

### ✅ 可以做
| 事项 | 依据 |
|---|---|
| 面向腾讯文档官方 MCP 端点（`https://docs.qq.com/openapi/mcp`）做**客户端**调用 | 官方开放平台正式提供 MCP，无禁用条款 |
| 提供**用户自持账号**下的取票机制（用户自己扫码登录 → 本地生成/轮换 space_secret） | 官方认证即 QQ/微信登录态；无第三方应用注册门槛 |
| 本地保存 token（用户自己机器、用户自己的账号凭据） | 等价于用户自己保存密码/会话；单用户本地使用 |
| 直连官方端点传输（Bearer space_secret，中性 UA：`DSH-TencentDocs-Bridge/<ver> (community)`） | 官方错误码体系即 mcp token Bearer 鉴权 |
| 尊重官方频率控制（提示用户配额，不做绕过加速） | 官方"频率控制约定"是服务条款的一部分 |

### ❌ 不可以做
| 事项 | 风险 |
|---|---|
| 在插件/仓库里**内嵌任何账号、token、兑奖券、密钥** | 凭据泄露；space_secret 一旦公开即等于交出账号访问权 |
| 用插件承载**他人**的 token（多租户托管、代取票、中转 relay） | 变相成为凭据托管方，安全与合规责任无限 |
| 声称"官方出品 / 腾讯授权 / 与腾讯官方合作" | 侵权/虚假宣传；本项目必须标注社区、非官方、无隶属 |
| 使用腾讯商标 logo、官方视觉素材做插件市场卡片 | 商标侵权 |
| 绕过/篡改官方限频、批量刷量 | 违反服务条款、可能触发封号 |
| 逆向腾讯未公开协议或破解鉴权（我们只走官方 MCP 端点与官方认证接口） | 我们未做、也不允许贡献者做 |
| 读取/写入用户未授权的文件或泄露文档内容给第三方 | 隐私泄露 |

### ⚠️ 注意（写入文档）
| 事项 | 处置 |
|---|---|
| `openapi/mcp` 属官方 MCP 端点，但 `mcp_source=desktop` 等字段为客户端会话参数，语义可能随官方调整 | 插件做兼容层，端点/参数集中一个文件维护，官方变更时只改一处 |
| space_secret 轮换即作废旧值（官方验证过：refresh 旋转） | README 明示"轮换即全局失效，请自行保管" |
| 服务使用须知是 docx 需登录阅读 | README 必须附链接，提示用户"使用前阅读官方须知" |

---

## 3. 免责声明（必须完整出现在 README / DISCLAIMER / tdoc-auth 安装确认三处）

> LICENSE 保持标准 MIT 原文（便于 GitHub/扫描器识别为 MIT），
> 免责条款不写入 LICENSE，集中承载在 DISCLAIMER.md；三处落地：
> ① README「⚠️ 重要声明」段（已含本条 6 项摘要）；
> ② DISCLAIMER.md（完整条款）；
> ③ `bin/tdoc-auth.mjs` 任一实子命令（inject/probe/status/clear）执行时输出一行社区非官方提示。

- 本项目是**社区/独立项目**，与腾讯公司及其关联公司**无任何隶属、授权或合作关系**
- 插件仅作为**客户端封装**连接腾讯文档官方开放的 MCP 端点；调用腾讯文档所产生的一切责任
  （数据安全、内容合规、账号状态）均由用户自己在其腾讯账号范围内承担
- 使用本项目即视为已阅读并同意腾讯文档官方《服务使用须知》与《腾讯文档服务条款》
- 本项目**不存储、不传输、不托管**任何用户的文档内容与登录凭据；
  凭据仅保存在用户本地，且可由用户随时轮换/清除
- 本插件按"现状"提供，作者不对插件与官方端点的兼容性、可用性做任何保证

---

## 4. 信息泄露防护清单（实现时逐条落实）

1. token 只存在于：用户本地 vault 文件 + 内存变量 + 发往官方端点的请求头
2. 日志脱敏：任何日志/错误输出只允许出现 token 长度与首 4 位前缀，禁止完整 token
3. 模型上下文隔离：MCP 工具的响应只返回业务数据；取票脚本结果不回传 token 值进对话
4. vault 文件权限：Windows 用 ACL 收紧为当前用户；Unix 用 chmod 600
5. 配置文件（cordis.patch.yml / mcp 配置）中 token 一律走 `!js process.env.XXX` 引用，
   禁止把明文 token 写入任何会进 git / 打包的文本
6. 仓库 .gitignore 覆盖 vault、cache、dump、*.log 等
7. 安装/卸载流程不打印、不要求手动输入完整 token