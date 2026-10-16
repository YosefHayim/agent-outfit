import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import path from "node:path";

import { isProcessAlive } from "./processAlive.js";

const lockHolder = (lockFile: string): number => {
  if (!existsSync(lockFile)) {
    return 0;
  }

  return Number(readFileSync(lockFile, "utf8").trim());
};

// One watcher of a feature acts at a time; a lock left by a dead watcher is taken over.
export const acquireWatcherLock = (lockFile: string): boolean => {
  mkdirSync(path.dirname(lockFile), { recursive: true });
  const holder = lockHolder(lockFile);
  if (holder !== process.pid && isProcessAlive(holder)) {
    return false;
  }

  rmSync(lockFile, { force: true });
  try {
    const descriptor = openSync(lockFile, "wx");
    writeSync(descriptor, String(process.pid));
    closeSync(descriptor);
    return true;
  } catch {
    return false;
  }
};

export const releaseWatcherLock = (lockFile: string): void => {
  if (lockHolder(lockFile) === process.pid) {
    rmSync(lockFile, { force: true });
  }
};
