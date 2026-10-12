#!/usr/bin/env node
// SessionEnd hook: hands the ended session to a detached scratch watcher and exits at once, because both agents give
// SessionEnd hooks only a second or two, too short to delete a large scratch folder. Fails open.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SESSION_ID_PATTERN } from "../lib/sessionScratch.js";

const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);

const handOverEndedSession = (): void => {
  const hookInput: unknown = JSON.parse(readFileSync(0, "utf8"));
  const endedSessionId = isRecord(hookInput) ? hookInput.session_id : undefined;
  if (typeof endedSessionId !== "string" || !SESSION_ID_PATTERN.test(endedSessionId)) {
    return;
  }

  // The watcher has this file's extension: .js when installed, .ts under tsx in tests, where execArgv carries the
  // tsx loader.
  const hookFile = fileURLToPath(import.meta.url);
  const hookFolder = path.dirname(hookFile);
  const watcherFile = path.join(hookFolder, "..", "watchers", `scratchWatcher${path.extname(hookFile)}`);
  spawn(process.execPath, [...process.execArgv, watcherFile, endedSessionId], {
    detached: true,
    stdio: "ignore",
  }).unref();
};

try {
  handOverEndedSession();
} catch {
  // Never block or delay the agent's exit.
}
process.exit(0);
