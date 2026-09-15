import { describe, it, expect } from "vitest";
import {
  required, nonNegativeNumber, positiveInteger, date,
  isDuplicate, emailValid, enoughStock,
  validateFinanceTx, validateStockIn, validateStockOut, validateItem, validateStaff,
} from "../validation.js";

describe("basic validators", () => {
  it("required rejects empty", () => {
    expect(required("")).toBe(false);
    expect(required(null)).toBe(false);
    expect(required(undefined)).toBe(false);
    expect(required("   ")).toBe(false);
  });

  it("required accepts non-empty", () => {
    expect(required("x")).toBe(true);
    expect(required(0)).toBe(true);
  });

  it("nonNegativeNumber", () => {
    expect(nonNegativeNumber(0)).toBe(true);
    expect(nonNegativeNumber(5)).toBe(true);
    expect(nonNegativeNumber(-1)).toBe(false);
    expect(nonNegativeNumber(NaN)).toBe(false);
    expect(nonNegativeNumber("5")).toBe(false);
  });

  it("positiveInteger", () => {
    expect(positiveInteger(1)).toBe(true);
    expect(positiveInteger(0)).toBe(false);
    expect(positiveInteger(-1)).toBe(false);
    expect(positiveInteger(1.5)).toBe(false);
  });

  it("date", () => {
    expect(date("2026-01-01")).toBe(true);
    expect(date("not-a-date")).toBe(false);
    expect(date("")).toBe(false);
  });

  it("emailValid", () => {
    expect(emailValid("brian@ekhayafc.com")).toBe(true);
    expect(emailValid("bad")).toBe(false);
    expect(emailValid("a@b")).toBe(false);
  });

  it("isDuplicate", () => {
    const list = [{ code: "A" }, { code: "B" }];
    expect(isDuplicate(list, "code", "A")).toBe(true);
    expect(isDuplicate(list, "code", "C")).toBe(false);
    expect(isDuplicate(list, "code", "A", list[0])).toBe(false); // exclude self
  });

  it("enoughStock", () => {
    expect(enoughStock(10, 5)).toBe(true);
    expect(enoughStock(5, 5)).toBe(true);
    expect(enoughStock(4, 5)).toBe(false);
  });
});

describe("validateFinanceTx", () => {
  it("requires description and amount", () => {
    const errs = validateFinanceTx({ description: "", amount: -5, date: "" });
    expect(errs.length).toBe(3);
  });

  it("passes with valid data", () => {
    const errs = validateFinanceTx({ description: "Test", amount: 100, date: "2026-01-01" });
    expect(errs.length).toBe(0);
  });
});

describe("validateStockIn", () => {
  it("rejects quantity 0", () => {
    expect(validateStockIn({ quantity: 0, dateReceived: "2026-01-01" }).length).toBeGreaterThan(0);
  });

  it("accepts positive quantity", () => {
    expect(validateStockIn({ quantity: 5, dateReceived: "2026-01-01" }).length).toBe(0);
  });
});

describe("validateStockOut", () => {
  it("rejects negative quantity", () => {
    expect(validateStockOut({ quantity: -1 }).length).toBeGreaterThan(0);
  });

  it("accepts positive", () => {
    expect(validateStockOut({ quantity: 1 }).length).toBe(0);
  });
});

describe("validateItem", () => {
  const items = [{ id: 1, code: "TKT001", name: "Kit" }];

  it("requires code and name", () => {
    const errs = validateItem({ code: "", name: "", quantity: 0, min: 0, max: 0, unitCost: 0 }, items, null);
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects duplicate code", () => {
    const errs = validateItem({ code: "TKT001", name: "X", quantity: 0, min: 0, max: 0, unitCost: 0 }, items, null);
    expect(errs.some((e) => e.includes("already exists"))).toBe(true);
  });

  it("allows same code when editing", () => {
    const errs = validateItem({ code: "TKT001", name: "X", quantity: 0, min: 0, max: 0, unitCost: 0 }, items, 1);
    expect(errs.some((e) => e.includes("already exists"))).toBe(false);
  });
});

describe("validateStaff", () => {
  const staff = [{ code: "EKH-ADM-001", name: "Brian" }];

  it("requires name and title", () => {
    const errs = validateStaff({ name: "", title: "" }, staff, null);
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects duplicate name", () => {
    const errs = validateStaff({ name: "Brian", title: "Admin" }, staff, null);
    expect(errs.some((e) => e.includes("already exists"))).toBe(true);
  });

  it("allows same name when editing same staff", () => {
    const errs = validateStaff({ name: "Brian", title: "Admin" }, staff, "EKH-ADM-001");
    expect(errs.some((e) => e.includes("already exists"))).toBe(false);
  });
});