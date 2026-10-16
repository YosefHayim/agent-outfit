import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { acquireWatcherLock, releaseWatcherLock } from "./watcherLock.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DEAD_PID = 2_147_483_646;
const stateFolders: Array<string> = [];

const newLockFile = (): string => {
  const stateFolder = mkdtempSync(path.join(packageRoot, "scratch-watcher-lock-"));
  stateFolders.push(stateFolder);
  return path.join(stateFolder, "watcher.lock");
};

afterEach(() => {
  for (const stateFolder of stateFolders.splice(0)) {
    rmSync(stateFolder, { recursive: true, force: true });
  }
});

describe("acquireWatcherLock", () => {
  it("writes the pid with the lock and leaves no other file behind", () => {
    const lockFile = newLockFile();

    expect(acquireWatcherLock(lockFile)).toBe(true);
    expect(readFileSync(lockFile, "utf8")).toBe(String(process.pid));
    expect(readdirSync(path.dirname(lockFile))).toEqual(["watcher.lock"]);
    expect(acquireWatcherLock(lockFile)).toBe(true);
  });

  it("waits while a live watcher holds the lock", () => {
    const lockFile = newLockFile();
    writeFileSync(lockFile, "1");

    expect(acquireWatcherLock(lockFile)).toBe(false);
    releaseWatcherLock(lockFile);
    expect(readFileSync(lockFile, "utf8")).toBe("1");
  });

  it("takes over a lock left by a dead watcher, and releases it", () => {
    const lockFile = newLockFile();
    writeFileSync(lockFile, String(DEAD_PID));

    expect(acquireWatcherLock(lockFile)).toBe(true);
    expect(readFileSync(lockFile, "utf8")).toBe(String(process.pid));
    releaseWatcherLock(lockFile);
    expect(existsSync(lockFile)).toBe(false);
  });
});
