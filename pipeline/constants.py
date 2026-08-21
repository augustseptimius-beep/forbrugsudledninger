"""Periodekonstanter og antagelser. ÅRLIG OPDATERING: se spec §5.5.

Ved den årlige genkøring:
1. Opdatér PERIODER til de nyeste tilgængelige perioder for hver kilde
   (kør build.py - valideringsrapporten viser, om en tabel har nyere data).
2. Tjek om BILKM_AFVIGELSE_REGION eller EL_CO2_MANUAL kan udfyldes mere -
   se vejledningen ved hver tabel nedenfor.
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

# --- MANUEL KILDE 1: DTU Transportvaneundersøgelsen (bil-km-afvigelse pr. region) ---
# Kun Nordjylland er kendt (fra v5-regnearket, udtræk juli 2026). transportvaner.dk
# har intet offentligt API - de fire øvrige regioner skal slås op manuelt:
#   1. Gå til transportvaner.dk (selvbetjening).
#   2. Vælg mål: trafikarbejde, transportmiddel: bil, periode: seneste 10 år (gns.).
#   3. Slå op for hver af: Hovedstaden, Sjælland, Syddanmark, Midtjylland.
#   4. Afvigelse = (region_km - land_km) / land_km. Tilføj som ny nøgle nedenfor.
BILKM_AFVIGELSE_REGION = {
    "Nordjylland": 0.178423236514523,
}

# --- MANUEL KILDE 2: Energinet miljødeklaration (el-CO2 pr. kommune, g/kWh) ---
# Kun land og Thisted er kendt (fra v5-regnearket). Findes ikke som færdig årstabel
# via API'et - kun som rå timedata, der kræver forbrugsvægtet aggregering.
# Årlig opdatering: besøg https://energinet.dk/data-om-energi/co2-pr-kwh-el-kommune/
# og aflæs den offentliggjorte kommunedeklaration for det seneste år.
EL_CO2_MANUAL = {
    "Hele landet": 51.8,
    "Thisted": 26.7,
}
