"""Orkestrerer hele datapipelinen. Kør: python3 pipeline/build.py

Skriver web/data/{data.json, historik.json, sources.json, concito.json, ens.json} og
udskriver en valideringsrapport til stdout. historik.json er årsværdierne bag
udviklingspilene og bygges sidst, af de samme hentefunktioner som data.json - se
historik.py.

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
import fetch_forbrug
import fetch_pendling
import fetch_klimaregnskabet
import fetch_regk
import historik
import sources
import concito
import energinet
import ens
import indkoeb
import osei_owusu
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
    "husholdning_el_tj", "husholdning_el_co2_ton", "husholdning_el_faktor",
    "husholdning_fjernvarme_tj", "husholdning_fjernvarme_co2_ton",
    "foedevare_forbrug_pr_indb",
    "indkoeb_drift_pr_indb", "indkoeb_anlaeg_pr_indb",
    "indkoeb_foedevarer_pr_indb", "indkoeb_braendsel_pr_indb",
]


def saml_kommune_post(navn, dst_data, kode=None, region=None,
                      pendling=None,
                      fritidshuse=None, husholdning=None, affald_indberetning=None,
                      foedevareforbrug=None, indkomst_robusthed=None,
                      kommunalt_indkoeb=None, indkoeb_forbehold=None):
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
    # Strøm og fjernvarme hver for sig. Motoren erstatter Klimaregnskabets el-udledning
    # med elforbruget gange kommunens miljødeklaration fra Energinet (el_faktor,
    # g CO2e/kWh) - se energinet.py og fetch_klimaregnskabet.EL_KILDER.
    for felt in ("el_tj", "el_co2_ton", "el_faktor", "fjernvarme_tj", "fjernvarme_co2_ton"):
        post[f"husholdning_{felt}"] = h.get(felt)
    # Hvor meget affaldstallene kan bære for netop denne kommune. None er den
    # normale tilstand ("intet at bemærke") og må derfor IKKE med i
    # FORVENTEDE_FELTER - der ville den blive talt som manglende data for de
    # 85 kommuner, hvor alt er i orden.
    post["affald_indberetning"] = (affald_indberetning or {}).get(navn)
    # Om kommunens gennemsnitsindkomst er trukket af få personer. None er den
    # normale tilstand og må derfor IKKE med i FORVENTEDE_FELTER - se
    # affald_indberetning ovenfor, samme begrundelse.
    post["indkomst_robusthed"] = (indkomst_robusthed or {}).get(navn)
    # Fødevareforbrug pr. indbygger i kroner, beregnet efter Osei-Owusu et al.
    # (2020), ligning S9-S11. Ikke et udledningstal - se osei_owusu.py.
    post["foedevare_forbrug_pr_indb"] = (foedevareforbrug or {}).get(navn)
    # Kommunens eget indkøb pr. indbygger, uden forsyningsvirksomhederne.
    # Kroner, ikke ton: der findes ingen offentlig nøgle fra artskontoplanen
    # til Energistyrelsens emissionsfaktorer - se indkoeb.py.
    for felt, vaerdi in ((kommunalt_indkoeb or {}).get(navn) or {}).items():
        post[f"indkoeb_{felt}"] = vaerdi
    # Færgekommunerne, hvor hovedkonto 2 dominerer indkøbet. None er den
    # normale tilstand og må derfor IKKE med i FORVENTEDE_FELTER - se
    # affald_indberetning ovenfor, samme begrundelse.
    post["indkoeb_forbehold"] = (indkoeb_forbehold or {}).get(navn)
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


def _beregn_foedevareforbrug(dst_data):
    """Fødevareforbrug pr. indbygger for alle 98 kommuner og for landet.

    Fejler en af de to tabeller, står nøgletallet tomt for alle, og resten af
    datasættet er upåvirket - samme regel som for de øvrige valgfrie kilder."""
    vindue = osei_owusu.kvotient_vindue(PERIODER["FORBRUG_AAR"])
    print(f"Henter DST FU17 og INDKF111 (fødevareforbrug, {vindue[0]}-{vindue[-1]})...")
    try:
        raa = fetch_forbrug.fetch_kvotient_vindue(vindue)
        if not raa:
            raise RuntimeError("ingen årgange hentet")
        kvotient_pr_aar = {
            aar: osei_owusu.relativ_kvotient(forbrug, indkomst, aar)
            for aar, (forbrug, indkomst) in raa.items()
        }
        # Niveauet fra det nyeste år, den indbyrdes placering udjævnet over
        # vinduet. Så er den viste værdi kroner brugt på mad i dag, mens
        # forskellen mellem regionerne ikke hænger på én stikprøve.
        seneste = max(raa)
        udjaevnet = osei_owusu.udjaevn_kvotient(kvotient_pr_aar)
        landets = osei_owusu.landets_kvotient(*raa[seneste])
        indkomst_i_alt = fetch_forbrug.fetch_indkomst_i_alt(PERIODER["INDKOMST_AAR"])
    except Exception as fejl:
        print(f"  ADVARSEL: {fejl}. Fødevarenøgletallet står tomt.")
        return {}

    folketal = {navn: v.get("folketal") for navn, v in dst_data.items()}
    region_pr_kommune = {navn: region for _, navn, region in KOMMUNER}
    # Samme sammensætning som historikken bruger til hvert af de foregående år.
    pr_kommune = osei_owusu.forbrug_for_aar(
        udjaevnet, landets, fetch_forbrug.REGION_DST, indkomst_i_alt, folketal,
        region_pr_kommune)
    print(f"  {len(kvotient_pr_aar)} årgange udjævnet, "
          f"{sum(1 for v in pr_kommune.values() if v is not None)} områder beregnet.")
    return pr_kommune


def _hent_kommunalt_indkoeb():
    """Kommunens eget indkøb pr. indbygger for alle 98 kommuner og for landet.

    Returnerer (felter pr. område, færgeforbehold pr. område). Fejler
    hentningen, står nøgletallene tomme for alle, og resten af datasættet er
    upåvirket - samme regel som for de øvrige valgfrie kilder.

    Drift vises for det nyeste regnskabsår, anlæg som gennemsnittet over fem
    år. Baggrunden for forskellen står i indkoeb.py: driftsindkøbet er stabilt
    fra år til år, anlægsindkøbet er det ikke."""
    seneste = PERIODER["REGNSKAB_AAR"]
    vindue = indkoeb.anlaeg_vindue(seneste)
    print(f"Henter DST REGK11 (kommunens eget indkøb, drift {seneste}, "
          f"anlæg {vindue[0]}-{vindue[-1]})...")
    try:
        drift = fetch_regk.fetch_indkoeb(fetch_regk.DRANST_DRIFT, [seneste])
        anlaeg = fetch_regk.fetch_indkoeb(fetch_regk.DRANST_ANLAEG, vindue)
    except Exception as fejl:
        print(f"  ADVARSEL: {fejl}. Indkøbsnøgletallene står tomme.")
        return {}, {}

    felter, andele = {}, {}
    for navn, pr_aar in drift.items():
        aktuelt = pr_aar.get(seneste)
        if aktuelt is None:
            continue
        # Anlægget udjævnes over vinduet. Samme funktion som historikken
        # bruger til hvert af de foregående år.
        felter[navn] = indkoeb.indkoeb_felter(aktuelt, anlaeg.get(navn), vindue)
        andele[navn] = indkoeb.transportandel(aktuelt)

    forbehold = indkoeb.klassificer_faergedrift(andele)
    print(f"  {len(felter)} områder beregnet, "
          f"{len(forbehold)} med færgeforbehold"
          f"{': ' + ', '.join(sorted(forbehold)) if forbehold else ''}.")
    return felter, forbehold


def _klassificer_indkomst():
    """Kommuner, hvis gennemsnitsindkomst er trukket af få personer.

    Fejler hentningen, står alle uden forbehold og nøgletallet vises som før -
    et forbehold, der ikke kan hentes, må ikke vælte en datakørsel."""
    nu = PERIODER["INDKOMST_AAR"]
    foer = str(int(nu) - fetch_dst.INDKOMST_VINDUE_AAR)
    print(f"Vurderer indkomstens robusthed ({foer}-{nu}, INDKP101 disponibel mod løn)...")
    try:
        disp_nu, loen_nu = fetch_dst.fetch_indkomst_og_loen(nu)
        disp_foer, loen_foer = fetch_dst.fetch_indkomst_og_loen(foer)
        ud = fetch_dst.klassificer_indkomst(disp_nu, disp_foer, loen_nu, loen_foer)
        markeret = sorted(n for n, v in ud.items() if v)
        print(f"  {len(markeret)} kommuner markeret: "
              f"{', '.join(markeret) if markeret else 'ingen'}")
        return ud
    except Exception as fejl:
        print(f"  ADVARSEL: kunne ikke vurdere indkomstens robusthed ({fejl}). "
              "Alle står uden forbehold.")
        return {}


def _tilfoej_el_faktor(husholdning):
    """Lægger kommunens el-faktor fra Energinet ind i husholdningsposterne.

    Filen web/data/energinet.json er committet og opdateres for sig
    (python3 pipeline/energinet.py), ligesom ens.json og concito.json er afskrifter.
    Mangler året i filen, står faktoren tom for alle kommuner, og
    husholdningens CO2-nøgletal vises med streg frem for med en gættet faktor."""
    aar = PERIODER["KLIMAREGNSKAB_AAR"]
    print(f"Læser Energinets miljødeklaration for {aar} (web/data/energinet.json)...")
    try:
        en = energinet.laes()
    except Exception as fejl:
        print(f"  ADVARSEL: {fejl}. Elens CO2 pr. kWh står tom.")
        en = {"aar": {}}
    if not energinet.faktorer_for_aar(en, aar):
        print(f"  ADVARSEL: energinet.json har ingen faktorer for {aar}. Kør "
              "python3 pipeline/energinet.py, eller ret KLIMAREGNSKAB_AAR.")
    pr_kommune = {kode: husholdning.get(kode, {}) for kode, _, _ in KOMMUNER}
    return energinet.beriger_husholdning(pr_kommune, en, aar)


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

    print(f"Henter DST {fetch_dst.BOLIGTABEL} (fritidshuse)...")
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

    husholdning = _tilfoej_el_faktor(husholdning)

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

    foedevareforbrug = _beregn_foedevareforbrug(dst_data)
    kommunalt_indkoeb, indkoeb_forbehold = _hent_kommunalt_indkoeb()
    indkomst_robusthed = _klassificer_indkomst()

    land_post = saml_kommune_post("Hele landet", dst_data, pendling=pendling,
                                  fritidshuse=fritidshuse,
                                  foedevareforbrug=foedevareforbrug,
                                  indkomst_robusthed=indkomst_robusthed,
                                  kommunalt_indkoeb=kommunalt_indkoeb,
                                  indkoeb_forbehold=indkoeb_forbehold)
    # Landets husholdningstal er summen af kommunernes, ikke et selvstændigt
    # opslag - så tæller og nævner dækker præcis det samme område. Samme
    # funktion som historikken bruger til hvert af de foregående år.
    land_post.update(fetch_klimaregnskabet.sammenlaeg_land_husholdning(husholdning))

    kommune_poster = []
    for kode, navn, region in KOMMUNER:
        kommune_poster.append(saml_kommune_post(
            navn, dst_data, kode=kode, region=region,
            pendling=pendling,
            fritidshuse=fritidshuse, husholdning=husholdning,
            affald_indberetning=affald_indberetning,
            foedevareforbrug=foedevareforbrug,
            indkomst_robusthed=indkomst_robusthed,
            kommunalt_indkoeb=kommunalt_indkoeb,
            indkoeb_forbehold=indkoeb_forbehold))

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

    # --- Historikken bag udviklingspilene ---
    # Bygges af de samme hentefunktioner som data.json, og seneste punkt i hver række skal
    # være data.json's tal. Afviger de, rejser byg_og_skriv en HistorikFejl, og kørslen stopper:
    # en historik, der beskriver et andet tal end siden viser, må ikke udgives.
    # Andre fejl, fx at Klimaregnskabet ikke kan nås, er ikke en uoverensstemmelse. De giver en
    # advarsel, og de berørte nøgletal vises uden tidsserie - samme regel som for de øvrige
    # valgfrie kilder. Arbejdsgangens kontrol fanger, hvis felter mangler.
    print("\nBygger historikken bag udviklingspilene...")
    try:
        historik.byg_og_skriv(output, husholdning_nu=husholdning or None,
                              frisk_kr="--frisk-kr" in sys.argv)
    except historik.HistorikFejl:
        raise
    except Exception as fejl:
        print(f"  ADVARSEL: historikken kunne ikke bygges ({fejl}). "
              "web/data/historik.json er ikke opdateret og passer ikke til data.json.")

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
