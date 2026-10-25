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
- Optional shared Telegram bot with per-user DeepSeek/OpenRouter credentials, two-step account linking and expense drafts requiring explicit confirmation.

## Language

Open **Configurações → Idioma da conta** (or **Settings → Account language**) and select **Português (Brasil)** or **English**. The interface updates immediately after saving. The preference belongs to the account, persists across application/computer restarts and is included in encrypted backups. Existing accounts default to Brazilian Portuguese. The sign-in/registration page also has a language selector; signing in restores the account's saved language.

## iPhone Home Screen

Open the deployed HTTPS site in Safari, choose **Add to Home Screen** and enable **Open as Web App** when offered. The manifest declares standalone display, a `/dashboard` launch URL and a root `/` scope, covering internal pages including sign-in and settings. After changing these settings, remove the old Home Screen icon and add it again to refresh the installed configuration; you may need to sign in again. Removing the icon does not delete server-side account data.

This configuration does not provide offline access, push notifications or prevent hosting idle suspension. External sites can still open browser controls. Actual standalone navigation must also be verified on an iPhone after deployment.

## Data entry and exports

Use the application screens to enter records and **Configurações → Histórico financeiro** to browse archived records. CSV and JSON exports are available. There is currently no upload/import endpoint.

## AI and Telegram

Financial tables support ascending/descending sorting through accessible column-header buttons. Transactions and other dated lists open newest first; values compare integer amounts, dates compare ISO values and references compare displayed names. Sorting preserves filters/search, remains selected while refreshing data, and does not mutate store/chart data. Missing values remain last in both directions. CSV exports follow the visible filtered order. The same controls apply to resource lists, the monthly overview, report tables and goal-contribution history; report charts keep chronological source order.

This integration is optional. The application remains usable without any AI/bot secrets. There is one centrally administered Telegram bot; each account supplies and pays for its own AI provider key. No provider SDK, separate bot process or polling service is required.

### Server setup (once per deployment)

1. Create a bot using Telegram's official **@BotFather**, obtain its token and note its username without `@`. Do not paste real tokens into source files, Git, screenshots or public chats.
2. Set these private environment variables on the backend/Render service:

   | Variable                     | Value                                                                  |
   | ---------------------------- | ---------------------------------------------------------------------- |
   | `INTEGRATION_ENCRYPTION_KEY` | Canonical base64 encoding of 32 cryptographically random bytes         |
   | `TELEGRAM_BOT_TOKEN`         | BotFather token                                                        |
   | `TELEGRAM_BOT_USERNAME`      | Bot username without `@`                                               |
   | `TELEGRAM_WEBHOOK_SECRET`    | Independently generated random URL-safe secret, at least 32 characters |
   | `APP_ORIGIN`                 | The single public HTTPS origin of this deployment                      |

   Generate the encryption key in your own private terminal with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Generate a separate webhook secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Save both in a password manager. The encryption key must remain stable across restarts; replacing it makes existing AI keys unreadable and users must re-enter them. Never use a `VITE_*` variable for a secret.

3. Deploy. Startup migration 4 creates integration settings, drafts and the durable Telegram queue with forced RLS. Migration 5 adds opt-in insights, owner-isolated report history and typed transaction/installment drafts. Existing users start with insights disabled. The maintenance principal dispatches Telegram identities and jobs; per-user settings, financial operations and reports use the restricted runtime role.
4. In a trusted local terminal, load the same bot token, webhook secret and public `APP_ORIGIN` into environment variables (or an ignored `backend/.env`). Then run `npm.cmd run telegram:webhook -w backend`. This deliberately registers an external webhook at `/api/integrations/telegram/webhook`; it is not run automatically during build/start. The script uses two webhook connections, accepts only messages/callbacks, preserves pending Telegram updates and never logs token values. Register only one deployment for a given bot. Do not run this against your production bot from a test deployment.

   Run these complete commands one at a time in PowerShell at the repository root. Replace the example origin with your Render URL. At each hidden prompt, paste the matching secret and press Enter; do not replace the prompt text with the secret. The encryption key is not needed on the local machine just to register the webhook.

   ```powershell
   $env:APP_ORIGIN = 'https://YOUR-SERVICE.onrender.com'
   $telegramBotToken = Read-Host 'Paste the BotFather token' -AsSecureString
   $env:TELEGRAM_BOT_TOKEN = [System.Net.NetworkCredential]::new('', $telegramBotToken).Password
   $telegramWebhookSecret = Read-Host 'Paste the same webhook secret saved on Render' -AsSecureString
   $env:TELEGRAM_WEBHOOK_SECRET = [System.Net.NetworkCredential]::new('', $telegramWebhookSecret).Password
   npm.cmd run telegram:webhook -w backend
   Remove-Item Env:TELEGRAM_BOT_TOKEN, Env:TELEGRAM_WEBHOOK_SECRET
   Remove-Variable telegramBotToken, telegramWebhookSecret
   ```

   Successful registration prints `Telegram webhook registered. Pending updates were preserved.` This only confirms registration, not a live AI expense test. Deploy the configured server before connecting accounts.

The webhook validates Telegram's secret header and accepts only eligible private human conversations. It pins each accepted update to the original account and Telegram binding version before acknowledging receipt. Unknown/unlinked senders remain unlinked for that update even if they connect later. Account switches, disconnect/reconnect cycles and saved/removed AI configuration invalidate old queued work and reply outboxes. Ownership/version are checked again before AI quota reservation, financial writes and private reply delivery; an already-started provider request cannot be recalled, but stale results are not saved or delivered.

Each Telegram identity may admit at most 20 updates per minute and have eight queued/in-progress updates. Duplicates do not consume another slot. Excess admission returns HTTP 429 without storing message content or making AI calls, allowing Telegram's bounded delivery retries. Groups, bots and mismatched actor/chat IDs are ignored without entering the queue. The webhook has a separate 1,200-request/minute IP safeguard rather than sharing the browser API's 240-request/minute bucket. These are abuse safeguards, not unlimited capacity or protection against every denial-of-service attack.

The worker runs two bounded processing lanes per instance, takes the least-recently served eligible identity and preserves FIFO within each identity. Database actor leases prevent concurrent processing of the same sender across workers; job lease tokens fence stale worker writes after a restart/reclaim. A slow account therefore does not hold the other lane. Sleeping Render instances may take a minute or longer to respond. Duplicate update deliveries and repeated confirmation clicks cannot create duplicate financial records. Replies may occasionally be delivered twice if the process stops after Telegram accepts a reply but before local acknowledgement; financial writes remain transactional. Jobs are leased and retried up to six times. Retries continue when the service is awake/restarted; this is not an always-on delivery SLA and failed deliveries are not automatically reprocessed forever. Terminal jobs clear payloads, reply bodies and binding metadata; only delivery deduplication metadata remains. Inactive actor throttling rows are removed after 30 days when no jobs reference them.

Startup migration 7 adds private, forced-RLS actor scheduling and versioned queue ownership. **Legacy queued/in-progress updates are discarded and their payloads cleared**, because their receipt-time owner cannot be established reliably; legacy failed payloads are cleared too. Resend any message that had not received a preview before that upgrade. Existing financial records, report history and Telegram connections are preserved. No new environment variable or webhook registration is needed.

### User setup

1. Open **Settings → AI integration** (**Configurações → Integração IA**). This card opens the dedicated authenticated `/integrations` page; provider keys and Telegram configuration are not displayed on the account settings overview. Choose DeepSeek or OpenRouter, enter a model identifier from that provider's current dashboard and your API key, and review the data-sharing consent. The selected model must support JSON-object output; unsupported models fail explicitly rather than silently changing providers/models. Save, then optionally test the saved configuration (this may consume credits).
2. Generate a Telegram connection link, open it and tap **Start** in the bot. Return to the site, refresh the connection and confirm the displayed Telegram identity only if it is yours. This identifies an account, not a physical device. The site does not list other people who start the shared bot; it displays only the candidate who opened your personal link. Do not share that link: someone who obtains it can nominate their own Telegram identity, but cannot access finance data unless you then approve that candidate on your authenticated account. Cancel an unexpected candidate and generate a new link. Links expire after ten minutes, are single-use and do not by themselves authorize access. A Telegram ID can belong to only one account at a time. Disconnect first to change accounts.
3. Send one complete expense in a private chat: item, BRL amount, payment account/card, and optionally category, date and reporting month. The AI suggests a category from existing categories; it never creates a card/account/category. Check the proposed amount, payment method, category, date and reporting month, then tap **Confirm**. To correct an entry, use **Cancel / correct** and resend a complete message. Each message is independent, not a conversational editing session. Returning to the visible application refreshes financial data so confirmed bot expenses appear without a full reload.

Payment-name interpretation accepts nicknames, initials, spelling variations and related brands rather than requiring exact saved names. For example, an explicit card reference to `ML` or `Mercado Livre` may suggest the only related `Mercado Pago` card in that account. This is a proposal, not a fixed equivalence between brands: exact names take priority, merchant names must not be confused with payment methods, and unresolved ambiguity between multiple plausible cards still requires clarification. The preview labels the payment method/category as suggestions. Always review them; model behavior is probabilistic. Server-side ownership validation and mandatory confirmation remain unchanged.

The bot supports ordinary expenses, equal credit-card installment plans, monthly subscription/expense schedules, one-time received income and monthly income schedules by text. It does not support receipts/images, audio, transfers, refunds, debt reimbursements, conversational editing, insight delivery or autonomous agents. The date defaults to today in `America/Sao_Paulo`; the reporting month defaults to the entry's month, **not** an inferred credit-card statement month. Specify another reporting month explicitly and always check the preview. Bank/cash expenses and received income are recorded as `paid`; card purchases as `posted`. Drafts expire in 24 hours. Financial records can be edited normally on the site afterwards. `/help` shows usage; `/disconnect` unlinks the Telegram account. Removing the AI key or disconnecting cancels pending drafts but does not delete financial records.

For a subscription, send `Streaming BRL 30 recurring on card ML, day 10 starting November 2026`. An unqualified subscription/recurring request defaults to a **monthly** expense schedule, shown explicitly in the preview. It creates one native `recurring` record, with monthly amount, first reporting month, billing day and optional inclusive end month; no end means active indefinitely until edited/disabled. Weekly/yearly frequencies are unsupported and require clarification rather than silent conversion. Without a day, the purchase date's day is used; short months clamp to their last valid day. Recurrence and installments cannot be combined.

For received income, send `BRL 20 from a sale, income into Checking`. Explicit income intent and an existing destination **account** are required; a credit card is not an income destination. This creates one received transaction, not an expense with a negative amount. `Salary BRL 3000 monthly into Checking, day 5` instead creates one native `income` schedule. All monthly schedules remain **planned**: adding them never marks the first or future occurrences paid/received. Realize each occurrence on the website as usual; the realized transaction replaces that month's forecast without duplicating totals. Review type, amount, payment/destination, dates and recurrence before confirmation. Monthly expenses can still belong to a registered responsible person; an income payer is not automatically a debtor.

Startup migration 6 extends the Telegram draft-kind constraint to `transactions`, `installments`, `recurring` and `income`, preserving existing drafts, ownership policies and confirmation idempotency. No additional secrets or webhook registration are required.

Meal allowance purchases and credits are supported: send `Mercado 50 no vale alimentação` or `Crédito de 672 no VA` (English: `Groceries 50 using meal allowance` or `Meal allowance credit of 672`). Explicit benefit context is required; grocery shopping or a card brand alone must not imply meal allowance. The preview identifies a benefit purchase or credit. Confirmation creates only one native `benefits` record, affecting the separate benefit balance without changing bank balances, salary, settlements or credit-card invoices. No account/card/category reference is needed or saved. Benefit installments, shared purchases, external debtors and recurring schedules are unsupported and require clarification. Date/reporting month follow the ordinary defaults, and cancellation/expiry/repeated confirmations retain the existing safeguards. Startup migration 9 adds `benefits` to the draft-kind constraint without removing existing drafts; no new secrets or webhook registration are required.

For `shoes, BRL 300 on card ML in 3 installments`, the bot proposes a total of BRL 300 and three BRL 100 installments. Explicit `3 installments of BRL 300` means a BRL 900 total. The AI extracts the amount basis/count; the server computes integer cents. If needed, the last installment absorbs the rounding remainder (BRL 100 split three ways becomes BRL 33.33 + 33.33 + 33.34). The preview shows the total, regular/last installment amounts and first/last reporting months. Confirmation creates one native installment schedule, **not** an additional full-price transaction. It appears in **Installments** and monthly projections. Adjust the base/last amount in the schedule form; for other per-month differences, realize the installment and edit that month's transaction normally. A realization overrides its forecast without counting it twice. Changing a schedule does not rewrite already realized entries.

To assign an expense to an existing external responsible person/debtor, send a complete message such as `Marta, shoes BRL 300 on card ML` or `Marta, shoes BRL 300 on card ML in 3 installments`. These people belong to **Settings → Responsible people**, not other platform login accounts. The preview shows the selected responsible person's saved name. Confirming saves its existing `personId` on the transaction/schedule, so normal monthly third-party participation and remaining-settlement calculations include it. It does not create a person, payment, reimbursement receipt or duplicate settlement entry. When no other responsible person is mentioned, the server uses the owner's self record when available. An explicit unmatched/ambiguous responsible person must be clarified, not silently treated as the owner. Interpreting repayment messages as purchases remains unsupported.

For a shared purchase, send `Gás, total R$ 150, eu, Marta e Cacau, cartão ML em 3x`. There must be 2–8 explicitly identified participants; include yourself explicitly (`eu` / `me`) if you participate. Existing external people are resolved only from names mentioned in the message; unrelated people's names and balances are not sent to AI. No percentages means an equal split. `Eu 50%, Marta 30%, Cacau 20%` specifies the whole split; explicit percentages must sum to 100. With only `Marta paga 50%`, the remaining 50% is divided equally among the other named participants. Percentages must be positive with at most two decimal places. Zero shares, duplicate/unknown/ambiguous people, inconsistent totals or mixed monetary/percentage shares require clarification. Shared monthly recurring schedules and shared income are not supported.

The server, not AI, apportions integer cents using deterministic largest remainders. For installments it preserves both the purchase-level invoice amount in every month and each participant's total, adjusting their final installments. If an extremely small share cannot be represented as positive regular/final installments, the request is rejected rather than inventing money. The preview lists each participant's percentage, total and regular/final installments. One atomic confirmation creates **only one native transaction or installment schedule per participant**, with no extra full-price parent record; duplicate confirmations cannot create another batch. The existing monthly/card calculations sum these parts once, and external shares enter settlements without marking a reimbursement received. Parts remain individually editable/realizable through the existing website views; changing one part does not automatically rebalance the others. Migration 8 adds nullable `telegram_drafts.split_entries`; existing single-entry drafts remain compatible. No new secrets or webhook setup are required.

For privacy, person matching is performed locally using case/accent-insensitive name words already present in the message. Only matching IDs and those already-mentioned words enter the AI context, never unrelated names, full names not supplied in the message, notes or outstanding settlement balances. This local matching does not guess new names from arbitrary typos; use a registered name or enough of it to distinguish people. Shared first names require clarification/full-name wording. The server rejects selected people outside that owner-scoped mentioned-person candidate set. Merchant mentions or explicit gifts must not automatically create debt responsibility; always review the confirmation.

### Weekly and monthly AI insights

The top-bar refresh button reloads financial records and the selected month's totals without reloading/remounting the page or changing its month/filters. It is disabled while data is loading. It makes only financial read requests, never an AI generation call, and can be used after Telegram updates while the site remains open.

DeepSeek requests explicitly disable thinking so the limited output budget is available for the requested JSON rather than reasoning. The insight prompt includes the canonical JSON Schema, character limits and a short-report target. Locally, harmless Markdown fences, extra properties and an absent/null optional suggestion are normalized without a second provider request; missing substantive fields or incomplete JSON are never fabricated. Empty, token-truncated and format-invalid responses have distinct safe error messages. Raw provider content, reasoning and financial summaries are not logged.

There are no automatic provider retries or billable response-repair calls. A failed/interrupted period requires the retry-consumption checkbox; the API also requires `retry: true` for an existing unfinished attempt. Refreshing or reopening a failed period does not call the provider. Completed reports remain cached. A provider can still charge for an unsuccessful generation or network timeout; these safeguards cannot refund or guarantee zero charges for external failures.

Select the separate checkbox in **Settings → AI integration** only after reviewing its financial-summary sharing notice, then click **Confirm insights preference**. Checking/unchecking only edits a local draft: neither enabling nor disabling takes effect until explicitly confirmed. The status badge shows the saved preference, and unsaved changes are identified separately. This consent is off by default, separate from Telegram interpretation, and belongs to each account. The **AI insights** sidebar page remains accessible while disabled, explains how to enable analysis, and preserves previously generated reports for reading. Removing the AI key or switching providers disables new insight generation; it does not delete financial records or report history.

The page has **Weekly insights** and **Monthly insights** sections. Opening a section generates its latest completed period if no report/attempt exists: Monday–Sunday for weeks and the previous calendar month for months, in `America/Sao_Paulo`. These periods are independent of the application's global month selector. Successful reports are stored once per owner/type/period and reused across visits, devices, language changes and server restarts. History contains the 52 most recent attempts/reports; saved text keeps the language/model used at generation. Failed attempts require an explicit retry and may have consumed provider credits. Concurrent requests cannot create two saved reports for the same period. Interrupted generations can be retried after their two-minute lease expires.

Generation is **on access**, not a scheduled job: enabling the checkbox alone does not start a background analysis, backfill missed periods or send Telegram messages. The weekly and monthly sections are independent and each may consume credits. No extra Render cron or environment variables are needed. Disabling consent stops new requests and prevents an in-flight result from being stored; data already transmitted to a provider cannot be recalled. Config/key changes invalidate in-flight generations. Old reports are snapshots and are not silently regenerated when transactions are edited later.

The AI receives only server-calculated aggregates: recorded posted/paid purchases, income and investments by actual date for the closed/comparison periods; category totals; third-party participation totals; a separate meal-allowance summary; and the current recorded cash balance, goal progress and three reporting months of forecasts. Card statements and scheduled installments are explicitly identified as commitments, not available cash. Category/goal identities are codes such as `category_1`/`goal_1`; names are substituted locally **after** the provider responds. Descriptions, notes, login details, real record IDs, people/account/card names, individual entries and full financial history are never sent for this analysis. This minimizes disclosure but is not a guarantee of statistical anonymity: monetary totals are still sensitive.

Historical archive entries with unreliable individual dates are excluded from recorded-period comparisons and flagged as a coverage limitation. Unrecorded purchases may be missing; empty comparison periods must not be interpreted as proof of increased/decreased spending. Cash is based on recorded movements, not verified bank availability. Findings are advisory and may be wrong; the AI never changes records or executes financial actions. Output is validated structured text and rendered with Vue escaping, not injected HTML.

### Privacy and operating limits

- Keys are encrypted with AES-256-GCM, authenticated against their owning account and never returned by the API. The server can decrypt them to call the provider; this is **not end-to-end encryption** and does not prevent server administrators from accessing data/keys.
- Only the expense text, the IDs/names of that account's existing accounts/cards/categories, and minimal references to responsible people already mentioned in the text are sent for interpretation, not settlement balances, passwords, other users' records or the full financial history. The full list of responsible people's names is not sent. The catalog is limited to 300 reference records. Telegram sees bot messages; the AI provider sees the interpretation input. Users must opt in. Revocation cannot recall data already sent to an external provider.
- OpenRouter requests disable provider fallbacks and request providers that disallow data collection. These routing preferences are not a blanket privacy guarantee; verify the chosen provider's retention and data policies.
- Each account is limited to one AI call per ten seconds and 100 calls per database day, shared by tests, Telegram and insights, including unsuccessful provider attempts. Output is capped at 800 tokens for interpretation/tests and 2,200 for insights. These are request limits, not a guaranteed monetary cap; also configure spending limits with your provider. Unlinked Telegram users and group chats never invoke AI.
- Successful queue payloads/replies are cleared; failed payloads are cleared after 24 hours by the active worker. Minimal update-ID tombstones remain for deduplication. Expired drafts are removed after a further 30 days. Cleanup requires the worker to run.
- Full encrypted application backups include completed insight reports, but deliberately **exclude** integration keys/consents, Telegram links, drafts and the queue, just as they exclude sessions/reset tokens. Older backups without reports remain compatible. After a database restore, reconnect integrations, re-enter AI keys and opt in again to new insights. Financial records already confirmed through Telegram are ordinary records and remain included in backups/exports. Per-account finance JSON/CSV exports do not include report history.

Provider calls and Telegram delivery are covered by mocked automated tests. A real bot/provider end-to-end check is still required after configuring the deployment; no real customer keys are used in the test suite.

## Meal allowance balance

The allowance uses a separate ledger in BRL cents:

- Previous balance = all recorded credits before the selected month minus purchases plus balance corrections before that month.
- Monthly result = the selected month's credits minus its purchases plus signed balance corrections.
- Accumulated balance = previous balance + monthly result.

The screen displays that reconciliation explicitly. The table labels movements as **Crédito**, **Compra** or **Correção de saldo**, and its footer shows credits minus purchases plus signed corrections for the records currently displayed, including search and month filters. Selecting **Todos os meses** affects the table, not the competence-specific summary cards.

To reconcile missing historical purchases or an opening balance, select the desired reporting month and click **Corrigir saldo** (**Correct balance**). Enter the actual remaining benefit balance, including the month's credit if already recorded. The dialog shows the calculated balance and the signed difference, and saves only after **Confirmar correção**. It considers **all entries through the selected month**, independently of table filters; if future-dated movements are already entered in that month, include them in the target or reconcile the appropriate month instead. The API recomputes the balance under the owner's transaction lock and rejects a stale preview if another purchase, credit or correction changed it. Refresh the calculated balance and review the difference before resubmitting. Identical balances create no adjustment.

The correction is an ordinary owner-isolated `benefits` record with `nature=adjustment` and a signed amount. It remains visible, editable, deletable and included in exports/backups. It does not inflate the **Crédito do mês** or **Consumo do mês** cards and has no effect on bank balances, salary, invoices or settlements. AI summaries distinguish aggregate corrections from credits/purchases. No schema migration is needed for this JSONB field value. Changes to historical movements or deleting a correction recalculate later balances; this is a reconciliation entry, not a permanent override that hides subsequent edits.

For example, a calculated BRL 500 balance reconciled to BRL 120 creates a BRL -380 correction. A BRL 672 credit next month then yields BRL 792 before new purchases. Do not subtract that new credit yourself when entering the actual balance. The Telegram bot supports benefit purchases/credits, while balance corrections require this explicit website flow.

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

Per-account JSON and CSV downloads are portable exports, not full server backups. Full backups include account credentials (hashed), financial records, goals/contributions, completed AI insight reports and legacy import audit metadata, encrypted with AES-256-GCM using a password-derived key. Sessions, password-reset tokens and integration credentials/consents are deliberately excluded.

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
