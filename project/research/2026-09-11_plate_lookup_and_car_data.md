# Research — plate lookup, SIV law, car colours, plate formats

> Researched 2026-09-11 (S77) by a 39-agent workflow: 3 researchers, then every load-bearing claim
> re-fetched and checked by an independent verifier told to default to *does not hold*.
> **Every vendor, price and legal text below was fetched that day — none is from memory.**
> Prices change; re-check before any purchase. 34 of 36 checked claims held; the 2 that did not are
> in § Corrections.

**Asked by the founder:** *"can we get all infos just with the plate number? … is it reliable? is it
expensive? that way the driver just indicates the plate and all the fields are automatically filled"*

---

## 1 · The services that exist

SERVICES THAT TURN A FRENCH PLATE INTO CAR DATA. Everything here was fetched on 2026-09-11, and every price is as seen that day.

BOTTOM LINE
- Yes, these services exist, and at low volume they cost somewhere between €0.20 and €0.40 a lookup, or a small monthly plan. 
- Many of the websites are storefronts for the same data. Four different sites show the same response format (the "AWN" schema from Auto Ways Network), and Openapi's French sample appears to be copied from Infinite Loop's RegCheck. That leaves about five truly separate sources, listed below. One is the government API, and private companies can't use it.
- **No vendor publishes a hit rate.** The only numbers are self-reported uptime figures.
- **No service covers Monaco plates.**
- Colour is the weakest field: only two of the sources show it in a sample response.
- Crit'Air never appeared as a real value in any sample.

Key: C = seen in a sample response or docs · K = claimed in marketing copy only · – = not found.

1) AUTO WAYS NETWORK ("AWN" data), sold through 4 storefronts
- The storefronts are auto-ways.net (direct), api-plaque-immatriculation.com, api-plaque.com (which names "Immatriculationapi LLC" as its company) and Zyla API Hub.
- Evidence they are one source:
  - api-plaque.com's sample uses fields named AWN_* with images hosted on api.auto-ways.net (https://www.api-plaque.com/).
  - api-plaque-immatriculation.com shows the same field names without the prefix, and the same sample car: FH-034-DD, VIN VF1R9800962986572 (https://www.api-plaque-immatriculation.com/).
  - Zyla's sample uses AWN_* fields (https://zylalabs.com/api-marketplace/data/france+license+plate+lookup+api/342).
  - That these share one upstream is my inference from the identical schema and sample car.
- Fields, all from the sample at https://www.api-plaque-immatriculation.com/:
  - Make C (marque "RENAULT")
  - Model C (modele "CLIO IV")
  - Energy C (energie "GAZOLE")
  - First registration C (date_mise_en_circulation "20-06-2019")
  - Colour C (couleur "GRIS")
  - Seats C (nbr_de_places "5")
  - Body C (carrosserie "BERLINE")
  - CO2 C (emission_co_2 "104")
  - Euro norm C (classe_environnement_ce)
  - Crit'Air: the field code_certificat_qualite_air exists, but it reads "INCONNU" (unknown) in both samples seen (same page, plus Zyla). The vendor's blog claims a Crit'Air class (https://www.api-plaque-immatriculation.com/blog/guide-donnees-siv), so K.
- Plate formats: SIV C. Old FNI format K — only the vendor's blog says both formats work.
- Countries: auto-ways.net claims France, Spain and the UK. api-plaque-immatriculation.com claims France, UK, Spain, Italy, Germany, Belgium and Portugal. No Monaco.
- Prices:
  - auto-ways.net, in € including VAT (TTC), requests per month (https://auto-ways.net/pricing/):
    - €49/mo for 400 requests
    - €59 for 600
    - €79 for 1,000
    - €129 for 3,000
    - €199 for 6,000
    - €299 for 10,000
    - €399 for 15,000
    - €499 for 30,000
    - €799 for 50,000
    - €1,399 for 100,000
    - Yearly plans from €499/yr. "Unlimited" means contacting sales.
    - Only successful lookups (HTTP 200) are billed; 404s are free.
  - api-plaque-immatriculation.com, through RapidAPI, in USD, monthly, no commitment (https://www.api-plaque-immatriculation.com/tarifs):
    - $0 for 10 requests
    - $59 for 600
    - $199 for 5,000
    - $299 for 10,000
    - Extra requests $0.01 each
  - api-plaque.com: prices are hidden on purpose; a free plan gives 10 requests/month.
  - Zyla:
    - €92.99/mo for 600
    - €189.99 for 2,000
    - €459.99 for 10,000
- How it's sold: self-serve; sales only for custom volumes.
- Reliability, all self-claimed:
  - auto-ways.net says 99.99% availability.
  - api-plaque-immatriculation.com says 99.9%, with an SLA only on its Ultra and Mega plans.
  - Its homepage says the data is "real time" (temps réel) while its blog says "updated daily" (quotidiennement).
  - It claims "500 millions de plaques" in France.
  - It names no SIV licence and gives no registration number (https://www.api-plaque-immatriculation.com/legal).
- Company identity check:
  - Auto Ways' legal notice names "SASS Auto Ways Network" with VAT number FR89128370926 (https://auto-ways.net/mentions-legales/).
  - The French company registry (https://recherche-entreprises.api.gouv.fr) returns nothing for "AUTO WAYS NETWORK" or for 128370926 (the company number inside that VAT number).
  - The closest name match, AUTO WAYS SAS (SIREN 843052358, Paris 8e, data processing), closed on 2023-03-31 with a liquidator. It may not be the same company.

2) APIPLAQUEIMMATRICULATION.COM (a separate data format; no company named)
- Fields, from the documented sample (https://apiplaqueimmatriculation.com/documentation-de-lapi-de-plaque-immatriculation/):
  - Make C ("RENAULT")
  - Model C ("MEGANE III Coupé")
  - Energy C (energieNGC "DIESEL")
  - First registration C (date1erCir_fr "18/04/2009")
  - Colour C ("Noire")
  - Seats C (nr_passagers "5")
  - Body C (carrosserieCG "COUPE")
  - CO2 C ("134")
  - Crit'Air –
- Plate formats: SIV example only; FNI –.
- Countries claimed: FR, ES, UK, DE, IT, PT, NL. No Monaco.
- Prices, in €, VAT basis not stated (https://apiplaqueimmatriculation.com/packs-mensuel/):
  - €39/mo for 400 requests
  - €59 for 800
  - €79 for 1,000
  - €179 for 5,000
  - €299 for 10,000
  - up to €1,299 for 100,000
  - Yearly from €399. No commitment.
  - The terms (CGV) offer a free trial of 50 credits.
- How it's sold: self-serve, paid by PayPal or card.
- ⚑ **The terms forbid storing the API's data beyond immediate use** (https://apiplaqueimmatriculation.com/cgv/). That conflicts with saving the result on a Driver's profile.
- Reliability, self-claimed: "Fiabilité à 100%", answers in 0.4 s, "900 millions de plaques" across 7 countries.
- Two field names (date1erCir, genreVCG) match AAA DATA's SIvin fields. That they share a source is my inference only.

3) INFINITE LOOP DEVELOPMENT LTD (Ireland), brands RegCheck and immatriculationapi.com
- Fields, from the France sample in the API reference PDF dated 23.06.2026 (https://www.regcheck.org.uk/data/doc.aspx) and the France docs page (https://www.immatriculationapi.com/data/api-docs.aspx/france):
  - Make C ("RENAULT")
  - Model C ("SCÉNIC III")
  - Fuel C ("DIESEL")
  - First registration C (datePremiereMiseCirculation "24062016")
  - Seats C (nbPlace "5", PDF only)
  - Body C ("MONOSPACE COMPACT")
  - CO2 C ("105")
  - Colour – (not in the France field list)
  - Crit'Air –
- Plate formats: FNI –.
- Countries: 50+, but not Monaco.
- Price: **€0.20 per lookup**, bought in blocks of at least 100. 10% off packs over 1,000. 10 free credits when you sign up (https://www.immatriculationapi.com/).
- How it's sold: self-serve; credits paid by PayPal.
- Technical: a SOAP interface, and the docs say only a username is needed to call it (https://www.immatriculationapi.com/data/api-docs.aspx).
- Data source: "official government data sources", requested in real time and not cached. The source is not named. No SLA found.

4) OPENAPI SpA (Rome), French Car Check (GET /FR-car)
- Page: https://openapi.com/products/french-car-check
- Fields shown in the sample: Make C, Model C, Fuel C, RegistrationDate C, BodyStyle C. Colour, seats, CO2 and Crit'Air are all –.
- The sample doesn't hold together: Description says "RENAULT SCÉNIC III" but CarMake says "AUDI".
- It uses the same plate (EG258MA) and the same field layout as RegCheck, so it is probably a reseller of RegCheck (my inference).
- The page itself warns that not every field is available for every vehicle.
- Countries: also Italy, Germany and the UK. No Monaco.
- Prices, plus VAT:
  - Pay per call: €0.40
  - Paid-annually packs:
    - 1,000 calls/yr at €0.37 per call
    - 5,000 at €0.33
    - 10,000 at €0.30
    - 25,000 at €0.28
    - 50,000 at €0.24
    - 200,000 at €0.18
- How it's sold: self-serve signup.
- Data source: its data-source page names no French source (https://openapi.com/data-source).

5) AAA DATA (Paris, SIREN 519071575, active per the registry), SIvin
- Licence: its privacy policy says it holds all the SIV reuse licences granted by the Ministry of the Interior (https://www.aaa-data.fr/politique-de-protection-donnees/). It is the only vendor that states a licence.
- Product page (https://www.aaa-data.fr/solution/sivin-rechercher-plaque-immatriculation-numero-vin/): 75 million vehicles; no price; only a "contact us" form.
- Developer guide (https://dev.entrouvert.org/attachments/download/66867/AAA-DATA_SIVIN_API_guide_developpeur_v1.pdf). It is marked confidential but sits publicly on a third party's tracker. It says:
  - more than 75 million registrations, updated daily, up to 51 technical fields
  - **both FNI and SIV plates work (C)**
  - each subscription has a daily quota tied to the volume you commit to
  - your server must call from pre-declared fixed IP addresses (up to 15)
- Fields:
  - Body C and first registration C (date1erCir), plus the Euro norm. These come from a third party's open-source connector test data (https://git.entrouvert.org/entrouvert/passerelle/raw/branch/main/tests/test_sivin.py).
  - Make, model, energy, seats and CO2 are K, and only on a partner's page (weak evidence): https://www.api-developpement.fr/api-sivin-aaa-data/
  - Colour –, Crit'Air –.
- How it's sold: contract with sales only.

6) GOVERNMENT: API Particulier "Extrait d'immatriculation véhicule" (from ANTS) — NOT AVAILABLE TO KAVENUE
- Page: https://particulier.api.gouv.fr/catalogue/ants/extrait_immatriculation_vehicule
- Who can use it: only local authorities pricing residential parking, and only when the vehicle holder signs in with FranceConnect.
- Coverage: both plate formats, mainland France and overseas departments (DROM).
- Fields: make, commercial name, fuel, first registration date, CO2, Euro class. No colour or seat count.

MONACO
- Monaco registers its own vehicles through its Service des Titres de Circulation (https://monservicepublic.gouv.mc/Transports-et-mobilite/Immatriculation-des-vehicules).
- That page mentions no lookup, data file or API, and no vendor above lists Monaco.

RULES ON WHERE THE DATA COMES FROM
- Law: Article L330-5 of the Code de la route lets pre-approved third parties reuse SIV data "à des fins de sécurisation des activités économiques" (keeping economic activity secure), limited to technical characteristics with no name or address (https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037825622).
- The road-safety agency's licence guide, 7th edition, May 2022 (https://www.securite-routiere.gouv.fr/sites/default/files/2022-05/mai_2022_guide_reutilisation_donnees_siv.pdf), says:
  - every reuser needs a licence
  - passing data on to parties the Ministry doesn't know about is forbidden and carries penalties
  - **a user that stores the data on its own server needs at least a "level 2 technical" licence**
  - no licence is needed if the data isn't stored and the plate was supplied by the registration holder

**Not found** (looked for, not there):

- Any published hit rate or coverage % for French plate lookups, from any vendor
- Any independent reliability test, uptime report or third-party review of these APIs
- Monaco plate coverage in any service, and any Monaco public vehicle-lookup API
- A real Crit'Air value in any sample response (the AWN field exists but reads INCONNU in both samples seen); no Crit'Air field for RegCheck, Openapi, apiplaqueimmatriculation.com or (publicly) SIvin
- Colour for RegCheck/Openapi (France) and for AAA DATA SIvin
- Explicit statement of support for old FNI plates from Infinite Loop/RegCheck, Openapi, auto-ways.net or apiplaqueimmatriculation.com
- A named SIV licence (number or level) from any vendor except AAA DATA's general claim
- AAA DATA SIvin pricing and a public field list
- Openapi free tier or sandbox (only free account signup seen)
- How many free requests the Auto Ways trial gives
- Legal entity and SIREN for api-plaque-immatriculation.com and apiplaqueimmatriculation.com; Auto Ways' stated entity not found in the French registry
- Whether apiplaqueimmatriculation.com prices include VAT (TTC or HT)
- Terms on storing data for Auto Ways, api-plaque-immatriculation.com, RegCheck and Openapi (only apiplaqueimmatriculation.com's CGV checked)
- RapidAPI listing pages (not readable); api-plaque.com's RapidAPI listing sits under a publisher called 'regcheck-regcheck-default', and its link to Infinite Loop's RegCheck brand is not established
- MyCarPlate: its homepage country picker shows only UK/NL/NO/ES, so it was not evaluated for France
- Apify 'French License Plate Lookup' actor: not evaluated (a scraper listing, weak evidence)

---

## 2 · Is it legal, and where the data comes from

IS IT LEGAL, AND WHERE DOES THE DATA COME FROM — plate lookup for Driver enrolment (researched 2026-09-11; every point below comes from a page fetched today)

BOTTOM LINE
1. Yes, it's legal, but only through a licence. Code de la route art. L330-5 lets the Ministry of the Interior license ("agréer") private companies to reuse SIV data for three purposes. The third one is what a plate-lookup service runs on: "à des fins de sécurisation des activités économiques qui nécessitent une utilisation de caractéristiques techniques des véhicules fiables, sans communication des nom, prénom et adresse des personnes concernées." Owner identity never goes through that channel. [Légifrance L330-5, in force since 01/06/2019]
2. There is no government API a private company like Kavenue can call. The Ministry's reuse guide (May 2022) says licensees receive files and "Il n'est pas possible d'avoir un accès direct par API." The one official real-time SIV API (API Particulier, "Extrait d'immatriculation véhicule", data from ANTS) is "à destination exclusive des collectivités dans la cadre de la tarification du stationnement résidentiel" and only works through FranceConnect.
3. In practice you buy from a licensed private reseller. The Ministry publishes who holds licences. On the level-1 list (updated 24/10/2024, still the one linked from the Sécurité Routière page today), five companies have both a TECHNIQUE licence and a REDIFFUSEUR tick, which is what lets them pass data on to others: AAA DATA SASU, DATANEO, FABDATA, GROUPE DUBREUIL SERVICES, NEW GENERAL COMPANY (NGC). Check any vendor against these lists.
4. Kavenue's own position depends on whether it STORES the returned data. The Ministry guide (p.6) says an end user does NOT need its own level-2 licence if SIV data is "utilisées sans être stockées sur le poste ou le serveur informatique de l'utilisateur". It names companies acting for the certificate holder, using "la plaque d'immatriculation ou au VIN qui lui a été fourni par la personne (titulaire du CI)", for insurance quotes, parts lookup, claims and expert work. That is the closest match to "the Driver types their own plate". But: "si les données sont stockées sur le poste ou le serveur informatique de l'utilisateur, il doit demander, à minima, une licence technique de niveau 2". Filling in and saving a Driver's profile is storage, so read literally Kavenue would need a BT (technical, level 2) licence.
5. Under GDPR, a plate is personal data. CNIL: "La plaque d'immatriculation d'un véhicule est une donnée personnelle" (CNIL Direct Q1816), because it identifies the owner indirectly. The law itself treats the technical data it releases as personal data too: L330-5 calls them "ces données à caractère personnel" that go out "sans communication des nom, prénom et adresse".

THE LAW (Légifrance, consolidated text as of 11/09/2026)
- L330-1 (in force since 20/08/2026): the State, under the Minister of the Interior, records "toutes informations concernant les pièces administratives exigées pour la circulation des véhicules". This is the SIV.
- L330-2 (in force 27/06/2026 to 01/01/2029): a closed list of 21+ recipients. It includes: 1° "A la personne physique ou morale titulaire des pièces administratives, à son avocat ou à son mandataire"; courts, police, gendarmerie, customs and tax; 8° insurers, only "dans le seul but d'identifier les biens et les personnes impliqués dans un accident de la circulation"; 13° "constructeurs de véhicules ... pour les besoins des rappels de sécurité". No private marketplace is on the list. Item 19° (eCall) shows the law can limit a recipient to technical fields only: "limitée aux données techniques liées à la marque, au modèle, à la couleur, à l'immatriculation et au type d'énergie utilisé".
- L330-3 II: anyone may be told a plate has no lien (gage) or opposition "à l'exclusion de toute autre information". The public gets that and nothing else.
- L330-4: bailiffs and insolvency practitioners get the holder's identity, plate and vehicle characteristics "à l'exclusion de tout autre renseignement".
- L330-5: personal data "ne peuvent être communiquées qu'aux destinataires mentionnés aux articles L. 330-2 à L. 330-4", or to "tiers préalablement agréés par l'autorité administrative" under CRPA L321-1 to L327-1 for the three purposes: (a) statistics/research with no personal data in the output; (b) surveys and commercial prospecting, unless the person objects; (c) technical characteristics, without name, first name or address. An administrative inquiry may come before approval.
- L330-7: a criminal offence is committed by anyone who obtains "soit directement, soit indirectement, communication de données à caractère personnel dont la divulgation n'est pas expressément prévue par le présent code". This is the risk of using an unlicensed source.
- R330-7 (since 14/08/2017): applicants "demandent au ministre de l'intérieur la délivrance d'une licence"; the licence "vaut agrément"; it is "technique si elle est demandée aux fins prévues à son cinquième alinéa".
- R330-9: "durée maximale de cinq ans. Elle est renouvelable."
- R330-10 II (since 25/06/2010): a licensee may transfer SIV personal data only to (1°) its own processors bound by a confidentiality undertaking, (2°) L330-2 recipients, or (3°) "qui sont mentionnées à l'article L. 330-5, aux fins prévues par leurs licences", meaning other licensees.
- R330-11 II: a person may object to reuse "à des fins d'enquêtes et de prospections commerciales". That objection covers the commercial licence only.
- The arrêté of 10/02/2009 that created the SIV (art. 2) keeps owner identity (name, date and place of birth, address, phone, email) separate from "Données relatives au véhicule" (plate, VIN, "caractéristiques techniques", "date de la première immatriculation"). Art. 3 names automotive trade professionals, rental firms and manufacturers as recipients, under habilitation agreements. Since L330-1-1 (in force 15/06/2025), the habilitation to carry out "opérations d'immatriculation" requires an administrative inquiry. That route is for doing registrations, not a lookup channel.

TECHNICAL DATA VS OWNER IDENTITY: the law clearly treats them differently
- The technical licence delivers only blocks 4 and 5 (arrêté of 11/04/2011, Annexe III; guide Annexe III). No name and no address.
- Blocks 4+5 cover every field Kavenue asks for: "Marque du véhicule" (make), "Dénomination commerciale" (model), "Couleur" (colour), "Nombre de places assises, y compris celle du conducteur" (seats), "Carrosserie CE" / "Carrosserie - Désignation nationale" (body), "Type de carburant ou source d'énergie" (energy), "Date de première immatriculation du véhicule" (box B). They also carry the VIN, CNIT, category, national genre, power, CO2 and environmental class.
- A person's opt-out does not remove their car from the technical licence. Annexe III is headed "comprenant les données pour lesquelles le droit d'opposition a été exercé".
- Liens and transfer oppositions are never delivered under any licence (guide §9).

MAY TECHNICAL DATA BE RESOLD? Only from one licensee to another
- A level-1 licensee "vend des prestations issues de l'exploitation des données. (Il ne vend pas les données elles-mêmes)" (guide §7.2). The AT licence specimen defines "vente de caractéristiques techniques" as a permitted use.
- Ministry page (17/05/2022): transfer to another licensee is allowed, but there is no "rediffusion « en cascade » à des tiers inconnus du ministère". "tous les réutilisateurs des informations publiques issues du SIV doivent être titulaires d'une licence".
- A level-2 (BT) licensee "se limite à un usage strictement interne ... Il ne peut en aucun cas revendre ou rediffuser les données ainsi obtenues" (BT licence art. 9.4, July 2020 version).
- Penalties cited by the Ministry: Code pénal 226-16, "jusqu'à 300 000 € d'amende et 5 ans de prison".

GOVERNMENT FEES (arrêté of 11/04/2011; technical-licence art. 5-1 in force since 29/10/2017; read 11/09/2026). One "ligne" = one registration file.
- Technical, internal use: €0.0024 per line for 1 to 5,000,000 lines; €0.0015 above that.
- Technical, sale of services to third parties: €0.00384 per line up to 5M; €0.0024 above.
- Passing data on to another technical licensee: "+0,0025 euro par ligne de données rediffusées" (5-1.3). The BT level-2 licence (art. 12.1) says the level-2 licensee's fee is calculated on this basis, from lines passed on, and paid "au terme de chaque année civile".
- Technical delivery fees (art. 6), per year: one-off delivery €100; daily updates €25,000; weekly €5,000; monthly €1,400; quarterly €500; yearly €250.
- These are the State's fees only. A vendor's own price is separate and NOT covered here.

HOW A LEVEL-2 LICENCE IS OBTAINED (guide §19.2)
- A signed letter from someone named on the K-bis, plus documentation on the company, sent to reutilisation-donnees-siv@interieur.gouv.fr. The Ministry sends the licence to sign.
- The level-2 holder then gets its data from its chosen level-1 licensee.
- The same mailbox is the guide's "Contact juridique".

RELIABILITY (primary sources only)
- Data is supplied "en l'état, telles qu'elles figurent dans le fichier le jour de l'extraction" (guide p.4), "sans autre garantie, expresse ou tacite" (BT art. 11.1).
- My inference from the above: since licensees only receive files, a vendor's "plate API" answers from its own copy. That copy is at best as fresh as the delivery schedule it pays for; the most frequent option is daily.
- HistoVec warns it "ne peut pas remonter toutes les informations de certaines plaques d'immatriculation en raison de leur ancienneté" (pre-2009 plates). Its publisher accepts no liability for SIV errors.

OTHER ROUTES CHECKED
- HistoVec (Ministry, free, official SIV data): only the owner can generate a report, entering birth name, first name, plate and "Numéro de formule", then sharing a link. It shows make, colour, engine size, power, first-registration date and more. No API for third parties found.
- API Particulier (ANTS): real-time and "connectée directement au SIV", but for local authorities only (residential parking), and only through FranceConnect.
- Insurers: L330-2 8° gives them SIV access only to identify parties to an accident. AGIRA holds a level-1 TECHNIQUE licence but is not ticked REDIFFUSEUR. No source found saying insurer-held data may be resold for plate lookups.
- VTC register (REVTC): the public search takes SIREN, name or registration number, not a plate.
- data.gouv.fr (SDES): registration data aggregated by commune, with no plates.

WHERE THE LAW IS CLEAR
- A marketplace cannot get owner identity.
- Reusing technical data needs a Ministry licence. There is no cascade to unlicensed parties.
- There is no government API for private companies.
- A plate is personal data.

WHERE IT IS NOT CLEAR
(a) Whether "verifying the car a Driver will use to carry Guests" counts as "sécurisation des activités économiques ...". The law doesn't define it, the Ministry decides case by case, and the guide's examples (parts, claims, expert work, insurance quotes) are close but not the same.
(b) Two official texts pull in different directions. The Ministry page (17/05/2022) says all reusers need a licence; the guide (30/05/2022) exempts users who don't store the data.
(c) Whether saving values the Driver has confirmed counts as "storing SIV data". Read literally, the guide says storage needs at least a BT level 2. No source covers a copy the user has confirmed.
(d) Whether the no-storage exemption applies when the Driver is not the certificate holder (a leased, fleet or company car). The guide's wording is about the holder.
(e) Whether linking technical data to a named Driver conflicts with the licence ban on "recoupements" / "croisement avec d'autres fichiers" (guide §8; BT art. 10.3).
(f) L330-2 1° lets the holder's "mandataire" receive the data "par l'intermédiaire du ministre de l'intérieur, par voie électronique" (R330-3 I 2° a). I found no service that lets a platform act as the Driver's mandataire at scale.
Kavenue could put (a), (c) and (d) to the Ministry's legal contact at reutilisation-donnees-siv@interieur.gouv.fr.

NOTE: the SIV holds French registrations. I found no source on whether Monaco-registered cars are covered.

**Not found** (looked for, not there):

- Any official ANTS or government API open to a private company for plate-to-technical-data lookup (only API Particulier exists, restricted to local authorities)
- Any HistoVec API or HistoVec terms allowing a third-party platform to pull or parse an owner's report
- Any legal definition or Ministry guidance on whether a VTC marketplace verifying a Driver's car qualifies as 'sécurisation des activités économiques qui nécessitent une utilisation de caractéristiques techniques des véhicules fiables'
- Any source on whether storing values the Driver has confirmed (after a lookup) counts as 'storing SIV data' that triggers the level-2 licence requirement
- Any source on whether the guide's no-storage exemption applies when the Driver is not the certificate holder (leased/LLD, fleet or company car)
- Any electronic service through which a platform can act at scale as the holder's 'mandataire' under L330-2 1° / R330-3 I 2° a)
- Any primary source saying insurer-held data (e.g. AGIRA) may be resold or used by third parties for plate lookups
- Whether Monaco-registered vehicles are covered by any French lookup (the SIV covers French registrations; no source checked for Monaco)
- Any licensee list newer than the one updated 24/10/2024 (it is still what the Sécurité Routière page links on 11/09/2026)
- Commercial vendors' own prices, coverage or API terms (out of scope for this task; not researched)
- The exact CNIL wording on the parking page (cnil.fr/fr/pourquoi-me-demande-t-mon-numero-dimmatriculation...) — access refused (HTTP 403)

---

## 3 · Car colours and plate formats

Research done 11 Sep 2026. Every item below comes from a page I fetched, with its URL. I've marked each source PRIMARY (the vendor's or government's own page) or WEAK (press, blog or aggregator).

=== (A) CAR COLOURS ===

Bottom line: I found no France-specific colour breakdown published directly by AAA Data, SDES, ANTS or a French trade body. The numbers I could verify are European (from the paint makers) plus a few weaker French sets that disagree with each other.

1. BASF Color Report 2024, EMEA region (PRIMARY, published Jan 2025). Based on BASF's estimate of car production and paint applied to passenger cars, not on registrations.
   White 27%, Gray 22%, Black 20%, Silver 11%, Blue 9%, Red 5%, Green 3%, Beige 2%, Yellow 1%.
   https://www.basf.com/dam/jcr:0ddf377c-779e-4e49-9afb-d96186b54f05/basf/www/global/documents/en/news-and-media/news-releases/2025/01/20250109_BASF_ColorReport_2024_Global_Press_Kit_EN.pdf
2. Axalta 2025 report, Europe (PRIMARY press release, 16 Dec 2025). Based on 'automotive build data'. Gray 26%, White 25%, Black 22%; the release gives no other European percentages.
   https://www.globenewswire.com/news-release/2025/12/16/3206175/0/en/Axalta-Releases-2025-Global-Automotive-Color-Popularity-Report.html
3. Axalta 2023, Europe (WEAK: L'Argus, 23 Oct 2024). Dark grey 26%, Black 23%, White 21%, Blue 12%, Light grey 9%, Red 4%, Brown/beige 2%, Green 2%, Yellow/gold 1%, Other <1%.
   https://www.largus.fr/actualite-automobile/quelles-couleurs-de-voiture-ont-eu-le-plus-de-succes-en-2023-30036764.html
4. New cars registered in France 'l'an passé' (WEAK: Les Petites Affiches Matot Braine, 26 Dec 2025; data source not named; probably 2024 data). Counts:
   gris ~570,000 ('quasiment un sur trois'), blanc 337,000, noir 265,000, bleu 189,000, rouge 77,000, vert ~63,000, jaune 23,000, beige 21,000, orange 11,000, not classified 196,000.
   My own arithmetic, dividing each count by the sum of all listed counts: gris ~33%, blanc ~19%, noir ~15%, bleu ~11%, rouge ~4%, vert ~4%, jaune/beige ~1% each.
   Silver is not listed separately; the article's 'gris dans tous ses états' presumably includes it. On premium brands, buyers stick to 'gris, noir ou bleu'.
   https://matot-braine.fr/au-sommaire/automobile/un-peu-de-couleurs-dans-la-grisaille
5. carVertical, France (WEAK press release, 13 Jan 2026). Covers cars built in 2025 among the used-car history reports its customers bought, Aug 2023 to Aug 2025: noir 39%, gris 38%, bleu 16%, blanc 5%, jaune 0.1%.
   This is not new-car registrations, even though Boursorama (27 Jan 2026) described it that way. The 5% white conflicts with every other source.
   https://www.am-today.com/www.am-today.com/w/pdf/17251-1.pdf?VersionId=1768311680.311127
6. Two more French figures, both WEAK and without links to their source:
   - Hintigo credits AAA Data, no date: gris 35.3%, blanc 26.1%, noir 15.1%, bleu 9.4%, rouge 8.5%, marron 2.5%, beige 1.2%, orange 0.9%, vert 0.4%, jaune 0.4%. https://hintigo.fr/couleurs-voitures-plus-vendues/
   - Autohero cites 'Axalta 2023, AAA Data': gris & argent 31%, blanc 27%, noir 21%, bleu 11%, rouge 4%. https://www.autohero.com/fr/conseil/explorer/quelle-couleur-choisir/

VTC and black cars:
- No French rule sets a VTC's colour. The arrêté of 26 March 2015 on VTC vehicle characteristics says nothing about colour (https://www.legifrance.gouv.fr/loda/id/JORFTEXT000030429911).
- Uber France's vehicle requirements page (PRIMARY for Uber's own rule, undated), for Berline and Van: 'Toutes les couleurs sont acceptées, mais le noir est apprécié de la clientèle premium.' (https://www.uber.com/fr/en/drive/requirements/vehicle-requirements/)
- carVertical (WEAK) says dark colours are favoured for premium models, limousines and high-end passenger transport.
- I found no statistic on the colour mix of VTC fleets.

RECOMMENDED list (10 labels + Autre): Noir, Gris, Argent, Blanc, Bleu, Rouge, Vert, Beige, Marron, Jaune, Autre.
- Each label is a category in at least one of the sets above.
- Orange, violet, gold and two-tone cars go to Autre; each is about 1% or less in every set.
- I kept Argent separate from Gris because BASF and Axalta split them (silver 11% in EMEA 2024). A Guest looking for the car can tell a light silver from a dark grey.
- The French count data merges the two, so group Gris + Argent when comparing with it.
- Marron vs Orange for the 10th slot is a judgment call; both are near 1%.
- Store a fixed code per colour and show the French label.

=== (B) PLATE FORMATS ===

French SIV (current system):
- Annexe VII of the arrêté of 9 Feb 2009 (modalités d'immatriculation), in force since 29 June 2015: '2 lettres, suivies de 3 chiffres, suivis de 2 lettres' (AA-111-AA). https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000021700301
- Service-public (checked 26 Feb 2026): 7 characters, '2 lettres, 1 tiret, 3 chiffres, 1 tiret et 2 lettres', 'attribué chronologiquement dans une série nationale unique'. https://www.service-public.gouv.fr/particuliers/vosdroits/F17638
- ecologie.gouv.fr: numbers run from AA-001-AA to ZZ-999-ZZ. https://www.ecologie.gouv.fr/politiques-publiques/immatriculation-vehicules
- The physical plate (arrêté 'plaques' of 9 Feb 2009): black characters on a white retroreflective background (art. 7); EU symbol with 'F' on the left (art. 8); on the right, a regional logo plus the number of one of that region's départements, on blue (art. 9). https://www.legifrance.gouv.fr/loda/id/JORFTEXT000020237128
- The letters I, O, U and the pairs SS and WW are said to be excluded, but only by commercial sites. I did not find this in the primary text, so don't hard-block them.

French FNI (old system):
- Annexe I of the arrêté of 5 Nov 1984. Légifrance does not reproduce it ('voir JO du 22 décembre 1984 pages 11837'). I read it in a consolidated 2005 copy hosted on carte-grise.org, which is WEAK as a host but reproduces the official text: https://www.carte-grise.org/docs/nomenclature.pdf
  - Mainland départements: 1 to 4 digits, then 1 or 2 letters, then the 2-digit département.
  - Paris: 1 to 3 digits, then 3 letters, then 75. Other départements switch to this pattern once their 2-letter series run out.
  - Overseas départements: 1 to 3 digits, then 1 to 3 letters, then a 3-digit département.
  - At most 8 characters on the plate (9 overseas). Examples: 5723 HB 62; 448 NRC 75; 182 ABE 974.
  - Corsica's 2A/2B is not mentioned.
- FNI numbers are still valid today:
  - Service-public (Feb 2026): a pre-2009 car keeps its FNI number until some change is made to its registration certificate.
  - DSR FAQ (Sept 2020): the compulsory switch to SIV by end-2020 was dropped by décret n° 2019-1328. https://www.securite-routiere.gouv.fr/sites/default/files/2020-10/faq_reglementaire_droit_de_l'immatriculation_v2.pdf
  - The ecologie.gouv.fr page (updated 31 May 2026) still says the switch was due by 1 Jan 2021. That is out of date.

Monaco:
- Arrêté ministériel n° 78-5, article 6, consolidated as of 17 July 2025 (https://legimonaco.mc/tnc/arrete-ministeriel/1978/01-09-78-5/). A car's number is one of:
  - up to 4 digits (0001 to 9999);
  - 1 letter + up to 3 digits, letters B C D E F G H J K L M N P Q R S T U V X Y;
  - up to 3 digits + 1 letter, same letters without M.
- Blue characters on a white retroreflective plate (arts. 1 and 6).
- Front plate: red-and-white shield with 'MC' in blue (art. 2).
- Rear plate: 'Principauté de Monaco' plus an 'MC' sticker (arts. 2 and 4). The sticker is issued at registration and renewed each year (art. 5).

=== MONACO COMPANY vs PLATE: THE SOURCES DO NOT SETTLE IT ===

Here is what the texts do say:

(i) France: to put a vehicle on the French VTC register, Code des transports R3122-1 II 2° requires 'une copie du certificat d'immatriculation mentionné au I de l'article R. 322-1 du code de la route', meaning the certificate issued under the French Code de la route.
https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000023086525/LEGISCTA000030048481/2024-03-28
No article I found says outright that a Monaco-plated car is excluded, or whether a Monaco-established company can register on that register. Articles L3122-1 to L3122-9 contain no establishment or plate condition.

(ii) France, road use only (not VTC work). The DSR FAQ (2020) says a foreign-registered vehicle held by a person or company whose normal residence is outside France may be driven in France for up to 1 year. If a French resident imports it, French registration is compulsory after 1 month (Code de la route R322-1).

(iii) Monaco taxis and 'grandes remises' working in France (under the April 2023 deal). The only source is Monaco's Ministère d'État as quoted by France 3 on 15 Apr 2023 (WEAK): only medical trips and trips to the Côte d'Azur airports, and 'en aucun cas' picking up clients unrelated to the Principality.
https://france3-regions.franceinfo.fr/provence-alpes-cote-d-azur/alpes-maritimes/menton/monaco-remet-sa-vignette-pour-les-taxis-et-vtc-les-details-de-l-accord-conclu-avec-la-france-2754074.html
NOT FOUND: the French legal text behind this.

(iv) French VTC picking up in Monaco:
- A per-vehicle vignette is required (Ordonnance Souveraine 1.720, art. 45). https://legimonaco.mc/tnc/ordonnance/2008/07-04-1.720/
- Arrêté ministériel 2019-789, art. 2, requires proof the business has legally existed for at least 3 years, proof of listing in an official register of the Alpes-Maritimes or the Var, and a copy of the vehicle's registration certificate. https://legimonaco.mc/tnc/arrete-ministeriel/2019/09-16-2019-789/
- The official Monaco business portal page (updated 29 Apr 2024) gives the fees: €750 per vehicle per calendar year, or €600 per vehicle for the high season (15 Mar to 31 Oct). Quota: 105 annual + 210 high-season vignettes. Each trip must be declared at least 2 hours before pickup. https://monentreprise.gouv.mc/Transport/Acces-circulation-et-stationnement/Circulation/Demander-des-vignettes-pour-les-societes-de-VTC-et-VLC-etrangers
- The ordinance never defines 'étranger', so it does not say whether that means the plate or the company's location.

(v) Monaco's own chauffeur-car operators:
- Art. 20 (taxi chapter) says a taxi's main and replacement vehicles are 'immatriculé dans la Principauté de Monaco'.
- The chapter on véhicules de remise (arts. 24–32) has no such plate rule in the text I fetched.
- Art. 8 gives every vehicle in service an 'MC' registration number, except the vehicles covered by arts. 20 and 26.

So whether a Driver whose company is in Monaco must have a Monaco plate, or can use a French-registered car (and the reverse), is NOT SETTLED by the sources. Put the question in writing to Monaco's Direction de la Sûreté Publique and to the French VTC register manager.

**Not found** (looked for, not there):

- A France-specific colour breakdown published directly by AAA Data, SDES, ANTS or a French trade body (only second-hand, undated mentions of AAA Data found)
- The BASF Color Report 2025 EMEA percentages: the PDF redirected to surventiscoatings.com, which returned 403; the figures appeared only in a search-engine snippet, so they are not verified
- Axalta 2025 Europe percentages beyond Gray/White/Black (the full PDF is images only)
- Any statistic on the colour mix of VTC or premium chauffeur fleets in France or Monaco
- A primary text for the SIV exclusions of the letters I, O, U and the pairs SS/WW (commercial sites only)
- How Corsica's 2A/2B fits the FNI format (the Annexe I text gives only '2 chiffres')
- The SIV start dates (15 Apr / 15 Oct 2009), seen only in search snippets and not verified
- A French text stating whether a Monaco-established company can be on the French VTC register, or whether a Monaco-plated vehicle may be used for VTC work in France
- The French legal text (préfectoral or national) behind the April 2023 France-Monaco taxi/VTC deal
- A Monaco text stating whether a Monaco véhicule de remise operator must use a Monaco-registered car or may use a French-registered one; and a definition of 'étranger' (by plate or by company location) in OS 1.720

---

## Corrections — claims the verifier rejected

- **Claimed:** Auto Ways Network, api-plaque-immatriculation.com, api-plaque.com and Zyla show the same response format. api-plaque.com uses AWN_* fields with images on api.auto-ways.net; api-plaque-immatriculation.com uses the same field names without the prefix and the same sample car (FH-034-DD, VIN VF1R9800962986572). That they share one upstream is an inference.
  **Actually:** What https://www.api-plaque.com/ says (fetched 2026-09-11): its sample response for plate "FH034DD" puts an "AWN_" prefix on every field (for example AWN_VIN "VF1R9800962986572", AWN_marque "RENAULT", AWN_modele "CLIO", AWN_date_mise_en_circulation "20-06-2019"). The brand and model images are hosted on api.auto-ways.net. A "meta" block points to auto-ways.net/api-doc and to an auto-ways.net API reference page. The "Voir sur RapidAPI" button links to a RapidAPI listing published by "regcheck-regcheck-default". The page does not mention Zyla, the website api-plaque-immatriculation.com, or "Auto Ways Network" by name. So this page cannot support any comparison between four vendors, or the claim that api-plaque-immatriculation.com uses the same fields and sample car; those need their own sources. (Separately fetched, api-plaque-immatriculation.com does use the same VIN and plate, written FH-034-DD, with unprefixed fields that overlap, but several values differ and it has extra fields, so it is not the same response.) That api-plaque.com's data comes from auto-ways.net is still an inference, though a strong one because of the meta links. Prices: the page lists monthly quotas only (Basic free at 10, Pro 500, Ultra 1,000, Mega 10,000 requests/month). It says prices are deliberately hidden and refers readers to RapidAPI, so no euro price was found on this page.

- **Claimed:** carVertical (press release, 13 Jan 2026): among cars built in 2025 in its customers' used-car history reports (Aug 2023 to Aug 2025), France: noir 39%, gris 38%, bleu 16%, blanc 5%, jaune 0.1%
  **Actually:** carVertical press release (Paris, 13 Jan 2026, distributed by ESCAL Consulting; PDF on am-today.com, fetched 2026-09-11). For France "in 2025" it gives black 39%, grey 38%, blue 16% (7% the year before) and white 5% (13% in 2024) of the vehicles analysed. Separately, it says yellow is the least popular colour in France at 0.1% of cars checked, with no year given, so it may cover all checked cars rather than only 2025. Methodology: vehicle history reports bought by carVertical users between August 2023 and August 2025, with colours grouped by production year. That makes "2025" most likely the 2025 production year, but this is inferred from the methodology, not stated next to the figures. The data covers only cars carVertical's customers checked, not the whole French fleet.
