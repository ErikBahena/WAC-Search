# intent-v1 model assets

This directory is reserved for the exported ONNX intent classifier.

Expected files after running the ML export pipeline:

- `model.onnx`
- `tokenizer.json`
- `manifest.json`

`manifest.json` is currently generated with `"ready": false` until `ml:quantize` writes a production-ready model.
