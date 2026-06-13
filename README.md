# 그림책 달력 자동화 웹앱

매달 그림책 달력을 만드는 웹앱입니다. 날짜와 그림책 제목을 입력하면 네이버 책 검색 API로 표지를 자동 검색해서 달력 날짜 칸에 배치하고, 완성된 달력을 PNG 이미지로 다운로드할 수 있습니다.

## 핵심 보안 구조

네이버 개발자 API의 `Client ID`와 `Client Secret`은 브라우저 코드에 넣지 않습니다.

```text
브라우저
  -> /api/search-books
  -> Netlify Function
  -> 네이버 책 검색 API
```

브라우저는 Netlify Function만 호출하고, 네이버 인증 헤더는 서버리스 함수에서만 붙습니다. 실제 키는 `.env` 또는 Netlify 환경변수에만 둡니다.

## 네이버 API 호출량

네이버 책 검색은 네이버 검색 API에 포함되며, 공식 문서 기준 하루 호출 한도는 `25,000회`입니다.

이 웹앱에서는 그림책 제목 한 줄을 자동 표지 검색할 때 보통 API 1회를 사용합니다.

예:

- 30권 자동 입력: 약 30회 호출
- 같은 달을 다시 자동 입력: 다시 입력한 권수만큼 추가 호출

그래서 일반적인 월간 그림책 달력 제작 용도로는 호출량보다 API 키 보안 관리가 더 중요합니다.

## 사용 흐름

1. 달력 제목을 입력합니다.
2. 연도와 월을 선택합니다.
3. 달력에서 표지를 넣을 날짜를 클릭합니다.
4. 오른쪽 패널의 `그림책 제목`에 책 제목을 입력하고 `표지 검색`을 누릅니다.
5. 여러 표지 후보 중 원하는 표지를 선택합니다.
6. 선택한 표지가 해당 날짜 칸에 자동 배치됩니다.
7. `이미지 저장`을 눌러 PNG로 다운로드합니다.

여러 권을 한 번에 넣고 싶을 때는 `이번 달 그림책 목록`에 날짜와 제목을 한 줄씩 넣고 `표지 자동 입력`을 누를 수도 있습니다.

입력 예:

```text
4 프레드릭
6 괜찮아 아저씨
8 야호 슈퍼의 비밀
12 달 샤베트
```

전체 날짜도 사용할 수 있습니다.

```text
2026-06-04 프레드릭
2026-06-06 괜찮아 아저씨
```

## 파일 구조

```text
.
├── site/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── netlify/
│   └── functions/
│       └── search-books.mjs
├── scripts/
│   ├── build.mjs
│   └── local-server.mjs
├── netlify.toml
├── package.json
├── .env.example
├── SECURITY.md
└── PLAN.md
```

## 로컬 실행

`.env.example`을 참고해서 `.env`를 만듭니다.

```bash
cp .env.example .env
```

`.env`:

```bash
NAVER_CLIENT_ID=발급받은_클라이언트_ID
NAVER_CLIENT_SECRET=발급받은_클라이언트_SECRET
```

주의:

- `.env`는 절대 GitHub에 올리지 않습니다.
- `.env.example`에는 실제 키를 쓰지 않습니다.
- Netlify에는 `.env` 파일을 올리는 것이 아니라 Environment variables 화면에 값을 직접 등록합니다.

실행:

```bash
npm run dev
```

브라우저에서 `http://127.0.0.1:8888`을 엽니다.

## Netlify 배포

Netlify 설정:

- Build command: `npm run build`
- Publish directory: `site`
- Functions directory: `netlify/functions`
- Environment variables:
  - `NAVER_CLIENT_ID`
  - `NAVER_CLIENT_SECRET`

## GitHub 업로드 전 확인

`.env`는 `.gitignore`에 들어 있으므로 GitHub에 올라가지 않아야 합니다.

커밋 전 실제 키가 들어갔는지 확인합니다.

```bash
rg -n "NAVER_CLIENT_ID|NAVER_CLIENT_SECRET|X-Naver-Client-Secret" .
```

검색 결과에 환경변수 이름은 나와도 괜찮지만, 실제 발급값은 나오면 안 됩니다.
