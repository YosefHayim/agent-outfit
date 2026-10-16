import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { childEntries, isStale } from "./staleEntries.js";

// Each project's build folder records where the project was opened from, e.g.
// <key>WorkspacePath</key><string>/Users/me/Code/app/ios/App.xcworkspace</string>
const WORKSPACE_PATH_PATTERN = /<key>WorkspacePath<\/key>\s*<string>([^<]*)<\/string>/u;

const isAbandoned = (buildFolder: string): boolean => {
  const workspacePlist = path.join(buildFolder, "info.plist");
  if (!existsSync(workspacePlist)) {
    return false;
  }

  const workspacePath = WORKSPACE_PATH_PATTERN.exec(readFileSync(workspacePlist, "utf8"))?.[1] || "";
  return !existsSync(workspacePath) || isStale(workspacePlist);
};

// Xcode rebuilds a project's folder on the next build; one whose project is gone or unopened for weeks is only weight.
// Shared folders such as ModuleCache.noindex have no info.plist and stay.
export const abandonedXcodeBuildFolders = (homeRoot: string): ReadonlyArray<string> => {
  const buildFoldersRoot = path.join(homeRoot, "Library", "Developer", "Xcode", "DerivedData");
  return childEntries(buildFoldersRoot).filter(isAbandoned);
};
