---
name: run-ci-locally
description: Use when GitHub Actions cannot run (billing block, no runner) and the repo's CI workflows must pass locally in Docker with act. Runs each job, reports pass or fail, then removes every container, volume, image and file the run made. Say "run CI locally", "run act", or "Actions are blocked".
type: flow
---

# Run CI locally

Run the repository's GitHub Actions workflows on this machine with [act](https://nektosact.com) in Docker, report each job, and leave nothing behind.

## Safety

- Other sessions share Docker. Remove only what this run made, selected by its run name. Never run `docker system prune` or any other `prune`.
- Never print or store the GitHub token; pass it only as an act secret.

- Docker is running with enough memory for the heaviest job. A leg killed with exit 137 means Docker needs more memory.
- `act` is installed. Read its config file (`~/.actrc`, or `~/Library/Application Support/act/actrc` on macOS) for the runner image, for example `-P ubuntu-latest=catthehacker/ubuntu:act-latest`.
- `gh auth status` works. The token goes in as a secret, never into a file.
- Pick a run name used for everything this run creates: `CI_NAME="ci-<branch>-<short-sha>"`. Work files go in the session scratchpad, never in the repository and never in the system temp folder.

## Workflow

### Setup

1. **Plain clone, not a worktree.** A worktree's `.git` file breaks steps that run git inside the container.

   ```bash
   git clone --single-branch --branch <branch> <repo-path> "<scratchpad>/$CI_NAME"
   ```

2. **GitHub origin.** act reads `github.repository` from the clone's origin; a file-path origin breaks actions such as `dorny/paths-filter`.

   ```bash
   git -C "<scratchpad>/$CI_NAME" remote set-url origin https://github.com/<owner>/<repo>.git
   ```

3. **Unique workflow name.** act names containers after the workflow and job, so parallel runs collide. Copy the workflow inside the clone with `name: <CI_NAME>-<leg>` and pass the copy with `-W`.
4. **Own action cache per leg.** Concurrent runs corrupt a shared `~/.cache/act` ("reference not found", "EOF").

   ```bash
   cp -cR ~/.cache/act "<scratchpad>/$CI_NAME-cache-<leg>"   # macOS copy-on-write; use cp -R elsewhere
   ```

### Node missing after a PATH step

In `catthehacker/ubuntu:act-latest`, node lives only in the tool cache. After a step that edits PATH (for example `pnpm/action-setup` before `setup-node`), the next JavaScript action fails with `exec: "node": executable file not found` (exit 127). Fix it with a derived runner image that links node into `/usr/local/bin`:

```dockerfile
FROM catthehacker/ubuntu:act-latest
RUN NODE_BIN=$(ls -d /opt/acttoolcache/node/*/x64/bin | tail -n 1) \
 && for tool in node npm npx corepack; do ln -sf "$NODE_BIN/$tool" "/usr/local/bin/$tool"; done
```

Build it once as `act-runner-node:<date>` and run with `-P ubuntu-latest=act-runner-node:<date> --pull=false`.

### Run

```bash
act push -W .github/workflows/<copy>.yml \
  -P ubuntu-latest=act-runner-node:<date> --pull=false \
  --action-cache-path "<scratchpad>/$CI_NAME-cache-<leg>" --action-offline-mode \
  -s GITHUB_TOKEN="$(gh auth token)" \
  > "<scratchpad>/$CI_NAME-<leg>.log" 2>&1
```

- Use the event the workflow really runs on. For `pull_request`, pass `-e <event.json>` with the base and head SHAs.
- Run about 6 legs at once at most. More causes CPU contention and test timeouts. Rerun one failed leg alone with `--matrix <key>:<value>`.
- Scripts inside the container write temp files to `$RUNNER_TEMP`, not the system temp folder.
- A step that cannot work under act (an action with broken outputs, a deploy, an upload) gets a stand-in step in the workflow copy that runs the same tool directly. List every stand-in in the report.

### Cleanup (always, also after a failure)

Remove only what this run made, selected by `CI_NAME`.

```bash
for container in $(docker ps -aq --filter "name=$CI_NAME"); do docker rm -f "$container"; done
for volume in $(docker volume ls -q --filter "name=$CI_NAME"); do docker volume rm "$volume"; done
```

- **Images.** Before the run, save `docker images -q` to a scratchpad file. After it, remove only new `act-*` images the run built for Docker actions. Keep the runner images (the base image and `act-runner-node:<date>`): they are machine tooling reused by every run.
- **Shared volumes.** Keep `act-toolcache` and any volume without `CI_NAME` in its name.
- **Files.** Delete the clone, the leg caches, the event files and the logs from the scratchpad once the report is written.

Check that `docker ps -a --filter "name=$CI_NAME"` and `docker volume ls --filter "name=$CI_NAME"` print nothing.

## Verification

Report:


- Each leg: job, matrix values, pass or fail, duration, and for a failure the first failing step with a short log excerpt.
- Every stand-in step and why act could not run the original.
- Cleanup result: containers, volumes, images and files removed, and nothing left with `CI_NAME`.
