"""Kildekataloget skal dække præcis de felter, data.json faktisk indeholder.
Fanger at en ny DST-tabel tilføjes uden kildehenvisning."""
import sources
from constants import PERIODER
from build import FORVENTEDE_FELTER


def test_alle_felter_har_en_kilde():
    daekkede = set()
    for kilde in sources.KILDER:
        daekkede.update(kilde["felter"])
    mangler = set(FORVENTEDE_FELTER) - daekkede
    assert not mangler, f"felter uden kilde: {sorted(mangler)}"


def test_ingen_kilde_daekker_ukendte_felter():
    kendte = set(FORVENTEDE_FELTER)
    for kilde in sources.KILDER:
        ukendte = set(kilde["felter"]) - kendte
        assert not ukendte, f"{kilde['id']} nævner ukendte felter: {sorted(ukendte)}"


def test_intet_felt_daekkes_af_to_kilder():
    pr_felt = {}
    for kilde in sources.KILDER:
        for felt in kilde["felter"]:
            pr_felt.setdefault(felt, []).append(kilde["id"])
    dubletter = {f: ids for f, ids in pr_felt.items() if len(ids) > 1}
    assert not dubletter, f"felter med flere kilder: {dubletter}"


def test_api_kilder_peger_paa_en_kendt_periode():
    for kilde in sources.KILDER:
        if kilde["metode"] != "api":
            continue
        assert kilde["periode_noegle"] in PERIODER, \
            f"{kilde['id']} peger på ukendt periode-nøgle {kilde['periode_noegle']}"


def test_manuelle_kilder_har_ingen_periode_noegle():
    for kilde in sources.KILDER:
        if kilde["metode"] == "manuel":
            assert kilde["periode_noegle"] is None


def test_byg_sources_udfylder_perioder():
    ud = sources.byg_sources()
    api = [k for k in ud["kilder"] if k["metode"] == "api"]
    assert api, "der skal være mindst én api-kilde"
    for kilde in api:
        assert kilde["periode"], f"{kilde['id']} mangler udfyldt periode"
        assert "periode_noegle" not in kilde, "periode_noegle er intern og må ikke ud i json"


def test_referencer_er_med_og_har_sidehenvisninger():
    # Testede tidligere for en liste af ANTAGELSER. Der er ingen antagelser
    # tilbage - koefficienterne er fjernet, fordi de ikke kunne kildebelægges.
    # Tilbage står de to rapporter, de nationale tal er afskrevet fra.
    ud = sources.byg_sources()
    ids = {r["id"] for r in ud["referencer"]}
    assert ids == {"CONCITO_2023", "NIRAS_2024"}
    for r in ud["referencer"]:
        assert r["url"].startswith("https://"), f"{r['id']} mangler link"
        assert "s. " in r["sider"], f"{r['id']} mangler sidehenvisninger"
        assert r["anvendes_til"], f"{r['id']} mangler formål"


def test_ingen_antagelser_tilbage():
    assert "antagelser" not in sources.byg_sources()
    assert not hasattr(sources, "ANTAGELSER")
