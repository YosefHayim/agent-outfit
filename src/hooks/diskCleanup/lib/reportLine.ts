// e.g. "kept     in-use               /Users/me/Code/app/.worktrees/login"
export const reportLine = (request: {
  readonly action: string;
  readonly detail: string;
  readonly target: string;
}): string => [request.action.padEnd(12), request.detail.padEnd(24), request.target].join(" ");
