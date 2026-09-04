# 01 — Kavenue · Legal, VAT & Compliance

> Scope: Kavenue's legal identity, the obligations that come with it, and the VAT model. **Everything here must be confirmed with a French VTC/transport lawyer + expert-comptable before going live.** Not legal advice.
> **Last updated:** current session.

---

## Legal identity

- Kavenue is a **centrale de réservation VTC** — a regulated VTC booking platform / intermediary under the French **Code des transports** (Loi Grandguillaume, n°2016-1920, 29 Dec 2016).
- Kavenue is **NOT** the transport operator. Each **Driver** is the *exploitant VTC*. Kavenue connects Drivers to Business demand.
- **Commercial model chosen: AGENT / intermediary (commission), NOT principal/reseller.** This keeps VAT on the commission only.
  - The earlier "reseller like Uber/Booking" framing was wrong: Booking.com is an agent (commission); Uber was *forced* into principal status and paid ~£1bn in VAT.

## The agent-vs-principal line (why it matters)

If Kavenue is recharacterized as **principal**, it owes VAT on the **full fare** (not just commission), with little to deduct because most Drivers aren't VAT-registered. The two features that push toward "principal":
1. The pricing algorithm controlling the fare.
2. Kavenue guaranteeing the service.

**Mitigations baked into the product:** the **Business sets the ceiling** (its commercial decision) and Kavenue only **recommends** a fare — so price-setting sits with the Business, not Kavenue. Contracts must keep the Driver a genuine free supplier that Kavenue *facilitates*. (UK lesson: HMRC argued Uber was principal because it "controls the drivers' working patterns and terms.")

## Obligations of a centrale de réservation (some apply NOW, in beta)

1. **Declare to the DGITM** (annual). Since Sept 2025, only declared platforms may legally connect clients and Drivers. **€15,000 fine** for non-declaration.
2. **Verify every Driver is a registered VTC** — carte professionnelle, REVTC registration (€170 / 5 yrs), insurance, vehicle registration. **€300,000 fine** for connecting clients with non-VTC drivers. → Driver-doc verification is mandatory, not optional.
3. **Hold RC Pro insurance** for Kavenue itself.
4. **Issue a compliant booking voucher** for every trip (*justificatif de réservation*; "transfer voucher" in EN) — 7 mandatory fields, format standardised by the arrêté of 6 Aug 2025. This is a build requirement.
5. **Display rule (art. L.3120-2):** do not show a client both the *location* AND the *availability* of cars before booking. Affects how availability is surfaced on the Dispatch side.

## VAT model

- As an **agent**, Kavenue charges VAT only on its **commission**, at **20%** (standard rate for a platform fee).
- The **transport fare** carries the **10%** reduced rate — but that is the **Driver's** responsibility, not Kavenue's.
- Most beta Drivers are under the **franchise en base** → they charge **no VAT** at all on the fare.
  Legal, and not Kavenue's problem. **37 500 €** of prior-year turnover for services, with a tolerance
  of **41 250 €** (CGI art. 293 B, I). ⚑ The **25 000 €** single threshold voted in the 2025 budget was
  suspended and then **repealed** by LOI n° 2025-1044 du 3 novembre 2025 — it never applied; do not
  design against it. ⚑ The art. 293 B mention belongs on the **DRIVER's** invoice, never on Kavenue's
  own commission invoice — so it must be driven off a per-Driver flag, never off a template.
- **VAT does not stack.** Each party accounts only for VAT on its own output and deducts its inputs; the **Guest** bears it once at the end. "Remitting" VAT ≠ "bearing" it — businesses in the middle are collectors, not payers.
- **Quirk:** the 10% transport VAT is **not recoverable** by the Business; the 20% commission VAT **is**
  recoverable. Keep transport vs service fee on **separate invoice lines**.
  ⚑ The authority is **CGI ann. II, art. 206, IV-2-5°**: the *coefficient d'admission* is nil
  *« pour les prestations de transport de personnes et les prestations accessoires à ce transport »* —
  so a **waiting line is caught by the exclusion too**, not just the fare. The derogation for a
  *contrat permanent* does **not** save the hotel: BOI-TVA-DED-30-30-30 § 50 refuses it to a business
  contracting a carrier to move **its own clientele**, which is exactly what a Business does here.
- **Cash ≠ supply:** money flowing through Kavenue's account doesn't make the transport Kavenue's supply — set up as *encaissement pour le compte du chauffeur* (collection on the Driver's behalf).
- ⚑ **The 10 % is earned by the DESTINATION being fixed in advance**, not by being a VTC.
  BOI-TVA-LIQ-30-20-60 § 220 names *« transferts hôtels / gares / aéroports »* as the winning case.
  So the agreed destination must be on the mission record and on the invoice — it is the defence.
- ⚑ **MISE À DISPOSITION (the car and Driver by the hour, no agreed destination) is the standard
  rate, not 10 %.** Buying a driver's time is closer to a hire than to transport. Upheld head-on by
  the **Conseil d'État, 8e ch., 13 mai 2025, n° 499031 (Sté Chabé)**, which rejected the trade's
  challenge to BOI-TVA-LIQ-30-20-60 § 220. ⚑ The decision says *« taux normal »*; **20 % is CGI
  art. 278**, a separate step — do not attribute the figure to the ruling.
  ⚑ **AND THE TEST IS NOT THE CLOCK.** What disqualifies the 10 % is the absence of an
  *« accord préalable sur les trajets à effectuer »*; an hourly **tariff** is the *evidence* of that
  absence, not the rule. The Chabé criterion bites where the price is *« totalement indépendant de la
  distance parcourue »* — the unlimited-mileage case. **So an hourly-priced job with an agreed
  itinerary is arguably still 10 %,** and that is the crux of the question below.
  ⚑ **CONTESTED at the edge and awaiting the accountant:** a block sold as *"4 h, 80 km included,
  then per km"*. **CE, 9e ch., 14 oct. 2019, Sté Air Limousines, n° 419254** holds that billing based
  *principally* on duration is not enough — only **exclusively** on duration defeats the transport
  qualification. ⚑ **That case was decided on the 5,5 % version of art. 279 b quater (2009-2011),
  not on 10 %**; the principle transposes because b quater is today's 10 %, but do not cite it as a
  10 % case. Against it, **CAA Lyon, 2e ch., 26 mars 2026, n° 25LY01286 (SCS NTR)** applied the
  standard rate where the tariff was hourly and distance-independent *« avec un kilométrage illimité
  ou plafonné »* — i.e. **a cap did not save it**. ⚑ It is an appeal court and *inédit au recueil
  Lebon*: persuasive, not binding. This decides whether an hourly product can be sold at 10 % at all.
- ⚑ **THERE IS NO 0 % IN FRANCE.** The rates are 20 · 10 · 5,5 · 2,1. A line carrying no VAT is in
  one of three other, legally distinct states: *franchise en base* (in scope, no VAT, invoice MUST
  read **« TVA non applicable, article 293 B du CGI »**, CGI art. 293 E) · **hors champ** (not a
  supply at all — no rate, no VAT column, its own document) · **exonéré** (in scope but relieved,
  must cite the provision). A per-line VAT breakdown is required by **CGI ann. II, art. 242 nonies A,
  I, 8°** and is not new. Enforced in code by `lib/vat.ts`, where a zero rate is unspellable ([[d126]]).
  ⚑ **THE E-INVOICING DATES, CORRECTED 2026-09-04.** **1 September 2026** is the date every French
  VAT-taxable business must be able to **RECEIVE** e-invoices, and the date **grandes entreprises and
  ETI** must **EMIT**. A company of Kavenue's size (PME/TPE) emits from **1 September 2027**.
  ⚑ And the platform's checks are **presence and arithmetic coherence**, not legal correctness — a
  wrong-but-well-formed category passes. The exposure is an audit, not a rejected invoice.
- **WHERE the ride happens changes the rate.** 10 % métropole hors Corse · **2,1 % in Corsica and
  in Guadeloupe / Martinique / Réunion** (where the standard rate is **8,5 %**, so an hourly block
  there is 8,5 %) · **no VAT** in Guyane and Mayotte (CGI art. 294). A genuinely foreign leg is
  taxed *« en fonction des distances parcourues en France »* (CGI art. 259 A 4°).
- ⚑ **MONACO IS INSIDE THE FRENCH VAT TERRITORY — a Cannes → Monaco ride is a plain domestic
  10 % supply, with no distance split** ([[d127]], 2026-09-03). BOI-TVA-CHAMP-20-10 § 10 lists
  *« le territoire de Monaco défini par la convention douanière signée à Paris le 18 mai 1963 »*
  and § 145: *« Aux fins de la TVA, ce territoire est assimilé au territoire français. »* The
  Monegasque government says the same from its side: *« La TVA est perçue sur les mêmes bases et
  aux mêmes taux qu'en France. »* This matters because **28 % of live missions touch Monaco**.
  ⚑ Monaco's *transport* rules are a different matter entirely — see [[d128]].
- **Future — EU "ViDA":** Council Directive (EU) **2025/516** of 11 March 2025 inserts **art. 28a**
  into the VAT Directive, making a platform that facilitates road passenger transport the **deemed
  supplier**. ⚑ It is a **WINDOW, not a start date with an opt-out**: member states bring it in
  **at the earliest 1 July 2028 and at the latest 1 January 2030** (art. 6(3)). ⚑ And the rule is
  **conditional** — it does not apply where the Driver both gives the platform a VAT identification
  number and declares they will charge the VAT. Most small Drivers won't → plan for it. ⚑ There is
  **no B2B carve-out** in art. 28a; selling to hotels does not put Kavenue outside it.

## What each bill line carries

`lib/vat.ts` resolves this **per LINE, not per mission** ([[d126]]) — one invoice may lawfully carry a
10 % transport line beside a 20 % commission line. What is forbidden is **two rates on one operation**.

⚑ **WHOSE VAT.** Every row below except the commission is the **DRIVER's** output VAT. Kavenue is an
*intermédiaire transparent*; it accounts only for the last row. A Driver under the franchise charges
none of it, and the rate column then says only what the rate *would* be.

| line | treatment | the authority, and the test it actually applies |
|---|---|---|
| **Transfer** — destination agreed in advance | **10 %** | CGI art. 279 b quater. The test is an *« accord préalable sur les trajets à effectuer »*; BOI-TVA-LIQ-30-20-60 § 220 names *« transferts hôtels / gares / aéroports »* as the winning case |
| **Mise à disposition** — hourly, no agreed destination | **taux normal (20 %)** | CE 13 mai 2025, n° 499031, *Sté Chabé* — see above. ⚑ 20 % is art. 278; the ruling says *« taux normal »* |
| **Waiting time** | **follows the ride** | ⚑ **NOT because it is small.** BOI-TVA-LIQ-30-20-60 § 30 puts *« les suppléments de prix »* closely tied to the transport at the transport's rate; CGI art. 257 ter, I decides an operation *« en faisant abstraction des éléments accessoires »*. The criterion is the **absence of a *finalité autonome*** for the customer (BOI-TVA-CHAMP-60-20 § 230) — not the size of the charge |
| **No-show** | **taxable, at the ride's rate** | ⚑ **NOT because the Driver turned up.** BOI-TVA-BASE-10-10-50 § 260 taxes the retained price *« indépendamment »* of whether the client cancels ahead or simply fails to appear; CE 9 oct. 2024, n° 472257 — the counter-value is the client's firm **right** to the supply, used or not. Narrow escape: genuine *arrhes* (C. civ. art. 1590) |
| **Cancellation — charged to the Business** | ⚑ **OPEN — `taxOf` returns `undetermined`** | Not answered, and the doc must not pre-empt it. ⚑ **What the research found, for the expert-comptable:** § 260 above taxes a sum retained when the client *« renonce »* to reserved capacity **before** the date — which points toward taxable, and would apply to a published grid. Half is already settled by the SQL, not by opinion: `business_cancel_mission` zeroes the fee when no Driver had accepted, so **a fee above zero always implies capacity was held** |
| **Cancellation — charged to a Driver** | **hors champ** | BOI-TVA-BASE-10-10-50 § 240 and § 300: a sum that merely *« sanctionne l'inexécution »* and buys the payer nothing is not consideration. **No VAT line at all** — not a 0 % line — and its own document. ⚑ It flips INTO scope the moment the money buys the Driver something (account kept active, no suspension, priority) |
| **Kavenue's commission** | **20 %** | Its own supply of intermediation; it does **not** inherit the ride's 10 % (BOI-TVA-CHAMP-10-10-40-40) |

⚑ **THIS TABLE AND `lib/vat.ts` ARE CHECKED AGAINST EACH OTHER.** `handoff-check` asserts that every
`BillLineKind` in the code is described here *and* in `docs/06`, and the assertion is keyed on the type
itself — so an **eighth kind is a compile error** until someone writes down what VAT it carries.

## Worked money-flow example
Carlton Cannes → Nice airport, beta case, Driver under franchise, 15% commission:

| Party | Pays | Receives | Keeps |
|---|---|---|---|
| Guest | €150 (to Business) | — | the ride |
| Business (hotel) | €118 (to Kavenue) | €150 (from Guest) | €32 margin |
| Kavenue | €100 (to Driver) + €3 VAT (to state) | €118 (from Business) | €15 commission |
| Driver | — | €100 (from Kavenue) | €100 (no VAT) |

Kavenue's invoice to the Business = 2 lines: Transport €100 + Service fee €15 + €3 VAT (20%). Kavenue's only VAT responsibility is the €3 on its own €15.

## Open questions for the lawyer
- Does the **B2B-via-hotels** structure (Driver → Business → Guest, not Driver → Guest) still cleanly fit "centrale de réservation"?
- Confirm contracts + the pricing/service-guarantee design don't tip Kavenue into principal.
- Invoicing mechanics: self-billing (*auto-facturation*) vs Driver-issued invoices; collection-on-behalf wording.
- Driver status (independent contractor) — avoid requalification as employees.
