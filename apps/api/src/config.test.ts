import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ConfigError,
  MISSING_NOMINATIM_USER_AGENT,
  MISSING_PLANWIRE_API_KEY,
  readConfig,
  unknownProvider,
} from "./config";

const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("readConfig", () => {
  it("reads the Nominatim User-Agent", () => {
    expect(
      readConfig({
        NOMINATIM_USER_AGENT: " location-scout-dev (me@example.com) ",
      }),
    ).toEqual({
      nominatimUserAgent: "location-scout-dev (me@example.com)",
      planItUserAgent: null,
      planWireApiKey: null,
      epcApiKey: null,
      googleMapsApiKey: null,
      anthropicApiKey: null,
      anthropicModel: "claude-sonnet-5-5",
      warnings: [],
    });
  });

  it("reads the Anthropic key, without which AI Explanations are off, and without a word, and the model, Claude Sonnet 5.5 unless ANTHROPIC_MODEL names another", () => {
    const nominatim = {
      NOMINATIM_USER_AGENT: "location-scout-dev (me@example.com)",
    };
    expect(
      readConfig({ ...nominatim, ANTHROPIC_API_KEY: " sk-ant-test " }),
    ).toMatchObject({
      anthropicApiKey: "sk-ant-test",
      anthropicModel: "claude-sonnet-5-5",
      warnings: [],
    });
    expect(
      readConfig({
        ...nominatim,
        ANTHROPIC_API_KEY: "  ",
        ANTHROPIC_MODEL: " claude-opus-5-5 ",
      }),
    ).toMatchObject({
      anthropicApiKey: null,
      anthropicModel: "claude-opus-5-5",
      warnings: [],
    });
    expect(
      readConfig({ ...nominatim, ANTHROPIC_MODEL: "" }).anthropicModel,
    ).toBe("claude-sonnet-5-5");
  });

  it("reads the Google Maps key, without which the Street View panel is hidden, and without a word", () => {
    const nominatim = {
      NOMINATIM_USER_AGENT: "location-scout-dev (me@example.com)",
    };
    expect(
      readConfig({ ...nominatim, GOOGLE_MAPS_API_KEY: " AIzaSyTestKey " }),
    ).toMatchObject({ googleMapsApiKey: "AIzaSyTestKey", warnings: [] });
    expect(
      readConfig({ ...nominatim, GOOGLE_MAPS_API_KEY: "  " }),
    ).toMatchObject({ googleMapsApiKey: null, warnings: [] });
  });

  it("reads the EPC API's bearer token, without which EPCs aren't looked for, and without a word", () => {
    const nominatim = {
      NOMINATIM_USER_AGENT: "location-scout-dev (me@example.com)",
    };
    expect(
      readConfig({ ...nominatim, EPC_API_KEY: " eyJhbGciOi.token " }),
    ).toMatchObject({ epcApiKey: "eyJhbGciOi.token", warnings: [] });
    expect(readConfig({ ...nominatim, EPC_API_KEY: "  " })).toMatchObject({
      epcApiKey: null,
      warnings: [],
    });
  });

  it("reads PlanIt's User-Agent, which may be left out", () => {
    const nominatim = {
      NOMINATIM_USER_AGENT: "location-scout-dev (me@example.com)",
    };
    expect(
      readConfig({
        ...nominatim,
        PLANIT_USER_AGENT: " location-scout-dev (planning@example.com) ",
      }).planItUserAgent,
    ).toBe("location-scout-dev (planning@example.com)");
    expect(
      readConfig({ ...nominatim, PLANIT_USER_AGENT: "  " }).planItUserAgent,
    ).toBeNull();
  });

  describe("the Planning Applications provider", () => {
    const nominatim = {
      NOMINATIM_USER_AGENT: "location-scout-dev (me@example.com)",
    };

    it("is PlanWire with PLANNING_APPLICATIONS_PROVIDER=planwire and its key", () => {
      for (const provider of ["planwire", " PlanWire "]) {
        expect(
          readConfig({
            ...nominatim,
            PLANNING_APPLICATIONS_PROVIDER: provider,
            PLANWIRE_API_KEY: " pw_live_a1b2c3 ",
          }),
        ).toMatchObject({ planWireApiKey: "pw_live_a1b2c3", warnings: [] });
      }
    });

    it.each([
      ["unset", {}],
      ["planit", { PLANNING_APPLICATIONS_PROVIDER: "planit" }],
      ["blank", { PLANNING_APPLICATIONS_PROVIDER: " " }],
    ])(
      "is PlanIt, without a word, when PLANNING_APPLICATIONS_PROVIDER is %s, even with a PlanWire key",
      (_label, env) => {
        expect(
          readConfig({
            ...nominatim,
            PLANWIRE_API_KEY: "pw_live_a1b2c3",
            ...env,
          }),
        ).toMatchObject({ planWireApiKey: null, warnings: [] });
      },
    );

    it.each([
      ["missing", {}],
      ["blank", { PLANWIRE_API_KEY: "  " }],
    ])(
      "falls back to PlanIt with planwire but a key that is %s, explaining why",
      (_label, env) => {
        expect(
          readConfig({
            ...nominatim,
            PLANNING_APPLICATIONS_PROVIDER: "planwire",
            ...env,
          }),
        ).toMatchObject({
          planWireApiKey: null,
          warnings: [MISSING_PLANWIRE_API_KEY],
        });
      },
    );

    it("falls back to PlanIt for a provider it doesn't know, explaining why", () => {
      expect(
        readConfig({
          ...nominatim,
          PLANNING_APPLICATIONS_PROVIDER: " planwrie ",
          PLANWIRE_API_KEY: "pw_live_a1b2c3",
        }),
      ).toMatchObject({
        planWireApiKey: null,
        warnings: [unknownProvider("planwrie")],
      });
      expect(unknownProvider("planwrie")).toMatch(
        /"planwrie", which is not a Planning Applications\sprovider, so Planning Applications come from PlanIt/,
      );
    });

    it("explains that PlanWire needs a key, where to get one and how to set it, and what it does instead", () => {
      expect(MISSING_PLANWIRE_API_KEY).toMatch(
        /PLANWIRE_API_KEY is not set,\sso Planning Applications come from PlanIt instead/,
      );
      expect(MISSING_PLANWIRE_API_KEY).toMatch(/https:\/\/planwire\.io/);
      expect(MISSING_PLANWIRE_API_KEY).toMatch(/\.env file at the repo root/);
      expect(MISSING_PLANWIRE_API_KEY).toMatch(/PLANWIRE_API_KEY=pw_live_/);
    });
  });

  it.each([
    ["missing", {}],
    ["empty", { NOMINATIM_USER_AGENT: "" }],
    ["blank", { NOMINATIM_USER_AGENT: "   " }],
  ])("refuses a Nominatim User-Agent that is %s, saying why", (_label, env) => {
    expect(() => readConfig(env)).toThrow(ConfigError);
    expect(() => readConfig(env)).toThrow(MISSING_NOMINATIM_USER_AGENT);
  });

  it("explains the usage policy and how to set it", () => {
    expect(MISSING_NOMINATIM_USER_AGENT).toMatch(/usage policy/);
    expect(MISSING_NOMINATIM_USER_AGENT).toMatch(/\.env file at the repo root/);
    expect(MISSING_NOMINATIM_USER_AGENT).toMatch(
      /NOMINATIM_USER_AGENT="location-scout-dev \(you@example\.com\)"/,
    );
  });
});

describe("the API server", () => {
  it("refuses to start without NOMINATIM_USER_AGENT, and explains why", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: "0" };
    delete env.NOMINATIM_USER_AGENT;

    // Run as `pnpm start` does, but without reading a developer's .env file.
    const server = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/server.ts"],
      {
        cwd: API_DIR,
        env,
        encoding: "utf8",
        timeout: 20_000,
      },
    );

    expect(server.status).toBe(1);
    expect(server.stderr).toContain(MISSING_NOMINATIM_USER_AGENT);
    expect(server.stdout).not.toMatch(/listening/);
  });

  it("starts with planwire but no PLANWIRE_API_KEY, explaining that Planning Applications come from PlanIt instead", async () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: "0",
      NOMINATIM_USER_AGENT: "location-scout-test (tests@example.com)",
      PLANNING_APPLICATIONS_PROVIDER: "planwire",
    };
    delete env.PLANWIRE_API_KEY;

    // Run as `pnpm start` does, but without reading a developer's .env file.
    const server = spawn(
      process.execPath,
      ["--import", "tsx", "src/server.ts"],
      {
        cwd: API_DIR,
        env,
      },
    );
    let stdout = "";
    let stderr = "";
    server.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
          if (/listening/.test(stdout)) resolve();
        });
        server.on("exit", (code) => {
          reject(new Error(`The API exited with ${String(code)}: ${stderr}`));
        });
      });
    } finally {
      server.kill();
    }

    expect(stderr).toContain(MISSING_PLANWIRE_API_KEY);
    expect(stdout).toMatch(/listening/);
  }, 20_000);
});
