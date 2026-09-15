import { test } from "node:test";
import assert from "node:assert/strict";
import { beregnKommune, driverTabel } from "../web/beregning.js";
import { land, thisted, greve } from "./fixtures.js";

const naer = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);
const find = (t, navn) => t.find((d) => d.navn === navn);

// GOLDEN: indikatortabellen mod fastfrosne referenceværdier.
//
// Testene mod det samlede aftryk i ton er væk, fordi estimatet er væk. Det
// hvilede på fem koefficienter, som ingen af dem kunne kildebelægges - se
// pipeline/constants.py. Indikatorernes værdier er derimod uændrede
// faktuelle tal, og de skal fortsat reproducere referenceværdierne eksakt.

test("GOLDEN — Thisteds indikatorer reproducerer referenceværdierne", () => {
  const t = driverTabel(thisted, land);
  // Parcelhus-andelen (referenceværdi 0,7046) er taget af siden som dublet af
  // boligarealet. Boligtallene bag den indgår fortsat i husholdningstallenes nævner.
  // Fossil-andel afløste Diesel-andel. Dieselandelen (0,3007) er
  // uændret og indgår stadig - det er nu lagt sammen med benzin.
  naer(find(t, "Fossil-andel").kommuneVaerdi, 0.8156);
  naer(find(t, "Biler pr. indbygger").kommuneVaerdi, 0.5557);
});

test("GOLDEN — Thisteds afvigelser fra landsgennemsnittet", () => {
  const t = driverTabel(thisted, land);
  naer(find(t, "Disponibel indkomst").afvigelse, -0.120786);
  assert.equal(find(t, "Disponibel indkomst").retning, "under land");
});

test("GOLDEN — Greve ligger over land på indkomst og byggeri", () => {
  // Greve har modsat profil af Thisted og fanger fortegnsfejl, som en test
  // mod én kommune aldrig kan se.
  const t = driverTabel(greve, land);
  naer(find(t, "Disponibel indkomst").afvigelse, 0.06558);
  assert.equal(find(t, "Disponibel indkomst").retning, "over land");
  assert.ok(find(t, "Byggeaktivitet").afvigelse > 1, "Greve bygger over dobbelt så meget som land");
  assert.equal(find(t, "Byggeaktivitet").retning, "over land");
});

test("GOLDEN — manglende data giver streg, ikke nul", () => {
  const r = beregnKommune(greve, land);
  const affald = find(r.drivere, "Husholdningsaffald");
  assert.equal(affald.kommuneVaerdi, null);
  assert.equal(affald.afvigelse, null);
  assert.equal(affald.retning, "kontekst");
  assert.ok(r.manglende.includes("affald_kg"));
});
