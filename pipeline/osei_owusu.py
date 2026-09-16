"""Kommunernes andel af Danmarks fødevareforbrug. Ren afskrift med sidehenvisning.

Kilde:
  Osei-Owusu, K.A., Thomsen, M., Lindahl, J., Javakhishvili Larsen, N. og
  Caro, D. (2020): "Tracking the carbon emissions of Denmark's five regions
  from a producer and consumer perspective", Ecological Economics 177, 106778.
  https://doi.org/10.1016/j.ecolecon.2020.106778

Tallene nedenfor er afskrevet fra artiklens supplerende regneark, arket
"CESM" ("Share of consumption groups"), rækken "01.1 Food". Hver værdi er
kommunens andel af Danmarks samlede forbrugsudgift til fødevarer i 2011.
De 98 andele summerer til 1.

HVAD TALLET ER, OG HVAD DET IKKE ER

Artiklen opgør kommunens fødevareudledning som kommunens andel af Danmarks
samlede fødevareaftryk. Andelen nedenfor er dermed selve fordelingsnøglen bag
det offentliggjorte resultat, ikke en proxy, vi har fundet på.

Men den måler forbrugets STØRRELSE, ikke dets SAMMENSÆTNING. Artiklen antager
landsgennemsnitlig kost overalt. Side 4: "we assume that Denmark's national
carbon intensities for all products in EXIOBASE is the same for each Danish
municipality." Side 8: "The share of CF for specific products in total CF of
food is the same across regions because we assumed the same production
technologies for all Danish regions. However, the absolute CF values vary
between regions." Tallet kan altså ikke se, at én kommune spiser mere oksekød
end en anden. Det ser kun, at den bruger flere penge på mad.

VÆRKTØJET VISER KUN AFVIGELSEN, IKKE TONNAGEN

Artiklen offentliggør også et absolut tal i ton CO2e pr. indbygger for 20
kommuner (top-10 og bund-10). Det tal bruges bevidst ikke. Værktøjet beregner
intet kommunalt klimaaftryk - se constants.py - og et enkelt ton-tal fra 2011
ville læses som en måling af kommunens fødevareudledning i dag. Motoren
regner kommunens andel om til forbrug pr. indbygger og viser udelukkende,
hvordan den ligger i forhold til landsgennemsnittet.

REGIONSFAKTOREN ER UDELADT

De offentliggjorte kommunetal rummer en regionsspecifik korrektion på
0,997-1,004, fordi udledningsintensiteten varierer en smule mellem de fem
regioner. Den er ikke offentliggjort som tal og skulle regnes baglæns ud af
top- og bundlisterne. Den er udeladt: den er vores egen udledte koefficient,
og den flytter ingen kommunes afvigelse mere end 0,7 procentpoint og ændrer
ingen kommunes signal.

FORBEHOLD, DER SKAL STÅ PÅ METODESIDEN

Opgørelsesåret er 2011. Alle øvrige nøgletal i værktøjet er aktuelle
registerdata. Og fordelingen følger forbrugsudgiften tæt: over de 98 kommuner
korrelerer den med disponibel indkomst på r = +0,93, så nøgletallet siger i
praksis det samme som indkomsten, blot i fødevarernes kategori.
"""

# Året artiklen opgør. Må ikke flyttes til PERIODER i constants.py: det er
# ikke en periode, der opdateres årligt, men kildens eget opgørelsesår.
OPGOERELSESAAR = 2011

# Folketallet skal hentes for samme år som forbrugsandelene, ellers
# sammenlignes 2011-forbrug med nutidens indbyggertal.
FOLK_KVARTAL = "2011K1"

KILDE = {
    "id": "OSEI_OWUSU_2020",
    "titel": "Tracking the carbon emissions of Denmark's five regions from a "
             "producer and consumer perspective",
    "udgiver": "Ecological Economics 177, 106778",
    "aar": 2020,
    "url": "https://doi.org/10.1016/j.ecolecon.2020.106778",
}

# Kommunens andel af Danmarks samlede forbrugsudgift til fødevarer, 2011.
# Supplerende regneark, arket "CESM", rækken "01.1 Food".
FOEDEVARE_FORBRUGSANDEL = {
    "Aabenraa": 0.009814758791072561,
    "Aalborg": 0.03378389632438219,
    "Aarhus": 0.057560917342488936,
    "Albertslund": 0.004384337788504561,
    "Allerød": 0.005312070846686775,
    "Assens": 0.006832130734153929,
    "Ballerup": 0.00851882098420647,
    "Billund": 0.004526643913767806,
    "Bornholm": 0.006646770662091428,
    "Brøndby": 0.005617592273205164,
    "Brønderslev": 0.005645989550563252,
    "Dragør": 0.003117054426709135,
    "Egedal": 0.008189328519325937,
    "Esbjerg": 0.01999373125655386,
    "Faaborg-Midtfyn": 0.008550474394577253,
    "Fanø": 0.0006472965587846483,
    "Favrskov": 0.008495541116993077,
    "Faxe": 0.006295304719675055,
    "Fredensborg": 0.008070224750417535,
    "Fredericia": 0.008619047492046956,
    "Frederiksberg": 0.02012703086082356,
    "Frederikshavn": 0.010302257388808222,
    "Frederikssund": 0.008034127301080137,
    "Furesø": 0.008317809959684756,
    "Gentofte": 0.020927559681654766,
    "Gladsaxe": 0.012061910603914837,
    "Glostrup": 0.003916206718516708,
    "Greve": 0.00986043519887963,
    "Gribskov": 0.007591366470720803,
    "Guldborgsund": 0.01044182063239341,
    "Haderslev": 0.00921786413908621,
    "Halsnæs": 0.005276446275555143,
    "Hedensted": 0.008036625390096022,
    "Helsingør": 0.011546464722585232,
    "Herlev": 0.004758431953012029,
    "Herning": 0.015598373130516785,
    "Hillerød": 0.009217461825784848,
    "Hjørring": 0.010821288019923332,
    "Holbæk": 0.01264706085250286,
    "Holstebro": 0.01017612840504497,
    "Horsens": 0.014606076421325,
    "Hvidovre": 0.008730279594109908,
    "Høje-Taastrup": 0.008253066671457894,
    "Hørsholm": 0.0066889766614019385,
    "Ikast-Brande": 0.006974593386066607,
    "Ishøj": 0.003308220299727701,
    "Jammerbugt": 0.006298260743604914,
    "Kalundborg": 0.008720940947293027,
    "Kerteminde": 0.004074884022916779,
    "Kolding": 0.015704557949587968,
    "København": 0.09232047095467026,
    "Køge": 0.010699546173525767,
    "Langeland": 0.0020750854693609836,
    "Lejre": 0.005345986564607818,
    "Lemvig": 0.003762621508077886,
    "Lolland": 0.0074758209662054475,
    "Lyngby-Taarbæk": 0.012174418909446474,
    "Læsø": 0.0003201651347779259,
    "Mariagerfjord": 0.006935516546181803,
    "Middelfart": 0.0065978086009831965,
    "Morsø": 0.003348409427622781,
    "Norddjurs": 0.006457370843536101,
    "Nordfyns": 0.004833829625373941,
    "Nyborg": 0.005299759841623576,
    "Næstved": 0.014711606710780329,
    "Odder": 0.004051097149474227,
    "Odense": 0.03239220868953232,
    "Odsherred": 0.005740348086661945,
    "Randers": 0.016454532132939875,
    "Rebild": 0.004909253011820378,
    "Ringkøbing-Skjern": 0.010058374071732785,
    "Ringsted": 0.006050065180862566,
    "Roskilde": 0.016935707275413738,
    "Rudersdal": 0.014811969437356028,
    "Rødovre": 0.006418810977994097,
    "Samsø": 0.0006656707961245343,
    "Silkeborg": 0.015871143224743117,
    "Skanderborg": 0.01112612878592403,
    "Skive": 0.008105476358496566,
    "Slagelse": 0.013724931492088734,
    "Solrød": 0.004527742183273646,
    "Sorø": 0.005345870709188957,
    "Stevns": 0.004096491607604025,
    "Struer": 0.0038262873645082372,
    "Svendborg": 0.009917005197987975,
    "Syddjurs": 0.007532141440009821,
    "Sønderborg": 0.012590074669271116,
    "Thisted": 0.007204639705846359,
    "Tårnby": 0.007571791688189433,
    "Tønder": 0.006166174806730671,
    "Vallensbæk": 0.002796336119769834,
    "Varde": 0.008372344288004607,
    "Vejen": 0.00681883144989231,
    "Vejle": 0.019176156028750006,
    "Vesthimmerlands": 0.0058844974462738545,
    "Viborg": 0.01654576570840321,
    "Vordingborg": 0.007984397577923267,
    "Ærø": 0.0011108593861506265,}


def byg_osei_owusu():
    """Kildeposten til metodesiden. Ingen tal - de står i data.json."""
    return {
        "kilde": KILDE,
        "opgoerelsesaar": OPGOERELSESAAR,
        "folk_kvartal": FOLK_KVARTAL,
        "antal_kommuner": len(FOEDEVARE_FORBRUGSANDEL),
    }
