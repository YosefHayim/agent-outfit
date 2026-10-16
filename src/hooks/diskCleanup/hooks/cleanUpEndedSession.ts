#!/usr/bin/env node
// SessionEnd hook: hands the ended session to a detached cleanup watcher and exits at once, because pushing and
// removing worktrees takes far longer than the agent waits. Fails open.

import { readFileSync } from "node:fs";

import { startDetachedWatcher } from "../../lib/detachedWatcher.js";
import { sessionIdFrom } from "../../lib/sessionIds.js";

const handOverEndedSession = (): void => {
  const hookInput: unknown = JSON.parse(readFileSync(0, "utf8"));
  const endedSessionId = sessionIdFrom(hookInput);
  if (!endedSessionId) {
    return;
  }

  startDetachedWatcher({
    hookUrl: import.meta.url,
    watcherName: "cleanupWatcher",
    watcherArguments: ["--session", endedSessionId, "--wait"],
  });
};

try {
  handOverEndedSession();
} catch {
  // Never block or delay the agent's exit.
}
process.exit(0);
