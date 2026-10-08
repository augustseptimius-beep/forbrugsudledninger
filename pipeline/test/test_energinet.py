"""Energinets miljødeklaration pr. kommune: udtræk, validering og brug i pipelinen."""
import io
import json
import os
import zipfile

import pytest

import energinet
from constants import PERIODER
from kommuner import KOMMUNER

KODER = [kode for kode, _, _ in KOMMUNER]


def _xlsx(raekker, arknavn=energinet.ARK):
    """Et minimalt regneark med ét ark, bygget i hånden: overskrifter som delte tekster,
    tal som tal. Samme opbygning som Energinets fil, uden resten."""
    tekster = []

    def t(s):
        if s not in tekster:
            tekster.append(s)
        return tekster.index(s)

    def celle(kol, nr, v):
        ref = f"{chr(64 + kol)}{nr}"
        if isinstance(v, str):
            return f'<c r="{ref}" t="s"><v>{t(v)}</v></c>'
        return f'<c r="{ref}"><v>{v}</v></c>'

    rows = "".join(
        f'<row r="{i}">' + "".join(celle(k, i, v) for k, v in enumerate(r, 1) if v is not None)
        + "</row>" for i, r in enumerate(raekker, 1))
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("xl/workbook.xml",
                   f'<workbook xmlns="{ns}" xmlns:r="{rel}"><sheets>'
                   f'<sheet name="Forside" sheetId="1" r:id="rId1"/>'
                   f'<sheet name="{arknavn}" sheetId="2" r:id="rId2"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
                   '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>')
        z.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{ns}"><sheetData/></worksheet>')
        z.writestr("xl/worksheets/sheet2.xml",
                   f'<worksheet xmlns="{ns}"><sheetData>{rows}</sheetData></worksheet>')
        z.writestr("xl/sharedStrings.xml",
                   f'<sst xmlns="{ns}">' + "".join(f"<si><t>{s}</t></si>" for s in tekster) + "</sst>")
    return buf.getvalue()


def _ark(aar=(2024,), faktor=lambda kode, aar: 40.0 + kode / 100):
    raekker = [["År", "Nr", "Navn", energinet.KOLONNE, "CO2e200% g/kWh"]]
    for a in aar:
        for kode, navn, _ in KOMMUNER:
            raekker.append([a, kode, navn, faktor(kode, a), 99.0])
    return raekker


# ---------- Regnearket læses uden afhængigheder ----------

def test_arket_laeses_med_overskrifter_som_noegler():
    rows = energinet.laes_ark(_xlsx(_ark()))
    assert len(rows) == 98
    assert rows[0]["Navn"] == KOMMUNER[0][1]
    assert rows[0][energinet.KOLONNE] == pytest.approx(40.0 + KOMMUNER[0][0] / 100)


def test_arket_findes_paa_navn_og_ikke_paa_placering():
    with pytest.raises(ValueError, match="intet ark"):
        energinet.laes_ark(_xlsx(_ark(), arknavn="Noget andet"))


def test_den_kolonne_der_bruges_er_125_pct_metoden_og_ikke_200():
    udtraek = energinet.udtraek(energinet.laes_ark(_xlsx(_ark())))
    assert set(udtraek["2024"].values()) != {99.0}


# ---------- Udtræk og validering ----------

def test_udtraek_giver_hvert_aar_med_alle_98_kommuner_som_streng_noegler():
    ud = energinet.udtraek(energinet.laes_ark(_xlsx(_ark(aar=(2023, 2024)))))
    assert sorted(ud) == ["2023", "2024"]
    assert set(ud["2024"]) == {str(k) for k in KODER}


def test_et_aar_uden_alle_kommuner_stopper_koerslen():
    raekker = _ark()
    raekker.pop()  # den sidste kommune
    with pytest.raises(ValueError, match="mangler kommunerne"):
        energinet.udtraek(energinet.laes_ark(_xlsx(raekker)))


def test_en_ukendt_kommunekode_stopper_koerslen():
    raekker = _ark()
    raekker[1][1] = 999
    with pytest.raises(ValueError, match="findes ikke blandt de 98"):
        energinet.udtraek(energinet.laes_ark(_xlsx(raekker)))


@pytest.mark.parametrize("vaerdi", [-1.0, 5000.0])
def test_en_urimelig_vaerdi_stopper_koerslen(vaerdi):
    raekker = _ark()
    raekker[5][3] = vaerdi
    with pytest.raises(ValueError, match="uventet værdi"):
        energinet.udtraek(energinet.laes_ark(_xlsx(raekker)))


def test_en_omdoebt_kolonne_stopper_koerslen_i_stedet_for_at_give_huller():
    raekker = _ark()
    raekker[0][3] = "CO2e g/kWh"
    with pytest.raises(ValueError, match="findes ikke i arket"):
        energinet.udtraek(energinet.laes_ark(_xlsx(raekker)))


def test_en_manglende_vaerdi_er_ikke_nul():
    raekker = _ark()
    raekker[3][3] = None
    with pytest.raises(ValueError, match="uventet værdi"):
        energinet.udtraek(energinet.laes_ark(_xlsx(raekker)))


# ---------- Adressen på regnearket ----------

def test_regnearket_findes_paa_energinets_side():
    side = ('<a href=\\u0022/media/4ffc1azq/miljoedeklaration-aarsgennemsnit-260519pub.xlsx\\u0022>'
            '<a href="/media/uuofwtpw/oevrige-emissioner-2022-beregner230627.xlsx">')
    assert energinet.find_xlsx_url(side) == (
        "https://www.energinet.dk/media/4ffc1azq/miljoedeklaration-aarsgennemsnit-260519pub.xlsx")


def test_en_side_uden_regneark_giver_en_forstaaelig_fejl():
    with pytest.raises(ValueError, match="fandt ikke regnearket"):
        energinet.find_xlsx_url("<html></html>")


# ---------- Brug i pipelinen ----------

def _fil(aar=("2023", "2024")):
    return {"aar": {a: {str(k): 40.0 + k / 100 for k in KODER} for a in aar}}


def test_beriger_husholdning_lægger_faktoren_ind_for_det_rigtige_aar():
    en = _fil()
    en["aar"]["2023"]["787"] = 11.0
    en["aar"]["2024"]["787"] = 22.0
    ud = energinet.beriger_husholdning({787: {"el_tj": 5.0}}, en, "2024")
    assert ud[787] == {"el_tj": 5.0, "el_faktor": 22.0}


def test_en_kommune_uden_faktor_faar_none_og_ikke_nul():
    en = {"aar": {"2024": {str(k): 40.0 for k in KODER if k != 787}}}
    assert energinet.beriger_husholdning({787: {}}, en, "2024")[787]["el_faktor"] is None
    # Et helt år, filen ikke har, giver også None for alle.
    assert energinet.beriger_husholdning({787: {}}, en, "1999")[787]["el_faktor"] is None


def test_beriger_husholdning_roerer_ikke_ved_inddata():
    h = {787: {"el_tj": 5.0}}
    energinet.beriger_husholdning(h, _fil(), "2024")
    assert h == {787: {"el_tj": 5.0}}


# ---------- Den committede fil ----------

def test_den_committede_fil_har_alle_98_kommuner_for_hvert_aar():
    en = energinet.laes()
    assert en["aar"], "filen er tom"
    for aar, pr_kode in en["aar"].items():
        assert set(pr_kode) == {str(k) for k in KODER}, aar
        assert all(0 <= v <= energinet.MAKS_G_PR_KWH for v in pr_kode.values()), aar


def test_den_committede_fil_daekker_klimaregnskabets_aar_og_historikken():
    en = energinet.laes()
    seneste = int(PERIODER["KLIMAREGNSKAB_AAR"])
    assert str(seneste) in en["aar"], (
        f"energinet.json mangler {seneste}. Kør python3 pipeline/energinet.py.")
    import historik
    foerste = max(historik.KR_FRA_AAR, seneste - historik.HISTORIK_AAR)
    for aar in range(foerste, seneste + 1):
        assert str(aar) in en["aar"], f"historikken beder om {aar}"


def test_den_committede_fil_er_i_den_form_skriptet_selv_skriver():
    sti = energinet.ENERGINET_JSON_PATH
    with open(sti, encoding="utf-8") as f:
        tekst = f.read()
    assert energinet.til_json(json.loads(tekst)) == tekst


def test_filen_oplyser_metode_enhed_og_hvor_den_kommer_fra():
    en = energinet.laes()
    for noegle in ("kilde", "side", "fil", "ark", "kolonne", "metode", "enhed", "hentet"):
        assert en[noegle], noegle
    assert en["kolonne"] == energinet.KOLONNE and en["enhed"] == energinet.ENHED
