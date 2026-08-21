"""Tests for Energi Data Service-klienten. Intet netværk - urlopen mockes.
Rate limit-håndteringen er det vigtigste her: API'et afviser aggressivt, og
en klient, der ikke venter den tid, API'et selv angiver, giver op for tidligt."""
import io
import json
import unittest
import urllib.error
from unittest.mock import patch

import eds_client


def _svar(indhold):
    return io.BytesIO(json.dumps(indhold).encode("utf-8"))


class FalskSvar:
    def __init__(self, data):
        self._data = json.dumps(data).encode("utf-8")

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class TestVentetid(unittest.TestCase):
    def test_laeser_sekunder_ud_af_apiets_egen_besked(self):
        self.assertEqual(eds_client._ventetid("Rate limit is exceeded. Try again in 17 seconds.", 0), 18)

    def test_falder_tilbage_til_backoff_ved_ulaeselig_besked(self):
        self.assertEqual(eds_client._ventetid("noget uventet", 0), 2)
        self.assertEqual(eds_client._ventetid("noget uventet", 2), 8)


class TestHent(unittest.TestCase):
    def test_returnerer_records(self):
        with patch("urllib.request.urlopen", return_value=FalskSvar({"records": [{"a": 1}]})):
            self.assertEqual(eds_client.hent("X", {}, sov=lambda s: None), [{"a": 1}])

    def test_venter_og_proever_igen_ved_rate_limit(self):
        svar = [
            FalskSvar({"statusCode": 429, "message": "Try again in 3 seconds."}),
            FalskSvar({"records": [{"a": 1}]}),
        ]
        ventetider = []
        with patch("urllib.request.urlopen", side_effect=svar):
            r = eds_client.hent("X", {}, sov=ventetider.append)
        self.assertEqual(r, [{"a": 1}])
        self.assertEqual(ventetider, [4], "skal vente den tid, API'et selv angiver")

    def test_giver_op_efter_maks_forsoeg(self):
        afvis = FalskSvar({"statusCode": 429, "message": "Try again in 1 seconds."})
        with patch("urllib.request.urlopen", side_effect=[afvis] * 10):
            with self.assertRaises(RuntimeError):
                eds_client.hent("X", {}, sov=lambda s: None)

    def test_andre_http_fejl_kastes_videre(self):
        fejl = urllib.error.HTTPError("u", 500, "server", {}, None)
        with patch("urllib.request.urlopen", side_effect=fejl):
            with self.assertRaises(urllib.error.HTTPError):
                eds_client.hent("X", {}, sov=lambda s: None)


class TestHentAlle(unittest.TestCase):
    def test_paginerer_indtil_kort_side(self):
        fuld = [{"i": i} for i in range(eds_client.SIDESTOERRELSE)]
        rest = [{"i": "sidste"}]
        with patch("urllib.request.urlopen",
                   side_effect=[FalskSvar({"records": fuld}), FalskSvar({"records": rest})]):
            r = eds_client.hent_alle("X", {}, sov=lambda s: None)
        self.assertEqual(len(r), eds_client.SIDESTOERRELSE + 1)
        self.assertEqual(r[-1], {"i": "sidste"})

    def test_stopper_ved_foerste_korte_side(self):
        with patch("urllib.request.urlopen", return_value=FalskSvar({"records": [{"i": 1}]})):
            self.assertEqual(len(eds_client.hent_alle("X", {}, sov=lambda s: None)), 1)


if __name__ == "__main__":
    unittest.main()
