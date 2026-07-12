from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AdminPrincipal, CurrentPrincipal
from app.db import get_session
from app.domain import DraftStatus, MarketStatus
from app.models import Market, MarketDraft
from app.schemas import MarketDraftCreate, MarketDraftRead, MarketDraftReview
from app.services.commitments import slugify, terms_hash
from app.services.events import add_outbox_event, publish_committed_event

router = APIRouter(prefix="/market-drafts", tags=["market drafts"])
Session = Annotated[AsyncSession, Depends(get_session)]


async def _draft_read(session: AsyncSession, draft: MarketDraft) -> MarketDraftRead:
    market_id = await session.scalar(select(Market.id).where(Market.draft_id == draft.id))
    result = MarketDraftRead.model_validate(draft)
    return result.model_copy(update={"market_id": market_id})


@router.get("", response_model=list[MarketDraftRead])
async def list_drafts(
    session: Session,
    principal: CurrentPrincipal,
    request: Request,
    draft_status: Annotated[DraftStatus | None, Query(alias="status")] = None,
) -> list[MarketDraftRead]:
    settings = request.app.state.settings
    query = select(MarketDraft).order_by(MarketDraft.created_at.desc())
    if principal.payment_credential != settings.admin_payment_credential:
        query = query.where(MarketDraft.creator_payment_credential == principal.payment_credential)
    if draft_status is not None:
        query = query.where(MarketDraft.status == draft_status.value)
    drafts = (await session.scalars(query)).all()
    return [await _draft_read(session, draft) for draft in drafts]


@router.post("", response_model=MarketDraftRead, status_code=status.HTTP_201_CREATED)
async def create_draft(
    payload: MarketDraftCreate,
    session: Session,
    principal: CurrentPrincipal,
    request: Request,
) -> MarketDraftRead:
    draft = MarketDraft(
        creator_payment_credential=principal.payment_credential,
        statement=payload.statement.strip(),
        category=payload.category.strip(),
        trading_deadline=payload.trading_deadline,
        resolution_deadline=payload.resolution_deadline,
        yes_criteria=payload.yes_criteria.strip(),
        primary_source=payload.primary_source.strip(),
        backup_source=payload.backup_source.strip() if payload.backup_source else None,
        invalid_market_rule=payload.invalid_market_rule.strip(),
        status=DraftStatus.PENDING.value,
    )
    session.add(draft)
    await session.flush()
    event = await add_outbox_event(
        session,
        topic="markets",
        event_type="market_draft.created",
        aggregate_id=draft.id,
        payload={"draft_id": draft.id, "status": draft.status, "category": draft.category},
    )
    await session.commit()
    await publish_committed_event(request, event)
    return await _draft_read(session, draft)


@router.post("/{draft_id}/review", response_model=MarketDraftRead)
async def review_draft(
    draft_id: str,
    payload: MarketDraftReview,
    session: Session,
    principal: AdminPrincipal,
    request: Request,
) -> MarketDraftRead:
    draft = await session.scalar(
        select(MarketDraft).where(MarketDraft.id == draft_id).with_for_update()
    )
    if draft is None:
        raise HTTPException(status_code=404, detail="market draft not found")
    if draft.status in {DraftStatus.APPROVED.value, DraftStatus.REJECTED.value}:
        raise HTTPException(status_code=409, detail="draft already has a terminal review")

    draft.status = payload.decision.value
    draft.review_note = payload.review_note.strip()
    draft.reviewed_by = principal.payment_credential
    draft.reviewed_at = datetime.now(UTC)
    draft.normalized_statement = (
        payload.normalized_statement.strip() if payload.normalized_statement else draft.statement
    )
    draft.normalized_yes_criteria = (
        payload.normalized_yes_criteria.strip()
        if payload.normalized_yes_criteria
        else draft.yes_criteria
    )
    draft.normalized_primary_source = (
        payload.normalized_primary_source.strip()
        if payload.normalized_primary_source
        else draft.primary_source
    )

    market: Market | None = None
    if payload.decision is DraftStatus.APPROVED:
        immutable_terms = {
            "backup_source": draft.backup_source,
            "category": draft.category,
            "creator_payment_credential": draft.creator_payment_credential,
            "invalid_market_rule": draft.invalid_market_rule,
            "primary_source": draft.normalized_primary_source,
            "resolution_deadline": draft.resolution_deadline.isoformat(),
            "statement": draft.normalized_statement,
            "trading_deadline": draft.trading_deadline.isoformat(),
            "yes_criteria": draft.normalized_yes_criteria,
        }
        market = Market(
            draft_id=draft.id,
            slug=slugify(draft.normalized_statement, draft.id),
            creator_payment_credential=draft.creator_payment_credential,
            statement=draft.normalized_statement,
            category=draft.category,
            trading_deadline=draft.trading_deadline,
            resolution_deadline=draft.resolution_deadline,
            yes_criteria=draft.normalized_yes_criteria,
            primary_source=draft.normalized_primary_source,
            backup_source=draft.backup_source,
            invalid_market_rule=draft.invalid_market_rule,
            terms_hash=terms_hash(immutable_terms),
            status=MarketStatus.PRICE_DISCOVERY.value,
            minimum_liquidity_lovelace=payload.minimum_liquidity_lovelace,
        )
        session.add(market)
        await session.flush()

    event = await add_outbox_event(
        session,
        topic="markets",
        event_type="market_draft.reviewed",
        aggregate_id=draft.id,
        payload={
            "draft_id": draft.id,
            "market_id": market.id if market else None,
            "status": draft.status,
        },
    )
    await session.commit()
    await publish_committed_event(request, event)
    return await _draft_read(session, draft)
