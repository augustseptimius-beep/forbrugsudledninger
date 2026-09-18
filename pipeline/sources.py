"""Kildekatalog til metodesiden. Ren data plus én funktion - ingen netværk.

Hver post beskriver én kilde: hvad den hedder, hvem der udgiver den, hvordan
den hentes, og præcis hvilke felter i data.json den er ophav til. Testene
holder katalogets felt-liste synkron med FORVENTEDE_FELTER i build.py, så en
ny tabel ikke kan snige sig ind uden kildehenvisning.

periode_noegle peger ind i PERIODER i constants.py, så årstallene på
metodesiden altid afspejler det, der faktisk blev hentet ved sidste kørsel,
i stedet for at drive fra virkeligheden efter et par årlige opdateringer.

kort er den korte form, kildeangivelsen på kommunesiden viser ved hvert
nøgletal ("DST BIL54"). Den står her frem for i render.js, så navnet på en
kilde kun skrives ét sted."""

from datetime import date

from constants import PERIODER

DST = "Danmarks Statistik"
DST_LICENS = "CC BY 4.0"


def _dst(id_, navn, periode_noegle, felter, kort=None):
    return {
        "id": id_,
        "navn": navn,
        "kort": kort or f"DST {id_}",
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
    dict(_dst("INDKP101", "Disponibel indkomst efter område", "INDKOMST_AAR",
              ["disp_indkomst"]),
         forbehold="Gennemsnittet er følsomt over for få personer med meget stor "
                   "kapitalindkomst: i en lille kommune kan én husstand flytte det "
                   "flere procent. Tabellen hentes derfor også for lønindkomst tre "
                   "år tilbage, og kommuner, hvor den disponible indkomst er løbet "
                   "markant fra kommunens egen lønudvikling, markeres med et "
                   "forbehold på kommunesiden. Tallet skjules ikke - det er "
                   "rigtigt, men det beskriver ikke, hvordan borgerne i "
                   "almindelighed lever."),
    dict(_dst("IFOR41", "Gini-koefficient efter område", "GINI_AAR", ["gini"]),
         forbehold="Vises ikke på kommunesiden. Ulighed siger noget om fordelingen af "
                   "forbruget, ikke om niveauet. Tallet hentes til en vurdering af "
                   "rimelig og retfærdig omstilling."),
    _dst("BOL101", "Boliger efter anvendelse", "BOLIGER_AAR",
         ["boliger_parcel", "boliger_raekke", "boliger_etage"]),
    _dst("BOL103", "Boliger efter størrelse", "BOLIGER_AAR", ["boligareal"]),
    _dst("BOL102", "Boliger efter opvarmningsform", "OPVARMNING_AAR",
         ["opv_boliger_ialt", "opv_olie", "opv_naturgas"]),
    _dst("BYGV33", "Fuldført byggeri efter område", "BYGGERI_AAR", ["byggeri"]),
    dict(_dst("BIL54", "Personbiler efter drivmiddel, husholdningernes", "BILER_MAANED",
              ["biler", "biler_el", "biler_plugin", "biler_diesel", "biler_benzin"]),
         forbehold="Kun husholdningernes biler. Firma- og leasingbiler er registreret "
                   "på virksomhedens adresse, ikke der, hvor de bruges, og er udeladt."),
    _dst("LABY25", "Husholdningsaffald og genanvendelse", "AFFALD_AAR",
         ["affald_kg", "genanvendelse_pct"]),
    dict(_dst("AFSTB4", "Gennemsnitlig pendlingsafstand efter bopælsområde",
              "PENDLING_AAR", ["pendlingsafstand_km"]),
         forbehold="Afstanden til arbejde for beskæftigede med bopæl i kommunen. "
                   "Den siger intet om transportmiddel og dækker kun arbejdsturen, "
                   "ikke indkøb, fritid og andre ærinder."),
    dict(_dst("BOL101_FRITID", "Fritidshuse uden CPR-tilmeldte personer",
              "BOLIGER_AAR", ["fritidshuse"], kort="DST BOL101 (fritidshuse)"),
         url="https://www.statistikbanken.dk/BOL101",
         forbehold="Bruges til at fordele husholdningernes energi og udledning på "
                   "samtlige boliger. Fritidsboliger bruger energi, men deres ejere "
                   "er registreret i en anden kommune."),
    {
        "id": "KLIMAREGNSKABET_HUSHOLDNINGER",
        "navn": "Husholdningernes energiforbrug og udledning (Energi- og CO2-regnskabet)",
        "kort": "Klimaregnskabet.dk",
        "udbyder": "Klimaregnskabet.dk",
        "metode": "api",
        "periode_noegle": "KLIMAREGNSKAB_AAR",
        "licens": "Kræver personlig API-nøgle, se klimaregnskabet.dk",
        "url": "https://klimaregnskabet.dk/klimaregnskabet-api",
        "felter": ["husholdning_co2_ton", "husholdning_energi_tj", "husholdning_fossil_andel",
                   "husholdning_el_tj", "husholdning_el_co2_ton",
                   "husholdning_fjernvarme_tj", "husholdning_fjernvarme_co2_ton"],
        "forbehold": "Kun kategorien Husholdninger - erhverv, fremstilling, offentlig "
                     "service og transport hører til andre kategorier og er ikke med. "
                     "Opgørelsen dækker udledningen fra forbrændingen og fra elnettet, "
                     "ikke hele livscyklussen bag brændslet, og niveauet er derfor "
                     "lavere end CONCITO's tal for El og varme. Sammenligningen med "
                     "landsgennemsnittet er gyldig, fordi begge sider opgøres ens. "
                     "NIRAS (2024) s. 18 peger på Energi- og CO2-Regnskabet som den "
                     "rigtige kilde til energidelen. Klimaregnskabets el-faktor er "
                     "kommunens egen produktion; værktøjet regner husholdningernes "
                     "strøm med landets fælles faktor i stedet, fordi strøm deles på "
                     "det fælles net. Fjernvarmens faktor er fjernvarmenettets egen og "
                     "bruges, som den er.",
    },
    {
        "id": "FU17",
        "navn": "Forbrug efter forbrugsgruppe, region, prisenhed og tid",
        "kort": "DST FU17",
        "udbyder": DST,
        "metode": "api",
        "periode_noegle": "FORBRUG_AAR",
        "licens": DST_LICENS,
        "url": "https://www.statistikbanken.dk/FU17",
        "felter": ["foedevare_forbrug_pr_indb"],
        "forbehold": "Forbrugsundersøgelsen er en stikprøve, og et enkelt års "
                     "regionskvotient er ustabil. Kvotienten udjævnes derfor over "
                     "de ti seneste år. Målt over 2015-2024 adskiller kun Sjælland "
                     "(6,9 % over landet) og Midtjylland (4,9 % under) sig påviseligt; "
                     "Hovedstaden, Syddanmark og Nordjylland kan ikke skelnes fra "
                     "landsgennemsnittet og heller ikke indbyrdes. Perioden er den "
                     "nyeste årgang; de ni foregående hentes med.",
    },
    {
        "id": "INDKF111",
        "navn": "Familiernes indkomster efter område",
        "kort": "DST INDKF111",
        "udbyder": DST,
        "metode": "api",
        "periode_noegle": "INDKOMST_AAR",
        "licens": DST_LICENS,
        "url": "https://www.statistikbanken.dk/INDKF111",
        "felter": [],
        "forbehold": "Leverer både nævneren i regionens forbrugskvotient og "
                     "kommunens samlede disponible indkomst, som fødevareforbruget "
                     "skaleres med. Gennemsnittet kan trækkes skævt af få personer "
                     "med meget stor kapitalindkomst i en lille kommune.",
    },
]

# Faglige referencer. Værktøjet indeholder ingen antagelser eller
# koefficienter længere, så listen her er ikke antagelser, men de rapporter,
# de nationale sammenligningstal er afskrevet fra. Selve tallene med
# sidehenvisning ligger i concito.py.
REFERENCER = [
    {
        "id": "CONCITO_2023",
        "navn": "Danmarks globale forbrugsudledninger",
        "kort": "CONCITO (2023)",
        "udgiver": "CONCITO",
        "aar": 2023,
        "url": "https://concito.dk/udgivelser/danmarks-globale-forbrugsudledninger",
        "anvendes_til": "Danmarks samlede forbrugsudledning pr. indbygger og "
                        "fordelingen på varegrupper og tjenester",
        "sider": "s. 8 (nationalt tal), s. 16 figur 7 (varegrupper), "
                 "s. 17 figur 8 (transport), s. 17 (fødevarer), s. 30 (forbrugsprofiler)",
    },
    {
        "id": "NIRAS_2024",
        "navn": "Forbrugsbaserede klimaaftryk på lokalt niveau",
        "kort": "NIRAS (2024)",
        "udgiver": "NIRAS for CONCITO og C40 Cities",
        "aar": 2024,
        "url": "https://concito.dk/udgivelser/forbrugsbaserede-klimaaftryk-paa-lokalt-niveau",
        "anvendes_til": "Anbefalinger til, hvordan et kommunalt forbrugsaftryk bør "
                        "opgøres - og dermed forklaringen på, hvorfor dette værktøj "
                        "ikke selv beregner et",
        "sider": "s. 18 afsnit 4.2.3 (energi), s. 20 afsnit 4.2.6 (transport), "
                 "s. 26 afsnit 4.2.10 (øvrigt forbrug), s. 29 afsnit 4.3.1 "
                 "(offentligt forbrug)",
    },
    {
        "id": "OSEI_OWUSU_2020",
        "kort": "Osei-Owusu et al. (2020)",
        "navn": "Tracking the carbon emissions of Denmark's five regions from a "
                "producer and consumer perspective",
        "udgiver": "Ecological Economics 177, 106778",
        "aar": 2020,
        "url": "https://doi.org/10.1016/j.ecolecon.2020.106778",
        "anvendes_til": "Fordelingsnøglen bag kommunernes fødevareforbrug. Værktøjet "
                        "anvender artiklens metode på aktuelle registerdata og bruger "
                        "ikke dens udledningstal",
        "sider": "s. 4 (landsgennemsnitlig udledningsintensitet i alle kommuner), "
                 "s. 8 (samme produktsammensætning i alle regioner), supplerende "
                 "information ligning S9-S11 (fordelingsnøglen)",
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
        "referencer": REFERENCER,
    }
