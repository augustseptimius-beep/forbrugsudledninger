"""Regning på DST's periodeangivelser: "2024", "2026K1" og "2026M01".

Historikken går bagud i hele år. Kvartals- og månedsværdier flytter sig derfor
ét år ad gangen og beholder deres kvartal eller måned: 2026K1 bliver 2025K1,
ikke 2025K4. Det er det, et nøgletal, der er opgjort pr. 1. januar eller i
januar, skal sammenlignes med."""


def aar_af(periode):
    """Kalenderåret i en periode: "2026K1" -> 2026."""
    return int(str(periode)[:4])


def trin_tilbage(periode, antal=1):
    """Samme periode `antal` år tidligere: "2026K1" -> "2025K1"."""
    periode = str(periode)
    return f"{int(periode[:4]) - antal}{periode[4:]}"


def periodekaede(seneste, antal):
    """De `antal` foregående perioder og den seneste, ældste først.

    Listen har altid antal + 1 led, og det sidste er `seneste` selv. Det er
    nøgletallets nuværende periode, og at den er med er hele pointen: historikkens
    seneste punkt er det tal, nøgletallet viser i dag."""
    return [trin_tilbage(seneste, k) for k in range(antal, -1, -1)]


def kvartaler(aar):
    """De fire kvartaler i et år, som DST staver dem."""
    return [f"{aar}K{k}" for k in range(1, 5)]
