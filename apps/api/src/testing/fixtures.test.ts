import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { stubFetch } from "./fetch-stubs";
import { FIXTURES_DIR, recordFixture } from "./fixtures";

const write = () =>
  vi.fn<(path: string, text: string) => Promise<void>>(() => Promise.resolve());

describe("recordFixture", () => {
  it("saves the JSON body under the fixtures folder, formatted for Prettier", async () => {
    const fetchMock = stubFetch(
      () =>
        new Response('{"status":404,"error":"Postcode not found"}', {
          status: 404,
        }),
    );
    const writeMock = write();

    const recorded = await recordFixture({
      name: "postcodes-io-not-found",
      url: "https://api.postcodes.io/postcodes/ZZ11ZZ",
      init: { headers: { "user-agent": "test" } },
      fetch: fetchMock,
      write: writeMock,
    });

    const path = join(FIXTURES_DIR, "postcodes-io-not-found.json");
    expect(recorded).toEqual({ path, status: 404 });
    expect(writeMock).toHaveBeenCalledWith(
      path,
      '{ "status": 404, "error": "Postcode not found" }\n',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.postcodes.io/postcodes/ZZ11ZZ",
      expect.objectContaining({
        headers: { "user-agent": "test" },
        signal: expect.any(AbortSignal) as unknown,
      }),
    );
  });

  it("writes into the adapters' fixtures folder", () => {
    expect(FIXTURES_DIR).toMatch(/apps\/api\/src\/sources\/fixtures\/$/);
  });

  it.each(["../app", "Upper", "with space", "trailing-", ""])(
    "refuses the name %j without calling the source",
    async (name) => {
      const fetchMock = stubFetch(() => Response.json({}));

      await expect(
        recordFixture({
          name,
          url: "https://example.org",
          init: {},
          fetch: fetchMock,
          write: write(),
        }),
      ).rejects.toThrow(/lower-case words/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("refuses a body that is not JSON and writes nothing", async () => {
    const writeMock = write();

    await expect(
      recordFixture({
        name: "overpass-busy",
        url: "https://overpass-api.de/api/interpreter",
        init: {},
        fetch: stubFetch(
          () => new Response("<html>Busy</html>", { status: 504 }),
        ),
        write: writeMock,
      }),
    ).rejects.toThrow("answered 504 with a body that is not JSON");
    expect(writeMock).not.toHaveBeenCalled();
  });
});
