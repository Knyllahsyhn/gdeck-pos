/* ============================================================
   CONFIG TRANSFER
   Only the product range travels, never the sales. The payload
   is deliberately human readable so it can also be sent over a
   messenger and pasted in as a fallback.
   ============================================================ */
/* Bytes per code. It was 450 once, which needs 73 modules, and off a screen
   at arm's length that leaves too little of each module in the camera frame:
   the reader found the code and then could not decode it. Measured over a
   grid of distances, tilts and blurs, 450 bytes read in 24 of 32 shots and
   250 bytes in 28. The price is a few more codes to hold up, and their order
   does not matter. */
const PART_BYTES = 250;

const stripSeparators = s => String(s).replace(/[\t\r\n]/g, " ").trim();

/* HK2 additionally carries the keypad layout and each product's
   slot. HK1 from an older build is still accepted. */
function configText(){
  const rows = [
    "HK2",
    stripSeparators(data.businessName || ""),
    data.grid.columns + "x" + data.grid.rows
  ];
  data.products.slice().sort((a,b)=>a.sort-b.sort).forEach(p=>{
    let colorIdx = COLORS.findIndex(f => f[1] === p.color);
    if(colorIdx < 0) colorIdx = 0;
    rows.push([
      stripSeparators(p.name), p.priceCents, stripSeparators(p.category||"Sonstiges"), colorIdx, p.slot|0
    ].join("\t"));
  });
  return rows.join("\n");
}

function parseConfig(text){
  const rows = String(text).replace(/\r/g,"").split("\n");
  const head = rows[0].trim();
  if(head !== "HK1" && head !== "HK2") return null;
  const businessName = (rows[1] || "").trim();

  let ab = 2, grid = null;
  if(head === "HK2"){
    const m = /^(\d+)x(\d+)$/.exec((rows[2] || "").trim());
    if(!m) return null;
    const columns = parseInt(m[1],10), rowCount = parseInt(m[2],10);
    if(columns > 8 || rowCount < 1 || rowCount > 6) return null;
    grid = {columns, rows:rowCount};
    ab = 3;
  }

  const products = [];
  for(let i=ab;i<rows.length;i++){
    if(!rows[i].trim()) continue;
    const t = rows[i].split("\t");
    if(t.length < 4) return null;
    const price = parseInt(t[1], 10);
    if(!Number.isFinite(price)) return null;
    let colorIdx = parseInt(t[3], 10);
    if(!(colorIdx >= 0 && colorIdx < COLORS.length)) colorIdx = 0;
    const slot = t.length >= 5 ? parseInt(t[4], 10) : products.length;
    products.push({
      name:t[0].trim(), priceCents:price, category:t[2].trim() || "Sonstiges",
      color:COLORS[colorIdx][1], slot: Number.isInteger(slot) && slot >= 0 ? slot : products.length
    });
  }
  if(!products.length) return null;
  return {businessName, products, grid};
}

/* Split on line boundaries so no multi-byte character is cut in half. */
function splitParts(text){
  const byteLen = s => new TextEncoder().encode(s).length;
  const rows = text.split("\n");
  const parts = [];
  let cur = "";
  for(const z of rows){
    const candidate = cur ? cur + "\n" + z : z;
    if(cur && byteLen(candidate) > PART_BYTES){ parts.push(cur); cur = z; }
    else cur = candidate;
  }
  if(cur) parts.push(cur);
  return parts.map((content,i) => `QK${i+1}/${parts.length}\n${content}`);
}

function parsePart(rawText){
  const nl = rawText.indexOf("\n");
  if(nl < 0) return null;
  const head = rawText.slice(0, nl);
  const match = /^QK(\d+)\/(\d+)$/.exec(head.trim());
  if(!match) return null;
  return {num:parseInt(match[1],10), total:parseInt(match[2],10), content:rawText.slice(nl+1)};
}

function drawQr(canvas, text){
  const r = QR.matrix(text);
  const quiet = 4, n = r.size;
  const px = Math.max(2, Math.floor(600/(n + 2*quiet)));
  const side = (n + 2*quiet) * px;
  canvas.width = side; canvas.height = side;
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0,0,side,side);
  g.fillStyle = "#000000";
  for(let y=0;y<n;y++) for(let x=0;x<n;x++)
    if(r.matrix[y][x]) g.fillRect((x+quiet)*px, (y+quiet)*px, px, px);
}

function openShare(){
  const text = configText();
  try{ ui.qrParts = splitParts(text); }
  catch(e){ toastMsg("Sortiment lässt sich nicht übertragen"); return; }
  ui.qrIndex = 0;
  $("#dlg-share").dataset.open = "yes";
  renderShare();
}
function renderShare(){
  const multiple = ui.qrParts.length > 1;
  $("#part-status").textContent = "Code " + (ui.qrIndex+1) + " von " + ui.qrParts.length;
  $("#part-prev").disabled = ui.qrIndex === 0;
  $("#part-next").disabled     = ui.qrIndex >= ui.qrParts.length - 1;
  $("#part-prev").style.visibility = multiple ? "visible" : "hidden";
  $("#part-next").style.visibility     = multiple ? "visible" : "hidden";
  $("#share-note").textContent = multiple
    ? "Am anderen Tablet „QR-Code scannen“ öffnen und alle " + ui.qrParts.length + " Codes nacheinander abfilmen. Die Reihenfolge ist egal."
    : "Am anderen Tablet „QR-Code scannen“ öffnen und diesen Code abfilmen.";
  try{ drawQr($("#qr-canvas"), ui.qrParts[ui.qrIndex]); }
  catch(e){ toastMsg("QR-Code lässt sich nicht erzeugen"); console.error(e); }
}

