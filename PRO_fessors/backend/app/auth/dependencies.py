from __future__ import annotations

import hmac
from typing import Annotated, cast

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.session import Principal, SessionTokenError, decode_session_token
from app.config import Settings
from app.domain import AuthMode

bearer = HTTPBearer(auto_error=False)


def settings_from_request(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


async def current_principal(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    demo_wallet: Annotated[str | None, Header(alias="X-Demo-Wallet")] = None,
) -> Principal:
    settings = settings_from_request(request)
    if credentials is not None:
        try:
            return decode_session_token(credentials.credentials, settings)
        except SessionTokenError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    if settings.allow_demo_auth and demo_wallet:
        return Principal(
            payment_credential=demo_wallet,
            address=f"demo:{demo_wallet}",
            network="preprod",
            auth_mode=AuthMode.DEMO,
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="wallet session required; X-Demo-Wallet works only when demo auth is enabled",
    )


async def admin_principal(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    demo_wallet: Annotated[str | None, Header(alias="X-Demo-Wallet")] = None,
    admin_key: Annotated[str | None, Header(alias="X-Admin-Key")] = None,
) -> Principal:
    settings = settings_from_request(request)
    principal: Principal | None = None
    if credentials is not None:
        try:
            principal = decode_session_token(credentials.credentials, settings)
        except SessionTokenError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    elif (
        settings.allow_demo_auth
        and admin_key
        and hmac.compare_digest(admin_key, settings.demo_admin_key)
    ):
        principal = Principal(
            payment_credential=demo_wallet or "demo-admin",
            address="demo:admin",
            network="preprod",
            auth_mode=AuthMode.DEMO,
        )
    if principal is None or principal.payment_credential != settings.admin_payment_credential:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin wallet required")
    return principal


CurrentPrincipal = Annotated[Principal, Depends(current_principal)]
AdminPrincipal = Annotated[Principal, Depends(admin_principal)]
