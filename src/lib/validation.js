// Pure validation helpers used by drawers and mutation handlers.

export function required(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

export function nonNegativeNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

export function positiveInteger(n) {
  return Number.isInteger(n) && n > 0;
}

export function date(v) {
  return required(v) && !isNaN(new Date(v).getTime());
}

export function isDuplicate(list, field, value, exclude = null) {
  return list.some((r) => {
    if (String(r[field]).toLowerCase() !== String(value).toLowerCase()) return false;
    if (String(r[field]) === "") return false;
    if (exclude !== null && r.id !== undefined && exclude === r.id) return false;
    if (exclude !== null && typeof exclude === "object" && r === exclude) return false;
    if (exclude !== null && r[field] === undefined && r === exclude) return false;
    return true;
  });
}

export function emailValid(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}

export function enoughStock(onHand, requested) {
  return Number(onHand) >= Math.abs(Number(requested));
}

export function validateFinanceTx(tx) {
  const errors = [];
  if (!required(tx.description)) errors.push("Description is required");
  if (!nonNegativeNumber(Number(tx.amount))) errors.push("Amount must be a non-negative number");
  if (!date(tx.date)) errors.push("Enter a valid date");
  return errors;
}

export function validateStockIn(form) {
  const errors = [];
  if (!positiveInteger(Number(form.quantity))) errors.push("Quantity must be a positive whole number");
  if (!date(form.dateReceived)) errors.push("Enter a valid date");
  return errors;
}

export function validateStockOut(form) {
  const errors = [];
  if (!positiveInteger(Number(form.quantity))) errors.push("Quantity must be a positive whole number");
  return errors;
}

export function validateItem(form, items, editingId) {
  const errors = [];
  if (!required(form.code)) errors.push("Item code is required");
  else if (isDuplicate(items, "code", form.code, editingId ?? null)) errors.push(`Item code ${form.code} already exists`);
  if (!required(form.name)) errors.push("Name is required");
  if (!nonNegativeNumber(Number(form.quantity))) errors.push("Quantity cannot be negative");
  if (!nonNegativeNumber(Number(form.min)) || !nonNegativeNumber(Number(form.max))) errors.push("Min/Max must be non-negative");
  if ("unitCost" in form && !nonNegativeNumber(Number(form.unitCost))) errors.push("Unit cost cannot be negative");
  return errors;
}

export function validateStaff(form, staffList, editingCode) {
  const errors = [];
  if (!required(form.name)) errors.push("Name is required");
  if (!required(form.title)) errors.push("Job title is required");
  if (isDuplicate(staffList, "name", form.name, staffList.find((s) => s.code === editingCode) ?? null)) errors.push("A staff member with this name already exists");
  return errors;
}