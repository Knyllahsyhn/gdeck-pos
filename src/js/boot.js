/* ---------- Event wiring ---------- */
$$(".tabs button").forEach(b => b.addEventListener("click", ()=>switchTab(b.dataset.target)));

$("#theme-toggle").addEventListener("click", ()=>{
  data.theme = data.theme==="night" ? "day" : "night";
  document.documentElement.dataset.theme = data.theme;
  renderThemeButton();
  saveState();
});
function renderThemeButton(){
  // Die Taste nennt das Ziel, nicht den Zustand
  $("#theme-toggle").textContent = data.theme === "night" ? "Hell" : "Dunkel";
}

/* ------------------------------------------------------------
   Fullscreen and wake lock. Behind the bar the tablet must not
   dim, and the browser chrome only steals room from the keys.
   ------------------------------------------------------------ */
let wakeLock = null;

function fullscreenOn(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }

function renderFullscreenButton(){
  const btn = $("#fullscreen-toggle");
  btn.textContent = fullscreenOn() ? "Fenster" : "Vollbild";
  btn.setAttribute("aria-pressed", fullscreenOn() ? "true" : "false");
}

async function toggleFullscreen(){
  try{
    if(fullscreenOn()){
      await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
    }else{
      const el = document.documentElement;
      await (el.requestFullscreen ? el.requestFullscreen({navigationUI:"hide"})
                                  : el.webkitRequestFullscreen());
    }
  }catch(e){
    toastMsg("Vollbild wird hier nicht unterstützt");
  }
  renderFullscreenButton();
}

/* The lock dies whenever the page is hidden, so take it again on return. */
async function keepScreenOn(){
  if(!("wakeLock" in navigator)) return;
  if(document.visibilityState !== "visible") return;
  try{
    if(wakeLock) return;
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", ()=>{ wakeLock = null; });
  }catch(e){ /* denied or unsupported: the tablet just dims as usual */ }
}

$("#fullscreen-toggle").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", renderFullscreenButton);
document.addEventListener("webkitfullscreenchange", renderFullscreenButton);
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible") keepScreenOn();
});

$("#clear-cart").addEventListener("click", async ()=>{
  if(!ui.cart.length) return;
  const ok = await askConfirm("Bon leeren?", "Alle "+cartCount()+" Artikel werden vom Bon genommen.","Leeren");
  if(!ok) return;
  ui.cart = [];
  renderCart(); renderGrid();
});
$("#checkout").addEventListener("click", openCheckout);
$("#close-checkout").addEventListener("click", closeCheckout);
$("#pay-cash").addEventListener("click", ()=>recordSale("cash"));
$("#pay-card").addEventListener("click", ()=>recordSale("card"));
$("#dlg-checkout").addEventListener("click", e=>{ if(e.target.id==="dlg-checkout") closeCheckout(); });

$("#confirm-yes").addEventListener("click",  ()=>closeConfirm(true));
$("#confirm-no").addEventListener("click",()=>closeConfirm(false));
$("#dlg-confirm").addEventListener("click", e=>{ if(e.target.id==="dlg-confirm") closeConfirm(false); });

$("#save-product").addEventListener("click", saveProduct);
$("#cancel-edit").addEventListener("click", clearProductForm);
$("#in-price").addEventListener("keydown", e=>{ if(e.key==="Enter") saveProduct(); });
$("#in-category-pick").addEventListener("change", ()=>{
  applyCategoryChoice();
  if(!$("#in-category").hidden) $("#in-category").focus();
});
$("#in-category").addEventListener("keydown", e=>{ if(e.key==="Enter") saveProduct(); });

$("#in-date").addEventListener("change", renderReport);
$("#in-float").addEventListener("change", ()=>{
  const day = $("#in-date").value || dayOf(Date.now());
  const cents = parseCents($("#in-float").value);
  if(cents === null) delete data.openingFloat[day];
  else data.openingFloat[day] = cents;
  saveState(); renderReport();
});
$("#export-report").addEventListener("click", exportReport);
$("#export-items").addEventListener("click", exportLineItems);

$("#in-business").addEventListener("input", ()=>{
  data.businessName = $("#in-business").value.trim();
  $("#brand-name").textContent = data.businessName || "Hüttenkasse";
  saveState();
});
function onGridChange(){
  const columns = parseInt($("#in-columns").value, 10) || 0;
  const rows  = parseInt($("#in-rows").value, 10) || 4;
  data.grid = {columns, rows};
  ui.page = 0; ui.arrangePage = 0; ui.arrangeSlot = null;
  saveState();
  renderAll();
  toastMsg(columns ? columns + " x " + rows + " Tastenfeld" : "Mitwachsendes Raster");
}
$("#in-columns").addEventListener("change", onGridChange);
$("#in-rows").addEventListener("change", onGridChange);

$("#tip-toggle").addEventListener("click", ()=>{
  ui.tipOn = !ui.tipOn;
  renderCheckout();
});

$("#open-share").addEventListener("click", openShare);
$("#close-share").addEventListener("click", ()=>{ $("#dlg-share").dataset.open = "no"; });
$("#dlg-share").addEventListener("click", e=>{ if(e.target.id==="dlg-share") $("#dlg-share").dataset.open="no"; });
$("#part-prev").addEventListener("click", ()=>{ if(ui.qrIndex>0){ ui.qrIndex--; renderShare(); } });
$("#part-next").addEventListener("click",     ()=>{ if(ui.qrIndex<ui.qrParts.length-1){ ui.qrIndex++; renderShare(); } });
$("#copy-config").addEventListener("click", async ()=>{
  const text = configText();
  try{
    await navigator.clipboard.writeText(text);
    toastMsg("Sortiment in die Zwischenablage kopiert");
  }catch(e){
    // no clipboard permission: point at the file backup instead
    $("#dlg-share").dataset.open = "no";
    switchTab("settings");
    toastMsg("Kopieren nicht erlaubt. Sicherung als Datei nutzen");
  }
});

$("#open-scan").addEventListener("click", openScan);
$("#close-scan").addEventListener("click", closeScan);
$("#dlg-scan").addEventListener("click", e=>{ if(e.target.id==="dlg-scan") closeScan(); });
$("#apply-pasted").addEventListener("click", ()=>{
  const text = $("#paste-config").value.trim();
  if(!text){ toastMsg("Kein Text eingefügt"); return; }
  applyConfig(text);
});

$("#download-backup").addEventListener("click", downloadBackup);
$("#restore-backup").addEventListener("click", ()=>$("#backup-file").click());
$("#backup-file").addEventListener("change", e=>{
  if(e.target.files[0]) restoreBackupFile(e.target.files[0]);
  e.target.value = "";
});
$("#clear-sales").addEventListener("click", async ()=>{
  const ok = await askConfirm("Buchungen löschen?",
    "Alle "+data.sales.length+" Bons werden gelöscht. Lade dir vorher eine Sicherung herunter, falls du die Zahlen noch brauchst.","Löschen");
  if(!ok) return;
  data.sales = [];
  data.openingFloat = {};
  saveState(); renderAll();
  toastMsg("Buchungen gelöscht");
});
$("#reset-all").addEventListener("click", async ()=>{
  const ok = await askConfirm("Kasse zurücksetzen?",
    "Artikel und Buchungen werden gelöscht, die Kasse startet mit dem Standardsortiment neu.","Zurücksetzen");
  if(!ok) return;
  data = defaults();
  ui.cart = [];
  saveState(); renderAll();
  toastMsg("Kasse zurückgesetzt");
});

// catch an accidental reload while a sale is open
window.addEventListener("beforeunload", e=>{
  if(ui.cart.length){ e.preventDefault(); e.returnValue = ""; }
});

/* ---------- Startup ---------- */
$("#version-line").textContent = "Fassung " + VERSION + ", läuft ohne Internet auf diesem Gerät";
renderThemeButton();
renderFullscreenButton();
keepScreenOn();
$("#in-date").value = dayOf(Date.now());
renderAll();
updateClock();
setInterval(updateClock, 20000);
requestPersistence();
