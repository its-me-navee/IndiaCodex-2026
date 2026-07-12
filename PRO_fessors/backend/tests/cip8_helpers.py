from __future__ import annotations

import hashlib

import cbor2
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _polymod(values: list[int]) -> int:
    generators = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)
    checksum = 1
    for value in values:
        top = checksum >> 25
        checksum = ((checksum & 0x1FFFFFF) << 5) ^ value
        for index, generator in enumerate(generators):
            if (top >> index) & 1:
                checksum ^= generator
    return checksum


def _convert_bits(data: bytes, from_bits: int, to_bits: int, pad: bool = True) -> list[int]:
    accumulator = 0
    bits = 0
    result: list[int] = []
    max_value = (1 << to_bits) - 1
    for value in data:
        accumulator = (accumulator << from_bits) | value
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            result.append((accumulator >> bits) & max_value)
    if pad and bits:
        result.append((accumulator << (to_bits - bits)) & max_value)
    return result


def _encode_bech32(hrp: str, payload: bytes) -> str:
    values = _convert_bits(payload, 8, 5)
    expanded = [ord(char) >> 5 for char in hrp] + [0] + [ord(char) & 31 for char in hrp]
    polymod = _polymod(expanded + values + [0] * 6) ^ 1
    checksum = [(polymod >> (5 * (5 - index))) & 31 for index in range(6)]
    return hrp + "1" + "".join(CHARSET[value] for value in values + checksum)


def signing_identity(network_id: int = 0) -> tuple[Ed25519PrivateKey, str, bytes]:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    credential = hashlib.blake2b(public_key, digest_size=28).digest()
    raw_address = bytes([(6 << 4) | network_id]) + credential
    hrp = "addr" if network_id == 1 else "addr_test"
    return private_key, _encode_bech32(hrp, raw_address), raw_address


def sign_cip8(private_key: Ed25519PrivateKey, raw_address: bytes, message: str) -> tuple[str, str]:
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    protected = cbor2.dumps({1: -8, "address": raw_address}, canonical=True)
    payload = message.encode("utf-8")
    signature_structure = cbor2.dumps(["Signature1", protected, b"", payload], canonical=True)
    signature = private_key.sign(signature_structure)
    sign1 = cbor2.dumps(cbor2.CBORTag(18, [protected, {}, payload, signature]))
    cose_key = cbor2.dumps({1: 1, 3: -8, -1: 6, -2: public_key}, canonical=True)
    return sign1.hex(), cose_key.hex()
