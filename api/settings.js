/**
 * Vercel Serverless Function: /api/settings
 * Quản lý shared league config dùng Upstash Redis (KV_REST_API_*)
 *
 * Routes:
 *   GET  /api/settings?s=<shortCode>        — đọc config (public)
 *   POST /api/settings                      — tạo config mới
 *   POST /api/settings?action=verify        — xác thực password, lấy editToken
 *   PUT  /api/settings                      — cập nhật config (cần editToken)
 */

const crypto = require('crypto');

const REDIS_URL   = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
const TTL         = 60 * 60 * 24 * 365; // 1 năm (giây)

// ─── Upstash REST helper ──────────────────────────────────────────────────────
async function redis(...args) {
    if (!REDIS_URL || !REDIS_TOKEN) {
        throw new Error('Upstash credentials chưa được cấu hình (KV_REST_API_URL / KV_REST_API_TOKEN)');
    }
    const res = await fetch(REDIS_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${REDIS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(args)
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Redis lỗi ${res.status}: ${text}`);
    }
    const data = await res.json();
    return data.result;
}

// Tạo short code ngẫu nhiên (URL-safe)
function generateShortCode() {
    return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

// CORS headers
function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
    setCors(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const { s, action } = req.query || {};

    try {
        // ── GET /api/settings?s=<code> — đọc config (public) ──────────────────
        if (req.method === 'GET' && s) {
            const raw = await redis('GET', `s:${s}`);
            if (!raw) {
                return res.status(404).json({ error: 'Config không tồn tại hoặc đã hết hạn' });
            }

            const data = JSON.parse(raw);

            // Làm mới TTL mỗi lần đọc
            await redis('EXPIRE', `s:${s}`, TTL);

            // Trả về không có passwordHash
            const { passwordHash, ...safeData } = data;
            return res.status(200).json(safeData);
        }

        // ── POST /api/settings — tạo config mới ───────────────────────────────
        if (req.method === 'POST' && !action) {
            const { leagueId, entryId, leagueName, settings, passwordHash } = req.body || {};

            if (!leagueId || !settings || !passwordHash) {
                return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (leagueId, settings, passwordHash)' });
            }

            const shortCode = generateShortCode();
            const record = {
                leagueId:     String(leagueId),
                entryId:      String(entryId || ''),
                leagueName:   leagueName || '',
                settings,
                passwordHash,
                createdAt:    new Date().toISOString(),
                updatedAt:    new Date().toISOString()
            };

            await redis('SET', `s:${shortCode}`, JSON.stringify(record), 'EX', TTL);
            console.log(`[Settings API] Created config for league ${leagueId}, shortCode: ${shortCode}`);
            return res.status(200).json({ shortCode });
        }

        // ── POST /api/settings?action=verify — xác thực password ──────────────
        if (req.method === 'POST' && action === 'verify') {
            const { shortCode, passwordHash } = req.body || {};

            if (!shortCode || !passwordHash) {
                return res.status(400).json({ error: 'Thiếu shortCode hoặc passwordHash' });
            }

            // Rate limiting: tối đa 5 lần thử trong 15 phút
            const rlKey = `rl:${shortCode}`;
            const attempts = await redis('INCR', rlKey);
            if (Number(attempts) === 1) {
                await redis('EXPIRE', rlKey, 900); // 15 phút
            }
            if (Number(attempts) > 5) {
                return res.status(429).json({
                    error: 'Quá nhiều lần thử sai. Vui lòng thử lại sau 15 phút.'
                });
            }

            const raw = await redis('GET', `s:${shortCode}`);
            if (!raw) {
                return res.status(404).json({ error: 'Config không tồn tại' });
            }

            const data = JSON.parse(raw);
            if (data.passwordHash !== passwordHash) {
                return res.status(401).json({ error: 'Mật khẩu không đúng' });
            }

            // Đúng mật khẩu → xóa rate limit, tạo editToken (30 phút)
            await redis('DEL', rlKey);
            const editToken = crypto.randomBytes(32).toString('hex');
            await redis('SET', `token:${editToken}`, shortCode, 'EX', 1800);

            console.log(`[Settings API] Verified password for ${shortCode}`);
            return res.status(200).json({ editToken });
        }

        // ── PUT /api/settings — cập nhật config ───────────────────────────────
        if (req.method === 'PUT') {
            const { shortCode, settings, editToken } = req.body || {};

            if (!shortCode || !settings || !editToken) {
                return res.status(400).json({ error: 'Thiếu shortCode, settings hoặc editToken' });
            }

            // Xác minh editToken
            const tokenShortCode = await redis('GET', `token:${editToken}`);
            if (!tokenShortCode || tokenShortCode !== shortCode) {
                return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn. Vui lòng xác thực lại.' });
            }

            const raw = await redis('GET', `s:${shortCode}`);
            if (!raw) {
                return res.status(404).json({ error: 'Config không tồn tại' });
            }

            const data = JSON.parse(raw);
            data.settings  = settings;
            data.updatedAt = new Date().toISOString();

            // Lưu record mới, xóa token (dùng một lần)
            await redis('SET', `s:${shortCode}`, JSON.stringify(data), 'EX', TTL);
            await redis('DEL', `token:${editToken}`);

            console.log(`[Settings API] Updated config for ${shortCode}`);
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Method không được hỗ trợ' });

    } catch (error) {
        console.error('[Settings API] Error:', error.message);
        return res.status(500).json({ error: 'Lỗi server', message: error.message });
    }
};
