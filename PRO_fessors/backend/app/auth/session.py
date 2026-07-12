from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.config import Settings
from app.domain import AuthMode


class SessionTokenError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Principal:
    payment_credential: str
    address: str
    network: str
    auth_mode: AuthMode


def issue_session_token(principal: Principal, settings: Settings) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": principal.payment_credential,
        "address": principal.address,
        "network": principal.network,
        "auth_mode": principal.auth_mode.value,
        "iat": now,
        "exp": now + timedelta(seconds=settings.session_ttl_seconds),
        "iss": "probx",
        "aud": "probx-api",
    }
    return jwt.encode(payload, settings.auth_secret, algorithm="HS256")


def decode_session_token(token: str, settings: Settings) -> Principal:
    try:
        payload = jwt.decode(
            token,
            settings.auth_secret,
            algorithms=["HS256"],
            issuer="probx",
            audience="probx-api",
            options={"require": ["sub", "exp", "iat", "address", "network", "auth_mode"]},
        )
        return Principal(
            payment_credential=str(payload["sub"]),
            address=str(payload["address"]),
            network=str(payload["network"]),
            auth_mode=AuthMode(str(payload["auth_mode"])),
        )
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise SessionTokenError("invalid or expired session token") from exc
