/* ---------- Helpers ---------- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const moneyFmt = new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
const money = c => moneyFmt.format(c/100);
const csvNum = c => (c/100).toFixed(2).replace(".",",");   // for CSV

/* Accepts "4,50", "4.50", "1.234,50" or "-2" and returns whole cents.
   Returns null on nonsense so the caller can ask again. */
function parseCents(input){
  let s = String(input).trim().replace(/\s/g,"").replace(/€/g,"");
  if(s === "") return null;
  if(s.includes(",") && s.includes(".")) s = s.replace(/\./g,"");   // thousands separators
  s = s.replace(",", ".");
  if(!/^-?\d*\.?\d*$/.test(s)) return null;
  const z = parseFloat(s);
  if(!Number.isFinite(z)) return null;
  return Math.round(z*100);
}
function dayOf(ts){
  const d = new Date(ts);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function timeOf(ts){
  return new Date(ts).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
}
let toastTimer;
function toastMsg(text){
  const el = $("#toast");
  el.textContent = text;
  el.dataset.visible = "yes";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.dataset.visible = "no"; }, 2200);
}
function askConfirm(title, text, yesLabel){
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent  = text;
  $("#confirm-yes").textContent    = yesLabel || "Ja";
  $("#dlg-confirm").dataset.open = "yes";
  return new Promise(res => { confirmResolve = res; });
}
function closeConfirm(answer){
  $("#dlg-confirm").dataset.open = "no";
  if(confirmResolve){ confirmResolve(answer); confirmResolve = null; }
}

