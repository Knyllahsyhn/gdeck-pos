/* ============================================================
   REGISTER
   ============================================================ */
function categoryNames(){
  const seen = [];
  data.products.slice().sort((a,b)=>a.sort-b.sort).forEach(p=>{
    const k = (p.category||"Sonstiges").trim();
    if(!seen.includes(k)) seen.push(k);
  });
  return seen;
}

/* Fixed grid shows page tabs up top, otherwise the category filter. */
function renderFilterBar(){
  const target = $("#filter-bar");
  target.innerHTML = "";

  if(hasFixedGrid()){
    const pages = pageCount();
    if(pages <= 1){ target.dataset.empty = "yes"; return; }
    delete target.dataset.empty;
    if(ui.page >= pages) ui.page = pages - 1;
    for(let s=0; s<pages; s++){
      const b = document.createElement("button");
      b.textContent = "Seite " + (s+1);
      b.setAttribute("aria-pressed", ui.page===s ? "true":"false");
      b.addEventListener("click", ()=>{ ui.page = s; renderFilterBar(); renderGrid(); });
      target.appendChild(b);
    }
    return;
  }

  delete target.dataset.empty;
  const all = categoryNames();
  if(!all.includes(ui.categoryFilter)) ui.categoryFilter = "all";
  const makeTab = (val, text) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.setAttribute("aria-pressed", ui.categoryFilter===val ? "true":"false");
    b.addEventListener("click", ()=>{ ui.categoryFilter = val; renderFilterBar(); renderGrid(); });
    target.appendChild(b);
  };
  makeTab("all","Alle");
  all.forEach(k => makeTab(k,k));
}

function productTile(p){
  const inCart = ui.cart.find(z=>z.productId===p.id);
  const b = document.createElement("button");
  b.className = "tile";
  b.style.setProperty("--k", p.color);
  if(inCart) b.dataset.incart = "yes";
  b.innerHTML =
    '<span class="tile-count"></span>' +
    '<span class="tile-name"></span>' +
    '<span class="tile-price"></span>';
  b.querySelector(".tile-name").textContent  = p.name;
  b.querySelector(".tile-price").textContent = money(p.priceCents);
  b.querySelector(".tile-count").textContent = inCart ? inCart.qty : "";
  b.addEventListener("click", ()=> cartAdd(p));
  return b;
}

function renderGrid(){
  const target = $("#grid");
  target.innerHTML = "";

  if(hasFixedGrid()){
    const {columns, rows} = data.grid;
    target.dataset.layout = "fixed";
    // minmax(0,...) instead of a bare 1fr: a plain 1fr never shrinks below the
    // widest word in a key, so a narrow screen pushed the last column out of
    // sight. The row minimum comes from CSS, see --slot-min.
    target.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    target.style.gridTemplateRows    = `repeat(${rows}, minmax(var(--slot-min), 1fr))`;
    const start = ui.page * slotsPerPage();
    for(let i=0; i<slotsPerPage(); i++){
      const p = productAtSlot(start + i);
      if(p) target.appendChild(productTile(p));
      else {
        const blank = document.createElement("div");
        blank.className = "tile-empty";
        blank.setAttribute("aria-hidden", "true");
        target.appendChild(blank);
      }
    }
    return;
  }

  delete target.dataset.layout;
  target.style.gridTemplateColumns = "";
  target.style.gridTemplateRows    = "";
  const list = data.products
    .slice()
    .sort((a,b)=>a.sort-b.sort)
    .filter(p => ui.categoryFilter==="all" || (p.category||"Sonstiges").trim()===ui.categoryFilter);

  if(!list.length){
    const p = document.createElement("p");
    p.className = "grid-hint";
    p.textContent = data.products.length
      ? "In dieser Gruppe steht nichts."
      : "Noch keine Artikel. Lege sie im Reiter „Artikel“ an.";
    target.appendChild(p);
    return;
  }
  list.forEach(p => target.appendChild(productTile(p)));
}

function cartAdd(product){
  const rowEl = ui.cart.find(z=>z.productId===product.id);
  if(rowEl) rowEl.qty++;
  else ui.cart.push({productId:product.id, name:product.name, priceCents:product.priceCents, qty:1});
  renderCart(); renderGrid();
}
function cartChange(productId, delta){
  const i = ui.cart.findIndex(z=>z.productId===productId);
  if(i<0) return;
  ui.cart[i].qty += delta;
  if(ui.cart[i].qty<=0) ui.cart.splice(i,1);
  renderCart(); renderGrid();
}
const cartTotal = () => ui.cart.reduce((s,z)=>s + z.priceCents*z.qty, 0);
const cartCount = () => ui.cart.reduce((s,z)=>s + z.qty, 0);

function renderCart(){
  const target = $("#receipt-lines");
  target.innerHTML = "";
  ui.cart.forEach(z=>{
    const rowEl = document.createElement("div");
    rowEl.className = "receipt-line";
    rowEl.innerHTML =
      '<span class="line-name"></span>' +
      '<span class="line-total"></span>' +
      '<span class="line-controls">' +
        '<button class="line-button" data-act="minus" aria-label="Weniger">-</button>' +
        '<span class="line-qty"></span>' +
        '<button class="line-button" data-act="plus" aria-label="Mehr">+</button>' +
        '<span class="line-unit"></span>' +
      '</span>';
    rowEl.querySelector(".line-name").textContent  = z.name;
    rowEl.querySelector(".line-total").textContent = money(z.priceCents*z.qty);
    rowEl.querySelector(".line-qty").textContent = z.qty;
    rowEl.querySelector(".line-unit").textContent = "à " + money(z.priceCents);
    rowEl.querySelector('[data-act="minus"]').addEventListener("click", ()=>cartChange(z.productId,-1));
    rowEl.querySelector('[data-act="plus"]').addEventListener("click",  ()=>cartChange(z.productId, 1));
    target.appendChild(rowEl);
  });

  const count = cartCount();
  $("#receipt-count").textContent = count===1 ? "1 Artikel" : count+" Artikel";
  $("#receipt-total").textContent  = money(cartTotal());
  $("#clear-cart").disabled     = count===0;
  $("#checkout").disabled  = count===0;
}

