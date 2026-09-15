import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, createSession, sessionValid, canAccess, canViewDept, canDelete, canSeeSalaries, canActAs, canApprove, normalizeRole } from "../auth.js";

describe("password hashing", () => {
  it("hashPassword returns salt, iterations, hash", () => {
    const h = hashPassword("test123");
    expect(h).toHaveProperty("salt");
    expect(h).toHaveProperty("iterations");
    expect(h).toHaveProperty("hash");
    expect(h.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(h.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.iterations).toBe(150000);
  });

  it("verifyPassword succeeds with correct password", () => {
    const h = hashPassword("Ekhaya@2026");
    expect(verifyPassword("Ekhaya@2026", h)).toBe(true);
  });

  it("verifyPassword fails with wrong password", () => {
    const h = hashPassword("Ekhaya@2026");
    expect(verifyPassword("WrongPassword", h)).toBe(false);
  });

  it("verifyPassword fails with empty string", () => {
    const h = hashPassword("Ekhaya@2026");
    expect(verifyPassword("", h)).toBe(false);
  });

  it("verifyPassword returns false for incomplete record", () => {
    expect(verifyPassword("x", {})).toBe(false);
    expect(verifyPassword("x", { salt: "", iterations: 0, hash: "" })).toBe(false);
  });

  it("same password produces different hashes (different salts)", () => {
    const a = hashPassword("same");
    const b = hashPassword("same");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(verifyPassword("same", a)).toBe(true);
    expect(verifyPassword("same", b)).toBe(true);
  });
});

describe("sessions", () => {
  it("createSession returns valid structure", () => {
    const s = createSession({ code: "ACC-1", staffCode: "EKH-1", name: "Test", email: "t@t.com", role: "SUPERADMIN", dept: "ADM" }, false);
    expect(s).toHaveProperty("token");
    expect(s.token).toHaveLength(64);
    expect(s.accountCode).toBe("ACC-1");
    expect(s.expiresAt).toBeGreaterThan(Date.now());
  });

  it("sessionValid returns true for valid session", () => {
    const s = createSession({ code: "ACC-1", staffCode: "EKH-1", name: "T", email: "t@t.com", role: "ADMIN", dept: "ADM" }, false);
    expect(sessionValid(s)).toBe(true);
  });

  it("sessionValid returns false for expired session", () => {
    const s = { expiresAt: Date.now() - 1000 };
    expect(sessionValid(s)).toBe(false);
  });

  it("sessionValid returns false for null/undefined", () => {
    expect(sessionValid(null)).toBe(false);
    expect(sessionValid(undefined)).toBe(false);
  });

  it("remember sessions last 30 days", () => {
    const s = createSession({ code: "ACC-1", staffCode: "EKH-1", name: "T", email: "t@t.com", role: "ADMIN", dept: "ADM" }, true);
    const ttlDays = (s.expiresAt - s.issuedAt) / (1000 * 60 * 60 * 24);
    expect(ttlDays).toBeCloseTo(30, 0);
  });
});

describe("RBAC canAccess", () => {
  const mk = (role, dept) => ({ code: "X", staffCode: "S", name: "N", email: "e@e.com", role, dept, active: true });

  it("SUPERADMIN can access everything", () => {
    const a = mk("SUPERADMIN", "ADM");
    ["dashboard", "administration", "finance", "marketing", "fleet", "team", "inventory", "players", "hostel", "matchday", "reports", "notifications", "audit", "superadmin"].forEach((m) => {
      expect(canAccess(a, m)).toBe(true);
    });
  });

  it("FINANCE cannot access inventory", () => {
    expect(canAccess(mk("FINANCE", "FIN"), "inventory")).toBe(false);
  });

  it("FINANCE can access finance", () => {
    expect(canAccess(mk("FINANCE", "FIN"), "finance")).toBe(true);
  });

  it("STAFF can access dashboard", () => {
    expect(canAccess(mk("STAFF", "INV"), "dashboard")).toBe(true);
  });

  it("STAFF cannot access superadmin", () => {
    expect(canAccess(mk("STAFF", "INV"), "superadmin")).toBe(false);
  });

  it("TEAM can access players", () => {
    expect(canAccess(mk("TEAM", "SEN"), "players")).toBe(true);
  });

  it("HOSTEL can access hostel", () => {
    expect(canAccess(mk("HOSTEL", "ADM"), "hostel")).toBe(true);
  });

  it("INVENTORY can access staffequipment", () => {
    expect(canAccess(mk("INVENTORY", "INV"), "staffequipment")).toBe(true);
  });

  it("CEO can access fleet", () => {
    expect(canAccess(mk("CEO", "ADM"), "fleet")).toBe(true);
  });

  it("returns false for unknown module", () => {
    expect(canAccess(mk("CEO", "ADM"), "nonexistent")).toBe(false);
  });

  it("returns false for null account", () => {
    expect(canAccess(null, "dashboard")).toBe(false);
  });
});

describe("canViewDept", () => {
  it("SUPERADMIN sees all", () => {
    expect(canViewDept({ role: "SUPERADMIN", dept: "ADM" }, "FIN")).toBe(true);
  });

  it("CEO sees all", () => {
    expect(canViewDept({ role: "CEO", dept: "ADM" }, "FIN")).toBe(true);
  });

  it("FINANCE cannot see INVENTORY", () => {
    expect(canViewDept({ role: "FINANCE", dept: "FIN" }, "INV")).toBe(false);
  });

  it("FINANCE can see FIN", () => {
    expect(canViewDept({ role: "FINANCE", dept: "FIN" }, "FIN")).toBe(true);
  });

  it("returns false for null", () => {
    expect(canViewDept(null, "FIN")).toBe(false);
  });
});

describe("permission helpers", () => {
  const sup = { role: "SUPERADMIN" };
  const ceo = { role: "CEO" };
  const fin = { role: "FINANCE" };
  const staff = { role: "STAFF" };

  it("canDelete: only SUPERADMIN/CEO", () => {
    expect(canDelete(sup)).toBe(true);
    expect(canDelete(ceo)).toBe(true);
    expect(canDelete(fin)).toBe(false);
    expect(canDelete(staff)).toBe(false);
    expect(canDelete(null)).toBe(false);
  });

  it("canSeeSalaries: SUPERADMIN/CEO/FINANCE", () => {
    expect(canSeeSalaries(sup)).toBe(true);
    expect(canSeeSalaries(ceo)).toBe(true);
    expect(canSeeSalaries(fin)).toBe(true);
    expect(canSeeSalaries(staff)).toBe(false);
  });

  it("canActAs: SUPERADMIN/CEO only", () => {
    expect(canActAs(sup)).toBe(true);
    expect(canActAs(ceo)).toBe(true);
    expect(canActAs(fin)).toBe(false);
  });

  it("canApprove: different person, not STAFF", () => {
    expect(canApprove({ staffCode: "A", role: "ADMIN" }, "B")).toBe(true);
    expect(canApprove({ staffCode: "A", role: "STAFF" }, "B")).toBe(false);
    expect(canApprove({ staffCode: "A", role: "FINANCE" }, "A")).toBe(false); // self
  });
});

describe("normalizeRole", () => {
  it("maps Superadmin", () => expect(normalizeRole("Superadmin")).toBe("SUPERADMIN"));
  it("maps Team Manager", () => expect(normalizeRole("Team Manager")).toBe("TEAM"));
  it("maps unknown to STAFF", () => expect(normalizeRole("Unknown Role")).toBe("STAFF"));
});
