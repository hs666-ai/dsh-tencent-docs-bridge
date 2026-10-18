# RELEASE.md —— 发布维护说明（维护者用）

> 目标：让插件进入 [dsh-plugin.org](https://dsh-plugin.org) 插件市场
> （社区收录，与腾讯官方无关，仅作客观指称）。

## 前置检查（每次发布前必须通过）

```bash
npm run check       # 防泄露检查 + 语法 + 单元测试
npx tdoc-auth status  # 确认不误打印任何明文
```

`check` 里包含 `scripts/check-no-token.mjs`（禁止仓库出现 32 位 hex 疑似凭据）。

## 发布步骤

1. **建独立 GitHub 仓库**（本项目就是这个仓库），例如
   `dshplugin/` 组织下或你的用户名下。名字保持 `dsh-tencent-docs-bridge`。
2. **打 topic**：在 GitHub 仓库 Settings → Topics 添加 **`dsh-plugin`**。
   → dsh-plugin.org 每日爬取，自动收录（官方机制，见其 README）。
3. **npm 发布**（插件市场安装走 npm 包名）：
   ```bash
   npm version patch        # 或 minor/major
   npm publish
   ```
4. **GitHub Release**：打 tag `v<版本>`，发布说明写「用户可见能力」：
   - 更新了什么（如"新增 probe 命令""适配官方端点变更"）
   - 不写内部实现手段
5. **自测安装**：
   ```bash
   dsh plugin --profile web add @hs666-ai/dsh-tencent-docs-bridge
   # 重启 dsh web → 设置 → 插件
   ```

## 更新分支的注意

- **官方端点变更**：只改 `lib/mcp.js` 的 `TDOC_MCP.endpoint` 一处
  （COMPLIANCE.md §2 的设计约束）。
- **DSH mcp-client 变更**：关注 `@deepseek-ai/dsh-mcp-client` 的 config schema
  （`lib/mcp.js` 的 `buildMcpConfig` 是唯一构造点）。
- **官方条款变更**：若腾讯文档《服务使用须知》更新，核对 COMPLIANCE.md 与
  DISCLAIMER.md 是否需要同步修订。

## 发布的纪律

- 仓库任何文本文件里**禁止**出现真实 space_secret。
- 测试夹具里的"无效 32 位 hex"在 `scripts/check-no-token.mjs` 里白名单化。
- 发布前运行 `npm run check` 全绿才允许 `npm publish`。

## 版本历史

- **0.2.1**：登录体验文案优化——扫码等待期的 400 错误页 / 页面空白不再显示
  原始报错，改为「等待扫码完成…」「页面尚未就绪，正在等待加载…」等友好提示。
- **0.2.0**：新增 `tdoc-auth login` 一键取票（自动定位 Chrome/Edge → 弹窗扫码 →
  官方 create_secret 取票写 vault，一条命令完成，纯 Node 内置零外部依赖）；
  修复「普通用户需手动开调试 Chrome + 手动粘贴 hex」的体验缺陷。
- **0.1.0**（初始）：方案 A 骨架——取票链（env>vault>网关）+ 运行时挂载官方
  mcp-client + tdoc-auth CLI + 防泄露测试与发布检查。尚未接入真实账号验证。