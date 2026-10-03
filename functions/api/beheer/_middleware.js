import { fout, ingelogd } from "../../../src/lib.js";

// Alles onder /api/beheer vraagt om een geldige inlog. Wijzigingen moeten bovendien van de eigen site komen.
export const onRequest = async ({ request, env, next }) => {
  if (!(await ingelogd(env, request))) return fout("Je bent niet ingelogd.", 401);
  if (request.method !== "GET") {
    const herkomst = request.headers.get("Origin");
    if (herkomst && new URL(herkomst).host !== new URL(request.url).host) return fout("Verzoek geweigerd.", 403);
  }
  return next();
};
