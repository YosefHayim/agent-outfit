import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isProcessAlive } from "./processAlive.js";

const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);

// A second Claude account keeps its own config root beside ~/.claude, e.g. ~/.claude-work, with its own registry,
// while sharing the scratch root and often the projects folder.
const claudeConfigRoots = (homeRoot: string): ReadonlyArray<string> => {
  const accountRoots = readdirSync(homeRoot)
    .filter((name) => name === ".claude" || name.startsWith(".claude-"))
    .map((name) => path.join(homeRoot, name));
  const configuredRoot = process.env.CLAUDE_CONFIG_DIR;
  return configuredRoot ? [...new Set([configuredRoot, ...accountRoots])] : accountRoots;
};

const registryFilesIn = (configRoot: string): ReadonlyArray<string> => {
  const registryFolder = path.join(configRoot, "sessions");
  try {
    return readdirSync(registryFolder)
      .filter((name) => name.endsWith(".json"))
      .map((name) => path.join(registryFolder, name));
  } catch {
    // A config root that never ran a session has no registry.
    return [];
  }
};

const liveSessionIdsIn = (registryFile: string): ReadonlyArray<string> => {
  try {
    const registryEntry: unknown = JSON.parse(readFileSync(registryFile, "utf8"));
    if (!isRecord(registryEntry) || typeof registryEntry.sessionId !== "string") {
      return [];
    }

    const processId = Number(registryEntry.pid);
    return isProcessAlive(processId) ? [registryEntry.sessionId] : [];
  } catch {
    // Claude Code removes its entry on exit, so one can vanish or be half-written while it is read.
    return [];
  }
};

// Claude Code writes <config root>/sessions/<pid>.json for every running process, naming the session it holds.
export const liveClaudeSessionIds = (homeRoot: string): ReadonlySet<string> => {
  const registryFiles = claudeConfigRoots(homeRoot).flatMap(registryFilesIn);
  const liveSessionIds = registryFiles.flatMap(liveSessionIdsIn);
  return new Set(liveSessionIds);
};
