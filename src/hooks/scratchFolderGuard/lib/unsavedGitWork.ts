import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// A repository can tell git status to skip its submodules ("ignore = all" in .gitmodules); the flag asks anyway.
const UNCOMMITTED_CHANGE_QUERY = ["status", "--porcelain", "--ignore-submodules=none"];
// --all covers every branch, the stash, and the HEAD of each linked worktree.
const UNPUSHED_COMMIT_QUERY = ["log", "--all", "--not", "--remotes", "--max-count=1", "--format=%H"];
// A submodule's repository names its work tree, and git refuses to run when that folder is gone; --work-tree makes
// git stop looking for it.
const SUBMODULE_UNPUSHED_COMMIT_QUERY = ["--work-tree=.", ...UNPUSHED_COMMIT_QUERY];
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
  readonly folder: string;
  readonly query: ReadonlyArray<string>;
  readonly ignoredLine?: RegExp;
};

// A git call that fails cannot vouch for the work tree, so only a successful empty answer counts as nothing.
const gitFindsNothing = (question: GitQuestion): boolean => {
  // --no-optional-locks keeps this read from blocking an agent that is using the same work tree.
  const git = spawnSync("git", ["--no-optional-locks", "-C", question.folder, ...question.query], {
    encoding: "utf8",
    env: gitEnvironment(),
  });
  if (git.status !== 0) {
    return false;
  }

  const countedLines = git.stdout.split("\n").filter((line) => line !== "" && !question.ignoredLine?.test(line));
  return countedLines.length === 0;
};

const subfoldersOf = (folder: string): ReadonlyArray<string> =>
  readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(folder, entry.name));

// A submodule keeps its repository inside the clone, e.g. .git/modules/vendor/library, and a nested submodule under
// that repository's own modules folder. The clone's log does not see these commits.
const submoduleRepositoriesIn = (folder: string): ReadonlyArray<string> => {
  if (!existsSync(folder)) {
    return [];
  }

  if (existsSync(path.join(folder, "HEAD")) && existsSync(path.join(folder, "objects"))) {
    return [folder, ...submoduleRepositoriesIn(path.join(folder, "modules"))];
  }

  return subfoldersOf(folder).flatMap(submoduleRepositoriesIn);
};

const holdsUnsavedWork = (workTree: string): boolean => {
  const gitFolder = path.join(workTree, ".git");
  const standaloneClone = statSync(gitFolder).isDirectory();
  const commitQuery = standaloneClone ? UNPUSHED_COMMIT_QUERY : BRANCHLESS_COMMIT_QUERY;
  const everythingCommitted = gitFindsNothing({
    folder: workTree,
    query: UNCOMMITTED_CHANGE_QUERY,
    ignoredLine: MISSING_TRACKED_FILE,
  });
  const commitsKeptElsewhere = gitFindsNothing({ folder: workTree, query: commitQuery });
  // A linked worktree of the clone keeps its submodules under .git/worktrees/<name>/modules.
  const submoduleCommitsKeptElsewhere = ["modules", "worktrees"]
    .flatMap((name) => submoduleRepositoriesIn(path.join(gitFolder, name)))
    .every((repository) => gitFindsNothing({ folder: repository, query: SUBMODULE_UNPUSHED_COMMIT_QUERY }));
  return !everythingCommitted || !commitsKeptElsewhere || !submoduleCommitsKeptElsewhere;
};

const workTreesIn = (folder: string): ReadonlyArray<string> => {
  if (existsSync(path.join(folder, ".git"))) {
    return [folder];
  }

  return subfoldersOf(folder).flatMap(workTreesIn);
};

// Agents sometimes work on a repo from a clone or worktree inside a scratch folder. One with changes that are not
// committed, or with commits that exist nowhere else, holds work that deleting the folder would erase.
export const unsavedWorkTrees = (folder: string): ReadonlyArray<string> => workTreesIn(folder).filter(holdsUnsavedWork);
