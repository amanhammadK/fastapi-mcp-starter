import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

interface Endpoint {
  path: string;
  method: string;
  description: string;
  operationId?: string;
  parameters: Parameter[];
  requestBody?: RequestBodyInfo;
  responses: ResponseInfo[];
  tags: string[];
  deprecated: boolean;
}

interface Parameter {
  name: string;
  in: string;
  required: boolean;
  type: string;
  description?: string;
}

interface RequestBodyInfo {
  required: boolean;
  contentType: string;
  schema?: any;
}

interface ResponseInfo {
  statusCode: string;
  description: string;
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttlMs: number;
  hitCount: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RequestLogEntry {
  id: string;
  path: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
  cached: boolean;
  clientIp?: string;
}

interface RouteConfig {
  path: string;
  method: string;
  description: string;
  parameters: Parameter[];
  requestBody?: RequestBodyInfo;
  responses: ResponseInfo[];
}

const endpoints: Map<string, Endpoint> = new Map();
const requestLog: RequestLogEntry[] = [];
const cache: Map<string, CacheEntry> = new Map();
const rateLimits: Map<string, RateLimitEntry> = new Map();
let openApiSpec: any = null;

const DEFAULT_RATE_LIMIT = 100;
const DEFAULT_RATE_WINDOW_MS = 60000;
const DEFAULT_CACHE_TTL_MS = 300000;

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function extractEndpointsFromOpenApi(spec: any): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const paths = spec.paths || {};
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, detail] of Object.entries(methods as any)) {
      if (["get", "post", "put", "patch", "delete", "options", "head"].includes(method)) {
        const d = detail as any;
        endpoints.push({
          path, method: method.toUpperCase(),
          description: d.description || d.summary || "",
          operationId: d.operationId,
          parameters: (d.parameters || []).map((p: any) => ({
            name: p.name, in: p.in, required: p.required || false,
            type: p.schema?.type || p.type || "string", description: p.description,
          })),
          requestBody: d.requestBody ? {
            required: d.requestBody.required || false,
            contentType: Object.keys(d.requestBody.content || {})[0] || "application/json",
            schema: d.requestBody.content ? Object.values(d.requestBody.content)[0] : undefined,
          } : undefined,
          responses: Object.entries(d.responses || {}).map(([code, resp]: [string, any]) => ({
            statusCode: code, description: resp.description || "",
          })),
          tags: d.tags || [], deprecated: d.deprecated || false,
        });
      }
    }
  }
  return endpoints;
}

function validateRequest(path: string, method: string, params: Record<string, any>): { valid: boolean; errors: string[] } {
  const endpoint = endpoints.get(`${method.toUpperCase()} ${path}`);
  if (!endpoint) return { valid: false, errors: [`Endpoint ${method} ${path} not found`] };
  const errors: string[] = [];
  for (const param of endpoint.parameters) {
    if (param.required && !(param.name in params)) {
      errors.push(`Missing required parameter: ${param.name} (${param.in})`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function checkRateLimit(key: string, maxRequests: number = DEFAULT_RATE_LIMIT, windowMs: number = DEFAULT_RATE_WINDOW_MS): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimits.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now };
    rateLimits.set(key, entry);
  }
  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetAt = entry.windowStart + windowMs;
  return { allowed: entry.count <= maxRequests, remaining, resetAt };
}

function getCacheKey(path: string, method: string, params: any): string {
  return `${method}:${path}:${JSON.stringify(params)}`;
}

function getFromCache(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttlMs) {
    cache.delete(key);
    return null;
  }
  entry.hitCount++;
  return entry.data;
}

function setCache(key: string, data: any, ttlMs: number = DEFAULT_CACHE_TTL_MS): void {
  cache.set(key, { data, timestamp: Date.now(), ttlMs, hitCount: 0 });
}

function logRequest(path: string, method: string, statusCode: number, durationMs: number, cached: boolean): RequestLogEntry {
  const entry: RequestLogEntry = {
    id: generateId(), path, method, statusCode, durationMs,
    timestamp: new Date().toISOString(), cached,
  };
  requestLog.push(entry);
  if (requestLog.length > 1000) requestLog.splice(0, requestLog.length - 1000);
  return entry;
}

function transformRequest(path: string, method: string, body: any): any {
  let transformed = { ...body };
  const endpoint = endpoints.get(`${method.toUpperCase()} ${path}`);
  if (endpoint?.requestBody?.schema?.properties) {
    const schema = endpoint.requestBody.schema;
    for (const [key, prop] of Object.entries(schema.properties as any)) {
      if (key in transformed && prop.type === "integer") transformed[key] = parseInt(transformed[key]);
      if (key in transformed && prop.type === "number") transformed[key] = parseFloat(transformed[key]);
      if (key in transformed && prop.type === "boolean") transformed[key] = transformed[key] === "true" || transformed[key] === true;
    }
  }
  return transformed;
}

function transformResponse(path: string, method: string, data: any): any {
  let transformed = { ...data };
  const endpoint = endpoints.get(`${method.toUpperCase()} ${path}`);
  if (endpoint?.responses?.[0]) {
    const resp = endpoint.responses[0];
    if (resp.description) transformed._meta = { ...transformed._meta, description: resp.description };
  }
  return transformed;
}

function discoverRoutes(): RouteConfig[] {
  const routes: RouteConfig[] = [];
  for (const [key, ep] of endpoints) {
    routes.push({
      path: ep.path, method: ep.method, description: ep.description,
      parameters: ep.parameters, requestBody: ep.requestBody, responses: ep.responses,
    });
  }
  return routes;
}

export class FastApiMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({ name: "fastapi-mcp-server", version: "0.2.0" });
    this.setupTools();
  }

  private setupTools(): void {
    this.server.tool(
      "discover_routes",
      "Discover all available routes from the loaded OpenAPI spec",
      {},
      async () => {
        const routes = discoverRoutes();
        return { content: [{ type: "text", text: JSON.stringify({ routes, count: routes.length, summary: `Discovered ${routes.length} routes from OpenAPI spec` }, null, 2) }] };
      }
    );

    this.server.tool(
      "load_openapi_spec",
      "Load an OpenAPI specification from URL or JSON content",
      { specUrl: z.string().optional(), specContent: z.string().optional() },
      async (args) => {
        try {
          let spec: any;
          if (args.specContent) {
            spec = JSON.parse(args.specContent);
          } else if (args.specUrl) {
            const response = await fetch(args.specUrl);
            if (!response.ok) throw new Error(`Failed to fetch spec: ${response.statusText}`);
            spec = await response.json();
          } else {
            return { content: [{ type: "text", text: "Error: Either specUrl or specContent must be provided" }] };
          }
          openApiSpec = spec;
          const discovered = extractEndpointsFromOpenApi(spec);
          endpoints.clear();
          for (const ep of discovered) {
            endpoints.set(`${ep.method} ${ep.path}`, ep);
          }
          return { content: [{ type: "text", text: JSON.stringify({ success: true, title: spec.info?.title || "Unknown API", version: spec.info?.version || "Unknown", endpointsLoaded: endpoints.size, paths: Object.keys(spec.paths || {}).length }, null, 2) }] };
        } catch (error: any) {
          return { content: [{ type: "text", text: `Error loading spec: ${error.message}` }] };
        }
      }
    );

    this.server.tool(
      "register_endpoint",
      "Register a new API endpoint manually",
      { path: z.string(), method: z.string(), description: z.string() },
      async (args) => {
        const id = `${args.method.toUpperCase()} ${args.path}`;
        endpoints.set(id, {
          path: args.path, method: args.method.toUpperCase(), description: args.description,
          parameters: [], responses: [{ statusCode: "200", description: "Success" }], tags: [], deprecated: false,
        });
        return { content: [{ type: "text", text: JSON.stringify({ registered: true, id, endpoint: endpoints.get(id) }, null, 2) }] };
      }
    );

    this.server.tool(
      "list_endpoints",
      "List all registered API endpoints",
      { filter: z.string().optional() },
      async (args) => {
        let eps = Array.from(endpoints.values());
        if (args.filter) eps = eps.filter(ep => ep.path.includes(args.filter!) || ep.description.toLowerCase().includes(args.filter!.toLowerCase()));
        return { content: [{ type: "text", text: JSON.stringify({ endpoints: eps, count: eps.length }, null, 2) }] };
      }
    );

    this.server.tool(
      "validate_request",
      "Validate a request against registered endpoint schemas",
      { path: z.string(), method: z.string(), params: z.record(z.any()).default({}) },
      async (args) => {
        const result = validateRequest(args.path, args.method, args.params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    this.server.tool(
      "transform_request",
      "Transform request data according to endpoint schema (type coercion)",
      { path: z.string(), method: z.string(), body: z.record(z.any()) },
      async (args) => {
        const transformed = transformRequest(args.path, args.method, args.body);
        return { content: [{ type: "text", text: JSON.stringify({ original: args.body, transformed }, null, 2) }] };
      }
    );

    this.server.tool(
      "transform_response",
      "Transform response data according to endpoint schema",
      { path: z.string(), method: z.string(), data: z.record(z.any()) },
      async (args) => {
        const transformed = transformResponse(args.path, args.method, args.data);
        return { content: [{ type: "text", text: JSON.stringify({ original: args.data, transformed }, null, 2) }] };
      }
    );

    this.server.tool(
      "cache_get",
      "Get a value from the cache",
      { key: z.string() },
      async (args) => {
        const value = getFromCache(args.key);
        return { content: [{ type: "text", text: JSON.stringify({ key: args.key, hit: value !== null, value }, null, 2) }] };
      }
    );

    this.server.tool(
      "cache_set",
      "Set a value in the cache with TTL",
      { key: z.string(), value: z.any(), ttlMs: z.number().default(DEFAULT_CACHE_TTL_MS) },
      async (args) => {
        setCache(args.key, args.value, args.ttlMs);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, key: args.key, ttlMs: args.ttlMs }, null, 2) }] };
      }
    );

    this.server.tool(
      "cache_clear",
      "Clear all cached entries or a specific key",
      { key: z.string().optional() },
      async (args) => {
        if (args.key) { cache.delete(args.key); return { content: [{ type: "text", text: JSON.stringify({ cleared: 1, key: args.key }, null, 2) }] }; }
        const count = cache.size;
        cache.clear();
        return { content: [{ type: "text", text: JSON.stringify({ cleared: count }, null, 2) }] };
      }
    );

    this.server.tool(
      "check_rate_limit",
      "Check rate limit for a client key",
      { clientKey: z.string(), maxRequests: z.number().default(DEFAULT_RATE_LIMIT), windowMs: z.number().default(DEFAULT_RATE_WINDOW_MS) },
      async (args) => {
        const result = checkRateLimit(args.clientKey, args.maxRequests, args.windowMs);
        return { content: [{ type: "text", text: JSON.stringify({ clientKey: args.clientKey, ...result }, null, 2) }] };
      }
    );

    this.server.tool(
      "log_request",
      "Log an incoming request with timing",
      { path: z.string(), method: z.string(), statusCode: z.number(), durationMs: z.number(), cached: z.boolean().default(false) },
      async (args) => {
        const entry = logRequest(args.path, args.method, args.statusCode, args.durationMs, args.cached);
        return { content: [{ type: "text", text: JSON.stringify(entry, null, 2) }] };
      }
    );

    this.server.tool(
      "get_request_log",
      "Get recent request logs",
      { limit: z.number().default(20), method: z.string().optional(), path: z.string().optional() },
      async (args) => {
        let logs = [...requestLog];
        if (args.method) logs = logs.filter(l => l.method === args.method!.toUpperCase());
        if (args.path) logs = logs.filter(l => l.path.includes(args.path!));
        logs = logs.slice(-args.limit);
        const avgDuration = logs.length > 0 ? logs.reduce((sum, l) => sum + l.durationMs, 0) / logs.length : 0;
        const cacheHitRate = logs.length > 0 ? logs.filter(l => l.cached).length / logs.length : 0;
        return { content: [{ type: "text", text: JSON.stringify({ logs, count: logs.length, avgDurationMs: Math.round(avgDuration), cacheHitRate: `${(cacheHitRate * 100).toFixed(1)}%` }, null, 2) }] };
      }
    );

    this.server.tool(
      "get_cache_stats",
      "Get cache statistics",
      {},
      async () => {
        const entries = Array.from(cache.values());
        const totalHits = entries.reduce((sum, e) => sum + e.hitCount, 0);
        const avgAge = entries.length > 0 ? entries.reduce((sum, e) => sum + (Date.now() - e.timestamp), 0) / entries.length : 0;
        return { content: [{ type: "text", text: JSON.stringify({ size: cache.size, totalHits, avgAgeMs: Math.round(avgAge), entries: entries.map(e => ({ hitCount: e.hitCount, ageMs: Date.now() - e.timestamp, ttlMs: e.ttlMs })) }, null, 2) }] };
      }
    );

    this.server.tool(
      "get_rate_limit_stats",
      "Get rate limiting statistics",
      {},
      async () => {
        const entries = Array.from(rateLimits.entries()).map(([key, val]) => ({
          clientKey: key, requestCount: val.count, windowStart: new Date(val.windowStart).toISOString(),
        }));
        return { content: [{ type: "text", text: JSON.stringify({ clients: entries, totalClients: entries.length }, null, 2) }] };
      }
    );

    this.server.tool(
      "health_check",
      "Check MCP server health",
      {},
      async () => {
        return { content: [{ type: "text", text: JSON.stringify({
          status: "healthy", uptime: process.uptime(), endpoints: endpoints.size,
          cacheSize: cache.size, rateLimitClients: rateLimits.size,
          requestLogs: requestLog.length, timestamp: new Date().toISOString(),
        }, null, 2) }] };
      }
    );
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("FastAPI MCP Server running on stdio");
  }
}
