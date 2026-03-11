from __future__ import annotations

import json
import os
import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "public" / "data"
ML_DIR = PROJECT_ROOT / "ml"
ML_DATA_DIR = ML_DIR / "data"
ML_ARTIFACTS_DIR = ML_DIR / "artifacts"
INTENT_ALIASES_PATH = PROJECT_ROOT / "src" / "lib" / "intent-aliases.json"

RANDOM_SEED = 42


def seed_everything(seed: int = RANDOM_SEED) -> None:
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().strip())


def dedupe_rows(rows: list[dict[str, Any]], text_key: str, label_key: str) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        text = normalize_text(str(row[text_key]))
        label = str(row[label_key])
        key = (text, label)
        if key in seen:
            continue
        seen.add(key)
        row[text_key] = text
        out.append(row)
    return out


@dataclass
class AnswerBankRecord:
    qaId: str
    question: str
    answer: str
    sectionId: str
    sectionTitle: str
    url: str


def load_answer_bank() -> list[AnswerBankRecord]:
    payload = load_json(DATA_DIR / "intent-answer-bank.v1.json")
    return [AnswerBankRecord(**row) for row in payload]


def load_intent_aliases() -> dict[str, str]:
    if not INTENT_ALIASES_PATH.exists():
        return {}
    payload = load_json(INTENT_ALIASES_PATH)
    return {
        str(key): str(value)
        for key, value in dict(payload.get("canonicalByQaId", {})).items()
    }
