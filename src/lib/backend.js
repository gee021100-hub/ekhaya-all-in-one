// Cloud backend — Supabase auth + shared org state.
// The whole club dataset is stored as one jsonb row per org so every device
// sees the same data. localStorage remains an offline cache. This module is
// deliberately thin: App.jsx decides when to load/save.

import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://kwgdmyfxixftgpxwcyxx.supabase.co";

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_1G_FMP0oIoBx7Xmf2FR7UA_4HOCDpYG";

export const ORG_ID = "ekhaya";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Single snapshot of all app state, shape mirrors the backup export.
export function buildSnapshot(state) {
  const {
    staff, items, stockIn, stockOut, transfers, adjustments,
    staffEquipment, financeTx, vehicles, auditLog, notifications,
    counters, deptSeq, accounts, players, hostelResidents, attendanceLog,
    incidents, foodSchedule, trips, fuelLog, sponsors, risks, fixtures,
    appLog, lastBackupAt,
  } = state;
  return {
    version: import.meta.env.VITE_DATA_VERSION || "ekhaya-system-v6",
    exportedAt: new Date().toISOString(),
    data: {
      staff, items, stockIn, stockOut, transfers, adjustments,
      staffEquipment, financeTx, vehicles, auditLog, notifications,
      counters, deptSeq, accounts, players, hostelResidents, attendanceLog,
      incidents, foodSchedule, trips, fuelLog, sponsors, risks, fixtures,
      appLog, lastBackupAt,
    },
  };
}

// Fetch the org snapshot. Returns the full backup-shaped object or null if none yet.
export async function loadOrgState(orgId = ORG_ID) {
  const { data, error } = await supabase
    .from("app_state")
    .select("data")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`Cloud sync failed: ${error.message}`);
  return data ? data.data : null;
}

// Upsert the org snapshot.
export async function saveOrgState(snapshot, orgId = ORG_ID) {
  const { error } = await supabase
    .from("app_state")
    .upsert({ org_id: orgId, data: snapshot, updated_at: new Date().toISOString() }, {
      onConflict: "org_id",
    });
  if (error) throw new Error(`Cloud sync failed: ${error.message}`);
}

// Auth -------------------------------------------------------------
export async function cloudSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.user;
}

export async function cloudSignUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data.user;
}

export async function cloudSignOut() {
  await supabase.auth.signOut();
}

export async function cloudUpdatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange(cb);
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

export function isCloudConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}