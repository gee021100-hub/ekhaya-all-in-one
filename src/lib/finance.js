// Pure finance aggregation helpers.

export function approvedIncome(transactions) {
  return transactions
    .filter((t) => t.type === "Income" && t.status === "Approved")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

export function approvedExpense(transactions) {
  return transactions
    .filter((t) => t.type === "Expense" && t.status === "Approved")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

export function approvedTransfer(transactions) {
  return transactions
    .filter((t) => t.type === "Transfer" && t.status === "Approved")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

export function pendingFinanceCount(transactions) {
  return transactions.filter((t) => t.status === "Pending").length;
}

export function netBalance(transactions) {
  return approvedIncome(transactions) - approvedExpense(transactions);
}