/* ============================================================
   BACKUP
   ============================================================ */
function downloadBackup(){
  data.lastBackup = Date.now();
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Kassensicherung_" + dayOf(Date.now()) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  saveState();
  toastMsg("Sicherung gespeichert");
}
function restoreBackupFile(file){
  const reader = new FileReader();
  reader.onload = async ()=>{
    let fresh;
    try{ fresh = JSON.parse(reader.result); }
    catch(e){ toastMsg("Datei ist keine gültige Sicherung"); return; }
    if(!fresh || !Array.isArray(fresh.products) || !Array.isArray(fresh.sales)){
      toastMsg("Datei ist keine gültige Sicherung"); return;
    }
    const ok = await askConfirm("Sicherung einspielen?",
      "Die aktuellen Artikel und Buchungen werden durch die Datei ersetzt ("+
      fresh.products.length+" Artikel, "+fresh.sales.length+" Bons).","Einspielen");
    if(!ok) return;
    data = Object.assign(defaults(), fresh);
    ui.cart = [];
    saveState(); renderAll();
    toastMsg("Sicherung eingespielt");
  };
  reader.readAsText(file);
}

