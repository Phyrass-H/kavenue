// Print the addresses to type on a phone, once `npm run dev:lan` is running.
//
// ⚑ WHY THIS EXISTS. Testing the Driver app properly means holding it — it is a
// PWA, used one-handed, at a rank. The founder does not need the live site for
// that; they need the app on their phone, and their Mac is already on the same
// wifi. This prints the exact thing to type, because "find your local IP" is
// the step that makes people give up.
import os from "node:os";

const nets = os.networkInterfaces();
const lan: string[] = [];
for (const name of Object.keys(nets)) {
  for (const n of nets[name] ?? []) {
    // IPv4, not the loopback, not a self-assigned 169.254.x link-local address.
    if (n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254.")) {
      lan.push(n.address);
    }
  }
}

if (lan.length === 0) {
  console.log(`
No wifi address found — this Mac does not look connected to a network.
Connect to the same wifi as your phone and run this again.`);
} else {
  const ip = lan[0];
  const base = `http://${ip}:3000`;
  console.log(`
On your phone — same wifi as this Mac — open:

    ${base}/dev-login

Then tap "Business" or "Driver". No key, no password, no typing an email.

Or go straight in:

    Business   ${base}/api/dev-login?as=business
    Driver     ${base}/api/dev-login?as=driver
    Théo       ${base}/api/dev-login?email=test.driver@kavenue.test
    Admin      ${base}/admin        (sign in with your own email)
${lan.length > 1 ? `\n(This Mac has more than one address — if the first does not load, try: ${lan.slice(1).join(", ")})` : ""}
⚑ Leave the Terminal window open. Closing it stops the server and the phone
  will stop loading.

⚑ "Add to Home Screen" from Safari's share menu to see it as a real Driver
  would — full screen, no browser bars. The offline Waybill will not work over
  wifi like this (it needs https), but everything else will.`);
}
