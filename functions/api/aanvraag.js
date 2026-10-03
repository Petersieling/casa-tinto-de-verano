import { db, json, veilig, vandaag, ipVan, tekst, teVaak, noteerPoging, overlapt, stuurMelding, Melding } from "../../src/lib.js";
import { isDatum, nachten, huurprijs, SCHOONMAAK, BORG, MIN_NACHTEN, MAX_PERSONEN } from "../../src/prijzen.js";

// Openbaar: een bezoeker vraagt een reservering aan. Die is pas definitief na bevestiging in het beheer.
export const onRequestPost = veilig(async ({ request, env, waitUntil }) => {
  const d = await db(env);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") throw new Melding("De aanvraag is niet goed aangekomen.");
  if (b.website) return json({ ok: true }); // verborgen veld dat alleen spamrobots invullen

  const naam = tekst(b.naam, 100), email = tekst(b.email, 150), telefoon = tekst(b.telefoon, 40), bericht = tekst(b.bericht, 1500);
  const personen = Math.trunc(+b.personen);
  if (naam.length < 2) throw new Melding("Vul je naam in.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Melding("Vul een geldig e-mailadres in.");
  if (!(personen >= 1 && personen <= MAX_PERSONEN)) throw new Melding(`Het penthouse is voor maximaal ${MAX_PERSONEN} personen.`);
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
  await d.prepare("INSERT INTO boekingen (status, aankomst, vertrek, personen, naam, email, telefoon, huur, schoonmaak, borg, bron, bericht, aangemaakt) VALUES ('aangevraagd', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'site', ?, ?)")
    .bind(b.aankomst, b.vertrek, personen, naam, email, telefoon, huur, SCHOONMAAK, BORG, bericht, new Date().toISOString()).run();

  waitUntil(stuurMelding(env, "Nieuwe aanvraag Casa Tinto de Verano",
    `Nieuwe reserveringsaanvraag: ${b.aankomst} t/m ${b.vertrek} (${n} nachten), ${personen} personen. Open het beheer om te bevestigen of af te wijzen.`));
  return json({ ok: true });
});
