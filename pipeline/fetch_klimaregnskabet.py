"""Husholdningernes energiforbrug og udledning pr. kommune fra Klimaregnskabet.dk.

Kilde: Energi- og CO2-regnskabet, udstillet via https://klimaregnskabet.dk/api
API-dokumentation: https://klimaregnskabet.dk/klimaregnskabet-api

NIRAS (2024) s. 18, afsnit 4.2.3, peger på Energi- og CO2-Regnskabet som den
rigtige kilde til energidelen af et forbrugsbaseret kommuneregnskab. Dette er
den kilde, i den udgave der er offentligt tilgængelig.

HVAD VI TRÆKKER UD. Kun kategorien "Husholdninger": borgernes eget forbrug af
varme, varmt vand og el i boligen, fordelt på energikilde. Erhverv,
fremstillingsvirksomhed, offentlig service og transport hører til andre
kategorier og trækkes ikke med - verificeret ved at underkategorierne
summerer eksakt til totalen.

TO FORBEHOLD, DER FØLGER MED.

1. Klimaregnskabet opgør udledningen fra selve forbrændingen og fra elnettet,
   ikke hele livscyklussen bag brændslet. Niveauet er derfor lavere end
   CONCITO's tal for "El og varme". Sammenligningen mellem en kommune og
   landsgennemsnittet er gyldig, fordi begge sider opgøres ens; niveauerne
   må ikke blandes sammen.

2. Fritidsboligers energi indgår, men deres ejere bor et andet sted. Deler man
   ud på registrerede indbyggere, følger tallet sommerhustætheden næsten lige
   så tæt som boligstørrelsen - målt på tværs af alle 98 kommuner. Derfor
   hentes også antal fritidshuse, så tallet kan fordeles på samtlige boliger
   frem for på indbyggere. Se `_maalte_sammenhaenge` nedenfor.

API-NØGLE. Læses fra miljøvariablen KLIMAREGNSKABET_API_KEY eller fra
pipeline/.env, som er gitignoreret. Nøglen må aldrig committes. Mangler den,
springes kilden over, og felterne står tomme - kommunerne vises da med streg.
"""

import collections
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://klimaregnskabet.dk/api/municipality-data"
TIMEOUT_SEKUNDER = 90
MAKS_FORSOEG = 4
PAUSE_SEKUNDER = 0.3

# Målt på alle 98 kommuner, 2023. Dokumenteret her, fordi valget af nævner
# hviler på dem og ikke på et skøn.
_maalte_sammenhaenge = {
    "energi pr. indbygger mod fritidshustæthed": 0.72,
    "energi pr. helårsbolig mod fritidshustæthed": 0.77,
    "energi pr. bolig inkl. fritidshuse mod fritidshustæthed": -0.19,
}

# Energikilder, der er fossile. Bruges til at opgøre den fossile andel af
# husholdningernes energi - et faktuelt forhold, ikke en vægtning.
FOSSILE_KILDER = {
    "Naturgas", "Gas-/dieselolie", "LPG", "Benzin og LVN", "Kul", "Fuelolie",
}


def _api_noegle():
    """Nøglen fra miljøvariabel eller fra den gitignorerede pipeline/.env."""
    noegle = os.environ.get("KLIMAREGNSKABET_API_KEY")
    if noegle:
        return noegle
    sti = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(sti):
        return None
    with open(sti, encoding="utf-8") as f:
        for linje in f:
            if linje.startswith("KLIMAREGNSKABET_API_KEY="):
                return linje.split("=", 1)[1].strip()
    return None


def _hent(kode, aar, datatype, noegle, sov=time.sleep):
    q = urllib.parse.urlencode({"municipality": kode, "year": aar, "type": datatype})
    req = urllib.request.Request(f"{BASE_URL}?{q}", headers={"x-api-key": noegle})
    for forsoeg in range(MAKS_FORSOEG):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_SEKUNDER) as svar:
                return json.load(svar)["data"]
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if forsoeg == MAKS_FORSOEG - 1:
                raise
            sov(3 * (forsoeg + 1))


def summer_husholdninger(raekker):
    """{energikilde: værdi} for kategorien Husholdninger.

    Andre kategorier - erhverv, fremstilling, offentlig service, transport -
    hører til andre dele af regnskabet og udelades."""
    ud = collections.defaultdict(float)
    for r in raekker:
        if r.get("kategori") == "Husholdninger":
            ud[str(r.get("undertype_3"))] += r["værdi"] or 0.0
    return dict(ud)


def fossil_andel(pr_kilde):
    """Fossile energikilders andel af husholdningernes samlede forbrug.

    Returnerer None ved intet forbrug, så en kommune uden data vises med
    streg frem for som nul procent fossil."""
    samlet = sum(pr_kilde.values())
    if samlet <= 0:
        return None
    fossilt = sum(v for k, v in pr_kilde.items() if k in FOSSILE_KILDER)
    return fossilt / samlet


def fetch_husholdninger(kommuneliste, aar, noegle=None, sov=time.sleep):
    """{kommunekode: {co2_ton, energi_tj, fossil_andel, pr_kilde_ton}}.

    Rejser ValueError uden API-nøgle, så build.py kan fange det og udgive et
    datasæt uden felterne frem for at fejle helt."""
    noegle = noegle or _api_noegle()
    if not noegle:
        raise ValueError(
            "ingen API-nøgle. Sæt KLIMAREGNSKABET_API_KEY eller opret pipeline/.env")

    ud = {}
    for kode, _navn, _region in kommuneliste:
        udledning = summer_husholdninger(_hent(kode, aar, "Resultat - udledning", noegle, sov))
        energi = summer_husholdninger(_hent(kode, aar, "Resultat - energi", noegle, sov))
        co2 = sum(udledning.values())
        tj = sum(energi.values())
        ud[kode] = {
            "co2_ton": co2 if co2 > 0 else None,
            "energi_tj": tj if tj > 0 else None,
            "fossil_andel": fossil_andel(energi),
            "pr_kilde_ton": udledning,
        }
        sov(PAUSE_SEKUNDER)
    return ud
