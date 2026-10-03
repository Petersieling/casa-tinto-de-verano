import { db, json, veilig, ipVan, teVaak, noteerPoging, wachtwoordIngesteld, wachtwoordKlopt, sessieCookie, Melding } from "../../src/lib.js";

export const onRequestPost = veilig(async ({ request, env }) => {
  if (!wachtwoordIngesteld(env)) throw new Melding("Er is nog geen wachtwoord ingesteld in Cloudflare (BEHEER_WACHTWOORD, minimaal 8 tekens).", 503);
  const d = await db(env);
  const ip = ipVan(request);
  if (await teVaak(d, "login", ip, 8, 15)) throw new Melding("Te veel pogingen. Wacht een kwartier en probeer het opnieuw.", 429);
  const b = await request.json().catch(() => ({}));
  if (!(await wachtwoordKlopt(env, b.wachtwoord || ""))) {
    await noteerPoging(d, "login", ip);
    throw new Melding("Het wachtwoord klopt niet.", 401);
  }
  return json({ ok: true }, 200, { "set-cookie": await sessieCookie(env) });
});
