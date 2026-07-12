from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain import BinaryOutcome, DraftStatus, ResolutionOutcome


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ChallengeRequest(APIModel):
    address: str = Field(min_length=8, max_length=255)
    network: Literal["preprod"] = "preprod"


class ChallengeResponse(APIModel):
    challenge_id: str
    message: str
    expires_at: datetime
    verification_mode: Literal["cip8"] = "cip8"
    demo_fallback_enabled: bool
    demo_signature: str | None = None
    demo_warning: str | None = None


class VerifyRequest(APIModel):
    challenge_id: str
    address: str = Field(min_length=8, max_length=255)
    cose_sign1: str | None = None
    cose_key: str | None = None
    demo_signature: str | None = None

    @model_validator(mode="after")
    def signature_pair_or_demo(self) -> VerifyRequest:
        has_cip8 = bool(self.cose_sign1 and self.cose_key)
        if not has_cip8 and not self.demo_signature:
            raise ValueError("provide both cose_sign1 and cose_key, or an enabled demo signature")
        if bool(self.cose_sign1) != bool(self.cose_key):
            raise ValueError("cose_sign1 and cose_key must be provided together")
        return self


class WalletIdentity(APIModel):
    address: str
    payment_credential: str
    network: str


class VerifyResponse(APIModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    wallet: WalletIdentity
    auth_mode: Literal["cip8", "demo"]
    demo_warning: str | None = None


class MarketDraftCreate(APIModel):
    statement: str = Field(min_length=12, max_length=280)
    category: str = Field(min_length=2, max_length=64)
    trading_deadline: datetime
    resolution_deadline: datetime
    yes_criteria: str = Field(min_length=20, max_length=4000)
    primary_source: str = Field(min_length=8, max_length=1024)
    backup_source: str | None = Field(default=None, max_length=1024)
    invalid_market_rule: str = Field(min_length=12, max_length=4000)

    @model_validator(mode="after")
    def deadlines_are_ordered(self) -> MarketDraftCreate:
        trading = self.trading_deadline
        resolution = self.resolution_deadline
        if trading.tzinfo is None:
            trading = trading.replace(tzinfo=UTC)
        if resolution.tzinfo is None:
            resolution = resolution.replace(tzinfo=UTC)
        if trading <= datetime.now(UTC):
            raise ValueError("trading_deadline must be in the future")
        if resolution <= trading:
            raise ValueError("resolution_deadline must be after trading_deadline")
        return self


class MarketDraftReview(APIModel):
    decision: DraftStatus
    normalized_statement: str | None = Field(default=None, min_length=12, max_length=280)
    normalized_yes_criteria: str | None = Field(default=None, min_length=20, max_length=4000)
    normalized_primary_source: str | None = Field(default=None, min_length=8, max_length=1024)
    review_note: str = Field(min_length=3, max_length=4000)
    minimum_liquidity_lovelace: int = Field(default=100_000_000, ge=2_000_000)

    @model_validator(mode="after")
    def approved_terms_required(self) -> MarketDraftReview:
        if self.decision == DraftStatus.PENDING:
            raise ValueError("a review cannot return a draft to PENDING")
        return self


class MarketDraftRead(APIModel):
    id: str
    creator_payment_credential: str
    statement: str
    category: str
    trading_deadline: datetime
    resolution_deadline: datetime
    yes_criteria: str
    primary_source: str
    backup_source: str | None
    invalid_market_rule: str
    status: str
    normalized_statement: str | None
    normalized_yes_criteria: str | None
    normalized_primary_source: str | None
    review_note: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    market_id: str | None = None


class MarketSummary(APIModel):
    id: str
    slug: str
    statement: str
    category: str
    status: str
    opening_forecast_count: int
    opening_yes_count: int
    opening_no_count: int
    opening_poll_root: str | None
    yes_probability: int | None
    liquidity_lovelace: int
    minimum_liquidity_lovelace: int
    user_collateral_lovelace: int
    available_liquidity_lovelace: int
    yes_liability_lovelace: int
    no_liability_lovelace: int
    volume_lovelace: int
    trading_deadline: datetime
    resolution_deadline: datetime
    is_simulation: bool
    simulation: bool


class MarketDetail(MarketSummary):
    creator_payment_credential: str
    yes_criteria: str
    primary_source: str
    backup_source: str | None
    invalid_market_rule: str
    terms_hash: str
    lp_fees_lovelace: int
    resolution_outcome: str | None
    evidence_uri: str | None
    description: str = "Objective binary statement with market-specific Cardano preprod custody."
    yes_rule: str
    invalid_rule: str
    creator: str
    opening_confirmations: int = 0
    featured: bool = False
    chart: list[dict[str, Any]] = Field(default_factory=list)
    activity: list[dict[str, Any]] = Field(default_factory=list)
    custody_source_of_truth: Literal["cardano_preprod"] = "cardano_preprod"
    projection_notice: str = (
        "Off-chain values are projections; confirmed Cardano preprod state is authoritative."
    )


class MarketListResponse(APIModel):
    items: list[MarketSummary]
    total: int
    limit: int
    offset: int


class ChartPoint(APIModel):
    sequence: int
    recorded_at: datetime
    event_type: str
    yes_probability: int | None
    volume_delta_lovelace: int
    confirmed_on_chain: bool


class ChartResponse(APIModel):
    market_id: str
    points: list[ChartPoint]


class OpeningForecastMessageRequest(APIModel):
    outcome: BinaryOutcome


class OpeningForecastMessageResponse(APIModel):
    market_id: str
    payment_credential: str
    outcome: str
    message: str
    encoding: Literal["utf-8-hex"] = "utf-8-hex"
    payload_hex: str


class OpeningForecastCreate(APIModel):
    outcome: BinaryOutcome
    cose_sign1: str | None = None
    cose_key: str | None = None
    demo_signature: str | None = None

    @model_validator(mode="after")
    def signature_pair_or_demo(self) -> OpeningForecastCreate:
        if bool(self.cose_sign1) != bool(self.cose_key):
            raise ValueError("cose_sign1 and cose_key must be provided together")
        if not (self.cose_sign1 and self.cose_key) and not self.demo_signature:
            raise ValueError("a CIP-8 signature pair is required")
        return self


class OpeningForecastRead(APIModel):
    id: str
    market_id: str
    payment_credential: str
    outcome: str
    signed_message: str
    cose_sign1: str
    cose_key: str
    verification_mode: str
    is_simulated: bool
    leaf_hash: str
    created_at: datetime


class OpeningForecastListResponse(APIModel):
    market_id: str
    count: int
    required: Literal[100] = 100
    opening_yes_count: int
    opening_no_count: int
    opening_poll_root: str | None
    forecasts: list[OpeningForecastRead]


class LiquidityReceiptProjection(APIModel):
    id: str
    marketId: str
    statement: str
    depositedAda: float
    lpUnits: int
    poolShare: float
    estimatedValueAda: float
    feesEarnedAda: float
    status: Literal["LOCKED", "REDEEMABLE", "REDEEMED"]


class LiquidityProjection(APIModel):
    market_id: str
    status: str
    contributed_liquidity_lovelace: int
    minimum_liquidity_lovelace: int
    funding_shortfall_lovelace: int
    funding_progress_percent: float
    provider_count: int
    user_collateral_lovelace: int
    yes_liability_lovelace: int
    no_liability_lovelace: int
    worst_case_liability_lovelace: int
    projected_available_collateral_lovelace: int
    lp_fees_lovelace: int
    solvent_projection: bool
    lp_principal_protected: Literal[False] = False
    projection_notice: str
    marketId: str
    reserveAda: float
    minimumAda: float
    availableAda: float
    totalLpUnits: int
    providerCount: int
    feesEarnedAda: float
    feeBps: Literal[100] = 100
    yesLiabilityAda: float
    noLiabilityAda: float
    receipts: list[LiquidityReceiptProjection]


class PositionRead(APIModel):
    id: str
    market_id: str
    market_statement: str
    outcome: str
    shares: int
    amount_paid_lovelace: int
    entry_probability: int
    maximum_payout_lovelace: int
    estimated_value_lovelace: int
    realized_pnl_lovelace: int
    status: str
    is_simulated: bool
    marketId: str
    statement: str
    amountPaidAda: float
    entryProbability: float
    currentProbability: float
    estimatedValueAda: float
    maximumPayoutAda: float
    realizedPnlAda: float | None
    createdAt: datetime


class PortfolioResponse(APIModel):
    payment_credential: str
    open_exposure_lovelace: int
    estimated_value_lovelace: int
    realized_pnl_lovelace: int
    positions: list[PositionRead]
    wallet: str
    availableAda: float
    committedAda: float
    estimatedValueAda: float
    realizedPnlAda: float
    unrealizedPnlAda: float
    lpReceipts: list[LiquidityReceiptProjection]
    estimate_notice: str = (
        "Estimated value is an off-chain mark, not wallet value, until a transaction confirms."
    )


class LeaderboardEntry(APIModel):
    rank: int
    payment_credential: str
    display_credential: str
    realized_pnl_lovelace: int
    prediction_accuracy: float
    resolved_position_count: int
    wallet: str
    realizedPnlAda: float
    accuracy: float
    resolvedPositions: int
    volumeAda: float = 0.0
    streak: int = 0


class LeaderboardResponse(APIModel):
    entries: list[LeaderboardEntry]
    items: list[LeaderboardEntry]
    excludes_simulation: Literal[True] = True
    ranking_basis: Literal["realized_pnl_lovelace"] = "realized_pnl_lovelace"


class SimulationStrategyProjection(APIModel):
    name: str
    personas: int
    pnlAda: float = 0.0
    color: str


class SimulationStatusResponse(APIModel):
    active: bool
    clearly_labeled: Literal[True] = True
    off_chain: Literal[True] = True
    virtual_personas: int
    random_seed: int
    generated_actions: int
    accepted_actions: int
    rejected_actions: int
    real_preprod_transactions: int
    real_transaction_limit: int
    last_tick_at: datetime | None
    strategy_counts: dict[str, int]
    strategies: list[SimulationStrategyProjection]
    disclosure: str
    running: bool
    seed: int
    personas: int
    actionsPerMinute: int
    queuedActions: int
    backedTransactions: int
    databaseEvents: int
    websocketClients: int
    recentActions: list[dict[str, Any]] = Field(default_factory=list)


class SimulationTickRequest(APIModel):
    candidate_actions: int = Field(default=250, ge=1, le=10_000)


class SimulationTickResponse(APIModel):
    queued: bool
    job_id: str
    queue: Literal["probx-simulation"] = "probx-simulation"
    disclosure: str = "This job generates off-chain virtual actions, not Cardano transactions."


class PositionPayloadRequest(APIModel):
    outcome: BinaryOutcome
    amount_lovelace: int = Field(ge=2_000_000)
    expected_state_reference: str | None = None
    minimum_shares: int | None = Field(default=None, ge=1)


class CashoutPayloadRequest(APIModel):
    expected_state_reference: str | None = None
    minimum_proceeds_lovelace: int | None = Field(default=None, ge=0)


class ResolutionPayloadRequest(APIModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    outcome: ResolutionOutcome
    evidence_uri: str = Field(min_length=8, max_length=1024)
    admin_payment_credential: str = Field(min_length=1, max_length=64)


class LiquidityDepositPayloadRequest(APIModel):
    amount_lovelace: int = Field(ge=2_000_000)


class LiquidityRedeemPayloadRequest(APIModel):
    receipt_reference: str = Field(min_length=4, max_length=255)


class UnsignedTransactionPayload(APIModel):
    payload_id: str
    payload_hash: str
    intent: str
    market_id: str | None
    network: Literal["preprod"] = "preprod"
    status: Literal["UNSIGNED"] = "UNSIGNED"
    chain_status: Literal["NOT_SUBMITTED"] = "NOT_SUBMITTED"
    confirmation_status: Literal["NOT_OBSERVED"] = "NOT_OBSERVED"
    requires_wallet_signature: Literal[True] = True
    expires_at: datetime
    parameters: dict[str, Any]
    warning: str = (
        "Building parameters only. The backend has not submitted or confirmed a Cardano "
        "transaction."
    )


class HealthComponent(APIModel):
    status: Literal["up", "down", "disabled"]
    detail: str | None = None


class HealthResponse(APIModel):
    status: Literal["ok", "degraded"]
    service: str
    environment: str
    network: Literal["preprod"]
    testnet_only: Literal[True] = True
    database: HealthComponent
    redis: HealthComponent
    timestamp: datetime


class ScriptDeploymentStatus(APIModel):
    script: Literal[
        "market_lifecycle",
        "market",
        "market_settlement",
        "liquidity",
        "position",
    ]
    address: str | None
    configured: bool
    observation_status: Literal["NOT_CONFIGURED", "OBSERVED", "NOT_OBSERVED", "UNKNOWN"]
    observed: bool | None
    detail: str


class DeploymentStatusResponse(APIModel):
    network: Literal["preprod"]
    admin_payment_credential: str
    blockfrost_query_configured: bool
    scripts: list[ScriptDeploymentStatus]
    checked_at: datetime
    caveat: str = (
        "OBSERVED means Blockfrost found address transaction history. It does not prove a "
        "specific validator version, and configuration alone never means deployed."
    )
