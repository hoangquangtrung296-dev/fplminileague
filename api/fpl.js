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
    // Parse the FPL API path from the URL
    // URL format: /api/fpl?path=/entry/232782/ or /api/fpl/entry/232782/
    let fplPath = '';
    
    // Try to get path from query parameter first
    if (req.query.path) {
      fplPath = Array.isArray(req.query.path) 
        ? '/' + req.query.path.join('/')
        : '/' + req.query.path;
    } else {
      // Parse from URL pathname
      const url = new URL(req.url, 'https://example.com');
      fplPath = url.pathname.replace(/^\/api\/fpl\/?/, '') || '';
      if (fplPath && !fplPath.startsWith('/')) {
        fplPath = '/' + fplPath;
      }
    }

    // Ensure path starts with /
    if (!fplPath.startsWith('/')) {
      fplPath = '/' + fplPath;
    }

    // Build query string from all query parameters except 'path'
    const queryParams = new URLSearchParams();
    Object.keys(req.query).forEach(key => {
      if (key !== 'path') {
        queryParams.append(key, req.query[key]);
      }
    });
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    
    const upstreamUrl = `https://fantasy.premierleague.com/api${fplPath}${queryString}`;

    console.log(`[FPL API Proxy] Endpoint: ${fplPath}, Full URL: ${upstreamUrl}`);

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
    
    console.log(`[FPL API Proxy] Response: ${upstreamResponse.status}`);
  } catch (error) {
    console.error('[FPL API Proxy] Error:', error.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.status(502).json({
      error: 'FPL API proxy failed',
      message: error.message
    });
  }
};
