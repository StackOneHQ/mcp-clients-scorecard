// A one-tool MCP server that logs every handshake it receives, with the client capabilities it declares.
// Built on the official SDK, which answers both the 2026-07-28 server/discover handshake and the older initialize.
// Usage: node server.cjs <label>   (log path from PROBE_LOG, default ./probe.log)
const fs = require('node:fs');
const path = require('node:path');
const { McpServer } = require('@modelcontextprotocol/server');
const { StdioServerTransport, serveStdio } = require('@modelcontextprotocol/server/stdio');

const label = process.argv[2] || 'unknown';
const LOG = process.env.PROBE_LOG || path.join(process.cwd(), 'probe.log');
const log = o => fs.appendFileSync(LOG, JSON.stringify({ label, at: new Date().toISOString(), ...o }) + '\n');

// initialize carries params.capabilities; from 2026-07-28 every request, server/discover included, carries them in _meta.
const CAPS_META_KEY = 'io.modelcontextprotocol/clientCapabilities';
const declared = p => p?.capabilities ?? p?._meta?.[CAPS_META_KEY];

let server;
let firstListId;
let listed = false;
let added = 0;
// Registering a tool on a connected server sends the tools list-changed notification, always after the client's first list.
// On 2026-07-28 serveStdio delivers it only on a subscriptions/listen stream that opted in, so each new stream gets one too.
const addTool = () => {
  added += 1;
  server.registerTool(`ping_${added}`, { description: 'Returns pong, added mid-session' }, async () => ({ content: [{ type: 'text', text: 'pong' }] }));
};

const transport = new StdioServerTransport();
let handler;
Object.defineProperty(transport, 'onmessage', {
  get: () => handler,
  set(fn) {
    handler = (msg, ...rest) => {
      if (msg.method) log({ method: msg.method, params: msg.params, capabilities: declared(msg.params) });
      if (msg.method === 'tools/list') firstListId ??= msg.id;
      return fn(msg, ...rest);
    };
  },
});
const send = transport.send.bind(transport);
transport.send = async (msg, ...rest) => {
  if (msg.result && (msg.result.protocolVersion || msg.result.supportedVersions)) log({ reply: msg.result.protocolVersion || msg.result.supportedVersions });
  if (msg.error) log({ error: msg.error });
  if (msg.method) log({ sent: msg.method, params: msg.params });
  await send(msg, ...rest);
  if (!listed && 'result' in msg && msg.id === firstListId) {
    listed = true;
    addTool();
  } else if (listed && msg.method === 'notifications/subscriptions/acknowledged') addTool();
};

serveStdio(() => {
  server = new McpServer({ name: 'probe', version: '0.1.0' }, { capabilities: { tools: { listChanged: true } } });
  server.registerTool('ping', { description: 'Returns pong' }, async () => ({ content: [{ type: 'text', text: 'pong' }] }));
  return server;
}, { transport });
