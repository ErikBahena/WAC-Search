Manual corpus sources for the intent model.

`in_scope.tsv`
- Format: `qaId<TAB>example1<TAB>example2<TAB>example3...`
- One line per QA intent.
- Every `qaId` from `public/data/intent-answer-bank.v1.json` must be present.

`ood.tsv`
- Format: `style<TAB>text`
- Valid styles: `near_miss`, `adjacent_childcare`, `unrelated_general`

Generation flow:
- `python3 ml/generate_in_scope.py`
- `python3 ml/generate_ood.py`
- `python3 ml/validate_dataset.py`

Authoring rules:
- Keep examples natural and short.
- Do not include citations or answer text in the query.
- Prefer real user phrasing over keyword strings.
- Avoid exact duplicate text across different labels whenever possible.
