// § 4 — the Waybill, off the network. The service worker.
//
// WHAT A SERVICE WORKER IS, for whoever reads this next: a small script the browser
// keeps after the tab closes and puts in FRONT of the network. Every request the app
// makes passes through `fetch` below, so when there is no signal this file is the only
// thing that can still answer.
//
// ⚑ IT IS SERVED RAW, SO IT CANNOT IMPORT FROM `lib/`. The four constants below are
// re-declared by hand from `lib/offline-waybill.ts`, and `tests/offline-waybill.test.ts`
// reads this file and fails if they ever drift. Change one, change both.
const CACHE = "kavenue-waybill-v1";
const INDEX_URL = "/__kavenue/waybill-index";
const WAYBILLS_PATH = "/waybills";
const MSG_CACHE = "kavenue:cache-waybills";
const MSG_CLEAR = "kavenue:clear";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function waybillPath(id) {
  return "/missions/" + id + "/waybill";
}

function waybillIdFromPath(pathname) {
  const m = /^\/missions\/([^/]+)\/waybill\/?$/.exec(pathname);
  return m ? m[1] : null;
}

// A response is only worth keeping if it is the page we asked for. A redirect to
// /login is a 200 by the time fetch resolves it, and caching THAT would hand a Driver a
// login screen at a roadside check.
function keepable(res) {
  return !!res && res.ok && !res.redirected && res.type === "basic";
}

async function readIndex(cache) {
  const hit = await cache.match(INDEX_URL);
  if (!hit) return null;
  try {
    return await hit.json();
  } catch {
    return null;
  }
}

// ⚑ EVERYTHING IS KEYED BY PATHNAME, QUERY STRIPPED. `next dev` serves its stylesheet as
// `/_next/static/css/app/layout.css?v=<timestamp>` and stamps a NEW timestamp on every
// rebuild. Keeping the query would file one copy per rebuild and — the bug this comment
// exists for — the fetch handler below looks a miss up by pathname, so the saved document
// came back with no stylesheet at all: the right words, in Times New Roman, handed to a
// police officer. In production the filename carries a content hash, so the pathname IS
// the version and nothing is lost by dropping the query.
function assetKey(u) {
  return new URL(u, self.location.origin).pathname;
}

// The cached HTML is useless unstyled. Pulling the assets this page actually references
// is both cheap and exact. Returns the keys it holds, so the caller can drop the rest.
async function cacheAssets(cache, html) {
  const urls = new Set();
  const re = /(?:href|src)="(\/_next\/static\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) urls.add(m[1]);
  const kept = [];
  await Promise.all(
    [...urls].map(async (u) => {
      const key = assetKey(u);
      kept.push(key);
      try {
        const res = await fetch(u);
        if (keepable(res)) await cache.put(key, res);
      } catch {
        /* one missing chunk must not fail the whole save */
      }
    }),
  );
  return kept;
}

async function saveWaybills(trips) {
  const cache = await caches.open(CACHE);
  const saved = [];
  const assets = new Set();
  const now = new Date().toISOString();

  // The list page itself, so there is something to land on with no signal.
  try {
    const res = await fetch(WAYBILLS_PATH);
    if (keepable(res)) {
      const html = await res.clone().text();
      await cache.put(WAYBILLS_PATH, res);
      (await cacheAssets(cache, html)).forEach((k) => assets.add(k));
    }
  } catch {
    /* offline already — keep whatever is there */
  }

  for (const t of trips) {
    const path = waybillPath(t.id);
    try {
      const res = await fetch(path);
      // ⚑ A Waybill that REFUSES (the Driver's company details are short) is still a
      // 200 and still worth having: it tells them what is missing. What we must never
      // keep is a login page or a 404 — `keepable` is the whole guard.
      if (!keepable(res)) continue;
      const html = await res.clone().text();
      await cache.put(path, res);
      (await cacheAssets(cache, html)).forEach((k) => assets.add(k));
      saved.push({ ...t, savedAt: now });
    } catch {
      // No network for this one. If an older copy is already in the cache it stays,
      // with its own older stamp — that is the point of the stamp.
      const old = await cache.match(path);
      if (old) {
        const prev = await readIndex(cache);
        const before = prev && prev.trips.find((x) => x.id === t.id);
        saved.push({ ...t, savedAt: (before && before.savedAt) || undefined });
      }
    }
  }

  // Trips that left the held list drop out of the index AND out of the cache: a Waybill
  // for a trip this Driver no longer holds is a document about someone else's work.
  const keep = new Set(saved.map((t) => waybillPath(t.id)));
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    if (waybillIdFromPath(p) && !keep.has(p)) await cache.delete(req);
    // ⚑ And the assets of builds nobody references any more. Without this the cache
    // grows by one stylesheet per deploy, forever, on a Driver's phone.
    if (assets.size > 0 && p.startsWith("/_next/static/") && !assets.has(p)) {
      await cache.delete(req);
    }
  }

  const index = { savedAt: now, trips: saved };
  await cache.put(
    INDEX_URL,
    new Response(JSON.stringify(index), {
      headers: { "content-type": "application/json" },
    }),
  );
  return index;
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === MSG_CACHE) {
    event.waitUntil(
      saveWaybills(Array.isArray(data.trips) ? data.trips : []).then((index) => {
        if (event.source) event.source.postMessage({ type: MSG_CACHE, index });
      }),
    );
  }
  // Signing out takes the documents with it. They name a Business, a Guest's pickup and
  // a price, and the next person to hold this phone is not necessarily this Driver.
  if (data.type === MSG_CLEAR) event.waitUntil(caches.delete(CACHE));
});

// ⚑ THE CACHED PAGE IS SERVED BYTE FOR BYTE. An earlier version rewrote the HTML here
// to stamp the copy, and it does not survive React: the page hydrates on load, React
// reconciles the DOM against its own component tree, and every node this file added is
// deleted. It passed the first offline test (no stylesheet, no JS, no hydration — stamp
// present) and failed the second (styled — stamp gone). The stamp is a component now:
// components/saved-copy.tsx. Nothing in here touches markup.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The index is not a route. It exists only inside the cache.
  if (url.pathname === INDEX_URL) {
    event.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(INDEX_URL).then((r) => r || new Response("null", {
          headers: { "content-type": "application/json" },
        })),
      ),
    );
    return;
  }

  // ⚑ NETWORK FIRST, EVERYWHERE. Cache-first would be faster on the hashed Next.js
  // assets, but it also serves yesterday's build during `npm run dev`, and a stale
  // document is the one thing this feature must never produce. The network wins
  // whenever there is one; the cache is strictly the fallback.
  const isAsset = url.pathname.startsWith("/_next/static/");
  const isDoc = req.mode === "navigate";
  if (!isAsset && !isDoc) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (keepable(res) && (isAsset || url.pathname === WAYBILLS_PATH ||
            waybillIdFromPath(url.pathname))) {
          await cache.put(url.pathname, res.clone());
        }
        return res;
      } catch (err) {
        if (isAsset) {
          const hit = await cache.match(url.pathname);
          if (hit) return hit;
          throw err;
        }
        const saved = waybillIdFromPath(url.pathname)
          ? await cache.match(url.pathname)
          : null;
        if (saved) return saved;
        // Anywhere else in the app with no signal lands on the one page that works,
        // rather than on the browser's dinosaur.
        const list = await cache.match(WAYBILLS_PATH);
        if (list) return list;
        throw err;
      }
    })(),
  );
});
