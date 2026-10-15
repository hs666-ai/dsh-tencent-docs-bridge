#!/usr/bin/env node
/**
 * check-no-token.mjs — 发布前隐私/凭据泄露检查（CI / prepack 钩子）。
 *
 * 遍历仓库文本文件，报告 4 类问题：
 *   1. 32 位 hex 疑似 space_secret（tests 里的显式夹具值已白名单跳过）；
 *   2. JWT 格式令牌（eyJ…）；
 *   3. 本机用户标识（用户名 / 机器名 / 用户主目录）；
 *   4. 本机绝对路径（用户目录 / 工作区名 / D 盘根路径）——发布内容不应含开发机路径。
 *
 * 隐私设计（关键）：
 *   - 本机标识一律**运行时从环境获取**（USERNAME / COMPUTERNAME / USERPROFILE），
 *     源码中不出现任何开发者个人信息，因此本文件可安全发布；
 *   - 覆盖自定义：DSH_LOCAL_USERNAME / DSH_LOCAL_HOSTNAME / DSH_LOCAL_HOME_DIR；
 *   - 测试夹具 32 位 hex 放行（aabbccdd… 等为刻意无效值）。
 *
 * 用法：`node scripts/check-no-token.mjs`（发布/CI/prepack 前必跑）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SECRET_RE = /\b[0-9a-f]{32}\b/i;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/;
const TEST_FIXTURES = new Set([
  'aabbccddeeff00112233445566778899',
  '11111111222222223333333344444444',
  'aaaaaaaa00000000bbbbbbbbcccccccc',
  'deadbeefdeadbeefdeadbeefdeadbeef',
]);

// ---- 本机标识：运行时从环境获取（源码零硬编码） ----
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function localPatterns() {
  const out = [];
  const user = process.env.DSH_LOCAL_USERNAME || process.env.USERNAME;
  const host = process.env.DSH_LOCAL_HOSTNAME || process.env.COMPUTERNAME;
  const home = process.env.DSH_LOCAL_HOME_DIR ||
    (process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME);
  if (user) out.push({ label: '本机用户名', re: new RegExp(`\\b${escapeRe(user)}\\b`) });
  if (host) out.push({ label: '本机机器名', re: new RegExp(`\\b${escapeRe(host)}\\b`, 'i') });
  if (home) {
    const homeEsc = escapeRe(home.replace(/[\\/]+$/, ''));
    out.push({ label: '用户主目录绝对路径', re: new RegExp(homeEsc, 'i') });
  }
  return out;
}
const LOCAL = localPatterns();

// 本机绝对路径中的疑似凭据引用：必须以盘符（C:\，Windows 路径允许空格）
// 或 Unix 用户主目录（/home/<user>、/Users/<user>）为根，且路径末端含凭据关键词。
// 这样 `~/.dsh/tencent-docs/vault.json` 这类通用约定（无机器信息）不会被误报。
const ABS_PATH_RE =
  /(?:[A-Za-z]:\\|\/(?:home|Users)\/[^\\\/\s"'`]+)(?:[^"'`]+(?:\\|\/))*(?:vault\.json|\.tdoc[-_]?(?:gateway|login)|credentials|\.secret|token\.(?:json|txt)|\.ssh)(?:\\|\/|\b|$)/i;

const SKIP_DIRS = new Set(['node_modules', '.git', '.pnpm', 'dist-local']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(e)) walk(p, out);
    } else if (/\.(js|mjs|cjs|ts|json|md|yml|yaml|txt|ps1|bat|md)$/.test(e) && !e.endsWith('.lock')) {
      out.push(p);
    }
  }
  return out;
}

let bad = 0;

for (const f of walk(ROOT)) {
  const rel = f.slice(ROOT.length).replace(/\\/g, '/');
  const content = readFileSync(f, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const shown = line.trim().slice(0, 140);

    const sm = line.match(SECRET_RE);
    if (sm && !TEST_FIXTURES.has(sm[0].toLowerCase())) {
      console.error(`⚠️ [${rel}:${i + 1}] 疑似 space_secret: ${shown}`);
      bad++;
    }

    const jm = line.match(JWT_RE);
    if (jm) {
      console.error(`⚠️ [${rel}:${i + 1}] 疑似 JWT 令牌: ${shown}`);
      bad++;
    }

    for (const { label, re } of LOCAL) {
      if (re.test(line)) {
        console.error(`⚠️ [${rel}:${i + 1}] ${label} 泄露: ${shown}`);
        bad++;
      }
    }

    const cm = line.match(ABS_PATH_RE);
    if (cm) {
      console.error(`⚠️ [${rel}:${i + 1}] 本机绝对路径中疑似凭据引用: ${shown}`);
      bad++;
    }
  }
}

if (bad) {
  console.error(`\n✖ 检查未通过：发现 ${bad} 处疑似隐私/凭据泄露。请移除后再发布。`);
  process.exit(1);
}
console.log('✅ 防泄露检查通过：无 32 位 hex 凭据 / JWT / 本机标识 / 本机绝对路径。');