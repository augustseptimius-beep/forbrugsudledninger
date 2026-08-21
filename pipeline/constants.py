"""Periodekonstanter og antagelser. ÅRLIG OPDATERING: se spec §5.5.

Ved den årlige genkøring:
1. Opdatér PERIODER til de nyeste tilgængelige perioder for hver kilde
   (kør build.py - valideringsrapporten viser, om en tabel har nyere data).
2. BILKM_AFVIGELSE_REGION og EL_CO2_MANUAL er nu SIKKERHEDSNET, ikke
   datakilder. Begge hentes automatisk (fetch_pendling.py og
   fetch_energi.py). Rør dem kun, hvis kilderne selv ændrer sig.
3. Konstanterne i KONSTANTER (anker, elasticitet mv.) er metodiske antagelser,
   ikke datapunkter - opdatér kun hvis metoden selv ændres."""

# --- Periodekonstanter: ÅRETS ét sted at redigere ved opdatering ---
PERIODER = {
    "FOLK_KVARTAL": "2026K1",
    "FOLK_KVARTAL_FORRIGE": "2025K1",
    "AREAL_AAR": "2025",
    "INDKOMST_AAR": "2024",
    "FORMUE_AAR": "2024",
    "GINI_AAR": "2024",
    "BOLIGER_AAR": "2025",
    "OPVARMNING_AAR": "2026",
    "BYGGERI_AAR": "2024",
    "BILER_MAANED": "2026M01",
    "AFFALD_AAR": "2023",
    "BOLIGPRIS_KVARTAL": "2025K4",
    "PENDLING_AAR": "2024",
    "ELDEKLARATION_AAR": "2025",
}

# --- Konstanter til beregningsmotoren. Porteret 1:1 fra Plan 1's test/fixtures.js -
#     ÆNDR IKKE disse uden at køre Plan 1's golden tests igen (test/golden.test.js). ---
KONSTANTER = {
    "anker": 10.0,
    "elasticitet": {"low": 0.30, "high": 0.50},
    "bilkorsel_andel": {"low": 0.12, "high": 0.15},
    "byggeandel": {"low": 0.0, "high": 0.0456045},
    "boligudgift_modregning": 0.45,
}

# --- KALIBRERINGSANKER: DTU Transportvaneundersøgelsen (bil-km pr. region) ---
# Kun Nordjylland er slået op direkte (v5-regnearket, udtræk juli 2026).
# transportvaner.dk har intet offentligt API.
#
# De fire øvrige regioner udledes nu automatisk af DST's AFSTB4
# (gennemsnitlig pendlingsafstand efter bopælsområde) i fetch_pendling.py,
# kalibreret så Nordjylland rammer værdien herunder præcist. Se modulets
# docstring for validering og for hvorfor tallene IKKE bruges på kommuneniveau.
#
# Dette dict er dermed to ting: kalibreringens anker, og et sikkerhedsnet,
# hvis DST ikke svarer ved den årlige kørsel.
BILKM_AFVIGELSE_REGION = {
    "Nordjylland": 0.178423236514523,
}

# --- SIKKERHEDSNET: Energinet miljødeklaration (el-CO2 pr. kommune, g/kWh) ---
# Værdierne herunder er aflæst manuelt fra v5-regnearket. De bruges KUN, hvis
# Energi Data Service ikke svarer ved den årlige kørsel.
#
# Til daglig beregnes tallet nu for alle 98 kommuner i fetch_energi.py ud fra
# Energinets rå timedata - præcis den forbrugsvægtede aggregering, denne
# kommentar tidligere beskrev som ikke-automatiserbar. Metoden følger
# Energinets lokationsbaserede kommunedeklaration.
EL_CO2_MANUAL = {
    "Hele landet": 51.8,
    "Thisted": 26.7,
}
