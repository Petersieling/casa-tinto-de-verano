// Gedeelde hulpfuncties voor de serverkant (Cloudflare Pages Functions).
const KOP = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
export const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...KOP, ...extra } });
export const fout = (tekst, status = 400) => json({ fout: tekst }, status);

export class Melding extends Error {
  constructor(tekst, status = 400) { super(tekst); this.status = status; }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS klanten (id INTEGER PRIMARY KEY AUTOINCREMENT, naam TEXT NOT NULL, email TEXT, telefoon TEXT, adres TEXT, notitie TEXT, aangemaakt TEXT)`,
  `CREATE TABLE IF NOT EXISTS boekingen (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL, aankomst TEXT NOT NULL, vertrek TEXT NOT NULL, personen INTEGER, naam TEXT, email TEXT, telefoon TEXT, klant_id INTEGER, volwassenen INTEGER, kinderen INTEGER, leeftijden TEXT, huur REAL DEFAULT 0, schoonmaak REAL DEFAULT 0, borg REAL DEFAULT 0, betaald INTEGER DEFAULT 0, bron TEXT, bericht TEXT, notitie TEXT, aangemaakt TEXT)`,
  `CREATE TABLE IF NOT EXISTS facturen (id INTEGER PRIMARY KEY AUTOINCREMENT, nummer TEXT UNIQUE NOT NULL, boeking_id INTEGER UNIQUE, datum TEXT, gegevens TEXT, totaal REAL)`,
  `CREATE TABLE IF NOT EXISTS instellingen (sleutel TEXT PRIMARY KEY, waarde TEXT)`,
  `CREATE TABLE IF NOT EXISTS pogingen (soort TEXT, ip TEXT, tijd INTEGER)`,
  `CREATE TABLE IF NOT EXISTS gastenboek (id INTEGER PRIMARY KEY AUTOINCREMENT, naam TEXT NOT NULL, verblijf TEXT, bericht TEXT NOT NULL, zichtbaar INTEGER DEFAULT 0, aangemaakt TEXT)`
];
let schemaKlaar = false;
export async function db(env) {
  if (!env.DB) throw new Melding("De database is nog niet gekoppeld.", 503);
  if (!schemaKlaar) {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    // Kolommen die later zijn toegevoegd, bijwerken in een bestaande database.
    const { results } = await env.DB.prepare("SELECT name FROM pragma_table_info('boekingen')").all();
    const aanwezig = new Set(results.map((r) => r.name));
    for (const [kolom, soort] of [["volwassenen", "INTEGER"], ["kinderen", "INTEGER"], ["leeftijden", "TEXT"]]) {
      if (!aanwezig.has(kolom)) await env.DB.prepare(`ALTER TABLE boekingen ADD COLUMN ${kolom} ${soort}`).run();
    }
    schemaKlaar = true;
  }
  return env.DB;
}

// Vangt fouten af zodat de bezoeker altijd een nette melding krijgt.
export const veilig = (fn) => async (ctx) => {
  try {
    return await fn(ctx);
  } catch (e) {
    if (e instanceof Melding) return fout(e.message, e.status);
    console.error(e);
    return fout("Er ging iets mis. Probeer het later opnieuw.", 500);
  }
};

export const vandaag = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
export const ipVan = (request) => request.headers.get("CF-Connecting-IP") || "onbekend";
export const tekst = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const getal = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.round(+v * 100) / 100 : 0);

// Telt pogingen per IP-adres, tegen spam en tegen het raden van het wachtwoord.
export async function teVaak(d, soort, ip, maximum, minuten) {
  const nu = Date.now();
  const r = await d.prepare("SELECT COUNT(*) AS n FROM pogingen WHERE soort = ? AND ip = ? AND tijd > ?").bind(soort, ip, nu - minuten * 6e4).first();
  return r.n >= maximum;
}
export async function noteerPoging(d, soort, ip) {
  const nu = Date.now();
  await d.batch([
    d.prepare("DELETE FROM pogingen WHERE tijd < ?").bind(nu - 864e5),
    d.prepare("INSERT INTO pogingen (soort, ip, tijd) VALUES (?, ?, ?)").bind(soort, ip, nu)
  ]);
}

// Is deze periode vrij? Vertrekdag van de één mag de aankomstdag van de ander zijn.
export async function overlapt(d, aankomst, vertrek, behalveId = 0) {
  const r = await d.prepare("SELECT id FROM boekingen WHERE status IN ('bevestigd','geblokkeerd') AND aankomst < ? AND vertrek > ? AND id != ? LIMIT 1").bind(vertrek, aankomst, behalveId).first();
  return !!r;
}

// ---- Inloggen -------------------------------------------------------------
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sleutel(env) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode("ctv-sessie:" + env.BEHEER_WACHTWOORD));
  return crypto.subtle.importKey("raw", h, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function hmac(env, t) {
  return hex(await crypto.subtle.sign("HMAC", await sleutel(env), enc.encode(t)));
}
function gelijk(a, b) {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
export const wachtwoordIngesteld = (env) => typeof env.BEHEER_WACHTWOORD === "string" && env.BEHEER_WACHTWOORD.length >= 8;
export async function wachtwoordKlopt(env, invoer) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(invoer))),
    crypto.subtle.digest("SHA-256", enc.encode(env.BEHEER_WACHTWOORD))
  ]);
  return gelijk(hex(a), hex(b));
}
const DAGEN = 30;
export async function sessieCookie(env) {
  const exp = Date.now() + DAGEN * 864e5;
  return `ctv_sessie=${exp}.${await hmac(env, "sessie:" + exp)}; Path=/; Max-Age=${DAGEN * 86400}; HttpOnly; Secure; SameSite=Strict`;
}
export const legeCookie = "ctv_sessie=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
export async function ingelogd(env, request) {
  if (!wachtwoordIngesteld(env)) return false;
  const m = /(?:^|;\s*)ctv_sessie=(\d+)\.([0-9a-f]+)/.exec(request.headers.get("Cookie") || "");
  if (!m || +m[1] < Date.now()) return false;
  return gelijk(m[2], await hmac(env, "sessie:" + m[1]));
}
export async function agendaSleutel(env) {
  return (await hmac(env, "agenda")).slice(0, 40);
}

// ---- Melding bij een nieuwe aanvraag ---------------------------------------
// Push via ntfy (NTFY_TOPIC) en/of e-mail via Resend (RESEND_API_KEY + MELDING_EMAIL).
export async function stuurMelding(env, onderwerp, inhoud) {
  const taken = [];
  if (env.NTFY_TOPIC) {
    taken.push(fetch("https://ntfy.sh/" + encodeURIComponent(env.NTFY_TOPIC), {
      method: "POST", body: inhoud, headers: { Title: "Casa Tinto de Verano", Tags: "house" }
    }));
  }
  if (env.RESEND_API_KEY && env.MELDING_EMAIL) {
    taken.push(fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MELDING_VAN || "Casa Tinto de Verano <onboarding@resend.dev>", to: [env.MELDING_EMAIL], subject: onderwerp, text: inhoud })
    }));
  }
  await Promise.allSettled(taken);
}
