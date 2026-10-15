import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AI_EXPLANATION_LABEL,
  type ExplainEvent,
} from "@location-scout/shared";

import { Explain } from "./Explain";
import { ExplainContext, type Explaining } from "./explain-context";

const EXPLAINING: Explaining = {
  model: "claude-sonnet-5-5",
  questions: {
    overview: ["What is it like here?", "What are the biggest risks here?"],
    category: ["Why is this score what it is?"],
    "land-opportunity": ["What should I check before pursuing it?"],
  },
  about: {
    lat: 53.123664,
    lng: -1.264078,
    radius: 0.5,
    postcode: "NG17 1AA",
    mode: "general",
  },
};

const SAFETY = { kind: "category", category: "safety" } as const;

const DONE: ExplainEvent = {
  type: "done",
  usage: { inputTokens: 5036, outputTokens: 33 },
  cached: false,
  truncated: false,
  unverifiedNumbers: [],
};

const sse = (event: ExplainEvent) => `data: ${JSON.stringify(event)}\n\n`;

/**
 * The backend, answering `/api/explain` with a stream the test writes to,
 * a server-sent event at a time.
 */
const streamingBackend = () => {
  let writer: ReadableStreamDefaultController<Uint8Array> | null = null;
  const fetchMock = vi.fn<
    (url: string, init?: RequestInit) => Promise<Response>
  >(() =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            writer = controller;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    send: (text: string) => {
      writer?.enqueue(new TextEncoder().encode(text));
    },
    end: () => {
      writer?.close();
    },
  };
};

/** What a request asked, from its JSON body. */
const asked = (init: RequestInit | undefined): unknown =>
  JSON.parse(typeof init?.body === "string" ? init.body : "null");

const renderExplain = (explaining: Explaining | null = EXPLAINING) =>
  render(
    <ExplainContext value={explaining}>
      <Explain subject={SAFETY} name="the Safety score" />
    </ExplainContext>,
  );

const openPanel = async () => {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Explain the Safety score" }),
  );
  return {
    user,
    panel: screen.getByRole("region", {
      name: "AI Explanation of the Safety score",
    }),
  };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Explain", () => {
  it("is hidden while AI Explanations are off, asking nothing", () => {
    const { fetchMock } = streamingBackend();

    renderExplain(null);

    expect(screen.queryByRole("button", { name: /^Explain/ })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens to the questions offered for its subject first, then the user's own", async () => {
    streamingBackend();
    renderExplain();
    const button = screen.getByRole("button", {
      name: "Explain the Safety score",
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    const { panel } = await openPanel();

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(within(panel).getByRole("list", { name: "Questions to ask" }))
        .getAllByRole("button")
        .map((question) => question.textContent),
    ).toEqual(["Why is this score what it is?"]);
    expect(
      within(panel).getByRole("textbox", { name: "Or ask your own question" }),
    ).toBeTruthy();
    expect(panel.textContent).toContain(
      "claude-sonnet-5-5 explains the figures above in plain English. It uses them alone and never decides a score.",
    );
  });

  it("asks about its subject in the Search Area, streams the answer under its label as it is written, then gives its tokens", async () => {
    const { fetchMock, send, end } = streamingBackend();
    renderExplain();
    const { user, panel } = await openPanel();

    await user.click(
      within(panel).getByRole("button", {
        name: "Why is this score what it is?",
      }),
    );
    send(sse({ type: "text", text: "Safety is 0, " }));

    expect(await within(panel).findByText("Safety is 0,")).toBeTruthy();
    expect(within(panel).getByText(AI_EXPLANATION_LABEL)).toBeTruthy();
    expect(within(panel).getByText("Writing…")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/explain");
    expect(init?.method).toBe("POST");
    expect(asked(init)).toEqual({
      ...EXPLAINING.about,
      subject: SAFETY,
      question: "Why is this score what it is?",
    });

    send(sse({ type: "text", text: "as crime is high." }));
    send(sse(DONE));
    end();

    expect(
      await within(panel).findByText(
        "About 5,069 tokens: 5,036 sent and 33 written.",
      ),
    ).toBeTruthy();
    expect(
      within(panel).getByText("Safety is 0, as crime is high."),
    ).toBeTruthy();
    expect(within(panel).queryByText("Writing…")).toBeNull();
  });

  it("asks the user's own question, and says an answer from memory cost nothing more", async () => {
    const { fetchMock, send, end } = streamingBackend();
    renderExplain();
    const { user, panel } = await openPanel();

    await user.type(
      within(panel).getByRole("textbox", { name: "Or ask your own question" }),
      "  Is it safe at night?  ",
    );
    await user.click(within(panel).getByRole("button", { name: "Ask" }));
    send(sse({ type: "text", text: "The figures don't say." }));
    send(sse({ ...DONE, cached: true }));
    end();

    expect(
      await within(panel).findByText(
        "About 5,069 tokens: 5,036 sent and 33 written. Given again from memory.",
      ),
    ).toBeTruthy();
    expect(within(panel).getByText("Is it safe at night?")).toBeTruthy();
    expect(asked(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      question: "Is it safe at night?",
    });
  });

  it("warns of any number the answer has that the figures don't", async () => {
    const { send, end } = streamingBackend();
    renderExplain();
    const { user, panel } = await openPanel();

    await user.click(
      within(panel).getByRole("button", {
        name: "Why is this score what it is?",
      }),
    );
    send(sse({ type: "text", text: "The national average is 987,654." }));
    send(sse({ ...DONE, unverifiedNumbers: ["987,654"] }));
    end();

    expect(
      await within(panel).findByText(
        "Check this answer: 987,654 is not among the figures above, and an AI Explanation should use no other.",
      ),
    ).toBeTruthy();
  });

  it("says why an answer couldn't be finished", async () => {
    const { send, end } = streamingBackend();
    renderExplain();
    const { user, panel } = await openPanel();

    await user.click(
      within(panel).getByRole("button", {
        name: "Why is this score what it is?",
      }),
    );
    send(
      sse({
        type: "error",
        error: "Anthropic didn't answer. Try again shortly.",
      }),
    );
    end();

    expect((await within(panel).findByRole("alert")).textContent).toBe(
      "Anthropic didn't answer. Try again shortly.",
    );
  });

  it("gives the backend's message when it refuses the question", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            {
              error:
                "AI Explanations are off: ANTHROPIC_API_KEY is not set in .env.",
            },
            { status: 404 },
          ),
        ),
      ),
    );
    renderExplain();
    const { user, panel } = await openPanel();

    await user.click(
      within(panel).getByRole("button", {
        name: "Why is this score what it is?",
      }),
    );

    expect((await within(panel).findByRole("alert")).textContent).toBe(
      "AI Explanations are off: ANTHROPIC_API_KEY is not set in .env.",
    );
  });

  it("puts the answer away when the Search Area it was about changes", async () => {
    const { send, end } = streamingBackend();
    const { rerender } = renderExplain();
    const { user, panel } = await openPanel();
    await user.click(
      within(panel).getByRole("button", {
        name: "Why is this score what it is?",
      }),
    );
    send(sse({ type: "text", text: "Safety is 0." }));
    send(sse(DONE));
    end();
    expect(await within(panel).findByText("Safety is 0.")).toBeTruthy();

    rerender(
      <ExplainContext
        value={{ ...EXPLAINING, about: { ...EXPLAINING.about, radius: 1 } }}
      >
        <Explain subject={SAFETY} name="the Safety score" />
      </ExplainContext>,
    );

    expect(within(panel).queryByText("Safety is 0.")).toBeNull();
    expect(within(panel).queryByText(AI_EXPLANATION_LABEL)).toBeNull();
  });
});
