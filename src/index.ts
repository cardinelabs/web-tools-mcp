// Cardine Labs Web Tools: an MCP server that runs on Apify in Standby mode and exposes
// six Cardine Labs actors as tools. Clients connect to <standby-url>/mcp with their Apify token;
// every run happens in the caller's own Apify account.
import { createServer, type IncomingMessage } from 'node:http';
import { Actor } from 'apify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { TOOLS, formatResult, type ToolDef } from './tools.ts';

export const VERSION = '0.1.0';
const MAX_CHARGE_PER_CALL_USD = 0.25; // spending cap passed to every actor run
const WAIT_SECS = 240;

await Actor.init();

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const text = (t: string, isError = false): Result => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });

async function runTool(tool: ToolDef, args: unknown): Promise<Result> {
  const run = await Actor.call(tool.actor, tool.buildInput(args), { waitSecs: WAIT_SECS, maxTotalChargeUsd: MAX_CHARGE_PER_CALL_USD } as never);
  const runUrl = `https://console.apify.com/view/runs/${run.id}`;
  const { items } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems({ limit: tool.maxItems(args), clean: true });
  if (run.status !== 'SUCCEEDED' && items.length === 0) {
    return text(`The ${tool.actor} run ended with status ${run.status} and returned no results. Details: ${runUrl}`, true);
  }
  await Actor.charge({ eventName: 'tool-call' });
  const note = run.status === 'SUCCEEDED' ? '' : `\n(Run status ${run.status}: results may be partial.)`;
  return text(formatResult(tool, items as Record<string, unknown>[], runUrl) + note);
}

function buildServer(): McpServer {
  const server = new McpServer({ name: 'cardine-labs-web-tools', version: VERSION });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.shape, annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, openWorldHint: true } },
      async (args: unknown) => {
        try { return await runTool(tool, args); }
        catch (e) { return text(`Error running ${tool.actor}: ${(e as Error).message}`, true); }
      },
    );
  }
  return server;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

const INFO = `Cardine Labs Web Tools ${VERSION}. MCP endpoint: POST /mcp (Streamable HTTP). Tools: ${TOOLS.map((t) => t.name).join(', ')}.`;

if (process.env.APIFY_META_ORIGIN !== 'STANDBY') {
  // Normal run (for example Apify's daily test): describe the tools and exit without charging.
  for (const t of TOOLS) await Actor.pushData({ tool: t.name, title: t.title, actor: t.actor, description: t.description });
  console.log(INFO);
  await Actor.exit();
} else {
  const port = Number(process.env.ACTOR_WEB_SERVER_PORT ?? process.env.APIFY_CONTAINER_PORT ?? 3000);
  createServer(async (req, res) => {
    if (req.headers['x-apify-container-server-readiness-probe']) { res.end('ok'); return; }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path !== '/mcp') { res.writeHead(path === '/' ? 200 : 404, { 'content-type': 'text/plain' }).end(INFO); return; }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: use POST.' }, id: null }));
      return;
    }
    try {
      const body = await readJson(req);
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: (e as Error).message }, id: null }));
    }
  }).listen(port, () => console.log(`${INFO} Listening on ${port}.`));
}
