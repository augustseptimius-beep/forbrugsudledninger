"""Henter de 9 DST-tabeller, motorens datakontrakt kræver. Hver funktion
returnerer et dict {kommunenavn: værdi} (eller et par af dicts, hvis tabellen
dækker to felter). DST's tal bruger komma som decimalseparator i nogle CSV-felter
(fx Gini), så numeriske felter uden for INDHOLD-kolonnen parses med _to_float()."""

import dst_client
from constants import PERIODER
from kommuner import KOMMUNER

BASE = dst_client.DST_BASE_URL


def _to_float(s):
    return float(s.replace(",", "."))


def fetch_folketal():
    """Returnerer (folketal_nu, folketal_forrige), begge {navn: int}."""
    rows_nu = dst_client.fetch(BASE, "FOLK1A", {
        "OMRÅDE": "*", "KØN": "TOT", "ALDER": "IALT", "CIVILSTAND": "TOT",
        "Tid": PERIODER["FOLK_KVARTAL"],
    })
    rows_forrige = dst_client.fetch(BASE, "FOLK1A", {
        "OMRÅDE": "*", "KØN": "TOT", "ALDER": "IALT", "CIVILSTAND": "TOT",
        "Tid": PERIODER["FOLK_KVARTAL_FORRIGE"],
    })
    return dst_client.sum_by(rows_nu, ["OMRÅDE"]), dst_client.sum_by(rows_forrige, ["OMRÅDE"])


def fetch_indkomst():
    """Returnerer {navn: disponibel_indkomst (int, kr.)}."""
    rows = dst_client.fetch(BASE, "INDKP101", {
        "OMRÅDE": "*", "ENHED": "116", "KOEN": "MOK", "INDKOMSTTYPE": "100",
        "Tid": PERIODER["INDKOMST_AAR"],
    })
    return dst_client.sum_by(rows, ["OMRÅDE"])


def fetch_gini():
    """Returnerer {navn: gini (float)}. Bemærk: tabellens områdevariabel hedder
    KOMMUNEDK, ikke OMRÅDE."""
    rows = dst_client.fetch(BASE, "IFOR41", {
        "ULLIG": "70", "KOMMUNEDK": "*", "Tid": PERIODER["GINI_AAR"],
    })
    return {r["KOMMUNEDK"]: _to_float(r["INDHOLD"]) for r in rows
            if r["INDHOLD"] not in dst_client.INGEN_DATA_MARKORER}


# Midpoint-antagelse for BOL103's størrelsesintervaller. Egen beregning, dokumenteret
# som antagelse. Giver ca. 1-2 m² afvigelse fra manuelt opgjorte tal for de yderste,
# åbne intervaller ("- 50 kvm", "175 kvm og derover") - forventet.
_BOLIGSTOR_MIDPUNKT = {
    "- 50 kvm": 40, "50-74 kvm": 62, "75-99 kvm": 87, "100-124 kvm": 112,
    "125-149 kvm": 137, "150-174 kvm": 162, "175 kvm og derover": 195,
}


def fetch_boliger_type():
    """Returnerer (parcel, raekke, etage), hver {navn: antal boliger (int)}.
    UDLFORH/EJER/OPFØRELSESÅR har ingen total-VÆRDIKODE, men har elimination=True i
    BOL101's metadata - de UDELADES derfor helt fra forespørgslen (ligesom ANTVÆR/
    HUSSTØR i fetch_boligareal()), så DST's API selv summerer over dem. Wildcarding
    alle tre samtidig (i stedet for at udelade dem) overskrider DST's 1-mio.-
    cellegrænse ved OMRÅDE=* (verificeret: gav HTTP 400 REQUEST-LIMIT live)."""
    rows = dst_client.fetch(BASE, "BOL101", {
        "OMRÅDE": "*", "BEBO": "1000", "ANVENDELSE": "125,130,140",
        "Tid": PERIODER["BOLIGER_AAR"],
    })
    sums = dst_client.sum_by(rows, ["OMRÅDE", "ANVENDELSE"])
    parcel = {navn: v for (navn, anv), v in sums.items() if anv == "Parcel/Stuehuse"}
    raekke = {navn: v for (navn, anv), v in sums.items() if anv == "Række-, kæde- og dobbelthuse"}
    etage = {navn: v for (navn, anv), v in sums.items() if anv == "Etageboliger"}
    return parcel, raekke, etage


def fetch_fritidshuse():
    """Returnerer {navn: antal ubeboede fritidshuse}.

    Nødvendig for at fordele husholdningernes energi og udledning retvisende.
    Fritidsboliger bruger energi, men deres ejere er registreret i en anden
    kommune. Deler man husholdningstallet ud på indbyggere, følger det
    sommerhustætheden næsten lige så tæt som boligstørrelsen - målt på alle
    98 kommuner. Se fetch_klimaregnskabet.py for tallene."""
    rows = dst_client.fetch(BASE, "BOL101", {
        "OMRÅDE": "*", "BEBO": "5000", "ANVENDELSE": "565",
        "UDLFORH": "*", "EJER": "*", "OPFØRELSESÅR": "*",
        "Tid": PERIODER["BOLIGER_AAR"],
    })
    return dst_client.sum_by(rows, ["OMRÅDE"])


def fetch_boligareal():
    """Returnerer {navn: gennemsnitligt boligareal i m² (float)} via midpoint-metoden.
    IKKE wildcard ANTVÆR/HUSSTØR - de er irrelevante her og blæser cellegrænsen op."""
    rows = dst_client.fetch(BASE, "BOL103", {
        "AMT": "*", "BEBO": "1000", "ANVENDELSE": "125,130,140",
        "BOLIGSTØR": "*", "Tid": PERIODER["BOLIGER_AAR"],
    })
    sum_areal, sum_antal = {}, {}
    for r in rows:
        midt = _BOLIGSTOR_MIDPUNKT.get(r["BOLIGSTØR"])
        if midt is None:
            continue  # "Uoplyst" har ingen kendt størrelse - udelades
        if r["INDHOLD"] in dst_client.INGEN_DATA_MARKORER:
            continue  # ingen data for denne kommune/interval - ikke nul
        n = int(r["INDHOLD"])  # uventet talformat skal fejle højlydt, ikke forsvinde
        navn = r["AMT"]
        sum_areal[navn] = sum_areal.get(navn, 0) + n * midt
        sum_antal[navn] = sum_antal.get(navn, 0) + n
    return {navn: sum_areal[navn] / sum_antal[navn] for navn in sum_antal if sum_antal[navn] > 0}


# ANVEND-koder der IKKE er almindelige boliger - udelades fra byggeaktivitet
# (verificeret: inkl. Kollegier gav 153 for Thisted 2024 i stedet for korrekt 103).
_BYGGERI_IKKE_BOLIG = {"Kollegier", "Døgninstitutioner", "IKKE-FORDELT, UOPLYST"}


def fetch_opvarmning():
    """Returnerer (ialt, olie, naturgas), hver {navn: antal boliger (int)}.
    Wildcarder ANVENDELSE, fordi opv_boliger_ialt skal dække ALLE boligtyper."""
    rows = dst_client.fetch(BASE, "BOL102", {
        "AMT": "*", "BEBO": "1000", "ANVENDELSE": "*", "OPVARMNING": "*",
        "Tid": PERIODER["OPVARMNING_AAR"],
    })
    ialt = dst_client.sum_by(rows, ["AMT"])
    per_type = dst_client.sum_by(rows, ["AMT", "OPVARMNING"])
    olie = {navn: v for (navn, opv), v in per_type.items() if opv == "Centralvarme med olie"}
    naturgas = {navn: v for (navn, opv), v in per_type.items() if opv == "Centralvarme m naturgas"}
    return ialt, olie, naturgas


def fetch_byggeri():
    """Returnerer {navn: fuldførte boliger seneste år (int)}. Udelader kollegier/
    døgninstitutioner - se _BYGGERI_IKKE_BOLIG."""
    aar = PERIODER["BYGGERI_AAR"]
    kvartaler = ",".join(f"{aar}K{k}" for k in range(1, 5))
    rows = dst_client.fetch(BASE, "BYGV33", {
        "OMRÅDE": "*", "BYGFASE": "3", "ANVEND": "*", "BYGHERRE": "*",
        "Tid": kvartaler,
    })
    relevante = [r for r in rows if r["ANVEND"] not in _BYGGERI_IKKE_BOLIG]
    return dst_client.sum_by(relevante, ["OMRÅDE"])


def fetch_biler():
    """Returnerer (biler_ialt, el, plugin, diesel, benzin), hver {navn: antal (int)}.

    Kun husholdningernes biler (BRUG 1100). Firma- og leasingbiler er registreret
    på virksomhedens adresse, ikke der, hvor de bruges - i Brøndby og Albertslund
    var knap hver tredje bil en erhvervsbil - og Energistyrelsens
    transportkategori er husholdningernes.

    Benzin og diesel hentes hver for sig, men vises som ét nøgletal. BIL54's
    øvrige drivmidler - F-gas, N-gas, petroleum, brint, metanol, ætanol - udgør
    tilsammen under 0,1 pct. af bilparken i hver kommune og hentes ikke."""
    rows = dst_client.fetch(BASE, "BIL54", {
        "OMRÅDE": "*", "BILTYPE": "4000101002", "BRUG": "1100",
        "DRIV": "20200,20225,20232,20210,20205", "Tid": PERIODER["BILER_MAANED"],
    })
    per_type = dst_client.sum_by(rows, ["OMRÅDE", "DRIV"])
    def _uddrag(driv_navn):
        return {navn: v for (navn, driv), v in per_type.items() if driv == driv_navn}
    return (_uddrag("Drivmidler i alt"), _uddrag("El"), _uddrag("Pluginhybrid"),
            _uddrag("Diesel"), _uddrag("Benzin"))


def fetch_affald():
    """Returnerer (kg_pr_indbygger, genanvendelse_pct), begge {navn: tal (int)}.
    LABY25's KOMGRP-variabel bruger kommunenavne direkte (samme som OMRÅDE i andre
    tabeller), plus nogle kommunegruppe-aggregater vi ikke bruger."""
    rows = dst_client.fetch(BASE, "LABY25", {
        "KOMGRP": "*", "BNØGLE": "*", "Tid": PERIODER["AFFALD_AAR"],
    })
    per_type = dst_client.sum_by(rows, ["KOMGRP", "BNØGLE"])
    kg = {navn: v for (navn, n), v in per_type.items() if n == "Husholdningsaffald (kg. pr. indbygger)"}
    pct = {navn: v for (navn, n), v in per_type.items() if n == "Husholdningsaffald indsamlet til genanvendelse (pct.)"}
    return kg, pct


# Restaffaldets fraktioner i LABY24. En kommune bogfører sit indsamlede
# restaffald under den ene eller den anden - Nyborg bruger fx FORBRÆNDINGSEGNET,
# hvor de fleste bruger DAGRENOVATION - så de skal lægges sammen, før tallene
# kan sammenlignes på tværs af kommuner.
RESTAFFALD_FRAKTIONER = ("DAGRENOVATION OG LIGNENDE", "FORBRÆNDINGSEGNET AFFALD")


def fetch_affald_validitet(aar, forrige_aar):
    """Returnerer {navn: forhold} for restaffald i aar delt med forrige_aar.

    DETTE ER ET VALIDITETSTJEK TIL VALIDERINGSRAPPORTEN, IKKE ET DATAFELT.
    Det ender ikke i data.json og styrer ikke brugerfladen. Det findes, fordi
    DST's kommunefordeling af husholdningsaffald for 2023 viste sig upålidelig:
    kommuner, der deler et fælleskommunalt affaldsselskab, havde fået hinandens
    restaffald bogført. Enkeltvis var tallene absurde - Hørsholm indberettede
    29 ton dagrenovation for 24.715 indbyggere - men lagt sammen inden for
    selskabet var niveauet normalt.

    LABY25, tabellen nøgletallet hentes fra, bærer ikke DST's advarsel om
    kommunefordelingen. Den står på tonnage-tabellen LABY24 og i
    statistikdokumentationen. Derfor er tjekket nødt til at hente LABY24.

    Et brat fald i en kommunes eget restaffald fra det ene år til det andet er
    ikke en reel adfærdsændring, men et indberetningsbrud. Hvad der er bratt
    nok, afgøres bevidst IKKE her: funktionen returnerer det rå forhold og
    overlader dommen til mennesket, der læser rapporten."""
    rows = dst_client.fetch(BASE, "LABY24", {
        "KOMGRP": "*", "BEHANDLING": "TOT", "AFFFRAK": "*",
        "Tid": f"{forrige_aar},{aar}",
    })
    ton = {}
    for r in rows:
        if r["AFFFRAK"] not in RESTAFFALD_FRAKTIONER:
            continue
        # DST bruger ".." for "ingen data". Her tæller den som nul, fordi en
        # fraktion, der er forsvundet, er præcis det tjekket leder efter. Den
        # må aldrig tælle som nul i et datafelt - kun i dette tjek.
        try:
            t = float(r["INDHOLD"].strip())
        except ValueError:
            t = 0.0
        noegle = (r["KOMGRP"], r["TID"])
        ton[noegle] = ton.get(noegle, 0.0) + t

    forhold = {}
    for navn in {navn for navn, _ in ton}:
        foer = ton.get((navn, str(forrige_aar)), 0.0)
        if foer > 0:
            forhold[navn] = ton.get((navn, str(aar)), 0.0) / foer
    return forhold


def fetch_affald_sammensaetning(aar):
    """Returnerer {navn: dagrenovationens andel af alt husholdningsaffald i pct.}.

    Signalet klassificeringen hviler på. Andelen er strukturelt stor i enhver
    kommune - landet lå på 27-32 % i 2019-2023 - fordi dagrenovation er det, der
    bliver tilbage, når alt sorterbart er sorteret fra. En kommune kan sortere
    meget fra og lande højt eller lavt, men ikke på nul: så mangler fraktionen i
    regnskabet. Til forskel fra et forholdstal mellem to år kan det aflæses på ét
    år, og det afslører derfor også de kommuner, hvor fejlen er konstant og
    dermed usynlig for en år-til-år-sammenligning."""
    rows = dst_client.fetch(BASE, "LABY24", {
        "KOMGRP": "*", "BEHANDLING": "TOT",
        "AFFFRAK": "TOTHHAFFALD,A", "Tid": str(aar),
    })
    ton = {}
    for r in rows:
        # ".." betyder ingen data. Her tæller det som nul, fordi en fraktion, der
        # er forsvundet, er præcis det tjekket leder efter. Det må aldrig tælle
        # som nul i et datafelt - kun i dette tjek.
        try:
            t = float(r["INDHOLD"].strip())
        except (ValueError, AttributeError):
            t = 0.0
        ton.setdefault(r["KOMGRP"], {})[r["AFFFRAK"]] = t

    andel = {}
    for navn, v in ton.items():
        ialt = v.get("HUSHOLDNINGSAFFALD I ALT", 0.0)
        if ialt > 0:
            andel[navn] = v.get("DAGRENOVATION OG LIGNENDE", 0.0) / ialt * 100
    return andel


# Kommuner der deler affaldsindberetning, grupperet efter selskab. Hvem der deler
# er en STRUKTUREL kendsgerning fra selskabernes ejerkredse - den bliver ikke
# forældet af et nyt dataår. Om listen så SPÆRRER et nøgletal afgøres derimod af
# indeværende års tal, se klassificer_affald. Retter selskabet sin indberetning,
# falder spærringen bort af sig selv.
# Kilder: norfors.dk/om-os, renodjurs.dk/om-reno-djurs.
DELTE_INDBERETNINGER = {
    "Norfors": {"Allerød", "Fredensborg", "Helsingør", "Hørsholm", "Rudersdal"},
    "Reno Djurs": {"Norddjurs", "Syddjurs"},
}

AFFALD_BEKRAEFTET_FEJL = "bekraeftet_fejl"
# To årsager til usikkerhed, fordi de skal forklares forskelligt for læseren.
# En kommune, hvis fraktion mangler, har ikke "svinget" - den mangler et tal.
AFFALD_USIKKER_FRAKTION = "usikker_fraktion"
AFFALD_USIKKER_SPRING = "usikker_spring"


def _nedre_tukey_graense(vaerdier):
    """Q1-1,5*IQR - den nedre halvdel af et boksplots standardgrænse (Tukey, 1977).
    Bevidst ENSIDIG: en lav dagrenovationsandel er et hul i indberetningen, mens en
    høj er en reel egenskab ved kommunen. København og Frederiksberg ligger over
    49 %, fordi de sorterer mindre fra - tæt by, lidt haveaffald - og skal ikke
    stemples som datafejl. Returnerer None ved for få værdier."""
    if len(vaerdier) < 8:
        return None
    s = sorted(vaerdier)
    n = len(s)

    def kvartil(p):
        i = p * (n - 1)
        lav = int(i)
        return s[lav] + (s[lav + 1] - s[lav]) * (i - lav) if lav + 1 < n else s[lav]

    q1, q3 = kvartil(0.25), kvartil(0.75)
    return q1 - 1.5 * (q3 - q1)


def _tukey_hegn(vaerdier):
    """Tosidet udgave til forholdstallet, hvor begge retninger er mistænkelige:
    et brat fald OG et brat spring er begge brud på en ellers stabil serie."""
    if len(vaerdier) < 8:
        return None
    s = sorted(vaerdier)
    n = len(s)

    def kvartil(p):
        i = p * (n - 1)
        lav = int(i)
        return s[lav] + (s[lav + 1] - s[lav]) * (i - lav) if lav + 1 < n else s[lav]

    q1, q3 = kvartil(0.25), kvartil(0.75)
    iqr = q3 - q1
    return q1 - 1.5 * iqr, q3 + 1.5 * iqr


# --- Indkomstens robusthed pr. kommune ---

# Hvor mange år tilbage indkomsten sammenlignes med. Tre år, fordi et spring
# skal kunne nå at vise sig som et vedvarende niveau og ikke kun som ét års
# udsving: et engangsbeløb falder tilbage inden for et par år, mens en
# vedvarende kapitalindkomst bliver liggende.
INDKOMST_VINDUE_AAR = 3

# Grænsen for den robuste z-score. 3,5 er Iglewicz og Hoaglins standardværdi
# for median/MAD-metoden og er ikke valgt til dette datasæt. Den er ikke
# kritisk her: over de 98 kommuner ligger den markerede på z ≈ 26 og den
# næsthøjeste på z ≈ 2, så alt mellem 3 og 20 ville give samme resultat.
INDKOMST_Z_GRAENSE = 3.5

INDKOMST_TRUKKET_AF_FAA = "trukket_af_faa"


def _robust_z(vaerdier):
    """Median og MAD i stedet for middelværdi og spredning. Netop den kommune,
    der skal findes, ville ellers trække både middelværdi og spredning op og
    dermed skjule sig selv. Returnerer {navn: z} eller {} ved for få værdier."""
    if len(vaerdier) < 8:
        return {}
    v = sorted(vaerdier.values())
    median = v[len(v) // 2]
    afvigelser = sorted(abs(x - median) for x in v)
    mad = afvigelser[len(afvigelser) // 2]
    if not mad:
        return {}
    return {navn: 0.6745 * (x - median) / mad for navn, x in vaerdier.items()}


def klassificer_indkomst(disp_nu, disp_foer, loen_nu, loen_foer):
    """Markerer kommuner, hvor den disponible indkomst har flyttet sig langt ud
    af trit med kommunens egen lønudvikling.

    Returnerer {navn: INDKOMST_TRUKKET_AF_FAA | None}.

    Gennemsnitsindkomsten er følsom over for få personer med meget stor
    kapitalindkomst. I en lille kommune kan én husstand flytte gennemsnittet
    flere procent, og så beskriver tallet ikke længere, hvordan borgerne lever.
    Lønnen er ikke følsom på samme måde, så gabet mellem de to væksttakster
    afslører det: vokser den disponible indkomst meget hurtigere end lønnen,
    kommer forskellen fra noget andet end arbejde.

    ENSIDIG, som affaldets sammensætningssignal. Et gab den anden vej - løn
    vokser hurtigere end disponibel indkomst - er almindeligt og betyder blot,
    at kapitalindkomsten har ligget stille. Det er ikke et forbehold værd."""
    gab = {}
    for navn in disp_nu:
        vaerdier = (disp_nu.get(navn), disp_foer.get(navn),
                    loen_nu.get(navn), loen_foer.get(navn))
        if not all(vaerdier) or not disp_foer.get(navn) or not loen_foer.get(navn):
            continue
        gab[navn] = ((disp_nu[navn] / disp_foer[navn])
                     - (loen_nu[navn] / loen_foer[navn])) * 100
    z = _robust_z(gab)
    return {navn: (INDKOMST_TRUKKET_AF_FAA if z.get(navn, 0) > INDKOMST_Z_GRAENSE else None)
            for navn in gab}


def fetch_indkomst_og_loen(aar):
    """Returnerer (disponibel indkomst, løn), begge {navn: kr. pr. person}."""
    def hent(indkomsttype):
        rows = dst_client.fetch(BASE, "INDKP101", {
            "OMRÅDE": "*", "ENHED": "116", "KOEN": "MOK",
            "INDKOMSTTYPE": indkomsttype, "Tid": aar,
        })
        return dst_client.sum_by(rows, ["OMRÅDE"])
    return hent("100"), hent("115")


def klassificer_affald(forhold, sammensaetning):
    """Afgør pr. kommune, hvor meget affaldstallene kan bære. Returnerer
    {navn: AFFALD_BEKRAEFTET_FEJL | AFFALD_USIKKER_FRAKTION |
    AFFALD_USIKKER_SPRING | None}.

    To signaler, og kun det ene kan spærre:

      SAMMENSÆTNING (fetch_affald_sammensaetning) - dagrenovationens andel af
        kommunens samlede affald. Den andel er strukturelt stor overalt (landet
        27-32 %), så et kollaps mod nul er et hul i indberetningen og ikke
        adfærd. Signalet virker på ÉT år og er derfor det, der styrer
        spærringen: det arver ikke sidste års problem, og det rydder sig selv,
        når kilden retter sig.

      FORHOLD (fetch_affald_validitet) - restaffaldet i år delt med sidste år.
        Fanger pludselige spring, som en kronisk skæv sammensætning ikke
        afslører. Kan kun markere, ikke spærre.

    Og to niveauer, hvor forskellen er bevisbyrden:

      BEKRAEFTET_FEJL - mindst ét medlem af et selskab i DELTE_INDBERETNINGER
        har fået sin fraktion til at kollapse. Så er selskabets fordeling mellem
        medlemmerne brudt, og HELE ejerkredsen spærres - også de medlemmer der
        ser normale ud, for modtageren af den byttede tonnage afslører sig ikke
        selv (Fredensborg lå på pæne 35,2 % i 2023, mens den absorberede de
        andres affald).

      USIKKER_FRAKTION / USIKKER_SPRING - et af signalerne slår ud uden et kendt
        selskab at forklare det med. Retningen spærres IKKE: vi ved ikke, hvad der
        er sket, og et udsving er ikke et bevis for en fejl. Årsagen holdes adskilt,
        fordi de to skal forklares forskelligt - en kommune, hvis fraktion mangler,
        har ikke svinget, den mangler et tal.

    Begge hegn beregnes uden de kommuner, der allerede er spærret: deres
    ekstremer ville ellers strække hegnet, så en reel afviger gik fri. LABY24's
    KOMGRP rummer også kommunegruppe-aggregater ("Landkommuner", "Hele landet");
    de frasorteres her frem for hos kalderen, fordi et aggregat er et gennemsnit
    af mange kommuner og derfor svinger mindre end en enkelt."""
    kommuner = {navn for _, navn, _ in KOMMUNER}
    forhold = {n: v for n, v in forhold.items() if n in kommuner}
    sammensaetning = {n: v for n, v in sammensaetning.items() if n in kommuner}

    # Hvilke selskaber har et medlem, hvis fraktion er kollapset I ÅR?
    alle_medlemmer = set().union(*DELTE_INDBERETNINGER.values())
    graense = _nedre_tukey_graense(
        [v for n, v in sammensaetning.items() if n not in alle_medlemmer])
    kollapset = {n for n, v in sammensaetning.items()
                 if graense is not None and v < graense}

    spaerret = set()
    for medlemmer in DELTE_INDBERETNINGER.values():
        if medlemmer & kollapset:
            spaerret |= medlemmer

    hegn = _tukey_hegn([v for n, v in forhold.items() if n not in spaerret])

    resultat = {}
    for navn in set(forhold) | set(sammensaetning):
        if navn in spaerret:
            resultat[navn] = AFFALD_BEKRAEFTET_FEJL
            continue
        v = forhold.get(navn)
        springer = hegn is not None and v is not None and (v < hegn[0] or v > hegn[1])
        # Fraktionen vejer tungest: mangler den, er et forholdstal mellem to år
        # regnet på et hul og siger mindre end hullet selv.
        if navn in kollapset:
            resultat[navn] = AFFALD_USIKKER_FRAKTION
        elif springer:
            resultat[navn] = AFFALD_USIKKER_SPRING
        else:
            resultat[navn] = None
    return resultat


def spaerrede_selskaber(sammensaetning):
    """Hvilke selskaber der spærres i år, og hvilke der går fri. Til
    valideringsrapporten, så overgangen fra spærret til fri ikke sker tavst."""
    kommuner = {navn for _, navn, _ in KOMMUNER}
    sammensaetning = {n: v for n, v in sammensaetning.items() if n in kommuner}
    alle_medlemmer = set().union(*DELTE_INDBERETNINGER.values())
    graense = _nedre_tukey_graense(
        [v for n, v in sammensaetning.items() if n not in alle_medlemmer])
    ud = {}
    for selskab, medlemmer in DELTE_INDBERETNINGER.items():
        ramte = sorted(n for n in medlemmer
                       if graense is not None and sammensaetning.get(n, 100) < graense)
        ud[selskab] = ramte
    return ud


def fetch_all_dst():
    """Kører alle 9 DST-hentninger og samler dem i et {navn: {felt: værdi}}-dict,
    med feltnavne der matcher motorens datakontrakt 1:1. Kommuner uden data for et
    givent felt får det simpelthen ikke sat her - build.py fylder None ind for
    manglende felter."""
    folketal, folketal_forrige = fetch_folketal()
    indkomst = fetch_indkomst()
    gini = fetch_gini()
    parcel, raekke, etage = fetch_boliger_type()
    boligareal = fetch_boligareal()
    opv_ialt, opv_olie, opv_naturgas = fetch_opvarmning()
    byggeri = fetch_byggeri()
    biler, biler_el, biler_plugin, biler_diesel, biler_benzin = fetch_biler()
    affald_kg, genanvendelse_pct = fetch_affald()

    # Kommune-universet defineres ud fra to kernetabeller, IKKE en union af alle 9 -
    # LABY25's KOMGRP indeholder også kommunegruppe-aggregater (fx "Hovedstadskommuner"),
    # som ellers ville lække ind som falske "kommuner" i outputtet.
    alle_navne = set(folketal) | set(indkomst)
    resultat = {}
    for navn in alle_navne:
        resultat[navn] = {
            "folketal": folketal.get(navn), "folketal_forrige": folketal_forrige.get(navn),
            "disp_indkomst": indkomst.get(navn),
            "gini": gini.get(navn),
            "boliger_parcel": parcel.get(navn), "boliger_raekke": raekke.get(navn),
            "boliger_etage": etage.get(navn), "boligareal": boligareal.get(navn),
            "byggeri": byggeri.get(navn),
            "biler": biler.get(navn), "biler_el": biler_el.get(navn),
            "biler_plugin": biler_plugin.get(navn), "biler_diesel": biler_diesel.get(navn),
            "biler_benzin": biler_benzin.get(navn),
            "opv_boliger_ialt": opv_ialt.get(navn), "opv_olie": opv_olie.get(navn),
            "opv_naturgas": opv_naturgas.get(navn),
            "affald_kg": affald_kg.get(navn), "genanvendelse_pct": genanvendelse_pct.get(navn),
        }
    return resultat
