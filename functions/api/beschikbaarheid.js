import { db, json, veilig, vandaag } from "../../src/lib.js";
import { dagelijks } from "../../src/registratie.js";

// Openbaar: alleen welke nachten bezet zijn, zonder namen of andere gegevens.
export const onRequestGet = veilig(async ({ env, waitUntil }) => {
  const d = await db(env);
  waitUntil(dagelijks(env, d));
  const { results } = await d.prepare("SELECT aankomst AS van, vertrek AS tot FROM boekingen WHERE status IN ('bevestigd','geblokkeerd') AND vertrek > ? ORDER BY aankomst").bind(vandaag()).all();
  return json({ bezet: results }, 200, { "cache-control": "public, max-age=60" });
});
