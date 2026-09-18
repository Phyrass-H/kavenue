// S83 — what a signed-in browser session can reach on the LIVE database, asked from the browser.
// Paste into the browser console (Safari: Develop → Show JavaScript Console) on a Kavenue page
// while signed in (localhost:3000 via /dev-login → Driver is fine: it is the same database).
//
//   kvRead()   — SAFE. Only HEAD/GET requests: row COUNTS, never a name or a number. Run any time.
//   kvWrite()  — every request names the nil id 00000000-…-000000000000, so it can match no row:
//                a write the database allows changes NOTHING and answers 204; a write it refuses
//                answers 42501. ⚑ Run it only once the throw-away run (run.sh) says each one is
//                refused, and only after the S83 migration is pasted.
//
// Nothing here is a secret: the project URL and the public (anon) key are already in every page's
// JavaScript — kvKey() finds the key there — and the session token is the one this browser holds.
(() => {
  const URL_ = "https://luitjivedqiumefhfzkw.supabase.co";
  const NIL = "00000000-0000-0000-0000-000000000000";

  // the signed-in session: @supabase/ssr keeps it in a (possibly chunked) cookie, base64url JSON
  function kvToken() {
    const parts = document.cookie.split("; ").map((c) => c.split("="))
      .filter(([k]) => /^sb-luitjivedqiumefhfzkw-auth-token(\.\d+)?$/.test(k))
      .sort(([a], [b]) => (+(a.split(".")[1] ?? -1)) - (+(b.split(".")[1] ?? -1)));
    if (!parts.length) return null;
    let v = decodeURIComponent(parts.map(([, x]) => x).join(""));
    if (v.startsWith("base64-")) v = atob(v.slice(7).replace(/-/g, "+").replace(/_/g, "/"));
    try { return JSON.parse(v).access_token ?? null; } catch { return null; }
  }

  // the public key, read from the page's own scripts (the anon JWT says role "anon")
  async function kvKey() {
    const srcs = [...document.scripts].map((s) => s.src).filter(Boolean);
    for (const src of srcs) {
      const txt = await fetch(src).then((r) => r.text()).catch(() => "");
      const pub = txt.match(/sb_publishable_[A-Za-z0-9_-]{10,}/);
      if (pub) return pub[0];
      for (const m of txt.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
        try {
          const p = JSON.parse(atob(m[0].split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          if (p.role === "anon") return m[0];
        } catch {}
      }
    }
    throw new Error("could not find the public key in this page's scripts — open any app page and retry");
  }

  async function call(key, token, method, path, body) {
    const headers = { apikey: key, Authorization: `Bearer ${token ?? key}`, Prefer: "count=exact" };
    if (body) headers["Content-Type"] = "application/json";
    const r = await fetch(URL_ + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const range = r.headers.get("content-range");            // "0-24/37" or "*/0"
    const count = range ? range.split("/")[1] : null;
    let code = "";
    if (!r.ok) { try { const j = await r.json(); code = j.code ?? j.error ?? ""; } catch {} }
    return { status: r.status, count, code };
  }

  const head = (key, tok, rel, q = "") => call(key, tok, "HEAD", `/rest/v1/${rel}?select=*${q}`);

  window.kvRead = async function kvRead() {
    const key = await kvKey();
    const tok = kvToken();
    if (!tok) console.warn("kvRead: no signed-in session found — the rows below are what a SIGNED-OUT visitor (anon) sees");
    const me = tok ? await fetch(URL_ + "/rest/v1/profile?select=role", { headers: { apikey: key, Authorization: `Bearer ${tok}` } }).then((r) => r.json()).catch(() => null) : null;
    const rows = [];
    const row = async (what, expectDriver, p) => { const r = await p; rows.push({ what, status: r.status, count: r.count ?? "", code: r.code, "a Driver should see": expectDriver }); };
    for (const who of [["signed out (anon)", null], [`signed in (${me?.[0]?.role ?? "?"})`, tok]]) {
      if (who[1] === null && tok === null && rows.length) break;
      rows.push({ what: `── ${who[0]}`, status: "", count: "", code: "", "a Driver should see": "" });
      const t = who[1];
      await row("pooled trips (mission_read)", "the Pool only", head(key, t, "mission_read", "&status=eq.pooled"));
      await row("  … of them with a Guest name", "0 before accept (S83 decision)", head(key, t, "mission_read", "&status=eq.pooled&passenger_name=not.is.null"));
      await row("  … with a flight number", "S83 decision", head(key, t, "mission_read", "&status=eq.pooled&flight_number=not.is.null"));
      await row("  … with a Business reference", "0 (S83 decision)", head(key, t, "mission_read", "&status=eq.pooled&reference=not.is.null"));
      await row("  … with a board file path", "0 (S83 decision)", head(key, t, "mission_read", "&status=eq.pooled&board_file_path=not.is.null"));
      await row("trips on the mission TABLE", "pooled + own", head(key, t, "mission"));
      await row("driver rows", "1 (self)", head(key, t, "driver"));
      await row("dispatcher rows", "0", head(key, t, "dispatcher"));
      await row("business rows", "0", head(key, t, "business"));
      await row("document rows (papers)", "own only", head(key, t, "document"));
      await row("vehicle rows", "own only", head(key, t, "vehicle"));
      await row("guest contact rows", "0", head(key, t, "mission_guest_contact"));
      await row("change requests (amendments)", "own trips only", head(key, t, "mission_amendment"));
      await row("access requests", "0", head(key, t, "access_request"));
      await row("commission rates", "0 (Business/admin only)", head(key, t, "commission_rate"));
      await row("rate card", "0 (Business/admin only)", head(key, t, "rate_card"));
      await row("storage: buckets listed", "0 / refused", call(key, t, "GET", "/storage/v1/bucket"));
      await row("storage: files listed in documents", "0 / refused", call(key, t, "POST", "/storage/v1/object/list/documents", { prefix: "", limit: 5 }));
    }
    console.table(rows);
    return "kvRead done — copy the table (right-click → Copy) and paste it back";
  };

  window.kvWrite = async function kvWrite() {
    const key = await kvKey();
    const tok = kvToken();
    if (!tok) throw new Error("kvWrite: sign in first");
    const tries = [
      ["PATCH mission_read (D145)",         "PATCH",  `/rest/v1/mission_read?id=eq.${NIL}`,          { driver_message: "probe" }],
      ["DELETE mission (D144)",             "DELETE", `/rest/v1/mission?id=eq.${NIL}`],
      ["PATCH mission.accepted_fare (D144)", "PATCH", `/rest/v1/mission?id=eq.${NIL}`,               { accepted_fare: 1 }],
      ["PATCH mission_amendment (S83)",     "PATCH",  `/rest/v1/mission_amendment?id=eq.${NIL}`,     { new_fare: 1 }],
      ["DELETE mission_amendment (S83)",    "DELETE", `/rest/v1/mission_amendment?id=eq.${NIL}`],
      ["PATCH status_event (S83)",          "PATCH",  `/rest/v1/status_event?id=eq.${NIL}`,          { status: "probe" }],
      ["PATCH document (S83)",              "PATCH",  `/rest/v1/document?id=eq.${NIL}`,              { file_url: "probe" }],
      ["DELETE document (S83)",             "DELETE", `/rest/v1/document?id=eq.${NIL}`],
      ["PATCH vehicle (2026-09-11b)",       "PATCH",  `/rest/v1/vehicle?id=eq.${NIL}`,               { plate: "probe" }],
      ["PATCH driver (2026-09-11b)",        "PATCH",  `/rest/v1/driver?id=eq.${NIL}`,                { verified: true }],
      ["DELETE mission_hold (S83)",         "DELETE", `/rest/v1/mission_hold?mission_id=eq.${NIL}`],
      ["PATCH mission_release (S83)",       "PATCH",  `/rest/v1/mission_release?id=eq.${NIL}`,       { from_fare: 1 }],
      ["DELETE mission_cancellation (S83)", "DELETE", `/rest/v1/mission_cancellation?id=eq.${NIL}`],
      ["PATCH payment (S83)",               "PATCH",  `/rest/v1/payment?id=eq.${NIL}`,               { amount: 1 }],
      ["DELETE business_event (S83)",       "DELETE", `/rest/v1/business_event?id=eq.${NIL}`],
      ["PATCH profile.role (S83)",          "PATCH",  `/rest/v1/profile?auth_user_id=eq.${NIL}`,     { role: "admin" }],
    ];
    const rows = [];
    for (const [what, method, path, body] of tries) {
      const r = await call(key, tok, method, path, body);
      rows.push({ what, status: r.status, code: r.code, verdict: r.code === "42501" ? "refused ✓" : r.status < 300 ? "ALLOWED (0 rows touched)" : "other — send it back" });
    }
    console.table(rows);
    return "kvWrite done — every row should read 'refused ✓'; copy the table and paste it back";
  };

  console.log("Kavenue probe loaded: run  await kvRead()  — and kvWrite() only when asked");
})();
