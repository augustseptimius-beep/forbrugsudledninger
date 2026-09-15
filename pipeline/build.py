"""Orkestrerer hele datapipelinen. Kør: python3 pipeline/build.py

Skriver web/data/{data.json, sources.json, concito.json, ens.json} og udskriver en
valideringsrapport til stdout.

data.json indeholder udelukkende faktuelle, offentligt tilgængelige nøgletal
pr. kommune. Der er ingen beregningskoefficienter og intet afledt aftryk i
ton - se forklaringen i constants.py. De nationale sammenligningstal, som
kommunetallene holdes op imod, står afskrevet med sidehenvisning i concito.py.

Klimaregnskabet.dk caches på disk, fordi kilden kræver et kald pr. kommune.
Kør med --frisk-kr for at omgå cachen."""

import json
import os
import sys

import fetch_dst
import fetch_pendling
import fetch_klimaregnskabet
import sources
import concito
import ens
from constants import PERIODER
from kommuner import KOMMUNER

DATA_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "data.json")
SOURCES_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "sources.json")
CONCITO_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "concito.json")
ENS_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "ens.json")
KR_CACHE_PATH = os.path.join(os.path.dirname(__file__), ".kr_cache.json")

FORVENTEDE_FELTER = [
    "disp_indkomst", "folketal", "folketal_forrige",
    "gini", "boliger_parcel", "boliger_raekke", "boliger_etage", "boligareal", "byggeri",
    "biler", "biler_el", "biler_plugin", "biler_diesel", "biler_benzin",
    "opv_boliger_ialt", "opv_olie",
    "opv_naturgas", "affald_kg", "genanvendelse_pct",
    "pendlingsafstand_km", "fritidshuse",
    "husholdning_co2_ton", "husholdning_energi_tj", "husholdning_fossil_andel",
    "husholdning_el_tj", "husholdning_el_co2_ton",
    "husholdning_fjernvarme_tj", "husholdning_fjernvarme_co2_ton",
]


def saml_kommune_post(navn, dst_data, kode=None, region=None,
                      pendling=None,
                      fritidshuse=None, husholdning=None, affald_indberetning=None):
    """Samler ét kommune- (eller land-) objekt i motorens datakontrakt.
    Ren funktion - ingen I/O - så den kan testes uden netværk (Task 10)."""
    post = dict(dst_data.get(navn, {}))
    post["navn"] = navn
    if kode is not None:
        post["kode"] = kode
    if region is not None:
        post["region"] = region
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
    # Strøm og fjernvarme hver for sig. Motoren regner strømmen med landets
    # fælles faktor, fordi Klimaregnskabets el-faktor er kommunens egen
    # produktion - se fetch_klimaregnskabet.EL_KILDER.
    for felt in ("el_tj", "el_co2_ton", "fjernvarme_tj", "fjernvarme_co2_ton"):
        post[f"husholdning_{felt}"] = h.get(felt)
    # Hvor meget affaldstallene kan bære for netop denne kommune. None er den
    # normale tilstand ("intet at bemærke") og må derfor IKKE med i
    # FORVENTEDE_FELTER - der ville den blive talt som manglende data for de
    # 85 kommuner, hvor alt er i orden.
    post["affald_indberetning"] = (affald_indberetning or {}).get(navn)
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
    # En cache fra før el og fjernvarme blev læst ud hver for sig mangler
    # felterne og skal hentes forfra.
    if any("el_tj" not in v for v in d["kommuner"].values()):
        return None
    return {int(k): v for k, v in d["kommuner"].items()}


def _skriv_kr_cache(husholdning):
    with open(KR_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({"aar": PERIODER["KLIMAREGNSKAB_AAR"],
                   "kommuner": {str(k): v for k, v in husholdning.items()}}, f)


def find_manglende(post):
    return [felt for felt in FORVENTEDE_FELTER if post.get(felt) is None]


def main():
    print("Henter DST-tabeller (9 tabeller, alle 98 kommuner + land)...")
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

    # Affaldsindberetningens pålidelighed pr. kommune. Fejler hentningen, står
    # feltet tomt for alle, og motoren viser retningen som før - tjekket må ikke
    # kunne vælte en hel datahentning.
    print("Klassificerer affaldsindberetningen pr. kommune...")
    try:
        _aar = int(PERIODER["AFFALD_AAR"])
        _sammensaetning = fetch_dst.fetch_affald_sammensaetning(_aar)
        affald_indberetning = fetch_dst.klassificer_affald(
            fetch_dst.fetch_affald_validitet(_aar, _aar - 1), _sammensaetning)
        _selskaber = fetch_dst.spaerrede_selskaber(_sammensaetning)
        print(f"  {sum(1 for v in affald_indberetning.values() if v)} kommuner med forbehold.")
    except Exception as fejl:
        affald_indberetning, _selskaber = {}, {}
        print(f"  ADVARSEL: kunne ikke hente LABY24 ({fejl}). Alle står uden forbehold.")

    land_post = saml_kommune_post("Hele landet", dst_data, pendling=pendling,
                                  fritidshuse=fritidshuse)
    # Landets husholdningstal er summen af kommunernes, ikke et selvstændigt
    # opslag - så tæller og nævner dækker præcis det samme område.
    def _sum(felt):
        vaerdier = [h.get(felt) for h in husholdning.values() if h.get(felt) is not None]
        return sum(vaerdier) if vaerdier else None

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
    # Landets el og fjernvarme er ligeledes summen af kommunernes. Motorens
    # fælles el-faktor er landets el-udledning delt med landets elforbrug.
    for felt in ("el_tj", "el_co2_ton", "fjernvarme_tj", "fjernvarme_co2_ton"):
        land_post[f"husholdning_{felt}"] = _sum(felt)

    kommune_poster = []
    for kode, navn, region in KOMMUNER:
        kommune_poster.append(saml_kommune_post(
            navn, dst_data, kode=kode, region=region,
            pendling=pendling,
            fritidshuse=fritidshuse, husholdning=husholdning,
            affald_indberetning=affald_indberetning))

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

    with open(ENS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(ens.byg_ens(), f, ensure_ascii=False, indent=2)
    print(f"Skrev {ENS_JSON_PATH}")

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

    # Affaldets kommunefordeling: se fetch_affald_validitet for baggrunden.
    # Rapporten dømmer ikke - den lægger tallene frem, så et menneske kan afgøre,
    # om affaldsnøgletallenes retning kan sættes tilbage fra "uafklaret".
    print("\nAffaldsindberetning - forbehold pr. kommune:")
    spaerret = sorted(p["navn"] for p in kommune_poster
                      if p.get("affald_indberetning") == fetch_dst.AFFALD_BEKRAEFTET_FEJL)
    usikre = sorted(p["navn"] for p in kommune_poster
                    if p.get("affald_indberetning") in (fetch_dst.AFFALD_USIKKER_FRAKTION,
                                                        fetch_dst.AFFALD_USIKKER_SPRING))
    print(f"  Deler indberetning, nøgletallene vises ikke ({len(spaerret)}): "
          f"{', '.join(spaerret) if spaerret else 'ingen'}")
    print(f"  Usædvanligt udsving, retning vises med forbehold ({len(usikre)}): "
          f"{', '.join(usikre) if usikre else 'ingen'}")
    print(f"  Uden forbehold: {len(kommune_poster) - len(spaerret) - len(usikre)} kommuner.")
    # Overgangen fra spærret til fri må ikke ske tavst: står et selskab her som
    # frit, vender dets nøgletal netop tilbage på medlemmernes kommunesider.
    for selskab, ramte in sorted(_selskaber.items()):
        if ramte:
            print(f"  {selskab}: SPÆRRET - fraktionen er kollapset hos {', '.join(ramte)}.")
        else:
            print(f"  {selskab}: fri i år - ingen medlemmer har en kollapset fraktion.")
    if _selskaber:
        print("  Selskabslisten er strukturel (ejerkredse) og bliver ikke forældet.")
        print("  Om den spærrer afgøres af indeværende års tal og rydder sig selv.")

    thisted = next(p for p in kommune_poster if p["navn"] == "Thisted")
    print("\nSanity-check Thisted mod golden-fixturen (facit i parentes):")
    print(f"  disp_indkomst = {thisted['disp_indkomst']} (252934)")
    print(f"  folketal = {thisted['folketal']} (42572)")
    print(f"  biler_diesel = {thisted['biler_diesel']} (7114)")

    if manglende_kerne > 0:
        print(f"\nADVARSEL: {manglende_kerne} områder mangler kerne-input og vil vise "
              "'utilstrækkeligt datagrundlag' i widget'en.")
        sys.exit(1)


if __name__ == "__main__":
    main()
