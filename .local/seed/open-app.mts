// Wait for the dev server, then open the sign-in menu in the browser.
//
// ⚑ WHY THIS EXISTS. The founder tests on their Mac, and the honest answer to
// "I need dev access to test Driver side and Business side" was always
// `localhost/dev-login` — no key, because `hosted` is false locally and the gate
// only applies to deployed builds. They had been reaching for a live URL and a
// key instead, and a session spent an hour on Vercel before establishing that
// they never leave the Mac. One command, no address to remember.
// ⚑ IT WAITS FOR A PAGE THAT WORKS, NOT FOR A PORT THAT ANSWERS. The first version
// opened the browser on any status at all, so on 2026-09-09 it cheerfully opened
// Safari onto a 500 — a stale server whose `.next` a second server had overwritten.
// "The app is broken" and "the app is not up yet" look identical to a port check.
// `dev-guard.mts` now clears the port before `next dev` starts, so a 200 here can
// only come from the server this command just launched.
const URL_ = "http://localhost:3000/dev-login";

let opened = false;
for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(URL_, { redirect: "manual" });
    if (r.status === 200) {
      const { execFile } = await import("node:child_process");
      execFile("open", [URL_]);
      console.log(`\n  Opened ${URL_}\n
  Click "Business" or "Driver". Nothing to type.

  ⚑ Leave this window open — closing it stops the app.\n`);
      opened = true;
      break;
    }
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 500));
}

if (!opened) {
  console.log(`
  The app did not come up cleanly, so I have not opened the browser.
  ${URL_} never answered 200 within a minute.

  The compile error is in this window, above. If it mentions
  \`ENOENT ... .next/server/...\`, stop this command and run:

      rm -rf .next && npm run test-app
`);
}
