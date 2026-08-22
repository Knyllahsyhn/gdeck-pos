/* ============================================================
   REPORTS
   ============================================================ */
function salesOnDay(day){
  return data.sales.filter(b => dayOf(b.ts)===day).sort((a,b)=>a.ts-b.ts);
}

function renderReport(){
  const day  = $("#in-date").value || dayOf(Date.now());
  const all = salesOnDay(day);
  const valid = all.filter(b=>!b.voided);

  const revenue = valid.reduce((s,b)=>s+b.totalCents,0);
  const bar    = valid.filter(b=>b.payment==="cash").reduce((s,b)=>s+b.totalCents,0);
  const karte  = valid.filter(b=>b.payment==="card").reduce((s,b)=>s+b.totalCents,0);
  const tips    = valid.reduce((s,b)=>s+(b.tipCents||0),0);
  const cashTips = valid.filter(b=>b.payment==="cash").reduce((s,b)=>s+(b.tipCents||0),0);
  const average = valid.length ? Math.round(revenue/valid.length) : 0;
  const float = data.openingFloat[day] || 0;

  const statRows = [
    ["Umsatz", money(revenue), "aktion"],
    ["Bons", String(valid.length), ""],
    ["Bar", money(bar), ""],
    ["Karte", money(karte), ""],
    ["Trinkgeld", money(tips), ""],
    ["Ø je Bon", money(average), ""],
    ["Soll in der Kasse", money(float + bar + cashTips), ""]
  ];
  const statsBefore = $("#stats");
  statsBefore.innerHTML = "";
  statRows.forEach(([label,val,ton])=>{
    const d = document.createElement("div");
    d.className = "stat";
    if(ton) d.dataset.tone = ton;
    d.innerHTML = '<div class="stat-label"></div><div class="stat-value"></div>';
    d.querySelector(".stat-label").textContent = label;
    d.querySelector(".stat-value").textContent  = val;
    statsBefore.appendChild(d);
  });

  // sales per product
  const perProduct = new Map();
  valid.forEach(b => b.items.forEach(p=>{
    const e = perProduct.get(p.name) || {qty:0, total:0};
    e.qty += p.qty;
    e.total += p.qty * p.priceCents;
    perProduct.set(p.name, e);
  }));
  const productRows = Array.from(perProduct.entries()).sort((a,b)=>b[1].total-a[1].total);

  const tableProducts = $("#table-products");
  if(!productRows.length){
    tableProducts.innerHTML = '<tbody><tr><td style="color:var(--text-muted)">An diesem Tag wurde nichts gebucht.</td></tr></tbody>';
  }else{
    let html = '<thead><tr><th>Artikel</th><th class="num">Anzahl</th><th class="num">Umsatz</th></tr></thead><tbody>';
    productRows.forEach(([name,e])=>{
      html += '<tr><td>'+escapeHtml(name)+'</td><td class="num">'+e.qty+'</td><td class="num">'+money(e.total)+'</td></tr>';
    });
    html += '<tr><td><b>Gesamt</b></td><td class="num"><b>'+
            productRows.reduce((s,[,e])=>s+e.qty,0)+'</b></td><td class="num"><b>'+money(revenue)+'</b></td></tr>';
    tableProducts.innerHTML = html + '</tbody>';
  }

  // list of sales
  const tableSales = $("#table-sales");
  if(!all.length){
    tableSales.innerHTML = '<tbody><tr><td style="color:var(--text-muted)">Keine Bons an diesem Tag.</td></tr></tbody>';
  }else{
    const tbody = document.createElement("tbody");
    const head = document.createElement("thead");
    head.innerHTML = '<tr><th>Zeit</th><th>Artikel</th><th>Zahlart</th><th class="num">Summe</th><th class="num">Trinkgeld</th><th></th></tr>';
    all.slice().reverse().forEach(b=>{
      const tr = document.createElement("tr");
      if(b.voided) tr.dataset.void = "yes";
      const content = b.items.map(p=>p.qty+"x "+p.name).join(", ");
      tr.innerHTML =
        '<td class="num">'+timeOf(b.ts)+'</td>' +
        '<td>'+escapeHtml(content)+'</td>' +
        '<td>'+(b.payment==="card"?"Karte":"Bar")+'</td>' +
        '<td class="num">'+money(b.totalCents)+'</td>' +
        '<td class="num">'+(b.tipCents ? money(b.tipCents) : "-")+'</td>' +
        '<td></td>';
      if(!b.voided){
        const btn = document.createElement("button");
        btn.className = "button-small";
        btn.textContent = "Stornieren";
        btn.addEventListener("click", async ()=>{
          const ok = await askConfirm("Bon stornieren?",
            "Der Bon über "+money(b.totalCents)+" von "+timeOf(b.ts)+
            " zählt dann nicht mehr zum Umsatz, bleibt aber in der Liste stehen.","Stornieren");
          if(!ok) return;
          b.voided = true;
          saveState(); renderReport();
          toastMsg("Bon storniert");
        });
        tr.lastElementChild.appendChild(btn);
      }
      tbody.appendChild(tr);
    });
    tableSales.innerHTML = "";
    tableSales.appendChild(head);
    tableSales.appendChild(tbody);
  }

  $("#in-float").value = float ? csvNum(float) : "";
}
function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, z => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[z]));
}

/* ---------- CSV ---------- */
function csvField(w){
  const s = String(w);
  return /[";\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function csvDownload(rows, name){
  const content = "﻿" + rows.map(z=>z.map(csvField).join(";")).join("\r\n");
  const blob = new Blob([content], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toastMsg("CSV gespeichert");
}

function exportReport(){
  const day  = $("#in-date").value || dayOf(Date.now());
  const all = salesOnDay(day);
  const valid = all.filter(b=>!b.voided);
  const revenue = valid.reduce((s,b)=>s+b.totalCents,0);
  const bar    = valid.filter(b=>b.payment==="cash").reduce((s,b)=>s+b.totalCents,0);
  const karte  = valid.filter(b=>b.payment==="card").reduce((s,b)=>s+b.totalCents,0);
  const tips    = valid.reduce((s,b)=>s+(b.tipCents||0),0);
  const cashTips = valid.filter(b=>b.payment==="cash").reduce((s,b)=>s+(b.tipCents||0),0);
  const float = data.openingFloat[day] || 0;

  const z = [];
  z.push([data.businessName, "Tagesabschluss", day]);
  z.push(["erstellt mit", "KNYL Hüttenkasse " + VERSION,
          new Date().toLocaleString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})]);
  z.push([]);
  z.push(["Umsatz gesamt", csvNum(revenue)]);
  z.push(["davon bar", csvNum(bar)]);
  z.push(["davon Karte", csvNum(karte)]);
  z.push(["Trinkgeld gesamt", csvNum(tips)]);
  z.push(["davon bar", csvNum(cashTips)]);
  z.push(["Anzahl Bons", valid.length]);
  z.push(["Stornierte Bons", all.length - valid.length]);
  z.push(["Wechselgeld zu Beginn", csvNum(float)]);
  z.push(["Soll-Bestand Kasse", csvNum(float + bar + cashTips)]);
  z.push([]);
  z.push(["Artikel","Anzahl","Einzelpreis","Umsatz"]);

  const perProduct = new Map();
  valid.forEach(b => b.items.forEach(p=>{
    const e = perProduct.get(p.name) || {qty:0, total:0, price:p.priceCents};
    e.qty += p.qty;
    e.total += p.qty * p.priceCents;
    perProduct.set(p.name, e);
  }));
  Array.from(perProduct.entries())
    .sort((a,b)=>b[1].total-a[1].total)
    .forEach(([name,e]) => z.push([name, e.qty, csvNum(e.price), csvNum(e.total)]));

  z.push([]);
  z.push(["Zeit","Zahlart","Summe","Trinkgeld","Gegeben","Rückgeld","Storniert","Artikel"]);
  all.forEach(b => z.push([
    timeOf(b.ts),
    b.payment==="card" ? "Karte" : "Bar",
    csvNum(b.totalCents), csvNum(b.tipCents||0), csvNum(b.tenderedCents), csvNum(b.changeCents),
    b.voided ? "ja" : "nein",
    b.items.map(p=>p.qty+"x "+p.name).join(", ")
  ]));

  csvDownload(z, "Tagesabschluss_"+day+".csv");
}

function exportLineItems(){
  const day  = $("#in-date").value || dayOf(Date.now());
  const all = salesOnDay(day);
  const z = [["Datum","Zeit","Bon-Nr","Artikel","Anzahl","Einzelpreis","Zeilensumme","Zahlart","Storniert"]];
  all.forEach((b,i) => b.items.forEach(p => z.push([
    day, timeOf(b.ts), i+1, p.name, p.qty,
    csvNum(p.priceCents), csvNum(p.priceCents*p.qty),
    b.payment==="card" ? "Karte" : "Bar",
    b.voided ? "ja" : "nein"
  ])));
  if(z.length===1){ toastMsg("An diesem Tag gibt es nichts zu exportieren"); return; }
  csvDownload(z, "Einzelposten_"+day+".csv");
}

