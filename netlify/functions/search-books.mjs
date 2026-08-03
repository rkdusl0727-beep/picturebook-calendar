const NAVER_BOOK_SEARCH_URL = 'https://openapi.naver.com/v1/search/book.json';
const GOOGLE_BOOK_SEARCH_URL = 'https://www.googleapis.com/books/v1/volumes';

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  const params = event.queryStringParameters || {};
  const query = String(params.query || '').trim();
  const display = normalizeNumber(params.display, 1, 100, 10);

  if (!query) {
    return json(400, { error: '검색어를 입력해 주세요.' });
  }

  if (query.length > 100) {
    return json(400, { error: '검색어는 100자 이하로 입력해 주세요.' });
  }

  if (clientId && clientSecret) {
    const naverResult = await searchNaverBooks({
      clientId,
      clientSecret,
      query,
      sort: normalizeOption(params.sort, ['sim', 'date'], 'sim'),
      start: normalizeNumber(params.start, 1, 1000, 1),
      display
    });

    if (naverResult.ok) {
      return json(200, naverResult.body);
    }

    if (!shouldFallbackToGoogle(naverResult.error)) {
      return json(naverResult.statusCode, {
        error: naverResult.error || '네이버 책 검색 요청에 실패했습니다.'
      });
    }
  }

  const googleResult = await searchGoogleBooks(query, display);
  return json(200, googleResult);
}

async function searchNaverBooks({ clientId, clientSecret, query, sort, start, display }) {
  const searchParams = new URLSearchParams({
    query,
    sort,
    start,
    display
  });

  const response = await fetch(`${NAVER_BOOK_SEARCH_URL}?${searchParams.toString()}`, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      statusCode: response.status,
      error: payload.errorMessage || payload.message || '네이버 책 검색 요청에 실패했습니다.'
    };
  }

  const books = await Promise.all((payload.items || []).map(toBook));

  return {
    ok: true,
    body: {
      source: 'naver',
      meta: {
        total: payload.total,
        start: payload.start,
        display: payload.display,
        lastBuildDate: payload.lastBuildDate
      },
      books
    }
  };
}

async function searchGoogleBooks(query, display) {
  const params = new URLSearchParams({
    q: query,
    langRestrict: 'ko',
    printType: 'books',
    maxResults: normalizeNumber(display, 1, 40, 10)
  });

  const response = await fetch(`${GOOGLE_BOOK_SEARCH_URL}?${params.toString()}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      source: 'google',
      meta: { total: 0, start: 1, display: 0 },
      books: [],
      notice: payload.error?.message || '대체 책 검색 요청에 실패했습니다.'
    };
  }

  const books = await Promise.all((payload.items || []).map(toGoogleBook));

  return {
    source: 'google',
    meta: {
      total: payload.totalItems || books.length,
      start: 1,
      display: books.length
    },
    books
  };
}

async function toBook(item) {
  const imageUrl = normalizeImageUrl(item.image);

  return {
    title: cleanBookTitle(item.title),
    authors: splitAuthors(item.author),
    publisher: item.publisher || '',
    isbn: item.isbn || '',
    thumbnail: await imageToDataUrl(imageUrl),
    originalThumbnail: imageUrl,
    url: item.link || '',
    contents: stripTags(item.description || ''),
    publishedAt: item.pubdate || '',
    discount: item.discount || ''
  };
}

async function toGoogleBook(item) {
  const info = item.volumeInfo || {};
  const imageUrl = normalizeImageUrl(
    info.imageLinks?.thumbnail
      || info.imageLinks?.smallThumbnail
      || ''
  );

  return {
    title: cleanBookTitle(info.title || ''),
    authors: Array.isArray(info.authors) ? info.authors : [],
    publisher: info.publisher || '',
    isbn: findGoogleIsbn(info.industryIdentifiers),
    thumbnail: await imageToDataUrl(imageUrl),
    originalThumbnail: imageUrl,
    url: info.infoLink || '',
    contents: stripTags(info.description || ''),
    publishedAt: info.publishedDate || '',
    discount: ''
  };
}

function shouldFallbackToGoogle(message) {
  return /invalid search api|존재하지 않는 검색 api|검색 api/i.test(String(message || ''));
}

function findGoogleIsbn(identifiers) {
  if (!Array.isArray(identifiers)) {
    return '';
  }

  return identifiers
    .map((item) => item.identifier)
    .filter(Boolean)
    .join(' ');
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

function splitAuthors(value) {
  return String(value || '')
    .split('|')
    .map((author) => author.trim())
    .filter(Boolean);
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
