/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy initializer for GoogleGenAI SDK to avoid crashing on startup if key is missing
let aiClient: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('Chưa cấu hình khóa API GEMINI_API_KEY trong Settings > Secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to call Gemini with automatic model fallback and exponential backoff retries for transient errors (503, 429, etc.)
async function callGeminiWithModelFallback(ai: GoogleGenAI, baseParams: any, maxRetriesPerModel = 2, baseDelayMs = 1500) {
  // Ordered from the most stable general-purpose models down to experimental ones
  const models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro", "gemini-3.5-flash"];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
      try {
        console.log(`[Gemini API] Đang thử phân loại với mô hình: ${model} (Lần thử ${attempt}/${maxRetriesPerModel})...`);
        const response = await ai.models.generateContent({
          ...baseParams,
          model: model,
        });
        console.log(`[Gemini API] Thành công với mô hình: ${model}`);
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        console.warn(`[Gemini API] Mô hình ${model} (Lần thử ${attempt}) thất bại: ${errMsg}`);

        // Check if it's a transient error
        const isTransient = 
          errMsg.includes("503") || 
          errMsg.includes("429") ||
          errMsg.toLowerCase().includes("unavailable") ||
          errMsg.toLowerCase().includes("high demand") ||
          errMsg.toLowerCase().includes("spikes in demand") ||
          errMsg.toLowerCase().includes("temporary") ||
          errMsg.toLowerCase().includes("rate limit") ||
          errMsg.toLowerCase().includes("resource exhausted") ||
          err?.status === 503 ||
          err?.status === 429;

        if (isTransient) {
          const sleepTime = baseDelayMs * Math.pow(1.5, attempt - 1);
          console.log(`[Gemini API] Lỗi tạm thời phát hiện. Chờ ${sleepTime}ms trước khi thử lại...`);
          await delay(sleepTime);
        } else {
          // If it's a permanent error (like unsupported parameter or auth issue), skip immediately to the next model
          console.warn(`[Gemini API] Lỗi không tạm thời với mô hình ${model}. Chuyển sang mô hình tiếp theo.`);
          break;
        }
      }
    }
  }
  throw lastError || new Error("Tất cả các mô hình Gemini đều gặp sự cố hoặc quá tải.");
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint to fetch public Google Sheets CSV data without requiring OAuth login
app.post("/api/fetch-public-sheet", async (req, res) => {
  try {
    const { spreadsheetId, sheetName } = req.body;
    const id = spreadsheetId || "11P3rKeTK-JpzKC8xxgJhsnQcZe2fCzKyAx281z62Ta8";
    const name = sheetName || "Facebook: Post Insights";

    const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&sheet=${encodeURIComponent(name)}`;
    console.log(`[Public Sheet API] Đang tải dữ liệu public CSV từ: ${csvUrl}`);
    let response = await fetch(csvUrl);

    if (!response.ok) {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
      console.log(`[Public Sheet API] Thử gviz CSV fallback: ${gvizUrl}`);
      response = await fetch(gvizUrl);
    }

    if (!response.ok) {
      return res.status(400).json({ error: `Không thể tải dữ liệu CSV từ Google Sheet. Mã phản hồi: ${response.status}` });
    }

    const csvText = await response.text();
    return res.json({ csvText });
  } catch (err: any) {
    console.error("[Public Sheet API Error]:", err);
    return res.status(500).json({ error: err.message || "Lỗi nạp dữ liệu từ Google Sheet công khai" });
  }
});

// Dedicated endpoint to render Facebook embed via Javascript SDK (FB.XFBML.parse)
app.get("/fb-embed", (req, res) => {
  const targetUrl = req.query.url as string;
  const width = req.query.width as string || "600";
  
  if (!targetUrl) {
    return res.status(400).send("Thiếu tham số url.");
  }

  // Ensure targetUrl is a valid full HTTP/HTTPS URL
  let parsedUrl = targetUrl;
  if (!/^https?:\/\//i.test(parsedUrl)) {
    parsedUrl = "https://" + parsedUrl;
  }

  // We ALWAYS use fb-post (Embedded Posts) for all content types including standard posts, photos, videos, and reels.
  // This is because fb-video (Embedded Video Player) ONLY renders the video block itself and completely hides
  // the poster's avatar, page name, header, and description. Using fb-post renders a fully-formed social post card,
  // ensuring that our screenshot service captures all metadata, caption text, and header elements perfectly.
  const fbClass = "fb-post";

  // Generate clean public HTML using official FB SDK so it loads complete components (Caption, Avatar, Header) of posts/videos/reels
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Facebook Post Embed (XFBML)</title>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      background-color: #ffffff !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
      overflow: auto !important;
    }
    #embed-wrapper {
      width: 100%;
      max-width: ${width}px;
      margin: 10px auto;
      background: #ffffff !important;
      padding: 0;
      box-sizing: border-box;
    }
    /* Guarantee Facebook SDK widgets and parent containers maintain standard light background and visibility */
    .fb-post, .fb-post span, .fb-post iframe, .fb-video, .fb-video span, .fb-video iframe {
      background-color: #ffffff !important;
      background: #ffffff !important;
      margin: 0 auto !important;
    }
  </style>
</head>
<body>
  <div id="fb-root"></div>
  
  <!-- Declare fbAsyncInit BEFORE loading the SDK script to prevent any race condition -->
  <script>
    window.fbAsyncInit = function() {
      try {
        FB.init({
          xfbml: true,
          version: 'v18.0'
        });
        console.log("FB SDK Initialized. Parsing XFBML...");
        FB.XFBML.parse();
      } catch(e) {
        console.error("XFBML initialization failed:", e);
      }
    };

    // Periodic safety check to ensure parsing triggers even on slow connections
    setTimeout(function() {
      try {
        if (typeof FB !== 'undefined' && FB.XFBML) {
          console.log("Safety fallback: Parsing XFBML...");
          FB.XFBML.parse();
        }
      } catch(e){}
    }, 1500);
  </script>

  <!-- Load the Facebook JavaScript SDK with Vietnamese locale -->
  <script async defer crossorigin="anonymous" src="https://connect.facebook.net/vi_VN/sdk.js#xfbml=1&version=v18.0"></script>
  
  <div id="embed-wrapper">
    <!-- Render as a fully structured fb-post or fb-video card which keeps full author header, avatar, and full caption text -->
    <div class="${fbClass}" 
         data-href="${parsedUrl}" 
         data-width="${width}" 
         data-show-text="true"
         data-include-parent-opt="true">
    </div>
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// Helper to extract domain name
function getDomain(urlStr: string): string {
  try {
    let cleanUrl = urlStr.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = "https://" + cleanUrl;
    }
    const parsed = new URL(cleanUrl);
    return parsed.hostname.replace('www.', '');
  } catch (e) {
    return urlStr;
  }
}

// Helper to wrap text for SVG rendering
function wrapText(text: string, maxCharsPerLine = 38): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Decode HTML entities (named, hex, and decimal numeric character references)
function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  try {
    return str
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        try {
          return String.fromCodePoint(parseInt(hex, 16));
        } catch {
          return `&#x${hex};`;
        }
      })
      .replace(/&#([0-9]+);/g, (_, dec) => {
        try {
          return String.fromCodePoint(parseInt(dec, 10));
        } catch {
          return `&#${dec};`;
        }
      })
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
  } catch (err) {
    console.warn("[decodeHtmlEntities] Error decoding HTML entities:", err);
    return str;
  }
}

// Escape HTML for safe inclusion in SVG
function escapeHtml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper to parse meta tags robustly using regular expressions
function parseMetaTag(html: string, nameOrProperty: string): string {
  const regexes = [
    new RegExp(`<meta[^>]*property=["']${nameOrProperty}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${nameOrProperty}["']`, 'i'),
    new RegExp(`<meta[^>]*name=["']${nameOrProperty}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${nameOrProperty}["']`, 'i')
  ];
  for (const regex of regexes) {
    const match = html.match(regex);
    if (match) {
      return decodeHtmlEntities(match[1].trim());
    }
  }
  return "";
}

// Fetch an external image server-side and convert to base64 data URI (bypasses Facebook CDN CORS)
async function proxyImageToBase64(imageUrl: string): Promise<string> {
  if (!imageUrl) return '';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Referer': 'https://www.facebook.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const mime = res.headers.get('content-type') || 'image/jpeg';
      return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
    }
  } catch (e) {}
  return '';
}

// Generate an elegant SVG mockup card as a sharp, non-blurry, instant preview
function generateFallbackCard(
  urlStr: string,
  title: string,
  parsedImageBase64?: string,  // now expects base64 data URI, not external URL
  parsedDesc?: string,
  parsedSiteName?: string
): string {
  const domain = getDomain(urlStr);
  let platform = 'GENERIC';
  
  if (/facebook\.com|fb\.com|fb\.watch/i.test(domain)) {
    platform = 'FACEBOOK';
  } else if (/tiktok\.com/i.test(domain)) {
    platform = 'TIKTOK';
  } else if (/instagram\.com/i.test(domain)) {
    platform = 'INSTAGRAM';
  } else if (/youtube\.com|youtu\.be/i.test(domain)) {
    platform = 'YOUTUBE';
  }

  // Adjust wrap widths based on whether there's an image
  const parsedImage = parsedImageBase64; // use base64 data URI throughout
  const wrapWidth = parsedImage ? 28 : 42;
  const mainTitle = title || parsedSiteName || 'Liên kết bài viết';
  const lines = wrapText(mainTitle, wrapWidth);
  const descText = parsedDesc || '';
  const descLines = wrapText(descText, wrapWidth);
  const dateStr = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let svg = '';

  if (platform === 'FACEBOOK') {
    svg = `
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
      
      <text x="164" y="108" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="bold" fill="#1E293B">Facebook Post</text>
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
  } else if (platform === 'TIKTOK') {
    svg = `
    <svg width="800" height="500" viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#010101"/>
          <stop offset="100%" stop-color="#111827"/>
        </linearGradient>
        <clipPath id="tt-img-clip">
          <rect x="440" y="150" width="220" height="200" rx="12" />
        </clipPath>
      </defs>
      
      <rect width="800" height="500" fill="url(#tt-grad)"/>
      <rect x="0" y="0" width="8" height="500" fill="#00f2fe"/>
      <rect x="792" y="0" width="8" height="500" fill="#fe0979"/>
      
      <g transform="translate(100, 65)">
        <path d="M22 0 L22 25 C19 23 15 23 13 25 C10 27 10 31 12 33 C14 35 18 35 20 33 C22 31 22 28 22 28 L22 10 L34 10 L34 0 Z" fill="#00f2fe" opacity="0.8"/>
        <path d="M20 2 L20 27 C17 25 13 25 11 27 C8 29 8 33 10 35 C12 37 16 37 18 35 C20 33 20 30 20 30 L20 12 L32 12 L32 2 Z" fill="#fe0979" opacity="0.8"/>
        <path d="M21 1 L21 26 C18 24 14 24 12 26 C9 28 9 32 11 34 C13 36 17 36 19 34 C21 32 21 29 21 29 L21 11 L33 11 L33 1 Z" fill="#ffffff"/>
      </g>
      
      <text x="160" y="90" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="900" fill="#ffffff" letter-spacing="2">TIKTOK</text>
      <text x="160" y="110" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" fill="#94A3B8">${escapeHtml(domain)} • ${dateStr}</text>
      
      ${parsedImage ? `
        <g transform="translate(100, 160)">
          ${lines.slice(0, 5).map((line, i) => `
            <text x="0" y="${i * 24}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="bold" fill="#F8FAFC">${escapeHtml(line)}</text>
          `).join('')}
          <g transform="translate(0, 130)">
            ${descLines.slice(0, 3).map((line, i) => `
              <text x="0" y="${i * 18}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" fill="#94A3B8">${escapeHtml(line)}</text>
            `).join('')}
          </g>
        </g>
        <g>
          <rect x="439" y="149" width="222" height="202" rx="13" fill="#1E293B" stroke="#334155" stroke-width="1" />
          <image href="${escapeHtml(parsedImage)}" x="440" y="150" width="220" height="200" preserveAspectRatio="xMidYMid slice" clip-path="url(#tt-img-clip)" referrerPolicy="no-referrer" />
          
          <circle cx="550" cy="250" r="24" fill="#000000" opacity="0.6" />
          <polygon points="545,240 545,260 561,250" fill="#ffffff" />
        </g>
      ` : `
        <rect x="100" y="150" width="600" height="230" rx="12" fill="#1E293B" opacity="0.6" stroke="#334155" stroke-width="1"/>
        <g transform="translate(130, 200)">
          ${lines.slice(0, 5).map((line, i) => `
            <text x="0" y="${i * 28}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="18" font-weight="bold" fill="#F8FAFC">${escapeHtml(line)}</text>
          `).join('')}
        </g>
      `}
      
      <text x="400" y="445" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="bold" fill="#00f2fe" text-anchor="middle" letter-spacing="1">▶ VIDEO CẬP NHẬT TRỰC TIẾP TỪ TIKTOK</text>
    </svg>
    `;
  } else if (platform === 'INSTAGRAM') {
    svg = `
    <svg width="800" height="500" viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#C13584"/>
          <stop offset="50%" stop-color="#E1306C"/>
          <stop offset="100%" stop-color="#FCAF45"/>
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity="0.3"/>
        </filter>
        <clipPath id="ig-img-clip">
          <rect x="440" y="160" width="220" height="190" rx="12" />
        </clipPath>
      </defs>
      
      <rect width="800" height="500" fill="url(#ig-grad)"/>
      
      <g filter="url(#shadow)">
        <rect x="120" y="60" width="560" height="380" rx="20" fill="#ffffff"/>
      </g>
      
      <rect x="150" y="85" width="34" height="34" rx="10" fill="none" stroke="url(#ig-grad)" stroke-width="3"/>
      <circle cx="167" cy="102" r="8" fill="none" stroke="url(#ig-grad)" stroke-width="3"/>
      <circle cx="177" cy="92" r="2.5" fill="url(#ig-grad)"/>
      
      <text x="198" y="102" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="900" fill="#262626">Instagram</text>
      <text x="198" y="116" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" fill="#8E8E8E">${escapeHtml(domain)} • ${dateStr}</text>
      
      <line x1="120" y1="135" x2="680" y2="135" stroke="#EFEFEF" stroke-width="1"/>
      
      ${parsedImage ? `
        <g transform="translate(150, 175)">
          ${lines.slice(0, 5).map((line, i) => `
            <text x="0" y="${i * 24}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="15" font-weight="600" fill="#262626">${escapeHtml(line)}</text>
          `).join('')}
          <g transform="translate(0, 130)">
            ${descLines.slice(0, 3).map((line, i) => `
              <text x="0" y="${i * 18}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" fill="#8E8E8E">${escapeHtml(line)}</text>
            `).join('')}
          </g>
        </g>
        <g>
          <rect x="439" y="159" width="222" height="192" rx="13" fill="#FAFAFA" stroke="#EFEFEF" stroke-width="1" />
          <image href="${escapeHtml(parsedImage)}" x="440" y="160" width="220" height="190" preserveAspectRatio="xMidYMid slice" clip-path="url(#ig-img-clip)" referrerPolicy="no-referrer" />
        </g>
      ` : `
        <rect x="150" y="155" width="500" height="200" rx="8" fill="#FAFAFA" stroke="#EFEFEF" stroke-width="1"/>
        <g transform="translate(180, 200)">
          ${lines.slice(0, 5).map((line, i) => `
            <text x="0" y="${i * 26}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="500" fill="#262626">${escapeHtml(line)}</text>
          `).join('')}
        </g>
      `}
      
      <line x1="120" y1="375" x2="680" y2="375" stroke="#EFEFEF" stroke-width="1"/>
      
      <text x="150" y="410" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="bold" fill="#E1306C">❤️ Thích</text>
      <text x="230" y="410" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="bold" fill="#262626">💬 Bình luận</text>
      <text x="650" y="410" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="bold" fill="#3897F0" text-anchor="end">Cập nhật sắc nét</text>
    </svg>
    `;
  } else if (platform === 'YOUTUBE') {
    svg = `
    <svg width="800" height="500" viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="yt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF0000"/>
          <stop offset="100%" stop-color="#1F2937"/>
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity="0.3"/>
        </filter>
        <clipPath id="yt-img-clip">
          <rect x="440" y="160" width="220" height="190" rx="12" />
        </clipPath>
      </defs>
      
      <rect width="800" height="500" fill="url(#yt-grad)"/>
      
      <g filter="url(#shadow)">
        <rect x="80" y="60" width="640" height="380" rx="16" fill="#ffffff"/>
      </g>
      
      <rect x="110" y="85" width="46" height="32" rx="8" fill="#FF0000"/>
      <polygon points="128,94 128,108 140,101" fill="#ffffff"/>
      
      <text x="170" y="100" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="18" font-weight="900" fill="#111827">YouTube</text>
      <text x="170" y="114" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" fill="#6B7280">${escapeHtml(domain)} • ${dateStr}</text>
      
      <line x1="80" y1="135" x2="720" y2="135" stroke="#E5E7EB" stroke-width="1"/>
      
      ${parsedImage ? `
        <g transform="translate(110, 175)">
          ${lines.slice(0, 5).map((line, i) => `
            <text x="0" y="${i * 24}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#111827">${escapeHtml(line)}</text>
          `).join('')}
          <g transform="translate(0, 130)">
            ${descLines.slice(0, 3).map((line, i) => `
              <text x="0" y="${i * 18}" font-family="sans-serif" font-size="12" fill="#4B5563">${escapeHtml(line)}</text>
            `).join('')}
          </g>
        </g>
        <g>
          <rect x="439" y="159" width="222" height="192" rx="13" fill="#F3F4F6" stroke="#E5E7EB" stroke-width="1" />
          <image href="${escapeHtml(parsedImage)}" x="440" y="160" width="220" height="190" preserveAspectRatio="xMidYMid slice" clip-path="url(#yt-img-clip)" referrerPolicy="no-referrer" />
          
          <circle cx="550" cy="255" r="22" fill="#FF0000" opacity="0.9" />
          <polygon points="545,247 545,263 560,255" fill="#ffffff" />
        </g>
      ` : `
        <rect x="110" y="155" width="580" height="210" rx="10" fill="#F3F4F6" stroke="#E5E7EB" stroke-width="1"/>
        <circle cx="400" cy="245" r="30" fill="#FF0000" opacity="0.9"/>
        <polygon points="392,235 392,255 414,245" fill="#ffffff"/>
        <g transform="translate(135, 315)">
          ${lines.slice(0, 2).map((line, i) => `
            <text x="0" y="${i * 24}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#1F2937">${escapeHtml(line)}</text>
          `).join('')}
        </g>
      `}
      
      <line x1="80" y1="390" x2="720" y2="390" stroke="#E5E7EB" stroke-width="1"/>
      <text x="400" y="420" font-family="sans-serif" font-size="12" font-weight="bold" fill="#FF0000" text-anchor="middle">▲ CLICK "MỞ LINK" ĐỂ XEM VIDEO GỐC</text>
    </svg>
    `;
  } else {
    svg = `
    <svg width="800" height="500" viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="generic-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#10B5A5"/>
          <stop offset="100%" stop-color="#0F172A"/>
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity="0.2"/>
        </filter>
        <clipPath id="gen-img-clip">
          <rect x="440" y="190" width="220" height="150" rx="12" />
        </clipPath>
      </defs>
      
      <rect width="800" height="500" fill="url(#generic-grad)"/>
      
      <g filter="url(#shadow)">
        <rect x="80" y="60" width="640" height="380" rx="16" fill="#ffffff"/>
      </g>
      
      <path d="M80 76 C80 67 87 60 96 60 L704 60 C713 60 720 67 720 76 L720 100 L80 100 Z" fill="#F8FAFC"/>
      
      <circle cx="110" cy="80" r="6" fill="#EF4444"/>
      <circle cx="130" cy="80" r="6" fill="#F59E0B"/>
      <circle cx="150" cy="80" r="6" fill="#10B5A5"/>
      
      <rect x="180" y="70" width="460" height="20" rx="6" fill="#E2E8F0"/>
      <text x="410" y="84" font-family="monospace" font-size="10" fill="#475569" text-anchor="middle" font-weight="bold">${escapeHtml(domain)}</text>
      
      <g transform="translate(110, 115)">
        <text x="0" y="25" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="18" font-weight="bold" fill="#0F172A">${escapeHtml(parsedSiteName || 'Trang thông tin')}</text>
        <text x="0" y="42" font-family="sans-serif" font-size="11" fill="#64748B">${escapeHtml(domain)} • ${dateStr}</text>
      </g>
      
      <line x1="80" y1="175" x2="720" y2="175" stroke="#F1F5F9" stroke-width="1"/>
      
      ${parsedImage ? `
        <g transform="translate(110, 200)">
          ${lines.slice(0, 4).map((line, i) => `
            <text x="0" y="${i * 24}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="15" font-weight="600" fill="#1E293B">${escapeHtml(line)}</text>
          `).join('')}
          <g transform="translate(0, 105)">
            ${descLines.slice(0, 3).map((line, i) => `
              <text x="0" y="${i * 18}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" fill="#64748B">${escapeHtml(line)}</text>
            `).join('')}
          </g>
        </g>
        <g>
          <rect x="439" y="189" width="222" height="152" rx="13" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" />
          <image href="${escapeHtml(parsedImage)}" x="440" y="190" width="220" height="150" preserveAspectRatio="xMidYMid slice" clip-path="url(#gen-img-clip)" referrerPolicy="no-referrer" />
        </g>
      ` : `
        <g transform="translate(110, 200)">
          ${lines.slice(0, 5).map((line, i) => `
            <text x="0" y="${i * 28}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="17" font-weight="500" fill="#334155">${escapeHtml(line)}</text>
          `).join('')}
        </g>
      `}
      
      <line x1="80" y1="390" x2="720" y2="390" stroke="#F1F5F9" stroke-width="1"/>
      <text x="110" y="420" font-family="sans-serif" font-size="12" font-weight="bold" fill="#10B5A5">✦ THÔNG TIN CHUẨN XÁC</text>
      <text x="690" y="420" font-family="sans-serif" font-size="11" fill="#94A3B8" text-anchor="end">Cộng tác viên Vĩnh Tường</text>
    </svg>
    `;
  }

  return svg;
}

// Screenshot website/URL endpoint
app.get("/api/screenshot", async (req, res) => {
  try {
    const { url, title } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "Thiếu tham số url" });
    }

    let originalUrl = url.trim();
    if (!/^https?:\/\//i.test(originalUrl)) {
      originalUrl = "https://" + originalUrl;
    }

    const postTitle = (title && typeof title === 'string') ? title.trim() : "Liên kết bài viết";

    let parsedTitle = "";
    let parsedDesc = "";
    let parsedImage = "";
    let parsedSiteName = "";

    try {
      console.log(`[Screenshot API] Đang kết nối tải dữ liệu meta cho: ${originalUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout

      const response = await fetch(originalUrl, {
        headers: {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const html = await response.text();
        
        parsedTitle = parseMetaTag(html, 'og:title') || parseMetaTag(html, 'title');
        if (!parsedTitle) {
          const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (m) parsedTitle = decodeHtmlEntities(m[1].trim());
        }
        
        parsedDesc = parseMetaTag(html, 'og:description') || parseMetaTag(html, 'description');
        parsedImage = parseMetaTag(html, 'og:image') || parseMetaTag(html, 'image') || parseMetaTag(html, 'twitter:image');
        parsedSiteName = parseMetaTag(html, 'og:site_name');

        // Extract direct Facebook CDN image URL if og:image wasn't captured in standard meta tags
        if (!parsedImage || parsedImage.includes('static.xx.fbcdn')) {
          const scontentMatch = html.match(/https:\/\/(scontent|fbcdn\.net)[^"'\s\\]+/i);
          if (scontentMatch) {
            parsedImage = scontentMatch[0].replace(/\\/g, '');
          }
        }

        console.log(`[Screenshot API] Tải thẻ meta thành công cho ${originalUrl}`);
        console.log(` - Tiêu đề: "${parsedTitle}"`);
        console.log(` - Hình ảnh: "${parsedImage}"`);
      } else {
        console.warn(`[Screenshot API] URL phản hồi mã trạng thái: ${response.status}`);
      }
    } catch (err: any) {
      console.warn(`[Screenshot API] Bỏ qua lỗi tải meta (sử dụng fallback mặc định):`, err.message);
    }

    // Normalize mobile Facebook URLs to standard WWW
    const cleanUrl = originalUrl.replace(/\/\/(m|mobile|touch|da|developers)\.facebook\.com/i, '//www.facebook.com');

    const isFacebook = /facebook\.com|fb\.watch|fb\.com/i.test(cleanUrl);

    // For standard Facebook post permalinks, use official post embed URL to bypass guest login modals & cookie prompts natively.
    // NOTE: Reels, Videos, and Watch URLs should be loaded directly as plugins/post.php does not support them.
    let targetUrl = cleanUrl;
    if (isFacebook && !cleanUrl.includes('plugins/') && !cleanUrl.includes('/reel/') && !cleanUrl.includes('/videos/') && !cleanUrl.includes('/watch/')) {
      targetUrl = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(cleanUrl)}&width=750&show_text=true&locale=vi_VN`;
    }

    // 0. Attempt 0: Real Headless Chrome Browser (Puppeteer/Selenium Engine)
    try {
      const puppeteerModule = await import('puppeteer');
      const puppeteer = puppeteerModule.default || puppeteerModule;
      
      const fs = await import('fs');
      let chromePath: string | undefined = undefined;

      // Priority 0: Environment variables (Render, Docker, Cloud)
      if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        chromePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        console.log(`[Screenshot API] Sử dụng Chrome từ biến môi trường PUPPETEER_EXECUTABLE_PATH: ${chromePath}`);
      } else if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
        chromePath = process.env.CHROME_BIN;
        console.log(`[Screenshot API] Sử dụng Chrome từ biến môi trường CHROME_BIN: ${chromePath}`);
      }

      // Priority 1: Use Puppeteer's bundled Chrome for Testing (v25+ returns a Promise)
      if (!chromePath) {
        try {
          const puppeteerPath = (puppeteer as any).executablePath
            ? await Promise.resolve((puppeteer as any).executablePath())
            : undefined;
          if (typeof puppeteerPath === 'string' && fs.existsSync(puppeteerPath)) {
            chromePath = puppeteerPath;
            console.log(`[Screenshot API] Sử dụng Chrome của Puppeteer: ${chromePath}`);
          }
        } catch(e) {
          console.warn('[Screenshot API] Không thể lấy executablePath từ Puppeteer:', (e as any).message);
        }
      }

      // Priority 2: Fall back to system Chrome paths
      if (!chromePath) {
        const possibleChromePaths = [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium'
        ];
        for (const p of possibleChromePaths) {
          if (fs.existsSync(p)) {
            chromePath = p;
            console.log(`[Screenshot API] Sử dụng Chrome hệ thống: ${chromePath}`);
            break;
          }
        }
      }

      const launchOpts: any = {
        headless: 'new' as any,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-extensions',
          '--mute-audio',
          '--window-size=1280,900'
        ]
      };
      if (chromePath) {
        launchOpts.executablePath = chromePath;
      }

      console.log(`[Screenshot API] [Hàng đợi 0 - Headless Chrome] Đang mở Chrome (${chromePath || 'auto-detect'}) chụp: ${targetUrl}`);
      const browser = await puppeteer.launch(launchOpts);

      try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7' });

        // Auto-dismiss script injected before page document loads
        await page.evaluateOnNewDocument(`
          window.__name = function(fn) { return fn; };
          globalThis.__name = function(fn) { return fn; };
          try {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            window.chrome = { runtime: {} };

            function purgeModals() {
              try {
                var closeBtns = Array.from(document.querySelectorAll('[aria-label="Đóng"], [aria-label="Close"], [aria-label="Thoát"], [aria-label="Tắt"], [aria-label="Lúc khác"], [aria-label="Dismiss"]'));
                closeBtns.forEach(function(btn) {
                  try {
                    btn.click();
                    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                  } catch(e){}
                });

                var dialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[aria-label*="Facebook"]'));
                dialogs.forEach(function(dialog) {
                  var text = (dialog.textContent || '').toLowerCase();
                  if (text.includes('xem thêm') || text.includes('đăng nhập') || text.includes('see more') || text.includes('log in') || text.includes('tạo tài khoản')) {
                    var targetToRemove = dialog;
                    var current = dialog;
                    for (var i = 0; i < 6; i++) {
                      if (current.parentElement && current.parentElement !== document.body && current.parentElement !== document.documentElement) {
                        var style = window.getComputedStyle(current.parentElement);
                        if (style.position === 'fixed' || style.position === 'absolute' || parseInt(style.zIndex || '0') >= 5) {
                          targetToRemove = current.parentElement;
                        }
                        current = current.parentElement;
                      }
                    }
                    targetToRemove.remove();
                  }
                });

                var overlays = Array.from(document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"], div.x1n2onr6, div[role="banner"]'));
                overlays.forEach(function(el) {
                  var txt = (el.textContent || '').toLowerCase();
                  var style = window.getComputedStyle(el);
                  if (style.position === 'fixed' && (txt.includes('đăng nhập') || txt.includes('xem thêm') || txt.includes('log in') || el.querySelector('input[type="text"], input[type="password"]'))) {
                    el.remove();
                  }
                });

                if (document.body) {
                  document.body.style.overflow = 'auto';
                  document.body.style.position = 'relative';
                }
                if (document.documentElement) {
                  document.documentElement.style.overflow = 'auto';
                }
              } catch(e){}
            }

            window.addEventListener('DOMContentLoaded', function() {
              purgeModals();
              var observer = new MutationObserver(function() { purgeModals(); });
              if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
              }
              setInterval(purgeModals, 200);
            });
          } catch(e){}
        `);

        const viewportWidth = (isFacebook && !targetUrl.includes('plugins/')) ? 1280 : (isFacebook ? 780 : 1280);
        // Height 1150px allows full post photo/banner to fit in screenshot without bottom cropping
        await page.setViewport({ width: viewportWidth, height: 1150, deviceScaleFactor: 1.5 });

        // Native Puppeteer Physical OS Mouse Clicker for Facebook 'X' Close Buttons
        const clickCloseButtonsNatively = async () => {
          try {
            const closeHandles = await page.$$('[aria-label="Đóng"], [aria-label="Close"], [aria-label="Thoát"], [aria-label="Tắt"], [aria-label="Lúc khác"], [aria-label="Dismiss"]');
            for (const handle of closeHandles) {
              try {
                const box = await handle.boundingBox();
                if (box && box.width > 0 && box.height > 0) {
                  console.log(`[Screenshot API] Phát hiện nút X tại [x: ${Math.round(box.x)}, y: ${Math.round(box.y)}]. Thực hiện click chuột phần cứng...`);
                  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                  await new Promise(r => setTimeout(r, 300));
                }
              } catch(e){}
            }
          } catch(e){}
        };
        
        try {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        } catch (gotoErr) {
          console.warn(`[Screenshot API] fallback networkidle2 cho: ${targetUrl}`);
          try {
            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 8000 });
          } catch(e){}
        }

        // Pass 1: Physical mouse click on close buttons immediately after page navigation
        await clickCloseButtonsNatively();

        // Real-Human Automated Selenium Chrome Workflow:
        // 1. Fast smooth scrolling to trigger viewport observers & lazy-loaded media
        await page.evaluate(`(async function() {
          try {
            for (var y = 0; y <= 400; y += 80) {
              window.scrollTo(0, y);
              await new Promise(function(r) { setTimeout(r, 20); });
            }
            window.scrollTo(0, 0);

            var imgs = Array.from(document.querySelectorAll('img'));
            imgs.forEach(function(img) {
              var lazySrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-srcset') || img.getAttribute('data-[#src]');
              if (lazySrc && (!img.src || img.src.includes('data:image') || img.naturalWidth === 0)) {
                img.src = lazySrc.split(' ')[0];
              }
              img.removeAttribute('loading');
              img.style.opacity = '1';
              img.style.visibility = 'visible';
            });
          } catch(e){}

          try {
            var closeBtns = Array.from(document.querySelectorAll('[aria-label="Đóng"], [aria-label="Close"], [aria-label="Thoát"], [aria-label="Tắt"], [aria-label="Lúc khác"], [aria-label="Dismiss"]'));
            closeBtns.forEach(function(btn) {
              try {
                btn.click();
                btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
              } catch(e){}
            });

            var style = document.createElement('style');
            style.id = 'auto-dismiss-fb-modals';
            style.textContent = \`
              ._5p1e, ._5ptz, ._1p1t, [data-testid="post_message"], [class*="userContent"], [class*="caption"], div[dir="auto"] {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                max-height: none !important;
                overflow: visible !important;
                font-size: 15px !important;
                line-height: 1.4 !important;
                color: #1c1e21 !important;
                margin-bottom: 12px !important;
              }
              body, html, #facebook, ._5p3y, div[role="dialog"], div[role="dialog"] > div {
                overflow: visible !important;
                height: auto !important;
                max-height: none !important;
              }
              img {
                opacity: 1 !important;
                visibility: visible !important;
                max-height: none !important;
              }
              div[role="dialog"]:has(input[type="text"]),
              div[role="dialog"]:has(input[type="password"]),
              div[role="dialog"]:has(form),
              div[aria-label="Xem thêm trên Facebook"],
              div[aria-label="See more on Facebook"],
              #login_popup,
              div[role="banner"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
              }
            \`;
            if (!document.getElementById('auto-dismiss-fb-modals')) {
              document.head.appendChild(style);
            }

            document.querySelectorAll('span, div, a, button').forEach(function(el) {
              var t = (el.textContent || "").trim().toLowerCase();
              if ((t === 'xem thêm' || t === 'see more') && !el.querySelector('span, div')) {
                el.click();
              }
            });
          } catch(e){}
        })()`);

        // Pass 2: Physical mouse click pass after scroll
        await clickCloseButtonsNatively();

        // Fast 800ms render wait
        await new Promise(r => setTimeout(r, 800));

        // Final safety pass: Physical mouse click & DOM purge right before taking screenshot
        await clickCloseButtonsNatively();
        await page.evaluate(`(function() {
          try {
            document.querySelectorAll('div[role="dialog"], div[aria-label*="Facebook"]').forEach(function(dialog) {
              var txt = (dialog.textContent || '').toLowerCase();
              if (txt.includes('xem thêm') || txt.includes('đăng nhập') || txt.includes('see more') || txt.includes('log in') || txt.includes('tạo tài khoản')) {
                var targetToRemove = dialog;
                var current = dialog;
                for (var i = 0; i < 6; i++) {
                  if (current.parentElement && current.parentElement !== document.body && current.parentElement !== document.documentElement) {
                    var style = window.getComputedStyle(current.parentElement);
                    if (style.position === 'fixed' || style.position === 'absolute' || parseInt(style.zIndex || '0') >= 5) {
                      targetToRemove = current.parentElement;
                    }
                    current = current.parentElement;
                  }
                }
                targetToRemove.remove();
              }
            });
          } catch(e){}
        })()`);

        // 4. Dynamic Viewport Auto-Calculation: Measure exact height of original white post card to guarantee 100% un-cropped capture from top header to bottom edge of photo grid
        try {
          const layoutMetrics: any = await page.evaluate(`(function() {
            var maxBottom = 1100;
            var card = document.querySelector('div[role="dialog"], ._5p3y, [data-pagelet="FeedUnit"], ._4-eo');
            if (card) {
              var rect = card.getBoundingClientRect();
              if (rect.bottom > 0) {
                maxBottom = Math.max(maxBottom, rect.bottom + window.scrollY);
              }
            }

            var imgs = Array.from(document.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"], ._4-eo, ._5qgq, [class*="photo"], [class*="media"], [class*="stage"]'));
            imgs.forEach(function(el) {
              var rect = el.getBoundingClientRect();
              if (rect.height > 50 && rect.bottom > 0) {
                maxBottom = Math.max(maxBottom, rect.bottom + window.scrollY);
              }
            });

            return { maxBottom: maxBottom };
          })()`);

          if (layoutMetrics && layoutMetrics.maxBottom > 950) {
            const dynamicHeight = Math.min(2600, Math.ceil(layoutMetrics.maxBottom + 100));
            console.log(`[Screenshot API] Mở rộng khung chụp theo chiều cao tự nhiên của khung bài viết gốc: ${dynamicHeight}px...`);
            await page.setViewport({ width: viewportWidth, height: dynamicHeight, deviceScaleFactor: 1.5 });
            await new Promise(r => setTimeout(r, 400));
          }
        } catch(e){}

        await new Promise(r => setTimeout(r, 400));

        // Take a screenshot of the actual desktop Facebook post page
        const buffer = await page.screenshot({ type: 'png', fullPage: false });
        const base64Image = Buffer.from(buffer).toString('base64');

        await browser.close();

        if (base64Image) {
          console.log(`[Screenshot API] [Hàng đợi 0] Chụp thành công 100% trang Facebook thực!`);
          return res.json({
            success: true,
            screenshotUrl: `data:image/png;base64,${base64Image}`
          });
        }
      } catch (innerErr) {
        await browser.close();
        throw innerErr;
      }
    } catch (puppeteerErr: any) {
      console.warn(`[Screenshot API] Headless Chrome chưa khả dụng (Chuyển sang hàng đợi kế tiếp):`, puppeteerErr.message);
    }

    // 1. Attempt 1: Cloud Screenshot API (Microlink fallback for cloud environments)
    try {
      const mlWidth = isFacebook ? 750 : 1280;
      const mlHeight = isFacebook ? 900 : 900;
      const mlUrl = isFacebook 
        ? `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(cleanUrl)}&width=${mlWidth}&show_text=true&locale=vi_VN` 
        : cleanUrl;
      const mlWait = isFacebook ? 5000 : 3000;

      const apiUrl = [
        `https://api.microlink.io`,
        `?url=${encodeURIComponent(mlUrl)}`,
        `&screenshot=true`,
        `&screenshot.type=png`,
        `&screenshot.quality=100`,
        `&screenshot.fullPage=false`,
        `&embed=screenshot.url`,
        `&viewport.width=${mlWidth}`,
        `&viewport.height=${mlHeight}`,
        `&viewport.deviceScaleFactor=1.5`,
        `&wait=${mlWait}`,
        `&force=true`,
        `&_cb=${Date.now()}`
      ].join('');

      console.log(`[Screenshot API] [Hàng đợi 1 - Microlink] Đang chụp: ${mlUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = response.headers.get("content-type") || "image/png";
        console.log(`[Screenshot API] [Hàng đợi 1] Chụp thành công bằng Microlink!`);
        return res.json({ 
          success: true, 
          screenshotUrl: `data:${mimeType};base64,${base64}` 
        });
      } else {
        const errText = await response.text().catch(() => '');
        console.warn(`[Screenshot API] Microlink phản hồi lỗi: ${response.status} – ${errText.slice(0, 200)}`);
      }
    } catch (microlinkErr: any) {
      console.warn(`[Screenshot API] Microlink thất bại:`, microlinkErr.message);
    }

    // 2. Attempt 2: WordPress mShots CDN
    try {
      const wpUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(cleanUrl)}?w=900&h=1100`;
      console.log(`[Screenshot API] [Hàng đợi 2 - WP mShots] Đang chụp: ${cleanUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const wpRes = await fetch(wpUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (wpRes.ok) {
        const buffer = await wpRes.arrayBuffer();
        if (buffer.byteLength > 5000) {
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = wpRes.headers.get("content-type") || "image/jpeg";
          console.log(`[Screenshot API] [Hàng đợi 2] Chụp thành công bằng WordPress mShots!`);
          return res.json({
            success: true,
            screenshotUrl: `data:${mimeType};base64,${base64}`
          });
        }
      }
    } catch (wpErr: any) {
      console.warn(`[Screenshot API] WordPress mShots thất bại:`, wpErr.message);
    }

    // 3. Attempt 3: Direct Facebook CDN Photo Extraction (Trích xuất ảnh bài viết thực từ Facebook)
    if (parsedImage && parsedImage.startsWith('http')) {
      try {
        console.log(`[Screenshot API] [Hàng đợi 3 - CDN Image] Tải ảnh trực tiếp từ Facebook CDN: ${parsedImage.slice(0, 60)}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const imgRes = await fetch(parsedImage, {
          headers: {
            "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = imgRes.headers.get("content-type") || "image/jpeg";
          console.log(`[Screenshot API] [Hàng đợi 3] Lấy ảnh bài viết thành công từ Facebook CDN!`);
          return res.json({
            success: true,
            screenshotUrl: `data:${mimeType};base64,${base64}`
          });
        }
      } catch (imgErr: any) {
        console.warn(`[Screenshot API] Tải ảnh Facebook CDN thất bại:`, imgErr.message);
      }
    }

    // 4. No screenshot or image could be retrieved
    console.warn(`[Screenshot API] Không thể chụp ảnh thực cho: ${targetUrl}. Tất cả hàng đợi đều thất bại.`);
    return res.status(502).json({
      success: false,
      error: 'Không thể chụp ảnh màn hình tự động cho link này do trang web chặn truy cập. Vui lòng kéo thả hoặc tải ảnh chụp thủ công.'
    });

  } catch (error: any) {
    console.error("Screenshot ultimate handler error:", error);
    return res.status(500).json({
      success: false,
      error: `Lỗi hệ thống khi chụp ảnh: ${error.message || 'Không xác định'}`
    });
  }
});

// Gemini classification endpoint
app.post("/api/classify", async (req, res) => {
  try {
    const { posts } = req.body;
    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: "Danh sách bài viết không hợp lệ hoặc rỗng." });
    }

    const ai = getGemini();

    const systemInstruction = `Bạn là một chuyên gia phân tích nội dung mạng xã hội cho thương hiệu Vĩnh Tường (thương hiệu về khung, trần thạch cao, tấm trang trí, giải pháp chống cháy, chống mốc, chống ẩm).
Nhiệm vụ của bạn là đọc và phân loại nội dung các bài viết (caption/message) thành một trong bốn Content Pillar sau (trả về đúng định dạng viết hoa):

1. PRODUCT: Nội dung giới thiệu sản phẩm, tính năng, thông số kỹ thuật, hình ảnh sản phẩm.
   - Các sản phẩm cốt lõi: KHUNG VĨNH TƯỜNG TITAN, TẤM SIÊU CHỐNG MỐC, TRẦN VĨNH TƯỜNG SIÊU BẢO VỆ, NGỌC LỤC BẢO, Tấm siêu chống cháy, Siêu Chống Cháy, Thạch cao, Tấm trang trí...
   - Nhận diện khi bài viết tập trung nói về công năng sản phẩm, hướng dẫn thi công, giải pháp chống mốc/chống ẩm/chống cháy cho ngôi nhà.

2. PROMOTION: Các chương trình khuyến mãi, ưu đãi, hoạt động kích cầu mua sắm, tích điểm đổi quà, chương trình bán hàng cho đại lý/thợ thi công.
   - Các chương trình nổi bật: "Phi mã vượt đỉnh", "Chiến thần siêu bảo vệ", "Ưu đãi sốc", "Khuyến mãi hè", "Mua 1 tặng 1", tích điểm đổi quà, v.v.

3. MINIGAME: Các trò chơi tương tác có thưởng cho người theo dõi Fanpage, có thể lệ chơi (like, share, comment đáp án, tag bạn bè), cơ cấu giải thưởng rõ ràng.
   - Đặc điểm: Thường bắt đầu bằng từ "MINIGAME", "MINI GAME", "GAME TƯƠNG TÁC", có thể lệ trúng giải, thời gian công bố kết quả.

4. BRANDING: Các nội dung tăng độ nhận diện thương hiệu, sứ mệnh, thông tin doanh nghiệp, kiến thức đời sống tổng hợp (không quảng cáo sản phẩm trực tiếp), chúc mừng ngày lễ, bài đăng kỷ niệm, chia sẻ trải nghiệm khách hàng, hoặc tất cả các trường hợp còn lại không thuộc 3 nhóm trên.

ĐỒNG THỜI, đối với các bài đăng thuộc Pillar PRODUCT, hãy phân loại chi tiết "Product Sub-Pillar" (mô tả dòng sản phẩm phụ cụ thể) vào một trong các nhóm viết hoa sau đây:
- ÁNH KIM: Thường chứa các từ khóa: "Ánh Kim", "Ánh kim", "Tấm trang trí Ánh Kim", "Trần Ánh Kim", "La phông Ánh Kim".
- KHUNG TITAN: Thường chứa các từ khóa: "Khung Vĩnh Tường BASI", "Khung Vĩnh Tường Titan", "Khung xương Vĩnh Tường", "Khung xương", "khungbasi", "khung trần", "khung vách".
- TẤM EUROTONE: Thường chứa các từ khóa: "Eurotone", "Tấm Eurotone", "Tấm trang trí Eurotone".
- TẤM SIÊU BẢO VỆ: Thường chứa các từ khóa: "Siêu bảo vệ", "Siêu Bảo Vệ", "Trần thạch cao Vĩnh Tường Siêu Bảo Vệ", "Tấm thạch cao Siêu Bảo Vệ".
- TẤM SIÊU CHỐNG MỐC: Thường chứa các từ khóa: "Siêu chống mốc", "Siêu Chống Mốc", "Tấm thạch cao Vĩnh Tường Siêu Chống Mốc".
- TẤM SIÊU CHỐNG ẨM: Thường chứa các từ khóa: "Siêu chống ẩm", "Siêu Chống Ẩm", "Chống ẩm", "Tấm thạch cao Siêu Chống Ẩm".
- SIÊU CHỐNG CHÁY: Thường chứa các từ khóa: "Chống cháy", "Siêu Chống Cháy", "Tấm thạch cao Siêu Chống Cháy".
- KHÁC: Các bài viết giới thiệu sản phẩm Vĩnh Tường khác không thuộc các loại trên (như ngọc lục bảo, v.v.).

Nếu bài đăng KHÔNG thuộc pillar PRODUCT, hãy gán giá trị rỗng "" (hoặc không điền) cho productPillar.

Hãy phân tích kỹ nội dung bài đăng và trả về kết quả phân loại chính xác dưới dạng một mảng JSON các đối tượng chứa ID bài đăng, Pillar tương ứng, Product Sub-Pillar (nếu là PRODUCT) và giải thích ngắn gọn lý do.`;

    const prompt = `Phân loại danh sách bài đăng sau đây:\n` + 
      posts.map((p, idx) => `ID: ${p.id}\nNội dung: ${p.post}\n---`).join('\n');

    const response = await callGeminiWithModelFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "ID của bài đăng được truyền vào" },
              pillar: { type: Type.STRING, description: "Phải thuộc một trong bốn giá trị viết hoa: PRODUCT, PROMOTION, MINIGAME, BRANDING" },
              productPillar: { type: Type.STRING, description: "Nếu pillar là PRODUCT, phải thuộc một trong các giá trị viết hoa: ÁNH KIM, KHUNG TITAN, TẤM EUROTONE, TẤM SIÊU BẢO VỆ, TẤM SIÊU CHỐNG MỐC, TẤM SIÊU CHỐNG ẨM, SIÊU CHỐNG CHÁY, KHÁC. Nếu không phải PRODUCT, trả về chuỗi rỗng \"\"" },
              reason: { type: Type.STRING, description: "Giải thích ngắn gọn lý do phân loại bằng tiếng Việt (1 câu)" }
            },
            required: ["id", "pillar", "productPillar"]
          }
        }
      }
    });

    const resultText = response.text || "[]";
    const parsed = JSON.parse(resultText);
    res.json({ success: true, classifications: parsed });

  } catch (error: any) {
    console.error("AI classification error:", error);
    res.status(500).json({ error: error.message || "Lỗi hệ thống khi gọi AI phân loại." });
  }
});

// Start integration with Vite in development mode, or serve built assets in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Fullstack Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
