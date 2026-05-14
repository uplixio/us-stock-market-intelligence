"use client";
import { useState, useEffect } from "react";

// ── 도움말 데이터 (초등학생도 이해할 수 있는 수준) ──────────────────────────

const H = {
  green: "text-primary font-bold",
  yellow: "text-secondary font-bold",
  red: "text-error font-bold",
  blue: "text-tertiary font-bold",
  bold: "font-bold text-on-surface",
};

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-surface-container-high p-3 rounded-lg text-sm space-y-1 my-3 border border-outline-variant/10 whitespace-normal sm:whitespace-nowrap sm:overflow-x-auto">
    {children}
  </div>
);

const Sec = ({ children }: { children: React.ReactNode }) => (
  <p className="font-bold text-on-surface text-sm mt-4 mb-1">{children}</p>
);

const HELP_DATA: Record<string, { title: string; body: React.ReactNode }> = {

  verdict: {
    title: "Verdict (판정) 이게 뭐야?",
    body: (
      <>
        <Sec>🚦 신호등이라고 생각하면 돼요!</Sec>
        <p>오늘 주식을 사도 되는지, 조심해야 하는지, 쉬어야 하는지를 <span className={H.bold}>신호등</span>처럼 알려줘요.</p>
        <Box>
          <p><span className={H.green}>GO (초록불)</span> = "지금 사도 좋아요!"</p>
          <p><span className={H.yellow}>CAUTION (노란불)</span> = "조심해서 사세요!"</p>
          <p><span className={H.red}>STOP (빨간불)</span> = "지금은 사지 마세요, 기다려요!"</p>
        </Box>
        <Sec>🗳️ 어떻게 결정해요?</Sec>
        <p>3명이 투표해요:</p>
        <Box>
          <p>1. <span className={H.bold}>Regime</span> (시장 체제) — 시장이 위험한지 안전한지</p>
          <p>2. <span className={H.bold}>Gate</span> (섹터 신호등) — 11개 업종 점수</p>
          <p>3. <span className={H.bold}>ML</span> (AI 로봇) — 다음 주에 오를 것 같은지</p>
        </Box>
        <p>3명 다 "좋다!" → <span className={H.green}>GO</span></p>
        <p>하나라도 "위험!" → <span className={H.red}>STOP</span></p>
        <p>나머지 → <span className={H.yellow}>CAUTION</span></p>
      </>
    ),
  },

  regime: {
    title: "Market Regime (시장 체제) 이게 뭐야?",
    body: (
      <>
        <Sec>🌡️ 시장의 체온계예요!</Sec>
        <p>사람이 아프면 열이 나듯, 주식 시장도 <span className={H.bold}>"지금 건강한지, 아픈지"</span> 측정하는 거예요.</p>
        <Sec>5개 센서로 측정해요</Sec>
        <Box>
          <p><span className={H.bold}>VIX (30%)</span> — 공포 지수. 숫자가 높으면 사람들이 무서워하는 중</p>
          <p><span className={H.bold}>Trend (25%)</span> — 주가가 오르는 중인지 내리는 중인지</p>
          <p><span className={H.bold}>Breadth (18%)</span> — 전체 주식 중 몇 개가 오르고 있는지</p>
          <p><span className={H.bold}>Credit (15%)</span> — 위험한 투자를 하는 사람이 많은지</p>
          <p><span className={H.bold}>Yield Curve (12%)</span> — 단기/장기 이자 차이</p>
        </Box>
        <Sec>결과는 4단계</Sec>
        <Box>
          <p><span className={H.green}>RISK ON</span> = 안전해요! 투자하기 좋은 날씨 ☀️</p>
          <p><span className={H.yellow}>NEUTRAL</span> = 보통이에요. 구름 좀 있어요 ⛅</p>
          <p><span className={H.red}>RISK OFF</span> = 조심! 비 올 것 같아요 🌧️</p>
          <p><span className={H.red}>CRISIS</span> = 위험! 태풍이에요! 🌪️</p>
        </Box>
        <Sec>Regime Score 기준</Sec>
        <Box>
          <p>Score <span className={H.green}>2 이상</span> → RISK ON (투자 좋아요)</p>
          <p>Score <span className={H.yellow}>1~2</span> → NEUTRAL (보통)</p>
          <p>Score <span className={H.red}>1 미만</span> → RISK OFF / CRISIS (조심!)</p>
        </Box>
      </>
    ),
  },

  gate: {
    title: "Sector Gate (섹터 신호등) 이게 뭐야?",
    body: (
      <>
        <Sec>🏢 11개 업종의 건강검진표예요!</Sec>
        <p>미국 주식은 <span className={H.bold}>11개 업종</span>으로 나뉘어요 (기술, 금융, 에너지, 건강 등).<br />
        각 업종마다 "잘하고 있어?" 점수를 매기고, 평균을 내요.</p>
        <Box>
          <p><span className={H.green}>BULLISH (초록)</span> = 이 업종 지금 잘 나가고 있어요 📈</p>
          <p><span className={H.yellow}>NEUTRAL (노랑)</span> = 그냥 보통이에요</p>
          <p><span className={H.red}>BEARISH (빨강)</span> = 이 업종 지금 힘들어요 📉</p>
        </Box>
        <Box>
          <p>전체 평균 <span className={H.bold}>70점 이상</span> → GO</p>
          <p>전체 평균 <span className={H.bold}>40~70점</span> → CAUTION</p>
          <p>전체 평균 <span className={H.bold}>40점 미만</span> → STOP</p>
        </Box>
        <Sec>❓ 데이터가 없는데 왜 CAUTION이 뜨나요?</Sec>
        <p>섹터 데이터가 아직 계산되지 않은 날짜거나 최신 리포트가 아닌 경우,<br />
        <span className={H.bold}>CAUTION이 기본값</span>으로 표시돼요.<br />
        "섹터 게이트 데이터 없음" 메시지가 함께 보이면 데이터가 없는 상태예요!</p>
      </>
    ),
  },

  ml: {
    title: "ML Predictor (AI 예측 로봇) 이게 뭐야?",
    body: (
      <>
        <Sec>🤖 AI 로봇이 다음 주를 예측해요!</Sec>
        <p>컴퓨터가 <span className={H.bold}>여러 가지 정보</span>를 보고, "다음 5일 동안 오를까? 내릴까?" 예측해요.</p>
        <Sec>SPY와 QQQ 두 개를 따로 예측해요</Sec>
        <Box>
          <p><span className={H.bold}>SPY</span> = 미국 대표 회사 500개 평균 (삼성+현대+SK 같은 거)</p>
          <p><span className={H.bold}>QQQ</span> = 미국 IT 회사 100개 평균 (애플+구글+테슬라 같은 거)</p>
        </Box>
        <Sec>결과 읽는 법</Sec>
        <Box>
          <p><span className={H.green}>▲ BULLISH</span> = "오를 것 같아요!" (황소가 뿔로 위로 들어올려요)</p>
          <p><span className={H.red}>▼ BEARISH</span> = "내릴 것 같아요!" (곰이 발로 아래로 내려쳐요)</p>
          <p><span className={H.bold}>Probability</span> = 오를 확률 (50% 넘으면 오를 가능성이 더 높아요)</p>
          <p><span className={H.bold}>Confidence</span> = AI가 얼마나 확신하는지 (HIGH=확신)</p>
        </Box>
        <Sec>신뢰도 % 읽는 법</Sec>
        <Box>
          <p><span className={H.green}>70% 이상</span> = AI가 많이 확신해요 ✅ — 신호 믿어도 돼요</p>
          <p><span className={H.yellow}>50~69%</span> = 어느 정도 확신해요 — 참고는 하되 다른 신호도 봐요</p>
          <p><span className={H.red}>50% 미만</span> = 확신이 낮아요 ⚠️ — 이번 예측은 불확실해요</p>
        </Box>
        <Sec>❓ 신뢰도가 높은데 BEARISH가 나오면?</Sec>
        <p>신뢰도는 <span className={H.bold}>"오를 것"이 아니라 "얼마나 확실한가"</span>예요!</p>
        <Box>
          <p><span className={H.red}>BEARISH + 신뢰도 높음</span> = AI가 <span className={H.bold}>"내릴 것 같아!"를 매우 확신</span>해요 ⚠️</p>
          <p><span className={H.green}>BULLISH + 신뢰도 높음</span> = AI가 <span className={H.bold}>"오를 것 같아!"를 매우 확신</span>해요 ✅</p>
          <p><span className={H.yellow}>BULLISH + 신뢰도 낮음</span> = "오를 것 같긴 한데… 잘 모르겠어" 상태예요</p>
        </Box>
        <p className="text-[11px]">⚡ 신뢰도 높음 = 확실하다는 뜻이지, 오른다는 뜻이 아니에요! BEARISH여도 신뢰도가 높으면 "확실하게 내린다"는 신호예요.</p>
      </>
    ),
  },

  picks: {
    title: "Stock Picks (추천 종목) 이게 뭐야?",
    body: (
      <>
        <Sec>📊 "20"이 뭐예요? 점수 아닌가요?</Sec>
        <Box>
          <p>여기 숫자는 <span className={H.bold}>점수가 아니에요!</span></p>
          <p>S&P 500 (미국 대표 주식 500개)을 전부 검사해서,<br />
          오늘 조건을 통과한 <span className={H.bold}>종목 수</span>예요.</p>
          <p><span className={H.green}>20</span> → "오늘 500개 중 20개가 통과했어요"</p>
        </Box>
        <p className="text-[11px]">숫자가 많을수록 좋은 종목이 많다는 뜻이지만, 많다고 무조건 좋은 건 아니에요. 시장이 좋을 때 더 많이 통과해요!</p>
        <Sec>🏆 컴퓨터가 뽑은 "공부 잘하는 학생" 명단이에요!</Sec>
        <p>수백 개 미국 주식 중에서 <span className={H.bold}>가장 좋아 보이는 종목</span>을 골라줘요.</p>
        <Sec>6가지를 보고 점수를 매겨요</Sec>
        <Box>
          <p><span className={H.bold}>기술 분석 (35%)</span> — 주가 그래프가 예쁜 모양인지</p>
          <p><span className={H.bold}>기본 분석 (20%)</span> — 회사가 돈을 잘 버는지</p>
          <p><span className={H.bold}>애널리스트 (15%)</span> — 전문가들이 "사라"고 했는지</p>
          <p><span className={H.bold}>상대 강도 (15%)</span> — 시장 평균보다 잘하고 있는지</p>
          <p><span className={H.bold}>거래량 (10%)</span> — 많은 사람들이 사고팔고 있는지</p>
          <p><span className={H.bold}>기관 투자 (5%)</span> — 큰 회사들이 이 주식을 사고 있는지</p>
        </Box>
      </>
    ),
  },

  grade: {
    title: "Grade (등급) 이게 뭐야?",
    body: (
      <>
        <Sec>📊 주식의 성적표예요!</Sec>
        <p>학교에서 A, B, C, D, F 등급 받는 것처럼, 주식도 점수에 따라 등급을 받아요.</p>
        <Box>
          <p><span className={H.green}>A (75점 이상)</span> = 최우수! "이 주식 정말 좋아요!"</p>
          <p><span className={H.blue}>B (62~74점)</span> = 우수! "꽤 괜찮아요"</p>
          <p><span className={H.yellow}>C (48~61점)</span> = 보통. "그저 그래요"</p>
          <p><span className={H.red}>D (35~47점)</span> = 미흡. "별로예요"</p>
          <p><span className={H.red}>F (35점 미만)</span> = 부진. "지금은 안 좋아요"</p>
        </Box>
      </>
    ),
  },

  strategy: {
    title: "Strategy (전략) 이게 뭐야?",
    body: (
      <>
        <Sec>🎯 "이 주식은 어떤 상황이야?" 알려줘요!</Sec>
        <Box>
          <p><span className={H.bold}>Trend (추세)</span> = 에스컬레이터를 타고 꾸준히 올라가는 중 📈</p>
          <p><span className={H.bold}>Swing (스윙)</span> = 그네처럼 왔다갔다 하는 중 🎢</p>
          <p><span className={H.bold}>Reversal (반전)</span> = 떨어지다가 바닥 찍고 올라오는 중 ⬆️</p>
        </Box>
      </>
    ),
  },

  setup: {
    title: "Setup (진입 패턴) 이게 뭐야?",
    body: (
      <>
        <Sec>🪜 지금 어디쯤 있는지 알려줘요!</Sec>
        <Box>
          <p><span className={H.bold}>Breakout (돌파)</span> = 벽을 뚫고 나가는 중! 🚀</p>
          <p><span className={H.bold}>Pullback (눌림)</span> = 올라가다 잠깐 쉬는 중. 계단에서 앉았다 일어나요 🪜</p>
          <p><span className={H.bold}>Base (바닥)</span> = 바닥에서 준비 중. 로켓 발사 대기 중 🛸</p>
          <p><span className={H.bold}>Reversal (반전)</span> = 내려가다 방향 바꾸는 중 ⬆️</p>
        </Box>
        <p className="text-[11px]">예: <span className={H.bold}>Trend/Breakout</span> = "꾸준히 오르다가 저항선을 뚫었어!" → 아주 좋은 신호!</p>
      </>
    ),
  },

  action: {
    title: "Action (행동 지침) 이게 뭐야?",
    body: (
      <>
        <Sec>🎬 "이 주식 어떻게 해?" 알려줘요!</Sec>
        <p>시장 상태(Verdict)와 주식 등급(Grade)을 합쳐서 <span className={H.bold}>"뭘 해야 할지"</span> 정해줘요.</p>
        <Box>
          <p><span className={H.green}>BUY (매수)</span> = "지금 사세요!" 시장 좋고 + 주식도 좋을 때</p>
          <p><span className={H.green}>SMALL BUY (소량 매수)</span> = "조금만 사세요!" 시장은 애매하지만 주식은 좋을 때</p>
          <p><span className={H.yellow}>WATCH (관망)</span> = "지켜보세요!" 아직 확실하지 않을 때</p>
          <p><span className="text-on-surface-variant font-bold">HOLD (보유)</span> = "가만히 기다리세요!" 시장이 안 좋을 때</p>
        </Box>
      </>
    ),
  },

  drivers: {
    title: "Key Drivers (핵심 요인) 이게 뭐야?",
    body: (
      <>
        <Sec>🔍 AI가 "왜 그렇게 생각했는지" 이유를 알려줘요!</Sec>
        <p>시험 볼 때 "왜 이 답 골랐어?" 설명하는 것처럼, AI도 <span className={H.bold}>가장 중요한 이유</span>를 보여줘요.</p>
        <Box>
          <p><span className={H.bold}>막대 길이</span> = 얼마나 중요한 이유인지 (길수록 중요!)</p>
          <p><span className={H.green}>BULLISH (초록)</span> = "이 신호는 오른다는 뜻이에요"</p>
          <p><span className={H.red}>BEARISH (빨강)</span> = "이 신호는 내린다는 뜻이에요"</p>
        </Box>
        <Sec>자주 나오는 이유들</Sec>
        <Box>
          <p><span className={H.bold}>spy_return_10d</span> — 최근 10일 수익률</p>
          <p><span className={H.bold}>spy_rsi14</span> — 과열/침체 지표 (RSI)</p>
          <p><span className={H.bold}>vix_value</span> — 공포 지수</p>
          <p><span className={H.bold}>spy_price_vs_20ma</span> — 20일 평균선 위/아래</p>
        </Box>
      </>
    ),
  },

  composite_score: {
    title: "Composite Score (종합 점수) 이게 뭐야?",
    body: (
      <>
        <Sec>🏅 6가지 점수를 합친 최종 성적이에요!</Sec>
        <p>주식을 6가지 방법으로 평가해서 하나의 점수로 합쳐요. 점수가 높을수록 지금 사기 좋은 주식이에요.</p>
        <Box>
          <p><span className={H.bold}>기술 분석 25%</span> + <span className={H.bold}>기업 가치 20%</span></p>
          <p><span className={H.bold}>전문가 의견 15%</span> + <span className={H.bold}>상대 강도 15%</span></p>
          <p><span className={H.bold}>기관 매집 10%</span> + <span className={H.bold}>모멘텀 5%</span> + <span className={H.bold}>거래량 5%</span> + <span className={H.bold}>단기 반전 5%</span></p>
        </Box>
        <Sec>색상 기준 (Grade 경계와 정렬)</Sec>
        <Box>
          <p><span className={H.green}>75점 이상</span> = A등급 · 강한 매수 후보 🟢</p>
          <p><span className={H.green}>62~74점</span> = B등급 · 양호한 매수 후보 🟢</p>
          <p><span className={H.yellow}>48~61점</span> = C등급 · 중립 / 관망 🟡</p>
          <p><span className={H.red}>35~47점</span> = D등급 · 주의 🔴</p>
          <p><span className={H.red}>35점 미만</span> = F등급 · 회피 🔴</p>
        </Box>
        <p className="text-[11px]">A·B = 녹색(매수 후보), C = 노란색(관망), D·F = 빨간색(회피). 전 페이지에서 동일 기준을 사용해요.</p>
      </>
    ),
  },

  technical_score: {
    title: "Technical Score (기술 분석) 이게 뭐야?",
    body: (
      <>
        <Sec>📈 주가 그래프를 보고 매기는 점수예요!</Sec>
        <p>주식의 가격이 어떻게 움직이는지 <span className={H.bold}>패턴을 분석</span>해서 점수를 줘요.</p>
        <Box>
          <p><span className={H.bold}>RSI</span> — 주식이 너무 많이 올랐는지(과열), 너무 떨어졌는지(침체) 확인</p>
          <p><span className={H.bold}>이동평균선</span> — 평균 가격보다 위에 있으면 좋은 신호</p>
          <p><span className={H.bold}>모멘텀</span> — 요즘 빠르게 오르고 있는지 확인</p>
        </Box>
        <Box>
          <p><span className={H.green}>62점 이상</span> = 그래프 강세 🚀 매수 유리</p>
          <p><span className={H.yellow}>48~61점</span> = 중립 — 참고용으로 봐요</p>
          <p><span className={H.red}>48점 미만</span> = 그래프가 약해요 ⚠️ 지금은 조심</p>
        </Box>
        <p className="text-[11px]">전 페이지 공통 색상 기준: A·B(녹) / C(노랑) / D·F(빨강)</p>
      </>
    ),
  },

  fundamental_score: {
    title: "Fundamental Score (기업 가치) 이게 뭐야?",
    body: (
      <>
        <Sec>🏭 회사가 얼마나 잘 운영되는지 보는 점수예요!</Sec>
        <p>주가 그래프가 아니라 <span className={H.bold}>회사 자체가 좋은지</span> 평가해요.</p>
        <Box>
          <p><span className={H.bold}>수익성</span> — 회사가 돈을 잘 버나요?</p>
          <p><span className={H.bold}>성장성</span> — 매출이 늘어나고 있나요?</p>
          <p><span className={H.bold}>재무 건전성</span> — 빚이 너무 많지 않나요?</p>
        </Box>
        <Box>
          <p><span className={H.green}>62점 이상</span> = 재무 우량 💪 A·B 등급에 기여</p>
          <p><span className={H.yellow}>48~61점</span> = 보통 — 특별히 좋지도 나쁘지도 않아요</p>
          <p><span className={H.red}>48점 미만</span> = 재무 약함 ⚠️ 리스크 주의</p>
        </Box>
        <p className="text-[11px]">전 페이지 공통 색상 기준: A·B(녹) / C(노랑) / D·F(빨강)</p>
      </>
    ),
  },

  analyst_score: {
    title: "Analyst Score (전문가 의견) 이게 뭐야?",
    body: (
      <>
        <Sec>👨‍💼 주식 전문가들의 의견을 모은 점수예요!</Sec>
        <p>월가(미국 금융가)의 <span className={H.bold}>전문 분석가들</span>이 이 주식을 어떻게 평가하는지 반영해요.</p>
        <Box>
          <p><span className={H.green}>Buy (매수 추천)</span> = "이 주식 사세요!" 라고 말한 전문가가 많을수록 점수↑</p>
          <p><span className={H.yellow}>Hold (보유)</span> = "그냥 갖고 있어요"</p>
          <p><span className={H.red}>Sell (매도)</span> = "팔아요!" 라고 말하면 점수↓</p>
        </Box>
        <Sec>점수 기준</Sec>
        <Box>
          <p><span className={H.green}>62점 이상</span> = BUY 의견 다수 🎯 긍정</p>
          <p><span className={H.yellow}>48~61점</span> = BUY/HOLD 혼재 — 만장일치 아님</p>
          <p><span className={H.red}>48점 미만</span> = HOLD/SELL 많음 ⚠️ 신뢰도 낮음</p>
        </Box>
        <p className="text-[11px]">전 페이지 공통 색상 기준: A·B(녹) / C(노랑) / D·F(빨강)</p>
      </>
    ),
  },

  rs_score: {
    title: "RS Score (상대 강도 점수) 이게 뭐야?",
    body: (
      <>
        <Sec>🏃 달리기 대회에서 몇 등인지 보는 점수예요!</Sec>
        <p>이 주식이 <span className={H.bold}>미국 시장 전체와 비교해서 얼마나 잘하는지</span> 봐요.</p>
        <Box>
          <p><span className={H.bold}>0~100점</span>으로 표시해요</p>
          <p><span className={H.green}>80점 이상</span> = 시장보다 훨씬 잘하고 있어요 🏆</p>
          <p><span className={H.yellow}>50점 근처</span> = 시장이랑 비슷해요</p>
          <p><span className={H.red}>20점 이하</span> = 시장보다 많이 뒤처져 있어요</p>
        </Box>
        <p className="text-[11px]">달리기 선수 100명 중에서 내가 80등이면 RS Score = 80이에요!</p>
      </>
    ),
  },

  volume_score: {
    title: "Volume Score (거래량 점수) 이게 뭐야?",
    body: (
      <>
        <Sec>📦 얼마나 많이 사고파는지 보는 점수예요!</Sec>
        <p>주식 시장에서 <span className={H.bold}>많은 사람이 관심 갖는 주식</span>일수록 거래량이 많아요.</p>
        <Box>
          <p><span className={H.bold}>거래량이 많다</span> = 많은 사람들이 이 주식에 관심있어요</p>
          <p><span className={H.bold}>거래량이 적다</span> = 관심 받지 못하는 주식이에요</p>
        </Box>
        <p className="text-[11px]">인기 있는 가게일수록 손님이 많은 것처럼, 좋은 주식도 거래량이 많아요!</p>
      </>
    ),
  },

  score_13f: {
    title: "13F Score (기관 투자 점수) 이게 뭐야?",
    body: (
      <>
        <Sec>🏦 큰 투자회사들이 얼마나 사고 있는지 보는 점수예요!</Sec>
        <p>미국에서는 큰 투자회사들이 <span className={H.bold}>어떤 주식을 샀는지 공개</span>(13F 보고서)해야 해요.</p>
        <Box>
          <p><span className={H.bold}>점수 높음</span> = 워런 버핏 같은 큰 투자자들이 많이 사고 있어요</p>
          <p><span className={H.bold}>점수 낮음</span> = 큰 투자자들이 별로 관심 없어요</p>
        </Box>
        <p className="text-[11px]">큰 어른들이 좋다고 사는 주식 = 믿을 만하다는 신호예요!</p>
      </>
    ),
  },

  rs_vs_spy: {
    title: "RS vs SPY (시장 대비 수익률) 이게 뭐야?",
    body: (
      <>
        <Sec>📊 이 주식이 미국 평균보다 얼마나 잘했는지 보여줘요!</Sec>
        <p><span className={H.bold}>SPY</span>는 미국 대표 회사 500개 평균이에요 (미국 시장 성적표).</p>
        <Box>
          <p><span className={H.green}>+5%</span> = 이 주식이 미국 평균보다 5% 더 올랐어요 👍</p>
          <p><span className={H.yellow}>0%</span> = 미국 평균이랑 똑같아요</p>
          <p><span className={H.red}>-3%</span> = 이 주식이 미국 평균보다 3% 더 떨어졌어요 👎</p>
        </Box>
        <p className="text-[11px]">플러스(+)일수록 시장보다 강한 주식이에요!</p>
      </>
    ),
  },

  regime_score: {
    title: "Regime Score (시장 체온 점수) 이게 뭐야?",
    body: (
      <>
        <Sec>🌡️ 시장의 건강 점수예요!</Sec>
        <p>5개 센서(VIX, Trend, Breadth, Credit, Yield Curve)를 합쳐서 계산한 <span className={H.bold}>종합 건강 점수</span>예요.</p>
        <Box>
          <p><span className={H.green}>점수 높음 (2~3)</span> = 시장이 건강해요! ☀️</p>
          <p><span className={H.yellow}>점수 보통 (1~2)</span> = 그럭저럭이에요 ⛅</p>
          <p><span className={H.red}>점수 낮음 (0~1)</span> = 시장이 아파요 🌧️</p>
        </Box>
      </>
    ),
  },

  confidence: {
    title: "Confidence (확신도) 이게 뭐야?",
    body: (
      <>
        <Sec>🎯 "얼마나 확실한 분석이야?" 를 나타내요!</Sec>
        <p>컴퓨터가 분석 결과를 얼마나 <span className={H.bold}>확신하는지</span> 퍼센트로 보여줘요.</p>
        <Box>
          <p><span className={H.green}>90% 이상</span> = 매우 확실해요! 거의 틀림없어요</p>
          <p><span className={H.yellow}>60~90%</span> = 꽤 확실해요</p>
          <p><span className={H.red}>60% 미만</span> = 불확실해요. 조심하세요</p>
        </Box>
        <p className="text-[11px]">50%는 동전 던지기와 같아요. 높을수록 믿을 수 있어요!</p>
      </>
    ),
  },

  stop_loss: {
    title: "Stop Loss (손절 기준) 이게 뭐야?",
    body: (
      <>
        <Sec>🛑 더 크게 잃지 않으려고 미리 정해두는 선이에요!</Sec>
        <p>주식을 샀는데 이 가격만큼 내려가면 <span className={H.bold}>자동으로 팔아서 더 큰 손해를 막아요</span>.</p>
        <Box>
          <p>예) Stop Loss = <span className={H.bold}>5%</span></p>
          <p>→ 내가 10만원에 샀으면, 9만5천원이 되면 팔아요</p>
          <p>→ 더 떨어져서 5만원, 3만원이 되는 걸 막아줘요</p>
        </Box>
        <Box>
          <p><span className={H.green}>RISK ON 시장</span> → 손절선 7% (좀 더 여유있게)</p>
          <p><span className={H.yellow}>NEUTRAL 시장</span> → 손절선 6%</p>
          <p><span className={H.red}>RISK OFF 시장</span> → 손절선 5% (더 빨리 팔아요)</p>
        </Box>
        <Sec>❓ N/A가 왜 뜨나요?</Sec>
        <p>과거 날짜 리포트는 체제 계산이 안 된 경우 N/A로 표시돼요.<br />
        <span className={H.bold}>가장 최근 날짜</span>로 이동하면 정상 값이 나와요!</p>
      </>
    ),
  },

  mdd_warning: {
    title: "MDD Warning (최대 손실 경보) 이게 뭐야?",
    body: (
      <>
        <Sec>⚠️ "이만큼 잃으면 빨간불!" 이에요!</Sec>
        <p><span className={H.bold}>MDD (Maximum DrawDown)</span> = 꼭대기에서 가장 많이 내려간 % 에요.</p>
        <Box>
          <p>예) 내 주식이 100만원 → 88만원이 됐어요</p>
          <p>→ MDD = 12% (12% 내려갔어요)</p>
          <p>→ MDD Warning이 10%면 경보 울림! 🚨</p>
        </Box>
        <p className="text-[11px]">이 수치를 넘으면 "지금 시장이 좀 이상한 것 같으니 조심해요!" 라는 신호예요.</p>
        <Sec>❓ N/A가 왜 뜨나요?</Sec>
        <p>과거 날짜 리포트는 체제 계산이 안 된 경우 N/A로 표시돼요.<br />
        <span className={H.bold}>가장 최근 날짜</span>로 이동하면 정상 값이 나와요!</p>
      </>
    ),
  },

  spy_divergence: {
    title: "Volume-Price Divergence (거래량-가격 불일치) 이게 뭐야?",
    body: (
      <>
        <Sec>🔔 가격이랑 거래량이 따로 노는 것을 감지해요!</Sec>
        <p>보통 주가가 오르면 거래량도 많아요. 그런데 이게 맞지 않으면 <span className={H.bold}>이상 신호</span>예요!</p>
        <Box>
          <p><span className={H.red}>Distribution (매도세)</span> = 가격이 내리는데 거래량이 많아요 → 사람들이 무서워서 팔고 있어요 📤</p>
          <p><span className={H.green}>Climax Buy (급등)</span> = 가격이 갑자기 확 오르면서 거래량이 폭발 → 과열 주의! 📈</p>
          <p><span className="font-bold text-on-surface-variant">None</span> = 특이 신호 없음 ✅</p>
        </Box>
        <Box>
          <p><span className={H.bold}>Vol Ratio</span> = 최근 2일 거래량 ÷ 최근 20일 평균</p>
          <p>1.5 이상이면 평소보다 거래량이 많은 거예요</p>
        </Box>
      </>
    ),
  },

  ai_thesis: {
    title: "Investment Thesis (투자 근거) 이게 뭐야?",
    body: (
      <>
        <Sec>📝 AI가 왜 이 주식을 추천하는지 설명이에요!</Sec>
        <p>AI가 여러 가지 정보를 분석한 후 <span className={H.bold}>"이 주식에 투자해야 하는 이유"</span>를 요약해줘요.</p>
        <Box>
          <p>뉴스, 실적, 시장 위치, 기술적 신호 등을 종합해서</p>
          <p>가장 중요한 이유를 2~3문장으로 알려줘요</p>
        </Box>
        <p className="text-[11px]">어디까지나 AI의 분석이에요. 최종 판단은 항상 본인이 해야 해요!</p>
      </>
    ),
  },

  catalysts: {
    title: "Bull Catalysts (상승 촉매) 이게 뭐야?",
    body: (
      <>
        <Sec>🚀 주가를 올릴 수 있는 좋은 이유들이에요!</Sec>
        <p><span className={H.bold}>Catalyst(촉매)</span>는 화학 시간에 배운 것처럼, 반응을 더 빠르게 만드는 거예요.<br />
        주식에서는 주가를 <span className={H.green}>더 빨리 오르게 만드는 사건들</span>이에요.</p>
        <Box>
          <p>예) 새 제품 출시, 좋은 실적 발표, 정부 지원, 경쟁사 문제 등</p>
        </Box>
        <p className="text-[11px]">이 이유들이 실현되면 주가가 오를 수 있어요!</p>
      </>
    ),
  },

  bear_cases: {
    title: "Bear Risks (하락 위험) 이게 뭐야?",
    body: (
      <>
        <Sec>⚠️ 주가를 내릴 수 있는 나쁜 이유들이에요!</Sec>
        <p><span className={H.red}>Bear(곰)</span>는 주가가 내릴 때를 뜻해요.<br />
        Bear Risk = <span className={H.bold}>주가를 내릴 수 있는 위험 요소</span>들이에요.</p>
        <Box>
          <p>예) 실적 부진 위험, 경쟁 심화, 규제, 경기 침체 등</p>
        </Box>
        <p className="text-[11px]">이런 위험을 알고 투자해야 손해를 줄일 수 있어요!</p>
      </>
    ),
  },

  probability: {
    title: "Probability (오를 확률) 이게 뭐야?",
    body: (
      <>
        <Sec>🎲 다음 5일 동안 오를 가능성이에요!</Sec>
        <p>AI가 계산한 <span className={H.bold}>"올라갈 확률"</span>이에요.</p>
        <Box>
          <p><span className={H.green}>70% 이상</span> = "꽤 오를 것 같아요!" 기대해볼 만해요</p>
          <p><span className={H.yellow}>50% 근처</span> = "반반이에요" 잘 모르겠어요</p>
          <p><span className={H.red}>30% 이하</span> = "내릴 것 같아요" 조심하세요</p>
        </Box>
        <p className="text-[11px]">50%는 동전 던지기랑 같아요. 70% 이상이면 AI가 오를 거라고 꽤 확신하는 거예요!</p>
      </>
    ),
  },

  performance: {
    title: "Performance (성과 시뮬레이터) 이게 뭐야?",
    body: (
      <>
        <Sec>💰 "그날 샀으면 얼마나 벌었을까?" 시뮬레이션이에요!</Sec>
        <p>각 날짜에 추천 종목들을 <span className={H.bold}>똑같은 금액씩 나눠서 샀다면</span> 지금 얼마가 됐는지 계산해줘요.</p>
        <Box>
          <p><span className={H.bold}>Entry Date</span> = 이 날짜에 샀어요</p>
          <p><span className={H.bold}>Return</span> = 지금까지 수익률 (+면 이익, -면 손실)</p>
          <p><span className={H.bold}>vs SPY</span> = 미국 시장 평균보다 얼마나 잘했는지</p>
        </Box>
        <p className="text-[11px]">실제 투자가 아니에요! 참고용 시뮬레이션이에요.</p>
      </>
    ),
  },

  ai_insight: {
    title: "AI Insight (AI 시장 요약) 이게 뭐야?",
    body: (
      <>
        <Sec>🤖 AI가 지금 시장을 한 줄로 요약해줘요!</Sec>
        <p>뉴스·지표·체제 데이터를 종합해서 AI가 <span className={H.bold}>"지금 시장이 어떤 상황인지"</span> 설명해줘요.</p>
        <Box>
          <p><span className={H.green}>Market expansion</span> = 시장이 넓게 상승 중 (좋은 신호!) ✅</p>
          <p><span className={H.yellow}>Consolidating before expansion</span> = 잠깐 쉬다가 오를 것 같아요 ⚠️</p>
          <p><span className={H.red}>Risk-off environment</span> = 투자 조심 시기 ❌</p>
        </Box>
        <p className="text-[11px]">AI Analysis 페이지에서 종목별 더 자세한 논거를 볼 수 있어요!</p>
      </>
    ),
  },

  vix: {
    title: "VIX (공포 지수) — 가중치 30%",
    body: (
      <>
        <Sec>😱 사람들이 얼마나 무서워하는지 측정해요!</Sec>
        <p><span className={H.bold}>VIX</span>는 시장에서 앞으로 한 달간 변동성을 예상하는 지수예요. 숫자가 높을수록 공포가 큰 거예요.</p>
        <Box>
          <p><span className={H.green}>VIX 20 미만</span> = 안심! 여유로운 상태예요 😌 → RISK ON</p>
          <p><span className={H.yellow}>VIX 20~30</span> = 긴장하기 시작했어요 😐 → NEUTRAL</p>
          <p><span className={H.red}>VIX 30 이상</span> = 모두가 겁에 질려있어요 😱 → RISK OFF</p>
        </Box>
        <p className="text-[11px]">⚡ 5개 센서 중 가장 중요해요 (30%). 공포 지수가 갑자기 치솟으면 시장 위험 신호!</p>
      </>
    ),
  },

  trend: {
    title: "Trend (추세 센서) — 가중치 25%",
    body: (
      <>
        <Sec>📈 주가가 오르는 방향인지 내리는 방향인지 확인해요!</Sec>
        <p>S&P 500 (SPY) 주가를 <span className={H.bold}>50일·200일 이동평균선</span>과 비교해요.</p>
        <Box>
          <p><span className={H.green}>RISK ON</span> = SPY가 50일·200일 평균 모두 위 ✅ "추세 좋아요"</p>
          <p><span className={H.yellow}>NEUTRAL</span> = 200일 평균은 위, 50일 평균은 아래 — 흔들리는 중</p>
          <p><span className={H.red}>RISK OFF</span> = 200일 평균 아래로 내려감 ❌ "하락 추세예요"</p>
        </Box>
        <p className="text-[11px]">가중치: 25% — "지금 상승 중인지, 하락 중인지" 기본 방향을 알려줘요</p>
      </>
    ),
  },

  breadth: {
    title: "Breadth (시장 폭) — 가중치 18%",
    body: (
      <>
        <Sec>🌊 전체 주식이 고르게 오르고 있는지 봐요!</Sec>
        <p>일부 대형주만 오르는지, <span className={H.bold}>500개 주식이 전반적으로 오르는지</span> 확인해요.</p>
        <Box>
          <p><span className={H.bold}>RSP</span> = 500개 주식 동일 비중 ETF (중소형주 반영)</p>
          <p><span className={H.bold}>SPY</span> = 대형주 위주 ETF (애플·MS·엔비디아 비중 큼)</p>
        </Box>
        <Box>
          <p><span className={H.green}>RSP &gt; SPY</span> = 전체 시장이 고르게 상승 → RISK ON ✅</p>
          <p><span className={H.yellow}>비슷</span> = 보통 → NEUTRAL</p>
          <p><span className={H.red}>RSP &lt; SPY</span> = 대형주만 오르는 중, 시장 폭 좁음 → RISK OFF ❌</p>
        </Box>
        <p className="text-[11px]">가중치: 18%</p>
      </>
    ),
  },

  credit: {
    title: "Credit (신용 센서) — 가중치 15%",
    body: (
      <>
        <Sec>💳 투자자들이 위험한 투자를 선호하는지 봐요!</Sec>
        <p>사람들이 <span className={H.bold}>안전한 국채</span>를 선호하는지, <span className={H.bold}>위험한 회사채</span>를 선호하는지로 투자 심리를 파악해요.</p>
        <Box>
          <p><span className={H.bold}>HYG</span> = 위험한 회사채 ETF (고수익·고위험)</p>
          <p><span className={H.bold}>IEF</span> = 안전한 7~10년 국채 ETF (저위험)</p>
        </Box>
        <Box>
          <p><span className={H.green}>HYG 강세</span> = "위험해도 더 벌겠다!" 공격적 → RISK ON ✅</p>
          <p><span className={H.yellow}>비슷</span> = 관망 중 → NEUTRAL</p>
          <p><span className={H.red}>IEF 강세</span> = "안전하게 피신하자!" 방어적 → RISK OFF ❌</p>
        </Box>
        <p className="text-[11px]">가중치: 15%</p>
      </>
    ),
  },

  yield_curve: {
    title: "Yield Curve (금리 곡선) — 가중치 12%",
    body: (
      <>
        <Sec>📉 단기·장기 이자율 차이로 경기를 예측해요!</Sec>
        <p>보통 장기 금리가 단기 금리보다 높아요. 이게 <span className={H.bold}>뒤집히면 (역전되면) 경기침체 경고</span>예요!</p>
        <Box>
          <p><span className={H.bold}>10년 금리 - 단기 금리</span> = 금리 차이</p>
          <p><span className={H.green}>차이 + (양수)</span> = 정상! 경기 좋아요 → RISK ON ✅</p>
          <p><span className={H.yellow}>차이 0 근처</span> = 주의 구간 → NEUTRAL</p>
          <p><span className={H.red}>차이 - (음수) 역전!</span> = 경기침체 경고 🚨 → RISK OFF ❌</p>
        </Box>
        <p className="text-[11px]">가중치: 12% — 과거 경기침체 전에 항상 금리 역전이 먼저 일어났어요!</p>
      </>
    ),
  },

  risk_alert: {
    title: "Risk Alert (리스크 알림) 이게 뭐야?",
    body: (
      <>
        <Sec>🛡️ 내 돈을 지키는 골키퍼예요!</Sec>
        <p>"뭘 살까"만 알려주는 게 아니라, <span className={H.bold}>"언제 팔까, 얼마나 살까, 위험이 얼마인가"</span>까지 알려줘요.</p>
        <Box>
          <p><span className={H.red}>CRITICAL</span> = 즉시 행동 필요! 손절선 돌파 등 🚨</p>
          <p><span className={H.yellow}>WARNING</span> = 주의 관찰! 위험 근접 ⚠️</p>
          <p><span className={H.green}>INFO</span> = 참고 사항 ℹ️</p>
        </Box>
        <Sec>뭘 체크하나요?</Sec>
        <Box>
          <p><span className={H.bold}>Stop-Loss</span> — 손절선 돌파/근접 확인</p>
          <p><span className={H.bold}>VaR</span> — 포트폴리오 전체 위험도</p>
          <p><span className={H.bold}>포지션 사이징</span> — 종목별 투자 비중</p>
          <p><span className={H.bold}>집중도</span> — 한 섹터에 몰빵 여부</p>
        </Box>
      </>
    ),
  },

  position_sizing: {
    title: "Position Sizing (포지션 사이징) 이게 뭐야?",
    body: (
      <>
        <Sec>⚖️ "얼마나 살 것인가"를 정하는 거예요!</Sec>
        <p>좋은 종목이라도 <span className={H.bold}>너무 많이 사면 위험</span>해요. 3단계로 비중을 조절해요.</p>
        <Box>
          <p><span className={H.bold}>1단계 Grade 조정</span> — A등급은 많이, D등급은 적게</p>
          <p><span className={H.bold}>2단계 Regime 조정</span> — 위기 시 전체 줄이기</p>
          <p><span className={H.bold}>3단계 Verdict 상한</span> — STOP이면 0%, CAUTION이면 50% 상한</p>
        </Box>
        <Box>
          <p><span className={H.green}>GO</span> → 제한 없이 투자 가능</p>
          <p><span className={H.yellow}>CAUTION</span> → 최대 50%만 투자, 나머지 현금</p>
          <p><span className={H.red}>STOP</span> → 전액 현금! 투자 0%</p>
        </Box>
      </>
    ),
  },

  var_risk: {
    title: "VaR (위험 가치) 이게 뭐야?",
    body: (
      <>
        <Sec>📉 "최악의 경우 얼마나 잃을 수 있나?"예요!</Sec>
        <p><span className={H.bold}>Value at Risk (VaR)</span> = 5일 동안 95% 확률로 최대 이만큼 잃을 수 있다는 뜻이에요.</p>
        <Box>
          <p>예) VaR = <span className={H.bold}>$3,200</span></p>
          <p>→ "5일 동안 $3,200 이상 잃을 확률은 5%밖에 안 돼요"</p>
          <p>→ 반대로, $3,200까지는 잃을 수 있다는 뜻!</p>
        </Box>
        <Sec>리스크 예산</Sec>
        <Box>
          <p><span className={H.green}>OK</span> = VaR이 포트폴리오의 5% 이내 ✅</p>
          <p><span className={H.yellow}>WARNING</span> = 5%에 근접 (80% 이상) ⚠️</p>
          <p><span className={H.red}>EXCEEDED</span> = 5% 초과! 포지션 줄여야 해요 🚨</p>
        </Box>
      </>
    ),
  },

  trailing_stop: {
    title: "Trailing Stop (추적 손절) 이게 뭐야?",
    body: (
      <>
        <Sec>📈 수익을 보호하는 자동 안전장치예요!</Sec>
        <p>가격이 오를수록 <span className={H.bold}>손절선도 같이 올라가서</span> 이미 번 수익을 보호해요.</p>
        <Box>
          <p><span className={H.bold}>Fixed Stop (고정 손절)</span></p>
          <p>→ 진입가 기준으로 일정 % 하락하면 매도</p>
          <p>→ 예: 100에 매수, -8%면 92에서 매도</p>
        </Box>
        <Box>
          <p><span className={H.bold}>Trailing Stop (추적 손절)</span></p>
          <p>→ 최고가 기준으로 일정 % 하락하면 매도</p>
          <p>→ 예: 100 매수 → 120 상승 → -4%면 115에서 매도</p>
          <p>→ 수익 15%를 보호! (고정 손절은 92까지 기다림)</p>
        </Box>
        <Box>
          <p><span className={H.red}>BREACHED</span> = 손절선 돌파! 매도 검토 🚨</p>
          <p><span className={H.yellow}>WARNING</span> = 손절선에 근접 (2% 이내) ⚠️</p>
          <p><span className={H.green}>OK</span> = 안전 구간 ✅</p>
        </Box>
      </>
    ),
  },

  concentration: {
    title: "Concentration Risk (집중 위험) 이게 뭐야?",
    body: (
      <>
        <Sec>🎯 한 바구니에 계란을 몰아넣으면 위험해요!</Sec>
        <p>같은 업종(섹터)이나 비슷한 주식에 <span className={H.bold}>너무 몰아서 투자</span>하면 위험해요.</p>
        <Box>
          <p><span className={H.bold}>섹터 집중도</span> — 한 섹터 40% 초과하면 경고</p>
          <p><span className={H.bold}>상관관계</span> — 같이 오르내리는 종목이 많으면 경고</p>
        </Box>
        <Box>
          <p>예) Technology 종목이 45%면?</p>
          <p>→ "기술주 폭락하면 포트폴리오 절반이 위험!" ⚠️</p>
          <p>→ 다른 섹터로 분산 필요</p>
        </Box>
      </>
    ),
  },

  risk_rank: {
    title: "리스크 순위 이게 뭐야?",
    body: (
      <>
        <Sec>🏆 심각도 순위예요!</Sec>
        <p>리스크 알림을 <span className={H.bold}>심각한 순서대로</span> 번호를 매긴 거예요.</p>
        <Box>
          <p><span className={H.bold}>1번</span> = 지금 당장 가장 위험한 항목이에요</p>
          <p><span className={H.bold}>CRITICAL</span> 먼저, 그다음 <span className={H.bold}>WARNING</span>, 마지막에 <span className={H.bold}>INFO</span> 순서예요</p>
        </Box>
        <p className="text-[11px]">숫자가 작을수록 더 급한 신호예요!</p>
      </>
    ),
  },

  risk_action: {
    title: "권장 행동 이게 뭐야?",
    body: (
      <>
        <Sec>🎯 어떻게 해야 하는지 알려줘요!</Sec>
        <Box>
          <p><span className={H.bold}>SELL</span> 🔴 = 즉시 매도 고려. 손절 기준을 넘었어요</p>
          <p><span className={H.bold}>REDUCE</span> 🟠 = 비중 줄이기. 리스크가 한도를 초과했어요</p>
          <p><span className={H.bold}>REVIEW</span> 🟡 = 스트레스 시나리오 점검 필요해요</p>
          <p><span className={H.bold}>MONITOR</span> ⚪ = 계속 지켜보기. 아직 행동 불필요해요</p>
        </Box>
        <p className="text-[11px]">SELL/REDUCE는 즉각 확인이 필요한 신호예요!</p>
      </>
    ),
  },

  graph: {
    title: "System Knowledge Graph 이게 뭐야?",
    body: (
      <>
        <Sec>🕸️ 이 시스템이 어떻게 돌아가는지 지도예요!</Sec>
        <p>주식 분석을 위해 수십 개의 부품이 서로 연결되어 동작해요.<br />
        이 그래프는 <span className={H.bold}>"어떤 데이터가 어디서 와서 무엇을 만드는지"</span>를 한눈에 보여줘요.</p>
        <Sec>탭 3가지</Sec>
        <Box>
          <p><span className={H.bold}>시스템 아키텍처</span> — 데이터 수집→분석→신호→출력→페이지 흐름</p>
          <p><span className={H.bold}>종목 네트워크</span> — Top Pick 종목들의 섹터·상관관계</p>
          <p><span className={H.bold}>종목-시장 관계</span> — 시장 신호가 각 종목 투자 판단에 미치는 영향</p>
        </Box>
        <Sec>색상 읽는 법 (종목-시장 관계 탭)</Sec>
        <Box>
          <p><span className={H.green}>초록 노드</span> = 시장/종목 상태 좋음 (BULLISH / GO / Grade A)</p>
          <p><span className={H.yellow}>노란 노드</span> = 중립 또는 주의 (NEUTRAL / CAUTION / Grade C)</p>
          <p><span className={H.red}>빨간 노드</span> = 위험 신호 (BEARISH / STOP / Grade F)</p>
          <p><span className="text-[#a78bfa] font-bold">보라 노드 (AI Builder)</span> = 분석 에이전트 실행 포털</p>
        </Box>
        <Sec>화살표 읽는 법</Sec>
        <Box>
          <p>화살표 방향 = 데이터/영향이 흐르는 방향이에요</p>
          <p>예) REGIME → NVDA = "시장 체제가 NVDA 투자 판단에 영향을 줘요"</p>
          <p>예) NVDA → AI Analysis = "NVDA 분석 결과가 AI Analysis 페이지에 표시돼요"</p>
        </Box>
        <p className="text-[11px]">노드를 클릭하면 오른쪽에 상세 정보와 연결 관계 설명이 나와요!</p>
      </>
    ),
  },

  smart_money_screening: {
    title: "Smart Money Top 10 — 어떻게 선정했어?",
    body: (
      <>
        <Sec>🏦 503개 종목 중 기관도 탐내는 10종목만 골라요!</Sec>
        <p>S&P 500 전종목(503개)을 <span className={H.bold}>8가지 팩터</span>로 평가해 복합 점수를 계산한 뒤, 업종 편중을 막고 상위 10개를 선정해요.</p>
        <Sec>8가지 팩터 (실제 가중치)</Sec>
        <Box>
          <p><span className={H.bold}>기술 분석 25%</span> — RSI·MACD·이동평균·골든크로스</p>
          <p><span className={H.bold}>기업 가치 20%</span> — P/E·성장률·ROE·Piotroski</p>
          <p><span className={H.bold}>전문가 의견 15%</span> — 월가 컨센서스·목표가 괴리율</p>
          <p><span className={H.bold}>상대 강도 15%</span> — SPY 대비 20/60/120일 수익률</p>
          <p><span className={H.bold}>기관 매집 10%</span> — 13F 공시 기반 기관 순매수</p>
          <p><span className={H.bold}>모멘텀 5%</span> — Jegadeesh-Titman 12-1개월 수익률</p>
          <p><span className={H.bold}>거래량 5%</span> — 비정상 거래량 Z-score</p>
          <p><span className={H.bold}>단기 반전 5%</span> — 과매도 반등 포착</p>
        </Box>
        <Sec>업종 중립화 — 쏠림 방지</Sec>
        <Box>
          <p>IT 종목이 많아 편향되지 않도록 <span className={H.bold}>업종별 Z-score 정규화</span> 적용</p>
          <p>IT 업종은 최대 5개로 제한 (나머지 업종도 공정하게 경쟁)</p>
        </Box>
        <Sec>등급 기준</Sec>
        <Box>
          <p><span className={H.green}>A (80점+)</span> = 강력 매집 신호 — 기관이 적극 매수 중</p>
          <p><span className={H.yellow}>B (65~79점)</span> = 매집 초기 — 관심 가져볼 만해요</p>
          <p><span className={H.yellow}>C (50~64점)</span> = 중립 — 추가 확인 필요해요</p>
          <p><span className={H.red}>D/F (50점 미만)</span> = 주의 — 지금은 진입 자제</p>
        </Box>
        <Sec>왜 Smart Money 전략인가?</Sec>
        <Box>
          <p>기관 매집 신호 + 기술적 타이밍 + AI 분석을 결합해</p>
          <p>개인 투자자가 혼자 복제하기 어려운 <span className={H.bold}>멀티팩터 필터링</span>이에요</p>
          <p>뉴스나 유튜브 추천과 달리 <span className={H.green}>데이터 기반 객관적 스크리닝</span>이에요</p>
        </Box>
      </>
    ),
  },

  api_costs: {
    title: "API Costs (AI 사용 비용) 이게 뭐야?",
    body: (
      <>
        <Sec>💳 이 시스템이 AI를 쓰는 데 드는 돈이에요!</Sec>
        <p>주식 분석을 위해 <span className={H.bold}>3가지 AI 서비스</span>를 사용해요.</p>
        <Box>
          <p><span className={H.bold}>Gemini Flash</span> = 구글의 AI. 빠르고 저렴해요</p>
          <p><span className={H.bold}>GPT-5-mini</span> = OpenAI의 AI. 글을 잘 써요</p>
          <p><span className={H.bold}>Perplexity Sonar</span> = 인터넷 검색 AI. 최신 뉴스를 찾아요</p>
        </Box>
        <p className="text-[11px]">종목 10개 분석에 약 $0.04 (약 50원) 정도 들어요. 정말 저렴해요!</p>
      </>
    ),
  },
};

// ── ValueInterpretation — 실제 값이 어느 범주인지 팝업 상단에 표시 ────────────

function ValueInterpretation({ topic, value }: { topic: string; value?: number | string }) {
  if (value == null) return null;

  let content: React.ReactNode = null;

  if (topic === "confidence" && typeof value === "number") {
    const cls = value >= 90 ? H.green : value >= 60 ? H.yellow : H.red;
    const label = value >= 90 ? "높음 ✅" : value >= 60 ? "보통 ⚠️" : "낮음 ❌";
    const msg = value >= 90 ? "거의 틀림없어요" : value >= 60 ? "꽤 확실해요" : "불확실해요, 조심하세요";
    content = <p>현재 신뢰도: <span className={cls}>{value}%</span> → <span className={cls}>{label}</span> — {msg}</p>;
  }

  if ((topic === "regime" || topic === "regime_score") && typeof value === "number") {
    const cls = value >= 2 ? H.green : value >= 1 ? H.yellow : H.red;
    const label = value >= 2 ? "RISK ON ✅ 투자하기 좋아요" : value >= 1 ? "NEUTRAL ⚠️ 보통이에요" : "RISK OFF ❌ 조심하세요";
    content = <p>현재 Regime Score: <span className={cls}>{value}</span> → <span className={cls}>{label}</span></p>;
  }

  if (topic === "picks" && typeof value === "number") {
    const cls = value >= 30 ? H.green : value >= 10 ? H.yellow : H.red;
    const hint = value >= 30 ? "시장이 좋아요! 종목이 많아요 ✅" : value >= 10 ? "보통이에요" : "오늘은 통과 종목이 적어요 ⚠️";
    content = <p>오늘 통과 종목: <span className={cls}>{value}개</span> — S&P 500 중 {value}개가 통과 ({hint})</p>;
  }

  if (topic === "gate" && typeof value === "string") {
    const cls = value === "GO" ? H.green : value === "STOP" ? H.red : H.yellow;
    const msg = value === "GO" ? "매수 진입 가능! ✅" : value === "STOP" ? "지금은 매수 자제 ❌" : "조심해서 소량만 ⚠️";
    content = <p>현재 Gate: <span className={cls}>{value}</span> → <span className={cls}>{msg}</span></p>;
  }

  if (topic === "ml" && typeof value === "string" && value.includes(":")) {
    const [dir, pctStr] = value.split(":");
    const pct = parseFloat(pctStr);
    const isBullish = dir === "bullish";
    const dirCls = isBullish ? H.green : H.red;
    const dirLabel = isBullish ? "BULLISH ▲" : "BEARISH ▼";
    const confCls = pct >= 70 ? H.green : pct >= 50 ? H.yellow : H.red;
    const confLabel = pct >= 70 ? "높음" : pct >= 50 ? "보통" : "낮음";
    const combo = isBullish && pct >= 70
      ? "AI가 '오를 것 같아!'를 매우 확신해요 ✅"
      : !isBullish && pct >= 70
      ? "AI가 '내릴 것 같아!'를 매우 확신해요 ⚠️ — BEARISH를 확신하는 상태예요"
      : isBullish
      ? "AI가 '오를 것 같긴 한데...' 확신은 낮아요"
      : "AI가 '내릴 것 같긴 한데...' 확신도 낮아요";
    content = (
      <>
        <p>현재: <span className={dirCls}>{dirLabel}</span> + 신뢰도 <span className={confCls}>{pct}% ({confLabel})</span></p>
        <p className="mt-1 text-on-surface">{combo}</p>
      </>
    );
  } else if (topic === "ml" && typeof value === "number") {
    const cls = value >= 70 ? H.green : value >= 50 ? H.yellow : H.red;
    const label = value >= 70 ? "높음 ✅ 신호 믿어도 돼요" : value >= 50 ? "보통 ⚠️ 다른 신호도 참고하세요" : "낮음 ❌ 이번 예측은 불확실해요";
    content = <p>현재 신뢰도: <span className={cls}>{value}%</span> → <span className={cls}>{label}</span></p>;
  }

  if (!content) return null;

  return (
    <div className="bg-primary/10 border border-primary/25 rounded-lg px-4 py-3 mb-4 text-xs">
      <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-1">📍 지금 이 값이 의미하는 것</p>
      {content}
    </div>
  );
}

// ── HelpBtn 컴포넌트 ──────────────────────────────────────────────────────────

type Topic = keyof typeof HELP_DATA;

export function HelpBtn({ topic, value }: { topic: Topic; value?: number | string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const data = HELP_DATA[topic];
  if (!data) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-outline-variant/40 text-on-surface-variant/60 text-[9px] font-black hover:border-primary hover:text-primary hover:bg-primary/10 transition-all ml-1 flex-shrink-0 leading-none"
        aria-label="도움말"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface-container-low border border-outline-variant/20 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10 sticky top-0 bg-surface-container-low">
              <h3 className="text-sm font-bold text-on-surface pr-4">{data.title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-container-high text-on-surface-variant text-xl leading-none flex-shrink-0 transition-colors"
              >
                ×
              </button>
            </div>
            {/* Body */}
            <div className="px-5 py-4 text-sm text-on-surface-variant leading-relaxed">
              <ValueInterpretation topic={topic} value={value} />
              {data.body}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
