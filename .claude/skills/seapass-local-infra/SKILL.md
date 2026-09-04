---
description: Start/verify SeaPass's local infra (Postgres, Redis, MailHog) and dev servers (api, web) on this Windows machine — native services, no Docker. Use whenever asked to run, test, or verify SeaPass end to end, or when integration tests / the API health check report Postgres or Redis as down, or when e-mail notifications need to be inspected.
---

# SeaPass local infra (this machine)

This machine has **no Docker, no WSL** — `infra/docker-compose.yml` (the README's documented
path) does not apply here. Postgres and Redis run as **native Windows services**, installed once
(2026-09-04) and left running permanently. MailHog (SMTP notifications, ver ADR-0019) runs as a
**plain background process**, started per session — see step 1b. In a fresh session Postgres/Redis
should already be up; this skill is for verifying that and for the rare case a service didn't
survive a reboot.

## 1. Check first — usually nothing to do

```bash
(echo > /dev/tcp/127.0.0.1/5432) >/dev/null 2>&1 && echo "postgres up" || echo "postgres down"
(echo > /dev/tcp/127.0.0.1/6379) >/dev/null 2>&1 && echo "redis up" || echo "redis down"
(echo > /dev/tcp/127.0.0.1/1025) >/dev/null 2>&1 && echo "mailhog smtp up" || echo "mailhog smtp down"
curl -s http://localhost:3333/health   # once the API dev server is running
```

If Postgres/Redis ports are open, skip to step 3 (dev servers) — the two services below are
already installed and set to Automatic startup, so a plain reboot should bring them back on its
own. MailHog is NOT a service (see 1b) — check it every session, it won't survive one on its own.

## 1b. MailHog (SMTP notifications, ver ADR-0019) — start per session

```powershell
Start-Process -FilePath 'C:\Users\Leo\mailhog\MailHog.exe' -WindowStyle Hidden
```

No admin elevation needed (unlike Postgres/Redis) — it's a plain background process, not a
Windows service. That's deliberate: MailHog holds its inbox in memory only (nothing durable to
protect across a reboot, unlike Postgres/Redis data) — restarting it just clears whatever test
e-mails were sitting in the inbox, which is harmless. Binary already downloaded at
`C:\Users\Leo\mailhog\MailHog.exe` (official `mailhog/MailHog` v1.0.1 Windows release) — if it's
ever missing, re-download from `https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_windows_amd64.exe`.
SMTP on `:1025` (what `apps/api`'s `SMTP_HOST`/`SMTP_PORT` defaults point to — no `.env` change
needed), web UI to actually read the e-mails at `http://localhost:8025`. `pnpm test:integration`
locally also hits this same instance (there's no separate test SMTP on this no-Docker machine —
see the note in `docs/architecture/decisions/0019-events-and-notifications.md` about
`infra/docker-compose.test.yml`'s `mailhog-test` service being CI-only here).

## 2. If a service is down — start it (don't reinstall)

Both are registered Windows services, not one-off processes — restart the service, don't try to
relaunch a binary by hand:

```powershell
# Postgres 17 (installed via `winget install PostgreSQL.PostgreSQL.17`)
Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command "Start-Service postgresql-x64-17"' -Wait

# Redis (portable tporadowski/redis 5.0.14.1 build at C:\Users\Leo\redis-windows,
# registered as a Windows service named "Redis" via `redis-server.exe --service-install`)
Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command "Start-Service Redis"' -Wait
```

`Start-Service`/`Restart-Service` need admin elevation, which this shell isn't; the
`Start-Process ... -Verb RunAs` wrapper triggers a UAC prompt — it has gone through silently
(no visible prompt reached this agent) every time so far, so just run it and re-check the ports
after ~2s. If a service is genuinely missing (`Get-Service <name>` errors "cannot find"), see
"Full reinstall" below — that should not be necessary on this machine again.

Credentials (already provisioned, matches `apps/api/.env` / `.env.example`):
- Postgres: host `localhost:5432`, db `seapass`, user `seapass`, password `seapass`
  (superuser `postgres` has no known password — don't need it for normal dev work; see "Full
  reinstall" if you ever do).
- Redis: `localhost:6379`, no auth, no TLS.
- MailHog: SMTP `localhost:1025` (no auth — accepts anything), web UI `http://localhost:8025`
  (no auth either).

## 3. Dev servers (API + web)

Not services — start per session, same as any other Node project:

```bash
cd apps/api && corepack pnpm run dev    # NestJS, port 3333, `nest start --watch`
cd apps/web && corepack pnpm run dev    # Next.js, port 3000
```

Or both via turbo from the repo root: `corepack pnpm dev`. Give the API ~3-6s to bind; then
`curl -s http://localhost:3333/health` should report `{"database":{"status":"up"},"redis":{"status":"up"}}`.
Migrations are already applied; if starting from a genuinely empty database, run
`cd apps/api && corepack pnpm exec prisma migrate deploy --schema src/database/prisma/schema.prisma`
first.

## 4. Known warning, safe to ignore

BullMQ logs `It is highly recommended to use a minimum Redis version of 6.2.0 / Current: 5.0.14.1`
on every queue connection — this Redis build is old (2021, last version with a maintained native
Windows binary). It's a warning, not a failure; nothing in this codebase's queues (cabin-hold
expiry, ticket issuance) has hit a real incompatibility with it. If it ever does, the fix is a
newer Redis-protocol-compatible Windows service, not reverting to a raw background process — see
below.

## Full reinstall (should not be needed — reference only)

If both services are ever actually gone (not just stopped) and need to be rebuilt from scratch:

1. **Postgres**: `winget install --id PostgreSQL.PostgreSQL.17 --silent --accept-package-agreements --accept-source-agreements`
   installs cleanly and registers the `postgresql-x64-17` service itself — this worked on the
   first try. Then create the app's role/db (needs one authenticated `postgres` session first —
   see the `pg_hba.conf` trust/restore dance below, or just ask the user for the `postgres`
   password if they've since set one):
   ```sql
   CREATE ROLE seapass WITH LOGIN PASSWORD 'seapass';
   CREATE DATABASE seapass OWNER seapass;
   GRANT ALL PRIVILEGES ON DATABASE seapass TO seapass;
   ```
2. **Redis — do NOT try `winget install Memurai.MemuraiDeveloper`**: its MSI fails on this
   machine specifically (`SFXCA: Failed to create temp directory. Error code 5` — confirmed via
   the install log that `icacls C:\Windows\Temp` itself returns "Access is denied", i.e. that
   directory's ACL is broken here, which breaks any WiX/MSI-custom-action installer, not just
   Memurai's). Use the portable zip instead — no installer, so the broken `C:\Windows\Temp` ACL
   never comes into play:
   ```powershell
   $dest = "C:\Users\Leo\redis-windows"
   New-Item -ItemType Directory -Force -Path $dest | Out-Null
   Invoke-WebRequest -Uri "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip" -OutFile "$dest\redis.zip"
   Expand-Archive -Path "$dest\redis.zip" -DestinationPath $dest -Force
   ```
   Then register it as an actual service (not a background process — a bare `redis-server.exe &`
   doesn't survive a reboot or a session restart):
   ```powershell
   cd C:\Users\Leo\redis-windows
   Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command "cd C:\Users\Leo\redis-windows; .\redis-server.exe --service-install redis.windows-service.conf --loglevel verbose; .\redis-server.exe --service-start"' -Wait
   ```
3. **No `postgres` superuser password known**: temporarily set `pg_hba.conf` (in
   `C:\Program Files\PostgreSQL\17\data\`) local/host entries to `trust` instead of
   `scram-sha-256`, restart the service (`Start-Process powershell -Verb RunAs -ArgumentList
   '-NoProfile -Command "Restart-Service postgresql-x64-17 -Force"' -Wait`), run the `CREATE
   ROLE`/`CREATE DATABASE` above with `psql -U postgres -h 127.0.0.1`, then **restore the original
   `scram-sha-256` lines and restart the service again** — confirm the restore actually took by
   checking that a passwordless `psql -U postgres -h 127.0.0.1` now hangs/fails. This touches
   authentication config, so treat it as a real security-relevant change each time (back up the
   file first, restore it before moving on) rather than something to do casually — ask before
   doing this again if it doesn't feel like a clear continuation of already-granted permission.
