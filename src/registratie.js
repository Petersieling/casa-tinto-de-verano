// Gastregistratie: de gegevens van alle gasten die de Spaanse wet vraagt (SES.Hospedajes).
// Elke bevestigde boeking krijgt een persoonlijke link; de gast vult daar de gegevens in.
// Niet ingevuld? Dan volgt vanzelf een herinnering. Na de bewaartermijn worden de gegevens gewist.
import { vandaag } from "./lib.js";
import { maakGastmail } from "./gastmail.js";

export const SITE = "https://www.casatintodeverano.com";
export const INVULLEN_DAGEN = 7;       // uiterlijk zoveel dagen voor aankomst invullen
const HERINNERING_1 = 10;              // eerste herinnering, dagen voor aankomst
const HERINNERING_2 = 4;               // tweede herinnering, dagen voor aankomst
const BEWAAR_JAREN = 3;                // bewaartermijn volgens de Spaanse regels

export const DOCUMENTEN = [["paspoort", "Paspoort"], ["id-kaart", "Identiteitskaart"], ["nie", "Spaans NIE"], ["dni", "Spaans DNI"]];
export const GESLACHTEN = [["man", "Man"], ["vrouw", "Vrouw"], ["anders", "Anders"]];
export const VERWANTSCHAP = [["kind", "Kind"], ["kleinkind", "Kleinkind"], ["broer-zus", "Broer of zus"], ["neef-nicht", "Neef of nicht"], ["voogdij", "Onder voogdij"], ["anders", "Anders"]];

const dagenTussen = (van, tot) => Math.round((Date.parse(tot + "T12:00:00Z") - Date.parse(van + "T12:00:00Z")) / 864e5);
const nlDatum = (iso) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
export const linkVoor = (token, taal) => `${SITE}/gasten?t=${token}${taal === "en" ? "&lang=en" : ""}`;

function nieuwToken() {
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Elke bevestigde boeking die nog komt of bezig is, krijgt een link.
export async function zorgVoorLinks(d) {
  await d.prepare("DELETE FROM registraties WHERE boeking_id NOT IN (SELECT id FROM boekingen WHERE status = 'bevestigd')").run();
  const { results } = await d.prepare(
    "SELECT b.id FROM boekingen b LEFT JOIN registraties r ON r.boeking_id = b.id WHERE b.status = 'bevestigd' AND b.vertrek >= ? AND r.boeking_id IS NULL"
  ).bind(vandaag()).all();
  for (const { id } of results) {
    await d.prepare("INSERT OR IGNORE INTO registraties (boeking_id, token, aangemaakt) VALUES (?, ?, ?)").bind(id, nieuwToken(), vandaag()).run();
  }
}

// ---- Controle van wat de gast invult ----
const tk = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const isDatum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const uit = (lijst, v) => (lijst.some(([w]) => w === v) ? v : "");
export const leeftijdOp = (geboren, op) => {
  const [gj, gm, gd] = geboren.split("-").map(Number), [j, m, d] = op.split("-").map(Number);
  return j - gj - (m < gm || (m === gm && d < gd) ? 1 : 0);
};

export class Invoerfout extends Error {}
export function leesGasten(invoer, boeking) {
  const lijst = Array.isArray(invoer.gasten) ? invoer.gasten : [];
  const aantal = Math.max(1, boeking.personen || 1);
  if (lijst.length !== aantal) throw new Invoerfout(`Vul de gegevens van alle ${aantal} gasten in.`);
  const gasten = lijst.map((g, i) => {
    const nr = `gast ${i + 1}`;
    const r = {
      voornaam: tk(g.voornaam, 60), achternaam: tk(g.achternaam, 80), geslacht: uit(GESLACHTEN, g.geslacht),
      geboortedatum: tk(g.geboortedatum, 10), nationaliteit: tk(g.nationaliteit, 40),
      document: uit(DOCUMENTEN, g.document), documentnummer: tk(g.documentnummer, 30).toUpperCase(),
      zelfde_adres: i > 0 && !!g.zelfde_adres,
      adres: tk(g.adres, 120), postcode: tk(g.postcode, 15), plaats: tk(g.plaats, 60), land: tk(g.land, 40),
      verwantschap: uit(VERWANTSCHAP, g.verwantschap)
    };
    if (!r.voornaam || !r.achternaam) throw new Invoerfout(`Vul de voor- en achternaam van ${nr} in.`);
    if (!r.geslacht) throw new Invoerfout(`Kies het geslacht van ${nr}.`);
    if (!isDatum(r.geboortedatum) || r.geboortedatum > vandaag() || r.geboortedatum < "1900-01-01") throw new Invoerfout(`Vul een geldige geboortedatum in voor ${nr}.`);
    if (r.nationaliteit.length < 2) throw new Invoerfout(`Kies de nationaliteit van ${nr}.`);
    if (!r.document || r.documentnummer.length < 4) throw new Invoerfout(`Vul het soort document en het documentnummer van ${nr} in.`);
    const leeftijd = leeftijdOp(r.geboortedatum, boeking.aankomst);
    if (i === 0 && leeftijd < 18) throw new Invoerfout("Gast 1 is de hoofdhuurder en moet 18 jaar of ouder zijn.");
    if (leeftijd < 18 && !r.verwantschap) throw new Invoerfout(`Kies wat ${nr} is van gast 1 (bijvoorbeeld kind of kleinkind).`);
    if (leeftijd >= 18) r.verwantschap = "";
    if (r.zelfde_adres) { r.adres = r.postcode = r.plaats = r.land = ""; }
    else if (!r.adres || !r.plaats || !r.land) throw new Invoerfout(`Vul het woonadres van ${nr} in.`);
    return r;
  });
  const telefoon = tk(invoer.telefoon, 30);
  if (telefoon.replace(/\D/g, "").length < 8) throw new Invoerfout("Vul een telefoonnummer in waarop we je tijdens je verblijf kunnen bereiken.");
  return { gasten, telefoon };
}

// ---- Herinneringen en wissen, hooguit een paar keer per dag ----
async function verstuur(env, aan, onderwerp, tekst, taal) {
  const { html, text } = maakGastmail(tekst, taal);
  const kopie = env.MAIL_KOPIE || env.MELDING_EMAIL;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_VAN, to: [aan], subject: onderwerp, html, text,
      reply_to: env.MAIL_ANTWOORD || "info@casatintodeverano.com", ...(kopie ? { bcc: [kopie] } : {}) })
  });
  return r.ok;
}

export function herinneringTekst(b, token, dagen) {
  if (b.taal === "en") {
    const when = dagen <= 1 ? "Tomorrow" : `In ${dagen} days`;
    return `Dear ${b.naam || "guest"},\n\n${when} you will be arriving at Casa Tinto de Verano in Punta Prima. We are looking forward to it!\n\n` +
      `We have not yet received the details of the guests. Spanish law requires us to report everyone staying in the penthouse to the authorities. Could you fill them in via your personal link?\n${linkVoor(token, "en")}\n\n` +
      `It only takes a few minutes. Please have the passports or identity cards of all guests to hand.\n\nThank you in advance!`;
  }
  const wanneer = dagen <= 1 ? "Morgen" : `Over ${dagen} dagen`;
  return `Beste ${b.naam || "gast"},\n\n${wanneer} kom je naar Casa Tinto de Verano in Punta Prima. We kijken ernaar uit!\n\n` +
    `We hebben de gegevens van de gasten nog niet ontvangen. De Spaanse wet verplicht ons die van iedereen die in het penthouse verblijft door te geven aan de overheid. Wil je ze invullen via je persoonlijke link?\n${linkVoor(token)}\n\n` +
    `Het invullen duurt een paar minuten. Houd de paspoorten of identiteitskaarten van alle gasten bij de hand.\n\nAlvast bedankt!`;
}

export async function dagelijks(env, d) {
  try {
    const nu = Date.now();
    const laatst = await d.prepare("SELECT waarde FROM instellingen WHERE sleutel = 'reg_laatst'").first();
    if (laatst && nu - +laatst.waarde < 6 * 36e5) return;
    await d.prepare("INSERT INTO instellingen (sleutel, waarde) VALUES ('reg_laatst', ?) ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde").bind(String(nu)).run();
    await zorgVoorLinks(d);
    const dag = vandaag();

    // Wissen: niet meer nodig bij een afgewezen of geannuleerde boeking, en na de bewaartermijn.
    const grens = new Date(Date.parse(dag + "T12:00:00Z")); grens.setUTCFullYear(grens.getUTCFullYear() - BEWAAR_JAREN);
    await d.batch([
      d.prepare("DELETE FROM registraties WHERE boeking_id NOT IN (SELECT id FROM boekingen WHERE status = 'bevestigd')"),
      d.prepare("DELETE FROM registraties WHERE boeking_id IN (SELECT id FROM boekingen WHERE vertrek < ?)").bind(grens.toISOString().slice(0, 10))
    ]);

    if (!env.RESEND_API_KEY || !env.MAIL_VAN) return;
    const { results } = await d.prepare(
      "SELECT b.id, b.naam, b.email, b.aankomst, b.taal, r.token, r.aangemaakt, r.herinnerd1, r.herinnerd2 FROM boekingen b JOIN registraties r ON r.boeking_id = b.id " +
      "WHERE b.status = 'bevestigd' AND b.aankomst > ? AND r.ingevuld IS NULL AND b.email != ''"
    ).bind(dag).all();
    for (const b of results) {
      const dagen = dagenTussen(dag, b.aankomst);
      const kort = dagenTussen(b.aangemaakt || dag, dag) < 2; // net bevestigd: de link staat nog vers in de bevestiging
      let kolom = null;
      if (dagen <= HERINNERING_2 && !b.herinnerd2 && !kort && !(b.herinnerd1 && dagenTussen(b.herinnerd1, dag) < 2)) kolom = "herinnerd2";
      else if (dagen <= HERINNERING_1 && dagen > HERINNERING_2 && !b.herinnerd1 && !kort) kolom = "herinnerd1";
      if (!kolom) continue;
      const onderwerp = b.taal === "en" ? "Reminder: guest details for Casa Tinto de Verano" : "Herinnering: gegevens van de gasten voor Casa Tinto de Verano";
      if (await verstuur(env, b.email, onderwerp, herinneringTekst(b, b.token, dagen), b.taal)) {
        await d.prepare(`UPDATE registraties SET ${kolom} = ? WHERE boeking_id = ?`).bind(dag, b.id).run();
      }
    }
  } catch (e) { console.error("gastregistratie", e); }
}

export { nlDatum, dagenTussen };
