from __future__ import annotations

import pandas as pd

REQUIRED_COLUMNS = [
    'timestamp', 'symbol', 'open', 'high', 'low', 'close', 'volume'
]


def normalize_ohlcv(data: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in REQUIRED_COLUMNS if c not in data.columns]
    if missing:
        raise ValueError(f'Missing required columns: {missing}')

    df = data.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
    df = df.sort_values(['timestamp', 'symbol']).reset_index(drop=True)

    dupes = df.duplicated(['timestamp', 'symbol'])
    if dupes.any():
        raise ValueError('Duplicate timestamp/symbol rows found.')

    price_cols = ['open', 'high', 'low', 'close']
    if (df[price_cols] <= 0).any().any():
        raise ValueError('Prices must be strictly positive.')

    if (df['volume'] < 0).any():
        raise ValueError('Volume cannot be negative.')

    return df


def split_train_test(data: pd.DataFrame, train_ratio: float = 0.6) -> tuple[pd.DataFrame, pd.DataFrame]:
    timestamps = sorted(data['timestamp'].unique())
    if len(timestamps) < 3:
        raise ValueError('Not enough timestamps to split train/test.')
    cut_idx = max(1, min(len(timestamps) - 1, int(len(timestamps) * train_ratio)))
    train_cut = timestamps[cut_idx]
    train = data[data['timestamp'] < train_cut].copy()
    test = data[data['timestamp'] >= train_cut].copy()
    if train.empty or test.empty:
        raise ValueError('Train/test split produced an empty segment.')
    return train, test
