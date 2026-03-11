from __future__ import annotations

import argparse
from pathlib import Path

from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    ort_model = ORTModelForSequenceClassification.from_pretrained(
        str(model_dir),
        export=True,
    )
    ort_model.save_pretrained(str(out_dir))

    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
    tokenizer.save_pretrained(str(out_dir))

    print(f"Exported ONNX model to {out_dir}")


if __name__ == "__main__":
    main()
