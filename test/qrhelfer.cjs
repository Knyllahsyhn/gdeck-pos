/* Holt das QR-Modul aus kasse.html heraus und macht es in Node benutzbar,
   dazu die Bildwerkzeuge fuer die Lesetests. Die Datei bleibt damit die
   einzige Quelle, es gibt keine zweite Kopie des Codes zum Testen. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function ladeQR(){
  const html = fs.readFileSync(path.join(__dirname, "..", "kasse.html"), "utf8");
  const start = html.indexOf("const QR = (function(){");
  if(start < 0) throw new Error("QR-Modul nicht gefunden");
  const ende = html.indexOf("</script>", start);
  const quelle = html.slice(start, ende);
  const fabrik = new Function("TextEncoder", "TextDecoder", quelle + "\nreturn QR;");
  return fabrik(TextEncoder, TextDecoder);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qrtest-"));
const temp = name => path.join(tempDir, name);
function aufraeumen(){ fs.rmSync(tempDir, {recursive:true, force:true}); }

/* Schreibt eine Modulmatrix als PBM, damit ImageMagick sie weiterreichen kann. */
function schreibePBM(matrix, size, datei, rand = 4, skalierung = 1){
  const breite = (size + 2*rand) * skalierung;
  const zeilen = [];
  for(let y=0; y<breite; y++){
    const zeile = [];
    for(let x=0; x<breite; x++){
      const mr = Math.floor(y/skalierung) - rand;
      const mc = Math.floor(x/skalierung) - rand;
      const dunkel = mr>=0 && mc>=0 && mr<size && mc<size && matrix[mr][mc];
      zeile.push(dunkel ? "1" : "0");
    }
    zeilen.push(zeile.join(" "));
  }
  fs.writeFileSync(datei, `P1\n${breite} ${breite}\n${zeilen.join("\n")}\n`);
  return datei;
}

/* Bild in reine Graustufen, so wie es der Leser aus einem Canvas bekommt. */
function alsGraubild(datei){
  const info = execFileSync("identify", ["-format", "%w %h", datei], {encoding:"utf8"}).trim().split(" ");
  const width = parseInt(info[0], 10), height = parseInt(info[1], 10);
  const roh = temp("grau.raw");
  execFileSync(BILDWERKZEUG, [datei, "-colorspace", "gray", "-depth", "8", "gray:" + roh]);
  const data = new Uint8ClampedArray(fs.readFileSync(roh));
  if(data.length !== width*height) throw new Error(`Graubild passt nicht: ${data.length} statt ${width*height}`);
  return {data, width, height};
}

/* ImageMagick 7 heißt magick, die 6 auf den CI-Rechnern heißt convert. */
const BILDWERKZEUG = (function(){
  for(const name of ["magick", "convert"]){
    try{ execFileSync("which", [name], {stdio:"ignore"}); return name; }
    catch(e){ /* weiter */ }
  }
  return null;
})();

function magick(args){ execFileSync(BILDWERKZEUG, args); }

function zbar(datei){
  try{
    return execFileSync("zbarimg", ["--raw", "-q", datei], {encoding:"utf8"}).replace(/\n$/, "");
  }catch(e){ return null; }
}

function qrencode(text, datei, extra = []){
  execFileSync("qrencode", ["-l", "L", "-s", "6", "-m", "4", "-o", datei, ...extra, "--", text]);
  return datei;
}

module.exports = { ladeQR, temp, aufraeumen, schreibePBM, alsGraubild, magick, zbar, qrencode, BILDWERKZEUG };
