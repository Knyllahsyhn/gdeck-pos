/* ============================================================
   CHECKOUT
   ============================================================ */
function openCheckout(){
  if(!ui.cart.length) return;
  ui.tenderedRaw = "";
  ui.tipOn = false;
  $("#dlg-checkout").dataset.open = "yes";
  renderKeypad();
  renderCheckout();
}
function closeCheckout(){
  $("#dlg-checkout").dataset.open = "no";
}
function renderKeypad(){
  const target = $("#keypad");
  if(target.childElementCount) return;                       // build once
  ["1","2","3","4","5","6","7","8","9","00","0","Korr"].forEach(t=>{
    const b = document.createElement("button");
    b.textContent = t;
    b.addEventListener("click", ()=>{
      if(t==="Korr") ui.tenderedRaw = ui.tenderedRaw.slice(0,-1);
      else if(ui.tenderedRaw.length < 7) ui.tenderedRaw += t;
      renderCheckout();
    });
    target.appendChild(b);
  });
}
function quickValues(total){
  const values = new Set([total]);
  const roundUp = s => [100,500,1000,2000,5000,10000]
    .forEach(step => values.add(Math.ceil(s/step)*step));
  roundUp(total);
  [500,1000,2000,5000].forEach(bill => { if(bill > total) values.add(bill); });
  return Array.from(values).filter(w=>w>=total).sort((a,b)=>a-b).slice(0,6);
}
function breakDown(change){
  const out = [];
  DENOMINATIONS.forEach(([val,name])=>{
    const n = Math.floor(change/val);
    if(n>0){ out.push(n+"x "+name); change -= n*val; }
  });
  return out;
}
function renderCheckout(){
  const total   = cartTotal();
  const tendered = ui.tenderedRaw ? parseInt(ui.tenderedRaw,10) : 0;
  const change    = tendered - total;

  $("#due-amount").textContent   = money(total);
  $("#tendered-amount").textContent = ui.tenderedRaw ? money(tendered) : "-";

  const block   = $("#change-panel");
  const toggle = $("#tip-toggle");
  const target    = $("#change-breakdown");
  target.innerHTML = "";
  block.dataset.tip = "no";

  // only offer a tip when something is actually left over
  const changeAvailable = ui.tenderedRaw !== "" && change > 0;
  toggle.dataset.show = changeAvailable ? "yes":"no";
  if(!changeAvailable) ui.tipOn = false;
  toggle.setAttribute("aria-pressed", ui.tipOn ? "true" : "false");
  toggle.textContent = ui.tipOn
    ? "Trinkgeld " + money(change) + ", antippen zum Aufheben"
    : "Rest als Trinkgeld";

  if(!ui.tenderedRaw){
    block.dataset.short = "yes";
    $("#change-caption").textContent   = "Rückgeld";
    $("#change-amount").textContent  = "-";
  }else if(change < 0){
    block.dataset.short = "yes";
    $("#change-caption").textContent   = "Es fehlen noch";
    $("#change-amount").textContent  = money(-change);
  }else if(ui.tipOn){
    block.dataset.short = "no";
    block.dataset.tip = "yes";
    $("#change-caption").textContent   = "Trinkgeld, nichts zurück";
    $("#change-amount").textContent  = money(change);
  }else{
    block.dataset.short = "no";
    $("#change-caption").textContent   = "Rückgeld";
    $("#change-amount").textContent  = money(change);
    breakDown(change).forEach(t=>{
      const s = document.createElement("span");
      s.textContent = t;
      target.appendChild(s);
    });
  }

  const quickBox = $("#quick-amounts");
  quickBox.innerHTML = "";
  quickValues(total).forEach(w=>{
    const b = document.createElement("button");
    b.textContent = w===total ? "Passend" : money(w);
    if(w===total) b.dataset.exact = "yes";
    b.addEventListener("click", ()=>{ ui.tenderedRaw = String(w); renderCheckout(); });
    quickBox.appendChild(b);
  });

  $("#pay-cash").disabled = ui.tenderedRaw !== "" && change < 0;
}

function recordSale(payment){
  const total   = cartTotal();
  const tendered = ui.tenderedRaw ? parseInt(ui.tenderedRaw,10) : total;
  if(tendered < total){ toastMsg("Der gegebene Betrag reicht nicht"); return; }

  const surplus = tendered - total;
  const tips   = ui.tipOn ? surplus : 0;
  const change   = surplus - tips;

  data.sales.push({
    id: "b" + Date.now() + Math.random().toString(36).slice(2,6),
    ts: Date.now(),
    items: ui.cart.map(z=>({productId:z.productId, name:z.name, priceCents:z.priceCents, qty:z.qty})),
    totalCents: total,
    payment,
    tenderedCents: tendered,
    tipCents: tips,
    changeCents: change,
    voided: false
  });
  saveState();

  ui.cart = [];
  ui.tenderedRaw = "";
  ui.tipOn = false;
  closeCheckout();
  renderCart(); renderGrid();

  const parts = [];
  if(payment === "card") parts.push("Mit Karte gebucht");
  else if(change > 0)  parts.push("Gebucht, " + money(change) + " zurück");
  else                    parts.push("Gebucht, passend");
  if(tips > 0) parts.push(money(tips) + " Trinkgeld");
  toastMsg(parts.join(", "));
}

