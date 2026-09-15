# Ekhaya FC Management System

## Quick Start

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # production build → dist/
pnpm test         # run 85 tests
pnpm lint         # eslint
```

## Roles

| Role | Departments | Access |
|------|------------|--------|
| SUPERADMIN | ALL | Full CRUD, user management, acting-as any user |
| CEO | ALL | Full CRUD, salary view, acting-as others |
| FINANCE | FIN | Finance + reports, no inventory |
| ADMIN | ADM | Dashboard + staff only |
| TEAM | SEN / WOM / JNR | Players + fixtures, team-scoped |
| HOSTEL | HOS | Hostel + food schedule |
| MARKETING | MKT | Sponsors only |
| FLEET | FLT | Fleet + fuel + trips |
| MECHANIC | FLT | Fleet read-only |
| INVENTORY | INV | Items + stock only |
| STAFF | any | Read-only + personal attendance |

Default password for all seeded accounts: **Ekhaya@2026**
Change immediately on first login.

## Seeded Accounts

| Email | Name | Role |
|-------|------|------|
| brian@ekhayafc.com | Brian Siyaya | SUPERADMIN |
| davie@ekhayafc.com | Davie Nhlabathi | TEAM (Senior) |
| linda@ekhayafc.com | Linda Mkhize | TEAM (Women) |

## Data Storage

All data lives in browser `localStorage` under `ekhaya:ekhaya-system-v1:*`.
This is a **single-user per browser** system — there is no backend server.

**Backup regularly** via Superadmin → Backup & Restore → Export JSON.
Restore on any browser by importing the JSON file.

## Architecture

```
src/
  App.jsx          — single-file React app (~5400 lines)
  lib/
    auth.js        — PBKDF2-SHA256 passwords, session management, RBAC matrix
    sha256.js      — pure-JS crypto (no WebCrypto dependency)
    validation.js  — form validation for all modules
    finance.js     — approved income/expense/transfer aggregation
    audit.js       — chained audit log with tamper detection
    dates.js       — age calculation, remaining months, ISO dates
  lib/__tests__/   — 85 vitest tests
```

## Production Deployment

### Static Hosting (recommended)

```bash
pnpm build
# Copy dist/ to any static host (Netlify, Vercel, nginx, S3+CloudFront)
```

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name manage.ekhayafc.com;

    ssl_certificate     /etc/letsencrypt/live/manage.ekhayafc.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/manage.ekhayafc.com/privkey.pem;

    root /var/www/ekhaya-system/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

### HTTPS

Use Let's Encrypt:
```bash
sudo certbot --nginx -d manage.ekhayafc.com
```

## Backup & Restore

### Export (backup)
1. Log in as SUPERADMIN or CEO
2. Go to **Superadmin** → **Backup & Restore**
3. Click **Export Full Backup**
4. Save the downloaded JSON file somewhere safe (USB drive, cloud storage)

### Import (restore)
1. Log in as SUPERADMIN or CEO
2. Go to **Superadmin** → **Backup & Restore**
3. Click **Import Backup** and select your JSON file
4. Confirm the import — this replaces all current data

### Backup schedule
- The system warns if no backup in 30+ days
- Recommended: export weekly, before any bulk data changes
- Store backups off-device (USB, cloud, shared drive)

## Known Limitations

- **Single-user per browser** — no concurrent multi-user support
- **No server-side auth** — passwords are hashed client-side, no server validation
- **No data sync** — each browser has its own independent data store
- **No audit trail integrity across browsers** — chain is per-browser
- These limitations can only be resolved with a backend server (out of scope)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Lost password | Have SUPERADMIN reset via Superadmin → Accounts |
| Data missing | Check "Act as" dropdown — you may be viewing a different user's data |
| Blank screen | Clear localStorage and re-import backup |
| Audit chain broken | Import most recent known-good backup |
| "Account locked" | Wait 15 minutes or have SUPERADMIN reset from another browser |
