#!/usr/bin/env node
// agentmemory-logs — view the agentmemory backend log captured by the launcher.
// Prints the tail of ~/.agentmemory/agentmemory.log and follows it by default.
import { spawn } from "node:child_process";
import { closeSync, openSync, readSync, statSync, watch } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGENTMEMORY_LOG_PATH } from "./agentmemory-launcher.js";

const TAIL_MAX_BYTES = 256 * 1024;
const DEFAULT_LINES = 200;

function usage(): string {
  return [
    "agentmemory-logs — view the agentmemory backend log",
    "",
    "Usage: agentmemory-logs [options]",
    "",
    "Options:",
    `  --lines <N>   Number of historical lines to print first (default: ${DEFAULT_LINES})`,
    "  --tab         Open the live log view in a new Windows Terminal tab",
    "  --no-follow   Print the tail and exit without following",
    "  -h, --help    Show this help",
  ].join("\n");
}

interface Options {
  lines: number;
  /** Whether `--lines <N>` was passed explicitly. */
  linesGiven: boolean;
  follow: boolean;
  tab: boolean;
}

function parseArgs(argv: readonly (string | undefined)[]): Options {
  const options: Options = { lines: DEFAULT_LINES, linesGiven: false, follow: true, tab: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--lines") {
      const next = argv[i + 1];
      const parsed = next === undefined ? Number.NaN : Number.parseInt(next, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        process.stderr.write("agentmemory-logs: --lines requires a positive integer\n");
        process.exit(1);
      }
      options.lines = parsed;
      options.linesGiven = true;
      i++;
    } else if (arg === "--tab") {
      options.tab = true;
    } else if (arg === "--no-follow") {
      options.follow = false;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      process.stderr.write(`agentmemory-logs: unknown option '${arg}'\n\n${usage()}\n`);
      process.exit(1);
    }
  }
  return options;
}

function openInTab(options: Options): void {
  const self = fileURLToPath(import.meta.url);
  const args = ["-w", "0", "nt", process.execPath, self];
  if (options.linesGiven) args.push("--lines", String(options.lines));
  const child = spawn("wt", args, { detached: true, stdio: "ignore" });
  child.on("spawn", () => process.exit(0));
  child.on("error", () => {
    process.stderr.write("agentmemory-logs: Windows Terminal (wt) not found — run without --tab\n");
    process.exit(1);
  });
  child.unref();
  // Kept referenced so the loop stays alive until the asynchronous spawn
  // success/error event above can surface; then exit like normal.
  setTimeout(() => process.exit(0), 250);
}

/** Print the last `lines` lines; returns the file size to resume following from. */
function printTail(size: number, lines: number): number {
  const start = Math.max(0, size - TAIL_MAX_BYTES);
  const fd = openSync(AGENTMEMORY_LOG_PATH, "r");
  let text: string;
  try {
    const buffer = Buffer.alloc(size - start);
    readSync(fd, buffer, 0, buffer.length, start);
    text = buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }

  let all = text.split(/\r?\n/);
  // When reading mid-file the first line is partial — drop it.
  if (start > 0 && all.length > 0) all = all.slice(1);
  // Drop the trailing empty entry produced by a final newline.
  if (all.length > 0 && all[all.length - 1] === "") all.pop();

  for (const line of all.slice(-lines)) process.stdout.write(`${line}\n`);
  return size;
}

function followFrom(offset: number): void {
  watch(AGENTMEMORY_LOG_PATH, () => {
    try {
      const size = statSync(AGENTMEMORY_LOG_PATH).size;
      if (size < offset) {
        // The launcher truncated the log with a new backend start.
        offset = 0;
        process.stdout.write("--- log truncated (backend restarted) ---\n");
      }
      if (size > offset) {
        const fd = openSync(AGENTMEMORY_LOG_PATH, "r");
        try {
          const buffer = Buffer.alloc(size - offset);
          readSync(fd, buffer, 0, buffer.length, offset);
          offset = size;
          process.stdout.write(buffer.toString("utf8"));
        } finally {
          closeSync(fd);
        }
      }
    } catch {
      // The file may vanish or be mid-truncate between stat and read;
      // the next change event retries.
    }
  });
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.tab) {
    openInTab(options);
    return;
  }

  let size: number;
  try {
    size = statSync(AGENTMEMORY_LOG_PATH).size;
  } catch {
    process.stderr.write(
      `agentmemory-logs: no log file at ${AGENTMEMORY_LOG_PATH} — the agentmemory backend has not been started by the launcher yet\n`,
    );
    process.exit(1);
  }

  const hint = options.follow ? " (Ctrl+C to quit)" : "";
  process.stdout.write(`agentmemory log — ${AGENTMEMORY_LOG_PATH}${hint}\n`);
  const offset = printTail(size, options.lines);
  if (options.follow) followFrom(offset);
}

main();
