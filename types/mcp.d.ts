// tablecraft/mcp — Model Context Protocol server for AI assistants (docs/mcp.md). Usually run as `npx tablecraft mcp`.

/** What a tool handler returns: text, optionally structured data, or an error. */
export type McpToolResult = string | { text: string; data?: unknown; isError?: boolean };

/** A small, dependency-free MCP server (JSON-RPC 2.0 over newline-delimited stdio). */
export interface McpServer {
  /** Server name and version. */
  info: { name: string; version: string };
  /** Instructions sent on `initialize`. */
  instructions?: string;
  /** Registered tools. */
  tools: Map<string, { def: Record<string, unknown>; handler: (args: Record<string, any>) => McpToolResult | Promise<McpToolResult> }>;
  /** Registered resources. */
  resources: Map<string, { def: Record<string, unknown>; read: () => string | Promise<string> }>;
  /** Registered prompts. */
  prompts: Map<string, { def: Record<string, unknown>; render: (args: Record<string, any>) => string | Promise<string> }>;
  /** Register a tool. */
  tool(name: string, def: { title?: string; description?: string; inputSchema?: Record<string, unknown>; annotations?: Record<string, unknown> }, handler: (args: Record<string, any>) => McpToolResult | Promise<McpToolResult>): void;
  /** Register a resource. */
  resource(uri: string, def: { name: string; title?: string; description?: string; mimeType?: string }, read: () => string | Promise<string>): void;
  /** Register a prompt. */
  prompt(name: string, def: { title?: string; description?: string; arguments?: Array<{ name: string; description?: string; required?: boolean }> }, render: (args: Record<string, any>) => string | Promise<string>): void;
  /** Handle one JSON-RPC method → its result (throws `{ code, message }` errors). */
  handle(method: string, params?: Record<string, any>): Promise<unknown>;
  /** Serve newline-delimited JSON-RPC (default stdin/stdout); exits when input ends. */
  listen(input?: { setEncoding(encoding: string): unknown; on(event: 'data' | 'end', listener: (chunk?: any) => void): unknown }, output?: { write(chunk: string): unknown }): void;
}

/** Build the Tablecraft MCP server (docs, templates, validate/simulate/audit/balance tools, debug matches). */
export declare function createTablecraftMcp(): McpServer;
/** Run the Tablecraft MCP server over stdio. */
export declare function startStdio(): void;
