# Hüttenkasse

Kassensystem für ein Hüttenfest. Läuft auf einem Tablet im Browser, rechnet
Wechselgeld aus, zeichnet Umsätze auf und gibt am Abend eine CSV für Excel aus.
Kein Internet nötig, keine fremden Bibliotheken.

## Die Datei ist das Programm

`kasse.html` ist die einzige Quelle. Sie enthält alles: Stile, Logik, den
QR-Encoder, Bildmarke und Icons. Die Datei lässt sich direkt im Browser öffnen
und funktioniert dann bereits vollständig.

`public/` wird daraus gebaut und ist nicht von Hand zu bearbeiten.

## Befehle

```bash
npm install
npm test      # 150 Prüfungen über drei Suiten
npm run dev   # lokal unter http://localhost:8787
npm run deploy
```

## Warum gehostet

Als lokale Datei fehlen drei Dinge, die auf dem Tablet zählen:

- Kiosk- und Vollbild-Browser öffnen keine `file://`-Adressen.
- `navigator.storage.persist()` greift nur auf einer echten Herkunft. Ohne das
  darf der Browser die Buchungen bei Platzmangel verwerfen.
- Der Kamerazugriff für den QR-Scan ist über HTTPS zuverlässig.

Über HTTPS kommt zusätzlich „Zum Startbildschirm hinzufügen" dazu. Die App
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
etwa 4 mal 4. Dann behält jeder Artikel seinen Platz und Lücken bleiben Lücken,
sodass sich die Anordnung einprägen kann. Angeordnet wird im Reiter „Artikel“.

## Sortiment auf weitere Tablets

Ein Gerät einrichten, die anderen scannen den QR-Code ab. Große Sortimente
werden auf mehrere Codes verteilt, die Reihenfolge beim Scannen ist egal.
Übertragen werden Artikel, Preise, Farben und die Tastenfeld-Aufteilung.

## Der QR-Encoder

Eigenbau, weil eine fremde Bibliothek die Einzeldatei gesprengt hätte. Geprüft
gegen `qrencode` (modulgenau identisch) und `zbarimg` (143 von 143 Codes über
Version 1 bis 23 fehlerfrei zurückgelesen).

## Sprache

Bezeichner und Kommentare im Quelltext sind englisch, alles Sichtbare ist
deutsch. Das gilt auch für Werte, die in der CSV landen.
