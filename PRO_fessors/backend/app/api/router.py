from fastapi import APIRouter

from app.api import auth, deployment, drafts, health, markets, projections, transactions, websockets

router = APIRouter()
router.include_router(health.router)
router.include_router(deployment.router)
router.include_router(auth.router)
router.include_router(drafts.router)
router.include_router(markets.router)
router.include_router(projections.router)
router.include_router(transactions.router)
router.include_router(websockets.router)
