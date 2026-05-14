"""파이프라인 설정 단일 진입점"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class PipelineConfig:
    top_n: int = 10
    period: str = "1y"
    data_dir: str = "data"
    output_dir: str = "output"
    ai_provider: str = "gemini"
    ai_top_n: int = 10
    ml_top_n: int = 20
    steps: Optional[List[int]] = None
    dry_run: bool = False

    def should_run_step(self, step_num: int) -> bool:
        return True if self.steps is None else step_num in self.steps


DEFAULT_CONFIG = PipelineConfig()
