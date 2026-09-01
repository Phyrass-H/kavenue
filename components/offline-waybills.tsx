"use client";

// § 4 — the Waybill, off the network. The two client pieces.
//
// `WaybillCacheSync` runs on every Driver page and is invisible: it registers the
// service worker and hands it the current held trips, so the copies refresh themselves
// without the Driver ever choosing to save anything. That is the whole design — a Driver
// reaching for this document has a police officer at the window and is not going to
// remember a button they last saw in June.
//
// `SavedWaybills` is the one page that opens with no signal.
import { useCallback, useEffect, useState } from "react";
import { FileText, ChevronRight, WifiOff, Check } from "lucide-react";
import { shortPlaceLabel } from "@/lib/format";
import {
  MSG_CACHE,
  SW_PATH,
  WAYBILL_INDEX_URL,
  reachable,
  savedLabel,
  waybillPath,
  waybillWhen,
  type SavedWaybill,
  type WaybillIndex,
} from "@/lib/offline-waybill";

async function worker(): Promise<ServiceWorker | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register(SW_PATH);
    const reg = await navigator.serviceWorker.ready;
    return reg.active;
  } catch {
    // Private mode, an unsupported browser, a blocked registration. The app is
    // unaffected; only the offline copy is lost, and print-to-PDF still exists.
    return null;
  }
}

/** What is actually on this phone. The service worker answers this from the cache. */
async function readIndex(): Promise<WaybillIndex | null> {
  try {
    const res = await fetch(WAYBILL_INDEX_URL, { cache: "no-store" });
    const body = await res.json();
    return body && Array.isArray(body.trips) ? (body as WaybillIndex) : null;
  } catch {
    return null;
  }
}

/**
 * Ask the database what the Driver holds, then ask the worker to save each one.
 * Resolves with the index the worker wrote, so a caller can render the truth rather
 * than what it hoped happened.
 */
async function sync(): Promise<WaybillIndex | null> {
  const sw = await worker();
  if (!sw) return null;
  let trips: SavedWaybill[] = [];
  try {
    const res = await fetch("/api/waybills", { cache: "no-store" });
    const body = await res.json();
    trips = Array.isArray(body?.trips) ? body.trips : [];
  } catch {
    return readIndex();
  }
  return new Promise((resolve) => {
    const done = (e: MessageEvent) => {
      if (e.data?.type !== MSG_CACHE) return;
      navigator.serviceWorker.removeEventListener("message", done);
      resolve(e.data.index ?? null);
    };
    navigator.serviceWorker.addEventListener("message", done);
    sw.postMessage({ type: MSG_CACHE, trips });
    // The worker answers in well under a second on a live connection. If it doesn't,
    // fall back to whatever is already saved rather than spinning at the Driver.
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", done);
      void readIndex().then(resolve);
    }, 8000);
  });
}

/** Invisible. Mounted once in the Driver layout, so every page open refreshes the copies. */
export function WaybillCacheSync() {
  useEffect(() => {
    void sync();
  }, []);
  return null;
}

export function SavedWaybills() {
  const [index, setIndex] = useState<WaybillIndex | null>(null);
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    // ⚑ `reachable()`, never `navigator.onLine` — see lib/offline-waybill.ts. The green
    // "your trips will open without signal" is a promise to someone about to drive into a
    // car park, so it may only appear when we have actually spoken to Kavenue.
    const live = await reachable();
    setOnline(live);
    setIndex(live ? await sync() : await readIndex());
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    const again = () => void refresh();
    window.addEventListener("online", again);
    window.addEventListener("offline", again);
    return () => {
      window.removeEventListener("online", again);
      window.removeEventListener("offline", again);
    };
  }, [refresh]);

  const trips = index?.trips ?? [];
  const now = new Date();

  return (
    <>
      <h1 className="wbl-h">Waybills</h1>
      <p className="wbl-sub">Saved on this phone</p>

      {!ready ? (
        <div className="wbl-note wbl-note--quiet">
          <span>Checking what’s saved…</span>
        </div>
      ) : !online ? (
        <div className="wbl-note wbl-note--quiet">
          <WifiOff size={15} strokeWidth={1.9} aria-hidden="true" />
          <span>No signal. These are the copies already on your phone.</span>
        </div>
      ) : trips.length > 0 ? (
        <div className="wbl-note wbl-note--ok">
          <Check size={15} strokeWidth={2} aria-hidden="true" />
          <span>
            Up to date. Your {trips.length} trip{trips.length === 1 ? "" : "s"} will open
            without signal.
          </span>
        </div>
      ) : null}

      {trips.length === 0 && ready ? (
        <div className="wbl-empty">
          <FileText size={20} strokeWidth={1.6} aria-hidden="true" />
          <p className="wbl-empty__t">Nothing saved yet</p>
          <p className="wbl-empty__s">
            {online
              ? "Accept a trip and its waybill lands here on its own, ready for a control with no signal."
              : "There was no copy on this phone when the signal went. Carry your own justificatif."}
          </p>
        </div>
      ) : (
        <ul className="wbl-list">
          {trips.map((t) => (
            <li key={t.id}>
              {/* ⚑ A plain anchor, not <Link>. With no signal a client-side navigation
                  asks the server for the next screen and gets nothing; a real document
                  request is what the service worker can answer. */}
              <a href={waybillPath(t.id)} className="wbl-row">
                <div>
                  <p className="wbl-row__b">{t.business}</p>
                  <p className="wbl-row__w">
                    {waybillWhen(t.pickupAt)} · {shortPlaceLabel(t.pickupAddress)}
                  </p>
                  <p className="wbl-row__s">{savedLabel(t.savedAt, now)}</p>
                </div>
                <ChevronRight size={15} strokeWidth={1.9} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {ready && (
        <p className="dhint wbl-foot">
          {online
            ? "Kavenue saves these on its own, every time you open the app."
            : "A trip you took on after this was saved won’t be here until you have signal again."}
        </p>
      )}
    </>
  );
}
