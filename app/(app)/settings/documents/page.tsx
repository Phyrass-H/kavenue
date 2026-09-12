import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { getAppContext } from "@/lib/app-context";
import { getLatestDocuments, type DocView } from "@/lib/documents";
import {
  DRIVER_DOC_TYPES,
  DRIVER_DOC_GROUPS,
  DOC_GROUP_LABEL,
  DOC_GROUP_NOTE,
  documentLabel,
  documentMeta,
  docState,
  docStateLabel,
  docStateTone,
} from "@/lib/account";
import { DocumentIcon } from "@/components/document-icon";
import { SettingsHeader } from "@/components/settings-header";

export const dynamic = "force-dynamic";

function DocRow({ doc }: { doc: DocView }) {
  const state = docState(doc);
  const tone = docStateTone(state);
  const meta = documentMeta(doc.type);
  // A two-sided paper with one side filed is "started", not done — say which.
  const line =
    state === "valid" && doc.incomplete
      ? "Back side still missing"
      : docStateLabel(state, doc);

  return (
    <Link href={`/settings/documents/${doc.type}`} className="ddoc">
      <span className={`ddoc__ic ddoc__ic--${tone}`}>
        <DocumentIcon type={doc.type} />
      </span>
      <span className="ddoc__t">
        <b>{documentLabel(doc.type)}</b>
        <span className={`ddoc__st ddoc__st--${tone}`}>{line}</span>
      </span>
      {state === "missing" || state === "expired" || state === "rejected" ? (
        <span className="ddoc__cta">{state === "missing" ? "Add" : "Replace"}</span>
      ) : (
        <ChevronRight size={16} strokeWidth={2} className="drow__ch" aria-hidden="true" />
      )}
      {meta.twoSided && <span className="sr-only">Two-sided document</span>}
    </Link>
  );
}

export default async function DocumentsPage() {
  const ctx = await getAppContext();
  if (!ctx.driver) redirect("/onboarding");
  const { driver, liveCar } = ctx;

  const docs = await getLatestDocuments("driver", driver.id, DRIVER_DOC_TYPES);
  const byType = new Map(docs.map((d) => [d.type, d]));
  const valid = docs.filter((d) => docState(d) === "valid").length;
  const attention = docs.filter((d) => {
    const s = docState(d);
    return s === "expiring" || s === "expired" || s === "rejected";
  }).length;

  const carName = liveCar?.make
    ? [liveCar.make, liveCar.model].filter(Boolean).join(" ")
    : "Your vehicle";

  return (
    <>
      <SettingsHeader
        title="Documents"
        sub={`${valid} of ${docs.length} valid${attention ? ` · ${attention} need${attention > 1 ? "" : "s"} attention` : ""}`}
      />

      {DRIVER_DOC_GROUPS.map((group) => {
        const types = DRIVER_DOC_TYPES.filter((t) => documentMeta(t).group === group);
        if (types.length === 0) return null;
        return (
          <div className="dcard" key={group}>
            <p className="dcard__label dcard__label--split">
              <span>{group === "vehicle" ? carName : DOC_GROUP_LABEL[group]}</span>
              <em>{group === "vehicle" && liveCar?.plate ? liveCar.plate : DOC_GROUP_NOTE[group]}</em>
            </p>
            {types.map((t) => {
              const doc = byType.get(t);
              return doc ? <DocRow key={t} doc={doc} /> : null;
            })}
          </div>
        );
      })}

      <div className="dlock dlock--foot" style={{ marginTop: 0 }}>
        <Lock size={15} strokeWidth={1.9} aria-hidden="true" />
        <span>
          Only Kavenue sees these. A Business sees your name, your photo and the car
          that’s coming — never your papers.
        </span>
      </div>
    </>
  );
}
