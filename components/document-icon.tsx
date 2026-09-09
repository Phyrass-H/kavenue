import {
  BadgeCheck,
  BookMarked,
  Building2,
  CreditCard,
  FileText,
  Shield,
  ShieldCheck,
  Stethoscope,
  Umbrella,
} from "lucide-react";
import type { DocumentType } from "@/lib/database.types";

// One glyph per paper, so a Driver finds the right row without reading. Kept out of
// lib/account.ts on purpose — that module is imported by server code that has no
// business pulling in an icon set.
const ICONS: Record<DocumentType, typeof FileText> = {
  drivers_licence: CreditCard,
  vtc_card: BadgeCheck,
  revtc: BookMarked,
  medical_certificate: Stethoscope,
  kbis: Building2,
  rc_pro: Umbrella,
  vehicle_registration: FileText,
  insurance: Shield,
  company_registration: Building2,
};

export function DocumentIcon({ type, size = 18 }: { type: DocumentType; size?: number }) {
  const Icon = ICONS[type];
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />;
}
