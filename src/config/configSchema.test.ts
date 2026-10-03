import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";

import {
  configJsonSchema,
  configSchema,
  configSettings,
  defaultConfig,
  defaultSettingValue,
  settingValueFromText,
  withSettingValue,
} from "./configSchema.js";

const decodeConfig = Schema.decodeUnknownSync(configSchema, { onExcessProperty: "error" });

const settingNamed = (name: string) => {
  const setting = configSettings.find((candidate) => candidate.name === name);
  if (setting === undefined) {
    throw new Error(`Expected a ${name} setting.`);
  }
  return setting;
};

describe("configSchema", () => {
  it("decodes the complete executable defaults", () => {
    expect(decodeConfig({})).toEqual({
      contextWarnPercent: 18,
      contextBlockPercent: 20,
      autorunDefaultCycles: 10,
      autorunMaxCycles: 50,
      autorunCheckEverySeconds: 5,
      autorunIdleAfterSeconds: 8,
      idleCompactAfter: "off",
      duplicateCodeMode: "block",
      duplicateCodeSkipFolders: [],
      sessionRehomeRoots: ["Desktop/Code", "Code", "Projects", "dev", "src", "repos"],
      debugLogs: false,
    });
    expect(defaultConfig).toEqual(decodeConfig({}));
  });

  it("keeps a label and a description on every setting", () => {
    for (const setting of configSettings) {
      expect(setting.label).not.toBe(setting.key);
      expect(setting.description).not.toBe("");
    }
  });

  it("derives kebab-case CLI names and value kinds from the schema keys", () => {
    expect(configSettings.map((setting) => setting.name)).toContain("duplicate-code-skip-folders");
    expect(settingNamed("context-warn-percent").kind).toBe("number");
    expect(settingNamed("debug-logs").kind).toBe("boolean");
    expect(settingNamed("duplicate-code-skip-folders").kind).toBe("list");
    expect(settingNamed("duplicate-code-mode").kind).toBe("text");
    expect(settingNamed("duplicate-code-mode").choices).toEqual(["block", "warn", "off"]);
    expect(settingNamed("duplicate-code-mode").optional).toBe(false);
  });

  it("fills omitted properties but rejects excess properties", () => {
    expect(decodeConfig({ duplicateCodeMode: "warn" })).toEqual({
      ...defaultConfig,
      duplicateCodeMode: "warn",
    });
    expect(() => decodeConfig({ unknownProperty: true })).toThrow();
  });

  it.each(configSettings.map((setting) => setting.key))("rejects explicit undefined for %s", (property) => {
    expect(() => decodeConfig({ [property]: undefined })).toThrow();
  });

  it("accepts inclusive numeric boundaries", () => {
    expect(
      decodeConfig({
        contextWarnPercent: 1,
        contextBlockPercent: 99,
        autorunDefaultCycles: 1,
        autorunMaxCycles: 1000,
        autorunCheckEverySeconds: 1,
        autorunIdleAfterSeconds: 600,
      }),
    ).toMatchObject({
      contextWarnPercent: 1,
      contextBlockPercent: 99,
      autorunDefaultCycles: 1,
      autorunMaxCycles: 1000,
      autorunCheckEverySeconds: 1,
      autorunIdleAfterSeconds: 600,
    });
  });

  it.each([
    ["contextWarnPercent below", { contextWarnPercent: 0.99 }],
    ["contextWarnPercent above", { contextWarnPercent: 95.01, contextBlockPercent: 99 }],
    ["contextBlockPercent below", { contextWarnPercent: 0.5, contextBlockPercent: 0.9 }],
    ["contextBlockPercent above", { contextBlockPercent: 99.01 }],
    ["autorunDefaultCycles below", { autorunDefaultCycles: 0.999 }],
    ["autorunDefaultCycles above", { autorunDefaultCycles: 1000.001, autorunMaxCycles: 1000 }],
    ["autorunMaxCycles below", { autorunDefaultCycles: 1, autorunMaxCycles: 0.999 }],
    ["autorunMaxCycles above", { autorunMaxCycles: 1000.001 }],
    ["autorunCheckEverySeconds below", { autorunCheckEverySeconds: 0.999 }],
    ["autorunCheckEverySeconds above", { autorunCheckEverySeconds: 600.001 }],
    ["autorunIdleAfterSeconds below", { autorunIdleAfterSeconds: 0.999 }],
    ["autorunIdleAfterSeconds above", { autorunIdleAfterSeconds: 600.001 }],
  ])("rejects rather than clamps %s", (_case, input) => {
    expect(() => decodeConfig(input)).toThrow();
  });

  it("permits fractional counts and seconds", () => {
    expect(
      decodeConfig({
        autorunDefaultCycles: 10.5,
        autorunMaxCycles: 50.5,
        autorunCheckEverySeconds: 5.5,
        autorunIdleAfterSeconds: 8.5,
      }),
    ).toMatchObject({
      autorunDefaultCycles: 10.5,
      autorunMaxCycles: 50.5,
      autorunCheckEverySeconds: 5.5,
      autorunIdleAfterSeconds: 8.5,
    });
  });

  it.each([
    ["contextWarnPercent", { contextWarnPercent: 20, contextBlockPercent: 20 }],
    ["autorunDefaultCycles", { autorunDefaultCycles: 51, autorunMaxCycles: 50 }],
  ])("reports a path-aware cross-field issue on %s", (property, settings) => {
    expect(() => decodeConfig(settings)).toThrow(property);
  });

  it("trims documented text", () => {
    expect(decodeConfig({ duplicateCodeMode: " warn " })).toMatchObject({ duplicateCodeMode: "warn" });
  });

  it("accepts a list of skip folders", () => {
    expect(decodeConfig({ duplicateCodeSkipFolders: ["templates", "fixtures"] })).toMatchObject({
      duplicateCodeSkipFolders: ["templates", "fixtures"],
    });
  });

  it("rejects an empty skip folder", () => {
    expect(() => decodeConfig({ duplicateCodeSkipFolders: [""] })).toThrow();
  });

  it.each([{ duplicateCodeMode: "BLOCK" }])("does not case-fold %o", (settings) => {
    expect(() => decodeConfig(settings)).toThrow();
  });
});

describe("setting values from CLI text", () => {
  const applyText = (name: string, text: string) =>
    settingValueFromText({ setting: settingNamed(name), text }).pipe(
      Effect.flatMap((value) => withSettingValue({ config: defaultConfig, key: settingNamed(name).key, value })),
    );

  it.effect("parses numbers, booleans, and comma lists by the setting's kind", () =>
    Effect.gen(function* () {
      expect((yield* applyText("context-warn-percent", "15")).contextWarnPercent).toBe(15);
      expect((yield* applyText("debug-logs", "true")).debugLogs).toBe(true);
      expect(
        (yield* applyText("duplicate-code-skip-folders", "vendor, generated ,, tmp")).duplicateCodeSkipFolders,
      ).toEqual(["vendor", "generated", "tmp"]);
    }),
  );

  it("reads a setting's schema default", () => {
    expect(defaultSettingValue("duplicateCodeMode")).toEqual(Option.some("block"));
  });

  it.effect("rejects text the setting cannot hold", () =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(applyText("debug-logs", "sometimes"))).toBeDefined();
      expect(yield* Effect.flip(applyText("context-warn-percent", "0.5"))).toBeDefined();
    }),
  );
});

describe("configJsonSchema", () => {
  it("encodes every owned property into JSON", () => {
    const json = Schema.encodeSync(configJsonSchema)(defaultConfig);

    expect(JSON.parse(json)).toEqual(defaultConfig);
    expect(Object.keys(JSON.parse(json))).toHaveLength(11);
  });
});
