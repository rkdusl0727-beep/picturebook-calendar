# 보안 원칙

이 프로젝트에서 가장 중요한 보안 원칙은 네이버 개발자 API의 `Client ID`와 `Client Secret`을 브라우저 코드와 GitHub 저장소에 넣지 않는 것입니다.

## 안전한 구조

```text
브라우저
  -> /api/search-books
  -> Netlify Function
  -> 네이버 책 검색 API
```

브라우저는 `/api/search-books`만 호출합니다. 네이버 API 인증 헤더는 `netlify/functions/search-books.mjs` 안에서만 붙습니다.

## 환경변수

로컬 개발:

```bash
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```

Netlify 배포:

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

위 두 값은 Netlify의 Environment variables에만 등록합니다.

## 네이버 API 호출 한도

네이버 공식 문서 기준 검색 API의 하루 호출 한도는 `25,000회`입니다. 이 웹앱은 그림책 제목 하나를 자동 검색할 때 보통 한 번 호출하므로, 월간 달력 한 장을 만드는 데 필요한 호출량은 입력한 책 권수와 거의 같습니다.

호출량보다 중요한 보안 포인트는 실제 `Client ID`와 `Client Secret`이 브라우저 코드, GitHub, 화면 캡처, 문서에 노출되지 않게 관리하는 것입니다.

## GitHub에 올리면 안 되는 것

- `.env`
- 네이버 Client ID 원문
- 네이버 Client Secret 원문
- API 키가 포함된 스크린샷이나 메모 파일
- 실제 키가 들어간 `.txt`, `.md`, `.json`, `.csv` 파일

`.gitignore`에 `.env`가 포함되어 있으므로 일반적인 커밋에는 올라가지 않습니다.

## 확인 방법

커밋 전에 아래 검색으로 실제 키가 들어갔는지 확인합니다.

```bash
rg -n "NAVER_CLIENT_ID|NAVER_CLIENT_SECRET|X-Naver-Client-Secret|your_real_key|your_real_secret" .
```

환경변수 이름은 코드에 남아도 괜찮지만, 실제 발급값은 저장소에 들어가면 안 됩니다.

## 현재 보안 처리

- 네이버 API 호출은 Netlify Function에서만 수행
- 브라우저에는 검색 결과만 반환
- 네이버 인증 헤더는 응답으로 반환하지 않음
- `.env`는 Git 제외
- API 응답은 `cache-control: no-store`
- 과도한 검색어 길이는 차단
