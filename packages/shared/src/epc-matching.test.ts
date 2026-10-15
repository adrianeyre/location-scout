import { describe, expect, it } from "vitest";

import {
  addressWords,
  certificateFor,
  latestCertificates,
  matchSale,
  type Certificate,
  type EpcSale,
} from "./epc-matching";

/** Made-up certificates in one made-up postcode, as the EPC register's search gives them. */
const certificate = (
  certificateNumber: string,
  uprn: string | null,
  addressLines: (string | null)[],
  registrationDate = "2020-01-01",
): Certificate => ({ certificateNumber, uprn, addressLines, registrationDate });

const POSTCODE: Certificate[] = [
  certificate("0001", "100001", ["12 High St.", "Sutton-in-Ashfield"]),
  certificate(
    "0002",
    "100001",
    ["12 High Street", "Sutton-in-Ashfield"],
    "2024-06-01",
  ),
  certificate("0003", "100002", ["Flat 2", "14 High Street"]),
  certificate("0004", "100003", ["Apartment 3, 14 High Street"]),
  certificate("0005", null, ["1st Floor Flat, 16 High Street"]),
  certificate("0006", "100005", ["Rose Cottage", "High Street"]),
  certificate("0007", "100006", ["Flat 12, 2 Mill Lane"]),
  certificate("0008", "100007", ["Flat 13, 2 Mill Lane"]),
];

const sale = (fields: Partial<EpcSale>): EpcSale => ({
  id: "{SALE}",
  date: "2026-07-15",
  postcode: "NG17 1AA",
  paon: "",
  saon: "",
  street: "HIGH STREET",
  uprn: null,
  ...fields,
});

describe("addressWords", () => {
  it("reads both sides' ways of writing a flat alike", () => {
    expect(addressWords(["Apartment 2, 12 High St."])).toBe("2 12 HIGH STREET");
    expect(addressWords(["FLAT 2", "12", "HIGH STREET"])).toBe(
      "2 12 HIGH STREET",
    );
    expect(addressWords(["1st Floor Flat", null, "16 High Street"])).toBe(
      "FIRST FLOOR 16 HIGH STREET",
    );
  });
});

describe("certificateFor", () => {
  const property = [
    certificate("old", "1", [], "2015-03-01"),
    certificate("new", "1", [], "2024-06-01"),
  ];

  it("takes the last certificate registered on or before the sale", () => {
    expect(certificateFor(property, "2026-07-15")?.certificateNumber).toBe(
      "new",
    );
    expect(certificateFor(property, "2020-01-01")?.certificateNumber).toBe(
      "old",
    );
    expect(certificateFor(property, "2024-06-01")?.certificateNumber).toBe(
      "new",
    );
  });

  it("takes the first one after it when none came before, as for a new build", () => {
    expect(certificateFor(property, "2010-01-01")?.certificateNumber).toBe(
      "old",
    );
  });
});

describe("latestCertificates", () => {
  it("takes each property's latest certificate, by UPRN or else by address", () => {
    expect(
      latestCertificates(POSTCODE).map(
        ({ certificateNumber }) => certificateNumber,
      ),
    ).toEqual(["0002", "0003", "0004", "0005", "0006", "0007", "0008"]);
  });

  it("counts a property without a UPRN once however often it was assessed", () => {
    expect(
      latestCertificates([
        certificate("a", null, ["9 Mill Lane"], "2013-01-01"),
        certificate("b", null, ["9 MILL LANE"], "2023-01-01"),
        certificate("c", null, ["11 Mill Lane"], "2019-01-01"),
      ]).map(({ certificateNumber }) => certificateNumber),
    ).toEqual(["b", "c"]);
  });

  it("finds none among none", () => {
    expect(latestCertificates([])).toEqual([]);
  });
});

describe("matchSale", () => {
  it("matches by UPRN first, to the certificate current at the sale", () => {
    expect(matchSale(sale({ paon: "99", uprn: "100001" }), POSTCODE)).toEqual({
      step: "uprn",
      properties: 1,
      certificate: POSTCODE[1],
    });
  });

  it("falls back to the address when the sale's UPRN has no certificate here", () => {
    expect(matchSale(sale({ paon: "12", uprn: "999999" }), POSTCODE).step).toBe(
      "address",
    );
  });

  it("matches a house by its number and street, written either way", () => {
    const match = matchSale(sale({ paon: "12" }), POSTCODE);
    expect(match.step).toBe("address");
    expect(match.certificate?.certificateNumber).toBe("0002");
  });

  it("matches a flat by its flat, building and street", () => {
    expect(
      matchSale(sale({ saon: "FLAT 2", paon: "14" }), POSTCODE).certificate
        ?.certificateNumber,
    ).toBe("0003");
    expect(
      matchSale(sale({ saon: "3", paon: "14" }), POSTCODE).certificate
        ?.certificateNumber,
    ).toBe("0004");
    expect(
      matchSale(sale({ saon: "FIRST FLOOR FLAT", paon: "16" }), POSTCODE)
        .certificate?.certificateNumber,
    ).toBe("0005");
  });

  it("matches a named house", () => {
    expect(
      matchSale(sale({ paon: "ROSE COTTAGE" }), POSTCODE).certificate
        ?.certificateNumber,
    ).toBe("0006");
  });

  it("doesn't take a flat's number for a house's", () => {
    expect(matchSale(sale({ paon: "2" }), POSTCODE).certificate).toBeNull();
    expect(matchSale(sale({ paon: "4" }), POSTCODE)).toEqual({
      step: null,
      properties: 0,
      certificate: null,
    });
  });

  it("matches the building without the street when the street is written differently", () => {
    expect(
      matchSale(sale({ saon: "FLAT 12", paon: "2", street: "MILL ROAD" }), [
        ...POSTCODE,
      ]),
    ).toEqual({ step: "building", properties: 1, certificate: POSTCODE[6] });
  });

  it("leaves a sale ambiguous when a step finds more than one property", () => {
    expect(
      matchSale(sale({ paon: "2", street: "MILL LANE" }), POSTCODE),
    ).toEqual({ step: "address", properties: 2, certificate: null });
  });

  it("matches nothing where the postcode has no certificates", () => {
    expect(matchSale(sale({ paon: "12" }), [])).toEqual({
      step: null,
      properties: 0,
      certificate: null,
    });
  });
});
