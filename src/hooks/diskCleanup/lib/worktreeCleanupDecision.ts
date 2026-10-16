export type WorktreeFacts = {
  readonly inUse: boolean;
  readonly locked: boolean;
  /** Every git question about the worktree was answered. */
  readonly readable: boolean;
  readonly detached: boolean;
  readonly onDefaultBranch: boolean;
  readonly hasChanges: boolean;
  readonly hasUnpushedCommits: boolean;
  /** A secret-looking or very large file that must not be pushed, or an ignored secret found nowhere else. */
  readonly hasRiskyFiles: boolean;
  readonly remote: string;
};

export type KeepReason =
  | "in-use"
  | "locked"
  | "unreadable"
  | "detached-work"
  | "default-branch-work"
  | "risky-files"
  | "no-remote";

export type WorktreeCleanupDecision =
  | { readonly _tag: "keep"; readonly reason: KeepReason }
  | { readonly _tag: "remove"; readonly saveChanges: boolean; readonly push: boolean };

const keep = (reason: KeepReason): WorktreeCleanupDecision => ({ _tag: "keep", reason });

// Work left in a worktree is committed and pushed to a branch of the same name before the folder goes. Work that
// has no such branch to go to, or that a live session may still be writing, stays.
export const decideWorktreeCleanup = (facts: WorktreeFacts): WorktreeCleanupDecision => {
  const hasWork = facts.hasChanges || facts.hasUnpushedCommits;
  if (facts.inUse) {
    return keep("in-use");
  }

  if (facts.locked) {
    return keep("locked");
  }

  if (!facts.readable) {
    return keep("unreadable");
  }

  if (facts.detached && hasWork) {
    return keep("detached-work");
  }

  if (facts.onDefaultBranch && hasWork) {
    return keep("default-branch-work");
  }

  if (facts.hasRiskyFiles) {
    return keep("risky-files");
  }

  if (hasWork && !facts.remote) {
    return keep("no-remote");
  }

  return { _tag: "remove", saveChanges: facts.hasChanges, push: hasWork };
};
