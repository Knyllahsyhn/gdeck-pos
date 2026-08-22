/* Faehrt eine ganze Uebertragung durch: mehrere Codes nacheinander vor eine
   vorgetaeuschte Kamera halten, bis das Sortiment uebernommen ist.

   Der Grund fuer diese Suite: der Leser blieb nach dem ersten Code stehen,
   und keine der anderen Suiten konnte das sehen. Die pruefen den Leser mit
   Bildern und die App ueber das DOM, aber niemand fuhr die Schleife, die
   beides verbindet. */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(new URL("../kasse.html", "file://" + __filename).pathname, "utf8");

let fehler = 0, geprueft = 0;
function pruefe(name, ist, soll){
  geprueft++;
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if(!ok){ fehler++; console.log(`  FEHLER  ${name}\n          ist:  ${JSON.stringify(ist)}\n          soll: ${JSON.stringify(soll)}`); }
  else console.log(`  ok      ${name}`);
}

/* Das Bild, das die Kamera gerade liefert, als RGBA wie aus einem Canvas.
   Weisser Grund, schwarze Kaestchen, mittig, so gross wie angegeben. */
let bildBreite = 720, bildHoehe = 1280, bildDaten = null;
function stelleCode(matrix, size, pxProModul){
  const rand = 4;
  const kante = (size + 2*rand) * pxProModul;
  const x0 = Math.round((bildBreite - kante)/2), y0 = Math.round((bildHoehe - kante)/2);
  const px = new Uint8ClampedArray(bildBreite*bildHoehe*4).fill(255);
  for(let y=0;y<kante;y++){
    const mr = Math.floor(y/pxProModul) - rand;
    for(let x=0;x<kante;x++){
      const mc = Math.floor(x/pxProModul) - rand;
      const dunkel = mr>=0 && mc>=0 && mr<size && mc<size && matrix[mr][mc];
      if(!dunkel) continue;
      const i = ((y0+y)*bildBreite + (x0+x))*4;
      px[i] = px[i+1] = px[i+2] = 0;
    }
  }
  bildDaten = px;
}
function leeresBild(){
  bildDaten = new Uint8ClampedArray(bildBreite*bildHoehe*4).fill(255);
}
leeresBild();

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://kasse.local/",
  pretendToBeVisual: true,
  beforeParse(w){
    w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    w.HTMLCanvasElement.prototype.getContext = () => ({
      fillStyle: "", fillRect(){}, drawImage(){},
      getImageData: () => ({ data: bildDaten, width: bildBreite, height: bildHoehe })
    });
    w.URL.createObjectURL = () => "blob:test";
    w.URL.revokeObjectURL = () => {};
    // Kamera: liefert einen Strom, der sich anhalten laesst.
    w.navigator.mediaDevices = {
      getUserMedia: async () => ({ getTracks: () => [{ stop(){} }] })
    };
    Object.defineProperty(w.HTMLVideoElement.prototype, "videoWidth",  { get: () => bildBreite });
    Object.defineProperty(w.HTMLVideoElement.prototype, "videoHeight", { get: () => bildHoehe });
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
  }
});
const w = dom.window, d = w.document;
const $ = s => d.querySelector(s);
const klick = el => el.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
const warte = ms => new Promise(r => setTimeout(r, ms));

/* Wartet, bis die Bedingung eintritt, hoechstens so lange wie angegeben.
   Der Leser laeuft ueber setTimeout, es gibt also nichts anzuhaengen. */
async function bis(bedingung, grenze = 6000){
  const ende = Date.now() + grenze;
  while(Date.now() < ende){
    if(bedingung()) return true;
    await warte(60);
  }
  return false;
}

setTimeout(() => { lauf().then(ende, e => { console.log("Abbruch:", e && e.stack || e); process.exit(1); }); }, 60);

async function lauf(){
  console.log("\n== Sortiment in mehreren Codes uebertragen ==");

  // Ein Sortiment, das sicher ueber mehrere Codes geht.
  w.eval(`data.products = Array.from({length:34}, (_,i) => ({
    id:"q"+i, name:"Getränk Nummer "+(i+1), priceCents:150+i, category:"Bier", color:"", sort:i
  })); data.businessName = "Nachbarhütte";`);
  const teile = w.eval("splitParts(configText())");
  pruefe("Uebertragung braucht mehrere Codes", teile.length > 1, true);

  // Empfaengerseite: leeres Sortiment, dann Scanfenster auf.
  w.eval(`data.products = []; renderAll();`);
  w.eval("openScan()");
  pruefe("Scanfenster offen", $("#dlg-scan").dataset.open, "yes");

  const matrizen = teile.map(t => w.eval("QR.matrix(" + JSON.stringify(t) + ")"));

  for(let i=0;i<teile.length;i++){
    stelleCode(matrizen[i].matrix, matrizen[i].size, 8);
    const da = await bis(() => w.eval("ui.scanParts.size") > i);
    pruefe(`Code ${i+1} von ${teile.length} gelesen`, da, true);
    if(!da) break;
    // Wie in echt: der Sender schaltet um, dazwischen ist kurz nichts da.
    if(i < teile.length-1){ leeresBild(); await warte(200); }
  }

  const gefragt = await bis(() => $("#dlg-confirm").dataset.open === "yes");
  pruefe("Nachfrage nach dem letzten Code", gefragt, true);
  klick($("#confirm-yes"));
  await bis(() => w.eval("data.products.length") > 0);

  pruefe("Sortiment uebernommen", w.eval("data.products.length"), 34);
  pruefe("Name uebernommen", w.eval("data.businessName"), "Nachbarhütte");
  pruefe("Scanfenster wieder zu", $("#dlg-scan").dataset.open, "no");
  pruefe("Kamera angehalten", w.eval("ui.scanRunning"), false);
}

function ende(){
  console.log(`\n===== ${geprueft - fehler}/${geprueft} Prüfungen bestanden =====`);
  process.exit(fehler ? 1 : 0);
}
