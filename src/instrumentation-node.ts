import http from "node:http";

const proxied = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
const setGlobalProxyFromEnv = (http as unknown as { setGlobalProxyFromEnv?: (env?: NodeJS.ProcessEnv) => void }).setGlobalProxyFromEnv;
if (proxied && typeof setGlobalProxyFromEnv === "function") {
  setGlobalProxyFromEnv(process.env);
  console.log("[startup] outbound requests use the proxy from HTTPS_PROXY");
}
