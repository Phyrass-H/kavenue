// Read every row of a Business-side query, one page at a time — and say so when
// the read did not finish.
//
// ⚑⚑ AN UNBOUNDED `.select()` STOPS AT 1 000 ROWS AND REPORTS NO ERROR. Measured
// against this database on 2026-08-30: `mission_event` came back with 1 000 of
// 2 503 rows and nothing said anything was missing (lib/admin-list.ts `readAll`).
// The Schedule's own trip read is the worst case of the family, because it is
// sorted pickup_at ASCENDING with no date floor: the rows a cut would drop are
// the NEWEST ones — today's trips and every trip ahead, the only ones carrying
// the tools that can still change the outcome (raise the Ceiling, change the car).
//
// ⚑ WHY THIS FILE EXISTS RATHER THAN `readAll`. `lib/admin-list.ts` `readAll` does
// not destructure `error`, so a failed page is indistinguishable from the last
// page: the caller gets a short array and no way to know. That is deliberate there
// and wrong here — a Business screen must never present a partial archive as the
// whole of it. `lib/fleet-match.ts` already had to write its own fail-closed loop
// for the same reason (its comment at the top says why it could not reuse
// `readAll`); this is that loop, shared, tested, and with the two failure shapes a
// caller actually needs:
//
//   · `readAllPages`     — throws. For anything the screen must not draw short.
//   · `readAllPagesSoft` — returns { rows, failed }. For a side read whose callers
//                          already degrade to "nothing known" by design.
//
// Either way the answer is never "a short list that looks complete".

/**
 * PostgREST's own page size. Asking for more in one request changes nothing.
 *
 * ⚑ THE EXIT CONDITION DEPENDS ON THIS NUMBER MATCHING THE SERVER'S. The loop stops
 * when a page comes back SHORT, so if the project's `db-max-rows` were ever lowered
 * below 1 000, the first page would arrive short and read as the end — the same
 * silent truncation, now with a pager vouching for it. 1 000 is Supabase's default
 * and the measured value here (2026-08-30); if that setting changes, change this.
 */
export const PAGE_ROWS = 1000;

/**
 * A ceiling on the loop, not on the data: 250 pages is 250 000 rows.
 *
 * ⚑ It exists because the exit condition is "a page came back short". A server
 * that keeps answering full pages — an unstable sort, a pathological filter —
 * would otherwise spin for ever inside a page render. Hitting it is a bug, so it
 * throws rather than returning what it has.
 */
export const MAX_PAGES = 250;

/** How many ids one `.in(…)` request may carry — see `readByIds`. */
export const IDS_PER_REQUEST = 200;

type Answer<T> = { data: T[] | null; error: { message: string } | null };

/** One page of a query: the caller adds `.range(from, to)` and nothing else. */
export type PageRun<T> = (from: number, to: number) => PromiseLike<Answer<T>>;

/** One batch of an `.in(<ids>)` query. */
export type BatchRun<T> = (ids: string[]) => PromiseLike<Answer<T>>;

/**
 * Every row of `run`, in pages, or an Error.
 *
 * ⚑ THE SORT MUST BE A TOTAL ORDER. Paging is OFFSET-based: two requests are two
 * separate queries, and Postgres guarantees no row order between them beyond the
 * ORDER BY. `pickup_at` alone is not unique — two trips at 09:00 can swap between
 * page 1 and page 2, which loses one and repeats the other. Every caller here ends
 * its ORDER BY with a unique column (`id`), and that is not decoration.
 */
export async function readAllPages<T>(what: string, run: PageRun<T>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_ROWS;
    const { data, error } = await run(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`${what} couldn’t be read in full: ${error.message}`);
    if (!data?.length) return out;
    out.push(...data);
    // A short page is the last page — asking for another would be a wasted trip.
    if (data.length < PAGE_ROWS) return out;
  }
  throw new Error(`${what} is bigger than this screen can read in one go (over ${MAX_PAGES * PAGE_ROWS} rows).`);
}

/**
 * Every row of `run`, in pages — or `{ rows: [], failed: true }`.
 *
 * ⚑ ALL OR NOTHING ON FAILURE, and that is the point. The side tables this serves
 * (walk-aways, amendments, releases, change logs, Guest phones) already degrade to
 * an empty Map when their migration is absent, and their consumers read them one
 * trip at a time. Returning the pages that DID arrive would turn "we don't know"
 * into "this trip has no record", which is the exact fault the 1 000-row cap
 * causes — naming innocent rows. `failed` lets a caller say so on the row.
 *
 * ⚑ IT LOGS. A soft read that quietly returns nothing is indistinguishable, in the
 * server log as well as on screen, from a table that is simply empty — which is how
 * this family of faults stayed invisible in the first place.
 */
export async function readAllPagesSoft<T>(
  what: string,
  run: PageRun<T>,
): Promise<{ rows: T[]; failed: boolean }> {
  try {
    return { rows: await readAllPages(what, run), failed: false };
  } catch (e) {
    console.error(`[paged-read] ${readErrorMessage(e)}`);
    return { rows: [], failed: true };
  }
}

/**
 * Every row matching a list of ids, in batches — or `{ rows: [], failed: true }`.
 *
 * ⚑ WHY BATCHES. An `.in(<ids>)` list travels in the URL and it does NOT degrade
 * gracefully — it ERRORS. Measured 2026-08-23 against the live database by binary
 * search: 397 ids work, 398 throw "TypeError: fetch failed" at ~14,8 KB of URL
 * (lib/side-tables.ts). Trip-id lists were fixed by scoping to the Business (§ R
 * rule 1); the DRIVER-id lists cannot be — they are a list of Drivers — so they
 * are batched instead.
 *
 * ⚑ ALL OR NOTHING, again on purpose: a half-filled Driver map renders SOME rows
 * with a name and others with nothing, and nothing on the screen says which is
 * which. One `failed` flag is the honest answer.
 */
export async function readByIds<T>(
  what: string,
  ids: string[],
  run: BatchRun<T>,
  perRequest: number = IDS_PER_REQUEST,
): Promise<{ rows: T[]; failed: boolean }> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { rows: [], failed: false };
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += perRequest) {
    const { data, error } = await run(unique.slice(i, i + perRequest));
    if (error) {
      console.error(`[paged-read] ${what} couldn’t be read in full: ${error.message}`);
      return { rows: [], failed: true };
    }
    out.push(...(data ?? []));
  }
  return { rows: out, failed: false };
}

/** The message of whatever a failed read threw, never "[object Object]". */
export function readErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "the read failed";
}
