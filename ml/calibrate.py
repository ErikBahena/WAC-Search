from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from common import ML_ARTIFACTS_DIR, ML_DATA_DIR, read_jsonl, write_json


def nll(logits: np.ndarray, labels: np.ndarray, temperature: float) -> float:
    scaled = logits / max(temperature, 1e-6)
    scaled = scaled - scaled.max(axis=1, keepdims=True)
    exp = np.exp(scaled)
    probs = exp / exp.sum(axis=1, keepdims=True)
    probs = np.clip(probs[np.arange(len(labels)), labels], 1e-9, 1.0)
    return float(-np.mean(np.log(probs)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", default=str(ML_ARTIFACTS_DIR / "intent-v1" / "model"))
    parser.add_argument("--val-file", default=str(ML_DATA_DIR / "val.jsonl"))
    parser.add_argument("--out-file", default=str(ML_ARTIFACTS_DIR / "intent-v1" / "calibration.json"))
    parser.add_argument("--max-length", type=int, default=48)
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(str(model_dir))
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
    model.eval()

    rows = read_jsonl(Path(args.val_file))
    if not rows:
      raise SystemExit("Validation file not found or empty.")

    label2id = model.config.label2id
    labels = np.array([label2id[row["label"]] for row in rows], dtype=np.int64)

    all_logits: list[np.ndarray] = []
    batch_size = 64
    with torch.no_grad():
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            encoded = tokenizer(
                [row["text"] for row in batch],
                truncation=True,
                padding=True,
                max_length=args.max_length,
                return_tensors="pt",
            )
            logits = model(**encoded).logits.cpu().numpy()
            all_logits.append(logits)

    logits = np.concatenate(all_logits, axis=0)
    best_temp = 1.0
    best_nll = math.inf

    for temp in np.arange(0.5, 2.01, 0.01):
        current = nll(logits, labels, float(temp))
        if current < best_nll:
            best_nll = current
            best_temp = float(temp)

    write_json(Path(args.out_file), {"temperature": best_temp, "val_nll": best_nll})
    print({"temperature": best_temp, "val_nll": best_nll})


if __name__ == "__main__":
    main()
