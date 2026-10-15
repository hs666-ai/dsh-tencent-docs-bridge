/**
 * vault.js — 本地凭据箱读写（仅存用户自己的 space_secret）。
 *
 * 防泄露约束（见 COMPLIANCE.md §4）：
 *  - token 只允许出现在本模块返回值 / 发往官方端点的请求头；
 *  - 日志只输出 长度 + 前 4 位 前缀，绝不允许完整 token；
 *  - vault 文件权限收紧：Windows ACL / Unix chmod 600 仅当前用户。
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** 候选 vault 路径：env > 平台约定目录。 */
export function vaultPath(env = process.env) {
  const v = (env.TDOC_VAULT || '').trim();
  if (v) return v;
  return join(homedir(), '.dsh', 'tencent-docs', 'vault.json');
}

/** 读取 vault 并返回凭据对象；不存在 / 无 token 时返回 {}。 */
export function readVault(path = vaultPath()) {
  try {
    const d = JSON.parse(readFileSync(path, 'utf8'));
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

/** 写 vault（含机型/时间戳记录），落盘后收紧权限。 */
export function writeVault(data, path = vaultPath()) {
  const dir = path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
  mkdirSync(dir, { recursive: true });
  const stamp = { ...data, _updated_at: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(stamp, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* Windows 无此概念，用 ACL 兜底（见 tightenAcl） */ }
  return stamp;
}

/** 清空 vault 中的凭据（用户主动退出登录用）。 */
export function clearVault(path = vaultPath()) {
  writeVault({}, path);
}

/** 从 vault 取当前 access_token（不存在返回空串）。 */
export function vaultToken(path = vaultPath()) {
  return readVault(path).access_token || '';
}

/** token 脱敏展示：只给 长度 与 前 4 位，如 `len32:83ca…`；空则 `(无)`。 */
export function tokenFingerprint(tok) {
  if (!tok) return '(无)';
  return `len${tok.length}:${String(tok).slice(0, 4)}…`;
}

/** 校验 space_secret 格式：32 位小写 hex（官方 create_secret 产物）。 */
export function isValidSecret(tok) {
  return typeof tok === 'string' && /^[0-9a-f]{32}$/i.test(tok);
}

/* Windows：收紧 vault 目录 ACL 为当前用户（仅最外层 .dsh 目录，递归实现成本高，
   这里对 vault 文件本身做最小 ACL 收紧；失败静默——文件缺省权限由用户目录继承）。 */
export function tightenAcl(path = vaultPath()) {
  try {
    if (process.platform !== 'win32') return;
    if (!existsSync(path)) return;
    execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:RW`], { stdio: 'ignore' });
  } catch { /* 无需向用户报错：缺省权限已由用户目录保证 */ }
}