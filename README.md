# Finance Space

Personal finance application built with Vue 3, TypeScript, Pinia, Vite, NestJS and PostgreSQL. The interface supports Brazilian Portuguese and English and preserves the project's light/dark visual identity. Source names and comments are in English.

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
- Dashboard privacy toggle: values and the financial chart start hidden on every page reload. Use the eye button to reveal them for the current session. Signing out or switching accounts hides them again.
- Accounts and realized balances; credit cards, invoice totals, limits and utilization.
- Transactions, transfers, invoice payments, recurring expenses/income and installment schedules.
- Monthly realization of forecasts, with captured amounts that survive later schedule edits.
- Meal allowance credits, purchases, previous balance, current-month result and accumulated balance, separate from salary and credit cards.
- Savings goals with a target amount, optional monthly contribution plan/deadline, recorded contributions, progress percentage and contribution history.
- Responsible people, third-party settlements, categories, historical records, CSV exports and a complete per-account JSON export.
- Responsive layouts and persisted theme preference.
- Account language preference (Brazilian Portuguese or English), saved on the server and restored at sign-in. Translated navigation, forms, messages, charts and CSV labels, with locale-aware dates and numbers. Currency remains BRL; user-entered content is never translated.

## Language

Open **Configurações → Idioma da conta** (or **Settings → Account language**) and select **Português (Brasil)** or **English**. The interface updates immediately after saving. The preference belongs to the account, persists across application/computer restarts and is included in encrypted backups. Existing accounts default to Brazilian Portuguese. The sign-in/registration page also has a language selector; signing in restores the account's saved language.

## Data entry and exports

Use the application screens to enter records and **Configurações → Histórico financeiro** to browse archived records. CSV and JSON exports are available. There is currently no upload/import endpoint.

## Meal allowance balance

The allowance uses a separate ledger in BRL cents:

- Previous balance = all recorded credits before the selected month minus all recorded purchases before that month.
- Monthly result = the selected month's credits minus its purchases.
- Accumulated balance = previous balance + monthly result.

The screen displays that reconciliation explicitly. The table labels transactions as **Crédito** or **Compra**, and its footer shows credits minus purchases for the records currently displayed, including search and month filters. Selecting **Todos os meses** affects the table, not the competence-specific summary cards. The accumulated figure is based on recorded movements; it cannot account for an unrecorded opening balance or purchases.

## Track a savings goal

1. Open **Metas** and select **Nova meta**.
2. Give the goal a name (for example, GPU), enter the target amount and optionally set a monthly contribution plan and desired date.
3. Use **Adicionar aporte** whenever you set money aside. The card updates the saved amount, remaining amount and progress.
4. Open **Ver histórico** to review, edit or remove contributions. Removing or correcting a contribution recalculates progress.

For a BRL 5,000 goal with BRL 100 contributed, progress is 2%. The monthly amount is a plan and does not generate contributions automatically. Progress combines all contributions to the goal, independently of the month selected in the application's header, and is capped at 100% once the target is reached. Contributions may exceed the target; the saved amount remains exact. Goals with contributions cannot be deleted until their contributions are removed.

Goal contributions only track earmarked savings. They do not debit accounts or create income, expenses or investment transactions. Record actual bank movements separately in **Lançamentos** to keep cash accounting accurate.

## Validation and builds

```powershell
npm.cmd test
npm.cmd run test:privacy
npm.cmd run audit:security
npm.cmd run typecheck
npm.cmd run build
npm.cmd run format:check
npm.cmd start
```

The tests cover financial calculations, allowance reconciliation, calendar boundaries, goal progress and contribution ownership, safe schema upgrades, restart persistence, encrypted backups, retired import routes, and actual HTTP authentication/goal workflows. `npm.cmd start` serves the built application at **http://127.0.0.1:3000**. Build both workspaces first.

## Hosted deployment

Set `NODE_ENV=production`, `DATABASE_URL`, `APP_ORIGIN` (the exact HTTPS site origin), and `HOST=0.0.0.0`. Use `DATABASE_SSL=true` if your PostgreSQL provider requires verified TLS. Configure the provider's CA if needed; certificate verification is never disabled. Configure `TRUST_PROXY` only to match your actual reverse proxy topology. Build the repository and run `npm start` behind an HTTPS reverse proxy. The API serves the Vue build, so the public site and API can share the same origin.

Startup migrations require table-management permissions and permission to create/grant the `finance_space_runtime` NOLOGIN role. The migration enables and forces RLS on sensitive application tables and revokes their public/anonymous access. Finance operations always run inside a transaction with this restricted role and the authenticated owner's transaction-local context. Authentication, migrations and encrypted server backups use the trusted maintenance connection. Keep `DATABASE_URL` server-side and never expose it through `VITE_*` variables or a public database API. Validate these grants on the actual hosting provider before public deployment; the automated database checks use local PostgreSQL through PGlite.

PostgreSQL can be hosted on Supabase or another PostgreSQL provider. Authentication is implemented in the NestJS API and does **not** require Supabase Auth credentials. Each login currently owns an independent personal space; shared households and invitations are not implemented. Public hosting requires selecting and configuring a provider; this repository does not create cloud resources or incur hosting charges.

SMTP requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` and, if needed, `SMTP_USER`/`SMTP_PASSWORD`. Without SMTP, password recovery displays an explicit configuration message and never exposes a reset token. Configure `APP_ORIGIN` to a single public origin when sending recovery links.

## Data protection

Database files, environment configuration, exports and backups are ignored by Git. Never force-add these files or publish a project archive containing runtime data. `npm.cmd run audit:security` checks current source files and reachable Git history for common credential patterns and private artifacts; it is a heuristic check, not a guarantee that all sensitive content is absent.

## Backup and recovery

Per-account JSON and CSV downloads are portable exports, not full server backups. Full backups include account credentials (hashed), financial records, goals/contributions and legacy import audit metadata, encrypted with AES-256-GCM using a password-derived key. Sessions and password-reset tokens are deliberately excluded.

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
