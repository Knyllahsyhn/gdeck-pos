/* Runs every suite and fails the build if any check fails.
   Each suite exits non-zero on failure and prints its own tally. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const suites = [
  ["Funktion",   "apptest.cjs"],
  ["Tastenfeld", "layouttest.cjs"],
  ["Speicherung", "speichertest.cjs"]
];

let failed = 0;
for (const [label, file] of suites) {
  const res = spawnSync(process.execPath, [join(here, file)], { encoding: "utf8" });
  const out = (res.stdout || "") + (res.stderr || "");
  const tally = out.match(/=+\s*(\d+)\/(\d+) Prüfungen bestanden\s*=+/);

  if (res.status === 0 && tally) {
    console.log(`  ok      ${label.padEnd(12)} ${tally[1]}/${tally[2]}`);
  } else {
    failed++;
    console.log(`  FEHLER  ${label}`);
    // Only the interesting lines, the suites are chatty on success.
    out.split("\n").filter(l => /FEHLER|Error|Abbruch|=====/.test(l))
       .slice(0, 20).forEach(l => console.log("          " + l.trim()));
  }
}

console.log(failed ? `\n${failed} Suite(n) fehlgeschlagen` : "\nAlle Suiten bestanden");
process.exit(failed ? 1 : 0);
