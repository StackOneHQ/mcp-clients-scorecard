// Minimal MCP stdio client: start a server, send initialize, then page through tools/list.
import { spawn } from 'node:child_process';

export function listTools(command, args, { env = {}, cwd, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    // Pass only what npx needs, so no credential in our environment reaches a third-party server.
    const base = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'npm_config_cache'].filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
    const child = spawn(command, args, { cwd, env: { ...base, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    // A server that exits at startup closes stdin; the exit handler reports it, so ignore EPIPE here.
    child.stdin.on('error', () => {});
    let buf = '';
    let stderr = '';
    let nextId = 1;
    const pending = new Map();
    const timer = setTimeout(() => finish(new Error(`timeout; stderr: ${stderr.slice(-500)}`)), timeoutMs);
    let done = false;
    function finish(err, value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      err ? reject(err) : resolve(value);
    }
    const write = (msg) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
    function request(method, params) {
      const id = nextId++;
      write({ id, method, params });
      return new Promise((res, rej) => pending.set(id, { res, rej }));
    }
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        // Server-to-client requests also carry an id, so only messages without a method are responses.
        if (msg.method === undefined && msg.id != null && pending.has(msg.id)) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
        }
      }
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('exit', (code) => finish(new Error(`server exited ${code}; stderr: ${stderr.slice(-800)}`)));
    child.on('error', (e) => finish(e));
    (async () => {
      const init = await request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'tool-search-bench', version: '1.0.0' },
      });
      write({ method: 'notifications/initialized', params: {} });
      const tools = [];
      let cursor;
      do {
        const r = await request('tools/list', cursor ? { cursor } : {});
        tools.push(...r.tools);
        cursor = r.nextCursor;
      } while (cursor);
      finish(null, { serverInfo: init.serverInfo, tools });
    })().catch((e) => finish(e));
  });
}
