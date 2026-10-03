import { db, veilig, wachtwoordIngesteld, agendaSleutel, Melding } from "../../src/lib.js";

// Agenda-abonnement (iCal) voor de agenda-app op je telefoon. Alleen bereikbaar met de geheime sleutel uit het beheer.
const schoon = (s) => String(s || "").replace(/[\;,]/g, (c) => "\\" + c).replace(/\r?\n/g, " ");
export const onRequestGet = veilig(async ({ request, env }) => {
  const gegeven = new URL(request.url).searchParams.get("sleutel") || "";
  if (!wachtwoordIngesteld(env) || gegeven !== (await agendaSleutel(env))) throw new Melding("Geen toegang.", 403);
  const d = await db(env);
  const { results } = await d.prepare("SELECT * FROM boekingen WHERE status IN ('bevestigd','geblokkeerd','aangevraagd') ORDER BY aankomst").all();
  const regels = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Casa Tinto de Verano//Beheer//NL", "X-WR-CALNAME:Casa Tinto de Verano"];
  for (const b of results) {
    const titel = b.status === "geblokkeerd" ? "Bezet" + (b.notitie ? ": " + b.notitie : "")
      : (b.status === "aangevraagd" ? "Aanvraag: " : "Verhuurd: ") + (b.naam || "gast") + (b.personen ? ` (${b.personen} pers.)` : "");
    regels.push("BEGIN:VEVENT", `UID:boeking-${b.id}@casatintodeverano`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`,
      `DTSTART;VALUE=DATE:${b.aankomst.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${b.vertrek.replace(/-/g, "")}`, `SUMMARY:${schoon(titel)}`, "END:VEVENT");
  }
  regels.push("END:VCALENDAR");
  return new Response(regels.join("\r\n"), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" } });
});
