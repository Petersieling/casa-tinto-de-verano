import { db, json, veilig, ipVan, tekst, teVaak, noteerPoging, stuurMelding, Melding } from "../../src/lib.js";

// Openbaar: goedgekeurde berichten tonen.
export const onRequestGet = veilig(async ({ env }) => {
  const d = await db(env);
  const { results } = await d.prepare("SELECT naam, verblijf, bericht, sterren, aangemaakt FROM gastenboek WHERE zichtbaar = 1 ORDER BY id DESC LIMIT 200").all();
  return json({ berichten: results }, 200, { "cache-control": "public, max-age=60" });
});

// Openbaar: een gast schrijft een bericht. Het verschijnt pas na goedkeuring in het beheer.
export const onRequestPost = veilig(async ({ request, env, waitUntil }) => {
  const d = await db(env);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") throw new Melding("Je bericht is niet goed aangekomen.");
  if (b.website) return json({ ok: true }); // verborgen veld dat alleen spamrobots invullen
  const naam = tekst(b.naam, 60), verblijf = tekst(b.verblijf, 60), bericht = tekst(b.bericht, 1200);
  const sterren = Math.trunc(+b.sterren);
  if (naam.length < 2) throw new Melding("Vul je naam in.");
  if (!(sterren >= 1 && sterren <= 5)) throw new Melding("Kies het aantal sterren, van 1 tot en met 5.");
  if (bericht.length < 10) throw new Melding("Schrijf een bericht van minimaal 10 tekens.");
  const ip = ipVan(request);
  if (await teVaak(d, "gastenboek", ip, 3, 60)) throw new Melding("Er zijn net al berichten verstuurd. Probeer het later opnieuw.", 429);
  await noteerPoging(d, "gastenboek", ip);
  await d.prepare("INSERT INTO gastenboek (naam, verblijf, bericht, sterren, zichtbaar, aangemaakt) VALUES (?, ?, ?, ?, 0, ?)").bind(naam, verblijf, bericht, sterren, new Date().toISOString()).run();
  waitUntil(stuurMelding(env, "Nieuw bericht in het gastenboek", "Er staat een nieuw bericht in het gastenboek. Open het beheer om het goed te keuren."));
  return json({ ok: true });
});
