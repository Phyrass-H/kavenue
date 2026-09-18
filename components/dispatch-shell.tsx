"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  List,
  CalendarDays,
  FileText,
  History as HistoryIcon,
  Wallet,
  Settings as SettingsIcon,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/dispatch", label: "Schedule", icon: List },
  { href: "/dispatch/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dispatch/drafts", label: "Drafts", icon: FileText },
  { href: "/dispatch/history", label: "History", icon: HistoryIcon },
  { href: "/dispatch/spend", label: "Spend", icon: Wallet },
] as const;

const TITLES: Record<string, string> = {
  "/dispatch": "Schedule",
  "/dispatch/calendar": "Calendar",
  "/dispatch/drafts": "Drafts",
  "/dispatch/history": "History",
  "/dispatch/spend": "Spend",
  "/dispatch/new": "New mission",
  "/dispatch/settings": "Settings",
};

const STORAGE_KEY = "pickup-dx-collapsed";

export function DispatchShell({
  businessName,
  logoUrl,
  draftCount = 0,
  children,
}: {
  businessName: string;
  logoUrl?: string | null;
  draftCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Restore the persisted collapsed state after mount (avoids hydration mismatch).
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  // Close the account menu on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Dismiss the account menu on outside-click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function signOut() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  const title = TITLES[pathname] ?? "Dispatch";
  // Dense data views fill the screen (was capped at 1120 + left-aligned, leaving
  // dead space on wide monitors). The new-mission form and other narrow pages
  // keep the default comfortable width.
  const wideMain =
    pathname === "/dispatch" ||
    pathname === "/dispatch/calendar" ||
    pathname === "/dispatch/history" ||
    pathname === "/dispatch/spend" ||
    // Dev-only previews of the schedule render at the schedule's own width.
    pathname.startsWith("/dev-preview/");

  // Up-to-two-letter monogram for the workspace tile when there's no logo.
  const initials =
    businessName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase() || "•";

  return (
    <div className="dx-shell">
      <aside className={`dx-sidebar${collapsed ? " is-collapsed" : ""}`}>
        <div className="dx-sidebar__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/logo.png" alt="" aria-hidden="true" />
          <span className="dx-label dx-brandname">
            Kavenue{" "}
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
              Dispatch
            </span>
          </span>
          <button
            className="dx-toggle"
            onClick={toggle}
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            title={collapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>

        <nav className="dx-nav">
          <Link
            href="/dispatch/new"
            className={`dx-navitem dx-navitem--cta${pathname === "/dispatch/new" ? " is-active" : ""}`}
            title="New mission"
          >
            <Plus />
            <span className="dx-label">New mission</span>
          </Link>
          <div className="dx-navsep" />
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`dx-navitem${pathname === href ? " is-active" : ""}`}
              title={label}
            >
              <Icon />
              <span className="dx-label">{label}</span>
              {href === "/dispatch/drafts" && draftCount > 0 && (
                <span
                  className="dx-badge"
                  title={`${draftCount} draft${draftCount === 1 ? "" : "s"}`}
                >
                  {draftCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="dx-sidebar__foot">
          <Link
            href="/dispatch/settings"
            className={`dx-navitem${pathname === "/dispatch/settings" ? " is-active" : ""}`}
            title="Settings"
          >
            <SettingsIcon />
            <span className="dx-label">Settings</span>
          </Link>
        </div>
      </aside>

      <div className="dx-content">
        <div className="dx-topbar">
          <span className="dx-topbar__title">{title}</span>
          <div className="dx-acctmenu" ref={menuRef}>
            <button
              type="button"
              className={`dx-acctchip${menuOpen ? " is-open" : ""}`}
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={businessName}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="dx-acctchip__logo" src={logoUrl} alt="" />
              ) : (
                <span
                  className="dx-acctchip__logo dx-acctchip__logo--initials"
                  aria-hidden="true"
                >
                  {initials}
                </span>
              )}
              <span className="dx-acctchip__name">{businessName}</span>
              <ChevronDown className="dx-acctchip__caret" />
            </button>
            {menuOpen && (
              <div className="dx-acctpop" role="menu">
                <div className="dx-acctpop__head">
                  <span className="dx-acctpop__name">{businessName}</span>
                  <span className="dx-acctpop__sub">Business account</span>
                </div>
                <div className="dx-acctpop__sep" />
                <button
                  type="button"
                  className="dx-acctpop__item"
                  role="menuitem"
                  onClick={signOut}
                  disabled={pending}
                >
                  <LogOut />
                  <span>{pending ? "Signing out…" : "Sign out"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
        <main className={`dx-main${wideMain ? " dx-main--wide" : ""}`}>{children}</main>
      </div>
    </div>
  );
}
