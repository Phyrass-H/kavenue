// Guarantee that exactly ONE dev server is about to run, and that it runs on 3000.
//
// ⚑ WHY THIS EXISTS. `npm run test-app` used to break the app if you ran it twice.
// There is only one `.next` folder per project, and every dev server writes into it.
// Start a second server and the two overwrite each other's compiled output: the file
// one has just built, the other deletes. The symptom is a 500 with
// `ENOENT: .next/server/app/<route>/page.js` on a page that is perfectly fine in the
// source — so it reads as "the app is broken", not "there are two servers".
//
// It compounded, because `next dev` does not refuse a busy port, it moves quietly to
// the next one. So the founder's second run put a server on 3001 while `open-app.mts`
// pointed Safari at 3000 — the OLD server, the broken one. Four servers were found
// running on 2026-09-09 (3000, 3001, 3002, 3003), all fighting over one folder, and
// the founder had lost access to the app entirely.
//
// The rule this enforces: before a dev server starts, no other dev server for THIS
// project is running, and port 3000 is free. If we had to stop one, `.next` is
// assumed clobbered and removed, because a half-written build directory is exactly
// what the next server would inherit.
//
// ⚑ IT WILL NOT KILL SOMETHING THAT IS NOT OURS. A process only qualifies if it is a
// Next dev server AND its working directory is this project. Anything else holding
// port 3000 stops the script with an explanation instead — that is someone else's
// program, and the founder gets to decide, not this file.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = 3000;
const ROOT = process.cwd();
const NEXT_DIR = path.join(ROOT, ".next");

/** Run a command, returning "" instead of throwing when it finds nothing. */
function sh(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

/** The working directory of a running process, or null if it cannot be read. */
function cwdOf(pid: number): string | null {
  // `lsof -Fn` prints one field per line; the cwd row starts with "n".
  const out = sh("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  const line = out.split("\n").find((l) => l.startsWith("n"));
  return line ? line.slice(1) : null;
}

/** The full command line of a running process. */
function commandOf(pid: number): string {
  return sh("ps", ["-o", "command=", "-p", String(pid)]).trim();
}

/** Is this PID a Next dev server belonging to THIS project? */
function isOurDevServer(pid: number): boolean {
  const cmd = commandOf(pid);
  const looksLikeNext = /next-server|next dev|[/ ]next\b/.test(cmd);
  if (!looksLikeNext) return false;
  // The command line says "next-server (v15.5.19)" — it carries no path, so the
  // working directory is the only thing that ties a server to this project.
  return cwdOf(pid) === ROOT;
}

/** PIDs listening on a TCP port. */
function listenersOn(port: number): number[] {
  const out = sh("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
  return out.split("\n").filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n > 1);
}

/** Every Next dev server for this project, on any port. */
function ourDevServers(): number[] {
  const out = sh("pgrep", ["-f", "next"]);
  const self = process.pid;
  return out
    .split("\n")
    .filter(Boolean)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 1 && pid !== self && pid !== process.ppid)
    .filter(isOurDevServer);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 1 · anything on 3000 that is NOT ours is a hard stop ────────────────────────
const squatters = listenersOn(PORT).filter((pid) => !isOurDevServer(pid));
if (squatters.length > 0) {
  const who = squatters.map((pid) => `      ${pid}  ${commandOf(pid) || "(unknown)"}`).join("\n");
  console.log(`
  Port ${PORT} is taken by something that is not this project's dev server:

${who}

  I have not touched it — stopping someone else's program is your call, not mine.
  Quit it, then run this again.
`);
  process.exit(1);
}

// ── 2 · stop every dev server of ours, on any port ──────────────────────────────
const ours = ourDevServers();
if (ours.length > 0) {
  // ⚑ COUNT SERVERS, NOT PROCESSES. `npx next dev` is two or three processes — the
  // npx wrapper, a shell, and the server itself — and all of them match. Killing the
  // wrappers is right; telling the founder "9 dev servers were running" when there
  // were three is not. Only `next-server` is a server.
  const servers = ours.filter((pid) => /next-server/.test(commandOf(pid)));
  const n = servers.length || ours.length;
  console.log(`\n  ${n} dev ${n === 1 ? "server is" : "servers are"} already running — stopping ${n === 1 ? "it" : "them"}.`);
  for (const pid of ours) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  // Give them a moment to close the port, then insist.
  for (let i = 0; i < 20 && listenersOn(PORT).length > 0; i++) await sleep(150);
  for (const pid of listenersOn(PORT)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  for (let i = 0; i < 20 && listenersOn(PORT).length > 0; i++) await sleep(150);

  // ⚑ A build folder that two servers were writing to is not trustworthy. Removing
  // it costs one slower first page load and removes the whole class of ENOENT.
  if (fs.existsSync(NEXT_DIR)) {
    fs.rmSync(NEXT_DIR, { recursive: true, force: true });
    console.log("  Cleared .next — a stopped server may have left it half-written.");
  }
}

// ── 3 · the port really is free ─────────────────────────────────────────────────
if (listenersOn(PORT).length > 0) {
  console.log(`
  Port ${PORT} is still busy after trying to clear it. Nothing has been started.
  Find what is holding it with:

      lsof -nP -iTCP:${PORT} -sTCP:LISTEN
`);
  process.exit(1);
}

// ── 4 · a warning, never a blocker: this project is inside iCloud Drive ─────────
// ⚑ FOUND 2026-09-09. `~/Documents` is synced by iCloud Drive, so `.next` and
// `node_modules` are being uploaded, downloaded, and — with Optimize Mac Storage on —
// evicted, while the dev server is writing to them. The empty `server 2` / `static 2`
// folders that keep appearing inside `.next` are iCloud conflict copies. This does not
// stop anything today, so it only warns; the real fix is to move the project out of
// Documents, which is the founder's decision.
try {
  // ⚑ `realpath` DOES NOT REVEAL THIS. With Desktop & Documents sync on, ~/Documents
  // is a firmlink, not a symlink — the path stays `/Users/<me>/Documents/...` and
  // looks entirely local. The only reliable test is whether the very same directory
  // (same inode) is also reachable under the iCloud container.
  const home = process.env.HOME ?? "";
  const docs = path.join(home, "Documents");
  const cloudDocs = path.join(home, "Library/Mobile Documents/com~apple~CloudDocs/Documents");
  let inCloud = false;
  if (home && ROOT.startsWith(docs + path.sep)) {
    const twin = path.join(cloudDocs, path.relative(docs, ROOT));
    try {
      inCloud = fs.statSync(twin).ino === fs.statSync(ROOT).ino;
    } catch {
      inCloud = false;
    }
  }
  const conflicts = fs.existsSync(NEXT_DIR)
    ? fs.readdirSync(NEXT_DIR).filter((n) => / \d+$/.test(n))
    : [];
  if (inCloud || conflicts.length > 0) {
    console.log(`
  ⚑ This project is inside a folder that iCloud Drive syncs.
    iCloud copies and evicts files while the dev server is writing them, which
    produces exactly the "internal server error" this guard was written for.
${conflicts.length > 0 ? `    Conflict copies present in .next: ${conflicts.join(", ")}\n` : ""}    Moving the project out of ~/Documents is the real fix.
`);
  }
} catch {
  // realpath can fail on an odd mount; the warning is optional, never fatal.
}
