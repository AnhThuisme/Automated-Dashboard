function parseMetaTag(html: string, property: string): string {
  const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];
  const regex2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
  const match2 = html.match(regex2);
  return match2 ? match2[1] : '';
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapText(text: string, maxCharsPerLine: number = 32): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const originalUrl = (req.query?.url as string || req.body?.url as string || '').trim();
  const postTitle = (req.query?.title as string || req.body?.title as string || '').trim();

  if (!originalUrl) {
    return res.status(400).json({ error: "Missing required query parameter: url" });
  }

  let parsedTitle = postTitle;
  let parsedDesc = '';
  let parsedImage = '';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => clearTimeout(timeoutId), 6000);

    const response = await fetch(originalUrl, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      signal: controller.signal
    });

    if (response.ok) {
      const html = await response.text();
      parsedTitle = parseMetaTag(html, 'og:title') || parseMetaTag(html, 'title') || postTitle;
      parsedDesc = parseMetaTag(html, 'og:description') || parseMetaTag(html, 'description');
      parsedImage = parseMetaTag(html, 'og:image') || parseMetaTag(html, 'image') || parseMetaTag(html, 'twitter:image');
    }
  } catch (err: any) {
    console.warn(`[Vercel Screenshot API] Fetch meta error:`, err.message);
  }

  // Try Microlink HD Screenshot service
  try {
    const targetUrl = originalUrl.includes('facebook.com') && !originalUrl.includes('plugins/')
      ? `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(originalUrl)}&width=600&show_text=true&locale=vi_VN`
      : originalUrl;

    const waitTime = originalUrl.includes('facebook.com') ? 6000 : 3000;
    const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&screenshot=true&screenshot.type=png&screenshot.quality=100&screenshot.fullPage=false&embed=screenshot.url&viewport.width=650&viewport.height=850&viewport.deviceScaleFactor=2&wait=${waitTime}&force=true&ttl=0`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => clearTimeout(timeoutId), 18000);

    const microlinkRes = await fetch(apiUrl, { signal: controller.signal });

    if (microlinkRes.ok) {
      const buffer = await microlinkRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mimeType = microlinkRes.headers.get("content-type") || "image/png";
      return res.status(200).json({
        success: true,
        screenshotUrl: `data:${mimeType};base64,${base64}`
      });
    }
  } catch (microlinkErr) {
    console.warn(`[Vercel Screenshot API] Microlink fallback:`, microlinkErr);
  }

  // Generate clean HD Social SVG Card (with 0% broken grey images)
  let domain = 'facebook.com';
  try {
    domain = new URL(originalUrl).hostname.replace('www.', '');
  } catch (e) {}

  const wrapWidth = parsedImage ? 28 : 42;
  const mainTitle = parsedTitle || 'Liên kết bài viết Vĩnh Tường';
  const lines = wrapText(mainTitle, wrapWidth);
  const descLines = wrapText(parsedDesc || '', wrapWidth);
  const dateStr = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const svg = `
  <svg width="800" height="500" viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1877F2"/>
        <stop offset="100%" stop-color="#0F172A"/>
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity="0.35"/>
      </filter>
      <clipPath id="fb-img-clip">
        <rect x="440" y="165" width="220" height="180" rx="12" />
      </clipPath>
    </defs>
    
    <rect width="800" height="500" fill="url(#fb-grad)"/>
    
    <g filter="url(#shadow)">
      <rect x="80" y="60" width="640" height="380" rx="16" fill="#ffffff"/>
    </g>
    
    <circle cx="130" cy="110" r="22" fill="#1877F2"/>
    <text x="130" y="117" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="middle">f</text>
    
    <text x="164" y="108" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="bold" fill="#1E293B">VĨNH TƯỜNG</text>
    <text x="164" y="124" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#64748B">Bài viết gốc • ${dateStr}</text>
    
    <circle cx="282" cy="103" r="7" fill="#1877F2"/>
    <path d="M279 103 L281 105 L285 101" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    
    <line x1="80" y1="150" x2="720" y2="150" stroke="#F1F5F9" stroke-width="1"/>
    
    ${parsedImage ? `
      <g transform="translate(110, 185)">
        ${lines.slice(0, 4).map((line, i) => `
          <text x="0" y="${i * 24}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="bold" fill="#1E293B">${escapeHtml(line)}</text>
        `).join('')}
        <g transform="translate(0, 110)">
          ${descLines.slice(0, 3).map((line, i) => `
            <text x="0" y="${i * 18}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#475569">${escapeHtml(line)}</text>
          `).join('')}
        </g>
      </g>
      <g>
        <rect x="439" y="164" width="222" height="182" rx="13" fill="#F1F5F9" stroke="#E2E8F0" stroke-width="1" />
        <image href="${escapeHtml(parsedImage)}" x="440" y="165" width="220" height="180" preserveAspectRatio="xMidYMid slice" clip-path="url(#fb-img-clip)" referrerPolicy="no-referrer" />
      </g>
    ` : `
      <g transform="translate(110, 185)">
        ${lines.slice(0, 5).map((line, i) => `
          <text x="0" y="${i * 28}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="500" fill="#334155">${escapeHtml(line)}</text>
        `).join('')}
      </g>
    `}
    
    <g transform="translate(110, 350)">
      <rect x="0" y="0" width="580" height="30" rx="6" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
      <text x="15" y="19" font-family="monospace" font-size="11" fill="#475569" font-weight="bold">${escapeHtml(domain)}</text>
    </g>
    
    <line x1="80" y1="395" x2="720" y2="395" stroke="#F1F5F9" stroke-width="1"/>
    
    <text x="110" y="425" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="bold" fill="#1877F2">👍 Thích</text>
    <text x="200" y="425" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="bold" fill="#64748B">💬 Bình luận</text>
    <text x="310" y="425" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="bold" fill="#64748B">🔄 Chia sẻ</text>
    
    <text x="690" y="425" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#94A3B8" text-anchor="end">Cập nhật tự động • Không mờ</text>
  </svg>
  `;

  const base64Svg = Buffer.from(svg).toString('base64');
  return res.status(200).json({
    success: true,
    screenshotUrl: `data:image/svg+xml;base64,${base64Svg}`
  });
}
