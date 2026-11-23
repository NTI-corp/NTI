"""Contract reads and integer V3/V4 quote math shared by keeper tasks."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any, Protocol

from eth_abi import decode as abi_decode
from eth_abi import encode as abi_encode
from eth_utils import keccak

ZERO_ADDRESS = "0x" + "00" * 20
BPS = 10_000
SLIPPAGE_BPS = 300
TWAP_WINDOW = 1800
Q96 = 1 << 96


class ContractCaller(Protocol):
    """Subset of OracleCommitClient, one instance per contract address."""

    async def _call(self, sig: str, arg_types: Sequence[str], args: Sequence[Any]) -> bytes: ...

    async def _send_tx(self, private_key: str, calldata: bytes) -> str: ...


ContractAt = Callable[[str], ContractCaller]


def encode_call(sig: str, types: Sequence[str] = (), args: Sequence[Any] = ()) -> bytes:
    return keccak(text=sig)[:4] + (abi_encode(list(types), list(args)) if types else b"")


async def read(
    contract: ContractCaller,
    sig: str,
    result_types: Sequence[str],
    arg_types: Sequence[str] = (),
    args: Sequence[Any] = (),
) -> tuple[Any, ...]:
    return abi_decode(result_types, await contract._call(sig, arg_types, args))


async def uint(
    contract: ContractCaller, sig: str, types: Sequence[str] = (), args: Sequence[Any] = ()
) -> int:
    return int((await read(contract, sig, ["uint256"], types, args))[0])


async def address(contract: ContractCaller, sig: str) -> str:
    return str((await read(contract, sig, ["address"]))[0])


async def balance_of(contract: ContractCaller, owner: str) -> int:
    return await uint(contract, "balanceOf(address)", ["address"], [owner])


def slippage_floor(quote: int) -> int:
    return quote * (BPS - SLIPPAGE_BPS) // BPS


# Exact integer TickMath multipliers from contracts/src/libraries/UniswapV3TwapLib.sol.
_TICK_MULTIPLIERS = (
    0xFFFCB933BD6FAD37AA2D162D1A594001,
    0xFFF97272373D413259A46990580E213A,
    0xFFF2E50F5F656932EF12357CF3C7FDCC,
    0xFFE5CACA7E10E4E61C3624EAA0941CD0,
    0xFFCB9843D60F6159C9DB58835C926644,
    0xFF973B41FA98C081472E6896DFB254C0,
    0xFF2EA16466C96A3843EC78B326B52861,
    0xFE5DEE046A99A2A811C461F1969C3053,
    0xFCBE86C7900A88AEDCFFC83B479AA3A4,
    0xF987A7253AC413176F2B074CF7815E54,
    0xF3392B0822B70005940C7A398E4B70F3,
    0xE7159475A2C29B7443B29C7FA6E889D9,
    0xD097F3BDFD2022B8845AD8F792AA5825,
    0xA9F746462D870FDF8A65DC1F90E061E5,
    0x70D869A156D2A1B890BB3DF62BAF32F7,
    0x31BE135F97D08FD981231505542FCFA6,
    0x9AA508B5B7A84E1C677DE54F3E99BC9,
    0x5D6AF8DEDB81196699C329225EE604,
    0x2216E584F5FA1EA926041BEDFE98,
    0x48A170391F7DC42444E8FA2,
)


def sqrt_price_at_tick(tick: int) -> int:
    if abs(tick) > 887_272:
        raise ValueError("V3 arithmetic mean tick out of range")
    ratio = 1 << 128
    for bit, multiplier in enumerate(_TICK_MULTIPLIERS):
        if abs(tick) & (1 << bit):
            ratio = ratio * multiplier >> 128
    if tick > 0:
        ratio = ((1 << 256) - 1) // ratio
    return (ratio + (1 << 32) - 1) >> 32


async def twap_sqrt_price(pool: ContractCaller) -> int:
    ticks, _ = await read(
        pool,
        "observe(uint32[])",
        ["int56[]", "uint160[]"],
        ["uint32[]"],
        [[TWAP_WINDOW, 0]],
    )
    if len(ticks) != 2:
        raise ValueError("V3 TWAP requires two observations")
    # Python division already rounds negative ticks down, as required by Solidity OracleLibrary.
    return sqrt_price_at_tick((ticks[1] - ticks[0]) // TWAP_WINDOW)


def quote_at_price(sqrt_price: int, amount: int, token_in: str, token_out: str) -> int:
    if sqrt_price == 0:
        raise ValueError("Pool price is uninitialized")
    ratio, scale = sqrt_price**2, 1 << 192
    if sqrt_price >= 1 << 128:
        ratio, scale = ratio >> 64, 1 << 128
    if int(token_in, 16) < int(token_out, 16):
        return amount * ratio // scale
    return amount * scale // ratio
