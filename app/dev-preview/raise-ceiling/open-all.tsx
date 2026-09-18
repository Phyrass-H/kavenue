"use client";

import { useEffect } from "react";

/** Opens every schedule row once, so the preview shows the expanded detail. */
export function OpenAll() {
  useEffect(() => {
    document.querySelectorAll<HTMLDetailsElement>("details.dx-trip").forEach((d) => {
      d.open = true;
    });
  }, []);
  return null;
}
