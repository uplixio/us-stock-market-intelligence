# models/ — 학습된 모델 저장소

**파일명 규칙**: `{algo}_{target}_{trained_at}.pkl`
- 예: `lgbm_fwd20d_rank_2026-04-05.pkl`
- 예: `xgb_fwd60d_sharpe_2026-04-05.pkl`
- 예: `catboost_fwd5d_return_2026-04-05.pkl`

**앙상블**: `ensemble_{target}_{trained_at}.json` (weighted blend 구성)

**메타데이터 파일**: 각 .pkl에 대응하는 `.json` 메타 파일 필수
- 학습 기간, 피처 목록, 하이퍼파라미터, validation metrics

**담당**: gbm-trainer
