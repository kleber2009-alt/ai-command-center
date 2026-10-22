# funnel-analytics

End-to-end webinar-funnel analytics: decomposition sheet × Meta Ads × payments with UTM →
one self-contained HTML dashboard. Not deployed; not in Command Center. See `README.md` for input formats.

- `build.py`: reads CSVs + `config.json` from `--data`, matches payments to ads via UTM, injects JSON
  into `template.html` (placeholder `/*__DATA__*/null`) → `dist/index.html`. Python stdlib only.
- `meta_api.py`: Graph API insights export (ad level, account daily, placement/country breakdowns).
  Env `META_TOKEN`, `META_AD_ACCOUNT`, `META_API_VERSION`.
- `template.html`: all UI + calculations (period, FX, filters, reconciliation, P&L, "что делать"),
  vanilla JS, no external requests.
- `make_sample.py` → `sample/`: fictional demo dataset (deterministic seed). Never commit real client data.
- `dist/` is gitignored.
