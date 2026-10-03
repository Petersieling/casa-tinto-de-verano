import { db, json, veilig, vandaag } from "../../src/lib.js";

// Openbaar: alleen welke nachten bezet zijn, zonder namen of andere gegevens.
export const onRequestGet = veilig(async ({ env }) => {
  const d = await db(env);
  const { results } = await d.prepare("SELECT aankomst AS van, vertrek AS tot FROM boekingen WHERE status IN ('bevestigd','geblokkeerd') AND vertrek > ? ORDER BY aankomst").bind(vandaag()).all();
  return json({ bezet: results }, 200, { "cache-control": "public, max-age=60" });
});
