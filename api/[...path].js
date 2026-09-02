module.exports = async function handler(req, res) {
  // Log incoming request for debugging
  console.log('[API Catch-all Handler]', {
    method: req.method,
    url: req.url,
    pathname: new URL(req.url, 'https://example.com').pathname,
    query: req.query
  });

  // Only handle /api/fpl/* routes
  const url = new URL(req.url, 'https://example.com');
  if (!req.url.includes('/api/fpl') && !url.pathname.includes('/api/fpl')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

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
    // Extract path after /api/fpl
    let fplPath = url.pathname.replace(/^\/api\/fpl\/?/, '');
    
    // Ensure path starts with /
    if (fplPath && !fplPath.startsWith('/')) {
      fplPath = '/' + fplPath;
    }
    if (!fplPath) {
      fplPath = '/';
    }

    // Build query string
    const queryString = url.search || '';
    
    const upstreamUrl = `https://fantasy.premierleague.com/api${fplPath}${queryString}`;

    console.log(`[FPL Proxy] Extracted path: ${fplPath}, Full URL: ${upstreamUrl}`);

    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const body = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get('content-type') || 'application/json';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(upstreamResponse.status).send(body);
    
    console.log(`[FPL Proxy] Upstream response: ${upstreamResponse.status}`);
  } catch (error) {
    console.error('[FPL Proxy] Error:', error.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.status(502).json({
      error: 'FPL proxy failed',
      message: error.message
    });
  }
};
