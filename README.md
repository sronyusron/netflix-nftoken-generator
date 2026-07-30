# Netflix NFToken Generator - Web Version

Versi web dari Netflix NFToken Generator. Ubah cookies Netflix menjadi link login otomatis.

## Features

- Support multiple cookie formats: JSON, Netscape, dan Raw string
- Dark theme UI
- Copy to clipboard & open link langsung
- Menampilkan masa berlaku (expiry) token
- Serverless API (Vercel Functions)
- Zero-dependency frontend (vanilla HTML/CSS/JS)

## Deploy ke Vercel

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/netflix-nftoken-generator)

### Manual Deploy

1. Push repository ini ke GitHub
2. Buka [vercel.com](https://vercel.com)
3. Import repository dari GitHub
4. Klik Deploy - selesai!

Atau gunakan Vercel CLI:

```bash
npx vercel
```

## Project Structure

```
netflix-nftoken-generator/
├── public/
│   └── index.html        # Frontend (static HTML/CSS/JS)
├── api/
│   └── generate.js       # Serverless API endpoint
├── vercel.json           # Vercel configuration
├── package.json
└── README.md
```

## Cookie Formats yang Didukung

### 1. JSON Format (dari EditThisCookie / Cookie-Editor)

```json
[
  {
    "name": "NetflixId",
    "value": "abc123...",
    "domain": ".netflix.com",
    "path": "/",
    "expires": 1816930582
  }
]
```

### 2. Netscape Format

```
.netflix.com	TRUE	/	TRUE	1816930582	NetflixId	abc123...
```

### 3. Raw Cookie String

```
NetflixId=abc123...; SecureNetflixId=xyz789...
```

## API Usage

```bash
curl -X POST https://your-app.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{"cookies": "[{\"name\":\"NetflixId\",\"value\":\"test123\",\"expires\":1816930582}]"}'
```

Response:
```json
{
  "success": true,
  "link": "https://netflix.com/?nftoken=...",
  "expiry": "2027-07-30 08:00:01",
  "cookieCount": 1
}
```

## Disclaimer

Tool ini dibuat untuk tujuan edukasi saja.
