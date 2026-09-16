"""Fødevareforbrug pr. indbygger, beregnet efter Osei-Owusu et al. (2020).

Kilde:
  Osei-Owusu, K.A., Thomsen, M., Lindahl, J., Javakhishvili Larsen, N. og
  Caro, D. (2020): "Tracking the carbon emissions of Denmark's five regions
  from a producer and consumer perspective", Ecological Economics 177, 106778.
  https://doi.org/10.1016/j.ecolecon.2020.106778

METODEN, IKKE TALLENE

Artiklen opgør 2011. Dette modul afskriver dens fordelingsnøgle og anvender
den på aktuelle registerdata, så nøgletallet følger samme opdateringsrytme
som resten af værktøjet. Nøglen står i artiklens supplerende information som
ligning S9-S11:

  S9   CES(i,r) = CE(i,r) / HHINC(r)
       regionens forbrugskvotient: hvor stor en del af den disponible indkomst
       en husstand i regionen bruger på forbrugsgruppe i.
  S10  CE(i,m) = CES(i,r) * HHINC(m)
       kommunens forbrug: regionens kvotient gange kommunens samlede
       disponible indkomst. Artiklen antager samme kvotient for alle kommuner
       i en region.
  S11  CES(i,m) = CE(i,m) / sum over alle 98 kommuner

Formlen er verificeret mod artiklens eget regneark (arket CESM, rækken
"01.1 Food"): den reproducerer alle 98 offentliggjorte andele med samme
skalafaktor på 0,669 % for hver kommune. Da værktøjet kun bruger afvigelsen
fra landsgennemsnittet, forsvinder skalafaktoren.

HVAD TALLET ER, OG HVAD DET IKKE ER

Det er forbrugsudgiften til fødevarer pr. indbygger, i kroner. Det er IKKE
et udledningstal. Artiklen omregner udgiften til ton CO2e, men den omregning
bruges ikke: værktøjet beregner intet kommunalt klimaaftryk, se constants.py.

Det måler forbrugets STØRRELSE, ikke kostens SAMMENSÆTNING. Artiklen antager
landsgennemsnitlig kost overalt. Side 4: "we assume that Denmark's national
carbon intensities for all products in EXIOBASE is the same for each Danish
municipality." Side 8: "The share of CF for specific products in total CF of
food is the same across regions." Tallet kan altså ikke se, at én kommune
spiser mere oksekød end en anden.

DET GENTAGER INDKOMSTEN, OG DET SKAL STÅ

Af formlen følger, at den kommunale variation kommer fra den disponible
indkomst alene; regionskvotienten modulerer med 2 til 8 %. Over de 98
kommuner er korrelationen med disponibel indkomst r = +0,94. Nøgletallet
siger derfor i praksis det samme som indkomsten, blot i fødevarernes
kategori. Det står med som eneste kommunale nøgletal for en kategori, der
ellers er tom, ikke fordi det bærer ny information.

REGIONSKVOTIENTEN UDJÆVNES OVER TI ÅR

Forbrugsundersøgelsen (FU17) er en stikprøve, og et enkelt års kvotient er
ustabil: skiftes kun kvotientåret ud, skifter 14-16 af 98 kommuner signal.
Med et ti-års gennemsnit falder det til højst 5, når et vilkårligt år
udelades. Kvotienten regnes som regionens andel af landets samme år, så den
fælles faldende trend ikke indgår - kun den indbyrdes placering.

Målt over 2015-2024 adskiller kun to regioner sig påviseligt fra landet:
Sjælland ligger 6,9 % over og Midtjylland 4,9 % under, begge med en
standardfejl omkring 0,5 procentpoint og stabile mellem periodens to
halvdele. Hovedstaden, Syddanmark og Nordjylland kan ikke skelnes fra
landsgennemsnittet og heller ikke indbyrdes. Det skal stå på metodesiden.
"""

# Antal år i vinduet bag regionskvotienten. Ti år er valgt, fordi det er det
# korteste vindue, hvor udeladelsen af et enkelt år ikke flytter mere end en
# håndfuld kommuners signal. Det er en præsentationsbeslutning, ikke en kilde.
KVOTIENT_VINDUE_AAR = 10

KILDE = {
    "id": "OSEI_OWUSU_2020",
    "titel": "Tracking the carbon emissions of Denmark's five regions from a "
             "producer and consumer perspective",
    "udgiver": "Ecological Economics 177, 106778",
    "aar": 2020,
    "url": "https://doi.org/10.1016/j.ecolecon.2020.106778",
}


def kvotient_vindue(seneste_aar, antal=KVOTIENT_VINDUE_AAR):
    """De år, regionskvotienten udjævnes over. Nyeste år sidst."""
    seneste = int(seneste_aar)
    return [str(a) for a in range(seneste - antal + 1, seneste + 1)]


def landets_kvotient(forbrug, indkomst, landsnavn="Hele landet",
                     gennemsnitsnavn="Gennemsnitshusstand"):
    """Landets forbrugskvotient for ét år: den andel af den disponible indkomst
    en gennemsnitshusstand bruger på fødevarer.

    Den sætter NIVEAUET for nøgletallet, så den viste værdi er kroner brugt på
    mad og ikke bare indkomst. Den tages fra det nyeste år alene, ikke fra
    vinduet: niveauet skal være nutidens. Kun den indbyrdes placering mellem
    regionerne udjævnes - se udjaevn_kvotient()."""
    return forbrug[gennemsnitsnavn] / indkomst[landsnavn]


def skaler_kvotient(relativ, landets):
    """Regionens udjævnede placering ganget op med landets kvotient.

    Skalafaktoren er fælles for alle kommuner og ændrer derfor ingen afvigelse
    fra landsgennemsnittet. Den er der udelukkende for at den viste værdi kan
    læses som kroner brugt på fødevarer."""
    return {navn: landets * v for navn, v in relativ.items()}


def relativ_kvotient(forbrug, indkomst, aar, landsnavn="Hele landet",
                     gennemsnitsnavn="Gennemsnitshusstand"):
    """Regionens forbrugskvotient som andel af landets, for ét år (ligning S9).

    forbrug:  {områdenavn: kr. pr. husstand} fra FU17
    indkomst: {områdenavn: kr. pr. familie} fra INDKF111

    Regnes relativt til landet, fordi kvotienten falder for alle regioner over
    tid. Kun den indbyrdes placering går ind i nøgletallet, og den skal ikke
    forurenes af en fælles trend. Returnerer {regionsnavn: andel}, hvor 1,0
    betyder "som landet"."""
    land = landets_kvotient(forbrug, indkomst, landsnavn, gennemsnitsnavn)
    if not land:
        raise ValueError(f"landets forbrugskvotient er nul for {aar}")
    return {navn: (forbrug[navn] / indkomst[navn]) / land
            for navn in forbrug
            if navn != gennemsnitsnavn and navn in indkomst}


def udjaevn_kvotient(pr_aar):
    """Gennemsnittet af de relative kvotienter over vinduet.

    pr_aar: {år: {regionsnavn: andel}}. Regioner, der mangler i et enkelt år,
    får gennemsnittet af de år, de faktisk optræder i - et hul må ikke tælle
    som nul."""
    samlet = {}
    for kvotienter in pr_aar.values():
        for navn, v in kvotienter.items():
            samlet.setdefault(navn, []).append(v)
    return {navn: sum(v) / len(v) for navn, v in samlet.items() if v}


def forbrug_pr_indbygger(kvotient, indkomst_i_alt, folketal, region_pr_kommune):
    """Fødevareforbrug pr. indbygger i kroner, pr. kommune (ligning S10).

    kvotient:          {regionsnavn: forbrugskvotient, jf. skaler_kvotient()}
    indkomst_i_alt:    {kommunenavn: samlet disponibel indkomst, 1.000 kr.}
    folketal:          {kommunenavn: indbyggere}
    region_pr_kommune: {kommunenavn: regionsnavn}

    S11's normering er udeladt: den er en fælles skalafaktor, og værktøjet
    bruger kun afvigelsen fra landet, hvor den går ud. En kommune uden et af
    inputtene får None og vises med streg - aldrig nul, som ville læses som
    "intet fødevareforbrug"."""
    ud = {}
    for navn, region in region_pr_kommune.items():
        k = kvotient.get(region)
        i = indkomst_i_alt.get(navn)
        f = folketal.get(navn)
        ud[navn] = (k * i * 1000) / f if k and i and f else None
    return ud


def landets_forbrug_pr_indbygger(pr_kommune, folketal):
    """Landets tal er summen af kommunernes forbrug delt med summen af deres
    indbyggere, ikke et selvstændigt opslag. Så dækker tæller og nævner
    præcis samme område, og kommuner uden tal trækker ikke nævneren skæv."""
    navne = [n for n, v in pr_kommune.items() if v is not None and folketal.get(n)]
    if not navne:
        return None
    indbyggere = sum(folketal[n] for n in navne)
    return sum(pr_kommune[n] * folketal[n] for n in navne) / indbyggere


def byg_osei_owusu(seneste_aar):
    """Kildeposten til metodesiden. Ingen tal - de står i data.json."""
    vindue = kvotient_vindue(seneste_aar)
    return {
        "kilde": KILDE,
        "kvotient_vindue": [vindue[0], vindue[-1]],
        "kvotient_vindue_aar": KVOTIENT_VINDUE_AAR,
    }
