# Architecture and financial rules

## Application boundaries

`frontend/src/views` contains page workflows. `components` owns shared presentation and record forms. `config/resources.ts` describes reusable resource fields and columns without duplicating whole CRUD screens. `stores` owns authenticated session and financial view state. `services/api.ts` is the single HTTP boundary. Pages and heavier form components are loaded by route.

`backend/src/auth`, `finance` and `database` are independent Nest modules with explicit injected services. Schemas validate each record kind at the API boundary. `finance/calculations.ts` contains pure accounting projections and `finance/goals.ts` computes goal progress.

The database uses separate users, sessions, password-reset and import tables. Typed resource records use a common JSONB envelope with a constrained kind, per-kind Zod validation, owner ID, version, provenance and timestamps. This keeps the small application's CRUD infrastructure shared while maintaining separate financial schemas and workflows. Cross-record references are validated inside the owner-locked transaction. Finance operations also use the `finance_space_runtime` role and transaction-local owner context, with enforced RLS as a second isolation boundary. External tools must not write unvalidated JSON directly into this table. A future reporting workload can introduce dedicated SQL views or normalize specific resource types without changing the frontend contract.

Schema creation is additive and idempotent at startup. Ordered changes are recorded in `schema_migrations` and applied in a transaction. The first migration extends the existing record-kind constraint to accept goals and contributions without rewriting financial records. The second creates restricted role grants, revokes public/anonymous table access and enables/forces row security. Never rely on `CREATE TABLE IF NOT EXISTS` to change an existing table.

## Money and time

Amounts are integer BRL cents throughout the API and database records. The UI converts decimal entry to integer cents and formats values with `Intl.NumberFormat` using the account's language and BRL currency. No floating point arithmetic is used to sum money. Language selection does not convert currency.

The `users.language` preference accepts only `pt-BR` and `en-US`. Migration 3 adds it without changing financial records. Authenticated preference updates derive the owner from the session; callers cannot choose another user ID. The frontend restores the language from the session response and uses reactive translation catalogs in `frontend/src/i18n`. API clients send `Accept-Language` for localized errors and recovery notices; recovery emails use the account's saved preference. User-entered text and archived source values are not translated. Backup restoration defaults older accounts without a language field to `pt-BR`.

`month` is an explicit `YYYY-MM` competence. `date` is a calendar date, distinct from the competence. Account cash balances use realized movement dates; invoice grouping and planning use competence. Account opening balances apply from the first day of the opening competence. Enter that opening balance before movements in that month to avoid counting movements already included in the opening balance.

Schedules have inclusive start/end competences. An installment count defines the last competence and current installment. A day greater than the last day of a month is clamped to that last day. A schedule does not insert a new database row each time someone views the dashboard. Forecasts are calculated until explicitly realized.

Realizing a forecast captures one transaction per source and competence. This transaction replaces the forecast, including when cancelled, and retains its recorded amount if the schedule changes. Editing a schedule recalculates all of its unrealized months. To change a recurring amount prospectively, end the current schedule and create another from the new competence. There is no accounting month-close lock in this release.

## Totals and balances

- Expected income consists of recurring income and non-cancelled explicit income entries.
- Expenses and investments remain separate. Transfers and invoice payments never enter either expense total.
- Free planned balance = income + third-party expense participation - expenses - investments. Participation represents amounts attributable to people not marked `isSelf`, and is not a guarantee of reimbursement.
- Third-party remaining amounts are displayed per competence as participation less paid settlements. Positive settlements represent money received; negative settlements represent money paid to another person. Settlements do not become salary or duplicate expenses.
- A credit-card purchase enters its invoice and the expense projection. The bank account is debited only by an explicit invoice-payment transaction. Realizing an expense charged to a card records the purchase; it does not mark the invoice paid.
- Credit-card forecast utilization uses the month's projected invoice, not the bank's full limit reservation for future installments. The total reported by the bank overrides the displayed invoice total, while the difference from the forecast remains visible. An absent limit or date is unknown rather than zero.
- Account balances include posted/paid direct movements, both legs of transfers, invoice payments and settlements, starting at the opening competence. Missing or planned movements do not affect realized cash.
- Meal allowance has its own ledger. The panel reconciles previous balance + credits - purchases = accumulated balance. The monthly result is distinct from accumulated balance. The filtered table's footer uses signed amounts instead of adding credits and purchases together. All balances use only recorded movements, starting from the earliest available entry.

## Goals and dashboard privacy

Goals and their contributions use separate validated resource kinds. `goalId` references must belong to the authenticated owner. A referenced goal cannot be deleted. Targets and contributions are positive integer cents; the optional monthly plan is nonnegative. All recorded contributions count toward lifetime progress, independently of the selected reporting competence. Goal tracking does not post movements to account balances or financial projections.

The privacy store starts hidden on every application load and resets on authentication changes. The dashboard renders fixed mask text rather than retaining formatted values behind CSS blur. Monetary labels and card summaries are masked, category bars do not expose their amounts, and the financial chart is not rendered while hidden, so its titles cannot leak values on hover. Revealing values is a session-only presentation preference. Other finance screens and authenticated API responses still expose the user's data; this is a visual privacy feature, not an access-control boundary.

## Historical imports

The original history is kept separately for audit and browsing. It contributes to a monthly projection only when that month has no current transactions or active schedules. It is never blindly added to reconstructed forecasts. If a historical month requires partial reconstruction, reconcile its records explicitly instead of mixing archive and live source records. Historical rows do not reconstruct bank cash balances because their original bank accounts and exact payment dates are unavailable.

Legacy import keys and audit rows preserve provenance and backup compatibility. Future imports should use independent format adapters and strict domain validation. User-level row locking serializes financial writes. Optimistic record versions prevent one open tab from silently overwriting another tab's changes. Referenced lookup records cannot be deleted.

## Security and operations

Password hashes use scrypt with independent random salts. Session tokens contain 256 bits of randomness; only their SHA-256 hashes are persisted. Cookies are HttpOnly, SameSite=Lax and Secure in production. Password-reset tokens are hashed, single-use and expiring; reset invalidates existing sessions. API reads and writes always scope to the authenticated owner. CSRF origin checks, rate limits, Helmet headers, body limits and strict input schemas are applied centrally.

Finance queries set the owner context and role on the same transaction/connection. `SET LOCAL ROLE` and `set_config(..., true)` expire at transaction end, preventing pool-context leakage. Policies use both `USING` and `WITH CHECK`. A query accidentally omitting its owner filter is still isolated. The finance role cannot read password hashes, session tokens or reset tokens. The trusted maintenance principal deliberately retains access for authentication and backups; RLS does not make a leaked maintenance credential harmless. No database credential is delivered to the browser.

Vue text interpolation escapes user-provided labels, notes and descriptions. There is no user-controlled HTML/template execution. The component checks exercise malicious HTML payloads, and CSV serialization neutralizes spreadsheet formulas including leading whitespace/control characters. All API responses are marked `Cache-Control: no-store`.

Local PGlite uses a dedicated directory and must have one API process. Production refuses to start without a PostgreSQL URL and an HTTPS application origin. Multi-instance deployments should move rate limiting to shared storage. Large accounts should add server pagination and incremental summaries; the current personal application loads the account's records together.

Production email delivery, provider access, HTTPS, automated off-site backups and deployment are environment configuration steps. Shared finance spaces, live bank integrations, investment market pricing, automatic debit, push notifications and scheduled emails are not part of this implementation.
