// Auth & authorization: PBKDF2 password hashing, session tokens, RBAC matrix.
// Pure logic — no React. Passwords are never stored in plain text.

import { pbkdf2Sha256 } from "./sha256.js";

export const ROLES = ["SUPERADMIN", "CEO", "ADMIN", "FINANCE", "INVENTORY", "FLEET", "MARKETING", "HOSTEL", "COACHING", "TEAM", "STAFF"];

const ITERATIONS = 150000;
const KEY_LEN = 32;

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hashPassword(password) {
  const salt = randomHex(16);
  return { salt, iterations: ITERATIONS, hash: pbkdf2Sha256(password, salt, ITERATIONS, KEY_LEN) };
}

export function verifyPassword(password, record) {
  const { salt, iterations, hash } = record;
  if (!salt || !iterations || !hash) return false;
  const computed = pbkdf2Sha256(password, salt, iterations, KEY_LEN);
  let diff = 0;
  if (computed.length !== hash.length) return false;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

// Sessions ---------------------------------------------------------------
export function createSession(account, remember = false) {
  const issuedAt = Date.now();
  const ttl = remember ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000; // 30d or 8h
  return {
    token: randomHex(32),
    accountCode: account.code,
    name: account.name,
    email: account.email,
    role: account.role,
    dept: account.dept,
    staffCode: account.staffCode,
    issuedAt,
    expiresAt: issuedAt + ttl,
    remember,
  };
}

export function sessionValid(session) {
  return !!session && typeof session.expiresAt === "number" && session.expiresAt > Date.now();
}

// RBAC --------------------------------------------------------------------
// Department modules are locked to Executive access only (SUPERADMIN + CEO).
// Non-executive roles can still sign in and see the Dashboard & Notifications,
// but they cannot open any department module.
export const MODULE_PERMISSIONS = {
  dashboard: ["SUPERADMIN", "CEO", "ADMIN", "FINANCE", "INVENTORY", "FLEET", "MARKETING", "HOSTEL", "COACHING", "TEAM", "STAFF"],
  administration: ["SUPERADMIN", "CEO"],
  finance: ["SUPERADMIN", "CEO"],
  marketing: ["SUPERADMIN", "CEO"],
  fleet: ["SUPERADMIN", "CEO"],
  team: ["SUPERADMIN", "CEO"],
  inventory: ["SUPERADMIN", "CEO"],
  staffequipment: ["SUPERADMIN", "CEO"],
  players: ["SUPERADMIN", "CEO"],
  hostel: ["SUPERADMIN", "CEO"],
  matchday: ["SUPERADMIN", "CEO"],
  reports: ["SUPERADMIN", "CEO"],
  notifications: ["SUPERADMIN", "CEO", "ADMIN", "FINANCE", "INVENTORY", "FLEET", "MARKETING", "HOSTEL", "COACHING", "TEAM", "STAFF"],
  audit: ["SUPERADMIN", "CEO"],
  superadmin: ["SUPERADMIN"],
};

export function canAccess(account, module) {
  if (!account) return false;
  const roles = MODULE_PERMISSIONS[module];
  if (!roles) return false;
  return roles.includes(account.role);
}

export function canViewDept(account, _dept) {
  if (!account) return false;
  if (account.role === "SUPERADMIN" || account.role === "CEO") return true;
  return false;
}

export function canDelete(account) {
  return !!account && (account.role === "SUPERADMIN" || account.role === "CEO");
}

export function canSeeSalaries(account) {
  return !!account && ["SUPERADMIN", "CEO"].includes(account.role);
}

export function canActAs(account) {
  return !!account && ["SUPERADMIN", "CEO"].includes(account.role);
}

export function canApprove(account, creatorCode) {
  return !!account && ["SUPERADMIN", "CEO"].includes(account.role) && account.staffCode !== creatorCode;
}

// Account bootstrap --------------------------------------------------------
// Maps the legacy human-readable staff roles to the auth roles above.
export function normalizeRole(legacyRole) {
  const map = {
    "Superadmin": "SUPERADMIN",
    "CEO": "CEO",
    "Administrator": "ADMIN",
    "Finance Officer": "FINANCE",
    "Inventory Officer": "INVENTORY",
    "Fleet Officer": "FLEET",
    "Marketing Officer": "MARKETING",
    "Hostel Warden": "HOSTEL",
    "Coach": "COACHING",
    "Head Coach": "COACHING",
    "Team Manager": "TEAM",
    "Staff": "STAFF",
  };
  return map[legacyRole] || "STAFF";
}