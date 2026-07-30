/**
 * Vercel Serverless Function - NFToken Generator API
 * POST /api/generate
 * Body: { "cookies": "..." (JSON string of cookie array) }
 * 
 * Sends request to Netflix with cookies to obtain valid nftoken.
 */

const https = require('https');

function parseCookies(input) {
  const trimmed = input.trim();

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      let parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) parsed = [parsed];
      return parsed.map(cookie => ({
        name: cookie.name || cookie.Name || '',
        value: cookie.value || cookie.Value || '',
        domain: cookie.domain || cookie.Domain || '.netflix.com',
        expires: cookie.expires || cookie.expirationDate || cookie.Expires || 0,
      }));
    } catch (e) {}
  }

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
          expires: parseInt(parts[4].trim()) || 0,
        });
      }
    }
    if (cookies.length > 0) return cookies;
  }

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
          expires: 0,
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
  const expiryTimes = cookies.map(c => c.expires || 0).filter(t => t > 0);
  if (expiryTimes.length === 0) return null;
  const earliest = Math.min(...expiryTimes);
  const d = new Date(earliest * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

/**
 * Make HTTPS request and follow redirects (up to 5)
 */
function httpsRequest(options, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const makeRequest = (opts, redirectsLeft) => {
      const req = https.request(opts, (res) => {
        // Follow redirects
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location && redirectsLeft > 0) {
          const redirectUrl = new URL(res.headers.location, `https://${opts.hostname}${opts.path}`);
          
          // Check if redirect URL contains nftoken
          const nftokenMatch = redirectUrl.href.match(/nftoken=([^&\s]+)/);
          if (nftokenMatch) {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: '', nftoken: nftokenMatch[1], redirectUrl: redirectUrl.href });
            return;
          }

          const newOpts = {
            ...opts,
            hostname: redirectUrl.hostname,
            path: redirectUrl.pathname + redirectUrl.search,
          };
          // Carry cookies through redirect
          makeRequest(newOpts, redirectsLeft - 1);
          res.resume(); // Consume response
          return;
        }

        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          // Search for nftoken in body
          let nftoken = null;
          const bodyMatch = data.match(/nftoken=([^&"'\s<>]+)/i);
          if (bodyMatch) nftoken = bodyMatch[1];

          // Search in location header
          const loc = res.headers.location || '';
          const locMatch = loc.match(/nftoken=([^&\s]+)/);
          if (locMatch) nftoken = locMatch[1];

          resolve({ statusCode: res.statusCode, headers: res.headers, body: data, nftoken: nftoken });
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    };

    makeRequest(options, maxRedirects);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const { cookies: cookieInput } = req.body;

    if (!cookieInput || typeof cookieInput !== 'string') {
      return res.status(400).json({ success: false, error: 'Input cookies tidak valid.' });
    }

    const parsedCookies = parseCookies(cookieInput);
    if (parsedCookies.length === 0) {
      return res.status(400).json({ success: false, error: 'Gagal parsing cookies.' });
    }

    const cookieString = buildCookieString(parsedCookies);
    const expiry = getExpiry(parsedCookies);
    let nftoken = null;
    let method = '';

    // Method 1: GET /token - Netflix token generation endpoint
    try {
      const result = await httpsRequest({
        hostname: 'www.netflix.com',
        port: 443,
        path: '/token',
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cookie': cookieString,
        },
      });

      if (result.nftoken) {
        nftoken = result.nftoken;
        method = 'token';
      }
    } catch (e) {}

    // Method 2: GET /LoginTransfer - Netflix generates nftoken in redirect
    if (!nftoken) {
      try {
        const result = await httpsRequest({
          hostname: 'www.netflix.com',
          port: 443,
          path: '/LoginTransfer',
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cookie': cookieString,
          },
        });

        if (result.nftoken) {
          nftoken = result.nftoken;
          method = 'LoginTransfer';
        }
      } catch (e) {}
    }

    // Method 3: GET /nftoken - direct token endpoint
    if (!nftoken) {
      try {
        const result = await httpsRequest({
          hostname: 'www.netflix.com',
          port: 443,
          path: '/nftoken',
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Cookie': cookieString,
          },
        });

        if (result.nftoken) {
          nftoken = result.nftoken;
          method = 'nftoken endpoint';
        }
      } catch (e) {}
    }

    // Method 4: GET /YourAccount - parse token from page
    if (!nftoken) {
      try {
        const result = await httpsRequest({
          hostname: 'www.netflix.com',
          port: 443,
          path: '/YourAccount',
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Cookie': cookieString,
          },
        });

        if (result.nftoken) {
          nftoken = result.nftoken;
          method = 'YourAccount';
        }
      } catch (e) {}
    }

    // Method 5: GET /browse - sometimes nftoken in page source
    if (!nftoken) {
      try {
        const result = await httpsRequest({
          hostname: 'www.netflix.com',
          port: 443,
          path: '/browse',
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Cookie': cookieString,
          },
        });

        if (result.nftoken) {
          nftoken = result.nftoken;
          method = 'browse';
        }
      } catch (e) {}
    }

    if (nftoken) {
      return res.status(200).json({
        success: true,
        link: `https://netflix.com/?nftoken=${nftoken}`,
        expiry: expiry || 'Tidak diketahui',
        cookieCount: parsedCookies.length,
        method: method,
      });
    }

    return res.status(200).json({
      success: false,
      error: 'Gagal mendapatkan nftoken dari Netflix. Cookies mungkin sudah expired atau Netflix memblokir request dari server ini.',
      cookieCount: parsedCookies.length,
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: 'Server error: ' + error.message });
  }
};
