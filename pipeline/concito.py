"""CONCITO's og Energistyrelsens offentliggjorte tal for Danmarks
forbrugsbaserede udledninger. Ren data med sidehenvisning.

Dette modul indeholder KUN tal, der står trykt i en navngiven kilde på en
navngiven side. Der er ingen koefficienter, ingen kalibrering og ingen
omregninger. Skal et tal ændres, skal kilden ændres først.

Hovedkilde:
  CONCITO (2023): "Danmarks globale forbrugsudledninger", august 2023.
  Forfattere: Michael Minter, Charlotte Louise Jensen og Torben Chrintz.
  https://concito.dk/udgivelser/danmarks-globale-forbrugsudledninger

Metodisk grundlag for kommunal opgørelse:
  NIRAS for CONCITO/C40 Cities (2024): "Forbrugsbaserede klimaaftryk på
  lokalt niveau - Anbefalinger til en kommende beregningsmodel", 10. april 2024.
"""

KILDE_CONCITO = {
    "id": "CONCITO_2023",
    "titel": "Danmarks globale forbrugsudledninger",
    "udgiver": "CONCITO",
    "aar": 2023,
    "url": "https://concito.dk/udgivelser/danmarks-globale-forbrugsudledninger",
}

KILDE_NIRAS = {
    "id": "NIRAS_2024",
    "titel": "Forbrugsbaserede klimaaftryk på lokalt niveau",
    "udgiver": "NIRAS for CONCITO og C40 Cities",
    "aar": 2024,
    "url": "https://concito.dk/udgivelser/forbrugsbaserede-klimaaftryk-paa-lokalt-niveau",
}

# Danmarks samlede forbrugsudledning pr. indbygger.
# CONCITO (2023) s. 8: "Senest kom Energistyrelsens Global Afrapportering 2023
# [...] frem til en global udledning per dansker på 11 ton CO2e i 2021."
# NIRAS (2024) s. 29 bruger samme størrelsesorden: "cirka 11 ton CO2e".
NATIONALT_AFTRYK = {
    "ton": 11.0,
    "aar": 2021,
    "opgoerelse": "Energistyrelsens Global Afrapportering 2023",
    "kilde": "CONCITO_2023",
    "side": 8,
    "citat": "en global udledning per dansker på 11 ton CO2e i 2021",
}

# Andre offentliggjorte opgørelser, taget med fordi de viser spredningen
# mellem metoder. CONCITO (2023) s. 8 og s. 10.
ANDRE_OPGOERELSER = [
    {"navn": "Eora Global Supply Chain Database (2023), opgørelsesår 2021",
     "ton": 12.0, "kilde": "CONCITO_2023", "side": 8},
    {"navn": "CONCITO's gennemsnit brugt i forbrugsprofilerne",
     "ton": 13.0, "kilde": "CONCITO_2023", "side": 30},
]

# Forbrugsudledning fordelt på varegrupper og tjenester.
# CONCITO (2023) s. 16, figur 7: "Forbrugsudledning i ton CO2e per person
# fordelt på 15 varegrupper og tjenester."
KATEGORIER = [
    {"navn": "Transport", "ton": 3.1, "pct": 24, "side": 16},
    {"navn": "Fødevarer", "ton": 2.5, "pct": 20, "side": 16},
    {"navn": "Boliger", "ton": 1.6, "pct": 13, "side": 16},
    {"navn": "El og varme", "ton": 1.1, "pct": 9, "side": 16},
    {"navn": "Social- og sundhedsvæsen", "ton": 1.1, "pct": 8, "side": 16},
    {"navn": "Andre offentlige tjenester", "ton": 0.8, "pct": 7, "side": 16},
    {"navn": "Undervisning", "ton": 0.4, "pct": 3, "side": 16},
    {"navn": "Fritid og kultur", "ton": 0.4, "pct": 3, "side": 16},
    {"navn": "Tøj og tekstiler", "ton": 0.4, "pct": 3, "side": 16},
    {"navn": "Møbler og boliginventar", "ton": 0.3, "pct": 2, "side": 16},
    {"navn": "Personlig pleje og effekter", "ton": 0.3, "pct": 2, "side": 16},
    {"navn": "Forsikring og finans", "ton": 0.2, "pct": 2, "side": 16},
    {"navn": "Post og teletjenester", "ton": 0.2, "pct": 2, "side": 16},
    {"navn": "Hoteller og pakkerejser", "ton": 0.2, "pct": 1, "side": 16},
    {"navn": "Elektronik og hvidevarer", "ton": 0.2, "pct": 1, "side": 16},
]

# Transportens sammensætning. CONCITO (2023) s. 17, figur 8.
TRANSPORT_UNDERKATEGORIER = [
    {"navn": "Kørsel i personlige transportmidler", "ton": 1.0, "pct_af_transport": 32, "side": 17},
    {"navn": "Anden landtransport", "ton": 1.0, "pct_af_transport": 31, "side": 17},
    {"navn": "Flytransport", "ton": 0.5, "pct_af_transport": 16, "side": 17},
    {"navn": "Køb af køretøjer", "ton": 0.4, "pct_af_transport": 12, "side": 17},
    {"navn": "Færgetransport", "ton": 0.3, "pct_af_transport": 9, "side": 17},
]

# Fødevarernes sammensætning. CONCITO (2023) s. 17, brødtekst.
FOEDEVARE_UNDERKATEGORIER = [
    {"navn": "Oksekød", "ton": 1.4, "pct_af_foedevarer": 55, "side": 17},
    {"navn": "Restauranter og kantiner", "ton": 0.6, "pct_af_foedevarer": None, "side": 17},
    {"navn": "Gris og kylling", "ton": 0.105, "pct_af_foedevarer": 4, "side": 17},
]

# NIRAS' anbefalinger til en kommunal model. Gengivet, fordi de forklarer
# hvorfor dette værktøj ikke selv beregner et kommunalt aftryk.
NIRAS_ANBEFALINGER = [
    {"omraade": "Transport", "side": 20, "afsnit": "4.2.6",
     "anbefaling": "Brug DTU's Transportvaneundersøgelse, som muliggør estimering af "
                   "privat transportarbejde på kommuneniveau fordelt på transportform.",
     "tilgaengelighed": "Kræver aftale om kommercielle vilkår. Ikke offentligt tilgængelig."},
    {"omraade": "Energiforbrug", "side": 18, "afsnit": "4.2.3",
     "anbefaling": "Brug Energistyrelsens Energi- og CO2-Regnskab på adresseniveau.",
     "tilgaengelighed": "Kræver aftale om adgang til data på adresseniveau."},
    {"omraade": "Øvrigt forbrug", "side": 26, "afsnit": "4.2.10",
     "anbefaling": "Brug en eksisterende kommerciel forbrugersegmenteringsmodel "
                   "kombineret med Danmarks Statistiks Forbrugsundersøgelse.",
     "tilgaengelighed": "Kommerciel. Ikke offentligt tilgængelig."},
    {"omraade": "Offentligt forbrug og investeringer", "side": 29, "afsnit": "4.3.1",
     "anbefaling": "Fordeles ligeligt på alle borgere.",
     "tilgaengelighed": "Ingen kommunal variation, indgår derfor ikke som indikator."},
]


# Kildens egne tal summerer ikke, og det skal stå eksplicit frem for at blive
# glattet ud. Der er tre forskellige opgørelser i spil i samme rapport, og de
# hviler på forskellige datagrundlag og opgørelsesår.
NOTER = [
    {"emne": "Tre forskellige tal for det nationale aftryk",
     "tekst": "Rapporten citerer Energistyrelsens Global Afrapportering 2023 for "
              "11 ton pr. dansker i 2021 (s. 8), Eora for 12 ton samme år (s. 8), "
              "og bruger selv 13 ton som gennemsnit i forbrugsprofilerne (s. 30). "
              "Forskellene skyldes forskellige datagrundlag og systemafgrænsninger, "
              "ikke fejl. Der er ikke ét rigtigt tal.",
     "sider": [8, 30]},
    {"emne": "Kategorifordelingen summerer til 12,8 ton, ikke til 11",
     "tekst": "De 15 varegrupper i figur 7 summerer til 12,8 ton, altså tæt på "
              "rapportens eget gennemsnit på 13 ton og ikke på Energistyrelsens "
              "11 ton. Kategorifordelingen skal derfor læses på sit eget grundlag "
              "og ikke ganges ned på 11 ton.",
     "sider": [16, 30]},
    {"emne": "Transportens underkategorier summerer til 3,2 ton, ikke 3,1",
     "tekst": "Figur 8's fem underkategorier summerer til 3,2 ton, mens figur 7 "
              "angiver transport til 3,1 ton. Forskellen er afrunding i kilden.",
     "sider": [16, 17]},
]


def byg_concito():
    """Indholdet til web/data/concito.json."""
    return {
        "kilder": [KILDE_CONCITO, KILDE_NIRAS],
        "nationalt_aftryk": NATIONALT_AFTRYK,
        "andre_opgoerelser": ANDRE_OPGOERELSER,
        "kategorier": KATEGORIER,
        "transport_underkategorier": TRANSPORT_UNDERKATEGORIER,
        "foedevare_underkategorier": FOEDEVARE_UNDERKATEGORIER,
        "niras_anbefalinger": NIRAS_ANBEFALINGER,
        "noter": NOTER,
    }
