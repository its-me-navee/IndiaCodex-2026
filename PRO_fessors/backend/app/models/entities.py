from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.domain import (
    AuthMode,
    BinaryOutcome,
    ChainTransactionStatus,
    DraftStatus,
    MarketStatus,
    PositionStatus,
    ResolutionOutcome,
)


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class Wallet(Base, TimestampMixin):
    __tablename__ = "wallets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    payment_credential: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    address: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    network: Mapped[str] = mapped_column(String(16), default="preprod")
    auth_mode: Mapped[str] = mapped_column(String(16), default=AuthMode.CIP8.value)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    last_authenticated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WalletChallenge(Base):
    __tablename__ = "wallet_challenges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    address: Mapped[str] = mapped_column(String(255), index=True)
    network: Mapped[str] = mapped_column(String(16))
    nonce_hash: Mapped[str] = mapped_column(String(64), unique=True)
    message: Mapped[str] = mapped_column(Text)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MarketDraft(Base, TimestampMixin):
    __tablename__ = "market_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    creator_payment_credential: Mapped[str] = mapped_column(String(64), index=True)
    statement: Mapped[str] = mapped_column(String(280))
    category: Mapped[str] = mapped_column(String(64), index=True)
    trading_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolution_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    yes_criteria: Mapped[str] = mapped_column(Text)
    primary_source: Mapped[str] = mapped_column(String(1024))
    backup_source: Mapped[str | None] = mapped_column(String(1024))
    invalid_market_rule: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default=DraftStatus.PENDING.value, index=True)
    normalized_statement: Mapped[str | None] = mapped_column(String(280))
    normalized_yes_criteria: Mapped[str | None] = mapped_column(Text)
    normalized_primary_source: Mapped[str | None] = mapped_column(String(1024))
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(64))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    market: Mapped[Market | None] = relationship(back_populates="draft", uselist=False)


class Market(Base, TimestampMixin):
    __tablename__ = "markets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    draft_id: Mapped[str | None] = mapped_column(
        ForeignKey("market_drafts.id", ondelete="SET NULL"), unique=True
    )
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    creator_payment_credential: Mapped[str] = mapped_column(String(64), index=True)
    statement: Mapped[str] = mapped_column(String(280))
    category: Mapped[str] = mapped_column(String(64), index=True)
    trading_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    resolution_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    yes_criteria: Mapped[str] = mapped_column(Text)
    primary_source: Mapped[str] = mapped_column(String(1024))
    backup_source: Mapped[str | None] = mapped_column(String(1024))
    invalid_market_rule: Mapped[str] = mapped_column(Text)
    terms_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(
        String(24), default=MarketStatus.PRICE_DISCOVERY.value, index=True
    )
    is_simulation: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    opening_yes_count: Mapped[int] = mapped_column(Integer, default=0)
    opening_no_count: Mapped[int] = mapped_column(Integer, default=0)
    opening_poll_root: Mapped[str | None] = mapped_column(String(64))
    yes_probability: Mapped[int | None] = mapped_column(Integer)

    liquidity_lovelace: Mapped[int] = mapped_column(BigInteger, default=0)
    minimum_liquidity_lovelace: Mapped[int] = mapped_column(BigInteger, default=100_000_000)
    user_collateral_lovelace: Mapped[int] = mapped_column(BigInteger, default=0)
    volume_lovelace: Mapped[int] = mapped_column(BigInteger, default=0)
    lp_fees_lovelace: Mapped[int] = mapped_column(BigInteger, default=0)
    yes_liability_lovelace: Mapped[int] = mapped_column(BigInteger, default=0)
    no_liability_lovelace: Mapped[int] = mapped_column(BigInteger, default=0)
    resolution_outcome: Mapped[str | None] = mapped_column(String(8))
    evidence_uri: Mapped[str | None] = mapped_column(String(1024))
    chain_state_reference: Mapped[str | None] = mapped_column(String(255))

    draft: Mapped[MarketDraft | None] = relationship(back_populates="market")
    forecasts: Mapped[list[OpeningForecast]] = relationship(
        back_populates="market", cascade="all, delete-orphan"
    )
    events: Mapped[list[MarketEvent]] = relationship(
        back_populates="market", cascade="all, delete-orphan"
    )
    liquidity_contributions: Mapped[list[LiquidityContribution]] = relationship(
        back_populates="market", cascade="all, delete-orphan"
    )
    positions: Mapped[list[Position]] = relationship(
        back_populates="market", cascade="all, delete-orphan"
    )

    @property
    def opening_forecast_count(self) -> int:
        return self.opening_yes_count + self.opening_no_count

    @property
    def simulation(self) -> bool:
        return self.is_simulation

    @property
    def available_liquidity_lovelace(self) -> int:
        worst_case = max(self.yes_liability_lovelace, self.no_liability_lovelace)
        return self.liquidity_lovelace + self.user_collateral_lovelace - worst_case

    @property
    def yes_rule(self) -> str:
        return self.yes_criteria

    @property
    def invalid_rule(self) -> str:
        return self.invalid_market_rule

    @property
    def creator(self) -> str:
        return self.creator_payment_credential


class OpeningForecast(Base):
    __tablename__ = "opening_forecasts"
    __table_args__ = (
        UniqueConstraint(
            "market_id", "payment_credential", name="uq_opening_forecast_market_wallet"
        ),
        Index("ix_opening_forecasts_market_created", "market_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    market_id: Mapped[str] = mapped_column(ForeignKey("markets.id", ondelete="CASCADE"), index=True)
    payment_credential: Mapped[str] = mapped_column(String(64), index=True)
    outcome: Mapped[str] = mapped_column(String(3))
    signed_message: Mapped[str] = mapped_column(Text)
    cose_sign1: Mapped[str] = mapped_column(Text)
    cose_key: Mapped[str] = mapped_column(Text)
    verification_mode: Mapped[str] = mapped_column(String(16), default=AuthMode.CIP8.value)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    leaf_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    market: Mapped[Market] = relationship(back_populates="forecasts")


class MarketEvent(Base):
    __tablename__ = "market_events"
    __table_args__ = (Index("ix_market_events_market_recorded", "market_id", "recorded_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    market_id: Mapped[str] = mapped_column(ForeignKey("markets.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(48), index=True)
    yes_probability: Mapped[int | None] = mapped_column(Integer)
    volume_delta_lovelace: Mapped[int] = mapped_column(BigInteger, default=0)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    chain_tx_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    market: Mapped[Market] = relationship(back_populates="events")


class LiquidityContribution(Base):
    __tablename__ = "liquidity_contributions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    market_id: Mapped[str] = mapped_column(ForeignKey("markets.id", ondelete="CASCADE"), index=True)
    owner_payment_credential: Mapped[str] = mapped_column(String(64), index=True)
    amount_lovelace: Mapped[int] = mapped_column(BigInteger)
    lp_units: Mapped[int] = mapped_column(BigInteger)
    receipt_reference: Mapped[str | None] = mapped_column(String(255))
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    market: Mapped[Market] = relationship(back_populates="liquidity_contributions")


class Position(Base, TimestampMixin):
    __tablename__ = "positions"
    __table_args__ = (Index("ix_positions_owner_status", "owner_payment_credential", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    market_id: Mapped[str] = mapped_column(ForeignKey("markets.id", ondelete="CASCADE"), index=True)
    owner_payment_credential: Mapped[str] = mapped_column(String(64), index=True)
    outcome: Mapped[str] = mapped_column(String(3))
    shares: Mapped[int] = mapped_column(BigInteger)
    amount_paid_lovelace: Mapped[int] = mapped_column(BigInteger)
    entry_probability: Mapped[int] = mapped_column(Integer)
    maximum_payout_lovelace: Mapped[int] = mapped_column(BigInteger)
    estimated_value_lovelace: Mapped[int] = mapped_column(BigInteger)
    realized_pnl_lovelace: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[str] = mapped_column(String(24), default=PositionStatus.OPEN.value, index=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    position_reference: Mapped[str | None] = mapped_column(String(255))

    market: Mapped[Market] = relationship(back_populates="positions")


class ChainTransaction(Base, TimestampMixin):
    __tablename__ = "chain_transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tx_hash: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    intent: Mapped[str] = mapped_column(String(32), index=True)
    market_id: Mapped[str | None] = mapped_column(String(36), index=True)
    submitted_by: Mapped[str | None] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(
        String(24), default=ChainTransactionStatus.NOT_SUBMITTED.value, index=True
    )
    payload_hash: Mapped[str] = mapped_column(String(64), unique=True)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    block_height: Mapped[int | None] = mapped_column(BigInteger)


class Resolution(Base, TimestampMixin):
    __tablename__ = "resolutions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    market_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    outcome: Mapped[str] = mapped_column(String(8), default=ResolutionOutcome.VOID.value)
    evidence_uri: Mapped[str] = mapped_column(String(1024))
    quorum_reached: Mapped[bool] = mapped_column(Boolean, default=False)
    resolver_signatures: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class SimulationState(Base):
    __tablename__ = "simulation_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    virtual_personas: Mapped[int] = mapped_column(Integer, default=10_000)
    random_seed: Mapped[int] = mapped_column(Integer)
    generated_actions: Mapped[int] = mapped_column(BigInteger, default=0)
    accepted_actions: Mapped[int] = mapped_column(BigInteger, default=0)
    rejected_actions: Mapped[int] = mapped_column(BigInteger, default=0)
    real_preprod_transactions: Mapped[int] = mapped_column(Integer, default=0)
    last_tick_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    strategies: Mapped[dict[str, int]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic: Mapped[str] = mapped_column(String(32), index=True)
    event_type: Mapped[str] = mapped_column(String(48))
    aggregate_id: Mapped[str | None] = mapped_column(String(64), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# Keep enum imports reachable for migration/type inspection without database-native enums.
_ENUM_REFERENCES = (BinaryOutcome, DraftStatus, MarketStatus, ResolutionOutcome)
