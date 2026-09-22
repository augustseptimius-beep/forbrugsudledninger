"""Kommunens eget indkøb pr. indbygger, opgjort på artskontoplanen.

Kilde til afgrænsningen og til retningen på nøgletallene:
  Energistyrelsen (2023): "Danmarks globale klimapåvirkning - Global
  Afrapportering 2023 (GA23): Klimaaftryk af de offentlige indkøb",
  Baggrundsnotat nr. 6, 1. maj 2023.
  https://ens.dk/media/2760/download

Sekundær, til rangordningen mellem indkøbsområder:
  KL (2022): "Klimaaftrykket fra kommunernes indkøb - hvor er udledningen
  størst?", Nyhedsbrevet Råderum nr. 40.

HVAD DETTE MODUL LØSER

Energistyrelsens kategori "Offentligt forbrug" vejer 1,154 ton pr. indbygger,
11,9 % af det nationale aftryk (se ens.py). Den stod uden ét eneste kommunalt
nøgletal, med henvisning til NIRAS (2024) s. 29, afsnit 4.3.1: offentligt
forbrug "fordeles ligeligt på alle borgere" og varierer dermed ikke mellem
kommuner.

Den henvisning er rigtig om NIRAS' fordelingsmodel og forkert om
virkeligheden. Kommunernes eget indkøb varierer betydeligt, og det ligger
offentligt fremme i Danmarks Statistiks REGK11 med indbyggertal som prisenhed.
Kommunerne står for 42 % af det offentlige indkøbs klimaaftryk (GA23
baggrundsnotat 6, s. 3). Kategorien har derfor nu kommunale nøgletal.

DER BEREGNES STADIG INGEN TON, OG DET ER IKKE EN FORGLEMMELSE

Energistyrelsens model ganger indkøbet i kroner med en emissionsfaktor pr.
indkøbskategori fra EXIOBASE (s. 5). Men modellens indkøbsdata er fakturadata,
leveret af SKI, kategoriseret med machine learning på UNSPSC-koder og derefter
aggregeret i SKI's eget vare- og tjenesteydelseshierarki (s. 8). Hverken
fakturadata, hierarkiet eller emissionsfaktorerne er offentligt tilgængelige,
og ingen af dem er fordelt på kommuner.

Der findes altså ingen offentlig nøgle fra Danmarks Statistiks artskonti til
Energistyrelsens emissionsfaktorer. At bygge en selv ville være præcis den
slags ukildebelagte koefficient, constants.py fjernede seks af. Nøgletallene
her er derfor kroner pr. indbygger, og retningen er hentet fra kildens egne
udsagn om, hvilke indkøbsområder der vejer tungt.

HVAD TALLET ER: UDLØSTE INDKØBSKRONER, IKKE EN PRÆSTATION

Målt over de 98 kommuner følger driftsindkøbet pr. indbygger ikke disponibel
indkomst (r = -0,10). Det er dermed det første nøgletal i værktøjet, som ikke
gentager indkomsten - fødevareforbruget ligger på r = +0,97.

Til gengæld følger det alderssammensætningen: r = +0,52 mod andelen på 75 år
og derover, r = -0,40 mod andelen på 0-16 år. Yderpunkterne er små ø-kommuner.
En kommune med mange ældre og få indbyggere at dele de faste opgaver på
udløser flere indkøbskroner pr. borger, og de kroner giver reelle udledninger.
Men tallet siger ikke, at kommunen køber dårligt ind. Det står i nøgletallets
begrundelse, så læseren ser det frem for at opdage det.

FORSYNINGSVIRKSOMHEDERNE ER TAGET UD AF ALLE 98

Hovedkonto 1 er udeladt. Nogle kommuner har forsyningen i regnskabet, andre
har den i selskab, og forskellen er bogføring, ikke forbrug. Målt på 2025
flytter det Albertslund 26 procentpoint, Fredericia 23 og Gentofte 21; for
Fredericia vender fortegnet fra +12 % til -12 %.

Den nærliggende løsning - at skjule de kommuner, der ikke har tallet - virker
ikke. Danmarks Statistik markerer ingen af dem som manglende: 17 kommuner står
med præcis 0 kr., 2 med et negativt beløb og 9 med under 200 kr., mens medianen
er 1.616 og maksimum 7.104. Det er et kontinuum, ikke et spørgsmål om at have
tallet eller ej, og en grænse midt i det ville være en opfundet koefficient.
Hovedkontoen udelades derfor for alle 98, så ingen kommune skjules og alle
sammenlignes på det samme.

Landsgennemsnittet regnes tilsvarende uden hovedkonto 1, så tæller og nævner
dækker samme afgrænsning.

HVILKE ARTER TÆLLER MED

Med: 2.2 Fødevarer, 2.3 Brændsel og drivmidler, 2.7 Anskaffelser, 2.9 Øvrige
varekøb, 4.0 Tjenesteydelser uden moms, 4.5 Entreprenør- og håndværkerydelser,
4.9 Øvrige tjenesteydelser.

Uden, og hvorfor:
  1 Lønninger          ikke et indkøb hos en leverandør.
  2.5, 2.6 jord og     køb af grund og eksisterende bygning er en
  bygninger            formueoverførsel, ikke en produceret vare. Står desuden
                       til 1 kr. og 0 kr. pr. indbygger på drift.
  4.6, 4.7, 4.8        betalinger til stat, kommuner og regioner. GA23 s. 5
  betalinger til det   opgør indkøb "hos private leverandører" og fratrækker
  offentlige           interne offentlige betalinger. De fylder 20.634 kr. pr.
                       indbygger og ville ellers dominere tallet.
  5.x overførsler      kontante ydelser til borgere, ikke indkøb.
  9.x interne poster   interne udgifter og indtægter.

Fravalget af 4.7 har en pris, og den skal stå: en kommune, der køber sin
opgave hos et §60-fællesskab, bogfører det som betaling til kommuner og ser
derfor ud til at købe mindre ind end en kommune, der løser opgaven selv.

DRIFT OG ANLÆG UDJÆVNES FORSKELLIGT, FORDI DE OPFØRER SIG FORSKELLIGT

Driftsindkøbet er meget stabilt: afvigelsen fra landet korrelerer r = +0,98
mellem 2024 og 2025 og r = +0,96 mellem 2021 og 2025. Det vises derfor for
det nyeste regnskabsår, så tallet er så aktuelt som muligt.

Anlægsindkøbet er lumpy - ét skolebyggeri flytter en lille kommune mange
hundrede procent. Enkeltår korrelerer r = +0,75, men to adskilte femårsvinduer
(2016-2020 mod 2021-2025) korrelerer r = +0,71. Der er altså en vedvarende
komponent, som et vindue kan få fat i. Anlæg vises derfor som gennemsnittet
over fem år, efter samme logik som forbrugsundersøgelsens ti-årsvindue i
osei_owusu.py: udjævn kun det, der kræver det, og skriv hvorfor.

FÆRGEKOMMUNERNE FÅR ET FORBEHOLD

Læsø, Samsø og Ærø bruger 42-52 % af deres samlede indkøb på hovedkonto 2,
Transport og infrastruktur, mod 5,3 % for landet. Det er færgedrift, en
regional transportopgave betalt af kommunen, og den gør sammenligningen pr.
indbygger meningsløs for netop dem. Næste kommune på listen er Bornholm med
17,4 %, så der er et bredt spring mellem de tre og resten.

Grænsen er en tredjedel. Den er valgt, fordi den ligger midt i springet og
ikke afhænger af en finindstilling - flyttes den fra 20 % til 40 %, rammer den
de samme tre kommuner. Færgedriften udelades ikke: brændstoffet er en reel
udledning. Retningen spærres, men tallet bliver stående med forbeholdet ved
siden af - se forskellen på spaerrer og skjuler i web/beregning.js.
"""

# Artskonti, der tælles som indkøb hos en leverandør. Se docstringen for de
# fravalgte og begrundelsen for hver.
ARTER_INDKOEB = ["22", "23", "27", "29", "40", "45", "49"]

# Enkeltarter, der vises som selvstændige nøgletal, fordi kilderne fremhæver
# dem. GA23 s. 4 opgør "fødevarer og kantinedrift" som eget indkøbsområde, og
# KL (2022) fremhæver brændstof og køretøjer som det område, der har det
# største aftryk pr. indkøbskrone.
ART_FOEDEVARER = "22"
ART_BRAENDSEL = "23"

# DST's egne tekster for de hovedkonti, modulet skal kunne skelne. De står som
# konstanter, fordi de indgår i opslag og ikke må staves forskelligt to steder.
HOVEDKONTO_IALT = "I alt hovedkonto 0-8"
HOVEDKONTO_FORSYNING = "1 Forsyningsvirksomheder m.v."
HOVEDKONTO_TRANSPORT = "2 Transport og infrastruktur"

# Antal år, anlægsindkøbet udjævnes over. Fem år er valgt, fordi to adskilte
# femårsvinduer korrelerer r = +0,71, mens enkeltår kun når +0,75 fra det ene
# år til det næste. Det er en præsentationsbeslutning, ikke en kilde.
ANLAEG_VINDUE_AAR = 5

# Hovedkonto 2's andel af det samlede indkøb, hvorover retningen spærres.
# Se docstringen: grænsen ligger i et bredt spring og er ikke finindstillet.
FAERGE_GRAENSE = 1 / 3

# Værdien i data.json, der udløser færgeforbeholdet. None er den normale
# tilstand og må derfor IKKE med i FORVENTEDE_FELTER - samme regel som
# affald_indberetning, se build.saml_kommune_post.
FAERGEDRIFT = "faergedrift"

KILDE = {
    "id": "ENS_GA23_INDKOEB",
    "titel": "Global Afrapportering 2023: Klimaaftryk af de offentlige indkøb, "
             "baggrundsnotat nr. 6",
    "udgiver": "Energistyrelsen",
    "aar": 2023,
    "url": "https://ens.dk/media/2760/download",
}

KILDE_KL = {
    "id": "KL_2022_INDKOEB",
    "titel": "Klimaaftrykket fra kommunernes indkøb - hvor er udledningen størst?",
    "udgiver": "KL, Nyhedsbrevet Råderum nr. 40",
    "aar": 2022,
    "url": "https://www.kl.dk/oekonomi-og-administration/oekonomi-og-styring/"
           "omstilling-og-udvikling/nyhedsbrevet-raaderum/2022/nr-40/"
           "klimaaftrykket-fra-kommunernes-indkoeb-hvor-er-udledningen-stoerst",
}


def anlaeg_vindue(seneste_aar, antal=ANLAEG_VINDUE_AAR):
    """De regnskabsår, anlægsindkøbet udjævnes over. Nyeste år sidst."""
    seneste = int(seneste_aar)
    return [str(a) for a in range(seneste - antal + 1, seneste + 1)]


def indkoeb_uden_forsyning(pr_hovedkonto, arter=None):
    """Indkøb pr. indbygger for ét område og ét år, uden hovedkonto 1.

    pr_hovedkonto: {art: {hovedkonto: kr.}} for området og året.
    arter:         de arter, der skal lægges sammen. None betyder alle
                   ARTER_INDKOEB.

    Returnerer kroner pr. indbygger, eller None hvis ingen af arterne har et
    tal. En art, der mangler, tæller ikke som nul: mangler alle, er svaret
    None og kommunen vises med streg."""
    valgte = ARTER_INDKOEB if arter is None else arter
    fundet = False
    sum_kr = 0.0
    for art in valgte:
        pr_hk = pr_hovedkonto.get(art)
        if not pr_hk or HOVEDKONTO_IALT not in pr_hk:
            continue
        fundet = True
        sum_kr += pr_hk[HOVEDKONTO_IALT] - pr_hk.get(HOVEDKONTO_FORSYNING, 0.0)
    return sum_kr if fundet else None


def udjaevn_over_vindue(pr_aar):
    """Gennemsnittet af de år, der faktisk har et tal.

    pr_aar: {år: kr. pr. indbygger eller None}. Et år uden tal springes over -
    et hul må ikke tælle som nul. Returnerer None, hvis intet år har et tal."""
    vaerdier = [v for v in pr_aar.values() if v is not None]
    return sum(vaerdier) / len(vaerdier) if vaerdier else None


def transportandel(pr_hovedkonto):
    """Hovedkonto 2's andel af områdets samlede indkøb.

    Grundlaget er indkøbet UDEN forsyning, altså samme afgrænsning som
    nøgletallene selv. Returnerer None, hvis nævneren mangler eller er nul."""
    i_alt = indkoeb_uden_forsyning(pr_hovedkonto)
    if not i_alt:
        return None
    transport = sum(pr_hovedkonto.get(art, {}).get(HOVEDKONTO_TRANSPORT, 0.0)
                    for art in ARTER_INDKOEB)
    return transport / i_alt


def klassificer_faergedrift(andele):
    """Kommuner, hvis indkøb domineres af hovedkonto 2.

    andele: {områdenavn: transportandel eller None}. Returnerer
    {områdenavn: FAERGEDRIFT} for dem over grænsen. Kommuner uden andel får
    ingen post - et manglende grundlag er ikke et forbehold."""
    return {navn: FAERGEDRIFT for navn, andel in andele.items()
            if andel is not None and andel > FAERGE_GRAENSE}


def byg_indkoeb(seneste_aar):
    """Kildeposten til metodesiden. Ingen tal - de står i data.json."""
    vindue = anlaeg_vindue(seneste_aar)
    return {
        "kilder": [KILDE, KILDE_KL],
        "arter": ARTER_INDKOEB,
        "udeladt_hovedkonto": HOVEDKONTO_FORSYNING,
        "anlaeg_vindue": [vindue[0], vindue[-1]],
        "anlaeg_vindue_aar": ANLAEG_VINDUE_AAR,
        "faerge_graense": FAERGE_GRAENSE,
    }
