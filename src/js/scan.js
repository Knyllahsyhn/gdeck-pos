async function openScan(){
  ui.scanParts = new Map(); ui.scanTotal = 0;
  $("#paste-config").value = "";
  setScanStatus("Kamera wird gestartet …");
  setScanDetail("");
  $("#dlg-scan").dataset.open = "yes";
  renderPartDots();
  startScan();
}
function closeScan(){
  stopScan();
  $("#dlg-scan").dataset.open = "no";
}
function stopScan(){
  ui.scanRunning = false;
  if(ui.scanStream){ ui.scanStream.getTracks().forEach(t=>t.stop()); ui.scanStream = null; }
  const v = $("#scan-video");
  if(v) v.srcObject = null;
}
function setScanStatus(text){ $("#scan-status").textContent = text; }

/* Pulls one frame out of the video as plain grey values.

   The longest side caps the work per frame. It was 800 once, and that was too
   coarse: a config code carries 450 bytes, which needs 73 modules, and a phone
   held at arm's length leaves about 2.8 pixels per module at that cap. The
   finders still stand out at that size, so the reader announced a code it
   could then never decode. Measured against a photographed screen, tilted and
   slightly out of focus, 1280 reads what 800 does not, and a frame still costs
   well under the 120 ms between two of them. */
const SCAN_MAX_SIDE = 1280;
let scanCanvas = null;
function frameAsGrey(video){
  const vw = video.videoWidth, vh = video.videoHeight;
  if(!vw || !vh) return null;
  const shrink = Math.min(1, SCAN_MAX_SIDE/Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw*shrink)), h = Math.max(1, Math.round(vh*shrink));
  if(!scanCanvas) scanCanvas = document.createElement("canvas");
  if(scanCanvas.width !== w || scanCanvas.height !== h){ scanCanvas.width = w; scanCanvas.height = h; }
  const g = scanCanvas.getContext("2d", {willReadFrequently:true});
  if(!g) return null;
  g.drawImage(video, 0, 0, w, h);
  let px;
  try{ px = g.getImageData(0, 0, w, h).data; }catch(e){ return null; }
  const grey = new Uint8ClampedArray(w*h);
  for(let i=0, j=0; j<grey.length; i+=4, j++)
    grey[j] = (px[i]*77 + px[i+1]*150 + px[i+2]*29) >> 8;
  return {grey, width:w, height:h};
}

function setScanDetail(text){ const t = $("#scan-detail"); if(t) t.textContent = text; }

/* Sagt in einem Satz, wo der Leser stehen bleibt. Ohne diese Auskunft sieht
   ein Code, den die Kamera zu grob abbildet, genauso aus wie gar kein Code.
   Die Stufen kommen aus QR.read, die Zahlen sind dort vergeben. */
function scanHint(notes){
  if(!notes.square){
    return notes.corners
      ? "Erst " + notes.corners + " von 3 Ecken zu sehen: näher heran."
      : "Noch kein Code im Bild.";
  }
  // Unter etwa 3,5 Pixeln je Modul heben sich die Ecken noch ab, die Daten
  // dazwischen nicht mehr. Das ist der haeufigste Grund und geht vor.
  if(notes.unit < 3.5) return "Code ist zu klein im Bild: näher heran"
    + " (" + notes.unit.toFixed(1) + " Pixel je Kästchen).";
  const wo = ["Ecken stehen, Raster liegt daneben: Code ganz ins Bild.",
              "Raster liegt, Formatzeile unlesbar: ruhig halten.",
              "Das ist ein fremder Code, nicht von dieser Kasse.",
              "Bild zu grob für die Daten: näher heran und scharf stellen.",
              "Daten gelesen, Inhalt ergibt keinen Text."];
  return (wo[notes.stage - 1] || "Code erkannt, aber noch nicht lesbar.")
    + " (Stufe " + notes.stage + ", " + notes.unit.toFixed(1) + " px je Kästchen)";
}

async function startScan(){
  // The reading is ours. Relying on the browser's own reader meant the camera
  // stayed dark on anything that is not Chromium, iPhone included.
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    setScanStatus("Dieser Browser gibt keine Kamera her. Text unten einfügen.");
    setScanDetail("getUserMedia fehlt. Ohne https gibt kein Browser die Kamera her.");
    return;
  }

  // Some devices refuse the whole request over a single constraint they cannot
  // meet, so ask politely first and plainly afterwards.
  const wishes = [
    {video:{facingMode:{ideal:"environment"}, width:{ideal:1920}, height:{ideal:1080}}},
    {video:{facingMode:{ideal:"environment"}}},
    {video:true}
  ];
  setScanDetail("Kamera wird angefragt. Die Nachfrage des Browsers bitte erlauben.");
  let last = null;
  for(const wish of wishes){
    try{ ui.scanStream = await navigator.mediaDevices.getUserMedia(wish); last = null; break; }
    catch(e){ last = e; ui.scanStream = null; }
  }
  if(!ui.scanStream){
    const name = (last && last.name) || "unbekannt";
    setScanStatus(name === "NotAllowedError"
      ? "Kamera nicht erlaubt. Text unten einfügen."
      : "Kein Kamerazugriff. Text unten einfügen.");
    setScanDetail("Der Browser sagt: " + name + ". Bei NotAllowedError hilft nur die Erlaubnis"
      + " in den Browsereinstellungen, bei NotFoundError fehlt eine Kamera,"
      + " bei NotReadableError hat sie eine andere App belegt.");
    return;
  }

  const video = $("#scan-video");
  video.srcObject = ui.scanStream;
  try{ await video.play(); }catch(e){ /* iOS starts it from the attribute */ }
  ui.scanRunning = true;
  setScanStatus("Code ins Bild halten …");

  // What the reader sees, in plain words. Without this a scan that finds
  // nothing looks exactly like one that is not running at all.
  const begonnen = Date.now();
  let frames = 0, blind = 0;
  const notes = {};
  const loop = () => {
    if(!ui.scanRunning) return;
    let waited = Date.now() - begonnen;
    try{
      const frame = frameAsGrey(video);
      if(!frame){
        blind++;
        if(waited > 3000) setScanDetail("Die Kamera läuft, liefert aber kein Bild ("
          + blind + " Versuche). Text unten einfügen.");
      }else{
        frames++;
        const text = QR.read(frame.grey, frame.width, frame.height, notes);
        if(text !== null){
          onScanResult(text);
          // Ein Sortiment kommt in mehreren Codes. Nach dem ersten einfach
          // aufzuhoeren hiess: umschalten auf den naechsten, und nichts
          // passiert mehr. applyConfig haelt den Leser selbst an, sobald
          // alle Teile da sind, daran ist der Abbruch hier gebunden.
          if(!ui.scanRunning) return;
          setScanDetail("Gelesen. Jetzt am anderen Gerät auf den nächsten Code umschalten.");
          // Kurze Pause, sonst liest er denselben Code sofort wieder.
          setTimeout(loop, 700);
          return;
        }
        if(waited > 1500){
          setScanDetail(frame.width + "x" + frame.height + ", " + frames
            + " Bilder geprüft. " + scanHint(notes));
        }
      }
    }catch(e){
      setScanDetail("Der Leser ist ausgestiegen: " + (e && e.message ? e.message : e));
    }
    if(ui.scanRunning) setTimeout(loop, 120);
  };
  loop();
}

function onScanResult(rawText){
  const part = parsePart(rawText);
  if(!part){
    // maybe a complete payload without the part header was scanned
    if(parseConfig(rawText)){ applyConfig(rawText); }
    else setScanStatus("Das ist kein Kassen-Code.");
    return;
  }
  if(ui.scanTotal && part.total !== ui.scanTotal){
    ui.scanParts = new Map();                       // different transfer, start over
  }
  ui.scanTotal = part.total;
  const fresh = !ui.scanParts.has(part.num);
  ui.scanParts.set(part.num, part.content);
  renderPartDots();
  if(fresh) toastMsg("Code " + part.num + " von " + part.total + " gelesen");

  if(ui.scanParts.size === ui.scanTotal){
    const joined = Array.from({length:ui.scanTotal}, (_,i)=>ui.scanParts.get(i+1)).join("\n");
    applyConfig(joined);
  }else{
    const missing = [];
    for(let i=1;i<=ui.scanTotal;i++) if(!ui.scanParts.has(i)) missing.push(i);
    setScanStatus("Es fehlt noch: Code " + missing.join(", "));
  }
}

function renderPartDots(){
  const target = $("#part-dots");
  target.innerHTML = "";
  if(!ui.scanTotal) return;
  for(let i=1;i<=ui.scanTotal;i++){
    const s = document.createElement("span");
    s.textContent = i;
    if(ui.scanParts.has(i)) s.dataset.have = "yes";
    target.appendChild(s);
  }
}

async function applyConfig(text){
  const config = parseConfig(text);
  if(!config){ toastMsg("Der Code enthält kein gültiges Sortiment"); return; }
  stopScan();
  const ok = await askConfirm("Sortiment übernehmen?",
    config.products.length + " Artikel" + (config.businessName ? " von „"+config.businessName+"“" : "") +
    " ersetzen das bisherige Sortiment. Deine Buchungen bleiben unverändert.", "Übernehmen");
  if(!ok){ if($("#dlg-scan").dataset.open === "yes") startScan(); return; }

  data.products = config.products.map((p,i)=>({
    id: "p" + Date.now() + i.toString(36),
    name:p.name, priceCents:p.priceCents, category:p.category, color:p.color, sort:i, slot:p.slot
  }));
  if(config.businessName) data.businessName = config.businessName;
  if(config.grid)  data.grid  = config.grid;
  resetUi();
  saveState();
  closeScan();
  renderAll();
  toastMsg(config.products.length + " Artikel übernommen");
}

