from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="PROBX_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "ProbX API"
    environment: str = "development"
    debug: bool = False
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    database_url: str = "postgresql+asyncpg://probx:probx@localhost:5432/probx"
    redis_url: str | None = "redis://localhost:6379/0"
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )
    auto_create_schema: bool = False
    seed_demo_data: bool = False

    cardano_network: str = "preprod"
    cardano_network_id: int = 0
    blockfrost_base_url: str = "https://cardano-preprod.blockfrost.io/api/v0"
    blockfrost_project_id: str | None = None
    market_lifecycle_script_address: str | None = None
    market_script_address: str | None = None
    market_settlement_script_address: str | None = None
    liquidity_script_address: str | None = None
    position_script_address: str | None = None

    auth_domain: str = "localhost"
    auth_secret: str = "local-insecure-probx-secret-change-me"
    challenge_ttl_seconds: int = 300
    session_ttl_seconds: int = 900
    allow_demo_auth: bool = False
    demo_admin_key: str = "local-demo-admin-only"
    admin_payment_credential: str = "demo-admin"

    liquidity_fee_bps: int = 100
    default_minimum_liquidity_lovelace: int = 100_000_000
    payload_ttl_seconds: int = 300
    websocket_heartbeat_seconds: float = 20.0

    simulation_personas: int = 10_000
    simulation_seed: int = 260_712
    simulation_real_tx_limit: int = 0

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_csv_or_json_list(cls, value: Any) -> Any:
        if value is None or isinstance(value, list):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                return json.loads(stripped)
            return [part.strip() for part in stripped.split(",") if part.strip()]
        return value

    @field_validator("admin_payment_credential")
    @classmethod
    def exactly_one_admin_payment_credential(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("exactly one admin payment credential is required")
        if "," in normalized:
            raise ValueError("configure one admin payment credential, not a resolver list")
        return normalized

    @field_validator(
        "market_lifecycle_script_address",
        "market_script_address",
        "market_settlement_script_address",
        "liquidity_script_address",
        "position_script_address",
        mode="before",
    )
    @classmethod
    def empty_script_address_is_unconfigured(cls, value: Any) -> Any:
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @field_validator("cardano_network")
    @classmethod
    def preprod_only(cls, value: str) -> str:
        normalized = value.lower().strip()
        if normalized != "preprod":
            raise ValueError("ProbX is a preprod-only MVP; mainnet is not supported")
        return normalized

    @field_validator("liquidity_fee_bps")
    @classmethod
    def fixed_liquidity_fee(cls, value: int) -> int:
        if value != 100:
            raise ValueError("The MVP contract model fixes the LP fee at exactly 1% (100 bps)")
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
