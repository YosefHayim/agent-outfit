import { spawnSync } from "node:child_process";

// A remote that wants a password has to fail, since nobody is there to type one: git may ask neither on the terminal
// nor through a helper program, and neither may ssh. An empty GIT_ASKPASS also rules out core.askPass and SSH_ASKPASS.
const NO_PASSWORD_QUESTIONS = { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", SSH_ASKPASS_REQUIRE: "never" };

// Git sets GIT_DIR and GIT_INDEX_FILE inside its own hooks; inherited, they would point every call at that repository.
const gitEnvironment = (): NodeJS.ProcessEnv => {
  const variables = Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"));
  return { ...Object.fromEntries(variables), ...NO_PASSWORD_QUESTIONS };
};

export type GitQuestion = {
  readonly folder: string;
  readonly query: ReadonlyArray<string>;
  readonly ignoredLine?: RegExp;
  readonly timeoutMilliseconds?: number;
};

// A git call that fails or runs out of time has no answer, which is not the same as an empty one.
export const gitAnswerLines = (question: GitQuestion): ReadonlyArray<string> | undefined => {
  // --no-optional-locks keeps this read from blocking an agent that is using the same work tree.
  const git = spawnSync("git", ["--no-optional-locks", "-C", question.folder, ...question.query], {
    encoding: "utf8",
    env: gitEnvironment(),
    timeout: question.timeoutMilliseconds,
  });
  if (git.status !== 0) {
    return undefined;
  }

  return git.stdout.split("\n").filter((line) => line !== "");
};

// A git call that fails cannot vouch for the work tree, so only a successful empty answer counts as nothing.
export const gitFindsNothing = (question: GitQuestion): boolean => {
  const answerLines = gitAnswerLines(question);
  if (!answerLines) {
    return false;
  }

  const countedLines = answerLines.filter((line) => !question.ignoredLine?.test(line));
  return countedLines.length === 0;
};
