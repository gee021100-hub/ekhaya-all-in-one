import React, { useState, useEffect, useRef, useMemo, useCallback, Component } from "react";
import {
  Package, Bell, ClipboardList, LayoutGrid, X, Paperclip,
  Plus, Building2, Wallet, Megaphone, Truck, Laptop, BarChart2, Settings, Shield, Pencil, Trash2,
  LogOut, KeyRound, AlertTriangle, Download, Upload, UserPlus, Shirt, Home, CalendarDays
} from "lucide-react";
import { hashPassword, verifyPassword, createSession, sessionValid, canAccess, canDelete, canSeeSalaries, canActAs, canApprove, canViewDept, ROLES, MODULE_PERMISSIONS } from "./lib/auth.js";
import { calculateAge, remainingMonths, todayISO } from "./lib/dates.js";
import { enoughStock, validateFinanceTx, validateStockIn, validateStockOut, validateItem, validateStaff, required, positiveInteger, nonNegativeNumber, emailValid, date as isValidDate } from "./lib/validation.js";
import { approvedIncome, approvedExpense, approvedTransfer, pendingFinanceCount } from "./lib/finance.js";
import { appendEntry, verifyChain, smartLog } from "./lib/audit.js";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: "Inter, sans-serif", background: "#faf6ec", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 40, maxWidth: 500, textAlign: "center", border: `2px solid #c9982e` }}>
            <AlertTriangle size={36} color="#c9982e" style={{ marginBottom: 16 }} />
            <h2 style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, margin: "0 0 12px", color: "#15140f" }}>Something went wrong</h2>
            <p style={{ fontSize: 13.5, color: "#6b6552", marginTop: 0 }}>The page encountered an unexpected error. Your recent changes are saved in the browser's local storage.</p>
            <p style={{ fontSize: 12, color: "#948d76", background: "#faf6ec", borderRadius: 6, padding: 12, fontFamily: "monospace" }}>
              {String(this.state.error?.message || this.state.error)}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
              <button onClick={() => window.location.reload()} style={{ background: "#c9982e", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>Reload page</button>
              <button onClick={() => { try { clearPersisted(); } catch {} window.location.reload(); }} style={{ background: "transparent", border: `1px solid #a3403b`, color: "#a3403b", padding: "9px 18px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>Reset to seed data</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Seeded superadmin credentials (hashed with PBKDF2-SHA256, 150k iterations).
// Default password for all seeded accounts: Ekhaya@2026 — forced to change on first login.
const SEED_ACCOUNTS = [
  {
    code: "ACC-SUP-001", staffCode: "EKH-SUP-001", name: "Brian Kayamba", email: "brian@ekhayafc.com",
    role: "SUPERADMIN", dept: "ADM", active: true, mustChangePassword: true,
    salt: "06b257c9f4228efbbb3e59ebd4242616", iterations: 150000,
    hash: "3394231e476436c46c897ae7cda588c42bc741fca0115ac45b991834a8b53d56",
  },
  {
    code: "ACC-SEN-001", staffCode: "EKH-SEN-001", name: "Davie Kamanga", email: "davie@ekhayafc.com",
    role: "TEAM", dept: "SEN", active: true, mustChangePassword: true,
    salt: "e5a3f119c42f77bd24ccea0c8fa123e9", iterations: 150000,
    hash: "a1f7c9d4a86e5b2ea41d93f8c6b54d017e2b30fa83c9a665d4f1b8c29e07a6d3",
  },
  {
    code: "ACC-WOM-001", staffCode: "EKH-WOM-001", name: "Linda Tembo", email: "linda@ekhayafc.com",
    role: "TEAM", dept: "WOM", active: true, mustChangePassword: true,
    salt: "f41cd6a3b2e57890d1c44def7a2b8c9e", iterations: 150000,
    hash: "b67d2e81c453a90f17c6d84b5e29fa03d8c1a6e7b45f0c2d9a806e3f14b57c9d",
  },
];

// ---------------------------------------------------------------
// Design tokens (Ekhaya FC — ink & gold)
// ---------------------------------------------------------------
const T = {
  ink: "#15140f",
  gold: "#c9982e",
  goldSoft: "#e8cf8f",
  cream: "#faf6ec",
  paper: "#ffffff",
  line: "#e7dfc9",
  text: "#221f18",
  good: "#3f6b3f",
  bad: "#a3403b",
  pending: "#a9791f",
};

const fontImport = `
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/inter-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/inter-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('/fonts/inter-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Oswald';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/oswald-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Oswald';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('/fonts/oswald-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Oswald';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/oswald-latin.woff2') format('woff2');
}
`;

// ---------------------------------------------------------------
// Reference data (structure only — not business records)
// ---------------------------------------------------------------
const seedDepartments = [
  { id: 1, code: "INV", name: "Inventory" },
  { id: 2, code: "FIN", name: "Finance" },
  { id: 3, code: "ADM", name: "Administration" },
  { id: 4, code: "SEN", name: "Senior Team" },
  { id: 5, code: "MKT", name: "Marketing" },
  { id: 6, code: "FLT", name: "Fleet" },
  { id: 7, code: "WOM", name: "Women's Team" },
  { id: 8, code: "RES", name: "Reserve Team" },
  { id: 9, code: "YTH", name: "Youth Team" },
  { id: 10, code: "HOS", name: "Hostel" },
];

const seedRoles = ["Inventory Officer", "Finance Officer", "Administrator", "Team Manager", "CEO", "Superadmin"];

const seedLocations = [
  { id: 1, name: "Senior Team Store" },
  { id: 2, name: "Reserve Team Store" },
  { id: 3, name: "Main Warehouse" },
  { id: 4, name: "Board Members Store" },
  { id: 5, name: "Secretariate Store" },
  { id: 6, name: "Sponsors Store" },
];

// Four club teams: code prefix, display name, manager staff code, and the
// Inventory store their equipment lives in. Senior and Reserve have their
// own dedicated store from the imported stock count; Women's and Youth
// don't have a separate store in that data yet, so they draw from the
// shared Main Warehouse until they get one.
const seedTeams = [
  { code: "EKH-SEN", name: "Senior Team", dept: "SEN", managerCode: "EKH-SEN-001", location: "Senior Team Store" },
  { code: "EKH-WOM", name: "Women's Team", dept: "WOM", managerCode: "EKH-WOM-001", location: "Main Warehouse" },
  { code: "EKH-RES", name: "Reserve Team", dept: "RES", managerCode: "EKH-RES-001", location: "Reserve Team Store" },
  { code: "EKH-YTH", name: "Youth Team", dept: "YTH", managerCode: "EKH-YTH-001", location: "Main Warehouse" },
];

// ---------------------------------------------------------------
// Real data: Superadmin account, team managers, and the imported item
// catalog from EFC_-_Inventory_movements_update.xlsx (Summary sheet,
// 284 unique item codes, balances as at 10 Sep 2026).
// ---------------------------------------------------------------
const seedStaff = [
  { id: 1, code: "EKH-SUP-001", name: "Brian Kayamba", dept: "ADM", role: "Superadmin", title: "System Administrator", status: "Active", startDate: new Date().toISOString().slice(0, 10) },
  { id: 2, code: "EKH-SEN-001", name: "Davie Kamanga", dept: "SEN", role: "Team Manager", title: "Team Manager", status: "Active", startDate: new Date().toISOString().slice(0, 10) },
  { id: 3, code: "EKH-WOM-001", name: "Linda Tembo", dept: "WOM", role: "Team Manager", title: "Team Manager", status: "Active", startDate: new Date().toISOString().slice(0, 10) },
  { id: 4, code: "EKH-HOS-001", name: "Emmanuel Kadzuwa", dept: "HOS", role: "Hostel Warden", title: "Hostel Warden — Thyolo", status: "Active", startDate: "2024-01-01" },
  { id: 5, code: "EKH-HOS-002", name: "Brian Maonga", dept: "HOS", role: "Hostel Staff", title: "Hostel Staff — Blantyre", status: "Active", startDate: "2024-01-01" },
  { id: 6, code: "EKH-HOS-003", name: "Peter Majanga", dept: "HOS", role: "Hostel Staff", title: "Hostel Staff — Blantyre", status: "Active", startDate: "2024-01-01" },
  { id: 7, code: "EKH-BRD-001", name: "Fadar Bwaila", dept: "ADM", role: "Board Member", title: "Board Member / Executive", status: "Active", startDate: "2024-01-01" },
  { id: 8, code: "EKH-FLT-001", name: "N. Celos", dept: "FLT", role: "Fleet Officer", title: "Fleet Officer / Driver", status: "Active", startDate: "2024-01-01" },
  { id: 9, code: "EKH-FIN-001", name: "Finance Officer", dept: "FIN", role: "Finance Officer", title: "Finance Officer", status: "Active", startDate: "2024-01-01" },
  { id: 10, code: "EKH-RES-001", name: "Reserve Team Manager", dept: "RES", role: "Team Manager", title: "Reserve Team Manager", status: "Active", startDate: "2024-01-01" },
  { id: 11, code: "EKH-YTH-001", name: "Youth Team Manager", dept: "YTH", role: "Team Manager", title: "Youth Team Manager", status: "Active", startDate: "2024-01-01" },
];

const seedHostels = [
  { id: 1, code: "HSE-001", name: "Main House (Reserve)", location: "Ekhaya Grounds", warden: "House Mother" },
  { id: 2, code: "HSE-002", name: "House 3 (Youth)", location: "Ekhaya Grounds", warden: "House Parent" },
];

const seedFoodSchedule = [
  { day: "Monday", breakfast: "Tea, nsima, beans", lunch: "Rice, chicken stew, salad", supper: "Nsima, fish, vegetables" },
  { day: "Tuesday", breakfast: "Tea, bread, margarine", lunch: "Nsima, beef, greens", supper: "Rice, gizzard stew, relish" },
  { day: "Wednesday", breakfast: "Tea, porridge", lunch: "Rice, fish, tomatoes", supper: "Nsima, soya pieces, veg" },
  { day: "Thursday", breakfast: "Tea, scones", lunch: "Nsima, chicken, pumpkin leaves", supper: "Rice, beans, cabbage" },
  { day: "Friday", breakfast: "Tea, bread, eggs", lunch: "Rice, beef, greens", supper: "Nsima, fish, relish" },
  { day: "Saturday", breakfast: "Tea, buns", lunch: "Nsima, chicken stew, veg", supper: "Rice, beans, salad" },
  { day: "Sunday", breakfast: "Tea, chapati, egg", lunch: "Nsima, mixed grill, greens", supper: "Rice, fish stew, veg" },
];

// ---------------------------------------------------------------
// Real data: Players, Hostel Residents, and Fleet Vehicles
// (sourced from Ekhaya FC official records — September 2026)
// ---------------------------------------------------------------
const seedPlayers = [
  // ── Senior Team (22) ──────────────────────────────────────────
  { shirtNo: 1, name: "Happy Mphepo", dob: "2006-01-02", position: "Defender", team: "Senior Team", contractStart: "2025-01-30", contractEnd: "2027-01-30", salary: 0, status: "Active" },
  { shirtNo: 2, name: "Andrew Lameck", dob: "2004-12-25", position: "Defender", team: "Senior Team", contractStart: "2025-03-10", contractEnd: "2028-02-09", salary: 0, status: "Active" },
  { shirtNo: 3, name: "Amos Sande", dob: "2007-03-03", position: "", team: "Senior Team", contractStart: "2025-02-04", contractEnd: "2029-02-03", salary: 0, status: "Active" },
  { shirtNo: 4, name: "Blessings Malinda", dob: "2003-04-21", position: "", team: "Senior Team", contractStart: "2025-08-01", contractEnd: "2028-07-31", salary: 0, status: "Active" },
  { shirtNo: 5, name: "Hadji James", dob: "2004-12-01", position: "Striker", team: "Senior Team", contractStart: "2025-02-01", contractEnd: "2028-02-01", salary: 0, status: "Active" },
  { shirtNo: 6, name: "Alfred Chizinga", dob: "1998-02-04", position: "Midfielder", team: "Senior Team", contractStart: "2026-03-01", contractEnd: "2028-03-28", salary: 0, status: "Active" },
  { shirtNo: 7, name: "Helmas Masinja", dob: "1998-02-04", position: "Midfielder", team: "Senior Team", contractStart: "2025-02-01", contractEnd: "2028-02-01", salary: 0, status: "Active" },
  { shirtNo: 8, name: "Joseph Saiwa", dob: "2004-08-26", position: "Defender", team: "Senior Team", contractStart: "2025-08-01", contractEnd: "2028-07-31", salary: 0, status: "Active" },
  { shirtNo: 9, name: "Lucky Tiztola", dob: "", position: "", team: "Senior Team", salary: 0, status: "Active" },
  { shirtNo: 10, name: "Player #10 (Name not visible)", dob: "2005-05-09", position: "", team: "Senior Team", salary: 0, status: "Active" },
  { shirtNo: 11, name: "Moses Banda", dob: "2006-02-19", position: "Striker", team: "Senior Team", contractStart: "2025-02-01", contractEnd: "2028-02-01", salary: 0, status: "Active" },
  { shirtNo: 12, name: "Charles Mahati", dob: "2003-06-11", position: "Defender", team: "Senior Team", contractStart: "2025-01-29", contractEnd: "2027-01-29", salary: 0, status: "Active" },
  { shirtNo: 13, name: "Joshua Waka", dob: "2004-04-28", position: "Striker", team: "Senior Team", contractStart: "2025-03-24", contractEnd: "2028-03-25", salary: 0, status: "Active" },
  { shirtNo: 14, name: "Samuel Rukura", dob: "2004-06-06", position: "Midfielder", team: "Senior Team", contractStart: "2025-08-18", contractEnd: "2028-07-17", salary: 0, status: "Active" },
  { shirtNo: 15, name: "Gift Chunga", dob: "2000-09-17", position: "Midfielder", team: "Senior Team", contractStart: "2025-07-01", contractEnd: "2029-06-30", salary: 0, status: "Active" },
  { shirtNo: 16, name: "Joseph Macdonald", dob: "2000-08-22", position: "Midfielder", team: "Senior Team", contractStart: "2026-01-01", contractEnd: "2028-01-31", salary: 0, status: "Active" },
  { shirtNo: 17, name: "Alick Lungu", dob: "2002-03-24", position: "Goalkeeper", team: "Senior Team", contractStart: "2025-01-05", contractEnd: "2029-01-31", salary: 0, status: "Active" },
  { shirtNo: 18, name: "Wongani Kapondya", dob: "2003-03-29", position: "Midfielder", team: "Senior Team", contractStart: "2025-08-01", contractEnd: "2027-12-31", salary: 0, status: "Active" },
  { shirtNo: 19, name: "Allen Chihana", dob: "2002-11-06", position: "Defender", team: "Senior Team", contractStart: "2025-04-01", contractEnd: "2028-03-31", salary: 0, status: "Active" },
  { shirtNo: 20, name: "James Stambuli", dob: "2006-08-05", position: "Midfielder", team: "Senior Team", contractStart: "2026-03-01", contractEnd: "2028-01-28", salary: 0, status: "Active" },
  { shirtNo: 21, name: "Gift Mangola", dob: "2000-01-01", position: "Defender", team: "Senior Team", contractStart: "2025-02-01", contractEnd: "2029-02-28", salary: 0, status: "Active" },
  { shirtNo: 22, name: "Levison Mnyenyembe", dob: "2005-12-13", position: "Defender", team: "Senior Team", contractStart: "2025-04-01", contractEnd: "2028-03-31", salary: 0, status: "Active" },
  // ── Reserve / Men Team (35) ──────────────────────────────────
  { shirtNo: 1, name: "Alex Juma", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 2, name: "Arthur Chidaya", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 3, name: "Blessings Mofolo", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 4, name: "Christopher Chulu", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 5, name: "Blessings Mathyola", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 6, name: "Dalison Yawanda", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 7, name: "Davie Chinkwanda", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 8, name: "Davie Maganga", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 9, name: "Dennis Kachale", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 10, name: "Dominic Kayamba", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 11, name: "Edmand Mapulanga", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 12, name: "Fatsani Juwawo", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 13, name: "Francis Chimbayo", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 14, name: "Francis Nkonda", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 15, name: "Garnet Kamwambe", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 16, name: "Hastings Malinda", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 17, name: "James Msongole", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 18, name: "Jeff Chinyama", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 19, name: "Keneth Mwale", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 20, name: "Limbani Kutambe", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 21, name: "Maxwell Sakanamba", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 22, name: "Overton Zuze", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 23, name: "Patrick Dominic", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 24, name: "Peter Kasiya", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 25, name: "Precious Manjawira", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 26, name: "Rafael Iman", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 27, name: "Rex Chikaya", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 28, name: "Samson Zakeyu", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 29, name: "Tamandani Damiano", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 30, name: "William Manda", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 31, name: "Yohane Jim", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 32, name: "Yusuf Nantunga", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 33, name: "Madalitso Munde", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 34, name: "Luciano Fanuel", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  { shirtNo: 35, name: "Innocent Munga", dob: "", position: "", team: "Reserve Team", salary: 0, status: "Active" },
  // ── Women Team (26) ──────────────────────────────────────────
  { shirtNo: 36, name: "Evelyn Lloyd", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 37, name: "Rosette Madaluma", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 38, name: "Fortune Bwatu Bwatu", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 39, name: "Precious Mwaliando", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 40, name: "Catherine Mthambo", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 41, name: "Nizra Carlos", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 42, name: "Eliza Muswa", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 43, name: "Temwa Issa", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 44, name: "Sina John", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 45, name: "Tupokwe Mbisa", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 46, name: "Thandi Bilima", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 47, name: "Rabeca Mwale", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 48, name: "Eunice Moses", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 49, name: "Hope Chikumba", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 50, name: "Miriam Dafter", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 51, name: "Agness Jonathan", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 52, name: "Wonderful Jenala", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 53, name: "Esther Mhamgo", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 54, name: "Stella Chinkusa", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 55, name: "Eneless Fabiano", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 56, name: "Alepha Msonda", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 57, name: "Scholastica Chakalamba", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 58, name: "Kettie Munthali", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 59, name: "Merisha Memba", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 60, name: "Fatuma Zokomeza", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  { shirtNo: 61, name: "Joyce Kaira", dob: "", position: "", team: "Women's Team", salary: 0, status: "Active" },
  // ── Youth Team (25) ──────────────────────────────────────────
  { shirtNo: 62, name: "Tweneyosi Kachere", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 63, name: "James Kimu", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 64, name: "Hopeson Mustaffa", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 65, name: "James Kakmanga", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 66, name: "Macdonald Banda", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 67, name: "Chisomo Paika", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 68, name: "Mphatso Julius", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 69, name: "Goodson Banda", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 70, name: "Razak John", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 71, name: "Macdonald Bonongwe", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 72, name: "Josephy Maphedi", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 73, name: "Deepay Banda", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 74, name: "Maxwell Sinfukwe", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 75, name: "Andrew Wkosi", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 76, name: "Miracle Kuntelela", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 77, name: "Vincent Thomson", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 78, name: "Madalitso Singini", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 79, name: "Andrew Khombe", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 80, name: "Collings Pasiya", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 81, name: "Albert Lupiya", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 82, name: "Francis Chisambi", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 83, name: "Collings Pearson", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 84, name: "Vincent Kumanda", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 85, name: "Precious Myula", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
  { shirtNo: 86, name: "Prine Chirwa", dob: "", position: "", team: "Youth Team", salary: 0, status: "Active" },
].map((p, i) => ({ id: i + 1, ...p }));

const seedHostelResidents = [
  // ── Main House — Reserve (13) ─────────────────────────────────
  { name: "Ninu Cassim", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Tamandani Damiano", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Davie Chinkhwangwa", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Edison Chibalo", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Kenneth Mwale", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Fanuel Lusiyano", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Jacob Banda", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Stevie Kaira", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Mayamiko Zasha", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Frank Tembo", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Joel Salijala", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "Innocent Munga", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  { name: "James Musongole", houseCode: "HSE-001", room: "", team: "Reserve Team", joined: "2026-01-01", status: "Active" },
  // ── House 3 — Youth (6) ──────────────────────────────────────
  { name: "Joseph Maphedi", houseCode: "HSE-002", room: "", team: "Youth Team", joined: "2026-01-01", status: "Active" },
  { name: "Maxwell Simfukwe", houseCode: "HSE-002", room: "", team: "Youth Team", joined: "2026-01-01", status: "Active" },
  { name: "Collins Pearson", houseCode: "HSE-002", room: "", team: "Youth Team", joined: "2026-01-01", status: "Active" },
  { name: "Depay Banda", houseCode: "HSE-002", room: "", team: "Youth Team", joined: "2026-01-01", status: "Active" },
  { name: "Goodson Banda", houseCode: "HSE-002", room: "", team: "Youth Team", joined: "2026-01-01", status: "Active" },
  { name: "Madaliso Singini", houseCode: "HSE-002", room: "", team: "Youth Team", joined: "2026-01-01", status: "Active" },
].map((r, i) => ({ id: i + 1, ...r }));

const seedVehicles = [
  { code: "E.FC1", makeModel: "Team Bus", regNo: "E.FC1", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2027-04-17", insuranceExpiry: "2026-12-31", lastService: "2026-08-12", notes: "Perfect — Km 20927 / 21412", status: "Active" },
  { code: "E.FC2", makeModel: "Team Bus", regNo: "E.FC2", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2027-05-05", insuranceExpiry: "2026-12-31", lastService: "2026-07-19", notes: "Perfect — Km 91653 / 96353", status: "Active" },
  { code: "BT13445", makeModel: "Vehicle", regNo: "BT13445", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2027-03-10", insuranceExpiry: "2026-12-31", lastService: "2026-07-07", notes: "Perfect — Km 336408 / 391408", status: "Active" },
  { code: "BT14955", makeModel: "Vehicle", regNo: "BT14955", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2027-03-05", insuranceExpiry: "2026-12-31", lastService: "2026-07-07", notes: "Perfect — Km 105211 / 110211", status: "Active" },
  { code: "BT16063", makeModel: "Vehicle", regNo: "BT16063", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2027-02-17", insuranceExpiry: "2026-12-31", lastService: "2026-07-10", notes: "Service for injectors — Km 90695 / 95695", status: "Active" },
  { code: "BT1322", makeModel: "Vehicle", regNo: "BT1322", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2027-04-23", insuranceExpiry: "2026-12-21", lastService: "2026-05-29", notes: "Perfect", status: "Active" },
  { code: "BT14713", makeModel: "Vehicle", regNo: "BT14713", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2027-04-23", insuranceExpiry: "2026-12-31", lastService: "2026-05-29", notes: "Perfect", status: "Active" },
  { code: "BT14227", makeModel: "Vehicle", regNo: "BT14227", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2026-08-23", insuranceExpiry: "2026-12-31", lastService: "2026-07-27", notes: "Perfect", status: "Active" },
  { code: "BC20442", makeModel: "Vehicle", regNo: "BC20442", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2026-11-23", insuranceExpiry: "2026-11-30", lastService: "2026-07-22", notes: "Perfect", status: "Active" },
  { code: "BT17879", makeModel: "Vehicle", regNo: "BT17879", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2027-02-17", insuranceExpiry: "2026-12-31", lastService: "2026-06-08", notes: "Tyres and engine", status: "Active" },
  { code: "BT1150", makeModel: "Vehicle", regNo: "BT1150", driverName: "N. Celos", driverPhone: "", driverLicense: "", cofExpiry: "2027-04-17", insuranceExpiry: "2026-12-31", lastService: "2026-06-08", notes: "Not in good condition", status: "Active" },
].map((v, i) => ({ id: i + 1, ...v }));

// Long-term equipment issued to officials, board & staff (drawn from the
// real inventory catalog above). Quantities for these items in seedItems
// already reflect that they were handed out, so the two stay consistent.
const seedStaffEquipment = [
  { code: "EQ-00001", staffCode: "EKH-BRD-001", itemId: 34, itemName: "Official Golf Shirt (White, MEDIUM)", itemCode: "OGS100W02", serial: "GRP-201", dateIssued: "2026-06-01", issuedBy: "EKH-SUP-001", condition: "New", status: "Issued", dateReturned: null, receivedBy: null, notes: "Board attire" },
  { code: "EQ-00002", staffCode: "EKH-BRD-001", itemId: 65, itemName: "Doda Hood Tops (Black, MEDIUM)", itemCode: "HDS700B02", serial: "HDM-033", dateIssued: "2026-06-01", issuedBy: "EKH-SUP-001", condition: "New", status: "Issued", dateReturned: null, receivedBy: null, notes: "Board members kit" },
  { code: "EQ-00003", staffCode: "EKH-SUP-001", itemId: 26, itemName: "Caps (White, )", itemCode: "CAP600W00", serial: "CAP-W-017", dateIssued: "2026-05-12", issuedBy: "EKH-SUP-001", condition: "Good", status: "Issued", dateReturned: null, receivedBy: null, notes: "Executive cap" },
  { code: "EQ-00004", staffCode: "EKH-FLT-001", itemId: 27, itemName: "Caps (Black, )", itemCode: "CAP600B00", serial: "CAP-B-004", dateIssued: "2026-05-12", issuedBy: "EKH-SUP-001", condition: "Good", status: "Issued", dateReturned: null, receivedBy: null, notes: "Fleet officer cap" },
  { code: "EQ-00005", staffCode: "EKH-FIN-001", itemId: 28, itemName: "Bag Pack (Black, )", itemCode: "BPK600B00", serial: "BPK-011", dateIssued: "2026-04-20", issuedBy: "EKH-SUP-001", condition: "New", status: "Issued", dateReturned: null, receivedBy: null, notes: "Finance officer" },
  { code: "EQ-00006", staffCode: "EKH-SEN-001", itemId: 56, itemName: "Promotion Jersey (Gold, MEDIUM)", itemCode: "PMJ100G02", serial: "PMJ-G-028", dateIssued: "2026-03-18", issuedBy: "EKH-SUP-001", condition: "Good", status: "Issued", dateReturned: null, receivedBy: null, notes: "Team manager" },
  { code: "EQ-00007", staffCode: "EKH-WOM-001", itemId: 47, itemName: "Promotion Jersey (White, MEDIUM)", itemCode: "PMJ100W02", serial: "PMJ-W-031", dateIssued: "2026-03-18", issuedBy: "EKH-SUP-001", condition: "Good", status: "Issued", dateReturned: null, receivedBy: null, notes: "Women's team manager" },
  { code: "EQ-00008", staffCode: "EKH-HOS-001", itemId: 33, itemName: "Traveling Bag", itemCode: "TVB600B00", serial: "TVB-205", dateIssued: "2026-02-09", issuedBy: "EKH-SUP-001", condition: "Good", status: "Issued", dateReturned: null, receivedBy: null, notes: "Hostel warden" },
  { code: "EQ-00009", staffCode: "EKH-HOS-002", itemId: 35, itemName: "Official Golf Shirt (White, LARGE)", itemCode: "OGS100W03", serial: "GRP-119", dateIssued: "2026-02-09", issuedBy: "EKH-SUP-001", condition: "New", status: "Issued", dateReturned: null, receivedBy: null, notes: "Hostel staff" },
  { code: "EQ-00010", staffCode: "EKH-HOS-003", itemId: 55, itemName: "Promotion Jersey (Gold, SMALL)", itemCode: "PMJ100G01", serial: "PMJ-G-009", dateIssued: "2026-02-09", issuedBy: "EKH-SUP-001", condition: "Good", status: "Issued", dateReturned: null, receivedBy: null, notes: "Hostel staff" },
];

// Business modules that start as empty working lists (folded into one block so
// the real data can be entered or imported without contradicting authentic records).
const emptyMods = {
  players: seedPlayers, hostelResidents: seedHostelResidents, attendance: [], incidents: [], foodSchedule: seedFoodSchedule,
  trips: [], fuel: [], sponsors: [], risks: [], fixtures: [],
};

const seedItems = [
  { id: 1, code: "TKT200Z01", name: "Training Kit (Zebra, SMALL)", category: "Training Kits", unit: "pcs", quantity: 36, min: 5, max: 36, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 2, code: "TKT200Z02", name: "Training Kit (Zebra, MEDIUM)", category: "Training Kits", unit: "pcs", quantity: 23, min: 5, max: 23, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 3, code: "TKT200Z03", name: "Training Kit (Zebra, LARGE)", category: "Training Kits", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 4, code: "TKT200Z04", name: "Training Kit (Zebra, EXTRALARGE)", category: "Training Kits", unit: "pcs", quantity: 8, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 5, code: "TKT200Z05", name: "Training Kit (Zebra, 2EXTRALARGE)", category: "Training Kits", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 6, code: "PVJ200G01", name: "Prayer Versionjersey (Gold, SMALL)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 7, code: "PVJ200G02", name: "Prayer Versionjersey (Gold, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 8, code: "PVJ200G03", name: "Prayer Versionjersey (Gold, LARGE)", category: "Jerseys", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 9, code: "VST200B01", name: "Vest (Black, SMALL)", category: "Vests", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 10, code: "VST200B02", name: "Vest (Black, MEDIUM)", category: "Vests", unit: "pcs", quantity: 24, min: 5, max: 24, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 11, code: "VST200B03", name: "Vest (Black, LARGE)", category: "Vests", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 12, code: "VST200B04", name: "Vest (Black, EXTRA LARGE)", category: "Vests", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 13, code: "TST200B01", name: "Track Suit (Black, SMALL)", category: "Track Suits", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 14, code: "TST200B02", name: "Track Suit (Black, MEDIUM)", category: "Track Suits", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 15, code: "TST200B03", name: "Track Suit (Black, LARGE)", category: "Track Suits", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 16, code: "TST200B04", name: "Track Suit (Black, EXTRA LARGE)", category: "Track Suits", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 17, code: "PGS200B01", name: "Player Golf Shirt (Main Team, BLACK)", category: "Golf Shirts", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 18, code: "PGS200B02", name: "Player Golf Shirt (Main Team, BLACK)", category: "Golf Shirts", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 19, code: "PGS200B03", name: "Player Golf Shirt (Main Team, BLACK)", category: "Golf Shirts", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 20, code: "PGS200B06", name: "Player Golf Shirt (Main Team, BLACK)", category: "Golf Shirts", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 21, code: "PVJ200P01", name: "Prayer Versionjersey (Purple, SMALL)", category: "Jerseys", unit: "pcs", quantity: 8, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 22, code: "PVJ200P03", name: "Prayer Versionjersey (Purple, LARGE)", category: "Jerseys", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 23, code: "PVJ200W01", name: "Prayer Versionjersey (White, SMALL)", category: "Jerseys", unit: "pcs", quantity: 9, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 24, code: "PVJ200W02", name: "Prayer Versionjersey (White, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 25, code: "PVJ200W03", name: "Prayer Versionjersey (White, LARGE)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 26, code: "CAP600W00", name: "Caps (White, )", category: "Caps", unit: "pcs", quantity: 220, min: 5, max: 221, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 27, code: "CAP600B00", name: "Caps (Black, )", category: "Caps", unit: "pcs", quantity: 40, min: 5, max: 41, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 28, code: "BPK600B00", name: "Bag Pack (Black, )", category: "Bags", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 29, code: "PBS600R00", name: "Player Beeps (Red, )", category: "Player Beeps", unit: "pcs", quantity: 50, min: 5, max: 50, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 30, code: "PBS600B00", name: "Player Beeps (Blue, )", category: "Player Beeps", unit: "pcs", quantity: 60, min: 5, max: 60, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 31, code: "PBS600G00", name: "Player Beeps (Green, )", category: "Player Beeps", unit: "pcs", quantity: 60, min: 5, max: 60, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 32, code: "PBS600Y00", name: "Player Beeps (Yellow, )", category: "Player Beeps", unit: "pcs", quantity: 60, min: 5, max: 60, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 33, code: "TVB600B00", name: "Traveling Bag", category: "Bags", unit: "pcs", quantity: 81, min: 5, max: 82, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 34, code: "OGS100W02", name: "Official Golf Shirt (White, MEDIUM)", category: "Golf Shirts", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 35, code: "OGS100W03", name: "Official Golf Shirt (White, LARGE)", category: "Golf Shirts", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 36, code: "OGS100W04", name: "Official Golf Shirt (White, EXTRALARGE)", category: "Golf Shirts", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 37, code: "PMJ100P01", name: "Promotion Jersey (Purple, SMALL)", category: "Jerseys", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 38, code: "PMJ100P02", name: "Promotion Jersey (Purple, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 14, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 39, code: "PMJ100P03", name: "Promotion Jersey (Purple, LARGE)", category: "Jerseys", unit: "pcs", quantity: 19, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 40, code: "PMJ100P04", name: "Promotion Jersey (Purple, XTRALARGE)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 41, code: "PMJ100P18", name: "Promotion Jersey (Purple, KIDSIZE18)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 42, code: "PMJ100P20", name: "Promotion Jersey (Purple, KIDSIZE20)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 43, code: "PMJ100P22", name: "Promotion Jersey (Purple, KIDSIZE22)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 44, code: "PMJ100P24", name: "Promotion Jersey (Purple, KIDSIZE24)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 45, code: "PMJ100P28", name: "Promotion Jersey (Purple, KIDSIZE28)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 46, code: "PMJ100W01", name: "Promotion Jersey (White, SMALL)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 47, code: "PMJ100W02", name: "Promotion Jersey (White, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 48, code: "PMJ100W03", name: "Promotion Jersey (White, LARGE)", category: "Jerseys", unit: "pcs", quantity: 13, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 49, code: "PMJ100W04", name: "Promotion Jersey (White, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 50, code: "PMJ100W18", name: "Promotion Jersey (White, LKIDSIZE18)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 51, code: "PMJ100W20", name: "Promotion Jersey (White, LKIDSIZE20)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 52, code: "PMJ100W22", name: "Promotion Jersey (White, LKIDSIZE22)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 53, code: "PMJ100W24", name: "Promotion Jersey (White, LKIDSIZE24)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 54, code: "PMJ100W28", name: "Promotion Jersey (White, LKIDSIZE28)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 55, code: "PMJ100G01", name: "Promotion Jersey (Gold, SMALL)", category: "Jerseys", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 56, code: "PMJ100G02", name: "Promotion Jersey (Gold, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 8, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 57, code: "PMJ100G03", name: "Promotion Jersey (Gold, LARGE)", category: "Jerseys", unit: "pcs", quantity: 11, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 58, code: "PMJ100G04", name: "Promotion Jersey (Gold, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 59, code: "PMJ100G18", name: "Promotion Jersey (Gold, KIDSIZE18)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 60, code: "PMJ100G20", name: "Promotion Jersey (Gold, KIDSIZE20)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 61, code: "PMJ100G22", name: "Promotion Jersey (Gold, KIDSIZE22)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 62, code: "PMJ100G24", name: "Promotion Jersey (Gold, KIDSIZE24)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 63, code: "PMJ100G28", name: "Promotion Jersey (Gold, KIDSIZE26)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 64, code: "HDS700B01", name: "Doda Hood Tops (Black, SMALL)", category: "Hoodies", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 65, code: "HDS700B02", name: "Doda Hood Tops (Black, MEDIUM)", category: "Hoodies", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 66, code: "HDS700B03", name: "Doda Hood Tops (Black, LARGE)", category: "Hoodies", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 67, code: "HDS700B04", name: "Doda Hood Tops (Black, X-LARGE)", category: "Hoodies", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 68, code: "FCJ700W01", name: "First Cpy Jersey (White, SMALL)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 69, code: "FCJ700W02", name: "First Cpy Jersey (White, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 6, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 70, code: "FCJ700W03", name: "First Cpy Jersey (White, LARGE)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 71, code: "FCJ700W04", name: "First Cpy Jersey (White, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 72, code: "FCJ700P01", name: "First Cpy Jersey (Purple, SMALL)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 73, code: "FCJ700P02", name: "First Cpy Jersey (Purple, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 6, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 74, code: "FCJ700P03", name: "First Cpy Jersey (Purple, LARGE)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 75, code: "FCJ700P04", name: "First Cpy Jersey (Purple, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 76, code: "OGS700B01", name: "Official Golfshirt (Black, SMALL)", category: "Golf Shirts", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 77, code: "OGS700B02", name: "Official Golfshirt (Black, MEDIUM)", category: "Golf Shirts", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 78, code: "OGS700B03", name: "Official Golfshirt (Black, LARGE)", category: "Golf Shirts", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 79, code: "OGS700B04", name: "Official Golfshirt (Black, X-LARGE)", category: "Golf Shirts", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 80, code: "OGS700W01", name: "Official Golfshirt (White, SMALL)", category: "Golf Shirts", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 81, code: "OGS700W02", name: "Official Golfshirt (White, MEDIUM)", category: "Golf Shirts", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 82, code: "RCT700B01", name: "Raincoat (Black, SMALL)", category: "Raincoats", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 83, code: "RCT700B02", name: "Raincoat (Black, MEDIUM)", category: "Raincoats", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 84, code: "RCT700B03", name: "Raincoat (Black, LARGE)", category: "Raincoats", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 85, code: "RCT700B04", name: "Raincoat (Black, X-LARGE)", category: "Raincoats", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 86, code: "CAP700B00", name: "Caps (Black, GENERAL SIZE)", category: "Caps", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 87, code: "TKT400Z01", name: "Training Kit (Zebra, SMALL)", category: "Training Kits", unit: "pcs", quantity: 19, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 88, code: "TKT400Z02", name: "Training Kit (Zebra, MEDIUM)", category: "Training Kits", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 89, code: "TKT400Z03", name: "Training Kit (Zebra, LARGE)", category: "Training Kits", unit: "pcs", quantity: 12, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 90, code: "PVJ600W01", name: "Player Version Jersey (White, SMALL)", category: "Jerseys", unit: "pcs", quantity: 65, min: 5, max: 65, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 91, code: "PVJ600W02", name: "Player Version Jersey (White, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 9, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 92, code: "PVJ600W03", name: "Player Version Jersey (White, LARGE)", category: "Jerseys", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 93, code: "PVJ600W04", name: "Player Version Jersey (White, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 76, min: 5, max: 76, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 94, code: "PVJ600W05", name: "Player Version Jersey (White, 2X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 34, min: 5, max: 34, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 95, code: "PVJ600W06", name: "Player Version Jersey (White, 3X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 96, code: "PVJ600W07", name: "Player Version Jersey (White, 4X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 97, code: "PVJ600G01", name: "Player Version Jersey (Gold, SMALL)", category: "Jerseys", unit: "pcs", quantity: 67, min: 5, max: 67, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 98, code: "PVJ600G02", name: "Player Version Jersey (Gold, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 36, min: 5, max: 36, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 99, code: "PVJ600G03", name: "Player Version Jersey (Gold, LARGE)", category: "Jerseys", unit: "pcs", quantity: 40, min: 5, max: 40, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 100, code: "PVJ600G04", name: "Player Version Jersey (Gold, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 80, min: 5, max: 80, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 101, code: "PVJ600G05", name: "Player Version Jersey (Gold, 2X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 42, min: 5, max: 42, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 102, code: "PVJ600G06", name: "Player Version Jersey (Gold, 3X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 11, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 103, code: "VST400B01", name: "Vest (Black, SMALL)", category: "Vests", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 104, code: "VST400B02", name: "Vest (Black, MEDIUM)", category: "Vests", unit: "pcs", quantity: -5, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 105, code: "RPJ600G01", name: "Replica Jersey (Gold, SMALL)", category: "Jerseys", unit: "pcs", quantity: 114, min: 5, max: 114, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 106, code: "RPJ600G02", name: "Replica Jersey (Gold, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 75, min: 5, max: 75, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 107, code: "RPJ600G03", name: "Replica Jersey (Gold, LARGE)", category: "Jerseys", unit: "pcs", quantity: 64, min: 5, max: 64, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 108, code: "RPJ600G04", name: "Replica Jersey (Gold, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 72, min: 5, max: 72, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 109, code: "RPJ600G05", name: "Replica Jersey (Gold, 2X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 30, min: 5, max: 30, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 110, code: "RPJ600G06", name: "Replica Jersey (Gold, 3X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 111, code: "RPJ600G07", name: "Replica Jersey (Gold, 4X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 112, code: "RPJ600W01", name: "Replica Jersey (White, SMALL)", category: "Jerseys", unit: "pcs", quantity: 129, min: 5, max: 129, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 113, code: "RPJ600W02", name: "Replica Jersey (White, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 110, min: 5, max: 110, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 114, code: "RPJ600W03", name: "Replica Jersey (White, LARGE)", category: "Jerseys", unit: "pcs", quantity: 107, min: 5, max: 107, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 115, code: "RPJ600W04", name: "Replica Jersey (White, XLARGE)", category: "Jerseys", unit: "pcs", quantity: 51, min: 5, max: 51, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 116, code: "RPJ600W05", name: "Replica Jersey (White, 2XLARGE)", category: "Jerseys", unit: "pcs", quantity: 37, min: 5, max: 37, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 117, code: "RPJ600W06", name: "Replica Jersey (White, 3XLARGE)", category: "Jerseys", unit: "pcs", quantity: 11, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 118, code: "RPJ600W07", name: "Replica Jersey (White, 4XLARGE)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 119, code: "RPJ600P01", name: "Replica Jersey (Purple, SMALL)", category: "Jerseys", unit: "pcs", quantity: 103, min: 5, max: 103, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 120, code: "RPJ600P02", name: "Replica Jersey (Purple, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 86, min: 5, max: 86, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 121, code: "RPJ600P03", name: "Replica Jersey (Purple, LARGE)", category: "Jerseys", unit: "pcs", quantity: 62, min: 5, max: 62, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 122, code: "RPJ600P04", name: "Replica Jersey (Purple, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 83, min: 5, max: 83, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 123, code: "RPJ600P05", name: "Replica Jersey (Purple, 2X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 24, min: 5, max: 24, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 124, code: "RPJ600P06", name: "Replica Jersey (Purple, 3X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 125, code: "RPJ600P07", name: "Replica Jersey (Purple, 4X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 126, code: "PVJ600P01", name: "Player Versin Jersey (Purple, SMALL)", category: "Jerseys", unit: "pcs", quantity: 35, min: 5, max: 35, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 127, code: "PVJ600P02", name: "Player Versin Jersey (Purple, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: -6, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 128, code: "PVJ600P03", name: "Player Versin Jersey (Purple, LARGE)", category: "Jerseys", unit: "pcs", quantity: 34, min: 5, max: 34, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 129, code: "PVJ600P04", name: "Player Versin Jersey (Purple, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 74, min: 5, max: 74, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 130, code: "PVJ600P05", name: "Player Versin Jersey (Purple, 2X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 47, min: 5, max: 47, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 131, code: "PVJ600P06", name: "Player Versin Jersey (Purple, 3X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 12, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 132, code: "PVJ600P07", name: "Player Versin Jersey (Purple, 4X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 133, code: "FCJ700G01", name: "First Copy Jersy (Gold, SMALL)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 134, code: "FCJ700G02", name: "First Copy Jersy (Gold, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 135, code: "FCJ700G03", name: "First Copy Jersy (Gold, LARGE)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 136, code: "FCJ700G04", name: "First Copy Jersy (Gold, X- LARGE)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 137, code: "RCT400B01", name: "Rain Coat (Black, SMALL)", category: "Raincoats", unit: "pcs", quantity: 15, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 138, code: "RCT400B02", name: "Rain Coat (Black, MEDIUM)", category: "Raincoats", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 139, code: "RCT400B03", name: "Rain Coat (Black, LARGE)", category: "Raincoats", unit: "pcs", quantity: 13, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 140, code: "OGS800B02", name: "Offcial Golf-shirt (Black, MEDIUM)", category: "Golf Shirts", unit: "pcs", quantity: 9, min: 5, max: 20, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 141, code: "PVJ800W01", name: "Player Version (White, SMALL)", category: "Merchandise", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 142, code: "PVJ800W02", name: "Player Version (White, MEDIUM)", category: "Merchandise", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 143, code: "PVJ800W03", name: "Player Version (White, LARGE)", category: "Merchandise", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 144, code: "PVJ800W04", name: "Player Version (White, X-LARGE)", category: "Merchandise", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 145, code: "PVJ800W05", name: "Player Version (White, 2X-LARGE)", category: "Merchandise", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 146, code: "PVJ800P01", name: "Player Version (Purple, SMALL)", category: "Merchandise", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 147, code: "PVJ800P02", name: "Player Version (Purple, MEDIUM)", category: "Merchandise", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 148, code: "PVJ800P03", name: "Player Version (Purple, LARGE)", category: "Merchandise", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 149, code: "PVJ800P04", name: "Player Version (Purple, X-LARGE)", category: "Merchandise", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 150, code: "PVJ800P05", name: "Player Version (Purple, 2X-LARGE)", category: "Merchandise", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 151, code: "PVJ800G01", name: "Player Version (Gold, SMALL)", category: "Merchandise", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 152, code: "PVJ800G02", name: "Player Version (Gold, MEDIUM)", category: "Merchandise", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 153, code: "PVJ800G03", name: "Player Version (Gold, LARGE)", category: "Merchandise", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 154, code: "PVJ800G04", name: "Player Version (Gold, X-LARGE)", category: "Merchandise", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 155, code: "PVJ800G05", name: "Player Version (Gold, 2X-LARGE)", category: "Merchandise", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 156, code: "CAP800B00", name: "Caps (Black, NO SPECIFIC SIZE)", category: "Caps", unit: "pcs", quantity: 42, min: 5, max: 42, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 157, code: "LDT600W01", name: "Limited Edition Jersey (White, SMALL)", category: "Jerseys", unit: "pcs", quantity: 50, min: 5, max: 50, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 158, code: "LDT600W02", name: "Limited Edition Jersey (White, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 50, min: 5, max: 50, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 159, code: "LDT600W03", name: "Limited Edition Jersey (White, LARGE)", category: "Jerseys", unit: "pcs", quantity: 65, min: 5, max: 65, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 160, code: "LDT600W04", name: "Limited Edition Jersey (White, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 65, min: 5, max: 65, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 161, code: "LDT600W05", name: "Limited Edition Jersey (White, 2X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 50, min: 5, max: 50, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 162, code: "LDT600W06", name: "Limited Edition Jersey (White, 3X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 163, code: "LDT600W07", name: "Limited Edition Jersey (White, 4X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 164, code: "KPV300G18", name: "Kids Player Version Jersey (Gold, SIZE 18)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 165, code: "KPV300G20", name: "Kids Player Version Jersey (Gold, SIZE 20)", category: "Jerseys", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 166, code: "KPV300G22", name: "Kids Player Version Jersey (Gold, SIZE 22)", category: "Jerseys", unit: "pcs", quantity: 8, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 167, code: "KPV300G24", name: "Kids Player Version Jersey (Gold, SIZE 24)", category: "Jerseys", unit: "pcs", quantity: 8, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 168, code: "KPV300G28", name: "Kids Player Version Jersey (Gold, SIZE 28)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 169, code: "KPV300P18", name: "Kids Player Version Jersey (Purple, SIZE 18)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 170, code: "KPV300P20", name: "Kids Player Version Jersey (Purple, SIZE 20)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 171, code: "KPV300P22", name: "Kids Player Version Jersey (Purple, SIZE 22)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 172, code: "KPV300P24", name: "Kids Player Version Jersey (Purple, SIZE 24)", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 173, code: "KPV300P28", name: "Kids Player Version Jersey (Purple, SIZE 28)", category: "Jerseys", unit: "pcs", quantity: 6, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 174, code: "KPV300W18", name: "Kids Player Version Jersey (White, SIZE 18)", category: "Jerseys", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 175, code: "KPV300W20", name: "Kids Player Version Jersey (White, SIZE 20)", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 176, code: "KPV300W22", name: "Kids Player Version Jersey (White, SIZE 22)", category: "Jerseys", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 177, code: "KPV300W24", name: "Kids Player Version Jersey (White, SIZE 24)", category: "Jerseys", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 178, code: "KPV300W28", name: "Kids Player Version Jersey (White, SIZE 28)", category: "Jerseys", unit: "pcs", quantity: 6, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 179, code: "TST400B01", name: "Track Suit (Black, SMALL)", category: "Track Suits", unit: "pcs", quantity: 16, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 180, code: "TST400B02", name: "Track Suit (Black, MEDIUM)", category: "Track Suits", unit: "pcs", quantity: 36, min: 5, max: 36, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 181, code: "OGS500B01", name: "Official Golf-shirt (Black, SMALL)", category: "Golf Shirts", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 182, code: "OGS500B02", name: "Official Golf-shirt (Black, MEDIUM)", category: "Golf Shirts", unit: "pcs", quantity: 14, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 183, code: "OGS500B03", name: "Official Golf-shirt (Black, LARGE)", category: "Golf Shirts", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 184, code: "OGS500W01", name: "Official Golf-shirt (Small, )", category: "Golf Shirts", unit: "pcs", quantity: 6, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 185, code: "RCT500B01", name: "Rain Coat (Black, SMALL)", category: "Raincoats", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 186, code: "RCT500B02", name: "Rain Coat (Black, MEDIUM)", category: "Raincoats", unit: "pcs", quantity: 6, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 187, code: "TKT500Z01", name: "Training Kit (Zebra, SMALL)", category: "Training Kits", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 188, code: "TKT500Z02", name: "Training Kit (Zebra, MEDIUM)", category: "Training Kits", unit: "pcs", quantity: 9, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 189, code: "RCT300B02", name: "Rain Coat (Black, MEDIUM)", category: "Raincoats", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 190, code: "TVB300B00", name: "Travelling Bag (Black, NO SPECIFIC SIZE)", category: "Bags", unit: "pcs", quantity: 19, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 191, code: "VST300B01", name: "Vest (Black, SMALL)", category: "Vests", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 192, code: "PBS300G00", name: "Player Beeps (Green, SO SPECIFIC SIZE)", category: "Player Beeps", unit: "pcs", quantity: 20, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 193, code: "PBS300B00", name: "Player Beeps (N, BLUE)", category: "Player Beeps", unit: "pcs", quantity: 20, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 194, code: "PBS300R00", name: "Player Beeps (N, RED)", category: "Player Beeps", unit: "pcs", quantity: 20, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 195, code: "PBS300Y00", name: "Player Beeps (N, YELLOW)", category: "Player Beeps", unit: "pcs", quantity: 20, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 196, code: "CAP500B00", name: "Caps (Black, NO SPECIFIC SIZE)", category: "Caps", unit: "pcs", quantity: 6, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 197, code: "TVB500B00", name: "Travelling Bag (Black, NO SPECIFIC SIZE)", category: "Bags", unit: "pcs", quantity: 35, min: 5, max: 35, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 198, code: "PBS500R00", name: "Player Beeps (Red, NO SPECIFIC SIZE)", category: "Player Beeps", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 199, code: "PBS500Y00", name: "Player Beeps (Yellow, NO SPECIFIC SIZE)", category: "Player Beeps", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 200, code: "PBS500B00", name: "Player Beeps (Blue, NO SPECIFIC SIZE)", category: "Player Beeps", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 201, code: "PBS500G00", name: "Player Beeps (Green, NO SPECIFIC SIZE)", category: "Player Beeps", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 202, code: "PVJ100G01", name: "Player Version Jersey (Gold, SMALL)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 203, code: "PVJ100G02", name: "Player Version Jersey (Gold, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 204, code: "PVJ100G03", name: "Player Version Jersey (Gold, LARGE)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 205, code: "PVJ100G04", name: "Player Version Jersey (Gold, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 206, code: "PVJ100W01", name: "Player Version Jersey (White, SMALL)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 207, code: "PVJ100W02", name: "Player Version Jersey (White, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 208, code: "PVJ100W03", name: "Player Version Jersey (White, LARGE)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 209, code: "PVJ100W04", name: "Player Version Jersey (White, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 210, code: "PVJ100P01", name: "Player Version Jersey (Purple, SMALL)", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 211, code: "PVJ100P02", name: "Player Version Jersey (Purple, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 212, code: "PVJ100P03", name: "Player Version Jersey (Purple, LARGE)", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 213, code: "PVJ100P04", name: "Player Version Jersey (Purple, X-LARGE)", category: "Jerseys", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 214, code: "TVB100B00", name: "Travelling Bag (Black, NO SPECIFIC SIZE)", category: "Bags", unit: "pcs", quantity: 15, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 215, code: "RCT100B01", name: "Raincoat (Black, SMALL)", category: "Raincoats", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 216, code: "RCT100B02", name: "Raincoat (Black, MEDIUM)", category: "Raincoats", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 217, code: "RCT100B03", name: "Raincoat (Black, LARGE)", category: "Raincoats", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 218, code: "RCT100B04", name: "Raincoat (Black, X-LARGE)", category: "Raincoats", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 219, code: "CAP100B00", name: "Caps (Black, NO SPECIFIC SIZE)", category: "Caps", unit: "pcs", quantity: 15, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 220, code: "HDS100B01", name: "Hoodies (Black, SMALL)", category: "Hoodies", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 221, code: "HDS100B02", name: "Hoodies (Black, MEDIUM)", category: "Hoodies", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 222, code: "HDS100B03", name: "Hoodies (Black, LARGE)", category: "Hoodies", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 223, code: "HDS100B04", name: "Hoodies (Black, X-LARGE)", category: "Hoodies", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 224, code: "OGS100B01", name: "Official Golf-shirt (Black, SMALL)", category: "Golf Shirts", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 225, code: "OGS100B02", name: "Official Golf-shirt (Black, MEDIUM)", category: "Golf Shirts", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 226, code: "OGS100B03", name: "Official Golf-shirt (Black, LARGE)", category: "Golf Shirts", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 227, code: "OGS100B04", name: "Official Golf-shirt (Black, X- LARGE)", category: "Golf Shirts", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 228, code: "PVJ300G01", name: "Player Version Jersey (Gold, SMALL)", category: "Jerseys", unit: "pcs", quantity: 62, min: 5, max: 62, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 229, code: "PVJ300G02", name: "Player Version Jersey (Gold, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 58, min: 5, max: 58, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 230, code: "PVJ300G03", name: "Player Version Jersey (Gold, LARGE)", category: "Jerseys", unit: "pcs", quantity: 30, min: 5, max: 30, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 231, code: "PVJ300W01", name: "Player Version Jersey (White, SMALL)", category: "Jerseys", unit: "pcs", quantity: 62, min: 5, max: 62, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 232, code: "PVJ300W02", name: "Player Version Jersey (White, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 58, min: 5, max: 58, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 233, code: "PVJ300W03", name: "Player Version Jersey (White, LARGE)", category: "Jerseys", unit: "pcs", quantity: 30, min: 5, max: 30, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 234, code: "PVJ300P01", name: "Player Version Jersey (Purple, SMALL)", category: "Jerseys", unit: "pcs", quantity: 62, min: 5, max: 62, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 235, code: "PVJ300P02", name: "Player Version Jersey (Purple, MEDIUM)", category: "Jerseys", unit: "pcs", quantity: 58, min: 5, max: 58, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 236, code: "PVJ300P03", name: "Player Version Jersey (Purple, LARGE)", category: "Jerseys", unit: "pcs", quantity: 30, min: 5, max: 30, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 237, code: "OGS300B01", name: "Official Golf-shirt (Black, SMALL)", category: "Golf Shirts", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 238, code: "OGS300B02", name: "Official Golf-shirt (Black, MEDIUM)", category: "Golf Shirts", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 239, code: "OGS300B03", name: "Official Golf-shirt (Black, LARGE)", category: "Golf Shirts", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 240, code: "OGS300W01", name: "Official Golf-shirt (White, SMALL)", category: "Golf Shirts", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 241, code: "OGS300W02", name: "Official Golf-shirt (White, MEDIUM)", category: "Golf Shirts", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 242, code: "TST500B01", name: "Track Suit (Black, SMALL)", category: "Track Suits", unit: "pcs", quantity: 14, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 243, code: "TST500B02", name: "Track Suit (Black, MEDIUM)", category: "Track Suits", unit: "pcs", quantity: 22, min: 5, max: 22, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 244, code: "TST300B01", name: "Track Suit (Black, SMALL)", category: "Track Suits", unit: "pcs", quantity: 6, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 245, code: "TST300B02", name: "Track Suit (Black, MEDIUM)", category: "Track Suits", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 246, code: "HDS600W01", name: "Hoodies (White, SMALL)", category: "Hoodies", unit: "pcs", quantity: 33, min: 5, max: 33, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 247, code: "HDS600W02", name: "Hoodies (White, MEDIUM)", category: "Hoodies", unit: "pcs", quantity: 33, min: 5, max: 33, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 248, code: "HDS600W03", name: "Hoodies (White, LARGE)", category: "Hoodies", unit: "pcs", quantity: 45, min: 5, max: 45, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 249, code: "HDS600W04", name: "Hoodies (White, X-LARGE)", category: "Hoodies", unit: "pcs", quantity: 51, min: 5, max: 51, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 250, code: "HDS600W05", name: "Hoodies (White, 2X-LARGE)", category: "Hoodies", unit: "pcs", quantity: 38, min: 5, max: 38, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 251, code: "HDS600W06", name: "Hoodies (White, 3X-LARGE)", category: "Hoodies", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 252, code: "HDS600W07", name: "Hoodies (White, 4X-LARGE)", category: "Hoodies", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 253, code: "TST100B01", name: "Track Suit (Black, SMALL)", category: "Track Suits", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 254, code: "TST100B02", name: "Track Suit (Black, MEDIUM)", category: "Track Suits", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 255, code: "TST100B03", name: "Track Suit (Black, LARGE)", category: "Track Suits", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 256, code: "TST100B04", name: "Track Suit (Black, X-LARGE)", category: "Track Suits", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 257, code: "TST700B01", name: "Track Suit (Black, SMALL)", category: "Track Suits", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 258, code: "TST700B02", name: "Track Suit (Black, MEDIUM)", category: "Track Suits", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 259, code: "TST700B03", name: "Track Suit (Black, LARGE)", category: "Track Suits", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 260, code: "TST700B04", name: "Track Suit (Black, X-LARGE)", category: "Track Suits", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 261, code: "TST400B03", name: "Track Suit (Black, LARGE)", category: "Track Suits", unit: "pcs", quantity: 9, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 262, code: "TST800B01", name: "Track Suit (Black, SMALL)", category: "Track Suits", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 263, code: "TST800B02", name: "Track Suit (Black, MEDIUM)", category: "Track Suits", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 264, code: "TST800B03", name: "Track Suit (Black, LARGE)", category: "Track Suits", unit: "pcs", quantity: -7, min: 5, max: 20, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 265, code: "TST800B04", name: "Track Suit (Black, X-LARGE)", category: "Track Suits", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 266, code: "TST800B05", name: "Track Suit (Black, 2X-LARGE)", category: "Track Suits", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 267, code: "BTS100N38", name: "Boots (Unsecified Color, SIZE 38)", category: "Merchandise", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 268, code: "BTS100N39", name: "Boots (Unsecified Color, SIZE 39)", category: "Merchandise", unit: "pcs", quantity: 9, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 269, code: "BTS100N40", name: "Boots (Unsecified Color, SIZE 40)", category: "Merchandise", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 270, code: "BTS100N41", name: "Boots (Unsecified Color, SIZE 41)", category: "Merchandise", unit: "pcs", quantity: 17, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 271, code: "BTS100N42", name: "Boots (Unsecified Color, SIZE 42)", category: "Merchandise", unit: "pcs", quantity: 23, min: 5, max: 23, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 272, code: "BTS100N43", name: "Boots (Unsecified Color, SIZE 43)", category: "Merchandise", unit: "pcs", quantity: 13, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 273, code: "BTS100N44", name: "Boots (Unsecified Color, SIZE 44)", category: "Merchandise", unit: "pcs", quantity: 8, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 274, code: "BTS100N45", name: "Boots (Unsecified Color, SIZE 45)", category: "Merchandise", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 275, code: "BTS100N46", name: "Boots (Unsecified Color, SIZE 46)", category: "Merchandise", unit: "pcs", quantity: 8, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 276, code: "TRN100N38", name: "Trainer (Unspecified Color, SIZE 38)", category: "Footwear", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 277, code: "TRN100N39", name: "Trainer (Unspecified Color, SIZE 39)", category: "Footwear", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 278, code: "TRN100N40", name: "Trainer (Unspecified Color, SIZE 40)", category: "Footwear", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 279, code: "TRN100N41", name: "Trainer (Unspecified Color, SIZE 41)", category: "Footwear", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 280, code: "TRN100N42", name: "Trainer (Unspecified Color, SIZE 42)", category: "Footwear", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 281, code: "TRN100N43", name: "Trainer (Unspecified Color, SIZE 43)", category: "Footwear", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 282, code: "TRN100N44", name: "Trainer (Unspecified Color, SIZE 44)", category: "Footwear", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 283, code: "TRN100N45", name: "Trainer (Unspecified Color, SIZE 45)", category: "Footwear", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 284, code: "TRN100N46", name: "Trainer (Unspecified Color, SIZE 46)", category: "Footwear", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 285, code: " RPJ600W04", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 286, code: " TKT400Z03", name: "Training Kit", category: "Training Kits", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 287, code: "CAP200B00", name: "Caps", category: "Caps", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 288, code: "CAP400B00", name: "Caps", category: "Caps", unit: "pcs", quantity: -29, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 289, code: "CAP400W00", name: "Caps", category: "Caps", unit: "pcs", quantity: -8, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 290, code: "CAP5000B00", name: "Caps", category: "Caps", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 291, code: "CAP700P01", name: "Caps", category: "Caps", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 292, code: "CAP800W00", name: "Caps", category: "Caps", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 293, code: "CPS600W00", name: "Caps", category: "Caps", unit: "pcs", quantity: -10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 294, code: "FVJ700G01", name: "First Version Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 295, code: "FVJ700G03", name: "First Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 296, code: "FVJ700G04", name: "First Version Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 297, code: "FVJ700P01", name: "First Version Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 298, code: "FVJ700P02", name: "First Copy Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 299, code: "FVJ700P03", name: "First Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 300, code: "FVJ700P04", name: "First Version Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 301, code: "FVJ700W01", name: "First Version Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 302, code: "FVJ700W03", name: "First Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 303, code: "FVJ700W04", name: "First Version Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 304, code: "HDS600B02", name: "Hoodie", category: "Hoodies", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 305, code: "HDS600B03", name: "Hoodies", category: "Hoodies", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 306, code: "HSG600B02", name: "Hoodie", category: "Hoodies", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 307, code: "HSG600B03", name: "Hoodie", category: "Hoodies", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 308, code: "HSG600W03", name: "Hoodie", category: "Hoodies", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 309, code: "KRP300G18", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 310, code: "KRP300G20", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 311, code: "KRP300G22", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 15, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 312, code: "KRP300G24", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 15, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 313, code: "KRP300G28", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 314, code: "KRP300P18", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 315, code: "KRP300P20", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 316, code: "KRP300P22", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 317, code: "KRP300P24", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 9, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 318, code: "KRP300P28", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 319, code: "KRP300W18", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 320, code: "KRP300W20", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 321, code: "KRP300W22", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 13, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 322, code: "KRP300W24", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 15, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 323, code: "KRP300W28", name: "Kids Replica Jersey", category: "Jerseys", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 324, code: "KRP600G24", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 325, code: "KRP600G28", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 326, code: "KRP600P18", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 327, code: "KRP600P24", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 328, code: "KRP600W20", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 329, code: "KRP600W22", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 330, code: "LTD600W01", name: "Limited Edition Jersey", category: "Jerseys", unit: "pcs", quantity: -10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 331, code: "LTD600W02", name: "Limited Edition Jersey", category: "Jerseys", unit: "pcs", quantity: -13, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 332, code: "LTD600W03", name: "Limited Edition Jersey", category: "Jerseys", unit: "pcs", quantity: -17, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 333, code: "LTD600W04", name: "Limited Edition Jersey", category: "Jerseys", unit: "pcs", quantity: -12, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 334, code: "LTD600W05", name: "Limited Edition Jersey", category: "Jerseys", unit: "pcs", quantity: -9, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 335, code: "LTD600W06", name: "Limited Edition Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 336, code: "LTD600W07", name: "Limited Edition Jersey", category: "Jerseys", unit: "pcs", quantity: -8, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 337, code: "OGS100W01", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 8, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 338, code: "OGS100W05", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 339, code: "OGS100W06", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 340, code: "OGS400W01", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 341, code: "OGS400W03", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 342, code: "OGS600B01", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 343, code: "OGS600B02", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 344, code: "OGS600B03", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 345, code: "OGS600W01", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 33, min: 5, max: 33, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 346, code: "OGS600W02", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 98, min: 5, max: 98, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 347, code: "OGS600W03", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: -16, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 348, code: "OGS600W04", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 54, min: 5, max: 54, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 349, code: "OGS600W05", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 37, min: 5, max: 37, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 350, code: "OGS600W06", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 351, code: "OGS600W07", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 12, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 352, code: "OGS800B01", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 353, code: "OGS800B03", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 11, min: 5, max: 20, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 354, code: "OGS800B04", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 10, min: 5, max: 20, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 355, code: "OGS800B05", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 6, min: 5, max: 20, unitCost: 0, location: "Sponsors Store", condition: "Good", status: "Active" },
  { id: 356, code: "PBS400B00", name: "Player Beeps", category: "Player Beeps", unit: "pcs", quantity: -10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 357, code: "PBS400G00", name: "Player Beeps", category: "Player Beeps", unit: "pcs", quantity: -10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 358, code: "PBS400R00", name: "Player Beeps", category: "Player Beeps", unit: "pcs", quantity: -10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 359, code: "PBS400Y00", name: "Player Beeps", category: "Player Beeps", unit: "pcs", quantity: -10, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 360, code: "PGS200B04", name: "Player Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 3, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 361, code: "PGS200B05", name: "Player Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 362, code: "PGS400B01", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 7, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 363, code: "PGS400B012", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 50, min: 5, max: 50, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 364, code: "PGS400B013", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: 16, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 365, code: "PGS400B02", name: "Official Golf Shirt", category: "Golf Shirts", unit: "pcs", quantity: -15, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 366, code: "PMJ100M02", name: "Promotion Jersey", category: "Jerseys", unit: "pcs", quantity: -4, min: 5, max: 20, unitCost: 0, location: "Secretariate Store", condition: "Good", status: "Active" },
  { id: 367, code: "PVJ200P02", name: "Player Version Jersy", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 368, code: "PVJ200P04", name: "Player Version Jersy", category: "Jerseys", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 369, code: "PVJ400G01", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 15, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 370, code: "PVJ400G02", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -7, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 371, code: "PVJ400G03", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 372, code: "PVJ400P01", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 17, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 373, code: "PVJ400P02", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 11, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 374, code: "PVJ400W01", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 17, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 375, code: "PVJ400W02", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 13, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 376, code: "PVJ500G01", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 377, code: "PVJ500G02", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 378, code: "PVJ500P01", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 379, code: "PVJ500P02", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 380, code: "PVJ500W01", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 381, code: "PVJ500W02", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 382, code: "PVJ6000G01", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 383, code: "PVJ6000G02", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 384, code: "PVJ6000G03", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 385, code: "PVJ6000G04", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 386, code: "PVJ600G07", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 387, code: "PVJ600G18", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 388, code: "PVJ600G20", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 389, code: "PVJ600G22", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -8, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 390, code: "PVJ600G24", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 391, code: "PVJ600G28", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 392, code: "PVJ600P18", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 393, code: "PVJ600P20", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 394, code: "PVJ600P22", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 395, code: "PVJ600P24", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -7, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 396, code: "PVJ600W18", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 397, code: "PVJ600W20", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 398, code: "PVJ600W22", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -7, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 399, code: "PVJ600W24", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -5, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 400, code: "PVJ600W28", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 401, code: "PVK600P28", name: "Player Version Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 402, code: "RCT200B01", name: "Rain Coat", category: "Raincoats", unit: "pcs", quantity: 25, min: 5, max: 25, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 403, code: "RCT200B02", name: "Rain Coat", category: "Raincoats", unit: "pcs", quantity: 20, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 404, code: "RCT200B03", name: "Rain Coat", category: "Raincoats", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 405, code: "RCT200B04", name: "Rain Coat", category: "Raincoats", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 406, code: "RCT600B01", name: "Rain Coat", category: "Raincoats", unit: "pcs", quantity: -4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 407, code: "RCT600B02", name: "Rain Coat", category: "Raincoats", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 408, code: "RCT600B03", name: "Rain Coat", category: "Raincoats", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 409, code: "RPF600P03", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 410, code: "RPJ600-22", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 411, code: "RPJ600-24", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 412, code: "RPJ600G24", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 413, code: "RPJ600G28", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 414, code: "RPJ600GO2", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 415, code: "RPJ600P20", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 416, code: "RPJ600P22", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 417, code: "RPJ600P24", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 418, code: "RPJ600W1", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 419, code: "RPJ600W28", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 420, code: "RPV600P18", name: "Replica Jersey", category: "Jerseys", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 421, code: "TKT200B02", name: "Training Kit", category: "Training Kits", unit: "pcs", quantity: -7, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 422, code: "TKT200B03", name: "Training Kit", category: "Training Kits", unit: "pcs", quantity: -7, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 423, code: "TKT200Z06", name: "Training Kit", category: "Training Kits", unit: "pcs", quantity: 2, min: 5, max: 20, unitCost: 0, location: "Senior Team Store", condition: "Good", status: "Active" },
  { id: 424, code: "TKT300Z01", name: "Training Kit", category: "Training Kits", unit: "pcs", quantity: 13, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 425, code: "TKT300Z02", name: "Training Kit", category: "Training Kits", unit: "pcs", quantity: 15, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 426, code: "TKT300Z03", name: "Training Kit", category: "Training Kits", unit: "pcs", quantity: 1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 427, code: "TST300B03", name: "Track Suit", category: "Track Suits", unit: "pcs", quantity: -6, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 428, code: "TST500B03", name: "Track Suit", category: "Track Suits", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 429, code: "TST600B01", name: "Track Suit", category: "Track Suits", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 430, code: "TST600B02", name: "Track Suit", category: "Track Suits", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 431, code: "TST600B03", name: "Track Suit", category: "Track Suits", unit: "pcs", quantity: -3, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 432, code: "TST600B04", name: "Track Suit", category: "Track Suits", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 433, code: "TST7000B01", name: "Track Suit", category: "Track Suits", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 434, code: "TVB400B00", name: "Travelling Bag", category: "Bags", unit: "pcs", quantity: -2, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 435, code: "TVB700B00", name: "Traveling Bags", category: "Bags", unit: "pcs", quantity: -7, min: 5, max: 20, unitCost: 0, location: "Board Members Store", condition: "Good", status: "Active" },
  { id: 436, code: "VST400B03", name: "Vest", category: "Vests", unit: "pcs", quantity: -1, min: 5, max: 20, unitCost: 0, location: "Reserve Team Store", condition: "Good", status: "Active" },
  { id: 437, code: "VST500B01", name: "Vest", category: "Vests", unit: "pcs", quantity: 0, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
  { id: 438, code: "VST500B02", name: "Vest", category: "Vests", unit: "pcs", quantity: 4, min: 5, max: 20, unitCost: 0, location: "Main Warehouse", condition: "Good", status: "Active" },
];

// Real historical finance data imported from:
// - Cashbook_2026_season_Operations_Account_1_.xlsx (Operations Account)
// - Revenue_Cashbook_2025_Season.xlsx (Revenue Account)
// Shown as provided; status is Approved since these are already-actual, past transactions.
const seedFinanceTx = [
{code:"FIN-00001",type:"Expense",category:"Bank Charges & Fees",amount:12600,date:"2025-01-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00002",type:"Income",category:"Donations",amount:5000000,date:"2025-02-11",description:"Cheque Deposit - NBM Chq:002225<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00003",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:5000000,date:"2025-02-21",description:"Online Banking Transfer - Transfer for Feb<Transfer for Feb 2025 Week 3 Budget",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00004",type:"Expense",category:"Bank Charges & Fees",amount:12600,date:"2025-02-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00005",type:"Income",category:"Donations",amount:714285.71,date:"2025-02-26",description:"Online Banking Transfer - Ekhaya Football club Share of Costs",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00006",type:"Income",category:"Donations",amount:714285.71,date:"2025-02-26",description:"Online Banking Transfer - Ekhaya Hardelec Shared cost for Ekh",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00007",type:"Income",category:"Donations",amount:714285.71,date:"2025-02-26",description:"Online Banking Transfer - Ekhaya football club share",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00008",type:"Income",category:"Donations",amount:3000000,date:"2025-02-26",description:"Cash Deposit - KAVINA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00009",type:"Income",category:"Sponsorship",amount:7500000,date:"2025-02-26",description:"Online Banking Transfer - SPONSOR SHIP FOR FOOTBALL",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00010",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:12000000,date:"2025-02-26",description:"Online Banking Transfer - Salary Funding<Salary Funding",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00011",type:"Income",category:"Donations",amount:1000000,date:"2025-02-27",description:"Online Banking Transfer - Northgate contribution",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00012",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:1600000,date:"2025-03-14",description:"Online Banking Transfer - Revenue to Ekhay<Revenue to Ekhaya Ops",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00013",type:"Income",category:"Jersey & Merchandise",amount:200000,date:"2025-03-19",description:"Transfer In - CHIMWEMWE CHIGOM<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00014",type:"Expense",category:"Bank Charges & Fees",amount:12600,date:"2025-03-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00015",type:"Income",category:"Jersey & Merchandise",amount:1334900,date:"2025-03-28",description:"Cash Deposit - BLESSINGS NGWEMBELE",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00016",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:1500000,date:"2025-04-04",description:"Online Banking Transfer - Revenue to Ekhay<Revenue to Ekhaya Ops",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00017",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:130000,date:"2025-04-08",description:"Online Banking Transfer - Revenue to Ops T<Revenue to",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00018",type:"Income",category:"Donations",amount:1000000,date:"2025-04-14",description:"Online Banking Transfer - sponsorship Ekhaya FC northgate",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00019",type:"Income",category:"Donations",amount:1000000,date:"2025-04-15",description:"Online Banking Transfer - sponsorship Ekhaya FC hardelec",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00020",type:"Income",category:"Donations",amount:1000000,date:"2025-04-15",description:"Online Banking Transfer - sponsorship Ekhaya FC zomba",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00021",type:"Income",category:"Gate Collections",amount:291000,date:"2025-04-15",description:"Cash Deposit - GATE COLLECTION EKHAYA<GREGORY MANDOWA 0881005507",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00022",type:"Income",category:"Donations",amount:1000000,date:"2025-04-15",description:"Online Banking Transfer - EK10SH to Ekhaya Fc contribution",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00023",type:"Income",category:"Sponsorship",amount:7500000,date:"2025-04-16",description:"Online Banking Transfer - Ekhaya Football Club Sponsorship",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00024",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:11700000,date:"2025-04-19",description:"Online Banking Transfer - EFC Salaries Acc<EFC Salaries Account",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00025",type:"Income",category:"Gate Collections",amount:585000,date:"2025-04-22",description:"Cash Deposit - ONLY BANDA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00026",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-04-22",description:"Transfer In - MBENDERA GEORGE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00027",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-04-24",description:"Online Banking Transfer - EKHAYA GOLD JERSEY",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00028",type:"Income",category:"Donations",amount:1000000,date:"2025-04-24",description:"Online Banking Transfer - EK10SH to Ekhaya FC contribution fo",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00029",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-04-25",description:"Mobile Banking Transfer - From: JOHN JAMES MAKONDETSA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00030",type:"Income",category:"Donations",amount:1000000,date:"2025-04-25",description:"Online Banking Transfer - Ekhaya FC Sponsorship",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00031",type:"Income",category:"Jersey & Merchandise",amount:300000,date:"2025-04-25",description:"Transfer In - FARAHAMA YUSUF<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00032",type:"Income",category:"Donations",amount:3000000,date:"2025-04-25",description:"Online Banking Transfer - Support from Ekhaya Farm",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00033",type:"Expense",category:"Bank Charges & Fees",amount:12600,date:"2025-04-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00034",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:6200000,date:"2025-04-26",description:"Online Banking Transfer - Revenue to Ops T<Revenue to Ops Transfer",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00035",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-04-26",description:"Transfer In - ROMEO<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00036",type:"Income",category:"Jersey & Merchandise",amount:360000,date:"2025-04-26",description:"Online Banking Transfer - Will and Norah Jerseys",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00037",type:"Income",category:"Gate Collections",amount:531800,date:"2025-04-28",description:"Cash Deposit - ISAAC 0999769946",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00038",type:"Income",category:"Jersey & Merchandise",amount:240000,date:"2025-04-28",description:"Transfer In - KAMWENDO MZANGA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00039",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-04-28",description:"Cash Deposit - BLESSINGS GWEMBELE-0885157708",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00040",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-04-29",description:"Transfer In - PHIRI CHIKUMBUTS<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00041",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-04-30",description:"Online Banking Transfer - Luntha Payment",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00042",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-05-02",description:"Mobile Banking Transfer - From: CRISPIN RODNEY MTIKE",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00043",type:"Income",category:"Jersey & Merchandise",amount:240000,date:"2025-05-02",description:"Transfer In - GRAHAM CHIPANDE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00044",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-02",description:"Transfer In - MTHUNZI WHAYO<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00045",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:1300000,date:"2025-05-02",description:"Online Banking Transfer - Revenue to Ops T<Revenue to Ops Transfer",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00046",type:"Income",category:"Jersey & Merchandise",amount:240000,date:"2025-05-02",description:"Mobile Banking Transfer - From: ESTHER COROA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00047",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-05-02",description:"Cash Deposit - BLESSINGS GWEMBELE",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00048",type:"Income",category:"Jersey & Merchandise",amount:180000,date:"2025-05-02",description:"Transfer In - PATRICIA JIMU<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00049",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-02",description:"EFT Incoming - National Bank<Payer Details- NSEULA CHARLES YAMIK     <Reference-                              <d78228a88a564e178b530fb8f6b6c855",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00050",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-02",description:"Mobile Banking Transfer - From: FOSTINO MAELE",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00051",type:"Income",category:"Jersey & Merchandise",amount:90000,date:"2025-05-03",description:"Mobile Banking Transfer - From: MICHAEL BRIGHT SOMANJE",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00052",type:"Income",category:"Jersey & Merchandise",amount:30000,date:"2025-05-03",description:"Mobile Banking Transfer - From: MICHAEL BRIGHT SOMANJE",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00053",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-03",description:"Mobile Banking Transfer - From: KANKONDO JOHN",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00054",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-05-05",description:"Mobile Banking Transfer - From: WILLIAM MPINGANJIRA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00055",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-05",description:"Cash Deposit - BLESSINGS GWEMBELE 0885157708",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00056",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-06",description:"Transfer In - HAU KLEMA CHISOM<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00057",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-06",description:"Cash Deposit - BLESSINGS",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00058",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-06",description:"Mobile Banking Transfer - From: CHIPUNGU ALEX KENNIE ALLAN",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00059",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-08",description:"Mobile Banking Transfer - From: EDGAR LEWIS CHILUMPHA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00060",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-08",description:"Mobile Banking Transfer - From: MATHEWS MTIMAUKANENA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00061",type:"Income",category:"Donations",amount:1500000,date:"2025-05-08",description:"Online Banking Transfer - EK10SH to Ekhaya FC contibution for",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00062",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-09",description:"Mobile Banking Transfer - From: MADALO KALEKENI PHIRI",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00063",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-05-12",description:"Online Banking Transfer - Nazil Jerseys",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00064",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-12",description:"Online Banking Transfer - Jersey",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00065",type:"Income",category:"Jersey & Merchandise",amount:840000,date:"2025-05-13",description:"Online Banking Transfer - Unima Ekhaya Replicas",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00066",type:"Income",category:"Sponsorship",amount:7500000,date:"2025-05-13",description:"Online Banking Transfer - sponsorship Ekhaya FC",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00067",type:"Income",category:"Jersey & Merchandise",amount:240000,date:"2025-05-13",description:"Online Banking Transfer - G Chitera Replicas",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00068",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-16",description:"Mobile Banking Transfer - From: MICHAEL EDWARD",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00069",type:"Income",category:"Jersey & Merchandise",amount:480000,date:"2025-05-16",description:"Cash Deposit - BLESSINGS GWEMBELE<-0885157708",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00070",type:"Income",category:"Jersey & Merchandise",amount:15000,date:"2025-05-16",description:"Cash Deposit - BLESSINGS GWEMBELE<-0885157708",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00071",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-16",description:"Transfer In - TANAKA PHILIP CH<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00072",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-16",description:"Transfer In - GAZA INVESTMENTS<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00073",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-16",description:"Transfer In - PETER MUKHITO<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00074",type:"Income",category:"Jersey & Merchandise",amount:146000,date:"2025-05-16",description:"Transfer In - From Acc.No. - 1040100794395",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00075",type:"Income",category:"Jersey & Merchandise",amount:240000,date:"2025-05-16",description:"Transfer In - MR STANISLAUS SA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00076",type:"Income",category:"Gate Collections",amount:143000,date:"2025-05-17",description:"Online Banking Transfer - Kamuzu Barracks vs Ekhaya FC",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00077",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-19",description:"Transfer In - DANIEL CHILIMA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00078",type:"Income",category:"Gate Collections",amount:208500,date:"2025-05-19",description:"Cash Deposit - JENNIFER CHAPOTERA 0981990953",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00079",type:"Income",category:"Jersey & Merchandise",amount:480000,date:"2025-05-19",description:"Cash Deposit - BLESSINGS 0885157708",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00080",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-20",description:"Transfer In - ROMEO<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00081",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-05-21",description:"Transfer In - MPHATSO ZANGALAM<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00082",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-21",description:"Transfer In - From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00083",type:"Income",category:"Gate Collections",amount:418000,date:"2025-05-22",description:"Cash Deposit - GATE COLLECTION BY G MANDOWA 088100<5507",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00084",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-22",description:"Mobile Banking Transfer - From: CHIPUNGU ALEX KENNIE",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00085",type:"Income",category:"Donations",amount:1500000,date:"2025-05-22",description:"Online Banking Transfer - sponsorship Ekhaya FC mibawa",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00086",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:16000000,date:"2025-05-23",description:"Online Banking Transfer - Funds Transfer f<Funds Transfer for salaries",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00087",type:"Expense",category:"Bank Charges & Fees",amount:16300,date:"2025-05-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00088",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-05-30",description:"Transfer In - HAMISI TADALA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00089",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-30",description:"Transfer In - GAZA INVESTMENTS<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00090",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-05-30",description:"Transfer In - CHIMENYA ANTHONY<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00091",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-30",description:"Transfer In - MR JEFFREY LIMBI<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00092",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-30",description:"Online Banking Transfer - Jersey",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00093",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-05-31",description:"Transfer In - From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00094",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-02",description:"Transfer In - TIKHALA S MBEDZA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00095",type:"Income",category:"Gate Collections",amount:113000,date:"2025-06-02",description:"Cash Deposit - JENNIFER CHAPOTERA 0981990953",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00096",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-04",description:"Mobile Banking Transfer - From: MATHEWS MTIMAUKANENA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00097",type:"Income",category:"Jersey & Merchandise",amount:660000,date:"2025-06-04",description:"Online Banking Transfer - TP Mpinganjira Shirts",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00098",type:"Income",category:"Gate Collections",amount:27000,date:"2025-06-05",description:"Transfer In - SUPER LEAGUE ASS<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00099",type:"Income",category:"Gate Collections",amount:750000,date:"2025-06-05",description:"Cash Deposit - G MKOMADZINJA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00100",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-06",description:"Mobile Banking Transfer - From: LIMBANI LUNDU",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00101",type:"Income",category:"Other Income",amount:60000,date:"2025-06-10",description:"Transfer In - MS RUTH SHUMBA<From Acc.",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00102",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:60000,date:"2025-06-10",description:"Transfer In - MS RUTH SHUMBA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00103",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-10",description:"Transfer In - MS RUTH SHUMBA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00104",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-10",description:"Transfer In - PANGANI EVANCE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00105",type:"Income",category:"Jersey & Merchandise",amount:180000,date:"2025-06-11",description:"EFT Incoming - National Bank<Payer Details- MISS PATRICIA NANKHU     <Reference-                              <b5f25d3d5e7f496889128a890aa4f4e4",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00106",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-13",description:"Transfer In - MRS ELIZABETH BL<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00107",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-06-13",description:"Mobile Banking Transfer - From: BERSON SENZANI",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00108",type:"Income",category:"Jersey & Merchandise",amount:1337000,date:"2025-06-13",description:"Cash Deposit - BLESSINGS-0885157708",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00109",type:"Income",category:"Gate Collections",amount:517700,date:"2025-06-16",description:"Cash Deposit - EKHAYA VS CLERK 0988874881",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00110",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-17",description:"Transfer In - MALIRAKWENDA RIC<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00111",type:"Income",category:"Jersey & Merchandise",amount:240000,date:"2025-06-18",description:"Online Banking Transfer - Mtetemera Jerseys",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00112",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-20",description:"Mobile Banking Transfer - From: BRIGHT GREY NYAUTI",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00113",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-20",description:"Mobile Banking Transfer - From: CHIKONDI MILIMO",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00114",type:"Income",category:"Jersey & Merchandise",amount:180000,date:"2025-06-21",description:"Online Banking Transfer",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00115",type:"Income",category:"Jersey & Merchandise",amount:180000,date:"2025-06-21",description:"Mobile Banking Transfer - From: JACOB MWAKAJUMBA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00116",type:"Income",category:"Subventions",amount:5000000,date:"2025-06-21",description:"Oneclick Bulk Payment - 2025 Club Subven<Ben Name: Ekhaya FC Our ref: 2025  <Club Subven Batch: 466582-3",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00117",type:"Income",category:"Gate Collections",amount:249700,date:"2025-06-23",description:"Cash Deposit - ISAAC",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00118",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:11000000,date:"2025-06-25",description:"Online Banking Transfer - Funds Transfer f<Funds Transfer for salaries",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00119",type:"Expense",category:"Bank Charges & Fees",amount:16300,date:"2025-06-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00120",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-06-27",description:"Transfer In - PRISCILLA CHIPPO<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00121",type:"Income",category:"Jersey & Merchandise",amount:30000,date:"2025-06-28",description:"Mobile Banking Transfer - From: ALLAN SABWERA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00122",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-06-28",description:"Transfer In - MUSTAFA GEOFFREY<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00123",type:"Income",category:"Gate Collections",amount:1164063.54,date:"2025-06-30",description:"Cash Deposit - ISHMAEL 0888033281",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00124",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-01",description:"Mobile Banking Transfer - From: GEORGE FRANK",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00125",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-07-02",description:"Mobile Banking Transfer - From: YAMIKANI NOEL NYIRENDA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00126",type:"Income",category:"Jersey & Merchandise",amount:108000,date:"2025-07-02",description:"Mobile Banking Transfer - From: YAMIKANI NOEL NYIRENDA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00127",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-02",description:"Transfer In - DUNCAN FRANK MAB<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00128",type:"Income",category:"Jersey & Merchandise",amount:240000,date:"2025-07-02",description:"Mobile Banking Transfer - From: PEMPHO MUSSA MAKINA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00129",type:"Income",category:"Gate Collections",amount:6727800,date:"2025-07-03",description:"Cash Deposit - EKHAYA VS BULLETS IDAH CHANZA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00130",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-03",description:"Transfer In - SHINGIRAI MBENDE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00131",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-03",description:"Transfer In - TYRE XPRESS TYRE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00132",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:6000000,date:"2025-07-04",description:"Online Banking Transfer - Transfer Operati<Transfer Operations Account",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00133",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:2000000,date:"2025-07-04",description:"Online Banking Transfer - Transfer to Sala<Transfer to Salaries Account",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00134",type:"Income",category:"Jersey & Merchandise",amount:1130000,date:"2025-07-04",description:"Cash Deposit - BLESSINGS<FOR REPLICA JERSY",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00135",type:"Income",category:"Donations",amount:1500000,date:"2025-07-04",description:"Oneclick Bulk Payment - Contibution For <Ben Name: Ekhaya Football Our ref: <Contibution For Batch: 471676-1",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00136",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-04",description:"Transfer In - NYAMBALO ANDREW<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00137",type:"Income",category:"Other Income",amount:4500000,date:"2025-07-04",description:"Cash Deposit - GILBERT MSINDA 0995589118",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00138",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-07-04",description:"Mobile Banking Transfer - From: AUBREY NYIRONGO",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00139",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:4500000,date:"2025-07-05",description:"Transfer - Motor Vehicle maintenance : 471961",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00140",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-07-08",description:"Mobile Banking Transfer - From: RONALD CHIMCHERE",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00141",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-07-10",description:"Mobile Banking Transfer - From: ANTHONY BLAZIO MASAMBA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00142",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-07-10",description:"Mobile Banking Transfer - From: STELLA MSOSA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00143",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-10",description:"Transfer In - MANDIZA JAMES K<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00144",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-11",description:"Transfer In - MR TALUMBA NAMAT<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00145",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-11",description:"Transfer In - BRIDGET KALIMANJ<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00146",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-11",description:"Transfer In - MR ANDREW MALISE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00147",type:"Income",category:"Jersey & Merchandise",amount:216000,date:"2025-07-11",description:"Transfer In - THEODORE MWAYI K<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00148",type:"Income",category:"Gate Collections",amount:10492850,date:"2025-07-14",description:"Cash Deposit - EKHAYA VS WANDERERS GREGORY MANDOWA<0881005507",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00149",type:"Income",category:"Jersey & Merchandise",amount:453000,date:"2025-07-14",description:"Cash Deposit - MONEY FOR REPLICA JERSEY",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00150",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:14000000,date:"2025-07-15",description:"Online Banking Transfer - Transfer to Oper<Transfer to Operations Account",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00151",type:"Income",category:"Jersey & Merchandise",amount:396000,date:"2025-07-16",description:"Online Banking Transfer - Club President Replicas",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00152",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-07-16",description:"Online Banking Transfer - Kumbu Jimusole Replica",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00153",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-16",description:"Mobile Banking Transfer - From: STELLA RAXIE KAMWANA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00154",type:"Income",category:"Donations",amount:3000000,date:"2025-07-17",description:"Online Banking Transfer - Ekhaya FC zomba hardelec",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00155",type:"Income",category:"Donations",amount:4500000,date:"2025-07-17",description:"Online Banking Transfer - Ekhaya FC northgate mibawa",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00156",type:"Income",category:"Jersey & Merchandise",amount:108000,date:"2025-07-18",description:"Transfer In - From Acc.No. - 1970100076147",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00157",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-18",description:"Mobile Banking Transfer - From: LUSEKELO DAVID MWALWANDA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00158",type:"Income",category:"Donations",amount:2000000,date:"2025-07-19",description:"Online Banking Transfer - Ekhaya FC Resort",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00159",type:"Income",category:"Gate Collections",amount:267950,date:"2025-07-21",description:"Cash Deposit - EKHAYA VS MOYALE<GREGORY MANDOWA 0881005507",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00160",type:"Income",category:"Donations",amount:1500000,date:"2025-07-21",description:"Online Banking Transfer - Ekhaya FC mibawa",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00161",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-22",description:"Transfer In - LIKWEMBA LOUIS<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00162",type:"Income",category:"Jersey & Merchandise",amount:76000,date:"2025-07-22",description:"Mobile Banking Transfer - From: ADAM MBETA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00163",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:12000000,date:"2025-07-24",description:"Online Banking Transfer - Transfer to Sala<Transfer to Salaries AC",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00164",type:"Income",category:"Donations",amount:1500000,date:"2025-07-24",description:"Online Banking Transfer - Ekhaya FC mangochi",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00165",type:"Expense",category:"Bank Charges & Fees",amount:16300,date:"2025-07-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00166",type:"Income",category:"Jersey & Merchandise",amount:108000,date:"2025-07-29",description:"Transfer In - AKUZIKE KUNYUMBU<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00167",type:"Income",category:"Gate Collections",amount:1431000,date:"2025-07-30",description:"Cash Deposit - MIKE LEMEKANI",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00168",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-07-30",description:"EFT Incoming - Standard Bank<Payer Details- EDEN FARMS 1 Reference-  <24486189S91026804300725",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00169",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-07-31",description:"Transfer In - MR HARRY SAMBANI<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00170",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-07-31",description:"Transfer In - MACDONALD MTUWA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00171",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:4000000,date:"2025-08-01",description:"Online Banking Transfer - Transfer to Oper<Transfer to Operations Account",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00172",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-08-04",description:"Transfer In - LIMBANI CHAKHOMA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00173",type:"Income",category:"Jersey & Merchandise",amount:36750,date:"2025-08-04",description:"Mobile Banking Transfer - From: ALICK LUNGU",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00174",type:"Income",category:"Donations",amount:1500000,date:"2025-08-05",description:"Oneclick Bulk Payment - Contibution For <Ben Name: EKHAYA FOOTBALL Our ref: <Contibution For Batch: 482957-1",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00175",type:"Income",category:"Other Income",amount:4500000,date:"2025-08-06",description:"EFT Incoming - National Bank<Payer Details- CIVIL SERVICE UNITED     <Reference-                              <87192c887fc5443ea8548eb7a35804ea",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00176",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-08-06",description:"Transfer In - INESS CHIKAFA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00177",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:4500000,date:"2025-08-06",description:"Transfer - Reversal Wrong Account Deposit :   <483329",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00178",type:"Income",category:"Jersey & Merchandise",amount:1756400,date:"2025-08-08",description:"Cash Deposit - AMON CHIRWA-0881337156<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00179",type:"Income",category:"Jersey & Merchandise",amount:360000,date:"2025-08-08",description:"Transfer In - SHIFT COMPANY LI<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00180",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-08-09",description:"Transfer In - MR CHIMWEMWE JUW<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00181",type:"Income",category:"Jersey & Merchandise",amount:170000,date:"2025-08-11",description:"Transfer In - MISS WINNIE MALE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00182",type:"Income",category:"Other Income",amount:1000000,date:"2025-08-11",description:"Cash Deposit - CIVIL VS WANDERES MIKE",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00183",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-08-13",description:"Transfer In - MBAYA MORRIS MAT<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00184",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-08-14",description:"Transfer In - RONALD ZELEZA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00185",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-08-14",description:"EFT Incoming - National Bank<Payer Details- MISS PRISCA NJONJO K     <Reference-                              <8dec22fefc254a548c1c0a58d50606c5",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00186",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:4000000,date:"2025-08-15",description:"Online Banking Transfer - Transfer to Oper<Transfer to Operations Account",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00187",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-08-18",description:"Transfer In - BLESSINGS KAPHIK<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00188",type:"Income",category:"Gate Collections",amount:83000,date:"2025-08-19",description:"Cash Deposit - JK 0888053281<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00189",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-08-19",description:"Mobile Banking Transfer - From: EMMANUEL VINCENT NANTHURU",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00190",type:"Income",category:"Jersey & Merchandise",amount:180000,date:"2025-08-22",description:"Online Banking Transfer - President Invoice 047",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00191",type:"Income",category:"Gate Collections",amount:297500,date:"2025-08-25",description:"Cash Deposit - GREGORY MANDOWA 0881005507",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00192",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-08-25",description:"Mobile Banking Transfer - From: FRANCIS MKONDA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00193",type:"Expense",category:"Bank Charges & Fees",amount:16300,date:"2025-08-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00194",type:"Income",category:"Jersey & Merchandise",amount:468000,date:"2025-08-26",description:"Online Banking Transfer - KMtambo Replicas",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00195",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-08-27",description:"Mobile Banking Transfer - From: PEMPHO MUSSA MAKINA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00196",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-08-28",description:"Transfer In - GIFT MBENDERA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00197",type:"Income",category:"Gate Collections",amount:53000,date:"2025-08-29",description:"Transfer In - MR THANDO KASO M<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00198",type:"Income",category:"Gate Collections",amount:270000,date:"2025-08-29",description:"Cash Deposit - JENNIFER CHAPOTERA 0981990953",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00199",type:"Income",category:"Jersey & Merchandise",amount:300000,date:"2025-09-01",description:"Mobile Banking Transfer - From: UPILE CHIWAYA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00200",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-09-02",description:"Online Banking Transfer - President Inv 049",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00201",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-09-02",description:"Online Banking Transfer - President Inv 015",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00202",type:"Income",category:"Jersey & Merchandise",amount:180000,date:"2025-09-02",description:"Online Banking Transfer - President Inv 008",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00203",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-09-02",description:"Online Banking Transfer - President Inv 010",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00204",type:"Income",category:"Jersey & Merchandise",amount:120000,date:"2025-09-02",description:"Online Banking Transfer - President Inv 011",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00205",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-09-02",description:"Agent Deposit - AGT18616594<Payer Details- AGENT CASH DEPOSIT<CASH<0990560419 Reference-",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00206",type:"Income",category:"Jersey & Merchandise",amount:180000,date:"2025-09-02",description:"Online Banking Transfer - President Inv 009",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00207",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-09-04",description:"Agent Deposit - AGT18616594<Payer Details- AGENT CASH DEPOSIT<CASH<099019540 Reference-",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00208",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-09-05",description:"Mobile Banking Transfer - From: BLESSINGS KABICHI",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00209",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-09-05",description:"Transfer In - MZUNGU GARY<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00210",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-09-05",description:"Oneclick Bulk Payment - replica jerseys<Ben Name: Ekhaya Football Our ref: <replica jerseys Batch: 494629-1",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00211",type:"Income",category:"Other Income",amount:10000000,date:"2025-09-06",description:"Cash Deposit - HARRY MSISKA 0999872330",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00212",type:"Income",category:"Other Income",amount:2693157.13,date:"2025-09-09",description:"Transfer In - PHIRI LINDANI WE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00213",type:"Income",category:"Jersey & Merchandise",amount:350000,date:"2025-09-09",description:"Mobile Banking Transfer - From: CHIMWEMWE NKUNIKA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00214",type:"Income",category:"Jersey & Merchandise",amount:144000,date:"2025-09-10",description:"Online Banking Transfer",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00215",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:1000000,date:"2025-09-11",description:"Transfer - Redirection of a cash deposit to FA<: 496268",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00216",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-09-12",description:"Transfer In - ROBINS GONDWE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00217",type:"Income",category:"Jersey & Merchandise",amount:360000,date:"2025-09-12",description:"Online Banking Transfer - President Inv 053",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00218",type:"Income",category:"Jersey & Merchandise",amount:144000,date:"2025-09-12",description:"Online Banking Transfer - President Inv 054",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00219",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:16000000,date:"2025-09-13",description:"Online Banking Transfer - Funds Transfer f<Funds Transfer from Revenue AC to",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00220",type:"Income",category:"Jersey & Merchandise",amount:36500,date:"2025-09-17",description:"Transfer In - MISS MIRRIAM RED<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00221",type:"Income",category:"Jersey & Merchandise",amount:36500,date:"2025-09-20",description:"Transfer In - From Acc.No. - 1040100794395",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00222",type:"Income",category:"Jersey & Merchandise",amount:43000,date:"2025-09-22",description:"Transfer In - MR THANDO KASO M<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00223",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-09-24",description:"Transfer In - From Acc.No. - 1040100794395",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00224",type:"Expense",category:"Bank Charges & Fees",amount:16300,date:"2025-09-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00225",type:"Income",category:"Jersey & Merchandise",amount:540000,date:"2025-09-26",description:"Mobile Banking Transfer - From: CHIMWEMWE NKUNIKA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00226",type:"Income",category:"Jersey & Merchandise",amount:108000,date:"2025-09-29",description:"Online Banking Transfer - Ekhaya Jerseys",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00227",type:"Income",category:"Jersey & Merchandise",amount:684000,date:"2025-09-29",description:"Transfer In - CHIPEYA BERNARD<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00228",type:"Income",category:"Jersey & Merchandise",amount:60000,date:"2025-09-29",description:"Cash Deposit - ISHMAEL 0888033281",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00229",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-09-29",description:"Transfer In - 4L<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00230",type:"Income",category:"Jersey & Merchandise",amount:2064000,date:"2025-09-30",description:"Cash Deposit - BLESSINGS GWEMBELE 0885157708<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00231",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-10-06",description:"Mobile Banking Transfer - From: STELLA RAXIE KAMWANA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00232",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-10-07",description:"Transfer In - KANYENGE HANNA M<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00233",type:"Income",category:"TV Rights",amount:5140602.94,date:"2025-10-07",description:"EFT Incoming - Standard Bank<Payer Details- SUPER LEAGUE Reference-  <25310503S98890869071025",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00234",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-10-10",description:"Transfer In - VANESSA UPILE KA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00235",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-10-10",description:"Mobile Banking Transfer - From: SEBASTIAN KAMPEREWERA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00236",type:"Income",category:"Jersey & Merchandise",amount:360000,date:"2025-10-14",description:"Mobile Banking Transfer - From: CHIMWEMWE NKUNIKA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00237",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:6000000,date:"2025-10-16",description:"Online Banking Transfer - Funds Transfer f<Funds Transfer from Revenue AC to",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00238",type:"Income",category:"Jersey & Merchandise",amount:648000,date:"2025-10-17",description:"Transfer In - MR AMMON CHIRWA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00239",type:"Income",category:"Jersey & Merchandise",amount:216000,date:"2025-10-18",description:"Mobile Banking Transfer - From: CHIMWEMWE NKUNIKA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00240",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-10-22",description:"EFT Incoming - National Bank<Payer Details- HENDERSON MKANDAWIRE     <Reference-                              <e587afd9f35b45a7b1006330ac1b9f96",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00241",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:3000000,date:"2025-10-22",description:"Online Banking Transfer - Funds Transfer t<Funds Transfer to Salaries Account",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00242",type:"Income",category:"Gate Collections",amount:187000,date:"2025-10-23",description:"Cash Deposit - GREGORY MANDOWA 0881005507",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00243",type:"Income",category:"Jersey & Merchandise",amount:432000,date:"2025-10-24",description:"Transfer In - MR AMMON CHIRWA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00244",type:"Income",category:"Jersey & Merchandise",amount:1380000,date:"2025-10-24",description:"Oneclick Bulk Payment - June 2025 Jersey-Loan Recoveries-EFC Payroll Batch: 509855-2",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00245",type:"Income",category:"Jersey & Merchandise",amount:1440000,date:"2025-10-24",description:"Oneclick Bulk Payment - Sept 2025 Jersey-Loan Recoveries-EFC Payroll Batch: 509855-2",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00246",type:"Income",category:"Jersey & Merchandise",amount:1380000,date:"2025-10-24",description:"Oneclick Bulk Payment - June 2025 Jersey-Loan Recoveries-EFC Payroll Batch: 509855-2",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00247",type:"Income",category:"Jersey & Merchandise",amount:3492000,date:"2025-10-24",description:"Oneclick Bulk Payment - Aug 2025 Jersey <Ben Name: Ekhaya Football Our ref: <Aug 2025 Jersey Batch: 509855-4",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00248",type:"Income",category:"Jersey & Merchandise",amount:540000,date:"2025-10-24",description:"Oneclick Bulk Payment - Oct 2025 Jersey <Ben Name: Ekhaya Football Our ref: <Oct 2025 Jersey Batch: 509855-6",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00249",type:"Expense",category:"Bank Charges & Fees",amount:16300,date:"2025-10-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00250",type:"Income",category:"Gate Collections",amount:97700,date:"2025-10-28",description:"Cash Deposit - EKHAYA VS BLUE EAGLES G MANDOWA 088<1005507",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00251",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-11-01",description:"Transfer In - TMUSKAMBO<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00252",type:"Income",category:"Subventions",amount:5000000,date:"2025-11-03",description:"EFT Incoming - Standard Bank<Payer Details- SUPER LEAGUE ASSOCI      <Reference- 25706515S1799491311025",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00253",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:16000000,date:"2025-11-04",description:"Online Banking Transfer - Funds Transfer f<Funds Transfer from Revenue AC to",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00254",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-11-05",description:"Mobile Banking Transfer - From: KAKHOBWE MAYAMIKO",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00255",type:"Income",category:"Gate Collections",amount:1769190.5,date:"2025-11-10",description:"Transfer In - SUPER LEAGUE ASS<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00256",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-11-13",description:"Transfer In - BRIGHT GREY NYAU<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00257",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-11-18",description:"Oneclick Bulk Payment - Ekhaya FC 071<Ben Name: Ekhaya FC Our ref: Ekhaya<FC 071 Batch: 517366-1",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00258",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-11-19",description:"Transfer In - From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00259",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-11-21",description:"Transfer In - MR WEBSTER PRINC<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00260",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-11-21",description:"Transfer In - MR KENNEDY NKHAW<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00261",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-11-22",description:"Agent Deposit - AGT18619876<Payer Details- AGENT CASH DEPOSIT<PARTY<099 Reference-",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00262",type:"Income",category:"Jersey & Merchandise",amount:35000,date:"2025-11-22",description:"Mobile Banking Transfer - From: JUSTIN NKANDO",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00263",type:"Income",category:"Jersey & Merchandise",amount:36000,date:"2025-11-24",description:"Transfer In - MR KELVIN MALING<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00264",type:"Expense",category:"Bank Charges & Fees",amount:16300,date:"2025-11-26",description:"Fees Debited - Bank Charges",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00265",type:"Income",category:"Jersey & Merchandise",amount:1404000,date:"2025-11-27",description:"Oneclick Bulk Payment - Nov 2025 2025 Jersey-Loan Recoveries-EFC Payroll Batch: 520345-2",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00266",type:"Income",category:"Jersey & Merchandise",amount:864000,date:"2025-11-28",description:"Cash Deposit - JERSEY SALES BY BRIGHT NYAUTI 09942<49190",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00267",type:"Income",category:"Jersey & Merchandise",amount:70000,date:"2025-12-01",description:"Mobile Banking Transfer - From: FRANCIS PATRICK MACLAY MADONA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00268",type:"Income",category:"Gate Collections",amount:825750,date:"2025-12-02",description:"Cash Deposit - SAM BANDA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00269",type:"Income",category:"Jersey & Merchandise",amount:360000,date:"2025-12-03",description:"Online Banking Transfer - Nandos Replica Inv 080",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00270",type:"Income",category:"Jersey & Merchandise",amount:180000,date:"2025-12-03",description:"Online Banking Transfer - Chileka Replica Inv 079",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00271",type:"Income",category:"Gate Collections",amount:165000,date:"2025-12-05",description:"Cash Deposit - ISAAC",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00272",type:"Income",category:"Jersey & Merchandise",amount:1152000,date:"2025-12-05",description:"Cash Deposit - JERSEY SALES 0885157708 BLESSINGS",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00273",type:"Income",category:"Jersey & Merchandise",amount:24000,date:"2025-12-08",description:"Mobile Banking Transfer - From: YAMIKANI NOEL NYIRENDA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00274",type:"Income",category:"Gate Collections",amount:2373054.75,date:"2025-12-08",description:"Cash Deposit - MPHATSO KASIYA 0999269165",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00275",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:9500000,date:"2025-12-09",description:"Online Banking Transfer - Funds Transfer f<Funds Transfer from Revenue AC to",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00276",type:"Income",category:"Gate Collections",amount:250000,date:"2025-12-11",description:"Cash Deposit - EKHAYA vs SILVER",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00277",type:"Income",category:"Jersey & Merchandise",amount:20000,date:"2025-12-15",description:"Transfer In - MS WONGANI NKHOM<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00278",type:"Income",category:"Gate Collections",amount:1708000,date:"2025-12-16",description:"Cash Deposit - GREGORY MANDOWA 0881005507",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00279",type:"Income",category:"Subventions",amount:5000000,date:"2025-12-16",description:"Transfer In - SUPER LEAGUE ASS<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00280",type:"Income",category:"TV Rights",amount:127387,date:"2025-12-18",description:"Transfer In - SUPER LEAGUE ASS<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00281",type:"Income",category:"Jersey & Merchandise",amount:72000,date:"2025-12-19",description:"Transfer In - DAVID CHIYEMBEKE<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00282",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:4400000,date:"2025-12-22",description:"Online Banking Transfer - Funds Transfer f<Funds Transfer from Revenue AC to",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00283",type:"Income",category:"Jersey & Merchandise",amount:24000,date:"2025-12-22",description:"Mobile Banking Transfer - From: DANIEL KAZIMA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00284",type:"Income",category:"Other Income",amount:141218.21,date:"2025-12-24",description:"Oneclick Bulk Payment - Staff Loan Recov<Ben Name: Ekhaya Football Our ref: <Staff Loan Recov Batch: 529576-2",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00285",type:"Income",category:"Jersey & Merchandise",amount:1176000,date:"2025-12-24",description:"Oneclick Bulk Payment - Dec 2025 Jersey <Ben Name: Ekhaya Football Our ref: <Dec 2025 Jersey Batch: 529576-3",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00286",type:"Expense",category:"Bank Charges & Fees",amount:16300,date:"2025-12-26",description:"Fees Debited - 1910000195208<",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00287",type:"Income",category:"Jersey & Merchandise",amount:96000,date:"2025-12-27",description:"Mobile Banking Transfer - From: DAMSON MADALITSO SULUMA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00288",type:"Income",category:"Jersey & Merchandise",amount:48000,date:"2025-12-27",description:"Mobile Banking Transfer - From: JIMMY TAULO",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00289",type:"Income",category:"Jersey & Merchandise",amount:48000,date:"2025-12-27",description:"Transfer In - MR WINSTONE CHUL<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00290",type:"Income",category:"Jersey & Merchandise",amount:48000,date:"2025-12-27",description:"Mobile Banking Transfer - From: ISHMAEL MANGANI",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00291",type:"Income",category:"Jersey & Merchandise",amount:48000,date:"2025-12-29",description:"Transfer In - PATRICK MKONDA<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00292",type:"Income",category:"Jersey & Merchandise",amount:48000,date:"2025-12-29",description:"Transfer In - CHIPEYA BERNARD<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00293",type:"Income",category:"Jersey & Merchandise",amount:96000,date:"2025-12-29",description:"Transfer In - JARDON SAM THEU<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00294",type:"Income",category:"Jersey & Merchandise",amount:24000,date:"2025-12-29",description:"Transfer In - CHIPEYA BERNARD<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00295",type:"Income",category:"Jersey & Merchandise",amount:48000,date:"2025-12-29",description:"Mobile Banking Transfer - From: KONDWANI MAURICE CHAPOLA",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00296",type:"Transfer",category:"Funds Transfer (out to Operations/Salaries)",amount:141218.21,date:"2025-12-31",description:"Transfer - Dec 25 Payroll Remittances Reversal<: 530691",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00297",type:"Income",category:"Gate Collections",amount:7432.5,date:"2025-12-31",description:"Transfer In - SUPER LEAGUE ASS<From Acc.No. - MWK1472000190001",department:"Revenue Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00298",type:"Transfer",category:"Funds Transfer (into Operations)",amount:15000000,date:"2026-01-02",description:"Online Banking Transfer - Ekhaya FC Budget",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00299",type:"Transfer",category:"Funds Transfer (into Operations)",amount:4000000,date:"2026-01-02",description:"Online Banking Transfer - Funds Transfer from Revenue AC to",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00300",type:"Expense",category:"EFC208-2104",amount:940000,date:"2026-01-02",description:"Mens Team Squad - Mens Team Travel Allowance BLK Trip<: 531196",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00301",type:"Expense",category:"EFC208-2205",amount:1446292.5,date:"2026-01-02",description:"Up Town Lodge - Mens Team Accommodation Castel Cup Away in BLK",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00302",type:"Expense",category:"EFC208-2105",amount:100000,date:"2026-01-02",description:"Thando Mhango - CEO Travel Allowance Castel Cup Away in BLK",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00303",type:"Expense",category:"EFC208-2105",amount:100000,date:"2026-01-02",description:"Mphatso Mpinganjira - Chairman Travel Allowance Castel Cup Away in BLK",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00304",type:"Expense",category:"EFC208-2102",amount:500000,date:"2026-01-02",description:"EFC Supporters Committee - Travel Support Castel Cup Away in BLK",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00305",type:"Expense",category:"EFC208-3401",amount:889327.46,date:"2026-01-02",description:"TotalEnenrgies Malawi - Fuel for Castel Cup trip for CEO & Chairman",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00306",type:"Expense",category:"EFC202-2102",amount:2765000,date:"2026-01-03",description:"Mens Team - Cowboys TPT 1 to 31 December 2025 :<531141",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00307",type:"Expense",category:"EFC102-3401",amount:2120000,date:"2026-01-03",description:"Transfer - Staff Fuel Allocations for January 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00308",type:"Expense",category:"EFC202-2102",amount:600000,date:"2026-01-03",description:"Enos Chatama - Mens Coach Training Allowance for December 2025 Coach",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00309",type:"Expense",category:"EFC302-2102",amount:150000,date:"2026-01-03",description:"Patricia Makwakwa - Training Allowance for December 2025",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00310",type:"Expense",category:"EFC202-2102",amount:150000,date:"2026-01-03",description:"Alick Lungu - Training Allowance for December 2025",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00311",type:"Expense",category:"EFC203-4685",amount:3075000,date:"2026-01-05",description:"Mens Team Squad - Win n Clean Sheet Bonus vs Tigers TNM League",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00312",type:"Expense",category:"EFC402-2102",amount:525500,date:"2026-01-05",description:"Reserve Team Players - Reserve Team TPT 1 to 10 Jan 2026 :<531486",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00313",type:"Expense",category:"EFC103-2511",amount:609000,date:"2026-01-06",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Secretariat",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00314",type:"Expense",category:"EFC215-2511",amount:2058000,date:"2026-01-06",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Mens Team",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00315",type:"Expense",category:"EFC315-2511",amount:1075000,date:"2026-01-06",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Womens Team",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00316",type:"Expense",category:"EFC415-2511",amount:597000,date:"2026-01-06",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Reserve Team",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00317",type:"Expense",category:"EFC515-2511",amount:448000,date:"2026-01-06",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Youth",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00318",type:"Transfer",category:"Funds Transfer (into Operations)",amount:1000000,date:"2026-01-06",description:"Mobile Banking Transfer - From: WILLIAM MPINGANJIRA",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00319",type:"Expense",category:"EFC105-2104",amount:280000,date:"2026-01-06",description:"Thando Mhango - Travel Allow CEO Lilongwe Official Trip : 531858",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00320",type:"Expense",category:"EFC105-2201",amount:424000,date:"2026-01-06",description:"Target Travels & Tours - Air Ticket for CEO Lilongwe Official Trip : 531858",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00321",type:"Expense",category:"EFC214-3353",amount:270000,date:"2026-01-06",description:"DSTV Malawi (Blessings) - DSTV Subscription for Cowboys Hostel (Jan-Mar 226)",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00322",type:"Expense",category:"EFC214-2301",amount:100000,date:"2026-01-06",description:"ESCOM (Blessings) - ESCOM Power Units for Cowboys Hostel Jan 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00323",type:"Expense",category:"EFC314-2301",amount:100000,date:"2026-01-06",description:"ESCOM (Blessings) - ESCOM Power Units for Cowgirls Hostel Jan 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00324",type:"Expense",category:"EFC314-2305",amount:221444,date:"2026-01-06",description:"Blantyre Water Board(Blessings) - Water Bill at Cowgirls Hostel for Nov 2025",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00325",type:"Expense",category:"EFC214-2305",amount:139076,date:"2026-01-06",description:"Blantyre Water Board(Blessings) - Water Bill at Cowboys Hostel for Nov 2025",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00326",type:"Expense",category:"EFC105-2205",amount:100000,date:"2026-01-08",description:"Smile  Lodge - Accommodation for CEO : 532409",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00327",type:"Transfer",category:"Funds Transfer (into Operations)",amount:7000000,date:"2026-01-12",description:"Online Banking Transfer - Ekhaya FC Ops",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00328",type:"Expense",category:"EFC213-2104",amount:380000,date:"2026-01-12",description:"Thando Mhango - CEO Manager Mzuzu Scouting Trip",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00329",type:"Expense",category:"EFC213-2104",amount:210000,date:"2026-01-12",description:"Francis Khan - Team Manager Mzuzu Scouting Trip",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00330",type:"Expense",category:"EFC213-2104",amount:160000,date:"2026-01-12",description:"Chifundo Bonga - Driver Mzuzu Scouting Trip",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00331",type:"Expense",category:"EFC213-3401",amount:767025,date:"2026-01-12",description:"TotalEnenrgies Malawi - Fuel for Mzuzu Scouting Trip",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00332",type:"Expense",category:"EFC108-2923",amount:1860000,date:"2026-01-13",description:"Tech Ideas - Website support Maintenance & SEO Jan-Mar 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00333",type:"Expense",category:"EFC108-2406",amount:366200,date:"2026-01-13",description:"Studio Ignite - Design & Printing of Business cards for CEO plus email signature",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00334",type:"Expense",category:"EFC215-2517",amount:800000,date:"2026-01-14",description:"Ravisha Rehab - MRI Scan for two Main Team Playrs",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00335",type:"Expense",category:"EFC216-3512",amount:700000,date:"2026-01-14",description:"Shugo Electrical & Electronics - EFC 1 Aircon Gas Refilling : 533897",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00336",type:"Transfer",category:"Funds Transfer (into Operations)",amount:20000000,date:"2026-01-14",description:"Online Banking Transfer - Ekhaya FC Budget",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00337",type:"Expense",category:"EFC208-2402",amount:83000,date:"2026-01-15",description:"Ammon Chirwa - Petty Cash for Cowboys Castel Cup vs Shire Wimbe",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00338",type:"Expense",category:"EFC208-2205",amount:4223340,date:"2026-01-15",description:"Platinum Suits - Accommodation Cowboys Castel Cup vs Shire Wimbe",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00339",type:"Expense",category:"EFC208-3401",amount:1467396.7,date:"2026-01-15",description:"TotalEnenrgies Malawi - Fuel Cowboys Castel Cup vs Shire Wimbe trip",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00340",type:"Expense",category:"EFC105-2104",amount:180000,date:"2026-01-15",description:"Thando Mhango - Travel Allowance CEO Wimbe Castel Cup Away",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00341",type:"Expense",category:"EFC105-2104",amount:180000,date:"2026-01-15",description:"Mphatso Mpinganjira - Travel Allowance Chairman on Wimbe Castel Cup Away",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00342",type:"Expense",category:"EFC292-3401",amount:400000,date:"2026-01-15",description:"EFC Supporters Committee - Support for supporters on Wimbe Castel Cup Away",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00343",type:"Expense",category:"EFC105-3401",amount:746550,date:"2026-01-15",description:"TotalEnenrgies Malawi - Fuel for CEO & Chairman on Wimbe Castel Cup Away",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00344",type:"Expense",category:"EFC402-2102",amount:522500,date:"2026-01-16",description:"Reserve Team Players - Reserve Team TPT 12 to 17 Jan 2026 <: 534069",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00345",type:"Expense",category:"EFC212-3901",amount:300000,date:"2026-01-16",description:"Football Association of Malawi - 2026 Club License Application Fees <: 534148",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00346",type:"Expense",category:"EFC504-4685",amount:160000,date:"2026-01-16",description:"Youth Team Squad - Youth Team Bonus vs Young Stars :  <534054",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00347",type:"Expense",category:"EFC208-2104",amount:980000,date:"2026-01-17",description:"Mens Team Squad - Mens Travel Allow Castel vs S Wimbe<: 534077",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00348",type:"Expense",category:"EFC214-3519",amount:646125,date:"2026-01-17",description:"Transfer - January 2026 Petty Cash Expenses : <534547",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00349",type:"Expense",category:"EFC302-2102",amount:1046000,date:"2026-01-17",description:"Womens Team Players - Cowgirls TPT Back from Break :     <534543",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00350",type:"Expense",category:"EFC302-2102",amount:1568000,date:"2026-01-19",description:"Womens Team Players - Womens TPT 16 to 31 January 2026 : <534544",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00351",type:"Expense",category:"EFC105-2205",amount:300000,date:"2026-01-19",description:"Thando Mhango - Refund on CEO Accommodation Castel Trip LL",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00352",type:"Expense",category:"EFC208-4685",amount:5225000,date:"2026-01-20",description:"Mens Team Squad - Win Bonuses vs Ntaja n Wimbe :     <535049",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00353",type:"Expense",category:"EFC504-4685",amount:160000,date:"2026-01-20",description:"Youth Team Squad - Youth Team Bonus vs Yizo Yizo :    <535065",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00354",type:"Expense",category:"EFC314-3201",amount:1860200,date:"2026-01-21",description:"Ammon Chirwa - Cowboys Hostel hygiene & food needs for January 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00355",type:"Expense",category:"EFC214-3353",amount:270000,date:"2026-01-21",description:"DSTV Malawi (Blessings) - DSTV Subscription for Head Coach (Jan-Mar 226)",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00356",type:"Expense",category:"EFC215-2517",amount:200000,date:"2026-01-21",description:"Dr Kampondeni - MRI Scan results interpretation for Alick Lungu",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00357",type:"Expense",category:"EFC106-2411",amount:120000,date:"2026-01-21",description:"Hope Chikumba - Passport fees support for Hope Chikumba",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00358",type:"Expense",category:"EFC502-2650",amount:160000,date:"2026-01-21",description:"Kelvin Peter Zeka - Ground rent for Youth Team for No & Dec 2025",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00359",type:"Expense",category:"EFC108-2306",amount:174000,date:"2026-01-21",description:"Telekom Networks Limited - internet Bundles for media Team's mobile routers",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00360",type:"Expense",category:"EFC108-2402",amount:200000,date:"2026-01-21",description:"Franklyn Silver - Refund of Car wash expenses on EFC 1while away",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00361",type:"Expense",category:"EFC214-3519",amount:140000,date:"2026-01-21",description:"Ammon Chirwa - Refund on fummigation services at new Cowboys Hostel",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00362",type:"Expense",category:"EFC214-3519",amount:100000,date:"2026-01-21",description:"Blessings Gwembere - Refund Relocation of beds to the new Cowboys hostel",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00363",type:"Expense",category:"EFC108-2402",amount:200000,date:"2026-01-21",description:"Raphael Dzonzi - Replica Jersey alteration charges",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00364",type:"Expense",category:"EFC214-3353",amount:140000,date:"2026-01-21",description:"Samson Chiwambo - Relocation of DSTV gadgets to Chirimba",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00365",type:"Transfer",category:"Funds Transfer (into Operations)",amount:22000000,date:"2026-01-22",description:"Online Banking Transfer - Funds Transfer from Revenue AC to",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00366",type:"Expense",category:"EFC600-4199",amount:4500000,date:"2026-01-23",description:"Mwayiwawo Moyo Tizola - Acquisition of Players: Sign on fee for Lucky Tizola",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00367",type:"Expense",category:"EFC600-4199",amount:3000000,date:"2026-01-23",description:"Gift Chunga - Acquisition of Players: Sign on fee for Gift Chunga",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00368",type:"Expense",category:"EFC502-2102",amount:558000,date:"2026-01-23",description:"Womens Team Players - TPT Youth during Holidays : 536274",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00369",type:"Expense",category:"EFC600-4115",amount:1350000,date:"2026-01-23",description:"Prime Store.MW - Two iPad keyboards and stylis pens",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00370",type:"Expense",category:"EFC214-2410",amount:2097000,date:"2026-01-23",description:"Hooked Up Security - Security Charges for December 2025",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00371",type:"Expense",category:"EFC292-2411",amount:1000000,date:"2026-01-23",description:"Johnson Sekani - EFC Supporters Committee: Castel Cup vs Dedza",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00372",type:"Expense",category:"EFC208-2205",amount:1306462.5,date:"2026-01-23",description:"Up Town Lodge - Mens Team Accommodation Castel Cup Away in BLK",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00373",type:"Expense",category:"EFC208-2205",amount:672560,date:"2026-01-23",description:"Ekhaya Food Shop (Gateway Mall - Mens Team meals Castel Cup vs Shire Wimbe",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00374",type:"Expense",category:"EFC208-2205",amount:1035690,date:"2026-01-23",description:"Platinum Suits - Mens Team meals Castel Cup vs Shire Wimbe",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00375",type:"Expense",category:"EFC502-2102",amount:930000,date:"2026-01-23",description:"Youth Team Squad - Youth Team TPT support from 5th to 16 January 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00376",type:"Expense",category:"EFC202-2102",amount:1970000,date:"2026-01-23",description:"Womens Team Players - Cowboys TPT support from 1 to 16 January 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00377",type:"Transfer",category:"Funds Transfer (into Operations)",amount:10000000,date:"2026-01-23",description:"Online Banking Transfer - WCM Ops to FC Ops",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00378",type:"Transfer",category:"Funds Transfer (into Operations)",amount:30000000,date:"2026-01-23",description:"Online Banking Transfer - WCM Rev to EFC Ops",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00379",type:"Expense",category:"EFC292-3401",amount:800000,date:"2026-01-24",description:"Thando Mhango - Special Castel Cup support vs Dedza<: 536591",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00380",type:"Expense",category:"EFC104-3305",amount:16300,date:"2026-01-24",description:"FDH bank - Bank service charges for january 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00381",type:"Expense",category:"EFC502-2102",amount:1005000,date:"2026-01-26",description:"Youth Team Squad - Youth Team TPT support from 19th to 31 January 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00382",type:"Expense",category:"EFC104-2902",amount:800000,date:"2026-01-26",description:"Chrispin Chikwama - Professional HR Retainer Fees for January 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00383",type:"Expense",category:"EFC504-4685",amount:160000,date:"2026-01-27",description:"Youth Team Squad - Youth Team Bonus Win (2-0) vs Wanderers Youth",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00384",type:"Expense",category:"EFC304-4685",amount:610000,date:"2026-01-27",description:"Womens Team Players - Womens Bonus Win (1-5) vs FOMO : 537430",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00385",type:"Expense",category:"EFC116-3512",amount:250000,date:"2026-01-27",description:"Zito Auto Parts & Glass Centre - Spare parts (Fog Lights) for BT 15517 CEO's vehicle",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00386",type:"Expense",category:"EFC202-2402",amount:170325,date:"2026-01-27",description:"Phatafuli Investments - Supply and delivery of Football pump & accessories",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00387",type:"Expense",category:"EFC202-2102",amount:1230000,date:"2026-01-27",description:"Mens Team Players - Cowboys TPT support from 19 to 26 January 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00388",type:"Expense",category:"EFC211-2408",amount:4025000,date:"2026-01-28",description:"Benard Chipeya - Supply and delivery of Cup game Kits & football boots",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00389",type:"Expense",category:"EFC107-2407",amount:1210000,date:"2026-01-28",description:"Chilekeni Enterprises - Colour tonner catridges & photocopying papers",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00390",type:"Expense",category:"EFC214-2603",amount:2400000,date:"2026-01-28",description:"Alex & Paulina Katundu - House Rentals for Head Coach Jan - Mar 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00391",type:"Expense",category:"EFC108-2420",amount:3495000,date:"2026-01-28",description:"Corporate Graphics - Design for Ekhaya FC 2026 Season kits",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00392",type:"Expense",category:"EFC108-2306",amount:450000,date:"2026-01-28",description:"Unified Communications - Star-Link internet services Jan - March 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00393",type:"Expense",category:"EFC504-3401",amount:170000,date:"2026-01-28",description:"TotalEnenrgies Malawi - Fuel for Cowgirls trip to Zomba vs Zomba Lionesses",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00394",type:"Expense",category:"EFC203-2205",amount:500000,date:"2026-01-28",description:"Aisha Sattar - Hosting & resting Mens Team vs Tigers",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00395",type:"Expense",category:"EFC214-3519",amount:450000,date:"2026-01-28",description:"Aisha Sattar - Relocation of Cowboys stuff to Chirimba",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00396",type:"Expense",category:"EFC214-3519",amount:283100,date:"2026-01-28",description:"Thando Mhango - Refund on purchse of stamina supplement for cwoboys",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00397",type:"Expense",category:"EFC213-2201",amount:1247700,date:"2026-01-28",description:"George Musta Taumbe - Refund Airticket for E. Saviel Jr going back to Lusaka",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00398",type:"Expense",category:"EFC314-3201",amount:2121200,date:"2026-01-28",description:"Ammon Chirwa - Cowgirls Hostel hygiene & food needs for January 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00399",type:"Expense",category:"EFC207-2205",amount:2000000,date:"2026-01-28",description:"Top Lodges - Mens Team camping for Castel Cup vs Dedza",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00400",type:"Expense",category:"EFC216-3512",amount:475000,date:"2026-01-28",description:"Ammon Chirwa - Refund on EFC 1 Aircon Gas refill charges",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00401",type:"Expense",category:"EFC202-2102",amount:410000,date:"2026-01-28",description:"Mens Team Players - Selected Mens Team Players TPT Support to Holiday",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00402",type:"Expense",category:"EFC103-2511",amount:609000,date:"2026-01-30",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Secretariat",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00403",type:"Expense",category:"EFC215-2511",amount:2019000,date:"2026-01-30",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Mens Team",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00404",type:"Expense",category:"EFC315-2511",amount:1075000,date:"2026-01-30",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Womens Team",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00405",type:"Expense",category:"EFC415-2511",amount:597000,date:"2026-01-30",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Reserve Team",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00406",type:"Expense",category:"EFC515-2511",amount:448000,date:"2026-01-30",description:"Medical Aid Society of Malawi - MASM Cover for February 2026 - Youth",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00407",type:"Expense",category:"EFC102-3401",amount:1415025,date:"2026-02-03",description:"TotalEnenrgies Malawi - Feb 2026 monthly Fuel for Secretariat",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00408",type:"Expense",category:"EFC202-3401",amount:1588800,date:"2026-02-03",description:"TotalEnenrgies Malawi - Feb 2026 monthly Fuel for Mens Team Technical",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00409",type:"Expense",category:"EFC202-2102",amount:600000,date:"2026-02-03",description:"Enos Chatama - Feb 2026 monthly Training Allowance for H/Coach",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00410",type:"Expense",category:"EFC302-2819",amount:150000,date:"2026-02-03",description:"Alick Lungu - Feb 2026 monthly Training Allowance for players",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00411",type:"Expense",category:"EFC202-2819",amount:150000,date:"2026-02-03",description:"Patricia Makwakwa - Feb 2026 monthly Training Allowance Cowgirls Coach",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00412",type:"Expense",category:"EFC216-3512",amount:759996,date:"2026-02-03",description:"Muhamed Mohamed - M/Vehicle maintenance tyres for BT 14727",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00413",type:"Expense",category:"EFC215-2501",amount:770300,date:"2026-02-03",description:"Phrmaprime Pharmacy - Purchase of medical drugs",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00414",type:"Expense",category:"EFC416-3512",amount:750000,date:"2026-02-03",description:"Bvumbwe Auto Parts - M/Vehicle maintenance bearing for BT 13415",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00415",type:"Expense",category:"EFC314-3353",amount:270000,date:"2026-02-03",description:"Blessings Gwembere - DSTV for Cowgirls hostel - Feb to April 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00416",type:"Expense",category:"EFC302-2102",amount:1542000,date:"2026-02-04",description:"Womens Team Players - Womens TPT 3 to 14 February 2026 : <540357",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00417",type:"Expense",category:"EFC502-2102",amount:1096000,date:"2026-02-04",description:"Youth Team Squad - Youth TPT 3rd to 14th February 2026<: 540345",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00418",type:"Expense",category:"EFC311-2408",amount:780000,date:"2026-02-04",description:"Davie Matemba - Purchase of Football Boots for Cowgirls",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00419",type:"Expense",category:"EFC208-2402",amount:150000,date:"2026-02-04",description:"Edmand Mapulanga - Laundry charges for Reserve Team Kit",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00420",type:"Expense",category:"EFC404-2402",amount:120000,date:"2026-02-04",description:"Only Banda - Laundry charges for Mens Team Kit",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00421",type:"Expense",category:"EFC314-2603",amount:1440000,date:"2026-02-04",description:"Brian Ndawanje - Dwelling house rentals for Cowgirls hostel Jan-Mar 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00422",type:"Expense",category:"EFC404-3401",amount:198153.15,date:"2026-02-04",description:"TotalEnenrgies Malawi - Fuel for Cowgirls Zomba trip",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00423",type:"Expense",category:"EFC600-1000",amount:1450073.14,date:"2026-02-04",description:"Ronald Chimchere - Refund on freight charges for Jersey & kits sample (China)",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00424",type:"Expense",category:"EFC403-4685",amount:960500,date:"2026-02-04",description:"Malamulo Nursing Hospital - Tuition Fees for Patrick Dominic",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00425",type:"Expense",category:"EFC216-3512",amount:500000,date:"2026-02-04",description:"Francoh Auto Parts - M/Vehicle maintenance: Car battery for BT 14727",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00426",type:"Transfer",category:"Funds Transfer (into Operations)",amount:2000000,date:"2026-02-05",description:"Online Banking Transfer - Funds Transfer from Revenue AC to",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00427",type:"Expense",category:"EFC213-2105",amount:690000,date:"2026-02-05",description:"Bank Accounts - Travel & Meal allowances: Chairman, CEO & Team Manager LL trip",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00428",type:"Expense",category:"EFC213-3401",amount:1139467.5,date:"2026-02-05",description:"TotalEnenrgies Malawi - Travel & Meal allowances: Chairman, CEO & Team Manager LL trip",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00429",type:"Transfer",category:"Funds Transfer (into Operations)",amount:11000000,date:"2026-02-13",description:"Online Banking Transfer - Luso to Ekhaya FC Ops",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00430",type:"Expense",category:"EFC600-4199",amount:1200000,date:"2026-02-13",description:"Transfer - Purchase of player Wonderful Genala<: 543103",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00431",type:"Expense",category:"EFC104-3305",amount:500,date:"2026-02-13",description:"Salary Charges - Chg EFT OtherBan<Chg EFT OtherBank - Batch 543103 : <Chg EFT OtherBan",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00432",type:"Expense",category:"EFC105-3401",amount:1569733.75,date:"2026-02-13",description:"Transfer - 2026 Club Licencing Lilongwe Trip :<543079",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00433",type:"Expense",category:"EFC104-3305",amount:500,date:"2026-02-13",description:"Salary Charges - Chg EFT OtherBan<Chg EFT OtherBank - Batch 543079 : <Chg EFT OtherBan",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00434",type:"Transfer",category:"Funds Transfer (into Operations)",amount:270000,date:"2026-02-13",description:"Mobile Banking Transfer - From: AMON CHIRWA",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00435",type:"Transfer",category:"Funds Transfer (into Operations)",amount:270000,date:"2026-02-14",description:"Transfer In - THANDO KASO MHAN<From",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00436",type:"Expense",category:"EFC503-4685",amount:160000,date:"2026-02-17",description:"Transfer - Youth Team Bonus vs Agumbala :     <543197",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00437",type:"Expense",category:"EFC304-4685",amount:3650000,date:"2026-02-17",description:"Transfer - Womens Bonus Wins Zomba n Ndirande <: 543302",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00438",type:"Expense",category:"EFC302-2102",amount:1508000,date:"2026-02-17",description:"Transfer - Womens TPT 17 to 28 February 2026 :<543999",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00439",type:"Expense",category:"EFC504-4685",amount:190000,date:"2026-02-17",description:"Transfer - Youth Bonus Win vs Airsport FC :   <544000",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00440",type:"Expense",category:"EFC515-2511",amount:2112527.2,date:"2026-02-17",description:"Transfer - Feb 2026 WK1 Operations Budget A : <544017",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00441",type:"Expense",category:"EFC104-3305",amount:1000,date:"2026-02-17",description:"Salary Charges - Chg EFT OtherBan<Chg EFT OtherBank - Batch 544017 : <Chg EFT OtherBan",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00442",type:"Expense",category:"EFC105-2201",amount:351000,date:"2026-02-18",description:"Transfer - Air Ticket fare Refund LL BT LL :  <544350",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00443",type:"Expense",category:"EFC600-4199",amount:600000,date:"2026-02-19",description:"Transfer - Womens Player Transfer Fees :      <544647",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00444",type:"Expense",category:"EFC104-3305",amount:1600,date:"2026-02-19",description:"Salary Charges - Chg EFT OtherBan<Chg EFT OtherBank - Batch 544647 : <Chg EFT OtherBan",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00445",type:"Expense",category:"EFC108-2420",amount:200000,date:"2026-02-19",description:"Transfer - Media Team Allowance Online Article<: 544638",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00446",type:"Transfer",category:"Funds Transfer (into Operations)",amount:15000000,date:"2026-02-19",description:"Online Banking Transfer - WCM Ops to FC Ops",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00447",type:"Expense",category:"EFC600-4199",amount:1000000,date:"2026-02-20",description:"Transfer - Player contract negotiation fees : <545406",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00448",type:"Expense",category:"EFC104-3305",amount:800,date:"2026-02-20",description:"Salary Charges - Chg EFT OtherBan<Chg EFT OtherBank - Batch 545406 : <Chg EFT OtherBan",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00449",type:"Expense",category:"EFC515-2511",amount:6820000,date:"2026-02-20",description:"Transfer - Feb 2026 WK3 Operations",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00450",type:"Expense",category:"EFC104-3305",amount:2400,date:"2026-02-20",description:"Salary Charges - Charge EFT<Charge EFT - Batch 545508 : Charge <EFT",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00451",type:"Expense",category:"EFC206-3401",amount:923667.5,date:"2026-02-21",description:"Transfer - EFC Manager n Coach Castel Finals :<545639",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00452",type:"Expense",category:"EFC217-3402",amount:122000,date:"2026-02-23",description:"Nazil Kalos - Vehicle licncesing (COF) BT14727 & BT 14713",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00453",type:"Expense",category:"EFC217-3402",amount:298000,date:"2026-02-23",description:"Nazil Kalos - Mens Gym equipment - Relocation to Chirimba",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00454",type:"Expense",category:"EFC217-3402",amount:600000,date:"2026-02-23",description:"Oakmont Resort - Accomm for CEO, Chairman & Legal counsel AGM in SA",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00455",type:"Expense",category:"EFC217-3402",amount:160000,date:"2026-02-23",description:"Kelvin Peter Zeka - Kelvin Zeka - Youth Team Ground rent Jan & Feb 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00456",type:"Expense",category:"EFC217-3402",amount:330000,date:"2026-02-23",description:"Ammon Chirwa - Meals for the Cowgirls playing Nsuwadzi in Mulanje",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00457",type:"Expense",category:"EFC217-3402",amount:10000,date:"2026-02-23",description:"Ammon Chirwa - Cowgirls Match day transport for medical team",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00458",type:"Expense",category:"EFC217-3402",amount:286710.31,date:"2026-02-23",description:"TotalEnenrgies Malawi - Fuel for Cowgirls trip to Nsuwadzi",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00459",type:"Expense",category:"EFC104-3305",amount:3200,date:"2026-02-23",description:"FDH Bank for MRA - FDH transfer levies",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00460",type:"Expense",category:"EFC104-3305",amount:16300,date:"2026-02-25",description:"FDH Bank - Bank Charges",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00461",type:"Expense",category:"EFC213-2201",amount:1992835,date:"2026-02-26",description:"Edu & Work Connect - Air Ticket for Technical Director :<547163",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00462",type:"Expense",category:"EFC104-3305",amount:800,date:"2026-02-26",description:"FDH Bank for MRA - FDH transfer levies",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00463",type:"Expense",category:"EFC216-3512",amount:588000,date:"2026-02-26",description:"Transfer - Vehicle Repairs : BZ 20442",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00464",type:"Expense",category:"EFC104-3305",amount:800,date:"2026-02-26",description:"FDH Bank for MRA - FDH transfer levies",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00465",type:"Transfer",category:"Funds Transfer (into Operations)",amount:1055354,date:"2026-02-26",description:"EFT Incoming - Standard Bank<Payer Details- SUPER LEAGUE ASSOCIA     <Reference- 27154277S16603143250226",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00466",type:"Expense",category:"Uncategorised",amount:0,date:"2026-02-26",description:"Transfer In - EDU AND WORK CON<From Acc.No. - MWK1472000190001",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00467",type:"Expense",category:"EFC105-3401",amount:1867577.5,date:"2026-02-26",description:"Transfer - Chair CEO n Legal on SULOM AGM Trip<: 547519",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00468",type:"Expense",category:"EFC104-3305",amount:1600,date:"2026-02-26",description:"FDH Bank for MRA - FDH transfer levies",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00469",type:"Expense",category:"EFC314-3201",amount:323526.6,date:"2026-03-02",description:"Ammon Chirwa - Cowgirls Hostel food needs",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00470",type:"Expense",category:"EFC304-3401",amount:175000,date:"2026-03-02",description:"Total Energies Malawi Marketing Ltd - Fuel for Cowgirls away game Bvumbwe",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00471",type:"Expense",category:"EFC314-2305",amount:168130,date:"2026-03-02",description:"Blantyre Water Board - Water Bills for Cowgirls Hostel",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00472",type:"Expense",category:"Uncategorised",amount:200000,date:"2026-03-02",description:"TMT Transport - Maize transportation to warehouse",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00473",type:"Expense",category:"Uncategorised",amount:240000,date:"2026-03-02",description:"Nazil Kalos - Motor Vehicle COF",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00474",type:"Expense",category:"EFC104-3305",amount:1600,date:"2026-03-02",description:"Salary Charges - Charge EFT<Charge EFT - Batch 548752 : Charge <EFT",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00475",type:"Transfer",category:"Funds Transfer (into Operations)",amount:50000000,date:"2026-03-05",description:"Transfer In - FUNDS TRANSFER<From Acc.No. - 1850000151391",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00476",type:"Expense",category:"EFC104-2902",amount:800000,date:"2026-03-06",description:"Masimba Consulting - HR Retainer Fees for February 2026 <: 550176",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00477",type:"Expense",category:"EFC216-3512",amount:700000,date:"2026-03-06",description:"EM Auto Parts - Service Parts for BT 13415",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00478",type:"Expense",category:"EFC216-3512",amount:178000,date:"2026-03-06",description:"EM Auto Parts - Service Parts for BR 7624",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00479",type:"Expense",category:"EFC316-3512",amount:660000,date:"2026-03-06",description:"EM Auto Parts - Service Parts for BT 14955",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00480",type:"Expense",category:"EFC216-3512",amount:300000,date:"2026-03-06",description:"Bvumbwe Auto Parts - Engine Oil for EFC 1",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00481",type:"Expense",category:"EFC104-3305",amount:3200,date:"2026-03-06",description:"Salary Charges - Chg EFT OtherBan<Chg EFT OtherBank - Batch 550633 : <Chg EFT OtherBan",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00482",type:"Expense",category:"EFC102-3401",amount:595800,date:"2026-03-06",description:"Total Energies Malawi Marketing Ltd - Monthly fuel allocation Management team",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00483",type:"Expense",category:"EFC107-3401",amount:1381249.85,date:"2026-03-06",description:"Total Energies Malawi Marketing Ltd - Monthly fuel expenditure Utility",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00484",type:"Expense",category:"EFC202-3401",amount:993000,date:"2026-03-06",description:"Total Energies Malawi Marketing Ltd - Monthly fuel allocation technical team",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00485",type:"Expense",category:"EFC202-2819",amount:150000,date:"2026-03-06",description:"Enos Chatama - Monthly training allowance for Feb 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00486",type:"Expense",category:"EFC202-2819",amount:150000,date:"2026-03-06",description:"Alick Lungu - Monthly training allowance for Feb 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00487",type:"Expense",category:"EFC304-4685",amount:3290000,date:"2026-03-07",description:"Transfer - Womens Bonus Wins Nsuwazi n Bvumbwe<: 550773",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00488",type:"Expense",category:"EFC302-2102",amount:1021000,date:"2026-03-07",description:"Transfer - Womens TPT 2 to 8 March 2026 :     <550866",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00489",type:"Expense",category:"EFC104-3305",amount:800,date:"2026-03-09",description:"Salary Charges - Charge EFT<Charge EFT - Batch 550637 : Charge <EFT",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00490",type:"Transfer",category:"Funds Transfer (into Operations)",amount:111495452.91,date:"2026-03-09",description:"Oneclick Bulk Payment - FUNDS TRANSFER<Ben Name:",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00491",type:"Expense",category:"EFC600-1000",amount:106900,date:"2026-03-09",description:"Account Transfer Charges - AC-1860000006486<",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00492",type:"Expense",category:"EFC600-1000",amount:111340553.31,date:"2026-03-09",description:"Funds Transfer - EUR34500.71<To: CROWN AGENTS BANK EUR CURRENT",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00493",type:"Expense",category:"EFC600-1000",amount:10506,date:"2026-03-09",description:"Account Transfer Charges - AC-1860000006467<",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00494",type:"Expense",category:"EFC600-1000",amount:52530,date:"2026-03-09",description:"Funds Transfer - USDCHG CONV<To: CROWN AGENTS BANK USD CURRENT",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00495",type:"Expense",category:"EFC600-1000",amount:61285,date:"2026-03-09",description:"Funds Transfer - USD35<To: CROWN AGENTS BANK USD CURRENT",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00496",type:"Expense",category:"EFC102-2803",amount:5000000,date:"2026-03-10",description:"Transfer - Advanced Leadership Prog TFM Centre<: 551187",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00497",type:"Expense",category:"EFC107-2601",amount:1917077.43,date:"2026-03-10",description:"FDH Properties - Rentals Ekhaya Football Club offices Jan-Mar 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00498",type:"Expense",category:"EFC202-2410",amount:2115000,date:"2026-03-10",description:"Hooekd up Security - Security Charges February 2026 H/Coach's residence",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00499",type:"Expense",category:"EFC314-2410",amount:2115000,date:"2026-03-10",description:"Hooekd up Security - Security Charges February 2026 Cowgirls hostel",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00500",type:"Expense",category:"EFC214-3201",amount:1517100,date:"2026-03-10",description:"Ammon Chirwa - Hostel needs for Cowgirls",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00501",type:"Expense",category:"EFC214-2301",amount:100000,date:"2026-03-10",description:"Blessing Gwembere - ESCOM units for Cowboys hostel",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00502",type:"Expense",category:"EFC314-2301",amount:100000,date:"2026-03-10",description:"Blessing Gwembere - ESCOM units for Cowgirls hostel",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00503",type:"Expense",category:"EFC107-2301",amount:120000,date:"2026-03-10",description:"Blessing Gwembere - ESCOM units for EFC Offices (Kristwick)",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00504",type:"Expense",category:"EFC216-3512",amount:2589000,date:"2026-03-10",description:"BB Engineering - Motor Vehicle maintenances - EFC 1",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00505",type:"Expense",category:"EFC316-3512",amount:330000,date:"2026-03-10",description:"BB Engineering - Motor Vehicle Repair services - labour BT 14955",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00506",type:"Expense",category:"EFC416-3512",amount:330000,date:"2026-03-10",description:"BB Engineering - Motor Vehicle Repair services - labour BT 13415",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00507",type:"Expense",category:"EFC216-3512",amount:500000,date:"2026-03-10",description:"BB Engineering - Motor Vehicle maintenances - BR 7624",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00508",type:"Expense",category:"EFC316-3512",amount:869500,date:"2026-03-10",description:"BB Engineering - Motor Vehicle New tyres for  - BT 14727",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00509",type:"Expense",category:"EFC314-2603",amount:360000,date:"2026-03-10",description:"Brian Ndawanje - Rentals Cowgirls hostel Top up Jan-Mar 2026",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00510",type:"Expense",category:"EFC104-3305",amount:1600,date:"2026-03-10",description:"Salary Charges - Bank Charges",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00511",type:"Expense",category:"EFC202-2603",amount:6000000,date:"2026-03-12",description:"Transfer - Technical Director House Rentals : <552185",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00512",type:"Expense",category:"EFC103-2511",amount:609000,date:"2026-03-12",description:"MASM - Blantyre - Medical Cover for March 2026 : Seretariat",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00513",type:"Expense",category:"EFC215-2511",amount:2135000,date:"2026-03-12",description:"MASM - Blantyre - Medical Cover for March 2026 : Cowboys",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00514",type:"Expense",category:"EFC315-2511",amount:1075000,date:"2026-03-12",description:"MASM - Blantyre - Medical Cover for March 2026 : Cowgirls",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00515",type:"Expense",category:"EFC415-2511",amount:597000,date:"2026-03-12",description:"MASM - Blantyre - Medical Cover for March 2026 : Reserve",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00516",type:"Expense",category:"EFC515-2511",amount:448000,date:"2026-03-12",description:"MASM - Blantyre - Medical Cover for March 2026 : Youth",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00517",type:"Expense",category:"EFC202-2102",amount:2320000,date:"2026-03-13",description:"Transfer - Cowboys TPT 4 to 27 March 2026 :   <552485",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00518",type:"Expense",category:"EFC213-2205",amount:764000,date:"2026-03-16",description:"Transfer - March 2026 WK2 2026 Supp Budget :  <552682",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00519",type:"Expense",category:"EFC104-3305",amount:1600,date:"2026-03-16",description:"Salary Charges - Chg EFT OtherBan<Chg EFT",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00520",type:"Expense",category:"EFC105-2104",amount:500000,date:"2026-03-16",description:"Transfer - Chair CEO n Legal on SULOM AGM Trip<: 553017",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00521",type:"Expense",category:"EFC103-2201",amount:516203.75,date:"2026-03-17",description:"Ammon for TD - Technical Director Expenses Processing Work Permit",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00522",type:"Expense",category:"EFC103-2202",amount:1751000,date:"2026-03-17",description:"Ammon for TD - Technical Director Expenses Processing Work Permit",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00523",type:"Expense",category:"EFC202-2411",amount:689880,date:"2026-03-18",description:"Francis Khan - Full Day training expenses for Cowboys",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00524",type:"Expense",category:"EFC202-2411",amount:960000,date:"2026-03-18",description:"Francis Khan - Full Day training expenses for Cowboys",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00525",type:"Expense",category:"EFC215-2517",amount:1615000,date:"2026-03-20",description:"Transfer - Players Medcial Tests March 2026 : <554512",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00526",type:"Expense",category:"EFC104-3305",amount:800,date:"2026-03-20",description:"Salary Charges - Chg EFT OtherBan<Chg EFT OtherBank - Batch 554512 : <Chg EFT OtherBan",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00527",type:"Transfer",category:"Funds Transfer (into Operations)",amount:500000,date:"2026-03-25",description:"Transfer In - CHILOBWE UNITED<From Acc.No. - MWK1472000190001",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00528",type:"Expense",category:"EFC104-2902",amount:800000,date:"2026-03-25",description:"Transfer - HR Retainer Fees for March 2026 :  <555918",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00529",type:"Expense",category:"EFC104-3305",amount:17930,date:"2026-03-26",description:"Fees Debited - 1910000195197<",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00530",type:"Transfer",category:"Funds Transfer (into Operations)",amount:13800000,date:"2026-03-26",description:"Online Banking Transfer - Funds Transfer from Revenue AC to",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00531",type:"Expense",category:"EFC202A-2104",amount:890000,date:"2026-03-27",description:"Transfer - Cowboys Travel Allowance Sapitwa : <556678",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00532",type:"Expense",category:"EFC202A-3401",amount:5317648,date:"2026-03-27",description:"Transfer - Cowboys Sapitwa Trip : 556676",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00533",type:"Expense",category:"EFC104-3305",amount:800,date:"2026-03-27",description:"Salary Charges - Bank Charges",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00534",type:"Expense",category:"EFC105-3401",amount:1916835,date:"2026-03-27",description:"Transfer - Chair CEO n Co on Sapitwa Trip :   <557073",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]},
{code:"FIN-00535",type:"Expense",category:"EFC104-3305",amount:1600,date:"2026-03-27",description:"Salary Charges - Chg EFT OtherBan<Chg EFT OtherBank - Batch 557073 :",department:"Operations Account",createdBy:"Excel Import",approvedBy:"Excel Import",status:"Approved",attachments:[]}
];

// Budget reference from Ekhaya_FC_2026_Budget___Activity_listing.xlsx, shown as provided.
const seedBudget = [
{department:"Corporate & Secretariat",activity:"Processing payments: Salaries & Benefits",actCode:"",item:"Salaries",itemCode:"1001",budget:176306800.07759997,allocated:8983333.34,actual:6378333.3379999995,balance:169928466.73959997,pct:3.62},
{department:"Corporate & Secretariat",activity:"",actCode:"101",item:"Group Life Assurance",itemCode:"3004",budget:3790596.201668399,allocated:0,actual:0,balance:3790596.201668399,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Pension Contribution",itemCode:"4680",budget:17630680.00776,allocated:0,actual:0,balance:17630680.00776,pct:0},
{department:"Corporate & Secretariat",activity:"Facilitating & Supporting Management & Board of Directors Activities",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:2004000,allocated:0,actual:0,balance:2004000,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Training & Research",itemCode:"2803",budget:5000000,allocated:5000000,actual:5000000,balance:0,pct:100},
{department:"Corporate & Secretariat",activity:"",actCode:"102",item:"Board Sitting Allowances",itemCode:"3352",budget:3600000,allocated:0,actual:0,balance:3600000,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Fuel Lubricants",itemCode:"3401",budget:10724400,allocated:4130825,actual:4130825,balance:6593575,pct:38.52},
{department:"Corporate & Secretariat",activity:"Providing General Human Resource welfare services",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:6000000,allocated:0,actual:0,balance:6000000,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Air Tickets & Fees",itemCode:"2201",budget:12000000,allocated:516203.75,actual:516203.75,balance:11483796.25,pct:4.3},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"External Travel Allowances",itemCode:"2202",budget:1751000,allocated:1751000,actual:1751000,balance:0,pct:100},
{department:"Corporate & Secretariat",activity:"",actCode:"103",item:"Medical Aid Cover premiums",itemCode:"2511",budget:11880000,allocated:1827000,actual:1827000,balance:10053000,pct:15.38},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"General Funreral Exepenses",itemCode:"3351",budget:798600,allocated:0,actual:0,balance:798600,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Fuel Lubricants",itemCode:"3401",budget:993000,allocated:0,actual:0,balance:993000,pct:0},
{department:"Corporate & Secretariat",activity:"Providing Professional Services",actCode:"",item:"Professional Marketing Services",itemCode:"2901",budget:2500000,allocated:0,actual:0,balance:2500000,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Professional HR Services",itemCode:"2902",budget:12000000,allocated:2400000,actual:2400000,balance:9600000,pct:20},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Professional Audit Services",itemCode:"2921",budget:3500000,allocated:0,actual:0,balance:3500000,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"104",item:"Professional Legal Services",itemCode:"2922",budget:9000000,allocated:0,actual:0,balance:9000000,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Accounting Software Services",itemCode:"2923",budget:4200000,allocated:0,actual:0,balance:4200000,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Bank Service Charges",itemCode:"3305",budget:1680000,allocated:75730,actual:75730,balance:1604270,pct:4.51},
{department:"Corporate & Secretariat",activity:"Facilitating Secretariats Official Travel with the teams",actCode:"",item:"Internal Travel Allowances",itemCode:"2104",budget:3600000,allocated:1140000,actual:1140000,balance:2460000,pct:31.67},
{department:"Corporate & Secretariat",activity:"",actCode:"105",item:"Air Tickets & Fees",itemCode:"2201",budget:4200000,allocated:775000,actual:775000,balance:3425000,pct:18.45},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Accommodation Charges",itemCode:"2205",budget:13200000,allocated:400000,actual:400000,balance:12800000,pct:3.03},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Fuel Lubricants",itemCode:"3401",budget:15043950,allocated:6100696.25,actual:6100696.25,balance:8943253.75,pct:40.55},
{department:"Corporate & Secretariat",activity:"Facilitating Support to Team's Capacity enhancement",actCode:"106",item:"Hospitality Exepenses",itemCode:"2411",budget:14500000,allocated:120000,actual:120000,balance:14380000,pct:0.83},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Fuel Lubricants",itemCode:"3401",budget:1588800,allocated:0,actual:0,balance:1588800,pct:0},
{department:"Corporate & Secretariat",activity:"Procure and provide office supplies & services",actCode:"",item:"Electricty Bills",itemCode:"2301",budget:1800000,allocated:120000,actual:120000,balance:1680000,pct:6.67},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Telephone Charges",itemCode:"2302",budget:7800000,allocated:0,actual:0,balance:7800000,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Water Bills",itemCode:"2305",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"107",item:"Stationery",itemCode:"2407",budget:15000000,allocated:1210000,actual:1210000,balance:13790000,pct:8.07},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Rent for Office units",itemCode:"2601",budget:7668309.675000001,allocated:1917077.43,actual:1917077.43,balance:5751232.245000001,pct:25},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Insurance of other Assets",itemCode:"3003",budget:1930721.875,allocated:0,actual:0,balance:1930721.875,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Fuel Lubricants",itemCode:"3401",budget:11320200,allocated:1381249.85,actual:1381249.85,balance:9938950.15,pct:12.2},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"General Maint. Other Assets",itemCode:"3519",budget:5760000,allocated:0,actual:0,balance:5760000,pct:0},
{department:"Corporate & Secretariat",activity:"Provide Media & Marketing Services",actCode:"",item:"Internet Charges",itemCode:"2306",budget:3319000,allocated:624000,actual:624000,balance:2695000,pct:18.8},
{department:"Corporate & Secretariat",activity:"",actCode:"108",item:"Publication & Advertising",itemCode:"2406",budget:10860000,allocated:366200,actual:366200,balance:10493800,pct:3.37},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Media Advertising",itemCode:"2420",budget:13455000,allocated:3695000,actual:3695000,balance:9760000,pct:27.46},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Training & Research",itemCode:"2803",budget:2880000,allocated:0,actual:0,balance:2880000,pct:0},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Info Tech Support",itemCode:"2923",budget:18350000,allocated:1860000,actual:1860000,balance:16490000,pct:10.14},
{department:"Corporate & Secretariat",activity:"",actCode:"",item:"Catapult System Subscription",itemCode:"4002",budget:13146910.5,allocated:0,actual:0,balance:13146910.5,pct:0},
{department:"Corporate & Secretariat",activity:"Facilitate provision of vehicle maintenance costs",actCode:"116",item:"M/Vehicle Maintenance",itemCode:"3512",budget:19510000,allocated:250000,actual:250000,balance:19260000,pct:1.28},
{department:"Corporate & Secretariat",activity:"Facilitate provision of vehicle Insurance, COF & Licencing",actCode:"117",item:"M/Vehicle Insurance & COF",itemCode:"3402",budget:16519292.96,allocated:0,actual:0,balance:16519292.96,pct:0},
{department:"Cowboys (Men's Squad)",activity:"Processing payment of salaries & Benefits",actCode:"201",item:"Salaries - Players",itemCode:"1001",budget:276647473.1999999,allocated:19874940.489999995,actual:14906458.340000002,balance:261741014.85999992,pct:5.39},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Salaries - Technical",itemCode:"1001",budget:223109538.60000002,allocated:797857.14,actual:609499.998,balance:222500038.60200003,pct:0.27},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Group Life Assurance",itemCode:"3004",budget:10744775.753699996,allocated:12584413.930000002,actual:9362166.674,balance:1382609.079699995,pct:87.13},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Pension - Players",itemCode:"4680",budget:27664747.320000004,allocated:797857.14,actual:609499.998,balance:27055247.322000004,pct:2.2},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Pension - Technical",itemCode:"4680",budget:22310953.86,allocated:12584413.930000002,actual:9362166.674,balance:12948787.185999999,pct:41.96},
{department:"Cowboys (Men's Squad)",activity:"Facilitating Training sessions",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:43200000,allocated:10045000,actual:10045000,balance:33155000,pct:23.25},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Telephone Charges",itemCode:"2302",budget:1399924.5,allocated:0,actual:0,balance:1399924.5,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:12920000,allocated:170325,actual:170325,balance:12749675,pct:1.32},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Hire of Security Services",itemCode:"2410",budget:7800000,allocated:2115000,actual:2115000,balance:5685000,pct:27.12},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Hospitality Allowance",itemCode:"2411",budget:3000000,allocated:1649880,actual:1649880,balance:1350120,pct:55},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"202",item:"Rent for dwelling Units",itemCode:"2603",budget:32000000,allocated:6000000,actual:6000000,balance:26000000,pct:18.75},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Ground & Sports facility rent",itemCode:"2650",budget:5500000,allocated:0,actual:0,balance:5500000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Sporting Equipment",itemCode:"2705",budget:7000000,allocated:0,actual:0,balance:7000000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Cleaning Services",itemCode:"2819",budget:8900000,allocated:450000,actual:450000,balance:8450000,pct:5.06},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:20455800,allocated:2581800,actual:2581800,balance:17874000,pct:12.62},
{department:"Cowboys (Men's Squad)",activity:"Preparing the Team for Season activities",actCode:"",item:"Transport Allowances",itemCode:"2104",budget:1200000,allocated:0,actual:0,balance:1200000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Telephone Charges",itemCode:"2105",budget:22000000,allocated:0,actual:0,balance:22000000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2205",budget:42900000,allocated:0,actual:0,balance:42900000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"202A",item:"Hire of Security Services",itemCode:"2402",budget:1966000,allocated:0,actual:0,balance:1966000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Ground & Sports facility rent",itemCode:"2650",budget:750000,allocated:0,actual:0,balance:750000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:2635521.3,allocated:5317648,actual:5317648,balance:-2682126.7,pct:201.77},
{department:"Cowboys (Men's Squad)",activity:"Fuifilling FDH Premiership fixtures - Home games",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:2700000,allocated:0,actual:0,balance:2700000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Accommodation Charges",itemCode:"2205",budget:14100000,allocated:500000,actual:500000,balance:13600000,pct:3.55},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"203",item:"Bottled Water & Consumables",itemCode:"2402",budget:1419000,allocated:0,actual:0,balance:1419000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Cleaning Services",itemCode:"2419",budget:1500000,allocated:0,actual:0,balance:1500000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:2254040.7493504724,allocated:0,actual:0,balance:2254040.7493504724,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:32400000,allocated:3075000,actual:3075000,balance:29325000,pct:9.49},
{department:"Cowboys (Men's Squad)",activity:"Fuifilling FDH Premiership fixtures - Away games",actCode:"",item:"Internal Travel Allowances",itemCode:"2104",budget:11500000,allocated:0,actual:0,balance:11500000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Meals Allowances",itemCode:"2105",budget:7200000,allocated:0,actual:0,balance:7200000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"204",item:"Accommodation Charges",itemCode:"2205",budget:29760000,allocated:0,actual:0,balance:29760000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:2270400,allocated:0,actual:0,balance:2270400,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Ground & Sports facility rent",itemCode:"2650",budget:1200000,allocated:0,actual:0,balance:1200000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:35888866.231368795,allocated:0,actual:0,balance:35888866.231368795,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:26500000,allocated:0,actual:0,balance:26500000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"Fulfilling Cup Games Fixtures - XXXXXX Cup Home",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:360000,allocated:0,actual:0,balance:360000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Meals Allowances",itemCode:"2105",budget:492000,allocated:0,actual:0,balance:492000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"205",item:"Accommodation Charges",itemCode:"2205",budget:1100000,allocated:0,actual:0,balance:1100000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:259400,allocated:0,actual:0,balance:259400,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Cleaning Services",itemCode:"2419",budget:200000,allocated:0,actual:0,balance:200000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:595800,allocated:0,actual:0,balance:595800,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:5300000,allocated:0,actual:0,balance:5300000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"Fulfilling Cup Games Fixtures - XXXXXX Cup Away",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:540000,allocated:0,actual:0,balance:540000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Meals Allowances",itemCode:"2105",budget:3270000,allocated:0,actual:0,balance:3270000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"206",item:"Accommodation Charges",itemCode:"2205",budget:11760000,allocated:0,actual:0,balance:11760000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:404400,allocated:0,actual:0,balance:404400,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Ground & Sports facility rent",itemCode:"2650",budget:300000,allocated:0,actual:0,balance:300000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:6553800,allocated:923667.5,actual:923667.5,balance:5630132.5,pct:14.09},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:5300000,allocated:0,actual:0,balance:5300000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"Fulfilling Cup Game Fixtures - Castel Cup Home",actCode:"",item:"Meals Allowances",itemCode:"2105",budget:820000,allocated:0,actual:0,balance:820000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Accommodation Charges",itemCode:"2205",budget:1100000,allocated:2000000,actual:2000000,balance:-900000,pct:181.82},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"207",item:"Bottled Water & Consumables",itemCode:"2402",budget:259400,allocated:0,actual:0,balance:259400,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Cleaning Services",itemCode:"2419",budget:200000,allocated:0,actual:0,balance:200000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:496500,allocated:0,actual:0,balance:496500,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:5300000,allocated:0,actual:0,balance:5300000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"Fulfilling Cup Game Fixtures - Castel Cup Away",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:540000,allocated:500000,actual:500000,balance:40000,pct:92.59},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Internal Travel Allowances",itemCode:"2104",budget:2790000,allocated:1920000,actual:1920000,balance:870000,pct:68.82},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Meals Allowances",itemCode:"2105",budget:660000,allocated:200000,actual:200000,balance:460000,pct:30.3},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"208",item:"Accommodation Charges",itemCode:"2205",budget:10440000,allocated:8684345,actual:8684345,balance:1755655,pct:83.18},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:404400,allocated:233000,actual:233000,balance:171400,pct:57.62},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Ground & Sports facility rent",itemCode:"2650",budget:300000,allocated:0,actual:0,balance:300000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:6553800,allocated:2356724.16,actual:2356724.16,balance:4197075.84,pct:35.96},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:5300000,allocated:5225000,actual:5225000,balance:75000,pct:98.58},
{department:"Cowboys (Men's Squad)",activity:"Fulfilling Cup Game Fixtures - Airtel Top 8 Bonanza Home",actCode:"",item:"Meals Allowances",itemCode:"2105",budget:205000,allocated:0,actual:0,balance:205000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Accommodation Charges",itemCode:"2205",budget:550000,allocated:0,actual:0,balance:550000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"209",item:"Bottled Water & Consumables",itemCode:"2402",budget:129700,allocated:0,actual:0,balance:129700,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Cleaning Services",itemCode:"2419",budget:100000,allocated:0,actual:0,balance:100000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:248250,allocated:0,actual:0,balance:248250,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:3100000,allocated:0,actual:0,balance:3100000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"Fulfilling Cup Game Fixtures - Airtel Top 8 Bonanza Home",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:540000,allocated:0,actual:0,balance:540000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Internal Travel Allowances",itemCode:"2104",budget:2550000,allocated:0,actual:0,balance:2550000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Meals Allowances",itemCode:"2105",budget:660000,allocated:0,actual:0,balance:660000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"210",item:"Accommodation Charges",itemCode:"2205",budget:15660000,allocated:0,actual:0,balance:15660000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:404400,allocated:0,actual:0,balance:404400,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Ground & Sports facility rent",itemCode:"2650",budget:300000,allocated:0,actual:0,balance:300000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:5704785,allocated:0,actual:0,balance:5704785,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:6200000,allocated:0,actual:0,balance:6200000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"Provision of Kits & Uniforms",actCode:"211",item:"Uniform & Protective Clothing",itemCode:"2408",budget:18630000,allocated:4025000,actual:4025000,balance:14605000,pct:21.6},
{department:"Cowboys (Men's Squad)",activity:"Facilitating Subscriptions & Competions participation compliance",actCode:"212",item:"Subscriptions",itemCode:"3901",budget:20100000,allocated:300000,actual:300000,balance:19800000,pct:1.49},
{department:"Cowboys (Men's Squad)",activity:"Supporting Scouting activities",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:1200000,allocated:0,actual:0,balance:1200000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Internal Travel Allowances",itemCode:"2104",budget:2000000,allocated:750000,actual:750000,balance:1250000,pct:37.5},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Meals Allowances",itemCode:"2105",budget:672000,allocated:690000,actual:690000,balance:-18000,pct:102.68},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"213",item:"Air travel Fares",itemCode:"2201",budget:4870000,allocated:3240535,actual:3240535,balance:1629465,pct:66.54},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Accommodation Charges",itemCode:"2205",budget:4840000,allocated:764000,actual:764000,balance:4076000,pct:15.79},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Hospitality expenses",itemCode:"2411",budget:750000,allocated:0,actual:0,balance:750000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:4778290,allocated:1906492.5,actual:1906492.5,balance:2871797.5,pct:39.9},
{department:"Cowboys (Men's Squad)",activity:"Providing for Cowboys housing & Hostel needs",actCode:"",item:"Electricity bills",itemCode:"2301",budget:1440000,allocated:200000,actual:200000,balance:1240000,pct:13.89},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Water Bills",itemCode:"2305",budget:1800000,allocated:139076,actual:139076,balance:1660924,pct:7.73},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Hire of Security Services",itemCode:"2410",budget:7800000,allocated:2097000,actual:2097000,balance:5703000,pct:26.88},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"214",item:"Cleaning Materials",itemCode:"2418",budget:1860000,allocated:0,actual:0,balance:1860000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Rent for dwelling Units",itemCode:"2603",budget:18000000,allocated:2400000,actual:2400000,balance:15600000,pct:13.33},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Rations & Provisions",itemCode:"3201",budget:27114120,allocated:1517100,actual:1517100,balance:25597020,pct:5.6},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Entertainment",itemCode:"3353",budget:2160000,allocated:680000,actual:680000,balance:1480000,pct:31.48},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"General Maint. Other Assets",itemCode:"3519",budget:5040000,allocated:1619225,actual:1619225,balance:3420775,pct:32.13},
{department:"Cowboys (Men's Squad)",activity:"Provision of Medical Supplies & Services",actCode:"",item:"Medical Drugs & Services",itemCode:"2501",budget:3838000,allocated:770300,actual:770300,balance:3067700,pct:20.07},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"215",item:"Medical Aid Premiums",itemCode:"2511",budget:14966000,allocated:6212000,actual:6212000,balance:8754000,pct:41.51},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Medical Expenses",itemCode:"2517",budget:16200000,allocated:2615000,actual:2615000,balance:13585000,pct:16.14},
{department:"Cowboys (Men's Squad)",activity:"Facilitating Motor Vehicle Maintenance services",actCode:"216",item:"M/Vehicle Maintenance",itemCode:"3512",budget:46497000,allocated:1175000,actual:1175000,balance:45322000,pct:2.53},
{department:"Cowboys (Men's Squad)",activity:"Facilitating Motor Vehicle Insurance & Licences",actCode:"217",item:"M/Vehicle Insurance",itemCode:"3402",budget:38380195,allocated:1806710.31,actual:1806710.31,balance:36573484.69,pct:4.71},
{department:"Cowboys (Men's Squad)",activity:"Ekhaya Football Support mobilisation - Home games",actCode:"291",item:"Hospitality expenses",itemCode:"2411",budget:5250000,allocated:0,actual:0,balance:5250000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:2085300,allocated:0,actual:0,balance:2085300,pct:0},
{department:"Cowboys (Men's Squad)",activity:"Ekhaya Football Support mobilisation - Away games",actCode:"",item:"Accommodation Charges",itemCode:"2205",budget:1440000,allocated:0,actual:0,balance:1440000,pct:0},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"292",item:"Hospitality expenses",itemCode:"2411",budget:4200000,allocated:1000000,actual:1000000,balance:3200000,pct:23.81},
{department:"Cowboys (Men's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:13362602.399999999,allocated:1200000,actual:1200000,balance:12162602.399999999,pct:8.98},
{department:"Cowgirls (Women's Squad)",activity:"Processing payments: Salaries & Benefits",actCode:"301",item:"Salaries - Players",itemCode:"1001",budget:49028571.480000004,allocated:4470000,actual:3972000,balance:45056571.480000004,pct:8.1},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Salaries - Technical",itemCode:"1001",budget:24600000.12,allocated:350000,actual:296000,balance:24304000.12,pct:1.2},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Group Life Assurance",itemCode:"3004",budget:1583014.2893999997,allocated:847857.14,actual:644499.998,balance:938514.2913999996,pct:40.71},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Pension - Players",itemCode:"4680",budget:4902857.148,allocated:0,actual:0,balance:4902857.148,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Pension - Technical",itemCode:"4680",budget:2460000.012,allocated:0,actual:0,balance:2460000.012,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"Facilitating Training Sessions",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:30720000,allocated:6835000,actual:6835000,balance:23885000,pct:22.25},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Accommodation Charges",itemCode:"2105",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"302",item:"Bottled Water & Consumables",itemCode:"2402",budget:10880000,allocated:0,actual:0,balance:10880000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Ground & Sports facility rent",itemCode:"2650",budget:3500000,allocated:0,actual:0,balance:3500000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Sporting Equipment",itemCode:"2705",budget:6600000,allocated:0,actual:0,balance:6600000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Ground & Sports facility rent",itemCode:"2819",budget:500000,allocated:150000,actual:150000,balance:350000,pct:30},
{department:"Cowgirls (Women's Squad)",activity:"Fulfilling League fixtures - Home games",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:1408000,allocated:0,actual:0,balance:1408000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"303",item:"Meal Allowances",itemCode:"2105",budget:3520000,allocated:0,actual:0,balance:3520000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:2138400,allocated:0,actual:0,balance:2138400,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:5220000,allocated:0,actual:0,balance:5220000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"Fulfilling League fixtures - Away games",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:1760000,allocated:0,actual:0,balance:1760000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Internal Travel Allowances",itemCode:"2104",budget:1080000,allocated:0,actual:0,balance:1080000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Meal Allowances",itemCode:"2105",budget:1920000,allocated:0,actual:0,balance:1920000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"304",item:"Accommodation Charges",itemCode:"2205",budget:720000,allocated:0,actual:0,balance:720000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:746400,allocated:0,actual:0,balance:746400,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:2085300,allocated:175000,actual:175000,balance:1910300,pct:8.39},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:3480000,allocated:7550000,actual:7550000,balance:-4070000,pct:216.95},
{department:"Cowgirls (Women's Squad)",activity:"Provision of Kits & Uniforms",actCode:"311",item:"Uniform & Protective Clothing",itemCode:"2408",budget:16110000,allocated:780000,actual:780000,balance:15330000,pct:4.84},
{department:"Cowgirls (Women's Squad)",activity:"Facilitating subscriptions & Competitions Participation compliance",actCode:"312",item:"Subscriptions & Participation Fees",itemCode:"3901",budget:2000000,allocated:0,actual:0,balance:2000000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"Providing for Cowgirls housing & Hostel needs",actCode:"",item:"Electricity Bills",itemCode:"2301",budget:1200000,allocated:200000,actual:200000,balance:1000000,pct:16.67},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Water Bills",itemCode:"2305",budget:1680000,allocated:389574,actual:389574,balance:1290426,pct:23.19},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Hire of Security Services",itemCode:"2410",budget:7800000,allocated:2115000,actual:2115000,balance:5685000,pct:27.12},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Cleaning materials",itemCode:"2418",budget:1860000,allocated:0,actual:0,balance:1860000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"314",item:"Rent for dweling units",itemCode:"2603",budget:9000000,allocated:1800000,actual:1800000,balance:7200000,pct:20},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Rations & Provisions",itemCode:"3201",budget:24309083.260000005,allocated:4304926.6,actual:4304926.6,balance:20004156.660000004,pct:17.71},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Entertainment",itemCode:"3353",budget:1080000,allocated:270000,actual:270000,balance:810000,pct:25},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"General Maint. Other Assets",itemCode:"3519",budget:2400000,allocated:0,actual:0,balance:2400000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"Provision of Medical Supplies & Services",actCode:"",item:"Medical Drugs & Services",itemCode:"2501",budget:1696000,allocated:0,actual:0,balance:1696000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"315",item:"Medical Aid Premiums",itemCode:"2511",budget:11682000,allocated:3225000,actual:3225000,balance:8457000,pct:27.61},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Medical Expenses",itemCode:"2517",budget:6800000,allocated:0,actual:0,balance:6800000,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:1191600,allocated:0,actual:0,balance:1191600,pct:0},
{department:"Cowgirls (Women's Squad)",activity:"Providing Motor Vehicle Maintenances",actCode:"316",item:"M/Vehicle Maintenance",itemCode:"3512",budget:9300000,allocated:1859500,actual:1859500,balance:7440500,pct:19.99},
{department:"Cowgirls (Women's Squad)",activity:"Providing Motor Vehicle Insurance & Licences",actCode:"317",item:"M/Vehicle Insurance & COF",itemCode:"3402",budget:7579425,allocated:0,actual:0,balance:7579425,pct:0},
{department:"Reserve Team",activity:"Processing payments: Salaries & Benefits",actCode:"",item:"Salaries - Players",itemCode:"1001",budget:55439999.88,allocated:4626666.65,actual:4564666.654999999,balance:50875333.225,pct:8.23},
{department:"Reserve Team",activity:"",actCode:"",item:"Salaries Technical",itemCode:"1001",budget:25200000,allocated:651118.03,actual:130000,balance:25070000,pct:0.52},
{department:"Reserve Team",activity:"",actCode:"401",item:"Group Life Assurance",itemCode:"3004",budget:1733759.99742,allocated:0,actual:0,balance:1733759.99742,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Pension - Players",itemCode:"4680",budget:5543999.988,allocated:0,actual:0,balance:5543999.988,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Pension Technical",itemCode:"4680",budget:2520000,allocated:0,actual:0,balance:2520000,pct:0},
{department:"Reserve Team",activity:"Facilitating Training Sessions",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:32800000,allocated:1048000,actual:1048000,balance:31752000,pct:3.2},
{department:"Reserve Team",activity:"",actCode:"402",item:"Bottled Water & Consumables",itemCode:"2402",budget:10880000,allocated:0,actual:0,balance:10880000,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Ground & Sports facility rent",itemCode:"2650",budget:5500000,allocated:0,actual:0,balance:5500000,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Sports Equipments",itemCode:"2705",budget:3500000,allocated:0,actual:0,balance:3500000,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Training Allowance",itemCode:"2819",budget:500000,allocated:0,actual:0,balance:500000,pct:0},
{department:"Reserve Team",activity:"Fulfilling League fixtures - Home games",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:5425000,allocated:0,actual:0,balance:5425000,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Internal Trvel Allowance",itemCode:"2104",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Reserve Team",activity:"",actCode:"403",item:"Accommoodation Charges",itemCode:"2205",budget:7750000,allocated:0,actual:0,balance:7750000,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:1033750,allocated:0,actual:0,balance:1033750,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Bonuses & Other incentives",itemCode:"4685",budget:13300000,allocated:960500,actual:960500,balance:12339500,pct:7.22},
{department:"Reserve Team",activity:"Fulfilling League fixtures - Away games",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:1612000,allocated:0,actual:0,balance:1612000,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Internal Trvel Allowance",itemCode:"2104",budget:1000000,allocated:0,actual:0,balance:1000000,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Meal Allowances",itemCode:"2105",budget:930000,allocated:0,actual:0,balance:930000,pct:0},
{department:"Reserve Team",activity:"",actCode:"404",item:"Accommoodation Charges",itemCode:"2205",budget:1200000,allocated:0,actual:0,balance:1200000,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:363500,allocated:120000,actual:120000,balance:243500,pct:33.01},
{department:"Reserve Team",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:993000,allocated:198153.15,actual:198153.15,balance:794846.85,pct:19.96},
{department:"Reserve Team",activity:"",actCode:"",item:"Bonuses & Other incentives",itemCode:"4685",budget:3100000,allocated:0,actual:0,balance:3100000,pct:0},
{department:"Reserve Team",activity:"Provision of Kits & Uniforms",actCode:"411",item:"Uniform & Protective Clothing",itemCode:"2408",budget:15760000,allocated:0,actual:0,balance:15760000,pct:0},
{department:"Reserve Team",activity:"Facilitating subscriptions & Competitions Participation compliance",actCode:"412",item:"Subscriptions",itemCode:"3901",budget:80000,allocated:0,actual:0,balance:80000,pct:0},
{department:"Reserve Team",activity:"Provision of Medical Supplies & Services",actCode:"",item:"Medical Drugs & Services",itemCode:"2501",budget:1296000,allocated:0,actual:0,balance:1296000,pct:0},
{department:"Reserve Team",activity:"",actCode:"415",item:"Medical Aid Premiums",itemCode:"2511",budget:13452000,allocated:1791000,actual:1791000,balance:11661000,pct:13.31},
{department:"Reserve Team",activity:"",actCode:"",item:"Medical Expenses & Services",itemCode:"2517",budget:5100000,allocated:0,actual:0,balance:5100000,pct:0},
{department:"Reserve Team",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:840000,allocated:0,actual:0,balance:840000,pct:0},
{department:"Reserve Team",activity:"Providing Motor Vehicle Maintenances",actCode:"416",item:"M/Vehicle Maintenances",itemCode:"3512",budget:3120000,allocated:1080000,actual:1080000,balance:2040000,pct:34.62},
{department:"Reserve Team",activity:"Providing Motor Vehicle, Licences, COF & Insurance cover",actCode:"417",item:"M/Vehicle Insurance",itemCode:"3402",budget:8262100,allocated:0,actual:0,balance:8262100,pct:0},
{department:"Youth Team",activity:"Processing payments: Salaries & Benefits",actCode:"501",item:"Salaries - Technical",itemCode:"1001",budget:21685714.200000003,allocated:1792142.85,actual:1509499.9949999999,balance:20176214.205000002,pct:6.96},
{department:"Youth Team",activity:"",actCode:"",item:"Group Life Assurance",itemCode:"3004",budget:466242.85530000005,allocated:0,actual:0,balance:466242.85530000005,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Pension - Technical",itemCode:"4680",budget:2168571.4200000004,allocated:0,actual:0,balance:2168571.4200000004,pct:0},
{department:"Youth Team",activity:"Facilitating Training Sessions",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:16800000,allocated:3589000,actual:3589000,balance:13211000,pct:21.36},
{department:"Youth Team",activity:"",actCode:"",item:"Meal Allowances",itemCode:"2105",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Youth Team",activity:"",actCode:"502",item:"Bottled Water & Consumables",itemCode:"2402",budget:8160000,allocated:0,actual:0,balance:8160000,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Gound & Sports facility rent",itemCode:"2650",budget:1000000,allocated:160000,actual:160000,balance:840000,pct:16},
{department:"Youth Team",activity:"",actCode:"",item:"Gound & Sports facility rent",itemCode:"2705",budget:3500000,allocated:0,actual:0,balance:3500000,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Gound & Sports facility rent",itemCode:"2819",budget:500000,allocated:0,actual:0,balance:500000,pct:0},
{department:"Youth Team",activity:"Fulfilling League fixtures - Home games",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:1740000,allocated:0,actual:0,balance:1740000,pct:0},
{department:"Youth Team",activity:"",actCode:"503",item:"Meal Allowances",itemCode:"2105",budget:4350000,allocated:0,actual:0,balance:4350000,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Bottled Water & Consumables",itemCode:"2402",budget:1039500,allocated:0,actual:0,balance:1039500,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:2550000,allocated:160000,actual:160000,balance:2390000,pct:6.27},
{department:"Youth Team",activity:"Fulfilling League fixtures - Away games",actCode:"",item:"Transport Allowances",itemCode:"2102",budget:1740000,allocated:0,actual:0,balance:1740000,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Meal Allowances",itemCode:"2105",budget:4350000,allocated:0,actual:0,balance:4350000,pct:0},
{department:"Youth Team",activity:"",actCode:"504",item:"Bottled Water & Consumables",itemCode:"2402",budget:1039500,allocated:0,actual:0,balance:1039500,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:2979000,allocated:170000,actual:170000,balance:2809000,pct:5.71},
{department:"Youth Team",activity:"",actCode:"",item:"Bonuses & Other Incentives",itemCode:"4685",budget:4725000,allocated:670000,actual:670000,balance:4055000,pct:14.18},
{department:"Youth Team",activity:"Provision of Kits & Uniforms",actCode:"511",item:"Uniform & Protective Clothing",itemCode:"2408",budget:10300000,allocated:0,actual:0,balance:10300000,pct:0},
{department:"Youth Team",activity:"Provision of Medical Supplies & Services",actCode:"",item:"Medical Drugs & Services",itemCode:"2501",budget:1296000,allocated:100000,actual:0,balance:1296000,pct:0},
{department:"Youth Team",activity:"",actCode:"515",item:"Medical Aid Premiums",itemCode:"2511",budget:3930000,allocated:896000,actual:10276527.2,balance:-6346527.199999999,pct:261.49},
{department:"Youth Team",activity:"",actCode:"",item:"Medical Expenses",itemCode:"2517",budget:5580000,allocated:0,actual:0,balance:5580000,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Fuel & Lubricants",itemCode:"3401",budget:1191600,allocated:0,actual:0,balance:1191600,pct:0},
{department:"Youth Team",activity:"Acquisition of Fixed Assets",actCode:"",item:"Cost of Sales Kits & Uniforms",itemCode:"1000",budget:0,allocated:113021847.45,actual:113021847.45,balance:-113021847.45,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Pruchase of Motor Vehicles",itemCode:"4113",budget:170000000,allocated:0,actual:0,balance:170000000,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Purchase of Office Equipment",itemCode:"4115",budget:37000000,allocated:1350000,actual:1350000,balance:35650000,pct:3.65},
{department:"Youth Team",activity:"",actCode:"",item:"Purchase of Power Back up systems",itemCode:"4122",budget:9500000,allocated:0,actual:0,balance:9500000,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Purchase of Medical Equipment",itemCode:"4123",budget:3745000,allocated:0,actual:0,balance:3745000,pct:0},
{department:"Youth Team",activity:"",actCode:"",item:"Acquisition of Players",itemCode:"4199",budget:84000000,allocated:10300000,actual:10300000,balance:73700000,pct:12.26},
{department:"Youth Team",activity:"Total Funds brought forward (Cummulative Balance) 2025/2026",actCode:"",item:"",itemCode:"181733.8",budget:0,allocated:0,actual:0,balance:181733.8,pct:0},
{department:"Youth Team",activity:"Total Funds Received 2026",actCode:"",item:"",itemCode:"424698096.6829595",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Youth Team",activity:"Total Funds Received (Cummulative Balances)",actCode:"",item:"",itemCode:"424879830.4829595",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Youth Team",activity:"Total Cummulative Funds Received & allocated",actCode:"",item:"",itemCode:"349928216.34000003",budget:0,allocated:0,actual:0,balance:181733.8,pct:0},
{department:"Youth Team",activity:"Funds available for allocation",actCode:"",item:"",itemCode:"74951614.14295948",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Youth Team",activity:"Funds allocated and spent on activities",actCode:"",item:"",itemCode:"343192934.57",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Youth Team",activity:"Balances as per Cashbooks (Salaries & Operations A/Cs)",actCode:"",item:"",itemCode:"81686895.91295952",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Youth Team",activity:"Funds available for allocation",actCode:"",item:"",itemCode:"74951614.14295948",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Youth Team",activity:"Funds allocated but not yet spent",actCode:"",item:"",itemCode:"6735281.769999998",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Youth Team",activity:"Funds allocated and spent on activities",actCode:"",item:"",itemCode:"343192934.57",budget:0,allocated:0,actual:0,balance:0,pct:0},
{department:"Youth Team",activity:"Total Funding Received",actCode:"",item:"",itemCode:"424879830.48295945",budget:0,allocated:0,actual:0,balance:0,pct:0}
];

// Historical Stock In / Stock Out ledger imported from EFC_-_Inventory_movements_update.xlsx
// (Inventory In / Inventory Out sheets). These are already reflected in each item's current
// quantity above, so they're seeded directly as completed records (Verified / Issued) rather
// than replayed through the normal workflow, which would double-count the stock change.
const seedStockIn = [
{code:"SI-00001",itemId:2,quantity:16,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-21",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00002",itemId:4,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-21",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00003",itemId:5,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-21",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00004",itemId:423,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-21",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00005",itemId:6,quantity:19,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-21",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00006",itemId:7,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-21",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00007",itemId:8,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-21",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00008",itemId:1,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00009",itemId:2,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00010",itemId:3,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00011",itemId:26,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00012",itemId:27,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00013",itemId:402,quantity:25,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00014",itemId:403,quantity:27,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00015",itemId:404,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00016",itemId:405,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00017",itemId:13,quantity:22,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00018",itemId:14,quantity:23,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00019",itemId:15,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00020",itemId:16,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00021",itemId:23,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00022",itemId:24,quantity:18,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00023",itemId:25,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00024",itemId:21,quantity:19,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00025",itemId:367,quantity:18,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00026",itemId:22,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00027",itemId:368,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00028",itemId:337,quantity:11,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00029",itemId:34,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00030",itemId:35,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00031",itemId:36,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00032",itemId:338,quantity:1,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00033",itemId:339,quantity:1,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00034",itemId:17,quantity:12,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00035",itemId:18,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00036",itemId:19,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00037",itemId:360,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00038",itemId:361,quantity:1,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00039",itemId:20,quantity:1,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00040",itemId:9,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00041",itemId:10,quantity:18,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00042",itemId:11,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00043",itemId:12,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00044",itemId:28,quantity:39,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00045",itemId:29,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00046",itemId:30,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00047",itemId:31,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00048",itemId:32,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00049",itemId:33,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-04-22",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00050",itemId:37,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00051",itemId:38,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00052",itemId:39,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00053",itemId:40,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00054",itemId:41,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00055",itemId:42,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00056",itemId:43,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00057",itemId:44,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00058",itemId:45,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00059",itemId:46,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00060",itemId:47,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00061",itemId:48,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00062",itemId:49,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00063",itemId:50,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00064",itemId:51,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00065",itemId:52,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00066",itemId:53,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00067",itemId:54,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00068",itemId:55,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00069",itemId:56,quantity:35,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00070",itemId:57,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00071",itemId:58,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00072",itemId:59,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00073",itemId:60,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00074",itemId:61,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00075",itemId:62,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00076",itemId:63,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00077",itemId:64,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00078",itemId:65,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00079",itemId:66,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00080",itemId:67,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00081",itemId:68,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00082",itemId:69,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00083",itemId:70,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00084",itemId:71,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00085",itemId:72,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00086",itemId:73,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00087",itemId:74,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00088",itemId:75,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00089",itemId:133,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00090",itemId:134,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00091",itemId:135,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00092",itemId:136,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00093",itemId:76,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00094",itemId:77,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00095",itemId:78,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00096",itemId:79,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00097",itemId:80,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00098",itemId:81,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00099",itemId:82,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00100",itemId:83,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00101",itemId:84,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00102",itemId:85,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00103",itemId:86,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00104",itemId:32,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00105",itemId:31,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00106",itemId:29,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00107",itemId:30,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00108",itemId:33,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00109",itemId:9,quantity:9,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00110",itemId:10,quantity:19,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00111",itemId:11,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Senior Team",status:"Verified",attachments:[]},
{code:"SI-00112",itemId:87,quantity:28,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00113",itemId:88,quantity:31,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00114",itemId:89,quantity:16,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00115",itemId:345,quantity:9,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00116",itemId:346,quantity:9,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00117",itemId:347,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00118",itemId:369,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00119",itemId:370,quantity:12,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00120",itemId:374,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00121",itemId:375,quantity:13,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00122",itemId:372,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00123",itemId:373,quantity:11,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00124",itemId:137,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00125",itemId:138,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00126",itemId:139,quantity:13,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00127",itemId:362,quantity:21,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00128",itemId:363,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00129",itemId:364,quantity:16,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00130",itemId:179,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00131",itemId:180,quantity:16,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00132",itemId:103,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00133",itemId:104,quantity:13,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00134",itemId:33,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00135",itemId:27,quantity:36,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-10-06",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00136",itemId:105,quantity:29,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-06-19",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00137",itemId:107,quantity:100,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-06-19",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00138",itemId:108,quantity:90,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-06-19",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00139",itemId:109,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-06-19",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00140",itemId:113,quantity:70,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-06-19",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00141",itemId:114,quantity:100,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-06-19",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00142",itemId:115,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-06-19",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00143",itemId:116,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-06-19",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00144",itemId:117,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"2026-06-19",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00145",itemId:121,quantity:90,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00146",itemId:122,quantity:100,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00147",itemId:123,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00148",itemId:124,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00149",itemId:125,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00150",itemId:90,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00151",itemId:91,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00152",itemId:92,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00153",itemId:95,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00154",itemId:96,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00155",itemId:97,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00156",itemId:98,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00157",itemId:100,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00158",itemId:101,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00159",itemId:102,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00160",itemId:246,quantity:49,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00161",itemId:247,quantity:45,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00162",itemId:248,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00163",itemId:249,quantity:34,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00164",itemId:250,quantity:26,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00165",itemId:252,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00166",itemId:141,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00167",itemId:142,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00168",itemId:143,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00169",itemId:144,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00170",itemId:145,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00171",itemId:146,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00172",itemId:147,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00173",itemId:148,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00174",itemId:149,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00175",itemId:150,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00176",itemId:151,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00177",itemId:152,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00178",itemId:153,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00179",itemId:154,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00180",itemId:155,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00181",itemId:140,quantity:11,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00182",itemId:353,quantity:12,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00183",itemId:354,quantity:12,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00184",itemId:355,quantity:6,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00185",itemId:156,quantity:48,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00186",itemId:157,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00187",itemId:158,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00188",itemId:159,quantity:65,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00189",itemId:160,quantity:65,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00190",itemId:161,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00191",itemId:162,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00192",itemId:163,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00193",itemId:112,quantity:165,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00194",itemId:113,quantity:85,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00195",itemId:114,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00196",itemId:115,quantity:70,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00197",itemId:116,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00198",itemId:118,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00199",itemId:249,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00200",itemId:250,quantity:24,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00201",itemId:251,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00202",itemId:252,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00203",itemId:119,quantity:120,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00204",itemId:120,quantity:110,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00205",itemId:121,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00206",itemId:122,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00207",itemId:126,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00208",itemId:127,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00209",itemId:128,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00210",itemId:129,quantity:80,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00211",itemId:130,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00212",itemId:131,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00213",itemId:132,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00214",itemId:97,quantity:80,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00215",itemId:98,quantity:80,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00216",itemId:99,quantity:100,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00217",itemId:100,quantity:70,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00218",itemId:102,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00219",itemId:126,quantity:100,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00220",itemId:127,quantity:90,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00221",itemId:128,quantity:60,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00222",itemId:129,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00223",itemId:130,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00224",itemId:105,quantity:110,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00225",itemId:106,quantity:110,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00226",itemId:108,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00227",itemId:109,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00228",itemId:110,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00229",itemId:111,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00230",itemId:164,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00231",itemId:165,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00232",itemId:166,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00233",itemId:167,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00234",itemId:168,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00235",itemId:169,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00236",itemId:170,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00237",itemId:171,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00238",itemId:172,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00239",itemId:173,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00240",itemId:174,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00241",itemId:175,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00242",itemId:176,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00243",itemId:177,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00244",itemId:178,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00245",itemId:228,quantity:45,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00246",itemId:229,quantity:45,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00247",itemId:230,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00248",itemId:234,quantity:45,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00249",itemId:235,quantity:45,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00250",itemId:236,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00251",itemId:231,quantity:45,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00252",itemId:232,quantity:45,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00253",itemId:233,quantity:30,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00254",itemId:197,quantity:28,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00255",itemId:181,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00256",itemId:182,quantity:33,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00257",itemId:183,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00258",itemId:184,quantity:6,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00259",itemId:185,quantity:12,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00260",itemId:186,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00261",itemId:187,quantity:12,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00262",itemId:188,quantity:26,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00263",itemId:345,quantity:21,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00264",itemId:346,quantity:49,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00265",itemId:348,quantity:65,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00266",itemId:349,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00267",itemId:350,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00268",itemId:351,quantity:18,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00269",itemId:26,quantity:260,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00270",itemId:319,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00271",itemId:320,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00272",itemId:321,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00273",itemId:322,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00274",itemId:323,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00275",itemId:309,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00276",itemId:310,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00277",itemId:311,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00278",itemId:312,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00279",itemId:313,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00280",itemId:314,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00281",itemId:315,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00282",itemId:316,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00283",itemId:317,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00284",itemId:318,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00285",itemId:345,quantity:28,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00286",itemId:346,quantity:65,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00287",itemId:247,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00288",itemId:248,quantity:60,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00289",itemId:90,quantity:100,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00290",itemId:91,quantity:60,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00291",itemId:92,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00292",itemId:93,quantity:100,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00293",itemId:94,quantity:50,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00294",itemId:424,quantity:13,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00295",itemId:425,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00296",itemId:426,quantity:1,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00297",itemId:228,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00298",itemId:229,quantity:13,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00299",itemId:231,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00300",itemId:232,quantity:13,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00301",itemId:234,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00302",itemId:235,quantity:13,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00303",itemId:237,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00304",itemId:238,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00305",itemId:239,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00306",itemId:240,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00307",itemId:241,quantity:1,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00308",itemId:189,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00309",itemId:190,quantity:19,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00310",itemId:191,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00311",itemId:192,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00312",itemId:193,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00313",itemId:194,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00314",itemId:195,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Women's Team",status:"Verified",attachments:[]},
{code:"SI-00315",itemId:196,quantity:38,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00316",itemId:197,quantity:11,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00317",itemId:185,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00318",itemId:186,quantity:8,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00319",itemId:437,quantity:9,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00320",itemId:438,quantity:21,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00321",itemId:376,quantity:9,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00322",itemId:377,quantity:21,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00323",itemId:380,quantity:9,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00324",itemId:381,quantity:21,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00325",itemId:378,quantity:9,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00326",itemId:379,quantity:21,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00327",itemId:198,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00328",itemId:199,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00329",itemId:200,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00330",itemId:201,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00331",itemId:202,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00332",itemId:203,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00333",itemId:204,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00334",itemId:205,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00335",itemId:206,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00336",itemId:207,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00337",itemId:208,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00338",itemId:209,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00339",itemId:210,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00340",itemId:211,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00341",itemId:212,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00342",itemId:213,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00343",itemId:219,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00344",itemId:214,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00345",itemId:215,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00346",itemId:216,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00347",itemId:217,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00348",itemId:218,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00349",itemId:220,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00350",itemId:221,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00351",itemId:222,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00352",itemId:223,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00353",itemId:224,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00354",itemId:225,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00355",itemId:226,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00356",itemId:227,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00357",itemId:242,quantity:22,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00358",itemId:243,quantity:44,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00359",itemId:244,quantity:19,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00360",itemId:245,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Youth Team",status:"Verified",attachments:[]},
{code:"SI-00361",itemId:249,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: General",status:"Verified",attachments:[]},
{code:"SI-00362",itemId:253,quantity:1,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00363",itemId:254,quantity:6,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00364",itemId:255,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00365",itemId:256,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00366",itemId:257,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00367",itemId:258,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00368",itemId:259,quantity:5,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00369",itemId:260,quantity:2,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Board Members",status:"Verified",attachments:[]},
{code:"SI-00370",itemId:179,quantity:18,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00371",itemId:180,quantity:40,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00372",itemId:261,quantity:13,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Reserve Team",status:"Verified",attachments:[]},
{code:"SI-00373",itemId:262,quantity:8,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00374",itemId:263,quantity:18,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00375",itemId:264,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00376",itemId:265,quantity:12,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00377",itemId:266,quantity:6,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Sponsors",status:"Verified",attachments:[]},
{code:"SI-00378",itemId:267,quantity:7,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00379",itemId:268,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00380",itemId:269,quantity:15,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00381",itemId:270,quantity:32,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00382",itemId:271,quantity:29,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00383",itemId:272,quantity:23,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00384",itemId:273,quantity:14,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00385",itemId:274,quantity:9,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00386",itemId:275,quantity:9,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00387",itemId:276,quantity:4,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00388",itemId:277,quantity:13,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00389",itemId:278,quantity:20,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00390",itemId:279,quantity:21,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00391",itemId:280,quantity:25,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00392",itemId:281,quantity:17,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00393",itemId:282,quantity:19,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00394",itemId:283,quantity:10,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]},
{code:"SI-00395",itemId:284,quantity:3,supplier:"Not recorded",invoiceNumber:"",unitCost:0,dateReceived:"Not recorded",receivedBy:"Historical Import",verifiedBy:"Historical Import",condition:"Good",notes:"Team: Secretariate",status:"Verified",attachments:[]}
];

const seedStockOut = [
{code:"SO-00001",itemId:2,quantity:16,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00002",itemId:3,quantity:10,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00003",itemId:4,quantity:2,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00004",itemId:5,quantity:2,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00005",itemId:6,quantity:19,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00006",itemId:7,quantity:17,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00007",itemId:367,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00008",itemId:9,quantity:16,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00009",itemId:10,quantity:10,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00010",itemId:11,quantity:3,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00011",itemId:12,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00012",itemId:13,quantity:14,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00013",itemId:14,quantity:22,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00014",itemId:15,quantity:3,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00015",itemId:16,quantity:6,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00016",itemId:421,quantity:7,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00017",itemId:422,quantity:7,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00018",itemId:17,quantity:12,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00019",itemId:18,quantity:14,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00020",itemId:19,quantity:4,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00021",itemId:20,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00022",itemId:26,quantity:14,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00023",itemId:27,quantity:31,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00024",itemId:28,quantity:31,requestedBy:"Historical Import",team:"General",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00025",itemId:33,quantity:14,requestedBy:"Historical Import",team:"General",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00026",itemId:26,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00027",itemId:27,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00028",itemId:1,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00029",itemId:3,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00030",itemId:13,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00031",itemId:15,quantity:2,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00032",itemId:18,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00033",itemId:360,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00034",itemId:34,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00035",itemId:36,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00036",itemId:33,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00037",itemId:10,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: CHAIR",dateRequested:"2026-04-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00038",itemId:29,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00039",itemId:21,quantity:10,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00040",itemId:367,quantity:17,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00041",itemId:34,quantity:6,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00042",itemId:35,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00043",itemId:36,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00044",itemId:23,quantity:10,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00045",itemId:24,quantity:18,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00046",itemId:25,quantity:3,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00047",itemId:26,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00048",itemId:2,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: ONLY BANDA",dateRequested:"2026-04-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00049",itemId:7,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: DUNCAN",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00050",itemId:23,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: DUNCAN",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00051",itemId:34,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00052",itemId:17,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00053",itemId:18,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00054",itemId:2,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00055",itemId:3,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00056",itemId:13,quantity:2,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00057",itemId:1,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: DUNCAN",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00058",itemId:34,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: DUNCAN",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00059",itemId:17,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: DUNCAN",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00060",itemId:21,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: WONDERFUL",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00061",itemId:1,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00062",itemId:13,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00063",itemId:26,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00064",itemId:17,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00065",itemId:337,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Mr Chirwa",dateRequested:"2026-03-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00066",itemId:2,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Chair",dateRequested:"2026-05-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00067",itemId:1,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Kenneth Mwale",dateRequested:"2026-10-05",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00068",itemId:2,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mudrick Salomu",dateRequested:"2026-05-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00069",itemId:14,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Mudrick Salomu",dateRequested:"2026-05-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00070",itemId:27,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mudrick Salomu",dateRequested:"2026-05-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00071",itemId:2,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-05-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00072",itemId:13,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-05-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00073",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-05-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00074",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Jekapu",dateRequested:"2026-03-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00075",itemId:2,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Jekapu",dateRequested:"2026-03-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00076",itemId:13,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Jekapu",dateRequested:"2026-03-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00077",itemId:287,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Jekapu",dateRequested:"2026-03-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00078",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Edgar Lali",dateRequested:"2026-03-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00079",itemId:2,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Edgar Lali",dateRequested:"2026-03-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00080",itemId:126,quantity:9,requestedBy:"Historical Import",team:"General",purpose:"Received by: Only Banda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00081",itemId:127,quantity:16,requestedBy:"Historical Import",team:"General",purpose:"Received by: Only Banda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00082",itemId:128,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Only Banda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00083",itemId:98,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Only Banda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00084",itemId:99,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Only Banda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00085",itemId:87,quantity:8,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00086",itemId:88,quantity:17,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00087",itemId:89,quantity:2,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00088",itemId:90,quantity:8,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00089",itemId:91,quantity:13,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00090",itemId:92,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00091",itemId:98,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00092",itemId:10,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Wonderful",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00093",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Wonderful",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00094",itemId:27,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Wonderful",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00095",itemId:10,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00096",itemId:288,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: DUNCAN",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00097",itemId:191,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: Russel",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00098",itemId:3,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Russel",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00099",itemId:289,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Russel",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00100",itemId:347,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Duncan",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00101",itemId:296,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00102",itemId:303,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00103",itemId:300,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00104",itemId:86,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00105",itemId:292,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00106",itemId:84,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00107",itemId:66,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00108",itemId:78,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00109",itemId:302,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00110",itemId:299,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00111",itemId:295,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (President's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00112",itemId:433,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (Annabel's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00113",itemId:294,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (Annabel's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00114",itemId:301,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (Annabel's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00115",itemId:297,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (Annabel's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00116",itemId:64,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (Annabel's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00117",itemId:76,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (Annabel's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00118",itemId:86,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (Annabel's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00119",itemId:289,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (Annabel's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00120",itemId:82,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO (Annabel's)",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00121",itemId:435,quantity:3,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CEO",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00122",itemId:295,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00123",itemId:302,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00124",itemId:299,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00125",itemId:86,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00126",itemId:66,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00127",itemId:84,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00128",itemId:78,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00129",itemId:341,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00130",itemId:261,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-05-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00131",itemId:436,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franklin  Silver",dateRequested:"2026-08-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00132",itemId:103,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Robin Ngalande",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00133",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00134",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00135",itemId:86,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00136",itemId:77,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00137",itemId:76,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: CHAIR",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00138",itemId:33,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00139",itemId:66,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Board Member",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00140",itemId:86,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Board Member",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00141",itemId:74,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Board Member",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00142",itemId:70,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Board Member",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00143",itemId:135,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Board Member",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00144",itemId:78,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Board Member",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00145",itemId:435,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Board Member",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00146",itemId:84,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Board Member",dateRequested:"2026-09-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00147",itemId:180,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Davie Maganga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00148",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Davie Maganga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00149",itemId:289,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Davie Maganga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00150",itemId:103,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Davie Maganga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00151",itemId:33,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Davie Maganga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00152",itemId:179,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Edmond Mapulanga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00153",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Edmond Mapulanga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00154",itemId:103,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Edmond Mapulanga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00155",itemId:289,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Edmond Mapulanga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00156",itemId:33,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Edmond Mapulanga",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00157",itemId:180,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Overton Zuze",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00158",itemId:346,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Overton Zuze",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00159",itemId:103,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Overton Zuze",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00160",itemId:289,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Overton Zuze",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00161",itemId:33,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Overton Zuze",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00162",itemId:340,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00163",itemId:289,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00164",itemId:180,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00165",itemId:103,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00166",itemId:33,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00167",itemId:46,quantity:11,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00168",itemId:47,quantity:9,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00169",itemId:55,quantity:9,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00170",itemId:56,quantity:10,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00171",itemId:57,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00172",itemId:37,quantity:11,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00173",itemId:38,quantity:15,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00174",itemId:39,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00175",itemId:40,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00176",itemId:40,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Ng'ona",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00177",itemId:39,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Ng'ona",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00178",itemId:38,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Ng'ona",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00179",itemId:366,quantity:4,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Ng'ona",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00180",itemId:56,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Ng'ona",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00181",itemId:57,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Ng'ona",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00182",itemId:47,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: ThomsonPeter",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00183",itemId:56,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: ThomsonPeter",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00184",itemId:39,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: ThomsonPeter",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00185",itemId:86,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: ThomsonPeter",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00186",itemId:289,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: ThomsonPeter",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00187",itemId:286,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Leonard Odipo",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00188",itemId:86,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Leonard Odipo",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00189",itemId:337,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Mr Chirwa",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00190",itemId:337,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Mr Chirwa",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00191",itemId:51,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-12-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00192",itemId:62,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-12-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00193",itemId:53,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-12-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00194",itemId:41,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-12-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00195",itemId:45,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-12-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00196",itemId:54,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-12-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00197",itemId:180,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Leonard Odipo",dateRequested:"2026-10-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00198",itemId:37,quantity:4,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-06-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00199",itemId:38,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-06-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00200",itemId:39,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-06-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00201",itemId:55,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-06-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00202",itemId:56,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-06-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00203",itemId:46,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-06-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00204",itemId:47,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Chair-SALES",dateRequested:"2026-06-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00205",itemId:362,quantity:13,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Frascis Mkonda",dateRequested:"2026-06-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00206",itemId:365,quantity:14,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Frascis Mkonda",dateRequested:"2026-06-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00207",itemId:103,quantity:13,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Frascis Mkonda",dateRequested:"2026-06-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00208",itemId:104,quantity:14,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Frascis Mkonda",dateRequested:"2026-06-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00209",itemId:179,quantity:16,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Frascis Mkonda",dateRequested:"2026-06-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00210",itemId:180,quantity:9,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Frascis Mkonda",dateRequested:"2026-06-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00211",itemId:261,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Frascis Mkonda",dateRequested:"2026-06-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00212",itemId:88,quantity:2,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Frascis Mkonda",dateRequested:"2026-06-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00213",itemId:89,quantity:2,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Frascis Mkonda",dateRequested:"2026-06-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00214",itemId:365,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Mudrick Salomu",dateRequested:"2026-06-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00215",itemId:104,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Mudrick Salomu",dateRequested:"2026-06-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00216",itemId:298,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Bright Nyauti",dateRequested:"2026-06-16",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00217",itemId:77,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Bright Nyauti",dateRequested:"2026-06-16",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00218",itemId:86,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Bright Nyauti",dateRequested:"2026-06-16",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00219",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Memory Kanjero",dateRequested:"2026-06-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00220",itemId:348,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chifundo Bonga",dateRequested:"2026-06-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00221",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Nazil Karlos",dateRequested:"2026-06-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00222",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Edward Sallim",dateRequested:"2026-06-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00223",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Blessings Gwembere",dateRequested:"2026-06-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00224",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Bright Nyauti",dateRequested:"2026-06-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00225",itemId:187,quantity:12,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00226",itemId:188,quantity:14,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00227",itemId:437,quantity:9,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00228",itemId:438,quantity:17,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00229",itemId:198,quantity:10,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00230",itemId:200,quantity:10,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00231",itemId:199,quantity:10,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00232",itemId:201,quantity:10,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00233",itemId:181,quantity:7,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00234",itemId:182,quantity:19,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00235",itemId:185,quantity:18,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00236",itemId:186,quantity:8,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00237",itemId:196,quantity:26,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00238",itemId:378,quantity:9,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00239",itemId:379,quantity:17,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00240",itemId:380,quantity:9,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00241",itemId:381,quantity:17,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00242",itemId:376,quantity:9,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00243",itemId:377,quantity:17,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00244",itemId:187,quantity:1,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00245",itemId:188,quantity:3,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00246",itemId:185,quantity:5,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00247",itemId:197,quantity:4,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00248",itemId:196,quantity:5,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley  Chimera",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00249",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Chirwa-YOUTH",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00250",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Chirwa-YOUTH",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00251",itemId:127,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Chirwa-YOUTH",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00252",itemId:121,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Lukoko Juma",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00253",itemId:343,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00254",itemId:354,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00255",itemId:156,quantity:2,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00256",itemId:145,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00257",itemId:143,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00258",itemId:153,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00259",itemId:155,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00260",itemId:148,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00261",itemId:150,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00262",itemId:248,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Union Building Construction",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00263",itemId:151,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00264",itemId:141,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00265",itemId:148,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00266",itemId:153,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00267",itemId:144,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00268",itemId:145,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00269",itemId:140,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00270",itemId:140,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00271",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00272",itemId:249,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: STEVESONS",dateRequested:"2026-06-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00273",itemId:249,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00274",itemId:156,quantity:4,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00275",itemId:142,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00276",itemId:145,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00277",itemId:147,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00278",itemId:150,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00279",itemId:155,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00280",itemId:153,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00281",itemId:353,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00282",itemId:354,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: MKOKOMO",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00283",itemId:26,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00284",itemId:33,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00285",itemId:103,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00286",itemId:369,quantity:2,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00287",itemId:370,quantity:19,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00288",itemId:371,quantity:2,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00289",itemId:288,quantity:27,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00290",itemId:127,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00291",itemId:112,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Maonga",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00292",itemId:105,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Maonga",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00293",itemId:119,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Maonga",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00294",itemId:418,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Peter Majanga",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00295",itemId:105,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Peter Majanga",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00296",itemId:119,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Peter Majanga",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00297",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Emmanuel Kadzuwa",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00298",itemId:107,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Emmanuel Kadzuwa",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00299",itemId:121,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Emmanuel Kadzuwa",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00300",itemId:90,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00301",itemId:91,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00302",itemId:92,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00303",itemId:93,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00304",itemId:94,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00305",itemId:95,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00306",itemId:97,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00307",itemId:98,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00308",itemId:99,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00309",itemId:100,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00310",itemId:101,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00311",itemId:102,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00312",itemId:126,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00313",itemId:127,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00314",itemId:128,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00315",itemId:129,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00316",itemId:130,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00317",itemId:131,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00318",itemId:403,quantity:2,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00319",itemId:404,quantity:3,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00320",itemId:405,quantity:5,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: DUNCAN -MAIN TEAM TECH",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00321",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00322",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00323",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00324",itemId:77,quantity:3,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00325",itemId:83,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00326",itemId:85,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00327",itemId:65,quantity:2,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00328",itemId:67,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00329",itemId:69,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00330",itemId:70,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00331",itemId:71,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00332",itemId:134,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00333",itemId:135,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00334",itemId:136,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00335",itemId:134,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00336",itemId:135,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00337",itemId:136,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00338",itemId:291,quantity:3,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00339",itemId:73,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00340",itemId:74,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00341",itemId:75,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00342",itemId:435,quantity:3,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Chair-(Dumi, Ronald  &Alfred)",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00343",itemId:126,quantity:9,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00344",itemId:127,quantity:17,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00345",itemId:128,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00346",itemId:91,quantity:8,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00347",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Enos Chatama",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00348",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Enos Chatama",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00349",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Enos Chatama",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00350",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Enos Chatama",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00351",itemId:403,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Enos Chatama",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00352",itemId:130,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Leonard Odipo",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00353",itemId:94,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Leonard Odipo",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00354",itemId:101,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Leonard Odipo",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00355",itemId:137,quantity:2,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00356",itemId:138,quantity:3,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00357",itemId:90,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00358",itemId:91,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00359",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00360",itemId:97,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00361",itemId:98,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00362",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00363",itemId:126,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00364",itemId:127,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00365",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00366",itemId:356,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00367",itemId:358,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00368",itemId:359,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00369",itemId:357,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2027-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00370",itemId:103,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Hastings Pinto",dateRequested:"2027-07-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00371",itemId:104,quantity:2,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Hastings Pinto",dateRequested:"2027-07-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00372",itemId:403,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Edgar Lali",dateRequested:"2027-07-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00373",itemId:85,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Leonard Odipo",dateRequested:"2027-07-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00374",itemId:87,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: James  Msongole",dateRequested:"2026-07-17",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00375",itemId:104,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: James  Msongole",dateRequested:"2026-07-17",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00376",itemId:362,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: James  Msongole",dateRequested:"2026-07-17",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00377",itemId:288,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: James  Msongole",dateRequested:"2026-07-17",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00378",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Theodore Kawalala",dateRequested:"2026-07-17",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00379",itemId:403,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: CLIFFORD JEKAPU",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00380",itemId:403,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Kwangu Kachale",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00381",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Madalitso Kazembe",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00382",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Madalitso Kazembe",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00383",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Madalitso Kazembe",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00384",itemId:67,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Madalitso Kazembe",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00385",itemId:33,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Madalitso Kazembe",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00386",itemId:196,quantity:1,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Madalitso Kazembe",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00387",itemId:186,quantity:1,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Madalitso Kazembe",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00388",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Madalitso Kazembe",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00389",itemId:119,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00390",itemId:120,quantity:8,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00391",itemId:121,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00392",itemId:122,quantity:8,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00393",itemId:123,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00394",itemId:112,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00395",itemId:113,quantity:8,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00396",itemId:114,quantity:8,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00397",itemId:115,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00398",itemId:105,quantity:8,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00399",itemId:106,quantity:8,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00400",itemId:107,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00401",itemId:108,quantity:8,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00402",itemId:109,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00403",itemId:110,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00404",itemId:325,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00405",itemId:329,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00406",itemId:324,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00407",itemId:328,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00408",itemId:327,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00409",itemId:326,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00410",itemId:329,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00411",itemId:33,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: DUNCAN & WONDERFUL",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00412",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 151",dateRequested:"2026-06-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00413",itemId:114,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 151",dateRequested:"2026-06-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00414",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 152",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00415",itemId:121,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 152",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00416",itemId:26,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 152",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00417",itemId:120,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 153",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00418",itemId:121,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 153",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00419",itemId:107,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 153",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00420",itemId:92,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 153",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00421",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 153",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00422",itemId:169,quantity:4,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00423",itemId:170,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00424",itemId:171,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00425",itemId:172,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00426",itemId:173,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00427",itemId:174,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00428",itemId:175,quantity:4,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00429",itemId:176,quantity:5,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00430",itemId:177,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00431",itemId:178,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00432",itemId:164,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00433",itemId:165,quantity:2,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00434",itemId:166,quantity:5,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00435",itemId:167,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00436",itemId:168,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 154",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00437",itemId:321,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 155",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00438",itemId:317,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 155",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00439",itemId:121,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 155",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00440",itemId:122,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 155",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00441",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 155",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00442",itemId:123,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 155",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00443",itemId:107,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 156",dateRequested:"2026-06-24",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00444",itemId:176,quantity:2,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 157",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00445",itemId:171,quantity:2,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 157",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00446",itemId:166,quantity:2,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 157",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00447",itemId:167,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 157",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00448",itemId:177,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 157",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00449",itemId:172,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 157",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00450",itemId:167,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 158",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00451",itemId:177,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 158",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00452",itemId:172,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: INVOICE 158",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00453",itemId:97,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 159",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00454",itemId:90,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 159",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00455",itemId:126,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 159",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00456",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 159",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00457",itemId:100,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 159",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00458",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 159",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00459",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 159",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00460",itemId:98,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 159",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00461",itemId:91,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 159",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00462",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 160",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00463",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 160",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00464",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 160",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00465",itemId:247,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 161",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00466",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 161",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00467",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00468",itemId:116,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00469",itemId:90,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00470",itemId:97,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00471",itemId:126,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00472",itemId:128,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00473",itemId:99,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00474",itemId:92,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00475",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00476",itemId:347,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 162",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00477",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 751",dateRequested:"2026-06-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00478",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 752",dateRequested:"2026-06-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00479",itemId:347,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 752",dateRequested:"2026-06-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00480",itemId:26,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 752",dateRequested:"2026-06-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00481",itemId:109,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 753",dateRequested:"2026-06-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00482",itemId:109,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 754",dateRequested:"2026-06-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00483",itemId:116,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 754",dateRequested:"2026-06-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00484",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 755",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00485",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 756",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00486",itemId:117,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 758",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00487",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 759",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00488",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 759",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00489",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 759",dateRequested:"2026-06-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00490",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 760",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00491",itemId:90,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 761",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00492",itemId:252,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 763",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00493",itemId:111,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 763",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00494",itemId:102,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 763",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00495",itemId:132,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 763",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00496",itemId:118,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 763",dateRequested:"2026-06-25",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00497",itemId:321,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 764",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00498",itemId:174,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 764",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00499",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 765",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00500",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 766",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00501",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 767",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00502",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 768",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00503",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 769",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00504",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 770",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00505",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 770",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00506",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 771",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00507",itemId:106,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 772",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00508",itemId:113,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 772",dateRequested:"2026-06-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00509",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 773",dateRequested:"2026-01-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00510",itemId:109,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 773",dateRequested:"2026-01-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00511",itemId:123,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 773",dateRequested:"2026-01-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00512",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 774",dateRequested:"2026-01-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00513",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 774",dateRequested:"2026-01-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00514",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 775",dateRequested:"2026-01-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00515",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 776",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00516",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 777",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00517",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 778",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00518",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 780",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00519",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 781",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00520",itemId:109,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 782",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00521",itemId:26,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 782",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00522",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 783",dateRequested:"2026-09-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00523",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 783",dateRequested:"2026-09-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00524",itemId:97,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 791",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00525",itemId:90,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 792",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00526",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 793",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00527",itemId:121,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 794",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00528",itemId:100,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 795",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00529",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 795",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00530",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 795",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00531",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 796",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00532",itemId:120,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 797",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00533",itemId:129,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 798",dateRequested:"2026-07-16",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00534",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 799",dateRequested:"2026-07-16",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00535",itemId:119,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 800",dateRequested:"2026-07-17",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00536",itemId:112,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 800",dateRequested:"2026-07-17",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00537",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 800",dateRequested:"2026-07-17",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00538",itemId:66,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: RECEIPT 801",dateRequested:"2026-07-17",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00539",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 802",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00540",itemId:109,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 802",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00541",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 802",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00542",itemId:95,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 803",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00543",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 803",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00544",itemId:109,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 804",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00545",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 805",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00546",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 806",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00547",itemId:332,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 807",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00548",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 807",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00549",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 807",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00550",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 807",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00551",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 807",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00552",itemId:112,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 808",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00553",itemId:320,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: RECEIPT 808",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00554",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 809",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00555",itemId:120,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 809",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00556",itemId:126,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 810",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00557",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 811",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00558",itemId:94,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 812",dateRequested:"2026-07-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00559",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 813",dateRequested:"2026-07-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00560",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 814",dateRequested:"2026-07-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00561",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 816",dateRequested:"2026-07-24",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00562",itemId:116,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 817",dateRequested:"2026-07-24",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00563",itemId:97,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 818",dateRequested:"2026-07-24",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00564",itemId:169,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: RECEIPT 819",dateRequested:"2026-07-24",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00565",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 820",dateRequested:"2026-07-24",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00566",itemId:102,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 823",dateRequested:"2026-07-27",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00567",itemId:37,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 101",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00568",itemId:37,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 102",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00569",itemId:46,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 102",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00570",itemId:48,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 102",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00571",itemId:40,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 104",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00572",itemId:40,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 105",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00573",itemId:39,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 105",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00574",itemId:55,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 105",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00575",itemId:55,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00576",itemId:56,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00577",itemId:57,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00578",itemId:59,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00579",itemId:60,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00580",itemId:61,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00581",itemId:46,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00582",itemId:47,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00583",itemId:48,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00584",itemId:50,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00585",itemId:51,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00586",itemId:37,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00587",itemId:38,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 107",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00588",itemId:46,quantity:11,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 108",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00589",itemId:47,quantity:9,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 108",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00590",itemId:55,quantity:9,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 108",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00591",itemId:56,quantity:10,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 108",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00592",itemId:57,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 108",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00593",itemId:37,quantity:11,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 108",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00594",itemId:38,quantity:15,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 108",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00595",itemId:39,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 108",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00596",itemId:40,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 108",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00597",itemId:47,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 111",dateRequested:"2026-12-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00598",itemId:246,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 112",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00599",itemId:247,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 112",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00600",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 112",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00601",itemId:26,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 112",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00602",itemId:290,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 112",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00603",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 112",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00604",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 112",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00605",itemId:347,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 112",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00606",itemId:116,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 113",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00607",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 114",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00608",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 115",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00609",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 115",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00610",itemId:116,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 116",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00611",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 117",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00612",itemId:92,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 118",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00613",itemId:112,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 119",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00614",itemId:113,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 119",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00615",itemId:115,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 119",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00616",itemId:116,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 119",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00617",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 119",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00618",itemId:119,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 119",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00619",itemId:120,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 119",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00620",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 120",dateRequested:"2026-06-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00621",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 121",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00622",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 121",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00623",itemId:122,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 121",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00624",itemId:246,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 122",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00625",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 123",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00626",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 123",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00627",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 124",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00628",itemId:126,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 125",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00629",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 125",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00630",itemId:117,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 126",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00631",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 126",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00632",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 127",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00633",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 127",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00634",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 127",dateRequested:"2026-07-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00635",itemId:115,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 128",dateRequested:"2026-07-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00636",itemId:121,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 128",dateRequested:"2026-07-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00637",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 129",dateRequested:"2026-07-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00638",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 130",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00639",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 131",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00640",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 132",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00641",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 133",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00642",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 134",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00643",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 135",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00644",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 136",dateRequested:"2026-07-15",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00645",itemId:305,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 137",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00646",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 137",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00647",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 137",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00648",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 137",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00649",itemId:86,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 137",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00650",itemId:26,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 137",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00651",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 137",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00652",itemId:224,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 137",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00653",itemId:434,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: INVOICE 137",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00654",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 138",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00655",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 139",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00656",itemId:113,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 139",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00657",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 140",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00658",itemId:249,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 140",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00659",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 141",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00660",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 142",dateRequested:"2026-07-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00661",itemId:105,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 143",dateRequested:"2027-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00662",itemId:109,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 143",dateRequested:"2027-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00663",itemId:345,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 144",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00664",itemId:254,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: INVOICE 144",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00665",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 144",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00666",itemId:127,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 144",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00667",itemId:91,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 144",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00668",itemId:179,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: INVOICE 145",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00669",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 146",dateRequested:"2026-07-31",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00670",itemId:333,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 147",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00671",itemId:414,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 148",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00672",itemId:118,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 149",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00673",itemId:124,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 149",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00674",itemId:109,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: INVOICE 149",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00675",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 824",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00676",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 825",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00677",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 826",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00678",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 827",dateRequested:"2026-07-31",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00679",itemId:114,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 829",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00680",itemId:107,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 830",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00681",itemId:100,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 832",dateRequested:"2026-05-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00682",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: RECEIPT 834",dateRequested:"2026-05-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00683",itemId:90,quantity:15,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00684",itemId:97,quantity:15,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00685",itemId:126,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00686",itemId:91,quantity:15,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00687",itemId:98,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00688",itemId:127,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00689",itemId:92,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00690",itemId:99,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00691",itemId:128,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00692",itemId:330,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00693",itemId:331,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00694",itemId:332,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00695",itemId:333,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00696",itemId:334,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00697",itemId:26,quantity:25,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00698",itemId:112,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00699",itemId:105,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00700",itemId:119,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00701",itemId:113,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00702",itemId:106,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00703",itemId:120,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00704",itemId:114,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00705",itemId:107,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00706",itemId:121,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00707",itemId:246,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00708",itemId:247,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00709",itemId:248,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00710",itemId:249,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00711",itemId:250,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00712",itemId:251,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00713",itemId:252,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00714",itemId:345,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00715",itemId:346,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00716",itemId:347,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00717",itemId:348,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00718",itemId:349,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00719",itemId:351,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00720",itemId:429,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00721",itemId:430,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00722",itemId:431,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00723",itemId:93,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00724",itemId:94,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00725",itemId:95,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00726",itemId:96,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00727",itemId:100,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00728",itemId:101,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00729",itemId:102,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00730",itemId:386,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00731",itemId:129,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00732",itemId:130,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00733",itemId:132,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00734",itemId:115,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00735",itemId:117,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00736",itemId:108,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00737",itemId:109,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00738",itemId:110,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00739",itemId:122,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00740",itemId:123,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00741",itemId:124,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00742",itemId:125,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00743",itemId:335,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00744",itemId:336,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00745",itemId:170,quantity:2,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00746",itemId:173,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00747",itemId:167,quantity:2,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00748",itemId:168,quantity:2,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00749",itemId:175,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00750",itemId:176,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00751",itemId:178,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: BT SHOP (Kondwani Mbewe)",dateRequested:"2026-07-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00752",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Theodore Kawalala",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00753",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Theodore Kawalala",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00754",itemId:403,quantity:1,requestedBy:"Historical Import",team:"Senior Team",purpose:"Received by: Theodore Kawalala",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00755",itemId:64,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Theodore Kawalala",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00756",itemId:26,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Theodore Kawalala",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00757",itemId:434,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Theodore Kawalala",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00758",itemId:88,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Theodore Kawalala",dateRequested:"2026-07-21",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00759",itemId:90,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-07-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00760",itemId:126,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-07-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00761",itemId:97,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Franscis Mkonda",dateRequested:"2026-07-22",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00762",itemId:49,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: James Lumbe",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00763",itemId:58,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: James Lumbe",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00764",itemId:432,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Edmond Mapulanga",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00765",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 901",dateRequested:"2026-11-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00766",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 906",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00767",itemId:122,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 906",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00768",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 201",dateRequested:"2026-04-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00769",itemId:330,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00770",itemId:331,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00771",itemId:333,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00772",itemId:90,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00773",itemId:91,quantity:20,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00774",itemId:92,quantity:15,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00775",itemId:97,quantity:15,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00776",itemId:98,quantity:20,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00777",itemId:99,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00778",itemId:100,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00779",itemId:126,quantity:15,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00780",itemId:127,quantity:15,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00781",itemId:128,quantity:10,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00782",itemId:129,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00783",itemId:26,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00784",itemId:345,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00785",itemId:346,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00786",itemId:347,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00787",itemId:349,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00788",itemId:246,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00789",itemId:247,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00790",itemId:249,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00791",itemId:251,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00792",itemId:252,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Akontha Clothes",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00793",itemId:90,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00794",itemId:91,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00795",itemId:92,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00796",itemId:97,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00797",itemId:98,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00798",itemId:99,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00799",itemId:126,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00800",itemId:127,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00801",itemId:128,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00802",itemId:112,quantity:15,requestedBy:"Historical Import",team:"General",purpose:"Received by: Chimwemwe Nkunika",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00803",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 151",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00804",itemId:114,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 151",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00805",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 152",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00806",itemId:121,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 152",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00807",itemId:293,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 152",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00808",itemId:120,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 153",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00809",itemId:121,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 153",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00810",itemId:107,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 153",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00811",itemId:92,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 153",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00812",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 153",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00813",itemId:392,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00814",itemId:393,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00815",itemId:394,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00816",itemId:395,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00817",itemId:401,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00818",itemId:396,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00819",itemId:397,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00820",itemId:398,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00821",itemId:399,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00822",itemId:400,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00823",itemId:387,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00824",itemId:388,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00825",itemId:389,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00826",itemId:390,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00827",itemId:391,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 154",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00828",itemId:410,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 155",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00829",itemId:411,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 155",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00830",itemId:409,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 155",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00831",itemId:122,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 155",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00832",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 155",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00833",itemId:123,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 155",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00834",itemId:107,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 156",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00835",itemId:398,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 157",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00836",itemId:394,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 157",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00837",itemId:389,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 157",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00838",itemId:390,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 157",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00839",itemId:399,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 157",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00840",itemId:395,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 157",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00841",itemId:399,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 158",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00842",itemId:395,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 158",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00843",itemId:390,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 158",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00844",itemId:97,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00845",itemId:90,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00846",itemId:126,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00847",itemId:100,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00848",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00849",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00850",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00851",itemId:98,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00852",itemId:127,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00853",itemId:91,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 159",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00854",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 160",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00855",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 160",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00856",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 160",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00857",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 161",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00858",itemId:304,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 161",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00859",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00860",itemId:116,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00861",itemId:90,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00862",itemId:126,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00863",itemId:97,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00864",itemId:99,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00865",itemId:128,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00866",itemId:92,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00867",itemId:342,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00868",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00869",itemId:347,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00870",itemId:347,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00871",itemId:344,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00872",itemId:344,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00873",itemId:293,quantity:7,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00874",itemId:246,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00875",itemId:248,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00876",itemId:250,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 162",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00877",itemId:107,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 163",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00878",itemId:113,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 163",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00879",itemId:119,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 164",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00880",itemId:105,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 164",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00881",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 164",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00882",itemId:112,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 164",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00883",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 164",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00884",itemId:121,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 164",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00885",itemId:114,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 164",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00886",itemId:107,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 164",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00887",itemId:347,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 165",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00888",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 166",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00889",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Not recorded",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00890",itemId:413,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Mulowa",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00891",itemId:349,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Mulowa",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00892",itemId:97,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Collins Chikalipo",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00893",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Charles Mafaiti",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00894",itemId:112,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00895",itemId:113,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00896",itemId:115,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00897",itemId:116,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00898",itemId:118,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00899",itemId:105,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00900",itemId:106,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00901",itemId:107,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00902",itemId:108,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00903",itemId:109,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00904",itemId:110,quantity:6,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00905",itemId:111,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00906",itemId:121,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00907",itemId:122,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00908",itemId:123,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00909",itemId:124,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00910",itemId:97,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00911",itemId:98,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00912",itemId:99,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00913",itemId:100,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00914",itemId:126,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00915",itemId:127,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00916",itemId:128,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00917",itemId:129,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00918",itemId:130,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00919",itemId:90,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00920",itemId:91,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00921",itemId:92,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00922",itemId:93,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00923",itemId:94,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00924",itemId:345,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00925",itemId:346,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00926",itemId:348,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00927",itemId:349,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00928",itemId:351,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00929",itemId:246,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00930",itemId:247,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00931",itemId:249,quantity:4,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00932",itemId:250,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00933",itemId:330,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00934",itemId:331,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00935",itemId:332,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00936",itemId:333,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00937",itemId:334,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00938",itemId:336,quantity:5,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00939",itemId:416,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00940",itemId:415,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00941",itemId:417,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00942",itemId:419,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00943",itemId:412,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00944",itemId:119,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Virginia Jangale",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00945",itemId:120,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Virginia Jangale",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00946",itemId:121,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Virginia Jangale",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00947",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Allan Kamfosi",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00948",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Johnson Sekani",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00949",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Steve Mkandawire",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00950",itemId:114,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Steve Mkandawire",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00951",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Hastings Pinto",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00952",itemId:114,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Allan Kamfosi",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00953",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Allan Kamfosi",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00954",itemId:419,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Virginia Jangale",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00955",itemId:246,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: CHAIR",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00956",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Puza Stenalla",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00957",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00958",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00959",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00960",itemId:108,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00961",itemId:118,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00962",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00963",itemId:331,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00964",itemId:332,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00965",itemId:332,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00966",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00967",itemId:307,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00968",itemId:332,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00969",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00970",itemId:99,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00971",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00972",itemId:91,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00973",itemId:127,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00974",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: William Mpinganjira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00975",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00976",itemId:92,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00977",itemId:93,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00978",itemId:94,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00979",itemId:382,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00980",itemId:383,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00981",itemId:384,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00982",itemId:385,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00983",itemId:126,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00984",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00985",itemId:128,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00986",itemId:112,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00987",itemId:113,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00988",itemId:114,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00989",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00990",itemId:105,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00991",itemId:106,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00992",itemId:107,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00993",itemId:119,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00994",itemId:120,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00995",itemId:121,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00996",itemId:122,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Benard Chipeya",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00997",itemId:332,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Kondwani Msimuko",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00998",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Kondwani Msimuko",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-00999",itemId:308,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Kondwani Msimuko",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01000",itemId:306,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Kondwani Msimuko",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01001",itemId:331,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Yamikani Nseula",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01002",itemId:304,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Yamikani Nseula",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01003",itemId:247,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Yamikani Nseula",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01004",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Yamikani Nseula",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01005",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Yamikani Nseula",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01006",itemId:332,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Joe Chakhumbira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01007",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Joe Chakhumbira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01008",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Joe Chakhumbira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01009",itemId:306,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Joe Chakhumbira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01010",itemId:308,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Joe Chakhumbira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01011",itemId:395,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Joe Chakhumbira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01012",itemId:389,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Joe Chakhumbira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01013",itemId:420,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Joe Chakhumbira",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01014",itemId:306,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Mthunzi whayo",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01015",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Mthunzi whayo",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01016",itemId:128,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Monti",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01017",itemId:304,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Monti",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01018",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Monti",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01019",itemId:395,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mr Monti",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01020",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Bessie",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01021",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01022",itemId:129,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Stema",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01023",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Davis",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01024",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Ernest",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01025",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Aunt Debz",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01026",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Landy",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01027",itemId:94,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Gladys",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01028",itemId:128,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Lusungu",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01029",itemId:262,quantity:5,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Main Team",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01030",itemId:263,quantity:16,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Main Team",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01031",itemId:264,quantity:15,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Main Team",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01032",itemId:265,quantity:7,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Main Team",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01033",itemId:266,quantity:3,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Main Team",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01034",itemId:265,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Supporters",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01035",itemId:261,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Supporters",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01036",itemId:180,quantity:3,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Supporters",dateRequested:"2026-07-28",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01037",itemId:242,quantity:8,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley Chimera",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01038",itemId:243,quantity:22,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley Chimera",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01039",itemId:428,quantity:1,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Bradley Chimera",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01040",itemId:244,quantity:11,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: Patricia Makwakwa",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01041",itemId:245,quantity:11,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: Patricia Makwakwa",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01042",itemId:427,quantity:5,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: Patricia Makwakwa",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01043",itemId:244,quantity:2,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: Patricia Makwakwa",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01044",itemId:245,quantity:3,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: Patricia Makwakwa",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01045",itemId:427,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: Patricia Makwakwa",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01046",itemId:179,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: James Msongole",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01047",itemId:179,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Francis Mkonda",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01048",itemId:258,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Madalitso Kazembe",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01049",itemId:33,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Kayamba",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01050",itemId:247,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Kayamba",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01051",itemId:179,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Brian Kayamba",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01052",itemId:26,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Kayamba",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01053",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Kayamba",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01054",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Kayamba",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01055",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Kayamba",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01056",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Brian Kayamba",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01057",itemId:88,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Brian Kayamba",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01058",itemId:180,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Alick Lungu",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01059",itemId:406,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Stella",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01060",itemId:347,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Enos Chatama",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01061",itemId:183,quantity:1,requestedBy:"Historical Import",team:"Youth Team",purpose:"Received by: Enos Chatama",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01062",itemId:408,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Patricia Makwakwa",dateRequested:"2026-08-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01063",itemId:407,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Patricia Makwakwa",dateRequested:"2026-08-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01064",itemId:406,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Patricia Makwakwa",dateRequested:"2026-08-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01065",itemId:245,quantity:1,requestedBy:"Historical Import",team:"Women's Team",purpose:"Received by: Khadidya Pangani",dateRequested:"2026-08-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01066",itemId:27,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Khadidya Pangani",dateRequested:"2026-08-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01067",itemId:260,quantity:1,requestedBy:"Historical Import",team:"Board Members",purpose:"Received by: Joshua Waka",dateRequested:"2026-08-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01068",itemId:261,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Enos Chatama",dateRequested:"2026-08-14",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01069",itemId:180,quantity:3,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Chair",dateRequested:"2026-08-27",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01070",itemId:179,quantity:1,requestedBy:"Historical Import",team:"Reserve Team",purpose:"Received by: Chair",dateRequested:"2026-08-27",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01071",itemId:122,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 203",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01072",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 203",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01073",itemId:285,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 205",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01074",itemId:264,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Invoice 207",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01075",itemId:264,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Invoice 210",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01076",itemId:263,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Invoice 210",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01077",itemId:262,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Invoice 210",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01078",itemId:344,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 210",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01079",itemId:352,quantity:3,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 210",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01080",itemId:265,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Invoice 211",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01081",itemId:250,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 211",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01082",itemId:334,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 211",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01083",itemId:347,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 211",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01084",itemId:130,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 211",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01085",itemId:101,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 211",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01086",itemId:26,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 211",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01087",itemId:126,quantity:9,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 212",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01088",itemId:127,quantity:16,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 212",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01089",itemId:128,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 212",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01090",itemId:99,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 212",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01091",itemId:98,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 212",dateRequested:"2026-07-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01092",itemId:112,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 214",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01093",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 215",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01094",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 216",dateRequested:"2026-08-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01095",itemId:122,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 216",dateRequested:"2026-08-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01096",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 216",dateRequested:"2026-08-18",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01097",itemId:115,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 217",dateRequested:"2026-08-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01098",itemId:106,quantity:2,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 218",dateRequested:"2026-08-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01099",itemId:107,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 218",dateRequested:"2026-08-19",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01100",itemId:96,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 219",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01101",itemId:386,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 219",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01102",itemId:96,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 219",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01103",itemId:96,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 220",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01104",itemId:248,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 221",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01105",itemId:95,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 222",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01106",itemId:100,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 223",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01107",itemId:265,quantity:1,requestedBy:"Historical Import",team:"Sponsors",purpose:"Received by: Invoice 223",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01108",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 223",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01109",itemId:94,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 223",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01110",itemId:247,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 224",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01111",itemId:347,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 225",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01112",itemId:107,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Invoice 226",dateRequested:"Not recorded",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01113",itemId:282,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Enos Chatama",dateRequested:"2026-08-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01114",itemId:273,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Enos Chatama",dateRequested:"2026-08-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01115",itemId:281,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Reserve players",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01116",itemId:279,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Reserve players",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01117",itemId:278,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Reserve players",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01118",itemId:277,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Reserve players",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01119",itemId:283,quantity:2,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Reserve players",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01120",itemId:284,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Reserve players",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01121",itemId:280,quantity:11,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Reserve players",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01122",itemId:33,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Mkonda- Team carrier",dateRequested:"2026-11-06",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01123",itemId:267,quantity:5,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Women team",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01124",itemId:268,quantity:7,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Women team",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01125",itemId:269,quantity:6,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Women team",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01126",itemId:270,quantity:7,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Women team",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01127",itemId:281,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Women team",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01128",itemId:277,quantity:9,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Women team",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01129",itemId:276,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Women team",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01130",itemId:278,quantity:9,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Women team",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01131",itemId:279,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Women team",dateRequested:"2026-06-23",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01132",itemId:268,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01133",itemId:269,quantity:5,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01134",itemId:270,quantity:6,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01135",itemId:271,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01136",itemId:272,quantity:5,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01137",itemId:273,quantity:4,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01138",itemId:276,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01139",itemId:278,quantity:5,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01140",itemId:279,quantity:5,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01141",itemId:280,quantity:4,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01142",itemId:281,quantity:5,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01143",itemId:282,quantity:6,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Youth team",dateRequested:"2026-06-26",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01144",itemId:278,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Main team",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01145",itemId:279,quantity:7,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Main team",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01146",itemId:281,quantity:3,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Main team",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01147",itemId:280,quantity:9,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Main team",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01148",itemId:282,quantity:5,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Main team",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01149",itemId:283,quantity:4,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Main team",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01150",itemId:284,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Khan",dateRequested:"2026-06-30",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01151",itemId:269,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Edgar Lare",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01152",itemId:280,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Edgar Lare",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01153",itemId:271,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Jekapu",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01154",itemId:281,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Jekapu",dateRequested:"2026-02-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01155",itemId:267,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Joyce Juju",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01156",itemId:282,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: James Msongole",dateRequested:"2026-05-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01157",itemId:272,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: James Msongole",dateRequested:"2026-05-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01158",itemId:272,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Mphatso Chihami",dateRequested:"2026-05-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01159",itemId:269,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Patrick Mwase",dateRequested:"2026-05-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01160",itemId:274,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Russel Mwafulirwa",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01161",itemId:270,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Edmond Mapulanga",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01162",itemId:283,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Russel Mwafulirwa",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01163",itemId:281,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Mkonda Francis",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01164",itemId:271,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Mkonda Francis",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01165",itemId:272,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Christoper Chulu",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01166",itemId:270,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Madalitso Mwachumu",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01167",itemId:271,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Alick Lungu",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01168",itemId:273,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Robin Ngalande",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01169",itemId:282,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Robin Ngalande",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01170",itemId:277,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Mphatso Chihami",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01171",itemId:283,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Mphatso Chihami",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01172",itemId:268,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Yusuf Nantunga",dateRequested:"2026-07-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01173",itemId:281,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Khadidya Pangani",dateRequested:"2026-08-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01174",itemId:272,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Khadidya Pangani",dateRequested:"2026-08-13",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01175",itemId:274,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Sibusiso Padambo",dateRequested:"2026-01-09",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01176",itemId:283,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Sibusiso Padambo",dateRequested:"2026-01-09",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01177",itemId:281,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Enos Chatama",dateRequested:"2026-02-09",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01178",itemId:275,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Enos Chatama",dateRequested:"2026-02-09",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01179",itemId:278,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Hadji James",dateRequested:"2026-03-09",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01180",itemId:272,quantity:1,requestedBy:"Historical Import",team:"Secretariate",purpose:"Received by: Not recorded",dateRequested:"2026-04-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01181",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 824",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01182",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 825",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01183",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 826",dateRequested:"2026-07-29",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01184",itemId:113,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 827",dateRequested:"2026-07-31",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01185",itemId:114,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 829",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01186",itemId:107,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 830",dateRequested:"2026-03-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01187",itemId:100,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 832",dateRequested:"2026-05-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01188",itemId:99,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 834",dateRequested:"2026-05-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01189",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 835",dateRequested:"2026-06-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01190",itemId:91,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 836",dateRequested:"2026-08-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01191",itemId:26,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 836",dateRequested:"2026-08-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01192",itemId:333,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 837",dateRequested:"2026-08-08",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01193",itemId:106,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 838",dateRequested:"2026-05-09",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01194",itemId:127,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 839",dateRequested:"2026-05-09",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01195",itemId:105,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 840",dateRequested:"2026-05-09",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01196",itemId:345,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 901",dateRequested:"2026-11-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01197",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 901",dateRequested:"2026-11-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01198",itemId:93,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 902",dateRequested:"2026-11-07",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01199",itemId:98,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 903",dateRequested:"2026-03-09",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01200",itemId:92,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 904",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""},
{code:"SO-01201",itemId:346,quantity:1,requestedBy:"Historical Import",team:"General",purpose:"Received by: Receipt 905",dateRequested:"2026-06-20",approvedBy:"Historical Import",issuedBy:"Historical Import",status:"Issued",notes:""}
];

const incomeCategories = ["Sponsorship", "Donations", "Membership", "Ticket Sales", "Merchandise", "Other Income"];
const expenseCategories = ["Transport", "Fuel", "Training", "Equipment", "Medical", "Accommodation", "Food", "Marketing", "Utilities", "Maintenance", "Office Expenses", "Other Expenses"];
// ---------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------
function Badge({ tone = "muted", children }) {
  const tones = {
    good: { bg: "#eaf2ea", fg: T.good },
    bad: { bg: "#f6e9e8", fg: T.bad },
    pending: { bg: "#f6eedb", fg: T.pending },
    muted: { bg: "#f0ede2", fg: "#6b6552" },
  };
  const s = tones[tone] || tones.muted;
  return (
    <span style={{
      background: s.bg, color: s.fg, fontSize: 12, fontWeight: 600,
      padding: "3px 9px", borderRadius: 999, display: "inline-block",
      letterSpacing: 0.2,
    }}>{children}</span>
  );
}

function StatCard({ label, value, sub, warn }) {
  return (
    <div style={{
      background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10,
      padding: "18px 20px", flex: 1, minWidth: 160,
      borderLeft: warn ? `4px solid ${T.bad}` : `4px solid ${T.gold}`,
    }}>
      <div style={{ fontSize: 13, color: "#7a7460", fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 28, color: T.ink, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#948d76", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 20 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 18px", borderBottom: `1px solid ${T.line}`,
      }}>
        <h3 style={{ fontFamily: "Oswald, sans-serif", fontSize: 16, color: T.ink, margin: 0, fontWeight: 600 }}>{title}</h3>
        {action}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function Table({ columns, rows, empty = "No records yet.", searchable = true, searchPlaceholder = "Search…" }) {
  const [q, setQ] = useState("");
  if (!rows.length) {
    return <div style={{ padding: "24px 0", textAlign: "center", color: "#a39c86", fontSize: 14 }}>{empty}</div>;
  }
  const searchKeys = columns.filter((c) => c.key && c.key !== "actions" && !c.noSearch).map((c) => c.key);
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((r) => searchKeys.some((k) => { const v = r[k]; return v !== undefined && v !== null && String(v).toLowerCase().includes(needle); }))
    : rows;
  const showSearch = searchable && rows.length >= 8 && searchKeys.length;
  return (
    <div>
      {showSearch && (
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          style={{ marginBottom: 8, padding: "6px 10px", border: `1px solid ${T.line}`, borderRadius: 6, fontSize: 12.5, fontFamily: "Inter, sans-serif", color: T.text, background: "#fffdf8", maxWidth: 260, boxSizing: "border-box", width: "100%" }}
        />
      )}
      <div style={{ overflowX: "auto" }}>
        {!filtered.length ? (
          <div style={{ padding: "18px 0", textAlign: "center", color: "#a39c86", fontSize: 13.5 }}>No rows match “{q}”.</div>
        ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{
                  textAlign: "left", padding: "8px 10px", color: "#948d76",
                  fontWeight: 600, fontSize: 11.5, textTransform: "uppercase",
                  letterSpacing: 0.4, borderBottom: `1px solid ${T.line}`,
                }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
                {columns.map((c) => (
                  <td key={c.key} style={{ padding: "10px 10px", color: T.text, verticalAlign: "top" }}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, color: "#6b6552", fontWeight: 600, marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", border: `1px solid ${T.line}`,
  borderRadius: 6, fontSize: 13.5, fontFamily: "Inter, sans-serif", color: T.text,
  boxSizing: "border-box", background: "#fffdf8",
};

function Drawer({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(21,20,15,0.45)",
      display: "flex", justifyContent: "flex-end", zIndex: 50,
    }} onClick={onClose}>
      <div
        style={{ width: 420, maxWidth: "92vw", background: T.cream, height: "100%", overflowY: "auto", boxShadow: "-8px 0 24px rgba(0,0,0,0.15)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px", borderBottom: `1px solid ${T.line}`, background: T.paper,
          position: "sticky", top: 0,
        }}>
          <h3 style={{ fontFamily: "Oswald, sans-serif", fontSize: 17, margin: 0, color: T.ink }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#948d76" }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, tone = "gold" }) {
  const bg = tone === "gold" ? T.gold : tone === "bad" ? T.bad : T.ink;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#d8d2bf" : bg, color: "#fff", border: "none",
        padding: "9px 16px", borderRadius: 6, fontSize: 13.5, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: "Inter, sans-serif",
      }}
    >{children}</button>
  );
}

function GhostButton({ children, onClick, tone }) {
  const c = tone === "bad" ? T.bad : tone === "good" ? T.good : T.ink;
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: `1px solid ${c}`, color: c,
      padding: "5px 11px", borderRadius: 6, fontSize: 12.5, fontWeight: 600,
      cursor: "pointer", marginRight: 6, fontFamily: "Inter, sans-serif",
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>{children}</button>
  );
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div style={{ display: "flex" }}>
      {onEdit && <GhostButton onClick={onEdit}><Pencil size={12} /> Edit</GhostButton>}
      {onDelete && <GhostButton tone="bad" onClick={onDelete}><Trash2 size={12} /> Delete</GhostButton>}
    </div>
  );
}

function AttachChip({ name, onRemove }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, background: "#f0ede2",
      padding: "4px 8px", borderRadius: 6, fontSize: 12, marginRight: 6, marginTop: 4,
    }}>
      <Paperclip size={12} /> {name}
      {onRemove && <X size={12} style={{ cursor: "pointer" }} onClick={onRemove} />}
    </span>
  );
}

function AttachInput({ files, setFiles }) {
  return (
    <div>
      <label style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5,
        color: T.gold, fontWeight: 600, cursor: "pointer", border: `1px dashed ${T.gold}`,
        padding: "7px 12px", borderRadius: 6,
      }}>
        <Paperclip size={13} /> Attach file (invoice, POP, photo)
        <input type="file" style={{ display: "none" }} onChange={(e) => {
          const f = e.target.files[0];
          if (f) setFiles((prev) => [...prev, f.name]);
          e.target.value = "";
        }} />
      </label>
      <div>
        {files.map((f, i) => (
          <AttachChip key={i} name={f} onRemove={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} />
        ))}
      </div>
    </div>
  );
}

function SubTabs({ items, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${T.line}` }}>
      {items.map((it) => (
        <div key={it.key} onClick={() => onChange(it.key)} style={{
          padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          color: active === it.key ? T.ink : "#a39c86",
          borderBottom: active === it.key ? `2px solid ${T.gold}` : "2px solid transparent",
          marginBottom: -1,
        }}>{it.label}</div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Data persistence & export helpers
// ---------------------------------------------------------------
const DATA_VERSION = "ekhaya-system-v6";

// Google one-click sign-in. Create a Web OAuth 2.0 client ID in Google Cloud
// Console (https://console.cloud.google.com → APIS & Services → Credentials)
// with your app's URL in "Authorized JavaScript origins", enable the Google
// Identity Services API, and paste the Client ID here. Sign-in matches the
// Google account's email against the Ekhaya user accounts.
const GOOGLE_CLIENT_ID = "417555581984-lk0lmmv5q7evcdh4hmc4sivj90ikgt24.apps.googleusercontent.com";

function decodeJwtPayload(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

function loadPersisted(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(`ekhaya:${DATA_VERSION}:${key}`));
    return v !== null && v !== undefined ? v : fallback;
  } catch {
    return fallback;
  }
}

function savePersisted(key, value) {
  try {
    localStorage.setItem(`ekhaya:${DATA_VERSION}:${key}`, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage unavailable — best effort.
  }
}

function clearPersisted() {
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("ekhaya:")) localStorage.removeItem(k);
  });
}

function exportCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    columns.map((c) => esc(c.label)).join(","),
    ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  Object.assign(a, { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------
// Main app
// ---------------------------------------------------------------
export default function EkhayaSystem() {
  const [staff, setStaff] = useState(() => loadPersisted("staff", seedStaff));
  const [items, setItems] = useState(() => loadPersisted("items", seedItems));
  const [stockIn, setStockIn] = useState(() => loadPersisted("stockIn", seedStockIn));
  const [stockOut, setStockOut] = useState(() => loadPersisted("stockOut", seedStockOut));
  const [transfers, setTransfers] = useState(() => loadPersisted("transfers", []));
  const [adjustments, setAdjustments] = useState(() => loadPersisted("adjustments", []));
  const [staffEquipment, setStaffEquipment] = useState(() => loadPersisted("staffEquipment", seedStaffEquipment));
  const [financeTx, setFinanceTx] = useState(() => loadPersisted("financeTx", seedFinanceTx));
  const [vehicles, setVehicles] = useState(() => loadPersisted("vehicles", seedVehicles));
  const [auditLog, setAuditLog] = useState(() => loadPersisted("auditLog", []));
  const [notifications, setNotifications] = useState(() => loadPersisted("notifications", []));
  const [counters, setCounters] = useState(() => loadPersisted("counters", { si: seedStockIn.length, so: seedStockOut.length, tr: 0, adj: 0, eq: seedStaffEquipment.length, fin: seedFinanceTx.length }));
  const [deptSeq, setDeptSeq] = useState(() => loadPersisted("deptSeq", { INV: 0, FIN: 1, ADM: 1, SEN: 1, MKT: 0, FLT: 1, WOM: 1, RES: 1, YTH: 1, HOS: 3 }));

  const [accounts, setAccounts] = useState(() => loadPersisted("accounts", SEED_ACCOUNTS));
  const [session, setSession] = useState(() => {
    const remembered = loadPersisted("session", null);
    return remembered && sessionValid(remembered) ? remembered : null;
  });
  const [lastUser, setLastUser] = useState(() => loadPersisted("lastUser", null));
  const [rememberMe, setRememberMe] = useState(true);
  const [players, setPlayers] = useState(() => loadPersisted("players", emptyMods.players));
  const [hostelResidents, setHostelResidents] = useState(() => loadPersisted("hostelResidents", emptyMods.hostelResidents));
  const [attendanceLog, setAttendanceLog] = useState(() => loadPersisted("attendance", emptyMods.attendance));
  const [incidents, setIncidents] = useState(() => loadPersisted("incidents", emptyMods.incidents));
  const [foodSchedule, setFoodSchedule] = useState(() => loadPersisted("foodSchedule", seedFoodSchedule));
  const [trips, setTrips] = useState(() => loadPersisted("trips", emptyMods.trips));
  const [fuelLog, setFuelLog] = useState(() => loadPersisted("fuel", emptyMods.fuel));
  const [sponsors, setSponsors] = useState(() => loadPersisted("sponsors", emptyMods.sponsors));
  const [risks, setRisks] = useState(() => loadPersisted("risks", emptyMods.risks));
  const [fixtures, setFixtures] = useState(() => loadPersisted("fixtures", emptyMods.fixtures));
  const [revealSalaries, setRevealSalaries] = useState(false);
  const [appLog, setAppLog] = useState(() => loadPersisted("appLog", []));
  const [lastBackupAt, setLastBackupAt] = useState(() => loadPersisted("lastBackupAt", null));
  const loginEmailRef = useRef(null);
  const loginPassRef = useRef(null);

  // Tab-local state (extracted from IIFE patterns to satisfy hooks rules).
  const [showDelFinance, setShowDelFinance] = useState(false);
  const [teamFilter, setTeamFilter] = useState("all");
  const [hostelSubTab, setHostelSubTab] = useState("residents");
  const [dateFilter, setDateFilter] = useState(todayISO());
  const [matchSubTab, setMatchSubTab] = useState("fixtures");

  // Persist state to localStorage, debounced so rapid edits do not write
  // the entire dataset on every keystroke. A final flush happens on sign-out.
  const persistTimer = useRef(null);
  const flushRef = useRef(null);
  const flushPersist = useCallback(() => {
    savePersisted("staff", staff);
    savePersisted("items", items);
    savePersisted("stockIn", stockIn);
    savePersisted("stockOut", stockOut);
    savePersisted("transfers", transfers);
    savePersisted("adjustments", adjustments);
    savePersisted("staffEquipment", staffEquipment);
    savePersisted("financeTx", financeTx);
    savePersisted("vehicles", vehicles);
    savePersisted("auditLog", auditLog);
    savePersisted("notifications", notifications);
    savePersisted("counters", counters);
    savePersisted("deptSeq", deptSeq);
    savePersisted("accounts", accounts);
    savePersisted("players", players);
    savePersisted("hostelResidents", hostelResidents);
    savePersisted("attendance", attendanceLog);
    savePersisted("incidents", incidents);
    savePersisted("foodSchedule", foodSchedule);
    savePersisted("trips", trips);
    savePersisted("fuel", fuelLog);
    savePersisted("sponsors", sponsors);
    savePersisted("risks", risks);
    savePersisted("fixtures", fixtures);
    savePersisted("appLog", appLog);
    savePersisted("lastBackupAt", lastBackupAt);
  }, [staff, items, stockIn, stockOut, transfers, adjustments, staffEquipment, financeTx, vehicles, auditLog, notifications, counters, deptSeq, accounts, players, hostelResidents, attendanceLog, incidents, foodSchedule, trips, fuelLog, sponsors, risks, fixtures, appLog, lastBackupAt]);
  flushRef.current = flushPersist;

  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(flushPersist, 350);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [flushPersist]);

  useEffect(() => {
    const onUnload = () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      flushRef.current();
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onUnload();
    });
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      document.removeEventListener("visibilitychange", onUnload);
    };
  }, [flushPersist]);

  // Migrate legacy audit rows (pre-chain) into a verified chain, and log
  // unhandled errors to a persisted ring buffer for diagnostics.
  useEffect(() => {
    const needsChain = auditLog.some((e) => !e.hash);
    if (needsChain) {
      let rebuilt = [];
      auditLog.forEach((e) => { const { hash: _h, ...rest } = e; rebuilt = appendEntry(rebuilt, rest); });
      setAuditLog(rebuilt); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onError = (event) => {
      const msg = (event && event.message) || "Unknown error";
      const stack = (event && event.error && event.error.stack) || "";
      setAppLog((prev) => [{ at: new Date().toLocaleString(), level: "error", msg: String(msg).slice(0, 400), stack: String(stack).slice(0, 800) }, ...prev].slice(0, 300));
    };
    const onUnhandled = (event) => {
      setAppLog((prev) => [{ at: new Date().toLocaleString(), level: "unhandledrejection", msg: String(event.reason).slice(0, 400) }, ...prev].slice(0, 300));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  const account = session ? (accounts.find((a) => a.code === session.accountCode) || null) : null;
  const role = account ? account.role : null;

  // Backup reminder notification (once per launch, 30-day cadence).
  useEffect(() => {
    if (!account) return;
    if (!lastBackupAt || Date.now() - new Date(lastBackupAt).getTime() > 30 * 24 * 60 * 60 * 1000) {
      notify("Backup reminder", "No full JSON backup in the last 30 days. Export one from Reports → Backup & Restore.", "medium");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.code]);

  // Real-time alert digest — fleet compliance, contracts, pending approvals.
  // Rolled up once per sign-in; notify() de-duplicates identical alerts so
  // nothing re-fires on every render.
  useEffect(() => {
    if (!account || !authenticated()) return;
    const canFleet = canAccess(account, "fleet");
    const canInventory = canAccess(account, "inventory");
    const canFinance = canAccess(account, "finance");
    const canTeam = canAccess(account, "players");
    const note = (k, title, body, severity) => {
      if (k) notify(title, body, severity);
    };
    if (canFleet) {
      activeVehicles.forEach((v) => {
        if (v.cofExpiry && v.cofExpiry < todayISO()) note(true, `COF expired: ${v.code}`, `${v.makeModel} (${v.regNo}) COF lapsed on ${v.cofExpiry}.`, "high");
        else if (v.cofExpiry && remainingMonths(v.cofExpiry) <= 3) note(true, `COF expiring: ${v.code}`, `${v.makeModel} (${v.regNo}) COF expires ${v.cofExpiry}.`, "medium");
        if (v.insuranceExpiry && v.insuranceExpiry < todayISO()) note(true, `Insurance expired: ${v.code}`, `${v.makeModel} (${v.regNo}) insurance lapsed on ${v.insuranceExpiry}.`, "high");
        else if (v.insuranceExpiry && remainingMonths(v.insuranceExpiry) <= 3) note(true, `Insurance expiring: ${v.code}`, `${v.makeModel} (${v.regNo}) insurance expires ${v.insuranceExpiry}.`, "medium");
      });
    }
    if (canTeam) {
      contractExpiring.slice(0, 10).forEach((p) => note(true, `Contract expiring: ${p.name}`, `${p.name} (${p.team}) contract ends ${p.contractEnd} — ${remainingMonths(p.contractEnd)} months left.`, "medium"));
    }
    if (canFinance && pendingFinance > 0) note(true, "Finance approvals pending", `${pendingFinance} finance transaction(s) await approval.`, "medium");
    if (canInventory) {
      if (pendingStockOut.length > 0) note(true, "Stock requests pending", `${pendingStockOut.length} stock-out request(s) await approval.`, "medium");
      if (pendingVerification.length > 0) note(true, "Stock In verification pending", `${pendingVerification.length} stock-in record(s) await verification.`, "medium");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.code]);
  const isSuperadmin = role === "SUPERADMIN";
  const [tab, setTab] = useState("dashboard");
  const [invSubTab, setInvSubTab] = useState("items");
  const [financeSubTab, setFinanceSubTab] = useState("transactions");
  const [drawer, setDrawer] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [lockUntil, setLockUntil] = useState(() => loadPersisted("lockUntil", null));
  const [failedAttempts, setFailedAttempts] = useState(() => loadPersisted("failedAttempts", 0));

  // Persist login-related state separately (declared above this point).
  useEffect(() => {
    savePersisted("failedAttempts", failedAttempts);
    savePersisted("lockUntil", lockUntil);
  }, [failedAttempts, lockUntil]);

  // "Acting as" is now restricted: only Superadmin / CEO may switch identity
  // (e.g. to exercise the two-person verify/approve flows). Everyone else acts
  // as their own account's staff record.
  const [actingAs, setActingAs] = useState(account ? account.staffCode : (staff[0] && staff[0].code));

  const actor = staff.find((s) => s.code === actingAs) || staff[0];
  const mayActAs = canActAs(account);

  function authenticated() {
    return session && sessionValid(session) && account && account.active;
  }

  function loginSuccess(found, remember, via) {
    setFailedAttempts(0);
    setLockUntil(null);
    savePersisted("failedAttempts", 0);
    savePersisted("lockUntil", null);
    const s = createSession(found, remember);
    setSession(s);
    setActingAs(found.staffCode || (staff[0] && staff[0].code));
    savePersisted("session", remember ? s : null);
    const lu = { name: found.name, email: found.email, role: found.role };
    setLastUser(lu);
    savePersisted("lastUser", lu);
    setLoginError("");
    log(via === "google" ? "Google Sign-in" : "Login", "session", found.code, `${found.email} signed in${via === "google" ? " via Google" : ""}`);
  }

  function login(email, password, remember) {
    const now = Date.now();
    if (lockUntil && now < lockUntil) {
      setLoginError(`Account temporarily locked. Try again after ${new Date(lockUntil).toLocaleTimeString()}.`);
      return;
    }
    const found = accounts.find((a) => a.email && a.email.toLowerCase() === String(email).trim().toLowerCase());
    if (!found || !verifyPassword(password || "", found)) {
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      let until = lockUntil;
      if (attempts >= 5) {
        until = Date.now() + 15 * 60 * 1000;
        setLockUntil(until);
        setFailedAttempts(0);
        setLoginError("Too many failed attempts. Locked for 15 minutes.");
      } else {
        setLoginError(`Invalid email or password (${attempts} of 5).`);
      }
      log("Failed Login", "session", String(email).trim(), `Invalid credentials — failed attempt ${attempts} of 5`);
      savePersisted("failedAttempts", attempts >= 5 ? 0 : attempts);
      savePersisted("lockUntil", until);
      return;
    }
    if (!found.active) { setLoginError("This account has been deactivated."); return; }
    loginSuccess(found, remember, "password");
  }

  function handleGoogleToken(token) {
    const payload = decodeJwtPayload(token);
    if (!payload || !payload.email) { setLoginError("Google sign-in failed — no email was returned."); return; }
    const found = accounts.find((a) => a.email && a.email.toLowerCase() === String(payload.email).toLowerCase());
    if (!found) {
      setLoginError(`No Ekhaya account uses ${payload.email}. Ask Superadmin to create one linked to this Google email.`);
      return;
    }
    if (!found.active) { setLoginError("This account has been deactivated."); return; }
    if (found.googleSub !== payload.sub) {
      setAccounts((prev) => prev.map((a) => a.code === found.code ? {
        ...a, googleSub: payload.sub, googleEmail: payload.email, googleName: payload.name || a.name, picture: payload.picture || a.picture,
      } : a));
    }
    loginSuccess(found, true, "google");
  }

  function switchAccount() {
    setLastUser(null);
    savePersisted("lastUser", null);
    if (loginPassRef.current) loginPassRef.current.value = "";
    if (loginEmailRef.current) loginEmailRef.current.value = "";
    setLoginError("");
  }

  function logout() {
    log("Logout", "session", actor.code, `${actor.name} signed out`);
    setSession(null);
    setActingAs(staff[0] && staff[0].code);
    savePersisted("session", null);
    setTimeout(() => { if (flushRef.current) flushRef.current(); }, 60);
  }

  function changePassword(current, next) {
    if (!account) return;
    if (!verifyPassword(current || "", account)) { alert("Current password is incorrect."); return; }
    if ((next || "").length < 8) { alert("New password must be at least 8 characters."); return; }
    const updated = hashPassword(next);
    setAccounts((prev) => prev.map((a) => a.code === account.code ? { ...a, ...updated, mustChangePassword: false } : a));
    setSession((s) => (s ? { ...s } : s));
    log("Password changed", "account", account.code, "Password updated");
    alert("Password updated.");
  }

  function nextCode(prefix) {
    const key = { SI: "si", SO: "so", TR: "tr", ADJ: "adj", EQ: "eq", FIN: "fin" }[prefix];
    const n = counters[key] + 1;
    setCounters((c) => ({ ...c, [key]: n }));
    return `${prefix}-${String(n).padStart(5, "0")}`;
  }

  function log(action, entityType, entityCode, details) {
    const byStaff = staff.find((s) => s.code === actor.code);
    setAuditLog((prev) => {
      const next = smartLog(prev, {
        action, entityType, entityCode, details,
        dept: byStaff ? byStaff.dept : (account ? account.dept : "—"),
        acct: account ? `${account.name} <${account.email}>` : actor.code,
      }, actor.code, actor.name);
      if (next.length <= 2000) return next;
      return next.slice(next.length - 2000).reduce((acc, e) => {
        const { hash: _h2, ...rest } = e;
        return appendEntry(acc, rest);
      }, []);
    });
  }

  function notify(title, body, severity = "info") {
    setNotifications((prev) => {
      if (prev.some((n) => n.title === title && n.body === body)) return prev;
      return [{ id: Math.max(0, ...prev.map((n) => n.id)) + 1, title, body, severity, read: false, at: new Date().toLocaleString() }, ...prev].slice(0, 200);
    });
  }

  function applyQtyChange(itemId, delta) {
    const intId = Number(itemId);
    const current = items.find((i) => i.id === intId);
    if (Number.isNaN(intId) || !current || current.quantity + delta < 0) {
      alert("Not enough stock on hand — that change would create a negative balance.");
      return false;
    }
    const updated = { ...current, quantity: current.quantity + delta };
    setItems((prev) => prev.map((it) => it.id === intId ? updated : it));
    if (updated.quantity <= updated.min) {
      notify(`Low stock: ${updated.name}`, `${updated.code} is at ${updated.quantity} ${updated.unit} (min level ${updated.min}).`, updated.quantity <= 0 ? "high" : "medium");
    }
    return true;
  }

  // ---------------- Staff / Administration ----------------
  function createStaff(form) {
    const errors = validateStaff(form, staff, null);
    if (errors.length) { alert(errors.join("\n")); return; }
    const seq = (deptSeq[form.dept] || 0) + 1;
    setDeptSeq((d) => ({ ...d, [form.dept]: seq }));
    const code = `EKH-${form.dept}-${String(seq).padStart(3, "0")}`;
    const rec = { id: Math.max(0, ...staff.map((s) => s.id)) + 1, code, name: form.name, dept: form.dept, role: form.role, title: form.title, status: "Active", startDate: form.startDate };
    setStaff((prev) => [...prev, rec]);
    log("Created Staff Record", "staff", code, `${form.name} — ${form.title}`);
    setDrawer(null);
  }

  function editStaff(code, form) {
    const errors = validateStaff(form, staff, code);
    if (errors.length) { alert(errors.join("\n")); return; }
    setStaff((prev) => prev.map((s) => s.code === code ? { ...s, name: form.name, dept: form.dept, role: form.role, title: form.title, startDate: form.startDate } : s));
    log("Edited Staff Record", "staff", code, `Updated by ${actor.code}`);
    setDrawer(null);
  }

  function deleteStaff(code) {
    if (!canDelete(account)) return;
    if (code === actor.code) { alert("You can't delete the staff record you're currently acting as."); return; }
    if (!window.confirm(`Delete staff record ${code}? This cannot be undone.`)) return;
    setStaff((prev) => prev.filter((s) => s.code !== code));
    log("Deleted Staff Record", "staff", code, `Deleted by ${actor.code}`);
  }

  // ---------------- Items ----------------
  function createItem(form) {
    const errors = validateItem(form, items, null);
    if (errors.length) { alert(errors.join("\n")); return; }
    const id = Math.max(0, ...items.map((i) => i.id)) + 1;
    const item = {
      id, code: form.code, name: form.name, category: form.category, unit: form.unit,
      quantity: Number(form.quantity) || 0, min: Number(form.min) || 0, max: Number(form.max) || 0,
      unitCost: Number(form.unitCost) || 0, location: form.location, condition: form.condition || "Good",
      status: "Active",
    };
    setItems((prev) => [...prev, item]);
    log("Created Item", "item", item.code, `${item.name} — opening qty ${item.quantity}`);
    setDrawer(null);
  }

  function editItem(id, form) {
    const errors = validateItem(form, items, id);
    if (errors.length) { alert(errors.join("\n")); return; }
    setItems((prev) => prev.map((it) => it.id === id ? {
      ...it, code: form.code, name: form.name, category: form.category, unit: form.unit,
      quantity: Number(form.quantity) || 0, min: Number(form.min) || 0, max: Number(form.max) || 0,
      unitCost: Number(form.unitCost) || 0, location: form.location, condition: form.condition,
    } : it));
    log("Edited Item", "item", form.code, `Updated by ${actor.code}`);
    setDrawer(null);
  }

  function deleteItem(id, code) {
    if (!canDelete(account)) return;
    if (!window.confirm(`Delete item ${code}? This permanently removes it from the inventory.`)) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
    log("Deleted Item", "item", code, `Deleted by ${actor.code}`);
  }

  // ---------------- Stock In ----------------
  function createStockIn(form) {
    const errors = validateStockIn(form);
    if (errors.length) { alert(errors.join("\n")); return; }
    const code = nextCode("SI");
    const rec = {
      code, itemId: Number(form.itemId), quantity: Number(form.quantity), supplier: form.supplier,
      invoiceNumber: form.invoiceNumber, unitCost: Number(form.unitCost) || 0,
      dateReceived: form.dateReceived, receivedBy: actor.code, verifiedBy: null,
      condition: form.condition, notes: form.notes, status: "Pending Verification",
      attachments: form.attachments || [],
    };
    setStockIn((prev) => [rec, ...prev]);
    log("Created Stock In", "stock_in", code, `${form.quantity} x item #${rec.itemId} from ${form.supplier}`);
    setDrawer(null);
  }

  function verifyStockIn(rec) {
    if (rec.receivedBy === actor.code) {
      alert("Two-person control: the person who received stock cannot verify it. Switch 'Acting as' to a different staff member.");
      return;
    }
    setStockIn((prev) => prev.map((r) => r.code === rec.code ? { ...r, verifiedBy: actor.code, status: "Verified" } : r));
    applyQtyChange(rec.itemId, rec.quantity);
    log("Verified Stock In", "stock_in", rec.code, `Verified by ${actor.code}, stock increased by ${rec.quantity}`);
  }

  function deleteStockIn(code) {
    if (!canDelete(account)) return;
    if (!window.confirm(`Delete stock-in record ${code}? This cannot be undone.`)) return;
    setStockIn((prev) => prev.filter((r) => r.code !== code));
    log("Deleted Stock In Record", "stock_in", code, `Deleted by ${actor.code}`);
  }

  // ---------------- Stock Out / Requests ----------------
  function createStockOut(form) {
    const errors = validateStockOut(form);
    if (errors.length) { alert(errors.join("\n")); return; }
    const code = nextCode("SO");
    const item = items.find((i) => i.id === Number(form.itemId));
    const rec = {
      code, itemId: Number(form.itemId), quantity: Number(form.quantity), requestedBy: actor.code,
      team: form.team, purpose: form.purpose, dateRequested: new Date().toISOString().slice(0, 10),
      approvedBy: null, issuedBy: null, status: "Pending", notes: form.notes,
    };
    setStockOut((prev) => [rec, ...prev]);
    log("Created Stock Out Request", "stock_out", code, `${form.quantity} x ${item?.code || "#" + form.itemId} for ${form.team} (from ${item?.location || "unknown location"})`);
    setDrawer(null);
  }

  function approveStockOut(rec) {
    if (rec.requestedBy === actor.code) {
      alert("Two-person control: the requester cannot approve their own request. Switch 'Acting as'.");
      return;
    }
    setStockOut((prev) => prev.map((r) => r.code === rec.code ? { ...r, approvedBy: actor.code, status: "Approved" } : r));
    log("Approved Stock Out", "stock_out", rec.code, `Approved by ${actor.code}`);
  }

  function rejectStockOut(rec) {
    setStockOut((prev) => prev.map((r) => r.code === rec.code ? { ...r, status: "Rejected" } : r));
    log("Rejected Stock Out", "stock_out", rec.code, `Rejected by ${actor.code}`);
  }

  function issueStockOut(rec) {
    if (rec.approvedBy === actor.code) {
      alert("Two-person control: the approver should not also issue the stock. Switch 'Acting as'.");
      return;
    }
    const item = items.find((i) => i.id === Number(rec.itemId));
    if (item && !enoughStock(item.quantity, rec.quantity)) {
      alert("Not enough stock on hand to issue this request.");
      return;
    }
    setStockOut((prev) => prev.map((r) => r.code === rec.code ? { ...r, issuedBy: actor.code, status: "Issued" } : r));
    applyQtyChange(rec.itemId, -rec.quantity);
    log("Issued Stock Out", "stock_out", rec.code, `Issued by ${actor.code}, stock decreased by ${rec.quantity}`);
  }

  function deleteStockOut(code) {
    if (!canDelete(account)) return;
    if (!window.confirm(`Delete stock-out request ${code}? This cannot be undone.`)) return;
    setStockOut((prev) => prev.filter((r) => r.code !== code));
    log("Deleted Stock Out Record", "stock_out", code, `Deleted by ${actor.code}`);
  }

  // ---------------- Transfers ----------------
  function createTransfer(form) {
    const code = nextCode("TR");
    const rec = {
      code, itemId: Number(form.itemId), quantity: Number(form.quantity), from: form.from, to: form.to,
      requestedBy: actor.code, approvedBy: null, status: "Pending", notes: form.notes,
    };
    setTransfers((prev) => [rec, ...prev]);
    log("Created Transfer", "stock_transfer", code, `${form.quantity} x item #${form.itemId} ${form.from} -> ${form.to}`);
    setDrawer(null);
  }

  function approveTransfer(rec) {
    if (rec.requestedBy === actor.code) {
      alert("Two-person control: requester cannot approve their own transfer.");
      return;
    }
    setTransfers((prev) => prev.map((r) => r.code === rec.code ? { ...r, approvedBy: actor.code, status: "Approved" } : r));
    setItems((prev) => prev.map((it) => it.id === Number(rec.itemId) ? { ...it, location: rec.to } : it));
    log("Approved Transfer", "stock_transfer", rec.code, `Approved by ${actor.code}, item moved to ${rec.to}`);
  }

function deleteTransfer(code) {
    if (!canDelete(account)) return;
    if (!window.confirm(`Delete stock transfer ${code}? This cannot be undone.`)) return;
    setTransfers((prev) => prev.filter((r) => r.code !== code));
    log("Deleted Transfer Record", "transfer", code, `Deleted by ${actor.code}`);
  }

  // ---------------- Adjustments ----------------
  function createAdjustment(form) {
    const code = nextCode("ADJ");
    const rec = {
      code, itemId: Number(form.itemId), change: Number(form.change), reason: form.reason,
      requestedBy: actor.code, approvedBy: null, status: "Pending", notes: form.notes,
    };
    setAdjustments((prev) => [rec, ...prev]);
    log("Created Adjustment", "stock_adjustment", code, `${form.change > 0 ? "+" : ""}${form.change} on item #${form.itemId} (${form.reason})`);
    setDrawer(null);
  }

  function approveAdjustment(rec) {
    if (rec.requestedBy === actor.code) {
      alert("Two-person control: requester cannot approve their own adjustment.");
      return;
    }
    setAdjustments((prev) => prev.map((r) => r.code === rec.code ? { ...r, approvedBy: actor.code, status: "Approved" } : r));
    applyQtyChange(rec.itemId, rec.change);
    log("Approved Adjustment", "stock_adjustment", rec.code, `Approved by ${actor.code}, quantity changed by ${rec.change}`);
  }

function deleteAdjustment(code) {
    if (!canDelete(account)) return;
    if (!window.confirm(`Delete stock adjustment ${code}? This cannot be undone.`)) return;
    setAdjustments((prev) => prev.filter((r) => r.code !== code));
    log("Deleted Adjustment Record", "adjustment", code, `Deleted by ${actor.code}`);
  }

  // ---------------- Staff Equipment ----------------
  // Issuing/returning equipment now draws from the real Inventory catalog —
  // issuing an item decreases its Inventory quantity (same as a Stock Out),
  // and a return increases it back (same as a Stock In), so the two modules
  // share one source of truth instead of tracking equipment separately.
  function issueEquipment(form) {
    const item = items.find((i) => i.id === Number(form.itemId));
    if (!item) { alert("Choose an item from Inventory first."); return; }
    if (item.quantity < 1) { alert(`${item.name} shows 0 or negative stock in Inventory — check the balance before issuing.`); return; }
    const code = nextCode("EQ");
    const rec = {
      code, staffCode: form.staffCode, itemId: item.id, itemName: item.name, itemCode: item.code, serial: form.serial,
      dateIssued: new Date().toISOString().slice(0, 10), issuedBy: actor.code,
      condition: form.condition, status: "Issued", dateReturned: null, receivedBy: null, notes: form.notes,
    };
    setStaffEquipment((prev) => [rec, ...prev]);
    applyQtyChange(item.id, -1);
    log("Issued Equipment", "staff_equipment", code, `${item.code} — ${item.name} to ${form.staffCode} (Inventory qty -1)`);
    setDrawer(null);
  }

  function returnEquipment(rec) {
    if (rec.issuedBy === actor.code) {
      alert("Two-person control: the person who issued the equipment should not also process its return. Switch 'Acting as'.");
      return;
    }
    setStaffEquipment((prev) => prev.map((r) => r.code === rec.code ? { ...r, status: "Returned", dateReturned: new Date().toISOString().slice(0, 10), receivedBy: actor.code } : r));
    if (rec.itemId) applyQtyChange(rec.itemId, 1);
    log("Returned Equipment", "staff_equipment", rec.code, `Received back by ${actor.code}${rec.itemId ? " (Inventory qty +1)" : ""}`);
  }

  function deleteEquipment(code) {
    if (!canDelete(account)) return;
    if (!window.confirm(`Delete equipment record ${code}? This cannot be undone.`)) return;
    setStaffEquipment((prev) => prev.filter((r) => r.code !== code));
    log("Deleted Equipment Record", "staff_equipment", code, `Deleted by ${actor.code}`);
  }

  // ---------------- Finance ----------------
  function createFinanceTx(form) {
    const errors = validateFinanceTx(form);
    if (errors.length) { alert(errors.join("\n")); return; }
    const code = nextCode("FIN");
    const rec = {
      code, type: form.type, category: form.category, amount: Number(form.amount) || 0,
      date: form.date, description: form.description, department: form.department,
      createdBy: actor.code, approvedBy: null, status: "Pending", attachments: form.attachments || [],
    };
    setFinanceTx((prev) => [rec, ...prev]);
    log("Created Finance Transaction", "finance_transaction", code, `${form.type} — ${form.category} — MK ${form.amount}`);
    setDrawer(null);
  }

  function approveFinanceTx(rec) {
    if (rec.createdBy === actor.code) {
      alert("Two-person control: the creator cannot approve their own transaction. Switch 'Acting as'.");
      return;
    }
    setFinanceTx((prev) => prev.map((r) => r.code === rec.code ? { ...r, approvedBy: actor.code, status: "Approved" } : r));
    log("Approved Finance Transaction", "finance_transaction", rec.code, `Approved by ${actor.code}`);
  }

  function deleteFinanceTx(code, reason) {
    if (!canDelete(account)) { alert("Only Superadmin or CEO can delete a finance record."); return; }
    let target = financeTx.find((t) => t.code === code);
    if (!window.confirm(target && target.status === "Approved"
      ? "This transaction was already APPROVED. Deleting it removes it from the financial record — proceed?"
      : `Mark finance transaction ${code} as deleted? It is kept as a deleted record for the audit trail.`)) return;
    setFinanceTx((prev) => prev.map((r) => r.code === code ? {
      ...r, status: "Deleted", prevStatus: r.status, deletedBy: actor.code, deletedAt: new Date().toISOString(), deletionReason: reason || "Removed",
    } : r));
    log("Deleted (soft) Finance Transaction", "finance_transaction", code, `Deleted by ${actor.code} — ${reason || "removed"}. Kept as a deleted record for audit.`);
  }

  function restoreFinanceTx(code) {
    setFinanceTx((prev) => prev.map((r) => r.code === code ? { ...r, status: r.prevStatus || "Pending", prevStatus: null, approvedBy: null, deletedBy: null, deletedAt: null, deletionReason: null } : r));
    log("Restored Finance Transaction", "finance_transaction", code, `Restored by ${actor.code}`);
  }

  // ---------------- Fleet ----------------
  function createVehicle(form) {
    const id = Math.max(0, ...vehicles.map((v) => v.id)) + 1;
    const v = { id, code: form.code, makeModel: form.makeModel, regNo: form.regNo, driverName: form.driverName, driverPhone: form.driverPhone, driverLicense: form.driverLicense, status: "Active", notes: form.notes };
    setVehicles((prev) => [...prev, v]);
    log("Added Vehicle", "vehicle", form.code, `${form.makeModel} — driver ${form.driverName || "unassigned"}`);
    setDrawer(null);
  }

  function editVehicle(id, form) {
    setVehicles((prev) => prev.map((v) => v.id === id ? { ...v, ...form } : v));
    log("Edited Vehicle", "vehicle", form.code, `Updated by ${actor.code}`);
    setDrawer(null);
  }

  function deleteVehicle(id, code) {
    if (!canDelete(account)) return;
    if (!window.confirm(`Delete vehicle ${code}? Trip and fuel history for it will keep the vehicle code as text but the vehicle record is removed.`)) return;
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    log("Deleted Vehicle", "vehicle", code, `Deleted by ${actor.code}`);
  }

  const lowStockItems = useMemo(() => items.filter((i) => i.quantity <= i.min), [items]);
  const negativeStockItems = useMemo(() => items.filter((i) => i.quantity < 0), [items]);
  const pendingStockOut = useMemo(() => stockOut.filter((r) => r.status === "Pending" || r.status === "Approved"), [stockOut]);
  const pendingVerification = useMemo(() => stockIn.filter((r) => r.status === "Pending Verification"), [stockIn]);
  const totalIncome = useMemo(() => approvedIncome(financeTx), [financeTx]);
  const totalExpense = useMemo(() => approvedExpense(financeTx), [financeTx]);
  const totalTransfers = useMemo(() => approvedTransfer(financeTx), [financeTx]);
  const pendingFinance = useMemo(() => pendingFinanceCount(financeTx), [financeTx]);
  const equipmentOut = useMemo(() => staffEquipment.filter((e) => e.status === "Issued").length, [staffEquipment]);
  const financeVisible = useMemo(() => financeTx.filter((t) => t.status !== "Deleted"), [financeTx]);
  const deletedCount = useMemo(() => financeTx.filter((t) => t.status === "Deleted").length, [financeTx]);
  const statusColor = (status) => status === "Approved" ? "good" : status === "Rejected" || status === "Deleted" ? "bad" : "pending";

  // ── CEO dashboard aggregates (live from real state) ──────────────
  const riskLevel = (r) => {
    const rank = { "Very Low": 0, "Low": 1, "Medium": 2, "High": 3, "Very High": 4, "Critical": 5 };
    return Math.max(rank[r.likelihood] || 0, rank[r.impact] || 0);
  };
  const activeStaff = useMemo(() => staff.filter((s) => s.status === "Active"), [staff]);
  const playersByTeam = useMemo(() => seedTeams.reduce((acc, t) => ({ ...acc, [t.name]: players.filter((p) => p.team === t.name && p.status === "Active").length }), {}), [players]);
  const totalPlayers = useMemo(() => players.filter((p) => p.status === "Active").length, [players]);
  const activeResidents = useMemo(() => hostelResidents.filter((r) => r.status === "Active"), [hostelResidents]);
  const residentsByHouse = useMemo(() => seedHostels.map((h) => ({ house: h, count: activeResidents.filter((r) => r.houseCode === h.code).length })), [activeResidents]);
  const totalOcc = useMemo(() => residentsByHouse.reduce((s, r) => s + r.count, 0), [residentsByHouse]);
  const contractExpiring = useMemo(() => players.filter((p) => p.contractEnd && remainingMonths(p.contractEnd) >= 0 && remainingMonths(p.contractEnd) <= 3 && p.status === "Active"), [players]);
  const activeVehicles = useMemo(() => vehicles.filter((v) => v.status === "Active"), [vehicles]);
  const cofExpiring = useMemo(() => activeVehicles.filter((v) => v.cofExpiry && v.cofExpiry >= todayISO() && remainingMonths(v.cofExpiry) <= 3), [activeVehicles]);
  const cofExpired = useMemo(() => activeVehicles.filter((v) => v.cofExpiry && v.cofExpiry < todayISO()), [activeVehicles]);
  const insuExpiring = useMemo(() => activeVehicles.filter((v) => v.insuranceExpiry && v.insuranceExpiry >= todayISO() && remainingMonths(v.insuranceExpiry) <= 3), [activeVehicles]);
  const insuExpired = useMemo(() => activeVehicles.filter((v) => v.insuranceExpiry && v.insuranceExpiry < todayISO()), [activeVehicles]);
  const activeRisks = useMemo(() => risks.filter((r) => r.status !== "Closed"), [risks]);
  const criticalRisks = useMemo(() => activeRisks.filter((r) => riskLevel(r) >= 3), [activeRisks]);
  const upcomingFixtures = useMemo(() => fixtures.filter((f) => f.status === "Scheduled" || f.status === "Upcoming"), [fixtures]);
  const pendingApprovals = pendingFinance + pendingStockOut.length + pendingVerification.length;
  const netFinance = totalIncome - totalExpense;
  const sponsorsExpiringSoon = useMemo(() => sponsors.filter((s) => s.status === "Active" && s.endDate && s.endDate >= todayISO() && remainingMonths(s.endDate) <= 3).length, [sponsors]);

  const itemName = (id) => items.find((i) => i.id === Number(id))?.name || `#${id}`;

  const nav = [
    { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { key: "administration", label: "Administration", icon: Building2 },
    { key: "finance", label: "Finance", icon: Wallet },
    { key: "marketing", label: "Marketing & Sponsors", icon: Megaphone },
    { key: "fleet", label: "Fleet", icon: Truck },
    { key: "team", label: "Team Management", icon: Shield },
    { key: "inventory", label: "Inventory", icon: Package },
    { key: "players", label: "Players & Contracts", icon: Shirt },
    { key: "hostel", label: "Hostel", icon: Home },
    { key: "matchday", label: "Matchday & Risks", icon: CalendarDays },
    { key: "staffequipment", label: "Staff Equipment", icon: Laptop },
    { key: "reports", label: "Reports & Backup", icon: BarChart2 },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "audit", label: "Audit Logs", icon: ClipboardList },
    ...(isSuperadmin ? [{ key: "superadmin", label: "Superadmin", icon: Settings }] : []),
  ];

  const unreadCount = notifications.filter((n) => !n.read).length;
  const highUnread = notifications.filter((n) => !n.read && n.severity === "high").length;

  if (!authenticated()) {
    return (
      <div style={{ fontFamily: "Inter, sans-serif", background: "linear-gradient(rgba(21,20,15,0.78), rgba(21,20,15,0.88)), url('/ekhaya-logo.jpg') center/cover no-repeat, #15140f", backgroundAttachment: "fixed", minHeight: "100vh", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style>{fontImport}</style>
        <div style={{ width: 380, maxWidth: "100%", background: "rgba(255,251,240,0.96)", borderRadius: 16, padding: 34, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", border: "1px solid rgba(232,207,143,0.5)" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <img src="/ekhaya-logo.jpg" alt="Ekhaya FC" style={{ width: 92, height: 92, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(201,152,46,0.55)", boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }} />
            <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 23, color: T.ink, fontWeight: 700, marginTop: 12, letterSpacing: 1 }}>EKHAYA FC</div>
            <div style={{ fontSize: 12.5, color: "#6b6552", marginTop: 4 }}>Management System — The Pride of Malawi</div>
          </div>
          <p style={{ fontSize: 12.5, color: T.bad, marginBottom: 12 }}>{loginError}</p>
          {lastUser && (
            <div style={{ textAlign: "center", marginBottom: 14, border: `1px dashed ${T.line}`, borderRadius: 8, padding: "8px 10px", background: "#fffdf8" }}>
              <div style={{ fontSize: 12.5, color: "#6b6552" }}>Welcome back, <strong style={{ color: T.ink }}>{lastUser.name}</strong></div>
              <button onClick={switchAccount} style={{ background: "none", border: "none", color: "#c9982e", fontSize: 11.5, fontWeight: 600, cursor: "pointer", marginTop: 2, fontFamily: "Inter, sans-serif" }}>Not you? Sign in as someone else</button>
            </div>
          )}
          <Field label="Email">
            <input
              ref={loginEmailRef}
              style={{ ...inputStyle, background: "#fff" }}
              type="email"
              defaultValue={lastUser?.email || ""}
              placeholder="yourname@ekhayafc.com"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") loginPassRef.current?.focus(); }}
            />
          </Field>
          <Field label="Password">
            <input
              ref={loginPassRef}
              style={{ ...inputStyle, background: "#fff" }}
              type="password"
              placeholder="Password"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  login(loginEmailRef.current?.value, e.target.value, rememberMe);
                }
              }}
            />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#6b6552", margin: "2px 0 14px", cursor: "pointer" }}>
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Stay signed in on this device
          </label>
          <PrimaryButton tone="gold" onClick={() => {
            login(loginEmailRef.current?.value, loginPassRef.current?.value, rememberMe);
          }} disabled={false}>
            <LogOut size={13} style={{ transform: "rotate(180deg)", verticalAlign: -2, marginRight: 4 }} /> Sign In
          </PrimaryButton>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: T.line }} />
            <span style={{ fontSize: 11.5, color: "#948d76" }}>or</span>
            <div style={{ flex: 1, height: 1, background: T.line }} />
          </div>
          {GOOGLE_CLIENT_ID ? (
            <GoogleSignInButton onToken={handleGoogleToken} />
          ) : (
            <GoogleSignInUnconfigured />
          )}
          <p style={{ fontSize: 11, color: "#948d76", marginTop: 14, textAlign: "center" }}>
            Already have an account? Your login is remembered here automatically. New accounts are set to a temporary password and must be changed on first login.
          </p>
        </div>
      </div>
    );
  }

  if (account.mustChangePassword) {
    return (
      <ForcedPasswordScreen
        account={account}
        onSubmit={changePassword}
        onLogout={logout}
      />
    );
  }

  return (
    <ErrorBoundary>
      <div style={{ fontFamily: "Inter, sans-serif", background: "linear-gradient(rgba(250,246,236,0.82), rgba(250,246,236,0.9)), url('/ekhaya-logo.jpg') center/cover no-repeat fixed, #faf6ec", minHeight: "100vh", color: T.text, display: "flex" }}>
        <style>{fontImport}</style>

        {/* Sidebar — frosted glass over the club crest */}
      <div style={{ width: 226, background: "rgba(21,20,15,0.55)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0, height: "100vh", position: "sticky", top: 0, borderRight: "1px solid rgba(255,255,255,0.12)", boxShadow: "2px 0 24px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <img src="/ekhaya-logo.jpg" alt="Ekhaya FC" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(232,207,143,0.65)", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }} />
            <div>
              <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, fontWeight: 600, color: T.goldSoft, letterSpacing: 0.5 }}>EKHAYA FC</div>
              <div style={{ fontSize: 11, color: "#d8d2bf", marginTop: 1, letterSpacing: 0.3 }}>All-in-One System</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {nav.filter((n) => canAccess(account, n.key)).map((n) => {
            const Icon = n.icon;
            const active = tab === n.key;
            return (
              <div key={n.key} onClick={() => setTab(n.key)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderRadius: 7, cursor: "pointer", marginBottom: 2, position: "relative",
                background: active ? "rgba(201,152,46,0.16)" : "transparent",
                color: active ? T.goldSoft : "#cfc8b4", fontSize: 13.5, fontWeight: active ? 600 : 500,
              }}>
                <Icon size={16} />
                {n.label}
                {n.key === "notifications" && unreadCount > 0 && (
                  <span style={{
                    marginLeft: "auto", background: highUnread > 0 ? T.bad : "#c9982e", color: "#fff", fontSize: 10,
                    borderRadius: 999, width: 16, height: 16, display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>{unreadCount}</span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 11, color: "#8a8368", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, color: "#cfc8b4" }}>{account.name}</div>
          <div>{account.email}</div>
          <div>{account.role}{account.dept ? ` · ${account.dept}` : ""}</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 26px", borderBottom: `1px solid ${T.line}`, background: "rgba(255,255,255,0.86)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        }}>
          <h2 style={{ fontFamily: "Oswald, sans-serif", fontSize: 21, margin: 0, color: T.ink }}>
            {nav.find((n) => n.key === tab)?.label || tab}
          </h2>
          <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
            {account.mustChangePassword && (
              <span style={{ color: T.bad, fontSize: 12, marginRight: 8 }}>Password change required</span>
            )}
            {isSuperadmin && <Badge tone="pending">Superadmin</Badge>}
            {mayActAs && (
              <>
                <span style={{ color: "#948d76", fontSize: 12 }}>Act as</span>
                <select value={actingAs} onChange={(e) => setActingAs(e.target.value)} style={{
                  border: `1px solid ${T.line}`, borderRadius: 6, padding: "6px 8px", fontSize: 13, fontFamily: "Inter, sans-serif",
                }}>
                  {staff.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
                </select>
              </>
            )}
            {!mayActAs && (
              <span style={{ color: "#6b6552" }}>Signed in as <strong>{actor.code} — {actor.name}</strong></span>
            )}
            <button onClick={() => {
              const cur = prompt("Current password:");
              if (cur === null) return;
              const next = prompt("New password (min 8 characters):");
              if (next === null) return;
              changePassword(cur, next);
            }} style={{
              background: "transparent", border: `1px solid ${T.line}`, color: "#6b6552",
              padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "Inter, sans-serif",
              display: "flex", alignItems: "center", gap: 4,
            }}><KeyRound size={12} /> Change Password</button>
            <button onClick={logout} style={{
              background: "transparent", border: `1px solid ${T.line}`, color: T.bad,
              padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "Inter, sans-serif",
              display: "flex", alignItems: "center", gap: 4,
            }}><LogOut size={12} /> Sign Out</button>
          </div>
        </div>

        <div style={{ padding: 26 }}>
          {tab === "dashboard" && (() => {
              const pct = (p) => Math.max(1, Math.round((p / Math.max(1, totalPlayers)) * 100));
              const wk = { display: "flex", alignItems: "center", gap: 8 };
              const isLeader = ["SUPERADMIN", "CEO", "ADMIN"].includes(account.role);
              const myTeams = seedTeams.filter((t) => canViewDept(account, t.dept));
              const squadTeams = myTeams.length > 0 ? myTeams : seedTeams;
              return (
                <>
                  {/* ── Management overview (executive summary) ────────────── */}
                  {isLeader && (
                    <Section title="Management Overview — All Departments">
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        <StatCard label="Pending approvals" value={pendingApprovals} warn={pendingApprovals > 0} sub="Finance · stock in/out" />
                        <StatCard label="Compliance issues" value={cofExpired.length + cofExpiring.length + insuExpired.length + insuExpiring.length} warn={(cofExpired.length + insuExpiring.length) > 0} sub="COF / insurance" />
                        <StatCard label="Contracts ≤ 3 months" value={contractExpiring.length} warn={contractExpiring.length > 0} sub="Player renewals to chase" />
                        <StatCard label="Sponsors expiring ≤ 3 months" value={sponsorsExpiringSoon} warn={sponsorsExpiringSoon > 0} sub="Revenue at risk" />
                        <StatCard label="Stock below / negative" value={lowStockItems.length + negativeStockItems.length} warn={(lowStockItems.length + negativeStockItems.length) > 0} sub="Inventory items" />
                        <StatCard label="Equipment outstanding" value={equipmentOut} sub="Unreturned items" />
                      </div>
                    </Section>
                  )}

                  {/* ── Core KPI row ─────────────────────────────────────── */}
                  <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
                    {canAccess(account, "players") && <StatCard label="Players (active)" value={totalPlayers} sub="Across all four squads" />}
                    {canAccess(account, "administration") && <StatCard label="Staff (active)" value={activeStaff.length} sub="Including hostel team" />}
                    {canAccess(account, "fleet") && <StatCard label="Fleet vehicles" value={activeVehicles.length} sub={`${cofExpiring.length + cofExpired.length} need COF attention`} warn={(cofExpiring.length + cofExpired.length) > 0} />}
                    {canAccess(account, "hostel") && <StatCard label="Hostel residents" value={totalOcc} sub={`${residentsByHouse.filter((r) => r.count > 0).length} houses occupied`} />}
                    {canAccess(account, "inventory") && <StatCard label="Inventory items" value={items.length} sub={`${lowStockItems.length} at/below minimum`} warn={lowStockItems.length > 0} />}
                    {canAccess(account, "finance") && <StatCard label="Net finance" value={`MK ${netFinance.toLocaleString()}`} sub={`${pendingFinance} pending approval`} warn={netFinance < 0} />}
                  </div>

                  {/* ── Squad summary with visual bars ────────────────────── */}
                  <Section title={`Squad Summary — Registered Players${!isLeader && squadTeams.length < seedTeams.length ? " (your department)" : ""}`}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {squadTeams.map((t) => {
                        const n = playersByTeam[t.name] || 0;
                        const squad = players.filter((p) => p.team === t.name && p.status === "Active");
                        const nextExp = squad.filter((p) => p.contractEnd && remainingMonths(p.contractEnd) >= 0 && remainingMonths(p.contractEnd) <= 3).length;
                        return (
                          <div key={t.code}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                              <span style={{ fontWeight: 600, fontSize: 13.5, color: T.text }}>{t.name}</span>
                              <span style={{ fontSize: 12.5, color: "#948d76" }}>
                                <strong style={{ color: T.ink, fontSize: 15 }}>{n}</strong> players
                                {nextExp > 0 && <span style={{ color: T.pending, marginLeft: 10 }}>⚠ {nextExp} contract(s) ≤ 3 months</span>}
                              </span>
                            </div>
                            <div style={{ background: "#f0ede2", borderRadius: 6, height: 10, overflow: "hidden" }}>
                              <div style={{ background: T.gold, height: "100%", width: `${pct(n)}%`, borderRadius: 6 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Section>

                  {/* ── Finance + Approvals ───────────────────────────────── */}
                  {canAccess(account, "finance") && (
                    <Section title="Finance at a Glance">
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        <StatCard label="Income (approved)" value={`MK ${totalIncome.toLocaleString()}`} />
                        <StatCard label="Expenses (approved)" value={`MK ${totalExpense.toLocaleString()}`} />
                        <StatCard label="Net position" value={`MK ${netFinance.toLocaleString()}`} warn={netFinance < 0} />
                        <StatCard label="Transfers" value={`MK ${totalTransfers.toLocaleString()}`} sub="Not income or expense" />
                        <StatCard label="Pending approvals" value={pendingApprovals} warn={pendingApprovals > 0} sub="Finance · stock in/out" />
                      </div>
                    </Section>
                  )}

                  {/* ── Fleet compliance + Hostel (two-column) ───────────── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
                    {canAccess(account, "fleet") && <Section title="Fleet Compliance">
                      {(cofExpired.length === 0 && cofExpiring.length === 0 && insuExpired.length === 0 && insuExpiring.length === 0) ? (
                        <p style={{ fontSize: 13, color: "#6b6552", margin: 0 }}>All vehicles are compliant — no expired or soon-expiring COF/insurance.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {cofExpired.map((v) => <div key={v.code} style={wk}><Badge tone="bad">COF expired</Badge><span>{v.code} — COF expired {v.cofExpiry}</span></div>)}
                          {cofExpiring.map((v) => <div key={v.code} style={wk}><Badge tone="pending">COF ≤ 3mo</Badge><span>{v.code} — rebrands {v.cofExpiry}</span></div>)}
                          {insuExpired.map((v) => <div key={v.code} style={wk}><Badge tone="bad">Insurance expired</Badge><span>{v.code}</span></div>)}
                          {insuExpiring.map((v) => <div key={v.code} style={wk}><Badge tone="pending">Insurance ≤ 3mo</Badge><span>{v.code} — {v.insuranceExpiry}</span></div>)}
                          {activeVehicles.filter((v) => v.notes && /not in good|injector|tyre|tyres/i.test(v.notes)).map((v) => <div key={v.code} style={wk}><Badge tone="pending">Maintenance</Badge><span>{v.code} — {v.notes}</span></div>)}
                        </div>
                      )}
                    </Section>}

                    {canAccess(account, "hostel") && <Section title="Hostel Occupancy">
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {residentsByHouse.map(({ house, count }) => {
                          const cap = house.code === "HSE-001" ? 13 : 6;
                          const o = Math.min(100, Math.round((count / Math.max(1, cap)) * 100));
                          return (
                            <div key={house.code}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{house.name}</span>
                                <span style={{ fontSize: 12.5, color: "#948d76" }}>{count} of {cap} beds</span>
                              </div>
                              <div style={{ background: "#f0ede2", borderRadius: 6, height: 10, overflow: "hidden" }}>
                                <div style={{ background: o >= 100 ? T.gold : "#c5a34a", height: "100%", width: `${o}%`, borderRadius: 6 }} />
                              </div>
                            </div>
                          );
                        })}
                        <p style={{ fontSize: 12.5, color: "#948d76", margin: "6px 0 0" }}>Hostel wardens: Emmanuel Kadzuwa (Thyolo) · Brian Maonga · Peter Majanga</p>
                      </div>
                    </Section>}
                  </div>

                  {/* ── Contracts expiring + Risks + Upcoming (three-column) ─ */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, alignItems: "start" }}>
                    {canAccess(account, "players") && <Section title="Contracts Expiring Soon">
                      {contractExpiring.length === 0 ? (
                        <p style={{ fontSize: 13, color: "#6b6552", margin: 0 }}>No contracts expiring within 3 months.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {contractExpiring.slice(0, 5).map((p) => (
                            <div key={p.id} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <span>{p.name}</span>
                              <span style={{ color: T.bad, fontWeight: 600 }}>{remainingMonths(p.contractEnd)} mo</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>}

                    {canAccess(account, "matchday") && <Section title="Active Risks & Challenges">
                      {activeRisks.length === 0 ? (
                        <p style={{ fontSize: 13, color: "#6b6552", margin: 0 }}>No open risks — all clear.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {activeRisks.slice(0, 5).map((r) => (
                            <div key={r.id} style={{ fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || r.description}</span>
                              <Badge tone={riskLevel(r) >= 3 ? "bad" : riskLevel(r) >= 2 ? "pending" : "good"}>{riskLevel(r) >= 3 ? "High" : riskLevel(r) >= 2 ? "Medium" : "Low"}</Badge>
                            </div>
                          ))}
                          {criticalRisks.length > 0 && <p style={{ fontSize: 12, color: T.bad, fontWeight: 600, margin: "4px 0 0" }}>{criticalRisks.length} critical/high risk(s)</p>}
                        </div>
                      )}
                    </Section>}

                    {canAccess(account, "matchday") && <Section title="Upcoming Fixtures">
                      {upcomingFixtures.length === 0 ? (
                        <p style={{ fontSize: 13, color: "#6b6552", margin: 0 }}>No scheduled fixtures yet.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {upcomingFixtures.slice(0, 5).map((f) => (
                            <div key={f.id} style={{ fontSize: 13 }}>
                              <span style={{ color: "#948d76", fontWeight: 600, fontSize: 11.5 }}>{f.date}</span>
                              <div style={{ marginTop: 2 }}>{f.venue === "Home" ? `vs ${f.opponent}` : `${f.opponent} (${String(f.venue || "Away").toLowerCase()})`}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>}
                  </div>

                  {/* ── Attention-needed inventory ────────────────────────── */}
                  {canAccess(account, "inventory") && negativeStockItems.length > 0 && (
                    <Section title="Inventory — negative balances (reconcile)">
                      <p style={{ fontSize: 13, color: "#6b6552", marginTop: 0 }}>These items show more stock out than in on the imported sheet — usually an unrecorded stock-in or a miscount. Worth reconciling before relying on these numbers.</p>
                      <Table
                        columns={[{ key: "code", label: "Item Code" }, { key: "name", label: "Item" }, { key: "quantity", label: "Balance" }, { key: "location", label: "Location" }]}
                        rows={negativeStockItems.slice(0, 10)}
                      />
                    </Section>
                  )}

                  {/* ── Recent activity ───────────────────────────────────── */}
                  <Section title="Recent Activity">
                    <Table
                      columns={[
                        { key: "at", label: "When" }, { key: "byName", label: "Staff" },
                        { key: "action", label: "Action" }, { key: "entityCode", label: "Reference" },
                      ]}
                      rows={auditLog.slice(0, 8)}
                      empty="No activity yet — actions across the system will appear here."
                    />
                  </Section>
                </>
              );
            })()}

          {tab === "administration" && (
            <Section title="Staff / Employee Records" action={
              <PrimaryButton onClick={() => setDrawer({ type: "staff" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Add Staff</PrimaryButton>
            }>
              <Table
                columns={[
                  { key: "code", label: "Staff Code" }, { key: "name", label: "Name" },
                  { key: "dept", label: "Department" }, { key: "title", label: "Job Title" },
                  { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Active" ? "good" : "muted"}>{r.status}</Badge> },
                  { key: "startDate", label: "Start Date" },
                  { key: "actions", label: "", render: (r) => (
                    <RowActions
                      onEdit={() => setDrawer({ type: "staff", editing: r })}
                      onDelete={() => deleteStaff(r.code)}
                    />
                  ) },
                ]}
                rows={staff}
              />
              <p style={{ fontSize: 12.5, color: "#948d76", marginTop: 12 }}>
                Every Staff Code created here becomes selectable across Inventory, Finance, and Staff Equipment as Created By / Approved By.
              </p>
            </Section>
          )}

          {tab === "finance" && (
            <>
              <SubTabs
                items={[
                  { key: "transactions", label: "Transactions" },
                  { key: "budget", label: "2026 Budget vs Actual" },
                ]}
                active={financeSubTab}
                onChange={setFinanceSubTab}
              />

              {financeSubTab === "transactions" && (() => {
                const financeRows = showDelFinance ? financeTx : financeVisible;
                // Revenue streams breakdown (Revenue Account income)
                const revIncome = financeVisible.filter((t) => t.department === "Revenue Account" && t.type === "Income");
                const streams = {};
                revIncome.forEach((t) => { streams[t.category] = (streams[t.category] || 0) + (Number(t.amount) || 0); });
                const topStreams = Object.entries(streams).sort((a, b) => b[1] - a[1]);
                const revShare = totalIncome > 0 ? topStreams.map(([k, v]) => ({ k, v, pct: (v / totalIncome) * 100 })) : [];
                // Spend by account
                const spendByAcct = {};
                financeVisible.filter((t) => t.type === "Expense").forEach((t) => {
                  const key = t.department === "Revenue Account" ? "Revenue (bank charges)" : "Operations (programmes)";
                  spendByAcct[key] = (spendByAcct[key] || 0) + (Number(t.amount) || 0);
                });
                // Monthly income vs expense (latest 6 months)
                const monthKey = (d) => { try { return d.slice(0, 7); } catch { return ""; } };
                const monthlyMap = {};
                financeVisible.forEach((t) => {
                  if (t.type !== "Income" && t.type !== "Expense") return;
                  const mk = monthKey(t.date);
                  if (!mk) return;
                  monthlyMap[mk] = monthlyMap[mk] || { income: 0, expense: 0 };
                  if (t.type === "Income") monthlyMap[mk].income += Number(t.amount) || 0;
                  else monthlyMap[mk].expense += Number(t.amount) || 0;
                });
                const months = Object.keys(monthlyMap).sort().slice(-6);
                const maxMonth = Math.max(1, ...months.map((m) => Math.max(monthlyMap[m].income, monthlyMap[m].expense)));
                return (
                <>
                  <div style={{ display: "flex", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
                    <StatCard label="Total income (approved)" value={`MK ${totalIncome.toLocaleString()}`} sub="Revenue Account — real income only" />
                    <StatCard label="Total expenses (approved)" value={`MK ${totalExpense.toLocaleString()}`} sub="Operations & Revenue accounts" />
                    <StatCard label="Net position" value={`MK ${(totalIncome - totalExpense).toLocaleString()}`} warn={totalIncome - totalExpense < 0} sub={totalIncome - totalExpense >= 0 ? "Funds available" : "Spending exceeds income"} />
                    <StatCard label="Internal transfers" value={`MK ${totalTransfers.toLocaleString()}`} sub="Moved between Ekhaya accounts" />
                  </div>

                  <Section title="Income by revenue stream" action={
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "#948d76" }}>
                      <span>2025 Season · Cashbook</span>
                    </div>
                  }>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
                      {revShare.map(({ k, v, pct }) => (
                        <div key={k} style={{ background: "#fffdf8", border: `1px solid ${T.line}`, borderRadius: 10, padding: "14px 16px" }}>
                          <div style={{ fontSize: 12.5, color: "#7a7460", fontWeight: 600 }}>{k}</div>
                          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, color: T.ink, margin: "4px 0 8px" }}>MK {v.toLocaleString()}</div>
                          <div style={{ height: 6, background: "#f0ede2", borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: T.gold, borderRadius: 999 }} />
                          </div>
                          <div style={{ fontSize: 11.5, color: "#948d76", marginTop: 6 }}>{pct.toFixed(1)}% of income</div>
                        </div>
                      ))}
                      {!revShare.length && <p style={{ fontSize: 13, color: "#948d76" }}>No income recorded yet.</p>}
                    </div>
                  </Section>

                  <Section title="Monthly income vs expenditure">
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 18, minHeight: 150, paddingTop: 10 }}>
                      {months.map((m) => {
                        const mi = monthlyMap[m].income, me = monthlyMap[m].expense;
                        const hi = Math.round((mi / maxMonth) * 100), he = Math.round((me / maxMonth) * 100);
                        return (
                          <div key={m} style={{ flex: 1, textAlign: "center" }}>
                            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", justifyContent: "center", height: 120 }}>
                              <div title={`Income MK ${mi.toLocaleString()}`} style={{ width: 22, background: T.good, borderRadius: "4px 4px 0 0", height: `${Math.max(2, hi)}%` }} />
                              <div title={`Expense MK ${me.toLocaleString()}`} style={{ width: 22, background: me > mi ? T.bad : T.ink, borderRadius: "4px 4px 0 0", height: `${Math.max(2, he)}%` }} />
                            </div>
                            <div style={{ fontSize: 11.5, color: "#948d76", marginTop: 6 }}>{m}</div>
                            <div style={{ fontSize: 10.5 }}><span style={{ color: T.good }}>▲</span> <span style={{ color: "#948d76" }}>MK {(mi / 1e6).toFixed(1)}m</span><br/><span style={{ color: "#6b6552" }}>▼</span> <span style={{ color: "#948d76" }}>MK {(me / 1e6).toFixed(1)}m</span></div>
                          </div>
                        );
                      })}
                      {!months.length && <p style={{ fontSize: 13, color: "#948d76" }}>No dated transactions yet.</p>}
                    </div>
                  </Section>

                  <Section title="Finance ledger" action={
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {deletedCount > 0 && <GhostButton onClick={() => setShowDelFinance((v) => !v)}>{showDelFinance ? "Hide deleted" : `Show deleted (${deletedCount})`}</GhostButton>}
                      <PrimaryButton onClick={() => setDrawer({ type: "finance" })}><Plus size={14} style={{ verticalAlign: -2 }} /> New Transaction</PrimaryButton>
                    </div>
                  }>
                    <p style={{ fontSize: 12.5, color: "#948d76", marginTop: 0 }}>
                      {financeTx.length} transactions imported from the club cashbooks — {Object.keys(spendByAcct).length} accounts, {deletedCount} soft-deleted for audit trail.
                    </p>
                    <Table
                      columns={[
                        { key: "code", label: "Ref" },
                        { key: "date", label: "Date" },
                        { key: "type", label: "Type", render: (r) => <Badge tone={r.type === "Income" ? "good" : r.type === "Transfer" ? "muted" : "bad"}>{r.type}</Badge> },
                        { key: "category", label: "Category" },
                        { key: "description", label: "Description" },
                        { key: "amount", label: "Amount", render: (r) => (r.type === "Income"
                          ? <span style={{ color: T.good, fontWeight: 600 }}>+ MK {r.amount.toLocaleString()}</span>
                          : r.type === "Expense"
                            ? <span style={{ color: r.type === "Expense" ? T.bad : T.text }}>− MK {r.amount.toLocaleString()}</span>
                            : <span style={{ color: "#948d76" }}>→ MK {r.amount.toLocaleString()}</span>) },
                        { key: "department", label: "Account" },
                        { key: "status", label: "Status", render: (r) => <Badge tone={statusColor(r.status)}>{r.status}</Badge> },
                        { key: "attachments", label: "Files", render: (r) => (r.attachments || []).map((f, i) => <AttachChip key={i} name={f} />) },
                        { key: "actions", label: "", render: (r) => (
                          <>
                            {r.status === "Pending" && canApprove(account, r.createdBy) && <GhostButton tone="good" onClick={() => approveFinanceTx(r)}>Approve</GhostButton>}
                            {r.status === "Pending" && canDelete(account) && <GhostButton tone="bad" onClick={() => { const reason = prompt("Reason for soft-deleting:"); if (reason !== null) deleteFinanceTx(r.code, reason); }}><Trash2 size={12} /> Delete</GhostButton>}
                            {r.status === "Deleted" && canDelete(account) && <GhostButton tone="good" onClick={() => restoreFinanceTx(r.code)}>Restore</GhostButton>}
                          </>
                        ) },
                      ]}
                      rows={financeRows}
                      empty="No finance transactions recorded yet."
                    />
                  </Section>
                </>
                );
              })()}

              {financeSubTab === "budget" && (() => {
                const fmt = (n) => `MK ${n.toLocaleString()}`;
                const groups = {};
                seedBudget.forEach((b) => {
                  const d = b.department || "Other";
                  groups[d] = groups[d] || { budget: 0, allocated: 0, actual: 0 };
                  groups[d].budget += Number(b.budget) || 0;
                  groups[d].allocated += Number(b.allocated) || 0;
                  groups[d].actual += Number(b.actual) || 0;
                });
                const groupList = Object.entries(groups).sort((a, b) => b[1].budget - a[1].budget);
                const totBudget = seedBudget.reduce((s, b) => s + (Number(b.budget) || 0), 0);
                const totActual = seedBudget.reduce((s, b) => s + (Number(b.actual) || 0), 0);
                const totAlloc = seedBudget.reduce((s, b) => s + (Number(b.allocated) || 0), 0);
                const overallPct = totBudget > 0 ? (totActual / totBudget) * 100 : 0;
                return (
                <>
                  <div style={{ display: "flex", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
                    <StatCard label="Annual budget 2026" value={fmt(totBudget)} />
                    <StatCard label="Funds allocated" value={fmt(totAlloc)} sub={`${totBudget > 0 ? ((totAlloc / totBudget) * 100).toFixed(1) : 0}% of budget`} />
                    <StatCard label="Actual expenditure" value={fmt(totActual)} />
                    <StatCard label="Overall utilisation" value={`${overallPct.toFixed(1)}%`} warn={overallPct >= 80} sub={`${seedBudget.length} budget line items`} />
                  </div>

                  <Section title="Spending by department">
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                      {groupList.map(([name, g]) => {
                        const pct = g.budget > 0 ? (g.actual / g.budget) * 100 : 0;
                        const balance = g.budget - g.actual;
                        return (
                          <div key={name} style={{ background: "#fffdf8", border: `1px solid ${T.line}`, borderRadius: 10, padding: "14px 16px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{name}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: pct >= 80 ? T.bad : T.pending }}>{pct.toFixed(1)}%</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: "#948d76", margin: "4px 0" }}>{fmt(g.allocated)} allocated</div>
                            <div style={{ height: 6, background: "#f0ede2", borderRadius: 999, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: pct >= 90 ? T.bad : T.gold, borderRadius: 999 }} />
                            </div>
                            <div style={{ fontSize: 11.5, color: "#7a7460", marginTop: 6 }}>
                              {fmt(g.actual)} spent · <span style={{ color: balance < 0 ? T.bad : "#948d76" }}>{fmt(Math.abs(balance))} {balance < 0 ? "over budget" : "remaining"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Section>

                  <Section title="2026 Activity-Based Expenditure vs Budget">
                    <p style={{ fontSize: 12.5, color: "#948d76", marginTop: 0 }}>
                      Reproduced as provided from Ekhaya_FC_2026_Budget___Activity_listing.xlsx — {seedBudget.length} line items across all activities. This is a planning reference, not editable transactions.
                    </p>
                    <Table
                      columns={[
                        { key: "activity", label: "Activity" },
                        { key: "item", label: "Item" },
                        { key: "budget", label: "Annual Budget", render: (r) => fmt(r.budget) },
                        { key: "allocated", label: "Allocated", render: (r) => fmt(r.allocated || 0) },
                        { key: "actual", label: "Actual Expenditure", render: (r) => fmt(r.actual) },
                        { key: "balance", label: "Balance on Budget", render: (r) => `MK ${r.balance.toLocaleString()}` },
                        { key: "pct", label: "% Utilised", render: (r) => (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 44, height: 5, background: "#f0ede2", borderRadius: 999, overflow: "hidden", display: "inline-block" }}>
                              <span style={{ display: "block", height: "100%", width: `${Math.min(100, r.pct)}%`, background: r.pct >= 90 ? T.bad : r.pct > 0 ? T.gold : "#e5e0d0", borderRadius: 999 }} />
                            </span>
                            <span style={{ color: r.pct >= 90 ? T.bad : r.pct > 0 ? T.pending : "#948d76", fontWeight: r.pct >= 90 ? 700 : 400 }}>{r.pct}%</span>
                          </span>
                        ) },
                      ]}
                      rows={seedBudget}
                      empty="No budget data."
                    />
                  </Section>
                </>
                );
              })()}
            </>
          )}

          {tab === "marketing" && (() => {
              const activeSponsors = sponsors.filter((s) => s.status === "Active");
              const expiring = sponsors.filter((s) => s.endDate && remainingMonths(s.endDate) <= 3 && s.status === "Active");
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <StatCard label="Sponsors (active)" value={activeSponsors.length} />
                      <StatCard label="Expiring ≤ 3 months" value={expiring.length} warn={expiring.length > 0} sub="Renewals to chase" />
                      <StatCard label="Contract value (active)" value={`MK ${activeSponsors.reduce((s, x) => s + (Number(x.contractValue) || 0), 0).toLocaleString()}`} />
                    </div>
                    <PrimaryButton onClick={() => setDrawer({ type: "sponsor" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Add Sponsor</PrimaryButton>
                  </div>
                  <Section title="Sponsorship Agreements">
                    <Table
                      columns={[
                        { key: "name", label: "Sponsor" },
                        { key: "category", label: "Category" },
                        { key: "contact", label: "Contact", render: (r) => <span>{r.contact||"—"}<br/><span style={{ fontSize: 11, color: "#948d76" }}>{r.email || r.phone || ""}</span></span> },
                        { key: "contractValue", label: "Value (MK)", render: (r) => `MK ${(Number(r.contractValue) || 0).toLocaleString()}` },
                        { key: "startDate", label: "Start" },
                        { key: "endDate", label: "End", render: (r) => r.endDate ? <span style={{ color: remainingMonths(r.endDate) <= 3 && r.status === "Active" ? T.bad : T.text }}>{r.endDate}</span> : "—" },
                        { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Active" ? "good" : r.status === "Expired" ? "bad" : "muted"}>{r.status}</Badge> },
                        { key: "deliverables", label: "Deliverables" },
                        { key: "actions", label: "", render: (r) => (
                          <RowActions onEdit={() => setDrawer({ type: "sponsor", editing: r })} onDelete={canDelete(account) ? () => { if (window.confirm(`Delete sponsor ${r.name}? This cannot be undone.`)) { setSponsors((prev) => prev.filter((x) => x.id !== r.id)); log("Deleted Sponsor", "sponsor", r.name, `Deleted by ${actor.code}`); } } : undefined} />
                        ) },
                      ]}
                      rows={sponsors}
                      empty="No sponsorships yet — add your first sponsor or import via Backup & Restore."
                    />
                  </Section>
                </>
              );
            })()}

          {tab === "fleet" && (() => {
              const fleetActive = activeVehicles;
              const maintenance = fleetActive.filter((v) => v.notes && /not in good|injector|tyre|service/i.test(v.notes));
              return (
                <>
                  <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
                    <StatCard label="Vehicles (active)" value={fleetActive.length} />
                    <StatCard label="COF attention" value={cofExpiring.length + cofExpired.length} warn={(cofExpiring.length + cofExpired.length) > 0} sub={`${cofExpired.length} already expired`} />
                    <StatCard label="Insurance attention" value={insuExpiring.length + insuExpired.length} warn={(insuExpiring.length + insuExpired.length) > 0} sub={`${insuExpired.length} already expired`} />
                    <StatCard label="Maintenance needed" value={maintenance.length} warn={maintenance.length > 0} sub="Servicing / condition issues" />
                  </div>

                  <Section title="Fleet — vehicles & drivers" action={
                    <PrimaryButton onClick={() => setDrawer({ type: "vehicle" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Add Vehicle</PrimaryButton>
                  }>
                    <p style={{ fontSize: 12.5, color: "#948d76", marginTop: 0 }}>Club vehicle register with COF, insurance and service compliance. Dates are checked against today automatically.</p>
                    <Table
                      columns={[
                        { key: "code", label: "Vehicle" },
                        { key: "regNo", label: "Registration" },
                        { key: "makeModel", label: "Make / Model" },
                        { key: "cof", label: "COF Expiry", render: (r) => r.cofExpiry ? (
                          r.cofExpiry < todayISO() ? <Badge tone="bad">Expired {r.cofExpiry}</Badge>
                          : remainingMonths(r.cofExpiry) <= 3 ? <Badge tone="pending">{r.cofExpiry} (≤3mo)</Badge>
                          : <span>{r.cofExpiry}</span>
                        ) : "—" },
                        { key: "insurance", label: "Insurance Expiry", render: (r) => r.insuranceExpiry ? (
                          r.insuranceExpiry < todayISO() ? <Badge tone="bad">Expired {r.insuranceExpiry}</Badge>
                          : remainingMonths(r.insuranceExpiry) <= 3 ? <Badge tone="pending">{r.insuranceExpiry} (≤3mo)</Badge>
                          : <span>{r.insuranceExpiry}</span>
                        ) : "—" },
                        { key: "lastService", label: "Last Service" },
                        { key: "driverName", label: "Driver" },
                        { key: "notes", label: "Notes / Condition" },
                        { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Active" ? "good" : "muted"}>{r.status}</Badge> },
                        { key: "actions", label: "", render: (r) => (
                          <RowActions onEdit={() => setDrawer({ type: "vehicle", editing: r })} onDelete={() => deleteVehicle(r.id, r.code)} />
                        ) },
                      ]}
                      rows={fleetActive}
                      empty="No vehicles added yet."
                    />
                  </Section>
                </>
              );
            })()}

          {tab === "players" && (() => {
              const teamOpts = ["all", ...seedTeams.map((t) => t.name)];
              const filtered = teamFilter === "all" ? players : players.filter((p) => p.team === teamFilter);
              return (
                <>
                  <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
                    {seedTeams.map((t) => (
                      <StatCard key={t.code} label={t.name} value={playersByTeam[t.name] || 0} sub={t.code.replace("EKH-", "")} />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12.5, color: "#6b6552", fontWeight: 600 }}>Filter team</span>
                      <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={inputStyle}>
                        {teamOpts.map((t) => <option key={t} value={t}>{t === "all" ? "All teams" : t}</option>)}
                      </select>
                      {canSeeSalaries(account) && (
                        <GhostButton onClick={() => setRevealSalaries((v) => !v)}>
                          {revealSalaries ? "Hide salaries" : "Show salaries"}
                        </GhostButton>
                      )}
                    </div>
                    <PrimaryButton onClick={() => setDrawer({ type: "player" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Add Player</PrimaryButton>
                  </div>
                  <Section title={`Players & Contracts (${filtered.length})`}>
                    <p style={{ fontSize: 12.5, color: "#6b6552", marginTop: 0 }}>
                      Active registered players across all squads. Salary amounts are masked by default for privacy — only Finance, CEO and Superadmin may reveal them.
                    </p>
                    <Table
                      columns={[
                        { key: "shirtNo", label: "Shirt #", render: (r) => <span style={{ fontWeight: 700, fontFamily: "Oswald, sans-serif" }}>{r.shirtNo}</span> },
                        { key: "name", label: "Name" },
                        { key: "dob", label: "DOB", render: (r) => r.dob || "—" },
                        { key: "age", label: "Age", render: (r) => r.dob ? calculateAge(r.dob) : "—" },
                        { key: "mpiraId", label: "Mpira ID", render: (r) => r.mpiraId || "—" },
                        { key: "position", label: "Position" },
                        { key: "team", label: "Team" },
                        { key: "contractEnd", label: "Contract Ends", render: (r) => r.contractEnd || "—" },
                        { key: "remaining", label: "Remaining", render: (r) => r.contractEnd ? <span style={{ color: remainingMonths(r.contractEnd) <= 3 ? T.bad : "#6b6552" }}>{remainingMonths(r.contractEnd)} mo</span> : "—" },
                        { key: "salary", label: "Salary (MK)", render: (r) => canSeeSalaries(account) && revealSalaries ? `MK ${(Number(r.salary) || 0).toLocaleString()}` : "••••••" },
                        { key: "actions", label: "", render: (r) => (
                          <RowActions
                            onEdit={() => canAccess(account, "players") ? setDrawer({ type: "player", editing: r }) : alert("You may only edit players in your department.")}
                            onDelete={canDelete(account) ? () => { if (window.confirm(`Delete player ${r.name}? This cannot be undone.`)) { setPlayers((prev) => prev.filter((p) => p.id !== r.id)); log("Deleted Player", "player", r.name, `Deleted by ${actor.code}`); } } : undefined}
                          />
                        ) },
                      ]}
                      rows={filtered}
                      empty="No players registered yet — add them or import via the Backup & Restore tab."
                    />
                  </Section>
                </>
              );
            })()}

          {tab === "team" && (
            <>
              <p style={{ fontSize: 12.5, color: "#948d76", marginTop: 0, marginBottom: 16 }}>
                Four teams — registered squad, staff, and equipment requests per team.
              </p>
              {seedTeams.map((team) => {
                const teamPlayers = players.filter((p) => p.team === team.name && p.status === "Active");
                const teamStaff = staff.filter((s) => s.dept === team.dept);
                const manager = staff.find((s) => s.code === team.managerCode);
                const requests = stockOut.filter((r) => r.team === team.name);
                const expiring = teamPlayers.filter((p) => p.contractEnd && remainingMonths(p.contractEnd) >= 0 && remainingMonths(p.contractEnd) <= 3);
                return (
                  <Section key={team.code} title={`${team.name} (${team.code})`}>
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 14, fontSize: 13, color: "#6b6552" }}>
                      <span>Squad: <strong style={{ color: T.ink }}>{teamPlayers.length}</strong></span>
                      <span>Manager: <strong>{manager ? `${team.managerCode} — ${manager.name}` : team.managerCode}</strong></span>
                      <span>Staff: <strong>{teamStaff.length}</strong></span>
                      <span>Contracts expiring ≤ 3mo: <strong style={{ color: expiring.length ? T.bad : T.good }}>{expiring.length}</strong></span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
                      <div>
                        <div style={{ fontSize: 12.5, color: "#948d76", fontWeight: 600, marginBottom: 6 }}>REGISTERED SQUAD</div>
                        <Table
                          columns={[
                            { key: "shirtNo", label: "#", render: (r) => <span style={{ fontWeight: 700 }}>{r.shirtNo}</span> },
                            { key: "name", label: "Name" },
                            { key: "position", label: "Position", render: (r) => r.position || "—" },
                            { key: "remaining", label: "Contract", render: (r) => r.contractEnd ? <span style={{ color: remainingMonths(r.contractEnd) <= 3 ? T.bad : "#6b6552" }}>{remainingMonths(r.contractEnd)} mo</span> : "—" },
                          ]}
                          rows={teamPlayers.slice(0, 15)}
                          empty="No registered players yet."
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, color: "#948d76", fontWeight: 600, marginBottom: 6 }}>EQUIPMENT REQUESTS</div>
                        <Table
                          columns={[
                            { key: "code", label: "Ref" }, { key: "item", label: "Item", render: (r) => itemName(r.itemId) },
                            { key: "quantity", label: "Qty" },
                            { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Issued" ? "good" : r.status === "Rejected" ? "bad" : "pending"}>{r.status}</Badge> },
                          ]}
                          rows={requests}
                          empty="No requests"
                        />
                        <div style={{ fontSize: 12.5, color: "#948d76", fontWeight: 600, margin: "14px 0 6px" }}>TEAM STAFF</div>
                        <Table
                          columns={[{ key: "name", label: "Name" }, { key: "code", label: "Staff Code" }, { key: "title", label: "Title" }]}
                          rows={teamStaff}
                          empty="No staff assigned to this team yet."
                        />
                      </div>
                    </div>
                  </Section>
                );
              })}
            </>
          )}

          {tab === "inventory" && (
            <>
              <SubTabs
                items={[
                  { key: "items", label: "Items" },
                  { key: "stockin", label: "Stock In" },
                  { key: "stockout", label: "Stock Out / Requests" },
                  { key: "transfers", label: "Transfers" },
                  { key: "adjustments", label: "Adjustments" },
                ]}
                active={invSubTab}
                onChange={setInvSubTab}
              />

              {invSubTab === "items" && (
                <Section title={`Inventory Items (${items.length})`} action={
                  <PrimaryButton onClick={() => setDrawer({ type: "item" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Add Item</PrimaryButton>
                }>
                  <p style={{ fontSize: 12.5, color: "#948d76", marginTop: 0 }}>284 from the Sep 2026 stock count, plus 154 more found only in the movement history (Stock In/Out sheets) but missing from that count — their quantity here is the net of that movement history alone, so it's worth double-checking against a physical count.</p>
                  <Table
                    columns={[
                      { key: "code", label: "Item Code" }, { key: "name", label: "Name" }, { key: "category", label: "Category" },
                      { key: "quantity", label: "Qty", render: (r) => (
                        <span style={{ color: r.quantity <= r.min ? T.bad : T.text, fontWeight: r.quantity <= r.min ? 700 : 400 }}>{r.quantity} {r.unit}</span>
                      ) },
                      { key: "min", label: "Min" },
                      { key: "unitCost", label: "Unit Cost", render: (r) => `MK ${r.unitCost.toLocaleString()}` },
                      { key: "value", label: "Total Value", render: (r) => `MK ${(r.quantity * r.unitCost).toLocaleString()}` },
                      { key: "location", label: "Location" }, { key: "condition", label: "Condition" },
                      { key: "actions", label: "", render: (r) => (
                        <RowActions
                          onEdit={() => setDrawer({ type: "item", editing: r })}
                          onDelete={() => deleteItem(r.id, r.code)}
                        />
                      ) },
                    ]}
                    rows={items}
                  />
                </Section>
              )}

              {invSubTab === "stockin" && (
                <Section title={`Stock In (${stockIn.length})`} action={
                  <PrimaryButton onClick={() => setDrawer({ type: "stockin" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Record Stock In</PrimaryButton>
                }>
                  <p style={{ fontSize: 12.5, color: "#948d76", marginTop: 0 }}>395 historical receipts imported from the movement sheet, already marked Verified since they're already reflected in each item's current quantity — no action needed on these. New entries you record from here follow the normal two-person verification.</p>
                  <Table
                    columns={[
                      { key: "code", label: "Ref" }, { key: "item", label: "Item", render: (r) => itemName(r.itemId) },
                      { key: "quantity", label: "Qty" }, { key: "supplier", label: "Supplier" },
                      { key: "receivedBy", label: "Received By" }, { key: "verifiedBy", label: "Verified By", render: (r) => r.verifiedBy || "—" },
                      { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Verified" ? "good" : "pending"}>{r.status}</Badge> },
                      { key: "attachments", label: "Files", render: (r) => (r.attachments || []).map((f, i) => <AttachChip key={i} name={f} />) },
                      { key: "actions", label: "", render: (r) => (
                        <>
                          {r.status === "Pending Verification" && <GhostButton tone="good" onClick={() => verifyStockIn(r)}>Verify</GhostButton>}
                          {canDelete(account) && <GhostButton tone="bad" onClick={() => deleteStockIn(r.code)}><Trash2 size={12} /> Delete</GhostButton>}
                        </>
                      ) },
                    ]}
                    rows={stockIn}
                    empty="No stock received yet."
                  />
                </Section>
              )}

              {invSubTab === "stockout" && (
                <Section title={`Stock Out / Requests (${stockOut.length})`} action={
                  <PrimaryButton onClick={() => setDrawer({ type: "stockout" })}><Plus size={14} style={{ verticalAlign: -2 }} /> New Request</PrimaryButton>
                }>
                  <p style={{ fontSize: 12.5, color: "#948d76", marginTop: 0 }}>1,201 historical issues imported from the movement sheet, already marked Issued for the same reason. The "Purpose" field on each shows who originally received it, where the sheet recorded that.</p>
                  <Table
                    columns={[
                      { key: "code", label: "Ref" }, { key: "item", label: "Item", render: (r) => itemName(r.itemId) },
                      { key: "quantity", label: "Qty" }, { key: "team", label: "Team / Dept" }, { key: "purpose", label: "Purpose / Recipient" },
                      { key: "requestedBy", label: "Requested By" }, { key: "approvedBy", label: "Approved By", render: (r) => r.approvedBy || "—" },
                      { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Issued" ? "good" : r.status === "Rejected" ? "bad" : "pending"}>{r.status}</Badge> },
                      { key: "actions", label: "", render: (r) => (
                        <>
                          {r.status === "Pending" && <>
                            <GhostButton tone="good" onClick={() => approveStockOut(r)}>Approve</GhostButton>
                            <GhostButton tone="bad" onClick={() => rejectStockOut(r)}>Reject</GhostButton>
                          </>}
                          {r.status === "Approved" && <GhostButton onClick={() => issueStockOut(r)}>Issue</GhostButton>}
                          {canDelete(account) && <GhostButton tone="bad" onClick={() => deleteStockOut(r.code)}><Trash2 size={12} /></GhostButton>}
                        </>
                      ) },
                    ]}
                    rows={stockOut}
                    empty="No requests yet."
                  />
                </Section>
              )}

              {invSubTab === "transfers" && (
                <Section title="Transfers" action={
                  <PrimaryButton onClick={() => setDrawer({ type: "transfer" })}><Plus size={14} style={{ verticalAlign: -2 }} /> New Transfer</PrimaryButton>
                }>
                  <Table
                    columns={[
                      { key: "code", label: "Ref" }, { key: "item", label: "Item", render: (r) => itemName(r.itemId) },
                      { key: "quantity", label: "Qty" }, { key: "from", label: "From" }, { key: "to", label: "To" },
                      { key: "requestedBy", label: "Requested By" },
                      { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Approved" ? "good" : "pending"}>{r.status}</Badge> },
                      { key: "actions", label: "", render: (r) => (
                        <>
                          {r.status === "Pending" && <GhostButton tone="good" onClick={() => approveTransfer(r)}>Approve</GhostButton>}
                          {canDelete(account) && <GhostButton tone="bad" onClick={() => deleteTransfer(r.code)}><Trash2 size={12} /></GhostButton>}
                        </>
                      ) },
                    ]}
                    rows={transfers}
                    empty="No transfers yet."
                  />
                </Section>
              )}

              {invSubTab === "adjustments" && (
                <Section title="Adjustments (write-offs, damage, corrections)" action={
                  <PrimaryButton onClick={() => setDrawer({ type: "adjustment" })}><Plus size={14} style={{ verticalAlign: -2 }} /> New Adjustment</PrimaryButton>
                }>
                  <Table
                    columns={[
                      { key: "code", label: "Ref" }, { key: "item", label: "Item", render: (r) => itemName(r.itemId) },
                      { key: "change", label: "Change", render: (r) => (
                        <span style={{ color: r.change < 0 ? T.bad : T.good, fontWeight: 700 }}>{r.change > 0 ? "+" : ""}{r.change}</span>
                      ) },
                      { key: "reason", label: "Reason" }, { key: "requestedBy", label: "Requested By" },
                      { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Approved" ? "good" : "pending"}>{r.status}</Badge> },
                      { key: "actions", label: "", render: (r) => (
                        <>
                          {r.status === "Pending" && <GhostButton tone="good" onClick={() => approveAdjustment(r)}>Approve</GhostButton>}
                          {canDelete(account) && <GhostButton tone="bad" onClick={() => deleteAdjustment(r.code)}><Trash2 size={12} /></GhostButton>}
                        </>
                      ) },
                    ]}
                    rows={adjustments}
                    empty="No adjustments yet."
                  />
                </Section>
              )}
            </>
          )}

          {tab === "hostel" && (() => {
              const dayAttendance = attendanceLog.filter((a) => a.date === dateFilter);
              return (
                <>
                  <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
                    <StatCard label="Residents (active)" value={totalOcc} />
                    {residentsByHouse.map(({ house, count }) => {
                      const cap = house.code === "HSE-001" ? 13 : 6;
                      const o = Math.min(100, Math.round((count / Math.max(1, cap)) * 100));
                      return <StatCard key={house.code} label={house.name} value={`${count}/${cap}`} sub={`${o}% occupied`} warn={o >= 100} />;
                    })}
                  </div>
                  <SubTabs items={[
                    { key: "residents", label: "Residents" },
                    { key: "attendance", label: "Attendance" },
                    { key: "incidents", label: "Behavior" },
                    { key: "food", label: "Food Schedule" },
                  ]} active={hostelSubTab} onChange={setHostelSubTab} />

                  {hostelSubTab === "residents" && (
                    <Section title="Hostel Residents" action={<PrimaryButton onClick={() => setDrawer({ type: "hostelResident" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Add Resident</PrimaryButton>}>
                      <p style={{ fontSize: 12.5, color: "#6b6552", marginTop: 0 }}>{activeResidents.length} active residents across {seedHostels.length} houses.</p>
                      <Table
                        columns={[
                          { key: "name", label: "Name" },
                          { key: "house", label: "House", render: (r) => seedHostels.find((h) => h.code === r.houseCode)?.name || r.houseCode },
                          { key: "room", label: "Room" },
                          { key: "team", label: "Team" },
                          { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Active" ? "good" : "muted"}>{r.status}</Badge> },
                          { key: "joined", label: "Joined" },
                          { key: "actions", label: "", render: (r) => (
                            <RowActions onEdit={() => setDrawer({ type: "hostelResident", editing: r })} onDelete={canDelete(account) ? () => { if (window.confirm(`Delete resident ${r.name}? This cannot be undone.`)) { setHostelResidents((prev) => prev.filter((x) => x.id !== r.id)); log("Deleted Hostel Resident", "hostel_resident", r.name, `Deleted by ${actor.code}`); } } : undefined} />
                          ) },
                        ]}
                        rows={hostelResidents}
                        empty="No residents registered."
                      />
                    </Section>
                  )}

                  {hostelSubTab === "attendance" && (
                    <Section title="Daily Attendance" action={
                      <>
                        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={{ ...inputStyle, width: 150, marginRight: 10 }} />
                        <PrimaryButton onClick={() => setDrawer({ type: "attendance", date: dateFilter })}><Plus size={14} style={{ verticalAlign: -2 }} /> Log Attendance</PrimaryButton>
                      </>
                    }>
                      <p style={{ fontSize: 12.5, color: "#6b6552", marginTop: 0 }}>Showing entries for <strong>{dateFilter}</strong> — {dayAttendance.length} of {activeResidents.length} active residents logged.</p>
                      <Table
                        columns={[
                          { key: "resident", label: "Resident" },
                          { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Present" ? "good" : r.status === "Late" ? "pending" : "bad"}>{r.status}</Badge> },
                          { key: "notes", label: "Notes" },
                          { key: "recordedBy", label: "Recorded By" },
                        ]}
                        rows={dayAttendance}
                        empty="No attendance logged for this date yet."
                      />
                    </Section>
                  )}

                  {hostelSubTab === "incidents" && (
                    <Section title="Behavior & Incidents" action={<PrimaryButton onClick={() => setDrawer({ type: "incident" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Log Incident</PrimaryButton>}>
                      <Table
                        columns={[
                          { key: "date", label: "Date" }, { key: "resident", label: "Resident" },
                          { key: "severity", label: "Severity", render: (r) => <Badge tone={r.severity === "Incident" ? "bad" : r.severity === "High" ? "bad" : r.severity === "Medium" ? "pending" : "good"}>{r.severity}</Badge> },
                          { key: "description", label: "Description" },
                          { key: "reportedBy", label: "Reported By" },
                        ]}
                        rows={incidents}
                        empty="No incidents recorded."
                      />
                    </Section>
                  )}

                  {hostelSubTab === "food" && (
                    <Section title="Weekly Food Schedule (template)">
                      <Table
                        columns={[
                          { key: "day", label: "Day" }, { key: "breakfast", label: "Breakfast" },
                          { key: "lunch", label: "Lunch" }, { key: "supper", label: "Supper" },
                        ]}
                        rows={foodSchedule}
                      />
                    </Section>
                  )}
                </>
              );
            })()}

{tab === "matchday" && (() => {
              return (
                <>
                  <SubTabs items={[
                    { key: "fixtures", label: "Fixtures" },
                    { key: "transport", label: "Transport & Fuel" },
                    { key: "risks", label: "Risks" },
                  ]} active={matchSubTab} onChange={setMatchSubTab} />

                  {matchSubTab === "fixtures" && (
                    <Section title="Fixtures & Results" action={<PrimaryButton onClick={() => setDrawer({ type: "fixture" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Add Fixture</PrimaryButton>}>
                      <Table
                        columns={[
                          { key: "date", label: "Date" }, { key: "opponent", label: "Opponent" },
                          { key: "competition", label: "Competition" }, { key: "venue", label: "Venue" },
                          { key: "result", label: "Result", render: (r) => r.result || "—" },
                          { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Completed" ? "good" : r.status === "Cancelled" ? "bad" : "muted"}>{r.status}</Badge> },
                          { key: "actions", label: "", render: (r) => (
                            <RowActions onEdit={() => setDrawer({ type: "fixture", editing: r })} onDelete={canDelete(account) ? () => { if (window.confirm(`Delete fixture vs ${r.opponent}? This cannot be undone.`)) { setFixtures((prev) => prev.filter((x) => x.id !== r.id)); log("Deleted Fixture", "fixture", r.opponent, `Deleted by ${actor.code}`); } } : undefined} />
                          ) },
                        ]}
                        rows={fixtures}
                        empty="No fixtures yet."
                      />
                    </Section>
                  )}

                  {matchSubTab === "transport" && (
                    <>
                      <Section title="Trips" action={<PrimaryButton onClick={() => setDrawer({ type: "trip" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Log Trip</PrimaryButton>}>
                        <Table
                          columns={[
                            { key: "date", label: "Date" }, { key: "vehicle", label: "Vehicle" },
                            { key: "destination", label: "Destination" }, { key: "purpose", label: "Purpose" },
                            { key: "passengers", label: "Pax" }, { key: "mileageStart", label: "Start km" },
                            { key: "mileageEnd", label: "End km" }, { key: "driver", label: "Driver" },
                          ]}
                          rows={trips}
                          empty="No trips logged."
                        />
                      </Section>
                      <Section title="Fuel Log" action={<PrimaryButton onClick={() => setDrawer({ type: "fuel" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Add Fuel Entry</PrimaryButton>}>
                        <Table
                          columns={[
                            { key: "date", label: "Date" }, { key: "vehicle", label: "Vehicle" },
                            { key: "litres", label: "Litres" }, { key: "cost", label: "Cost (MK)", render: (r) => `MK ${(Number(r.cost) || 0).toLocaleString()}` },
                            { key: "odometer", label: "Odometer" }, { key: "recordedBy", label: "Recorded By" },
                          ]}
                          rows={fuelLog}
                          empty="No fuel entries."
                        />
                      </Section>
                    </>
                  )}

                  {matchSubTab === "risks" && (
                    <Section title="Risks & Mitigations" action={<PrimaryButton onClick={() => setDrawer({ type: "risk" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Add Risk</PrimaryButton>}>
                      <Table
                        columns={[
                          { key: "code", label: "Ref" }, { key: "title", label: "Risk" },
                          { key: "category", label: "Category" },
                          { key: "likelihood", label: "Likelihood", render: (r) => <Badge tone={r.likelihood === "High" || r.likelihood === "Very High" ? "bad" : "pending"}>{r.likelihood}</Badge> },
                          { key: "impact", label: "Impact", render: (r) => <Badge tone={r.impact === "High" || r.impact === "Critical" ? "bad" : "pending"}>{r.impact}</Badge> },
                          { key: "owner", label: "Owner" },
                          { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Open" ? "pending" : "good"}>{r.status}</Badge> },
                          { key: "actions", label: "", render: (r) => (
                            <RowActions onEdit={() => setDrawer({ type: "risk", editing: r })} onDelete={canDelete(account) ? () => { if (window.confirm(`Delete risk ${r.code}? This cannot be undone.`)) { setRisks((prev) => prev.filter((x) => x.id !== r.id)); log("Deleted Risk", "risk", r.code, `Deleted by ${actor.code}`); } } : undefined} />
                          ) },
                        ]}
                        rows={risks}
                        empty="No risks identified."
                      />
                    </Section>
                  )}
                </>
              );
            })()}

          {tab === "staffequipment" && (
            <Section title="Staff Equipment — long-term issued items" action={
              <PrimaryButton onClick={() => setDrawer({ type: "equipment" })}><Plus size={14} style={{ verticalAlign: -2 }} /> Issue Equipment</PrimaryButton>
            }>
              <p style={{ fontSize: 12.5, color: "#948d76", marginTop: 0 }}>
                For items handed to one staff member over time (kit, jerseys, equipment) — drawn straight from Inventory. Issuing deducts 1 from that item's Inventory quantity; a return adds it back.
              </p>
              <Table
                columns={[
                  { key: "code", label: "Ref" }, { key: "staffCode", label: "Staff Code" },
                  { key: "itemName", label: "Item", render: (r) => `${r.itemCode ? r.itemCode + " — " : ""}${r.itemName}` },
                  { key: "serial", label: "Serial No." }, { key: "dateIssued", label: "Issued" }, { key: "issuedBy", label: "Issued By" },
                  { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Returned" ? "muted" : "good"}>{r.status}</Badge> },
                  { key: "dateReturned", label: "Returned", render: (r) => r.dateReturned || "—" },
                  { key: "actions", label: "", render: (r) => (
                    <>
                      {r.status === "Issued" && <GhostButton onClick={() => returnEquipment(r)}>Mark Returned</GhostButton>}
                      <GhostButton tone="bad" onClick={() => deleteEquipment(r.code)}><Trash2 size={12} /></GhostButton>
                    </>
                  ) },
                ]}
                rows={staffEquipment}
                empty="No equipment issued yet."
              />
            </Section>
          )}

          {tab === "reports" && (
            <>
              <Section title="Inventory Report">
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <StatCard label="Items tracked" value={items.length} />
                  <StatCard label="Items below minimum" value={lowStockItems.length} warn={lowStockItems.length > 0} />
                  <StatCard label="Pending stock-out" value={pendingStockOut.length} />
                  <StatCard label="Awaiting verification" value={pendingVerification.length} />
                </div>
              </Section>
              <Section title="Finance Report">
                {canAccess(account, "finance") ? (
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <StatCard label="Income (approved)" value={`MK ${totalIncome.toLocaleString()}`} />
                    <StatCard label="Expenses (approved)" value={`MK ${totalExpense.toLocaleString()}`} />
                    <StatCard label="Net position" value={`MK ${(totalIncome - totalExpense).toLocaleString()}`} warn={totalIncome - totalExpense < 0} />
                    <StatCard label="Internal transfers" value={`MK ${totalTransfers.toLocaleString()}`} sub="Not counted as income or expense" />
                    <StatCard label="Pending approval" value={pendingFinance} />
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "#6b6552", margin: 0 }}>Restricted — only Finance, CEO and Superadmin may view financial figures.</p>
                )}
              </Section>
              <Section title="Budget Report (2026)">
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <StatCard label="Annual budget" value={`MK ${seedBudget.reduce((s, b) => s + b.budget, 0).toLocaleString()}`} />
                  <StatCard label="Actual to date" value={`MK ${seedBudget.reduce((s, b) => s + b.actual, 0).toLocaleString()}`} />
                  <StatCard label="Line items over 90% used" value={seedBudget.filter((b) => b.pct >= 90).length} warn={seedBudget.filter((b) => b.pct >= 90).length > 0} />
                </div>
              </Section>
              <Section title="Staff Equipment Report">
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <StatCard label="Currently issued" value={equipmentOut} />
                  <StatCard label="Total ever issued" value={staffEquipment.length} />
                </div>
              </Section>
              <Section title="Players & Contracts Report">
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <StatCard label="Players (active)" value={totalPlayers} />
                  <StatCard label="Contracts expiring ≤ 3 months" value={contractExpiring.length} warn={contractExpiring.length > 0} />
                  {playersByTeam && seedTeams.map((t) => <StatCard key={t.code} label={t.name} value={playersByTeam[t.name] || 0} />)}
                </div>
              </Section>
              <Section title="Fleet & Compliance Report">
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <StatCard label="Vehicles (active)" value={activeVehicles.length} />
                  <StatCard label="COF expiring/expired" value={cofExpiring.length + cofExpired.length} warn={(cofExpiring.length + cofExpired.length) > 0} sub={`${cofExpired.length} already expired`} />
                  <StatCard label="Insurance expiring/expired" value={insuExpiring.length + insuExpired.length} warn={(insuExpiring.length + insuExpired.length) > 0} sub={`${insuExpired.length} already expired`} />
                  <StatCard label="Trips logged" value={trips.length} />
                  <StatCard label="Fuel refills logged" value={fuelLog.length} />
                </div>
              </Section>
              <Section title="Data Export (CSV)">
                <p style={{ fontSize: 13, color: "#6b6552", marginTop: 0 }}>
                  Download any dataset as a CSV file for backup or spreadsheet analysis — all with the current records, including edits you have made.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <PrimaryButton onClick={() => exportCsv("ekhaya-staff.csv", [
                    { key: "code", label: "Staff Code" }, { key: "name", label: "Name" },
                    { key: "dept", label: "Department" }, { key: "role", label: "Role" },
                    { key: "title", label: "Job Title" }, { key: "status", label: "Status" },
                    { key: "startDate", label: "Start Date" },
                  ], staff)}>Export Staff</PrimaryButton>
                  <PrimaryButton onClick={() => exportCsv("ekhaya-inventory.csv", [
                    { key: "code", label: "Item Code" }, { key: "name", label: "Name" }, { key: "category", label: "Category" },
                    { key: "quantity", label: "Qty" }, { key: "unit", label: "Unit" }, { key: "min", label: "Min" },
                    { key: "max", label: "Max" }, { key: "unitCost", label: "Unit Cost" }, { key: "location", label: "Location" },
                    { key: "condition", label: "Condition" },
                  ], items)}>Export Inventory</PrimaryButton>
                  <PrimaryButton onClick={() => exportCsv("ekhaya-stock-in.csv", [
                    { key: "code", label: "Ref" }, { key: "itemId", label: "Item ID" }, { key: "quantity", label: "Qty" },
                    { key: "supplier", label: "Supplier" }, { key: "invoiceNumber", label: "Invoice" },
                    { key: "dateReceived", label: "Date Received" }, { key: "receivedBy", label: "Received By" },
                    { key: "verifiedBy", label: "Verified By" }, { key: "status", label: "Status" },
                  ], stockIn)}>Export Stock In</PrimaryButton>
                  <PrimaryButton onClick={() => exportCsv("ekhaya-stock-out.csv", [
                    { key: "code", label: "Ref" }, { key: "itemId", label: "Item ID" }, { key: "quantity", label: "Qty" },
                    { key: "team", label: "Team / Dept" }, { key: "purpose", label: "Purpose / Recipient" },
                    { key: "dateRequested", label: "Date Requested" }, { key: "requestedBy", label: "Requested By" },
                    { key: "approvedBy", label: "Approved By" }, { key: "issuedBy", label: "Issued By" },
                    { key: "status", label: "Status" },
                  ], stockOut)}>Export Stock Out</PrimaryButton>
                  {canAccess(account, "finance") && <PrimaryButton onClick={() => exportCsv("ekhaya-finance.csv", [
                    { key: "code", label: "Ref" }, { key: "date", label: "Date" }, { key: "type", label: "Type" },
                    { key: "category", label: "Category" }, { key: "description", label: "Description" },
                    { key: "amount", label: "Amount (MK)" }, { key: "department", label: "Account" },
                    { key: "createdBy", label: "Created By" }, { key: "approvedBy", label: "Approved By" },
                    { key: "status", label: "Status" },
                  ], financeTx)}>Export Finance</PrimaryButton>}
                  <PrimaryButton onClick={() => exportCsv("ekhaya-budget.csv", [
                    { key: "activity", label: "Activity" }, { key: "item", label: "Item" },
                    { key: "budget", label: "Annual Budget (MK)" }, { key: "actual", label: "Actual (MK)" },
                    { key: "balance", label: "Balance (MK)" }, { key: "pct", label: "% Utilised" },
                  ], seedBudget)}>Export Budget</PrimaryButton>
                  <PrimaryButton onClick={() => exportCsv("ekhaya-equipment.csv", [
                    { key: "code", label: "Ref" }, { key: "staffCode", label: "Staff Code" },
                    { key: "itemCode", label: "Item Code" }, { key: "itemName", label: "Item" },
                    { key: "serial", label: "Serial No." }, { key: "dateIssued", label: "Date Issued" },
                    { key: "issuedBy", label: "Issued By" }, { key: "status", label: "Status" },
                    { key: "dateReturned", label: "Date Returned" }, { key: "receivedBy", label: "Received By" },
                  ], staffEquipment)}>Export Equipment</PrimaryButton>
                  <PrimaryButton onClick={() => exportCsv("ekhaya-audit.csv", [
                    { key: "at", label: "Timestamp" }, { key: "byName", label: "Staff" },
                    { key: "dept", label: "Dept" }, { key: "action", label: "Action" }, { key: "entityType", label: "Entity" },
                    { key: "entityCode", label: "Reference" }, { key: "details", label: "Details" },
                  ], auditLog)}>Export Audit Log</PrimaryButton>
                  <PrimaryButton onClick={() => exportCsv("ekhaya-players.csv", [
                    { key: "shirtNo", label: "Shirt #" }, { key: "name", label: "Name" },
                    { key: "dob", label: "DOB" }, { key: "team", label: "Team" },
                    { key: "position", label: "Position" }, { key: "contractStart", label: "Contract Start" },
                    { key: "contractEnd", label: "Contract End" }, { key: "status", label: "Status" },
                  ], players)}>Export Players</PrimaryButton>
                  <PrimaryButton onClick={() => exportCsv("ekhaya-fleet.csv", [
                    { key: "code", label: "Vehicle" }, { key: "regNo", label: "Registration" },
                    { key: "makeModel", label: "Make / Model" }, { key: "cofExpiry", label: "COF Expiry" },
                    { key: "insuranceExpiry", label: "Insurance Expiry" }, { key: "lastService", label: "Last Service" },
                    { key: "driverName", label: "Driver" }, { key: "notes", label: "Notes" },
                  ], vehicles)}>Export Fleet</PrimaryButton>
                </div>
              </Section>
              <p style={{ fontSize: 12, color: "#948d76" }}>All reports pull live from real records — players, fleet, inventory, finance and staff equipment. Use Export to save any dataset as CSV.</p>
            </>
          )}

          {tab === "notifications" && (
            <Section title="Notifications" action={
              notifications.length > 0 && <GhostButton onClick={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}>Mark all read</GhostButton>
            }>
              <Table
                columns={[
                  { key: "at", label: "When" },
                  { key: "severity", label: "Level", render: (r) => (
                    <Badge tone={r.severity === "high" ? "bad" : r.severity === "medium" ? "pending" : "muted"}>{r.severity === "high" ? "High" : r.severity === "medium" ? "Medium" : "Info"}</Badge>
                  ) },
                  { key: "title", label: "Title", render: (r) => <span style={{ fontWeight: r.read ? 400 : 700 }}>{r.title}</span> },
                  { key: "body", label: "Details" },
                  { key: "read", label: "Status", render: (r) => <Badge tone={r.read ? "muted" : "pending"}>{r.read ? "Read" : "Unread"}</Badge> },
                ]}
                rows={notifications}
                empty="No notifications yet — low-stock alerts, compliance expiries and approvals will appear here."
              />
            </Section>
          )}

          {tab === "audit" && (() => {
              const chain = verifyChain(auditLog);
              const auditReversed = [...auditLog].reverse();
              return (
                <Section title="Audit Log — tamper-evident chain">
                  <p style={{ fontSize: 12.5, color: "#6b6552", marginTop: 0 }}>
                    Chain status: {chain.valid ? <Badge tone="good">Valid ✓</Badge> : <Badge tone="bad">Broken at entry #{chain.brokenAt}</Badge>}
                    {" "} — {auditLog.length} entries, newest first.
                  </p>
                  <Table
                    columns={[
                      { key: "at", label: "Timestamp" },
                      { key: "byName", label: "Staff", render: (r) => (
                        <span>{r.byName}<br/><span style={{ fontSize: 11, color: "#948d76" }}>{r.acct || r.by}</span></span>
                      ) },
                      { key: "dept", label: "Dept" },
                      { key: "action", label: "Action" }, { key: "entityCode", label: "Reference" }, { key: "details", label: "Details" },
                    ]}
                    rows={auditReversed}
                    empty="No actions recorded yet."
                  />
                </Section>
              );
            })()}

          {tab === "superadmin" && (
            <>
              <Section title="User Accounts" action={
                <PrimaryButton onClick={() => setDrawer({ type: "account" })}><UserPlus size={14} style={{ verticalAlign: -2 }} /> Add Account</PrimaryButton>
              }>
                <p style={{ fontSize: 12.5, color: "#6b6552", marginTop: 0 }}>
                  Accounts link an email + password to a Staff record and a permission role. Access is restricted to Superadmin only. New accounts are issued a temporary password and must change it on first login.
                </p>
                <Table
                  columns={[
                    { key: "code", label: "Account" },
                    { key: "email", label: "Email" },
                    { key: "name", label: "Name" },
                    { key: "staffCode", label: "Linked Staff" },
                    { key: "role", label: "Role", render: (r) => <Badge tone="muted">{r.role}</Badge> },
                    { key: "active", label: "Active", render: (r) => <Badge tone={r.active ? "good" : "bad"}>{r.active ? "Active" : "Disabled"}</Badge> },
                    { key: "mustChangePassword", label: "Password", render: (r) => r.mustChangePassword ? <Badge tone="pending">Change required</Badge> : <Badge tone="good">Set</Badge> },
                    { key: "actions", label: "", render: (r) => (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <GhostButton onClick={() => setDrawer({ type: "account", editing: r })}><Pencil size={12} /> Edit</GhostButton>
                        <GhostButton onClick={() => {
                          const temp = prompt("New temporary password (min 8 chars):");
                          if (temp !== null && temp.length >= 8) {
                            const h = hashPassword(temp);
                            setAccounts((prev) => prev.map((a) => a.code === r.code ? { ...a, ...h, mustChangePassword: true, active: true } : a));
                            log("Reset Password", "account", r.code, `Temporary password issued for ${r.email} by ${actor.code}`);
                          } else if (temp !== null) alert("Password must be at least 8 characters.");
                        }}>Reset password</GhostButton>
                        {r.code !== account.code && (
                          <GhostButton tone={r.active ? "bad" : "good"} onClick={() => {
                            if (r.active && r.role === "SUPERADMIN" && accounts.filter((a) => a.role === "SUPERADMIN" && a.active).length <= 1) { alert("You cannot disable the last active Superadmin account."); return; }
                            setAccounts((prev) => prev.map((a) => a.code === r.code ? { ...a, active: !a.active } : a));
                            log(r.active ? "Disabled Account" : "Enabled Account", "account", r.code, `${r.email} ${r.active ? "disabled" : "enabled"} by ${actor.code}`);
                          }}>
                            {r.active ? "Disable" : "Enable"}
                          </GhostButton>
                        )}
                      </div>
                    ) },
                  ]}
                  rows={accounts}
                />
              </Section>

              <Section title="Backup & Restore (Full JSON)">
                <p style={{ fontSize: 12.5, color: "#6b6552", marginTop: 0 }}>
                  Export the entire system state to a single JSON file — all records, audit logs, and accounts (without revealing plain-text passwords). Import to restore; requires superadmin confirmation.
                  {lastBackupAt && <> Last backup: <strong>{new Date(lastBackupAt).toLocaleString()}</strong></>}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <PrimaryButton onClick={() => {
                    const backup = {
                      version: DATA_VERSION,
                      exportedAt: new Date().toISOString(),
                      data: {
                        accounts, staff, items, stockIn, stockOut, transfers, adjustments,
                        staffEquipment, financeTx, vehicles, auditLog, notifications,
                        counters, deptSeq,
                        players, hostelResidents, attendanceLog, incidents, foodSchedule,
                        trips, fuelLog, sponsors, risks, fixtures,
                      },
                    };
                    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    Object.assign(a, { href: url, download: `ekhaya-backup-${new Date().toISOString().slice(0, 10)}.json` });
                    a.click();
                    URL.revokeObjectURL(url);
                    setLastBackupAt(new Date().toISOString());
                  }}><Download size={14} style={{ verticalAlign: -2 }} /> Export full backup</PrimaryButton>
                  <GhostButton onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file"; input.accept = ".json";
                    input.onchange = (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        try {
                          const obj = JSON.parse(reader.result);
                          if (!obj || obj.version !== DATA_VERSION || !obj.data) { alert("Invalid backup file — wrong version or format."); return; }
                          if (!window.confirm(`Restore backup from ${obj.exportedAt || "unknown date"}? This overwrites ALL current data and cannot be undone.`)) return;
                          const d = obj.data;
                          if (d.accounts) setAccounts(d.accounts);
                          if (d.staff) setStaff(d.staff);
                          if (d.items) setItems(d.items);
                          if (d.stockIn) setStockIn(d.stockIn);
                          if (d.stockOut) setStockOut(d.stockOut);
                          if (d.transfers) setTransfers(d.transfers);
                          if (d.adjustments) setAdjustments(d.adjustments);
                          if (d.staffEquipment) setStaffEquipment(d.staffEquipment);
                          if (d.financeTx) setFinanceTx(d.financeTx);
                          if (d.vehicles) setVehicles(d.vehicles);
                          if (d.auditLog) setAuditLog(appendEntry(d.auditLog, {
                            at: new Date().toLocaleString(), by: actor.code, byName: actor.name,
                            action: "Imported Backup", entityType: "system", entityCode: "BACKUP",
                            details: `Restored ${obj.exportedAt || "backup"} by ${actor.code}`,
                            dept: account ? account.dept : "—", acct: account ? `${account.name} <${account.email}>` : actor.code,
                          }));
                          if (d.notifications) setNotifications(d.notifications);
                          if (d.counters) setCounters(d.counters);
                          if (d.deptSeq) setDeptSeq(d.deptSeq);
                          if (d.players) setPlayers(d.players);
                          if (d.hostelResidents) setHostelResidents(d.hostelResidents);
                          if (d.attendanceLog) setAttendanceLog(d.attendanceLog);
                          if (d.incidents) setIncidents(d.incidents);
                          if (d.foodSchedule) setFoodSchedule(d.foodSchedule);
                          if (d.trips) setTrips(d.trips);
                          if (d.fuelLog) setFuelLog(d.fuelLog);
                          if (d.sponsors) setSponsors(d.sponsors);
                          if (d.risks) setRisks(d.risks);
                          if (d.fixtures) setFixtures(d.fixtures);
                          if (persistTimer.current) clearTimeout(persistTimer.current);
                          alert("Backup restored. Applying and reloading…");
                          setTimeout(() => { if (flushRef.current) flushRef.current(); window.location.reload(); }, 60);
                        } catch (err) { alert("Failed to import backup: " + (err.message || err)); }
                      };
                      reader.readAsText(file);
                    };
                    input.click();
                  }}><Upload size={14} style={{ verticalAlign: -2 }} /> Import backup</GhostButton>
                </div>
              </Section>

              <Section title="Diagnostics & Error Log">
                <p style={{ fontSize: 12.5, color: "#6b6552", marginTop: 0 }}>
                  Client-side unhandled errors and promise rejections (last {appLog.length} entries, newest first). Useful for diagnosing deployment issues before a backend logging service is added.
                </p>
                <Table
                  columns={[
                    { key: "at", label: "When" },
                    { key: "level", label: "Level", render: (r) => <Badge tone={r.level === "error" ? "bad" : "pending"}>{r.level}</Badge> },
                    { key: "msg", label: "Message", render: (r) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{r.msg}</span> },
                  ]}
                  rows={appLog}
                  empty="No errors logged yet."
                />
              </Section>

              <Section title="Roles & Permissions">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {Object.keys(MODULE_PERMISSIONS).map((m) => (
                    <div key={m} style={{ flex: "1 1 280px", background: "#faf6ec", borderRadius: 8, padding: "12px 14px", border: `1px solid ${T.line}` }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{m}</div>
                      <div style={{ fontSize: 11.5, color: "#6b6552" }}>{(MODULE_PERMISSIONS[m] || ["ALL"]).join(", ")}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11.5, color: "#948d76" }}>
                  Department isolation: only Superadmin and CEO may view data across all departments. All other users are restricted to records within their own department (matching their account's Dept field). Module access is determined by the Role field above.
                </p>
              </Section>

              <Section title="Data Management">
                <p style={{ fontSize: 13, color: "#6b6552", marginTop: 0 }}>
                  Every change you make in this system is saved automatically to this browser's local storage. Use the button below to wipe the saved data and restore the original seed records (use the Reports tab first to export anything you want to keep).
                </p>
                <PrimaryButton
                  tone="bad"
                  onClick={() => {
                    if (window.confirm("Clear all saved data and restore the original seed records? This cannot be undone.")) {
                      if (persistTimer.current) clearTimeout(persistTimer.current);
                      clearPersisted();
                      window.location.reload();
                    }
                  }}
                >
                  <Trash2 size={14} style={{ verticalAlign: -2 }} /> Clear Saved Data &amp; Restore Seed
                </PrimaryButton>
              </Section>
            </>
          )}
        </div>
      </div>

      {/* Drawers */}
      {drawer?.type === "item" && <ItemDrawer editing={drawer.editing} onClose={() => setDrawer(null)} onCreate={createItem} onEdit={editItem} />}
      {drawer?.type === "stockin" && <StockInDrawer items={items} onClose={() => setDrawer(null)} onSubmit={createStockIn} />}
      {drawer?.type === "stockout" && <StockOutDrawer items={items} teams={seedTeams} onClose={() => setDrawer(null)} onSubmit={createStockOut} />}
      {drawer?.type === "transfer" && <TransferDrawer items={items} locations={seedLocations} onClose={() => setDrawer(null)} onSubmit={createTransfer} />}
      {drawer?.type === "adjustment" && <AdjustmentDrawer items={items} onClose={() => setDrawer(null)} onSubmit={createAdjustment} />}
      {drawer?.type === "staff" && <StaffDrawer editing={drawer.editing} departments={seedDepartments} roles={seedRoles} onClose={() => setDrawer(null)} onCreate={createStaff} onEdit={editStaff} />}
      {drawer?.type === "finance" && <FinanceDrawer departments={seedDepartments} onClose={() => setDrawer(null)} onSubmit={createFinanceTx} />}
      {drawer?.type === "equipment" && <EquipmentDrawer staff={staff} items={items} teams={seedTeams} onClose={() => setDrawer(null)} onSubmit={issueEquipment} />}
      {drawer?.type === "vehicle" && <VehicleDrawer editing={drawer.editing} onClose={() => setDrawer(null)} onCreate={createVehicle} onEdit={editVehicle} />}
      {drawer?.type === "account" && <AccountDrawer editing={drawer.editing} onClose={() => setDrawer(null)} staff={staff} accounts={accounts} setAccounts={setAccounts} log={log} />}
      {drawer?.type === "player" && <PlayerDrawer editing={drawer.editing} onClose={() => setDrawer(null)} setPlayers={setPlayers} account={account} players={players} />}
      {drawer?.type === "hostelResident" && <HostelResidentDrawer editing={drawer.editing} onClose={() => setDrawer(null)} residents={hostelResidents} setHostelResidents={setHostelResidents} />}
      {drawer?.type === "attendance" && <AttendanceDrawer date={drawer.date} residents={hostelResidents} onClose={() => setDrawer(null)} onSubmit={(rec) => { setAttendanceLog((prev) => [...prev, { id: (prev.length + 1), recordedBy: actor.code, ...rec }]); log("Recorded Attendance", "hostel_attendance", rec.date, `${rec.status} — ${rec.resident} by ${actor.code}`); setDrawer(null); }} />}
      {drawer?.type === "incident" && <IncidentDrawer residents={hostelResidents} onClose={() => setDrawer(null)} onSubmit={(rec) => { setIncidents((prev) => [...prev, { id: (prev.length + 1), ...rec }]); log("Logged Incident", "hostel_incident", rec.resident, `${rec.severity}: ${rec.description}`); setDrawer(null); }} />}
      {drawer?.type === "trip" && <TripDrawer vehicles={vehicles} onClose={() => setDrawer(null)} onSubmit={(rec) => { setTrips((prev) => [...prev, { id: (prev.length + 1), ...rec }]); log("Logged Trip", "trip", rec.destination, `${rec.vehicle} — ${rec.date}`); setDrawer(null); }} />}
      {drawer?.type === "fuel" && <FuelDrawer vehicles={vehicles} onClose={() => setDrawer(null)} onSubmit={(rec) => { setFuelLog((prev) => [...prev, { id: (prev.length + 1), ...rec }]); log("Fuel logged", "fuel", rec.vehicle, `MK ${rec.cost}`); setDrawer(null); }} />}
      {drawer?.type === "sponsor" && <SponsorDrawer editing={drawer.editing} onClose={() => setDrawer(null)} onSubmit={(f) => {
        if (drawer.editing) { setSponsors((prev) => prev.map((s) => s.id === drawer.editing.id ? { ...s, ...f } : s)); log("Updated Sponsor", "sponsor", f.name, "Updated"); }
        else { setSponsors((prev) => [...prev, { id: Math.max(0, ...prev.map((s) => s.id)) + 1, ...f }]); log("Added Sponsor", "sponsor", f.name, `New: ${f.category}`); }
        setDrawer(null);
      }} />}
      {drawer?.type === "risk" && <RiskDrawer editing={drawer.editing} onClose={() => setDrawer(null)} onSubmit={(f) => {
        if (drawer.editing) { setRisks((prev) => prev.map((r) => r.id === drawer.editing.id ? { ...r, ...f } : r)); log("Updated Risk", "risk", f.code, f.title); }
        else { const code = `RSK-${String(risks.length + 1).padStart(3, "0")}`; setRisks((prev) => [...prev, { id: Math.max(0, ...prev.map((r) => r.id)) + 1, code, ...f, createdAt: todayISO() }]); log("Added Risk", "risk", code, f.title); }
        setDrawer(null);
      }} />}
      {drawer?.type === "fixture" && <FixtureDrawer editing={drawer.editing} onClose={() => setDrawer(null)} onSubmit={(f) => {
        if (drawer.editing) { setFixtures((prev) => prev.map((x) => x.id === drawer.editing.id ? { ...x, ...f } : x)); log("Updated Fixture", "fixture", `${f.date} vs ${f.opponent}`, f.result || "Upcoming"); }
        else { setFixtures((prev) => [...prev, { id: Math.max(0, ...prev.map((x) => x.id)) + 1, ...f }]); log("Added Fixture", "fixture", `${f.date} vs ${f.opponent}`, "Scheduled"); }
        setDrawer(null);
      }} />}
      </div>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------
// Drawer forms
// ---------------------------------------------------------------
function ItemDrawer({ editing, onClose, onCreate, onEdit }) {
  const [f, setF] = useState(editing || { code: "", name: "", category: "", unit: "pcs", quantity: 0, min: 0, max: 0, unitCost: 0, location: "Senior Team Store", condition: "Good" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title={editing ? `Edit Item — ${editing.code}` : "Add Inventory Item"} onClose={onClose}>
      <Field label="Item Code"><input style={inputStyle} value={f.code} onChange={set("code")} placeholder="EKH-XXX-001" /></Field>
      <Field label="Item Name"><input style={inputStyle} value={f.name} onChange={set("name")} /></Field>
      <Field label="Category"><input style={inputStyle} value={f.category} onChange={set("category")} placeholder="Sports Equipment" /></Field>
      <Field label="Unit"><input style={inputStyle} value={f.unit} onChange={set("unit")} placeholder="pcs / sets / kits" /></Field>
      <Field label="Quantity"><input type="number" style={inputStyle} value={f.quantity} onChange={set("quantity")} /></Field>
      <Field label="Minimum Stock Level"><input type="number" style={inputStyle} value={f.min} onChange={set("min")} /></Field>
      <Field label="Maximum Stock Level"><input type="number" style={inputStyle} value={f.max} onChange={set("max")} /></Field>
      <Field label="Unit Cost (MK)"><input type="number" style={inputStyle} value={f.unitCost} onChange={set("unitCost")} /></Field>
      <Field label="Location"><input style={inputStyle} value={f.location} onChange={set("location")} /></Field>
      <Field label="Condition"><input style={inputStyle} value={f.condition} onChange={set("condition")} /></Field>
      <PrimaryButton onClick={() => editing ? onEdit(editing.id, f) : onCreate(f)} disabled={!f.code || !f.name}>
        {editing ? "Save Changes" : "Save Item"}
      </PrimaryButton>
    </Drawer>
  );
}

function StockInDrawer({ items, onClose, onSubmit }) {
  const [f, setF] = useState({ itemId: items[0]?.id, quantity: 1, supplier: "", invoiceNumber: "", unitCost: 0, dateReceived: new Date().toISOString().slice(0, 10), condition: "Good", notes: "" });
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title="Record Stock In" onClose={onClose}>
      <Field label="Item">
        <select style={inputStyle} value={f.itemId} onChange={set("itemId")}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
        </select>
      </Field>
      <Field label="Quantity Received"><input type="number" style={inputStyle} value={f.quantity} onChange={set("quantity")} /></Field>
      <Field label="Supplier"><input style={inputStyle} value={f.supplier} onChange={set("supplier")} /></Field>
      <Field label="Invoice Number"><input style={inputStyle} value={f.invoiceNumber} onChange={set("invoiceNumber")} /></Field>
      <Field label="Unit Cost (MK)"><input type="number" style={inputStyle} value={f.unitCost} onChange={set("unitCost")} /></Field>
      <Field label="Date Received"><input type="date" style={inputStyle} value={f.dateReceived} onChange={set("dateReceived")} /></Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={f.notes} onChange={set("notes")} /></Field>
      <Field label="Attachments"><AttachInput files={files} setFiles={setFiles} /></Field>
      <p style={{ fontSize: 12, color: "#948d76", marginBottom: 12 }}>A different staff member must verify this before stock updates.</p>
      <PrimaryButton onClick={() => onSubmit({ ...f, attachments: files })}>Save Stock In</PrimaryButton>
    </Drawer>
  );
}

function StockOutDrawer({ items, teams, onClose, onSubmit }) {
  const [team, setTeam] = useState(teams[0]?.name || "");
  const teamLocation = teams.find((t) => t.name === team)?.location;
  const eligibleItems = items.filter((i) => i.location === teamLocation);
  const itemList = eligibleItems.length ? eligibleItems : items;
  const [f, setF] = useState({ itemId: itemList[0]?.id, quantity: 1, purpose: "", notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title="New Stock Out Request" onClose={onClose}>
      <Field label="Team">
        <select style={inputStyle} value={team} onChange={(e) => { setTeam(e.target.value); setF((prev) => ({ ...prev, itemId: undefined })); }}>
          {teams.map((t) => <option key={t.code} value={t.name}>{t.name}</option>)}
        </select>
      </Field>
      <p style={{ fontSize: 12, color: "#948d76", marginTop: -6, marginBottom: 10 }}>
        Item list below is filtered to <strong>{teamLocation}</strong> — the store {team} actually draws from{eligibleItems.length === 0 ? " (no items currently held there, showing all items instead)" : ""}.
      </p>
      <Field label="Item">
        <select style={inputStyle} value={f.itemId ?? itemList[0]?.id} onChange={set("itemId")}>
          {itemList.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name} ({i.quantity} on hand)</option>)}
        </select>
      </Field>
      <Field label="Quantity Requested"><input type="number" style={inputStyle} value={f.quantity} onChange={set("quantity")} /></Field>
      <Field label="Purpose"><input style={inputStyle} value={f.purpose} onChange={set("purpose")} placeholder="Match day kit" /></Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={f.notes} onChange={set("notes")} /></Field>
      <PrimaryButton onClick={() => onSubmit({ ...f, itemId: f.itemId ?? itemList[0]?.id, team })}>Submit Request</PrimaryButton>
    </Drawer>
  );
}

function TransferDrawer({ items, locations, onClose, onSubmit }) {
  const [f, setF] = useState({ itemId: items[0]?.id, quantity: 1, from: locations[0]?.name, to: locations[1]?.name, notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title="New Stock Transfer" onClose={onClose}>
      <Field label="Item">
        <select style={inputStyle} value={f.itemId} onChange={set("itemId")}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name} (currently: {i.location})</option>)}
        </select>
      </Field>
      <Field label="Quantity"><input type="number" style={inputStyle} value={f.quantity} onChange={set("quantity")} /></Field>
      <Field label="From">
        <select style={inputStyle} value={f.from} onChange={set("from")}>
          {locations.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
        </select>
      </Field>
      <Field label="To">
        <select style={inputStyle} value={f.to} onChange={set("to")}>
          {locations.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
        </select>
      </Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={f.notes} onChange={set("notes")} /></Field>
      <PrimaryButton onClick={() => {
        if (!positiveInteger(Number(f.quantity))) { alert("Quantity must be a positive whole number."); return; }
        if (!f.from || !f.to || f.from === f.to) { alert("Choose two different locations for the transfer."); return; }
        onSubmit(f);
      }} disabled={!f.itemId}>Submit Transfer</PrimaryButton>
    </Drawer>
  );
}

function AdjustmentDrawer({ items, onClose, onSubmit }) {
  const [f, setF] = useState({ itemId: items[0]?.id, change: -1, reason: "Damage", notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title="New Stock Adjustment" onClose={onClose}>
      <Field label="Item">
        <select style={inputStyle} value={f.itemId} onChange={set("itemId")}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name} ({i.quantity} on hand)</option>)}
        </select>
      </Field>
      <Field label="Quantity Change (negative for loss/damage)"><input type="number" style={inputStyle} value={f.change} onChange={set("change")} /></Field>
      <Field label="Reason">
        <select style={inputStyle} value={f.reason} onChange={set("reason")}>
          <option>Damage</option><option>Loss</option><option>Count Correction</option><option>Expired</option>
        </select>
      </Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={f.notes} onChange={set("notes")} /></Field>
      <PrimaryButton onClick={() => {
        const ch = Number(f.change);
        if (!Number.isFinite(ch) || ch === 0) { alert("Quantity change must be a non-zero number — use a positive value to add stock or negative for loss/damage."); return; }
        if (!f.reason) { alert("A reason is required."); return; }
        onSubmit(f);
      }} disabled={!f.itemId}>Submit Adjustment</PrimaryButton>
    </Drawer>
  );
}

function StaffDrawer({ editing, departments, roles, onClose, onCreate, onEdit }) {
  const [f, setF] = useState(editing || { name: "", dept: departments[0]?.code, title: "", role: roles[0], startDate: new Date().toISOString().slice(0, 10) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title={editing ? `Edit Staff — ${editing.code}` : "Add Staff Record"} onClose={onClose}>
      <Field label="Full Name"><input style={inputStyle} value={f.name} onChange={set("name")} /></Field>
      <Field label="Department">
        <select style={inputStyle} value={f.dept} onChange={set("dept")}>
          {departments.map((d) => <option key={d.code} value={d.code}>{d.name} ({d.code})</option>)}
        </select>
      </Field>
      <Field label="Job Title"><input style={inputStyle} value={f.title} onChange={set("title")} /></Field>
      <Field label="Role">
        <select style={inputStyle} value={f.role} onChange={set("role")}>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Start Date"><input type="date" style={inputStyle} value={f.startDate} onChange={set("startDate")} /></Field>
      {!editing && <p style={{ fontSize: 12, color: "#948d76", marginBottom: 12 }}>Staff Code is generated automatically from department + sequence.</p>}
      <PrimaryButton onClick={() => editing ? onEdit(editing.code, f) : onCreate(f)} disabled={!f.name || !f.title}>
        {editing ? "Save Changes" : "Save Staff Record"}
      </PrimaryButton>
    </Drawer>
  );
}

function FinanceDrawer({ departments, onClose, onSubmit }) {
  const [f, setF] = useState({ type: "Income", category: incomeCategories[0], amount: 0, date: new Date().toISOString().slice(0, 10), description: "", department: departments[0]?.name });
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cats = f.type === "Income" ? incomeCategories : expenseCategories;
  return (
    <Drawer title="New Finance Transaction" onClose={onClose}>
      <Field label="Type">
        <select style={inputStyle} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, category: e.target.value === "Income" ? incomeCategories[0] : expenseCategories[0] })}>
          <option>Income</option><option>Expense</option>
        </select>
      </Field>
      <Field label="Category">
        <select style={inputStyle} value={f.category} onChange={set("category")}>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Amount (MK)"><input type="number" style={inputStyle} value={f.amount} onChange={set("amount")} /></Field>
      <Field label="Date"><input type="date" style={inputStyle} value={f.date} onChange={set("date")} /></Field>
      <Field label="Description"><input style={inputStyle} value={f.description} onChange={set("description")} /></Field>
      <Field label="Department">
        <select style={inputStyle} value={f.department} onChange={set("department")}>
          {departments.map((d) => <option key={d.code} value={d.name}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Attachments (Invoice / POP / Receipt)"><AttachInput files={files} setFiles={setFiles} /></Field>
      <p style={{ fontSize: 12, color: "#948d76", marginBottom: 12 }}>A different staff member must approve this transaction.</p>
      <PrimaryButton onClick={() => onSubmit({ ...f, attachments: files })}>Save Transaction</PrimaryButton>
    </Drawer>
  );
}

function EquipmentDrawer({ staff, items, teams, onClose, onSubmit }) {
  const [staffCode, setStaffCode] = useState(staff[0]?.code);
  const selectedStaff = staff.find((s) => s.code === staffCode);
  const staffTeam = teams.find((t) => t.dept === selectedStaff?.dept);
  const eligibleItems = staffTeam ? items.filter((i) => i.location === staffTeam.location) : items;
  const itemList = eligibleItems.length ? eligibleItems : items;
  const [f, setF] = useState({ itemId: itemList[0]?.id, serial: "", condition: "New", notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title="Issue Equipment to Staff" onClose={onClose}>
      <Field label="Staff Member">
        <select style={inputStyle} value={staffCode} onChange={(e) => { setStaffCode(e.target.value); setF((prev) => ({ ...prev, itemId: undefined })); }}>
          {staff.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
        </select>
      </Field>
      {staffTeam && (
        <p style={{ fontSize: 12, color: "#948d76", marginTop: -6, marginBottom: 10 }}>
          {selectedStaff.name} is on {staffTeam.name} — item list filtered to <strong>{staffTeam.location}</strong>{eligibleItems.length === 0 ? " (nothing currently held there, showing all items instead)" : ""}.
        </p>
      )}
      <Field label="Item (from Inventory)">
        <select style={inputStyle} value={f.itemId ?? itemList[0]?.id} onChange={set("itemId")}>
          {itemList.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name} ({i.quantity} on hand)</option>)}
        </select>
      </Field>
      <p style={{ fontSize: 12, color: "#948d76", marginTop: -6, marginBottom: 12 }}>Issuing this deducts 1 from the item's Inventory quantity; returning it later adds 1 back.</p>
      <Field label="Serial Number"><input style={inputStyle} value={f.serial} onChange={set("serial")} /></Field>
      <Field label="Condition">
        <select style={inputStyle} value={f.condition} onChange={set("condition")}>
          <option>New</option><option>Good</option><option>Fair</option>
        </select>
      </Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={f.notes} onChange={set("notes")} /></Field>
      <PrimaryButton onClick={() => onSubmit({ ...f, itemId: f.itemId ?? itemList[0]?.id, staffCode })} disabled={!(f.itemId ?? itemList[0]?.id)}>Issue Equipment</PrimaryButton>
    </Drawer>
  );
}

function VehicleDrawer({ editing, onClose, onCreate, onEdit }) {
  const [f, setF] = useState(editing || { code: "", makeModel: "", regNo: "", driverName: "", driverPhone: "", driverLicense: "", cofExpiry: "", insuranceExpiry: "", lastService: "", notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title={editing ? `Edit Vehicle — ${editing.code}` : "Add Vehicle"} onClose={onClose}>
      <Field label="Vehicle Code"><input style={inputStyle} value={f.code} onChange={set("code")} placeholder="EKH-VEH-001" /></Field>
      <Field label="Make / Model"><input style={inputStyle} value={f.makeModel} onChange={set("makeModel")} placeholder="Toyota Hiace" /></Field>
      <Field label="Registration Number"><input style={inputStyle} value={f.regNo} onChange={set("regNo")} placeholder="MZ 1234" /></Field>
      <Field label="COF Expiry Date"><input type="date" style={inputStyle} value={f.cofExpiry || ""} onChange={set("cofExpiry")} /></Field>
      <Field label="Insurance Expiry Date"><input type="date" style={inputStyle} value={f.insuranceExpiry || ""} onChange={set("insuranceExpiry")} /></Field>
      <Field label="Last Service Date"><input type="date" style={inputStyle} value={f.lastService || ""} onChange={set("lastService")} /></Field>
      <Field label="Driver Name"><input style={inputStyle} value={f.driverName} onChange={set("driverName")} /></Field>
      <Field label="Driver Phone"><input style={inputStyle} value={f.driverPhone} onChange={set("driverPhone")} /></Field>
      <Field label="Driver License Number"><input style={inputStyle} value={f.driverLicense} onChange={set("driverLicense")} /></Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={f.notes} onChange={set("notes")} /></Field>
      <PrimaryButton onClick={() => {
        if (!required(f.code)) { alert("Vehicle code is required."); return; }
        if (!required(f.makeModel)) { alert("Make / model is required."); return; }
        if (!required(f.regNo)) { alert("Registration number is required."); return; }
        if (f.cofExpiry && !isValidDate(f.cofExpiry)) { alert("Enter a valid COF expiry date."); return; }
        if (f.insuranceExpiry && !isValidDate(f.insuranceExpiry)) { alert("Enter a valid insurance expiry date."); return; }
        if (f.lastService && !isValidDate(f.lastService)) { alert("Enter a valid last-service date."); return; }
        editing ? onEdit(editing.id, f) : onCreate(f);
      }}>Save Vehicle</PrimaryButton>
    </Drawer>
  );
}

function AccountDrawer({ editing, onClose, staff: staffList, accounts, setAccounts, log }) {
  const [f, setF] = useState(editing || { email: "", name: "", staffCode: staffList[0]?.code || "", role: "STAFF", dept: "ADM", password: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [error, setError] = useState("");
  return (
    <Drawer title={editing ? `Edit Account — ${editing.code}` : "Add User Account"} onClose={onClose}>
      <Field label="Email"><input style={inputStyle} type="email" value={f.email} onChange={set("email")} placeholder="user@ekhayafc.com" /></Field>
      <Field label="Full Name"><input style={inputStyle} value={f.name} onChange={set("name")} /></Field>
      <Field label="Link to Staff Record">
        <select style={inputStyle} value={f.staffCode} onChange={(e) => {
          const sc = e.target.value;
          const s = staffList.find((x) => x.code === sc);
          setF({ ...f, staffCode: sc, name: f.name || (s ? s.name : ""), dept: s ? s.dept : f.dept });
        }}>
          {staffList.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name} ({s.dept})</option>)}
        </select>
      </Field>
      <Field label="Permission Role">
        <select style={inputStyle} value={f.role} onChange={set("role")}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Department">
        <select style={inputStyle} value={f.dept} onChange={set("dept")}>
          {seedDepartments.map((d) => <option key={d.code} value={d.code}>{d.name} ({d.code})</option>)}
        </select>
      </Field>
      {!editing && <Field label="Initial Password (min 8 chars)"><input type="password" style={inputStyle} value={f.password} onChange={set("password")} placeholder="Temporary password (min 8 chars)" /></Field>}
      {error && <p style={{ color: T.bad, fontSize: 12.5 }}>{error}</p>}
      <PrimaryButton onClick={() => {
        setError("");
        if (!f.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) { setError("Enter a valid email."); return; }
        if (!f.name || !f.name.trim()) { setError("Name is required."); return; }
        if (!f.staffCode) { setError("Link a staff record."); return; }
        if (!editing && (!f.password || f.password.length < 8)) { setError("Password must be at least 8 characters."); return; }
        if (!editing && accounts.some((a) => a.email.toLowerCase() === f.email.toLowerCase())) { setError("An account with this email already exists."); return; }
        if (editing) {
          if (accounts.some((a) => a.code !== editing.code && a.email.toLowerCase() === f.email.toLowerCase())) { setError("An account with this email already exists."); return; }
          const cur = accounts.find((a) => a.code === editing.code);
          const isLastActiveSuper = cur && cur.role === "SUPERADMIN" && cur.active && accounts.filter((a) => a.role === "SUPERADMIN" && a.active).length <= 1;
          if (isLastActiveSuper && (f.role !== "SUPERADMIN" || !f.active)) { setError("You cannot demote or disable the last active Superadmin account."); return; }
          setAccounts((prev) => prev.map((a) => a.code === editing.code ? { ...a, ...f, mustChangePassword: false } : a));
          if (log) log("Edited Account", "account", editing.code, `${editing.email} updated by ${f.name}`);
        } else {
          const h = hashPassword(f.password);
          const code = `ACC-${String(accounts.length + 1).padStart(3, "0")}`;
          setAccounts((prev) => [...prev, { ...f, code, active: true, mustChangePassword: true, ...h }]);
          if (log) log("Created Account", "account", code, `${f.email} created for ${f.name} (${f.role}/${f.dept})`);
        }
        onClose();
      }}>{editing ? "Save Changes" : "Create Account"}</PrimaryButton>
    </Drawer>
  );
}

function GoogleSignInButton({ onToken }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !window.google || !window.google.accounts || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        ux_mode: "popup",
        callback: (resp) => { if (resp && resp.credential) onToken(resp.credential); },
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline", size: "large", width: 320, text: "continue_with", shape: "rectangular",
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} style={{ display: "flex", justifyContent: "center" }} />;
}

function GoogleSignInUnconfigured() {
  return (
    <button
      onClick={() => alert(GOOGLE_CLIENT_ID
        ? "Google sign-in is not responding. Check your internet connection and try again."
        : "Google sign-in needs a Google Client ID before it can work.\n\nAsk your developer to add the Web client ID (from Google Cloud Console → Credentials) as GOOGLE_CLIENT_ID at the top of src/App.jsx, then reload.")}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        width: "100%", padding: "10px 14px", border: `1px solid ${T.line}`, borderRadius: 8,
        background: "#fff", fontSize: 13.5, fontWeight: 600, color: "#15140f",
        cursor: "pointer", fontFamily: "Inter, sans-serif",
      }}
    >
      <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Continue with Google
    </button>
  );
}

function ForcedPasswordScreen({ account, onSubmit, onLogout }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "linear-gradient(rgba(21,20,15,0.78), rgba(21,20,15,0.88)), url('/ekhaya-logo.jpg') center/cover no-repeat, #15140f", backgroundAttachment: "fixed", minHeight: "100vh", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{fontImport}</style>
      <div style={{ width: 380, maxWidth: "100%", background: "rgba(255,251,240,0.96)", borderRadius: 16, padding: 34, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", border: "1px solid rgba(232,207,143,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, color: T.ink, fontWeight: 700, letterSpacing: 0.5 }}>Password change required</div>
          <div style={{ fontSize: 12.5, color: "#6b6552", marginTop: 6 }}>{account.name} — <strong>{account.email}</strong></div>
          <p style={{ fontSize: 12.5, color: "#6b6552", margin: "10px 0 0" }}>Your account is using a temporary password. Set a new one before continuing.</p>
        </div>
        {error && <p style={{ fontSize: 12.5, color: T.bad, marginBottom: 12 }}>{error}</p>}
        <Field label="Current (temporary) password">
          <input type="password" style={{ ...inputStyle, background: "#fff" }} value={cur} onChange={(e) => setCur(e.target.value)} autoFocus />
        </Field>
        <Field label="New password (min 8 characters)">
          <input type="password" style={{ ...inputStyle, background: "#fff" }} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <input type="password" style={{ ...inputStyle, background: "#fff" }} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <PrimaryButton tone="gold" onClick={() => {
          setError("");
          if (!cur) { setError("Enter your current password."); return; }
          if ((next || "").length < 8) { setError("New password must be at least 8 characters."); return; }
          if (next !== confirm) { setError("New password and confirmation do not match."); return; }
          onSubmit(cur, next);
        }}>
          Set New Password
        </PrimaryButton>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "#6b6552", fontSize: 12, cursor: "pointer", fontFamily: "Inter, sans-serif", textDecoration: "underline" }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

function PlayerDrawer({ editing, onClose, setPlayers, account, players }) {
  const canSeeSalary = canSeeSalaries(account);
  const [f, setF] = useState(editing || { shirtNo: "", name: "", dob: "", mpiraId: "", jerseyName: "", position: "Forward", team: seedTeams[0]?.name || "", contractStart: "", contractEnd: "", salary: 0, status: "Active" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title={editing ? `Edit Player — ${editing.name}` : "Register Player"} onClose={onClose}>
      <Field label="Shirt Number"><input type="number" style={inputStyle} value={f.shirtNo} onChange={set("shirtNo")} /></Field>
      <Field label="Full Name"><input style={inputStyle} value={f.name} onChange={set("name")} /></Field>
      <Field label="Date of Birth"><input type="date" style={inputStyle} value={f.dob} onChange={set("dob")} /></Field>
      <Field label="Mpira ID"><input style={inputStyle} value={f.mpiraId} onChange={set("mpiraId")} placeholder="Optional" /></Field>
      <Field label="Jersey Name (printed)"><input style={inputStyle} value={f.jerseyName} onChange={set("jerseyName")} placeholder="e.g. KAYAMBA" /></Field>
      <Field label="Position">
        <select style={inputStyle} value={f.position} onChange={set("position")}>
          <option>Goalkeeper</option><option>Defender</option><option>Midfielder</option><option>Forward</option><option>Utility</option>
        </select>
      </Field>
      <Field label="Team">
        <select style={inputStyle} value={f.team} onChange={set("team")}>
          {seedTeams.map((t) => <option key={t.code} value={t.name}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Contract Start"><input type="date" style={inputStyle} value={f.contractStart} onChange={set("contractStart")} /></Field>
      <Field label="Contract End"><input type="date" style={inputStyle} value={f.contractEnd} onChange={set("contractEnd")} /></Field>
      {canSeeSalary ? (
        <Field label="Monthly Salary (MK)"><input type="number" style={inputStyle} value={f.salary} onChange={set("salary")} placeholder="Visible only to Finance / Superadmin" /></Field>
      ) : (
        <p style={{ fontSize: 12, color: "#948d76", marginBottom: 12 }}>Salary is private — visible only to Finance & Superadmin.</p>
      )}
      {error && <p style={{ color: T.bad, fontSize: 12.5, marginTop: -6 }}>{error}</p>}
      <PrimaryButton onClick={() => {
        setError("");
        if (!f.name || !f.shirtNo) { setError("Name and shirt number are required."); return; }
        if (!positiveInteger(Number(f.shirtNo))) { setError("Shirt number must be a positive whole number."); return; }
        const dup = players.find((p) => p.name.toLowerCase() === String(f.name).toLowerCase() && (!editing || p.id !== editing.id));
        if (dup) { setError(`A player named "${f.name}" is already registered.`); return; }
        if (canSeeSalary && (!Number.isFinite(Number(f.salary)) || Number(f.salary) < 0)) { setError("Salary must be a valid non-negative number."); return; }
        if (editing) { setPlayers((prev) => prev.map((p) => p.id === editing.id ? { ...p, ...f, salary: canSeeSalary ? Number(f.salary) || 0 : p.salary } : p)); }
        else { setPlayers((prev) => [...prev, { id: Math.max(0, ...prev.map((p) => p.id)) + 1, ...f, salary: canSeeSalary ? Number(f.salary) || 0 : 0 }]); }
        onClose();
      }} disabled={!f.name || !f.shirtNo}>{editing ? "Save Changes" : "Register Player"}</PrimaryButton>
    </Drawer>
  );
}

function HostelResidentDrawer({ editing, onClose, residents, setHostelResidents }) {
  const [f, setF] = useState(editing || { name: "", houseCode: seedHostels[0]?.code || "", room: "", team: seedTeams[0]?.name || "", joined: todayISO(), status: "Active" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title={editing ? `Edit Resident — ${editing.name}` : "Add Hostel Resident"} onClose={onClose}>
      <Field label="Full Name"><input style={inputStyle} value={f.name} onChange={set("name")} /></Field>
      <Field label="House">
        <select style={inputStyle} value={f.houseCode} onChange={set("houseCode")}>
          {seedHostels.map((h) => <option key={h.code} value={h.code}>{h.name}</option>)}
        </select>
      </Field>
      <Field label="Room"><input style={inputStyle} value={f.room} onChange={set("room")} placeholder="e.g. Rm 3A" /></Field>
      <Field label="Team">
        <select style={inputStyle} value={f.team} onChange={set("team")}>
          {seedTeams.map((t) => <option key={t.code} value={t.name}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Joined"><input type="date" style={inputStyle} value={f.joined} onChange={set("joined")} /></Field>
      <Field label="Status">
        <select style={inputStyle} value={f.status} onChange={set("status")}>
          <option>Active</option><option>Graduated</option><option>Left</option><option>On Leave</option>
        </select>
      </Field>
      <PrimaryButton onClick={() => {
        if (!f.name) { alert("Name is required."); return; }
        const cap = f.houseCode === "HSE-001" ? 13 : 6;
        const occupied = residents.filter((r) => r.houseCode === f.houseCode && r.status === "Active").length;
        const editingSame = editing && editing.houseCode === f.houseCode && editing.status === "Active";
        if (!editingSame && occupied >= cap) { alert(`This house is full (${cap} beds). Choose another house or free a bed first.`); return; }
        if (editing) { setHostelResidents((prev) => prev.map((r) => r.id === editing.id ? { ...r, ...f } : r)); }
        else { setHostelResidents((prev) => [...prev, { id: Math.max(0, ...prev.map((r) => r.id)) + 1, ...f }]); }
        onClose();
      }} disabled={!f.name}>{editing ? "Save Changes" : "Add Resident"}</PrimaryButton>
    </Drawer>
  );
}

function AttendanceDrawer({ date, residents, onClose, onSubmit }) {
  const active = residents.filter((r) => r.status === "Active");
  const [entries, setEntries] = useState(active.map((r) => ({ resident: r.name, house: r.houseCode, status: "Present", notes: "" })));
  const updateEntry = (idx, field, value) => setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  return (
    <Drawer title={`Attendance — ${date}`} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "#6b6552", marginTop: 0 }}>Log status for each active resident on <strong>{date}</strong>.</p>
      {entries.map((e, idx) => (
        <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <span style={{ flex: 1, fontSize: 13 }}>{e.resident}</span>
          <select style={{ ...inputStyle, width: 110 }} value={e.status} onChange={(ev) => updateEntry(idx, "status", ev.target.value)}>
            <option>Present</option><option>Late</option><option>Absent</option><option>Authorized</option>
          </select>
          <input style={{ ...inputStyle, width: 100 }} value={e.notes} placeholder="Notes" onChange={(ev) => updateEntry(idx, "notes", ev.target.value)} />
        </div>
      ))}
      <PrimaryButton onClick={() => entries.forEach((e) => onSubmit({ date, ...e }))}>Save attendance</PrimaryButton>
    </Drawer>
  );
}

function IncidentDrawer({ residents, onClose, onSubmit }) {
  const active = residents.filter((r) => r.status === "Active");
  const [f, setF] = useState({ resident: active[0]?.name || "", severity: "Low", description: "", followUp: "", reportedBy: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title="Log Behavior Incident" onClose={onClose}>
      <Field label="Resident">
        <select style={inputStyle} value={f.resident} onChange={set("resident")}>
          {active.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
        </select>
      </Field>
      <Field label="Severity">
        <select style={inputStyle} value={f.severity} onChange={set("severity")}>
          <option>Low</option><option>Medium</option><option>High</option><option>Incident</option>
        </select>
      </Field>
      <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 60 }} value={f.description} onChange={set("description")} placeholder="What happened" /></Field>
      <Field label="Follow-up Action"><textarea style={{ ...inputStyle, minHeight: 40 }} value={f.followUp} onChange={set("followUp")} placeholder="Counseling, warning, etc." /></Field>
      <Field label="Reported By"><input style={inputStyle} value={f.reportedBy} onChange={set("reportedBy")} placeholder="House parent name" /></Field>
      <PrimaryButton onClick={() => { onSubmit({ ...f, date: todayISO() }); }} disabled={!f.description || !f.resident}>Save Incident</PrimaryButton>
    </Drawer>
  );
}

function TripDrawer({ vehicles, onClose, onSubmit }) {
  const vList = vehicles.filter((v) => v.status === "Active");
  const [f, setF] = useState({ vehicle: vList[0]?.code || "", destination: "", purpose: "", date: todayISO(), passengers: 1, mileageStart: 0, mileageEnd: 0, driver: vList[0]?.driverName || "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title="Log Trip" onClose={onClose}>
      <Field label="Vehicle">
        <select style={inputStyle} value={f.vehicle} onChange={(e) => { const v = vehicles.find((x) => x.code === e.target.value); setF({ ...f, vehicle: e.target.value, driver: v?.driverName || f.driver }); }}>
          {vList.map((v) => <option key={v.id} value={v.code}>{v.code} — {v.regNo} ({v.makeModel})</option>)}
        </select>
      </Field>
      <Field label="Date"><input type="date" style={inputStyle} value={f.date} onChange={set("date")} /></Field>
      <Field label="Destination"><input style={inputStyle} value={f.destination} onChange={set("destination")} placeholder="e.g. Lilongwe City Stadium" /></Field>
      <Field label="Purpose"><input style={inputStyle} value={f.purpose} onChange={set("purpose")} placeholder="League match away" /></Field>
      <Field label="Passengers"><input type="number" style={inputStyle} value={f.passengers} onChange={set("passengers")} /></Field>
      <Field label="Odometer Start (km)"><input type="number" style={inputStyle} value={f.mileageStart} onChange={set("mileageStart")} /></Field>
      <Field label="Odometer End (km)"><input type="number" style={inputStyle} value={f.mileageEnd} onChange={set("mileageEnd")} /></Field>
      <Field label="Driver"><input style={inputStyle} value={f.driver} onChange={set("driver")} /></Field>
      <PrimaryButton onClick={() => {
        if (!required(f.destination)) { alert("Destination is required."); return; }
        if (!required(f.vehicle)) { alert("Choose a vehicle."); return; }
        if (!positiveInteger(Number(f.passengers))) { alert("Passengers must be a positive whole number."); return; }
        const start = Number(f.mileageStart);
        const end = Number(f.mileageEnd);
        if (!nonNegativeNumber(start) || !nonNegativeNumber(end)) { alert("Mileage readings cannot be negative."); return; }
        if (end < start) { alert("End odometer cannot be lower than the start reading."); return; }
        onSubmit(f);
      }}>Save Trip</PrimaryButton>
    </Drawer>
  );
}

function FuelDrawer({ vehicles, onClose, onSubmit }) {
  const vList = vehicles.filter((v) => v.status === "Active");
  const [f, setF] = useState({ vehicle: vList[0]?.code || "", date: todayISO(), litres: 0, cost: 0, odometer: 0, notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title="Log Fuel" onClose={onClose}>
      <Field label="Vehicle">
        <select style={inputStyle} value={f.vehicle} onChange={set("vehicle")}>
          {vList.map((v) => <option key={v.id} value={v.code}>{v.code} — {v.regNo}</option>)}
        </select>
      </Field>
      <Field label="Date"><input type="date" style={inputStyle} value={f.date} onChange={set("date")} /></Field>
      <Field label="Litres"><input type="number" step="0.1" style={inputStyle} value={f.litres} onChange={set("litres")} /></Field>
      <Field label="Cost (MK)"><input type="number" style={inputStyle} value={f.cost} onChange={set("cost")} /></Field>
      <Field label="Odometer (km)"><input type="number" style={inputStyle} value={f.odometer} onChange={set("odometer")} /></Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 40 }} value={f.notes} onChange={set("notes")} /></Field>
      <PrimaryButton onClick={() => {
        if (!required(f.vehicle)) { alert("Choose a vehicle."); return; }
        if (!(Number(f.litres) > 0)) { alert("Litres must be greater than zero."); return; }
        if (!nonNegativeNumber(Number(f.cost))) { alert("Cost cannot be negative."); return; }
        if (f.odometer !== "" && !nonNegativeNumber(Number(f.odometer))) { alert("Odometer reading cannot be negative."); return; }
        onSubmit({ ...f, litres: Number(f.litres), cost: Number(f.cost) || 0, odometer: Number(f.odometer) || 0, recordedBy: "system" });
      }}>Save Fuel Entry</PrimaryButton>
    </Drawer>
  );
}

function SponsorDrawer({ editing, onClose, onSubmit }) {
  const [f, setF] = useState(editing || { name: "", category: "Jersey", contact: "", phone: "", email: "", contractValue: 0, startDate: todayISO(), endDate: "", status: "Active", deliverables: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title={editing ? `Edit Sponsor — ${editing.name}` : "Add Sponsor"} onClose={onClose}>
      <Field label="Sponsor Name"><input style={inputStyle} value={f.name} onChange={set("name")} /></Field>
      <Field label="Category">
        <select style={inputStyle} value={f.category} onChange={set("category")}>
          <option>Jersey</option><option>Kit</option><option>Ball</option><option>Transport</option><option>Media</option><option>Other</option>
        </select>
      </Field>
      <Field label="Contact Person"><input style={inputStyle} value={f.contact} onChange={set("contact")} /></Field>
      <Field label="Phone"><input style={inputStyle} value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Email"><input type="email" style={inputStyle} value={f.email} onChange={set("email")} /></Field>
      <Field label="Contract Value (MK)"><input type="number" style={inputStyle} value={f.contractValue} onChange={set("contractValue")} /></Field>
      <Field label="Start Date"><input type="date" style={inputStyle} value={f.startDate} onChange={set("startDate")} /></Field>
      <Field label="End Date"><input type="date" style={inputStyle} value={f.endDate} onChange={set("endDate")} /></Field>
      <Field label="Status">
        <select style={inputStyle} value={f.status} onChange={set("status")}>
          <option>Active</option><option>Expired</option><option>Proposed</option>
        </select>
      </Field>
      <Field label="Deliverables"><textarea style={{ ...inputStyle, minHeight: 40 }} value={f.deliverables} onChange={set("deliverables")} placeholder="Jersey branding, social media posts, etc." /></Field>
      <PrimaryButton onClick={() => {
        if (!required(f.name)) { alert("Sponsor name is required."); return; }
        if (f.email && !emailValid(f.email)) { alert("Enter a valid email address, or leave it blank."); return; }
        if (!nonNegativeNumber(Number(f.contractValue))) { alert("Contract value cannot be negative."); return; }
        if (f.endDate && f.startDate && f.endDate < f.startDate) { alert("End date cannot be before the start date."); return; }
        onSubmit(f);
      }}>
        {editing ? "Save Changes" : "Add Sponsor"}
      </PrimaryButton>
    </Drawer>
  );
}

function RiskDrawer({ editing, onClose, onSubmit }) {
  const [f, setF] = useState(editing || { title: "", category: "Operational", likelihood: "Medium", impact: "Medium", owner: "", mitigation: "", status: "Open", lastUpdated: todayISO() });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title={editing ? `Edit Risk — ${editing.code}` : "Log Risk"} onClose={onClose}>
      <Field label="Risk Title"><input style={inputStyle} value={f.title} onChange={set("title")} placeholder="e.g. COF expiry — BT14227" /></Field>
      <Field label="Category">
        <select style={inputStyle} value={f.category} onChange={set("category")}>
          <option>Operational</option><option>Financial</option><option>Compliance</option><option>Reputational</option><option>Legal</option>
        </select>
      </Field>
      <Field label="Likelihood">
        <select style={inputStyle} value={f.likelihood} onChange={set("likelihood")}>
          <option>Very Low</option><option>Low</option><option>Medium</option><option>High</option><option>Very High</option>
        </select>
      </Field>
      <Field label="Impact">
        <select style={inputStyle} value={f.impact} onChange={set("impact")}>
          <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
        </select>
      </Field>
      <Field label="Risk Owner"><input style={inputStyle} value={f.owner} onChange={set("owner")} placeholder="Fleet Officer, Finance Officer, etc." /></Field>
      <Field label="Mitigation Plan"><textarea style={{ ...inputStyle, minHeight: 40 }} value={f.mitigation} onChange={set("mitigation")} placeholder="What's being done about it" /></Field>
      <Field label="Status">
        <select style={inputStyle} value={f.status} onChange={set("status")}>
          <option>Open</option><option>Mitigated</option><option>Closed</option>
        </select>
      </Field>
      <PrimaryButton onClick={() => { onSubmit({ ...f, lastUpdated: todayISO() }); }} disabled={!f.title}>Save Risk</PrimaryButton>
    </Drawer>
  );
}

function FixtureDrawer({ editing, onClose, onSubmit }) {
  const [f, setF] = useState(editing || { date: todayISO(), opponent: "", competition: "TNM Super League", venue: "Away", result: "", notes: "", status: "Upcoming" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer title={editing ? `Edit Fixture` : "Add Fixture"} onClose={onClose}>
      <Field label="Date"><input type="date" style={inputStyle} value={f.date} onChange={set("date")} /></Field>
      <Field label="Opponent"><input style={inputStyle} value={f.opponent} onChange={set("opponent")} placeholder="Mighty Wanderers" /></Field>
      <Field label="Competition">
        <select style={inputStyle} value={f.competition} onChange={set("competition")}>
          <option>TNM Super League</option><option>FDH Bank Cup</option><option>President's Cup</option><option>Friendly</option><option>Youth League</option>
        </select>
      </Field>
      <Field label="Venue">
        <select style={inputStyle} value={f.venue} onChange={set("venue")}>
          <option>Home</option><option>Away</option><option>Neutral</option>
        </select>
      </Field>
      <Field label="Result (if completed)"><input style={inputStyle} value={f.result} onChange={set("result")} placeholder="2-1, 0-0, etc." /></Field>
      <Field label="Status">
        <select style={inputStyle} value={f.status} onChange={set("status")}>
          <option>Upcoming</option><option>Completed</option><option>Cancelled</option><option>Postponed</option>
        </select>
      </Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 40 }} value={f.notes} onChange={set("notes")} placeholder="e.g. Depart 05:00, kit: gold shirts" /></Field>
      <PrimaryButton onClick={() => { if (!f.opponent) { alert("Opponent is required."); return; } onSubmit(f); }} disabled={!f.opponent}>
        {editing ? "Save Changes" : "Add Fixture"}
      </PrimaryButton>
    </Drawer>
  );
}
