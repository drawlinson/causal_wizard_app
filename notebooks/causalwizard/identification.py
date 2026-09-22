"""Turn a study's saved causal diagram into a DoWhy CausalModel and run
DoWhy's own identify_effect() - thin wrappers, DoWhy does the real work.
Unlike the old site's Python (which renamed every column to its integer
index before touching DoWhy, to dodge column-name edge cases), this uses
real column names directly, quoted in the digraph string - DoWhy/pydot
handles arbitrary-character quoted node names fine, and skipping the
index-rename means assumption/estimand text DoWhy generates already reads
in real column names with no name-substitution step needed afterwards.
"""

from __future__ import annotations

import json

from dowhy import CausalModel


def build_digraph_string(graph: dict) -> str:
    id_to_src = {n["data"]["id"]: n["data"]["src"] for n in graph["nodes"]}
    q = json.dumps  # double-quotes + escapes, valid pydot node-name syntax
    parts = [f"{q(n['data']['src'])};" for n in graph["nodes"]]
    for e in graph["edges"]:
        parts.append(f"{q(id_to_src[e['data']['source']])} -> {q(id_to_src[e['data']['target']])};")
    return "digraph { " + " ".join(parts) + " }"


def build_causal_model(df, graph: dict, treatment_col: str, outcome_col: str) -> CausalModel:
    return CausalModel(data=df, treatment=treatment_col, outcome=outcome_col, graph=build_digraph_string(graph))


def identify(model: CausalModel):
    """DoWhy picks its own default minimal identification per estimand
    type (backdoor/iv/frontdoor) - same as the old site's approach, and
    consistent by construction with the site's own client-side graph-only
    identification (both just run the same graph-theory algorithm)."""
    return model.identify_effect()


def estimand_names(identified) -> list[str]:
    """DoWhy also returns numbered alternate backdoor sets ("backdoor1",
    "backdoor2", ...) when several exist - the site's own identification
    only ever surfaces one (its default/minimal pick), so we do the same:
    keep "backdoor" but drop any digit-suffixed alternates."""
    return [name for name in identified.estimands if identified.estimands[name] and not name[-1].isdigit()]


def estimand_info(identified, name: str) -> dict:
    """{"expression": str, "assumptions": {title: text}} for one estimand,
    already in real column names (see module docstring) - no
    variable-name substitution needed, unlike the old site."""
    estimand = identified.estimands[name]
    return {
        "expression": str(estimand.get("estimand", "")),
        "assumptions": dict(estimand.get("assumptions") or {}),
    }


def estimand_variables(identified, name: str) -> list[str]:
    """The actual adjustment/instrument set for one estimand - e.g. the
    backdoor variables DoWhy chose, for the covariate-balance plot and the
    modelling-statements section. `name` is "backdoor"/"iv"/"frontdoor"."""
    getters = {
        "backdoor": identified.get_backdoor_variables,
        "iv": identified.get_instrumental_variables,
        "frontdoor": identified.get_frontdoor_variables,
    }
    getter = getters.get(name)
    return list(getter()) if getter else []
