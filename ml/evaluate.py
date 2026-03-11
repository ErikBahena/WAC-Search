from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from common import ML_ARTIFACTS_DIR, ML_DATA_DIR, load_json, read_jsonl, write_json


def predict_batch(model, tokenizer, texts: list[str], max_length: int, temperature: float) -> tuple[np.ndarray, np.ndarray]:
    encoded = tokenizer(
        texts,
        truncation=True,
        padding=True,
        max_length=max_length,
        return_tensors="pt",
    )
    with torch.no_grad():
        logits = model(**encoded).logits.cpu().numpy()
    scaled = logits / max(temperature, 1e-6)
    scaled = scaled - scaled.max(axis=1, keepdims=True)
    exp = np.exp(scaled)
    probs = exp / exp.sum(axis=1, keepdims=True)
    return logits, probs


def evaluate_rows(
    rows: list[dict],
    model,
    tokenizer,
    temperature: float,
    min_conf: float,
    min_margin: float,
    max_length: int,
) -> dict:
    if not rows:
        return {}

    id2label = {int(k): v for k, v in model.config.id2label.items()} if model.config.id2label else None
    if not id2label:
        id2label = {i: str(i) for i in range(model.config.num_labels)}

    predictions: list[dict] = []
    batch_size = 64
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        _, probs = predict_batch(
            model=model,
            tokenizer=tokenizer,
            texts=[row["text"] for row in batch],
            max_length=max_length,
            temperature=temperature,
        )
        for j, row in enumerate(batch):
            p = probs[j]
            top_indices = np.argsort(-p)[:2]
            top1_idx = int(top_indices[0])
            top2_idx = int(top_indices[1]) if len(top_indices) > 1 else top1_idx
            top1_prob = float(p[top1_idx])
            top2_prob = float(p[top2_idx])
            pred_label = id2label[top1_idx]
            margin = top1_prob - top2_prob
            matched = (
                pred_label != "NOT_COVERED"
                and top1_prob >= min_conf
                and margin >= min_margin
            )
            predictions.append(
                {
                    "true": row["label"],
                    "pred": pred_label,
                    "matched": matched,
                    "confidence": top1_prob,
                    "margin": margin,
                }
            )

    matched = [p for p in predictions if p["matched"]]
    matched_correct = [p for p in matched if p["pred"] == p["true"]]
    in_scope = [p for p in predictions if p["true"] != "NOT_COVERED"]
    in_scope_abstain = [p for p in in_scope if not p["matched"]]
    ood = [p for p in predictions if p["true"] == "NOT_COVERED"]
    ood_false_accept = [p for p in ood if p["matched"]]

    return {
        "total": len(predictions),
        "matched_total": len(matched),
        "matched_precision": (len(matched_correct) / len(matched)) if matched else 0.0,
        "in_scope_total": len(in_scope),
        "in_scope_abstain_rate": (len(in_scope_abstain) / len(in_scope)) if in_scope else 0.0,
        "ood_total": len(ood),
        "ood_false_accept_rate": (len(ood_false_accept) / len(ood)) if ood else 0.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", default=str(ML_ARTIFACTS_DIR / "intent-v1" / "model"))
    parser.add_argument("--calibration", default=str(ML_ARTIFACTS_DIR / "intent-v1" / "calibration.json"))
    parser.add_argument("--test-file", default=str(ML_DATA_DIR / "test.jsonl"))
    parser.add_argument("--challenge-file", default=str(ML_DATA_DIR / "challenge.jsonl"))
    parser.add_argument("--out-file", default=str(ML_ARTIFACTS_DIR / "intent-v1" / "evaluation.json"))
    parser.add_argument("--min-confidence", type=float, default=0.78)
    parser.add_argument("--min-margin", type=float, default=0.18)
    parser.add_argument("--max-length", type=int, default=48)
    args = parser.parse_args()

    model = AutoModelForSequenceClassification.from_pretrained(args.model_dir)
    tokenizer = AutoTokenizer.from_pretrained(args.model_dir)
    model.eval()

    temperature = 1.0
    calibration_path = Path(args.calibration)
    if calibration_path.exists():
        temperature = float(load_json(calibration_path).get("temperature", 1.0))

    test_rows = read_jsonl(Path(args.test_file))
    challenge_rows = read_jsonl(Path(args.challenge_file))

    report = {
        "thresholds": {
            "min_confidence": args.min_confidence,
            "min_margin": args.min_margin,
            "temperature": temperature,
        },
        "test": evaluate_rows(
            rows=test_rows,
            model=model,
            tokenizer=tokenizer,
            temperature=temperature,
            min_conf=args.min_confidence,
            min_margin=args.min_margin,
            max_length=args.max_length,
        ),
        "challenge": evaluate_rows(
            rows=challenge_rows,
            model=model,
            tokenizer=tokenizer,
            temperature=temperature,
            min_conf=args.min_confidence,
            min_margin=args.min_margin,
            max_length=args.max_length,
        ),
    }

    write_json(Path(args.out_file), report)
    print(report)


if __name__ == "__main__":
    main()
