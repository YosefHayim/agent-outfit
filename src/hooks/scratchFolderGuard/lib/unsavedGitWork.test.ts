import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { unsavedWorkTrees } from "./unsavedGitWork.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const workspaces: Array<string> = [];

// Inside a git hook these tests inherit GIT_DIR, which would aim every command at the repository being committed.
const isolatedGitEnvironment = (): NodeJS.ProcessEnv => {
  const variables = Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"));
  return { ...Object.fromEntries(variables), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
};

const git = (request: { readonly folder: string; readonly command: ReadonlyArray<string> }) => {
  const identity = ["-c", "user.name=Scratch Test", "-c", "user.email=scratch@example.test"];
  const execution = spawnSync("git", [...identity, "-c", "init.defaultBranch=main", ...request.command], {
    cwd: request.folder,
    encoding: "utf8",
    env: isolatedGitEnvironment(),
  });
  if (execution.status !== 0) {
    throw new Error(`git ${request.command.join(" ")} failed: ${execution.stderr}`);
  }
};

const commitFile = (request: { readonly workTree: string; readonly fileName: string }) => {
  writeFileSync(path.join(request.workTree, request.fileName), "content\n");
  git({ folder: request.workTree, command: ["add", request.fileName] });
  git({ folder: request.workTree, command: ["commit", "--quiet", "--message", `add ${request.fileName}`] });
};

type Workspace = { readonly upstream: string; readonly scratchFolder: string; readonly clone: string };

// A scratch folder holding a clone whose every commit is on its remote.
const createWorkspace = (): Workspace => {
  const root = mkdtempSync(path.join(packageRoot, "scratch-git-work-"));
  workspaces.push(root);
  const upstream = path.join(root, "upstream");
  const scratchFolder = path.join(root, "scratchpad");
  const clone = path.join(scratchFolder, "checks", "clone");
  mkdirSync(upstream);
  mkdirSync(path.dirname(clone), { recursive: true });
  git({ folder: upstream, command: ["init", "--quiet"] });
  commitFile({ workTree: upstream, fileName: "README.md" });
  git({ folder: scratchFolder, command: ["clone", "--quiet", upstream, clone] });
  return { upstream, scratchFolder, clone };
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("unsavedWorkTrees", () => {
  it("finds nothing in a clone whose work is committed and pushed, or in a folder without git", () => {
    const workspace = createWorkspace();
    const logFolder = path.join(workspace.scratchFolder, "logs");
    mkdirSync(logFolder);
    writeFileSync(path.join(logFolder, "run.log"), "log\n");

    expect(unsavedWorkTrees(workspace.scratchFolder)).toEqual([]);
    expect(unsavedWorkTrees(logFolder)).toEqual([]);
  });

  it("finds a clone with a changed tracked file", () => {
    const workspace = createWorkspace();
    writeFileSync(path.join(workspace.clone, "README.md"), "edited\n");

    expect(unsavedWorkTrees(workspace.scratchFolder)).toEqual([workspace.clone]);
  });

  it("finds a clone with a new file that is not tracked", () => {
    const workspace = createWorkspace();
    writeFileSync(path.join(workspace.clone, "feature.ts"), "export const feature = 1;\n");

    expect(unsavedWorkTrees(workspace.scratchFolder)).toEqual([workspace.clone]);
  });

  it("finds a clone with a commit that is on no remote", () => {
    const workspace = createWorkspace();
    commitFile({ workTree: workspace.clone, fileName: "feature.ts" });

    expect(unsavedWorkTrees(workspace.scratchFolder)).toEqual([workspace.clone]);
  });

  it("finds a clone with stashed changes", () => {
    const workspace = createWorkspace();
    writeFileSync(path.join(workspace.clone, "README.md"), "edited\n");
    git({ folder: workspace.clone, command: ["stash", "--quiet"] });

    expect(unsavedWorkTrees(workspace.scratchFolder)).toEqual([workspace.clone]);
  });

  it("finds a repository that was never pushed anywhere", () => {
    const workspace = createWorkspace();
    const localRepository = path.join(workspace.scratchFolder, "prototype");
    mkdirSync(localRepository);
    git({ folder: localRepository, command: ["init", "--quiet"] });
    commitFile({ workTree: localRepository, fileName: "prototype.ts" });

    expect(unsavedWorkTrees(workspace.scratchFolder)).toEqual([localRepository]);
  });

  it("lets go of a clean linked worktree, whose branch stays in its main repository", () => {
    const workspace = createWorkspace();
    const linkedWorkTree = path.join(workspace.scratchFolder, "linked");
    git({ folder: workspace.upstream, command: ["worktree", "add", "--quiet", "-b", "feature", linkedWorkTree] });
    commitFile({ workTree: linkedWorkTree, fileName: "feature.ts" });

    expect(unsavedWorkTrees(workspace.scratchFolder)).toEqual([]);
  });

  it("finds a linked worktree whose commits are on no branch", () => {
    const workspace = createWorkspace();
    const linkedWorkTree = path.join(workspace.scratchFolder, "linked");
    git({ folder: workspace.upstream, command: ["worktree", "add", "--quiet", "--detach", linkedWorkTree] });
    commitFile({ workTree: linkedWorkTree, fileName: "feature.ts" });

    expect(unsavedWorkTrees(workspace.scratchFolder)).toEqual([linkedWorkTree]);
  });

  it("asks each work tree's own repository even when git variables point at another one", () => {
    const workspace = createWorkspace();
    writeFileSync(path.join(workspace.clone, "feature.ts"), "export const feature = 1;\n");
    vi.stubEnv("GIT_DIR", path.join(workspace.upstream, ".git"));
    vi.stubEnv("GIT_WORK_TREE", workspace.upstream);

    expect(unsavedWorkTrees(workspace.scratchFolder)).toEqual([workspace.clone]);
  });
});
