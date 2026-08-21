"""Kildekatalog til metodesiden. Ren data plus én funktion - ingen netværk.

Hver post beskriver én kilde: hvad den hedder, hvem der udgiver den, hvordan
den hentes, og præcis hvilke felter i data.json den er ophav til. Testene
holder katalogets felt-liste synkron med FORVENTEDE_FELTER i build.py, så en
ny tabel ikke kan snige sig ind uden kildehenvisning.

periode_noegle peger ind i PERIODER i constants.py, så årstallene på
metodesiden altid afspejler det, der faktisk blev hentet ved sidste kørsel,
i stedet for at drive fra virkeligheden efter et par årlige opdateringer."""

from datetime import date

from constants import PERIODER

DST = "Danmarks Statistik"
DST_LICENS = "CC BY 4.0"


def _dst(id_, navn, periode_noegle, felter):
    return {
        "id": id_,
        "navn": navn,
        "udbyder": DST,
        "metode": "api",
        "periode_noegle": periode_noegle,
        "licens": DST_LICENS,
        "url": f"https://www.statistikbanken.dk/{id_}",
        "felter": felter,
    }


KILDER = [
    _dst("FOLK1A", "Folketal efter område", "FOLK_KVARTAL",
         ["folketal", "folketal_forrige"]),
    _dst("ARE207", "Areal efter område", "AREAL_AAR", ["areal"]),
    _dst("INDKP101", "Disponibel indkomst efter område", "INDKOMST_AAR",
         ["disp_indkomst"]),
    _dst("FORMUE12", "Nettoformue efter område", "FORMUE_AAR",
         ["formue_gns", "formue_median"]),
    _dst("IFOR41", "Gini-koefficient efter område", "GINI_AAR", ["gini"]),
    _dst("BOL101", "Boliger efter anvendelse", "BOLIGER_AAR",
         ["boliger_parcel", "boliger_raekke", "boliger_etage"]),
    _dst("BOL103", "Boliger efter størrelse", "BOLIGER_AAR", ["boligareal"]),
    _dst("BOL102", "Boliger efter opvarmningsform", "OPVARMNING_AAR",
         ["opv_boliger_ialt", "opv_olie", "opv_naturgas"]),
    _dst("BYGV33", "Fuldført byggeri efter område", "BYGGERI_AAR", ["byggeri"]),
    _dst("BIL54", "Personbiler efter drivmiddel", "BILER_MAANED",
         ["biler", "biler_el", "biler_plugin", "biler_diesel"]),
    _dst("LABY25", "Husholdningsaffald og genanvendelse", "AFFALD_AAR",
         ["affald_kg", "genanvendelse_pct"]),
    {
        "id": "BM010",
        "navn": "Boligpriser pr. kvadratmeter, realiserede handler",
        "udbyder": "Finans Danmark",
        "metode": "api",
        "periode_noegle": "BOLIGPRIS_KVARTAL",
        "licens": "Finans Danmarks vilkår",
        "url": "https://rkr.statistikbank.dk/BM010",
        "felter": ["boligpris_m2"],
        "forbehold": "Kvartalstal baseret på realiserede handler. For små "
                     "kommuner med få handler er tallet volatilt.",
    },
    {
        "id": "ENERGINET_MILJODEKLARATION",
        "navn": "CO2 pr. kWh el, kommunedeklaration",
        "udbyder": "Energinet",
        "metode": "manuel",
        "periode_noegle": None,
        "licens": "Energinets vilkår",
        "url": "https://energinet.dk/data-om-energi/co2-pr-kwh-el-kommune/",
        "felter": ["elco2_g_kwh"],
        "forbehold": "Findes kun som rå timedata, der kræver forbrugsvægtet "
                     "aggregering. Kun Hele landet og Thisted er opgjort; "
                     "96 kommuner mangler og vises som streg.",
    },
]

# Kilder til metodens antagelser. Leverer ingen felter i data.json, men skal
# stå på metodesiden, fordi de er forudsætninger for hovedtallet.
ANTAGELSER = [
    {
        "id": "DTU_TU",
        "navn": "Transportvaneundersøgelsen, bil-km pr. region",
        "udbyder": "DTU",
        "url": "https://www.transportvaner.dk",
        "anvendes_til": "bilkm_afvigelse_region",
        "forbehold": "Intet offentligt API. Kun Nordjylland er slået op. For de "
                     "fire øvrige regioner vises transporteffekten som ikke "
                     "opgjort, ikke som nul.",
    },
    {
        "id": "ENS_GA",
        "navn": "Global Afrapportering, dansk forbrugsaftryk pr. indbygger",
        "udbyder": "Energistyrelsen",
        "url": "https://ens.dk",
        "anvendes_til": "anker (10,0 ton CO2e)",
        "forbehold": "Nationalt gennemsnit, opgørelsesår 2023.",
    },
    {
        "id": "CONCITO_ELAST",
        "navn": "Sammenhæng mellem indkomst og klimaaftryk",
        "udbyder": "CONCITO",
        "url": "https://concito.dk",
        "anvendes_til": "elasticitet (0,30-0,50) og bilkorsel_andel (0,12-0,15)",
        "forbehold": "Skøn, ikke en målt størrelse.",
    },
    {
        "id": "BYGGEANDEL_KALIBRERING",
        "navn": "Byggeriets aftryksandel, kalibreret koefficient",
        "udbyder": "Eget skøn",
        "url": "",
        "anvendes_til": "byggeandel (0,0-0,0456045)",
        "forbehold": "Kalibreret så Thisted reproducerer det oprindelige "
                     "regnearks interval. Ikke en uafhængigt målt størrelse.",
    },
    {
        "id": "BOLIGUDGIFT_MODREGNING",
        "navn": "Andel af indkomstgab modsvaret af lavere boligudgift",
        "udbyder": "Eget skøn",
        "url": "",
        "anvendes_til": "boligudgift_modregning (0,45)",
        "forbehold": "Ræsonneret til et mønster med billig bolig og lav "
                     "indkomst. Følsomheden vises kun, når det mønster gælder.",
    },
]


def byg_sources():
    """Bygger indholdet til web/data/sources.json. Opløser periode_noegle til
    den faktiske periode, så json-filen er selvforklarende for widgeten."""
    kilder = []
    for kilde in KILDER:
        ud = {k: v for k, v in kilde.items() if k != "periode_noegle"}
        noegle = kilde["periode_noegle"]
        ud["periode"] = PERIODER[noegle] if noegle else None
        kilder.append(ud)
    return {
        "genereret": date.today().isoformat(),
        "kilder": kilder,
        "antagelser": ANTAGELSER,
    }
