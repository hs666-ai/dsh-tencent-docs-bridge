#!/usr/bin/env node
/**
 * tdoc-auth.mjs — 腾讯文档 space_secret 取票 CLI（纯 Node，零外部依赖）。
 *
 * 用法：
 *   node tdoc-auth.mjs status                    # vault 摘要（不含 token 明文）
 *   node tdoc-auth.mjs inject --token <secret>   # 手动写入 space_secret（粘贴自扫码结果）
 *   node tdoc-auth.mjs inject --file creds.json  # 从 JSON {access_token} 读入
 *   node tdoc-auth.mjs probe                     # 用 vault/env 里的 token 探测官方端点有效性
 *   node tdoc-auth.mjs clear                     # 清空 vault 凭据（退出登录）
 *
 * 安全约束（COMPLIANCE.md §4）：全程不打印完整 token；日志只有 长度+前4位；
 * vault 写入限定当前用户权限（0600 / Windows ACL）。
 */
import { resolveToken, summarize } from '../lib/resolver.js';
import { readVault, writeVault, clearVault, vaultPath, tokenFingerprint, tightenAcl, isValidSecret } from '../lib/vault.js';
import { TDOC_MCP, jsonRpcRequest } from '../lib/mcp.js';

const HELP = `用法: tdoc-auth <subcommand> [options]
  status                    查看本地 vault 摘要（不含 token 明文）
  inject --token <secret>   手动写入 space_secret（粘贴自扫码结果）
  inject --file <path>      从 JSON 文件读 access_token 写入
  probe                     用取票链上的 token 探测官方 MCP 端点有效性
  clear                     清空 vault 凭据（退出登录）`;

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--token') o.token = argv[++i];
    else if (a === '--file') o.file = argv[++i];
    else o._.push(a);
  }
  return o;
}

/** 探测官方 MCP 端点：Bearer 鉴权下 tools/list 返回 200=有效 / 401=无效 */
async function probeToken(token) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(TDOC_MCP.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'DSH-TencentDocs-Bridge/0.1 (community)',
      },
      body: jsonRpcRequest('tools/list', {}),
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (r.status === 200) {
      const d = await r.json().catch(() => null);
      const tools = d && d.result ? d.result.tools : null;
      const n = Array.isArray(tools) ? tools.length : '?';
      return { ok: true, detail: `官方端点返回 200（工具数 ${n}）` };
    }
    if (r.status === 401) return { ok: false, detail: '官方端点返回 401：token 无效或已失效' };
    return { ok: false, detail: `官方端点返回 HTTP ${r.status}` };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, detail: `探测请求失败: ${e?.message ?? e}` };
  }
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const cmd = (a._[0] || '').toLowerCase();

  if (cmd === 'status') {
    const v = readVault();
    const tok = v.access_token || '';
    console.log('vault 路径 :', vaultPath());
    console.log('access    :', tokenFingerprint(tok) + (tok ? `（_source=${v._source || 'unknown'}）` : ''));
    console.log('updated_at:', v._updated_at || '(未标注)');
    return 0;
  }

  if (cmd === 'inject') {
    let tok = (a.token || '').trim();
    if (!tok && a.file) {
      const fs = await import('node:fs');
      const d = JSON.parse(fs.readFileSync(a.file, 'utf8'));
      tok = String(d.access_token || d.token || '').trim();
    }
    if (!isValidSecret(tok)) {
      console.error('space_secret 应为 32 位小写 hex。未写入。');
      return 2;
    }
    writeVault({ access_token: tok.toLowerCase(), _source: 'manual-inject' });
    tightenAcl();
    console.log('已写入 vault（', tokenFingerprint(tok), '）。可运行 `tdoc-auth probe` 验证。');
    return 0;
  }

  if (cmd === 'probe') {
    const r = await resolveToken();
    if (!r.token) { console.error('当前无 token（vault 空且未设置 TDOC_OAUTH_ACCESS_TOKEN）。'); return 2; }
    console.log('token 来源 :', r.source, '(', tokenFingerprint(r.token), ')');
    const p = await probeToken(r.token);
    console.log(p.ok ? `✅ ${p.detail}` : `❌ ${p.detail}`);
    return p.ok ? 0 : 2;
  }

  if (cmd === 'clear') {
    clearVault();
    console.log('已清空 vault 凭据。');
    return 0;
  }

  console.log(HELP);
  return 0;
}

main().then((code) => process.exit(code ?? 0)).catch((e) => {
  console.error('tdoc-auth 失败:', e?.message ?? e);
  process.exit(1);
});