import type { SearchArea } from "@location-scout/shared";

import crimes202409 from "../sources/fixtures/police-ng17-1aa-2024-09.json" with { type: "json" };
import crimes202410 from "../sources/fixtures/police-ng17-1aa-2024-10.json" with { type: "json" };
import crimes202411 from "../sources/fixtures/police-ng17-1aa-2024-11.json" with { type: "json" };
import crimes202412 from "../sources/fixtures/police-ng17-1aa-2024-12.json" with { type: "json" };
import crimes202501 from "../sources/fixtures/police-ng17-1aa-2025-01.json" with { type: "json" };
import crimes202502 from "../sources/fixtures/police-ng17-1aa-2025-02.json" with { type: "json" };
import crimes202503 from "../sources/fixtures/police-ng17-1aa-2025-03.json" with { type: "json" };
import crimes202504 from "../sources/fixtures/police-ng17-1aa-2025-04.json" with { type: "json" };
import crimes202505 from "../sources/fixtures/police-ng17-1aa-2025-05.json" with { type: "json" };
import crimes202506 from "../sources/fixtures/police-ng17-1aa-2025-06.json" with { type: "json" };
import crimes202507 from "../sources/fixtures/police-ng17-1aa-2025-07.json" with { type: "json" };
import crimes202508 from "../sources/fixtures/police-ng17-1aa-2025-08.json" with { type: "json" };
import crimes202509 from "../sources/fixtures/police-ng17-1aa-2025-09.json" with { type: "json" };
import crimes202510 from "../sources/fixtures/police-ng17-1aa-2025-10.json" with { type: "json" };
import crimes202511 from "../sources/fixtures/police-ng17-1aa-2025-11.json" with { type: "json" };
import crimes202512 from "../sources/fixtures/police-ng17-1aa-2025-12.json" with { type: "json" };
import crimes202601 from "../sources/fixtures/police-ng17-1aa-2026-01.json" with { type: "json" };
import crimes202602 from "../sources/fixtures/police-ng17-1aa-2026-02.json" with { type: "json" };
import crimes202603 from "../sources/fixtures/police-ng17-1aa-2026-03.json" with { type: "json" };
import crimes202604 from "../sources/fixtures/police-ng17-1aa-2026-04.json" with { type: "json" };
import crimes202605 from "../sources/fixtures/police-ng17-1aa-2026-05.json" with { type: "json" };
import crimes202606 from "../sources/fixtures/police-ng17-1aa-2026-06.json" with { type: "json" };
import crimes202607 from "../sources/fixtures/police-ng17-1aa-2026-07.json" with { type: "json" };
import crimes202608 from "../sources/fixtures/police-ng17-1aa-2026-08.json" with { type: "json" };

/** NG17 1AA's 0.5 mile Search Area, for which data.police.uk was recorded. */
export const NG17_1AA_AREA: SearchArea = {
  location: { lat: 53.123664, lng: -1.264078 },
  searchRadius: { miles: 0.5, metres: 804.672 },
};

/**
 * data.police.uk's street-level crimes in NG17 1AA's 0.5 mile Search Area, as
 * recorded for each of the 24 months up to August 2026, the latest month that
 * `police-last-updated.json` names. Oldest first.
 */
export const NG17_1AA_CRIMES_BY_MONTH: ReadonlyMap<string, unknown> = new Map([
  ["2024-09", crimes202409],
  ["2024-10", crimes202410],
  ["2024-11", crimes202411],
  ["2024-12", crimes202412],
  ["2025-01", crimes202501],
  ["2025-02", crimes202502],
  ["2025-03", crimes202503],
  ["2025-04", crimes202504],
  ["2025-05", crimes202505],
  ["2025-06", crimes202506],
  ["2025-07", crimes202507],
  ["2025-08", crimes202508],
  ["2025-09", crimes202509],
  ["2025-10", crimes202510],
  ["2025-11", crimes202511],
  ["2025-12", crimes202512],
  ["2026-01", crimes202601],
  ["2026-02", crimes202602],
  ["2026-03", crimes202603],
  ["2026-04", crimes202604],
  ["2026-05", crimes202605],
  ["2026-06", crimes202606],
  ["2026-07", crimes202607],
  ["2026-08", crimes202608],
]);
