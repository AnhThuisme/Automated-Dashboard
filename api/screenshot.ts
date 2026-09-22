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

  // Try WordPress mShots
  try {
    const wpUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(originalUrl)}?w=900&h=1100`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => clearTimeout(timeoutId), 12000);
    const wpRes = await fetch(wpUrl, { signal: controller.signal });
    if (wpRes.ok) {
      const buffer = await wpRes.arrayBuffer();
      if (buffer.byteLength > 5000) {
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = wpRes.headers.get("content-type") || "image/jpeg";
        return res.status(200).json({
          success: true,
          screenshotUrl: `data:${mimeType};base64,${base64}`
        });
      }
    }
  } catch (wpErr) {}

  // Try direct Facebook / OpenGraph image
  if (parsedImage && parsedImage.startsWith('http')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => clearTimeout(timeoutId), 10000);
      const imgRes = await fetch(parsedImage, { signal: controller.signal });
      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = imgRes.headers.get("content-type") || "image/jpeg";
        return res.status(200).json({
          success: true,
          screenshotUrl: `data:${mimeType};base64,${base64}`
        });
      }
    } catch (imgErr) {}
  }

  // 4. Return error if no real screenshot could be obtained
  return res.status(502).json({
    success: false,
    error: 'Không thể chụp ảnh màn hình tự động cho link này.'
  });
}
