/* Prüft, ob die Kasse einen beschädigten Speicherstand übersteht. */
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(new URL("../kasse.html", "file://" + __filename).pathname, "utf8");

let fehler = 0, geprueft = 0;
function pruefe(name, ist, soll){
  geprueft++;
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if(!ok){ fehler++; console.log(`  FEHLER  ${name}: ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`); }
  else console.log(`  ok      ${name}  ${JSON.stringify(ist)}`);
}

/* Startet die Kasse mit vorgegebenem Speicherinhalt und liefert den geladenen Stand. */
function starte(vorbelegung){
  return new Promise(res => {
    const dom = new JSDOM(html, {
      runScripts:"dangerously", url:"https://kasse.local/", pretendToBeVisual:true,
      beforeParse(w){
        w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
        w.HTMLCanvasElement.prototype.getContext = () => ({fillStyle:"",fillRect(){}});
        w.URL.createObjectURL = () => "blob:t"; w.URL.revokeObjectURL = () => {};
        for(const [k,v] of Object.entries(vorbelegung)) w.localStorage.setItem(k, v);
      }
    });
    setTimeout(()=>res({w:dom.window, stand:dom.window.eval("data")}), 60);
  });
}

/* Baut einen gültigen Speicherstand mit n Buchungen, so wie die Kasse ihn schreibt. */
function paket(n, kaputtMachen){
  const stand = {
    businessName:"Testhütte", theme:"night", openingFloat:{}, lastBackup:0,
    grid:{columns:0, rows:4},
    products:[{id:"p0",name:"Bier",priceCents:450,category:"Bier",
               color:"var(--enamel-amber)",sort:0,slot:0}],
    sales: Array.from({length:n},(_,i)=>({
      id:"b"+i, ts:Date.now(),
      items:[{productId:"p0",name:"Bier",priceCents:450,qty:1}],
      totalCents:450, payment:"cash", tenderedCents:500,
      tipCents:0, changeCents:50, voided:false
    }))
  };
  // Prüfsumme genau wie in der App
  let h = 2166136261;
  const misch = x => { h ^= x; h = Math.imul(h, 16777619); };
  misch(stand.products.length); misch(stand.sales.length);
  for(const b of stand.sales){ misch(b.totalCents|0); misch((b.tipCents|0)+1); misch(b.voided?7:3); }
  for(const p of stand.products) misch(p.priceCents|0);
  const huelle = {state:stand, checksum:h>>>0, time:Date.now()};
  if(kaputtMachen === "verstuemmelt") return JSON.stringify(huelle).slice(0, 120);
  if(kaputtMachen === "pruefsumme")   { huelle.checksum = 12345; return JSON.stringify(huelle); }
  return JSON.stringify(huelle);
}

/* Ein Speicherstand aus der Fassung vor der Umbenennung. */
function altesPaket(n){
  const stand = {
    betrieb:"Alte Hütte", modus:"tag", wechselgeld:{"2026-08-14":15000}, letzteSicherung:0,
    raster:{spalten:4, zeilen:4},
    produkte:[{id:"p0",name:"Bier",preisCent:450,kategorie:"Bier",
               farbe:"var(--emaille-bernstein)",sort:0,platz:0}],
    buchungen: Array.from({length:n},(_,i)=>({
      id:"b"+i, ts:Date.now(),
      positionen:[{produktId:"p0",name:"Bier",preisCent:450,menge:2}],
      summeCent:900, zahlart:"karte", gegebenCent:900,
      trinkgeldCent:50, rueckgeldCent:0, storniert:false
    }))
  };
  return JSON.stringify({state:stand, checksum:1, time:Date.now()});
}

(async () => {
  console.log("\n== Frischer Start ohne Speicher ==");
  let r = await starte({});
  pruefe("Standardsortiment", r.stand.products.length, 20);
  pruefe("keine Buchungen", r.stand.sales.length, 0);

  console.log("\n== Normaler Speicherstand ==");
  r = await starte({"knyl.pos.v1": paket(7), "knyl.pos.v1.mirror": paket(7)});
  pruefe("Buchungen geladen", r.stand.sales.length, 7);
  pruefe("Kassenname geladen", r.stand.businessName, "Testhütte");

  console.log("\n== Hauptspeicher abgeschnitten, Spiegel heil ==");
  r = await starte({"knyl.pos.v1": paket(9,"verstuemmelt"), "knyl.pos.v1.mirror": paket(9)});
  pruefe("aus dem Spiegel gerettet", r.stand.sales.length, 9);

  console.log("\n== Hauptspeicher mit falscher Prüfsumme, Spiegel heil ==");
  r = await starte({"knyl.pos.v1": paket(4,"pruefsumme"), "knyl.pos.v1.mirror": paket(4)});
  pruefe("heile Kopie bevorzugt", r.stand.sales.length, 4);

  console.log("\n== Beide beschädigt ==");
  r = await starte({"knyl.pos.v1": paket(3,"pruefsumme"), "knyl.pos.v1.mirror": paket(3,"pruefsumme")});
  pruefe("Daten trotzdem gerettet statt verworfen", r.stand.sales.length, 3);

  console.log("\n== Völlig unlesbar ==");
  r = await starte({"knyl.pos.v1": "kein json {{{", "knyl.pos.v1.mirror": "auch nicht"});
  pruefe("sauberer Neustart", r.stand.sales.length, 0);
  pruefe("Sortiment trotzdem da", r.stand.products.length, 20);

  console.log("\n== Altes Format ohne Hülle ==");
  const alt = JSON.parse(paket(5)).state;
  r = await starte({"knyl.pos.v1": JSON.stringify(alt)});
  pruefe("alter Stand übernommen", r.stand.sales.length, 5);

  console.log("\n== Buchung überlebt einen Neustart ==");
  const erste = await starte({});
  const dw = erste.w.document;
  dw.querySelectorAll("#grid .tile")[0].dispatchEvent(new erste.w.MouseEvent("click",{bubbles:true}));
  dw.querySelector("#checkout").dispatchEvent(new erste.w.MouseEvent("click",{bubbles:true}));
  dw.querySelector("#quick-amounts button[data-exact='yes']").dispatchEvent(new erste.w.MouseEvent("click",{bubbles:true}));
  dw.querySelector("#pay-cash").dispatchEvent(new erste.w.MouseEvent("click",{bubbles:true}));
  const gesichert = {
    "knyl.pos.v1": erste.w.localStorage.getItem("knyl.pos.v1"),
    "knyl.pos.v1.mirror": erste.w.localStorage.getItem("knyl.pos.v1.mirror")
  };
  const zweite = await starte(gesichert);
  pruefe("Bon nach Neustart noch da", zweite.stand.sales.length, 1);
  pruefe("Betrag unverändert", zweite.stand.sales[0].totalCents, 450);

  console.log("\n== Speicherstand der alten Fassung ==");
  r = await starte({"huettenkasse.v1": altesPaket(3)});
  pruefe("Buchungen uebernommen", r.stand.sales.length, 3);
  pruefe("Kassenname uebernommen", r.stand.businessName, "Alte Hütte");
  pruefe("Tagansicht uebernommen", r.stand.theme, "day");
  pruefe("Tastenfeld uebernommen", r.stand.grid, {columns:4, rows:4});
  pruefe("Wechselgeld uebernommen", r.stand.openingFloat["2026-08-14"], 15000);
  pruefe("Artikelpreis uebernommen", r.stand.products[0].priceCents, 450);
  pruefe("Farbe umgesetzt", r.stand.products[0].color, "var(--enamel-amber)");
  pruefe("Platz uebernommen", r.stand.products[0].slot, 0);
  pruefe("Bonsumme uebernommen", r.stand.sales[0].totalCents, 900);
  pruefe("Zahlart umgesetzt", r.stand.sales[0].payment, "card");
  pruefe("Trinkgeld uebernommen", r.stand.sales[0].tipCents, 50);
  pruefe("Position uebernommen", r.stand.sales[0].items[0].qty, 2);

  console.log(`\n===== ${geprueft - fehler}/${geprueft} Prüfungen bestanden =====`);
  process.exit(fehler ? 1 : 0);
})();
