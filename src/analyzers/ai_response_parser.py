"""AI 응답 텍스트에서 JSON을 안전하게 추출하고 구조를 검증하는 유틸리티."""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

REQUIRED_KEYS = ("thesis", "recommendation", "confidence")
VALID_RECOMMENDATIONS = {"BUY", "HOLD", "SELL"}


def parse_ai_response(text: str) -> dict | None:
    """AI 응답 텍스트에서 JSON을 추출하여 dict로 반환한다.

    시도 순서:
      1. ```json ... ``` 마크다운 블록 내부 추출
      2. 전체 텍스트를 json.loads()
      3. 정규식으로 가장 바깥 { ... } 블록 추출 후 json.loads()

    모두 실패하면 None을 반환한다.
    """
    if not text or not text.strip():
        return None

    # 1) 마크다운 JSON 블록 추출
    extracted = text
    if "```json" in text:
        extracted = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        extracted = text.split("```")[1].split("```")[0].strip()

    # 2) json.loads() 시도
    try:
        return json.loads(extracted)
    except (json.JSONDecodeError, ValueError):
        pass

    # 3) 정규식으로 { ... } 블록 추출
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except (json.JSONDecodeError, ValueError):
            pass

    logger.warning("JSON 파싱 실패: %.120s...", text)
    return None


def validate_ai_response(parsed: dict) -> tuple[bool, list[str]]:
    """파싱된 AI 응답의 구조를 검증한다.

    검증 항목:
      - 필수 키(thesis, recommendation, confidence) 존재
      - recommendation이 BUY/HOLD/SELL 중 하나
      - confidence가 0~100 범위
      - bear_cases가 3개 미만이면 경고 (검증 실패는 아님)

    Returns:
        (통과 여부, 실패/경고 사유 리스트)
    """
    reasons: list[str] = []

    # 필수 키 확인
    for key in REQUIRED_KEYS:
        if key not in parsed:
            reasons.append(f"필수 키 누락: {key}")

    # recommendation 검증
    rec = parsed.get("recommendation")
    if rec is not None and rec not in VALID_RECOMMENDATIONS:
        reasons.append(
            f"recommendation 값 오류: '{rec}' (허용: {', '.join(VALID_RECOMMENDATIONS)})"
        )

    # confidence 범위 검증
    conf = parsed.get("confidence")
    if conf is not None:
        try:
            conf_num = float(conf)
            if not (0 <= conf_num <= 100):
                reasons.append(f"confidence 범위 초과: {conf_num} (0~100 필요)")
        except (TypeError, ValueError):
            reasons.append(f"confidence 숫자 아님: {conf}")

    # bear_cases 개수 경고 (검증 실패는 아님)
    bear_cases = parsed.get("bear_cases", [])
    if isinstance(bear_cases, list) and len(bear_cases) < 3:
        logger.warning("bear_cases가 %d개 (권장 3개)", len(bear_cases))

    valid = len(reasons) == 0
    if not valid:
        for r in reasons:
            logger.warning("AI 응답 검증 실패: %s", r)

    return valid, reasons
