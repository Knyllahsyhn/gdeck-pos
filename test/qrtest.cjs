/* Prüft den eigenen QR-Leser gegen echte Bilder.
   Schreiben und Lesen liegen in derselben Datei, also könnten sich beide
   gemeinsam irren. Deshalb kommt ein Teil der Testbilder von qrencode und
   ein Teil unserer Ausgabe wird von zbarimg gegengelesen. */
const { execFileSync } = require("child_process");
const H = require("./qrhelfer.cjs");

let fehler = 0, geprueft = 0;
function pruefe(name, ist, soll){
  geprueft++;
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if(!ok){ fehler++; console.log(`  FEHLER  ${name}\n          ist:  ${JSON.stringify(ist)}\n          soll: ${JSON.stringify(soll)}`); }
  else console.log(`  ok      ${name}`);
}

function werkzeugDa(name){
  try{ execFileSync("which", [name], {stdio:"ignore"}); return true; }
  catch(e){ return false; }
}
for(const w of ["qrencode", "zbarimg", "identify"]){
  if(!werkzeugDa(w)){
    console.log(`\nÜbersprungen: ${w} fehlt auf diesem Rechner.`);
    console.log("\n===== 0/0 Prüfungen bestanden =====");
    process.exit(0);
  }
}

if(!H.BILDWERKZEUG){
  console.log("\nÜbersprungen: weder magick noch convert vorhanden.");
  console.log("\n===== 0/0 Prüfungen bestanden =====");
  process.exit(0);
}

const QR = H.ladeQR();

/* Unser Bild, unser Leser. */
function hinUndZurueck(text, rand = 4, skalierung = 6){
  const q = QR.matrix(text);
  const pbm = H.temp("a.pbm"); H.schreibePBM(q.matrix, q.size, pbm, rand, skalierung);
  const png = H.temp("a.png"); H.magick([pbm, png]);
  const bild = H.alsGraubild(png);
  return {gelesen: QR.read(bild.data, bild.width, bild.height), version: q.version};
}

/* Bild von qrencode, verändert wie eine Kamera es liefern würde. */
function ueberBild(text, args, skalierung = 8){
  const png = H.temp("q.png"); H.qrencode(text, png, ["-s", String(skalierung)]);
  const ziel = H.temp("t.png");
  if(args.length) H.magick([png, ...args, ziel]); else H.magick([png, ziel]);
  const bild = H.alsGraubild(ziel);
  return QR.read(bild.data, bild.width, bild.height);
}

const PROBE = 'HK2|{"n":"Berghütte","p":[["Helles 0,5 l",450,"Bier"]]}';

console.log("\n== Eigene Codes zurücklesen ==");
for(const text of ["HK2|Test", PROBE, "QK1/3\nHK2 Teil eins", "x".repeat(400)]){
  const {gelesen} = hinUndZurueck(text);
  pruefe(`gelesen: ${JSON.stringify(text.slice(0,26))}`, gelesen, text);
}

console.log("\n== Jede Version, die wir schreiben können ==");
{
  let ok = 0, versionen = 0;
  for(let v=1; v<=25; v++){
    let text = null;
    for(let len=1; len<1300; len++){
      const t = "A".repeat(len);
      if(QR.matrix(t).version === v){ text = t; break; }
    }
    if(!text) continue;
    versionen++;
    if(hinUndZurueck(text, 4, 4).gelesen === text) ok++;
    else console.log(`          Version ${v} nicht gelesen`);
  }
  pruefe("alle 25 Versionen", [ok, versionen], [25, 25]);
}

console.log("\n== Fremd erzeugte Codes ==");
// qrencode hat mit unserem Code nichts zu tun. Läuft das, lesen wir echtes QR
// und nicht bloß unsere eigenen Eigenheiten zurück.
pruefe("von qrencode geschrieben", ueberBild(PROBE, []), PROBE);
pruefe("kurzer Text von qrencode", ueberBild("HK2|kurz", []), "HK2|kurz");

console.log("\n== Von zbarimg gegengelesen ==");
{
  // Nur ASCII: zbar deutet Bytes über 127 als Shift-JIS um und gibt dann
  // etwas anderes zurück, als wir hineingeschrieben haben.
  const text = "HK2|Gegenprobe ohne Umlaute 1234";
  const q = QR.matrix(text);
  const pbm = H.temp("z.pbm"); H.schreibePBM(q.matrix, q.size, pbm, 4, 6);
  const png = H.temp("z.png"); H.magick([pbm, png]);
  pruefe("zbarimg liest unser Bild", H.zbar(png), text);
}

console.log("\n== Wie es die Kamera sieht ==");
const bedingungen = [
  ["leicht gedreht",        ["-background","white","-rotate","7"]],
  ["schief im Bild",        ["-background","white","-rotate","33"]],
  ["quer",                  ["-background","white","-rotate","90"]],
  ["auf dem Kopf",          ["-background","white","-rotate","180"]],
  ["unscharf",              ["-blur","0x2.5"]],
  ["verrauscht",            ["-attenuate","1.4","+noise","Gaussian"]],
  ["flau",                  ["-brightness-contrast","0x-55"]],
  ["halb im Schatten",      ["-size","300x300","gradient:white-gray30","-compose","multiply","-composite"]],
  ["von der Seite",         ["-alpha","set","-virtual-pixel","white","-distort","Perspective",
                             "0,0,20,10 300,0,290,0 0,300,0,300 300,300,270,290"]],
  ["klein im Bild",         ["-resize","40%"]],
  ["weit weg, dazu schief", ["-resize","55%","-background","white","-rotate","12"]],
  ["mitten in der Stube",   ["-background","gray70","-gravity","center","-extent","900x700"]]
];
{
  let ok = 0;
  for(const [name, args] of bedingungen){
    if(ueberBild(PROBE, args) === PROBE) ok++;
    else console.log(`          nicht gelesen: ${name}`);
  }
  pruefe("alle Bedingungen", ok, bedingungen.length);
}

console.log("\n== Ein voller Teil vom Schirm abgefilmt ==");
/* Der Abschnitt darueber arbeitet mit einer kurzen Nutzlast, also einem
   kleinen Code. Die Kasse verschickt aber Teile zu PART_BYTES Zeichen, und
   die brauchen 73 Module. Genau daran scheiterte der Leser am Handy: die
   Ecken fand er, die Daten dazwischen nicht mehr. Deshalb wird hier ein
   ganzer Teil geprueft, in der Bildgroesse, die der Leser wirklich bekommt. */
{
  const lang = "Helles 0,5 l|450|Bier|0\n";
  let inhalt = "";
  while(inhalt.length + lang.length <= H.konstante("PART_BYTES")) inhalt += lang;
  const teil = "QK1/3\n" + inhalt;
  const q = QR.matrix(teil);
  const rand = 4, gesamt = q.size + 2*rand;

  // Hochformat, lange Seite so gross wie der Leser sie stehen laesst.
  const hoehe = H.konstante("SCAN_MAX_SIDE");
  const breite = Math.round(hoehe * 9/16);
  const imBild = Math.round(breite * 0.7);       // Code fuellt 70 % der Breite

  const skal = Math.max(1, Math.round(1200/gesamt));
  const kante = gesamt * skal;      // Kantenlaenge des ungeschrumpften Bildes

  /* Ueber einen Tisch gehalten steht kein Code je gerade vor der Linse. Die
     Punkte kippen die obere Kante nach rechts und ziehen die untere zusammen,
     so wie ein Handy ueber einem liegenden Tablet es sieht. */
  function schraeg(staerke){
    const k = kante, v = staerke;
    return ["-alpha","set","-virtual-pixel","white","-distort","Perspective",
      `0,0,${k*v*0.5},0 ${k},0,${k},${k*v*0.33} 0,${k},0,${k} ${k},${k},${k*(1-v*0.4)},${k*(1-v*0.27)}`];
  }

  function abgefilmt(extra){
    const pbm = H.temp("teil.pbm");
    H.schreibePBM(q.matrix, q.size, pbm, rand, skal);
    const ziel = H.temp("teil.png");
    // Sensorrauschen gehoert dazu, in der Huette wird bei Kunstlicht gefilmt.
    // Fester Startwert, sonst faellt der Test mal so und mal so aus.
    H.magick(["-seed","4711", pbm, ...extra, "-resize", `${imBild}x${imBild}!`,
              "-background","gray50","-gravity","center","-extent",`${breite}x${hoehe}`,
              "-attenuate","0.5","+noise","Gaussian",
              "-colorspace","gray", ziel]);
    const bild = H.alsGraubild(ziel);
    return QR.read(bild.data, bild.width, bild.height);
  }

  pruefe("Module gross genug", (imBild/gesamt) > 3.5, true);

  const lagen = [
    ["scharf gehalten",   []],
    ["leicht unscharf",   ["-blur","0x1.5"]],
    ["gedreht",           ["-background","white","-rotate","12","-blur","0x1.5"]],
    ["Schirm statt Papier",["-level","12%,88%","-blur","0x1.5"]],
    // Diese beiden fielen durch, solange die Ausrichtungsmarke nie gefunden
    // wurde: ohne sie rechnet der Leser das Bild flach und trifft daneben.
    ["ueber den Tisch gehalten", schraeg(0.16).concat(["-level","12%,88%"])],
    ["stark gekippt",           schraeg(0.30).concat(["-level","12%,88%","-blur","0x1.5"])]
  ];
  let ok = 0;
  for(const [name, extra] of lagen){
    if(abgefilmt(extra) === teil) ok++;
    else console.log(`          nicht gelesen: ${name}`);
  }
  pruefe("voller Teil in allen Lagen", ok, lagen.length);
}

console.log("\n== Auskunft an die Bedienung ==");
/* Die Meldung im Scanfenster stammt aus diesem Objekt. Bliebe ein Wert von
   einem frueheren Bild stehen, meldete das Fenster einen Code im Sucher,
   wo laengst keiner mehr ist. */
{
  const merk = {};
  const gut = H.temp("gut.png");
  H.qrencode(PROBE, gut, ["-s","8"]);
  const b1 = H.alsGraubild(gut);
  QR.read(b1.data, b1.width, b1.height, merk);
  pruefe("Code im Bild wird gemeldet", merk.square, true);
  pruefe("Modulgröße wird gemeldet", merk.unit > 1, true);

  const leer = H.temp("nix.png");
  H.magick(["-size","400x400","xc:white", leer]);
  const b2 = H.alsGraubild(leer);
  QR.read(b2.data, b2.width, b2.height, merk);
  pruefe("leeres Bild setzt die Meldung zurück", merk.square, false);
  pruefe("keine Ecken mehr gemeldet", merk.corners, 0);
}

console.log("\n== Fehlerkorrektur ==");
// Ein Fleck auf dem Code muss durch die Prüfzeichen herauszurechnen sein.
pruefe("Klecks auf dem Code",
  ueberBild(PROBE, ["-fill","white","-draw","circle 150,150 150,168"]), PROBE);

console.log("\n== Was kein Ergebnis liefern darf ==");
{
  const leer = H.temp("leer.png");
  H.magick(["-size","400x400","xc:white", leer]);
  const b1 = H.alsGraubild(leer);
  pruefe("weiße Fläche", QR.read(b1.data, b1.width, b1.height), null);

  const wirr = H.temp("wirr.png");
  H.magick(["-size","400x400","xc:white","-attenuate","3","+noise","Impulse", wirr]);
  const b2 = H.alsGraubild(wirr);
  pruefe("reines Rauschen", QR.read(b2.data, b2.width, b2.height), null);

  // Bis zur Unkenntlichkeit zerstört: lieber nichts als etwas Falsches.
  const kaputt = ueberBild(PROBE, ["-fill","white","-draw","rectangle 40,40 260,150"]);
  pruefe("halb ausradiert liefert nichts oder das Richtige",
    kaputt === null || kaputt === PROBE, true);

  pruefe("zu kleines Bild", QR.read(new Uint8ClampedArray(4*4), 4, 4), null);
  pruefe("nichts übergeben", QR.read(null, 100, 100), null);
}

H.aufraeumen();
console.log(`\n===== ${geprueft - fehler}/${geprueft} Prüfungen bestanden =====`);
process.exit(fehler ? 1 : 0);
