import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { APPEARANCE_STORAGE_KEY } from "../theme/appearance";
import { THEMES } from "../theme/themes";
import { SettingsButton } from "./SettingsButton";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.mode;
});

const openSettings = async () => {
  const user = userEvent.setup();
  render(<SettingsButton />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  return { user, dialog: screen.getByRole("dialog", { name: "Settings" }) };
};

describe("SettingsButton", () => {
  it("opens Settings with the three modes and six themes", async () => {
    const { dialog } = await openSettings();
    const mode = within(dialog).getByRole("group", { name: "Mode" });
    expect(
      within(mode)
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent),
    ).toEqual(["Light", "Dark", "System"]);
    expect(within(mode).getByRole("radio", { name: "System" })).toHaveProperty(
      "checked",
      true,
    );
    const theme = within(dialog).getByRole("group", { name: "Theme" });
    expect(within(theme).getAllByRole("radio")).toHaveLength(THEMES.length);
    expect(within(theme).getByRole("radio", { name: "Scout" })).toHaveProperty(
      "checked",
      true,
    );
  });

  it("lists each theme's contrast ratios", async () => {
    const { dialog } = await openSettings();
    const highContrast = within(dialog).getByRole("radio", {
      name: "High contrast",
    });
    // Described by its details, whose text ratio is black on white.
    expect(highContrast.getAttribute("aria-describedby")).toBeTruthy();
    const details = document.getElementById(
      highContrast.getAttribute("aria-describedby") ?? "",
    );
    expect(details?.textContent).toContain("Text21:1");
  });

  it("applies and keeps the mode and theme chosen", async () => {
    const { user, dialog } = await openSettings();
    await user.click(within(dialog).getByRole("radio", { name: "Dark" }));
    await user.click(within(dialog).getByRole("radio", { name: "Forest" }));

    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("forest");
    expect(
      JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "null"),
    ).toEqual({ mode: "dark", theme: "forest" });
  });

  it("closes with Done, which stays put under the body", async () => {
    const { user, dialog } = await openSettings();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("falls back to the defaults when what was kept is not valid", async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ mode: "sepia", theme: "nope" }),
    );
    const { dialog } = await openSettings();
    expect(
      within(dialog).getByRole("radio", { name: "System" }),
    ).toHaveProperty("checked", true);
    expect(within(dialog).getByRole("radio", { name: "Scout" })).toHaveProperty(
      "checked",
      true,
    );
  });
});
