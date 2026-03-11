from __future__ import annotations

import argparse
from pathlib import Path

from common import ML_DATA_DIR, dedupe_rows, normalize_text, write_jsonl

VALID_STYLES = {"near_miss", "adjacent_childcare", "unrelated_general"}


def load_manual_rows(paths: list[Path]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path in paths:
        if not path.exists():
            raise SystemExit(f"Manual OOD source not found: {path}")

        with path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue

                parts = [part.strip() for part in line.split("\t")]
                if len(parts) != 2:
                    raise SystemExit("Each OOD line must be: style<TAB>text")

                style, text = parts
                if style not in VALID_STYLES:
                    raise SystemExit(f"Invalid OOD style '{style}'. Expected one of {sorted(VALID_STYLES)}")

                rows.append(
                    {
                        "text": normalize_text(text),
                        "label": "NOT_COVERED",
                        "kind": "ood",
                        "style": style,
                    }
                )

    return dedupe_rows(rows, "text", "label")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manual-dir", default=str(Path(__file__).resolve().parent / "manual"))
    parser.add_argument("--output", default=str(ML_DATA_DIR / "ood.jsonl"))
    args = parser.parse_args()

    manual_dir = Path(args.manual_dir)
    paths = sorted(manual_dir.glob("ood*.tsv"))
    if not paths:
        raise SystemExit(f"No manual OOD sources found in {manual_dir}")

    rows = load_manual_rows(paths)
    write_jsonl(Path(args.output), rows)
    print(f"Wrote {len(rows)} OOD manual rows to {args.output}")


if __name__ == "__main__":
    main()
