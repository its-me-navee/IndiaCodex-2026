import pytest
from pydantic import ValidationError

from app.config import Settings


def test_csv_environment_lists_are_parsed_before_validation(monkeypatch) -> None:
    monkeypatch.setenv(
        "PROBX_ALLOWED_ORIGINS",
        "http://localhost:5173,https://demo.probx.example",
    )
    monkeypatch.setenv(
        "PROBX_ADMIN_PAYMENT_CREDENTIAL",
        "admin-one",
    )

    settings = Settings(_env_file=None)

    assert settings.allowed_origins == [
        "http://localhost:5173",
        "https://demo.probx.example",
    ]
    assert settings.admin_payment_credential == "admin-one"


def test_multiple_admin_payment_credentials_are_rejected(monkeypatch) -> None:
    monkeypatch.setenv(
        "PROBX_ADMIN_PAYMENT_CREDENTIAL",
        "admin-one,admin-two",
    )

    with pytest.raises(ValidationError, match="one admin payment credential"):
        Settings(_env_file=None)


def test_five_script_addresses_are_loaded_and_empty_values_are_unconfigured(monkeypatch) -> None:
    monkeypatch.setenv("PROBX_MARKET_LIFECYCLE_SCRIPT_ADDRESS", " addr_test1lifecycle ")
    monkeypatch.setenv("PROBX_MARKET_SCRIPT_ADDRESS", "addr_test1trading")
    monkeypatch.setenv("PROBX_MARKET_SETTLEMENT_SCRIPT_ADDRESS", "addr_test1settlement")
    monkeypatch.setenv("PROBX_LIQUIDITY_SCRIPT_ADDRESS", "  ")
    monkeypatch.setenv("PROBX_POSITION_SCRIPT_ADDRESS", "addr_test1position")

    settings = Settings(_env_file=None)

    assert settings.market_lifecycle_script_address == "addr_test1lifecycle"
    assert settings.market_script_address == "addr_test1trading"
    assert settings.market_settlement_script_address == "addr_test1settlement"
    assert settings.liquidity_script_address is None
    assert settings.position_script_address == "addr_test1position"
