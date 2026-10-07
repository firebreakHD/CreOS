"use strict";

const http = require("node:http");
const { spawn } = require("node:child_process");

const target = process.env.NEXT_INTERNAL_ORIGIN || "http://127.0.0.1:3000";
const targetUrl = new URL(target);
const port = Number(process.env.HA_INGRESS_PORT || 8099);
const ingressProxyAddress = "172.30.32.2";
const routeNames = "api|_next|manifest\\.webmanifest|service-worker\\.js|icon\\.svg";
const backend = spawn(process.execPath, ["server.js"], { cwd: "/app", env: { ...process.env, HOSTNAME: targetUrl.hostname, PORT: targetUrl.port || "3000" }, stdio: "inherit" });

function clientAddress(request) { return (request.socket.remoteAddress || "").replace(/^::ffff:/, ""); }
function ingressBase(request) {
  const header = request.headers["x-ingress-path"];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const base = value.replace(/\/+$/, "");
  if (!base.startsWith("/api/hassio_ingress/")) return null;
  return /^[A-Za-z0-9_-]+$/.test(base.slice("/api/hassio_ingress/".length)) ? base : null;
}
function upstreamPath(requestUrl, base) {
  const parsed = new URL(requestUrl || "/", "http://localhost");
  if (base && (parsed.pathname === base || parsed.pathname.startsWith(`${base}/`))) parsed.pathname = parsed.pathname.slice(base.length) || "/";
  return `${parsed.pathname}${parsed.search}`;
}
function addIngressPrefix(text, base) {
  if (!base) return text;
  const prefix = (value) => value === base || value.startsWith(`${base}/`) ? value : `${base}${value}`;
  const attrs = /((?:href|src|action|poster|data-src)\s*=\s*["'])(\/(?!\/)[^"']*)/gi;
  const routes = new RegExp(`(["'\\x60])(\\/(?:${routeNames})(?=\\/|[?#"'\\x60])[^"'\\x60]*)`, "g");
  const css = /url\(\s*(["']?)(\/(?!\/)[^"')\s]+)\1\s*\)/gi;
  return text.replace(attrs, (_m, start, path) => `${start}${prefix(path)}`).replace(routes, (_m, quote, path) => `${quote}${prefix(path)}`).replace(css, (_m, quote, path) => `url(${quote}${prefix(path)}${quote})`);
}

const server = http.createServer((incoming, outgoing) => {
  if (clientAddress(incoming) !== ingressProxyAddress) {
    outgoing.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end("Home Assistant ingress only");
    return;
  }
  const base = ingressBase(incoming);
  if (!base) {
    outgoing.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end("Missing Home Assistant ingress path");
    return;
  }
  const headers = { ...incoming.headers, host: targetUrl.host, "accept-encoding": "identity", "x-forwarded-prefix": base, "x-forwarded-host": incoming.headers["x-forwarded-host"] || incoming.headers.host };
  const appPath = upstreamPath(incoming.url, base);
  const isDataApi = new URL(appPath, "http://localhost").pathname.startsWith("/api/");
  const proxyRequest = http.request({ hostname: targetUrl.hostname, port: Number(targetUrl.port || 80), method: incoming.method, path: appPath, headers }, (response) => {
    const contentType = String(response.headers["content-type"] || "");
    if (isDataApi || !/(?:text\/|javascript|json)/i.test(contentType)) {
      outgoing.writeHead(response.statusCode || 502, response.headers);
      response.pipe(outgoing);
      return;
    }
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      const body = addIngressPrefix(Buffer.concat(chunks).toString("utf8"), base);
      const headers = { ...response.headers };
      delete headers["content-length"]; delete headers["transfer-encoding"]; delete headers.etag; delete headers["content-md5"];
      headers["content-length"] = Buffer.byteLength(body);
      outgoing.writeHead(response.statusCode || 502, headers);
      outgoing.end(body);
    });
    response.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
  });
  proxyRequest.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8" }); outgoing.end("CreatorOS startet gerade oder ist nicht erreichbar."); });
  incoming.pipe(proxyRequest);
});

server.listen(port, "0.0.0.0", () => process.stdout.write(`CreatorOS HA Ingress auf Port ${port} bereit\n`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { server.close(() => process.exit(0)); backend.kill(signal); });
backend.on("exit", (code) => { process.stderr.write(`CreatorOS backend beendet (${code ?? "signal"})\n`); server.close(() => process.exit(code || 1)); });
