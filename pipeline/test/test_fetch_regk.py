"""fetch_regk leverer REGK11's kroner pr. indbygger, fordelt på art og
hovedkonto. Ingen omregning, ingen sammenlægning - det sker i indkoeb.py."""
import unittest
from unittest.mock import patch

import fetch_regk
import indkoeb


def _raekke(omraade, funk1, art, tid, indhold):
    return {"OMRÅDE": omraade, "FUNK1": funk1, "ART": art,
            "DRANST": "1 Driftskonti",
            "PRISENHED": "Pr. indbygger, løbende priser (kr.)",
            "TID": tid, "INDHOLD": indhold}


IALT = indkoeb.HOVEDKONTO_IALT
FORS = indkoeb.HOVEDKONTO_FORSYNING

SVAR = [
    _raekke("Thisted", IALT, "2.2 Fødevarer", "2025", "585"),
    _raekke("Thisted", FORS, "2.2 Fødevarer", "2025", "0"),
    _raekke("Thisted", IALT, "2.3 Brændsel og drivmidler", "2025", "787"),
    _raekke("Thisted", IALT, "2.2 Fødevarer", "2024", "531"),
    _raekke("Hele landet", IALT, "2.2 Fødevarer", "2025", "502"),
    # Arter uden for afgrænsningen skal ikke med, heller ikke hvis DST sender dem.
    _raekke("Thisted", IALT, "4.6 Betalinger til staten", "2025", "11572"),
    _raekke("Thisted", IALT, "1 Lønninger", "2025", "37881"),
    # DST's markør for manglende data må ikke blive til nul.
    _raekke("Ukendt Sted", IALT, "2.2 Fødevarer", "2025", ".."),
]


class TestFetchIndkoeb(unittest.TestCase):
    def _hent(self):
        with patch.object(fetch_regk.dst_client, "fetch", return_value=SVAR):
            return fetch_regk.fetch_indkoeb(fetch_regk.DRANST_DRIFT, ["2024", "2025"])

    def test_struktur_er_omraade_aar_art_hovedkonto(self):
        ud = self._hent()
        self.assertEqual(ud["Thisted"]["2025"]["22"][IALT], 585.0)
        self.assertEqual(ud["Thisted"]["2025"]["22"][FORS], 0.0)
        self.assertEqual(ud["Thisted"]["2024"]["22"][IALT], 531.0)

    def test_arter_uden_for_afgraensningen_udelades(self):
        ud = self._hent()
        arter = ud["Thisted"]["2025"].keys()
        self.assertNotIn("46", arter)
        self.assertNotIn("1", arter)
        self.assertEqual(sorted(arter), ["22", "23"])

    def test_manglende_data_bliver_ikke_nul(self):
        ud = self._hent()
        self.assertNotIn("Ukendt Sted", ud)

    def test_landet_hentes_som_omraade(self):
        self.assertEqual(self._hent()["Hele landet"]["2025"]["22"][IALT], 502.0)


class TestArtId(unittest.TestCase):
    def test_dst_tekst_opløses_til_artskode(self):
        self.assertEqual(fetch_regk._art_id("2.2 Fødevarer"), "22")
        self.assertEqual(fetch_regk._art_id("4.5 Entreprenør- og håndværkerydelser"), "45")

    def test_art_uden_for_afgraensningen_giver_none(self):
        self.assertIsNone(fetch_regk._art_id("4.6 Betalinger til staten"))
        self.assertIsNone(fetch_regk._art_id("1 Lønninger"))
        self.assertIsNone(fetch_regk._art_id("I alt (netto)"))


class TestAfgraensningIKald(unittest.TestCase):
    def test_kaldet_beder_om_pr_indbygger_og_de_rigtige_hovedkonti(self):
        with patch.object(fetch_regk.dst_client, "fetch", return_value=[]) as f:
            fetch_regk.fetch_indkoeb(fetch_regk.DRANST_ANLAEG, ["2025"])
        params = f.call_args[0][2]
        self.assertEqual(params["PRISENHED"], "INDL")
        self.assertEqual(params["DRANST"], "3")
        self.assertEqual(params["FUNK1"], "X,1,2")
        self.assertEqual(params["ART"], ",".join(indkoeb.ARTER_INDKOEB))


if __name__ == "__main__":
    unittest.main()
