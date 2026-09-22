"""Causal Wizard estimation package - the "guts" behind the two results
notebooks. Config parsing, identification, estimation (CD+PO and PD+FE),
counterfactuals, propensity diagnostics, refutation tests, and plotting
each live in their own small module; the notebooks are thin call sequences
into these, not where any real logic lives.

Importing this package applies one compatibility shim before anything else
runs: DoWhy 0.12 calls the now-removed `networkx.algorithms.d_separated`
(renamed to `is_d_separator` in networkx >=3.3, with the same signature) -
aliasing it here means we can use a current networkx instead of pinning to
an old one just to keep DoWhy happy.
"""

import networkx as _nx

if not hasattr(_nx.algorithms, "d_separated") and hasattr(_nx.algorithms, "is_d_separator"):
    _nx.algorithms.d_separated = _nx.algorithms.is_d_separator
