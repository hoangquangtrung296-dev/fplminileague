module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Debug logging
    console.log('[FPL Proxy Debug]', {
      method: req.method,
      url: req.url,
      query: req.query,
      pathname: new URL(req.url, 'https://example.com').pathname
    });

    // Handle Vercel's catch-all routing for [...path]
    // req.query.path is an array of path segments
    let rawPath = '';
    if (req.query.path && Array.isArray(req.query.path)) {
      rawPath = '/' + req.query.path.join('/');
    } else if (typeof req.query.path === 'string') {
      rawPath = '/' + req.query.path;
    } else {
      // Fallback to URL parsing
      const url = new URL(req.url, 'https://example.com');
      rawPath = url.pathname.replace(/^\/api\/fpl\/?/, '') || '';
    }

    // Ensure rawPath starts with /
    if (!rawPath.startsWith('/')) {
      rawPath = '/' + rawPath;
    }

    // Build query string from req.query, excluding 'path' which is the route parameter
    const queryParams = new URLSearchParams();
    Object.keys(req.query).forEach(key => {
      if (key !== 'path') {
        queryParams.append(key, req.query[key]);
      }
    });
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    
    const upstreamUrl = `https://fantasy.premierleague.com/api${rawPath}${queryString}`;

    console.log(`[FPL Proxy] Final - rawPath: ${rawPath}, URL: ${upstreamUrl}`);

    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const body = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(upstreamResponse.status).send(body);
  } catch (error) {
    console.error('FPL proxy error:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.status(502).json({
      error: 'FPL proxy failed',
      message: error.message
    });
  }
};
