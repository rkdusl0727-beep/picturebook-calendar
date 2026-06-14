export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'GET') {
    return text(405, 'Method not allowed');
  }

  const params = event.queryStringParameters || {};
  const rawUrl = String(params.url || '').trim();

  if (!rawUrl) {
    return text(400, 'Missing image URL');
  }

  let imageUrl;

  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return text(400, 'Invalid image URL');
  }

  if (imageUrl.protocol !== 'https:' || !isAllowedImageHost(imageUrl.hostname)) {
    return text(400, 'Unsupported image host');
  }

  try {
    const response = await fetch(imageUrl.toString(), {
      headers: {
        'user-agent': 'picturebook-calendar/1.0'
      }
    });

    if (!response.ok) {
      return text(response.status, 'Image request failed');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    if (!contentType.startsWith('image/')) {
      return text(400, 'URL is not an image');
    }

    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=604800',
        'access-control-allow-origin': '*'
      },
      body
    };
  } catch {
    return text(500, 'Image proxy failed');
  }
}

function isAllowedImageHost(hostname) {
  return hostname === 'shopping-phinf.pstatic.net'
    || hostname.endsWith('.pstatic.net')
    || hostname.endsWith('.naver.net')
    || hostname.endsWith('.naver.com');
}

function text(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    },
    body
  };
}
