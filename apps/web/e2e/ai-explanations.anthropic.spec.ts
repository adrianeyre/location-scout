import type { Locator, Page } from "@playwright/test";

import {
  AI_EXPLANATION_LABEL,
  LAND_OPPORTUNITY_WORDING,
} from "@location-scout/shared";

import { expect, test } from "./fixtures";

/*
 * AI Explanations (PRD §6.9, NFR-3.2), against an API started with
 * `ANTHROPIC_API_KEY`, whose model is a stub: nothing reaches Anthropic. It
 * streams its answer in three parts, 1.5 s apart, saying what it was asked,
 * and repeats the Land Opportunity wording when its instructions require it.
 * Asked "How does this compare with the national average?", it makes up a
 * figure, 987,654, as a model told not to might.
 */

const NG17_1AA = "/?lat=53.123664&lng=-1.264078&radius=0.5";
const SUTTON_PARKWAY = "/?lat=53.1145&lng=-1.246&radius=0.25";

const overview = (page: Page) =>
  page.getByRole("complementary", { name: "Location Overview" });

/** The answer the stub writes, a part at a time. */
const stubAnswer = (question: string) => [
  `The stubbed model was asked "${question}".`,
  `The stubbed model was asked "${question}". It writes its answer a part at a time, from the figures above alone.`,
];

/** The AI Explanation of `name`, once its Explain button has opened it. */
const explain = async (within: Locator | Page, name: string) => {
  await within.getByRole("button", { name: `Explain ${name}` }).click();
  return within.getByRole("region", { name: `AI Explanation of ${name}` });
};

const answerIn = (panel: Locator) => panel.locator(".explain-answer");

test("the Location Overview's Explain button asks the Scout Mode's questions, streams the answer as it is written under its label, gives its tokens, and gives it again from memory", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  await expect(overview(page)).toContainText("Sutton Central & New Cross");

  const panel = await explain(overview(page), "the Location Overview");
  await expect(
    panel.getByRole("list", { name: "Questions to ask" }).getByRole("button"),
  ).toHaveText([
    "What is it like here?",
    "What are the biggest risks here?",
    "What stands out most in these figures?",
  ]);
  await expect(panel).toContainText(
    "claude-sonnet-5-5 explains the figures above in plain English.",
  );

  const question = "What are the biggest risks here?";
  await panel.getByRole("button", { name: question }).click();

  // Streaming: the first part, while the rest is still being written.
  const answer = answerIn(panel);
  await expect(answer.locator(".explain-label")).toHaveText(
    AI_EXPLANATION_LABEL,
  );
  await expect(answer.locator(".explain-question")).toHaveText(question);
  const [firstPart, whole] = stubAnswer(question);
  // Checked often: the first part shows only until the next, 1.5 s later,
  // and an assertion's own retries can wait a second between looks.
  await expect(async () => {
    const shown = await answer.locator(".explain-text").textContent();
    expect(shown?.trim()).toBe(firstPart?.trim());
  }).toPass({ intervals: [50], timeout: 10_000 });
  await expect(answer.getByText("Writing…")).toBeVisible();
  await expect(answer).toHaveAttribute("aria-busy", "true");

  // Then the whole of it, and what it took.
  await expect(answer.locator(".explain-text")).toHaveText(whole ?? "");
  await expect(answer.getByText("Writing…")).toHaveCount(0);
  await expect(answer.locator(".explain-usage")).toHaveText(
    /^About [\d,]+ tokens: [\d,]+ sent and 33 written\.$/,
  );
  await expect(answer).toHaveAttribute("aria-busy", "false");

  // The same question about the same figures costs nothing more.
  await panel.getByRole("button", { name: question }).click();
  await expect(answer.locator(".explain-usage")).toHaveText(
    /^About [\d,]+ tokens: [\d,]+ sent and 33 written\. Given again from memory\.$/,
  );
  await expect(answer.locator(".explain-text")).toHaveText(whole ?? "");
});

test("a Category Score's Explain button answers the user's own question about it, and the Overview's offers the Scout Mode's own question first", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  const safety = overview(page)
    .locator("details")
    .filter({
      has: page.locator("summary .score-name", { hasText: "Safety" }),
    });
  await safety.locator("summary").click();

  const panel = await explain(safety, "the Safety score");
  await expect(
    panel.getByRole("list", { name: "Questions to ask" }).getByRole("button"),
  ).toHaveText([
    "Why is this score what it is?",
    "Which input counts most in this score?",
    "How much does this score count in the Location Score?",
  ]);
  await panel
    .getByRole("textbox", { name: "Or ask your own question" })
    .fill("Is it safe at night?");
  await panel.getByRole("button", { name: "Ask" }).click();

  await expect(answerIn(panel).locator(".explain-text")).toHaveText(
    stubAnswer("Is it safe at night?")[1] ?? "",
  );
  await expect(answerIn(panel).locator(".explain-label")).toHaveText(
    AI_EXPLANATION_LABEL,
  );

  await page
    .getByRole("combobox", { name: "Scout Mode" })
    .selectOption("business-cafe");
  const cafe = await explain(overview(page), "the Location Overview");
  await expect(
    cafe
      .getByRole("list", { name: "Questions to ask" })
      .getByRole("button")
      .first(),
  ).toHaveText("Could I open a café here?");
});

test("a Land Opportunity's Explain button answers with the wording every Land view carries", async ({
  page,
}) => {
  await page.goto(`${SUTTON_PARKWAY}&mode=development`);
  await page.getByRole("tab", { name: "Land" }).click();
  const landPanel = page.getByRole("complementary", {
    name: "Land Opportunities",
  });
  await landPanel.getByRole("button", { name: /^48\.2 acres/ }).click();
  const chosen = landPanel.getByRole("region", {
    name: "Land Opportunity: 48.2 acres (19.5 ha)",
  });

  const panel = await explain(chosen, "this Land Opportunity");
  await panel
    .getByRole("button", { name: "What should I check before pursuing it?" })
    .click();

  const text = answerIn(panel).locator(".explain-text");
  await expect(text).toContainText(LAND_OPPORTUNITY_WORDING);
  await expect(text).toContainText(
    'The stubbed model was asked "What should I check before pursuing it?".',
  );
  await expect(answerIn(panel).locator(".explain-usage")).toBeVisible();
});

test("an answer with a number the figures don't have is flagged", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  await expect(overview(page)).toContainText("Sutton Central & New Cross");
  const panel = await explain(overview(page), "the Location Overview");

  await panel
    .getByRole("textbox", { name: "Or ask your own question" })
    .fill("How does this compare with the national average?");
  await panel.getByRole("button", { name: "Ask" }).click();

  await expect(answerIn(panel).locator(".explain-text")).toContainText(
    "makes up a national average of 987,654.",
  );
  await expect(answerIn(panel).locator(".explain-unverified")).toHaveText(
    "Check this answer: 987,654 is not among the figures above, and an AI Explanation should use no other.",
  );
});
