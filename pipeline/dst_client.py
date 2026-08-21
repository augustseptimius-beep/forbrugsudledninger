"""Generisk klient til DST's og Finans Danmarks PX-Web-baserede statbank-API.
Begge kilder deler samme API-form (api.statbank.dk), blot under forskellige
base_url-underspor: DST er "/v1", Finans Danmark BM010 er "/v1/s20"."""

import csv
import io
import urllib.parse
import urllib.request

DST_BASE_URL = "https://api.statbank.dk/v1"
FINANS_DANMARK_BASE_URL = "https://api.statbank.dk/v1/s20"

TIMEOUT_SEKUNDER = 30


def build_url(base_url, table, params):
    """Bygger data-URL'en. params er en dict af {variabel: værdi}; værdier med
    komma (fx "1,2,3") og "*" sendes igennem uændret - urlencode håndterer selv
    danske bogstaver i værdier korrekt."""
    query = urllib.parse.urlencode(params, safe="*,")
    return f"{base_url}/data/{table}/CSV?{query}"


def parse_csv(text):
    """Parser DST's semikolon-separerede CSV-tekst til en liste af dicts.
    Fjerner UTF-8 BOM'en, som DST altid sætter forrest."""
    if text.startswith("﻿"):
        text = text[1:]
    return list(csv.DictReader(io.StringIO(text), delimiter=";"))


# DST's dokumenterede markører for "ingen data" (ikke nul). Kun disse springes over -
# alt andet uventet (forkert kolonnenavn, ændret talformat) skal fejle højlydt i en
# ubemandet årlig pipeline, ikke forsvinde stille i en try/except. Offentlig (ikke
# understreget), fordi fetch_dst.py's enkeltværdi-parsere (areal, gini, formue,
# boligareal) skal bruge samme markørliste i stedet for hver sin lokale kopi.
INGEN_DATA_MARKORER = ("-", "..", "")


def sum_by(rows, group_cols, value_col="INDHOLD"):
    """Summerer value_col grupperet efter group_cols (liste af kolonnenavne).
    Ikke-numeriske værdier ('-', '..', tomme celler) ignoreres, da de betyder
    'ingen data' i DST's konvention, ikke nul. Et forkert value_col (KeyError)
    eller et uventet talformat (ValueError) fejler i stedet for at forsvinde stille.
    Returnerer {enkelt_vaerdi: sum} hvis group_cols har 1 element,
    ellers {(vaerdi1, vaerdi2, ...): sum}."""
    sums = {}
    for row in rows:
        raw = row[value_col]
        if raw in INGEN_DATA_MARKORER:
            continue
        v = int(raw)
        key = row[group_cols[0]] if len(group_cols) == 1 else tuple(row[c] for c in group_cols)
        sums[key] = sums.get(key, 0) + v
    return sums


def fetch(base_url, table, params):
    """Henter og parser en tabel. Kaster urllib.error.HTTPError/URLError ved netværksfejl -
    build.py fanger disse pr. kilde, så én fejlende tabel ikke stopper hele pipelinen."""
    url = build_url(base_url, table, params)
    with urllib.request.urlopen(url, timeout=TIMEOUT_SEKUNDER) as resp:
        text = resp.read().decode("utf-8")
    return parse_csv(text)
