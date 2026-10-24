import { db, json, veilig, ipVan, vandaag, teVaak, noteerPoging, stuurMelding, Melding } from "../../src/lib.js";
import { leesGasten, Invoerfout, DOCUMENTEN, GESLACHTEN, VERWANTSCHAP, INVULLEN_DAGEN, SITE } from "../../src/registratie.js";

// Openbaar, maar alleen met de persoonlijke link uit de bevestigingsmail.
async function zoek(d, token) {
  if (!/^[0-9a-f]{48}$/.test(token || "")) throw new Melding("Deze link klopt niet. Gebruik de link uit je bevestigingsmail.", 404);
  const r = await d.prepare(
    "SELECT r.boeking_id, r.gegevens, r.ingevuld, b.naam, b.email, b.telefoon, b.adres, b.postcode, b.plaats, b.land, b.aankomst, b.vertrek, b.personen, b.volwassenen, b.kinderen, b.status " +
    "FROM registraties r JOIN boekingen b ON b.id = r.boeking_id WHERE r.token = ?"
  ).bind(token).first();
  if (!r || r.status !== "bevestigd") throw new Melding("Deze link werkt niet meer. Neem contact met ons op via info@casatintodeverano.com.", 404);
  return r;
}

export const onRequestGet = veilig(async ({ request, env }) => {
  const d = await db(env);
  const ip = ipVan(request);
  if (await teVaak(d, "registratie-lees", ip, 60, 60)) throw new Melding("Even te vaak geprobeerd. Probeer het over een uur opnieuw.", 429);
  await noteerPoging(d, "registratie-lees", ip);
  const r = await zoek(d, new URL(request.url).searchParams.get("t"));
  return json({
    naam: r.naam, email: r.email, telefoon: r.telefoon,
    adres: { adres: r.adres || "", postcode: r.postcode || "", plaats: r.plaats || "", land: r.land || "" }, aankomst: r.aankomst, vertrek: r.vertrek,
    personen: Math.max(1, r.personen || 1), volwassenen: r.volwassenen, kinderen: r.kinderen,
    ingevuld: r.ingevuld, wijzigbaar: vandaag() < r.vertrek, invullenDagen: INVULLEN_DAGEN,
    gegevens: r.gegevens ? JSON.parse(r.gegevens) : null,
    keuzes: { documenten: DOCUMENTEN, geslachten: GESLACHTEN, verwantschap: VERWANTSCHAP }
  }, 200, { "x-robots-tag": "noindex" });
});

export const onRequestPost = veilig(async ({ request, env, waitUntil }) => {
  const d = await db(env);
  const ip = ipVan(request);
  if (await teVaak(d, "registratie", ip, 15, 60)) throw new Melding("Even te vaak geprobeerd. Probeer het over een uur opnieuw.", 429);
  await noteerPoging(d, "registratie", ip);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") throw new Melding("De gegevens zijn niet goed aangekomen. Probeer het opnieuw.");
  const r = await zoek(d, b.t);
  if (vandaag() >= r.vertrek) throw new Melding("Je verblijf is voorbij; de gegevens kun je niet meer wijzigen.");
  let gegevens;
  try { gegevens = leesGasten(b, r); } catch (e) { if (e instanceof Invoerfout) throw new Melding(e.message); throw e; }
  const eerder = !!r.ingevuld;
  await d.prepare("UPDATE registraties SET gegevens = ?, ingevuld = ? WHERE boeking_id = ?").bind(JSON.stringify(gegevens), new Date().toISOString(), r.boeking_id).run();
  const nl = (iso) => iso.split("-").reverse().join("-");
  waitUntil(stuurMelding(env, `Gastgegevens ${eerder ? "gewijzigd" : "ingevuld"}: ${r.naam}, ${nl(r.aankomst)}`,
    `${r.naam} heeft de gegevens van de gasten ${eerder ? "gewijzigd" : "ingevuld"}.`,
    `${r.naam} heeft de gegevens van de ${gegevens.gasten.length} gasten ${eerder ? "gewijzigd" : "ingevuld"} voor het verblijf van ${nl(r.aankomst)} t/m ${nl(r.vertrek)}.\n\nJe bekijkt ze in het beheer bij de boeking, knop Gastgegevens:\n${SITE}/beheer/`));
  return json({ ok: true });
});
