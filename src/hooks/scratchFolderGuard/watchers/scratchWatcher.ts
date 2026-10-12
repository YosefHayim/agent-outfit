#!/usr/bin/env node
// Detached watcher behind the SessionEnd hook, and the command for a manual pass:
//   node scratchWatcher.js [<ended-session-id>]
// Fails open: a crash leaves every scratch folder where it was.

import { writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readConfig } from "../../lib/hookConfig.js";
import { removeAbandonedScratch } from "../lib/abandonedScratch.js";
import { removeScratchFolders } from "../lib/scratchRemoval.js";
import { claudeSessionFolders } from "../lib/sessionScratch.js";

const runWatcher = (): void => {
  const homeRoot = process.env.HOME || os.homedir();
  const endedSessionId = process.argv[2];
  // A Codex thread can be picked up again after its SessionEnd, so only a Claude Code session loses its folder here.
  const endedSessionFolders = claudeSessionFolders(homeRoot).filter(
    (folder) => path.basename(folder) === endedSessionId,
  );
  removeScratchFolders(endedSessionFolders);
  removeAbandonedScratch(homeRoot);
};

try {
  runWatcher();
} catch (failure) {
  if (readConfig().debugLogs) {
    writeSync(2, `scratch-folder-guard error: ${failure instanceof Error ? failure.stack : String(failure)}\n`);
  }
  process.exit(0);
}
