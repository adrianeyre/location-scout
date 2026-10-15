import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayerToggles } from "./LayerToggles";

afterEach(cleanup);

describe("LayerToggles", () => {
  it("folds away to leave the map clear, and unfolds again", async () => {
    const user = userEvent.setup();
    render(<LayerToggles hidden={[]} layers={null} onShow={vi.fn()} />);
    const layers = screen.getByRole("group", { name: "Layers" });
    expect(
      within(layers).getByRole("checkbox", { name: "Crime" }),
    ).toBeTruthy();

    const fold = within(layers).getByRole("button", {
      name: "Hide the Layers",
    });
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    await user.click(fold);

    expect(
      within(layers).queryByRole("checkbox", { name: "Crime" }),
    ).toBeNull();
    const unfold = within(layers).getByRole("button", {
      name: "Show the Layers",
    });
    expect(unfold.getAttribute("aria-expanded")).toBe("false");
    await user.click(unfold);

    expect(
      within(layers).getByRole("checkbox", { name: "Crime" }),
    ).toBeTruthy();
  });
});
