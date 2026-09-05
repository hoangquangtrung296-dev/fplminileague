/**
 * Vercel API handler for FPL proxy
 * Usage: /api/fpl?endpoint=/entry/232782 or /api/fpl?path=entry/232782
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
    // Get FPL endpoint from query parameter
    let fplPath = req.query.endpoint || req.query.path || '';
    
    // Add leading slash if needed
    if (fplPath && !fplPath.startsWith('/')) {
      fplPath = '/' + fplPath;
    }
    if (!fplPath) {
      fplPath = '/';
    }

    // Handle additional query params (like page_standings)
    const queryParams = new URLSearchParams();
    Object.keys(req.query).forEach(key => {
      if (key !== 'endpoint' && key !== 'path') {
        if (Array.isArray(req.query[key])) {
          req.query[key].forEach(v => queryParams.append(key, v));
        } else {
          queryParams.append(key, req.query[key]);
        }
      }
    });
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    
    const upstreamUrl = `https://fantasy.premierleague.com/api${fplPath}${queryString}`;

    console.log(`[FPL Proxy] /api/fpl - Endpoint: ${fplPath}, Full URL: ${upstreamUrl}`);

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

    console.log(`[FPL Proxy] Status: ${upstreamResponse.status}`);
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
