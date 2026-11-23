import { describe, it, expect } from "vitest";
import { filterTransactionsByHash } from "@/utils/format";

// Hashes chosen so each targeted substring appears in exactly ONE entry
// (or deliberately in two, where a test expects two hits).
const TX_A = { hash: "aaaa1111000000000000000000000000000000000000000000000000aaaa1111" };
const TX_B = { hash: "bbbb2222000000000000000000000000000000000000000000000000bbbb2222" };
// TX_C deliberately shares the leading "0000" run with the others for an overlap test
const TX_C = { hash: "cccc3333000000000000000000000000000000000000000000000000cccc3333" };
const ALL = [TX_A, TX_B, TX_C];

describe("filterTransactionsByHash", () => {
  it("returns all transactions when query is empty", () => {
    expect(filterTransactionsByHash(ALL, "")).toEqual(ALL);
  });

  it("returns all transactions when query is only whitespace", () => {
    expect(filterTransactionsByHash(ALL, "   ")).toEqual(ALL);
  });

  it("matches a full hash exactly", () => {
    expect(filterTransactionsByHash(ALL, TX_A.hash)).toEqual([TX_A]);
  });

  it("matches a unique prefix of the hash", () => {
    // "aaaa1111" only exists in TX_A
    expect(filterTransactionsByHash(ALL, "aaaa1111")).toEqual([TX_A]);
  });

  it("matches a unique suffix of the hash", () => {
    // "bbbb2222" only exists in TX_B
    expect(filterTransactionsByHash(ALL, "bbbb2222")).toEqual([TX_B]);
  });

  it("matches a substring that appears in multiple hashes", () => {
    // "cccc3333" only exists in TX_C — but "0000" prefix appears in all three
    const result = filterTransactionsByHash(ALL, "0000");
    expect(result).toHaveLength(3);
  });

  it("is case-insensitive — uppercase query matches lowercase hash chars", () => {
    expect(filterTransactionsByHash(ALL, "AAAA1111")).toEqual([TX_A]);
  });

  it("is case-insensitive — mixed-case query matches", () => {
    expect(filterTransactionsByHash(ALL, "AaAa1111")).toEqual([TX_A]);
  });

  it("returns empty array when no hash matches", () => {
    expect(filterTransactionsByHash(ALL, "xxxxxxxx")).toEqual([]);
  });

  it("trims leading/trailing whitespace from the query", () => {
    expect(filterTransactionsByHash(ALL, `  ${TX_B.hash}  `)).toEqual([TX_B]);
  });

  it("returns empty array when transaction list is empty", () => {
    expect(filterTransactionsByHash([], "aaaa1111")).toEqual([]);
  });

  it("preserves original array order in results", () => {
    // All three share "0000" — order must be [TX_A, TX_B, TX_C]
    const result = filterTransactionsByHash(ALL, "0000");
    expect(result[0]).toBe(TX_A);
    expect(result[1]).toBe(TX_B);
    expect(result[2]).toBe(TX_C);
  });
});
