import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { SOURCE_CREDITS } from "./attribution";
import { Footer } from "./Footer";

afterEach(cleanup);

describe("Footer", () => {
  it("credits OpenStreetMap, police.uk, HM Land Registry, planning.data.gov.uk and Ordnance Survey, with their licences (PRD FR-10.1)", () => {
    render(<Footer />);
    const credit = screen.getByRole("contentinfo").querySelector("p");
    expect(credit?.textContent).toBe(
      "© OpenStreetMap contributors (ODbL). police.uk, HM Land Registry and planning.data.gov.uk data under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right.",
    );
    expect(
      within(credit as HTMLElement)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["OpenStreetMap contributors", "https://www.openstreetmap.org/copyright"],
      ["ODbL", "https://opendatacommons.org/licenses/odbl/"],
      [
        "Open Government Licence v3.0",
        "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      ],
    ]);
  });

  it("lists every Data Source with its credit in a dialog", async () => {
    const user = userEvent.setup();
    render(<Footer />);
    await user.click(
      screen.getByRole("button", { name: "Data sources and licences" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Data sources and licences",
    });
    expect(
      within(dialog)
        .getAllByRole("term")
        .map(({ textContent }) => textContent),
    ).toEqual(SOURCE_CREDITS.map(({ name }) => name));
    expect(within(dialog).getByText(/^Crime data from/).textContent).toBe(
      "Crime data from police.uk, licensed under the Open Government Licence v3.0.",
    );
    expect(
      within(dialog).getByRole("link", { name: "HistoricEngland.org.uk" }),
    ).toBeTruthy();
  });

  it("credits the design, gives the version and lists the policies", () => {
    render(<Footer />);
    const nav = screen.getByRole("navigation", { name: "About this site" });
    expect(
      within(nav).getByRole("link", { name: /Website design/ }),
    ).toHaveProperty("target", "_blank");
    expect(within(nav).getByText(/^Version: /)).toBeTruthy();
    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Data sources and licences",
      "Privacy Policy",
      "Terms and Conditions",
      "Cookie Policy",
      "Accessibility",
    ]);
  });

  it.each([
    ["Data sources and licences", "Close data sources and licences"],
    ["Privacy Policy", "Close privacy policy"],
    ["Terms and Conditions", "Close terms and conditions"],
    ["Cookie Policy", "Close cookie policy"],
    ["Accessibility", "Close accessibility statement"],
  ])(
    "opens %s in a dialog, closed by its cross, handing focus back",
    async (name, closeLabel) => {
      const user = userEvent.setup();
      render(<Footer />);
      const opener = screen.getByRole("button", { name });
      await user.click(opener);

      const dialog = screen.getByRole("dialog", { name });
      const close = within(dialog).getByRole("button", { name: closeLabel });
      expect(document.activeElement).toBe(close);
      // The body is its own scrolling region, reachable by keyboard.
      expect(
        within(dialog).getByRole("region", { name }).getAttribute("tabindex"),
      ).toBe("0");

      await user.click(close);
      expect(screen.queryByRole("dialog", { name })).toBeNull();
      expect(document.activeElement).toBe(opener);
    },
  );

  it("closes a dialog with Escape", async () => {
    const user = userEvent.setup();
    render(<Footer />);
    await user.click(screen.getByRole("button", { name: "Cookie Policy" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Cookie Policy" })).toBeNull();
  });
});
