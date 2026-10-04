#!/usr/bin/env python3
"""Maakt taal.js uit src/vertalingen.txt en controleert of alle teksten op de pagina's een vertaling hebben.

Gebruik (in de hoofdmap van de site):  python3 src/maak-taal.py
"""
import glob, json, os, re, sys
from html.parser import HTMLParser

HIER = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HIER)

# ---------- vertalingen inlezen ----------
woorden, blok = {}, []
def sluit():
    if not blok: return
    if len(blok) != 3: sys.exit("Blok heeft geen drie regels: " + repr(blok))
    if blok[0] in woorden: sys.exit("Dubbel: " + blok[0])
    woorden[blok[0]] = [blok[1], blok[2]]
for regel in open(os.path.join(HIER, "vertalingen.txt"), encoding="utf-8").read().split("\n"):
    r = regel.rstrip()
    if r.lstrip().startswith("#"): continue
    if not r.strip():
        sluit(); blok = []
    else:
        blok.append(" ".join(r.split()) if not r.startswith(".") else r.strip())
sluit()

for nl, en, es in [("ma", "Mo", "lu"), ("di", "Tu", "ma"), ("wo", "We", "mi"), ("do", "Th", "ju"), ("vr", "Fr", "vi"), ("za", "Sa", "sá"), ("zo", "Su", "do")]:
    woorden[nl] = [en, es]

# ---------- taal.js schrijven ----------
KERN = r'''/* Taalkeuze voor de website: Nederlands, Engels en Spaans.
   Dit bestand wordt gemaakt door src/maak-taal.py uit src/vertalingen.txt. Pas het niet met de hand aan. */
(function () {
  var TALEN = { nl: "nl-NL", en: "en-GB", es: "es-ES" };
  var taal = null;
  try { taal = localStorage.getItem("ctv_taal"); } catch (e) {}
  if (!TALEN[taal]) {
    taal = null;
    var voorkeur = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "nl"];
    for (var i = 0; i < voorkeur.length && !taal; i++) { var c = String(voorkeur[i]).slice(0, 2).toLowerCase(); if (TALEN[c]) taal = c; }
    if (!taal) taal = "en";
  }
  window.ctvTaal = taal;
  window.ctvLocale = TALEN[taal];
  document.documentElement.lang = taal;

  var W = __WOORDEN__;
  var n = taal === "en" ? 0 : 1;
  function mv(aantal, een, meer) { return aantal + " " + (+aantal === 1 ? een : meer); }
  // Teksten met een getal of datum erin. Elke regel: patroon, Engels, Spaans.
  var P = [
    [/^€ (\d+),(\d+) per kWh$/, "€$1.$2 per kWh", "$1,$2 € por kWh"],
    [/^€ ([\d.,]+)$/, "€$1", function (m, a) { return a.replace(/^(\d)(\d{3})$/, "$1.$2") + " €"; }],
    [/^(\d) sterren$/, "$1 stars", "$1 estrellas"],
    [/^(\d) van 5 sterren$/, "$1 out of 5 stars", "$1 de 5 estrellas"],
    [/^Beoordeling: (\d),(\d) van 5 sterren uit (\d+) beoordeling(?:en)?\. Naar het gastenboek\.$/,
      function (m, a, b, c) { return "Rating: " + a + "." + b + " out of 5 stars from " + mv(c, "review", "reviews") + ". Go to the guestbook."; },
      function (m, a, b, c) { return "Valoración: " + a + "," + b + " de 5 estrellas en " + mv(c, "reseña", "reseñas") + ". Ir al libro de visitas."; }],
    [/^(\d),(\d) uit (\d+) beoordeling(?:en)?$/,
      function (m, a, b, c) { return a + "." + b + " from " + mv(c, "review", "reviews"); },
      function (m, a, b, c) { return a + "," + b + " en " + mv(c, "reseña", "reseñas"); }],
    [/^gemiddeld uit (\d+) beoordeling(?:en)?$/,
      function (m, c) { return "average from " + mv(c, "review", "reviews"); },
      function (m, c) { return "de media en " + mv(c, "reseña", "reseñas"); }],
    [/^Aankomst op (.+)\. Tik nu op je vertrekdag, minimaal (\d+) nachten later\.$/,
      "Arrival on $1. Now tap your departure day, at least $2 nights later.",
      "Llegada el $1. Toca ahora tu día de salida, como mínimo $2 noches después."],
    [/^Dit kan niet: je koos (\d+) nacht(?:en)?\. Een verblijf is alleen mogelijk vanaf (\d+) nachten\. Tik op een latere vertrekdag\.$/,
      function (m, a, b) { return "This is not possible: you chose " + mv(a, "night", "nights") + ". A stay is only possible from " + b + " nights. Tap a later departure day."; },
      function (m, a, b) { return "No es posible: has elegido " + mv(a, "noche", "noches") + ". La estancia mínima es de " + b + " noches. Toca un día de salida posterior."; }],
    [/^Dit kan niet: je koos (\d+) nachten\. Een verblijf is alleen mogelijk vanaf (\d+) nachten\.$/,
      function (m, a, b) { return "This is not possible: you chose " + mv(a, "night", "nights") + ". A stay is only possible from " + b + " nights."; },
      function (m, a, b) { return "No es posible: has elegido " + mv(a, "noche", "noches") + ". La estancia mínima es de " + b + " noches."; }],
    [/^Huur \((\d+) nachten\)$/, "Rent ($1 nights)", "Alquiler ($1 noches)"],
    [/^([\d.,]+) kWh inbegrepen$/, "$1 kWh included", "$1 kWh incluidos"],
    [/^Kies (.+ \d{4})$/, "Choose $1", "Elegir $1"],
    [/^Kind (\d)$/, "Child $1", "Niño $1"],
    [/^Het penthouse is voor maximaal (\d+) personen\.$/, "The penthouse is for a maximum of $1 guests.", "El ático es para un máximo de $1 personas."],
    [/^Vul de leeftijd van kind (\d) in \(0 tot en met 17 jaar\)\.$/, "Please enter the age of child $1 (0 to 17).", "Introduce la edad del niño $1 (de 0 a 17 años)."],
    [/^Vul je aankomst- en vertrekdatum in als dag-maand-jaar, bijvoorbeeld 04-07-2027\. Het minimale verblijf is (\d+) nachten\.$/,
      "Enter your arrival and departure dates as day-month-year, for example 04-07-2027. The minimum stay is $1 nights.",
      "Introduce tus fechas de llegada y salida como día-mes-año, por ejemplo 04-07-2027. La estancia mínima es de $1 noches."],
    [/^Het minimale verblijf is (\d+) nachten\.$/, "The minimum stay is $1 nights.", "La estancia mínima es de $1 noches."]
  ];

  function vertaal(s) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), k = m[2].replace(/\s+/g, " ");
    if (!k) return null;
    var r = Object.prototype.hasOwnProperty.call(W, k) ? W[k][n] : null;
    if (r === null) for (var i = 0; i < P.length; i++) if (P[i][0].test(k)) { r = k.replace(P[i][0], P[i][1 + n]); break; }
    return r === null ? null : m[1] + r + m[3];
  }
  window.ctvVertaal = function (s) { var r = taal === "nl" ? null : vertaal(s); return r === null ? s : r; };

  // ---------- taalknop rechtsboven ----------
  function knop() {
    var wrap = document.querySelector("header.top .wrap");
    if (!wrap || wrap.querySelector(".taal")) return;
    var stijl = document.createElement("style");
    stijl.textContent =
      ".taal { order: 3; margin-left: 1.25rem; width: auto; min-width: 0; flex: none; height: auto; min-height: 0; box-shadow: none; font: inherit; font-size: .82rem; letter-spacing: .08em; color: var(--ink); background: transparent; border: 1px solid var(--gold); border-radius: 999px; padding: .28rem .55rem; cursor: pointer; }" +
      ".taal:hover, .taal:focus-visible { background: var(--panel); }" +
      ".top nav { margin-left: auto; }" +
      "@media (max-width: 68rem) { .taal { order: 0; margin-left: auto; margin-right: .1rem; } .top nav { margin-left: 0; order: 4; } .menu-knop { order: 1; } }" +
      "@media (max-width: 40rem) { .top .wrap { column-gap: .5rem; } .brand { font-size: .92rem; letter-spacing: .05em; } .taal { padding: .25rem .35rem; } }" +
      "@media (max-width: 24rem) { .brand { font-size: .8rem; letter-spacing: .03em; } .menu-knop { padding: .3rem .7rem; } }";
    document.head.appendChild(stijl);
    var kies = document.createElement("select");
    kies.className = "taal";
    kies.setAttribute("aria-label", "Taal · Language · Idioma");
    kies.setAttribute("data-nt", "");
    [["nl", "NL"], ["en", "EN"], ["es", "ES"]].forEach(function (t) {
      var o = document.createElement("option"); o.value = t[0]; o.textContent = t[1]; if (t[0] === taal) o.selected = true; kies.appendChild(o);
    });
    kies.addEventListener("change", function () {
      try { localStorage.setItem("ctv_taal", kies.value); } catch (e) {}
      location.reload();
    });
    wrap.insertBefore(kies, wrap.querySelector(".menu-knop"));
  }

  if (taal === "nl") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", knop); else knop();
    return;
  }

  // ---------- pagina vertalen ----------
  // Tot de vertaling klaar is blijft de pagina onzichtbaar, zodat er geen Nederlandse tekst opflitst.
  var wacht = document.createElement("style");
  wacht.textContent = "body { visibility: hidden; }";
  document.head.appendChild(wacht);
  function toon() { if (wacht.parentNode) wacht.parentNode.removeChild(wacht); }
  setTimeout(toon, 2500);

  var ATTR = ["placeholder", "aria-label", "title", "alt"];
  var NIET = "[data-nt], #berichten blockquote, #berichten .van, script, style, #mailtekst";
  var klaarT = new WeakMap(), klaarA = new WeakMap();
  function tekst(node) {
    var nu = node.nodeValue;
    if (klaarT.get(node) === nu) return;
    var p = node.parentElement;
    if (!p || p.closest(NIET)) return;
    var r = vertaal(nu);
    if (r !== null && r !== nu) { klaarT.set(node, r); node.nodeValue = r; }
  }
  function attr(el, naam) {
    var nu = el.getAttribute(naam);
    if (nu === null || el.closest(NIET)) return;
    var gedaan = klaarA.get(el) || {};
    if (gedaan[naam] === nu) return;
    var r = vertaal(nu);
    if (r !== null && r !== nu) { gedaan[naam] = r; klaarA.set(el, gedaan); el.setAttribute(naam, r); }
  }
  function element(el) {
    for (var i = 0; i < ATTR.length; i++) if (el.hasAttribute(ATTR[i])) attr(el, ATTR[i]);
  }
  function boom(wortel) {
    if (wortel.nodeType === 3) { tekst(wortel); return; }
    if (wortel.nodeType !== 1) return;
    element(wortel);
    var els = wortel.querySelectorAll("[placeholder],[aria-label],[title],[alt]");
    for (var i = 0; i < els.length; i++) element(els[i]);
    var loop = document.createTreeWalker(wortel, NodeFilter.SHOW_TEXT), t, lijst = [];
    while ((t = loop.nextNode())) lijst.push(t);
    for (var j = 0; j < lijst.length; j++) tekst(lijst[j]);
  }
  function begin() {
    knop();
    document.title = window.ctvVertaal(document.title);
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", window.ctvVertaal(meta.getAttribute("content") || ""));
    boom(document.body);
    new MutationObserver(function (lijst) {
      for (var i = 0; i < lijst.length; i++) {
        var m = lijst[i];
        if (m.type === "characterData") tekst(m.target);
        else if (m.type === "attributes") attr(m.target, m.attributeName);
        else for (var j = 0; j < m.addedNodes.length; j++) boom(m.addedNodes[j]);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
    toon();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin); else begin();
})();
'''
js = KERN.replace("__WOORDEN__", json.dumps(woorden, ensure_ascii=False, separators=(",", ":")))
open(os.path.join(SITE, "taal.js"), "w", encoding="utf-8").write(js)
print("taal.js geschreven:", len(woorden), "teksten,", len(js.encode()) // 1024, "kB")

# ---------- controle: staat elke tekst van de pagina's in de vertalingen? ----------
PATRONEN = [r"^€ [\d.,]+$", r"^\d sterren$"]
class Lezer(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.over = 0; s.uit = []
    def handle_starttag(s, t, a):
        if t in ("script", "style", "svg"): s.over += 1
        d = dict(a)
        for k in ("placeholder", "aria-label", "title", "alt"):
            if d.get(k): s.uit.append(d[k])
        if t == "meta" and d.get("name") == "description" and d.get("content"): s.uit.append(d["content"])
    def handle_endtag(s, t):
        if t in ("script", "style", "svg"): s.over -= 1
    def handle_data(s, d):
        if not s.over and d.strip(): s.uit.append(d)
mist = {}
for f in sorted(glob.glob(os.path.join(SITE, "*.html"))):
    l = Lezer(); l.feed(open(f, encoding="utf-8").read())
    for t in l.uit:
        k = " ".join(t.split())
        if k in woorden or any(re.match(p, k) for p in PATRONEN): continue
        if not re.search(r"[A-Za-zÀ-ÿ]{2}", k) or "@" in k or k.startswith(("©", "Instagram:")): continue
        if k in ("Casa Tinto de Verano", "Your place under the sun", "Punta Prima", "Punta Prima · Costa Blanca", "2026 · 2027"): continue
        mist.setdefault(k, set()).add(os.path.basename(f))
if mist:
    print("\nNog zonder vertaling (blijft Nederlands):")
    for k, v in mist.items(): print("  -", k, " [" + ", ".join(sorted(v)) + "]")
else:
    print("Alle teksten op de pagina's hebben een vertaling.")
