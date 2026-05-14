# US Stock Market Intelligence

미국 주식 시장 체제, 시장 게이트, 리스크 알림, 스마트머니 스크리닝, 섹터 분석, AI 요약, 예측 히스토리, 데일리 리포트 대시보드를 제공하는 Next.js 기반 대시보드입니다.

## Local Run

```bash
npm --prefix frontend install
npm --prefix frontend run dev -- --hostname 127.0.0.1 --port 3010
```

브라우저에서 `http://127.0.0.1:3010`을 엽니다.

## Python Pipeline

Vercel이 Python 프로젝트로 오인하지 않도록 Python 의존성 파일은 `requirements-python.txt`로 둡니다.

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements-python.txt
./.venv/bin/python scripts/run_integrated_analysis.py --skip-ai --screening-limit 80
```

## GitHub에 올리기

```bash
cd "/Users/speciallon/Documents/프린들/us-stock"
git init
git add .
git commit -m "Restore us-stock market intelligence app"
git branch -M main
git remote add origin https://github.com/YOUR_ID/YOUR_REPO.git
git push -u origin main
```

`node_modules`, `.next`, `.venv`, SQLite WAL/SHM 파일은 `.gitignore`로 제외됩니다. 앱 실행에 필요한 `output/data.db`와 프론트엔드 소스는 저장소에 포함됩니다.

## Vercel 배포

GitHub 저장소를 Vercel에 Import합니다.

- Framework Preset: Next.js
- Root Directory: repository root
- Install Command: `npm run vercel-install`
- Build Command: `npm run build`
- Output Directory: `frontend/.next`

대시보드 데이터 API는 `output/data.db`를 읽습니다. 라이브 스냅샷은 Yahoo Finance chart API를 서버 라우트에서 호출합니다.

## Notes

- GitHub Pages는 이 앱에 맞지 않습니다. API 라우트, SQLite 읽기, 라이브 데이터 호출이 필요하므로 Next.js 서버 런타임이 필요합니다.
- Vercel 서버리스 환경에서 게시판 DB는 `/tmp/board.db`를 사용합니다. 서버리스 특성상 영구 게시판 저장소가 필요하면 별도 DB를 연결해야 합니다.
