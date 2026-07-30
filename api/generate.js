/**
 * Vercel Serverless Function - NFToken Generator API
 * POST /api/generate
 * Body: { "cookies": "..." }
 * 
 * This sends a request to Netflix with the provided cookies
 * to obtain a valid nftoken for login.
 */

const https = require('https');

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
    } catch (e) {}
  }

  // Try Netscape format
  const lines = trimmed.split('
').filter(line => line.trim() && !line.startsWith('#'));
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

function buildCookieString(cookies) {
  return cookies
    .filter(c => c.name && c.value)
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
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

function requestNFToken(cookieString) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.netflix.com',
      port: 443,
      path: '/YourAccount',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': cookieString,
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
    };

    const req = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        let nftoken = null;

        const tokenMatch = data.match(/nftoken['":\s=]+([A-Za-z0-9_\-+/.=:]+)/i);
        if (tokenMatch) {
          nftoken = tokenMatch[1];
        }

        const locationHeader = response.headers['location'] || '';
        const locationMatch = locationHeader.match(/nftoken=([^&\s]+)/);
        if (locationMatch) {
          nftoken = locationMatch[1];
        }

        if (response.headers['x-netflix-nftoken']) {
          nftoken = response.headers['x-netflix-nftoken'];
        }

        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: data,
          nftoken: nftoken,
        });
      });
    });

    req.on('error', (e) => { reject(e); });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function requestLoginToken(cookieString) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.netflix.com',
      port: 443,
      path: '/LoginTransfer',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': cookieString,
        'Connection': 'keep-alive',
      },
    };

    const req = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        let nftoken = null;

        const locationHeader = response.headers['location'] || '';
        const locationMatch = locationHeader.match(/nftoken=([^&\s]+)/);
        if (locationMatch) {
          nftoken = locationMatch[1];
        }

        if (!nftoken) {
          const bodyMatch = data.match(/nftoken=([^&"'\s<>]+)/i);
          if (bodyMatch) {
            nftoken = bodyMatch[1];
          }
        }

        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: data,
          nftoken: nftoken,
          location: locationHeader,
        });
      });
    });

    req.on('error', (e) => { reject(e); });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

module.exports = async (req, res) => {
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

    const cookieString = buildCookieString(parsedCookies);
    const expiry = getExpiry(parsedCookies);

    let nftoken = null;
    let debugInfo = {};

    // Method 1: Try /LoginTransfer endpoint
    try {
      const transferResult = await requestLoginToken(cookieString);
      debugInfo.loginTransfer = {
        status: transferResult.statusCode,
        location: transferResult.location || null,
        hasToken: !!transferResult.nftoken,
      };
      if (transferResult.nftoken) {
        nftoken = transferResult.nftoken;
      }
    } catch (e) {
      debugInfo.loginTransferError = e.message;
    }

    // Method 2: Try /YourAccount page  
    if (!nftoken) {
      try {
        const accountResult = await requestNFToken(cookieString);
        debugInfo.yourAccount = {
          status: accountResult.statusCode,
          hasToken: !!accountResult.nftoken,
        };
        if (accountResult.nftoken) {
          nftoken = accountResult.nftoken;
        }
      } catch (e) {
        debugInfo.yourAccountError = e.message;
      }
    }

    if (nftoken) {
      const link = `https://netflix.com/?nftoken=${nftoken}`;
      return res.status(200).json({
        success: true,
        link,
        expiry: expiry || 'Tidak diketahui',
        cookieCount: parsedCookies.length,
      });
    } else {
      // Fallback: extract NetflixId value directly
      const netflixIdCookie = parsedCookies.find(c => 
        c.name === 'NetflixId' || c.name === 'SecureNetflixId'
      );

      if (netflixIdCookie) {
        const link = `https://netflix.com/?nftoken=${encodeURIComponent(netflixIdCookie.value)}`;
        return res.status(200).json({
          success: true,
          link,
          expiry: expiry || 'Tidak diketahui',
          cookieCount: parsedCookies.length,
          note: 'Token diambil dari cookie NetflixId langsung. Jika tidak berhasil, cookies mungkin sudah expired.',
          debug: debugInfo,
        });
      }

      return res.status(200).json({
        success: false,
        error: 'Gagal mendapatkan nftoken dari Netflix. Pastikan cookies masih valid dan belum expired.',
        debug: debugInfo,
        cookieCount: parsedCookies.length,
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Terjadi kesalahan: ' + error.message });
  }
};
