# Phase 3 — Feedback / Request a Game

## Routes and workflow

`/requests` is a public, mobile-first form linked quietly from the storefront footer
as **Request a game / Feedback**. It requires no login. The two form types are:

- Request a Game: game name (required, 120 characters), requested item (optional,
  160), note/message (optional, 2,000), WhatsApp/contact (optional, 120).
- Feedback: General / Storefront / Checkout / Product Request / Other category,
  message (required, 2,000), WhatsApp/contact (optional, 120).

Inputs are plain text; HTML markup and inappropriate control characters are rejected.
Messages may contain newlines/tabs. Optional blank fields are stored as null. The
server whitelists fields for the selected type and ignores client IDs/statuses/times.
The database supplies the ID, Pending status and creation time. Success replaces the
form with a thank-you message; failures retain the draft.

`POST /api/requests` accepts unauthenticated JSON submissions and returns only
`{ success: true }` (202) on confirmation/retry; there is no public request-read API.
A UUID submission key is retained for retries of an unchanged draft. A unique
database constraint prevents duplicate rows/notifications on concurrent retries.
Editing a draft starts a new submission key. Reloading also starts a fresh draft.

`/admin/requests` is linked from the admin dashboard. It uses the existing Supabase
getUser/admin_users check and authenticated browser client. Cards show type,
game/category, item, message summary/full text, optional contact, BNT timestamp and
status. A status select saves Pending / Reviewed / Added / Rejected. Updates write
only status and compare its previous value; a zero-row/conflicting update reports an
error and asks for a reload. The server-side authority is RLS, not the client check.

Status and requested-game filters are available. Case and repeated whitespace are
normalized for repeated-game counts across all statuses. Counts are submissions,
not unique people; aliases such as MLBB and Mobile Legends are not merged. Reads
use 500-row pages and discard partial reads on errors so counts are not silently
limited by the usual API row cap. Larger-scale server-side search/counts are deferred.

## SQL — prepared, NOT applied

The exact SQL is [`sql/phase-3-customer-requests.sql`](sql/phase-3-customer-requests.sql).
It creates only `public.customer_requests`, a created-time index, and that table's
constraints/grants/policies. No existing product/order/payment tables or policies,
functions, grants, cron or extensions are changed.

Columns: id UUID PK, submission_key UUID UNIQUE, request_type, game_name,
requested_item, feedback_category, message, contact, status, created_at timestamptz.
Types, statuses, lengths, plain-text fields and type-specific required fields have
database constraints. RLS is enabled in the same transaction.

- Anonymous customers submit through the validated server endpoint. `anon` has no
  direct table privileges, avoiding a Data API bypass around anti-spam validation.
  Anonymous users cannot list requests or set statuses.
- Authenticated users get SELECT and column-only UPDATE(status) privileges, with
  both operations restricted by RLS to existing admin_users membership. Non-admins
  see no rows. UPDATE has both USING and WITH CHECK membership predicates.
- The existing server-only Supabase secret client gets INSERT/SELECT on this new
  table for validated submissions and confirmation. No client secret is exposed.

The SQL depends on the already-working admin_users self-read policy. Before release,
review/apply it separately to a test database and exercise anonymous/direct REST,
non-admin and admin RLS behavior. This implementation did not execute the SQL against
any database. The feature will return a clear unavailable message until SQL is applied.
After validation, the migration needs a separate authorized production application
before deploying the new code. No production application is authorized by this task.

## Telegram

`telegram-requests.ts` uses the existing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID,
5-second timeout, no redirects and disabled link previews. It sends plain text with
type, reference, game/category, optional item/contact, a bounded message excerpt and
timestamp. Full text remains in Admin Requests. It never sets HTML/Markdown mode.

Only a newly confirmed insert schedules a notification through Next.js `after`.
Duplicate-key retries do not notify. Missing configuration, scheduling, HTTP, API,
fetch or response failures cannot undo the saved submission or change its success.
Logs contain no submitted text, contacts, raw exceptions or token-bearing URLs.
This is best effort, matching the existing order pattern: no outbox/retry system is
added, so a process crash after save or a Telegram failure can lose a notification.
The existing order notification helper and API are untouched.

## Lightweight anti-spam

- A visually hidden honeypot, removed from keyboard/assistive navigation, silently
  accepts bot-filled forms without inserting a row or sending a notification.
- Actual streamed JSON is bounded to 8,192 bytes even without/trusting no Content-Length.
  Invalid JSON/content type, foreign browser Origin and invalid bounded text are rejected.
- Up to five validated attempts per ten-minute window per Cloudflare connecting IP,
  per worker instance. Only a hash is held in memory; raw IPs are not stored/logged.
  The map is capped at 2,000 keys and expired entries are reclaimed. Rejected attempts
  return 429 with Retry-After. Failed database attempts also consume this allowance.
- The throttle is best effort: worker instances/restarts have separate state and
  non-Cloudflare environments without CF-Connecting-IP skip this throttle. Deploy
  behind Cloudflare, which supplies/overwrites that header. X-Forwarded-For is ignored.
  This is not a distributed rate limiter or a CAPTCHA replacement. Stronger managed
  protection can be added later if abuse warrants it.

No new dependencies, secret rotation or catalog import is included. Existing
purchase flows, Admin Products, Bulk Edit, and order Telegram behavior are unchanged.
