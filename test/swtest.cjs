/* Prüft den erzeugten Service Worker gegen nachgebaute Browser-Objekte.
   Wichtig ist vor allem: die Installation darf nicht scheitern, sonst gibt es
   auf dem Tablet still keine Offline-Kopie. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const swQuelle = fs.readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8");

let fehler = 0, geprueft = 0;
function pruefe(name, ist, soll){
  geprueft++;
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if(!ok){ fehler++; console.log(`  FEHLER  ${name}\n          ist:  ${JSON.stringify(ist)}\n          soll: ${JSON.stringify(soll)}`); }
  else console.log(`  ok      ${name}  ${JSON.stringify(ist)}`);
}

/* --- Nachbau der benötigten Browser-Schnittstellen --- */
function baueUmgebung({ antwort }){
  let antwortJetzt = antwort;
  const speicher = new Map();          // Cachename -> Map(url -> body)
  const geholt = [];

  class FakeResponse {
    constructor(body, init = {}){
      this.body = body;
      this.status = init.status === undefined ? 200 : init.status;
      this.ok = this.status >= 200 && this.status < 300;
      this.redirected = !!init.redirected;
      this.headers = init.headers || {};
    }
    clone(){ return new FakeResponse(this.body, {status:this.status, redirected:this.redirected}); }
  }

  // Der Browser loest relative Adressen gegen den Geltungsbereich auf und
  // speichert absolut. Genau das muss der Nachbau auch tun, sonst findet
  // match() den Eintrag von add() nicht wieder.
  const absolut = req => new URL(typeof req === "string" ? req : req.url,
                                 "https://kasse.test").href;

  class FakeCache {
    constructor(name){ this.name = name; if(!speicher.has(name)) speicher.set(name, new Map()); }
    get inhalt(){ return speicher.get(this.name); }
    async match(req){
      const b = this.inhalt.get(absolut(req));
      return b === undefined ? undefined : new FakeResponse(b);
    }
    async put(req, res){
      const url = absolut(req);
      // So verhält sich der Browser: weitergeleitete Antworten sind nicht ablegbar.
      if(res.redirected) throw new TypeError("Cache.put() cannot store a redirected response");
      this.inhalt.set(url, res.body);
    }
    async add(url){
      const res = await umgebung.fetch(url);
      if(!res.ok) throw new TypeError("Request failed: " + url);
      await this.put(url, res);
    }
    async addAll(urls){ for(const u of urls) await this.add(u); }
  }

  const wartet = [];
  const zuhoerer = {};
  const umgebung = {
    Response: FakeResponse,
    TypeError,
    URL,
    Promise,
    console,
    caches: {
      _namen: () => [...speicher.keys()],
      async open(name){ return new FakeCache(name); },
      async keys(){ return [...speicher.keys()]; },
      async delete(name){ return speicher.delete(name); },
      async match(req){
        for(const m of speicher.values()){
          const b = m.get(new URL(typeof req === "string" ? req : req.url, "https://kasse.test").href);
          if(b !== undefined) return new FakeResponse(b);
        }
      }
    },
    fetch: async (req) => {
      const url = typeof req === "string" ? req : req.url;
      geholt.push(url);
      return antwortJetzt(url, FakeResponse);
    },
    self: {
      location: { origin: "https://kasse.test" },
      addEventListener: (typ, fn) => { (zuhoerer[typ] ||= []).push(fn); },
      clients: { claim: async () => {} },
      skipWaiting: async () => {}
    }
  };
  umgebung.self.caches = umgebung.caches;
  umgebung.addEventListener = umgebung.self.addEventListener;

  vm.createContext(umgebung);
  vm.runInContext(swQuelle, umgebung);

  const feuern = async (typ, event) => {
    for(const fn of (zuhoerer[typ] || [])) fn(event);
    await Promise.all(wartet.splice(0));
  };
  const machEvent = (extra = {}) => {
    const ev = {
      ...extra,
      waitUntil: p => { wartet.push(Promise.resolve(p).catch(e => e)); },
      respondWith: p => { ev._antwort = Promise.resolve(p); }
    };
    return ev;
  };

  // Erlaubt es, dem Test mitten im Lauf das Netz wegzunehmen.
  const setzeAntwort = fn => { antwortJetzt = fn; };

  return { speicher, geholt, feuern, machEvent, FakeResponse, setzeAntwort };
}

(async () => {
  console.log("\n== Installation bei gesundem Server ==");
  {
    const u = baueUmgebung({ antwort: async (url, R) => new R("inhalt von " + url) });
    const ev = u.machEvent();
    await u.feuern("install", ev);
    const cacheName = [...u.speicher.keys()][0];
    const abgelegt = [...u.speicher.get(cacheName).keys()].sort();
    pruefe("Startseite abgelegt", abgelegt.includes("https://kasse.test/"), true);
    pruefe("alle Nebendateien abgelegt", abgelegt.length, 5);
    pruefe("index.html nicht vorab geholt", u.geholt.includes("/index.html"), false);
  }

  console.log("\n== index.html leitet weiter (der Fall, der uns fast erwischt hätte) ==");
  {
    const u = baueUmgebung({
      antwort: async (url, R) => url === "/index.html"
        ? new R("weitergeleitet", { redirected: true })
        : new R("inhalt von " + url)
    });
    await u.feuern("install", u.machEvent());
    const cacheName = [...u.speicher.keys()][0];
    pruefe("Installation trotzdem erfolgreich", !!cacheName, true);
    pruefe("Startseite trotzdem da", u.speicher.get(cacheName).has("https://kasse.test/"), true);
  }

  console.log("\n== Ein Icon fehlt auf dem Server ==");
  {
    const u = baueUmgebung({
      antwort: async (url, R) => url === "/icon-512.png"
        ? new R("weg", { status: 404 })
        : new R("inhalt von " + url)
    });
    await u.feuern("install", u.machEvent());
    const cacheName = [...u.speicher.keys()][0];
    const inhalt = u.speicher.get(cacheName);
    pruefe("Installation nicht gescheitert", !!cacheName, true);
    pruefe("Startseite da", inhalt.has("https://kasse.test/"), true);
    pruefe("fehlendes Icon ausgelassen", inhalt.has("https://kasse.test/icon-512.png"), false);
    pruefe("übrige Dateien da", inhalt.has("https://kasse.test/manifest.webmanifest"), true);
  }

  console.log("\n== Ausliefern ohne Netz ==");
  {
    const u = baueUmgebung({ antwort: async (url, R) => new R("frisch " + url) });
    await u.feuern("install", u.machEvent());
    u.setzeAntwort(async () => { throw new Error("kein Netz"); });   // Netz kappen
    const ev = u.machEvent({ request: { method: "GET", url: "https://kasse.test/" } });
    await u.feuern("fetch", ev);
    const res = await ev._antwort;
    pruefe("aus dem Cache geliefert", res.body, "frisch /");
    pruefe("Status in Ordnung", res.status, 200);

    // Etwas, das nie im Cache war, muss sauber scheitern statt undefined zu liefern
    const ev2 = u.machEvent({ request: { method: "GET", url: "https://kasse.test/nie-gesehen" } });
    await u.feuern("fetch", ev2);
    const res2 = await ev2._antwort;
    pruefe("unbekannter Pfad ohne Netz", res2.status, 503);
  }

  console.log("\n== Fremde Herkunft wird durchgelassen ==");
  {
    const u = baueUmgebung({ antwort: async (url, R) => new R("x") });
    await u.feuern("install", u.machEvent());
    const ev = u.machEvent({ request: { method: "GET", url: "https://beispiel.de/bild.png" } });
    await u.feuern("fetch", ev);
    pruefe("nicht abgefangen", ev._antwort === undefined, true);
  }

  console.log("\n== Alter Cache wird beim Aktivieren entfernt ==");
  {
    const u = baueUmgebung({ antwort: async (url, R) => new R("x") });
    u.speicher.set("huettenkasse-altealtealte", new Map([["https://kasse.test/", "alt"]]));
    await u.feuern("install", u.machEvent());
    await u.feuern("activate", u.machEvent());
    pruefe("nur noch ein Cache", u.speicher.size, 1);
    pruefe("der alte ist weg", [...u.speicher.keys()].includes("huettenkasse-altealtealte"), false);
  }

  console.log(`\n===== ${geprueft - fehler}/${geprueft} Prüfungen bestanden =====`);
  process.exit(fehler ? 1 : 0);
})();
