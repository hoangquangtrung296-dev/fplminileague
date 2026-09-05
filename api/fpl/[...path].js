/**
 * Vercel API handler for FPL proxy
 * Handles /api/fpl/[...path] requests
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // In Vercel, when accessing /api/fpl/entry/123/
    // req.query.path might be: ['entry', '123'] or path string
    // req.url will contain the full path
    
    const url = new URL(req.url, 'https://example.com');
    let fplPath = '';
    
    // Try to get from dynamic route parameter first
    if (req.query.path) {
      if (Array.isArray(req.query.path)) {
        fplPath = '/' + req.query.path.join('/');
      } else {
        fplPath = '/' + req.query.path;
      }
    } else {
      // Fallback: extract from URL pathname
      // Remove /api/fpl/ prefix
      fplPath = url.pathname.replace(/^\/api\/fpl\/?/, '');
      if (fplPath && !fplPath.startsWith('/')) {
        fplPath = '/' + fplPath;
      }
    }
    
    if (!fplPath || fplPath === '/') {
      fplPath = '/';
    }

    const queryString = url.search || '';
    const upstreamUrl = `https://fantasy.premierleague.com/api${fplPath}${queryString}`;

    console.log(`[FPL Proxy] /api/fpl/[...path] - Extracted: ${fplPath}, Full: ${upstreamUrl}`);

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

    console.log(`[FPL Proxy] Responded: ${upstreamResponse.status}`);
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
