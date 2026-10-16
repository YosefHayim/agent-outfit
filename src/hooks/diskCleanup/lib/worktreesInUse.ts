import { createPathMatcher } from "../../lib/pathMatcher.js";
import { readClaudeEvidence, readCodexEvidence, type SessionEvidence } from "../../lib/sessionEvidence.js";
import { liveSessions } from "./liveSessions.js";
import { isInsideFolder, runningProcesses } from "./runningProcesses.js";

type EvidenceReader = (request: Parameters<typeof readClaudeEvidence>[0]) => SessionEvidence;

const NO_KEYWORDS = (): ReadonlySet<string> => new Set();

const foldersHoldingAny = (request: {
  readonly worktreeFolders: ReadonlyArray<string>;
  readonly usedFolders: ReadonlyArray<string>;
}): ReadonlyArray<string> =>
  request.worktreeFolders.filter((folder) =>
    request.usedFolders.some((candidate) => isInsideFolder({ candidate, folder })),
  );

// A transcript that cannot be read could name any worktree.
const foldersWorkedIn = (request: {
  readonly transcriptFile: string;
  readonly readEvidence: EvidenceReader;
  readonly worktreeFolders: ReadonlyArray<string>;
  readonly homeRoot: string;
}): ReadonlyArray<string> => {
  const namedFolders = request.worktreeFolders.map((folder) => ({ name: folder, root: folder }));
  const matchers = { matchPaths: createPathMatcher(namedFolders), matchKeywords: NO_KEYWORDS };
  try {
    const evidence = request.readEvidence({ ...request, matchers });
    return [...evidence.pathHits.keys()];
  } catch {
    return request.worktreeFolders;
  }
};

// A worktree is in use while a process works in it, an unfinished background job runs there, or a live session's
// commands, edits, and working folders name it.
export const worktreesInUse = (request: {
  readonly homeRoot: string;
  readonly worktreeFolders: ReadonlyArray<string>;
  readonly endedSessionId: string;
}): ReadonlySet<string> => {
  const processes = runningProcesses();
  if (!processes) {
    return new Set(request.worktreeFolders);
  }

  const live = liveSessions(request);
  const usedFolders = [...processes.workingFolders, ...live.jobFolders];
  const claudeTranscripts = live.claudeTranscripts.map((transcriptFile) => ({
    transcriptFile,
    readEvidence: readClaudeEvidence,
  }));
  const codexRollouts = live.codexRollouts.map((transcriptFile) => ({
    transcriptFile,
    readEvidence: readCodexEvidence,
  }));
  const sessionFolders = [...claudeTranscripts, ...codexRollouts].flatMap((transcript) =>
    foldersWorkedIn({ ...transcript, worktreeFolders: request.worktreeFolders, homeRoot: request.homeRoot }),
  );
  return new Set([...foldersHoldingAny({ worktreeFolders: request.worktreeFolders, usedFolders }), ...sessionFolders]);
};
