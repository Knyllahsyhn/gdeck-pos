/* ============================================================
   RENDERING
   ============================================================ */
function renderGridSetting(){
  $("#in-columns").value = String(data.grid.columns);
  $("#in-rows").value  = String(data.grid.rows);
  $("#in-rows").disabled = !hasFixedGrid();
  const info = $("#grid-info");
  if(!hasFixedGrid()){
    info.textContent = "Die Tasten füllen die Fläche der Reihe nach.";
  }else{
    const slots = slotsPerPage(), pages = pageCount();
    info.textContent = slots + " Tasten je Seite, " +
      (pages === 1 ? "eine Seite" : pages + " Seiten") +
      " für " + data.products.length + " Artikel.";
  }
}

function renderAll(){
  document.documentElement.dataset.theme = data.theme;
  $("#brand-name").textContent = data.businessName || "Hüttenkasse";
  $("#in-business").value = data.businessName || "";
  normalizeSlots();
  renderFilterBar();
  renderGrid();
  renderCart();
  renderColorPicker();
  renderProductList();
  renderArrangeGrid();
  renderGridSetting();
  renderReport();
  renderStorageStatus();
}

function switchTab(target){
  $$(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.target===target ? "true":"false"));
  $$(".view").forEach(s => { if(s.id==="view-"+target) s.dataset.active="yes"; else delete s.dataset.active; });
  if(target==="report") renderReport();
}

function updateClock(){
  $("#brand-clock").textContent = new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
}

