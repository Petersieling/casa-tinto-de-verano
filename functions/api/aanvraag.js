import { db, json, veilig, vandaag, ipVan, tekst, teVaak, noteerPoging, overlapt, stuurMelding, Melding } from "../../src/lib.js";
import { isDatum, nachten, huurprijs, SCHOONMAAK, BORG, MIN_NACHTEN, MAX_PERSONEN } from "../../src/prijzen.js";

// Openbaar: een bezoeker vraagt een reservering aan. Die is pas definitief na bevestiging in het beheer.
export const onRequestPost = veilig(async ({ request, env, waitUntil }) => {
  const d = await db(env);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") throw new Melding("De aanvraag is niet goed aangekomen.");
  if (b.website) return json({ ok: true }); // verborgen veld dat alleen spamrobots invullen

  const naam = tekst(b.naam, 100), email = tekst(b.email, 150), telefoon = tekst(b.telefoon, 40), bericht = tekst(b.bericht, 1500);
  const volwassenen = Math.trunc(+b.volwassenen), kinderen = Math.trunc(+b.kinderen);
  const leeftijden = Array.isArray(b.leeftijden) ? b.leeftijden.map((l) => Math.trunc(+l)) : [];
  const personen = volwassenen + kinderen;
  if (naam.length < 2) throw new Melding("Vul je naam in.");
  if (b.volwassenen_24 !== true) throw new Melding("Bevestig dat alle volwassenen in je gezelschap 24 jaar of ouder zijn.");
  if (b.akkoord !== true) throw new Melding("Ga akkoord met de huurvoorwaarden om je aanvraag te versturen.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Melding("Vul een geldig e-mailadres in.");
  if (!(volwassenen >= 1)) throw new Melding("Geef aan met hoeveel volwassenen je komt.");
  if (!(kinderen >= 0) || b.kinderen === "" || b.kinderen == null) throw new Melding("Geef aan met hoeveel kinderen je komt. Kies 0 als er geen kinderen meekomen.");
  if (personen > MAX_PERSONEN) throw new Melding(`Het penthouse is voor maximaal ${MAX_PERSONEN} personen.`);
  if (leeftijden.length !== kinderen || leeftijden.some((l) => !(l >= 0 && l <= 17))) throw new Melding("Vul van elk kind de leeftijd in (0 tot en met 17 jaar).");
  if (!isDatum(b.aankomst) || !isDatum(b.vertrek)) throw new Melding("Kies een aankomst- en vertrekdatum.");
  if (b.aankomst < vandaag()) throw new Melding("De aankomstdatum ligt in het verleden.");
  const n = nachten(b.aankomst, b.vertrek);
  if (n < MIN_NACHTEN) throw new Melding(`Het minimale verblijf is ${MIN_NACHTEN} nachten.`);
  if (n > 120) throw new Melding("Neem voor een verblijf langer dan 120 nachten contact op per e-mail.");
  if (await overlapt(d, b.aankomst, b.vertrek)) throw new Melding("Deze periode is (deels) al bezet. Kies andere data.", 409);

  const ip = ipVan(request);
  if (await teVaak(d, "aanvraag", ip, 5, 60)) throw new Melding("Er zijn net al meerdere aanvragen verstuurd. Probeer het over een uur opnieuw of stuur een e-mail.", 429);
  await noteerPoging(d, "aanvraag", ip);

  const huur = huurprijs(b.aankomst, b.vertrek);
  await d.prepare("INSERT INTO boekingen (status, aankomst, vertrek, personen, volwassenen, kinderen, leeftijden, naam, email, telefoon, huur, schoonmaak, borg, bron, bericht, aangemaakt) VALUES ('aangevraagd', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'site', ?, ?)")
    .bind(b.aankomst, b.vertrek, personen, volwassenen, kinderen, leeftijden.join(", "), naam, email, telefoon, huur, SCHOONMAAK, BORG, bericht, new Date().toISOString()).run();

  const nl = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  const euro = (x) => "€ " + x.toLocaleString("nl-NL");
  const beheer = new URL("/beheer/", request.url).href;
  const volledig = [
    "Er is een nieuwe reserveringsaanvraag binnengekomen via de website.",
    "",
    `Naam: ${naam}`,
    `E-mail: ${email}`,
    `Telefoon: ${telefoon || "niet opgegeven"}`,
    "",
    `Aankomst: ${nl(b.aankomst)}`,
    `Vertrek: ${nl(b.vertrek)}`,
    `Aantal nachten: ${n}`,
    `Volwassenen: ${volwassenen}`,
    `Kinderen: ${kinderen}` + (kinderen ? ` (leeftijd: ${leeftijden.join(", ")} jaar)` : ""),
    "",
    `Huur: ${euro(huur)}`,
    `Eindschoonmaak: ${euro(SCHOONMAAK)}`,
    `Totaal verblijf: ${euro(huur + SCHOONMAAK)}`,
    `Borg: ${euro(BORG)}`,
    "",
    "Bericht van de gast:",
    bericht || "(geen bericht)",
    "",
    "De gast heeft bevestigd dat alle volwassenen 24 jaar of ouder zijn.",
    "De gast is akkoord gegaan met de huurvoorwaarden.",
    "De aanvraag is nog niet bevestigd. Bevestigen of afwijzen doe je in het beheer:",
    beheer,
    "",
    "Je kunt deze mail beantwoorden om de gast rechtstreeks te schrijven."
  ].join("\n");
  waitUntil(stuurMelding(env, `Nieuwe aanvraag: ${naam}, ${nl(b.aankomst)} t/m ${nl(b.vertrek)}`,
    `Nieuwe reserveringsaanvraag: ${nl(b.aankomst)} t/m ${nl(b.vertrek)} (${n} nachten), ${volwassenen} volwassenen en ${kinderen} kinderen. Open het beheer om te bevestigen of af te wijzen.`,
    volledig, email));
  return json({ ok: true });
});
