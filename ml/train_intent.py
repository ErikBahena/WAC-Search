from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from datasets import Dataset
from sklearn.metrics import f1_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

from common import ML_ARTIFACTS_DIR, ML_DATA_DIR, read_jsonl, seed_everything, write_json


class WeightedTrainer(Trainer):
    def __init__(self, class_weights: torch.Tensor, label_smoothing: float, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights
        self.label_smoothing = label_smoothing

    def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.get("logits")
        loss = torch.nn.functional.cross_entropy(
            logits,
            labels,
            weight=self.class_weights.to(logits.device),
            label_smoothing=self.label_smoothing,
        )
        return (loss, outputs) if return_outputs else loss


def load_split(path: Path) -> list[dict]:
    rows = read_jsonl(path)
    if not rows:
        raise RuntimeError(f"Missing split file: {path}")
    return rows


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=1)
    macro_f1 = f1_score(labels, preds, average="macro")
    return {"macro_f1": float(macro_f1)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-name", default="prajjwal1/bert-mini")
    parser.add_argument("--data-dir", default=str(ML_DATA_DIR))
    parser.add_argument("--out-dir", default=str(ML_ARTIFACTS_DIR / "intent-v1"))
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--grad-accum", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=3e-5)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--label-smoothing", type=float, default=0.05)
    parser.add_argument("--max-length", type=int, default=48)
    parser.add_argument("--ood-weight-mult", type=float, default=1.0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    seed_everything(args.seed)
    data_dir = Path(args.data_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    train_rows = load_split(data_dir / "train.jsonl")
    val_rows = load_split(data_dir / "val.jsonl")
    test_rows = load_split(data_dir / "test.jsonl")

    labels = sorted({row["label"] for row in train_rows + val_rows + test_rows})
    label2id = {label: idx for idx, label in enumerate(labels)}
    id2label = {idx: label for label, idx in label2id.items()}

    def convert_rows(rows: list[dict]) -> dict:
        return {
            "text": [row["text"] for row in rows],
            "label": [label2id[row["label"]] for row in rows],
        }

    train_ds = Dataset.from_dict(convert_rows(train_rows))
    val_ds = Dataset.from_dict(convert_rows(val_rows))
    test_ds = Dataset.from_dict(convert_rows(test_rows))

    tokenizer = AutoTokenizer.from_pretrained(args.model_name)

    def preprocess(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            padding="max_length",
            max_length=args.max_length,
        )

    train_ds = train_ds.map(preprocess, batched=True)
    val_ds = val_ds.map(preprocess, batched=True)
    test_ds = test_ds.map(preprocess, batched=True)

    train_ds = train_ds.remove_columns(["text"])
    val_ds = val_ds.remove_columns(["text"])
    test_ds = test_ds.remove_columns(["text"])

    train_ds.set_format("torch")
    val_ds.set_format("torch")
    test_ds.set_format("torch")

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=len(labels),
        label2id=label2id,
        id2label=id2label,
    )

    label_counts = Counter(row["label"] for row in train_rows)
    class_weights = []
    for label in labels:
        count = label_counts[label]
        weight = len(train_rows) / (len(labels) * max(1, count))
        if label == "NOT_COVERED":
            weight *= max(args.ood_weight_mult, 0.0)
        class_weights.append(weight)
    class_weights_t = torch.tensor(class_weights, dtype=torch.float32)

    training_args = TrainingArguments(
        output_dir=str(out_dir / "checkpoints"),
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        num_train_epochs=args.epochs,
        weight_decay=args.weight_decay,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_macro_f1",
        greater_is_better=True,
        seed=args.seed,
        logging_steps=50,
        report_to="none",
    )

    trainer = WeightedTrainer(
        class_weights=class_weights_t,
        label_smoothing=args.label_smoothing,
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    trainer.train()
    val_metrics = trainer.evaluate(val_ds)
    test_metrics = trainer.evaluate(test_ds)

    trainer.save_model(str(out_dir / "model"))
    tokenizer.save_pretrained(str(out_dir / "model"))

    write_json(out_dir / "label_map.json", {"labels": labels, "label2id": label2id, "id2label": id2label})
    write_json(out_dir / "metrics.json", {"val": val_metrics, "test": test_metrics})

    print(json.dumps({"val": val_metrics, "test": test_metrics}, indent=2))


if __name__ == "__main__":
    main()
