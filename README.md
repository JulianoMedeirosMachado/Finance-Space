# Finance Space

Personal finance application built with Vue 3, TypeScript, Pinia, Vite, NestJS and PostgreSQL. The interface is in Brazilian Portuguese and preserves the project's light/dark visual identity. Source names and comments are in English.

## Run locally

Requires Node.js 22.12 or newer. From the repository root:

```powershell
npm.cmd install
npm.cmd run dev
```

Open **http://127.0.0.1:5173** and create your own account. The API listens at `127.0.0.1:3000`. On shells without PowerShell's script execution restriction, `npm` works as well as `npm.cmd`.

No Docker or external account is required for local use. When `DATABASE_URL` is absent, the API runs PGlite, an embedded PostgreSQL database, with files in **`backend/data/postgres`**. Users, password hashes, sessions and financial records survive application and computer restarts. Keep this folder when upgrading the app. Only one API process may open this local database at a time. Closing the application makes it unavailable until restarted; it does not erase data.

For optional settings, copy `backend/.env.example` to `backend/.env` and edit it. Never commit credentials or database files.

## Features

- Registration, sign-in, sign-out and seven-day server-side sessions in HttpOnly cookies.
- Password reset by email when SMTP is configured; links expire after 30 minutes and revoke existing sessions when used.
- Monthly overview with income, expenses, investments, third-party participation, categories, trends and pending commitments.
- Accounts and realized balances; credit cards, invoice totals, limits and utilization.
- Transactions, transfers, invoice payments, recurring expenses/income and installment schedules.
- Monthly realization of forecasts, with captured amounts that survive later schedule edits.
- Meal allowance credits, purchases and accumulated balance, separate from salary and credit cards.
- Responsible people, third-party settlements, categories, historical records, CSV exports and a complete per-account JSON export.
- Excel import with a preview, exclusion of individual financial rows, duplicate detection, control-total comparison and import history.
- Responsive layouts and persisted theme preference.

## Import your workbook

1. Sign in and open **Importar planilha**.
2. Select `finance-workbook.xlsx` (up to 10 MB).
3. Inspect the recognized rows, warnings and source/platform comparison. Checked financial rows are excluded; required lookup records are included automatically.
4. Confirm the import. Financial data is saved only after confirmation, in a single transaction. The preview expires after 30 minutes or an API restart.

The reader supports the supplied workbook's sheets: Config, Lançamentos, Recorrentes, Parcelamentos, Receitas, Faturas, Vale Alimentação and Histórico 2026. Dashboard and Mês are calculated views and are never imported as transactions. Blank limit/closing/due-day fields remain unknown. Bank balances are not present in this workbook and must be entered separately. Rows with only an ID and no description are skipped with a warning. Other invalid rows block confirmation until corrected.

Existing source IDs are ignored on reimport, including previously edited records. Reimport does not overwrite an existing record; use the corresponding screen to edit it. Removing a record permits it to be imported again. Historical rows use their source row number as part of their identity, so preserve historical row ordering when reimporting. This importer targets the supplied layout rather than arbitrary spreadsheets.

## Validation and builds

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run format:check
npm.cmd start
```

The tests cover financial calculations, calendar boundaries, import parsing and duplicate recognition, ownership restrictions, restart persistence, encrypted backups, and the actual HTTP authentication/import workflow. `npm.cmd start` serves the built application at **http://127.0.0.1:3000**. Build both workspaces first.

## Hosted deployment

Set `NODE_ENV=production`, `DATABASE_URL`, `APP_ORIGIN` (the exact HTTPS site origin), and `HOST=0.0.0.0`. Use `DATABASE_SSL=true` if your PostgreSQL provider requires verified TLS. Configure the provider's CA if needed; certificate verification is never disabled. Configure `TRUST_PROXY` only to match your actual reverse proxy topology. Build the repository and run `npm start` behind an HTTPS reverse proxy. The API serves the Vue build, so the public site and API can share the same origin.

PostgreSQL can be hosted on Supabase or another PostgreSQL provider. Authentication is implemented in the NestJS API and does **not** require Supabase Auth credentials. Each login currently owns an independent personal space; shared households and invitations are not implemented. Public hosting requires selecting and configuring a provider; this repository does not create cloud resources or incur hosting charges.

SMTP requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` and, if needed, `SMTP_USER`/`SMTP_PASSWORD`. Without SMTP, password recovery displays an explicit configuration message and never exposes a reset token. Configure `APP_ORIGIN` to a single public origin when sending recovery links.

## Backup and recovery

Per-account JSON and CSV downloads are portable exports, not full server backups. Full backups include account credentials (hashed), financial records and import history, encrypted with AES-256-GCM using a password-derived key. Sessions and password-reset tokens are deliberately excluded.

Stop the API before backing up or restoring a local PGlite database. Set a private backup password of at least 16 characters in your shell or secrets manager, then run:

```powershell
$backupSecret = Read-Host 'Backup password' -AsSecureString
$env:BACKUP_PASSWORD = [System.Net.NetworkCredential]::new('', $backupSecret).Password
npm.cmd run backup -w backend
```

Backups are written into `backups/` at the repository root and are ignored by Git. Retain the password separately; it cannot be recovered. Copy backups to an independent protected location. To restore into an **empty** database using the same password:

```powershell
npm.cmd run backup -w backend -- restore ../backups/your-backup.fsbackup
Remove-Item Env:BACKUP_PASSWORD
```

Restoration refuses to overwrite an existing account. For a hosted database, enable the provider's scheduled backups and test a restore into an isolated database. The backup command provides manual encrypted backups; automatic off-site scheduling must be configured in the hosting environment.

See [architecture and financial rules](docs/architecture.md) for implementation details and practical limits.
