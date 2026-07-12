from __future__ import annotations

from typing import Protocol
from urllib.parse import quote

import httpx


class BlockfrostUpstreamError(RuntimeError):
    """A sanitized Blockfrost failure that never includes the project key."""


class AsyncBlockfrostClient(Protocol):
    async def address_observed(self, address: str) -> bool:
        """Return whether Blockfrost has transaction history for an address."""


class HttpBlockfrostClient:
    def __init__(self, *, base_url: str, project_id: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=f"{base_url.rstrip('/')}/",
            headers={"project_id": project_id},
            timeout=httpx.Timeout(5.0),
        )

    async def address_observed(self, address: str) -> bool:
        path = f"addresses/{quote(address, safe='')}/transactions"
        try:
            response = await self._client.get(path, params={"count": 1, "page": 1, "order": "desc"})
        except httpx.HTTPError as exc:
            raise BlockfrostUpstreamError("Blockfrost request failed") from exc

        if response.status_code == 404:
            return False
        if response.status_code != 200:
            raise BlockfrostUpstreamError(f"Blockfrost returned HTTP {response.status_code}")
        try:
            transactions = response.json()
        except ValueError as exc:
            raise BlockfrostUpstreamError("Blockfrost returned invalid JSON") from exc
        if not isinstance(transactions, list):
            raise BlockfrostUpstreamError("Blockfrost returned an unexpected response")
        return bool(transactions)

    async def aclose(self) -> None:
        await self._client.aclose()
