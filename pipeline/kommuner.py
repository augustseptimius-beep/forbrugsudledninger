"""Statisk kommune->region-tabel. Verificeret mod DST FOLK1A's OMRÅDE-hierarki (juli 2026).
Danmarks 98 kommuner ændrer sig praktisk taget aldrig; denne tabel opdateres ikke årligt."""

REGIONER = ["Hovedstaden", "Sjælland", "Syddanmark", "Midtjylland", "Nordjylland"]

# (kode, navn, region) - kode er DST's officielle 3-cifrede kommunekode.
KOMMUNER = [
    (101, "København", "Hovedstaden"), (147, "Frederiksberg", "Hovedstaden"),
    (155, "Dragør", "Hovedstaden"), (185, "Tårnby", "Hovedstaden"),
    (165, "Albertslund", "Hovedstaden"), (151, "Ballerup", "Hovedstaden"),
    (153, "Brøndby", "Hovedstaden"), (157, "Gentofte", "Hovedstaden"),
    (159, "Gladsaxe", "Hovedstaden"), (161, "Glostrup", "Hovedstaden"),
    (163, "Herlev", "Hovedstaden"), (167, "Hvidovre", "Hovedstaden"),
    (169, "Høje-Taastrup", "Hovedstaden"), (183, "Ishøj", "Hovedstaden"),
    (173, "Lyngby-Taarbæk", "Hovedstaden"), (175, "Rødovre", "Hovedstaden"),
    (187, "Vallensbæk", "Hovedstaden"), (201, "Allerød", "Hovedstaden"),
    (240, "Egedal", "Hovedstaden"), (210, "Fredensborg", "Hovedstaden"),
    (250, "Frederikssund", "Hovedstaden"), (190, "Furesø", "Hovedstaden"),
    (270, "Gribskov", "Hovedstaden"), (260, "Halsnæs", "Hovedstaden"),
    (217, "Helsingør", "Hovedstaden"), (219, "Hillerød", "Hovedstaden"),
    (223, "Hørsholm", "Hovedstaden"), (230, "Rudersdal", "Hovedstaden"),
    (400, "Bornholm", "Hovedstaden"),
    (253, "Greve", "Sjælland"), (259, "Køge", "Sjælland"),
    (350, "Lejre", "Sjælland"), (265, "Roskilde", "Sjælland"),
    (269, "Solrød", "Sjælland"), (320, "Faxe", "Sjælland"),
    (376, "Guldborgsund", "Sjælland"), (316, "Holbæk", "Sjælland"),
    (326, "Kalundborg", "Sjælland"), (360, "Lolland", "Sjælland"),
    (370, "Næstved", "Sjælland"), (306, "Odsherred", "Sjælland"),
    (329, "Ringsted", "Sjælland"), (330, "Slagelse", "Sjælland"),
    (340, "Sorø", "Sjælland"), (336, "Stevns", "Sjælland"),
    (390, "Vordingborg", "Sjælland"),
    (420, "Assens", "Syddanmark"), (430, "Faaborg-Midtfyn", "Syddanmark"),
    (440, "Kerteminde", "Syddanmark"), (482, "Langeland", "Syddanmark"),
    (410, "Middelfart", "Syddanmark"), (480, "Nordfyns", "Syddanmark"),
    (450, "Nyborg", "Syddanmark"), (461, "Odense", "Syddanmark"),
    (479, "Svendborg", "Syddanmark"), (492, "Ærø", "Syddanmark"),
    (530, "Billund", "Syddanmark"), (561, "Esbjerg", "Syddanmark"),
    (563, "Fanø", "Syddanmark"), (607, "Fredericia", "Syddanmark"),
    (510, "Haderslev", "Syddanmark"), (621, "Kolding", "Syddanmark"),
    (540, "Sønderborg", "Syddanmark"), (550, "Tønder", "Syddanmark"),
    (573, "Varde", "Syddanmark"), (575, "Vejen", "Syddanmark"),
    (630, "Vejle", "Syddanmark"), (580, "Aabenraa", "Syddanmark"),
    (710, "Favrskov", "Midtjylland"), (766, "Hedensted", "Midtjylland"),
    (615, "Horsens", "Midtjylland"), (707, "Norddjurs", "Midtjylland"),
    (727, "Odder", "Midtjylland"), (730, "Randers", "Midtjylland"),
    (741, "Samsø", "Midtjylland"), (740, "Silkeborg", "Midtjylland"),
    (746, "Skanderborg", "Midtjylland"), (706, "Syddjurs", "Midtjylland"),
    (751, "Aarhus", "Midtjylland"), (657, "Herning", "Midtjylland"),
    (661, "Holstebro", "Midtjylland"), (756, "Ikast-Brande", "Midtjylland"),
    (665, "Lemvig", "Midtjylland"), (760, "Ringkøbing-Skjern", "Midtjylland"),
    (779, "Skive", "Midtjylland"), (671, "Struer", "Midtjylland"),
    (791, "Viborg", "Midtjylland"),
    (810, "Brønderslev", "Nordjylland"), (813, "Frederikshavn", "Nordjylland"),
    (860, "Hjørring", "Nordjylland"), (849, "Jammerbugt", "Nordjylland"),
    (825, "Læsø", "Nordjylland"), (846, "Mariagerfjord", "Nordjylland"),
    (773, "Morsø", "Nordjylland"), (840, "Rebild", "Nordjylland"),
    (787, "Thisted", "Nordjylland"), (820, "Vesthimmerlands", "Nordjylland"),
    (851, "Aalborg", "Nordjylland"),
]


def by_navn():
    """Returnerer {navn: (kode, region)} til opslag fra DST's CSV-svar (som bruger navn, ikke kode)."""
    return {navn: (kode, region) for kode, navn, region in KOMMUNER}
