import { LAND_OPPORTUNITY_WORDING } from "@location-scout/shared";

/**
 * A stub of Anthropic's Messages API, so AI Explanations are tested with a
 * stubbed model and nothing reaches Anthropic (PRD NFR-3.2, NFR-3.3). It
 * streams as Anthropic does, as server-sent events, an answer made from
 * the question it is asked, a part at a time.
 */

/** The key the stub answers to, refusing any other as Anthropic would. */
export const TEST_ANTHROPIC_API_KEY = "sk-ant-test-location-scout";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** How long the stub takes over each part of its answer, so it is seen streaming. */
export const STUB_PART_MS = 1500;

/** A question the stub answers with a number it was never given. */
export const MADE_UP_NUMBER_QUESTION =
  "How does this compare with the national average?";

/** The figure the stub makes up for it. */
export const MADE_UP_NUMBER = "987,654";

const QUESTION_PREFIX = "The question: ";

/**
 * The stub's answer to what it was sent, in the parts it streams: what it
 * was asked, then, where its instructions require it, the Land
 * Opportunities' wording (PRD FR-5.7). Asked `MADE_UP_NUMBER_QUESTION`, it
 * makes up a figure, as a model told not to might.
 */
export const stubAnswer = (system: string, user: string): string[] => {
  const question = user.slice(
    user.lastIndexOf(QUESTION_PREFIX) + QUESTION_PREFIX.length,
  );
  return [
    `The stubbed model was asked "${question}". `,
    "It writes its answer a part at a time, ",
    question === MADE_UP_NUMBER_QUESTION
      ? `and makes up a national average of ${MADE_UP_NUMBER}.`
      : "from the figures above alone.",
    ...(system.includes(LAND_OPPORTUNITY_WORDING)
      ? [`\n\n${LAND_OPPORTUNITY_WORDING}`]
      : []),
  ];
};

/** Roughly how many tokens some text is: about 4 characters a token. */
const tokensIn = (text: string) => Math.ceil(text.length / 4);

const sse = (event: { type: string } & Record<string, unknown>) =>
  new TextEncoder().encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );

const wait = (ms: number, signal: AbortSignal | null | undefined) =>
  new Promise<void>((resolve, reject) => {
    if (ms === 0) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    });
  });

interface MessagesRequest {
  model: string;
  system: string;
  messages: { role: string; content: string }[];
}

const isMessagesRequest = (value: unknown): value is MessagesRequest =>
  typeof value === "object" &&
  value !== null &&
  "model" in value &&
  typeof value.model === "string" &&
  "system" in value &&
  typeof value.system === "string" &&
  "messages" in value &&
  Array.isArray(value.messages);

/**
 * Anthropic's answer to a request to the Messages API, or `undefined` for
 * any other URL. It answers only `apiKey`, with `401` as Anthropic does for
 * any other, and takes `partMs` over each part.
 */
export const stubAnthropic = (
  url: string,
  init: RequestInit | undefined,
  { apiKey = TEST_ANTHROPIC_API_KEY, partMs = STUB_PART_MS } = {},
): Response | undefined => {
  if (!url.startsWith(ANTHROPIC_MESSAGES_URL)) return undefined;
  if (new Headers(init?.headers).get("x-api-key") !== apiKey) {
    return Response.json(
      {
        type: "error",
        error: { type: "authentication_error", message: "invalid x-api-key" },
      },
      { status: 401 },
    );
  }
  const request: unknown =
    typeof init?.body === "string" ? JSON.parse(init.body) : null;
  if (!isMessagesRequest(request)) {
    return Response.json(
      {
        type: "error",
        error: { type: "invalid_request_error", message: "Not a message." },
      },
      { status: 400 },
    );
  }
  const user = request.messages.map(({ content }) => content).join("\n");
  const parts = stubAnswer(request.system, user);
  const usage = {
    input_tokens: tokensIn(request.system + user),
    output_tokens: tokensIn(parts.join("")),
  };
  const signal = init?.signal;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        sse({
          type: "message_start",
          message: {
            id: "msg_stub",
            type: "message",
            role: "assistant",
            model: request.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: usage.input_tokens, output_tokens: 1 },
          },
        }),
      );
      controller.enqueue(
        sse({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        }),
      );
      try {
        for (const [index, text] of parts.entries()) {
          if (index > 0) await wait(partMs, signal);
          controller.enqueue(
            sse({
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text },
            }),
          );
        }
      } catch (error) {
        controller.error(error);
        return;
      }
      controller.enqueue(sse({ type: "content_block_stop", index: 0 }));
      controller.enqueue(
        sse({
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: usage.output_tokens },
        }),
      );
      controller.enqueue(sse({ type: "message_stop" }));
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
};
