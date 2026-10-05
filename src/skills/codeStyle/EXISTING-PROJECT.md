# Code style — existing project

<what-to-do>

Interview me relentlessly about **how this codebase is built** — its code style, its structure docs, and its CLI — until we reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies one-by-one. For each question, provide your recommended answer.

Fire every ready question in **one** `AskUserQuestion` (the host TUI question card). Recommended option first, marked `(Recommended)`; code variants go in each option's `preview`. Do not drip questions one-by-one. A second card is only for questions that could not exist until these answers landed. If the host rejects the card for size, split into the fewest cards that fit — still never one question per turn.

My **taste is the source of truth**; the existing code is **evidence, not gospel** — much of it may be the slop I want gone. When code and my stated taste conflict, my taste wins and `CODE-STYLE.md` records the DESIRED end-state, not the current one.

**Nothing is written to disk until I approve.** You scan and grill (Steps 1–4) — the code-style grill is a **pick-the-code gallery**: you show me real code variants and I pick what I like in **one** TUI question card (Step 3) — then compose the **golden path for adding a unit + its slop guard** from those picks and the evidence (Step 6). You render an **interactive HTML plan** as the review gate (Step 7, built with the **planpage** kit — I approve, adjust, or flip any decision right in the browser and it posts back), write the files on approval (Step 8), then run one **structure-review capstone** (Step 9) that can reorganize the tree and open a PR.

</what-to-do>

<supporting-info>

## Mechanical pre-scan (both modes)

Before sub-agent fan-out (grill Step 2) or as the core of audit mode, run the zero-dep scripts shipped with this skill. They give prevalence counts and concrete `file:symbol` offenders for generic locals and vague mappers without inventing taste.

Research defaults (Uncle Bob + Matt Pocock caption corpus): [references/research-principles.md](references/research-principles.md).

## Step 1 — Detect language and runtime, then ensure the structure docs

### Auto-detect language and runtime

Before scanning, auto-detect from the codebase:

- **Language** — from file extensions, package manifest (`package.json` → TS/JS, `Cargo.toml` → Rust, `go.mod` → Go, `pyproject.toml`/`setup.py` → Python, etc.), and build config (`tsconfig.json`, `.swiftpm`). Report: "Detected: **{language}** via `{evidence}`". Confirm with the user. If ambiguous (e.g. a repo with both Python and TypeScript), ask which is primary.
- **Runtime target** — from the manifest/config (e.g. `wrangler.toml` → edge/worker, `expo` in package.json → native app, `bin` field → CLI tool, browser entry → SPA). Report and confirm.

These gate which [STYLE-CATALOG.md](_shared/STYLE-CATALOG.md) sections apply and which [FORMATTERS.md](_shared/FORMATTERS.md) row to use.

### Ensure the three structure docs

Read whatever exists first so you grill about CODE, not product. Then **ensure the three structure docs** — gather the missing ones' content, validate the present ones against their role, and **never restructure a doc that already exists** (report drift, don't rewrite it). Defer file writes to Step 7 so the plan can show them.

- **PROJECT.md** — purpose & direction. Missing/thin → ask the seven-part **What to ask** checklist in [PROJECT-FORMAT.md](_shared/PROJECT-FORMAT.md) (the same questions `question-my-plan` asks; don't write your own). Title: `# PROJECT.md — {Project}`.
- **CONTEXT.md** — orientation only. Validate against [CONTEXT-FORMAT.md](_shared/CONTEXT-FORMAT.md) (exemplar: `ai-browser-bridge/CONTEXT.md`). Title: `# CONTEXT.md — {Project}`. Flag `## Language` / glossary `_Avoid_:` blocks as **drift** → migrate to `LANGUAGE.md`.
- **LANGUAGE.md** — glossary / human↔agent bridge: **names only**. Validate against [LANGUAGE-FORMAT.md](_shared/LANGUAGE-FORMAT.md) and the code's real vocabulary (exemplar: `ai-browser-bridge/LANGUAGE.md`). Flag tables / bullet glossaries / colon-on-bold as **drift**.

Record each doc's state — `create` · `validate ✓` · `drift` — for the Step 6 plan.

---

## Step 2 — Scan the code with sub-agents

Fan out read-only sub-agents to survey the codebase and report the **most-repeated** patterns — dominant reality, not a file dump. See [SCAN.md](SCAN.md) for the fan-out strategy (**includes a mandatory ceremony & tool-slop angle** — tool wrappers, house typegen, scripts layout, orphan generated files). Bring back a compact "current reality" brief + **ceremony kill list** to drive the grill.

---

## Step 3 — Grill the code as a pick-the-code gallery

The code-style grill runs as **pick-the-code**, not prose. Put every applicable dimension in **one** TUI card (`AskUserQuestion` — one question per dimension, code in each option's `preview`) and I **pick**; each pick is recorded verbatim. Variant **A** is the repo's actual incumbent (pulled verbatim by the scan, `file:symbol`-cited — you react to *your* code, warts and all); variant **B** is the de-slopped rewrite; an **uncontested** dimension collapses to a single **keep/kill** rather than a fabricated choice.

Run the full catalog: **[STYLE-CATALOG.md](_shared/STYLE-CATALOG.md)** — all language-conditional sections filtered by the auto-detected language, all new dimensions included.

Key behaviors:
- **Each pick → a rule card.** Chosen variant = the `✓` example; rejected variant = the `✗` case. Every card follows the fixed five-slot anatomy in [CODE-STYLE-FORMAT.md](_shared/CODE-STYLE-FORMAT.md): heading, `[rule:<id>] · verify: <command>` metadata line, **one-sentence** assertion, ✓/✗ block, `Why:` line. `verify:` names a real command, or `judgment`.
- **Formatting** — quotes/semis/width/trailing-commas/import-order: grill my preference but land it as a **formatter config** (per [FORMATTERS.md](_shared/FORMATTERS.md)), with the choice in the PR description — not prose. Reconcile with any config already in the repo. The **machine-catchable slop tells** land here too as **linter rules** — prevented, not just documented.
- **AI-slop fingerprint (the tells)** — the scan's fingerprint angle brings back the recognizable AI tells **with counts**; grill each **keep or kill**. A high count is *not* a free pass — repeated slop is still slop. Killed tells become the concrete `## Never` list, each with its real `file:symbol` offender and a cross-reference to the owning `[rule:<id>]` (whose `verify:` is a real command or `judgment` — never a heading tag like `[taste]` / `[lint: …]`).
- **Over-engineering (the "too much" fingerprint)** — run [STYLE-CATALOG.md](_shared/STYLE-CATALOG.md) **Round 7**: grill each over-engineering family (needless indirection, fake robustness, control-flow contortion, shape noise, dead space, structural too-much/too-little — `ls`/tree the repo first — **and ceremony C1–C8** from the mandatory SCAN angle) as **keep/kill against real `file:symbol` / path offenders**. Tests: *abstraction earns its place only with a second real caller or a genuine domain concept*; *tool-first — if the CLI already does it, no house wrapper; generated orphans die with dead scripts*. Before/after: `simplify-code` references (`line-smells`, `structure-smells`, **`ceremony-smells`**). Killed families fold into `## Never`; ceremony hits become a **kill list** in the plan (path → replace with tool / delete). Wire machine-catchable ones into lint; point mass cleanup at `simplify-code` (“kill ceremony”).
- **Golden exemplars** — grill me to name **1–3 real files** that best embody the agreed style ("write new code exactly like these"). They anchor `CODE-STYLE.md`'s Exemplars and give `make-code-readable` a concrete target. If nothing qualifies yet, flag it — that's a finding.
- **Compose the canonical example.** After the rounds, assemble every pick into one **canonical example** — a real feature slice from this repo rewritten in the agreed style — so I see the whole pattern working together, not just atomized picks. It becomes the Step 6 litmus and the `## Canonical example` block of `CODE-STYLE.md`.

---

## Step 4 — Grill the CLI

Every project earns a **CLI both humans and agents drive**. If the repo already has one, hand the deep audit to the `interactive-cli-reviewer` skill and fold its findings back here; otherwise put these picks on the **same** `AskUserQuestion` as the style catalog:

- **Have/need one?** Default yes — a dev+ops surface.
- **Command surface** — verbs/nouns.
- **Dual-mode contract** — a bare invocation in a TTY opens a menu; flags or non-TTY defer and **never hang**; both routes call the **same functions** (the `agent-outfit` "interactive front door" pattern).

Record the command surface in the **PR description**; the conventions become `CODE-STYLE.md` rules + a recipe.

---

## Steps 5–9 — Dependencies, golden path, framework refs, plan, write, capstone

See **[STEPS.md](_shared/STEPS.md)** for the shared procedures:

- **Step 5** → Audit dependencies (flag unmaintained/unstable/duplicative, record decisions in the PR description).
- **Step 6** → Compose the **golden path + slop guard** (see [EXTENSION-PATTERN.md](_shared/EXTENSION-PATTERN.md)) — name the unit of extension, **mine how the last 1–3 units were really added** (the `SCAN.md` "how a {unit} gets added" angle) and grill the derived numbered path in one `AskUserQuestion`, end with a definition-of-done checklist, and wire the guard (machine-catchable `## Never` tells → the lint config that CI blocks; taste → `make-code-readable` per-diff; ceremony → `simplify-code` kill list).
- **Step 7** → Reference framework practices, then render the interactive planpage plan (the review gate) — including the **golden-path + guard block** and the **ceremony kill list** (paths to delete/replace with official tools) when the scan found hits.
- **Step 8** → On approval, write the files (CODE-STYLE.md incl. `## Golden path`, formatter + lint config, structure docs, AGENTS.md digest incl. the tight golden-path mirror).
- **Step 9** → Structure review & reorg capstone (judge organization, propose moves, open PR on approval).
- **Re-running** → Idempotent; surface drift and ask "fix the code, or evolve the guide?"

</supporting-info>
