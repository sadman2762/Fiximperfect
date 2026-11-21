/**
 * Dev utility: screenshots pages with a locally installed Chromium-based
 * browser over the DevTools protocol (no extra npm dependency).
 * Usage: node scripts/screenshot.mjs <outDir> <cookie|-> <width> <path> [path...]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const [outDir, cookie, widthArg, ...paths] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const BROWSER = process.env.BROWSER_PATH ?? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const width = Number(widthArg || 1440);
fs.mkdirSync(outDir, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fi-shot-"));
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(BROWSER, [`--headless=new`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("browser did not start");
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else listeners.forEach((l) => l(msg));
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send("Page.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height: Number(process.env.VIEWPORT_HEIGHT ?? 900), deviceScaleFactor: Number(process.env.DPR ?? 1), mobile: width < 500 });
if (cookie && cookie !== "-") {
  const [name, ...rest] = cookie.split("=");
  await send("Network.setCookie", { name, value: rest.join("="), url: BASE });
}
for (const p of paths) {
  const loaded = new Promise((r) => {
    const l = (m) => m.method === "Page.loadEventFired" && r();
    listeners.push(l);
  });
  await send("Page.navigate", { url: /^(https?|file):/.test(p) ? p : BASE + p });
  await loaded;
  await new Promise((r) => setTimeout(r, 1500));
  const fmt = process.env.FORMAT === "jpeg" ? "jpeg" : "png";
  const { result } = await send("Page.captureScreenshot", { format: fmt, quality: fmt === "jpeg" ? 82 : undefined, captureBeyondViewport: !process.env.VIEWPORT_ONLY });
  const file = path.join(outDir, process.env.NAME ?? `${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${width}.${fmt === "jpeg" ? "jpg" : "png"}`);
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  console.log(file);
}
ws.close();
proc.kill();
