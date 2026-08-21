"""Orkestrerer hele datapipelinen. Kør: python3 pipeline/build.py
Skriver web/data/data.json og web/data/sources.json og udskriver en
valideringsrapport til stdout (jf. spec §5.5)."""

import json
import os
import sys

import fetch_dst
import fetch_boligpriser
import fetch_pendling
import fetch_energi
import sources
from constants import KONSTANTER, BILKM_AFVIGELSE_REGION, EL_CO2_MANUAL
from kommuner import KOMMUNER

DATA_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "data.json")
SOURCES_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "sources.json")

FORVENTEDE_FELTER = [
    "disp_indkomst", "folketal", "folketal_forrige", "areal", "formue_gns", "formue_median",
    "gini", "boliger_parcel", "boliger_raekke", "boliger_etage", "boligareal", "byggeri",
    "biler", "biler_el", "biler_plugin", "biler_diesel", "opv_boliger_ialt", "opv_olie",
    "opv_naturgas", "affald_kg", "genanvendelse_pct", "elco2_g_kwh", "boligpris_m2",
    "ve_daekning_pct", "bilkm_afvigelse",
]


def saml_kommune_post(navn, dst_data, boligpriser, kode=None, region=None,
                      elco2=None, ve_daekning=None, bilkm_kommune=None):
    """Samler ét kommune- (eller land-) objekt i motorens datakontrakt.
    Ren funktion - ingen I/O - så den kan testes uden netværk (Task 10)."""
    post = dict(dst_data.get(navn, {}))
    post["navn"] = navn
    if kode is not None:
        post["kode"] = kode
    if region is not None:
        post["region"] = region
    post["boligpris_m2"] = boligpriser.get(navn)
    # Beregnet værdi vinder over den håndaflæste; EL_CO2_MANUAL er nu kun
    # et sikkerhedsnet, hvis Energi Data Service ikke svarer.
    beregnet = (elco2 or {}).get(kode)
    post["elco2_g_kwh"] = beregnet if beregnet is not None else EL_CO2_MANUAL.get(navn)
    post["ve_daekning_pct"] = (ve_daekning or {}).get(kode)
    # Kommunens egen bil-km-afvigelse. Mangler den, falder motoren tilbage til
    # regionens værdi i konstanterne - og er også den ukendt, vises transporten
    # som ikke opgjort frem for som nul.
    post["bilkm_afvigelse"] = (bilkm_kommune or {}).get(kode)
    for felt in FORVENTEDE_FELTER:
        post.setdefault(felt, None)
    return post


def find_manglende(post):
    return [felt for felt in FORVENTEDE_FELTER if post.get(felt) is None]


def main():
    print("Henter DST-tabeller (11 tabeller, alle 98 kommuner + land)...")
    dst_data = fetch_dst.fetch_all_dst()
    print(f"  {len(dst_data)} områder hentet.")

    print("Henter DST AFSTB4 (pendlingsafstand -> regional bil-km-afvigelse)...")
    try:
        afstande = fetch_pendling.fetch_pendlingsafstand()
        bilkm, kalibrering = fetch_pendling.beregn_bilkm_afvigelse(afstande)
        bilkm_kommune = fetch_pendling.beregn_bilkm_afvigelse_kommune(
            afstande, kalibrering, KOMMUNER)
        print(f"  {len(bilkm)} regioner og {len(bilkm_kommune)} kommuner, "
              f"kalibreringsfaktor {kalibrering:.4f} mod DTU's Nordjylland.")
    except Exception as fejl:
        # Falder tilbage til den håndskrevne DTU-værdi frem for at udgive et
        # datasæt uden transporttal, hvis DST er nede ved den årlige kørsel.
        print(f"  ADVARSEL: kunne ikke hente AFSTB4 ({fejl}). Falder tilbage til kun Nordjylland.")
        bilkm, bilkm_kommune = dict(BILKM_AFVIGELSE_REGION), {}

    print("Henter Energi Data Service (el-CO2 pr. kommune, forbrugsvægtet)...")
    try:
        dekl = fetch_energi.fetch_deklaration()
        forbrug, lokal_ve, aars = fetch_energi.fetch_kommuneforbrug()
        prisomraade = fetch_energi.prisomraader(KOMMUNER)
        elco2 = fetch_energi.beregn_elco2(forbrug, dekl, prisomraade, lokal_ve)
        ve_daekning = fetch_energi.beregn_ve_daekning(aars)
        forbrug_pr_kommune = {k: f for k, (_ve, f) in aars.items()}
        elco2_land = fetch_energi.landsgennemsnit(elco2, forbrug_pr_kommune)
        # Landets VE-dækning er den samlede lokale produktion sat i forhold til
        # det samlede forbrug - ikke gennemsnittet af 98 kommuneprocenter, som
        # ville lade Læsø veje lige så tungt som København.
        samlet_ve = sum(ve for ve, _f in aars.values())
        samlet_forbrug = sum(f for _ve, f in aars.values())
        ve_land = (samlet_ve / samlet_forbrug * 100) if samlet_forbrug else None
        print(f"  {len(elco2)} kommuner beregnet ud fra {len(dekl)} deklarationstimer. "
              f"Forbrugsvægtet landsgennemsnit: {elco2_land:.1f} g/kWh.")
    except Exception as fejl:
        # Falder tilbage til de to håndaflæste værdier frem for at fejle helt.
        # Motoren viser manglende kommuner som streg, ikke som nul.
        print(f"  ADVARSEL: kunne ikke hente el-data ({fejl}). Falder tilbage til manuelle værdier.")
        elco2, ve_daekning, elco2_land, ve_land = {}, {}, None, None

    print("Henter Finans Danmark BM010 (boligpriser)...")
    boligpriser = fetch_boligpriser.fetch_boligpris()
    print(f"  {len(boligpriser)} områder hentet.")

    land_post = saml_kommune_post("Hele landet", dst_data, boligpriser)
    if elco2_land is not None:
        land_post["elco2_g_kwh"] = elco2_land
    if ve_land is not None:
        land_post["ve_daekning_pct"] = ve_land
    kommune_poster = []
    for kode, navn, region in KOMMUNER:
        kommune_poster.append(saml_kommune_post(
            navn, dst_data, boligpriser, kode=kode, region=region,
            elco2=elco2, ve_daekning=ve_daekning, bilkm_kommune=bilkm_kommune))

    output = {"land": land_post, "kommuner": kommune_poster}
    konstanter_output = dict(KONSTANTER)
    konstanter_output["bilkm_afvigelse_region"] = bilkm
    output["konstanter"] = konstanter_output

    os.makedirs(os.path.dirname(DATA_JSON_PATH), exist_ok=True)
    with open(DATA_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Skrev {DATA_JSON_PATH}")

    with open(SOURCES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(sources.byg_sources(), f, ensure_ascii=False, indent=2)
    print(f"Skrev {SOURCES_JSON_PATH}")

    # --- Valideringsrapport ---
    print("\n--- Valideringsrapport ---")
    manglende_kerne = 0
    manglende_felter_total = {}
    for post in [land_post] + kommune_poster:
        manglende = find_manglende(post)
        for felt in manglende:
            manglende_felter_total[felt] = manglende_felter_total.get(felt, 0) + 1
        if any(f in ("disp_indkomst", "biler", "byggeri") for f in manglende):
            manglende_kerne += 1
    print(f"Kommuner med manglende kerne-input (utilstrækkeligt datagrundlag): {manglende_kerne}")
    for felt, antal in sorted(manglende_felter_total.items(), key=lambda x: -x[1]):
        print(f"  {felt}: mangler for {antal} områder")

    thisted = next(p for p in kommune_poster if p["navn"] == "Thisted")
    print("\nSanity-check Thisted mod v5-regneark (facit i parentes):")
    print(f"  disp_indkomst = {thisted['disp_indkomst']} (252934)")
    print(f"  folketal = {thisted['folketal']} (42572)")
    print(f"  biler_diesel = {thisted['biler_diesel']} (7114)")
    print(f"  boligpris_m2 = {thisted['boligpris_m2']} (7430)")

    if manglende_kerne > 0:
        print(f"\nADVARSEL: {manglende_kerne} områder mangler kerne-input og vil vise "
              "'utilstrækkeligt datagrundlag' i widget'en.")
        sys.exit(1)


if __name__ == "__main__":
    main()
