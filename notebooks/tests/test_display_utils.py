import pandas as pd

from causalwizard import display_utils


def test_style_yes_no_colors_yes_green_and_no_red():
    df = pd.DataFrame({"Estimate valid?": ["Yes", "No", ""]})
    styler = display_utils.style_yes_no(df, "Estimate valid?")
    html = styler.to_html()
    assert "color: green" in html
    assert "color: red" in html


def test_wrap_table_uses_full_width_and_normal_whitespace():
    df = pd.DataFrame({"Notes": ["a very long explanation that should wrap onto multiple lines"]})
    styler = display_utils.wrap_table(df, wrap_columns=["Notes"])
    html = styler.to_html()
    assert "white-space: normal" in html
    assert 'width:100%' in html
    # the full text must be present, unlike plain display(df) which
    # truncates at display.max_colwidth (see the follow-up 15 bugfix)
    assert "wrap onto multiple lines" in html


def test_style_confusion_matrix_colors_diagonal_green_off_diagonal_red():
    df = pd.DataFrame([[10, 2, 12], [3, 15, 18]], index=["0", "1"], columns=["0", "1", "Total"])
    df.index.name, df.columns.name = "Actual", "Predicted"
    styler = display_utils.style_confusion_matrix(df)
    html = styler.to_html()
    assert "#d4edda" in html  # green
    assert "#f8d7da" in html  # red


def test_show_does_not_raise(capsys):
    display_utils.show({"a": 1, "b": [1, 2, 3]}, label="Test")
    captured = capsys.readouterr()
    assert "Test:" in captured.out
    assert "'a': 1" in captured.out
