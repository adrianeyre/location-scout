import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { PanelSheet } from "./PanelSheet";

afterEach(cleanup);

const show = (revealKey: unknown = null) => (
  <PanelSheet revealKey={revealKey} head={<h2>Tabs</h2>}>
    <p>Body</p>
  </PanelSheet>
);

const panel = () => document.getElementById("side-panel");

describe("PanelSheet", () => {
  it("hides, leaving the whole map, and shows again, keeping focus on its button", async () => {
    const user = userEvent.setup();
    render(show());

    await user.click(screen.getByRole("button", { name: "Hide panel" }));

    expect(panel()?.hidden).toBe(true);
    const again = screen.getByRole("button", { name: "Show panel" });
    expect(again.getAttribute("aria-expanded")).toBe("false");
    expect(again.getAttribute("aria-controls")).toBe("side-panel");

    await user.click(again);

    expect(panel()?.hidden).toBe(false);
    expect(screen.queryByRole("button", { name: "Show panel" })).toBeNull();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("steps a phone's sheet up a size each time its handle is pressed, without dragging", async () => {
    const user = userEvent.setup();
    render(show());
    expect(panel()?.dataset.size).toBe("half");

    await user.click(
      screen.getByRole("button", { name: "Panel half raised. Raise it" }),
    );
    expect(panel()?.dataset.size).toBe("full");

    screen
      .getByRole("button", { name: "Panel fully raised. Lower it" })
      .focus();
    await user.keyboard("{Enter}");
    expect(panel()?.dataset.size).toBe("peek");
    expect(
      screen.getByRole("button", { name: "Panel lowered. Raise it" }),
    ).toBeTruthy();
  });

  it("comes back into view when there is something new to show", async () => {
    const user = userEvent.setup();
    const { rerender } = render(show("first"));
    await user.click(
      screen.getByRole("button", { name: "Panel half raised. Raise it" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Panel fully raised. Lower it" }),
    );
    expect(panel()?.dataset.size).toBe("peek");
    await user.click(screen.getByRole("button", { name: "Hide panel" }));

    rerender(show("second"));

    expect(panel()?.hidden).toBe(false);
    expect(panel()?.dataset.size).toBe("half");
  });
});
