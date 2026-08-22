/* ============================================================
   PRODUCT MANAGEMENT
   ============================================================ */
function renderColorPicker(){
  const target = $("#color-picker");
  target.innerHTML = "";
  COLORS.forEach(([name,val])=>{
    const b = document.createElement("button");
    b.style.background = val;
    b.title = name;
    b.setAttribute("aria-label", "Farbe " + name);
    b.setAttribute("aria-pressed", newColor===val ? "true":"false");
    b.addEventListener("click", ()=>{ newColor = val; renderColorPicker(); });
    target.appendChild(b);
  });
}

function renderProductList(){
  const target = $("#product-list");
  target.innerHTML = "";
  const list = data.products.slice().sort((a,b)=>a.sort-b.sort);
  $("#product-count").textContent = list.length ? "(" + list.length + ")" : "";

  renderCategoryPicker();

  if(!list.length){
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = "Noch keine Artikel angelegt.";
    target.appendChild(p);
    return;
  }

  list.forEach((p,i)=>{
    const rowEl = document.createElement("div");
    rowEl.className = "list-row";
    rowEl.innerHTML =
      '<span class="color-chip"></span>' +
      '<span class="row-text"><b></b><small></small></span>' +
      '<span class="row-price"></span>' +
      // Line break that only exists on a phone: it puts the buttons on a row
      // of their own instead of letting them squeeze the name.
      '<span class="row-break" aria-hidden="true"></span>' +
      '<button class="button-small" data-act="up" aria-label="Nach oben">Hoch</button>' +
      '<button class="button-small" data-act="down" aria-label="Nach unten">Runter</button>' +
      '<button class="button-small" data-act="edit">Ändern</button>' +
      '<button class="button-small" data-act="delete" aria-label="Löschen">Weg</button>';
    rowEl.querySelector(".color-chip").style.background = p.color;
    rowEl.querySelector("b").textContent = p.name;
    rowEl.querySelector(".row-price").textContent = money(p.priceCents);

    if(hasFixedGrid()){
      // order comes from the keypad, not from this list
      const page = Math.floor((p.slot||0) / slotsPerPage()) + 1;
      const slotNum  = ((p.slot||0) % slotsPerPage()) + 1;
      rowEl.querySelector("small").textContent =
        (p.category || "Sonstiges") + ", Seite " + page + ", Feld " + slotNum;
      rowEl.querySelector('[data-act="up"]').remove();
      rowEl.querySelector('[data-act="down"]').remove();
    }else{
      rowEl.querySelector("small").textContent = p.category || "Sonstiges";
      rowEl.querySelector('[data-act="up"]').disabled   = i===0;
      rowEl.querySelector('[data-act="down"]').disabled = i===list.length-1;
      rowEl.querySelector('[data-act="up"]').addEventListener("click",   ()=>moveProduct(p.id,-1));
      rowEl.querySelector('[data-act="down"]').addEventListener("click", ()=>moveProduct(p.id, 1));
    }
    rowEl.querySelector('[data-act="edit"]').addEventListener("click", ()=>editProduct(p.id));
    rowEl.querySelector('[data-act="delete"]').addEventListener("click", async ()=>{
      const ok = await askConfirm("Artikel löschen?",
        "„"+p.name+"“ verschwindet von der Kasse. Bereits gebuchte Bons bleiben unverändert.","Löschen");
      if(!ok) return;
      data.products = data.products.filter(x=>x.id!==p.id);
      saveState(); renderAll();
      toastMsg("Artikel gelöscht");
    });
    target.appendChild(rowEl);
  });
}

/* ---------- Arrange the keypad ---------- */
function renderArrangeGrid(){
  const section = $("#arrange-section");
  if(!hasFixedGrid()){ section.hidden = true; arrangeSelected = null; return; }
  section.hidden = false;

  const pages = pageCount();
  if(arrangePage >= pages) arrangePage = pages - 1;

  const pagesEl = $("#arrange-pages");
  pagesEl.innerHTML = "";
  if(pages > 1){
    for(let s=0;s<pages;s++){
      const b = document.createElement("button");
      b.textContent = "Seite " + (s+1);
      b.setAttribute("aria-pressed", arrangePage===s ? "true":"false");
      b.addEventListener("click", ()=>{ arrangePage = s; renderArrangeGrid(); });
      pagesEl.appendChild(b);
    }
  }

  const {columns, rows} = data.grid;
  const target = $("#arrange-grid");
  target.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  target.innerHTML = "";
  const start = arrangePage * slotsPerPage();

  for(let i=0;i<slotsPerPage();i++){
    const slot = start + i;
    const p = productAtSlot(slot);
    const f = document.createElement("button");
    f.className = "arrange-slot";
    f.setAttribute("aria-pressed", arrangeSelected === slot ? "true":"false");
    if(p){
      f.style.setProperty("--k", p.color);
      f.innerHTML = '<span class="slot-name"></span><span class="slot-price"></span>';
      f.querySelector(".slot-name").textContent  = p.name;
      f.querySelector(".slot-price").textContent = money(p.priceCents);
      f.setAttribute("aria-label", p.name + ", Platz " + (slot+1));
    }else{
      f.dataset.free = "yes";
      f.textContent = "frei";
      f.setAttribute("aria-label", "Freies Feld, Platz " + (slot+1));
    }
    f.addEventListener("click", ()=> arrangeTap(slot));
    target.appendChild(f);
  }
}

function arrangeTap(slot){
  if(arrangeSelected === null){
    if(!productAtSlot(slot)) return;        // an empty slot has nothing to move
    arrangeSelected = slot;
    renderArrangeGrid();
    return;
  }
  if(arrangeSelected === slot){              // tapping the same slot clears the selection
    arrangeSelected = null;
    renderArrangeGrid();
    return;
  }
  const a = productAtSlot(arrangeSelected);
  const b = productAtSlot(slot);
  if(a) a.slot = slot;
  if(b) b.slot = arrangeSelected;
  arrangeSelected = null;
  saveState();
  renderArrangeGrid();
  renderFilterBar();
  renderGrid();
  toastMsg(b ? "Tasten getauscht" : "Taste verschoben");
}

function moveProduct(id, dir){
  const list = data.products.slice().sort((a,b)=>a.sort-b.sort);
  const i = list.findIndex(p=>p.id===id);
  const j = i + dir;
  if(i<0 || j<0 || j>=list.length) return;
  [list[i].sort, list[j].sort] = [list[j].sort, list[i].sort];
  saveState(); renderAll();
}

/* Leading space, so it can never collide with a typed name: every group name
   is trimmed before it is stored. */
const NEW_CATEGORY = " neue gruppe";

/* Fills the group dropdown with what is already in use, plus one entry for
   starting a new group. Keeps the current choice unless one is passed in. */
function renderCategoryPicker(selected){
  const pick  = $("#in-category-pick");
  const names = categoryNames();
  const want  = selected === undefined ? pick.value : (selected||"").trim();

  pick.innerHTML = "";
  names.forEach(k=>{
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    pick.appendChild(o);
  });
  const fresh = document.createElement("option");
  fresh.value = NEW_CATEGORY; fresh.textContent = "Neue Gruppe anlegen";
  pick.appendChild(fresh);

  pick.value = names.includes(want) ? want
             : (names.length ? names[0] : NEW_CATEGORY);
  applyCategoryChoice();
}

/* The free text field exists only while "new group" is chosen. */
function applyCategoryChoice(){
  const isNew = $("#in-category-pick").value === NEW_CATEGORY;
  $("#in-category").hidden = !isNew;
  if(!isNew) $("#in-category").value = "";
}

/* Typed name wins, otherwise whatever the dropdown shows. */
function chosenCategory(){
  const typed = $("#in-category").value.trim();
  if(typed) return typed;
  const picked = $("#in-category-pick").value;
  return picked && picked !== NEW_CATEGORY ? picked : "Sonstiges";
}

function editProduct(id){
  const p = data.products.find(x=>x.id===id);
  if(!p) return;
  editingId = id;
  newColor = p.color;
  $("#in-name").value     = p.name;
  $("#in-price").value    = csvNum(p.priceCents);       // deutsche Schreibweise
  renderCategoryPicker((p.category || "Sonstiges").trim());
  $("#save-product").textContent = "Änderung speichern";
  $("#cancel-edit").style.display = "grid";
  $("#form-heading").textContent = "Artikel ändern: " + p.name;
  $("#form-note").textContent =
    "Du bearbeitest einen vorhandenen Artikel. Zum Anlegen eines neuen zuerst „Bearbeiten abbrechen“ antippen.";
  $("#product-form").dataset.editing = "yes";
  renderColorPicker();
  $("#in-name").focus();
  $("#in-name").scrollIntoView({block:"start", behavior:"smooth"});
}

function clearProductForm(){
  editingId = null;
  $("#in-name").value = "";
  $("#in-price").value = "";
  $("#save-product").textContent = "Artikel anlegen";
  $("#cancel-edit").style.display = "none";
  $("#form-heading").textContent = "Neuer Artikel";
  $("#form-note").textContent =
    "Der Artikel erscheint sofort als Taste auf der Kasse. Für Pfandrückgabe einen Artikel mit negativem Preis anlegen, zum Beispiel „Pfand zurück“ mit -2,00.";
  delete $("#product-form").dataset.editing;
}

function saveProduct(){
  const name = $("#in-name").value.trim();
  const category = chosenCategory();

  if(!name){ toastMsg("Bezeichnung fehlt"); $("#in-name").focus(); return; }
  const priceCents = parseCents($("#in-price").value);
  if(priceCents === null){ toastMsg("Preis fehlt oder ist keine Zahl"); $("#in-price").focus(); return; }

  if(editingId){
    const p = data.products.find(x=>x.id===editingId);
    Object.assign(p, {name, priceCents, category, color:newColor});
    toastMsg("Artikel geändert");
  }else{
    const maxSort = data.products.reduce((m,p)=>Math.max(m,p.sort), -1);
    data.products.push({
      id:"p"+Date.now()+Math.random().toString(36).slice(2,5),
      name, priceCents, category, color:newColor, sort:maxSort+1
    });
    toastMsg("Artikel angelegt");
  }
  saveState();
  clearProductForm();
  renderAll();
  // Stay on the group just used: several articles of one group in a row is
  // the normal way this form gets filled.
  renderCategoryPicker(category);
}

