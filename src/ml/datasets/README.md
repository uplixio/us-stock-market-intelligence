# datasets/ — Train/Val/Test Split

Walk-forward용 시계열 split 저장.

**파일명 규칙**: `{split}_{train_start}_{train_end}.parquet`
- 예: `train_2023-01-01_2024-12-31.parquet`
- 예: `val_2025-01-01_2025-06-30.parquet`
- 예: `test_2025-07-01_2025-12-31.parquet`

**Split 전략** (walk-forward):
- Train window: 2년
- Validation window: 6개월
- Test window: 3개월
- Advance step: 3개월
- Embargo: 20일 (label horizon 고려)

**담당**: ml-pipeline-architect + walk-forward-validator
