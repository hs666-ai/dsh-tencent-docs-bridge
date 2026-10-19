/**
 * bundle.test.mjs — 真实宿主加载契约回归测试（0.2.2 事故防回归）。
 *
 * 事故：cordis.patch.yml 里写 `name: 'dsh-tencent-docs-bridge'`（未带 scope），
 * 而 npm 包名是 `@hs666-ai/dsh-tencent-docs-bridge`；profile 的 node_modules
 * 里只存在 scoped 目录，宿主按 patch 的 name 去 import 时抛
 * MODULE_NOT_FOUND → 插件面板显示「启用失败 / 未运行」。
 *
 * 这里锁三件事：
 *  1. patch 的 name 必须与 package.json 的 name **完全一致**（scoped 包必须带 scope）；
 *  2. patch 文件必须被 package.json 的 files 收录且 exports 暴露；
 *  3. 入口模块导出了 apply / name（官方插件规范）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** 极简 YAML 提取：patch 里第一个 `name: '<x>'`。 */
function patchEntryName(yamlText) {
  const m = yamlText.match(/^\s*name:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m);
  return m ? m[1].trim() : '';
}

test('bundle patch 的 name 与 package.json name 完全一致（scoped 包必带 scope）', () => {
  const patchPath = join(root, pkg.dsh?.bundle?.patch ?? './cordis.patch.yml');
  const yaml = readFileSync(patchPath, 'utf8');
  const entryName = patchEntryName(yaml);
  assert.equal(
    entryName,
    pkg.name,
    `cordis.patch.yml 的 name=${JSON.stringify(entryName)} 必须等于 package.json name=${JSON.stringify(pkg.name)}，否则真实宿主 import 会 MODULE_NOT_FOUND`,
  );
});

test('patch 未使用裸名（无 scope 的包名）', () => {
  if (!pkg.name.startsWith('@')) return; // 非 scoped 包裸名合法
  const yaml = readFileSync(join(root, pkg.dsh?.bundle?.patch ?? './cordis.patch.yml'), 'utf8');
  const bare = pkg.name.split('/')[1];
  const entryName = patchEntryName(yaml);
  assert.notEqual(entryName, bare, 'scoped 包禁止在 patch 里用裸名，宿主解析不到');
});

test('patch 与入口都在 package.json files / exports 中（发布后才可用）', () => {
  assert.ok((pkg.files || []).some((f) => f.replace(/^\.\//, '').includes('cordis.patch.yml')), 'files 必须包含 cordis.patch.yml');
  assert.ok(pkg.exports?.['./cordis.patch.yml'], 'exports 必须暴露 ./cordis.patch.yml');
  assert.ok((pkg.files || []).includes('lib'), 'files 必须包含 lib（入口）');
});

test('入口按官方规范导出 apply 与 name', async () => {
  const mod = await import(pathToFileURL(join(root, 'lib', 'index.js')).href);
  assert.equal(typeof mod.apply, 'function', '必须导出 apply(ctx)');
  assert.equal(typeof mod.name, 'string', '必须导出 name');
});
