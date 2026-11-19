from decimal import ROUND_HALF_EVEN

from nti_engine import ENGINE_CONTEXT, ENGINE_PRECISION


def test_engine_decimal_context() -> None:
    assert ENGINE_PRECISION == 40
    assert ENGINE_CONTEXT.prec == 40
    assert ENGINE_CONTEXT.rounding == ROUND_HALF_EVEN
