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
- Most beta Drivers are under the **franchise en base** (~€37,500 turnover) → they charge **no VAT** at all on the fare. Legal, and not Kavenue's problem.
- **VAT does not stack.** Each party accounts only for VAT on its own output and deducts its inputs; the **Guest** bears it once at the end. "Remitting" VAT ≠ "bearing" it — businesses in the middle are collectors, not payers.
- **Quirk:** the 10% transport VAT is **not recoverable** by the Business; the 20% commission VAT **is** recoverable. Keep transport vs service fee on **separate invoice lines**.
- **Cash ≠ supply:** money flowing through Kavenue's account doesn't make the transport Kavenue's supply — set up as *encaissement pour le compte du chauffeur* (collection on the Driver's behalf).
- ⚑ **The 10 % is earned by the DESTINATION being fixed in advance**, not by being a VTC.
  BOI-TVA-LIQ-30-20-60 § 220 names *« transferts hôtels / gares / aéroports »* as the winning case.
  So the agreed destination must be on the mission record and on the invoice — it is the defence.
- ⚑ **MISE À DISPOSITION (the car and Driver by the hour, no agreed destination) is 20 %, not
  10 %.** Buying a driver's time is closer to a hire than to transport. Upheld head-on by the
  **Conseil d'État, 13 May 2025, n° 499031 (Sté Chabé)**, which rejected the trade's challenge.
  ⚑ **CONTESTED at the edge and awaiting the accountant:** a block sold as *"4 h, 80 km included,
  then per km"*. CE *Air Limousines* (n° 419254) says only billing based **exclusively** on time
  defeats the 10 %; CAA Lyon 26 mars 2026 (n° 25LY01286) applied 20 % even with mileage **capped**.
  This decides whether an hourly product can be sold at 10 % at all.
- ⚑ **THERE IS NO 0 % IN FRANCE.** The rates are 20 · 10 · 5,5 · 2,1. A line carrying no VAT is in
  one of three other, legally distinct states: *franchise en base* (in scope, no VAT, invoice MUST
  read **« TVA non applicable, article 293 B du CGI »**, CGI art. 293 E) · **hors champ** (not a
  supply at all — no rate, no VAT column, its own document) · **exonéré** (in scope but relieved,
  must cite the provision). Since **1 September 2026** an e-invoice carries a VAT category code
  per line, machine-read, so the wrong one is a validation error. Enforced in code by `lib/vat.ts`,
  where a zero rate is unspellable ([[d126]]).
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
- **Future — EU "ViDA":** a deemed-supplier rule for road passenger transport applies from **1 Jul 2028** (member states may delay to **1 Jan 2030**). It may push the uncollected Driver VAT onto the platform unless the Driver provides a VAT ID and self-declares. Most small Drivers won't → plan for it.

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
