/** `agent-outfit duplicates [workspace]` — duplicate-code gate for local work and CI. */

import { Command, Options } from "@effect/cli";
import { Path } from "@effect/platform";
import { Effect, Option } from "effect";
import { scanHost } from "../config/hostScan.js";
import { readConfigAt } from "../config/scopeConfig.js";
import { checkDuplicates } from "../hooks/duplicateCodeGuard/command/checkDuplicates.js";
import { CliUsageError, formatOption, type OutputFormat, workspaceArgument } from "./cliOptions.js";

// Skip the folders the installed hooks skip: the workspace's own config.json, else the global one.
export const checkWorkspaceDuplicates = (request: {
  readonly workspace: string;
  readonly staged: boolean;
  readonly since: string | undefined;
  readonly format: OutputFormat;
}) =>
  Effect.gen(function* () {
    const host = yield* scanHost;
    const config = yield* readConfigAt({ root: request.workspace, homeRoot: host.homeRoot });
    checkDuplicates({ ...request, skipFolders: config.duplicateCodeSkipFolders });
  });

const stagedOption = Options.boolean("staged").pipe(
  Options.withDefault(false),
  Options.withDescription("Restrict findings to git-staged source files"),
);

const sinceOption = Options.text("since").pipe(
  Options.optional,
  Options.withDescription("Restrict findings to files changed since this git ref"),
);

export const duplicatesCommand = Command.make(
  "duplicates",
  {
    workspace: workspaceArgument("Repository root to scan (default: current working directory)"),
    staged: stagedOption,
    since: sinceOption,
    format: formatOption,
  },
  (args) =>
    Effect.gen(function* () {
      if (args.staged && Option.isSome(args.since)) {
        return yield* new CliUsageError({ issue: "Use either --staged or --since, not both." });
      }

      const path = yield* Path.Path;
      yield* checkWorkspaceDuplicates({
        workspace: path.resolve(Option.getOrElse(args.workspace, () => process.cwd())),
        staged: args.staged,
        since: Option.getOrUndefined(args.since),
        format: args.format,
      });
    }),
).pipe(Command.withDescription("Find duplicate function bodies and type shapes"));
