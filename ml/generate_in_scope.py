from __future__ import annotations

import argparse
from pathlib import Path

from common import (
    ML_DATA_DIR,
    dedupe_rows,
    load_answer_bank,
    load_intent_aliases,
    normalize_text,
    write_jsonl,
)


def load_manual_rows(paths: list[Path]) -> list[dict[str, str]]:
    aliases = load_intent_aliases()
    answer_bank: dict[str, object] = {}
    for row in load_answer_bank():
        canonical_qa_id = aliases.get(row.qaId, row.qaId)
        answer_bank[canonical_qa_id] = row
    rows: list[dict[str, str]] = []
    seen_labels: set[str] = set()
    for path in paths:
        if not path.exists():
            raise SystemExit(f"Manual in-scope source not found: {path}")

        with path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue

                parts = [part.strip() for part in line.split("\t")]
                if len(parts) < 2:
                    raise SystemExit(
                        "Each in-scope line must be: qaId<TAB>example1<TAB>example2..."
                    )

                raw_qa_id = parts[0]
                qa_id = aliases.get(raw_qa_id, raw_qa_id)
                if qa_id not in answer_bank:
                    raise SystemExit(f"Unknown qaId in manual in-scope file: {qa_id}")

                seen_labels.add(qa_id)
                for text in parts[1:]:
                    if not text:
                        continue
                    rows.append(
                        {
                            "text": normalize_text(text),
                            "label": qa_id,
                            "kind": "in_scope",
                            "style": "manual",
                        }
                    )

    missing = sorted(set(answer_bank) - seen_labels)
    if missing:
        raise SystemExit(
            f"Manual in-scope file is missing {len(missing)} qaIds. First missing: {missing[:10]}"
        )

    return dedupe_rows(rows, "text", "label")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manual-dir", default=str(Path(__file__).resolve().parent / "manual"))
    parser.add_argument("--output", default=str(ML_DATA_DIR / "in_scope.jsonl"))
    args = parser.parse_args()

    manual_dir = Path(args.manual_dir)
    paths = sorted(manual_dir.glob("in_scope*.tsv"))
    if not paths:
        raise SystemExit(f"No manual in-scope sources found in {manual_dir}")

    rows = load_manual_rows(paths)
    write_jsonl(Path(args.output), rows)
    print(f"Wrote {len(rows)} in-scope manual rows to {args.output}")


if __name__ == "__main__":
    main()
