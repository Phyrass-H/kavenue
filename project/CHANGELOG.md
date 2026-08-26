# Kavenue — What we've built (plain-language history)

> A simple, dated log of what's been done — written to be read, not for engineers.
> Newest at the top. The detailed technical version lives in `SESSION_LOG.md`.

---

## 26 August 2026 — the fleet can be reached, and the console can be browsed

- **Your six Drivers without a base now have one.** Marc Fontaine and Élodie Marchand work out of Nice, Sofia
  Berger and Nadia Bouchard from Cannes, Karim Nasri from Antibes, Thomas Rey from Monaco — with deliberately
  different distances, so the *"how far will they drive"* rule actually decides something instead of passing
  for everyone. **Every trip in the Pool now has at least one Driver who could take it**, where two of the
  three had nobody an hour ago. Fully reversible with one command if you'd rather set them yourself.
- **You can now browse, not just search.** Drivers, Hotels and Trips each have a list. The Drivers list puts
  the one thing that matters on every row — where they work and how far they'll go, or *"no base — Pool
  empty"* in red. The Hotels list says how many of each hotel's trips nobody took.
- **The check you asked for by name is built.** *"Nobody has ever used the release request"* — and it's true:
  in Kavenue's whole history, not one Driver has asked a hotel to let them out of a trip. It found a second
  one too: **no Driver has ever filed a single document** — no licence, no insurance, no VTC card, for anyone.
- **Every finding can now prove itself.** *"23 cancelled trips don't say who cancelled them"* clicks straight
  through to those 23 trips, instead of asking you to take it on faith.

---

## 26 August 2026 — the Activity console: search anyone, and ask why a Driver can't take a trip

- **There is now an admin console at `admin.kavenue.fr`, and it answers questions instead of listing data.**
  Search a Driver, a hotel or a trip by name, open it, and read what happened — in order, with times.
- **The button you asked for first is built: *"why can't this Driver take this trip?"*** Pick any Driver
  against any trip and it re-runs the real rules and gives you one sentence back — *"their car is Eco and this
  trip asks for Business"*, *"they have never set a base, so their Pool is empty"*. Answering that used to mean
  asking Claude to query the database by hand.
- **It separates two things that look the same and aren't.** A Driver who would be **refused** saw the trip and
  would be turned down. A Driver who has **never been shown it** was never offered it at all — nothing refuses
  them, the trip simply doesn't reach them. Those need completely different fixes.
- **The front page only speaks when something is wrong.** Five lines today, one sentence each, every one naming
  the Driver or the trip it's about. When a check finds nothing, it says nothing.
- **⚑ Two things it found on its first run.** *Nobody in your fleet can take two of the three trips currently
  in the Pool* — both want an Eco car, your only Eco Driver has never set a base, so her Pool is empty and the
  trips were never shown to anyone. And **six of your nine Drivers have never set a base**, which means they
  have never been offered a single trip.
- **⚑ And two things you record about every Driver turn out to decide nothing.** The towns a Driver says they
  work in, and whether you have verified them — both are collected, both are shown on screen, and neither is
  consulted when Kavenue decides who sees a trip or who may take one. Marc Dubois isn't verified and can accept
  work today. Rather than quietly fix it, the console *says* so on every Driver, so it can't be forgotten — and
  a check now fails if either ever becomes a real rule without the console being told.
- **A trip's story is honest about what it can't prove.** Everything before 24 August was reconstructed when
  the log was switched on, so those times are marked *approx* and each one tells you exactly what it doesn't
  prove when you hover it.

---

## 26 August 2026 — a full written inventory of what the Admin page will show you

- **You now have a plain-English list of every single thing Admin can show**, saved in your project as
  `What-Admin-Can-See.html` and also online. Every item is marked as ready, partly there, or missing — with the
  real count, so nothing quietly pretends to be complete.
- **Three things it turned up that nobody knew.** The field meant to hold a trip's *area* has been filled with
  whatever was handy — 22 different values mixing hotel names, street addresses, terminals and towns, including
  "Nice" and "nice" as two separate things. So **"show me trips by region" doesn't work today** — it'll have to
  be worked out from the map instead. **23 trips are marked cancelled and there is no record of why any of them
  were cancelled.** And no Driver has ever uploaded a single document.
- **One alarm that turned out to be nothing, and it's worth saying.** The price a trip actually sold for is
  blank on all 280 trips — which looks exactly like the faults found this week. It was checked rather than
  assumed: the recording works, it's been live since 22 August, and those 280 trips are all older or test data.
  Real trips from here will carry it.
- **We agreed the order for what's next:** build the Admin *Activity* screen first, then generate a clean set of
  realistic test data, then you do your own hands-on pass on it and tell me what feels wrong. Your eye catches
  what mine can't; mine catches the faults that never announce themselves.

---

## 25 August 2026 — the admin area gets its own address: admin.kavenue.fr

- **You said putting the admin area inside the hotel app was confusing. You were right, and it was worse than
  confusing.** Kavenue deliberately keeps each side on its own web address so they each have their own
  sign-in. Sharing an address with Dispatch would have meant **signing in as administrator logged you out of
  your Business account**, and back again, every time you switched. Genuinely broken, not just untidy.
- **Your reason was right on its own too.** Dispatch is the *hotel's* app. Kavenue's own back office doesn't
  belong behind a customer's front door.
- **So it now lives at `admin.kavenue.fr`** — its own address, its own sign-in, alongside `driver.` and
  `dispatch.` DNS, certificate and sign-in link all verified working.
- **Two more silent bugs were caught before they shipped, by the computer rather than by anyone remembering.**
  The rule deciding "which page is home for each address" was written in a way that would have quietly sent
  administrators to **Dispatch**. And the sign-in page would have greeted you with "Kavenue Driver". Both were
  the same mistake as the ones from yesterday — something written for two cases, then a third case added.
- **That's now structurally impossible.** The code is written so it **refuses to build** if a new address is
  ever added without saying where it leads. Six times this month a "quiet wrong answer" has cost real time;
  this is the first change that makes the machine catch it instead of a person.

---

## 25 August 2026 — Kavenue can have an administrator for the first time

- **There was no way to be an administrator, and trying would have trapped you in a loop.** Kavenue has always
  had three kinds of account — Driver, Business, and administrator — but only two of them had anywhere to go.
  An administrator signing in would have been sent to the "who are you?" screen, which would have sent them
  straight back, over and over, forever.
- **Nobody ever hit it, because nobody had ever been made an administrator.** Four Business accounts, four
  Driver accounts, zero administrators. The fault has been there since the beginning and was completely
  invisible — the third kind of account had simply never been tried.
- **This is the same mistake as the three from yesterday, for the fourth time.** Something written but never
  reached. It doesn't break loudly; it just sits there looking like a feature nobody uses.
- **Your database always knew about administrators — the app didn't.** The permission rules have granted
  administrators access to everything from day one. Nothing about your data had to change. The missing piece
  was purely a way to get in.
- **Fixed properly, not just patched.** Three things: administrators now have a home; the "who are you?" screen
  now refuses to send anyone in a circle even if a future account type is forgotten; and a test now checks
  every kind of account can actually get somewhere, so this can't happen again quietly.
- **You now have an `admin@kavenue.fr` address, at no extra cost.** It's an alias on your existing mailbox
  rather than a second paid account — a second Workspace user would have been about €7 a month for something
  you'd only use to sign in.
- **What's actually there so far is deliberately almost empty:** a page that says "Admin". That's the point of
  this step — getting in. The real thing, **Activity** — search a Driver, a hotel or a trip and read its whole
  story in order — comes next, and you'll see a design before it's built.

---

## 25 August 2026 — the address box now finds what people actually type

- **Typing "Eden Roc" now finds the Hôtel du Cap-Eden-Roc.** Before today it found a vinyl café in Antibes, a
  holiday flat, and a building in Nice — the hotel wasn't in the list at all. The address search moved to
  Google; everything else about the box is unchanged.
- **"Terminal 2 Nice" now returns Terminal 2.** It used to return a pharmacy, then **Terminal 1**, twice.
- **"Hôtel Negresco" now returns the Negresco.** It used to return three Airbnb flats advertised as being
  *near* the Negresco.
- **The pattern, in one line: the old search needed the hotel's exact registered name; the new one works from
  the short name people actually say.** Type the full formal name and both were always fine — but nobody types
  the full formal name when a guest is standing at the desk.
- **Nothing about how the box looks or behaves has changed** — same field, same list, same keyboard, same
  everything the rest of the form does with it.
- **We deliberately left one thing imperfect, because you said so.** Google puts the Eden-Roc *restaurant*
  just above the *hotel*. They share an address, so the car goes to the right place either way — the line just
  reads "Restaurant". There's a setting that would push hotels up; you said leave it, so it's left.
- **Journey times and distances have NOT moved and are still Mapbox.** That was deliberate: Mapbox can tell us
  how long a drive will take *at the hour it's actually booked for*, traffic included — which is what feeds the
  arrival time and the Driver's time slot. Verified end to end today: address from Google, then Antibes →
  Nice Terminal 2 priced as **25 km · 44 min**.
- **You now have a Google account with a card on it, and a key locked to your own sites.** It's restricted to
  the one service it needs and refuses to work from anywhere that isn't kavenue.fr or your own machine —
  tested by trying it from a fake site and being refused.

---

## 24 August 2026 — three things that were quietly broken, and the checks that missed them

- **You can now take a trip back off a Driver who hasn't shown up for it.** The button existed, and it had
  never once worked for anybody — it waited for a state the app stopped using months ago. It now opens **two
  hours before pickup**, and only for a Driver who hasn't checked in. Check-in opens three hours before, so
  the Driver still gets a full hour of grace, and whoever replaces them gets two hours to get there.
- **The Event Log's second half is switched on.** Nine kinds of record were named, listed, and written by
  nothing at all — check-ins, price change proposals and answers, release requests, a Driver's phone number
  being revealed. They record now. The two you cut (who *browsed* the Pool) are still off, and now say in
  writing that this was your decision, so nobody "fixes" them back on.
- **Kavenue will no longer post a trip it couldn't work out a price for.** If the price came back missing,
  the check that's supposed to stop an underpriced trip was skipped entirely — and a skipped check looks
  exactly like a passed one. Now a missing price is a refusal.
- **⚑ All three were the same mistake, and it's worth naming.** In each case *no data* was being read as
  *no problem*. Nothing errored, nothing warned, and the silence read as success — which is why all three
  survived for months. Anywhere a check needs a number, a missing number now has to stop the trip.
- **Two of our own safety checks were themselves out of date, and were fixed today.** One tested the reclaim
  through the dead route above, so it went red the moment the real fix landed. The other insisted the Event
  Log hold *exactly* 1,848 records — on a log that grows every time anything happens, so it was destined to
  fail on the next working day. Both corrected, and one new check added: a Driver who **has** checked in must
  keep the trip, so that rule can't be dropped without something noticing.
- **One thing found along the way that you'll want to know about later.** The Event Log deliberately keeps a
  trip's history after the trip itself is deleted. That's right — but it means **221 of the 1,959 records
  describe trips that no longer exist** (nearly all of them from our own testing). It's now printed every time
  we run the checks, so the number can't creep up unseen, and the big clean-out before launch already covers it.

---

## 23 August 2026 — the old name is off the code repository

- **The code repository is now called `kavenue`.** It was still `Pickup-marketplace` — a public page under a
  name that belongs to someone else in your exact industry (La Poste's parcel arm, registered for transport).
  That's the kind of thing a trademark check finds. Old links still work; GitHub forwards them.
- **Nothing broke, and we checked rather than assumed.** The rule that stops bad code reaching the live site
  survived the rename untouched. Nothing inside the app ever mentioned the repository by name — every single
  mention was in our own notes.
- **Your repository page was also advertising the old address.** Its "website" link still pointed at the old
  name and it had no description. Both fixed — it now points at `kavenue.fr` and says what Kavenue is.
- **We designed the "a bigger car can take a smaller job" feature, and deliberately didn't build it yet.**
  You settled the important calls: a Driver can drop **one class only** (a First car can take Business work,
  never Eco — which protects the Drivers with the cheapest cars), and body type already works exactly the way
  the trade does, so there's nothing to change there. What's still open is a single number: how close to the
  pickup a trip should open up to bigger cars. You suggested 2 hours; the recommendation is 6, because the
  price stops rising 5 hours out and it's better to try more Drivers *before* asking you to raise your
  maximum. Your call when you come back to it.
- **You changed your own mind about when this helps, and the new version is better.** The original note said
  it was for quiet seasons. You argued the opposite: in a quiet season there isn't less First work, there's
  less of everything — so a First Driver taking Business work doesn't create work, it takes it from someone
  with a cheaper car. That reasoning is now what the design follows.
- **We checked whether anything stops a Driver accepting a trip their car can't physically carry.** Answer:
  the *type* of car is checked properly — a saloon can never be sent a luggage run. But **how much fits is
  not checked anywhere.** Nothing in Kavenue knows how many bags a van holds. There's also a small bug: the
  warning that says "8 bags is a lot even for a Van" is switched off for luggage-only trips — the one kind of
  trip that's entirely about bags. All written down; nothing changed yet.
- **Answering your question about drafts: yes, the price is fully recalculated when you post one.** A trip
  drafted on Monday and posted on Friday is priced at Friday's rates, and the climb starts on Friday, not
  Monday. The only thing that carries over is your own maximum, on purpose — that's your commercial decision,
  not ours. If it were below Friday's floor, posting is refused outright.
- **We found that the History page will break sooner than anyone thought.** Every doc said it would start
  struggling at around 5,000 trips. Nobody had actually tested it. It turns out it **stops working at 398
  past trips for a single hotel** — and it doesn't slow down, it fails. Your busiest hotel is at 271, so
  there's about 127 trips of room. That job just moved up the list.
- **The Event Log is now switched on.** You ran it, and it works: **1,737 records** already, and every trip
  change from here writes itself permanently. It even recovered your 23 cancelled trips, which had no record
  at all before today.
- **Half of it is still to come, and you should know which half.** Eleven kinds of event record automatically
  right now — booked, posted, taken, dropped, driven, cancelled, expired. Twelve more are named but recording
  nothing yet: who *looked* at a trip and didn't take it, who tapped a phone number. That's next session.
- **The Event Log you asked for is built and tested — it needs one paste from you to go live.** From then on,
  every time a trip changes state, the database itself writes a permanent record: who did it, when, and what
  changed. It's written as a database rule rather than as app code, and that distinction is the whole point —
  app code has to *remember* to record, and yours already forgets. Proof: you have **23 cancelled trips and
  zero cancellation records**, and 48 expired trips with only 26 records. A database rule can't forget.
- **It also rescues something you were losing.** Posting a draft used to overwrite the moment the draft was
  created. That moment is now kept permanently, separately, where nothing can overwrite it.
- **Tested by actually running it, not by reading it.** A throwaway copy of your database was built on this
  Mac from your real schema and all 47 migrations, then a trip was driven through its whole life — booked,
  posted, taken, dropped by the Driver, re-posted, taken again, driven, completed. Nine records, exact order.
  Pasting it twice changes nothing, and switching it off leaves the app working normally.
- **Being straight about the limits:** it cannot record what never happened in the database — someone
  browsing the Pool, a tap that failed. And it cannot recover the past: for your 280 existing trips, when
  each was booked and who took it is gone. That's exactly why starting now matters.
- **Fixed it — the History and Schedule pages will no longer break as you grow.** The app used to ask the
  database about every one of a hotel's trips by listing them all in one request, which failed outright at
  398. It now asks by hotel instead, so the request stays the same small size whether they have 10 trips or
  100,000. The wall is gone, not moved.
- **It turned out to be in more places than we thought** — five of them on the Schedule page alone, which was
  actually closer to breaking than History, because it counts upcoming trips too.
- **Proved it returns exactly the same data, rather than assuming.** Added 11 tests (473 now), deliberately
  broke the code to check the tests would catch it, and compared the old and new versions row-by-row against
  your real data. Everything matched.
- **Renamed a confusing term.** The docs called that problem "the volume ceiling", which clashed with
  **Ceiling** — your word for the maximum a hotel will pay. It's now called **the growth limit**, which is
  what it actually is.
- **You asked for records of everything, and you were right to.** Nothing currently records the moment a trip
  goes into the Pool. Worse, posting a draft *overwrites* the moment it was created. Analysis can be added any
  time; history that was never written can't be recovered. That's now a task of its own.

- **One thing is still out there, and it's yours to decide.** The old web address
  `pickup-marketplace.vercel.app` is *still live and still serving the real app*. Renaming things on Vercel
  back in July didn't release it, and there's no way to rename it — it can only be switched off. It's the
  more visible half of the same problem the repository rename was solving. Nobody can actually sign in on
  that address (it's been broken there for a while), so switching it off costs you nothing. It's saved in the
  backlog with the exact steps, for whenever you want it.

---

## 22 August 2026 — the price now moves the way it was designed to

> **All of this is live.** Five database changes applied, 462 automated tests, and six checks run against
> the real database rather than a copy. Next up: renaming the code repository off the old "Pickup" name,
> then two speed/robustness jobs that were meant to ship alongside the pricing work.

- **Putting a trip back in the Pool now changes nothing about its price except that time has passed.**
  It used to do three things at once — restart the climb, lift the starting price, and switch SPEED WIN
  on if the pickup was under 24h away. All three are gone. The trip simply goes back out at today's
  price and carries on climbing towards your maximum.
- **We stopped switching SPEED WIN on for you.** It's your box and your money, and it turned out to do
  least exactly when it was supposed to help: on a 110 € trip it adds 33% two days out, 7% twelve hours
  out, and nothing at all five hours out — because by then the price has climbed there on its own.
  SPEED WIN is now only ever what you set. Nothing to approve, no popup, no extra work for you.

- **A dropped trip goes back out at today's price, not the price it was taken at.** Your rule, and it's
  better than the one I'd built. A trip a Driver took a week out and abandoned two days out now
  re-enters the Pool at the **two-days-out** price and keeps climbing from there. The price depends on
  how long is left before the pickup — never on what any Driver did along the way.
- **Amending a trip no longer quietly lowers your maximum.** If you set a Ceiling of 110 € and then
  agreed 71,53 € for an added stop, your maximum silently became 71,53 €. It now stays at 110 € — an
  amendment can only ever raise it, never lower it — and the trip keeps a real price range to auction
  inside if the Driver later drops it.
- **Two holes closed that you'd never have seen.** A failed map lookup at the moment you re-posted a
  saved draft could overwrite that trip's floor with an unrelated number, permanently. And on a SPEED
  WIN trip the cancellation-fee check was still measuring against the old floor, which would have let a
  cancellation be charged at 22,50 € where it should have been 60,00 €. Both found by a review that
  reads the code adversarially and tries to break it.

- **A trip a Driver drops never goes back out cheaper than they agreed to pay for it.** This was the
  one real hole in the new curve, and you caught it. A Driver took a Cannes run at 50,68 € and walked
  thirty hours before the pickup; the trip went back into the Pool at **36,25 €** — cheaper than it
  had been a minute earlier, on a trip that was now *more* urgent, throwing away the one thing we
  actually knew: that a Driver had said yes at 50,68. It now re-opens at **50,68 €** and climbs from
  there. Every time it happens again it can only go up, never back down.
- **The agreed fare is now written down.** Until today the app worked out what a trip had sold for by
  replaying the price curve backwards every time it needed the number. It's now recorded the moment a
  Driver accepts, which is what makes the point above possible — and means a past price can be shown
  rather than re-derived. Trips from before today are untouched and read exactly as they always did.

- **Every trip starts at its floor.** Until today a trip went into the Pool at half the maximum you
  set — a number that had nothing to do with what the trip actually costs to run. It now opens at the
  **floor**: the lowest price the trip may legally be offered at, worked out from the rate card. On a
  22 km Eco run that is 26,30 € rather than half your Ceiling.
- **The price climbs against the clock, not against the stopwatch.** It used to go up by a fixed
  amount every ten minutes from the moment you posted it. It now climbs by the same amount **every
  time the time left before the pickup halves** — two weeks to one week is one rise, one week to
  3½ days another, ten hours to five hours another. The same rule whether you look a fortnight out or
  the same morning, and a trip posted two days ahead runs its whole climb over those two days.
- **It reaches your Ceiling five hours before the pickup**, and sits there until someone takes it or it
  expires. Post inside five hours and it climbs to the halfway point instead, so even a very late trip
  gets a real climb *and* time at the top to be taken.
- **Nobody can time it.** The rises are deliberately unevenly spaced, generated from the trip's own
  identity — so a Driver can't work out that "if I wait eleven more minutes it goes up again" and hold
  out. There is only one sensible strategy left: take it when it's worth it to you. It is still exactly
  reproducible: any past price can be replayed and proved, months later.
- **A trip a Driver walked away from re-auctions on the time that's left.** Put back in the Pool at
  T−12h, it runs its whole climb over the remaining seven hours and still tops out five hours before
  the pickup. Under 24h it comes back with SPEED WIN on, so it opens at 70% of your Ceiling.
- **SPEED WIN is now honestly described.** The box used to say it "climbs fast". It doesn't — it is the
  same curve with a higher starting point, and every trip reaches your Ceiling at the same moment
  whether it's ticked or not. The wording now says what it does.

---

## 20 August 2026 — the app now says the things it already knew

- **A stop you didn't pick from the list was free.** If you typed a stop and moved on without choosing
  one of the suggestions, we had no map location for it — so it wasn't on the route, and it wasn't in
  the price. It still showed up on the Driver's screen, and they still had to drive there. The form
  now asks you to pick it, exactly as it already does for the pickup and the drop-off. (You can still
  save an unfinished draft with one.)
- **You can see why a late trip cost more.** A pickup between 22:00 and 06:00 carries the night rate,
  and until now nothing on any screen said so — two identical airport runs, one 20% dearer, no reason
  given. There's now a small **Night rate** tag on the trip, on the Driver's card too, and a column in
  both exports.
- **Waiting time now shows what it was charged at.** A settled trip used to say "17 min" and an amount,
  and you had to take both on trust. It now reads **"17 min at 0,75 €/min"**. The Driver sees the same
  line at their own rate, so both of you can check the sum. Older trips that never recorded a rate
  keep showing just the minutes — we won't guess a number they were never charged.
- **When a Driver drops a trip, you'll know.** Until now the trip quietly went back to the Pool and
  looked exactly like one nobody had ever taken. The row now says a Driver had it, how long before
  pickup they walked, and the reason they gave — and both exports carry it.
- **Drivers: two things in Earnings were counting wrong.** Waiting time on a trip a hotel then
  cancelled was being swallowed into "Cancelled on you", so the minutes you actually sat there didn't
  show. And a trip you cancelled yourself was taken off your total without appearing in the list — so
  the days added up to more than the total, with nothing explaining the difference. Both fixed; the
  totals themselves never moved.
- **One thing we deliberately did NOT put on screen.** A Driver who drops a trip owes a penalty. Who
  that money should end up with is a fair question you raised — the hotel paid nothing and charges its
  Guest nothing, so 100% of the fare isn't really compensation for a loss. The block says what's
  certain and no more; the money is written up and waiting for your decision.
- **Three of our own mistakes, caught and fixed the same day.** A second review of the work above found
  them: a Driver who gives up *after* the pickup time (waiting for a Guest who never came) was described
  as "−18 min before pickup" in the exports and "0 min before pickup" on screen — both wrong, and they
  disagreed with each other; it now reads **"18 min after pickup"** in both places. A trip whose stop was
  typed without picking it *before* today couldn't be changed at all until someone re-picked that stop —
  now only a newly-added one blocks you. And the pickup time on the Schedule had quietly shrunk; it's
  back to full size.

---

## 16 August 2026 — Kavenue now works out the price for you

- **You don't type a price any more.** Pick the trip and the class, and the ceiling fills itself in
  with what the market charges — Cannes → Monaco in a Business sedan comes up as **159,40 €**. Change
  it whenever you like; it's a recommendation, never a rule.
- **It follows you.** Switch from Business to First and the number becomes 286,52 € on its own. The
  moment you type your own figure it stops following and the number is yours.
- **There's now a price too low to post.** Below the minimum the form turns red and says what the
  lowest is, and the server refuses it as well — so nobody can slip one past by other means. A
  slightly-low price is allowed, with a warning that it will take longer to find a Driver.
- **Late-night trips price themselves.** A pickup between 22:00 and 06:00 carries the 20% night rate
  automatically. The old "you might want to raise your price for a night trip" note is gone — it was
  asking you to do something the app now does.
- **Change the class, and the price follows.** Switch a trip from Business to First and the ceiling
  re-does itself for the new car — even if you had typed your own number. Your figure was for a
  different vehicle, and a stale price hides quietly instead of failing loudly. Type it again if you
  want it. (One exception: reopening a saved draft never touches the price you saved.)
- **One field disappeared.** The old "Estimated base fare" existed only to warn you when your two
  numbers disagreed with each other. Kavenue knows the real price now, so it had nothing left to do.
- Checked end to end against your live database, including trying to post a trip below the minimum
  by going around the screen — refused, nothing saved.

---

## 16 August 2026 — the prices, checked against the real market and fixed

*(Still no code — this was a day of pricing homework. The numbers are now settled and written into
`docs/06_Pricing_Commission_Payments.md`.)*

- **You priced eleven real routes on four different websites**, from a 6 km airport hop to a 619 km
  run to Geneva, and every quote got compared against what Kavenue would have charged. Where the two
  disagreed, we found out why.
- **The First tier was wrong, and you spotted it first.** It was charging a big fixed amount and then
  almost nothing per kilometre — so a 2 km trip cost roughly the same as a 5 km one, and a long trip
  came out far too cheap. It's now built the proper way round: a smaller fixed part, and a per-kilometre
  rate that is **1.8× the Business rate**, which is what the market actually does.
- **Long trips were being overcharged.** Everyone in this business charges less per kilometre the
  further you go — Blacklane drops from €4.36/km on a short run to €1.82/km on a 595 km one. Our price
  was a straight line, so past about 200 km we were asking **more than the websites charge their own
  customers**. There's now a second, cheaper rate beyond 150 km. Nice → Geneva in Eco comes out at
  **907 €**, right where you said it should be.
- **The V-Class moves up to First**, the Vito stays Business — your call, and every site we checked
  draws the same line. That also means Kavenue now has a **First — van** price, which it never had.
- **The van was cheaper than the sedan on short trips.** A quirk nobody had noticed. Fixed.
- **Uber turned out to be the best argument for Drivers we have.** A 6 km airport run pays a Driver
  **27,20 €** through Kavenue. The same ride on UberX leaves them about **12,70 €**. More than double,
  on our cheapest class.
- **Two of your questions are saved for later, not forgotten:** raising prices when demand is high
  (like the "high demand" banner you saw), and letting a Driver with a bigger car choose to accept
  cheaper trips in quiet season — you liked that one, and it's scheduled.
- **One thing to double-check when you have a moment:** two different websites quoted *exactly*
  1 082,07 € for the same Courchevel trip. Probably one resells the other, but worth re-opening one
  of them.

---

## 14–15 August 2026 — the price is decided, from end to end

*(Nothing was built this time. Everything was decided, and it's all written down in one place —
`docs/06_Pricing_Commission_Payments.md`.)*

- **Your commission numbers were never wrong, and neither were Claude's.** 12.5% and 15% are the same
  rate — one before the VAT on your fee, one after. Same for 10% and 12%. On a €100 trip: the hotel is
  invoiced **€115**, the Driver receives **€88**, and you bank **€22.50** after handing €4.50 to the state.
  One number to never use in public: **27%**, because it counts the taxman's share as your income.
- **One rule replaced a whole table of cases:** *money moving from the hotel to the Driver carries your
  commission — always.* An agreed release moves no money, so it carries none; a Driver's own penalty runs
  the other way, so it's compensation to the hotel, not a payment. That also settled cancellation fees: a
  €90 fee becomes €103.50 paid and €79.20 received.
- **Kavenue now works out the price, instead of a hotel guessing it.** We went and read **192 real prices**
  from nine operators plus the official taxi tariff, and rebuilt the whole rate card from them. Your
  instinct was right on the old one — Nice → Saint-Tropez in Eco was priced at 64% of what the route
  actually sells for. It's now 79%, which leaves the hotel a real margin.
- **The auction has a proper rhythm at last.** The price rises **every time the remaining time halves** —
  so a trip posted a fortnight out creeps up daily, and one posted this morning moves every few minutes.
  The same rule at every distance from the pickup. The steps are deliberately uneven and unguessable, so
  no Driver can work out when the next rise lands or how big it is — but any past price can still be
  proved, to the cent, if it's ever disputed.
- **The first version of that curve was wrong and you caught it** by asking what happens in the last twelve
  hours of a two-week-old trip. Answer: one price rise, €4.79. Dead exactly where it matters. The version
  that shipped into the doc moves **€36 across 25 steps** in that same window.
- **A hotel now knows its maximum cost the moment it books**, so it can quote its Guest straight away —
  and everything the auction saves below that is the hotel's margin. Their screen will show what they
  saved on every trip.
- **A Driver will get 30 seconds to think** before committing, with the price frozen. Your idea, and the
  reason is the right one: an attractive number grabbed on impulse turns into a cancellation, which costs
  a 100% penalty and leaves a hotel with no car.
- **Two things we decided *not* to do**, both because they'd quietly poison the prices: never learn what a
  route is worth from what Drivers accepted (that's fear of missing out, not the market), and never count
  a hotel that left our suggested price untouched as if it were their opinion.
- **Coming next:** building it. The rate card first, then the commission, then the new price curve.

## 10 August 2026 — you tested it and found one

- **A trip you'd been told never happened came back as upcoming work.** Because "it didn't happen" deliberately
  doesn't decide who's at fault, the trip keeps its old status — and that let it slip back into the Driver's
  Upcoming list, and into the count on the tab. It now stays where it was answered, showing a quiet
  *"You said this trip didn't happen. The hotel has been told and will be in touch."* instead of a warning.
  A trip closed as driven still moves to Past, which was right already.
- **Worth noting:** across all seven trips you tested, every one closed as driven settled with **no waiting
  charge** — the thing the whole design exists to protect.
- **Nothing changed for a normal trip.** Checked on a real one: the Driver still gets *Start — I'm en route*
  and *Cancel this trip*; you still get Cancel, Agreed release, Edit details and Propose a change. The new
  behaviour only ever starts once a trip is past when it should have ended.
- **Your two GPS ideas are written down** for when there's a native app — blocking an early "Arrived" tap, and
  penalties for lateness — along with the traps in each.

## 10 August 2026 — and now the Driver can answer

*(Needs one database change run first — see the note at the end of the session.)*

- **The question finally has buttons.** On a trip that ran, one button: *"Yes, I dropped the Guest"*, and it
  says what it settles — the fare they accepted — before they tap it. On a trip that never started, two:
  *"Yes, I drove it"* or *"It didn't happen"*.
- **"It didn't happen" charges nobody.** It isn't a cancellation — a cancellation decides who's at fault and
  attaches a fee, and nobody knows that yet, which is the whole reason we asked. It clears the Driver's prompt
  and turns your row red: **"Driver says it didn't happen — nothing has been charged, call them."** You and
  they agree what happened; in beta that's a phone call.
- **Closing late never invents money.** The fare was frozen when the Driver accepted, so closing weeks later
  settles exactly that and not a cent more. Waiting is deliberately excluded and the card says so — waiting can
  only ever be measured from an Arrived tap, and there wasn't one.
- **Once answered, the app stops asking** — either way. Your side keeps showing it, because for you it's now a
  call to make rather than a wait.

## 10 August 2026 — trips nobody closed no longer hide in plain sight

- **The Driver's "Upcoming" was lying.** All eight trips in it were between three and eight weeks old, and
  because the list puts the soonest first, the *oldest dead trip was the first thing on the screen*. They now
  sit in their own **Needs closing** group, and Upcoming means upcoming again.
- **Each one says what's wrong, in plain time.** *"Should have finished 35 minutes ago — close it when you've
  dropped the Guest"* for a trip that ran, or *"Pickup was 5 hours ago and this trip never started — tell us
  what happened"*. Minutes become hours, hours become days, so a trip that lingers still reads correctly.
- **Your Schedule shows them too, and calls them out.** Before, a trip boarded 54 days ago sat there as a calm
  green "On board", and a Driver who confirmed five weeks ago still read as "Checked in". Now the row turns
  amber, says **Not closed**, and tells you the Driver should have arrived at 11:05 and hasn't closed it — call
  them. And because every past day is folded away by default, these rows are **lifted up into today**, where
  you'll actually see them.
- **Two buttons removed from those rows, on purpose.** Cancelling a trip whose pickup has passed charges
  **100%** of the fare — and it was the only button on a row we now tell you to chase. Releasing it hands a
  weeks-old trip back to the Pool, where nobody can take it. Neither answers the real question, which is what
  happened.
- **A money hole closed before it opened.** Waiting charges are settled the moment the Guest gets in the car,
  so an unclosed trip can already owe real money — and it was appearing in no total anywhere, not even the
  "not settled" line that exists so nothing is hidden. No trip has one today; it's fixed before one does.
- **Still to come:** the buttons the Driver taps to answer. That part moves money, so it gets its own pass.

## 10 August 2026 — a robot now checks every change before you see it

- **Every push is now checked automatically.** Until today, the 294 tests only ran when someone remembered to
  run them — on a machine where everything already works. Now GitHub does it on a clean computer, every time:
  it installs the project from scratch, checks the types, runs all the tests, and builds the whole app. It
  takes about a minute, and you get a green tick or a red cross on the change itself.
- **Why it matters here specifically:** work on this project goes straight to `main`, and `main` goes straight
  to the live site. One forgotten check could put a broken version in front of a real hotel. Now something
  independent looks first.
- **It never touches your database.** The checks build the app against fake placeholder settings. Nothing in
  them can read or change a real trip, and no real key is anywhere near the file.
- **⚑ One thing for you to click, and it's the important half.** Right now the robot *reports*; it doesn't
  *stop* anything. Turning on **branch protection** in the GitHub settings makes a red cross actually block
  the change from landing. Until then, a broken push still ships and the cross arrives afterwards.

## 9 August 2026 — the last six from the audit, and the list is done

The August audit found 17 problems. All 17 are now either fixed or written up. Six went in today; three
of them needed a real decision, so those are spelled out.

- **A cancellation fee can no longer be talked down to nothing.** The app has always sent the trip's real
  price along with a cancellation. But nothing stopped someone sending the request *without* it — and the
  database would then record a fee of **0,00 €** on a cancellation that owed the full fare. Same trick on the
  Driver's side: their 100% penalty recorded as blank, which showed in their own history as a dash. The
  database now refuses to record a fee based on less than what the trip was listed at. **Being straight
  with you: it's a floor, not a fence** — someone could still understate down to the listed price, roughly
  half the fare. Closing that completely would mean teaching the database to work out fares itself, which
  would give us two places that calculate money instead of one, and that's how the numbers drift apart.
  It also doesn't yet cover no-shows.
- **A Driver could accept a trip their car doesn't fit.** A saloon Driver could take a van-only luggage run —
  the checks were all in the app, and the app isn't the only way in. The database now checks the class, the
  body type and the luggage opt-in when a Driver accepts. **The honest limit:** it checks the car a Driver
  has *declared*, not the car they actually own — anyone can change their own vehicle details in Settings.
  What changes is that the claim is now on the record instead of invisible.
- **You could have a change request and a release request waiting on the same trip at once**, and the
  Driver's answer order decided the money: accept the change first and the trip's price is permanently
  raised — then the release hands that raised price to the next Driver. **From now on the newest request
  replaces the older one**, so the Driver is only ever asked one thing. ⚑ **The cost, and it's yours to
  overturn:** if you send a release and the Driver declines it, your change request is gone and you'd have to
  type it again. The release screen now warns you before you send, and the schedule says it too.
- **The archive was hiding waiting charges.** A cancelled or no-show trip showed one figure that quietly had
  the waiting inside it. Now it says so: *"Charged in full · incl. 33,00 € waiting"*.
- **A Driver can now tell you why they kept a trip.** When you asked for a release and they said no, the app
  offered no way to explain and you saw nothing. They can now pick a reason and you see it.
- **Three notes in the code that were simply out of date** about how a cancelled trip returns to the Pool.

## 9 August 2026 — six quiet defects closed (the list from the audit)

Nothing here changes how the app looks or what anything costs. These are the six problems from the August
audit that had a clear right answer and needed no decision from you.

- **A finished trip could still be showing "waiting for the Driver to accept a change".** When a trip ended
  any other way — cancelled, no-show — the pending request was cleared automatically. When it simply *finished
  normally*, it wasn't, so the request sat there forever. Worse, that stale request hid the last real one
  behind it, so the record of a change the Driver actually accepted disappeared from view. Both now clear
  themselves when the trip completes.
- **And when a change genuinely can't be accepted anymore, the schedule says so.** Once a Driver is on the
  road, the app refuses to apply a change — but the schedule kept promising "Waiting for Marc to accept". It
  now reads *"The trip has moved on — this change can't be accepted anymore"*, and the button becomes
  **Dismiss** so you can clear it. (The tempting fix was to hide the box entirely; that would have trapped the
  request with no way to get rid of it.)
- **An unfilled trip could still be opened for editing.** A trip whose pickup time passed with no Driver is
  over, but the Edit page didn't always know that yet and would show you the form. It now refuses, and
  explains why — *"its pickup time passed with no Driver … post a new trip if the Guest still needs a car"* —
  instead of the old line about a Driver having started the run. A **confirmed** trip a few minutes past its
  pickup time is still fully editable, which is exactly when you need to fix a Guest's phone number.
- **Three descriptions of the database were out of date** — harmless today, but the kind of thing that turns
  into a wrong number later. Corrected.
- **Two more went into the database itself, and are now live.** A trip that goes back to the Pool used to
  carry the *previous* Driver's check-in with it — so you'd be told a trip was confirmed when the new Driver
  had never even been asked, and the red "not checked in" warning stayed hidden. And two parts of the system
  were reaching for the same trip in opposite orders, which could make a Driver's screen show the words
  "deadlock detected". Both fixed and checked against the real database, including that the Pool pricing they
  sit next to still moves exactly as before.

## 9 August 2026 — the cancellation fee stops sliding, and the database is finally checked against the app

- **The cancellation fee now moves in half-hour steps instead of creeping every second.** It used to rise
  continuously, which meant the price in the cancel box was never quite the price you were charged — you'd read
  "49,00 €", hesitate thirty seconds, and be billed 49,06 €. Always a little more, never less. Now the price
  holds still inside each half hour, so what you read is what you pay. Free until 5 hours before pickup, then
  50%, then +5 points every half hour up to 100% at pickup. Every landmark you already knew is unchanged.
- **The box now tells you when the price goes up, and counts down to it.** *"This price holds until 16:20 — then
  55% (264,00 €), in 6 min."* A step means a cliff, and a cliff you can see coming is a deadline rather than a
  trap. It also means the rule is finally something you can say out loud: "cancel before 14:30 and it's 60%".
- **We proved, for the first time, that the database and the app agree about money.** The fee rules have always
  been written twice — once in the app, once inside the database — and nobody had ever checked the two match.
  They now do: 649 checks on the waiting rules without touching anything, then 170 checks driving real test trips
  through the real cancel buttons and deleting them afterwards. No disagreements.
- **That check immediately earned its keep — it caught a bug we'd just introduced.** Making the percentage a round
  number made a rounding clash possible that hadn't been before: a 85,50 € trip at 95% comes to exactly 81,225 €,
  and the app rounded it down while the database rounded it up. One fare in twenty was affected. Fixed within the
  hour, and now checked across all 1.1 million possible combinations.
- **Waiting time is now paid for whenever it happened — including when the trip goes ahead.** This was the
  biggest hole we found. A Guest turns up 45 minutes late, both apps show a meter running, the Guest gets in the
  car — and nobody was charged a penny. Which meant a Driver earned more by reporting a no-show than by driving
  the person they'd waited for. Your ruling: the Business pays the waiting, and charges its own Guest. It now
  settles the moment the Driver taps "Guest on board", and the Driver sees one line confirming it —
  *"19,00 € waiting added · 19 min past the courtesy wait"*. If the Guest was on time, nothing is recorded at all.
- **The cancel box now shows the whole bill.** If a Driver was already waiting, the box quoted the trip fee and
  quietly left the waiting off — it said 47,99 € on a trip that charged 64,99 €. It now leads with the real
  total and shows how it breaks down. It also warns that the waiting keeps climbing while you decide.
- **"Free to cancel" now means free of everything.** If a flight lands early, the waiting clock can start before
  the booked pickup time — and the box used to say "Free to cancel" over a charge that was already running.
- **A Driver can finally see waiting they were paid.** Their Earnings said 100,00 €, their trip history said
  60,00 € — same trip. Both now say 100,00 €, with the waiting named rather than quietly folded in.
- **An audit of the cancellation and waiting rules turned up 17 real problems** (and threw out 8 false alarms).
  None are new, none break anything you can see today, and they're all written down. The two worth knowing about:
  if a late Guest finally turns up and the trip goes ahead, **nobody is charged for the waiting** — so a Driver is
  currently better off reporting a no-show than driving them. And the cancel box quotes the trip fare without the
  waiting charge that's added on top. Both are on the list, neither is fixed yet.

## 8 August 2026 — the money now checks itself

- **242 automatic checks on every number the app works out.** Until today, the only thing standing between a
  wrong fare and your screen was someone noticing. Now there's a command (`npm test`) that re-checks the whole of
  the money — fares, waiting, cancellation fees, no-shows, what a Driver earned, what a hotel spent, and the date
  ranges all of it is cut by — in about a second and a half. Nothing about the app itself changed; this is a
  safety net under what's already there.
- **Every money bug we've had is now written down as a test.** The trip that got more expensive after it
  finished, the airport that was read as a city because of the accent in "Aéroport", the Driver who could file a
  no-show hours early, the comparison that measured 8 days of one month against 31 of another — each one now has
  a check that goes red if it ever comes back.
- **Three promises are now checked, not just believed.** That what a hotel is charged is exactly what the Driver
  is paid, on every kind of trip. That the archive, the Spend page and the exported spreadsheet always add up to
  the same total, whatever you filter by. And that the price agreed when a Driver accepted is the price
  everything else is worked out from.
- **The safety net was tested for holes.** Two real bugs were deliberately put back into the code to make sure
  the checks actually caught them — they did, loudly — and then removed. A test that can't fail isn't protecting
  anything.
- **Two small things were found on the way — and both are now fixed.** There was an unused total inside the
  archive code that added up fares but forgot waiting. Nothing was reading it, so nothing on screen was ever
  wrong — but it sat right where a future change would reach for it. It's gone.
- **"Today" on the Spend page no longer congratulates you at 9am.** It used to compare this morning against all
  of yesterday and paint the gap green, as though spending less by breakfast were a saving. Yesterday's total is
  genuinely useful as a **target**, so it stays — it just isn't scored any more. On the day that's still running
  you now see a calm grey line: *"Day still running · Thursday 7 August came to 500,00 €"*. Every other period —
  this week, this month, this year — already compares like with like, so those keep their green and red.

## 8 August 2026 — Spend, used in anger and then pulled apart
- **Test data, so the page could actually be judged.** Three real trips proved nothing, so the demo hotel now has
  **237 trips across three months** — six Drivers with real cars, three booking desks, and a realistic mix of
  completed, cancelled, no-show, unfilled and never-closed trips. Every euro is worked out by the app's own rules, so
  anything odd on screen is the page's fault and not the data's. It can be removed in one command.
- **The chart's comparison is now a second bar, not a grey line.** Two shapes didn't read as two of the same thing.
  Two colours, one shape — this month solid, last month pale, side by side.
- **Hover any column** and you get the date, what you spent, how many trips, and last period's figure underneath.
- **No chart on a single day.** A "spend over time" chart covering one day was just the big number drawn again.
- **"What it's made of" → "What makes up the total"**, and **"What cost you money" → "What went wrong"**.
- **The comparison column is gone** from that list. A "+45,00 €" sitting next to a price made you work out what it was
  measuring; the comparison now lives where you can see it — the pill under the total, and the chart.

**Then we audited the page properly, and it was not all fine.** Seventeen things were wrong; all are fixed. The three
worth knowing about:
- **The page you land on was misleading you every month.** Opening Spend on the 8th compared eight days of this month
  against *all thirty-one* of last month — and showed the difference as good news in green. It now compares the same
  number of days on both sides: "August 2026 · compared with 1 July – 8 July".
- **History's downloaded file didn't match History's screen.** We'd started counting waiting charges in the on-screen
  total earlier that day and hadn't updated the file. Both now say the same number.
- **The comparison bars were quietly wrong.** Comparing March with February drew three February days twice, and
  comparing February with January skipped a day entirely. Day 1 now sits beside day 1.

Also fixed: cost per trip counted waiting from cancelled trips; the exported file called a filtered subtotal a period
total; it wrote "0,00 €" where the screen honestly says "—"; hovering a column counted trips nobody drove; a trip row
said "including waiting" about money it wasn't including; the chart claimed a comparison it wasn't drawing when last
month was empty; "6 unfilled" was a dead end you couldn't click; and the chart's own labels were being stretched about
half again as wide as they should be.

---

## 7 August 2026 — **Spend**: a proper back-office view of what your transport costs you
- **A new page in Dispatch, next to History: Spend.** It answers three questions on one screen — what did we spend,
  why is that different from last month, and what could we have avoided.
- **One filter bar runs the whole page**, the CSV included. Pick a day, a week, a month, a year or your own two dates,
  choose what to compare against, and everything below moves together. No two panels ever disagree about which dates
  they're showing.
- **The total leads, and two numbers explain it**: how many trips, and what a trip cost you on average.
- **"What you got"** — a quiet line under the total, because a page about money going out shouldn't be the only story:
  how many of your requests found a Driver, and how fast one took them. (Arrived-on-time is there too, honestly blank
  until we have the data to fill it — we'd rather show you a dash than a guess.)
- **One chart, not five.** Spend day by day, with last month drawn behind it as a grey line. Click any column and the
  whole page narrows to that day.
- **What it's made of** — trip fares, waiting, cancellation fees, no-shows. Click any one and the trip list below
  shows you exactly those trips.
- **What cost you money** — the avoidable part, gathered in one place: trips cancelled once a Driver was holding them,
  Guests who never came down, waiting past the free window, and missions nobody took.
- **Where the money went** — switch between Type, Class, Route, Driver and Desk. "Desk" is new anywhere in Kavenue:
  if your night concierge and your day concierge both book cars, you can now see them separately. Click a Driver and
  the whole page narrows to them.
- **Export CSV** gives you exactly what's on screen, opens correctly in French Excel, and ends with a total row.
- **Two rules the page will never break.** A trip a Driver took but never closed is shown with its agreed fare, clearly
  marked, and left **out of every total** — counting it would inflate your spend with trips that may not have happened.
  And an unfilled mission shows "—", never "€0", because nobody ever held it.
- **A number we built and then deleted.** "You're 17 % under your Ceiling" was going to be the positive line on this
  page. It's gone: raising your Ceiling makes that number *look* better while you actually pay more, and the reasons a
  Ceiling moves — season, your standing, demand — mean nobody can read it anyway. "How fast a Driver took your trip"
  says the same thing honestly, so that's what's there instead.
- **A quiet fix to History on the way.** It was adding up trip fares but forgetting waiting charges, so it was
  under-reporting any trip where a Driver waited and was paid for it. Both screens now count the same way.

---

## 31 July 2026 (later) — The Earnings date picker works, and you can pick your own dates
- **The broken calendar is fixed, and the reason it broke is worth knowing.** The date button wasn't opening a
  calendar of ours — it was secretly holding your phone's *own* date control, made invisible, and trying to poke it
  open from the outside. On a phone that does nothing at all, which is why tapping did nothing. On a computer it
  opened a calendar attached to an invisible one-pixel spot, which is why it wouldn't close. That whole trick is gone.
- **You now get Kavenue's own calendar** — the same one the mission form uses. It opens on tap, closes when you tap
  away or press Escape, and behaves the same on a phone as on a computer.
- **New: "Range".** A fifth button next to Day / Week / Month / Year. Tap the start date, tap the end date, done —
  "what did I earn between these two dates", which wasn't possible before. The ‹ › arrows disappear in this mode,
  because stepping forward from a made-up span doesn't mean anything.
- **Four shortcuts** inside it: last 7 days, last 30 days, this month, and **all time** — every trip you've ever done,
  in one tap.
- **You can finally SEE what Day/Week/Month/Year do.** Pick Month and the whole month lights up on the calendar. That
  rule always existed, it was just invisible.
- **Future dates are greyed out.** There's nothing to have earned tomorrow.
- **The calendar now shows what you're actually picking.** Your idea, taken one step further. On the **Month** tab it
  shows the twelve months of a year and the arrows step a **year** — you tap "Jun" instead of tapping some day in June
  and hoping. On the **Year** tab it shows twelve years and the arrows step **twelve years**, so getting back to 2024
  is one tap instead of about thirty. Day, Week and Range still show days, because there a day is genuinely what you're
  choosing.
- **A finished range now stays on screen.** Picking the second date used to close the calendar instantly, so you never
  saw the range you'd just built. It stays open now — the days join up, the label rewrites to "6 July – 22 July · 17
  days", and the totals load behind while you look. **Done** closes it, and because the results were already loading,
  that tap costs no waiting. The four shortcuts still close on the spot — one tap, nothing to check.
- **The comparison still works for your own range.** Pick 46 days and it compares against the previous 46 days — not
  against a calendar month, which would have been a meaningless comparison dressed up as a real one.

---

## 31 July 2026 — Trips that nobody took now die properly
- **You found this one by using the app**: the Pool was full of trips from weeks ago. Every single pooled trip — all 23
  — had a pickup time in the past, the oldest by 44 days. Nothing in the product had ever closed one.
- **A trip now dies the moment its pickup time passes.** It leaves the Pool, and the Business's row turns red and
  reads **"Unfilled · No Driver accepted it before the pickup time"**. It stays on the schedule for the rest of that
  day so you can't miss it, then folds away with the other past trips.
- **The part that actually mattered: a Driver could still accept them.** Tapping Accept on a six-week-dead booking
  would have created a real, priced job — with a real cancellation fee attached — for a hotel that had long since made
  other arrangements. That's now blocked in three places, including inside the database itself, so it can't happen even
  if someone hits the exact second the trip dies.
- **No new moving parts.** Closing old trips happens quietly whenever a Pool or Schedule page is opened, so there's no
  scheduled job to set up, pay for or watch. When we build notifications we'll want a proper timer anyway — that's the
  moment to revisit it, not now.
- **Your Pool is empty as a result** — correctly, since every trip in it was dead. New trips you post will behave
  normally.
- **History now has filters.** Your past trips were one long mixed list. There are now four buttons at the top —
  **All · Completed · Unfilled · Cancelled** — each showing how many, so you can see at a glance how many trips never
  got driven and tap once to see only those. Each month line also says how many it lost (`8 trips · 7 unfilled`), and
  the red number only shows up when there is one.
- **One word changed, for a reason.** A trip nobody took used to say **"Expired"** — a computer word. It now says
  **"Unfilled"**. And because the Schedule already used "Unfilled" as a *warning* for a trip that's coming up soon with
  nobody on it, that one now says **"No Driver yet"**. So: *No Driver yet* = you can still fix it. *Unfilled* = too late.
- **⚠️ One thing the numbers will show you.** The four buttons don't add up to the total, on purpose. **8 past trips
  have a Driver on them and no ending** — they were accepted and never closed (one has been "on board" for 36 days).
  Those aren't unfilled and they aren't completed, so they only appear under All. That gap is real and it's the next
  thing to decide: what does an abandoned trip cost, and who pays?
- **What this does NOT do yet: count anything.** "How many trips did we fail to fill" is the single most useful health
  number for the marketplace, and it needs the back-office to have somewhere to live.

---

## 30 July 2026 — Drivers can now confirm they'll be there
- **Three hours before a pickup, a Driver gets a "Check in" button.** One tap tells the hotel they're on it. The count
  on the My Rides tab tells them how many are waiting, wherever they are in the app.
- **The hotel finally has a signal.** Until now a Dispatcher had no way of knowing whether their Driver was engaged —
  they just waited. Now the trip's row says **"Not checked in"** and the whole row turns amber once check-in opens, then
  red inside the last hour. Once the Driver checks in it goes quiet again and reads **"Checked in"**.
- **A Driver who just drives off is counted as checked in.** Starting the trip says more than the button does, so
  nobody who's already on their way shows the hotel a warning.
- **What this does NOT do yet: remind anyone.** There's no notification — a Driver only sees the prompt when they open
  the app. That needs the notifications work, and it's why nothing bad happens if they don't check in: the hotel is told
  so they can call, and that's all.
- **The take-back button is still not back**, deliberately. Taking a trip off a Driver at the last hour has to be based
  on them ignoring a reminder we actually sent — and we can't send one yet. Building it on "hasn't started driving"
  would have let a cancellation that costs 90% be made free instead, an hour before every single trip.

---

## 29 July 2026 — Kavenue moves to its own address, and gets real email
- **The app now lives at `kavenue.fr`.** You bought the domain, and everything moved onto it the same day: the front
  page at `kavenue.fr`, the Driver app at `driver.kavenue.fr`, the Business side at `dispatch.kavenue.fr`. The old
  `pickupbedriven.com` is switched off. Since March the product has been *called* Kavenue while still living at the old
  address — that's now closed.
- **Typing `www.kavenue.fr` takes you to `kavenue.fr`,** not to a second copy of the site. The bare name is the real
  one, so that's what goes on a business card.
- **You have real email.** `phyrass@kavenue.fr` is your mailbox. `support@`, `feedback@` and `contact@` all land in
  that same inbox and cost nothing extra — one paid mailbox instead of four. `support@` and `feedback@` were already
  printed inside the app, so those two had to be real.
- **Your mail is set up so it won't land in spam.** Three checks (SPF, DKIM, DMARC) tell a hotel's mail server that a
  message really is from you and hasn't been tampered with. All three were tested on a real message and pass. This is
  the unglamorous part that decides whether outreach gets read or silently binned.
- **Nothing about how the app works changed** — no new screens, no changes to trips, money or accounts. Same product,
  new address.
- **Two things left on purpose.** The old domain is switched off but still registered in your name (worth keeping so
  nobody else takes it). And the reminder emails the app promises — document expiry, trip alerts — still need the
  notifications work; having mailboxes doesn't make those send yet.

---

## 28 July 2026 (evening) — Earnings
- **The Earnings tab is real.** Big total for the period, what it's made of, and every trip listed underneath grouped
  by day. No charts — you didn't want them, and the day and week rows say the same thing in numbers you can read.
- **Look at any period you like.** Day, week, month or year, ‹ › to step back one at a time, and tapping the dates
  opens your phone's own calendar to jump anywhere. Whichever of the four is selected decides what the date you pick
  means — 18 July in "month" mode shows you July.
- **It compares.** A green or red chip shows how the period did against the one before it. The same-period-last-year
  line will appear on its own once there's a year of history — right now the oldest trip is 16 June, so there's
  nothing to compare to yet.
- **It counts the money that isn't a trip fare**: waiting time, a no-show (which pays you in full), a Business
  cancelling on you — and your own cancellations in red, so the total actually adds up.
- **⚠️ A real money bug, found and fixed — and it was worse than it first looked.** A trip's price rises while it waits
  in the Pool for a Driver, but the clock was never stopped when someone took it. So a finished trip kept getting more
  expensive: one demo ride was accepted at **70 €** and was showing **100 €** weeks later. Worse, **cancellation fees
  were being calculated off that inflated number** — a Driver walking away from a 70 € job was charged 100 €, and a
  Business cancelling was billed too much too.
- **Now the rule is simple and applies everywhere: the final price is the price the Driver accepted.** Every screen and
  every fee on both sides uses it. Tested for real on the live database: a Driver cancelling a 70 € trip is now charged
  **70 €** (was 100 €), and a Business cancelling the same trip at 83% is charged **58,17 €** (would have been 83 €).
  A few historic trips will show their correct, lower number. The schedule also stops saying "Fare now" once a Driver
  has the trip — it says **"Agreed fare"**.
- **Still to decide (noted for you):** now that the fee is based on the real fare, **100% may not be enough of a
  deterrent on cheap trips** — a 50 € job only costs 50 € to abandon. Written into the backlog with some options; no
  rule changed.

## 28 July 2026 (later) — the Driver's account, rebuilt
- **A Driver's settings is now a proper account area.** It used to be one very long scroll with a single Save button
  that quietly saved your car as well as your phone number. Now there's an **Account** screen — your photo, your name,
  your car, and a line telling you exactly what's still missing — with a separate page for each thing: Profile, Where
  you work, Your vehicle, Your company, Documents, Navigation, Payouts, Help.
- **"2 things left before you can drive."** Instead of a meaningless progress percentage, the account page names what's
  actually missing — *"URSSAF attestation — not added"*, *"VTC card — expires in 21 days"* — and each one is a link
  straight to it. Anything that would stop you working is listed first. **It only tells you; it never blocks you** —
  during the beta nobody is locked out for a missing paper.
- **Documents are a real feature now, not a list of upload boxes.** Each paper has a state you can see at a glance —
  valid, with us for review, needs a new photo, **expires in 21 days**, expired — and we ask for the expiry date when
  you file it, so nothing lapses quietly. If we reject one, you're told **why**. Two-sided papers (licence, VTC card)
  take a front *and* a back instead of one replacing the other.
- **Take a photo, and frame it before it's sent.** A camera button opens the phone camera directly; you then crop the
  document, turn it if it came out sideways, and straighten it if it's crooked — the same framing tool the profile
  photo uses, and it starts by showing your whole document rather than cropping the ends off. A PDF still works and
  skips the framing step.
- **We now collect what we need to actually pay you.** A Driver drives as a company, so the account asks for the
  company name, SIRET and VAT number, and the documents list has a "so we can pay you" section: **Kbis, RC Pro, and
  the URSSAF attestation de vigilance** — that last one is something *Kavenue* is legally required to hold and renew
  every 6 months. **We never ask for your bank details** — Stripe collects those when payouts go live.
- **Languages are chips now**, not a comma-separated text box where "Francais" and "FR" both meant French.
- **Navigate.** The "preferred GPS" setting had never actually done anything. Now a live trip has a **Navigate** button
  that opens Waze, Google Maps or Apple Maps — whichever you chose — pointed at the pickup, then the next stop, then
  the drop-off. If the app isn't on the phone it opens the route in the browser instead.
- **Decided: one car per Driver for now.** Adding a second car sounds small but changes what the hotel is told about
  which car is coming, and touches the code that hands out trips. The real "several cars" case is a fleet with several
  drivers, which is a bigger piece of work — so the groundwork is in place and the feature waits.

## 28 July 2026
- **A Driver's history now shows every trip that ended — including the ones they walked away from.** Until now, if a
  Driver cancelled a trip or you both agreed to release it, the trip went back into the Pool and **disappeared from
  their app completely** — even though a cancel costs them a 100% penalty. Their Past tab now shows those too:
  "You cancelled this trip · it went back to the Pool" with the penalty in red, and "Released by agreement · no fee,
  no mark". Neither is clickable, because the trip may belong to another Driver by then.
- **A Driver can now read why you cancelled.** If you write a reason when cancelling, the Driver sees it in their
  history. The reason box on your side now says **"your Driver will see this"** so there's no surprise. Their own
  reason is shown back to them the same way.
- **The "Cancelled" badge lost its little ×** — it looked like a button you could press.
- **Noticed while doing this:** the feature that let you take a trip back for free when a Driver never confirmed can no
  longer trigger — accepting now confirms instantly, so there's no "not confirmed yet" state left for it to catch. It
  isn't broken, just unreachable. That means you currently have **no free way to replace a Driver who goes quiet close
  to pickup** — first thing on the list for next session.

## 26 July 2026
- **My Rides has proper tabs now — Upcoming and Past.** The ride history used to be a small underlined link tucked in
  the corner of the header. It's now a real two-tab switch at the top of the screen, each tab showing how many trips
  are in it, so a Driver can move between "what I'm driving" and "what I've driven" without hunting for a link.
- **The upcoming list is split by day.** Trips are grouped under **Today**, **Tomorrow** and then the date ("Friday 31
  July"), with a count beside each. Because the day is written above the group, each card now shows just the pickup
  time — one clean number instead of the date repeated on every card.
- **Past trips got their own, lighter design.** A finished trip is a record, not work, so it's drawn simply: the date
  and time, a status badge, the route on one line each, the Business and the fare. They're grouped by month, and a small
  **All / Completed / Cancelled** filter sits at the top so a cancelled trip is one tap away instead of a scroll.
- **A cancelled trip now says who cancelled it, and what the Driver is owed.** It turns out a Driver only ever *sees* a
  trip you cancelled — if a Driver drops a trip, or you both agree to release it, it goes straight back into the Pool
  and disappears from their app. So the card says **"Cancelled by the Business"** and shows the real compensation
  (50–100% of the fare depending on how late, plus any waiting already running), labelled "Compensation" so it can't be
  mistaken for the trip fare. **No-shows stay under Completed** — they pay the Driver the full fare, so that's where
  they belong; the amber badge already makes them easy to spot.
- **A Guest's details disappear from a Driver's app once the trip is over.** Names, phone numbers, the name board and
  your private message to the Driver are all removed the moment a trip closes — the Driver keeps only the date, route,
  fare, status and who the trip was for. **Nothing changes on your side: Dispatch keeps the complete record.** The
  Driver sees a one-line explanation so it reads as a rule, not as missing information.
- **Both tabs now have a proper empty screen** instead of a bare line of text — the Upcoming one points you to the Pool.
- **Month headings are in English again** ("July 2026", not "Juillet 2026") on both the Driver and Business history.

## 25 July 2026
- **Accepting a trip now works right away.** Before, if you grabbed a trip more than 3 hours ahead, it sat in a
  half-accepted state — no "Start" button, and a confusing "Lock-in at T-180" note — and nothing ever un-stuck it.
  Now accepting a trip confirms it on the spot: the run controls are there immediately. Two small tidy-ups on the
  pre-accept card went with it — the redundant city label is gone from the footer, and the "unlock once you accept"
  line is now one short sentence ("Private details unlock once you accept.").
- **The Pool's quiet moments got designed.** When there are no trips for you yet, the Pool no longer shows a bare
  line of grey text — it's a calm little state that tells you *why* it's empty ("New Business · Sedan trips within
  15 km of Nice land here…"), so you know it's working, not broken. If you haven't set your driving area yet, it
  points you to Settings with one clear button. And while trips are loading, you now see placeholder cards shaped
  like the real ones, gently pulsing, instead of a blank screen.
- **My Rides is a clean list now — and each trip opens on its own page.** Your accepted trips used to pile up in
  one long scroll with every button — start, complete, cancel, the waiting meter — crammed under each card, so your
  live trip's controls sat squeezed between other trips above and below. Confusing. Now **My Rides is just a tidy
  list, like the Pool**: one tap-through card per trip showing where it stands, the route, and the fare — nothing
  else. **Tap a trip and it opens on its own page**, where all the buttons live, with a **"← My Rides" link** to get
  back. One trip, one screen.
- **Finished trips move to History.** My Rides only shows what's live or coming up now; completed trips go to the
  History page, so the list stays short and current.
- **The no-show reminder got shorter.** The note before reporting a no-show is now one line — "Make sure you've
  tried everything to reach the Guest — a call, the full wait. Then you're clear to report." — instead of a
  paragraph, and it no longer talks about bags. The report button just shows the amount, without the "you're paid"
  wording.
- **The Driver app's two remaining screens got the new look.** In July we redesigned the Pool — the list of trips a
  Driver can take. Now the other two catch up, so the whole Driver app finally looks like one product. **Tapping a
  Pool trip** opens what is recognisably the same card, just opened up: the price and time at the top, the badges,
  and the route — except every stop is now spelled out in full instead of being folded into a "+2". Underneath, a
  clean **Service** panel (passengers, bags, flight) and small grey tags for the things the Business asked for
  (meet & greet, child seat, dress code, languages). A quiet locked line explains what's still hidden — the Guest's
  name, the name board, the private message — and why: those unlock the moment you accept. The **Accept mission**
  button sits at the bottom, on its own, with nothing competing with it.
- **The trip you've already accepted is now a working screen, not a list entry.** Once a trip is yours, the price
  stops being the headline — you know what you're earning — so the top of the card now shows **where you are in the
  trip**: a status badge, a progress bar, and a line in plain words ("Not started", "On the way", "Waiting for the
  Guest", "On board · 1/2 stops"). The price moved down to the bottom corner. Phone numbers became **big tap-to-call
  buttons** for the Guest and the Dispatcher instead of small rows of text — you can hit them without looking. The
  name board and the Business's private message sit together in their own little box, so you can check what to have
  ready in one glance. Stops now tick off **on the route line itself** as you reach them.
- **One button that matters, per screen.** Whatever the next step is — "Start — I'm en route", "Guest on board",
  "Complete ride" — that's the only filled-in button on screen. "Report a no-show" and "Cancel this trip" are still
  right there, but as quiet text underneath, so a tired thumb doesn't hit them by mistake. (Reporting a no-show
  still asks you to confirm, and that confirmation is still a big amber button — at that point it *is* the action.)
  Small fix along the way: **"Complete ride" is finally green** instead of navy, the way it was always meant to be.
- **The waiting meter didn't change — it just got tidier.** The courtesy wait, the €1 per minute after it, the €40
  city / €60 airport stop point: all identical. It just looks like the rest of the app now.
- **The product is now called Kavenue, everywhere in the app and the docs.** The old "PickUp" name is gone from every
  screen a Business or a Driver can see — the Dispatch header now reads **Kavenue Dispatch**, the sign-in pages, the
  welcome screen, the Settings pages, the cancellation and no-show wording, and both legal pages (French and English) all
  say Kavenue. The phone app's name and icon label changed too, so installing it to a home screen gives you "Kavenue
  Driver". All the internal paperwork (spec documents, session notes) was renamed to match.
- **Nothing about how the app works changed.** This was purely a change of name — no new features, no database changes,
  nothing moved. Everything was rechecked afterwards: the app builds cleanly and all 18 screens were opened against the
  real database to confirm the old name appears nowhere.
- **Three things were left alone on purpose, and they're yours to do when you're ready:**
  - The **web address is still `pickupbedriven.com`** — changing it needs the new domain registered first, and touching it
    early would take the live site down. Everything in the code is ready for the switch.
  - The **folder on your Mac** (`PickUp_project_dev`) and the **GitHub project name** still say PickUp. Renaming those
    from here would have broken the connection to your repository, so they need doing by hand.
  - The **demo login accounts** (the "sign in as demo Business/Driver" buttons) still use old-name email addresses behind
    the scenes. Those addresses are real records in the database — renaming just the app's copy of them would break the
    demo sign-in, so they should only be changed together with the database.
- Also left alone deliberately: the word "pickup" where it means **the pickup point of a trip** (the Route column, "pickup
  time", "pre-fill my address as the pickup"). That's the transport word, not the brand.

---

## 24 July 2026
- **The Driver app got a proper redesign — starting with the Pool (the Driver's list of available trips).** Until now the
  Driver side only had the new navy colours; its layout was never redone the way the Business side was. Two big changes:
  - **A real bottom menu bar with icons** — Pool, My Rides, Earnings, Settings — replacing the old plain text links at the
    top that looked cheap. It feels like a proper phone app now. (Sign out moved into Settings.)
  - **Redesigned trip cards** — every card is the same clean shape, so a Driver's eye learns exactly where to look: price
    and time up top; the trip type (Transfer / At disposal) and any SPEED WIN; the pickup→drop-off route as a tidy line
    with a "+2" marker when there are extra stops; the full addresses; and one neat bottom line with the trip distance and
    small icons for what the trip needs (child seat, luggage, meet & greet…). Busy trips show the 3 most important and a "+N".
  - **A new "Earnings" tab** in the menu (the screen itself is a "coming soon" placeholder for now — we'll design it next).
- All of it was drawn first as on-screen mockups you signed off, then built to match, checked live in the browser, and run
  through an automated review that caught and fixed six small polish issues (mostly legibility and phone-edge spacing).
- **Still to decide:** whether to keep the small greyed-out car type on each card (it's the Driver's own car, so a bit
  redundant). The rest of the Driver screens get the same treatment in later passes.

## 23 July 2026
- **Late Guests: the Driver is now paid to wait, instead of the trip being rescheduled.** This is the big decision of the
  day. If a Guest is running late, the Driver waits — and gets paid for it — rather than anyone moving the booking around.
  After the free "courtesy wait" (20 minutes in town, an hour at the airport), the Business is charged **€1 for every
  minute started**, which goes to the Driver. It stops climbing at a ceiling — **€40 in town, €60 at the airport** — so a
  Driver with an empty afternoon can't run the meter forever, but he's fairly paid for the time he's held.
  - **The Business can see the meter and stop it.** While a Driver is waiting, the Business now sees the running total on
    its schedule (before, it saw nothing until the invoice) and has a **"Stop waiting — the Guest isn't coming"** button.
    The Driver keeps his own way to report a no-show too. Either way the Driver is paid the fare plus the waiting.
  - **No more rescheduling a booked trip.** If the time genuinely needs to change, that's a new trip: cancel and rebook.
    A booked trip's pickup time is now locked once it's posted. (This also quietly closes a loophole where a Business
    could have pushed the time back to dodge a cancellation fee.)
  - **The €1/min is a starting figure**, set so we could build it — the real rate (and whether it differs by car class)
    is something to research properly later.
- **Fixed: airport pickups were quietly getting the short wait.** When you picked the airport from the address
  suggestions without typing a flight number, the app was treating "Aéroport Nice Côte d'Azur" as a *town* pickup — 20
  minutes of free wait instead of 60 — because of how the accented "é" was being read. Now airports are always recognised.
  This one had been hiding since the cancellation system launched; we only caught it by testing against real data.
- **Put the whole system through a hard test.** Before closing the day we ran an automated end-to-end test across the
  booking, acceptance, cancellation, no-show, waiting, and privacy rules — dozens of scenarios with many simulated
  Drivers and Businesses at once, including two Drivers grabbing the same trip at the same instant. **Everything passed**,
  and the test data was cleaned up afterwards so nothing was left behind.

## 19 July 2026 (later)
- **The no-show wait now starts when your Guest was due — not when the Driver turns up.** This was wrong, and it mattered.
  The free wait is the *Guest's* grace period, so it has to be counted from the moment the Guest was supposed to be there:
  for a town pickup, the time on the booking; for an airport, the moment the flight actually lands. Before this, a Driver
  who arrived early started the clock early — and could report a no-show *before the booked pickup time had even passed*.
  In the worst case a Driver could tap "on my way" and "arrived" a day and a half ahead, wait twenty minutes, and report a
  no-show: you'd have been charged the full fare for a trip that hadn't happened yet, and your Guest would have been left
  with a booking already marked finished. That's now impossible — the wait can't run out before the trip exists.
  - **A Driver who turns up late can't file instantly either.** They have to actually be there a few minutes first, so
    lateness can't be turned into a paid no-show.
  - **Airport pickups were quietly getting the wrong window.** When you pick an airport from the address suggestions, the
    app stores the street address in one place and the name ("Aéroport Nice Côte d'Azur") in another — and the wait rule
    was only reading the street address. So an airport booking without a flight number was treated as a *town* pickup:
    20 minutes of free wait instead of 60. Your Guest could still be at baggage reclaim. Fixed — it now reads both. (This
    one had been there since the cancellation system launched on the 13th.)
  - Groundwork is in place for automatic flight tracking: when we connect it, a delayed flight will shift the free wait
    with it, so nobody's clock starts while the plane is still in the air. (Needed two database changes — done.)

## 19 July 2026
- **"Agreed release" — a free, friendly way to hand a trip back, with both sides' say-so.** Sometimes a Driver who's taken a
  trip genuinely can't do it and there's still time to re-fill it — nobody's at fault. Instead of the Driver paying the 100%
  cancellation fee or the Business paying a cancel fee, there's now a proper **free release**: on an assigned trip the Business
  taps **"Agreed release · free"** (a separate button from the red Cancel), and the Driver gets a card to **accept or decline**.
  If the Driver accepts, the trip goes back to the Pool for another Driver — **no fee to anyone, no black mark on the Driver.**
  If the Driver declines, nothing changes — the trip stays exactly as agreed.
  - **Why the Driver has to agree:** it stops a Business quietly pressuring its way out of the cancellation fee. Without the
    Driver's tap, the only way for a Business to cancel is the normal fee-paying cancel. Consent keeps the free door honest.
  - **Declining is always safe for the Driver** — the card says so plainly ("free, no mark, only ever your choice"), and on the
    Business side a decline is shown calmly ("that's the Driver's call — the trip stays as agreed"), never as the Driver being
    difficult. We can't police a phone call, but the app makes saying "no" cost the Driver nothing.
  - **Every release is on the record.** The Business's request, the Driver's answer (including declines), the time, and how far
    out it was are all kept — so if a Business ever leans on Drivers with repeated "please release me" requests, there's a clear
    trail. You can hide a finished request from your own schedule, but it's never erased. (Needed a database change — done.)
- **Trips returning to the Pool are now priced smarter.** When a trip goes back to the Pool (a driver cancels, you reclaim it,
  or it's released), how it's re-offered now depends on timing: **within 24 hours of pickup it goes out as a SPEED WIN** (a
  higher offer, so someone grabs it fast); **more than 24 hours out it re-enters at the normal price and climbs as usual** —
  no need to overpay when there's plenty of time to fill it. (Applies to every way a trip comes back to the Pool.)

## 13 July 2026
- **You can now cancel a trip — properly, on both sides.** This is the cancellation system (O7).
  - **A Business can cancel a trip.** It's free while the trip is still unfilled (no Driver has taken it), and free up
    until 5 hours before pickup. After that a fee kicks in — 50% at 5 hours out, then rising 10% an hour to the full fare
    at pickup — and the cancel screen shows you exactly what it'll cost *before* you confirm, with a little chart of how
    the fee grows as pickup nears.
  - **A Driver can cancel a trip they've taken**, but it costs the full fare — the system is deliberately tough on Drivers
    so Businesses can count on their bookings. Before the "cancel and pay" button, the app points the Driver to two better
    options first: hand the trip to a trusted colleague (coming soon), or call the Business to agree a release. When a
    Driver does cancel, the trip goes straight back into the Pool as a SPEED WIN so another Driver grabs it fast.
  - **No-show.** If the Guest doesn't turn up, the Driver waits — an hour for airport pickups, 20 minutes in town — with a
    live countdown, then reports a no-show and is **paid in full**, exactly like a completed trip (the Business is charged
    and settles with its own guest). Because a no-show *pays* the Driver, that button is amber, not alarming red — and
    there's a friendly "are you sure?" step first, since a good Driver gives it a few extra minutes.
  - **"Take it back" when a Driver goes quiet.** If the assigned Driver never confirms and you can't reach them, close to
    pickup you get a one-tap "reclaim" that pulls the trip back and re-pools it as a SPEED WIN — no penalty to you. It only
    appears when the Driver genuinely hasn't confirmed, so a Business can't use it to dodge a cancellation fee.
  - The exact euro amounts are settled by hand during the beta; the rules above are what's built. Needed a database change
    (done). The "hand to a colleague" and the mutual "agreed release" flows come next.

## 10 July 2026 (later)
- **Address search now puts local places first.** Typing something like "aéroport t2" was showing a Paris (Roissy)
  shop, then Barcelona and Geneva, with the Nice result buried down the list. Now Côte d'Azur results (Nice, Cannes,
  Monaco, Antibes…) float to the top, and far-flung countries you'd never drive to (Spain, Portugal, the UK…) no
  longer clutter the suggestions. It's not perfect yet — the exact airport terminal can still be hard to pin down for
  a very short query — and for that last bit of precision we're planning to move the search to Google later. For now
  it's much cleaner and local-first.
- **The "review before posting" card got a light tidy-up.** Same card you liked — it just now matches the redesigned
  trip detail: the route reads as a clean top-to-bottom line, and the languages, dress code and requests show as neat
  little tags instead of a run-on list. Nothing moved, nothing removed.
- **The Pricing box now reminds you which vehicle you're pricing.** A small chip in the Pricing header shows the class
  and car you picked (e.g. "Business · Van"), so while you set the ceiling you always see what it's for.
- **Guest names capitalise themselves.** Type "james" and it becomes "James" (just the first letter, so names like
  "Al Souad" stay right).
- **Number boxes only take numbers now.** Luggage, base fare and ceiling reject letters and stray characters as you
  type or paste (base fare and ceiling still allow a decimal point).
- **The "what changed" note now shows the time of the edit**, in bold, before listing what changed.

## 10 July 2026
- **The expanded trip is far easier to read.** When you open a trip on the schedule, its details used to be one long
  grey list where everything looked the same — and half of it just repeated the row you'd already read. It's now
  grouped into clean sections you can scan in a glance: a small strip of the numbers you actually act on (pickup
  time, vehicle, flight, and the fare — fare on the right), the full route with distance and time beside it, a slim
  one-line driver bar (name, tappable phone, car and plate), and the service requests and guests side by side, with
  languages and requests shown as little tags. The route line now also stops cleanly at the destination instead of
  trailing off past it. Nothing was lost — it's the same information, just organised so a busy schedule reads fast.
- **The two "edit" buttons now explain themselves.** Under an open trip, "Edit details" and "Propose a change" each
  carry a one-line note so you never have to guess which is which: *Edit details — update guest, flight and service
  info, applies now*; *Propose a change — new route or fare, the Driver must agree*. (Short version: edit details =
  fix the info, happens immediately; propose a change = ask the Driver to agree to a different route or price.)
- **You can now see what was changed on a trip.** When a Driver accepts a route or fare change, the trip now spells
  out exactly what changed — e.g. "Fare 120 € → 140 € · Add a stop at 3 Bd de la Ferrage" — instead of just saying
  "change accepted". And when you edit a trip's details (guest, flight, service…), the trip keeps a short "what
  changed" note (e.g. "Flight BA342 → BA118 · Added guest Eleanor Whitmore"), private to your team. (The detail
  note needs a one-line database change — done.)

## 7 July 2026
- **You can now change a trip after a Driver has taken it — with their agreement.** This is the big one. Once a Driver
  has accepted a trip, you can't just silently move the goalposts (they agreed to a specific job and price). So there's
  now a proper **"propose a change"** flow: open an accepted trip, click **Propose a change**, edit the route (pickup,
  stops, or destination) and set the new agreed fare, add a note, and **send it to the Driver**. Nothing on the trip
  moves yet — it shows **"Change pending"** on your schedule.
  - The **Driver gets a clear "Change requested" card** showing exactly what's changing *inside the trip* (the added
    stop or new destination highlighted right where it sits), what it means for their fare, distance and drop-off time,
    and a heads-up if it now clashes with their next pickup. They tap **Accept** (the trip's route + fare update on the
    spot) or **Decline** (the trip stays exactly as you agreed — nothing changes).
  - **If a Driver declines, you get a calm explanation, not a cold "no".** Especially in busy periods a Driver may be
    too tight to extend a trip — so the decline comes with a short note that this is normal and not personal, the
    Driver's optional one-word reason, and buttons to **call them** or **adjust and re-send**. The trip stays as agreed.
  - Your tap (theirs, really) is the record — the app is the source of truth even if you sorted it out by phone first.
  - (The price change is one you type for now; automatic pricing comes with the pricing engine. Being alerted the
    instant a change is proposed/answered — rather than seeing it on refresh — comes with notifications, later.) **Now
    live** — the whole loop was tested against the real database (propose → accept, propose → decline, and adding a stop).

## 5 July 2026
- **Edit polish:** the **"Edit details"** button now sits at the **top** of an expanded trip (it was at the bottom,
  easy to miss). And once a trip's info has been edited, the detail shows a quiet **"Edited · ⟨time⟩"** stamp so you
  can see it was changed and when — shown only inside the trip detail, never on the schedule row. (Needed a one-line
  database change — done.)
- **You can now edit a posted trip's details — without changing the price.** Expand a trip on the schedule and click
  **"Edit details"** to update the info a Driver sees: the guest names and phone numbers, flight number, luggage,
  your reference tag, and the whole Driver-and-service card (languages, dress code, requests, name board, private
  message). The trip's **price, route and time stay locked** — those are shown at the top for context but can't be
  changed here (changing the destination or adding a stop is a separate step the Driver has to approve, coming later).
  Editing is only offered while a trip is still upcoming — once a Driver starts the run, or the trip is finished, the
  details are frozen. Saving drops you back on the schedule with that trip open.
- **The "late-night trip" hint moved to the Pricing box.** That amber note about night pickups being harder to fill
  is really pricing advice ("raise your ceiling or use SPEED WIN"), so it now appears next to the ceiling and SPEED
  WIN controls instead of under the date — where you can act on it right away.
- **Testing: a driver can now preview the whole Pool.** For testing only (never on the live site), adding `?all=1`
  to the Pool page shows *every* posted trip regardless of the driver's car or zone — so with one demo driver you can
  see the luggage runs, vans, and luxury trips a single Class-E sedan would normally never be shown.
- **The Calendar has been redesigned.** Two clearer views:
  - **Month** now reads as a *load map* — each trip is a proper little row (time + guest) with a colour bar down
    its left showing status, instead of the old faint tinted chips you couldn't tell apart. Past days are gently
    dimmed, there's a **colour legend** on the page so you never have to guess what red or amber means, and busy
    days show as many trips as fit then a "+N more" that opens the day.
  - **Week** is now a real **time grid** — hours down the side, weekday names across the top, and every trip sits
    at its actual pickup time, so you can see your day fill up and spot the gaps. A line marks "now" on today.
  - **Click any trip, anywhere**, and a panel slides in from the right showing *that* trip — route, driver, fare
    and ceiling, flight — with the rest of the day underneath. One button jumps straight to it in the Schedule
    (it even opens the "earlier trips" fold for past days). No more hunting.
  - Smaller wins: the view you're on is remembered if you reload or hit back; the vehicle filter no longer hides
    "Business · Van" trips; and on a phone the grid scrolls sideways instead of squashing.

## 4 July 2026
- **You can now book a van just for luggage.** On a new mission there's a "Trip type" switch — pick "Luggage only" and
  the form sets it to a Van, drops the passenger names, and just asks how many bags. Drivers with a van choose in their
  settings whether they're up for bags-only jobs (off by default, so nobody's surprised), and those runs show up
  clearly labelled "Luggage run · no passengers · N bags" in the Pool and on your schedule. (A dedicated luggage truck
  by size, and attaching a luggage van to a passenger trip, come later. Needs the one-line database change — done.)
- **The new-mission form now gently flags things as you type — only when there's something to flag.** Two small,
  calm hints (same amber style as the existing "this fare looks low" note) appear while you fill the form and
  vanish once you fix them: (1) if you've entered more luggage than the chosen car comfortably holds, it suggests
  a Van (and, for a lot of bags, a dedicated luggage vehicle — coming later); (2) if the pickup is in the middle
  of the night, it notes that late trips can be harder to fill and that a higher ceiling or SPEED WIN helps a
  Driver grab it. Nothing blocks you — you can always post anyway. First step of the "guided form"; more to come.

## 3 July 2026
- **Your business name now sits in the top-right of the Dispatch screen, not squeezed into the bottom-left corner.**
  Before, your company showed as a small avatar and name tucked under "Settings" at the bottom of the sidebar — easy
  to miss. Now it's an account chip in the top bar, on the right: your logo (or initials) next to your business name.
  Click it for a small menu with "Sign out". "Kavenue Dispatch" stays exactly where it was, top-left. Nothing else
  changed — "Settings" is still in the sidebar and collapsing the sidebar works the same.

## 28 June 2026
- **Your saved address now works for any business, on either end of a trip.** It's labelled "Your address" (not
  "pickup"), since a business can be the start of a trip (a departure) or the destination (an arrival). On a new
  booking it pre-fills the pickup to save typing — and there's a **swap button** to flip pickup and drop-off in one
  tap (for an arrival, or to fix a reversed entry). If your address is never an endpoint (e.g. a concierge service),
  a switch in settings turns the pre-fill off. Also removed the "Default Guest instructions" field (too case-by-case).
- **The Business account is now a proper settings area.** Instead of four lonely fields, there's a real left-nav
  settings page (like Booking/Airbnb): **Company** (business type, legal name, SIRET, VAT number, registered address, plus
  your Kbis), **Contact** (now showing your account email + a reception number), **Branding** (logo), and **Booking
  defaults** — including a saved **default pickup address** that pre-fills every new mission. **Billing** and
  **Notifications** are there too as honest "coming soon" sections so the account feels complete without anything being
  half-wired. (Needs a one-line database change to switch on.)
- **The new-mission form is honest about what's missing, and won't post a trip with no destination.** The warning
  used to be one fixed sentence that listed everything (even fields you'd already filled) — now it names *only* what's
  actually missing, in plain words ("add a drop-off address and a ceiling price"). You can no longer post a live
  mission without a real drop-off picked from the address suggestions (drafts can still be saved unfinished). Also
  fixed a hidden bug where a pickup that wasn't picked from the suggestions could slip through the Review step.
- **Trips with stops now show their progress, on both sides.** When a ride has intermediate stops, the Driver gets a
  "Reached — ⟨stop⟩" button (one tap per stop) between "Guest on board" and "Complete ride" — and finally sees the
  full route during the trip, not just pickup and drop-off. On the Business schedule the stops **check off live** as
  the Driver passes them (reached = green, the next one highlighted) and the status badge shows a little counter, e.g.
  "On board · 1/2". (Needs a one-line database change to switch on.)
- **The schedule no longer breaks when you shrink the window.** Before, narrowing the browser made the addresses
  disappear and the "Route" and "Flight" headers overlap. Now the whole trip row shrinks together — every column gives
  up a little space and long text just trims with "…" — so it always stays a clean, aligned table. If you squeeze it
  really narrow, the table keeps a sensible minimum width and you scroll sideways instead of anything colliding. (Same
  fix applies to the History list.)


---

## Earlier entries (16 June → 27 June 2026) — archived
Older shipped-work entries live in **`project/CHANGELOG_ARCHIVE.md`** to keep this file — and session startup — light.

## 2026-07-31 — Session 52

- **Abandoned trips: decided, then deliberately parked.** Talked through the 8 past trips a Driver took and never
  closed. The escape valves already built (copilote, agreed release, T-60, cancel) all answer *"this trip isn't going
  to happen"* — someone is unhappy, so someone acts. The hole is the opposite case: *the trip happened and nobody
  tapped the last button*, which has no complainer, so nobody chases it. The fix is a question, not a rule: a card on
  the Driver's My Rides a few hours later, expiring in 48h and flipping to the Business, who knew that day. It needs
  push to be worth building, so it waits. Nothing shipped; the design is written down so it isn't re-derived.
- **Dispatch History is now a real back-office tool.** It could only be filtered by outcome; it now answers *"find me
  that trip."* One search box covers the Guest, the Driver, your internal reference, the address, the flight number and
  the car — type any of them. It ignores accents, so "aeroport" finds "Aéroport", and it highlights what matched. When
  the match is something the table has no column for, like a number plate, the row tells you: *Car · Mercedes ·
  Classe E · AB-123-CD*.
- **Plus a date range, a Driver filter, a class filter, sorting, and Export CSV** — the export gives you exactly the
  rows you're looking at, formatted for French Excel (accents intact, amounts as 58,17). Every filter is in the address
  bar, so a filtered archive is a link you can send to your accountant.
- **Two things the archive was missing.** Rows showed only a time even though they're grouped by month, so 3 July and
  19 July looked identical — they show the date now. And there was no fare column at all, which made it useless for
  money; there is one now, with the cancellation fee or the waiting charge named underneath.
- **The spend figure is honest.** A trip a Driver took and never closed has an agreed price but nothing settled. It
  shows greyed as "Not settled" and is left out of every total — otherwise your spend would include trips that may
  never have happened.
- **The date picker is the same one as the Driver's Earnings**, not a second one built to look alike.

### Later the same day — the History filters, fixed after testing

- **The Driver dropdown is gone.** A list of every Driver you've ever used doesn't work once there are hundreds of
  them. Type a Driver's name in the search box instead — it finds their trips and highlights the name.
- **The search box no longer fights you.** Typing used to wipe what you'd written and then put it back, once per
  letter, and there were two ✕ buttons stacked in the field. Both fixed.
- **The date picker is the Driver app's, whole** — Day, Week, Month, Year or a custom range, with arrows to step
  back and forward a month at a time, and "Any date" to see everything again.
- **The calendar no longer jumps.** Picking your first date used to shift the whole grid down and make the Done
  button and the weekday letters appear to vanish; picking the second flashed today's date before settling. The
  box now stays exactly the same size, and your chosen range appears immediately. This was one shared calendar, so
  the Driver's Earnings screen got the same fix.
- **Eight more problems found by review before you could hit them** — including tapping a month doing nothing at
  all when no filter was set, and clicking the back arrow three times only moving one month.

## 2026-08-05 — the marketing site moved out

- **`kavenue.fr` is now a separate project.** The public site lives in its own repo and its own Vercel project,
  so marketing copy can change without touching the product — and a broken landing page can't stop a product
  fix from shipping. The two app subdomains (`driver.` and `dispatch.`) stayed exactly where they were and were
  never interrupted.
- **What's there today is a holding page, not the landing page** — presentable, true, and it links to both
  sign-ins. It exists so the domain could move on its own schedule instead of waiting for the design.
- **The design and copy are deliberately not started.** A finished page was built and rejected; the next attempt
  starts from a preview and your direction, in its own session.
- The old splash inside the app has been deleted, since nothing can reach it any more.

## 2026-08-06 — the folder is called Kavenue now

- **The project folder on your Mac is renamed** — `Kavenue/Kavenue_project_dev`, with the landing site beside it.
  Your session history and everything Claude remembers about how you like to work came across intact.
- Notes and checklists that still described the rename as "to do" have been brought up to date. The older entries
  were left as they were — they're a record of what happened, not a description of today.
- **One thing still has the old name: the GitHub project** (`Pickup-marketplace`). It's yours to rename when you
  want to; nothing depends on it and nothing breaks if it stays.

## 2026-08-17 — Kavenue's commission is live

- **The price you're shown is now the price you pay, everything included.** When Kavenue fills in the Ceiling
  on a new trip, that number already contains our service fee and its VAT — nothing gets added later. Under it,
  three lines say exactly what it's made of: the transport, the fee, and the VAT on the fee.
- **The three lines are never rolled into one**, because you can claim back the VAT on our fee but not the VAT
  on transport. Keeping them apart is what lets your accountant tell them apart.
- **The same breakdown appears on an expanded trip and on Spend**, so it reads the same everywhere.
- **A cheap fill now visibly saves you twice.** The expanded trip says how far under your maximum it went — and
  our fee is a share of the fare, so it falls with it. A trip that filled at 87 € instead of your 159,40 €
  maximum cost 45,71 € less in fare and 4,97 € less in fee.
- **Spend and History totals are about 15% higher than yesterday.** Nothing got more expensive — they now show
  what actually leaves your account rather than the fare alone.
- **Trips from before today are untouched.** They were never charged a fee, so they still show one plain amount
  with no breakdown. Nothing was rewritten backwards.
- **For Drivers, the number in the Pool is the number they're paid.** No "before commission" figure exists
  anywhere in their app. One screen on a trip they're holding shows the commission and the VAT, because they
  need it to invoice — and because a Driver registered for VAT and one who isn't keep different amounts from
  the very same fare.
- **One thing still needs you:** the second migration, so the app knows whether the Driver who took a trip
  charges VAT. Until it runs, a Driver's money screen leaves the VAT line out rather than guessing.

## 2026-08-17 — wording, after your read-through

- **"Accepted at 62,79 €"** replaces "Agreed price". Nobody negotiated — you set a Ceiling and a Driver took
  the trip at the price the auction had reached.
- **"You saved 33,81 €"** replaces a sentence with four numbers in it. The Ceiling is already right above it.
- **"Ceiling" is used everywhere again** instead of "max" — it's your word for it, and the app had quietly
  stopped using it on the two screens where it matters most.
- **"Driver accepted"** replaces "Confirmed" on the schedule. "Confirmed" sounded like your booking had gone
  through; what it actually means is that a Driver has committed to the trip.
- **The route is back above the money** on an expanded trip. It's where you see how far along the trip is, so
  it shouldn't sit under an invoice.

## 2026-08-18 — the same trip, the same price, wherever you look

- **Cancelling a trip now quotes what you'll actually be charged.** The fee and the waiting are both shown
  with our fee inside them, like every other number you see. The waiting meter on that screen said 1,15 € a
  minute while the cancel box beside it said 1,00 € — same minute, two prices. One price now.
- **Your Ceiling reads the same in all three places on the new-mission screen.** On about one amount in
  eight, the summary on the right showed the figure you typed while the card on the left showed the figure
  that will actually be billed — a cent apart. They agree now, and the note still tells you when we rounded
  your number down.
- **Drafts, the calendar, the trip you're editing and three figures on Spend** were still showing the fare
  alone. They now show what leaves your account: cost per trip, the trips a Driver hasn't closed yet, and the
  Ceiling on missions nobody took.
- **A Driver is no longer told they charge no VAT when we haven't been told either.** Until a Driver takes a
  trip we don't know their VAT status, and after a trip goes back into the Pool we forget it again. The app
  now says nothing rather than guessing.
- **The new-mission form stops rather than guess a price.** If we can't read the current service fee, it says
  so and won't post — before, a bad moment could quietly shave 13% off your Ceiling every time you reopened a
  saved draft.
- **Nothing about the waiting rate changed.** €1 a minute is still a placeholder pending your study; the docs
  now say so plainly, and note that the €40 / €60 caps move with it.

## 2026-08-18 (later) — changing a booked trip's price

- **The screen where you change a trip's fare now works in the same money as everywhere else.** You type
  what you'll pay, fee included, and that's what you'll be charged — before, the figure you typed was
  stored as the fare alone, so the trip would have cost you about 15% more than the number on your screen.
- **Your Driver sees what they'll be paid, not the gross.** Their card showed a figure that was never
  theirs to keep. It now shows the same kind of number as everywhere else in their app.

## 2026-08-18 (later still) — "What went wrong" adds up properly

- **The waste panel on Spend was quoting the fare and calling it a share of your total.** The share is
  measured against what actually left your account, so the amounts had to be on that same footing. It now
  reads 345,33 € — 19,3 % of what you spent, where it used to say 319,66 € — 17,8 %. Nothing changed about
  what you were charged; the panel was simply understating what those trips cost you.

## 2026-08-18 (evening) — a full check of every money screen, and six fixes

Six passes over the app looking for numbers that disagree with each other, then a second round trying to
prove each one wrong. Twenty-six suspicions, eleven of them false. The six real ones:

- **A Driver closing a trip was told the wrong figure.** The card said "closing settles 100,00 € — the fare
  you accepted", then paid them 88,00 €. It was the last place in their app quoting a number that was never
  theirs.
- **A Driver's ride list left out the waiting** they'd already earned, while the trip's own page included
  it. Same trip, two amounts, the smaller one on the screen they see first.
- **Trips a Driver hasn't closed** showed you the fare without our fee, sitting in a list where every other
  row includes it.
- **"incl. 40,00 € waiting"** was short — the total above it actually contained 46,00 €. Fixed on the row,
  on the archive summary, and in both spreadsheet exports.
- **The two CSV exports** had columns on two different footings, so the file couldn't be reconciled against
  itself. All columns now agree.
- **Sorting by highest fare** ranked on the old number and ignored waiting, so the list visibly came out in
  the wrong order.

**And the breakdown now explains the number above it.** On a cancelled trip the row said "177,23 € · your
cancellation fee" while the table underneath said "what you pay: 157,53 €" — the price of a trip that never
happened — and cheerfully added "you saved 39,38 €". The table now breaks down what you were actually
charged, waiting has its own line, and an unfilled mission gets no table at all because nothing was billed.

## 2026-08-18 — what waiting should cost, researched

- **Nothing changed in the app.** This is written down, not switched on.
- **Your instinct was right that €1 a minute is too much — but not that it should follow the fare.** No
  operator anywhere charges waiting as a share of the trip price. They all set it by vehicle class instead,
  which does the same job: a cheap trip is an Eco car and an expensive one is a First car.
- **Proposed: 0,50 € a minute on Eco, 0,75 € on Business, 1,00 € on First.** For reference, a taxi in the
  Alpes-Maritimes charges 0,58 € a minute of waiting, and that rate is set by law. FREE NOW charges exactly
  0,50 and 0,75.
- **Your free wait stays as it is** — 20 minutes in town, an hour at the airport. That's what private
  chauffeur firms give; the two-minute windows belong to the ride-hail apps, which are a different business.
- **The caps come down with the rate on the cheaper classes** — an Eco wait would stop at 23 € in town
  instead of 46 €, while First is unchanged.

## 2026-08-18 — waiting is priced by the car, not by one flat rate

- **Eco 0,50 €, Business 0,75 €, First 1,00 € a minute**, replacing 1,00 € on everything. A Guest keeping an
  Eco car waiting no longer costs the same as one keeping a First car waiting.
- **The ceiling comes down with it** on the cheaper classes — an Eco wait stops at 20 € in town rather than
  40 €. The cap was always counted in minutes, so this happens by itself.
- **Nothing already settled changed.** Every trip that has run keeps the rate that applied on its day.
- **Not live yet** — it needs the migration run first, otherwise the meter would quote one price and charge
  another.

## 2026-08-20 — the money adds up, and now it says what it is

- **A Driver's breakdown called everything "Fare".** On a trip where they waited, the fare line quietly
  included the waiting — 100 € of driving and 15 € of waiting read as "Fare 115,00". Waiting now has its own
  line with the minutes on it, and the top line says what the money actually is: a cancellation, a no-show,
  or a fare.
- **Your CSV exports now contain the service fee and its VAT.** That's the one number your accountant
  reclaims, and it wasn't in the file. Each row now breaks into transport + fee + VAT, exactly like the
  screen.
- **"Cost per trip" said it was fare + waiting.** It's been fare + waiting + fee since this morning.
- **Everything reconciles.** Checked the arithmetic on both sides, not just the screens: your total is
  transport + fee + VAT, and a Driver's is trips + no-shows + waiting + cancellations, less any penalty.
  Nothing is uncounted and nothing is counted twice.

## 2026-08-20 — Kavenue prices a change, and a flight number stops meaning "airport"

- **You no longer type a price when you change a booked trip.** Change the route and Kavenue works out what
  the change is worth from the rate card. The price your Driver agreed stands — only the difference moves.
  Adding 16 km to a 62,79 € trip makes it 94,79 €, not the 110 € it would cost if we re-quoted the whole
  thing from scratch. A shorter route brings it down the same way.
- **A trip to the airport was being treated as a trip from one.** If a booking carried a flight number, the
  app gave it the airport courtesy wait — an hour of free waiting at your hotel door instead of twenty
  minutes. On your current trips, 52 of the 89 with a flight number were departures, so Drivers were sitting
  40 extra minutes unpaid. It now looks at where the trip starts, not just whether a flight is attached.
- **You should still add flight numbers** — that's the field that switches on flight tracking. The app was
  drawing the wrong conclusion from it, which is fixed.
- **Not live yet** — the airport change needs the migration run first.

## 2026-08-20 — where the money stands, end of the day

Everything you see now shows the same kind of number, on both sides:

- **You always see what leaves your account** — the fare with our fee inside it — on every screen, in the
  exports, and in the totals.
- **A Driver always sees what they bank.** The one exception is a penalty they owe, which is shown gross on
  purpose, and says why.
- **No price is typed by a person any more.** Posting a trip and changing a booked one are both priced by
  Kavenue from the rate card. That was the last place a human number could get in.
- **Waiting is priced by the car** and stops being charged at your hotel door for a trip that's going to the
  airport rather than coming from one.

Still on the list, and none of them is a wrong charge — they're things the app knows but doesn't say: a stop
you type without picking it from the suggestions is free, the night rate is invisible once a trip is booked,
a settled waiting charge doesn't show its rate, and a penalty a Driver owes you doesn't appear anywhere on
your side.

## 2026-08-24 — you can finally take a trip back from a Driver who has gone quiet

- **The "take it back" button has never worked. Not once.** It was waiting for the Driver to be in a state
  the app stopped using back in July, so it never appeared for anybody — 280 trips, and not one of them could
  ever have been reclaimed. Fixed: it now watches whether the Driver has **checked in**, which is the thing
  you actually care about.
- **You can act from two hours before pickup, not one.** One hour left a replacement Driver less time than
  the drive itself. Two hours still gives your Driver a full hour of grace after check-in opens to answer.
- **The trip card tells you it's coming.** From three hours out you'll see "Marc hasn't checked in" with the
  button greyed and the time it unlocks, so you can ring them first rather than being surprised at the last
  minute. It turns amber when you can act, and red inside the last hour.
- **It tells you to call first.** A Driver who isn't answering may simply be driving someone. Taking the trip
  back costs you nothing, but the phone is the faster fix.
- **One less thing shouting at you.** The panel used to repeat the same warning twice, once in the card and
  once underneath. Now it says it once.
- **Not live yet** — this needs the migration run first, and until then the button will refuse.

**Still to settle, and it's a good question:** a Driver who wants out of a trip for free can just say nothing
and let you take it back. Cancelling properly costs them; going quiet currently doesn't. Written up with the
options, nothing decided.

## 2026-08-24 — the trip diary now writes down the things it was silently missing

The event log went live yesterday and records everything that happens to a trip. It turns out nine of the
things it *said* it recorded were never actually being written down — the list existed, the writing didn't.
Now they are:

- **A Driver checking in.** It also notes *how long before pickup* they did it — which is exactly the number
  we had to guess at this morning when deciding the two-hour rule. In a few weeks it'll be a fact, not a guess.
- **A Driver saying a trip didn't happen**, and a Driver answering the "what happened?" question at all.
- **A change or a release being proposed, and answered** — on both sides, including a refusal, which used to
  leave no trace anywhere because nothing about the trip moved.
- **An edit to a booking's details.**
- **A Driver being turned away.** If someone tries to take a trip and Kavenue refuses — already gone, clashes
  with another job, wrong car — that's now recorded. If one reason keeps coming up, the rule is wrong, not the
  Driver.
- **A Guest's phone number being shown to a Driver**, once per Driver per trip. That's the answer to "who was
  given this number, and when" if it's ever asked.

**What we decided NOT to record: Drivers browsing the Pool.** You asked what the use would be, and the honest
answer is: not much, at nine Drivers you can phone. The one thing it would tell us — whether a trip expired
because nobody saw it or because everyone said no — we can work out from what we already store. It would also
have been roughly 300,000 rows a day once you have 200 Drivers. Parked until the Driver list is too long to
ring round.

**Needs the migration run** — one short data-only one, so the log's own index stops listing things nothing
writes.

## 2026-08-24 — a trip can no longer be posted without a price

- **If Kavenue can't work out the distance, it now refuses to post the trip** instead of quietly posting it
  anyway. Before, a routing failure meant the "lowest price this can be offered at" check was skipped
  entirely, and the starting price fell back to half your ceiling — permanently, for that trip.
- **It tries twice before giving up**, so a one-second hiccup at the map provider doesn't stop you booking.
- **And it tells you what happened** in plain words, so nobody re-types a perfectly good address trying to
  make it work.
- **Same fix on the change screen.** If a route change couldn't be priced, you were sent back to the form with
  *no message at all* — the error existed but nobody had written the sentence for it.

To be clear about how serious this was: **there's no sign it ever actually happened to you.** Posting already
insists on picking addresses from the suggestions, so this only bites if the map provider itself goes down. It
was a trap waiting rather than a leak running.
