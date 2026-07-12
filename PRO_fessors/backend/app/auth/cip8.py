from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any

import cbor2
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


class CIP8VerificationError(ValueError):
    """Raised when a CIP-8 COSE signature cannot be authenticated."""


@dataclass(frozen=True, slots=True)
class CIP8VerificationResult:
    payment_credential: str
    address_bytes: bytes
    public_key: bytes
    payload: bytes


_BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
_BECH32_REVERSE = {character: index for index, character in enumerate(_BECH32_CHARSET)}


def _bech32_polymod(values: list[int]) -> int:
    generators = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)
    checksum = 1
    for value in values:
        top = checksum >> 25
        checksum = ((checksum & 0x1FFFFFF) << 5) ^ value
        for index, generator in enumerate(generators):
            if (top >> index) & 1:
                checksum ^= generator
    return checksum


def _hrp_expand(hrp: str) -> list[int]:
    return [ord(char) >> 5 for char in hrp] + [0] + [ord(char) & 31 for char in hrp]


def _convert_bits(data: list[int], from_bits: int, to_bits: int, *, pad: bool) -> bytes:
    accumulator = 0
    bits = 0
    output = bytearray()
    max_value = (1 << to_bits) - 1
    for value in data:
        if value < 0 or value >> from_bits:
            raise CIP8VerificationError("invalid bech32 data value")
        accumulator = (accumulator << from_bits) | value
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            output.append((accumulator >> bits) & max_value)
    if pad:
        if bits:
            output.append((accumulator << (to_bits - bits)) & max_value)
    elif bits >= from_bits or ((accumulator << (to_bits - bits)) & max_value):
        raise CIP8VerificationError("invalid bech32 padding")
    return bytes(output)


def decode_cardano_address(address: str) -> bytes:
    if not address or (address.lower() != address and address.upper() != address):
        raise CIP8VerificationError("Cardano address has mixed case")
    normalized = address.lower()
    separator = normalized.rfind("1")
    if separator < 1 or separator + 7 > len(normalized):
        raise CIP8VerificationError("invalid Cardano bech32 address")
    hrp = normalized[:separator]
    if hrp not in {"addr", "addr_test", "stake", "stake_test"}:
        raise CIP8VerificationError("unsupported Cardano address prefix")
    try:
        values = [_BECH32_REVERSE[character] for character in normalized[separator + 1 :]]
    except KeyError as exc:
        raise CIP8VerificationError("invalid Cardano bech32 character") from exc
    if _bech32_polymod(_hrp_expand(hrp) + values) != 1:
        raise CIP8VerificationError("invalid Cardano address checksum")
    return _convert_bits(values[:-6], 5, 8, pad=False)


def payment_credential_from_address(address_bytes: bytes) -> bytes:
    if len(address_bytes) < 29:
        raise CIP8VerificationError("address is too short for a payment credential")
    address_type = address_bytes[0] >> 4
    if address_type not in {0, 2, 4, 6}:
        raise CIP8VerificationError("CIP-8 login requires a key-controlled payment address")
    return address_bytes[1:29]


def _decode_cbor_hex(value: str, field: str) -> Any:
    try:
        raw = bytes.fromhex(value.removeprefix("0x"))
        decoded = cbor2.loads(raw)
    except (ValueError, TypeError, cbor2.CBORDecodeError) as exc:
        raise CIP8VerificationError(f"{field} is not valid hex-encoded CBOR") from exc
    if isinstance(decoded, cbor2.CBORTag):
        decoded = decoded.value
    return decoded


def verify_cip8_signature(
    *,
    address: str,
    expected_message: str,
    cose_sign1_hex: str,
    cose_key_hex: str,
    expected_network_id: int = 0,
) -> CIP8VerificationResult:
    sign1 = _decode_cbor_hex(cose_sign1_hex, "cose_sign1")
    key = _decode_cbor_hex(cose_key_hex, "cose_key")
    if not isinstance(sign1, list) or len(sign1) != 4:
        raise CIP8VerificationError("COSE_Sign1 must contain four fields")
    protected_serialized, unprotected, payload, signature = sign1
    if not isinstance(protected_serialized, bytes):
        raise CIP8VerificationError("COSE protected headers must be bytes")
    if not isinstance(unprotected, dict):
        raise CIP8VerificationError("COSE unprotected headers must be a map")
    if not isinstance(payload, bytes) or not isinstance(signature, bytes):
        raise CIP8VerificationError("COSE payload and signature must be bytes")
    try:
        protected = cbor2.loads(protected_serialized)
    except cbor2.CBORDecodeError as exc:
        raise CIP8VerificationError("invalid COSE protected headers") from exc
    if not isinstance(protected, dict):
        raise CIP8VerificationError("COSE protected headers must decode to a map")
    algorithm = protected.get(1, unprotected.get(1))
    if algorithm != -8:
        raise CIP8VerificationError("only EdDSA (-8) CIP-8 signatures are supported")
    if payload != expected_message.encode("utf-8"):
        raise CIP8VerificationError("signed payload does not match the issued challenge")

    if not isinstance(key, dict):
        raise CIP8VerificationError("COSE_Key must be a map")
    if key.get(1) != 1 or key.get(3) != -8 or key.get(-1) != 6:
        raise CIP8VerificationError("COSE_Key is not an Ed25519 OKP key")
    public_key = key.get(-2)
    if not isinstance(public_key, bytes) or len(public_key) != 32:
        raise CIP8VerificationError("COSE_Key does not contain a 32-byte public key")

    address_bytes = decode_cardano_address(address)
    protected_address = protected.get("address", unprotected.get("address"))
    if not isinstance(protected_address, bytes) or not hmac.compare_digest(
        protected_address, address_bytes
    ):
        raise CIP8VerificationError("COSE address header does not match the login address")
    if (address_bytes[0] & 0x0F) != expected_network_id:
        raise CIP8VerificationError("address is on the wrong Cardano network")

    payment_credential = payment_credential_from_address(address_bytes)
    expected_credential = hashlib.blake2b(public_key, digest_size=28).digest()
    if not hmac.compare_digest(payment_credential, expected_credential):
        raise CIP8VerificationError("signing key does not control the payment credential")

    signature_structure = cbor2.dumps(
        ["Signature1", protected_serialized, b"", payload], canonical=True
    )
    try:
        Ed25519PublicKey.from_public_bytes(public_key).verify(signature, signature_structure)
    except InvalidSignature as exc:
        raise CIP8VerificationError("forged or invalid CIP-8 signature") from exc

    return CIP8VerificationResult(
        payment_credential=payment_credential.hex(),
        address_bytes=address_bytes,
        public_key=public_key,
        payload=payload,
    )


def demo_signature_for(message: str) -> str:
    """Return an intentionally insecure, deterministic proof used only in explicit demo mode."""
    return "demo:" + hashlib.sha256(message.encode("utf-8")).hexdigest()


def demo_payment_credential(address: str) -> str:
    return hashlib.blake2b(address.encode("utf-8"), digest_size=28).hexdigest()
