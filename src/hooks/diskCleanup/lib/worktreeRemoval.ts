import { type GitQuestion, gitAnswerLines, gitFindsNothing } from "../../lib/gitAnswers.js";
import type { LinkedWorktree } from "./linkedWorktrees.js";

export type RemovalStep = "save" | "push" | "recheck" | "remove";

export type WorktreeRemoval =
  | { readonly _tag: "removed"; readonly pushed: boolean }
  | { readonly _tag: "failed"; readonly step: RemovalStep };

const SAVE_COMMIT_MESSAGE = "chore: save work left in worktree";
// A pre-push hook may run a whole test suite.
const PUSH_TIMEOUT_MILLISECONDS = 5 * 60 * 1_000;
const NOT_SAVED_QUERY = ["status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none"];
const NOT_PUSHED_QUERY = ["log", "HEAD", "--not", "--remotes", "--max-count=1", "--format=%H"];

const gitSucceeds = (question: GitQuestion): boolean => gitAnswerLines(question) !== undefined;

// --no-verify skips commit hooks: the commit only keeps work safe, and a lint failure must not lose it.
const saveChanges = (folder: string): boolean =>
  gitSucceeds({ folder, query: ["add", "--all"] }) &&
  gitSucceeds({ folder, query: ["commit", "--no-verify", "--quiet", "--message", SAVE_COMMIT_MESSAGE] });

// The push always goes to a branch of the same name, never to whatever the branch tracks, which can be main.
const pushBranch = (request: { readonly worktree: LinkedWorktree; readonly remote: string }): boolean =>
  gitSucceeds({
    folder: request.worktree.folder,
    query: ["push", "--quiet", "--set-upstream", request.remote, `HEAD:refs/heads/${request.worktree.branch}`],
    timeoutMilliseconds: PUSH_TIMEOUT_MILLISECONDS,
  });

const isSavedAndPushed = (worktree: LinkedWorktree): boolean => {
  const isSaved = gitFindsNothing({ folder: worktree.folder, query: NOT_SAVED_QUERY });
  const isPushed = worktree.branch === "" || gitFindsNothing({ folder: worktree.folder, query: NOT_PUSHED_QUERY });
  return isSaved && isPushed;
};

// Without --force, git itself refuses to remove a worktree with changes or submodules; ignored files go with it.
export const removeWorktree = (request: {
  readonly worktree: LinkedWorktree;
  readonly remote: string;
  readonly saveChanges: boolean;
  readonly push: boolean;
}): WorktreeRemoval => {
  const { worktree } = request;
  if (request.saveChanges && !saveChanges(worktree.folder)) {
    return { _tag: "failed", step: "save" };
  }

  if (request.push && !pushBranch(request)) {
    return { _tag: "failed", step: "push" };
  }

  if (!isSavedAndPushed(worktree)) {
    return { _tag: "failed", step: "recheck" };
  }

  const removeQuery = ["worktree", "remove", worktree.folder];
  if (!gitSucceeds({ folder: worktree.mainFolder, query: removeQuery })) {
    return { _tag: "failed", step: "remove" };
  }

  return { _tag: "removed", pushed: request.push };
};
