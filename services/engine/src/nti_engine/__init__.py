"""Pure deterministic mindshare index engine (D5).

Invariant: no network, no wall-clock time, no randomness, no float math.
All computations use decimal.Decimal with precision=40 and ROUND_HALF_EVEN.
"""

from decimal import ROUND_HALF_EVEN, Context

ENGINE_PRECISION = 40
ENGINE_CONTEXT = Context(prec=ENGINE_PRECISION, rounding=ROUND_HALF_EVEN)

__all__ = ["ENGINE_CONTEXT", "ENGINE_PRECISION"]
