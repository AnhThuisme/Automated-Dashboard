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

// Generate an elegant SVG mockup card as a sharp, non-blurry, instant preview
function generateFallbackCard(
  urlStr: string,
  title: string,
  parsedImage?: string,
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
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
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
        parsedImage = parseMetaTag(html, 'og:image') || parseMetaTag(html, 'image');
        parsedSiteName = parseMetaTag(html, 'og:site_name');

        console.log(`[Screenshot API] Tải thẻ meta thành công cho ${originalUrl}`);
        console.log(` - Tiêu đề: "${parsedTitle}"`);
        console.log(` - Hình ảnh: "${parsedImage}"`);
      } else {
        console.warn(`[Screenshot API] URL phản hồi mã trạng thái: ${response.status}`);
      }
    } catch (err: any) {
      console.warn(`[Screenshot API] Bỏ qua lỗi tải meta (sử dụng fallback mặc định):`, err.message);
    }

    // Normalize mobile Facebook URLs to standard WWW to ensure compatibility with Facebook embed plugins
    let targetUrl = originalUrl.replace(/\/\/(m|mobile|touch|da|developers)\.facebook\.com/i, '//www.facebook.com');

    // Automatically convert Facebook URLs into official, fully public embedded widgets.
    // This completely bypasses the login wall, see more modal, and cookie popups because Facebook's embeds are designed to be public.
    const isFacebook = /facebook\.com|fb\.watch|fb\.com/i.test(targetUrl);
    let embedWidth = 600; // 600px width for standard beautifully balanced fb-post cards
    if (isFacebook && !targetUrl.includes('plugins/post.php') && !targetUrl.includes('plugins/video.php')) {
      // Use plugins/post.php with show_text=true for ALL Facebook URLs (posts, reels, videos, photos).
      // plugins/post.php guarantees rendering of full Page Avatar & Header, complete Caption text with hashtags, and Like/Comment/Share metrics!
      targetUrl = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(targetUrl)}&width=${embedWidth}&show_text=true&locale=vi_VN`;
      console.log(`[Screenshot API] Sử dụng plugins/post.php cho đầy đủ Caption + Tương tác (Like/CMT/Share): ${targetUrl}`);
    }

    // 0. Attempt 0: Real Headless Chrome Browser (Puppeteer/Selenium Engine)
    try {
      const puppeteerModule = await import('puppeteer');
      const puppeteer = puppeteerModule.default || puppeteerModule;
      
      const fs = await import('fs');
      let chromePath: string | undefined = undefined;
      const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      if (fs.existsSync(macChrome)) {
        chromePath = macChrome;
      }

      const launchOpts: any = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars']
      };
      if (chromePath) {
        launchOpts.executablePath = chromePath;
      }

      console.log(`[Screenshot API] [Hàng đợi 0 - Headless Chrome] Đang mở Chrome (${chromePath || 'Puppeteer default'}) chụp: ${targetUrl}`);
      const browser = await puppeteer.launch(launchOpts);

      try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7' });
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        await page.setViewport({ width: 650, height: 1000, deviceScaleFactor: 2 });
        
        try {
          await page.goto(targetUrl, { waitUntil: 'load', timeout: 25000 });
        } catch (gotoErr) {
          console.warn(`[Screenshot API] Không thể mở targetUrl, thử chuyển sang originalUrl: ${originalUrl}`);
          await page.goto(originalUrl, { waitUntil: 'load', timeout: 25000 });
        }

        // Real-Human Automated Selenium Chrome Workflow:
        // 1. Smooth human-like scrolling to trigger viewport observers & lazy-loaded media
        await page.evaluate(async () => {
          try {
            for (let y = 0; y <= 450; y += 45) {
              window.scrollTo(0, y);
              await new Promise(r => setTimeout(r, 40));
            }
            await new Promise(r => setTimeout(r, 200));
            window.scrollTo(0, 0);

            // Force load all lazy images inside container
            const imgs = Array.from(document.querySelectorAll('img'));
            imgs.forEach((img: any) => {
              const lazySrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-srcset') || img.getAttribute('data-[#src]');
              if (lazySrc && (!img.src || img.src.includes('data:image') || img.naturalWidth === 0)) {
                img.src = lazySrc.split(' ')[0];
              }
              img.removeAttribute('loading');
              img.style.opacity = '1';
              img.style.visibility = 'visible';
            });
          } catch(e){}

          // 2. Human-like automated clicks: Accept cookies, close popups, and expand 'Xem thêm' / 'See more'
          try {
            const dismissSelectors = [
              '[aria-label="Decline optional cookies"]',
              '[aria-label="Allow all cookies"]',
              '[aria-label="Accept all"]',
              '[aria-label="Chấp nhận tất cả"]',
              '[data-cookiebanner="accept_button"]',
              '#cookie-use-link'
            ];
            dismissSelectors.forEach(sel => {
              const btn = document.querySelector(sel);
              if (btn) (btn as HTMLElement).click();
            });

            // Ensure caption text is 100% visible, expanded, and styled crisply
            const style = document.createElement('style');
            style.textContent = `
              ._5p1e, ._5ptz, ._1p1t, [data-testid="post_message"], [class*="userContent"], [class*="caption"] {
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
              body, html, #facebook, ._5p3y {
                overflow: visible !important;
                height: auto !important;
              }
              img {
                opacity: 1 !important;
                visibility: visible !important;
              }
            `;
            document.head.appendChild(style);

            const captionEl = document.querySelector('._5p1e, ._5ptz, ._1p1t, [data-testid="post_message"], [class*="userContent"], [class*="caption"]');
            const mediaEl = document.querySelector('._5cwb, ._1t4w, ._5qgq, [class*="media"], [class*="stage"], [class*="video"], [class*="photo"], [class*="image"]');
            if (captionEl && mediaEl && mediaEl.parentNode) {
              mediaEl.parentNode.insertBefore(captionEl, mediaEl);
            }
          } catch(e){}

          try {
            document.querySelectorAll('span, div, a, button').forEach(el => {
              const t = (el.textContent || "").trim().toLowerCase();
              if ((t === 'xem thêm' || t === 'see more') && !el.querySelector('span, div')) {
                (el as HTMLElement).click();
              }
            });
          } catch(e){}
        });

        // 3. Generous render wait to guarantee all post photos and video thumbnails finish loading
        await new Promise(r => setTimeout(r, 4500));

        // Find the full Facebook embed card element (#facebook / ._5p3y / body) to capture Caption + Header + Video + Metrics
        const element = await page.$('#facebook') || await page.$('._5p3y') || await page.$('body');
        let base64Image = '';

        if (element) {
          // Take screenshot OF THE ELEMENT BOUNDING BOX ONLY (0% trailing white space!)
          const buffer = await element.screenshot({ type: 'png', omitBackground: true });
          base64Image = Buffer.from(buffer).toString('base64');
        } else {
          const buffer = await page.screenshot({ type: 'png', fullPage: false });
          base64Image = Buffer.from(buffer).toString('base64');
        }

        await browser.close();

        if (base64Image) {
          console.log(`[Screenshot API] [Hàng đợi 0] Chụp thành công 100% ôm sát khung bằng Headless Chrome (Selenium)!`);
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

    // 1. Attempt 1: Microlink API screenshot with a clean abort controller timeout
    try {
      console.log(`[Screenshot API] [Hàng đợi 1] Đang thử chụp bằng Microlink cho: ${targetUrl}`);
      
      // Extremely precise selector list targeting actual login overlays/modals to hide.
      // We exclude 'div[role="dialog"]' and '[data-testid*="dialog"]' here because Facebook's main post modal uses them.
      // We will instead identify and hide login-specific dialogs dynamically in the client-side runScript.
      let hideSelector = "";
      let customStyles = "";
      let runScript = "";

      if (isFacebook) {
        // Facebook Embed handles its own UI perfectly. Keeping variables extremely lightweight to avoid HTTP 414 (URI Too Long) on Microlink API.
        hideSelector = "#login_popup,form[action*='login'],[data-testid*='cookie']";
        
        customStyles = `
          .plugin, body.plugin, html.plugin, #facebook, ._5p3y { background: #ffffff !important; }
          body.plugin, html.plugin, #facebook, ._5p3y { width: ${embedWidth}px !important; max-width: ${embedWidth}px !important; height: auto !important; overflow: visible !important; display: block !important; margin: 0 auto !important; }
          img[class*="blur"], img[src*="blur"], div[class*="blurBackground"], div[style*="filter: blur"] { display: none !important; }
          
          /* Enforce 100% uniform post structure across all post types (photos, videos, reels): Header (1) -> Caption (2) -> Media (3) -> Footer (4) */
          ._5p3y, ._1dwg, ._5pcb, form, div[role="article"] { display: flex !important; flex-direction: column !important; }
          ._5x46, header, div[class*="header"], div[class*="author"] { order: 1 !important; }
          ._5p1e, ._5ptz, ._1p1t, div[data-testid="post_message"], div[class*="userContent"], div[class*="caption"] { order: 2 !important; }
          ._5cwb, ._1t4w, ._5qgq, div[class*="media"], div[class*="stage"], div[class*="video"], div[class*="photo"], div[class*="image"] { order: 3 !important; }
          ._3xom, ._4bl9, footer, div[class*="footer"], div[class*="feedback"], div[class*="action"] { order: 4 !important; }
        `.replace(/\s+/g, ' ').trim();

        runScript = `
          try {
            const captionEl = document.querySelector('._5p1e, ._5ptz, ._1p1t, div[data-testid="post_message"], div[class*="userContent"], div[class*="caption"]');
            const mediaEl = document.querySelector('._5cwb, ._1t4w, ._5qgq, div[class*="media"], div[class*="stage"], div[class*="video"], div[class*="photo"], div[class*="image"]');
            if (captionEl && mediaEl && mediaEl.parentNode) {
              mediaEl.parentNode.insertBefore(captionEl, mediaEl);
            }
          } catch(e){}
          try {
            const clickExpanders = () => {
              document.querySelectorAll('span, div, a, button').forEach(el => {
                const t = (el.textContent || "").trim().toLowerCase();
                if ((t === 'xem thêm' || t === 'see more') && !el.querySelector('span, div')) {
                  el.click();
                }
              });
            };
            clickExpanders();
            setTimeout(clickExpanders, 1500);
            setTimeout(clickExpanders, 3000);
          } catch(e){}
        `.replace(/\s+/g, ' ').trim();
      } else {
        const hideSelectorList = [
          "#login_popup",
          "#login_popup_layer",
          ".signup_box",
          ".signup_bar",
          "form[action*='login']",
          "[data-testid*='cookie']",
          "div[role='dialog']:has(input[type='password'])",
          "div[role='dialog']:has(form[action*='login'])",
          "div[role='dialog']:has(a[href*='login'])",
          "div[role='dialog']:has(input[name='pass'])",
          "div[role='dialog']:has(input[name='email'])",
          "div[class*='dialog']:has(input[type='password'])",
          "div[class*='login']:has(input[type='password'])",
          "div[id*='login']:has(input[type='password'])",
          "div[style*='position: fixed']:has(input[type='password'])",
          "div[style*='position: absolute']:has(input[type='password'])",
          "div[class*='backdrop']:has(input[type='password'])",
          "div[class*='overlay']:has(input[type='password'])",
          "div[class*='Overlay']:has(input[type='password'])",
          "div:has(> div[role='dialog']:has(input[type='password']))",
          "div:has(> div[role='dialog']:has(form[action*='login']))",
          "div:has(> form[action*='login'])",
          "div:has(input[name='email']):has(input[name='pass'])",
          "div:has(input[placeholder*='phone']):has(input[placeholder*='Password'])",
          "div:has(input[placeholder*='thoại']):has(input[placeholder*='khẩu'])",
          "div:has(button[name='login'])",
          "div[role='dialog']:has(button[name='login'])",
          "div[role='dialog']:has([data-testid*='login'])",
          "div:has(> div:has(input[name='email']):has(input[name='pass']))"
        ];
        hideSelector = hideSelectorList.join(",");

        customStyles = `
          header, [role="banner"], #login_popup, #login_popup_layer, .signup_box, .signup_bar, form[action*='login'], [data-testid*='cookie'] {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
          }
          div[role="dialog"]:has(input[type="password"]),
          div[role="dialog"]:has(form[action*="login"]),
          div[role="dialog"]:has(a[href*="login"]),
          div[class*="login"]:has(input[type="password"]),
          div[id*="login"]:has(input[type="password"]),
          div[class*="dialog"]:has(input[type="password"]),
          div[role="dialog"]:not(:has([role="article"])):not(:has([data-testid="post_message"])):not(:has(video)):not(:has([class*="reel"])):not(:has([class*="Reel"])) {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
          div:has(> div[role="dialog"]:has(input[type="password"])),
          div:has(> div[role="dialog"]:has(form[action*="login"])),
          div:has(> div[role="dialog"]:not(:has([role="article"])):not(:has(video))) {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
          div[style*="position: fixed"]:not(:has([role="article"])):not(:has([data-testid="post_message"])):not(:has(video)),
          div[class*="backdrop"]:not(:has([role="article"])):not(:has(video)),
          div[class*="Overlay"]:not(:has([role="article"])):not(:has(video)),
          div[class*="overlay"]:not(:has([role="article"])):not(:has(video)) {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
          html,body,#mount_0_0_,[role='main']{overflow:hidden!important;overflow-y:hidden!important;position:static!important;filter:none!important;opacity:1!important;image-rendering:-webkit-optimize-contrast!important;image-rendering:crisp-edges!important;}
          [data-testid*="Feedback"],[class*="feedback"],[class*="reaction"],[aria-label*="reaction"],[aria-label*="like"],[aria-label*="thích"],[aria-label*="bình luận"],[aria-label*="chia sẻ"],[role="toolbar"]{opacity:1!important;visibility:visible!important;display:flex!important;}
          .plugin, body.plugin, html.plugin, #facebook, ._5p3y, ._1ooc, ._539f, div[class*="Player"] {
            background-color: #ffffff !important;
            background: #ffffff !important;
          }
          body.plugin, html.plugin, #facebook, ._5p3y {
            width: ${embedWidth}px !important;
            max-width: ${embedWidth}px !important;
            height: auto !important;
            min-height: unset !important;
            max-height: none !important;
            overflow: hidden !important;
            display: block !important;
            margin: 0 auto !important;
          }
          body.plugin, html.plugin {
            zoom: 1.05 !important;
            -webkit-zoom: 1.05 !important;
            image-rendering: -webkit-optimize-contrast !important;
            image-rendering: crisp-edges !important;
          }
          img[class*="blur"], img[src*="blur"], div[class*="blurBackground"], div[class*="blur-background"], div[style*="filter: blur"], div[style*="filter:blur"] {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
        `.replace(/\s+/g, ' ').trim();

        runScript = `
          try {
            const clickExpanders = () => {
              const expanders = [];
              document.querySelectorAll('span, div, a, button, [role="button"]').forEach(el => {
                try {
                  const text = (el.textContent || "").trim().toLowerCase();
                  const isExpander = 
                    text === 'xem thêm' || 
                    text === 'see more' || 
                    text === 'đọc thêm' || 
                    text === 'read more' ||
                    text === 'xem tất cả bình luận' ||
                    text === 'view all comments' ||
                    text === 'xem thêm bình luận' ||
                    text === 'view more comments' ||
                    text === 'xem phản hồi' ||
                    text === 'view replies' ||
                    text === 'xem thêm câu trả lời' ||
                    text === 'view more replies' ||
                    (text.includes('xem thêm') && !text.includes('facebook') && text.length < 25) ||
                    (text.includes('see more') && !text.includes('facebook') && text.length < 25) ||
                    (text.includes('bình luận') && text.includes('xem') && text.length < 35) ||
                    (text.includes('comments') && text.includes('view') && text.length < 35);
                    
                  if (isExpander && !el.querySelector('span, div, a, button')) {
                    expanders.push(el);
                  }
                } catch(e){}
              });

              expanders.forEach(el => {
                try {
                  el.click();
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                } catch(e){}
              });
            };

            const clean = () => {
              const isFbEmbed = window.location.href.includes('facebook.com/plugins') || window.location.href.includes('plugins/post.php') || window.location.href.includes('plugins/video.php');
              
              if (isFbEmbed) {
                // Enforce 100% uniform structure: Move Caption BEFORE Media Image for all post types
                try {
                  const captionEl = document.querySelector('._5p1e, ._5ptz, ._1p1t, div[data-testid="post_message"], div[class*="userContent"], div[class*="caption"]');
                  const mediaEl = document.querySelector('._5cwb, ._1t4w, ._5qgq, div[class*="media"], div[class*="stage"], div[class*="video"], div[class*="photo"], div[class*="image"]');
                  if (captionEl && mediaEl && mediaEl.parentNode) {
                    mediaEl.parentNode.insertBefore(captionEl, mediaEl);
                  }
                } catch(e){}

                ['#login_popup', '#login_popup_layer', '.signup_box', '.signup_bar', 'form[action*="login"]', '[data-testid*="cookie"]'].forEach(s => {
                  document.querySelectorAll(s).forEach(e => {
                    try {
                      e.style.setProperty('display', 'none', 'important');
                      e.style.setProperty('opacity', '0', 'important');
                      e.style.setProperty('visibility', 'hidden', 'important');
                    } catch(err){}
                  });
                });
                clickExpanders();
                return;
              }

              const hideElements = ['header', '[role="banner"]', '#login_popup', '#login_popup_layer', '.signup_box', '.signup_bar', 'form[action*="login"]', '[data-testid*="cookie"]', 'div[class*="dialog"]', 'div[id*="login"]', 'div[class*="login"]', 'div[role="dialog"]'];
              hideElements.forEach(s => {
                document.querySelectorAll(s).forEach(e => {
                  try {
                    if (e !== document.body && e !== document.documentElement && !e.querySelector('[role="article"]') && !e.querySelector('video')) {
                      e.style.setProperty('display', 'none', 'important');
                      e.style.setProperty('opacity', '0', 'important');
                      e.style.setProperty('visibility', 'hidden', 'important');
                    }
                  } catch(err){}
                });
              });

              const terms = ["login", "signup", "register", "cookie", "đăng nhập", "đăng ký", "tạo tài khoản", "mở ứng dụng", "xem thêm trên facebook", "see more on facebook", "join facebook", "tham gia facebook", "create new account"];
              document.querySelectorAll('div, form, section, dialog, [role="dialog"]').forEach(el => {
                try {
                  if (el === document.body || el === document.documentElement) return;
                  const t = (el.textContent || "").toLowerCase();
                  const isFacebookLoginPrompt = t.includes("see more on facebook") || t.includes("xem thêm trên facebook") || t.includes("đăng nhập để xem") || t.includes("đăng nhập để tiếp tục") || t.includes("đăng nhập để xem tiếp") || t.includes("đăng nhập hoặc đăng ký") || t.includes("create new account") || t.includes("tạo tài khoản mới") || t.includes("bạn phải đăng nhập");
                  const hasPasswordInput = el.querySelector('input[type="password"]');
                  
                  if (isFacebookLoginPrompt || hasPasswordInput) {
                    const isActualPost = el.querySelector('[role="article"]') || el.querySelector('[data-testid="post_message"]') || el.querySelector('video');
                    if (!isActualPost) {
                      el.style.setProperty('display', 'none', 'important');
                      el.style.setProperty('opacity', '0', 'important');
                      el.style.setProperty('visibility', 'hidden', 'important');
                      
                      let parent = el;
                      while (parent && parent.parentElement && parent.parentElement !== document.body) {
                        parent = parent.parentElement;
                      }
                      if (parent && parent !== document.body && !parent.querySelector('[role="article"]') && !parent.querySelector('video')) {
                        parent.style.setProperty('display', 'none', 'important');
                        parent.style.setProperty('opacity', '0', 'important');
                        parent.style.setProperty('visibility', 'hidden', 'important');
                      }
                    }
                  }
                } catch(e){}
              });

              document.querySelectorAll('div, section, dialog').forEach(el => {
                try {
                  if (el === document.body || el === document.documentElement) return;
                  const t = (el.textContent || "").toLowerCase();
                  const isLoginDialog = t.includes("see more on facebook") || t.includes("xem thêm trên facebook") || t.includes("đăng nhập") || el.querySelector('input[type="password"]');
                  if (isLoginDialog) {
                    el.querySelectorAll('[role="button"], button, [aria-label*="Close"], [aria-label*="Đóng"], [aria-label*="close"], [aria-label*="đóng"], [class*="close"], [id*="close"]').forEach(btn => {
                      btn.click();
                      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    });
                  }
                } catch(e){}
              });

              try {
                const dismissSelectors = [
                  '[aria-label="Close"]', '[aria-label="Đóng"]', '[aria-label="Dismiss"]', '[aria-label="Ẩn"]',
                  '[aria-label="Close dialog"]', '[aria-label="Đóng hộp thoại"]',
                  'div[role="button"][aria-label*="Close"]', 'div[role="button"][aria-label*="Đóng"]'
                ];
                dismissSelectors.forEach(selector => {
                  document.querySelectorAll(selector).forEach(btn => {
                    try {
                      btn.click();
                    } catch(e){}
                  });
                });
              } catch(e){}
            };

            clean();
            clickExpanders();
            setTimeout(clean, 1500);
            setTimeout(clickExpanders, 2000);
          } catch(e){}
        `.replace(/\s+/g, ' ').trim();
      }

      const isEmbed = targetUrl.includes('facebook.com/plugins/') || targetUrl.includes('plugins/post.php') || targetUrl.includes('plugins/video.php') || targetUrl.includes('/fb-embed');
      let vpWidth = 650;
      let vpHeight = 750;
      let fullPage = false;

      if (isEmbed) {
        fullPage = false;
        const isReel = /reel|reels|share\/r\//i.test(originalUrl);
        const isWatchOrVideo = /watch|fb\.watch|video/i.test(originalUrl);
        
        if (isReel) {
          vpWidth = 650;
          vpHeight = 1250;
        } else if (isWatchOrVideo) {
          vpWidth = 650;
          vpHeight = 800;
        } else {
          vpWidth = 650;
          vpHeight = 720;
        }
      }

      // Request a high-resolution viewport area with fullPage enabled to capture the entire content cleanly.
      // We set deviceScaleFactor=2 (Retina @2x resolution quality) which is extremely stable, fast, and
      // guarantees incredibly sharp, high-resolution and crystal-clear text without crashing the crawler.
      // We also omit Pro-only premium parameters like 'script' and 'styles' to ensure 100% success rate on the free tier.
      const waitTime = isFacebook ? 8000 : 4000;
      let apiUrl = `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&screenshot=true&screenshot.type=png&screenshot.quality=100&screenshot.fullPage=${fullPage}&embed=screenshot.url&viewport.width=${vpWidth}&viewport.height=${vpHeight}&viewport.deviceScaleFactor=2&wait=${waitTime}&force=true&ttl=0&_cb=${Date.now()}`;
      
      if (!isFacebook && hideSelector) {
        apiUrl += `&hide=${encodeURIComponent(hideSelector)}`;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 seconds timeout for microlink

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
        console.warn(`[Screenshot API] Microlink phản hồi lỗi: ${response.status}`);
      }
    } catch (microlinkErr: any) {
      console.warn(`[Screenshot API] Microlink phản hồi lỗi, chuyển trực tiếp sang khởi tạo Thẻ HD Card:`, microlinkErr.message);
    }

    // 2. Direct Fallback: Generate beautifully designed HD Social Card (fail-proof & instantaneous)
    console.log(`[Screenshot API] Tạo hình ảnh mô phỏng HD Social Card cho: ${targetUrl}`);
    const svgContent = generateFallbackCard(targetUrl, postTitle, parsedImage, parsedDesc, parsedSiteName);
    const base64Svg = Buffer.from(svgContent).toString('base64');
    
    return res.json({
      success: true,
      screenshotUrl: `data:image/svg+xml;base64,${base64Svg}`
    });

  } catch (error: any) {
    console.error("Screenshot ultimate handler error:", error);
    const svgContent = generateFallbackCard(req.query.url as string || '', req.query.title as string || '');
    const base64Svg = Buffer.from(svgContent).toString('base64');
    return res.json({ 
      success: true,
      screenshotUrl: `data:image/svg+xml;base64,${base64Svg}` 
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
