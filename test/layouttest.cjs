/* Prüft das feste Tastenfeld: Plätze, Leerfelder, Seiten, Anordnen, Übertragung. */
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(new URL("../kasse.html", "file://" + __filename).pathname, "utf8");

let fehler = 0, geprueft = 0;
function pruefe(name, ist, soll){
  geprueft++;
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if(!ok){ fehler++; console.log(`  FEHLER  ${name}\n          ist:  ${JSON.stringify(ist)}\n          soll: ${JSON.stringify(soll)}`); }
  else console.log(`  ok      ${name}  ${JSON.stringify(ist)}`);
}

const dom = new JSDOM(html, {
  runScripts:"dangerously", url:"https://kasse.local/", pretendToBeVisual:true,
  beforeParse(w){
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
    w.HTMLCanvasElement.prototype.getContext = () => ({fillStyle:"",fillRect(){}});
    w.URL.createObjectURL = () => "blob:t"; w.URL.revokeObjectURL = () => {};
  }
});
const w = dom.window, d = w.document;
const $ = s => d.querySelector(s);
const klick = el => el.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
const zustand = () => w.eval("data");

// Namen der Tasten in Rasterreihenfolge; leere Felder als null
const feldNamen = () => Array.from($("#grid").children).map(el =>
  el.classList.contains("tile-empty") ? null : el.querySelector(".tile-name").textContent);

function stelleRaster(columns, rows){
  $("#in-columns").value = String(columns);
  $("#in-rows").value  = String(rows);
  $("#in-columns").dispatchEvent(new w.Event("change",{bubbles:true}));
}

setTimeout(()=>{ try{ lauf(); }catch(e){ console.error("Abbruch:", e); process.exit(1); } }, 60);

function lauf(){
  console.log("\n== Voreinstellung: mitwachsend ==");
  pruefe("Rastermodus offen", $("#grid").dataset.layout, undefined);
  pruefe("Kategorienfilter sichtbar", $("#filter-bar").dataset.empty, undefined);
  pruefe("erste Schaltfläche ist 'Alle'", $("#filter-bar button").textContent, "Alle");
  pruefe("Anordnen ausgeblendet", $("#arrange-section").hidden, true);
  pruefe("alle Artikel gezeigt", $("#grid").children.length, 20);

  console.log("\n== Umschalten auf 4 x 4 ==");
  stelleRaster(4,4);
  pruefe("Raster fest", $("#grid").dataset.layout, "fixed");
  pruefe("16 Felder je Seite", $("#grid").children.length, 16);
  pruefe("4 Spalten gesetzt", $("#grid").style.gridTemplateColumns, "repeat(4, 1fr)");
  pruefe("4 Zeilen gesetzt", $("#grid").style.gridTemplateRows, "repeat(4, 1fr)");
  pruefe("Anordnen sichtbar", $("#arrange-section").hidden, false);
  pruefe("gespeicherte Aufteilung", zustand().grid, {columns:4, rows:4});

  console.log("\n== Seiten ==");
  // 20 Artikel auf 16 Plätze -> zwei Seiten
  const seiten = Array.from(d.querySelectorAll("#filter-bar button")).map(b=>b.textContent);
  pruefe("Seitenwahl statt Kategorien", seiten, ["Seite 1","Seite 2"]);
  pruefe("Seite 1 beginnt mit Helles", feldNamen()[0], "Helles 0,5 l");
  klick(d.querySelectorAll("#filter-bar button")[1]);
  const s2 = feldNamen();
  pruefe("Seite 2: 4 belegt, Rest frei", [s2.filter(x=>x).length, s2.filter(x=>x===null).length], [4,12]);
  pruefe("Seite 2 beginnt mit Tee", s2[0], "Tee");   // Kaffee ist Platz 15, letztes Feld von Seite 1
  klick(d.querySelectorAll("#filter-bar button")[0]);

  console.log("\n== Platz bleibt fest ==");
  const vorher = feldNamen();
  // Ein Artikel wird auf den Bon gelegt und wieder entfernt - nichts darf wandern
  klick($("#grid").children[5]);
  klick(d.querySelector("#receipt-lines .receipt-line [data-act='minus']"));
  pruefe("Reihenfolge unverändert", feldNamen(), vorher);

  console.log("\n== Tasten tauschen ==");
  const a0 = feldNamen()[0], a5 = feldNamen()[5];
  w.eval("arrangeTap(0)");
  pruefe("Feld ausgewählt", $("#arrange-grid").children[0].getAttribute("aria-pressed"), "true");
  w.eval("arrangeTap(5)");
  pruefe("Platz 0 hat jetzt den anderen Artikel", feldNamen()[0], a5);
  pruefe("Platz 5 hat den ersten", feldNamen()[5], a0);
  pruefe("Auswahl aufgehoben", $("#arrange-grid").children[0].getAttribute("aria-pressed"), "false");
  // zurücktauschen
  w.eval("arrangeTap(5); arrangeTap(0)");
  pruefe("wieder wie vorher", [feldNamen()[0], feldNamen()[5]], [a0, a5]);

  console.log("\n== Auswahl abwählen ==");
  w.eval("arrangeTap(2)");
  w.eval("arrangeTap(2)");
  pruefe("Auswahl gelöscht", $("#arrange-grid").children[2].getAttribute("aria-pressed"), "false");

  console.log("\n== Auf ein freies Feld verschieben ==");
  klick(d.querySelectorAll("#arrange-pages button")[1]);   // Seite 2 im Anordnen-Bereich
  w.eval("arrangeTap(16)");                               // Tee
  w.eval("arrangeTap(25)");                               // freies Feld
  klick(d.querySelectorAll("#filter-bar button")[1]);        // Kasse auf Seite 2
  const s2b = feldNamen();
  pruefe("alter Platz jetzt leer", s2b[0], null);
  pruefe("Artikel am neuen Platz", s2b[9], "Tee");
  pruefe("Lücke bleibt bestehen", s2b.filter(x=>x===null).length, 12);
  klick(d.querySelectorAll("#filter-bar button")[0]);

  console.log("\n== Leeres Feld lässt sich nicht auswählen ==");
  klick(d.querySelectorAll("#arrange-pages button")[1]);
  w.eval("arrangeTap(16)");                               // ist jetzt leer
  pruefe("keine Auswahl entstanden", w.eval("arrangeSelected"), null);

  console.log("\n== Neuer Artikel bekommt die erste Lücke ==");
  w.switchTab("products");
  $("#in-name").value = "Obstbrand";
  $("#in-price").value = "3,50";
  $("#in-category").value = "Schnaps";
  klick($("#save-product"));
  const neu = zustand().products.find(p=>p.name==="Obstbrand");
  pruefe("Lücke auf Platz 16 gefüllt", neu.slot, 16);

  console.log("\n== Kleineres Raster: Artikel bleiben erhalten ==");
  stelleRaster(3,3);
  pruefe("9 Felder", $("#grid").children.length, 9);
  pruefe("mehr Seiten", d.querySelectorAll("#filter-bar button").length, 3);
  pruefe("kein Artikel verloren", zustand().products.length, 21);

  console.log("\n== Zurück auf mitwachsend ==");
  stelleRaster(0,4);
  pruefe("Raster wieder offen", $("#grid").dataset.layout, undefined);
  pruefe("Kategorien zurück", $("#filter-bar button").textContent, "Alle");
  pruefe("Anordnen wieder versteckt", $("#arrange-section").hidden, true);
  pruefe("alle Artikel sichtbar", $("#grid").children.length, 21);
  pruefe("Zeilenwahl gesperrt", $("#in-rows").disabled, true);

  console.log("\n== Übertragung trägt das Layout mit ==");
  stelleRaster(5,3);
  const text = w.configText();
  pruefe("Kopf HK2", text.split("\n")[0], "HK2");
  pruefe("Aufteilung in Zeile 3", text.split("\n")[2], "5x3");
  const gelesen = w.parseConfig(text);
  pruefe("Aufteilung zurückgelesen", gelesen.grid, {columns:5, rows:3});
  pruefe("Plätze zurückgelesen",
    gelesen.products.map(p=>p.slot).slice(0,5), [0,1,2,3,4]);
  pruefe("Lücke erhalten", gelesen.products.some(p=>p.slot===25), true);

  console.log("\n== Altes HK1-Format bleibt lesbar ==");
  const alt = "HK1\nAltes Tablet\nBier 0,5\t450\tBier\t0\nWein\t400\tWein\t1";
  const altGelesen = w.parseConfig(alt);
  pruefe("HK1 angenommen", altGelesen !== null, true);
  pruefe("ohne Aufteilung", altGelesen.grid, null);
  pruefe("Plätze der Reihe nach", altGelesen.products.map(p=>p.slot), [0,1]);

  console.log("\n== Fehlerhafte Aufteilung wird abgewiesen ==");
  [["kaputte Zeile","HK2\nX\nvierxvier\nBier\t450\tBier\t0\t0"],
   ["zu viele Spalten","HK2\nX\n99x4\nBier\t450\tBier\t0\t0"],
   ["null Zeilen","HK2\nX\n4x0\nBier\t450\tBier\t0\t0"]]
   .forEach(([n,t]) => pruefe(n, w.parseConfig(t), null));

  console.log("\n== Artikelliste im festen Modus ==");
  stelleRaster(4,4);
  w.switchTab("products");
  const zeile1 = d.querySelector("#product-list .list-row");
  pruefe("keine Pfeiltasten", zeile1.querySelectorAll("[data-act=up],[data-act=down]").length, 0);
  pruefe("Platz angezeigt", /Seite 1, Feld 1$/.test(zeile1.querySelector("small").textContent), true);
  stelleRaster(0,4);
  const zeile2 = d.querySelector("#product-list .list-row");
  pruefe("Pfeiltasten zurück", zeile2.querySelectorAll("[data-act=up],[data-act=down]").length, 2);

  console.log(`\n===== ${geprueft - fehler}/${geprueft} Prüfungen bestanden =====`);
  process.exit(fehler ? 1 : 0);
}
