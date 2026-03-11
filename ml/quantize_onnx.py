from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from onnxruntime.quantization import QuantType, quantize_dynamic


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx-dir", required=True)
    parser.add_argument("--label-map", required=True)
    parser.add_argument("--calibration", required=True)
    parser.add_argument("--public-model-dir", required=True)
    parser.add_argument("--max-size-mb", type=float, default=25.0)
    parser.add_argument("--min-confidence", type=float, default=0.1)
    parser.add_argument("--min-margin", type=float, default=0.15)
    args = parser.parse_args()

    onnx_dir = Path(args.onnx_dir)
    public_model_dir = Path(args.public_model_dir)
    public_model_dir.mkdir(parents=True, exist_ok=True)

    source_model = onnx_dir / "model.onnx"
    if not source_model.exists():
        candidates = list(onnx_dir.glob("*.onnx"))
        if not candidates:
            raise SystemExit(f"No ONNX model found in {onnx_dir}")
        source_model = candidates[0]

    output_model = public_model_dir / "model.onnx"
    quantize_dynamic(
        model_input=str(source_model),
        model_output=str(output_model),
        weight_type=QuantType.QInt8,
    )

    tokenizer_src = onnx_dir / "tokenizer.json"
    if tokenizer_src.exists():
        shutil.copy2(tokenizer_src, public_model_dir / "tokenizer.json")

    # Also copy tokenizer config files if present for transformers.js compatibility.
    for name in ["tokenizer_config.json", "special_tokens_map.json", "config.json"]:
        src = onnx_dir / name
        if src.exists():
            shutil.copy2(src, public_model_dir / name)

    label_map = json.loads(Path(args.label_map).read_text(encoding="utf-8"))
    calibration = json.loads(Path(args.calibration).read_text(encoding="utf-8"))
    labels = label_map.get("labels", [])

    manifest = {
        "version": "v1",
        "ready": True,
        "modelPath": "/models/intent-v1",
        "labels": labels,
        "temperature": float(calibration.get("temperature", 1.0)),
        "thresholds": {
            "minConfidence": float(args.min_confidence),
            "minMargin": float(args.min_margin),
        },
    }
    (public_model_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    size_mb = output_model.stat().st_size / (1024 * 1024)
    print(f"Quantized model size: {size_mb:.2f} MB")
    if size_mb > args.max_size_mb:
        raise SystemExit(
            f"Quantized model exceeds limit: {size_mb:.2f} MB > {args.max_size_mb:.2f} MB"
        )


if __name__ == "__main__":
    main()
