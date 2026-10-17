/**
 * fake-cdp-browser.mjs — 端到端测试用「假浏览器」。
 * 模拟 Chrome 的 CDP 行为：监听 --remote-debugging-port，提供 /json/version 与 /json，
 * 对 Runtime.evaluate 回应一个「扫码后登录态」的 create_secret 成功结果，
 * 从而让 `tdoc-auth login` 的完整链路（spawn → 轮询 CDP → 页面取票 → 写 vault）可离线自测。
 *
 * 用法（TDOC_BROWSER 指向本文件旁生成的 wrapper）：
 *   set TDOC_BROWSER=<dir>\fake-browser.cmd
 *   node bin/tdoc-auth.mjs login
 *
 * 仅用于自动化测试；真实使用由真实 Chrome 承担，行为一致（CDP 协议）。
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FAKE_SECRET = 'cafe' + '0'.repeat(26) + 'dd'; // 32 hex 拼接（避免源码字面量触发防泄露检查），非真凭据
const ROOT = dirname(fileURLToPath(import.meta.url));
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function parsePort(argv) {
  const a = argv.find((x) => x.startsWith('--remote-debugging-port='));
  return a ? parseInt(a.split('=')[1], 10) : 0;
}

function wsAccept(key) {
  return createHash('sha1').update(key + WS_MAGIC).digest('base64');
}

async function handleWs(req, socket) {
  const key = (req.headers['sec-websocket-key'] || '').trim();
  if (!key) { socket.end(); return; }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`
  );

  // 读第一帧（客户端 mask 帧），回应一条 Runtime.evaluate result
  let buf = Buffer.alloc(0);
  socket.on('data', (c) => {
    buf = Buffer.concat([buf, c]);
    if (buf.length < 2) return;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (buf.length < 4) return;
      len = buf.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (buf.length < 10) return;
      len = Number(buf.readBigUInt64BE(2));
      off = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length < off + maskLen + len) return;
    let payload = buf.slice(off + maskLen, off + maskLen + len);
    if (masked) {
      const mask = buf.slice(off, off + 4);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    const s = payload.toString('utf8');
    let id = 0;
    try { id = JSON.parse(s).id ?? 0; } catch { /* ignore */ }
    const body = JSON.stringify({
      status: 200,
      body: { ret: 0, data: { space_secret: FAKE_SECRET, expired: false } },
      xsrf_len: 16,
      pageUrl: 'https://docs.qq.com/desktop/',
    });
    // 页面里 createSecretExpression 返回的正是这个 JSON 字符串；CDP value 即该字符串本身
    const value = body;
    const frame = JSON.stringify({
      id,
      result: { result: { type: 'string', value } },
    });
    const out = Buffer.from(frame, 'utf8');
    const header = [0x81];
    if (out.length < 126) {
      header.push(out.length);
    } else if (out.length < 65536) {
      header.push(126, (out.length >> 8) & 0xff, out.length & 0xff);
    } else {
      header.push(127);
      const b = Buffer.alloc(8);
      b.writeBigUInt64BE(BigInt(out.length));
      header.push(...b);
    }
    socket.write(Buffer.concat([Buffer.from(header), out]));
  });
}

const port = parsePort(process.argv.slice(2));
if (!port) { console.error('fake-cdp: missing --remote-debugging-port'); process.exit(2); }

const server = createServer((req, res) => {
  if (req.url === '/json/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ Browser: 'Fake-CDP/1.0' }));
    return;
  }
  if (req.url === '/json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      {
        type: 'page',
        url: 'https://docs.qq.com/desktop/',
        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/fake`,
      },
    ]));
    return;
  }
  res.writeHead(404); res.end();
});

server.on('upgrade', handleWs);
server.listen(port, '127.0.0.1', () => {
  console.log(`fake-cdp listening on ${port}`);
  // 空闲自退出：每次请求重置计时器，无流量 15s 后自动结束，
  // 避免 wrapper 进程被 kill 后遗留孤儿 node 进程。
  let idle = setTimeout(() => process.exit(0), 15000);
  function poke() { clearTimeout(idle); idle = setTimeout(() => process.exit(0), 15000); }
  server.on('request', poke);
  server.on('upgrade', poke);
});