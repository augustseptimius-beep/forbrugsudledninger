"""Energistyrelsens opgørelse af Danmarks forbrugsbaserede klimaaftryk.
Ren afskrift fra en navngiven kilde, ligesom concito.py.

Dette modul indeholder KUN tal, der står i Energistyrelsens offentliggjorte
datagrundlag. Der er ingen koefficienter, ingen kalibrering og ingen
fremskrivning. Skal et tal ændres, skal kilden ændres først.

Hovedkilde:
  Energistyrelsen: "Danmarks globale klimapåvirkning - Global Afrapportering
  2026", datagrundlag til PowerBI-rapporten, arket "Forbrugsgrupper".
  Filnavn: GA26_Data_PowerBI_Forbrug.xlsx. Opgørelsesår 2024.
  https://ens.dk/analyser-og-statistik/danmarks-globale-klimapaavirkning-global-afrapportering

HVORFOR ENS FREM FOR CONCITO SOM PRIMÆR RAMME:
  1. Nyere. ENS opgør 2024; CONCITO (2023) opgør 2021.
  2. Opdateres årligt, så platformen ikke fryser fast i ét år.
  3. Kategorierne summerer EKSAKT til hovedtallet. CONCITO's 15 varegrupper
     summerer til 12,8 ton mod deres eget hovedtal på 11 - en uoverensstemmelse,
     der krævede en note hvert sted tallene blev vist.
  4. Officiel myndighedsopgørelse.

CONCITO er bevaret i concito.py som navngiven sekundær kilde til det, ENS ikke
opgør: fødevarernes sammensætning (oksekødets andel) og forbrugsprofilerne
efter indkomst.

BEMÆRK OM AFGRÆNSNING: ENS holder investeringer og offentligt forbrug ude som
egne blokke på niveau 1, hvor CONCITO fordeler dem ind i forbrugskategorierne.
Derfor er ENS' transport 1,8 ton og CONCITO's 3,1. Det er ikke uenighed om
virkeligheden, men to forskellige systemafgrænsninger, og de to sæt tal må
IKKE lægges sammen eller sammenlignes direkte.
"""

KILDE_ENS = {
    "id": "ENS_GA26",
    "titel": "Danmarks globale klimapåvirkning - Global Afrapportering 2026",
    "udgiver": "Energistyrelsen",
    "aar": 2026,
    "opgoerelsesaar": 2024,
    "url": "https://ens.dk/analyser-og-statistik/danmarks-globale-klimapaavirkning-global-afrapportering",
    "datagrundlag": "GA26_Data_PowerBI_Forbrug.xlsx, arket Forbrugsgrupper",
}

# Danmarks samlede forbrugsbaserede klimaaftryk pr. indbygger.
# Arket "Hovedresultater", rækken "Udledninger pr. indbygger (ton CO2e)", 2024.
NATIONALT_AFTRYK = {
    "ton": 9.73,
    "aar": 2024,
    "kilde": "ENS_GA26",
    "total_mio_ton": 58.0,
    "note": "Samlet 58,0 mio. ton CO2e fordelt på 5,96 mio. indbyggere.",
}

# Udviklingen, så en læser kan se om niveauet er stabilt. Samme ark og række.
UDVIKLING = [
    {"aar": 2019, "ton": 11.00},
    {"aar": 2020, "ton": 10.22},
    {"aar": 2021, "ton": 11.07},
    {"aar": 2022, "ton": 10.71},
    {"aar": 2023, "ton": 9.63},
    {"aar": 2024, "ton": 9.73},
]

# Forbrugskategorierne.
#
# GRUPPERINGEN ER VORES, TALLENE ER ENS'. ENS opgør 62 poster på niveau 2.
# Feltet "poster" angiver præcis hvilke af dem, hver kategori lægger sammen,
# så enhver sum kan efterprøves mod kilden. Der lægges intet til, og intet
# udelades: de syv kategorier summerer til hovedtallet.
#
# Grupperingen følger de områder, en kommunal klimahandlingsplan arbejder med,
# så en klimakoordinator kan genkende dem. Den er ikke Energistyrelsens egen.
KATEGORIER = [
    {
        "navn": "Transport",
        "ton": 1.844, "pct": 19.0,
        "poster": ["Husholdninger / Transport",
                   "Investeringer / Investering i transportmidler"],
        "note": "Husholdningernes transport plus køb af køretøjer.",
    },
    {
        "navn": "Føde- og drikkevarer",
        "ton": 1.649, "pct": 17.0,
        "poster": ["Husholdninger / Føde- og drikkevarer"],
        "note": "Husholdningernes køb af føde- og drikkevarer.",
    },
    {
        "navn": "Forbrugsprodukter og services",
        "ton": 1.625, "pct": 16.7,
        "poster": ["Husholdninger / Services", "Husholdninger / Andre produkter",
                   "Husholdninger / Tekstiler", "Husholdninger / Kultur og fritid",
                   "Husholdninger / Elektronik"],
        "note": "Services, elektronik, tekstiler, kultur og fritid og andre "
                "produkter - fem af Energistyrelsens husholdningsgrupper lagt "
                "sammen.",
    },
    {
        "navn": "Offentligt forbrug",
        "ton": 1.154, "pct": 11.9,
        "poster": ["Offentligt forbrug (hele niveau 1, 39 poster)"],
        "note": "Sundhedsvæsen, uddannelse, forsvar, forvaltning med mere. "
                "Fordeles ligeligt på alle borgere og varierer ikke mellem kommuner.",
    },
    {
        "navn": "Energi og forsyning",
        "ton": 0.913, "pct": 9.4,
        "poster": ["Husholdninger / Energi og forsyning"],
        "note": "Boligernes el, varme og øvrig forsyning.",
    },
    {
        "navn": "Bolig og byggeri",
        "ton": 0.478, "pct": 4.9,
        "poster": ["Investeringer / Investering i boliger"],
        "note": "Selve byggeriet af boliger. Boligernes energiforbrug hører til "
                "Energi og forsyning, ikke her.",
    },
    {
        "navn": "Øvrige investeringer",
        "ton": 2.066, "pct": 21.2,
        "poster": ["Investeringer / Forskning og udvikling",
                   "Investeringer / Investering i anlæg",
                   "Investeringer / Investering i maskiner",
                   "Investeringer / Investering i andre bygninger",
                   "Investeringer / Investering i computer software",
                   "Investeringer / IT-udstyr",
                   "Investeringer / Telekommunikationsudstyr",
                   "Investeringer / øvrige poster og lagerændringer"],
        "note": "Erhvervets og samfundets investeringer i anlæg, maskiner, "
                "forskning og erhvervsbyggeri. Tæller med i aftrykket, men er "
                "ikke borgernes eget forbrug, og en kommune har ingen indikator "
                "for dem. Står med, så kategorierne summerer til hele aftrykket.",
        # Restpost. Den er den største enkeltkategori (2,07 ton), men den er
        # ikke en forbrugskategori, en kommune kan vælge at arbejde med. Ville
        # den stå øverst efter vægt, ville overblikket åbne med noget, ingen
        # klimakoordinator kan handle på. Den vises derfor sidst, og det er et
        # bevidst brud på vægtrækkefølgen - dokumenteret her frem for skjult.
        "restpost": True,
    },
]

# Uoverensstemmelser i kilden skal stå eksplicit, ikke glattes ud.
NOTER = [
    {"emne": "Kategorierne summerer til hovedtallet",
     "tekst": "De syv kategorier giver tilsammen 9,73 ton, altså præcis "
              "Energistyrelsens eget hovedtal. Procenterne summerer til 100,1 "
              "på grund af afrunding på én decimal.",
     "kilde": "ENS_GA26"},
    {"emne": "Kan ikke sammenlignes med CONCITO's kategorier",
     "tekst": "Energistyrelsen holder investeringer og offentligt forbrug ude "
              "som egne blokke, mens CONCITO fordeler dem ind i "
              "forbrugskategorierne. Derfor opgør Energistyrelsen transport til "
              "1,8 ton, hvor CONCITO når 3,1. Forskellen er systemafgrænsning, "
              "ikke uenighed. De to sæt tal må ikke lægges sammen.",
     "kilde": "ENS_GA26"},
    {"emne": "Niveauet er faldet siden 2021",
     "tekst": "Aftrykket pr. indbygger er faldet fra 11,1 ton i 2021 til 9,7 "
              "ton i 2024. Et tal fra en ældre opgørelse er derfor ikke "
              "nødvendigvis forkert - det kan være et andet år.",
     "kilde": "ENS_GA26"},
]


def byg_ens():
    """Indholdet til web/data/ens.json."""
    return {
        "kilde": KILDE_ENS,
        "nationalt_aftryk": NATIONALT_AFTRYK,
        "udvikling": UDVIKLING,
        "kategorier": KATEGORIER,
        "noter": NOTER,
    }
