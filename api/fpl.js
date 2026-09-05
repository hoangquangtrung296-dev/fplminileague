/**
 * Vercel API handler for FPL proxy
 * Handles all /api/fpl/* requests
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
    // For /api/fpl endpoint, we need to check how Vercel passes the rest of the path
    // When accessing /api/fpl/entry/123/, Vercel sends it as:
    // req.url might be: /api/fpl/entry/123/ or just /api/fpl
    // We need to parse the actual path from the URL
    
    const url = new URL(req.url, 'https://example.com');
    const pathname = url.pathname;
    
    // Extract everything after /api/fpl
    // If pathname is /api/fpl, then fplPath = /
    // If pathname is /api/fpl/entry/123/, then fplPath = /entry/123/
    let fplPath = pathname.replace(/^\/api\/fpl(?:\/|$)/, '');
    if (fplPath && !fplPath.startsWith('/')) {
      fplPath = '/' + fplPath;
    }
    if (!fplPath) {
      fplPath = '/';
    }

    const queryString = url.search || '';
    const upstreamUrl = `https://fantasy.premierleague.com/api${fplPath}${queryString}`;

    console.log(`[FPL Proxy] Handler /api/fpl.js - Path: ${fplPath}, URL: ${upstreamUrl}`);

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

    console.log(`[FPL Proxy] Response: ${upstreamResponse.status}`);
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
