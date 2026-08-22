/* ------------------------------------------------------------
   Persistence: two copies, each with a checksum and timestamp.
   If a write is cut short, the other copy survives. On a busy
   night every recorded sale matters.
   ------------------------------------------------------------ */
let storageOk = true;

function checksumOf(d){
  let h = 2166136261;
  const mix = n => { h ^= n; h = Math.imul(h, 16777619); };
  mix(d.products.length);
  mix(d.sales.length);
  for(const b of d.sales){ mix(b.totalCents|0); mix((b.tipCents|0)+1); mix(b.voided?7:3); }
  for(const p of d.products) mix(p.priceCents|0);
  return h >>> 0;
}

/* Builds before the rename stored German property names. Convert them
   so an upgrade never loses a night's takings. */
function migrate(old){
  if(!old || !Array.isArray(old.produkte)) return old;
  const colorMap = {
    "var(--emaille-bernstein)":"var(--enamel-amber)",
    "var(--emaille-rot)":"var(--enamel-red)",
    "var(--emaille-kobalt)":"var(--enamel-cobalt)",
    "var(--emaille-gruen)":"var(--enamel-green)",
    "var(--emaille-kupfer)":"var(--enamel-copper)",
    "var(--emaille-pflaume)":"var(--enamel-plum)",
    "var(--emaille-schiefer)":"var(--enamel-slate)",
    "var(--emaille-messing)":"var(--enamel-brass)"
  };
  return {
    businessName: old.betrieb,
    theme: old.modus === "tag" ? "day" : "night",
    openingFloat: old.wechselgeld || {},
    lastBackup: old.letzteSicherung || 0,
    grid: old.raster ? {columns: old.raster.spalten|0, rows: old.raster.zeilen || 4} : {columns:0, rows:4},
    products: old.produkte.map(p=>({
      id:p.id, name:p.name, priceCents:p.preisCent, category:p.kategorie,
      color: colorMap[p.farbe] || p.farbe, sort:p.sort, slot:p.platz
    })),
    sales: (old.buchungen || []).map(b=>({
      id:b.id, ts:b.ts,
      items:(b.positionen||[]).map(p=>({
        productId:p.produktId, name:p.name, priceCents:p.preisCent, qty:p.menge
      })),
      totalCents:b.summeCent,
      payment: b.zahlart === "karte" ? "card" : "cash",
      tenderedCents:b.gegebenCent, tipCents:b.trinkgeldCent|0,
      changeCents:b.rueckgeldCent, voided:!!b.storniert
    }))
  };
}

function loadState(){
  const candidates = [];
  for(const key of [STORE_KEY, MIRROR_KEY, ...LEGACY_KEYS]){
    let raw;
    try{ raw = localStorage.getItem(key); }catch(e){ storageOk = false; continue; }
    if(!raw) continue;
    try{
      const envelope = JSON.parse(raw);
      let state = (envelope && envelope.state) ? envelope.state : envelope;   // older build without the envelope
      let migrated = false;
      if(state && Array.isArray(state.produkte)){ state = migrate(state); migrated = true; }
      if(!state || !Array.isArray(state.products) || !Array.isArray(state.sales)) continue;
      // A migrated state cannot match a checksum taken over the old field names.
      const intact = migrated || envelope.checksum === undefined
                     || envelope.checksum === checksumOf(state);
      candidates.push({state, time: envelope.time || 0, intact});
    }catch(e){
      console.warn("Stored state", key, "is unreadable:", e);
    }
  }
  const intactOnes = candidates.filter(k=>k.intact).sort((a,b)=>b.time-a.time);
  const chosen = intactOnes[0] || candidates.sort((a,b)=>b.time-a.time)[0];
  if(!chosen) return defaults();
  if(!chosen.intact) console.warn("Checksum mismatch, loading the state anyway.");
  return Object.assign(defaults(), chosen.state);
}

function saveState(){
  const packet = JSON.stringify({state:data, checksum:checksumOf(data), time:Date.now()});
  let written = false;
  try{
    localStorage.setItem(STORE_KEY, packet);
    written = localStorage.getItem(STORE_KEY) === packet;   // read back and compare
  }catch(e){ console.error("primary store:", e); }
  try{ localStorage.setItem(MIRROR_KEY, packet); }
  catch(e){ console.error("mirror store:", e); }

  if(!written && storageOk){
    storageOk = false;
    toastMsg("Achtung: Speichern schlägt fehl!");
  }else if(written && !storageOk){
    storageOk = true;
  }
  renderStorageStatus();
  return written;
}

/* Ask the browser not to evict our data on its own. */
async function requestPersistence(){
  try{
    if(navigator.storage && navigator.storage.persist){
      const schon = await navigator.storage.persisted();
      if(!schon) await navigator.storage.persist();
    }
  }catch(e){ /* the register still works without the permission */ }
  renderStorageStatus();
}

/* Writes a probe key and reads it back, right now. Says what the browser
   actually does instead of what it claims to support. */
function storageProbe(){
  const key = STORE_KEY + ".probe";
  try{
    localStorage.setItem(key, "1");
    const back = localStorage.getItem(key);
    localStorage.removeItem(key);
    return back === "1" ? "ok" : "schreibt nicht zurück";
  }catch(e){
    return "blockiert (" + ((e && e.name) || "unbekannt") + ")";
  }
}

/* The build writes its stamp into the page. Since the service worker serves
   from its cache first, this is the only honest answer to "which version am
   I actually looking at". The single file version carries no stamp. */
function buildStamp(){
  const tag = document.querySelector('meta[name="build"]');
  return tag && tag.content ? tag.content : "Einzeldatei ohne Stempel";
}

/* On iOS an app started from the home screen keeps its own storage, separate
   from the same page in Safari. Worth showing, it looks like data loss. */
function appMode(){
  const mode = m => window.matchMedia && window.matchMedia("(display-mode: " + m + ")").matches;
  if(navigator.standalone === true) return "ja, vom Startbildschirm";
  if(mode("fullscreen") || mode("standalone")) return "ja";
  return "nein, im Browser";
}

async function renderStorageStatus(){
  const target = $("#storage-status");
  if(!target) return;
  let persistent = null;
  try{
    if(navigator.storage && navigator.storage.persisted) persistent = await navigator.storage.persisted();
  }catch(e){}
  const saleCount = data.sales.length;
  const lastText = data.lastBackup
    ? new Date(data.lastBackup).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})
    : "noch nie";
  const warning = !storageOk || (saleCount > 0 && !data.lastBackup);
  target.dataset.warn = warning ? "yes":"no";
  target.innerHTML = "";
  const rows = [
    ["Gespeicherte Bons", String(saleCount)],
    ["Schreiben auf dieses Gerät", storageOk ? "läuft" : "schlägt fehl"],
    ["Speichertest gerade eben", storageProbe()],
    ["Vom Browser geschützt", persistent === null ? "unbekannt" : (persistent ? "ja" : "nein, Daten könnten bei Platzmangel verworfen werden")],
    ["Letzte heruntergeladene Sicherung", lastText],
    ["Verbindung abgesichert", window.isSecureContext ? "ja" : "nein"],
    ["Als App gestartet", appMode()],
    ["Kamera ansprechbar", (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? "ja" : "nein"],
    ["Stand der App", buildStamp()]
  ];
  rows.forEach(([k,v])=>{
    const d = document.createElement("div");
    d.innerHTML = "<b></b> ";
    d.querySelector("b").textContent = k + ":";
    d.appendChild(document.createTextNode(" " + v));
    target.appendChild(d);
  });
}

