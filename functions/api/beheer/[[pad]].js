import { db, json, veilig, vandaag, tekst, getal, overlapt, agendaSleutel, Melding } from "../../../src/lib.js";
import { isDatum, nachten, naarTijd, naarIso, AANBETALING, RESTANT_DAGEN, BORG_TERUG_DAGEN } from "../../../src/prijzen.js";

// Beheer-API: boekingen, blokkades, klanten, facturen en instellingen. Alleen bereikbaar na inloggen.
const INSTELLINGEN = ["afzender_naam", "afzender_adres", "afzender_email", "afzender_telefoon", "afzender_nummer", "iban", "iban_naam", "btw_regel", "betaal_tekst"];
const datumNl = (iso) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

// Volwassenen en kinderen uit het formulier; het totaal wordt het aantal personen.
function leesGezelschap(b) {
  const heeft = (v) => v !== "" && v != null;
  const volwassenen = heeft(b.volwassenen) ? Math.max(0, Math.trunc(+b.volwassenen) || 0) : null;
  const kinderen = heeft(b.kinderen) ? Math.max(0, Math.trunc(+b.kinderen) || 0) : null;
  const personen = volwassenen == null && kinderen == null ? Math.trunc(+b.personen) || null : (volwassenen || 0) + (kinderen || 0);
  return { volwassenen, kinderen, personen, leeftijden: tekst(b.leeftijden, 60) };
}

function leesPeriode(b) {
  if (!isDatum(b.aankomst) || !isDatum(b.vertrek)) throw new Melding("Vul een aankomst- en vertrekdatum in.");
  if (nachten(b.aankomst, b.vertrek) < 1) throw new Melding("De vertrekdatum moet na de aankomstdatum liggen.");
}

async function klantVoor(d, boeking) {
  if (boeking.klant_id) return boeking.klant_id;
  if (boeking.email) {
    const k = await d.prepare("SELECT id FROM klanten WHERE lower(email) = lower(?)").bind(boeking.email).first();
    if (k) return k.id;
  }
  const r = await d.prepare("INSERT INTO klanten (naam, email, telefoon, aangemaakt) VALUES (?, ?, ?, ?)")
    .bind(boeking.naam || "Onbekende gast", boeking.email || "", boeking.telefoon || "", new Date().toISOString()).run();
  return r.meta.last_row_id;
}

export const onRequest = veilig(async ({ request, env, params }) => {
  const d = await db(env);
  const m = request.method;
  const [deel, idTekst, actie] = Array.isArray(params.pad) ? params.pad : [params.pad];
  const id = Math.trunc(+idTekst) || 0;
  const b = m === "POST" || m === "PUT" ? await request.json().catch(() => ({})) : {};

  // ---- Alles in één keer ophalen ----
  if (deel === "overzicht" && m === "GET") {
    const [bo, kl, fa, ins, gb] = await d.batch([
      d.prepare("SELECT * FROM boekingen ORDER BY aankomst"),
      d.prepare("SELECT * FROM klanten ORDER BY naam COLLATE NOCASE"),
      d.prepare("SELECT * FROM facturen ORDER BY id DESC"),
      d.prepare("SELECT * FROM instellingen"),
      d.prepare("SELECT * FROM gastenboek ORDER BY id DESC")
    ]);
    const u = new URL(request.url);
    return json({
      vandaag: vandaag(),
      boekingen: bo.results,
      klanten: kl.results,
      gastenboek: gb.results,
      facturen: fa.results.map((f) => ({ ...f, gegevens: JSON.parse(f.gegevens || "{}") })),
      instellingen: Object.fromEntries(ins.results.map((r) => [r.sleutel, r.waarde])),
      agendaUrl: `${u.origin}/api/agenda?sleutel=${await agendaSleutel(env)}`
    });
  }

  // ---- Boekingen en blokkades ----
  if (deel === "boeking" && m === "POST" && !id) {
    leesPeriode(b);
    const blokkade = b.soort === "blokkade";
    if (await overlapt(d, b.aankomst, b.vertrek)) throw new Melding("Deze periode overlapt met een bestaande boeking of blokkade.", 409);
    const naam = tekst(b.naam, 100);
    if (!blokkade && !naam && !b.klant_id) throw new Melding("Vul de naam van de gast in of kies een klant.");
    let klantId = null, gast = { naam, email: tekst(b.email, 150), telefoon: tekst(b.telefoon, 40) };
    if (!blokkade) {
      if (b.klant_id) {
        const k = await d.prepare("SELECT * FROM klanten WHERE id = ?").bind(+b.klant_id).first();
        if (!k) throw new Melding("Deze klant bestaat niet meer.");
        klantId = k.id; gast = { naam: k.naam, email: k.email || "", telefoon: k.telefoon || "" };
      } else klantId = await klantVoor(d, gast);
    }
    const g = leesGezelschap(b);
    const r = await d.prepare("INSERT INTO boekingen (status, aankomst, vertrek, personen, volwassenen, kinderen, leeftijden, naam, email, telefoon, klant_id, huur, schoonmaak, borg, betaald, bron, notitie, aangemaakt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'handmatig', ?, ?)")
      .bind(blokkade ? "geblokkeerd" : "bevestigd", b.aankomst, b.vertrek, blokkade ? null : g.personen, blokkade ? null : g.volwassenen, blokkade ? null : g.kinderen, blokkade ? "" : g.leeftijden,
        blokkade ? "" : gast.naam, blokkade ? "" : gast.email, blokkade ? "" : gast.telefoon, klantId,
        blokkade ? 0 : getal(b.huur), blokkade ? 0 : getal(b.schoonmaak), blokkade ? 0 : getal(b.borg), tekst(b.notitie, 1000), new Date().toISOString()).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }

  if (deel === "boeking" && id) {
    const huidig = await d.prepare("SELECT * FROM boekingen WHERE id = ?").bind(id).first();
    if (!huidig) throw new Melding("Deze boeking bestaat niet meer.", 404);

    if (m === "POST" && actie === "status") {
      const nieuw = b.status;
      if (!["bevestigd", "afgewezen", "geannuleerd", "aangevraagd"].includes(nieuw) || huidig.status === "geblokkeerd") throw new Melding("Deze wijziging kan niet.");
      if (nieuw === "bevestigd") {
        if (await overlapt(d, huidig.aankomst, huidig.vertrek, id)) throw new Melding("Deze periode is intussen bezet door een andere boeking of blokkade.", 409);
        const klantId = await klantVoor(d, huidig);
        await d.prepare("UPDATE boekingen SET status = 'bevestigd', klant_id = ? WHERE id = ?").bind(klantId, id).run();
      } else {
        await d.prepare("UPDATE boekingen SET status = ? WHERE id = ?").bind(nieuw, id).run();
      }
      return json({ ok: true });
    }

    if (m === "PUT") {
      leesPeriode(b);
      const actief = huidig.status === "bevestigd" || huidig.status === "geblokkeerd";
      if (actief && (await overlapt(d, b.aankomst, b.vertrek, id))) throw new Melding("Deze periode overlapt met een andere boeking of blokkade.", 409);
      const g = leesGezelschap(b);
      await d.prepare("UPDATE boekingen SET aankomst = ?, vertrek = ?, personen = ?, volwassenen = ?, kinderen = ?, leeftijden = ?, naam = ?, email = ?, telefoon = ?, huur = ?, schoonmaak = ?, borg = ?, betaald = ?, notitie = ? WHERE id = ?")
        .bind(b.aankomst, b.vertrek, g.personen, g.volwassenen, g.kinderen, g.leeftijden, tekst(b.naam, 100), tekst(b.email, 150), tekst(b.telefoon, 40),
          getal(b.huur), getal(b.schoonmaak), getal(b.borg), b.betaald ? 1 : 0, tekst(b.notitie, 1000), id).run();
      return json({ ok: true });
    }

    if (m === "DELETE") {
      const f = await d.prepare("SELECT nummer FROM facturen WHERE boeking_id = ?").bind(id).first();
      if (f) throw new Melding(`Bij deze boeking hoort factuur ${f.nummer}. Zet de boeking op geannuleerd in plaats van hem te verwijderen.`, 409);
      await d.prepare("DELETE FROM boekingen WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
  }

  // ---- Klanten ----
  if (deel === "klant" && (m === "POST" || m === "PUT")) {
    const naam = tekst(b.naam, 100);
    if (!naam) throw new Melding("Vul een naam in.");
    const velden = [naam, tekst(b.email, 150), tekst(b.telefoon, 40), tekst(b.adres, 400), tekst(b.notitie, 1000)];
    if (m === "PUT" && id) {
      await d.prepare("UPDATE klanten SET naam = ?, email = ?, telefoon = ?, adres = ?, notitie = ? WHERE id = ?").bind(...velden, id).run();
      return json({ ok: true });
    }
    const r = await d.prepare("INSERT INTO klanten (naam, email, telefoon, adres, notitie, aangemaakt) VALUES (?, ?, ?, ?, ?, ?)").bind(...velden, new Date().toISOString()).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (deel === "klant" && m === "DELETE" && id) {
    const r = await d.prepare("SELECT COUNT(*) AS n FROM boekingen WHERE klant_id = ?").bind(id).first();
    if (r.n) throw new Melding("Deze klant heeft boekingen en kan daarom niet worden verwijderd.", 409);
    await d.prepare("DELETE FROM klanten WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  // ---- Facturen ----
  if (deel === "factuur" && m === "POST") {
    const bo = await d.prepare("SELECT * FROM boekingen WHERE id = ?").bind(Math.trunc(+b.boeking_id) || 0).first();
    if (!bo || bo.status !== "bevestigd") throw new Melding("Een factuur maak je van een bevestigde boeking.");
    if (await d.prepare("SELECT id FROM facturen WHERE boeking_id = ?").bind(bo.id).first()) throw new Melding("Voor deze boeking bestaat al een factuur.", 409);
    const klant = bo.klant_id ? await d.prepare("SELECT * FROM klanten WHERE id = ?").bind(bo.klant_id).first() : null;
    const ins = Object.fromEntries((await d.prepare("SELECT * FROM instellingen").all()).results.map((r) => [r.sleutel, r.waarde]));
    if (!ins.afzender_naam) throw new Melding("Vul eerst je afzendergegevens in bij Instellingen.");
    const datum = vandaag(), jaar = datum.slice(0, 4);
    const laatste = await d.prepare("SELECT nummer FROM facturen WHERE nummer LIKE ? ORDER BY nummer DESC LIMIT 1").bind(jaar + "-%").first();
    const nummer = `${jaar}-${String((laatste ? +laatste.nummer.slice(5) : 0) + 1).padStart(3, "0")}`;
    const n = nachten(bo.aankomst, bo.vertrek);
    const regels = [{ omschrijving: `Huur Casa Tinto de Verano, ${datumNl(bo.aankomst)} t/m ${datumNl(bo.vertrek)} (${n} nachten)`, bedrag: bo.huur || 0 }];
    if (bo.schoonmaak) regels.push({ omschrijving: "Eindschoonmaak", bedrag: bo.schoonmaak });
    if (bo.borg) regels.push({ omschrijving: `Borg (terug binnen ${BORG_TERUG_DAGEN} dagen na vertrek, na controle van het penthouse)`, bedrag: bo.borg });
    const totaal = regels.reduce((s, r) => s + r.bedrag, 0);
    const euro = (n) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
    const aanbetaling = Math.round(((bo.huur || 0) + (bo.schoonmaak || 0)) * AANBETALING);
    const uiterlijk = naarIso(naarTijd(bo.aankomst) - RESTANT_DAGEN * 864e5);
    const betaling = uiterlijk <= datum
      ? `Je verblijf begint binnen ${RESTANT_DAGEN / 7} weken. Graag het volledige bedrag van ${euro(totaal)} direct overmaken.`
      : `Aanbetaling: ${euro(aanbetaling)} binnen 7 dagen na deze factuur.\nRestant inclusief borg: ${euro(totaal - aanbetaling)} uiterlijk op ${datumNl(uiterlijk)}.`;
    const gegevens = {
      afzender: ins,
      klant: { naam: klant?.naam || bo.naam, adres: klant?.adres || "", email: klant?.email || bo.email || "" },
      regels, borg: 0, betaling, aankomst: bo.aankomst, vertrek: bo.vertrek
    };
    await d.prepare("INSERT INTO facturen (nummer, boeking_id, datum, gegevens, totaal) VALUES (?, ?, ?, ?, ?)").bind(nummer, bo.id, datum, JSON.stringify(gegevens), totaal).run();
    return json({ ok: true, nummer });
  }
  if (deel === "factuur" && m === "DELETE" && id) {
    const laatste = await d.prepare("SELECT id FROM facturen ORDER BY id DESC LIMIT 1").first();
    if (!laatste || laatste.id !== id) throw new Melding("Alleen de laatst gemaakte factuur kan worden verwijderd, zodat de nummering doorloopt.", 409);
    await d.prepare("DELETE FROM facturen WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  // ---- Gastenboek ----
  if (deel === "gastenboek" && id && m === "POST") {
    await d.prepare("UPDATE gastenboek SET zichtbaar = ? WHERE id = ?").bind(b.zichtbaar ? 1 : 0, id).run();
    return json({ ok: true });
  }
  if (deel === "gastenboek" && id && m === "DELETE") {
    await d.prepare("DELETE FROM gastenboek WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  // ---- Instellingen ----
  if (deel === "instellingen" && m === "PUT") {
    await d.batch(INSTELLINGEN.map((s) => d.prepare("INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde").bind(s, tekst(b[s], 600))));
    return json({ ok: true });
  }

  throw new Melding("Onbekend verzoek.", 404);
});
