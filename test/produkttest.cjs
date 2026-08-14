/* Deckt den Reiter „Artikel“ vollständig ab: anlegen, ändern, verschieben,
   löschen. Genau diese Wege waren zuvor ungetestet. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "kasse.html"), "utf8");

let fehler = 0, geprueft = 0;
function pruefe(name, ist, soll){
  geprueft++;
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if(!ok){ fehler++; console.log(`  FEHLER  ${name}\n          ist:  ${JSON.stringify(ist)}\n          soll: ${JSON.stringify(soll)}`); }
  else console.log(`  ok      ${name}  ${JSON.stringify(ist)}`);
}

const konsole = [];
const dom = new JSDOM(html, {
  runScripts:"dangerously", url:"https://kasse.test/", pretendToBeVisual:true,
  beforeParse(w){
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
    w.HTMLCanvasElement.prototype.getContext = () => ({fillStyle:"",fillRect(){}});
    w.URL.createObjectURL = () => "blob:t"; w.URL.revokeObjectURL = () => {};
    w.Element.prototype.scrollIntoView = function(){};   // von jsdom nicht bereitgestellt
  }
});
dom.virtualConsole.on("jsdomError", e => konsole.push(e.message.split("\n")[0]));

const w = dom.window, d = w.document;
const $ = s => d.querySelector(s);
const klick = el => el.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
const zustand = () => w.eval("data");
const zeilen = () => [...d.querySelectorAll("#product-list .list-row")];
const namen = () => zeilen().map(z => z.querySelector("b").textContent);

function anlegen(name, preis, gruppe){
  $("#in-name").value = name;
  $("#in-price").value = preis;
  $("#in-category").value = gruppe || "Test";
  klick($("#save-product"));
}

setTimeout(() => {
  w.switchTab("products");

  console.log("\n== Anlegen ==");
  const vorher = zustand().products.length;
  anlegen("Kräuterlikör", "2,80", "Schnaps");
  pruefe("Artikel hinzugefügt", zustand().products.length, vorher + 1);
  pruefe("erscheint in der Liste", namen().includes("Kräuterlikör"), true);
  pruefe("Formular geleert", $("#in-name").value, "");

  console.log("\n== Reihenfolge ändern ==");
  const start = namen();
  klick(zeilen()[1].querySelector('[data-act="up"]'));
  pruefe("Hoch vertauscht die ersten beiden", namen().slice(0,2), [start[1], start[0]]);
  klick(zeilen()[0].querySelector('[data-act="down"]'));
  pruefe("Runter macht es rückgängig", namen().slice(0,2), start.slice(0,2));
  pruefe("Hoch in Zeile 1 gesperrt", zeilen()[0].querySelector('[data-act="up"]').disabled, true);
  pruefe("Runter in letzter Zeile gesperrt",
    zeilen()[zeilen().length-1].querySelector('[data-act="down"]').disabled, true);

  console.log("\n== Ändern ==");
  klick(zeilen()[0].querySelector('[data-act="edit"]'));
  pruefe("Name übernommen", $("#in-name").value, "Helles 0,5 l");
  pruefe("Preis in deutscher Schreibweise", $("#in-price").value, "4,50");
  pruefe("Knopf umbenannt", $("#save-product").textContent, "Änderung speichern");
  pruefe("Abbrechen sichtbar", $("#cancel-edit").style.display, "grid");
  // Der Zustand muss unübersehbar sein, sonst benennt der naechste Speichern-
  // Klick versehentlich einen vorhandenen Artikel um.
  pruefe("Formular als Bearbeitung markiert", $("#product-form").dataset.editing, "yes");
  pruefe("Überschrift nennt den Artikel", $("#form-heading").textContent, "Artikel ändern: Helles 0,5 l");

  $("#in-price").value = "5,20";
  klick($("#save-product"));
  pruefe("Preis übernommen",
    zustand().products.find(p=>p.name==="Helles 0,5 l").priceCents, 520);
  pruefe("keine Dublette", zustand().products.filter(p=>p.name==="Helles 0,5 l").length, 1);
  pruefe("Formular wieder im Anlegen-Modus", $("#save-product").textContent, "Artikel anlegen");
  pruefe("Markierung entfernt", $("#product-form").dataset.editing, undefined);
  pruefe("Überschrift zurückgesetzt", $("#form-heading").textContent, "Neuer Artikel");

  console.log("\n== Bearbeiten abbrechen ==");
  klick(zeilen()[2].querySelector('[data-act="edit"]'));
  pruefe("wieder im Bearbeiten-Modus", $("#product-form").dataset.editing, "yes");
  klick($("#cancel-edit"));
  pruefe("Markierung weg", $("#product-form").dataset.editing, undefined);
  pruefe("Felder leer", [$("#in-name").value, $("#in-price").value], ["", ""]);
  const nachAbbruch = zustand().products.length;
  anlegen("Nach Abbruch", "1,10");
  pruefe("danach wird wieder angelegt", zustand().products.length, nachAbbruch + 1);

  console.log("\n== Löschen ==");
  const zuLoeschen = namen()[0];
  const anzahl = zustand().products.length;
  klick(zeilen()[0].querySelector('[data-act="delete"]'));
  pruefe("Rückfrage erscheint", $("#dlg-confirm").dataset.open, "yes");
  klick($("#confirm-no"));
  setTimeout(()=>{
    pruefe("Abbrechen löscht nicht", zustand().products.length, anzahl);

    klick(zeilen()[0].querySelector('[data-act="delete"]'));
    klick($("#confirm-yes"));
    setTimeout(()=>{
      pruefe("Bestätigen löscht", zustand().products.length, anzahl - 1);
      pruefe("aus der Liste verschwunden", namen().includes(zuLoeschen), false);

      console.log("\n== Festes Tastenfeld ==");
      $("#in-columns").value = "4"; $("#in-rows").value = "4";
      $("#in-columns").dispatchEvent(new w.Event("change", {bubbles:true}));
      w.switchTab("products");
      pruefe("Pfeiltasten ausgeblendet",
        zeilen()[0].querySelectorAll('[data-act="up"],[data-act="down"]').length, 0);
      pruefe("Ändern bleibt", !!zeilen()[0].querySelector('[data-act="edit"]'), true);
      klick(zeilen()[0].querySelector('[data-act="edit"]'));
      pruefe("Ändern funktioniert auch hier", $("#product-form").dataset.editing, "yes");
      klick($("#cancel-edit"));
      const vorAnlegen = zustand().products.length;
      anlegen("Im festen Raster", "3,30");
      pruefe("Anlegen funktioniert auch hier", zustand().products.length, vorAnlegen + 1);

      pruefe("keine Konsolenfehler", konsole, []);
      console.log(`\n===== ${geprueft - fehler}/${geprueft} Prüfungen bestanden =====`);
      process.exit(fehler ? 1 : 0);
    }, 20);
  }, 20);
}, 80);
