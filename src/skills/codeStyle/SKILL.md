---
name: code-style
description: Use when you want clear code style rules for a project, new or with code. It reads the code if there is any, asks you questions, and writes CODE-STYLE.md, the formatter config, and the project docs after you approve. It can also only check code against the rules. Say "code style", "set up conventions", "grill me on style", or "check code against CODE-STYLE".
---

<what-to-do>

Pick a mode from the user request and the repo, then follow only that mode:

| Mode | When | Follow | Writes files? |
| --- | --- | --- | --- |
| **New project** | Little or no code yet — decide from my taste, the purpose, and the language | [NEW-PROJECT.md](NEW-PROJECT.md) | Only after planpage approval |
| **Existing project** (default when there is code) | Decide / rebuild style with me using real code as evidence | [EXISTING-PROJECT.md](EXISTING-PROJECT.md) | Only after planpage approval |
| **Audit** | Docs already exist; check whether code + slices follow them | Below | **Never** — report only; hand cleanup to `simplify-code` |

Read the chosen file in full before the first question. Once a new project has real code, the next run uses Existing project.

### Mode: Audit (read-only compliance)

When I already have `CODE-STYLE.md` / structure docs and want confirmation that the tree follows them (including mechanical bans like `result` / `payload` / vague `to*`·`build*`·`resolve*` mappers):

1. Resolve the package/repo root.
2. Run mechanical inventory + scan from this skill directory (paths relative to the installed skill root):

   ```bash
   node scripts/inventory-repository.mjs --root <repo> --out /tmp/style-inventory.json
   node scripts/scan-style-compliance.mjs --root <repo> --out /tmp/style-findings.json
   ```

3. Map apps, packages, feature slices, and cross-slice imports from the inventory.
4. Compare docs (AGENTS, CODE-STYLE, PROJECT, CONTEXT, LANGUAGE, README) for missing files, nested contradictions, and path drift.
5. Publish evidence-first findings (`ruleId`, path, symbol, line, evidence, severity, confidence, remediation). Taxonomy: [references/finding-taxonomy.md](references/finding-taxonomy.md). Defaults informed by [references/research-principles.md](references/research-principles.md); **project CODE-STYLE wins**.
6. If findings are **persisted** (not chat-only): start a run folder outside the repo and write only the **`## Findings`** section of `$REPORT`:

   ```bash
   SKILL="code-style"
   COMMON_GIT_DIR=$(git rev-parse --path-format=absolute --git-common-dir)
   REPO_ROOT=$(dirname "$COMMON_GIT_DIR")
   REPO=$(basename "$REPO_ROOT")
   RUNS="${XDG_STATE_HOME:-$HOME/.local/state}/agent-outfit/runs/$REPO/$SKILL"
   RUN_DIR="$RUNS/$(date +%Y-%m-%d-%H%M)"
   [ -e "$RUN_DIR" ] && RUN_DIR="$RUN_DIR-$$"
   mkdir -p "$RUN_DIR"
   REPORT="$RUN_DIR/report.md"
   ```

   Resume → the run path the user gives, else the newest folder (`ls -1 "$RUNS" | tail -n 1`). Never write `*AUDIT*.md` / compliance reports in the repository: no `docs/` folder, nothing at the root.
7. Do **not** rewrite CODE-STYLE or rename symbols in audit mode. Approved cleanup → `simplify-code`; structural prove-outs → `simplify-repo-with-tests`.

Honest limit: mechanical scanners prove banned names, missing docs, and path patterns — not whether a name truly captures a business concept (`confidence: judgment` for those).

</what-to-do>
