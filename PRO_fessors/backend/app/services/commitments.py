from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Mapping
from typing import Any


def canonical_json(value: Mapping[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(value: str | bytes) -> str:
    raw = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(raw).hexdigest()


def terms_hash(terms: Mapping[str, Any]) -> str:
    return sha256_hex(canonical_json(terms))


def forecast_message(market_id: str, payment_credential: str, outcome: str) -> str:
    return canonical_json(
        {
            "action": "PROBX_OPENING_FORECAST",
            "market_id": market_id,
            "network": "preprod",
            "outcome": outcome,
            "payment_credential": payment_credential,
            "spending_authorization": False,
            "version": 1,
        }
    )


def forecast_leaf(
    *,
    market_id: str,
    payment_credential: str,
    outcome: str,
    cose_sign1: str,
    cose_key: str,
    verification_mode: str,
) -> str:
    return sha256_hex(
        canonical_json(
            {
                "cose_key": cose_key,
                "cose_sign1": cose_sign1,
                "market_id": market_id,
                "outcome": outcome,
                "payment_credential": payment_credential,
                "verification_mode": verification_mode,
            }
        )
    )


def merkle_root(leaves: Iterable[str]) -> str:
    level = [bytes.fromhex(leaf) for leaf in leaves]
    if not level:
        return hashlib.sha256(b"").hexdigest()
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [
            hashlib.sha256(level[index] + level[index + 1]).digest()
            for index in range(0, len(level), 2)
        ]
    return level[0].hex()


def bounded_opening_probability(yes_count: int, total: int = 100) -> int:
    if total != 100:
        raise ValueError("opening probability requires exactly 100 forecasts")
    return max(1, min(99, yes_count))


def slugify(statement: str, suffix: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", statement.lower()).strip("-")[:140]
    return f"{base or 'market'}-{suffix[:8]}"
