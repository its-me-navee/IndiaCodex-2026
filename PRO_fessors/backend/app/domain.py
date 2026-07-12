from enum import StrEnum


class DraftStatus(StrEnum):
    PENDING = "PENDING"
    NEEDS_CHANGES = "NEEDS_CHANGES"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class MarketStatus(StrEnum):
    PRICE_DISCOVERY = "PRICE_DISCOVERY"
    FUNDING = "FUNDING"
    TRADING = "TRADING"
    CLOSED = "CLOSED"
    RESOLVED = "RESOLVED"
    VOIDED = "VOIDED"


class BinaryOutcome(StrEnum):
    YES = "YES"
    NO = "NO"


class ResolutionOutcome(StrEnum):
    YES = "YES"
    NO = "NO"
    VOID = "VOID"


class PositionStatus(StrEnum):
    OPEN = "OPEN"
    CASHED_OUT = "CASHED_OUT"
    WON = "WON"
    LOST = "LOST"
    VOID_REFUNDED = "VOID_REFUNDED"


class ChainTransactionStatus(StrEnum):
    NOT_SUBMITTED = "NOT_SUBMITTED"
    SUBMITTED = "SUBMITTED"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"


class AuthMode(StrEnum):
    CIP8 = "cip8"
    DEMO = "demo"
    SIMULATION = "simulation"


class TransactionIntent(StrEnum):
    ACTIVATE = "activate"
    FINALIZE_OPENING = "finalize_opening"
    BUY_POSITION = "buy_position"
    CASH_OUT = "cash_out"
    RESOLVE = "resolve"
    VOID = "void"
    LIQUIDITY_DEPOSIT = "liquidity_deposit"
    LIQUIDITY_REDEEM = "liquidity_redeem"
