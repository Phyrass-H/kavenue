# Domain migration — `pickupbedriven.com` → `kavenue.fr`

**Decided 2026-07-29 (Session 49).** Registrar: **OVHcloud**. Email: **Google Workspace**.
Old domain: **full cutover** (kavenue.fr only).

> `.com` is deferred until affordable. Everything below is written so that adding
> `kavenue.com` later is a copy of Part 1 with one word changed.

**Who does what:** every step marked **[YOU]** happens outside the repo (OVH, Vercel,
Google, Supabase, Mapbox) — Claude has no access to those. Steps marked **[CLAUDE]**
are code + deploy. Do them in order; each gate says what "done" looks like.

---

## The four hostnames

| Host | Serves |
|---|---|
| `kavenue.fr` | landing splash + role routing (`app/page.tsx`) |
| `www.kavenue.fr` | same (redirect to apex) |
| `driver.kavenue.fr` | the Driver app |
| `dispatch.kavenue.fr` | the Business / Dispatch app |

Separate subdomains are load-bearing, not cosmetic: each gets its own **host-only
session cookie**, which is what lets you be signed in as a Driver and a Business at
the same time. Mapping lives in [`lib/hosts.ts`](../lib/hosts.ts).

---

# PART 1 — The domain — ✅ DONE 2026-07-29

Deployed `0306bb7`. Verified: apex serves the landing splash; `driver.` / `dispatch.`
route to their own `/login`; both dev-logins work and hold **separate sessions
simultaneously**, so the host-only cookie split survived the move. The legacy domain
still resolves and routes (cutover closes at Step 12). The only `pickupbedriven` string
left in the compiled output is the deliberate `PROD_DOMAINS` constant.

`www.kavenue.fr` → **308 → `kavenue.fr`**, path-preserving (`/pool` → `kavenue.fr/pool`).
Certificate: Let's Encrypt, valid to 2026-10-27.

### Step 1 [YOU] — Add the four domains in Vercel

Vercel → the Kavenue project → **Settings → Domains → Add**. Add all four:

```
kavenue.fr
www.kavenue.fr
driver.kavenue.fr
dispatch.kavenue.fr
```

Environment: **Production**.

⚠️ **Uncheck "Redirect apex domains to www (recommended)"** — it is checked by default.
Leaving it on makes `www.kavenue.fr` the canonical address and demotes `kavenue.fr` to a
redirect; we want the reverse. Then, once added, set `www.kavenue.fr` → **Redirect to
Another Domain → `kavenue.fr`** (308 Permanent) from the domains list.

Vercel will then show a **"Invalid Configuration"** panel per domain listing the exact
DNS records it wants. **Screenshot or paste that to Claude** rather than trusting the
values below — Vercel has changed them before, and the panel is the source of truth.

**What Vercel gave us (2026-07-29).** The CNAME target is **per-project** — it is not
the old generic `cname.vercel-dns.com`, and the apex IP is no longer `76.76.21.21`:

| Type | Name | Value |
|---|---|---|
| A | `@` | `216.198.79.1` |
| CNAME | `www` | `b995c589bd56b1fa.vercel-dns-017.com.` |
| CNAME | `driver` | `b995c589bd56b1fa.vercel-dns-017.com.` |
| CNAME | `dispatch` | `b995c589bd56b1fa.vercel-dns-017.com.` |

> Do **not** switch the nameservers to Vercel. We keep DNS at OVH so the app records
> and the Google Workspace mail records live in one zone.

**Gate:** all four domains listed in Vercel, each showing the records it wants.

---

### Step 2 [YOU] — ⚠️ Delete OVH's default mail records FIRST

**This is the single most common way an OVH + Google Workspace setup fails.** When you
buy a domain, OVH pre-fills the zone with its **own** MX records (its bundled "MX Plan"
mailbox) and its **own** SPF record. If you leave them, mail silently goes to an OVH
mailbox you never check, and having two SPF records makes **both** fail.

OVHcloud manager → **Web Cloud → Domains → kavenue.fr → DNS zone** tab.

Delete:
- every **MX** record pointing at `mx*.ovh.net` / `mail*.ovh.net`
- the **TXT** record on `@` containing `v=spf1 include:mx.ovh.com ...`
- the pre-filled **A** on `@` and the **www** record (they point at OVH's parking
  page) — replace, don't stack; two A records on `@` round-robin and half your
  traffic lands on the wrong server
- ⚠️ any **AAAA** on `@`. Easiest one to miss: Vercel only gives an IPv4 A record,
  so a leftover OVH AAAA sends IPv6 visitors to the parking page while the site
  looks perfectly fine to you over IPv4

OVH may warn that your MX no longer matches your email offer. **That warning is correct
and expected — confirm it.**

**Gate:** the DNS zone has zero MX records and zero SPF TXT records.

---

### Step 3 [YOU] — Add the Vercel records in the OVH DNS zone

Same panel. Add exactly what Vercel showed you in Step 1.

OVH quirks to expect:
- For the apex, the **sub-domain field is left blank** (that's OVH's `@`).
- CNAME targets must end with a trailing dot: `cname.vercel-dns.com.`
- OVH batches edits — click **"Apply the modifications"** at the end or nothing saves.

Propagation is usually minutes, but OVH's TTL default is 3600s (1h). Allow an hour
before deciding something is broken.

**Gate:** Vercel's Domains page shows a green **Valid Configuration** on all four, and
`https://kavenue.fr` loads the app over HTTPS (Vercel issues the certificate itself).

---

### Step 4 [YOU] — Supabase auth allowlist

**Without this, sign-in silently fails on the new domain** — no error, just a bounce
back to the Site URL.

Supabase → project `luitjivedqiumefhfzkw` → **Authentication → URL Configuration**:

- **Site URL:** `https://kavenue.fr`
- **Redirect URLs** — add all of these, and keep the localhost one:
  ```
  https://kavenue.fr/auth/callback
  https://www.kavenue.fr/auth/callback
  https://driver.kavenue.fr/auth/callback
  https://dispatch.kavenue.fr/auth/callback
  http://localhost:3000/auth/callback
  ```

**Note from the actual run:** there were **no** old-domain entries to preserve — the
redirect list was empty and `http://localhost:3000` was sitting in the *Site URL* field.
That means magic-link sign-in was never allowlisted for production at all, which is
consistent with real auth being a deferred integration. Nothing was lost; localhost was
re-added to the redirect list so local dev still works the day auth is switched on.

**Gate:** the five URLs are listed and saved.

---

### Step 5 — Mapbox token restriction — ⏭️ SKIPPED, not needed

**Probed 2026-07-29: the token has no URL restrictions at all** — the geocoding API
returns 200 for `kavenue.fr`, for the old domain, and for a request with *no* referer.
A restricted token rejects the no-referer case, so nothing was gating the new domain
and there was nothing to add. Original instructions kept below for the day we do lock
it down.

> **⚑ Follow-up, not blocking (logged here so it isn't lost).** An unrestricted public
> token ships in the JS bundle by design, so anyone can lift it and spend the quota.
> Mapbox's auto-created *Default public token* can't be meaningfully restricted — the
> fix is to **create a new public token with URL restrictions** (`kavenue.fr`,
> `*.kavenue.fr`, `localhost`), swap it into `.env.local` **and** the Vercel env vars,
> and redeploy. Half an hour, any time.

**Also fails silently.** The public token is domain-restricted; on an unlisted origin
the address autocomplete just returns nothing, with no console error.

mapbox.com → **Account → Tokens →** your public token (`pk.…`) → **URL restrictions**.
Add:

```
kavenue.fr
*.kavenue.fr
```

**Gate:** both entries saved on the token.

---

### Step 6 [CLAUDE] — Code + deploy

> ⚠️ **Do not deploy before Step 3's gate is green.** The app *generates* `PROD_BASE`
> URLs, so once this is live a role redirect on the old domain points at
> `driver.kavenue.fr`. If that doesn't resolve yet, the live site breaks. DNS first.

Five touches, no schema, no behaviour change:

- [`lib/hosts.ts`](../lib/hosts.ts) — `PROD_BASE` → `kavenue.fr`; `isProdDomain()`
  temporarily accepts **both** domains so there is no cutover moment; header comment.
- [`app/page.tsx`](../app/page.tsx) — comment.
- [`components/landing-splash.tsx`](../components/landing-splash.tsx) — comment.
- [`app/(dispatch)/dispatch/settings/page.tsx`](<../app/(dispatch)/dispatch/settings/page.tsx>) — `support@` mailto + link text.
- [`components/help-legal-card.tsx`](../components/help-legal-card.tsx) — `support@` + `feedback@` mailto.

Then: `tsc` → deploy → fetch all four hostnames in-browser against the real DB.

**Gate:** Driver app on `driver.kavenue.fr`, Dispatch on `dispatch.kavenue.fr`, both
signed in, address autocomplete returning results.

---

### Step 7 [YOU] — New dev-login bookmarks

The key-gated URLs move. Replace your bookmarks:

- Business → `https://dispatch.kavenue.fr/dev-login?key=<DEV_LOGIN_KEY from .env.local>`
- Driver → `https://driver.kavenue.fr/dev-login?key=<DEV_LOGIN_KEY from .env.local>`

> ⚑⚑ **THE KEY THAT WAS WRITTEN HERE WAS LIVE, AND THIS REPO IS PUBLIC.** Measured
> 2026-09-04 before it was revoked: a wrong key returned **403** on both hosts and the
> published key returned **400** — meaning it *matched*, and only the missing `?as=`
> stopped a real sign-in. Anyone reading GitHub could have signed in as a Business or a
> Driver. ⚑ **Removing it from this file is NOT the fix** — git history keeps the value.
> The fix was deleting `DEV_LOGIN_KEY` from Vercel Production. A production build now
> refuses to compile while it is set (`next.config.mjs`), and `handoff-check` fails if a
> key value is ever written into a tracked file again. Never paste a key into `docs/` or
> `project/`; name the env var instead.

---

# PART 2 — Email — ✅ DONE 2026-07-29

Verified on a real received message:
`dkim=pass header.i=@kavenue.fr header.s=google` · `spf=pass` · `dmarc=pass (p=NONE)`.
One paid mailbox `phyrass@kavenue.fr`, three free aliases, 2FA on the super-admin.


### Which addresses, and how to not pay for them

Google Workspace Business Starter is **~€7/user/month**. You need **one** paid user —
your own. Everything else is a **free alias** on it, delivered to the same inbox:

| Address | Type | Why |
|---|---|---|
| `<yourname>@kavenue.fr` | **paid user** | your real mailbox — the only licence you buy |
| `support@kavenue.fr` | alias | already live in the app (Driver help card + Dispatch settings) |
| `feedback@kavenue.fr` | alias | already live in the app |
| `contact@kavenue.fr` | alias | GTM / hotel outreach |

Aliases are free and instant (up to 30 per user). Gmail can also **send as** any of
them with no SMTP setup, so a support reply comes from `support@kavenue.fr`.

> **Upgrade path, not needed yet:** when a second person joins, convert `support@` from
> an alias to a **Google Group** — still free, still no extra licence, but it gives a
> shared archive and multiple recipients. Don't do it today; the alias is simpler.

> **Don't create paid users for `support@`/`contact@`.** That's ~€21/month for three
> inboxes that all belong to one person.

---

### Step 8 [YOU] — Create the Google Workspace account

workspace.google.com → Get started. When it asks:

- **"Does your business have a domain?"** → Yes → `kavenue.fr`
- Choose **Business Starter** (upgrade later if you need shared drives / more storage)
- Create your own username: `<yourname>@kavenue.fr`

Google then needs to verify you own the domain and will give you a **TXT record**.

**Gate:** you're holding a `google-site-verification=…` TXT value.

---

### Step 9 [YOU] — Verification TXT + MX in the OVH zone

Back to **OVH → Domains → kavenue.fr → DNS zone**. Add:

**Verification** (delete it later once verified — harmless either way):

| Type | Name | Value |
|---|---|---|
| TXT | *(blank)* | `google-site-verification=…` |

**MX** — Google's setup wizard shows the exact records. New accounts get a **single**
record; only older setups use the five `ASPMX` ones. Use whatever the wizard displays:

| Type | Name | Priority | Value |
|---|---|---|---|
| MX | *(blank)* | 1 | `smtp.google.com.` |

**SPF** — exactly one SPF record on the domain, ever:

| Type | Name | Value |
|---|---|---|
| TXT | *(blank)* | `v=spf1 include:_spf.google.com ~all` |

Apply the modifications. Then finish verification in the Google console.

**Gate:** Google says the domain is verified and Gmail is active.

---

### Step 10 [YOU] — DKIM + DMARC (do not skip — this is deliverability)

DKIM can only be generated *after* the account exists, so it's a second pass.

**DKIM:** Google Admin console → **Apps → Google Workspace → Gmail → Authenticate
email** → select `kavenue.fr` → **Generate new record** (2048-bit) → it gives you a
host (`google._domainkey`) and a long TXT value.

| Type | Name | Value |
|---|---|---|
| TXT | `google._domainkey` | `v=DKIM1; k=rsa; p=…` (long) |

Add it at OVH, wait ~1h, then click **Start authentication** in the Google console.

**DMARC** — start permissive and tighten once you've seen the reports:

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<yourname>@kavenue.fr` |

Move `p=none` → `p=quarantine` → `p=reject` over a few weeks, once the reports show
only your own senders. Doing it on day one can bin your own mail.

**Gate:** Google Admin shows DKIM **authenticating**.

---

### Step 11 [YOU] — Aliases + a real test

Google Admin → **Directory → Users →** your user → **Alternate email addresses**.
Add `support`, `feedback`, `contact`.

Then, from an outside address (your Gmail), **send a mail to `support@kavenue.fr`** and
confirm it lands. Reply from the alias to confirm the send-as path works.

**Gate:** a round trip through `support@kavenue.fr` works both directions.

---

# PART 3 — Close the cutover — ✅ DONE 2026-07-29

### Step 12 [CLAUDE] — Drop the old domain from the code — ✅ `bce11e6`
`isProdDomain()` back to a single `PROD_BASE` check. Verified after deploy: `kavenue.fr` unchanged
(200 / 307 / 307 / 308), `pickupbedriven.com` → **404**.

### Step 13 [YOU] — Clean up — ✅ done
- Vercel → Settings → Domains → **remove** the four `pickupbedriven.com` entries.
- Supabase → remove the old `pickupbedriven.com` redirect URLs.
- Mapbox → remove the old domain from the token restrictions.
- OVH → the old domain's zone can be left to lapse.

> **Worth keeping registered even on a full cutover** (~€10/yr): beta users have it
> bookmarked, and it appears throughout `project/` and the git history. Letting a third
> party register a domain that used to be yours is a small, permanent nuisance. Your
> call — it's the only line item here with an ongoing cost.

### Step 14 [CLAUDE] — Update the docs — ✅ done
`project/NEXT_SESSION.md` (CURRENT STATE + the founder-action list), `.env.example`,
`README.md`, `project/CHANGELOG.md`, `project/SESSION_LOG.md`, `project/DECISIONS.md`.

---

## Noted for later — do NOT do it now

**Transactional email (the deferred notifications phase, Resend).** When that phase
starts, send from a **subdomain** — `send.kavenue.fr` — with its own SPF/DKIM. It does
not touch the Google MX records above, and it keeps the sending reputation of
"1,000 mission alerts a day" separate from your human mailbox. Mentioned here only so
that whoever is next in the OVH DNS panel knows the plan.

**Still not renamed, deliberately** (unchanged by this migration): the
`PickUp_project_dev` directory, the `Phyrass-H/Pickup-marketplace` repo slug, the
`pickup_*` transport columns, and the `*@pickup.local` dev-login identities — those map
to real Supabase auth rows and renaming the string alone breaks dev-login.
