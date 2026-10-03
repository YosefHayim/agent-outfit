import { Schema } from "effect";

// e.g. "AGENT_OUTFIT_IDLE_COMPACT_AFTER" — AGENT_OUTFIT_<AREA>_<SETTING>
const ENVIRONMENT_VARIABLE_PATTERN = /^AGENT_OUTFIT_[A-Z]+(?:_[A-Z]+)+$/;

const environmentVariableSchema = Schema.Struct({
  name: Schema.String.pipe(
    Schema.pattern(ENVIRONMENT_VARIABLE_PATTERN, {
      message: () => "Environment variables are named AGENT_OUTFIT_<AREA>_<SETTING>.",
    }),
    Schema.annotations({ description: "Exact environment variable name." }),
  ),
  defaultValue: Schema.NonEmptyTrimmedString.annotations({
    description: "What applies when the variable is unset.",
  }),
  purpose: Schema.NonEmptyTrimmedString.annotations({
    description: "What the variable changes, in one or two plain sentences.",
  }),
});

// Every AGENT_OUTFIT_* variable any agent-outfit code reads; environmentVariables.test.ts fails when src/ drifts from it.
export const environmentVariables = Schema.decodeUnknownSync(Schema.Array(environmentVariableSchema), {
  onExcessProperty: "error",
})([
  {
    name: "AGENT_OUTFIT_AGENT_ID",
    defaultValue: "set by agent-outfit in hook commands",
    purpose:
      "Which agent ran a hook (claude-code, codex, grok). Install writes AGENT_OUTFIT_AGENT_ID=<agent> in front of the hook commands that read it: idle compact and session rehome.",
  },
  {
    name: "AGENT_OUTFIT_IDLE_COMPACT_AFTER",
    defaultValue: "unset (idleCompactAfter in config.json applies)",
    purpose:
      "Overrides idleCompactAfter for one agent session: off, or a time like 30s. Set it when starting the agent, e.g. `AGENT_OUTFIT_IDLE_COMPACT_AFTER=30s codex`.",
  },
  {
    name: "AGENT_OUTFIT_AUTORUN_DRY_RUN",
    defaultValue: "off",
    purpose:
      "When 1, true, or yes, the autorun watcher logs the keystrokes it would type instead of typing them (safe manual testing).",
  },
  {
    name: "AGENT_OUTFIT_REHOME_STATE_DIR",
    defaultValue: "~/.claude/agent-outfit/state/session-rehome",
    purpose:
      "Folder for session-rehome's ledger of moved, kept, and deleted sessions, its watcher lock, and its sweep stamp. Tests point it at a temporary folder.",
  },
]);
