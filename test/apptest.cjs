/* End-to-End-Test der Kasse: lädt die echte Datei und bedient sie über das DOM. */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(new URL("../kasse.html", "file://" + __filename).pathname, "utf8");

let fehler = 0, geprueft = 0;
const norm = v => typeof v === "string" ? v.replace(/\u00A0/g, " ") : v;
function pruefe(name, ist, soll){
  geprueft++;
  const ok = JSON.stringify(norm(ist)) === JSON.stringify(norm(soll));
  if(!ok){ fehler++; console.log(`  FEHLER  ${name}\n          ist:  ${JSON.stringify(ist)}\n          soll: ${JSON.stringify(soll)}`); }
  else console.log(`  ok      ${name}  ${JSON.stringify(ist)}`);
}

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://kasse.local/",
  pretendToBeVisual: true,
  beforeParse(w){
    w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    // Canvas wird nur für den QR-Code gebraucht; hier genügt eine Attrappe
    w.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle:"", fillRect(){} });
    w.URL.createObjectURL = () => "blob:test";
    w.URL.revokeObjectURL = () => {};
  }
});
const w = dom.window, d = w.document;
const $ = s => d.querySelector(s);
const klick = el => el.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));

// Heruntergeladene Dateien abfangen, statt sie zu speichern
const dateien = [];
const echtesAnhaengen = w.HTMLElement.prototype.click;
w.HTMLAnchorElement.prototype.click = function(){ dateien.push({name:this.download}); };
// Blob-Inhalte mitschneiden
const EchtBlob = w.Blob;
let letzterBlob = null;
w.Blob = class extends EchtBlob {
  constructor(teile, opt){ super(teile, opt); letzterBlob = String(teile[0]); }
};

setTimeout(() => {
  try{ lauf(); }
  catch(e){ console.error("Testabbruch:", e); process.exit(1); }
}, 60);

const zustand = () => w.eval("data");
function artikelKnopf(name){
  return Array.from(d.querySelectorAll("#grid .tile"))
    .find(b => b.querySelector(".tile-name").textContent === name);
}
function ziffern(text){
  const knoepfe = Array.from(d.querySelectorAll("#keypad button"));
  for(const z of text) klick(knoepfe.find(b => b.textContent === z));
}

function lauf(){
  console.log("\n== Grundzustand ==");
  pruefe("Standardsortiment geladen", d.querySelectorAll("#grid .tile").length, 20);
  pruefe("Bon leer", $("#receipt-total").textContent, "0,00 €");
  pruefe("Kassieren gesperrt", $("#checkout").disabled, true);

  console.log("\n== Bon zusammenstellen ==");
  klick(artikelKnopf("Helles 0,5 l"));
  klick(artikelKnopf("Helles 0,5 l"));
  klick(artikelKnopf("Cola 0,33 l"));
  pruefe("Summe 2x4,50 + 3,00", $("#receipt-total").textContent, "12,00 €");
  pruefe("Stückzahl", $("#receipt-count").textContent, "3 Artikel");
  pruefe("Zähler auf der Taste", artikelKnopf("Helles 0,5 l").querySelector(".tile-count").textContent, "2");

  // Menge über die Bonzeile verringern
  const minus = d.querySelector("#receipt-lines .receipt-line [data-act='minus']");
  klick(minus);
  pruefe("nach Minus", $("#receipt-total").textContent, "7,50 €");
  klick(d.querySelector("#receipt-lines .receipt-line [data-act='plus']"));
  pruefe("nach Plus", $("#receipt-total").textContent, "12,00 €");

  console.log("\n== Negativer Preis (Pfandrückgabe) ==");
  klick(artikelKnopf("Pfand zurück"));
  pruefe("Pfand abgezogen", $("#receipt-total").textContent, "10,00 €");
  klick(d.querySelectorAll("#receipt-lines .receipt-line [data-act='minus']")[2]);
  pruefe("Pfand entfernt", $("#receipt-total").textContent, "12,00 €");

  console.log("\n== Kassieren mit Wechselgeld ==");
  klick($("#checkout"));
  pruefe("Dialog offen", $("#dlg-checkout").dataset.open, "yes");
  pruefe("zu zahlen", $("#due-amount").textContent, "12,00 €");
  ziffern("2000");
  pruefe("gegeben", $("#tendered-amount").textContent, "20,00 €");
  pruefe("Rückgeld", $("#change-amount").textContent, "8,00 €");
  pruefe("Stückelung",
    Array.from(d.querySelectorAll("#change-breakdown span")).map(s=>norm(s.textContent)),
    ["1x 5 €","1x 2 €","1x 1 €"]);
  pruefe("Trinkgeld angeboten", $("#tip-toggle").dataset.show, "yes");
  klick($("#pay-cash"));
  pruefe("Bon geleert", $("#receipt-total").textContent, "0,00 €");
  pruefe("eine Buchung", zustand().sales.length, 1);
  pruefe("Buchungssumme", zustand().sales[0].totalCents, 1200);
  pruefe("Rückgeld gebucht", zustand().sales[0].changeCents, 800);
  pruefe("kein Trinkgeld", zustand().sales[0].tipCents, 0);

  console.log("\n== Zu wenig Geld gegeben ==");
  klick(artikelKnopf("Weißbier 0,5 l"));           // 4,80
  klick($("#checkout"));
  ziffern("200");
  pruefe("Fehlbetrag angezeigt", $("#change-caption").textContent, "Es fehlen noch");
  pruefe("Fehlbetrag", $("#change-amount").textContent, "2,80 €");
  pruefe("Abschluss gesperrt", $("#pay-cash").disabled, true);
  pruefe("kein Trinkgeld möglich", $("#tip-toggle").dataset.show, "no");
  klick($("#pay-cash"));
  pruefe("nicht gebucht", zustand().sales.length, 1);

  console.log("\n== Trinkgeld ==");
  for(let i=0;i<3;i++) klick([...d.querySelectorAll("#keypad button")].find(b=>b.textContent==="Korr"));  // löschen
  ziffern("500");
  pruefe("Rückgeld vor Trinkgeld", $("#change-amount").textContent, "0,20 €");
  klick($("#tip-toggle"));
  pruefe("Trinkgeld aktiv", $("#change-panel").dataset.tip, "yes");
  pruefe("nichts zurück", $("#change-caption").textContent, "Trinkgeld, nichts zurück");
  pruefe("keine Stückelung", d.querySelectorAll("#change-breakdown span").length, 0);
  klick($("#pay-cash"));
  const b2 = zustand().sales[1];
  pruefe("Warenwert ohne Trinkgeld", b2.totalCents, 480);
  pruefe("Trinkgeld gebucht", b2.tipCents, 20);
  pruefe("Rückgeld null", b2.changeCents, 0);

  console.log("\n== Kartenzahlung ==");
  klick(artikelKnopf("Kaffee"));                    // 2,50
  klick($("#checkout"));
  klick($("#pay-card"));
  pruefe("drei Buchungen", zustand().sales.length, 3);
  pruefe("Zahlart Karte", zustand().sales[2].payment, "card");
  pruefe("Karte ohne Rückgeld", zustand().sales[2].changeCents, 0);

  console.log("\n== Schnellwahl 'Passend' ==");
  klick(artikelKnopf("Wasser 0,5 l"));              // 2,50
  klick($("#checkout"));
  const passend = d.querySelector("#quick-amounts button[data-exact='yes']");
  pruefe("Passend-Taste da", passend.textContent, "Passend");
  klick(passend);
  pruefe("Rückgeld null", $("#change-amount").textContent, "0,00 €");
  klick($("#pay-cash"));
  pruefe("vier Buchungen", zustand().sales.length, 4);

  console.log("\n== Tagesbericht ==");
  w.switchTab("report");
  const kz = {};
  d.querySelectorAll("#stats .stat").forEach(k=>{
    kz[k.querySelector(".stat-label").textContent] = norm(k.querySelector(".stat-value").textContent);
  });
  // 12,00 + 4,80 + 2,50 + 2,50 = 21,80 Waren; Trinkgeld 0,20 extra
  pruefe("Umsatz ohne Trinkgeld", kz["Umsatz"], "21,80 €");
  pruefe("Trinkgeld ausgewiesen", kz["Trinkgeld"], "0,20 €");
  pruefe("Bar", kz["Bar"], "19,30 €");
  pruefe("Karte", kz["Karte"], "2,50 €");
  pruefe("Bonanzahl", kz["Bons"], "4");
  pruefe("Soll ohne Anfangsbestand", kz["Soll in der Kasse"], "19,50 €");

  // Wechselgeld zu Beginn setzen
  $("#in-float").value = "150";
  $("#in-float").dispatchEvent(new w.Event("change", {bubbles:true}));
  const kz2 = {};
  d.querySelectorAll("#stats .stat").forEach(k=>{
    kz2[k.querySelector(".stat-label").textContent] = norm(k.querySelector(".stat-value").textContent);
  });
  pruefe("Soll mit 150 € Anfangsbestand", kz2["Soll in der Kasse"], "169,50 €");

  console.log("\n== Storno ==");
  const stornoKnopf = Array.from(d.querySelectorAll("#table-sales button"))
    .find(b => b.textContent === "Stornieren");
  klick(stornoKnopf);
  pruefe("Rückfrage offen", $("#dlg-confirm").dataset.open, "yes");
  klick($("#confirm-yes"));
  // Rückfrage läuft über ein Promise, daher kurz warten
  setTimeout(()=>{
    const kz3 = {};
    d.querySelectorAll("#stats .stat").forEach(k=>{
      kz3[k.querySelector(".stat-label").textContent] = norm(k.querySelector(".stat-value").textContent);
    });
    // Der jüngste Bon (Wasser 2,50) wurde storniert
    pruefe("Umsatz nach Storno", kz3["Umsatz"], "19,30 €");
    pruefe("Bons nach Storno", kz3["Bons"], "3");
    pruefe("Buchung als storniert markiert", zustand().sales[3].voided, true);

    console.log("\n== CSV-Export ==");
    klick($("#export-report"));
    const csv = letzterBlob;
    pruefe("BOM für Excel", csv.charCodeAt(0), 0xFEFF);
    pruefe("Semikolon als Trenner", csv.includes("Umsatz gesamt;19,30"), true);
    pruefe("Trinkgeld in der CSV", csv.includes("Trinkgeld gesamt;0,20"), true);
    pruefe("Soll-Bestand in der CSV (nach Storno)", csv.includes("Soll-Bestand Kasse;167,00"), true);
    pruefe("Storno vermerkt", csv.includes(";ja;"), true);
    pruefe("Umlaut erhalten", csv.includes("Weißbier"), true);

    klick($("#export-items"));
    const posten = letzterBlob;
    pruefe("Postenkopf", posten.includes("Datum;Zeit;Bon-Nr;Artikel"), true);
    pruefe("Zeilensumme 2x4,50", posten.includes("Helles 0,5 l;2;4,50;9,00"), true);

    console.log("\n== Speicherung ==");
    const haupt = w.localStorage.getItem("knyl.pos.v1");
    const spiegel = w.localStorage.getItem("knyl.pos.v1.mirror");
    pruefe("Hauptspeicher beschrieben", haupt !== null, true);
    pruefe("Spiegel beschrieben", spiegel !== null, true);
    pruefe("beide gleich", haupt === spiegel, true);
    const huelle = JSON.parse(haupt);
    pruefe("Prüfsumme vorhanden", typeof huelle.checksum, "number");
    pruefe("Buchungen gespeichert", huelle.state.sales.length, 4);

    console.log("\n== Konfigurationsübertragung ==");
    const text = w.configText();
    pruefe("Kopfzeile", text.split("\n")[0], "HK2");
    const gelesen = w.parseConfig(text);
    pruefe("alle Artikel zurückgelesen", gelesen.products.length, 20);
    pruefe("Preis erhalten", gelesen.products[0].priceCents, 450);
    pruefe("negativer Preis erhalten",
      gelesen.products.find(p=>p.name==="Pfand zurück").priceCents, -200);
    const teile = w.splitParts(text);
    pruefe("in Teile zerlegt", teile.length >= 1, true);
    const zurueck = teile.map(t=>w.parsePart(t)).sort((a,b)=>a.num-b.num).map(t=>t.content).join("\n");
    pruefe("Teile ergeben das Original", zurueck === text, true);

    console.log("\n== Artikelverwaltung ==");
    w.switchTab("products");
    $("#in-name").value = "Radler alkoholfrei";
    $("#in-price").value = "4,20";
    $("#in-category").value = "Bier";
    klick($("#save-product"));
    pruefe("Artikel angelegt", zustand().products.length, 21);
    pruefe("Komma als Dezimaltrenner",
      zustand().products.find(p=>p.name==="Radler alkoholfrei").priceCents, 420);

    $("#in-name").value = "";
    $("#in-price").value = "3,00";
    klick($("#save-product"));
    pruefe("Artikel ohne Namen abgelehnt", zustand().products.length, 21);

    const schreibweisen = [["Punktpreis","3.80",380],["Ganzzahl","5",500],
                           ["negativ","-2,50",-250],["mit Euro","2,20 €",220]];
    let n = 21;
    schreibweisen.forEach(([bez,eingabe,soll])=>{
      $("#in-name").value = "Test " + bez;
      $("#in-price").value = eingabe;
      $("#in-category").value = "Test";
      klick($("#save-product"));
      n++;
      const p = zustand().products.find(x=>x.name==="Test "+bez);
      pruefe("Preis \"" + eingabe + "\"", p ? p.priceCents : null, soll);
    });
    $("#in-name").value = "Unfug";
    $("#in-price").value = "abc";
    klick($("#save-product"));
    pruefe("unsinniger Preis abgelehnt", zustand().products.length, n);

    console.log(`\n===== ${geprueft - fehler}/${geprueft} Prüfungen bestanden =====`);
    const konsole = fehlerMeldungen.length;
    if(konsole) console.log("Konsolenfehler:", fehlerMeldungen);
    process.exit(fehler || konsole ? 1 : 0);
  }, 30);
}

const fehlerMeldungen = [];
dom.virtualConsole.on("jsdomError", e => fehlerMeldungen.push(e.message));
dom.virtualConsole.on("error", (...a) => fehlerMeldungen.push(a.join(" ")));
