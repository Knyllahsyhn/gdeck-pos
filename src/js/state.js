/* ---------- State ----------
   Two kinds, kept apart on purpose. "data" is what survives a reload:
   it is written to storage and restored from it. "ui" is what the
   screen is currently showing and is gone when the tab closes. Every
   read of ui.something says at a glance that nothing is being saved. */
let data = loadState();

const ui = {
  cart: [],                    // [{productId, name, priceCents, qty}]
  categoryFilter: "all",
  page: 0,                     // keypad page on the register
  arrangePage: 0,
  arrangeSlot: null,           // slot picked first while rearranging keys
  editingId: null,
  newColor: COLORS[0][1],
  tenderedRaw: "",             // digits typed at checkout
  tipOn: false,
  confirmResolve: null,
  qrParts: [], qrIndex: 0,     // config sharing
  scanParts: new Map(), scanTotal: 0, scanStream: null, scanRunning: false
};

/* Everything on screen that points at the product range, back to its
   starting point. Called wherever the range is replaced wholesale, so
   that no keypad page, no picked slot and no half-finished edit outlives
   the products it referred to. An open edit is the one that matters: it
   holds a product id, and after a restore that id belongs to a product
   the file never had.

   The scanner fields stay untouched. While a scan is running they belong
   to closeScan(), which also has to stop the camera. */
function resetUi(){
  ui.cart = [];
  ui.categoryFilter = "all";
  ui.page = 0;
  ui.arrangePage = 0;
  ui.arrangeSlot = null;
  clearProductForm();
}

function defaults(){
  return {
    businessName:"Berghütte",
    theme:"night",
    openingFloat:{},           // { "2026-08-14": 15000 }
    lastBackup:0,
    grid:{columns:0, rows:4},   // columns 0 = flowing grid
    products: DEFAULT_PRODUCTS.map((p,i)=>({
      id:"p"+i, name:p[0], priceCents:p[1], category:p[2], color:COLORS[p[3]][1], sort:i, slot:i
    })),
    sales: []
  };
}

/* ------------------------------------------------------------
   Fixed keypad: every product owns a slot that never moves.
   Gaps stay gaps, which is the whole point. Otherwise the keys
   drift around under the operator's fingers.
   ------------------------------------------------------------ */
const hasFixedGrid = () => data.grid && data.grid.columns > 0;
const slotsPerPage     = () => data.grid.columns * data.grid.rows;

function normalizeSlots(){
  const taken = new Set();
  const unplaced = [];
  data.products.slice().sort((a,b)=>a.sort-b.sort).forEach(p=>{
    if(Number.isInteger(p.slot) && p.slot >= 0 && !taken.has(p.slot)) taken.add(p.slot);
    else unplaced.push(p);
  });
  let n = 0;
  unplaced.forEach(p=>{
    while(taken.has(n)) n++;
    p.slot = n;
    taken.add(n);
  });
}

function pageCount(){
  if(!hasFixedGrid()) return 1;
  const highest = data.products.reduce((m,p)=>Math.max(m, p.slot||0), 0);
  return Math.max(1, Math.ceil((highest+1) / slotsPerPage()));
}
const productAtSlot = i => data.products.find(p => p.slot === i) || null;

