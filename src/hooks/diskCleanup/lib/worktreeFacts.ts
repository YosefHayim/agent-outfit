import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { gitAnswerLines } from "../../lib/gitAnswers.js";
import type { LinkedWorktree } from "./linkedWorktrees.js";
import type { WorktreeFacts } from "./worktreeCleanupDecision.js";

const CHANGE_QUERY = ["status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none"];
const IGNORED_FILE_QUERY = [
  "ls-files",
  "--others",
  "--ignored",
  "--exclude-standard",
  "--directory",
  "--no-empty-directory",
];
const BRANCH_UNPUSHED_QUERY = ["log", "HEAD", "--not", "--remotes", "--max-count=1", "--format=%H"];
// A detached HEAD's commits are only at risk when no branch, tag, or remote holds them.
const DETACHED_UNPUSHED_QUERY = [
  "log",
  "HEAD",
  "--not",
  "--branches",
  "--tags",
  "--remotes",
  "--max-count=1",
  "--format=%H",
];
const REMOTE_LIST_QUERY = ["remote"];
const UNTRACKED_LINE_START = "?? ";
// Environment files, keys, certificates, and SSH identities, e.g. server.pem, signing.p12, id_ed25519.
const SECRET_FILE_NAME =
  /^(?:\.env(?:\..+)?|.+\.(?:pem|key|p12|pfx|keystore|jks)|id_(?:rsa|ed25519|ecdsa|dsa)(?:\..+)?)$/u;
const SHAREABLE_ENV_FILE = /^\.env\.(?:example|sample|template)$/u;
// GitHub refuses files over 100 MB; one this big in a worktree is a build or a download, not work.
const LARGE_FILE_BYTES = 50 * 1024 * 1024;

const isSecretFile = (relativePath: string): boolean => {
  const fileName = path.basename(relativePath);
  return SECRET_FILE_NAME.test(fileName) && !SHAREABLE_ENV_FILE.test(fileName);
};

const fileBytes = (file: string): number => {
  try {
    return statSync(file).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

// A pushed secret cannot be taken back, and a file git status had to quote has a name too odd to check.
const isRiskyUntrackedFile = (request: { readonly folder: string; readonly relativePath: string }): boolean => {
  const isQuoted = request.relativePath.startsWith('"');
  const isLarge = fileBytes(path.join(request.folder, request.relativePath)) > LARGE_FILE_BYTES;
  return isQuoted || isLarge || isSecretFile(request.relativePath);
};

// Removing a worktree deletes its ignored files, so an ignored secret file is only safe to lose when the main
// worktree holds the same file.
const isUniqueIgnoredSecret = (request: { readonly worktree: LinkedWorktree; readonly relativePath: string }) => {
  if (request.relativePath.endsWith("/") || !isSecretFile(request.relativePath)) {
    return false;
  }

  const mainCopy = path.join(request.worktree.mainFolder, request.relativePath);
  if (!existsSync(mainCopy)) {
    return true;
  }

  const worktreeContent = readFileSync(path.join(request.worktree.folder, request.relativePath));
  const mainContent = readFileSync(mainCopy);
  return !worktreeContent.equals(mainContent);
};

const remoteFor = (worktree: LinkedWorktree): string => {
  const remotes = gitAnswerLines({ folder: worktree.folder, query: REMOTE_LIST_QUERY }) || [];
  const branchRemoteQuery = ["config", "--get", `branch.${worktree.branch}.remote`];
  const branchRemotes = worktree.branch ? gitAnswerLines({ folder: worktree.folder, query: branchRemoteQuery }) : [];
  const trackedRemote = (branchRemotes || []).find((remote) => remotes.includes(remote));
  return trackedRemote || remotes.find((remote) => remote === "origin") || remotes[0] || "";
};

// e.g. "origin/main" from refs/remotes/origin/HEAD; main and master count even when the remote never said.
const defaultBranchesFor = (request: { readonly folder: string; readonly remote: string }) => {
  const remoteHeadQuery = ["symbolic-ref", "--short", `refs/remotes/${request.remote}/HEAD`];
  const remoteHeadLines = request.remote ? gitAnswerLines({ folder: request.folder, query: remoteHeadQuery }) : [];
  const remoteDefaults = (remoteHeadLines || []).map((line) => line.slice(request.remote.length + 1));
  return ["main", "master", ...remoteDefaults];
};

export const readWorktreeFacts = (request: { readonly worktree: LinkedWorktree; readonly inUse: boolean }) => {
  const { worktree } = request;
  const detached = worktree.branch === "";
  const changeLines = gitAnswerLines({ folder: worktree.folder, query: CHANGE_QUERY });
  const ignoredPaths = gitAnswerLines({ folder: worktree.folder, query: IGNORED_FILE_QUERY });
  const unpushedQuery = detached ? DETACHED_UNPUSHED_QUERY : BRANCH_UNPUSHED_QUERY;
  const unpushedCommits = gitAnswerLines({ folder: worktree.folder, query: unpushedQuery });
  const untrackedPaths = (changeLines || [])
    .filter((line) => line.startsWith(UNTRACKED_LINE_START))
    .map((line) => line.slice(UNTRACKED_LINE_START.length));
  const hasRiskyUntrackedFile = untrackedPaths.some((relativePath) =>
    isRiskyUntrackedFile({ folder: worktree.folder, relativePath }),
  );
  const hasUniqueIgnoredSecret = (ignoredPaths || []).some((relativePath) =>
    isUniqueIgnoredSecret({ worktree, relativePath }),
  );
  const remote = remoteFor(worktree);
  const facts: WorktreeFacts = {
    inUse: request.inUse,
    locked: worktree.locked,
    readable: changeLines !== undefined && ignoredPaths !== undefined && unpushedCommits !== undefined,
    detached,
    onDefaultBranch: defaultBranchesFor({ folder: worktree.folder, remote }).includes(worktree.branch),
    hasChanges: (changeLines || []).length > 0,
    hasUnpushedCommits: (unpushedCommits || []).length > 0,
    hasRiskyFiles: hasRiskyUntrackedFile || hasUniqueIgnoredSecret,
    remote,
  };
  return facts;
};
