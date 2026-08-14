/* Klickt die Reiter so an, wie ein Mensch es tut.
   Die übrigen Suiten rufen switchTab() direkt auf und haben deshalb nicht
   gemerkt, dass eine Schaltfläche auf eine Ansicht zeigte, die es nicht gibt:
   der Reiter wurde markiert, der Inhalt blieb leer. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "kasse.html"), "utf8");

let fehler = 0, geprueft = 0;
function pruefe(name, ist, soll){
  geprueft++;
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if(!ok){ fehler++; console.log(`  FEHLER  ${name}\n          ist:  ${JSON.stringify(ist)}\n          soll: ${JSON.stringify(soll)}`); }
  else console.log(`  ok      ${name}  ${JSON.stringify(ist)}`);
}

const dom = new JSDOM(html, {
  runScripts:"dangerously", url:"https://kasse.test/", pretendToBeVisual:true,
  beforeParse(w){
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
    w.HTMLCanvasElement.prototype.getContext = () => ({fillStyle:"",fillRect(){}});
    w.URL.createObjectURL = () => "blob:t"; w.URL.revokeObjectURL = () => {};
    w.Element.prototype.scrollIntoView = function(){};
  }
});
const w = dom.window, d = w.document;
const $ = s => d.querySelector(s);
const klick = el => el.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));

const sichtbar = () => [...d.querySelectorAll(".view")]
  .filter(v => v.dataset.active === "yes").map(v => v.id);

setTimeout(() => {
  const reiter = [...d.querySelectorAll(".tabs button")];

  console.log("\n== Jedes Reiterziel hat eine Ansicht ==");
  reiter.forEach(b => {
    const ziel = b.dataset.target;
    pruefe(`"${b.textContent}" zeigt auf view-${ziel}`, !!d.getElementById("view-" + ziel), true);
  });

  console.log("\n== Anklicken zeigt genau eine Ansicht ==");
  reiter.forEach(b => {
    klick(b);
    pruefe(`Klick auf "${b.textContent}"`, sichtbar(), ["view-" + b.dataset.target]);
    pruefe(`"${b.textContent}" ist markiert`, b.getAttribute("aria-selected"), "true");
    const andere = reiter.filter(x => x !== b).map(x => x.getAttribute("aria-selected"));
    pruefe(`übrige Reiter nicht markiert`, [...new Set(andere)], ["false"]);
  });

  console.log("\n== Inhalt ist wirklich da ==");
  klick(reiter.find(b => b.textContent === "Artikel"));
  pruefe("Formular vorhanden", !!$("#view-products #in-name"), true);
  pruefe("Sortimentsliste gefüllt",
    d.querySelectorAll("#product-list .list-row").length, 20);

  klick(reiter.find(b => b.textContent === "Einstellungen"));
  pruefe("Einstellungen gefüllt", !!$("#view-settings #in-business"), true);

  console.log("\n== Bericht wird beim Wechsel aufgefrischt ==");
  // Erst kassieren, dann auf den Bericht wechseln: die Zahlen muessen stimmen.
  klick(reiter.find(b => b.textContent === "Kasse"));
  klick(d.querySelectorAll("#grid .tile")[0]);            // Helles 4,50
  klick($("#checkout"));
  klick($("#quick-amounts button[data-exact='yes']"));
  klick($("#pay-cash"));
  klick(reiter.find(b => b.textContent === "Bericht"));
  const werte = {};
  d.querySelectorAll("#stats .stat").forEach(k => {
    werte[k.querySelector(".stat-label").textContent] =
      k.querySelector(".stat-value").textContent.replace(/ /g, " ");
  });
  pruefe("Umsatz aktuell", werte["Umsatz"], "4,50 €");
  pruefe("Bonzahl aktuell", werte["Bons"], "1");

  console.log(`\n===== ${geprueft - fehler}/${geprueft} Prüfungen bestanden =====`);
  process.exit(fehler ? 1 : 0);
}, 80);
