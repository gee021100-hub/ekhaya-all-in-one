import { describe, it, expect } from "vitest";
import { approvedIncome, approvedExpense, approvedTransfer, pendingFinanceCount, netBalance } from "../finance.js";

const tx = [
  { type: "Income", status: "Approved", amount: 100 },
  { type: "Income", status: "Pending", amount: 200 },
  { type: "Income", status: "Deleted", amount: 50 },
  { type: "Expense", status: "Approved", amount: 60 },
  { type: "Expense", status: "Pending", amount: 30 },
  { type: "Transfer", status: "Approved", amount: 150 },
];

describe("finance aggregation", () => {
  it("approvedIncome excludes Pending and Deleted", () => {
    expect(approvedIncome(tx)).toBe(100);
  });

  it("approvedExpense excludes Pending", () => {
    expect(approvedExpense(tx)).toBe(60);
  });

  it("approvedTransfer sums only Approved Transfers", () => {
    expect(approvedTransfer(tx)).toBe(150);
  });

  it("pendingFinanceCount counts only Pending", () => {
    expect(pendingFinanceCount(tx)).toBe(2);
  });

  it("netBalance is income - expense (approved only)", () => {
    expect(netBalance(tx)).toBe(40);
  });

  it("handles empty array", () => {
    expect(approvedIncome([])).toBe(0);
    expect(approvedExpense([])).toBe(0);
    expect(approvedTransfer([])).toBe(0);
    expect(pendingFinanceCount([])).toBe(0);
    expect(netBalance([])).toBe(0);
  });

  it("handles non-numeric amount gracefully", () => {
    const bad = [{ type: "Income", status: "Approved", amount: "not-a-number" }];
    expect(approvedIncome(bad)).toBe(0);
  });
});