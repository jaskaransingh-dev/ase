def grade_strategy(metrics: dict, validations: list) -> dict:
    """
    Grade a strategy based on metrics and validation results.
    
    Args:
        metrics: dict with sharpe, cagr, max_drawdown, etc.
        validations: list of validation failure messages
    
    Returns:
        dict with grade, publishable, summary
    """
    if validations:
        return {
            'grade': 'F',
            'publishable': False,
            'summary': 'Strategy failed one or more validation checks.'
        }

    sharpe = metrics.get('sharpe', 0.0)
    max_dd = metrics.get('max_drawdown', 1.0)
    cagr = metrics.get('cagr', 0.0)

    if sharpe >= 1.5 and max_dd <= 0.20 and cagr > 0.10:
        return {'grade': 'A', 'publishable': True, 'summary': 'Strong risk-adjusted profile.'}
    if sharpe >= 1.0 and max_dd <= 0.30:
        return {'grade': 'B', 'publishable': True, 'summary': 'Acceptable publish profile.'}
    if sharpe >= 0.75 and max_dd <= 0.35:
        return {'grade': 'C', 'publishable': False, 'summary': 'Needs stronger robustness before publishing.'}
    return {'grade': 'D', 'publishable': False, 'summary': 'Risk-adjusted performance is too weak.'}


def calculate_sharpe(returns: list, risk_free_rate: float = 0.05) -> float:
    """Calculate Sharpe ratio from returns."""
    import numpy as np
    if not returns or len(returns) < 2:
        return 0.0
    
    excess = np.array(returns) - risk_free_rate / 252
    return np.sqrt(252) * excess.mean() / excess.std() if excess.std() > 0 else 0.0


def calculate_sortino(returns: list, risk_free_rate: float = 0.05) -> float:
    """Calculate Sortino ratio from returns (downside only)."""
    import numpy as np
    if not returns or len(returns) < 2:
        return 0.0
    
    excess = np.array(returns) - risk_free_rate / 252
    downside = excess[excess < 0]
    if len(downside) == 0 or downside.std() == 0:
        return 0.0
    return np.sqrt(252) * excess.mean() / downside.std()


def calculate_max_drawdown(equity_curve: list) -> float:
    """Calculate maximum drawdown from equity curve."""
    import numpy as np
    if not equity_curve:
        return 0.0
    
    equity = np.array(equity_curve)
    running_max = np.maximum.accumulate(equity)
    drawdown = (equity - running_max) / running_max
    return abs(drawdown.min()) if len(drawdown) > 0 else 0.0


def calculate_cagr(equity_curve: list, periods: int) -> float:
    """Calculate CAGR from equity curve."""
    import numpy as np
    if not equity_curve or len(equity_curve) < 2 or equity_curve[0] <= 0:
        return 0.0
    
    start = equity_curve[0]
    end = equity_curve[-1]
    years = periods / 252
    return (end / start) ** (1 / years) - 1 if years > 0 else 0.0