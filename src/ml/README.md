# ml/ — GBM ML 파이프라인

5-Team 에이전트 생태계의 **학습/추론 산출물 저장소**. rule-based 시스템(`analyzers/`)과 병행 운영.

## 디렉토리 ↔ 에이전트 매핑

| 디렉토리 | 담당 팀 | 담당 에이전트 |
|---------|---------|---------------|
| `features/macro/` | Macro | macro-feature-engineer |
| `features/equity/` | Equity | equity-factor-builder, equity-flow-analyst |
| `features/merged/` | MLOps | feature-store (ml_pipeline_architect) |
| `datasets/` | MLOps | ml-pipeline-architect |
| `models/` | Model | gbm-trainer |
| `pipeline/` | MLOps | ml-pipeline-architect, gbm-code-reviewer |
| `experiments/` | Model | model-lead, gbm-trainer |
| `validation/` | Model | walk-forward-validator |

## Data Flow

```
[collectors/] ─→ data/*.csv
                    │
   ┌────────────────┼────────────────┐
   ↓                ↓                ↓
[macro-team]    [equity-team]    (기존 analyzers/)
features/macro/ features/equity/   rule-based score
   │                │                │
   └──────┬─────────┘                │
          ↓                          │
   features/merged/                  │
          ↓                          │
   datasets/train_*.parquet          │
          ↓                          │
   [model-team] train                │
          ↓                          │
   models/{lgbm,xgb,cat}_*.pkl       │
          ↓                          │
   [model-team] predict              │
          ↓                          │
   output/gbm_predictions.parquet ──→ blended with rule score
                                      │
                                      ↓
                            [signal-optimizer] 최종 스크리닝
```

## Target 설계

- **Primary**: 20d forward return rank (cross-sectional, sector-neutral)
- **Secondary**: 60d forward Sharpe (risk-adjusted)
- **Auxiliary**: 5d forward return (multi-task learning)

## 학습 스케줄

| 주기 | 작업 | 에이전트 |
|------|------|----------|
| 매일 06:45 | Incremental training (last 1 week) | gbm-trainer |
| 매주 일요일 06:00 | Full re-training + Optuna HPO | model-lead |
| 월 1회 | Walk-forward 백테스트 + PBO/DSR | walk-forward-validator |
