/**
 * Vercel Serverless Function - NFToken Generator API
 * POST /api/generate
 * Body: { "cookies": "..." }
 */

function parseCookies(input) {
  const trimmed = input.trim();

  // Try JSON format
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      let parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) parsed = [parsed];
      return parsed.map(cookie => ({
        name: cookie.name || cookie.Name || '',
        value: cookie.value || cookie.Value || '',
        domain: cookie.domain || cookie.Domain || '.netflix.com',
        path: cookie.path || cookie.Path || '/',
        expires: cookie.expires || cookie.expirationDate || cookie.Expires || 0,
        httpOnly: cookie.httpOnly ?? cookie.HttpOnly ?? false,
        secure: cookie.secure ?? cookie.Secure ?? true,
        sameSite: cookie.sameSite || cookie.SameSite || 'Lax',
      }));
    } catch (e) {
      // Not JSON
    }
  }

  // Try Netscape format
  const lines = trimmed.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  if (lines.some(line => line.split('\t').length >= 7)) {
    const cookies = [];
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 7) {
        cookies.push({
          name: parts[5].trim(),
          value: parts[6].trim(),
          domain: parts[0].trim(),
          path: parts[2].trim(),
          expires: parseInt(parts[4].trim()) || 0,
          httpOnly: parts[1].trim().toUpperCase() === 'TRUE',
          secure: parts[3].trim().toUpperCase() === 'TRUE',
          sameSite: 'Lax',
        });
      }
    }
    if (cookies.length > 0) return cookies;
  }

  // Try raw cookie string format
  if (trimmed.includes('=') && !trimmed.includes('\t')) {
    const pairs = trimmed.split(';').map(p => p.trim()).filter(Boolean);
    const cookies = [];
    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex > 0) {
        cookies.push({
          name: pair.substring(0, eqIndex).trim(),
          value: pair.substring(eqIndex + 1).trim(),
          domain: '.netflix.com',
          path: '/',
          expires: 0,
          httpOnly: false,
          secure: true,
          sameSite: 'Lax',
        });
      }
    }
    if (cookies.length > 0) return cookies;
  }

  return [];
}

function generateNFToken(cookies) {
  const cookieString = cookies
    .filter(c => c.name && c.value)
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  const base64 = Buffer.from(cookieString, 'utf-8').toString('base64');
  const base64url = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return base64url;
}

function getExpiry(cookies) {
  const expiryTimes = cookies
    .map(c => c.expires || 0)
    .filter(t => t > 0);

  if (expiryTimes.length === 0) return null;

  const earliestExpiry = Math.min(...expiryTimes);
  const date = new Date(earliestExpiry * 1000);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

module.exports = (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { cookies: cookieInput } = req.body;

    if (!cookieInput || typeof cookieInput !== 'string') {
      return res.status(400).json({ success: false, error: 'Input cookies tidak valid.' });
    }

    const parsedCookies = parseCookies(cookieInput);

    if (parsedCookies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Gagal parsing cookies. Pastikan format sudah benar (JSON, Netscape, atau Raw string).'
      });
    }

    const nftoken = generateNFToken(parsedCookies);
    const link = `https://netflix.com/?nftoken=${nftoken}`;
    const expiry = getExpiry(parsedCookies);

    return res.status(200).json({
      success: true,
      link,
      expiry: expiry || 'Tidak diketahui (tidak ada expiry pada cookies)',
      cookieCount: parsedCookies.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Terjadi kesalahan internal.' });
  }
};
