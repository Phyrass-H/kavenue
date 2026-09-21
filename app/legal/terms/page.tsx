import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation · Kavenue",
};

// DRAFT placeholder. The binding legal text must be drafted and validated with a
// French VTC/transport lawyer before going live (Doc 01). Bilingual FR + EN.
export default function TermsPage() {
  return (
    <main className="container" style={{ paddingTop: 28, paddingBottom: 48, maxWidth: 720 }}>
      <p className="small">
        <Link href="/" className="muted">
          ← Kavenue
        </Link>
      </p>

      <div className="notice warn">
        Brouillon — texte non contractuel, en cours de validation juridique.
        <br />
        Draft — non-binding, pending legal review.
      </div>

      <h1>Conditions générales d&apos;utilisation</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Dernière mise à jour : à définir · Last updated: TBD
      </p>

      <h2>1. Objet</h2>
      <p>
        Kavenue est une <strong>centrale de réservation VTC</strong> qui met en
        relation des chauffeurs VTC professionnels indépendants (les «&nbsp;Drivers&nbsp;»)
        avec des professionnels (les «&nbsp;Businesses&nbsp;», hôtels en premier lieu)
        ayant besoin de transport pour leurs passagers (les «&nbsp;Guests&nbsp;»).
      </p>

      <h2>2. Rôle de Kavenue — intermédiaire</h2>
      <p>
        Kavenue agit en qualité d&apos;<strong>intermédiaire / agent</strong> et
        n&apos;est jamais l&apos;opérateur de transport ni le revendeur de la
        prestation. La prestation de transport est fournie par le Driver, lequel
        reste un prestataire indépendant. Kavenue facilite la mise en relation et,
        le cas échéant, l&apos;encaissement pour le compte du Driver.
      </p>

      <h2>3. Tarification</h2>
      <p>
        Le Business fixe son plafond (le «&nbsp;Ceiling&nbsp;»). Kavenue se contente
        de recommander un tarif évolutif (PDP) jusqu&apos;à ce plafond. Le prix
        affiché en temps réel est calculé à la lecture et ne constitue pas un prix
        figé.
      </p>

      <h2>4. Annulations</h2>
      <p>À définir (politique d&apos;annulation et frais éventuels).</p>

      <h2>5. Responsabilité &amp; assurances</h2>
      <p>
        Chaque Driver doit être un VTC enregistré et à jour de ses obligations
        (carte professionnelle, inscription au registre, assurances, immatriculation
        du véhicule). À compléter.
      </p>

      <h2>6. Données personnelles</h2>
      <p>
        Le traitement des données est décrit dans la{" "}
        <Link href="/legal/privacy">politique de confidentialité</Link>.
      </p>

      <h2>7. Droit applicable</h2>
      <p>Droit français. À compléter.</p>

      <hr style={{ margin: "32px 0", border: 0, borderTop: "1px solid var(--border)" }} />

      <h1>Terms of use</h1>

      <h2>1. Purpose</h2>
      <p>
        Kavenue is a <strong>VTC booking marketplace</strong> connecting independent
        professional VTC drivers (&quot;Drivers&quot;) with businesses
        (&quot;Businesses&quot;, hotels first) that need transport for their
        passengers (&quot;Guests&quot;).
      </p>

      <h2>2. Kavenue&apos;s role — intermediary</h2>
      <p>
        Kavenue acts as an <strong>intermediary / agent</strong> and is never the
        transport operator or reseller. Transport is supplied by the Driver, who
        remains an independent contractor. Kavenue facilitates the connection and,
        where applicable, collects payment on the Driver&apos;s behalf.
      </p>

      <h2>3. Pricing</h2>
      <p>
        The Business sets its Ceiling. Kavenue only recommends a progressive fare
        (PDP) up to that Ceiling. The live fare is computed on read and is not a
        fixed price.
      </p>

      <h2>4. Cancellations</h2>
      <p>TBD (cancellation policy and any fees).</p>

      <h2>5. Liability &amp; insurance</h2>
      <p>
        Every Driver must be a registered VTC in good standing (professional card,
        registry entry, insurance, vehicle registration). To be completed.
      </p>

      <h2>6. Personal data</h2>
      <p>
        Data processing is described in the{" "}
        <Link href="/legal/privacy">privacy policy</Link>.
      </p>

      <h2>7. Governing law</h2>
      <p>French law. To be completed.</p>
    </main>
  );
}
