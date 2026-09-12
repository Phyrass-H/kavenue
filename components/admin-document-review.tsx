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
import { FileText } from "lucide-react";
import { fileKind } from "@/lib/document-kind";
import type { DocFile, DocView } from "@/lib/documents";
import { DocumentViewer, type ViewerItem } from "@/components/document-viewer";
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
import { setDriverVerified, type ReviewResult } from "@/lib/document-review";
import { approveVehicle, rejectVehicle } from "@/lib/vehicle-review";
import type { Pile } from "@/lib/driver-approvals";
import { CAR_STATUS_PILL, type ApprovalStatus } from "@/lib/vehicle-approval";
import { colourLabel, ENERGY_LABEL, type Energy } from "@/lib/vehicle-rules";

const TONE_CLASS: Record<"success" | "warn" | "error" | "neutral", string> = {
  success: "adm-pill--ok",
  warn: "adm-pill--warn",
  error: "adm-pill--bad",
  neutral: "",
};

function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** One side, as a thumbnail you click to open properly. */
function Thumb({ label, file, onOpen }: { label: string | null; file: DocFile; onOpen: () => void }) {
  const state = file.status;
  const kind = fileKind(file);
  return (
    <button type="button" className="adm-th" onClick={onOpen}>
      <span className="adm-th__box">
        {/* ⚑ MISSING IS CHECKED BEFORE PDF, and getting that backwards is what
            this screen was already wrong about. `isPdf` is the stored path's
            extension, and a row whose upload never happened still HAS a path —
            every `seed://…/x.pdf` row is one — so a PDF badge appeared over a
            document that does not exist. The reviewer must be able to tell those
            two apart from the list, without opening either.

            ⚑ A PDF that DOES exist gets no thumbnail, and that is not worth
            fixing: rendering page 1 needs a renderer on the server, and the
            reviewer only needs to know it is a PDF and be able to open it. */}
        {kind === "missing" ? (
          <span className="adm-th__none">no file</span>
        ) : kind === "pdf" ? (
          <span className="adm-th__pdf"><FileText size={20} strokeWidth={1.75} aria-hidden="true" />PDF</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.viewUrl!} alt="" loading="lazy" />
        )}
      </span>
      <span className="adm-th__cap">
        {label && <span className="adm-th__side">{label}</span>}
        <span className={`adm-th__st adm-th__st--${state}`}>
          {state === "verified" ? "Valid" : state === "rejected" ? "Rejected" : "Pending"}
        </span>
      </span>
    </button>
  );
}

function DocRow({
  doc,
  onOpen,
}: {
  doc: DocView;
  onOpen: (docId: string) => void;
}) {
  const meta = documentMeta(doc.type);
  const state = docState({ status: doc.status, expiresAt: doc.expiresAt });
  const tone = docStateTone(state);
  const sides = [doc.front, doc.back].filter(Boolean) as DocFile[];

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
        <div className="adm-doc__thumbs">
          {sides.map((f) => (
            <Thumb
              key={`${f.id}:${f.status}`}
              label={meta.twoSided ? (f.side === "back" ? "Back" : "Front") : null}
              file={f}
              onOpen={() => onOpen(f.id)}
            />
          ))}
          {/* ⚑ The missing half of a two-sided paper is drawn, not omitted — an
              absent slot is easy to scroll past; an empty frame is not. */}
          {meta.twoSided && doc.incomplete && (
            <span className="adm-th adm-th--gap">
              <span className="adm-th__box adm-th__box--gap">
                {doc.front ? "back" : "front"}<br />missing
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** The car on file, as this screen needs it. ⚑ Flat and pre-formatted by the server: this is a
 *  client component, and a car row carries columns (approved_by, last_written_by) that have no
 *  business crossing to a browser. */
export interface CarUnderReview {
  id: string;
  status: ApprovalStatus;
  make: string | null;
  model: string | null;
  plate: string | null;
  colour: string | null;
  seats: number | null;
  energy: string | null;
  firstRegistered: string | null;
  classSays: string;
  filedSays: string;
  rejectionNote: string | null;
}

export function AdminDocumentReview({
  driverId,
  driverName,
  verified,
  docs,
  piles,
  car,
  strandedSays,
}: {
  driverId: string;
  driverName: string;
  verified: boolean;
  docs: DocView[];
  /** Person / Company / Vehicle — computed once, server-side (lib/driver-approvals.ts). */
  piles: Pile[];
  car: CarUnderReview | null;
  /** ⚑ "Approving this would strand 2 First trips on Saturday" — the sentence, or null when
   *  nothing is stranded. Built server-side because it is a query, not a render. */
  strandedSays: string | null;
}) {
  const [vState, vAction] = useActionState<ReviewResult | null, FormData>(setDriverVerified, null);
  const byType = new Map<DocumentType, DocView>(docs.map((d) => [d.type, d]));

  // ⚑ ONE FLAT LIST ACROSS EVERY PAPER, in the order they are read on screen, so
  // the viewer's "3 of 11" and its arrows walk a Driver's whole file in one pass.
  // The founder reviews a PERSON, not a document at a time.
  const queue: ViewerItem[] = [];
  for (const group of DRIVER_DOC_GROUPS) {
    for (const t of driverDocTypes(group)) {
      const doc = byType.get(t);
      if (!doc) continue;
      const meta = documentMeta(t);
      for (const f of [doc.front, doc.back]) {
        if (!f) continue;
        queue.push({
          docId: f.id,
          title: meta.twoSided
            ? `${documentLabel(t)} · ${f.side === "back" ? "Back" : "Front"}`
            : documentLabel(t),
          viewUrl: f.viewUrl,
          isPdf: f.isPdf,
          status: f.status,
          uploadedAt: f.uploadedAt,
          expiresAt: doc.expiresAt,
          asksExpiry: meta.expiry === "required" && f.side !== "back",
          reviewNote: doc.reviewNote,
        });
      }
    }
  }
  const [openAt, setOpenAt] = useState<number | null>(null);
  const openDoc = (docId: string) => {
    const i = queue.findIndex((q) => q.docId === docId);
    if (i >= 0) setOpenAt(i);
  };
  const uploaded = docs.filter((d) => d.status != null).length;
  const waiting = docs.filter((d) => d.status === "pending").length;

  return (
    <>
      <section className="adm-sect">
        <h2 className="adm-sect__h">May they work?</h2>
        {/* ⚑ ALL THREE, ALWAYS, EVEN THE ONES THAT ARE FINE. The founder, 2026-09-12: *"even
            the company has to be approved! none can work if all together are not approved!"*
            A reviewer who sees only the thing that is blocking cannot tell "the rest is done"
            from "the rest was never checked". */}
        <ul className="adm-piles">
          {piles.map((p) => (
            <li key={p.pile} className={`adm-pile adm-pile--${p.state}`}>
              <span className="adm-pile__l">{PILE_TITLE[p.pile]}</span>
              <span className="adm-pile__s">{p.says}</span>
            </li>
          ))}
        </ul>
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

      <CarReview driverId={driverId} car={car} strandedSays={strandedSays} />

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
                return doc ? <DocRow key={t} doc={doc} onOpen={openDoc} /> : null;
              })}
            </div>
          );
        })}
      </section>

      {openAt !== null && (
        <DocumentViewer
          items={queue}
          index={openAt}
          driverId={driverId}
          driverName={driverName}
          onIndex={setOpenAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </>
  );
}

/** The admin's words for each pile. The Driver reads "You / Your company / Your car" on their
 *  own screen (lib/driver-approvals.ts); a reviewer is looking at someone else. */
const PILE_TITLE: Record<Pile["pile"], string> = {
  person: "Person",
  company: "Company",
  vehicle: "Vehicle",
};

/** § The car itself — what they typed, beside the papers that should prove it.
 *
 *  ⚑ THE TYPED FIELDS ARE THE POINT. The reviewer's job here is to compare a carte grise they
 *  can see with what the Driver entered; until this screen existed the console showed the car
 *  nowhere at all, so the comparison happened in someone's head or not at all. */
function CarReview({
  driverId,
  car,
  strandedSays,
}: {
  driverId: string;
  car: CarUnderReview | null;
  strandedSays: string | null;
}) {
  const [aState, aAction] = useActionState<ReviewResult | null, FormData>(approveVehicle, null);
  const [rState, rAction] = useActionState<ReviewResult | null, FormData>(rejectVehicle, null);
  const [rejecting, setRejecting] = useState(false);

  if (!car) {
    return (
      <section className="adm-sect">
        <h2 className="adm-sect__h">Their car</h2>
        <p className="adm-lede">No car on file. They cannot take a trip until they file one.</p>
      </section>
    );
  }

  const rows: [string, string][] = [
    ["Make and model", [car.make, car.model].filter(Boolean).join(" ") || "—"],
    ["Plate", car.plate ?? "—"],
    ["First registered", car.firstRegistered ?? "—"],
    [
      "Energy · colour · seats",
      [
        car.energy ? (ENERGY_LABEL[car.energy as Energy] ?? car.energy) : "—",
        colourLabel(car.colour),
        car.seats == null ? "—" : String(car.seats),
      ].join(" · "),
    ],
    ["Class it gives", car.classSays],
    ["Filed", car.filedSays],
  ];

  return (
    <section className="adm-sect">
      <h2 className="adm-sect__h">Their car</h2>
      <div className="adm-car">
        <span className={`adm-pill ${car.status === "approved" ? "adm-pill--ok" : car.status === "rejected" ? "adm-pill--bad" : "adm-pill--warn"}`}>
          {CAR_STATUS_PILL[car.status]}
        </span>
        <dl className="adm-car__grid">
          {rows.map(([k, v]) => (
            <div key={k} className="adm-car__row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {car.status === "rejected" && car.rejectionNote && (
          <p className="adm-car__note">You refused it: “{car.rejectionNote}”</p>
        )}

        {/* ⚑ SAID BEFORE THE BUTTON, NOT AFTER. Approving a car that cannot serve trips the
            Driver already holds is not an error the app should fix by itself — the founder
            ruled that giving a trip away goes through support ("it's a delicate matter, they
            should contact the support"). So the screen states it, and a person decides. */}
        {strandedSays && <p className="adm-car__strand">{strandedSays}</p>}

        {car.status !== "approved" && (
          <div className="adm-car__acts">
            <form action={aAction}>
              <input type="hidden" name="driverId" value={driverId} />
              <input type="hidden" name="vehicleId" value={car.id} />
              <button type="submit" className="adm-btn adm-btn--go">
                Approve this car
              </button>
            </form>
            {!rejecting ? (
              <button type="button" className="adm-btn" onClick={() => setRejecting(true)}>
                Refuse, with a reason
              </button>
            ) : (
              <form action={rAction} className="adm-car__reject">
                <input type="hidden" name="driverId" value={driverId} />
                <input type="hidden" name="vehicleId" value={car.id} />
                {/* ⚑ The reason is the whole refusal: it is the only thing the Driver's own
                    screen can show them, and the action refuses to save without one. */}
                <textarea
                  name="reviewNote"
                  rows={2}
                  placeholder="What must they correct?"
                  aria-label="Why are you refusing this car?"
                />
                <button type="submit" className="adm-btn adm-btn--bad">
                  Refuse it
                </button>
              </form>
            )}
          </div>
        )}
        {aState && !aState.ok && <p className="adm-doc__err">{aState.message}</p>}
        {rState && !rState.ok && <p className="adm-doc__err">{rState.message}</p>}
      </div>
    </section>
  );
}
