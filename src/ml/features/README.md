# features/ — 피처 저장소

| 하위 디렉토리 | 담당 에이전트 | 산출물 |
|--------------|---------------|--------|
| `macro/` | macro-feature-engineer | `{regime,rates,sentiment}_features.parquet` (daily × 25+ col) |
| `equity/` | equity-factor-builder, equity-flow-analyst | `{tech,fund,flow}_factors.parquet` (date × ticker × 80+ col) |
| `merged/` | ml-pipeline-architect (feature_store) | `train_{date}.parquet` (join + lag-aligned) |

**Look-ahead 방지 규칙**: 모든 피처는 `T-1` 이전 데이터만 사용. filing_date, report_date 등은 명시 필터.

**포맷**: parquet (pyarrow backend), snappy compression, partitioned by year.
