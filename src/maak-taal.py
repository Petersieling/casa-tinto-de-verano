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
    if len(blok) != 2: sys.exit("Blok heeft geen twee regels: " + repr(blok))
    if blok[0] in woorden: sys.exit("Dubbel: " + blok[0])
    woorden[blok[0]] = blok[1]
for regel in open(os.path.join(HIER, "vertalingen.txt"), encoding="utf-8").read().split("\n"):
    r = regel.rstrip()
    if r.lstrip().startswith("#"): continue
    if not r.strip():
        sluit(); blok = []
    else:
        blok.append(" ".join(r.split()) if not r.startswith(".") else r.strip())
sluit()

for nl, en in [("ma", "Mo"), ("di", "Tu"), ("wo", "We"), ("do", "Th"), ("vr", "Fr"), ("za", "Sa"), ("zo", "Su")]:
    woorden[nl] = en

# ---------- taal.js schrijven ----------
KERN = r'''/* Taalkeuze voor de website: Nederlands en Engels.
   Dit bestand wordt gemaakt door src/maak-taal.py uit src/vertalingen.txt. Pas het niet met de hand aan. */
(function () {
  var TALEN = { nl: "nl-NL", en: "en-GB" };
  var taal = null;
  // Een link met ?lang=en (bijvoorbeeld uit een Engelse mail) kiest de taal en onthoudt die.
  var uitUrl = (location.search.match(/[?&]lang=(nl|en)\b/) || [])[1];
  if (uitUrl) { taal = uitUrl; try { localStorage.setItem("ctv_taal", taal); } catch (e) {} }
  if (!taal) try { taal = localStorage.getItem("ctv_taal"); } catch (e) {}
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
  function mv(aantal, een, meer) { return aantal + " " + (+aantal === 1 ? een : meer); }
  // Teksten met een getal of datum erin. Elke regel: patroon en Engels.
  var P = [
    [/^€ (\d+),(\d+) per kWh$/, "€$1.$2 per kWh"],
    [/^€ ([\d.,]+)$/, "€$1"],
    [/^(\d) sterren$/, "$1 stars"],
    [/^(\d) van 5 sterren$/, "$1 out of 5 stars"],
    [/^Beoordeling: (\d),(\d) van 5 sterren uit (\d+) beoordeling(?:en)?\. Naar het gastenboek\.$/,
      function (m, a, b, c) { return "Rating: " + a + "." + b + " out of 5 stars from " + mv(c, "review", "reviews") + ". Go to the guestbook."; }],
    [/^(\d),(\d) uit (\d+) beoordeling(?:en)?$/, function (m, a, b, c) { return a + "." + b + " from " + mv(c, "review", "reviews"); }],
    [/^gemiddeld uit (\d+) beoordeling(?:en)?$/, function (m, c) { return "average from " + mv(c, "review", "reviews"); }],
    [/^Aankomst op (.+)\. Tik nu op je vertrekdag, minimaal (\d+) nachten later\.$/, "Arrival on $1. Now tap your departure day, at least $2 nights later."],
    [/^Dit kan niet: je koos (\d+) nacht(?:en)?\. Een verblijf is alleen mogelijk vanaf (\d+) nachten\. Tik op een latere vertrekdag\.$/,
      function (m, a, b) { return "This is not possible: you chose " + mv(a, "night", "nights") + ". A stay is only possible from " + b + " nights. Tap a later departure day."; }],
    [/^Dit kan niet: je koos (\d+) nachten\. Een verblijf is alleen mogelijk vanaf (\d+) nachten\.$/,
      function (m, a, b) { return "This is not possible: you chose " + mv(a, "night", "nights") + ". A stay is only possible from " + b + " nights."; }],
    [/^Huur \((\d+) nachten\)$/, "Rent ($1 nights)"],
    [/^([\d.,]+) kWh inbegrepen$/, "$1 kWh included"],
    [/^Kies (.+ \d{4})$/, "Choose $1"],
    [/^Kind (\d)$/, "Child $1"],
    [/^Kies de leeftijd van kind (\d)\.$/, "Please choose the age of child $1."],
    [/^1 jaar$/, "1 year"],
    [/^(\d+) jaar$/, "$1 years"],
    [/^Het penthouse is voor maximaal (\d+) personen\.$/, "The penthouse is for a maximum of $1 guests."],
    [/^Het penthouse is voor maximaal (\d+) personen, kinderen meegerekend\. Kies minder volwassenen of kinderen\.$/, "The penthouse is for a maximum of $1 guests, including children. Please choose fewer adults or children."],
    [/^Vul de leeftijd van kind (\d) in \(0 tot en met 17 jaar\)\.$/, "Please enter the age of child $1 (0 to 17)."],
    [/^Vul je aankomst- en vertrekdatum in als dag-maand-jaar, bijvoorbeeld 04-07-2027\. Het minimale verblijf is (\d+) nachten\.$/,
      "Enter your arrival and departure dates as day-month-year, for example 04-07-2027. The minimum stay is $1 nights."],
    [/^Het minimale verblijf is (\d+) nachten\.$/, "The minimum stay is $1 nights."],
    [/^Gast (\d+)$/, "Guest $1"],
    [/^Vul de voor- en achternaam van gast (\d+) in\.$/, "Please enter the first and last name of guest $1."],
    [/^Kies het geslacht van gast (\d+)\.$/, "Please choose the sex of guest $1."],
    [/^Vul een geldige geboortedatum in voor gast (\d+)\.$/, "Please enter a valid date of birth for guest $1."],
    [/^Kies de nationaliteit van gast (\d+)\.$/, "Please choose the nationality of guest $1."],
    [/^Vul het soort document en het documentnummer van gast (\d+) in\.$/, "Please enter the document type and document number of guest $1."],
    [/^Kies wat gast (\d+) is van gast 1 \(bijvoorbeeld kind of kleinkind\)\.$/, "Please choose how guest $1 is related to guest 1 (for example child or grandchild)."],
    [/^Vul het woonadres van gast (\d+) in\.$/, "Please enter the home address of guest $1."],
    [/^Vul de gegevens van alle (\d+) gasten in\.$/, "Please enter the details of all $1 guests."],
    [/^Fijn dat je komt! De Spaanse wet verplicht ons de gegevens van iedereen die in het penthouse verblijft door te geven aan de overheid\. Vul ze hieronder in voor alle (\d+) gasten, uiterlijk (\d+) dagen voor aankomst\.$/,
      "We are glad you are coming! Spanish law requires us to report the details of everyone staying in the penthouse to the authorities. Please fill them in below for all $1 guests, no later than $2 days before arrival."],
    [/^Gasten: (.+)\.$/, "Guests: $1."],
    [/^(\d{1,2}) (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december) (\d{4})( t\/m (\d{1,2}) (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december) (\d{4}))?$/,
      function (m, d1, m1, j1, rest, d2, m2, j2) { var M = { januari: "January", februari: "February", maart: "March", april: "April", mei: "May", juni: "June", juli: "July", augustus: "August", september: "September", oktober: "October", november: "November", december: "December" };
        return d1 + " " + M[m1] + " " + j1 + (rest ? " to " + d2 + " " + M[m2] + " " + j2 : ""); }]
  ];

  function vertaal(s) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), k = m[2].replace(/\s+/g, " ");
    if (!k) return null;
    var r = Object.prototype.hasOwnProperty.call(W, k) ? W[k] : null;
    if (r === null) for (var i = 0; i < P.length; i++) if (P[i][0].test(k)) { r = k.replace(P[i][0], P[i][1]); break; }
    return r === null ? null : m[1] + r + m[3];
  }
  window.ctvVertaal = function (s) { var r = taal === "nl" ? null : vertaal(s); return r === null ? s : r; };

  // ---------- taalknop: NL | EN rechts in de menubalk; op de telefoon onderaan in het uitklapmenu ----------
  function knop() {
    var nav = document.querySelector("header.top nav");
    if (!nav || nav.querySelector(".taal")) return;
    var stijl = document.createElement("style");
    stijl.textContent =
      ".top nav .taal { display: inline-flex; align-items: center; gap: .1rem; margin-left: .5rem; font-size: .85rem; letter-spacing: .08em; }" +
      ".top nav .taal a { color: var(--muted); padding: .15rem .3rem; border-bottom: 1px solid transparent; }" +
      ".top nav .taal a[aria-current] { color: var(--ink); font-weight: 600; border-bottom-color: var(--gold); }" +
      ".top nav .taal i { color: var(--line); font-style: normal; }" +
      ".top nav .taal span { display: none; }" +
      "@media (max-width: 66rem) { .top nav .taal { margin-left: 0; padding: .75rem 0; border-top: 1px solid var(--line); gap: .35rem; font-size: 1rem; letter-spacing: 0; }" +
      "  .top nav .taal span { display: inline; color: var(--muted); margin-right: .4rem; } .top nav .taal a { border-top: 0 !important; padding: .1rem .35rem !important; } }";
    document.head.appendChild(stijl);
    var blok = document.createElement("div");
    blok.className = "taal"; blok.setAttribute("data-nt", "");
    var label = document.createElement("span"); label.textContent = taal === "en" ? "Language" : "Taal";
    blok.appendChild(label);
    [["nl", "NL", "Nederlands"], ["en", "EN", "English"]].forEach(function (t, i) {
      if (i) { var s = document.createElement("i"); s.textContent = "|"; s.setAttribute("aria-hidden", "true"); blok.appendChild(s); }
      var a = document.createElement("a"); a.href = "#"; a.textContent = t[1]; a.lang = t[0]; a.title = t[2]; a.setAttribute("aria-label", t[2]);
      if (t[0] === taal) a.setAttribute("aria-current", "true");
      a.addEventListener("click", function (e) {
        e.preventDefault();
        try { localStorage.setItem("ctv_taal", t[0]); } catch (er) {}
        var u = new URL(location.href); u.searchParams.delete("lang"); location.replace(u.href);
      });
      blok.appendChild(a);
    });
    nav.appendChild(blok);
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
    if os.path.basename(f) in ("gasten.html",): pass
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
