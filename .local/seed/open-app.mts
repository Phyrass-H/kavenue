// Wait for the dev server, then open the sign-in menu in the browser.
//
// ⚑ WHY THIS EXISTS. The founder tests on their Mac, and the honest answer to
// "I need dev access to test Driver side and Business side" was always
// `localhost/dev-login` — no key, because `hosted` is false locally and the gate
// only applies to deployed builds. They had been reaching for a live URL and a
// key instead, and a session spent an hour on Vercel before establishing that
// they never leave the Mac. One command, no address to remember.
const URL_ = "http://localhost:3000/dev-login";

for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch("http://localhost:3000/", { redirect: "manual" });
    if (r.status > 0) {
      const { execFile } = await import("node:child_process");
      execFile("open", [URL_]);
      console.log(`\n  Opened ${URL_}\n
  Click "Business" or "Driver". Nothing to type.

  ⚑ Leave this window open — closing it stops the app.\n`);
      break;
    }
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 500));
}
