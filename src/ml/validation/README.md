# validation/ — Walk-Forward 검증 결과

**담당**: walk-forward-validator

## 파일 구조

```
validation/
├── walk_forward_{target}_{run_id}.json   # fold별 OOS metrics
├── pbo_{target}_{run_id}.json            # Probability of Backtest Overfitting
├── dsr_{target}_{run_id}.json            # Deflated Sharpe Ratio
└── diagnostics/
    └── {run_id}_oos_sharpe_distribution.png
```

## Core Metrics

| 지표 | 기준 | 의미 |
|------|------|------|
| OOS Sharpe (median) | ≥ 1.5 | 샘플 밖 위험조정 수익 |
| PBO | ≤ 0.5 | 과적합 확률 |
| DSR | ≥ 0.95 | 다중검정 보정 Sharpe |
| Rank IC (mean) | ≥ 0.05 | 예측-실현 순위상관 |
| IC IR | ≥ 0.5 | IC 안정성 |

## Validation 프로토콜

1. Purged K-Fold: 20일 embargo로 label leakage 차단
2. Expanding window (옵션): 초기 데이터 적을 때
3. Combinatorial Purged CV: PBO 계산용
