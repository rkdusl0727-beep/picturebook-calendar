const KAKAO_BOOK_SEARCH_URL = 'https://dapi.kakao.com/v3/search/book';

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY;

  if (!kakaoRestApiKey) {
    return json(500, {
      error: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.'
    });
  }

  const params = event.queryStringParameters || {};
  const query = String(params.query || '').trim();
  const display = normalizeNumber(params.display, 1, 50, 10);

  if (!query) {
    return json(400, { error: '검색어를 입력해 주세요.' });
  }

  if (query.length > 100) {
    return json(400, { error: '검색어는 100자 이하로 입력해 주세요.' });
  }

  const titleResult = await searchKakaoBooks({
    apiKey: kakaoRestApiKey,
    query,
    size: display,
    page: normalizePage(params.start),
    target: 'title'
  });

  if (titleResult.ok && titleResult.body.books.length > 0) {
    return json(200, titleResult.body);
  }

  const broadResult = await searchKakaoBooks({
    apiKey: kakaoRestApiKey,
    query,
    size: display,
    page: normalizePage(params.start)
  });

  if (broadResult.ok) {
    return json(200, broadResult.body);
  }

  return json(broadResult.statusCode, {
    error: broadResult.error || '카카오 책 검색 요청에 실패했습니다.'
  });
}

async function searchKakaoBooks({ apiKey, query, size, page, target }) {
  const searchParams = new URLSearchParams({
    query,
    sort: 'accuracy',
    page,
    size
  });

  if (target) {
    searchParams.set('target', target);
  }

  const response = await fetch(`${KAKAO_BOOK_SEARCH_URL}?${searchParams.toString()}`, {
    headers: {
      Authorization: `KakaoAK ${apiKey}`
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      statusCode: response.status,
      error: payload.msg || payload.message || '카카오 책 검색 요청에 실패했습니다.'
    };
  }

  const books = await Promise.all(
    (payload.documents || [])
      .filter((item) => item.thumbnail)
      .map(toKakaoBook)
  );

  return {
    ok: true,
    body: {
      source: 'kakao',
      meta: {
        total: payload.meta?.total_count || books.length,
        start: page,
        display: books.length,
        isEnd: Boolean(payload.meta?.is_end)
      },
      books
    }
  };
}

async function toKakaoBook(item) {
  const imageUrl = normalizeImageUrl(item.thumbnail);

  return {
    title: cleanBookTitle(item.title),
    authors: Array.isArray(item.authors) ? item.authors : [],
    publisher: item.publisher || '',
    isbn: item.isbn || '',
    thumbnail: await imageToDataUrl(imageUrl),
    originalThumbnail: imageUrl,
    url: item.url || '',
    contents: stripTags(item.contents || ''),
    publishedAt: item.datetime || '',
    discount: item.sale_price && item.sale_price > 0 ? String(item.sale_price) : ''
  };
}

function normalizeNumber(value, min, max, fallback) {
  const number = Number(value || fallback);
  const safe = Number.isFinite(number) ? Math.trunc(number) : fallback;
  return String(Math.min(Math.max(safe, min), max));
}

function normalizePage(value) {
  const start = Number(value || 1);
  const safeStart = Number.isFinite(start) ? Math.max(Math.trunc(start), 1) : 1;
  return String(Math.min(Math.ceil(safeStart / 10), 50));
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, '');
}

function cleanBookTitle(value) {
  return stripTags(value)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s*[\(\[\{（【〈《].*?[\)\]\}）】〉》]\s*/g, ' ')
    .replace(/\s*[-–—|/]\s*(수상|선정|추천|개정|양장|보드북|세트|특별판|한정판|저자|작가).*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeImageUrl(value) {
  return String(value || '').replace(/^http:\/\//, 'https://');
}

async function imageToDataUrl(url) {
  if (!url) {
    return '';
  }

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'picturebook-calendar/1.0'
      }
    });

    if (!response.ok) {
      return url;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    if (!contentType.startsWith('image/')) {
      return url;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return `data:${contentType};base64,${base64}`;
  } catch {
    return url;
  }
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
