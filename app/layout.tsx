import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kavenue",
  description: "Kavenue — the booking platform linking VTC Drivers with Businesses.",
  manifest: "/manifest.webmanifest",
  // § 4 — the manifest shipped `"icons": []` until 2026-09-01, so "Add to Home Screen"
  // offered a screenshot of the page instead of the mark. It matters beyond looks: the
  // saved Waybills survive far better in an installed app than in a browser tab.
  // ⚑ Generated from public/logo.png. Re-generate them when the navy logo re-export
  // lands (BACKLOG) — they carry the current sky-blue mark.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Kavenue", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Let env(safe-area-inset-*) resolve to real insets so the fixed Driver tab
  // bar sits above the iOS home indicator in the installed PWA.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
