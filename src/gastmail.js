// Mail aan een gast vanuit het beheer, verstuurd via Resend vanaf het eigen domein,
// met de handtekening met logo eronder. Antwoorden van de gast komen in je eigen inbox.
const SITE = "https://www.casatintodeverano.com";
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkjes = (t) => t.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:#8A6016;">${u}</a>`);

const HANDTEKENING_TEKST = (en) => (en ? "Kind regards," : "Met vriendelijke groet,") + "\n\nCasa Tinto de Verano\nPenthouse in Punta Prima · Costa Blanca\ninfo@casatintodeverano.com\nwww.casatintodeverano.com\nInstagram: casa_tinto_de_verano";

const HANDTEKENING_HTML = (en) => `
<p style="margin:24px 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#3A2315;">${en ? "Kind regards," : "Met vriendelijke groet,"}</p>
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Georgia,'Times New Roman',serif;color:#3A2315;">
  <tr>
    <td style="padding:0 16px 0 0;vertical-align:middle;"><img src="${SITE}/mail/logo.jpg" width="90" height="111" alt="Casa Tinto de Verano" style="display:block;width:90px;height:111px;border:0;"></td>
    <td style="padding:0 0 0 16px;vertical-align:middle;border-left:1px solid #B98A2E;">
      <div style="font-size:18px;font-weight:bold;letter-spacing:1px;color:#3A2315;line-height:1.3;">CASA TINTO DE VERANO</div>
      <div style="font-size:14px;font-style:italic;color:#8A6016;line-height:1.5;padding:2px 0 8px;">Penthouse in Punta Prima &middot; Costa Blanca</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#7B6552;">
        <a href="mailto:info@casatintodeverano.com" style="color:#3A2315;text-decoration:none;">info@casatintodeverano.com</a><br>
        <a href="${SITE}" style="color:#3A2315;text-decoration:none;">www.casatintodeverano.com</a>
        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;"><tr>
          <td style="padding:0 6px 0 0;vertical-align:middle;"><a href="https://www.instagram.com/casa_tinto_de_verano/" style="text-decoration:none;"><img src="${SITE}/mail/instagram.png" width="16" height="16" alt="Instagram" style="display:block;width:16px;height:16px;border:0;"></a></td>
          <td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:13px;"><a href="https://www.instagram.com/casa_tinto_de_verano/" style="color:#3A2315;text-decoration:none;">casa_tinto_de_verano</a></td>
        </tr></table>
      </div>
    </td>
  </tr>
</table>`;

export function maakGastmail(tekst, taal) {
  const en = taal === "en";
  const alineas = tekst.trim().split(/\n\s*\n/).map((a) =>
    `<p style="margin:0 0 14px;">${linkjes(esc(a.trim())).replace(/\n/g, "<br>")}</p>`).join("\n");
  const html = `<!doctype html><html lang="${en ? "en" : "nl"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:600px;padding:20px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#3A2315;">
${alineas}
${HANDTEKENING_HTML(en)}
</div></body></html>`;
  return { html, text: tekst.trim() + "\n\n" + HANDTEKENING_TEKST(en) };
}
