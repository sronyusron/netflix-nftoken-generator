/**
 * Vercel Serverless Function - NFToken Generator API
 * POST /api/generate
 * Body: { "cookies": "..." (JSON string of cookie array) }
 * 
 * Two-step process:
 * 1. GET /browse with cookies → extract BUILD_IDENTIFIER and authURL
 * 2. POST /api/shakti/{BUILD_ID}/pathEvaluator → get nftoken
 */

const https = require('https');
const { URL } = require('url');

function parseCookies(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      let parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) parsed = [parsed];
      return parsed.map(cookie => ({
        name: cookie.name || cookie.Name || '',
        value: cookie.value || cookie.Value || '',
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
        cookies.push({ name: parts[5].trim(), value: parts[6].trim(), expires: parseInt(parts[4].trim()) || 0 });
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
        cookies.push({ name: pair.substring(0, eqIndex).trim(), value: pair.substring(eqIndex + 1).trim(), expires: 0 });
      }
    }
    if (cookies.length > 0) return cookies;
  }
  return [];
}

function buildCookieString(cookies) {
  return cookies.filter(c => c.name && c.value).map(c => `${c.name}=${c.value}`).join('; ');
}

function getExpiry(cookies) {
  const expiryTimes = cookies.map(c => c.expires || 0).filter(t => t > 0);
  if (expiryTimes.length === 0) return null;
  const earliest = Math.min(...expiryTimes);
  const d = new Date(earliest * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function httpsGet(url, cookieString) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': cookieString,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    };

    const req = https.request(options, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url);
        // Check if redirect contains nftoken
        const nftMatch = redirectUrl.href.match(/nftoken=([^&\s]+)/);
        if (nftMatch) {
          resolve({ body: '', nftoken: nftMatch[1], statusCode: res.statusCode });
          res.resume();
          return;
        }
        res.resume();
        httpsGet(redirectUrl.href, cookieString).then(resolve).catch(reject);
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const nftMatch = data.match(/nftoken=([^&"'\s<>]+)/i);
        resolve({ body: data, nftoken: nftMatch ? nftMatch[1] : null, statusCode: res.statusCode, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function httpsPost(url, cookieString, postBody, contentType) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Content-Type': contentType || 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postBody),
        'Cookie': cookieString,
        'X-Netflix.Client.Request.Name': 'ui/nftoken',
      },
    };

    const req = https.request(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url);
        const nftMatch = redirectUrl.href.match(/nftoken=([^&\s]+)/);
        if (nftMatch) {
          resolve({ body: '', nftoken: nftMatch[1], statusCode: res.statusCode });
          res.resume();
          return;
        }
        res.resume();
        resolve({ body: '', nftoken: null, statusCode: res.statusCode, location: res.headers.location });
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const nftMatch = data.match(/nftoken['":\s]*=?\s*['"]?([A-Za-z0-9+/=]{100,})/);
        resolve({ body: data, nftoken: nftMatch ? nftMatch[1] : null, statusCode: res.statusCode });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(postBody);
    req.end();
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
    let debugInfo = [];

    // Step 1: GET /browse to extract BUILD_IDENTIFIER and authURL
    let buildId = null;
    let authURL = null;

    try {
      const browseResult = await httpsGet('https://www.netflix.com/browse', cookieString);
      debugInfo.push({ step: 'browse', status: browseResult.statusCode, bodyLen: browseResult.body.length });

      if (browseResult.nftoken) {
        nftoken = browseResult.nftoken;
        method = 'browse-redirect';
      } else {
        // Extract BUILD_IDENTIFIER
        const buildMatch = browseResult.body.match(/\"BUILD_IDENTIFIER\"\s*:\s*\"([^\"]+)\"/);
        if (buildMatch) buildId = buildMatch[1];

        // Extract authURL
        const authMatch = browseResult.body.match(/\"authURL\"\s*:\s*\"([^\"]+)\"/);
        if (authMatch) authURL = authMatch[1];

        debugInfo.push({ buildId, authURL: authURL ? authURL.substring(0, 20) + '...' : null });
      }
    } catch (e) {
      debugInfo.push({ step: 'browse', error: e.message });
    }

    // Step 2: Use Shakti API to get nftoken
    if (!nftoken && buildId && authURL) {
      try {
        const shaktiUrl = `https://www.netflix.com/api/shakti/${buildId}/pathEvaluator?materialize=true`;
        const postBody = `path=["nftoken"]&authURL=${encodeURIComponent(authURL)}`;
        const shaktiResult = await httpsPost(shaktiUrl, cookieString, postBody, 'application/x-www-form-urlencoded');
        debugInfo.push({ step: 'shakti', status: shaktiResult.statusCode, bodyLen: shaktiResult.body.length });

        if (shaktiResult.nftoken) {
          nftoken = shaktiResult.nftoken;
          method = 'shakti';
        } else {
          // Try parsing JSON response for token
          try {
            const jsonData = JSON.parse(shaktiResult.body);
            // Look for nftoken in various places in the response
            const findToken = (obj, depth = 0) => {
              if (depth > 5 || !obj) return null;
              if (typeof obj === 'string' && obj.length > 100 && obj.match(/^[A-Za-z0-9+/=_-]+$/)) return obj;
              if (typeof obj === 'object') {
                for (const key of Object.keys(obj)) {
                  if (key.toLowerCase().includes('token') || key.toLowerCase().includes('nftoken')) {
                    if (typeof obj[key] === 'string') return obj[key];
                  }
                  const found = findToken(obj[key], depth + 1);
                  if (found) return found;
                }
              }
              return null;
            };
            const found = findToken(jsonData);
            if (found) {
              nftoken = found;
              method = 'shakti-json';
            }
          } catch (e) {}
        }
      } catch (e) {
        debugInfo.push({ step: 'shakti', error: e.message });
      }
    }

    // Step 3: Try /LoginTransfer
    if (!nftoken) {
      try {
        const result = await httpsGet('https://www.netflix.com/LoginTransfer', cookieString);
        debugInfo.push({ step: 'LoginTransfer', status: result.statusCode });
        if (result.nftoken) { nftoken = result.nftoken; method = 'LoginTransfer'; }
      } catch (e) {
        debugInfo.push({ step: 'LoginTransfer', error: e.message });
      }
    }

    // Step 4: Try /token
    if (!nftoken) {
      try {
        const result = await httpsGet('https://www.netflix.com/token', cookieString);
        debugInfo.push({ step: 'token', status: result.statusCode });
        if (result.nftoken) { nftoken = result.nftoken; method = 'token'; }
      } catch (e) {
        debugInfo.push({ step: 'token', error: e.message });
      }
    }

    // Step 5: Try Shakti with different path format
    if (!nftoken && buildId && authURL) {
      try {
        const shaktiUrl = `https://www.netflix.com/api/shakti/${buildId}/pathEvaluator`;
        const postBody = `path=["tokenGeneration","nftoken"]&authURL=${encodeURIComponent(authURL)}`;
        const result = await httpsPost(shaktiUrl, cookieString, postBody, 'application/x-www-form-urlencoded');
        debugInfo.push({ step: 'shakti2', status: result.statusCode });
        if (result.nftoken) { nftoken = result.nftoken; method = 'shakti2'; }
      } catch (e) {
        debugInfo.push({ step: 'shakti2', error: e.message });
      }
    }

    if (nftoken) {
      return res.status(200).json({
        token: nftoken,
        loginLink: `https://netflix.com/?nftoken=${nftoken}`,
        expiry: expiry || 'Tidak diketahui',
        cookieCount: parsedCookies.length,
        method,
      });
    }

    return res.status(200).json({
      success: false,
      error: 'Gagal mendapatkan nftoken dari Netflix. Cookies mungkin expired atau endpoint berubah.',
      debug: debugInfo,
      cookieCount: parsedCookies.length,
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: 'Server error: ' + error.message });
  }
};
