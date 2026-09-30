"""build.py bygger historikken, og en historik, der afviger fra data.json, stopper kørslen.

main() henter fra ni kilder og skriver fem filer, så den køres ikke her. Kontrollen er, at
kaldet står i build.py, og at kun uoverensstemmelsen, ikke en kilde, der ikke kan nås,
standser udgivelsen."""
import inspect

import build
import historik


def test_build_bygger_historikken_med_de_samme_data_og_det_nyeste_klimaregnskab():
    kilde = inspect.getsource(build.main)
    assert "historik.byg_og_skriv(output" in kilde
    assert "husholdning_nu=husholdning" in kilde, (
        "det nyeste års Klimaregnskab er allerede hentet, og hentes ikke to gange")
    assert "frisk_kr" in kilde, "--frisk-kr gælder også historikken"


def test_kun_en_uoverensstemmelse_stopper_koerslen():
    kilde = inspect.getsource(build.main)
    assert "except historik.HistorikFejl:\n        raise" in kilde
    assert "except Exception as fejl" in kilde


def test_historikken_bygges_efter_data_json_er_skrevet():
    kilde = inspect.getsource(build.main)
    assert kilde.index("DATA_JSON_PATH") < kilde.index("historik.byg_og_skriv")
