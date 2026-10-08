#!/usr/bin/env node
// One command to run the whole project:   npm start      (or double-click start.bat on Windows)
//  1. checks Node version + backend/.env
//  2. installs dependencies if they are missing
//  3. starts backend (API) and frontend (Vite) together, with prefixed logs
//  4. Ctrl+C stops both

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(root, "backend");
const frontendDir = path.join(root, "frontend", "ai-learning-assistant");
const isWin = process.platform === "win32";
const setupOnly = process.argv.includes("--setup-only");

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const say = (m) => console.log(c(36, "▶ ") + m);
const warn = (m) => console.log(c(33, "⚠ ") + m);
const die = (m) => { console.error(c(31, "✖ ") + m); process.exit(1); };

// ---------- 1. Node version ----------
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) die(`Node 20+ is required (you have ${process.versions.node}). Download the LTS version from https://nodejs.org`);

// ---------- 2. backend/.env ----------
const envPath = path.join(backendDir, ".env");
const examplePath = path.join(backendDir, ".env.example");
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  die(`backend/.env was missing, so I created it from .env.example.\n  Open backend/.env, fill MONGODB_URI, JWT_SECRET and GEMINI_API_KEY, then run again.`);
}
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])
);
const placeholder = (v) => !v || /^(your|paste|changeme|xxx)/i.test(v);
const missing = ["MONGODB_URI", "JWT_SECRET", "GEMINI_API_KEY"].filter((k) => placeholder(env[k]));
if (missing.length) die(`Fill these in backend/.env first: ${missing.join(", ")}`);
if (!env.REDIS_URL) warn("REDIS_URL is empty - fine, the app just runs without answer caching.");
if ((env.PORT || "8000") !== "8000") warn(`PORT=${env.PORT} but the frontend calls http://localhost:8000 (frontend/src/utils/apiPaths.js). Set PORT=8000 or change BASE_URL.`);

// ---------- 3. install deps ----------
const npm = isWin ? "npm.cmd" : "npm";
const installIfNeeded = (dir, label) => {
  const marker = path.join(dir, "node_modules", ".package-lock.json");
  const lock = path.join(dir, "package-lock.json");
  const stale = !fs.existsSync(marker) || (fs.existsSync(lock) && fs.statSync(lock).mtimeMs > fs.statSync(marker).mtimeMs + 1000);
  if (!stale) return say(`${label}: dependencies OK`);
  say(`${label}: installing dependencies (first run takes a minute)...`);
  const r = spawnSync(npm, ["install", "--no-audit", "--no-fund"], { cwd: dir, stdio: "inherit", shell: isWin });
  if (r.status !== 0) die(`npm install failed in ${dir}`);
};
installIfNeeded(backendDir, "backend ");
installIfNeeded(frontendDir, "frontend");
if (setupOnly) { say("Setup complete. Start everything with: npm start"); process.exit(0); }

// ---------- 4. port check ----------
const portBusy = (port) => new Promise((res) => {
  const s = net.createServer().once("error", () => res(true)).once("listening", () => s.close(() => res(false))).listen(port);
});
if (await portBusy(Number(env.PORT || 8000))) die(`Port ${env.PORT || 8000} is already in use. Close the other backend (or old terminal) and try again.`);

// ---------- 5. run both ----------
const children = [];
const run = (name, color, dir, args) => {
  const child = spawn(npm, args, { cwd: dir, shell: isWin, env: { ...process.env, FORCE_COLOR: "1" } });
  children.push(child);
  const pipe = (stream) => stream.on("data", (d) => {
    for (const line of d.toString().split(/\r?\n/)) if (line.trim()) console.log(c(color, `[${name}]`) + " " + line);
  });
  pipe(child.stdout); pipe(child.stderr);
  child.on("exit", (code) => { if (!shuttingDown) { warn(`${name} stopped (code ${code}). Shutting down.`); shutdown(1); } });
};

let shuttingDown = false;
const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const ch of children) {
    try {
      if (isWin) spawnSync("taskkill", ["/pid", String(ch.pid), "/T", "/F"]);
      else process.kill(ch.pid, "SIGTERM");
    } catch { /* already gone */ }
  }
  setTimeout(() => process.exit(code), 500);
};
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("\n" + c(32, "  Cognivo is starting…"));
console.log("  Frontend: " + c(1, "http://localhost:5173") + "   API: " + c(1, `http://localhost:${env.PORT || 8000}`) + "   (Ctrl+C to stop)\n");
run("api", 32, backendDir, ["run", "dev"]);
run("web", 36, frontendDir, ["run", "dev"]);
