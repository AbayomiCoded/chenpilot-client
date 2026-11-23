import { describe, it, expect } from "vitest";
import {
  formatAddress,
  formatTokenAmount,
  formatLargeNumber,
  formatFileSize,
  capitalize,
  toTitleCase,
  truncateText,
  formatRelativeTime,
  formatExactTime,
} from "../format";

// #141 — table-driven tests for format utils.
// All tests assume fixed TZ/UTC and en-US locale via vitest config.

describe("formatAddress", () => {
  const cases: Array<[string, number, number, string, string]> = [
    // [input, startChars, endChars, expected, name]
    ["GABCDEF12345678901234567890123456789012345678901234567890", 6, 4, "GABCDE...7890", "typical address"],
    ["GABC", 6, 4, "GABC", "short address unchanged"],
    ["", 6, 4, "", "empty string passes through"],
    ["GABCDEF12", 6, 4, "GABCDEF12", "address length exactly startChars+endChars-1 unchanged"],
    ["GABCDEF1234", 6, 4, "GABCDEF1234", "address length exactly startChars+endChars unchanged"],
    ["GABCDEF12345", 6, 4, "GABCDE...2345", "address length startChars+endChars+1 truncated"],
  ];
  for (const [input, start, end, expected, name] of cases) {
    it(`${name} (${input.length} chars)`, () => {
      expect(formatAddress(input, start, end)).toBe(expected);
    });
  }

  it("uses defaults startChars=6, endChars=4 when omitted", () => {
    const addr = "GABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789AB";
    expect(formatAddress(addr)).toBe("GABCDE...89AB");
  });
});

describe("formatTokenAmount", () => {
  const cases: Array<[string | number, number, string | undefined, string, string]> = [
    ["123.456789", 4, undefined, "123.4568", "string amount trimmed to 4 decimals"],
    [123.456789, 2, undefined, "123.46", "number amount trimmed to 2 decimals"],
    ["0.0001", 4, undefined, "0.0001", "small amount preserved"],
    [0, 4, undefined, "0", "zero"],
    ["not a number", 4, undefined, "0", "NaN string returns 0"],
    ["1000", 0, "XLM", "1000 XLM", "with token symbol"],
    [1.5, 2, "USDC", "1.5 USDC", "with token symbol and trimming"],
  ];
  for (const [amount, decimals, sym, expected, name] of cases) {
    it(`${name}`, () => {
      expect(formatTokenAmount(amount, decimals, sym)).toBe(expected);
    });
  }
});

describe("formatLargeNumber", () => {
  const cases: Array<[number, number, string, string]> = [
    [999, 1, "999", "hundreds — no suffix"],
    [1000, 1, "1.0K", "thousand boundary"],
    [1500, 2, "1.50K", "thousand with 2 decimals"],
    [1_000_000, 1, "1.0M", "million boundary"],
    [2_500_000, 2, "2.50M", "million with 2 decimals"],
    [1_000_000_000, 1, "1.0B", "billion boundary"],
    [0, 1, "0", "zero"],
    [-5, 1, "-5", "negative (no suffix)"],
  ];
  for (const [num, decimals, expected, name] of cases) {
    it(`${name} (n=${num}, decimals=${decimals})`, () => {
      expect(formatLargeNumber(num, decimals)).toBe(expected);
    });
  }
});

describe("formatFileSize", () => {
  const cases: Array<[number, number, string, string]> = [
    [0, 2, "0 Bytes", "zero bytes"],
    [500, 2, "500 Bytes", "sub-KB"],
    [1024, 2, "1 KB", "exactly 1 KB"],
    [1536, 2, "1.5 KB", "1.5 KB"],
    [1_048_576, 2, "1 MB", "exactly 1 MB"],
    [1_572_864, 1, "1.5 MB", "1.5 MB"],
    [1_073_741_824, 2, "1 GB", "exactly 1 GB"],
  ];
  for (const [bytes, decimals, expected, name] of cases) {
    it(`${name} (${bytes} bytes, decimals=${decimals})`, () => {
      expect(formatFileSize(bytes, decimals)).toBe(expected);
    });
  }
});

describe("capitalize", () => {
  const cases: Array<[string, string, string]> = [
    ["hello", "Hello", "lowercase first letter"],
    ["HELLO", "Hello", "uppercase rest lowered"],
    ["hELLO", "Hello", "mixed case"],
    ["", "", "empty string"],
    ["a", "A", "single char"],
    ["ABC DEF", "Abc def", "with space"],
  ];
  for (const [input, expected, name] of cases) {
    it(`${name}: "${input}"`, () => {
      expect(capitalize(input)).toBe(expected);
    });
  }
});

describe("toTitleCase", () => {
  const cases: Array<[string, string, string]> = [
    ["hello world", "Hello World", "two words"],
    ["HELLO WORLD", "Hello World", "uppercase to title"],
    ["", "", "empty"],
    ["a", "A", "single char"],
    ["the quick brown fox", "The Quick Brown Fox", "long sentence"],
  ];
  for (const [input, expected, name] of cases) {
    it(`${name}: "${input}"`, () => {
      expect(toTitleCase(input)).toBe(expected);
    });
  }
});

describe("truncateText", () => {
  const cases: Array<[string, number, string | undefined, string, string]> = [
    ["hello", 10, undefined, "hello", "no truncation needed"],
    ["hello world", 8, undefined, "hello...", "default suffix"],
    ["hello world", 8, ">", "hello >", "custom suffix"],
    ["hello world", 11, "...", "hello world", "exact length no truncation"],
    ["", 5, "...", "", "empty input"],
  ];
  for (const [input, max, suffix, expected, name] of cases) {
    it(`${name}: max=${max}`, () => {
      expect(truncateText(input, max, suffix)).toBe(expected);
    });
  }
});

// Deterministic "now" anchor used across timestamp tests.
const NOW = new Date('2024-06-15T12:00:00.000Z');

describe("formatRelativeTime", () => {
  const cases: Array<[string, string, string]> = [
    // [input offset description, ISO offset from NOW, expected output]
    ["30 seconds ago", "2024-06-15T11:59:30.000Z", "Just now"],
    ["1 minute ago", "2024-06-15T11:59:00.000Z", "1 minute ago"],
    ["5 minutes ago", "2024-06-15T11:55:00.000Z", "5 minutes ago"],
    ["1 hour ago", "2024-06-15T11:00:00.000Z", "1 hour ago"],
    ["3 hours ago", "2024-06-15T09:00:00.000Z", "3 hours ago"],
    ["1 day ago", "2024-06-14T12:00:00.000Z", "1 day ago"],
    ["6 days ago", "2024-06-09T12:00:00.000Z", "6 days ago"],
    ["1 week ago", "2024-06-08T12:00:00.000Z", "1 week ago"],
    ["3 weeks ago", "2024-05-25T12:00:00.000Z", "3 weeks ago"],
  ];

  for (const [name, isoInput, expected] of cases) {
    it(name, () => {
      expect(formatRelativeTime(isoInput, NOW)).toBe(expected);
    });
  }

  it("falls back to formatted date for dates older than 4 weeks", () => {
    const old = "2024-05-01T12:00:00.000Z";
    const result = formatRelativeTime(old, NOW);
    // Should be a readable date string, not a relative label
    expect(result).toMatch(/May/);
    expect(result).toMatch(/2024/);
  });

  it("accepts a Date object as input", () => {
    const d = new Date("2024-06-15T11:58:00.000Z"); // 2 minutes before NOW
    expect(formatRelativeTime(d, NOW)).toBe("2 minutes ago");
  });
});

describe("formatExactTime", () => {
  const INPUT = "2024-06-15T09:30:45.000Z";

  it("returns the ISO string unchanged", () => {
    const { iso } = formatExactTime(INPUT);
    expect(iso).toBe(new Date(INPUT).toISOString());
  });

  it("label contains the year, month, day, and time components", () => {
    const { label } = formatExactTime(INPUT, "en-US");
    expect(label).toMatch(/2024/);
    expect(label).toMatch(/Jun/);
    expect(label).toMatch(/15/);
  });

  it("label includes a timezone name", () => {
    const { label } = formatExactTime(INPUT, "en-US");
    // timezone abbreviation like UTC, GMT, or an offset
    expect(label).toMatch(/UTC|GMT|[+-]\d/);
  });

  it("accepts a Date object as input", () => {
    const d = new Date(INPUT);
    const { iso } = formatExactTime(d);
    expect(iso).toBe(d.toISOString());
  });
});
