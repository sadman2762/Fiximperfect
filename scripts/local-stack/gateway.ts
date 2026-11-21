/**
 * Local Supabase-compatible gateway (development/testing only).
 *
 * Exposes the same URL layout supabase-js expects:
 *   /rest/v1/*    -> PostgREST
 *   /auth/v1/*    -> Supabase Auth (GoTrue)
 *   /storage/v1/* -> minimal private-bucket emulation on the local filesystem
 *
 * Used because this machine cannot pull the Supabase Docker images. Production
 * and Vercel deployments talk to a real Supabase project instead.
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const REST = `http://127.0.0.1:${process.env.PGRST_PORT ?? 54330}`;
const AUTH = `http://127.0.0.1:${process.env.GOTRUE_PORT ?? 54331}`;
const JWT_SECRET = process.env.JWT_SECRET ?? "";
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? ".local-stack/storage");

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function verifyJwt(token: string): Record<string, unknown> | null {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const expected = b64url(crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest());
  if (expected.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  const payload = JSON.parse(Buffer.from(p, "base64").toString()) as Record<string, unknown>;
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
  return payload;
}

function signJwt(payload: Record<string, unknown>) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  return `${h}.${p}.${b64url(crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest())}`;
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

function safeObjectPath(bucket: string, objectPath: string) {
  const full = path.resolve(STORAGE_DIR, bucket, objectPath);
  if (!full.startsWith(path.resolve(STORAGE_DIR, bucket) + path.sep)) throw new Error("invalid path");
  return full;
}

function isServiceRole(req: http.IncomingMessage) {
  const auth = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  return verifyJwt(auth)?.role === "service_role";
}

async function handleStorage(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const rest = url.pathname.replace(/^\/storage\/v1/, "");
  // Signed download: GET /object/sign/:bucket/*path?token=
  let m = rest.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === "GET") {
    const payload = verifyJwt(url.searchParams.get("token") ?? "");
    const objectPath = decodeURIComponent(m[2]);
    if (!payload || payload.url !== `${m[1]}/${objectPath}`) return json(res, 400, { error: "InvalidSignature" });
    const file = safeObjectPath(m[1], objectPath);
    if (!fs.existsSync(file)) return json(res, 404, { error: "not_found" });
    const meta = JSON.parse(fs.readFileSync(`${file}.meta.json`, "utf8")) as { contentType: string };
    res.writeHead(200, { "content-type": meta.contentType, "cache-control": "private, max-age=60" });
    fs.createReadStream(file).pipe(res);
    return;
  }
  // Everything else is privileged (private bucket): require the service role.
  if (!isServiceRole(req)) return json(res, 403, { statusCode: "403", error: "Unauthorized", message: "service role required" });

  m = rest.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
  if (m && req.method === "POST") {
    const body = JSON.parse((await readBody(req)).toString() || "{}") as { expiresIn?: number };
    const objectPath = decodeURIComponent(m[2]);
    const token = signJwt({ url: `${m[1]}/${objectPath}`, exp: Math.floor(Date.now() / 1000) + (body.expiresIn ?? 60) });
    return json(res, 200, { signedURL: `/object/sign/${m[1]}/${encodeURIComponent(objectPath).replace(/%2F/g, "/")}?token=${token}` });
  }
  m = rest.match(/^\/object\/([^/]+)\/(.+)$/);
  if (m && (req.method === "POST" || req.method === "PUT")) {
    const objectPath = decodeURIComponent(m[2]);
    const file = safeObjectPath(m[1], objectPath);
    if (fs.existsSync(file) && req.headers["x-upsert"] !== "true") return json(res, 409, { error: "Duplicate" });
    const data = await readBody(req);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    fs.writeFileSync(`${file}.meta.json`, JSON.stringify({ contentType: req.headers["content-type"] ?? "application/octet-stream" }));
    return json(res, 200, { Key: `${m[1]}/${objectPath}`, Id: crypto.randomUUID() });
  }
  m = rest.match(/^\/object\/([^/]+)$/);
  if (m && req.method === "DELETE") {
    const body = JSON.parse((await readBody(req)).toString() || "{}") as { prefixes?: string[] };
    const removed = [];
    for (const p of body.prefixes ?? []) {
      const file = safeObjectPath(m[1], p);
      if (fs.existsSync(file)) {
        fs.rmSync(file);
        fs.rmSync(`${file}.meta.json`, { force: true });
        removed.push({ name: p });
      }
    }
    return json(res, 200, removed);
  }
  if (rest.startsWith("/bucket")) return json(res, 200, []);
  return json(res, 404, { error: "unsupported storage operation in local gateway" });
}

async function proxy(req: http.IncomingMessage, res: http.ServerResponse, target: string) {
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string" && !["host", "connection", "content-length"].includes(k)) headers[k] = v;
  }
  // Mirror Kong: the apikey header becomes the bearer token when none is given.
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
  try {
    const upstream = await fetch(target, { method: req.method, headers, body: body ? new Uint8Array(body) : undefined });
    const out: Record<string, string> = {};
    upstream.headers.forEach((v, k) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(k)) out[k] = v;
    });
    out["access-control-allow-origin"] = "*";
    res.writeHead(upstream.status, out);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    json(res, 502, { error: "upstream_unavailable", detail: String(e) });
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      });
      return res.end();
    }
    try {
      if (url.pathname.startsWith("/rest/v1")) return await proxy(req, res, REST + url.pathname.slice(8) + url.search);
      if (url.pathname.startsWith("/auth/v1")) return await proxy(req, res, AUTH + url.pathname.slice(8) + url.search);
      if (url.pathname.startsWith("/storage/v1")) return await handleStorage(req, res, url);
      if (url.pathname.startsWith("/realtime/v1")) return json(res, 503, { error: "realtime not available locally; dashboards fall back to polling" });
      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 500, { error: String(e) });
    }
  })
  .listen(PORT, () => console.log(`[gateway] listening on http://localhost:${PORT}`));
