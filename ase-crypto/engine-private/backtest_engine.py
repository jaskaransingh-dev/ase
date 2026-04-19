from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Optional
import pandas as pd
import numpy as np

from .ledger import Ledger, LedgerEvent


@dataclass
class EngineConfig:
    initial_capital: float = 100000.0
    fee_bps: float = 10.0
    slippage_bps: float = 5.0
    max_position_pct: float = 0.30
    min_cash_pct: float = 0.05


@dataclass
class PositionState:
    quantity: float
    avg_entry_price: float


@dataclass
class PortfolioState:
    cash: float
    equity: float
    positions: Dict[str, PositionState]


class BacktestEngine:
    def __init__(self, cfg: EngineConfig):
        self.cfg = cfg
        self.ledger = Ledger()

    def mark_to_market(self, portfolio: PortfolioState, prices: Dict[str, float]) -> float:
        value = portfolio.cash
        for asset, pos in portfolio.positions.items():
            px = prices.get(asset)
            if px is not None:
                value += pos.quantity * px
        return value

    def current_weight(self, asset: str, portfolio: PortfolioState, prices: Dict[str, float]) -> float:
        equity = self.mark_to_market(portfolio, prices)
        if equity <= 0:
            return 0.0
        pos = portfolio.positions.get(asset)
        if not pos:
            return 0.0
        return (pos.quantity * prices[asset]) / equity

    def target_value_from_pct(self, equity: float, target_pct: Optional[float]) -> float:
        if target_pct is None:
            return 0.0
        return equity * max(0.0, min(target_pct, self.cfg.max_position_pct))

    def apply_buy(self, timestamp: str, asset: str, target_pct: float, thesis: str, risk_notes: str,
                  portfolio: PortfolioState, prices: Dict[str, float]):
        px = prices[asset]
        equity = self.mark_to_market(portfolio, prices)
        current_val = 0.0
        current_pos = portfolio.positions.get(asset)
        if current_pos:
            current_val = current_pos.quantity * px

        target_val = self.target_value_from_pct(equity, target_pct)
        requested_buy_val = max(0.0, target_val - current_val)
        max_spend = max(0.0, portfolio.cash - equity * self.cfg.min_cash_pct)
        buy_val = min(requested_buy_val, max_spend)

        if buy_val <= 0:
            self.ledger.post(LedgerEvent(
                timestamp=timestamp,
                asset=asset,
                action='BUY',
                requested_target_position_pct=target_pct,
                executed_target_position_pct=self.current_weight(asset, portfolio, prices),
                requested_quantity=None,
                executed_quantity=0.0,
                fill_price=px,
                fee_paid=0.0,
                slippage_paid=0.0,
                status='SKIPPED',
                reason='Insufficient available cash after platform cash reserve rules.',
                thesis=thesis,
                risk_notes=risk_notes,
            ))
            return

        total_cost_rate = (self.cfg.fee_bps + self.cfg.slippage_bps) / 10000.0
        qty = buy_val / (px * (1 + total_cost_rate))
        fee_paid = qty * px * (self.cfg.fee_bps / 10000.0)
        slippage_paid = qty * px * (self.cfg.slippage_bps / 10000.0)
        total_cost = qty * px + fee_paid + slippage_paid

        portfolio.cash -= total_cost
        if asset not in portfolio.positions:
            portfolio.positions[asset] = PositionState(quantity=0.0, avg_entry_price=0.0)

        old = portfolio.positions[asset]
        new_qty = old.quantity + qty
        old.avg_entry_price = ((old.quantity * old.avg_entry_price) + (qty * px)) / new_qty if new_qty > 0 else 0.0
        old.quantity = new_qty

        self.ledger.post(LedgerEvent(
            timestamp=timestamp,
            asset=asset,
            action='BUY',
            requested_target_position_pct=target_pct,
            executed_target_position_pct=self.current_weight(asset, portfolio, prices),
            requested_quantity=None,
            executed_quantity=qty,
            fill_price=px,
            fee_paid=fee_paid,
            slippage_paid=slippage_paid,
            status='EXECUTED' if abs(buy_val - requested_buy_val) < 1e-8 else 'PARTIAL',
            reason='Buy request converted into position increase under platform risk and cash constraints.',
            thesis=thesis,
            risk_notes=risk_notes,
        ))

    def apply_sell(self, timestamp: str, asset: str, target_pct: Optional[float], thesis: str, risk_notes: str,
                   portfolio: PortfolioState, prices: Dict[str, float]):
        px = prices[asset]
        pos = portfolio.positions.get(asset)

        if not pos or pos.quantity <= 0:
            self.ledger.post(LedgerEvent(
                timestamp=timestamp,
                asset=asset,
                action='SELL',
                requested_target_position_pct=target_pct,
                executed_target_position_pct=0.0,
                requested_quantity=None,
                executed_quantity=0.0,
                fill_price=px,
                fee_paid=0.0,
                slippage_paid=0.0,
                status='SKIPPED',
                reason='No open position exists for this asset.',
                thesis=thesis,
                risk_notes=risk_notes,
            ))
            return

        equity = self.mark_to_market(portfolio, prices)
        current_val = pos.quantity * px
        desired_val = self.target_value_from_pct(equity, target_pct) if target_pct is not None else 0.0
        sell_val = max(0.0, current_val - desired_val)
        sell_qty = min(pos.quantity, sell_val / px if px > 0 else 0.0)

        if sell_qty <= 0:
            self.ledger.post(LedgerEvent(
                timestamp=timestamp,
                asset=asset,
                action='SELL',
                requested_target_position_pct=target_pct,
                executed_target_position_pct=self.current_weight(asset, portfolio, prices),
                requested_quantity=None,
                executed_quantity=0.0,
                fill_price=px,
                fee_paid=0.0,
                slippage_paid=0.0,
                status='SKIPPED',
                reason='Requested sell does not reduce the current position under the target size rules.',
                thesis=thesis,
                risk_notes=risk_notes,
            ))
            return

        fee_paid = sell_qty * px * (self.cfg.fee_bps / 10000.0)
        slippage_paid = sell_qty * px * (self.cfg.slippage_bps / 10000.0)
        proceeds = sell_qty * px - fee_paid - slippage_paid

        pos.quantity -= sell_qty
        portfolio.cash += proceeds
        if pos.quantity <= 1e-12:
            del portfolio.positions[asset]

        self.ledger.post(LedgerEvent(
            timestamp=timestamp,
            asset=asset,
            action='SELL',
            requested_target_position_pct=target_pct,
            executed_target_position_pct=self.current_weight(asset, portfolio, prices),
            requested_quantity=None,
            executed_quantity=sell_qty,
            fill_price=px,
            fee_paid=fee_paid,
            slippage_paid=slippage_paid,
            status='EXECUTED',
            reason='Sell request converted into a position reduction or full exit.',
            thesis=thesis,
            risk_notes=risk_notes,
        ))

    def apply_hold(self, timestamp: str, asset: str, target_pct: Optional[float], thesis: str, risk_notes: str,
                   portfolio: PortfolioState, prices: Dict[str, float]):
        px = prices[asset]
        self.ledger.post(LedgerEvent(
            timestamp=timestamp,
            asset=asset,
            action='HOLD',
            requested_target_position_pct=target_pct,
            executed_target_position_pct=self.current_weight(asset, portfolio, prices),
            requested_quantity=None,
            executed_quantity=0.0,
            fill_price=px,
            fee_paid=0.0,
            slippage_paid=0.0,
            status='EXECUTED',
            reason='Strategy chose to keep the current position unchanged.',
            thesis=thesis,
            risk_notes=risk_notes,
        ))

    def run_step(self, timestamp: str, decisions: List[dict], portfolio: PortfolioState, prices: Dict[str, float]):
        for d in decisions:
            asset = d['asset']
            action = d['decision']
            target_pct = d.get('targetPositionPct')
            thesis = d.get('thesis', '')
            risk_notes = d.get('riskNotes', '')

            if asset not in prices or prices[asset] <= 0:
                self.ledger.post(LedgerEvent(
                    timestamp=timestamp,
                    asset=asset,
                    action=action,
                    requested_target_position_pct=target_pct,
                    executed_target_position_pct=None,
                    requested_quantity=None,
                    executed_quantity=0.0,
                    fill_price=None,
                    fee_paid=0.0,
                    slippage_paid=0.0,
                    status='REJECTED',
                    reason='Missing or invalid market price.',
                    thesis=thesis,
                    risk_notes=risk_notes,
                ))
                continue

            if action == 'BUY':
                self.apply_buy(timestamp, asset, float(target_pct or 0.0), thesis, risk_notes, portfolio, prices)
            elif action == 'SELL':
                self.apply_sell(timestamp, asset, target_pct, thesis, risk_notes, portfolio, prices)
            else:
                self.apply_hold(timestamp, asset, target_pct, thesis, risk_notes, portfolio, prices)

        portfolio.equity = self.mark_to_market(portfolio, prices)
        return portfolio