/* ============================================================
   All amounts are whole cents. Floating point would introduce
   rounding errors that do not add up at the end of the night.
   ============================================================ */

const VERSION  = "1.0";
const STORE_KEY  = "knyl.pos.v1";
const MIRROR_KEY = "knyl.pos.v1.mirror";
// Keys used before the rename; still read so no data is lost on upgrade.
const LEGACY_KEYS = ["huettenkasse.v1", "huettenkasse.v1.spiegel"];
const COLORS = [
  ["Bernstein","var(--enamel-amber)"], ["Rot","var(--enamel-red)"],
  ["Kobalt","var(--enamel-cobalt)"],       ["Grün","var(--enamel-green)"],
  ["Kupfer","var(--enamel-copper)"],       ["Pflaume","var(--enamel-plum)"],
  ["Schiefer","var(--enamel-slate)"],   ["Messing","var(--enamel-brass)"]
];
const DENOMINATIONS = [
  [10000,"100 €"],[5000,"50 €"],[2000,"20 €"],[1000,"10 €"],[500,"5 €"],
  [200,"2 €"],[100,"1 €"],[50,"50 ct"],[20,"20 ct"],[10,"10 ct"],[5,"5 ct"],[2,"2 ct"],[1,"1 ct"]
];

const DEFAULT_PRODUCTS = [
  ["Helles 0,5 l",450,"Bier",0],   ["Radler 0,5 l",450,"Bier",0],
  ["Weißbier 0,5 l",480,"Bier",0], ["Alkoholfrei 0,5 l",420,"Bier",0],
  ["Cola 0,33 l",300,"Alkoholfrei",2], ["Spezi 0,5 l",350,"Alkoholfrei",2],
  ["Apfelschorle 0,5 l",350,"Alkoholfrei",2], ["Wasser 0,5 l",250,"Alkoholfrei",2],
  ["Weißwein 0,2 l",450,"Wein",1], ["Weinschorle 0,25 l",400,"Wein",1],
  ["Rotwein 0,2 l",450,"Wein",1],  ["Sekt 0,1 l",350,"Wein",1],
  ["Obstler 2 cl",250,"Schnaps",4], ["Kräuter 2 cl",250,"Schnaps",4],
  ["Jagertee",400,"Schnaps",4],
  ["Kaffee",250,"Warm",5], ["Tee",250,"Warm",5],
  ["Wurstsemmel",400,"Essen",3], ["Käsebrot",450,"Essen",3],
  ["Pfand zurück",-200,"Pfand",6]
];

