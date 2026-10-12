import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const UNCOMMITTED_CHANGE_QUERY = ["status", "--porcelain"];
// --all covers every branch, the stash, and the HEAD of each linked worktree.
const UNPUSHED_COMMIT_QUERY = ["log", "--all", "--not", "--remotes", "--max-count=1", "--format=%H"];
// A linked worktree keeps its branches in its main repository, so only commits that no branch holds would go with it.
const BRANCHLESS_COMMIT_QUERY = ["log", "HEAD", "--not", "--branches", "--remotes", "--max-count=1", "--format=%H"];

// Git sets GIT_DIR and GIT_INDEX_FILE inside its own hooks; inherited, they would point every call at that repository.
const gitEnvironment = (): NodeJS.ProcessEnv => {
  const variables = Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"));
  return Object.fromEntries(variables);
};

// " D file": a tracked file that is only missing from the work tree, with nothing staged. A delete that was cut off
// halfway leaves a clone full of these, and no content is lost with them: git already has every such file.
const MISSING_TRACKED_FILE = /^ D /u;

type GitQuestion = {
  readonly workTree: string;
  readonly query: ReadonlyArray<string>;
  readonly ignoredLine?: RegExp;
};

// A git call that fails cannot vouch for the work tree, so only a successful empty answer counts as nothing.
const gitFindsNothing = (question: GitQuestion): boolean => {
  // --no-optional-locks keeps this read from blocking an agent that is using the same work tree.
  const git = spawnSync("git", ["--no-optional-locks", "-C", question.workTree, ...question.query], {
    encoding: "utf8",
    env: gitEnvironment(),
  });
  if (git.status !== 0) {
    return false;
  }

  const countedLines = git.stdout.split("\n").filter((line) => line !== "" && !question.ignoredLine?.test(line));
  return countedLines.length === 0;
};

const holdsUnsavedWork = (workTree: string): boolean => {
  const standaloneClone = statSync(path.join(workTree, ".git")).isDirectory();
  const commitQuery = standaloneClone ? UNPUSHED_COMMIT_QUERY : BRANCHLESS_COMMIT_QUERY;
  const everythingCommitted = gitFindsNothing({
    workTree,
    query: UNCOMMITTED_CHANGE_QUERY,
    ignoredLine: MISSING_TRACKED_FILE,
  });
  const commitsKeptElsewhere = gitFindsNothing({ workTree, query: commitQuery });
  return !everythingCommitted || !commitsKeptElsewhere;
};

const workTreesIn = (folder: string): ReadonlyArray<string> => {
  if (existsSync(path.join(folder, ".git"))) {
    return [folder];
  }

  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => workTreesIn(path.join(folder, entry.name)));
};

// Agents sometimes work on a repo from a clone or worktree inside a scratch folder. One with changes that are not
// committed, or with commits that exist nowhere else, holds work that deleting the folder would erase.
export const unsavedWorkTrees = (folder: string): ReadonlyArray<string> => workTreesIn(folder).filter(holdsUnsavedWork);
