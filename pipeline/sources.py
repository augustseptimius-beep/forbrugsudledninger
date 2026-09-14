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
    _dst("INDKP101", "Disponibel indkomst efter område", "INDKOMST_AAR",
         ["disp_indkomst"]),
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
              "BOLIGER_AAR", ["fritidshuse"]),
         url="https://www.statistikbanken.dk/BOL101",
         forbehold="Bruges til at fordele husholdningernes energi og udledning på "
                   "samtlige boliger. Fritidsboliger bruger energi, men deres ejere "
                   "er registreret i en anden kommune."),
    {
        "id": "KLIMAREGNSKABET_HUSHOLDNINGER",
        "navn": "Husholdningernes energiforbrug og udledning (Energi- og CO2-regnskabet)",
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
]

# Faglige referencer. Værktøjet indeholder ingen antagelser eller
# koefficienter længere, så listen her er ikke antagelser, men de rapporter,
# de nationale sammenligningstal er afskrevet fra. Selve tallene med
# sidehenvisning ligger i concito.py.
REFERENCER = [
    {
        "id": "CONCITO_2023",
        "navn": "Danmarks globale forbrugsudledninger",
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
