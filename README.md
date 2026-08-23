# Hüttenkasse

Kassensystem für ein Hüttenfest. Läuft auf einem Tablet im Browser, rechnet
Wechselgeld aus, zeichnet Umsätze auf und gibt am Abend eine CSV für Excel aus.
Kein Internet nötig, keine fremden Bibliotheken.

## Aufbau

Der Quelltext liegt in `src/`. `src/index.html` ist das Gerüst und nennt auf
44 Zeilen die Reihenfolge der Teile. Jede Zeile, die nur aus einem Kommentar
mit `@include` besteht, wird beim Bauen durch die genannte Datei ersetzt.

    src/index.html      Kopf, Gerüst, Reihenfolge der Teile
    src/body.html       Markup
    src/css/            tokens (Farben und Maße), shell (Rahmen und Reiter),
                        register (Kasse), manage (Artikel, Berichte,
                        Einstellungen), checkout (Kassieren), responsive
    src/js/qr.js        QR-Encoder und QR-Leser
    src/js/*.js         Anwendung, ein Teil je Aufgabe

`npm run build` setzt daraus `kasse.html` zusammen und baut `public/`. Beide
sind erzeugt und nicht von Hand zu bearbeiten; `kasse.html` liegt deshalb auch
nicht im Repository.

Das gebaute `kasse.html` enthält alles: Stile, Logik, den QR-Baustein, Bildmarke
und Icons. Es lässt sich direkt im Browser öffnen und funktioniert dann bereits
vollständig. Über `file://` holt ein Browser keine getrennten Stylesheets und
Module nach, die ausgelieferte Fassung muss also eine einzige Datei bleiben.

Alle Teile landen in einem einzigen `<script>`-Block und damit im selben
Namensraum. Es gibt kein `import`/`export` und keine Bündelbibliothek.

## Befehle

```bash
npm install
npm test      # 275 Prüfungen über acht Suiten
npm run dev   # lokal unter http://localhost:8787
npm run deploy
```

## Warum gehostet

Als lokale Datei fehlen drei Dinge, die auf dem Tablet zählen:

- Kiosk- und Vollbild-Browser öffnen keine `file://`-Adressen.
- `navigator.storage.persist()` greift nur auf einer echten Herkunft. Ohne das
  darf der Browser die Buchungen bei Platzmangel verwerfen.
- Der Kamerazugriff für den QR-Scan ist über HTTPS zuverlässig.

Über HTTPS kommt zusätzlich „Zum Startbildschirm hinzufügen“ dazu. Die App
startet dann ohne Browserleiste im Vollbild.

Der Service Worker legt alles lokal ab. Nach dem ersten Aufruf läuft die Kasse
auch dann weiter, wenn das Netz auf der Hütte zusammenbricht. Eine neue Fassung
wird im Hintergrund geholt und beim nächsten Start aktiv, damit kein laufender
Abend von einem Update unterbrochen wird.

## Daten

Alles liegt im Browser des jeweiligen Geräts, nichts geht an einen Server.
Buchungen werden doppelt gespeichert, jede Kopie mit Prüfsumme und Zeitstempel;
bricht ein Schreibvorgang ab, überlebt die andere.

Der Browser trennt Daten nach Herkunft. Wer von der lokalen Datei auf die
gehostete Adresse wechselt, nimmt seinen Stand nicht automatisch mit. Dafür
gibt es zwei Wege in den Einstellungen: die Sicherungsdatei nimmt alles mit
(Artikel, Tastenfeld, Buchungen), der QR-Code nur das Sortiment.

## Tastenfeld

Voreingestellt füllen sich die Tasten der Reihe nach auf. Wer es wie an einer
Registrierkasse will, stellt unter Einstellungen eine feste Aufteilung ein,
etwa 4 mal 4. Dann behält jeder Artikel seinen Platz und freie Plätze bleiben
frei, sodass sich die Anordnung einprägen lässt. Angeordnet wird im Reiter
„Artikel“.

## Sortiment auf weitere Tablets

Ein Gerät einrichten, die anderen scannen den QR-Code ab. Große Sortimente
werden auf mehrere Codes verteilt, die Reihenfolge beim Scannen ist egal.
Übertragen werden Artikel, Preise, Farben und die Tastenfeld-Aufteilung.

## Der QR-Baustein

Encoder und Leser sind Eigenbau, weil eine fremde Bibliothek die Einzeldatei zu
groß gemacht hätte. Die Suite `qrtest` schreibt jede der 25 Versionen und liest
sie über ein Bild zurück, liest Codes, die `qrencode` erzeugt hat, und lässt
`zbarimg` unsere eigenen gegenlesen. Dazu zwölf Zustände, wie eine Kamera sie
liefert: gedreht, auf dem Kopf, unscharf, verrauscht, halb im Schatten, schräg
von der Seite, klein im Bild.

## Sprache

Bezeichner und Kommentare im Quelltext sind englisch, alles Sichtbare ist
deutsch. Das gilt auch für Werte, die in der CSV landen.

## Versionen

Die Fassung steht in `src/js/constants.js` als `VERSION`. Sie wird in den
Einstellungen angezeigt und unter jeden Bericht gedruckt, muss also auch ohne
Netz im Dokument stehen. `package.json` führt dieselbe Nummer; weichen beide
voneinander ab, bricht `npm run build` ab.

Gezählt wird nach SemVer. Die zweite Stelle steigt, wenn die Kasse etwas kann,
was sie vorher nicht konnte. Die erste Stelle steigt, wenn ein Speicherstand
aus einer älteren Fassung nicht mehr ohne Zutun eingelesen werden kann.

## Commits

Betreff nach Conventional Commits, in deutscher Sprache und im Imperativ:
`typ(bereich): was geändert wurde`. Als Typ dienen `feat`, `fix`, `refactor`,
`perf`, `test`, `docs`, `ci` und `chore`. Der Bereich benennt den betroffenen
Teil, etwa `qr`, `scan`, `register`, `storage`, `build` oder `deploy`.

Der Betreff sagt, was geändert wurde. Warum es nötig war, steht im Rumpf.

    fix(qr): Ausrichtungsmarke im gedrehten Bild finden

    Der Leser suchte die Marke nur entlang der ungedrehten Achse und gab
    Codes ab etwa 15 Grad Neigung auf.

## Abhängigkeiten

Die Kasse selbst bringt nichts mit. `wrangler` und `jsdom` werden nur zum
Bauen und Prüfen gebraucht.

Dependabot öffnet die Aktualisierungen wöchentlich als Pull Request, jeweils
gebündelt. Eine neu veröffentlichte Fassung wird einen Tag lang liegen
gelassen. Major-Sprünge bei den npm-Paketen sind ausgenommen und bleiben
Handarbeit, weil an `jsdom` die Testsuite und an `wrangler` die Deploy-Kette
hängt. Die Actions in `.github/workflows/deploy.yml` sind auf Commit-Hashes
festgenagelt, der Kommentar dahinter nennt die zugehörige Fassung.
