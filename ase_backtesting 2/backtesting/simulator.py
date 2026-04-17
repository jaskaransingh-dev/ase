from __future__ import annotations

from collections import defaultdict
import math
import pandas as pd


def _clip_and_scale_weights(raw_weights: dict[str, float], config) -> dict[str, float]:
    clipped = {}
    for symbol, weight in raw_weights.items():
        weight = float(weight)
        if config.long_only:
            weight = max(0.0, weight)
        weight = max(-config.max_position_weight, min(config.max_position_weight, weight))
        clipped[symbol] = weight

    gross = sum(abs(v) for v in clipped.values())
    if gross > config.max_gross_leverage and gross > 0:
        scale = config.max_gross_leverage / gross
        clipped = {k: v * scale for k, v in clipped.items()}
    return clipped


def simulate_portfolio(
    market_data: pd.DataFrame,
    targets: pd.DataFrame,
    config,
) -> dict:
    data_by_ts = {
        ts: grp.set_index('symbol').sort_index()
        for ts, grp in market_data.groupby('timestamp', sort=True)
    }
    targets_by_ts = {
        ts: grp.set_index('symbol')['target_weight'].to_dict()
        for ts, grp in targets.groupby('timestamp', sort=True)
    }

    cash = float(config.initial_capital)
    holdings: dict[str, float] = defaultdict(float)

    trade_rows: list[dict] = []
    position_rows: list[dict] = []
    equity_rows: list[dict] = []

    for ts in sorted(data_by_ts.keys()):
        bar = data_by_ts[ts]
        close_prices = bar['close'].to_dict()
        equity_before = cash + sum(qty * close_prices.get(sym, 0.0) for sym, qty in holdings.items())

        desired = _clip_and_scale_weights(targets_by_ts.get(ts, {}), config)
        current_symbols = set(close_prices) | set(desired) | set(holdings)

        for sym in sorted(current_symbols):
            price = float(close_prices.get(sym, math.nan))
            if math.isnan(price):
                continue
            current_qty = float(holdings.get(sym, 0.0))
            target_weight = float(desired.get(sym, 0.0))
            target_value = target_weight * equity_before
            target_qty = target_value / price if config.allow_fractional_shares else math.floor(target_value / price)
            delta_qty = target_qty - current_qty
            if abs(delta_qty * price) < config.min_trade_notional:
                continue

            side = 'BUY' if delta_qty > 0 else 'SELL'
            fill_price = price * (1 + config.slippage_bps / 10000.0) if delta_qty > 0 else price * (1 - config.slippage_bps / 10000.0)
            trade_notional = delta_qty * fill_price
            commission = abs(trade_notional) * config.commission_bps / 10000.0
            cash -= trade_notional
            cash -= commission
            holdings[sym] = current_qty + delta_qty

            trade_rows.append({
                'timestamp': ts,
                'symbol': sym,
                'side': side,
                'quantity': delta_qty,
                'price': fill_price,
                'notional': trade_notional,
                'commission': commission,
                'slippage_cost': abs(delta_qty) * abs(fill_price - price),
                'post_trade_position': holdings[sym],
                'cash_after': cash,
            })

        equity_after = cash + sum(qty * close_prices.get(sym, 0.0) for sym, qty in holdings.items())
        gross_market_value = 0.0
        for sym in sorted(current_symbols):
            qty = float(holdings.get(sym, 0.0))
            if abs(qty) < 1e-12:
                continue
            market_value = qty * float(close_prices[sym])
            gross_market_value += abs(market_value)
            position_rows.append({
                'timestamp': ts,
                'symbol': sym,
                'quantity': qty,
                'price': float(close_prices[sym]),
                'market_value': market_value,
                'equity': equity_after,
            })

        equity_rows.append({
            'timestamp': ts,
            'cash': cash,
            'gross_market_value': gross_market_value,
            'equity': equity_after,
        })

    trades = pd.DataFrame(trade_rows)
    positions = pd.DataFrame(position_rows)
    equity_curve = pd.DataFrame(equity_rows)
    if not equity_curve.empty:
        equity_curve['returns'] = equity_curve['equity'].pct_change().fillna(0.0)
    else:
        equity_curve = pd.DataFrame(columns=['timestamp', 'cash', 'gross_market_value', 'equity', 'returns'])

    return {
        'trades': trades,
        'positions': positions,
        'equity_curve': equity_curve,
    }
