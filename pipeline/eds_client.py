"""Klient til Energi Data Service (api.energidataservice.dk).

API'et rate-limiter aggressivt og svarer med HTTP 429 og en besked om, hvor
mange sekunder der skal ventes. Klienten respekterer den besked frem for at
gætte en pause, og den paginerer, fordi et helt års timedata overstiger,
hvad ét kald returnerer."""

import json
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://api.energidataservice.dk"
TIMEOUT_SEKUNDER = 120
MAKS_FORSOEG = 6
SIDESTOERRELSE = 100000


def _hent_en_gang(url):
    req = urllib.request.Request(url, headers={"User-Agent": "forbrugsudledninger/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SEKUNDER) as svar:
        return json.loads(svar.read().decode("utf-8"))


def hent(dataset, params, sov=time.sleep):
    """Ét kald mod ét datasæt. Ved 429 ventes den tid, API'et selv angiver.

    sov injiceres, så testene kan køre uden at vente i rigtig tid."""
    url = f"{BASE_URL}/dataset/{dataset}?" + urllib.parse.urlencode(params, safe="{}[]\",: ")
    for forsoeg in range(MAKS_FORSOEG):
        try:
            data = _hent_en_gang(url)
        except urllib.error.HTTPError as fejl:
            if fejl.code != 429:
                raise
            data = {"statusCode": 429, "message": fejl.read().decode("utf-8", "replace")}

        if data.get("statusCode") == 429 or "records" not in data:
            ventetid = _ventetid(data.get("message", ""), forsoeg)
            sov(ventetid)
            continue
        return data["records"]
    raise RuntimeError(f"{dataset}: gav op efter {MAKS_FORSOEG} forsøg (rate limit)")


def _ventetid(besked, forsoeg):
    """Læser antal sekunder ud af API'ets egen 429-besked. Falder tilbage til
    eksponentiel backoff, hvis beskeden ikke kan tolkes."""
    for ord_ in str(besked).split():
        if ord_.isdigit():
            return int(ord_) + 1
    return 2 ** (forsoeg + 1)


def hent_alle(dataset, params, sov=time.sleep):
    """Henter alle rækker via offset-paginering."""
    alle = []
    offset = 0
    while True:
        side = dict(params, limit=SIDESTOERRELSE, offset=offset)
        raekker = hent(dataset, side, sov=sov)
        alle.extend(raekker)
        if len(raekker) < SIDESTOERRELSE:
            return alle
        offset += SIDESTOERRELSE
        sov(1)
