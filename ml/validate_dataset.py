from __future__ import annotations

import argparse
import random
from collections import Counter, defaultdict
from pathlib import Path

from common import ML_DATA_DIR, dedupe_rows, load_answer_bank, read_jsonl, seed_everything, write_json, write_jsonl


def typoify(text: str) -> str:
    words = text.split()
    if not words:
        return text
    idx = random.randrange(0, len(words))
    token = words[idx]
    if len(token) > 4:
        token = token[:-1]
    elif len(token) > 2:
        token = token[0] + token[2:] + token[1]
    words[idx] = token
    return " ".join(words)


def split_by_label(rows: list[dict], train_ratio: float, val_ratio: float) -> tuple[list[dict], list[dict], list[dict]]:
    by_label: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_label[str(row["label"])].append(row)

    train: list[dict] = []
    val: list[dict] = []
    test: list[dict] = []

    for label_rows in by_label.values():
        random.shuffle(label_rows)
        n = len(label_rows)
        train_n = int(n * train_ratio)
        val_n = int(n * val_ratio)
        test_n = n - train_n - val_n
        if n >= 3:
            val_n = max(1, val_n)
            test_n = max(1, test_n)
            train_n = n - val_n - test_n
            if train_n < 1:
                train_n = 1
                if val_n >= test_n and val_n > 1:
                    val_n -= 1
                elif test_n > 1:
                    test_n -= 1
                else:
                    test_n = 1
                    val_n = max(1, n - train_n - test_n)

        train.extend(label_rows[:train_n])
        val.extend(label_rows[train_n : train_n + val_n])
        test.extend(label_rows[train_n + val_n : train_n + val_n + test_n])

    random.shuffle(train)
    random.shuffle(val)
    random.shuffle(test)
    return train, val, test


def cross_label_collisions(in_scope: list[dict]) -> int:
    text_to_labels: dict[str, set[str]] = defaultdict(set)
    for row in in_scope:
        text_to_labels[str(row["text"])].add(str(row["label"]))
    return sum(1 for labels in text_to_labels.values() if len(labels) > 1)


def assert_in_scope_shape(in_scope: list[dict], min_per_intent: int) -> dict[str, int]:
    counts = Counter(str(row["label"]) for row in in_scope)
    expected_labels = {row.qaId for row in load_answer_bank()}
    missing = sorted(expected_labels - set(counts))
    if missing:
        raise SystemExit(f"Missing in-scope labels: {missing[:10]}")

    bad = {label: count for label, count in counts.items() if count < min_per_intent}
    if bad:
        example_label = next(iter(bad))
        raise SystemExit(
            f"In-scope label '{example_label}' has {bad[example_label]} rows; expected at least {min_per_intent}"
        )

    return counts


def assert_ood_shape(ood: list[dict], min_total: int, min_near_miss: int) -> Counter[str]:
    if len(ood) < min_total:
        raise SystemExit(f"OOD row count too small: {len(ood)} (expected at least {min_total})")
    labels = {str(row["label"]) for row in ood}
    if labels != {"NOT_COVERED"}:
        raise SystemExit(f"OOD dataset has unexpected labels: {sorted(labels)}")

    styles = Counter(str(row.get("style", "")) for row in ood)
    if styles["near_miss"] < min_near_miss:
        raise SystemExit(
            f"OOD near_miss rows too small: {styles['near_miss']} (expected >= {min_near_miss})"
        )
    return styles


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in-scope", default=str(ML_DATA_DIR / "in_scope.jsonl"))
    parser.add_argument("--ood", default=str(ML_DATA_DIR / "ood.jsonl"))
    parser.add_argument("--out-dir", default=str(ML_DATA_DIR))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--min-per-intent", type=int, default=3)
    parser.add_argument("--min-ood-total", type=int, default=60)
    parser.add_argument("--min-near-miss", type=int, default=20)
    parser.add_argument("--enforce-cross-label-uniqueness", action="store_true")
    args = parser.parse_args()

    seed_everything(args.seed)
    random.seed(args.seed)

    in_scope = read_jsonl(Path(args.in_scope))
    ood = read_jsonl(Path(args.ood))
    if not in_scope:
        raise SystemExit("No in-scope dataset found. Run generate_in_scope.py first.")
    if not ood:
        raise SystemExit("No OOD dataset found. Run generate_ood.py first.")

    in_scope = dedupe_rows(in_scope, "text", "label")
    ood = dedupe_rows(ood, "text", "label")

    collisions = cross_label_collisions(in_scope)
    if args.enforce_cross_label_uniqueness and collisions > 0:
        raise SystemExit(f"Found {collisions} cross-label duplicate query texts.")
    label_counts = assert_in_scope_shape(in_scope, args.min_per_intent)
    ood_style_counts = assert_ood_shape(ood, args.min_ood_total, args.min_near_miss)

    in_train, in_val, in_test = split_by_label(in_scope, 0.8, 0.1)
    ood_train, ood_val, ood_test = split_by_label(ood, 0.8, 0.1)

    train = in_train + ood_train
    val = in_val + ood_val
    test = in_test + ood_test
    random.shuffle(train)
    random.shuffle(val)
    random.shuffle(test)

    out_dir = Path(args.out_dir)
    write_jsonl(out_dir / "train.jsonl", train)
    write_jsonl(out_dir / "val.jsonl", val)
    write_jsonl(out_dir / "test.jsonl", test)

    challenge: list[dict] = []

    ambiguous_seed = random.sample(in_scope, min(500, len(in_scope)))
    for row in ambiguous_seed:
        parts = str(row["text"]).split()
        condensed = " ".join(parts[: max(3, min(6, len(parts)))])
        challenge.append(
            {
                "text": condensed,
                "label": row["label"],
                "kind": "challenge",
                "style": "ambiguous",
            }
        )

    typo_seed = random.sample(in_scope, min(500, len(in_scope)))
    for row in typo_seed:
        challenge.append(
            {
                "text": typoify(str(row["text"])),
                "label": row["label"],
                "kind": "challenge",
                "style": "typo",
            }
        )

    near_miss = [row for row in ood if row.get("style") == "near_miss"]
    for row in random.sample(near_miss, min(500, len(near_miss))):
        challenge.append(
            {
                "text": row["text"],
                "label": "NOT_COVERED",
                "kind": "challenge",
                "style": "ood_near_miss",
            }
        )

    random.shuffle(challenge)
    write_jsonl(out_dir / "challenge.jsonl", challenge)

    stats = {
        "in_scope_total": len(in_scope),
        "ood_total": len(ood),
        "train_total": len(train),
        "val_total": len(val),
        "test_total": len(test),
        "challenge_total": len(challenge),
        "in_scope_label_count_min": min(label_counts.values()),
        "in_scope_label_count_max": max(label_counts.values()),
        "unique_in_scope_labels": len(label_counts),
        "cross_label_duplicate_texts": collisions,
        "ood_style_counts": dict(ood_style_counts),
    }
    write_json(out_dir / "dataset_stats.json", stats)
    print(stats)


if __name__ == "__main__":
    main()
