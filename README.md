# Casa Tinto de Verano

Website en beheer van het vakantiepenthouse in Punta Prima (Costa Blanca). Gehost op Cloudflare Pages.

## Wat staat waar

| Onderdeel | Bestand |
|---|---|
| Openbare site | `index.html`, `over-ons.html` |
| Prijslijst, borg, schoonmaak, minimaal verblijf | `src/prijzen.js` |
| Beheer (dashboard) | `beheer/index.html`, bereikbaar op `/beheer/` |
| Serverkant | `functions/api/` en `src/lib.js` |

## Eenmalig instellen in Cloudflare

1. **Database:** maak onder Storage & Databases een D1-database aan, bijvoorbeeld `casa-tinto`.
2. **Koppelen:** open het Pages-project, ga naar Settings, Bindings, en voeg een D1-binding toe met de naam `DB`.
3. **Wachtwoord:** voeg onder Settings, Variables and Secrets een secret toe met de naam `BEHEER_WACHTWOORD` (minimaal 8 tekens).
4. **Opnieuw deployen:** kies bij Deployments de laatste deployment en klik op Retry deployment.

De tabellen worden bij het eerste gebruik vanzelf aangemaakt.

## Melding bij een nieuwe aanvraag (optioneel)

- **Push op je telefoon:** installeer de app ntfy, abonneer je op een zelfbedachte, moeilijk te raden naam en zet die naam in de variabele `NTFY_TOPIC`.
- **E-mail:** maak een account bij Resend met het adres waarop je de melding wilt krijgen. Zet de API-sleutel in `RESEND_API_KEY` en dat adres in `MELDING_EMAIL`.

Een melding bevat alleen de periode en het aantal personen, geen gegevens van de gast.

## Build-instellingen

Framework preset: geen. Build command: leeg. Build output directory: `/`.
