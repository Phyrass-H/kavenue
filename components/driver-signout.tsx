"use client";

// Sign out lived in the old top header; with the bottom tab bar it moves into
// Settings (its natural home).
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MSG_CLEAR } from "@/lib/offline-waybill";

export function DriverSignOut() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      // § 4 — the saved Waybills go too. Each one names a Business, a Guest's pickup
      // and a price, and the next person to hold this phone is not this Driver.
      navigator.serviceWorker?.controller?.postMessage({ type: MSG_CLEAR });
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className="btn secondary dsignout"
      onClick={signOut}
      disabled={pending}
    >
      <LogOut size={17} strokeWidth={1.75} aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
