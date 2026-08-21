"""fetch_pendling leverer km som DST opgør dem - intet andet.

Modulet indeholdt tidligere en omregning fra pendlingsafstand til
bil-kilometer og en kalibrering mod DTU's ene regionale tal. Begge var
metodiske beslutninger uden kilde og er fjernet. Testene holder dem ude."""
import unittest
from unittest.mock import patch

import fetch_pendling


SVAR = [
    {"BOPOMR": "Hele landet", "INDHOLD": "22,6"},
    {"BOPOMR": "Region Nordjylland", "INDHOLD": "26,8"},
    {"BOPOMR": "Region Sjælland", "INDHOLD": "29,0"},
    {"BOPOMR": "Thisted", "INDHOLD": "23,6"},
    {"BOPOMR": "Vordingborg", "INDHOLD": "36,3"},
    {"BOPOMR": "Ukendt Sted", "INDHOLD": ".."},
]


class TestFetchPendlingsafstand(unittest.TestCase):
    def _hent(self):
        with patch.object(fetch_pendling.dst_client, "fetch", return_value=SVAR):
            return fetch_pendling.fetch_pendlingsafstand()

    def test_returnerer_raa_km_uden_omregning(self):
        ud = self._hent()
        self.assertEqual(ud["Thisted"], 23.6)
        self.assertEqual(ud["Vordingborg"], 36.3)
        self.assertEqual(ud["Hele landet"], 22.6)

    def test_regionsnavne_normaliseres_saa_de_matcher_kommuner_py(self):
        ud = self._hent()
        self.assertIn("Nordjylland", ud)
        self.assertNotIn("Region Nordjylland", ud)

    def test_manglende_data_udelades(self):
        # DST's ".." betyder ingen data, ikke nul.
        self.assertNotIn("Ukendt Sted", self._hent())

    def test_komma_som_decimalseparator_parses(self):
        self.assertIsInstance(self._hent()["Thisted"], float)


class TestIngenOmregning(unittest.TestCase):
    def test_de_fjernede_funktioner_er_ikke_kommet_tilbage(self):
        for navn in ("beregn_bilkm_afvigelse", "beregn_bilkm_afvigelse_kommune",
                     "DTU_NORDJYLLAND"):
            self.assertFalse(hasattr(fetch_pendling, navn),
                             f"{navn} var en metodisk beslutning uden kilde")

    def test_modulet_indeholder_ingen_kalibrering(self):
        kilde = open(fetch_pendling.__file__, encoding="utf-8").read()
        # Ordet må gerne stå i forklaringen af hvad der er fjernet, men ikke
        # som en tildeling.
        self.assertNotIn("faktor =", kilde)
        self.assertNotIn("kalibrering =", kilde)


if __name__ == "__main__":
    unittest.main()
