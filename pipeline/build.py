"""Orkestrerer hele datapipelinen. Kør: python3 pipeline/build.py

Skriver web/data/{data.json, sources.json, concito.json} og udskriver en
valideringsrapport til stdout.

data.json indeholder udelukkende faktuelle, offentligt tilgængelige nøgletal
pr. kommune. Der er ingen beregningskoefficienter og intet afledt aftryk i
ton - se forklaringen i constants.py. De nationale sammenligningstal, som
kommunetallene holdes op imod, står afskrevet med sidehenvisning i concito.py.

El-data fra Energi Data Service caches på disk, fordi et års timedata for 98
kommuner er 858.000 rækker og tager cirka et kvarter at hente. Kør med
--frisk-el for at omgå cachen."""

import json
import os
import sys

import fetch_dst
import fetch_boligpriser
import fetch_pendling
import fetch_energi
import fetch_klimaregnskabet
import sources
import concito
from constants import PERIODER, EL_CO2_MANUAL
from kommuner import KOMMUNER

DATA_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "data.json")
SOURCES_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "sources.json")
CONCITO_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "concito.json")
EL_CACHE_PATH = os.path.join(os.path.dirname(__file__), ".el_cache.json")
KR_CACHE_PATH = os.path.join(os.path.dirname(__file__), ".kr_cache.json")

FORVENTEDE_FELTER = [
    "disp_indkomst", "folketal", "folketal_forrige", "areal", "formue_gns", "formue_median",
    "gini", "boliger_parcel", "boliger_raekke", "boliger_etage", "boligareal", "byggeri",
    "biler", "biler_el", "biler_plugin", "biler_diesel", "opv_boliger_ialt", "opv_olie",
    "opv_naturgas", "affald_kg", "genanvendelse_pct", "elco2_g_kwh", "boligpris_m2",
    "ve_daekning_pct", "pendlingsafstand_km", "fritidshuse",
    "husholdning_co2_ton", "husholdning_energi_tj", "husholdning_fossil_andel",
]


def saml_kommune_post(navn, dst_data, boligpriser, kode=None, region=None,
                      elco2=None, ve_daekning=None, pendling=None,
                      fritidshuse=None, husholdning=None):
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
    # Faktuel pendlingsafstand i km som DST opgør den. Ingen omregning.
    post["pendlingsafstand_km"] = (pendling or {}).get(navn)
    post["fritidshuse"] = (fritidshuse or {}).get(navn)
    # Husholdningernes eget energiforbrug og udledning. Absolutte tal; motoren
    # fordeler dem på boliger, fordi indbyggertallet ikke rummer
    # fritidsboligernes ejere.
    h = (husholdning or {}).get(kode) or {}
    post["husholdning_co2_ton"] = h.get("co2_ton")
    post["husholdning_energi_tj"] = h.get("energi_tj")
    post["husholdning_fossil_andel"] = h.get("fossil_andel")
    for felt in FORVENTEDE_FELTER:
        post.setdefault(felt, None)
    return post


def _laes_kr_cache():
    if "--frisk-kr" in sys.argv or not os.path.exists(KR_CACHE_PATH):
        return None
    with open(KR_CACHE_PATH, encoding="utf-8") as f:
        d = json.load(f)
    if d.get("aar") != PERIODER["KLIMAREGNSKAB_AAR"]:
        return None
    return {int(k): v for k, v in d["kommuner"].items()}


def _skriv_kr_cache(husholdning):
    with open(KR_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({"aar": PERIODER["KLIMAREGNSKAB_AAR"],
                   "kommuner": {str(k): v for k, v in husholdning.items()}}, f)


def _laes_el_cache():
    """(elco2, ve_daekning, elco2_land, ve_land) eller None.

    Cachen omgås med --frisk-el. Den er et udviklingshjælpemiddel: et års
    timedata for 98 kommuner er 858.000 rækker og tager cirka et kvarter."""
    if "--frisk-el" in sys.argv or not os.path.exists(EL_CACHE_PATH):
        return None
    with open(EL_CACHE_PATH, encoding="utf-8") as f:
        d = json.load(f)
    if d.get("aar") != PERIODER["ELDEKLARATION_AAR"]:
        return None
    return ({int(k): v for k, v in d["elco2"].items()},
            {int(k): v for k, v in d["ve_daekning"].items()},
            d["elco2_land"], d["ve_land"])


def _skriv_el_cache(elco2, ve_daekning, elco2_land, ve_land):
    with open(EL_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({"aar": PERIODER["ELDEKLARATION_AAR"],
                   "elco2": {str(k): v for k, v in elco2.items()},
                   "ve_daekning": {str(k): v for k, v in ve_daekning.items()},
                   "elco2_land": elco2_land, "ve_land": ve_land}, f)


def find_manglende(post):
    return [felt for felt in FORVENTEDE_FELTER if post.get(felt) is None]


def main():
    print("Henter DST-tabeller (11 tabeller, alle 98 kommuner + land)...")
    dst_data = fetch_dst.fetch_all_dst()
    print(f"  {len(dst_data)} områder hentet.")

    print("Henter DST AFSTB4 (gennemsnitlig pendlingsafstand, km)...")
    try:
        pendling = fetch_pendling.fetch_pendlingsafstand()
        print(f"  {len(pendling)} områder hentet.")
    except Exception as fejl:
        # Én manglende tabel må ikke stoppe hele kørslen. Kommunerne får
        # feltet som None og vises med streg.
        print(f"  ADVARSEL: kunne ikke hente AFSTB4 ({fejl}). Feltet står tomt.")
        pendling = {}

    print("Henter Energi Data Service (el-CO2 pr. kommune, forbrugsvægtet)...")
    cache = _laes_el_cache()
    if cache is not None:
        elco2, ve_daekning, elco2_land, ve_land = cache
        print(f"  {len(elco2)} kommuner læst fra cache ({EL_CACHE_PATH}). "
              f"Kør med --frisk-el for at hente forfra.")
    else:
        try:
            dekl = fetch_energi.fetch_deklaration()
            forbrug, lokal_ve, aars = fetch_energi.fetch_kommuneforbrug()
            prisomraade = fetch_energi.prisomraader(KOMMUNER)
            elco2 = fetch_energi.beregn_elco2(forbrug, dekl, prisomraade, lokal_ve)
            ve_daekning = fetch_energi.beregn_ve_daekning(aars)
            forbrug_pr_kommune = {k: f for k, (_ve, f) in aars.items()}
            elco2_land = fetch_energi.landsgennemsnit(elco2, forbrug_pr_kommune)
            # Landets VE-dækning er den samlede lokale produktion sat i forhold
            # til det samlede forbrug - ikke gennemsnittet af 98
            # kommuneprocenter, som ville lade Læsø veje lige så tungt som
            # København.
            samlet_ve = sum(ve for ve, _f in aars.values())
            samlet_forbrug = sum(f for _ve, f in aars.values())
            ve_land = (samlet_ve / samlet_forbrug * 100) if samlet_forbrug else None
            print(f"  {len(elco2)} kommuner beregnet ud fra {len(dekl)} deklarationstimer. "
                  f"Forbrugsvægtet landsgennemsnit: {elco2_land:.1f} g/kWh.")
            _skriv_el_cache(elco2, ve_daekning, elco2_land, ve_land)
        except Exception as fejl:
            # Falder tilbage til de håndaflæste værdier frem for at fejle helt.
            # Motoren viser manglende kommuner som streg, ikke som nul.
            print(f"  ADVARSEL: kunne ikke hente el-data ({fejl}). "
                  "Falder tilbage til manuelle værdier.")
            elco2, ve_daekning, elco2_land, ve_land = {}, {}, None, None

    print("Henter DST BOL101 (fritidshuse)...")
    try:
        fritidshuse = fetch_dst.fetch_fritidshuse()
        print(f"  {len(fritidshuse)} områder hentet.")
    except Exception as fejl:
        print(f"  ADVARSEL: kunne ikke hente fritidshuse ({fejl}). Feltet står tomt.")
        fritidshuse = {}

    print("Henter Klimaregnskabet.dk (husholdningernes energi og udledning)...")
    husholdning = _laes_kr_cache()
    if husholdning is not None:
        print(f"  {len(husholdning)} kommuner læst fra cache. "
              "Kør med --frisk-kr for at hente forfra.")
    else:
        try:
            husholdning = fetch_klimaregnskabet.fetch_husholdninger(
                KOMMUNER, PERIODER["KLIMAREGNSKAB_AAR"])
            print(f"  {len(husholdning)} kommuner hentet.")
            _skriv_kr_cache(husholdning)
        except Exception as fejl:
            # Uden API-nøgle eller ved fejl står felterne tomme og vises med
            # streg. Resten af datasættet er upåvirket.
            print(f"  ADVARSEL: {fejl}. Husholdningsfelterne står tomme.")
            husholdning = {}

    print("Henter Finans Danmark BM010 (boligpriser)...")
    boligpriser = fetch_boligpriser.fetch_boligpris()
    print(f"  {len(boligpriser)} områder hentet.")

    land_post = saml_kommune_post("Hele landet", dst_data, boligpriser, pendling=pendling,
                                  fritidshuse=fritidshuse)
    # Landets husholdningstal er summen af kommunernes, ikke et selvstændigt
    # opslag - så tæller og nævner dækker præcis det samme område.
    def _sum(felt):
        vaerdier = [h.get(felt) for h in husholdning.values() if h.get(felt) is not None]
        return sum(vaerdier) if vaerdier else None

    # Beregnet el-CO2 og VE-dækning for landet. Uden disse falder landsværdien
    # tilbage til EL_CO2_MANUAL's håndaflæste 51,8, mens de 98 kommuner bruger
    # de beregnede tal - så ville hver eneste afvigelse være regnet mod et
    # forkert landsgennemsnit.
    if elco2_land is not None:
        land_post["elco2_g_kwh"] = elco2_land
    if ve_land is not None:
        land_post["ve_daekning_pct"] = ve_land

    land_post["husholdning_co2_ton"] = _sum("co2_ton")
    land_post["husholdning_energi_tj"] = _sum("energi_tj")
    # Landets fossile andel beregnes på de samlede mængder, ikke som
    # gennemsnittet af 98 kommuneandele - ellers ville Læsø veje som København.
    land_post["husholdning_fossil_andel"] = None
    samlet_tj = _sum("energi_tj")
    if samlet_tj:
        fossilt = sum((h.get("energi_tj") or 0) * (h.get("fossil_andel") or 0)
                      for h in husholdning.values())
        land_post["husholdning_fossil_andel"] = fossilt / samlet_tj

    kommune_poster = []
    for kode, navn, region in KOMMUNER:
        kommune_poster.append(saml_kommune_post(
            navn, dst_data, boligpriser, kode=kode, region=region,
            elco2=elco2, ve_daekning=ve_daekning, pendling=pendling,
            fritidshuse=fritidshuse, husholdning=husholdning))

    # Ingen "konstanter" i outputtet: der er ingen beregningskoefficienter
    # tilbage i modellen. De nationale sammenligningstal ligger i concito.json
    # med sidehenvisning.
    output = {"land": land_post, "kommuner": kommune_poster}

    os.makedirs(os.path.dirname(DATA_JSON_PATH), exist_ok=True)
    with open(DATA_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Skrev {DATA_JSON_PATH}")

    with open(SOURCES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(sources.byg_sources(), f, ensure_ascii=False, indent=2)
    print(f"Skrev {SOURCES_JSON_PATH}")

    with open(CONCITO_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(concito.byg_concito(), f, ensure_ascii=False, indent=2)
    print(f"Skrev {CONCITO_JSON_PATH}")

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
