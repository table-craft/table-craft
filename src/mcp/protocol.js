// A small, dependency-free Model Context Protocol server: JSON-RPC 2.0 over newline-delimited stdio.
// Implements what Tablecraft needs — tools, resources, prompts, ping — following the MCP specification.
// (The official SDK is used only in tests, as a client, to keep the protocol honest.)

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const ERR = { parse: -32700, invalid: -32600, method: -32601, params: -32602, internal: -32603, resource: -32002 };

export class McpServer {
  constructor({ name, version, instructions }) {
    this.info = { name, version };
    this.instructions = instructions;
    this.tools = new Map(); this.resources = new Map(); this.prompts = new Map();
    this.log = (...a) => process.stderr.write(`[${name}] ${a.join(' ')}\n`); // stdout is reserved for protocol messages
  }

  // handler(args) → { text, data?, isError? } | string
  tool(name, { title, description, inputSchema, annotations }, handler) {
    this.tools.set(name, { def: { name, title, description, inputSchema: { type: 'object', ...inputSchema }, ...(annotations ? { annotations } : {}) }, handler });
  }

  // read() → string
  resource(uri, { name, title, description, mimeType = 'text/markdown' }, read) {
    this.resources.set(uri, { def: { uri, name, title, description, mimeType }, read });
  }

  // render(args) → string (sent as one user message)
  prompt(name, { title, description, arguments: args = [] }, render) {
    this.prompts.set(name, { def: { name, title, description, arguments: args }, render });
  }

  async handle(method, params = {}) {
    switch (method) {
      case 'initialize': {
        const v = SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED[0];
        return {
          protocolVersion: v,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false }, prompts: { listChanged: false } },
          serverInfo: this.info,
          ...(this.instructions ? { instructions: this.instructions } : {}),
        };
      }
      case 'ping': return {};
      case 'tools/list': return { tools: [...this.tools.values()].map((t) => t.def) };
      case 'tools/call': {
        const t = this.tools.get(params.name);
        if (!t) throw rpcError(ERR.params, `Unknown tool: ${params.name}`);
        try {
          const out = await t.handler(params.arguments || {});
          const r = typeof out === 'string' ? { text: out } : out;
          return { content: [{ type: 'text', text: r.text }], ...(r.data !== undefined ? { structuredContent: r.data } : {}), isError: !!r.isError };
        } catch (e) {
          // tool failures are results the model can read and act on, not protocol errors
          return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
        }
      }
      case 'resources/list': return { resources: [...this.resources.values()].map((r) => r.def) };
      case 'resources/templates/list': return { resourceTemplates: [] };
      case 'resources/read': {
        const r = this.resources.get(params.uri);
        if (!r) throw rpcError(ERR.resource, `Resource not found: ${params.uri}`);
        return { contents: [{ uri: r.def.uri, mimeType: r.def.mimeType, text: await r.read() }] };
      }
      case 'prompts/list': return { prompts: [...this.prompts.values()].map((p) => p.def) };
      case 'prompts/get': {
        const p = this.prompts.get(params.name);
        if (!p) throw rpcError(ERR.params, `Unknown prompt: ${params.name}`);
        for (const a of p.def.arguments) if (a.required && !params.arguments?.[a.name]) throw rpcError(ERR.params, `Missing argument: ${a.name}`);
        return { description: p.def.description, messages: [{ role: 'user', content: { type: 'text', text: await p.render(params.arguments || {}) } }] };
      }
      case 'logging/setLevel': return {};
      case 'completion/complete': return { completion: { values: [], hasMore: false } };
      default: throw rpcError(ERR.method, `Method not found: ${method}`);
    }
  }

  // newline-delimited JSON-RPC on stdin/stdout
  listen(input = process.stdin, output = process.stdout) {
    let buf = '';
    const send = (msg) => output.write(`${JSON.stringify(msg)}\n`);
    const onMessage = async (msg) => {
      if (Array.isArray(msg)) { msg.forEach(onMessage); return; }
      if (!msg || msg.jsonrpc !== '2.0') { send({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: ERR.invalid, message: 'Invalid request' } }); return; }
      if (msg.method === undefined) return;                 // a response to us (we send no requests)
      const isNotification = msg.id === undefined || msg.id === null;
      if (isNotification) return;                           // notifications/initialized, cancelled, …
      try {
        send({ jsonrpc: '2.0', id: msg.id, result: await this.handle(msg.method, msg.params) });
      } catch (e) {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || ERR.internal, message: e.message } });
      }
    };
    input.setEncoding('utf8');
    input.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: ERR.parse, message: 'Parse error' } }); continue; }
        onMessage(msg);
      }
    });
    input.on('end', () => process.exit(0));
    this.log(`ready (${this.tools.size} tools, ${this.resources.size} resources, ${this.prompts.size} prompts)`);
  }
}

function rpcError(code, message) { const e = new Error(message); e.code = code; return e; }
