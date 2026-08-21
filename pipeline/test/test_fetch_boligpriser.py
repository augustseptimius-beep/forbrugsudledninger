import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from unittest.mock import patch
import fetch_boligpriser

BM010_CSV = (
    "﻿OMR20;EJKAT20;PRIS20;TID;INDHOLD\n"
    "Hele landet;Parcel-/rækkehus;Realiseret handelspris;2025K4;18429\n"
    "Thisted;Parcel-/rækkehus;Realiseret handelspris;2025K4;7430\n"
    "Greve;Parcel-/rækkehus;Realiseret handelspris;2025K4;30347\n"
    "Århus;Parcel-/rækkehus;Realiseret handelspris;2025K4;19500\n"
)


class TestFetchBoligpriser(unittest.TestCase):
    @patch("fetch_boligpriser.dst_client.fetch")
    def test_boligpris_bruger_s20_base_url(self, mock_fetch):
        mock_fetch.return_value = fetch_boligpriser.dst_client.parse_csv(BM010_CSV)
        result = fetch_boligpriser.fetch_boligpris()
        self.assertEqual(result["Thisted"], 7430)
        self.assertEqual(result["Greve"], 30347)
        # Bekræft at kaldet gik til Finans Danmarks base_url, ikke DST's
        args, kwargs = mock_fetch.call_args
        self.assertEqual(args[0], fetch_boligpriser.dst_client.FINANS_DANMARK_BASE_URL)

    @patch("fetch_boligpriser.dst_client.fetch")
    def test_aarhus_normaliseres_fra_bm010s_gamle_stavemaade(self, mock_fetch):
        """BM010's OMR20 bruger stadig fortidens retskrivning "Århus", mens DST og
        kommuner.py (og dermed resten af pipelinen) bruger den officielle "Aarhus"
        (retskrivningsændringen fra 2011) - verificeret direkte mod den levende API:
        det er den ENESTE af de 98 kommuner, hvor BM010's navn afviger fra kommuner.py's.
        Uden denne normalisering får Danmarks næststørste kommune boligpris_m2=None."""
        mock_fetch.return_value = fetch_boligpriser.dst_client.parse_csv(BM010_CSV)
        result = fetch_boligpriser.fetch_boligpris()
        self.assertEqual(result["Aarhus"], 19500)
        self.assertNotIn("Århus", result)

    @patch("fetch_boligpriser.dst_client.fetch")
    def test_flere_raekker_pr_omraade_fejler_hoejlydt(self, mock_fetch):
        """Værdien er en pris, ikke en tælling: hvis forespørgslen nogensinde giver
        flere rækker pr. område (fx to kvartaler i Tid), må priserne ikke summeres
        stille - det skal fejle højlydt."""
        to_kvartaler = (
            "﻿OMR20;EJKAT20;PRIS20;TID;INDHOLD\n"
            "Thisted;Parcel-/rækkehus;Realiseret handelspris;2025K3;7100\n"
            "Thisted;Parcel-/rækkehus;Realiseret handelspris;2025K4;7430\n"
        )
        mock_fetch.return_value = fetch_boligpriser.dst_client.parse_csv(to_kvartaler)
        with self.assertRaises(ValueError):
            fetch_boligpriser.fetch_boligpris()


if __name__ == "__main__":
    unittest.main()
