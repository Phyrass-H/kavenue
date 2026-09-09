"use client";

// § The paper, big enough to actually read — and the verdict beside it.
//
// ⚑ WHY THIS EXISTS. Until 2026-09-09 the reviewer got a "View" link that dumped
// the file in a new browser tab. Nine papers meant nine tabs, and the verdict
// buttons were on a screen you had just navigated away from — so you approved
// from memory. The founder's ask was exact: *"check each papers to zoom and give
// feedback for each of them, refuse or validate individually"*.
//
// ⚑ IMAGES GET THE ZOOM, PDFs GET THE BROWSER'S. A PDF is not an <img>; scaling
// it with a CSS transform would blur it into uselessness. So a PDF goes into an
// <iframe> and the reader uses the viewer the browser already ships, and the
// toolbar SAYS SO rather than showing zoom buttons that do nothing.
//
// ⚑ THE REAL FRENCH FORMATS ARE WHY "FIT" IS NOT ONE NUMBER. A permis is a wide
// card (85,6 × 54 mm), a carte grise is a long strip (125 × 254 mm, folded in
// three) and a Kbis is A4 portrait. Fitting all three means fitting to the box,
// not to a guessed aspect.
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, X, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { approveDocument, rejectDocument, type ReviewResult } from "@/lib/document-review";
import { fileKind } from "@/lib/document-kind";
import { checkReviewNote, MAX_NOTE } from "@/lib/review-note";

export interface ViewerItem {
  docId: string;
  /** "Driving licence · Front" */
  title: string;
  /** null when the upload is missing — the reason Approve is refused. */
  viewUrl: string | null;
  isPdf: boolean;
  status: string;
  uploadedAt: string;
  expiresAt: string | null;
  asksExpiry: boolean;
  reviewNote: string | null;
}

const ZOOMS = [0.5, 0.75, 1, 1.4, 2, 3, 4, 6];

function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function DocumentViewer({
  items,
  index,
  driverId,
  driverName,
  onIndex,
  onClose,
}: {
  items: ViewerItem[];
  index: number;
  driverId: string;
  driverName: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const [zoom, setZoom] = useState(2); // index into ZOOMS; 2 → 100 %
  const [deg, setDeg] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [okState, okAction, okPending] = useActionState<ReviewResult | null, FormData>(approveDocument, null);
  const [noState, noAction, noPending] = useActionState<ReviewResult | null, FormData>(rejectDocument, null);
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // ⚑ A NEW PAPER IS A NEW READ. Carrying a 400 % zoom and a 90° rotation from
  // the last document onto this one hides the thing you opened it to look at.
  useEffect(() => {
    setZoom(2);
    setDeg(0);
    setPan({ x: 0, y: 0 });
    setRejecting(false);
    setNote("");
  }, [index]);

  // ⚑ A NEW ZOOM OR ROTATION RE-CENTRES. Keeping an old offset after the paper
  // changes size can leave the whole thing off the edge of the window, and the
  // reader has no way to know which direction to drag it back from.
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [zoom, deg]);

  const go = useCallback(
    (d: number) => onIndex((index + d + items.length) % items.length),
    [index, items.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal a key from the "why are you rejecting it?" box.
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) {
        if (e.key === "Escape") (t as HTMLInputElement).blur();
        return;
      }
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(ZOOMS.length - 1, z + 1));
      else if (e.key === "-") setZoom((z) => Math.max(0, z - 1));
      else if (e.key.toLowerCase() === "r") setDeg((d) => (d + 90) % 360);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  /**
   * Drag the paper around once it is bigger than the window.
   *
   * ⚑ THE FOUNDER ASKED FOR EXACTLY THIS after using it: *"I just need to move
   * the documents around when it's zoomed in like the pointer becomes a hand to
   * grab the doc."* Zoom without pan is half a feature — you can magnify a
   * licence number and then have no way to reach the corner it sits in.
   *
   * ⚑ IT PANS THE SCROLL BOX, NOT THE IMAGE. The stage is `overflow: auto`, so
   * moving `scrollLeft/Top` is the same motion the scrollbars make — it cannot
   * drift out of bounds, it needs no clamping of its own, and it stays correct
   * when the zoom or the rotation changes underneath it.
   *
   * ⚑ POINTER EVENTS, NOT MOUSE EVENTS, so the same code works under a finger on
   * the phone the founder actually reads this console on.
   */
  /**
   * How far the paper may be dragged before its edge would leave the window.
   *
   * ⚑ FROM THE LAYOUT SIZE × THE SCALE, NEVER FROM getBoundingClientRect().
   * The rect already has the transform baked in, so feeding it back in makes the
   * bounds grow every time you drag. `offsetWidth` is the untransformed box.
   *
   * ⚑ AND THE SIDES SWAP AT 90° AND 270°: a landscape permis rotated upright is
   * tall, so its vertical room is its WIDTH. Getting this wrong locks the drag
   * on the axis that actually overflows.
   */
  const bounds = () => {
    const el = img.current, box = stage.current;
    if (!el || !box) return { x: 0, y: 0 };
    const upright = deg % 180 === 0;
    const w = (upright ? el.offsetWidth : el.offsetHeight) * scale;
    const h = (upright ? el.offsetHeight : el.offsetWidth) * scale;
    return {
      x: Math.max(0, (w - box.clientWidth) / 2),
      y: Math.max(0, (h - box.clientHeight) / 2),
    };
  };

  /**
   * Drag the paper around once it is bigger than the window.
   *
   * ⚑ THE FOUNDER ASKED FOR EXACTLY THIS after using it: *"I just need to move
   * the documents around when it's zoomed in like the pointer becomes a hand to
   * grab the doc."* Zoom without pan is half a feature — you can magnify a
   * licence number and then have no way to reach the corner it sits in.
   *
   * ⚑⚑ IT MOVES THE IMAGE, NOT THE SCROLLBOX, AND THE FIRST VERSION GOT THAT
   * WRONG. Scrolling an `overflow: auto` parent is the obvious approach and it
   * does nothing here: a CSS transform does not change an element's LAYOUT box,
   * so a scaled image overflows visually while the scroll container still thinks
   * it fits — `scrollWidth === clientWidth`, nothing to scroll, cursor promising
   * a drag that could never happen. Caught by dragging it, not by reading it.
   *
   * ⚑ POINTER EVENTS, so the same code works under a finger on the phone the
   * founder actually reads this console on.
   */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = stage.current;
    const lim = bounds();
    if (!el || (lim.x === 0 && lim.y === 0)) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    setDragging(true);
    const startX = e.clientX, startY = e.clientY;
    const from = { ...pan };
    const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
    const move = (ev: PointerEvent) => {
      setPan({
        x: clamp(from.x + (ev.clientX - startX), lim.x),
        y: clamp(from.y + (ev.clientY - startY), lim.y),
      });
    };
    const up = (ev: PointerEvent) => {
      setDragging(false);
      el.releasePointerCapture?.(ev.pointerId);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  // The one rule, shared with the server action.
  const sayable = checkReviewNote(note);

  if (!item) return null;
  const scale = ZOOMS[zoom];
  // ⚑ ONE QUESTION, ASKED ONCE — see lib/documents.ts:fileKind for why the order
  // "missing before kind" is baked in rather than left to each call site.
  const kind = fileKind(item);
  const noFile = kind === "missing";

  return (
    <div className="dv" role="dialog" aria-modal="true" aria-label={`${item.title}, ${driverName}`}>
      <div className="dv__bar">
        <span className="dv__title">{item.title}</span>
        <span className="dv__sub">
          {driverName} · filed{" "}
          {new Date(item.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <span className="dv__nav">
          <button type="button" onClick={() => go(-1)} aria-label="Previous paper"><ChevronLeft size={16} /></button>
          <span className="dv__count">{index + 1} of {items.length}</span>
          <button type="button" onClick={() => go(1)} aria-label="Next paper"><ChevronRight size={16} /></button>
        </span>
        <button type="button" className="dv__x" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      {/* ⚑ `pannable` only once the paper overflows — a grab cursor over
          something that cannot move is a promise the screen does not keep. */}
      <div
        className={`dv__stage${scale > 1 && !noFile && !item.isPdf ? " dv__stage--pan" : ""}${dragging ? " is-dragging" : ""}`}
        ref={stage}
        onPointerDown={scale > 1 && !noFile && !item.isPdf ? onPointerDown : undefined}
      >
        {noFile ? (
          // ⚑ Says which of the two it is. "Missing" and "not uploaded yet" send
          // the reviewer to different actions.
          <div className="dv__none">
            <p className="dv__none-t">This paper has no file behind it.</p>
            <p className="dv__none-s">
              The record exists but the upload is missing, so there is nothing to read. Ask the
              Driver to file it again.
            </p>
          </div>
        ) : kind === "pdf" ? (
          <iframe className="dv__pdf" src={item.viewUrl!} title={item.title} />
        ) : (
          <img
            ref={img}
            className="dv__img"
            src={item.viewUrl!}
            alt={item.title}
            /* ⚑ translate FIRST so a drag moves the paper the way the hand went,
               whatever rotation is applied after it. */
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) rotate(${deg}deg) scale(${scale})` }}
          />
        )}
      </div>

      <div className="dv__tools">
        {/* ⚑ "IS THERE A FILE" IS ASKED BEFORE "WHAT KIND OF FILE", AND THE
            ORDER WAS WRONG HERE FIRST TIME. `isPdf` reads the stored path's
            extension, and a MISSING document still has a path — the old
            `seed://…/drivers_licence.pdf` rows end in .pdf — so asking about the
            kind first told a reviewer looking at nothing at all to "use the PDF
            reader's own zoom". Caught by opening a real seeded Driver. */}
        {kind === "missing" ? (
          <span className="dv__note">Nothing to zoom.</span>
        ) : kind === "pdf" ? (
          // ⚑ Honest rather than decorative: a CSS transform on an <iframe>
          // blurs a PDF instead of magnifying it, so this defers to the reader.
          <span className="dv__note">Use the PDF reader’s own zoom and page controls.</span>
        ) : (
          <span className="dv__zoom">
            <button type="button" onClick={() => setZoom((z) => Math.max(0, z - 1))} aria-label="Zoom out"><Minus size={15} /></button>
            <span className="dv__pct">{Math.round(scale * 100)} %</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} aria-label="Zoom in"><Plus size={15} /></button>
            <button type="button" onClick={() => setDeg((d) => (d + 270) % 360)} aria-label="Rotate left"><RotateCcw size={15} /></button>
            <button type="button" onClick={() => setDeg((d) => (d + 90) % 360)} aria-label="Rotate right"><RotateCw size={15} /></button>
          </span>
        )}

        {!rejecting && (
          <form action={okAction} className="dv__ok">
            <input type="hidden" name="documentId" value={item.docId} />
            <input type="hidden" name="driverId" value={driverId} />
            {item.asksExpiry && !noFile && (
              <label className="dv__exp">
                Expires
                <input type="date" name="expiresAt" defaultValue={dateInput(item.expiresAt)} />
              </label>
            )}
            {/* ⚑ Disabled is the courtesy; lib/document-review.ts refuses it for real. */}
            <button type="submit" className="dv__btn dv__btn--go" disabled={noFile || okPending || item.status === "verified"}>
              {item.status === "verified" ? "Approved" : okPending ? "Saving…" : "Approve"}
            </button>
            {noFile && <span className="dv__why">you cannot approve a paper you cannot see</span>}
            <button type="button" className="dv__btn" onClick={() => setRejecting(true)}>Reject</button>
          </form>
        )}

        {rejecting && (
          <form action={noAction} className="dv__no">
            <input type="hidden" name="documentId" value={item.docId} />
            <input type="hidden" name="driverId" value={driverId} />
            <label htmlFor={`why-${item.docId}`}>Why are you rejecting it? The Driver reads this word for word.</label>
            <input
              id={`why-${item.docId}`}
              name="reviewNote"
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_NOTE}
              placeholder="The bottom edge is cut off — send the whole card."
            />
            {/* ⚑ DISABLED FROM THE SAME RULE THE SERVER ENFORCES, not from a
                second `length > 0` written here. `checkReviewNote` is the one
                authority (lib/review-note.ts) and it trims first — so a box
                holding three spaces is empty to both, and the button and the
                action can never disagree about what counts as a reason.
                ⚑ The server still refuses independently: this is the courtesy,
                not the rule. */}
            <button type="submit" className="dv__btn dv__btn--no" disabled={noPending || !sayable.ok}>
              {noPending ? "Saving…" : "Send"}
            </button>
            <button type="button" className="dv__btn" onClick={() => setRejecting(false)}>Cancel</button>
            {/* Silent until they have typed something — telling someone what is
                wrong with a box they have not filled in yet is nagging. */}
            {note.trim().length > 0 && !sayable.ok && (
              <span className="dv__why">{sayable.message}</span>
            )}
          </form>
        )}
      </div>

      {(okState && !okState.ok) || (noState && !noState.ok) ? (
        <p className="dv__err">{okState && !okState.ok ? okState.message : noState && !noState.ok ? noState.message : null}</p>
      ) : null}

      {item.reviewNote && item.status === "rejected" && (
        <p className="dv__prev">You told them: “{item.reviewNote}”</p>
      )}
    </div>
  );
}
