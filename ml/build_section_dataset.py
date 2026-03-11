from __future__ import annotations

import argparse
from pathlib import Path

from common import ensure_dir, load_answer_bank, load_intent_aliases, read_jsonl, write_json, write_jsonl


def build_label_map() -> dict[str, str]:
    answer_bank = load_answer_bank()
    aliases = load_intent_aliases()
    by_qa = {row.qaId: row for row in answer_bank}
    label_map: dict[str, str] = {}
    for row in answer_bank:
        canonical_id = aliases.get(row.qaId, row.qaId)
        canonical = by_qa.get(canonical_id)
        if not canonical:
            raise SystemExit(f"Alias target missing from answer bank: {canonical_id}")
        label_map[row.qaId] = canonical.sectionId
    return label_map


def remap_rows(rows: list[dict], qa_to_section: dict[str, str]) -> list[dict]:
    out: list[dict] = []
    for row in rows:
        label = str(row["label"])
        if label == "NOT_COVERED":
            out.append({**row, "label": "NOT_COVERED"})
            continue

        section_id = qa_to_section.get(label)
        if not section_id:
            raise SystemExit(f"Missing section mapping for qaId: {label}")
        out.append({**row, "label": section_id})
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", default="ml/data")
    parser.add_argument("--out-dir", default="ml/data_section")
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    out_dir = Path(args.out_dir)
    ensure_dir(out_dir)

    qa_to_section = build_label_map()
    summary: dict[str, int] = {}

    for name in ["train", "val", "test", "challenge"]:
        rows = read_jsonl(source_dir / f"{name}.jsonl")
        mapped = remap_rows(rows, qa_to_section)
        write_jsonl(out_dir / f"{name}.jsonl", mapped)
        summary[name] = len(mapped)

    section_labels = sorted(set(qa_to_section.values()))
    write_json(
        out_dir / "section_dataset_meta.json",
        {
            "section_label_count": len(section_labels),
            "section_labels": section_labels,
            "qa_label_count": len(qa_to_section),
            "splits": summary,
        },
    )

    print(
        {
            "section_label_count": len(section_labels),
            "qa_label_count": len(qa_to_section),
            "splits": summary,
        }
    )


if __name__ == "__main__":
    main()
