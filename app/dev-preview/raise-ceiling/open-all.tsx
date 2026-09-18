"use client";

import { useEffect, useState } from "react";

/**
 * Opens every schedule row once, so the preview shows the expanded detail — and turns
 * the REAL links and buttons off. The rows are made-up trips: "Edit details" would open
 * the real Business area for an id that does not exist, and a browser signed in as a
 * Driver is (rightly) sent to its own home, the Pool. The founder hit exactly that, S83.
 * Only the new panels (raise, change the car) stay live.
 */
export function OpenAll() {
  const [note, setNote] = useState(false);
  useEffect(() => {
    document.querySelectorAll<HTMLDetailsElement>("details.dx-trip").forEach((d) => {
      d.open = true;
    });
    const live = ".rc, .rc-wrap, .rc-inline, .dx-act--btn, .dx-amend--warn .dx-amend__btn";
    const stop = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.closest(live) || el.closest("summary")) return;
      const link = el.closest("a[href]");
      const cancel = el.closest("button") && /Cancel trip|Sign out/.test(el.closest("button")!.textContent ?? "");
      if (link || cancel) {
        e.preventDefault();
        e.stopPropagation();
        setNote(true);
        window.setTimeout(() => setNote(false), 2500);
      }
    };
    document.addEventListener("click", stop, true);
    return () => document.removeEventListener("click", stop, true);
  }, []);
  return note ? (
    <div className="notice warn" style={{ position: "fixed", bottom: 16, right: 16, zIndex: 50, margin: 0 }}>
      Preview — links are off here. Only the new panels work.
    </div>
  ) : null;
}
