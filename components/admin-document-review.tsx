"use client";

// The reviewer's side of a Driver's papers — the only place in Kavenue that
// writes `document.status`.
//
// ⚑ A CLIENT COMPONENT, WHICH THE ADMIN CONSOLE OTHERWISE AVOIDS. The console is
// 100 % server-rendered on purpose. This one earns the exception for a single
// reason: rejecting needs a note, and a note needs somewhere to type it that
// only appears when you have decided to reject. Everything else here is a plain
// form posting a server action — no fetch, no client-side state about documents.
import { useActionState, useState } from "react";
import type { DocView } from "@/lib/documents";
import type { DocumentType } from "@/lib/database.types";
import {
  DOC_GROUP_LABEL,
  DOC_GROUP_NOTE,
  DRIVER_DOC_GROUPS,
  docState,
  docStateLabel,
  docStateTone,
  documentLabel,
  documentMeta,
  driverDocTypes,
} from "@/lib/account";
import {
  approveDocument,
  rejectDocument,
  setDriverVerified,
  type ReviewResult,
} from "@/lib/document-review";

const TONE_CLASS: Record<"success" | "warn" | "error" | "neutral", string> = {
  success: "adm-pill--ok",
  warn: "adm-pill--warn",
  error: "adm-pill--bad",
  neutral: "",
};

function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** One side of one document: view it, approve it, or reject it with a reason. */
function SideRow({
  driverId,
  docId,
  label,
  viewUrl,
  status,
  expiresAt,
  asksExpiry,
}: {
  driverId: string;
  docId: string;
  label: string | null;
  viewUrl: string | null;
  status: string;
  expiresAt: string | null;
  asksExpiry: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [okState, okAction] = useActionState<ReviewResult | null, FormData>(approveDocument, null);
  const [noState, noAction] = useActionState<ReviewResult | null, FormData>(rejectDocument, null);

  return (
    <div className="adm-doc__side">
      <div className="adm-doc__sideline">
        {label && <span className="adm-doc__sidename">{label}</span>}
        {viewUrl ? (
          <a className="adm-doc__view" href={viewUrl} target="_blank" rel="noreferrer">
            View
          </a>
        ) : (
          <span className="adm-doc__view adm-doc__view--none">no file</span>
        )}

        <form action={okAction} className="adm-doc__form">
          <input type="hidden" name="documentId" value={docId} />
          <input type="hidden" name="driverId" value={driverId} />
          {/* ⚑ The expiry travels with the APPROVE, so correcting a date and
              accepting the paper is one act rather than two. A type that asks
              for no expiry sends no field at all — see approveDocument. */}
          {asksExpiry && (
            <label className="adm-doc__exp">
              Expires
              <input type="date" name="expiresAt" defaultValue={dateInput(expiresAt)} />
            </label>
          )}
          <button type="submit" className="adm-btn" disabled={status === "verified"}>
            {status === "verified" ? "Approved" : "Approve"}
          </button>
        </form>

        {!rejecting && (
          <button type="button" className="adm-btn" onClick={() => setRejecting(true)}>
            Reject
          </button>
        )}
      </div>

      {rejecting && (
        <form action={noAction} className="adm-doc__reject">
          <input type="hidden" name="documentId" value={docId} />
          <input type="hidden" name="driverId" value={driverId} />
          <label className="adm-doc__why" htmlFor={`why-${docId}`}>
            Why are you rejecting it? The Driver reads this word for word.
          </label>
          <input
            id={`why-${docId}`}
            name="reviewNote"
            className="adm-doc__note"
            placeholder="The bottom edge is cut off — send the whole card."
            maxLength={400}
            autoFocus
          />
          <div className="adm-doc__rejectrow">
            <button type="submit" className="adm-btn adm-btn--bad">
              Reject and tell them
            </button>
            <button type="button" className="adm-btn" onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
          {noState && !noState.ok && <p className="adm-doc__err">{noState.message}</p>}
        </form>
      )}

      {okState && !okState.ok && <p className="adm-doc__err">{okState.message}</p>}
    </div>
  );
}

function DocRow({ driverId, doc }: { driverId: string; doc: DocView }) {
  const meta = documentMeta(doc.type);
  const state = docState({ status: doc.status, expiresAt: doc.expiresAt });
  const tone = docStateTone(state);
  const sides = [doc.front, doc.back].filter(Boolean) as NonNullable<DocView["front"]>[];

  return (
    <div className="adm-doc">
      <div className="adm-doc__head">
        <span className="adm-doc__name">{documentLabel(doc.type)}</span>
        {doc.expiresAt && (
          <span className="adm-doc__when">
            Expires {new Date(doc.expiresAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
        <span className={`adm-pill ${TONE_CLASS[tone]}`}>{docStateLabel(state, doc)}</span>
      </div>

      {/* ⚑ A REJECTED DOCUMENT SHOWS ITS OWN NOTE BACK TO THE REVIEWER. Without
          it you cannot tell, three days later, whether you already asked for a
          new one and what you asked for. */}
      {doc.reviewNote && state === "rejected" && (
        <p className="adm-doc__prev">You told them: “{doc.reviewNote}”</p>
      )}

      {sides.length === 0 ? (
        <p className="adm-doc__none">Nothing uploaded — there is nothing to review yet.</p>
      ) : (
        sides.map((s) => (
          <SideRow
            /* ⚑ KEYED ON THE STATUS TOO, so the row remounts when the verdict
               changes and the open "why are you rejecting it?" box closes itself.
               Without it, approving a document left the rejection form sitting
               underneath a row that now reads Valid. */
            key={`${s.id}:${s.status}`}
            driverId={driverId}
            docId={s.id}
            label={meta.twoSided ? (s.side === "back" ? "Back" : "Front") : null}
            viewUrl={s.viewUrl}
            status={s.status}
            expiresAt={doc.expiresAt}
            asksExpiry={meta.expiry === "required" && s.side !== "back"}
          />
        ))
      )}

      {doc.incomplete && sides.length > 0 && (
        <p className="adm-doc__none">
          Only one side is on file. Both are needed before this paper is complete.
        </p>
      )}
    </div>
  );
}

export function AdminDocumentReview({
  driverId,
  verified,
  docs,
}: {
  driverId: string;
  verified: boolean;
  docs: DocView[];
}) {
  const [vState, vAction] = useActionState<ReviewResult | null, FormData>(setDriverVerified, null);
  const byType = new Map<DocumentType, DocView>(docs.map((d) => [d.type, d]));
  const uploaded = docs.filter((d) => d.status != null).length;
  const waiting = docs.filter((d) => d.status === "pending").length;

  return (
    <>
      <section className="adm-sect">
        <h2 className="adm-sect__h">May they work?</h2>
        <div className="adm-verify">
          <span className={`adm-pill ${verified ? "adm-pill--ok" : "adm-pill--warn"}`}>
            {verified ? "Verified" : "Not verified"}
          </span>
          {/* ⚑ SAYS WHAT IT DOES, AND SINCE 2026-09-07 IT DOES SOMETHING. This copy
              used to warn the reviewer that the switch stopped nobody. It is now
              the door: accept_mission and place_hold both refuse an unverified
              Driver, so flipping it off takes someone's work away today. */}
          <span className="adm-verify__say">
            Your own judgement, not a total of the papers. Until you set it, this Driver cannot take
            or hold a single trip.
          </span>
          <form action={vAction}>
            <input type="hidden" name="driverId" value={driverId} />
            <input type="hidden" name="verified" value={verified ? "false" : "true"} />
            <button type="submit" className={`adm-btn${verified ? "" : " adm-btn--go"}`}>
              {verified ? "Take it back" : "Mark verified"}
            </button>
          </form>
        </div>
        {vState && !vState.ok && <p className="adm-doc__err">{vState.message}</p>}
      </section>

      <section className="adm-sect">
        <h2 className="adm-sect__h">Documents</h2>
        <p className="adm-lede">
          {uploaded} of {docs.length} uploaded
          {waiting > 0 && (
            <>
              {" · "}
              <strong className="adm-doc__waiting">{waiting} waiting on you</strong>
            </>
          )}
        </p>

        {DRIVER_DOC_GROUPS.map((group) => {
          const types = driverDocTypes(group);
          return (
            <div key={group} className="adm-docgrp">
              <h3 className="adm-docgrp__h">
                {DOC_GROUP_LABEL[group]}
                <span className="adm-docgrp__note"> — {DOC_GROUP_NOTE[group]}</span>
              </h3>
              {types.map((t) => {
                const doc = byType.get(t);
                return doc ? <DocRow key={t} driverId={driverId} doc={doc} /> : null;
              })}
            </div>
          );
        })}
      </section>
    </>
  );
}
