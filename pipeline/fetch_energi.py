"""El-CO2 pr. kWh pr. kommune, forbrugsvægtet.

`constants.py` beskrev det som ikke-automatiserbart: Energinet udgiver kun rå
timedata, der kræver forbrugsvægtet aggregering. Det er præcis, hvad dette
modul gør, med to datasæt fra Energi Data Service:

  DeclarationGridEmission   emission pr. kWh i netmixet, pr. time, pr. prisområde
  RECoverageMunicipality    elforbrug pr. time pr. kommune (og lokal VE-dækning)

Metoden følger Energinets lokationsbaserede kommunedeklaration: lokalt
produceret vedvarende energi, der forbruges i kommunen samme time
(`REekWhKeep`), regnes som nul-emission, og kun restforbruget hentes fra
nettet til prisområdets deklarerede emission:

    elco2 = sum((forbrug_t - lokal_ve_t) * emission_t) / sum(forbrug_t)

Fortrængningen skal opgøres TIME FOR TIME, ikke på årsbasis. Vinden blæser
ikke, når forbruget er højest, og en kommune kan sagtens producere mere VE
end den bruger over et år uden at være dækket i den enkelte time. Et
årsgennemsnit ville systematisk overvurdere fortrængningen.

FORBEHOLD, DER SKAL MED. Metoden krediterer lokal produktion til lokalt
forbrug. Set fra et rent forbrugsbaseret regnskab er det en dobbeltregning:
den grønne strøm, en vindkommune leverer, indgår også i det landsdækkende
mix, alle andre forbruger. Det er Energinets metodevalg, ikke vores, og
tallet står her, fordi det er det officielt udgivne. Det er velegnet til at
beskrive en kommunes elprofil og uegnet til at lægge sammen på tværs af
kommuner."""

import collections

import eds_client
from constants import PERIODER

# Den danske miljødeklaration bruger 125 %-metoden til at fordele brændsel
# mellem el og varme i kraftvarmeværker.
BRAENDSELSMETODE = "125%"
EMISSIONSKOLONNE = "CO2PerkWh"

# Prisområdegrænsen følger Storebælt: DK1 er Jylland og Fyn, DK2 er Sjælland,
# Lolland-Falster og Bornholm. Grænsen deler ingen kommune, så regionen er en
# eksakt nøgle - ikke en tilnærmelse.
PRISOMRAADE_PR_REGION = {
    "Nordjylland": "DK1",
    "Midtjylland": "DK1",
    "Syddanmark": "DK1",
    "Hovedstaden": "DK2",
    "Sjælland": "DK2",
}


def fetch_deklaration(aar=None, sov=None):
    """{(prisområde, time): g CO2/kWh} for et helt år."""
    aar = aar or PERIODER["ELDEKLARATION_AAR"]
    kwargs = {"sov": sov} if sov else {}
    raekker = eds_client.hent_alle("DeclarationGridEmission", {
        "start": f"{aar}-01-01", "end": f"{int(aar) + 1}-01-01",
        "columns": f"HourDK,PriceArea,FuelAllocationMethod,{EMISSIONSKOLONNE}",
        "filter": '{"FuelAllocationMethod":["%s"]}' % BRAENDSELSMETODE,
    }, **kwargs)
    return {
        (r["PriceArea"], r["HourDK"]): r[EMISSIONSKOLONNE]
        for r in raekker
        if r[EMISSIONSKOLONNE] is not None
    }


def fetch_kommuneforbrug(aar=None, sov=None):
    """({(kommune, time): kWh}, {(kommune, time): lokal VE-kWh},
        {kommune: (VE-kWh, forbrug-kWh)})."""
    aar = aar or PERIODER["ELDEKLARATION_AAR"]
    kwargs = {"sov": sov} if sov else {}
    raekker = eds_client.hent_alle("RECoverageMunicipality", {
        "start": f"{aar}-01-01", "end": f"{int(aar) + 1}-01-01",
        "columns": "HourDK,MunicipalityNo,REekWhKeep,ConsumptionkWh",
    }, **kwargs)
    forbrug = collections.defaultdict(float)
    lokal_ve = collections.defaultdict(float)
    aars_ve = collections.defaultdict(float)
    aarsforbrug = collections.defaultdict(float)
    for r in raekker:
        kode = int(r["MunicipalityNo"])
        noegle = (kode, r["HourDK"])
        f = r["ConsumptionkWh"] or 0.0
        v = r["REekWhKeep"] or 0.0
        forbrug[noegle] += f
        lokal_ve[noegle] += v
        aarsforbrug[kode] += f
        aars_ve[kode] += v
    return (dict(forbrug), dict(lokal_ve),
            {k: (aars_ve[k], aarsforbrug[k]) for k in aarsforbrug})


def beregn_elco2(forbrug, deklaration, prisomraade_pr_kommune, lokal_ve=None):
    """{kommunekode: g CO2/kWh} efter Energinets lokationsbaserede metode.

    `lokal_ve` er {(kommunekode, time): kWh} lokalt produceret VE, der blev
    forbrugt i kommunen samme time. Udelades den, beregnes det rene netmix
    uden fortrængning.

    Timer, hvor deklarationen mangler for kommunens prisområde, udelades helt
    frem for at blive vægtet med nul - et manglende tal er ikke nul emission.
    En kommune uden en eneste brugbar time udelades af resultatet, så den
    vises som manglende data i stedet for som et opdigtet gennemsnit."""
    lokal_ve = lokal_ve or {}
    vejet = collections.defaultdict(float)
    vaegt = collections.defaultdict(float)
    for noegle, kwh in forbrug.items():
        kode = noegle[0]
        omraade = prisomraade_pr_kommune.get(kode)
        if omraade is None or kwh <= 0:
            continue
        emission = deklaration.get((omraade, noegle[1]))
        if emission is None:
            continue
        # Fortrængningen kan ikke overstige timens eget forbrug: overskydende
        # lokal produktion eksporteres og hører ikke til kommunens forbrug.
        fra_nettet = max(0.0, kwh - min(lokal_ve.get(noegle, 0.0), kwh))
        vejet[kode] += fra_nettet * emission
        vaegt[kode] += kwh
    return {kode: vejet[kode] / vaegt[kode] for kode in vaegt if vaegt[kode] > 0}


def beregn_ve_daekning(ve_og_forbrug):
    """{kommunekode: procent}. Lokal VE-produktion sat i forhold til eget
    forbrug. Kan overstige 100 for kommuner, der producerer mere end de bruger.
    Et PRODUKTIONSMÅL - må ikke forveksles med emissionen fra forbrugt el."""
    return {
        kode: (ve / forbrug) * 100
        for kode, (ve, forbrug) in ve_og_forbrug.items()
        if forbrug > 0
    }


def prisomraader(kommuner):
    """{kommunekode: prisområde} ud fra (kode, navn, region)-listen."""
    return {
        kode: PRISOMRAADE_PR_REGION[region]
        for kode, _navn, region in kommuner
        if region in PRISOMRAADE_PR_REGION
    }
