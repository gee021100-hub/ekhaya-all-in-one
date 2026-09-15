import { describe, it, expect } from "vitest";
import { calculateAge, remainingMonths, monthsBetween, todayISO } from "../dates.js";

describe("calculateAge", () => {
  it("returns null for missing input", () => {
    expect(calculateAge(null)).toBeNull();
    expect(calculateAge("")).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(calculateAge("not-a-date")).toBeNull();
  });

  it("returns correct age for known date", () => {
    // someone born 2000-01-01 should be 25 or 26 depending on current date
    const age = calculateAge("2000-01-01");
    expect(typeof age).toBe("number");
    expect(age).toBeGreaterThanOrEqual(25);
    expect(age).toBeLessThanOrEqual(27);
  });
});

describe("monthsBetween", () => {
  it("returns null for missing", () => {
    expect(monthsBetween(null, "2026-01-01")).toBeNull();
  });

  it("returns positive for future date", () => {
    const m = monthsBetween("2026-01-01", "2026-07-01");
    expect(m).toBe(6);
  });

  it("returns negative for past date", () => {
    const m = monthsBetween("2026-07-01", "2026-01-01");
    expect(m).toBe(-6);
  });

  it("same month returns 0", () => {
    expect(monthsBetween("2026-01-01", "2026-01-15")).toBe(0);
  });
});

describe("remainingMonths", () => {
  it("returns 0 for past date", () => {
    expect(remainingMonths("2020-01-01")).toBe(0);
  });

  it("returns positive for future date", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 12);
    expect(remainingMonths(future.toISOString().slice(0, 10))).toBeGreaterThanOrEqual(11);
  });
});

describe("todayISO", () => {
  it("returns YYYY-MM-DD format", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});