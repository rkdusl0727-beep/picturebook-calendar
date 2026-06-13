const NAVER_BOOK_SEARCH_URL = 'https://openapi.naver.com/v1/search/book.json';

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return json(500, {
      error: 'NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.'
    });
  }

  const params = event.queryStringParameters || {};
  const query = String(params.query || '').trim();

  if (!query) {
    return json(400, { error: '검색어를 입력해 주세요.' });
  }

  if (query.length > 100) {
    return json(400, { error: '검색어는 100자 이하로 입력해 주세요.' });
  }

  const searchParams = new URLSearchParams({
    query,
    sort: normalizeOption(params.sort, ['sim', 'date'], 'sim'),
    start: normalizeNumber(params.start, 1, 1000, 1),
    display: normalizeNumber(params.display, 1, 100, 10)
  });

  const naverResponse = await fetch(`${NAVER_BOOK_SEARCH_URL}?${searchParams.toString()}`, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    }
  });

  const payload = await naverResponse.json().catch(() => ({}));

  if (!naverResponse.ok) {
    return json(naverResponse.status, {
      error: payload.errorMessage || payload.message || '네이버 책 검색 요청에 실패했습니다.'
    });
  }

  return json(200, {
    meta: {
      total: payload.total,
      start: payload.start,
      display: payload.display,
      lastBuildDate: payload.lastBuildDate
    },
    books: (payload.items || []).map(toBook)
  });
}

function toBook(item) {
  return {
    title: stripTags(item.title),
    authors: splitAuthors(item.author),
    publisher: item.publisher || '',
    isbn: item.isbn || '',
    thumbnail: normalizeImageUrl(item.image),
    url: item.link || '',
    contents: stripTags(item.description || ''),
    publishedAt: item.pubdate || '',
    discount: item.discount || ''
  };
}

function normalizeNumber(value, min, max, fallback) {
  const number = Number(value || fallback);
  const safe = Number.isFinite(number) ? Math.trunc(number) : fallback;
  return String(Math.min(Math.max(safe, min), max));
}

function normalizeOption(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, '');
}

function splitAuthors(value) {
  return String(value || '')
    .split('|')
    .map((author) => author.trim())
    .filter(Boolean);
}

function normalizeImageUrl(value) {
  return String(value || '').replace(/^http:\/\//, 'https://');
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}
