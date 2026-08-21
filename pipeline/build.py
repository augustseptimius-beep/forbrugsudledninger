"""Orkestrerer hele datapipelinen. Kør: python3 pipeline/build.py
Skriver web/data/data.json og web/data/sources.json og udskriver en
valideringsrapport til stdout (jf. spec §5.5)."""

import json
import os
import sys

import fetch_dst
import fetch_boligpriser
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
]


def saml_kommune_post(navn, dst_data, boligpriser, kode=None, region=None):
    """Samler ét kommune- (eller land-) objekt i motorens datakontrakt.
    Ren funktion - ingen I/O - så den kan testes uden netværk (Task 10)."""
    post = dict(dst_data.get(navn, {}))
    post["navn"] = navn
    if kode is not None:
        post["kode"] = kode
    if region is not None:
        post["region"] = region
    post["boligpris_m2"] = boligpriser.get(navn)
    post["elco2_g_kwh"] = EL_CO2_MANUAL.get(navn)
    for felt in FORVENTEDE_FELTER:
        post.setdefault(felt, None)
    return post


def find_manglende(post):
    return [felt for felt in FORVENTEDE_FELTER if post.get(felt) is None]


def main():
    print("Henter DST-tabeller (11 tabeller, alle 98 kommuner + land)...")
    dst_data = fetch_dst.fetch_all_dst()
    print(f"  {len(dst_data)} områder hentet.")

    print("Henter Finans Danmark BM010 (boligpriser)...")
    boligpriser = fetch_boligpriser.fetch_boligpris()
    print(f"  {len(boligpriser)} områder hentet.")

    land_post = saml_kommune_post("Hele landet", dst_data, boligpriser)
    kommune_poster = []
    for kode, navn, region in KOMMUNER:
        kommune_poster.append(saml_kommune_post(navn, dst_data, boligpriser, kode=kode, region=region))

    output = {"land": land_post, "kommuner": kommune_poster}
    konstanter_output = dict(KONSTANTER)
    konstanter_output["bilkm_afvigelse_region"] = dict(BILKM_AFVIGELSE_REGION)
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
