"""Generisk klient til Danmarks Statistiks PX-Web-baserede statbank-API
(api.statbank.dk)."""

import csv
import io
import json
import urllib.parse
import urllib.request

DST_BASE_URL = "https://api.statbank.dk/v1"

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
# understreget), fordi fetch_dst.py's enkeltværdi-parsere (gini, boligareal,
# pendling) skal bruge samme markørliste i stedet for hver sin lokale kopi.
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


def tabel_perioder(base_url, table):
    """Alle tidsværdier, tabellen har, som DST staver dem ("2018M01", "2024").

    Historikken beder om en periodekæde bagud fra nøgletallets nuværende
    periode. En tabel, der er yngre end kæden er lang, ville svare med en fejl
    på den første ukendte periode, så kæden skæres til det, tabellen faktisk
    har, før den sendes af sted."""
    url = f"{base_url}/tableinfo/{table}?lang=da&format=JSON"
    with urllib.request.urlopen(url, timeout=TIMEOUT_SEKUNDER) as resp:
        info = json.load(resp)
    for var in info["variables"]:
        if var.get("time"):
            return [v["id"] for v in var["values"]]
    raise ValueError(f"{table} har ingen tidsvariabel")


def opdel_paa_tid(rows, periode=lambda tid: tid):
    """Deler et svar med flere perioder i {periode: [rækker]}.

    Nøgletallenes egen udregning kender kun ét tidspunkt ad gangen, så den
    køres uændret på hver periodes rækker. Så er der kun én definition af
    nøgletallet, og historikkens seneste punkt kan ikke afvige fra tallet på
    kommunesiden. `periode` bruges, hvor en periode består af flere
    tidspunkter, fx et års fire kvartaler."""
    ud = {}
    for r in rows:
        ud.setdefault(periode(r["TID"]), []).append(r)
    return ud


def fetch_i_bidder(base_url, table, params, perioder, bid):
    """Henter perioderne `bid` ad gangen og lægger svarene sammen.

    En forespørgsel med jokertegn på flere dimensioner rammer hurtigt DST's
    grænse på en million celler, når der også er mange perioder."""
    rows = []
    for i in range(0, len(perioder), bid):
        rows.extend(fetch(base_url, table,
                          {**params, "Tid": ",".join(perioder[i:i + bid])}))
    return rows
