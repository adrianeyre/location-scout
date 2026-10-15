import { fileURLToPath } from "node:url";

/** The git-ignored `data/` folder at the repository root (PRD FR-6.2, FR-6.6). */
export const DATA_DIR = fileURLToPath(
  new URL("../../../data/", import.meta.url),
);
