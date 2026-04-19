from dataclasses import dataclass, asdict
from typing import Optional, List


@dataclass
class LedgerEvent:
    timestamp: str
    asset: str
    action: str
    requested_target_position_pct: Optional[float]
    executed_target_position_pct: Optional[float]
    requested_quantity: Optional[float]
    executed_quantity: Optional[float]
    fill_price: Optional[float]
    fee_paid: Optional[float]
    slippage_paid: Optional[float]
    status: str
    reason: str
    thesis: Optional[str] = None
    risk_notes: Optional[str] = None


class Ledger:
    def __init__(self):
        self.events: List[LedgerEvent] = []

    def post(self, event: LedgerEvent):
        self.events.append(event)

    def to_dict(self):
        return [asdict(e) for e in self.events]

    def to_dataframe(self):
        import pandas as pd
        return pd.DataFrame([asdict(e) for e in self.events])