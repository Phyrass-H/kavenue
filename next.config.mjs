/** @type {import('next').NextConfig} */

// ⚑ THE BUILD REFUSES TO SHIP A HOSTED DEV SIGN-IN (2026-09-04).
//
// `.env.example` has said "Leave UNSET in real production" since the key was
// introduced. A sentence in a template is not enforcement: the key was set in
// Vercel Production anyway, and it was ALSO written into two tracked files in a
// PUBLIC repo — `project/DOMAIN_MIGRATION.md` and `project/SESSION_LOG_ARCHIVE.md`.
// Measured on 2026-09-04, before it was revoked: a wrong key returned 403 on both
// dispatch.kavenue.fr and driver.kavenue.fr, and the PUBLISHED key returned 400 —
// meaning it matched, and only the missing `?as=` stopped a real sign-in.
//
// This is the second published credential in two days (S74 found a password that
// opened 6 accounts including admin@kavenue.fr). Both times the rule already
// existed in prose. So the rule is executable now: a production build carrying
// DEV_LOGIN_KEY fails loudly here instead of deploying a working back door.
//
// ⚑ Preview and local are untouched on purpose — the key exists so the founder can
// test a hosted build without email. It is only the PRODUCTION deployment, the one
// on the real domains, that may never carry it.
if (process.env.VERCEL_ENV === "production" && process.env.DEV_LOGIN_KEY) {
  throw new Error(
    [
      "",
      "  ⚑ DEV_LOGIN_KEY is set on a PRODUCTION build. Refusing to build.",
      "",
      "  With it set, /api/dev-login on the live domains signs anyone in who has the",
      "  key — and a key has already been published in this repo once.",
      "",
      "  Fix: Vercel → project kavenue → Settings → Environment Variables →",
      "  delete DEV_LOGIN_KEY (and DEV_PASSWORD) from Production, then redeploy.",
      "  Keep them on Preview/Development if you still want hosted dev sign-in there.",
      "",
      "  ⚑ If a key was ever exposed, deleting the variable is the fix. Editing it out",
      "  of a file is not — git history keeps the value.",
      "",
    ].join("\n"),
  );
}

const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
