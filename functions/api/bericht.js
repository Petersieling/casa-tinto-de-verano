import { db, json, veilig, ipVan, tekst, teVaak, noteerPoging, stuurMelding, Melding } from "../../src/lib.js";

// Openbaar: een bezoeker stuurt een vraag via het berichtenvak op de homepage. Het bericht gaat als mail naar info@.
// Er wordt niets in de database bewaard behalve de teller tegen misbruik.
export const onRequestPost = veilig(async ({ request, env, waitUntil }) => {
  const d = await db(env);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") throw new Melding("Je bericht is niet goed aangekomen.");
  if (b.website) return json({ ok: true }); // verborgen veld dat alleen spamrobots invullen

  const naam = tekst(b.naam, 100), email = tekst(b.email, 150), bericht = tekst(b.bericht, 2000);
  const taal = b.taal === "en" ? "en" : "nl";
  if (naam.length < 2) throw new Melding("Vul je naam in.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Melding("Vul een geldig e-mailadres in.");
  if (bericht.length < 5) throw new Melding("Schrijf je vraag of bericht.");

  const ip = ipVan(request);
  if (await teVaak(d, "bericht", ip, 5, 60)) throw new Melding("Er zijn net al meerdere berichten verstuurd. Probeer het over een uur opnieuw of mail naar info@casatintodeverano.com.", 429);
  await noteerPoging(d, "bericht", ip);

  const volledig = [
    "Er is een nieuw bericht binnengekomen via de website.",
    "",
    `Naam: ${naam}`,
    `E-mail: ${email}`,
    `Taal van de website: ${taal === "en" ? "Engels" : "Nederlands"}`,
    "",
    "Bericht:",
    bericht,
    "",
    "Je kunt direct antwoorden op deze mail; je antwoord gaat naar de afzender."
  ].join("\n");
  waitUntil(stuurMelding(env, `Nieuw bericht van ${naam}`, `Nieuw bericht van ${naam} via de website.`, volledig, email));
  return json({ ok: true });
});
