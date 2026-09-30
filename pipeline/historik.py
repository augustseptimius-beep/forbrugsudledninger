"""Historikken bag udviklingspilene: årsværdier pr. felt, op til ti år tilbage.

Kør: python3 pipeline/historik.py   (build.py gør det også, som sidste trin)

Skriver web/data/historik.json. Filen rummer KUN TAL - ingen tegninger, ingen
udregnede pile. Pilene og grafen regnes og tegnes i browseren ud fra tallene,
først når en kommuneside åbnes, og grafen først når man peger på en pil. Der er
derfor intet tegnet at holde ajour ved den årlige opdatering: perioderne følger
PERIODER, og vinduet flytter sig af sig selv.

HVAD DER STÅR I FILEN

For hvert felt i data.json, som et nøgletal læser, en række på elleve tal for
hver af de 98 kommuner og for landet: feltets nuværende værdi og de ti år før
den, ældste først. Et tal, der ikke findes, står som null og bliver aldrig til
nul. Kronebeløb står i årets egne priser; forbrugerprisindekset (DST PRIS8)
ligger ved siden af, så motoren kan sætte dem i samme prisniveau.

FELTERNES EGNE PERIODER

Kilderne har hver deres nyeste periode: bilerne er fra januar 2026, byggeriet
fra 2024, affaldet fra 2023. Hvert felt går bagud fra sin egen periode, ét år
ad gangen, og beholder kvartal og måned (2026K1 -> 2025K1). Et nøgletal, der
kombinerer felter fra forskellige perioder - byggeri i 2024 delt med folketallet
i 2026 - kombinerer dem på samme måde i hvert af de foregående år. Så er
historikkens seneste punkt præcis det tal, kommunesiden viser.

ÉN DEFINITION PR. FELT

Historikken kalder de samme hentefunktioner som data.json, med en liste af
perioder i stedet for én, og de samme sammensætninger (indkoeb.indkoeb_felter,
osei_owusu.forbrug_for_aar, fetch_klimaregnskabet.sammenlaeg_land_husholdning).
Ellers kunne pilen beskrive et andet tal end det, siden viser. Det gjorde den
i doughnut-projektet for fjorten indikatorer, indtil en kontrol fandt det.
afstem_med_data() er kontrollen her: seneste punkt skal være data.json's tal,
ellers stopper kørslen.

KLIMAREGNSKABET.DK

Husholdningernes energi og udledning kræver en API-nøgle og ét kald pr. kommune
pr. år (196 kald pr. årgang). Uden nøgle står de syv felter uden historik, og
feltet "mangler" i filen siger hvilke. Nøgletallene vises da med "ingen
tidsserie" og ikke med et opdigtet forløb.
"""

import json
import os
import sys
import time
from datetime import date

import dst_client
import fetch_dst
import fetch_forbrug
import fetch_klimaregnskabet
import fetch_pendling
import fetch_regk
import indkoeb
import osei_owusu
from constants import PERIODER
from kommuner import KOMMUNER
from perioder import aar_af, kvartaler, periodekaede, trin_tilbage

# Hvor mange år tilbage historikken går. Det seneste punkt er nøgletallets
# nuværende værdi, så ti år giver op til elleve punkter. Yngre kilder giver
# færre: BIL54 begynder i 2018, FU17 i 2015. Vinduet er en præsentationsbeslutning
# og ikke en kilde - samme slags valg som KVOTIENT_VINDUE_AAR i osei_owusu.py.
HISTORIK_AAR = 10

# Første årgang af Klimaregnskabet.dk, der hentes. Doughnut-projektet henter
# samme kilde fra 2018 (fetch_trend_history.KLIMA_AAR). Tidligere årgange er
# ikke prøvet her.
KR_FRA_AAR = 2018

_DATA = os.path.join(os.path.dirname(__file__), "..", "web", "data")
HISTORIK_PATH = os.path.join(_DATA, "historik.json")
DATA_JSON_PATH = os.path.join(_DATA, "data.json")
KR_HISTORIK_CACHE_PATH = os.path.join(os.path.dirname(__file__), ".kr_historik_cache.json")

LAND = "Hele landet"
BASE = dst_client.DST_BASE_URL

# Hvert felt og den nøgle i PERIODER, der siger, hvilken periode dets nuværende
# værdi er fra. Det er felterne, et nøgletal i web/beregning.js læser. En test
# holder listen i takt med data.json og med kildekataloget.
FELT_PERIODE = {
    "folketal": "FOLK_KVARTAL",
    "folketal_forrige": "FOLK_KVARTAL_FORRIGE",
    "disp_indkomst": "INDKOMST_AAR",
    "foedevare_forbrug_pr_indb": "FORBRUG_AAR",
    "boliger_parcel": "BOLIGER_AAR",
    "boliger_raekke": "BOLIGER_AAR",
    "boliger_etage": "BOLIGER_AAR",
    "boligareal": "BOLIGER_AAR",
    "fritidshuse": "BOLIGER_AAR",
    "byggeri": "BYGGERI_AAR",
    "biler": "BILER_MAANED",
    "biler_el": "BILER_MAANED",
    "biler_plugin": "BILER_MAANED",
    "biler_diesel": "BILER_MAANED",
    "biler_benzin": "BILER_MAANED",
    "opv_boliger_ialt": "OPVARMNING_AAR",
    "opv_olie": "OPVARMNING_AAR",
    "opv_naturgas": "OPVARMNING_AAR",
    "affald_kg": "AFFALD_AAR",
    "genanvendelse_pct": "AFFALD_AAR",
    "pendlingsafstand_km": "PENDLING_AAR",
    **{felt: "KLIMAREGNSKAB_AAR" for felt in fetch_klimaregnskabet.KR_FELTER.values()},
    "indkoeb_drift_pr_indb": "REGNSKAB_AAR",
    "indkoeb_anlaeg_pr_indb": "REGNSKAB_AAR",
    "indkoeb_foedevarer_pr_indb": "REGNSKAB_AAR",
    "indkoeb_braendsel_pr_indb": "REGNSKAB_AAR",
}
HISTORIK_FELTER = list(FELT_PERIODE)

# Felterne, der kommer fra Klimaregnskabet.dk.
KR_POSTFELTER = list(fetch_klimaregnskabet.KR_FELTER.values())

# Forskellen mellem to udregninger af samme tal, som kun er float-støj. Alt
# større er en forskel i definitionen og stopper kørslen.
TOLERANCE = 1e-9


class HistorikFejl(Exception):
    """Historikkens seneste punkt afviger fra data.json."""


# ---------- Perioder ----------

def felt_kaede(felt):
    """Feltets periodekæde, ældste først. Sidste led er feltets nuværende periode."""
    return periodekaede(PERIODER[FELT_PERIODE[felt]], HISTORIK_AAR)


def _skaer(oenskede, tilgaengelige):
    """De ønskede perioder, som tabellen faktisk har."""
    tilgaengelige = set(tilgaengelige)
    return [p for p in oenskede if p in tilgaengelige]


# ---------- Hentning ----------
#
# Alle hentninger lægger deres tal i {felt: {omraade: {periode: værdi}}}, hvor
# omraade er kommunekoden eller "land". Regionsnavne og landsdele, DST også
# sender, tages ikke med.

def _til_omraader(pr_navn):
    """{kommunenavn eller "Hele landet": x} -> {kode eller "land": x}."""
    koder = {navn: kode for kode, navn, _ in KOMMUNER}
    ud = {koder[navn]: x for navn, x in pr_navn.items() if navn in koder}
    if LAND in pr_navn:
        ud["land"] = pr_navn[LAND]
    return ud


def _indsaet(ud, felt, pr_periode, udtag=lambda x: x):
    """Lægger {periode: {navn: x}} ind som {felt: {omraade: {periode: udtag(x)}}}.

    Et navn, en periode eller en værdi, der ikke findes, udelades - den ender som
    null i filen og bliver ikke til nul."""
    for periode, pr_navn in pr_periode.items():
        for omraade, x in _til_omraader(pr_navn).items():
            v = udtag(x)
            if v is not None:
                ud.setdefault(felt, {}).setdefault(omraade, {})[periode] = v


def _indsaet_flere(ud, felter, pr_periode):
    """Som _indsaet for en hentning, der giver et tal af dicts pr. periode."""
    for i, felt in enumerate(felter):
        _indsaet(ud, felt, {p: tal[i] for p, tal in pr_periode.items()})


def hent_dst(tabeller=None):
    """Alle felter, der kommer direkte fra Danmarks Statistik.

    Returnerer (felter, folketal), hvor folketal er de rå kvartalstal pr.
    områdenavn, som fødevareforbruget også skal bruge."""
    tabeller = {} if tabeller is None else tabeller

    def perioder_for(tabel, oenskede):
        if tabel not in tabeller:
            tabeller[tabel] = dst_client.tabel_perioder(BASE, tabel)
        return _skaer(oenskede, tabeller[tabel])

    ud = {}

    # Folketal: to felter fra samme tabel, hvert fra sin periode. Ét kald dækker
    # begge kæder.
    kaede_nu, kaede_forrige = felt_kaede("folketal"), felt_kaede("folketal_forrige")
    folketal = fetch_dst.fetch_folketal_serie(
        perioder_for("FOLK1A", sorted(set(kaede_nu) | set(kaede_forrige))))
    _indsaet(ud, "folketal", {p: v for p, v in folketal.items() if p in kaede_nu})
    _indsaet(ud, "folketal_forrige", {p: v for p, v in folketal.items() if p in kaede_forrige})

    _indsaet(ud, "disp_indkomst", fetch_dst.fetch_indkomst_serie(
        perioder_for("INDKP101", felt_kaede("disp_indkomst"))))

    _indsaet_flere(ud, ("boliger_parcel", "boliger_raekke", "boliger_etage"),
                   fetch_dst.fetch_boliger_type_serie(
                       perioder_for("BOL101", felt_kaede("boliger_parcel"))))
    _indsaet(ud, "fritidshuse", fetch_dst.fetch_fritidshuse_serie(
        perioder_for("BOL101", felt_kaede("fritidshuse"))))
    _indsaet(ud, "boligareal", fetch_dst.fetch_boligareal_serie(
        perioder_for("BOL103", felt_kaede("boligareal"))))
    _indsaet_flere(ud, ("opv_boliger_ialt", "opv_olie", "opv_naturgas"),
                   fetch_dst.fetch_opvarmning_serie(
                       perioder_for("BOL102", felt_kaede("opv_boliger_ialt"))))

    # Byggeri er summen af årets fire kvartaler. Et år, hvor tabellen ikke har
    # alle fire, udelades: en halv sum ville ligne et fald.
    tilgaengelige = set(perioder_for("BYGV33", [q for a in felt_kaede("byggeri")
                                                for q in kvartaler(a)]))
    hele_aar = [a for a in felt_kaede("byggeri")
                if all(q in tilgaengelige for q in kvartaler(a))]
    _indsaet(ud, "byggeri", fetch_dst.fetch_byggeri_serie(hele_aar))

    _indsaet_flere(ud, ("biler", "biler_el", "biler_plugin", "biler_diesel", "biler_benzin"),
                   fetch_dst.fetch_biler_serie(
                       perioder_for("BIL54", felt_kaede("biler"))))
    _indsaet_flere(ud, ("affald_kg", "genanvendelse_pct"),
                   fetch_dst.fetch_affald_serie(
                       perioder_for("LABY25", felt_kaede("affald_kg"))))
    _indsaet(ud, "pendlingsafstand_km", fetch_pendling.fetch_pendlingsafstand_serie(
        perioder_for("AFSTB4", felt_kaede("pendlingsafstand_km"))))
    return ud, folketal


def hent_foedevare(folketal, tabeller=None):
    """Fødevareforbrug pr. indbygger for hvert af årene.

    Regionens udjævnede placering er den samme i alle år (se
    osei_owusu.forbrug_for_aar). Landets forbrugskvotient og kommunens samlede
    disponible indkomst følger året, og der deles med folketallet i det kvartal,
    nøgletallet i dag deles med, flyttet det samme antal år tilbage."""
    seneste = PERIODER["FORBRUG_AAR"]
    raa = fetch_forbrug.fetch_kvotient_vindue(osei_owusu.kvotient_vindue(seneste))
    if not raa:
        raise RuntimeError("ingen årgange af forbrugsundersøgelsen kunne hentes")
    udjaevnet = osei_owusu.udjaevn_kvotient({
        aar: osei_owusu.relativ_kvotient(forbrug, indkomst, aar)
        for aar, (forbrug, indkomst) in raa.items()})

    kaede = felt_kaede("foedevare_forbrug_pr_indb")
    tilgaengelige = (tabeller or {}).get("INDKF111") \
        or dst_client.tabel_perioder(BASE, "INDKF111")
    indkomst = fetch_forbrug.fetch_indkomst_i_alt_serie(_skaer(kaede, tilgaengelige))
    region_pr_kommune = {navn: region for _, navn, region in KOMMUNER}

    ud = {}
    for k, aar in enumerate(reversed(kaede)):
        kvartal = trin_tilbage(PERIODER["FOLK_KVARTAL"], k)
        if aar not in raa or aar not in indkomst or kvartal not in folketal:
            continue
        pr_kommune = osei_owusu.forbrug_for_aar(
            udjaevnet, osei_owusu.landets_kvotient(*raa[aar]), fetch_forbrug.REGION_DST,
            indkomst[aar], folketal[kvartal], region_pr_kommune)
        _indsaet(ud, "foedevare_forbrug_pr_indb", {aar: pr_kommune})
    return ud


def hent_indkoeb():
    """Kommunens indkøb pr. indbygger for hvert af årene.

    Drift og enkeltarter for året selv, anlægget som gennemsnit over de fem år,
    der slutter i året - samme funktion som build.py bruger til det nyeste år.
    Anlæggets første femårsvindue rækker derfor fire år længere tilbage end
    kæden."""
    kaede = felt_kaede("indkoeb_drift_pr_indb")
    tilgaengelige = dst_client.tabel_perioder(BASE, fetch_regk.TABEL)
    anlaeg_aar = periodekaede(kaede[-1], HISTORIK_AAR + indkoeb.ANLAEG_VINDUE_AAR - 1)
    drift = fetch_regk.fetch_indkoeb(fetch_regk.DRANST_DRIFT, _skaer(kaede, tilgaengelige))
    anlaeg = fetch_regk.fetch_indkoeb(fetch_regk.DRANST_ANLAEG, _skaer(anlaeg_aar, tilgaengelige))

    ud = {}
    for aar in kaede:
        vindue = indkoeb.anlaeg_vindue(aar)
        pr_navn = {}
        for navn, pr_aar in drift.items():
            aktuelt = pr_aar.get(aar)
            if aktuelt is not None:
                pr_navn[navn] = indkoeb.indkoeb_felter(aktuelt, anlaeg.get(navn), vindue)
        for kort, felt in (("drift_pr_indb", "indkoeb_drift_pr_indb"),
                           ("anlaeg_pr_indb", "indkoeb_anlaeg_pr_indb"),
                           ("foedevarer_pr_indb", "indkoeb_foedevarer_pr_indb"),
                           ("braendsel_pr_indb", "indkoeb_braendsel_pr_indb")):
            _indsaet(ud, felt, {aar: pr_navn}, udtag=lambda felter, kort=kort: felter[kort])
    return ud


def _laes_kr_cache():
    if not os.path.exists(KR_HISTORIK_CACHE_PATH):
        return {}
    with open(KR_HISTORIK_CACHE_PATH, encoding="utf-8") as f:
        raa = json.load(f)
    return {aar: {int(kode): h for kode, h in pr_kode.items()} for aar, pr_kode in raa.items()}


def _skriv_kr_cache(cache):
    with open(KR_HISTORIK_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({aar: {str(kode): h for kode, h in pr_kode.items()}
                   for aar, pr_kode in cache.items()}, f)


def hent_kr(nuvaerende=None, frisk=False, cache=True, sov=time.sleep):
    """Husholdningernes energi og udledning for hvert af årene.

    nuvaerende: {kode: {...}} for det nyeste år, hvis build.py allerede har hentet
                det - så hentes det ikke to gange.
    frisk:      spring cachen over.
    cache:      læs og skriv .kr_historik_cache.json (gitignoreret), så en
                afbrudt kørsel ikke mister de år, den nåede.

    Rejser ValueError uden API-nøgle."""
    seneste = int(PERIODER["KLIMAREGNSKAB_AAR"])
    aarene = [str(a) for a in range(max(KR_FRA_AAR, seneste - HISTORIK_AAR), seneste + 1)]
    gemt = {} if (frisk or not cache) else _laes_kr_cache()
    allerede = dict(gemt)
    if nuvaerende:
        allerede[str(seneste)] = nuvaerende

    def gem(aar, resultat):
        if cache:
            gemt[aar] = resultat
            _skriv_kr_cache(gemt)

    serie = fetch_klimaregnskabet.fetch_husholdninger_serie(
        KOMMUNER, aarene, sov=sov, allerede=allerede, gem=gem)

    ud = {}
    for aar, pr_kode in serie.items():
        # En kommune uden hverken udledning eller energi i året har ikke en
        # årgang, og dens nuller (el, fjernvarme) må ikke læses som målinger.
        med_tal = {kode: h for kode, h in pr_kode.items()
                   if h.get("co2_ton") is not None or h.get("energi_tj") is not None}
        for kilde_felt, felt in fetch_klimaregnskabet.KR_FELTER.items():
            for kode, h in med_tal.items():
                if h.get(kilde_felt) is not None:
                    ud.setdefault(felt, {}).setdefault(kode, {})[aar] = h[kilde_felt]
        if len(med_tal) < len(KOMMUNER):
            print(f"  ADVARSEL: Klimaregnskabet {aar} har tal for {len(med_tal)} af "
                  f"{len(KOMMUNER)} kommuner. Landets sum dækker kun dem.")
        for felt, v in fetch_klimaregnskabet.sammenlaeg_land_husholdning(med_tal).items():
            if v is not None:
                ud.setdefault(felt, {}).setdefault("land", {})[aar] = v
    return ud


# Et gennemsnit over flere år hører til prisniveauet i vinduets midte. Anlægsindkøbet er et
# femårsgennemsnit, så dets priser ligger to år før slutåret: web/beregning.js'
# prisForskydning. Indeksets første år rykker tilsvarende tilbage.
PRIS_FORSKYDNING_AAR = (indkoeb.ANLAEG_VINDUE_AAR - 1) // 2


def hent_priser():
    """Forbrugerprisindekset for årene, prisjusteringen kan komme til at bruge.

    Fra ti år før det ældste kronenøgletal, og yderligere tilbage for
    femårsgennemsnittet, til PRIS_AAR."""
    sidste = int(PERIODER["PRIS_AAR"])
    foerste = min(int(PERIODER[n]) for n in ("INDKOMST_AAR", "FORBRUG_AAR", "REGNSKAB_AAR")) \
        - HISTORIK_AAR - PRIS_FORSKYDNING_AAR
    return fetch_dst.fetch_priser([str(a) for a in range(foerste, sidste + 1)])


# ---------- Samling ----------

def _raekke(pr_periode, kaede):
    """Feltets tal i kædens rækkefølge. Et hul står som None."""
    return [pr_periode.get(p) for p in kaede]


def saml(felt_serier, priser):
    """Gør de hentede serier til filens indhold."""
    koder = [str(kode) for kode, _, _ in KOMMUNER]
    kommuner = {kode: {} for kode in koder}
    land = {}
    felter, mangler = {}, []
    for felt in HISTORIK_FELTER:
        periode = PERIODER[FELT_PERIODE[felt]]
        felter[felt] = {"periode": periode, "aar": aar_af(periode)}
        kaede = felt_kaede(felt)
        pr_omraade = felt_serier.get(felt, {})
        for kode in koder:
            kommuner[kode][felt] = _raekke(pr_omraade.get(int(kode), {}), kaede)
        land[felt] = _raekke(pr_omraade.get("land", {}), kaede)
        if not any(sum(v is not None for v in raekke) >= 2
                   for raekke in [land[felt]] + [kommuner[k][felt] for k in koder]):
            mangler.append(felt)
    return {
        "genereret": date.today().isoformat(),
        "vindue": HISTORIK_AAR,
        "priser": {"kilde": "PRIS8", "aar": {a: priser[a] for a in sorted(priser)}},
        "felter": felter,
        "mangler": mangler,
        "land": land,
        "kommuner": kommuner,
    }


def afstem_med_data(historik, data, hentet):
    """Seneste punkt i hver række skal være tallet i data.json.

    Det er hele pointen med at bruge de samme hentefunktioner: nøgletallet på
    kommunesiden og historikkens sidste punkt er ét tal. Afviger de mere end
    float-støj, har historikken sin egen definition af feltet, og kørslen stopper.

    hentet: de felter, denne kørsel faktisk har hentet. De øvrige - Klimaregnskabet
    uden nøgle - får deres seneste punkt fra data.json, så filen stadig er ét
    sammenhængende billede; de står i "mangler", fordi de kun har det ene punkt.

    Er forskellen float-støj, sættes data.json's værdi ind, så de to er bitvis ens."""
    poster = {"land": data["land"], **{str(k["kode"]): k for k in data["kommuner"]}}
    raekker = [("land", historik["land"])] + list(historik["kommuner"].items())
    fejl = []
    for omraade, felter in raekker:
        post = poster.get(omraade)
        if post is None:
            fejl.append(f"{omraade}: findes ikke i data.json")
            continue
        for felt, raekke in felter.items():
            nu, facit = raekke[-1], post.get(felt)
            if felt not in hentet:
                raekke[-1] = facit
            elif nu is None and facit is None:
                continue
            elif nu is None or facit is None:
                fejl.append(f"{omraade} {felt}: historik {nu}, data.json {facit}")
            elif nu != facit:
                if abs(nu - facit) <= TOLERANCE * max(1.0, abs(facit)):
                    raekke[-1] = facit
                else:
                    fejl.append(f"{omraade} {felt}: historik {nu}, data.json {facit}")
    if fejl:
        raise HistorikFejl(
            f"{len(fejl)} felter, hvor historikkens seneste punkt afviger fra data.json. "
            "Historikken har sin egen definition af feltet, eller DST har rettet tallet "
            "siden data.json blev bygget. Første afvigelser:\n  "
            + "\n  ".join(fejl[:10]))
    return historik


def byg_historik(data, husholdning_nu=None, frisk_kr=False, kr_cache=True):
    """Henter alle serier og samler filens indhold.

    DST er kernen: fejler den, fejler kørslen. Fødevareforbruget, indkøbet,
    Klimaregnskabet og priserne er valgfrie - fejler en af dem, står dens felter
    uden historik og nøgletallene med "ingen tidsserie", og resten er upåvirket.
    Samme regel som build.py har for de øvrige valgfrie kilder."""
    felt_serier = {}
    hentet = set()

    print("Henter historik fra DST (tabellerne bag nøgletallene)...")
    dst, folketal = hent_dst()
    felt_serier.update(dst)
    hentet.update(dst)
    # Et felt uden en eneste værdi er stadig hentet: DST svarede, og svaret var tomt.
    hentet.update(f for f in HISTORIK_FELTER
                  if FELT_PERIODE[f] not in ("KLIMAREGNSKAB_AAR", "FORBRUG_AAR", "REGNSKAB_AAR"))

    def valgfri(navn, felter, hent):
        print(f"Henter historik: {navn}...")
        try:
            felt_serier.update(hent())
            hentet.update(felter)
        except Exception as fejl:
            print(f"  ADVARSEL: {fejl}. Historikken for {navn} står tom.")

    valgfri("fødevareforbrug (FU17, INDKF111)", ["foedevare_forbrug_pr_indb"],
            lambda: hent_foedevare(folketal))
    valgfri("kommunens indkøb (REGK11)",
            [f for f in HISTORIK_FELTER if f.startswith("indkoeb_")], hent_indkoeb)
    valgfri("husholdningernes energi (Klimaregnskabet.dk)", KR_POSTFELTER,
            lambda: hent_kr(husholdning_nu, frisk=frisk_kr, cache=kr_cache))

    priser = {}
    try:
        print("Henter historik: forbrugerprisindeks (PRIS8)...")
        priser = hent_priser()
    except Exception as fejl:
        print(f"  ADVARSEL: {fejl}. Kronenøgletallene står uden tidsserie.")

    historik = saml(felt_serier, priser)
    return afstem_med_data(historik, data, hentet)


# ---------- Skrivning ----------

def _tal(v):
    """Et tal som JSON. Heltal skrives uden decimal; float med den korteste
    gengivelse, der giver samme tal tilbage."""
    if v is None:
        return "null"
    if isinstance(v, bool) or v != v or v in (float("inf"), float("-inf")):
        raise ValueError(f"ugyldigt tal i historikken: {v!r}")
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return repr(v)


def _raekke_json(raekke):
    return "[" + ",".join(_tal(v) for v in raekke) + "]"


def til_json(historik):
    """Filens tekst. Hver række står på én linje: 98 kommuner gange 32 felter
    er 3.000 linjer at diffe ved den årlige opdatering, ikke 35.000."""
    def blok(navn, felter):
        linjer = [f'  "{n}": {_raekke_json(r)}' for n, r in felter.items()]
        return f'  "{navn}": {{\n' + ",\n".join("  " + l for l in linjer) + "\n  }"

    dele = [
        f'  "genereret": {json.dumps(historik["genereret"])}',
        f'  "vindue": {historik["vindue"]}',
        '  "priser": {"kilde": ' + json.dumps(historik["priser"]["kilde"]) + ', "aar": {'
        + ", ".join(f'"{a}": {_tal(v)}' for a, v in historik["priser"]["aar"].items()) + "}}",
        '  "felter": {\n' + ",\n".join(
            f'    "{f}": {json.dumps(v, ensure_ascii=False)}'
            for f, v in historik["felter"].items()) + "\n  }",
        f'  "mangler": {json.dumps(historik["mangler"], ensure_ascii=False)}',
        '  "land": {\n' + ",\n".join(
            f'    "{f}": {_raekke_json(r)}' for f, r in historik["land"].items()) + "\n  }",
        '  "kommuner": {\n' + ",\n".join(
            f'    "{kode}": {{\n' + ",\n".join(
                f'      "{f}": {_raekke_json(r)}' for f, r in felter.items()) + "\n    }"
            for kode, felter in historik["kommuner"].items()) + "\n  }",
    ]
    return "{\n" + ",\n".join(dele) + "\n}\n"


def skriv_historik(historik, sti=HISTORIK_PATH):
    os.makedirs(os.path.dirname(sti), exist_ok=True)
    with open(sti, "w", encoding="utf-8") as f:
        f.write(til_json(historik))
    return sti


def rapport(historik):
    """Valideringsrapport: hvor mange kommuner har en tidsserie for hvert felt."""
    print("\n--- Historik ---")
    kaede_len = HISTORIK_AAR + 1
    for felt in HISTORIK_FELTER:
        raekker = list(historik["kommuner"].values())
        antal = sum(1 for r in raekker if sum(v is not None for v in r[felt]) >= 2)
        laengst = max((sum(v is not None for v in r[felt]) for r in raekker), default=0)
        print(f"  {felt:34} {antal:3}/{len(raekker)} kommuner med tidsserie, "
              f"op til {laengst} af {kaede_len} punkter")
    if historik["mangler"]:
        print(f"\nUDEN HISTORIK ({len(historik['mangler'])} felter): "
              + ", ".join(historik["mangler"]))


def byg_og_skriv(data, husholdning_nu=None, frisk_kr=False, sti=HISTORIK_PATH):
    historik = byg_historik(data, husholdning_nu=husholdning_nu, frisk_kr=frisk_kr)
    skriv_historik(historik, sti)
    print(f"Skrev {os.path.normpath(sti)}")
    rapport(historik)
    return historik


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    with open(DATA_JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)
    byg_og_skriv(data, frisk_kr="--frisk-kr" in argv)


if __name__ == "__main__":
    main()
