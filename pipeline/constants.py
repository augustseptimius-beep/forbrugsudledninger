"""Periodekonstanter og antagelser. ÅRLIG OPDATERING: se spec §5.5.

Ved den årlige genkøring:
1. Opdatér PERIODER til de nyeste tilgængelige perioder for hver kilde
   (kør build.py - valideringsrapporten viser, om en tabel har nyere data).
2. EL_CO2_MANUAL er et sikkerhedsnet, ikke en datakilde - el-CO2 hentes
   automatisk i fetch_energi.py. Rør den kun, hvis kilden selv ændrer sig.
3. Der er ingen beregningskoefficienter i denne fil. De nationale
   sammenligningstal står afskrevet med sidehenvisning i concito.py."""

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
    "KLIMAREGNSKAB_AAR": "2023",
}

# --- INGEN BEREGNINGSKOEFFICIENTER HER ---
#
# Denne fil indeholdt tidligere KONSTANTER med et nationalt anker, en
# indkomstelasticitet, en bilkørselsandel, en byggeandel og en
# boligudgiftsmodregning, samt BILKM_AFVIGELSE_REGION. Alt sammen er fjernet,
# fordi ingen af tallene kunne kildebelægges:
#
#   anker 10,0 ton             CONCITO (2023) s. 8 citerer Energistyrelsens
#                              Global Afrapportering 2023 for 11 ton, ikke 10.
#   elasticitet 0,30-0,50      Findes hverken i CONCITO (2023) eller NIRAS (2024).
#   bilkorsel_andel 0,12-0,15  CONCITO (2023) s. 17, figur 8, opgør kørsel i
#                              personlige transportmidler til 1,0 ton af
#                              transportens 3,1 - cirka 9 % af aftrykket,
#                              ikke 12-15 %.
#   byggeandel 0,0456045       Kalibreret til at reproducere én kommunes
#                              tidligere resultat. Kurvetilpasning uden kilde.
#   boligudgift_modregning 0,45  Ræsonneret, ingen kilde.
#   bilkm_afvigelse_region     Kun Nordjylland havde et DTU-tal; de øvrige fire
#                              blev udledt af pendlingsafstande og kalibreret.
#                              Både proxyen og kalibreringen var vores egne valg.
#
# Værktøjet beregner derfor ikke længere et kommunalt aftryk i ton. De
# nationale sammenligningstal står afskrevet med sidehenvisning i concito.py.
# Skal der igen beregnes et kommunalt aftryk, skal datagrundlaget fra NIRAS'
# anbefaling først skaffes - se NIRAS_ANBEFALINGER i concito.py.

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
