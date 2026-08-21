import { test } from "node:test";
import assert from "node:assert/strict";
import { beregnKommune, driverTabel } from "../web/beregning.js";
import { land, thisted, greve } from "./fixtures.js";

const naer = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);
const find = (t, navn) => t.find((d) => d.navn === navn);

// GOLDEN: indikatortabellen mod regneark v5, fanen "Drivere".
//
// Testene mod det samlede aftryk i ton er væk, fordi estimatet er væk. Det
// hvilede på fem koefficienter, som ingen af dem kunne kildebelægges - se
// pipeline/constants.py. Indikatorernes værdier er derimod uændrede
// faktuelle tal, og de skal fortsat reproducere regnearket eksakt.

test("GOLDEN — Thisteds indikatorer reproducerer regneark v5", () => {
  const t = driverTabel(thisted, land);
  naer(find(t, "Parcelhus-andel").kommuneVaerdi, 0.7046);
  naer(find(t, "Diesel-andel").kommuneVaerdi, 0.3007);
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
