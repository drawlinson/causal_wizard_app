# Tutorial datasets

Stub placeholders — each file below is linked from an `/articles/tutorial-*` page
as the sample dataset for that tutorial. Replace each with the real CSV (same
filename, so the existing tutorial links keep working), matching the column
names referenced in that tutorial's text:

- `tutorial-1-education-wages.csv` — Education (years), Weekly Wage, IQ.
  Chapter 4 of Matheus Facure's Python Causality Handbook (confounding bias).
- `tutorial-2-headlines.csv` — title_length, click_through_rate, author.
  Adam Kelleher's headline-length/CTR example.
- `tutorial-3-nhefs.csv` — Quit Smoking?, Change in Weight, plus the NHEFS
  confounders used in Chapter 12 of Hernan & Robins' "Causal Inference: What If".
- `tutorial-4-lalonde.csv` — Treated, Wage_1978, Wage_1974, Age, Education_years,
  Married, No_Degree (the Lalonde (1986) job-training dataset).
- `tutorial-fe-1-toy-panel.csv` — mkt_costs, purchase, city.
  Chapter 14 of the Python Causality Handbook (visualizing fixed effects).
- `tutorial-fe-2-installs.csv` — treat, installs, unit, date.
  Chapter 24 of the Python Causality Handbook (the promise of panel data).
- `tutorial-fe-3-billboard.csv` — deposits, poa, jul, treated.
  Chapter 13 of the Python Causality Handbook (the DiD estimator).

If a filename changes, update the matching `download` link in the tutorial
article's `.html` file under `src/articles/`.
