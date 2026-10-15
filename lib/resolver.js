/**
 * resolver.js — 取票链：env > 本地 vault > 本地自包含网关（若在跑）。
 * 与技能内 tdoc.py 同一语义，插件化后用 minimal 实现，避免依赖 Python/外部组件。
 *
 * 兼容对象（_source）供用户排查：本次 token 来自哪里。
 */
import { vaultToken, tokenFingerprint } from './vault.js';

/** 从本地网关取票（若用户自行起了 tdoc_gateway.py 之类兼容端点）。 */
async function gatewayToken(env = process.env) {
  const url = (env.TDOC_GATEWAY_URL || 'http://127.0.0.1:18761').replace(/\/+$/, '');
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(url + '/internal/tencent-docs/tokens', {
      signal: ctl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!r.ok) return '';
    const d = await r.json();
    const personal = d && d.personal;
    if (personal && personal.available && personal.token) return String(personal.token);
  } catch { /* 网关未运行等：静默回退 */ }
  return '';
}

/**
 * 解析当前可用 token。返回 { token, source }；无 token 时 token=''。
 * 优先级：显式环境变量 > 本地 vault > 本地网关。
 */
export async function resolveToken(env = process.env, vault = undefined) {
  const direct = (env.TDOC_OAUTH_ACCESS_TOKEN || '').trim();
  if (direct) return { token: direct, source: 'env' };
  const fromVault = vault ?? vaultToken(env.TDOC_VAULT || undefined);
  if (fromVault) return { token: fromVault, source: 'vault' };
  const gw = await gatewayToken(env);
  if (gw) return { token: gw, source: 'gateway' };
  return { token: '', source: 'none' };
}

/** 摘要（不含 token 明文）：用于启动日志。 */
export function summarize(r) {
  return `source=${r.source} token=${tokenFingerprint(r.token)}`;
}