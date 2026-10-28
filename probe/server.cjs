// A one-tool MCP server that logs every handshake it receives.
// Built on the official SDK, which answers both the 2026-07-28 server/discover handshake and the older initialize.
// Usage: node server.cjs <label>   (log path from PROBE_LOG, default ./probe.log)
const fs = require('node:fs');
const path = require('node:path');
const { McpServer } = require('@modelcontextprotocol/server');
const { StdioServerTransport, serveStdio } = require('@modelcontextprotocol/server/stdio');

const label = process.argv[2] || 'unknown';
const LOG = process.env.PROBE_LOG || path.join(process.cwd(), 'probe.log');
const log = o => fs.appendFileSync(LOG, JSON.stringify({ label, at: new Date().toISOString(), ...o }) + '\n');

const transport = new StdioServerTransport();
let handler;
Object.defineProperty(transport, 'onmessage', {
  get: () => handler,
  set(fn) {
    handler = (msg, ...rest) => {
      if (msg.method) log({ method: msg.method, params: msg.params });
      return fn(msg, ...rest);
    };
  },
});
const send = transport.send.bind(transport);
transport.send = (msg, ...rest) => {
  if (msg.result && (msg.result.protocolVersion || msg.result.supportedVersions)) log({ reply: msg.result.protocolVersion || msg.result.supportedVersions });
  if (msg.error) log({ error: msg.error });
  return send(msg, ...rest);
};

serveStdio(() => {
  const server = new McpServer({ name: 'probe', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.registerTool('ping', { description: 'Returns pong' }, async () => ({ content: [{ type: 'text', text: 'pong' }] }));
  return server;
}, { transport });
