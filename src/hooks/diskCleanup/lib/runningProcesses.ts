import { spawnSync } from "node:child_process";

export type RunningProcesses = {
  readonly workingFolders: ReadonlyArray<string>;
  readonly commandLines: ReadonlyArray<string>;
};

const PROCESS_LIST_BYTES = 64 * 1024 * 1024;

// A hook's PATH can lack /usr/sbin, where macOS keeps lsof.
const systemToolCall = (request: { readonly tool: string; readonly toolArguments: ReadonlyArray<string> }) =>
  spawnSync(request.tool, request.toolArguments, {
    encoding: "utf8",
    env: { ...process.env, PATH: `${process.env.PATH || ""}:/usr/sbin:/usr/bin:/bin` },
    maxBuffer: PROCESS_LIST_BYTES,
  });

// lsof -Fn prints each open file as "n<path>"; it exits non-zero when it may not look at some other user's process.
export const openFileNames = (lsofArguments: ReadonlyArray<string>): ReadonlyArray<string> | undefined => {
  const lsof = systemToolCall({ tool: "lsof", toolArguments: ["-Fn", ...lsofArguments] });
  if (lsof.error) {
    return undefined;
  }

  return lsof.stdout
    .split("\n")
    .filter((line) => line.startsWith("n"))
    .map((line) => line.slice(1));
};

// Without lsof or ps nothing can be ruled out, so the caller treats every folder as in use.
export const runningProcesses = (): RunningProcesses | undefined => {
  const workingFolders = openFileNames(["-d", "cwd"]);
  const ps = systemToolCall({ tool: "ps", toolArguments: ["-axo", "command="] });
  if (!workingFolders || ps.error || ps.status !== 0) {
    return undefined;
  }

  return { workingFolders, commandLines: ps.stdout.split("\n").filter(Boolean) };
};

export const isInsideFolder = (request: { readonly candidate: string; readonly folder: string }): boolean =>
  request.candidate === request.folder || request.candidate.startsWith(`${request.folder}/`);

export const isUsedByRunningProcess = (request: {
  readonly folder: string;
  readonly processes: RunningProcesses;
}): boolean => {
  const isWorkingThere = request.processes.workingFolders.some((candidate) =>
    isInsideFolder({ candidate, folder: request.folder }),
  );
  const isRunningFromThere = request.processes.commandLines.some((commandLine) => commandLine.includes(request.folder));
  return isWorkingThere || isRunningFromThere;
};
