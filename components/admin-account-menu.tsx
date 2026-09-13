"use client";

// The admin's own account, in the console header: the email opens a small card with Sign out.
//
// ⚑ S80 — THE CONSOLE HAD NO WAY OUT. The Driver app signs out from Settings and Dispatch from its
// shell; the admin header only printed the email (founder, 2026-09-13: *"I cannot logout the
// activity console"*). Of two previews — a visible link, or a menu under the email — the founder
// chose the menu.
// ⚑ A CLIENT COMPONENT because signing out clears the browser's session cookie
// (lib/supabase/client) and the card has to open and close. The layout around it stays
// server-rendered.
// ⚑ A DISCLOSURE, NOT role="menu". The card holds a sentence and one button; an ARIA menu promises
// arrow-key navigation between items and may contain nothing but items.
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AdminAccountMenu({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const signOutButton = useRef<HTMLButtonElement>(null);
  const cardId = useId();

  // Open: focus goes to the one thing in the card. It closes on a click anywhere else, and on
  // Escape, which also hands focus back to the email it came from.
  useEffect(() => {
    if (!open) return;
    signOutButton.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // ⚑ ONLY AN ESCAPE MEANT FOR THE CARD (S80 review). The listener is on the document, so without
      //   this an Escape that clears a search box — or closes the document viewer — also shut the card
      //   and yanked focus up into the header. Body focus counts as ours: nothing else holds it.
      const at = document.activeElement;
      if (at && at !== document.body && !wrap.current?.contains(at)) return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // ⚑ A FAILED SIGN-OUT GIVES FOCUS BACK TO THE BUTTON (S80 review). It was disabled while it worked,
  //   and disabling the focused element drops focus to the page — so "Try again" could not be done
  //   with the Enter key it had just used. Runs once the button is enabled again.
  useEffect(() => {
    if (failed && !pending) signOutButton.current?.focus();
  }, [failed, pending]);

  function signOut() {
    setFailed(false);
    startTransition(async () => {
      const { error } = await createClient().auth.signOut();
      // ⚑ A FAILED SIGN-OUT IS SAID, NOT SWALLOWED. The session cookie would still be there, so
      //   sending the admin to /login would bounce them straight back into the console — and the
      //   button would look like it did nothing.
      if (error) {
        setFailed(true);
        return;
      }
      router.replace("/login?side=admin");
      router.refresh();
    });
  }

  return (
    <div
      className="adm-acct"
      ref={wrap}
      // ⚑ TABBING OUT CLOSES IT (S80 review): a card left open behind a keyboard user is the one that
      //   catches their next Escape. Only a move to a KNOWN element outside counts — a click on the
      //   card's own text, or the button disabling itself, blurs to nothing and must not shut it.
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (open && to && !wrap.current?.contains(to)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`adm-acct__btn${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onClick={() => {
          // A reopened card starts clean — an old "Couldn't sign out" is not news any more.
          if (!open) setFailed(false);
          setOpen((o) => !o);
        }}
      >
        {email}
        <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div id={cardId} className="adm-acct__card">
          <p className="adm-acct__who">Signed in as {email}</p>
          <button
            ref={signOutButton}
            type="button"
            className="adm-acct__out"
            onClick={signOut}
            disabled={pending}
          >
            <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
            {pending ? "Signing out…" : "Sign out"}
          </button>
          {failed && (
            <p className="adm-acct__err" role="alert">
              Couldn’t sign out. Try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
