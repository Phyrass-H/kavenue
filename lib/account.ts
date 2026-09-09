// Account & records — shared metadata for the settings/documents surfaces.
// Document labels name the real French legal documents a VTC Driver / Business
// must provide; the surrounding UI chrome stays English (glossary: Driver,
// Business, …). No "client"/"principal". See docs/02 + the document table.
import type { DocumentType, DocumentStatus } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// What a Driver has to file, in three piles (S48). The piles matter: a Driver
// asked for "your papers" thinks of their licence, not of a Kbis, and the
// and the company pile only exists so Kavenue can pay them legally.
// ---------------------------------------------------------------------------
export type DocGroup = "personal" | "company" | "vehicle";

export const DOC_GROUP_LABEL: Record<DocGroup, string> = {
  personal: "You",
  company: "Your company",
  vehicle: "Your vehicle",
};

// A one-line reason the group exists, shown beside its heading.
export const DOC_GROUP_NOTE: Record<DocGroup, string> = {
  personal: "what lets you drive",
  company: "so we can pay you",
  vehicle: "the car you drive",
};

export interface DocMeta {
  group: DocGroup;
  label: string;
  /** What it actually is, in a Driver's words — shown on the document page. */
  blurb: string;
  /** Two-sided papers file one row per side (licence, VTC card). */
  twoSided?: boolean;
  /** Whether we ask for an expiry date, and roughly how often it comes round. */
  expiry: "required" | "none";
  /** Renewal cadence, in plain words. Only when `expiry` is required. */
  renews?: string;
}

const DOC_META: Record<DocumentType, DocMeta> = {
  drivers_licence: {
    group: "personal",
    label: "Driver’s licence",
    blurb: "Your permis B. Both sides, and it has to still be valid.",
    twoSided: true,
    expiry: "required",
    renews: "every 15 years",
  },
  vtc_card: {
    group: "personal",
    label: "VTC card",
    blurb: "Your professional card. Without it, no trip is legal.",
    twoSided: true,
    expiry: "required",
    renews: "every 5 years",
  },
  revtc: {
    group: "personal",
    label: "VTC register (REVTC)",
    blurb: "Proof you’re on the national register of VTC operators.",
    expiry: "none",
  },
  medical_certificate: {
    group: "personal",
    label: "Medical certificate",
    blurb: "Your visite médicale. Checked in roadside controls.",
    expiry: "required",
    renews: "every 5 years, or every 2 after 60",
  },
  kbis: {
    group: "company",
    label: "Kbis or SIRENE notice",
    blurb: "Proof your company exists. An avis de situation SIRENE works too.",
    expiry: "none",
  },
  rc_pro: {
    group: "company",
    label: "Professional liability (RC Pro)",
    blurb: "Your professional insurance, covering you and the Guest.",
    expiry: "required",
    renews: "every year",
  },
  vehicle_registration: {
    group: "vehicle",
    label: "Carte grise",
    blurb: "The registration certificate for the car you drive.",
    expiry: "none",
  },
  insurance: {
    group: "vehicle",
    label: "Vehicle insurance",
    blurb: "Your carte verte — the car’s own cover, with VTC use declared.",
    expiry: "required",
    renews: "every year",
  },
  company_registration: {
    group: "company",
    label: "Company registration (Kbis)",
    blurb: "Proof the Business exists.",
    expiry: "none",
  },
};

export function documentMeta(t: DocumentType): DocMeta {
  return DOC_META[t];
}

export function documentLabel(t: DocumentType): string {
  return DOC_META[t].label;
}

// Ordered as a Driver would complete their file: what lets them drive, then the
// company Kavenue pays, then the car. (Doc 02 / backlog A.)
export const DRIVER_DOC_TYPES: readonly DocumentType[] = [
  "drivers_licence",
  "vtc_card",
  "revtc",
  "medical_certificate",
  "kbis",
  "rc_pro",
  "vehicle_registration",
  "insurance",
];

export const DRIVER_DOC_GROUPS: readonly DocGroup[] = ["personal", "company", "vehicle"];

export function driverDocTypes(group: DocGroup): DocumentType[] {
  return DRIVER_DOC_TYPES.filter((t) => DOC_META[t].group === group);
}

// A Business proves who it is with a single registration document for V1.
export const BUSINESS_DOC_TYPES: readonly DocumentType[] = ["company_registration"];

const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
};

export function documentStatusLabel(s: DocumentStatus): string {
  return DOC_STATUS_LABELS[s];
}

// Maps a document status to a CSS notice/pill tone (reuse globals.css classes).
export function documentStatusTone(s: DocumentStatus): "warn" | "success" | "error" {
  return s === "verified" ? "success" : s === "rejected" ? "error" : "warn";
}

// ---------------------------------------------------------------------------
// Lifecycle. A document isn't just uploaded-or-not: it gets reviewed, and most
// of them expire. `document.expires_at` has existed since day one and was never
// written — S48 finally uses it, because an expired VTC card is exactly as
// blocking as a missing one and nobody notices the day it lapses.
// ---------------------------------------------------------------------------
export type DocState = "missing" | "pending" | "rejected" | "expired" | "expiring" | "valid";

/** A document is "expiring" once it's inside this window. */
export const EXPIRY_WARN_DAYS = 30;

export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return Math.ceil((then.getTime() - now.getTime()) / 86_400_000);
}

export function docState(
  doc: { status: DocumentStatus | null; expiresAt: string | null },
  now: Date = new Date(),
): DocState {
  if (!doc.status) return "missing";
  if (doc.status === "rejected") return "rejected";
  // Expiry outranks review state: a verified-but-lapsed paper is not usable, and
  // a pending one that has already lapsed shouldn't read as merely "in review".
  const left = daysUntil(doc.expiresAt, now);
  if (left !== null) {
    if (left < 0) return "expired";
    if (left <= EXPIRY_WARN_DAYS) return "expiring";
  }
  if (doc.status === "pending") return "pending";
  return "valid";
}

export function docStateTone(s: DocState): "success" | "warn" | "error" | "neutral" {
  if (s === "valid") return "success";
  if (s === "expiring" || s === "pending") return "warn";
  if (s === "missing") return "neutral";
  return "error";
}

/** The short line under a document's name in the list. */
export function docStateLabel(
  s: DocState,
  doc: { expiresAt: string | null },
  now: Date = new Date(),
): string {
  const left = daysUntil(doc.expiresAt, now);
  switch (s) {
    case "missing":
      return "Not added yet";
    case "pending":
      return "With us for review";
    case "rejected":
      return "Needs a new photo";
    case "expired":
      return "Expired";
    case "expiring":
      return left === 0
        ? "Expires today"
        : left === 1
          ? "Expires tomorrow"
          : `Expires in ${left} days`;
    default:
      return "Valid";
  }
}

/** Does this state stop the Driver working? (Shown, not enforced, in beta.) */
export function blocksWork(s: DocState): boolean {
  return s === "missing" || s === "expired" || s === "rejected";
}
