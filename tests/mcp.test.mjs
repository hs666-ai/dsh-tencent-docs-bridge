/**
 * mcp.test.mjs — mcp 配置构造与 JSON-RPC 请求体。
 * 验证：buildMcpConfig 的 config 完全合规（headers 用 Bearer、无冗余字段）、
 * jsonRpcRequest 是合法 JSON-RPC 2.0、declarative 片段不含明文 token 占位。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpConfig, jsonRpcRequest, declarativePatchSnippet, TDOC_MCP } from '../lib/mcp.js';

const SECRET = 'aabbccddeeff00112233445566778899';

test('buildMcpConfig 生成 streamable-http 配置，token 只出现在 Authorization', () => {
  const cfg = buildMcpConfig(SECRET);
  assert.equal(cfg.serverName, 'tencent-docs');
  assert.equal(cfg.transport, 'streamable-http');
  assert.equal(cfg.url, TDOC_MCP.endpoint);
  assert.equal(cfg.headers.Authorization, `Bearer ${SECRET}`);
  // 全量序列化中除 Authorization 外不得再出现 token
  const s = JSON.stringify(cfg);
  assert.equal(s.includes(SECRET), true);
  const s2 = s.replace(`Bearer ${SECRET}`, '');
  assert.ok(!s2.includes(SECRET), 'token 应只出现在 Authorization 头');
});

test('jsonRpcRequest 产合法 JSON-RPC 2.0', () => {
  const body = JSON.parse(jsonRpcRequest('tools/list', {}));
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.method, 'tools/list');
  assert.ok(body.id !== undefined);
  assert.deepEqual(body.params, {});
  const call = JSON.parse(jsonRpcRequest('tools/call', { name: 'x' }));
  assert.deepEqual(call.params, { name: 'x' });
});

test('declarative 片段：指引用户用环境变量，禁止明文 token 占位', () => {
  const snip = declarativePatchSnippet();
  assert.ok(snip.includes('process.env.TDOC_OAUTH_ACCESS_TOKEN'));
  assert.ok(!snip.includes('Bearer aabb'));
  assert.ok(!snip.includes('TODO'));
});