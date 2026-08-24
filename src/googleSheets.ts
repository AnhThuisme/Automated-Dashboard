/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigSettings, PostItem, LogEntry, PillarGroup } from './types';

const DEMO_POSTS: PostItem[] = [
  {
    pillar: 'BRANDING',
    post: 'Vĩnh Tường đồng hành cùng tổ ấm người Việt - Giải pháp trần tường thạch cao bền đẹp chuẩn chuyên gia hàng đầu.',
    airedDate: '2026-03-01',
    reach: 14500,
    interact: 920,
    link: 'https://facebook.com/vinhtuong/posts/101',
  },
  {
    pillar: 'BRANDING',
    post: 'Hơn 30 năm khẳng định vị thế dẫn đầu giải pháp không gian sống thẩm mỹ và an toàn.',
    airedDate: '2026-03-03',
    reach: 18200,
    interact: 1100,
    link: 'https://facebook.com/vinhtuong/posts/102',
  },
  {
    pillar: 'PRODUCT',
    productPillar: 'KHUNG TITAN',
    post: 'Khung Vĩnh Tường TITAN siêu bền, chống rỉ sét vượt trội, vững chãi suốt 10 năm cho mọi công trình hiện đại.',
    airedDate: '2026-03-05',
    reach: 22800,
    interact: 1640,
    link: 'https://facebook.com/vinhtuong/posts/103',
  },
  {
    pillar: 'PRODUCT',
    productPillar: 'TẤM SIÊU CHỐNG MỐC',
    post: 'Tấm thạch cao Siêu Chống Mốc Vĩnh Tường - Bảo vệ tối đa không gian sống sạch khuẩn, không lo ẩm mốc mùa mưa ẩm.',
    airedDate: '2026-03-10',
    reach: 26500,
    interact: 1890,
    link: 'https://facebook.com/vinhtuong/posts/104',
  },
  {
    pillar: 'PRODUCT',
    productPillar: 'TẤM SIÊU BẢO VỆ',
    post: 'Tấm trần Vĩnh Tường Siêu Bảo Vệ lọc khí 5 lớp, thanh lọc không khí vượt trội cho gia đình bạn.',
    airedDate: '2026-03-12',
    reach: 21000,
    interact: 1450,
    link: 'https://facebook.com/vinhtuong/posts/105',
  },
  {
    pillar: 'PROMOTION',
    post: 'CHƯƠNG TRÌNH KHUYẾN MÃI ĐẶC BIỆT: Mua Khung Titan nhận ngay combo quà tặng hấp dẫn cùng phiếu giảm giá 15%!',
    airedDate: '2026-03-15',
    reach: 38200,
    interact: 3120,
    link: 'https://facebook.com/vinhtuong/posts/106',
  },
  {
    pillar: 'PROMOTION',
    post: 'Ưu đãi Chiến thần siêu bảo vệ: Giảm ngay 10% khi đăng ký thi công thạch cao trọn gói tháng này.',
    airedDate: '2026-03-18',
    reach: 29400,
    interact: 2300,
    link: 'https://facebook.com/vinhtuong/posts/107',
  },
  {
    pillar: 'MINIGAME',
    post: 'MINIGAME: Đuổi hình bắt chữ - Dự đoán đúng tên sản phẩm Vĩnh Tường nhận ngay voucher mua sắm 500.000đ!',
    airedDate: '2026-03-20',
    reach: 31500,
    interact: 4250,
    link: 'https://facebook.com/vinhtuong/posts/108',
  },
  {
    pillar: 'MINIGAME',
    post: 'MINIGAME mini game: Khoảnh khắc tổ ấm - Chia sẻ ảnh không gian sống đẹp nhất để rinh quà công nghệ hot.',
    airedDate: '2026-03-22',
    reach: 28900,
    interact: 3890,
    link: 'https://facebook.com/vinhtuong/posts/109',
  },
  {
    pillar: 'EDUCATION',
    post: 'Hướng dẫn 3 bước lựa chọn hệ trần thạch cao chống nóng tối ưu chi phí cho nhà phố.',
    airedDate: '2026-03-25',
    reach: 16700,
    interact: 840,
    link: 'https://facebook.com/vinhtuong/posts/110',
  }
];

// Helper to handle API responses
async function handleResponse(response: Response) {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || response.statusText;
    throw new Error(message);
  }
  return response.json();
}

export function isDemoOrPlaceholderToken(token: string | null | undefined): boolean {
  if (!token) return true;
  return token === 'demo-mode-token' || token === 'admin-mode-token' || token.endsWith('-token') || token.includes('-mode-');
}

// 1. List Spreadsheets from Google Drive
export async function fetchSpreadsheets(token: string): Promise<{ id: string; name: string; modifiedTime: string }[]> {
  if (isDemoOrPlaceholderToken(token)) {
    return [
      { id: 'demo-sheet-2026', name: 'Social Posts Campaign 2026 (Bảng tính Mẫu)', modifiedTime: new Date().toISOString() }
    ];
  }
  const url = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'+and+trashed=false&orderBy=recency&fields=files(id,name,modifiedTime)&pageSize=30`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await handleResponse(response);
  return data.files || [];
}

// 2. Fetch Spreadsheet details (including sheets list)
export async function fetchSpreadsheetDetails(
  token: string,
  spreadsheetId: string
): Promise<{ id: string; title: string; sheets: { id: number; title: string }[] }> {
  if (isDemoOrPlaceholderToken(token)) {
    return {
      id: spreadsheetId || 'demo-sheet-2026',
      title: 'Social Posts Campaign 2026 (Bảng tính Mẫu)',
      sheets: [
        { id: 0, title: 'Facebook: Post Insights' },
        { id: 1, title: 'Data VT' },
        { id: 2, title: 'Data entry' },
        { id: 3, title: 'JUN' },
        { id: 4, title: 'JUL' },
        { id: 5, title: 'inputrange' },
        { id: 6, title: 'note' },
        { id: 7, title: 'Social_Posts_2026' },
        { id: 8, title: 'DASHBOARD' },
        { id: 9, title: 'LOGS' }
      ],
    };
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await handleResponse(response);
  
  return {
    id: data.spreadsheetId,
    title: data.properties.title,
    sheets: data.sheets.map((s: any) => ({
      id: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

// Robust date parser helper
export function parseAndFormatDate(rawDateStr: string): string {
  let dateStr = (rawDateStr || '').trim();
  if (!dateStr) return '';

  // Handle serial date numbers from Excel/Google Sheets
  const serial = Number(dateStr);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    try {
      const dateObj = new Date((serial - 25569) * 86400 * 1000);
      if (!isNaN(dateObj.getTime())) {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch (e) {
      // Ignore and fallback
    }
  }

  // If it has a space (e.g., date and time), take only the first part
  if (dateStr.includes(' ')) {
    dateStr = dateStr.split(' ')[0];
  }

  // 1. Try to match DD/MM/YYYY or DD-MM-YYYY
  const dmyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const dmyMatch = dateStr.match(dmyRegex);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  // 2. Try to match YYYY-MM-DD or YYYY/MM/DD
  const ymdRegex = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/;
  const ymdMatch = dateStr.match(ymdRegex);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  // 3. Fallback to standard JavaScript Date parser if possible
  try {
    const dateObj = new Date(dateStr);
    if (!isNaN(dateObj.getTime())) {
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  } catch (e) {
    // Ignore
  }
  return dateStr;
}

export interface FetchSheetDataResult {
  posts: PostItem[];
  headers: string[];
  mappings: {
    createdTimeIdx: number;
    contentIdx: number;
    reachIdx: number;
    interactIdx: number;
    pillarIdx: number;
    linkIdx: number;
    productPillarIdx: number;
  };
  rawSampleRows?: string[][];
  headerRowIdx?: number;
  isEmpty?: boolean;
}

export function parseRawPastedData(rawText: string): FetchSheetDataResult {
  if (!rawText || !rawText.trim()) {
    throw new Error('Dữ liệu dán trống hoặc không hợp lệ.');
  }

  // Auto-detect CSV delimiter counting frequency across full rawText
  const commaCount = (rawText.match(/,/g) || []).length;
  const tabCount = (rawText.match(/\t/g) || []).length;
  const semiCount = (rawText.match(/;/g) || []).length;

  let delimiter = ',';
  if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  } else if (semiCount > commaCount && semiCount > tabCount) {
    delimiter = ';';
  }

  // Full CSV line parser handling multiline quotes properly
  const parseFullCSV = (text: string, delim: string): string[][] => {
    const rows: string[][] = [];
    let curRow: string[] = [];
    let curCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          curCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delim && !inQuotes) {
        curRow.push(curCell.trim());
        curCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        curRow.push(curCell.trim());
        if (curRow.some(c => c.length > 0)) {
          rows.push(curRow);
        }
        curRow = [];
        curCell = '';
      } else {
        curCell += char;
      }
    }
    if (curCell.length > 0 || curRow.length > 0) {
      curRow.push(curCell.trim());
      rows.push(curRow);
    }
    return rows;
  };

  const rows = parseFullCSV(rawText, delimiter);
  if (rows.length === 0) {
    throw new Error('Không thể đọc hàng dữ liệu nào từ CSV.');
  }

  // Find header row in first 10 rows
  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!row) continue;
    const cleanCells = row.map(c => String(c || '').toLowerCase().trim());
    if (cleanCells.some(c => c === 'id' || c.includes('message') || c.includes('content') || c.includes('created time') || c.includes('aired date') || c.includes('nội dung') || c.includes('ngày đăng'))) {
      headerRowIdx = r;
      break;
    }
  }

  const headers = rows[headerRowIdx].map(h => String(h || '').trim());
  const numCols = headers.length;

  const getBestHeaderIndex = (concept: 'CreatedTime' | 'Content' | 'Reach' | 'Interact' | 'Pillar' | 'Link' | 'ProductPillar' | 'Likes' | 'Comments' | 'Shares'): number => {
    let bestIdx = -1;
    let highestScore = -999;

    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const lower = h.toLowerCase().trim();
      let score = 0;

      if (concept === 'CreatedTime') {
        const exacts = ["created date (ngày đăng)", "ngày đăng", "created date", "created_date", "created time", "created_time", "aired date", "aired_date", "timestamp", "date", "ngày"];
        const partials = ["date", "ngày", "time", "created", "aired"];
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;
      } else if (concept === 'Content') {
        const exacts = ["post content", "post_content", "nội dung bài viết", "nội dung", "content", "bài viết", "bài đăng", "message", "text"];
        const partials = ["content", "nội dung", "bài viết", "bài đăng", "message", "text"];
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;
      } else if (concept === 'Reach') {
        const exacts = ["views", "reach", "lượt tiếp cận", "view", "lượt xem", "tiếp cận"];
        const partials = ["reach", "tiếp cận", "view", "xem"];
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;
      } else if (concept === 'Interact') {
        const exacts = ["interact", "tương tác", "engagement", "lượt tương tác"];
        const partials = ["interact", "tương tác", "engagement"];
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;
      } else if (concept === 'Likes') {
        if (lower === 'likes' || lower === 'thích' || lower === 'reacts') score += 100;
      } else if (concept === 'Comments') {
        if (lower === 'comments' || lower === 'bình luận') score += 100;
      } else if (concept === 'Shares') {
        if (lower === 'shares' || lower === 'chia sẻ') score += 100;
      } else if (concept === 'Pillar') {
        const exacts = ["content pillar", "pillar", "chủ đề", "phân loại", "category", "topic"];
        const partials = ["pillar", "chủ đề", "phân loại", "category", "topic"];
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;
      } else if (concept === 'Link') {
        const exacts = ["post url", "url", "link", "post link", "đường dẫn"];
        const partials = ["link", "url", "đường dẫn"];
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;
      } else if (concept === 'ProductPillar') {
        const exacts = ["product pillar", "sub pillar", "sản phẩm", "sub_pillar"];
        const partials = ["product", "sản phẩm", "sub pillar"];
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;
      }

      if (score > highestScore && score > 0) {
        highestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  let createdTimeIdx = getBestHeaderIndex('CreatedTime');
  let contentIdx = getBestHeaderIndex('Content');
  let reachIdx = getBestHeaderIndex('Reach');
  let interactIdx = getBestHeaderIndex('Interact');
  let pillarIdx = getBestHeaderIndex('Pillar');
  let linkIdx = getBestHeaderIndex('Link');
  let productPillarIdx = getBestHeaderIndex('ProductPillar');

  const likesIdx = getBestHeaderIndex('Likes');
  const commentsIdx = getBestHeaderIndex('Comments');
  const sharesIdx = getBestHeaderIndex('Shares');

  if (createdTimeIdx === -1) createdTimeIdx = 0;
  if (contentIdx === -1) contentIdx = 1 < numCols ? 1 : 0;
  if (reachIdx === -1) reachIdx = 2 < numCols ? 2 : 0;

  const posts: PostItem[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawAiredDate = row[createdTimeIdx] || row[0] || '';
    const rawPost = row[contentIdx] || row[1] || '';
    const rawReach = reachIdx !== -1 ? row[reachIdx] : '0';
    const rawInteract = interactIdx !== -1 ? row[interactIdx] : '0';
    const rawPillar = pillarIdx !== -1 ? (row[pillarIdx] || '') : '';
    const rawProductPillar = productPillarIdx !== -1 ? (row[productPillarIdx] || '') : '';

    if (!rawPost && !rawAiredDate) continue;

    const parseNum = (val: string) => {
      if (!val) return 0;
      const clean = String(val).replace(/[^\d\-]/g, '');
      const n = parseInt(clean, 10);
      return isNaN(n) ? 0 : n;
    };

    let interactVal = parseNum(rawInteract);
    if (interactVal === 0 && (likesIdx !== -1 || commentsIdx !== -1 || sharesIdx !== -1)) {
      const l = likesIdx !== -1 ? parseNum(row[likesIdx]) : 0;
      const c = commentsIdx !== -1 ? parseNum(row[commentsIdx]) : 0;
      const s = sharesIdx !== -1 ? parseNum(row[sharesIdx]) : 0;
      interactVal = l + c + s;
    }

    let postLink = linkIdx !== -1 && row[linkIdx] ? row[linkIdx].trim() : undefined;
    if (!postLink) {
      for (const cell of row) {
        if (String(cell).startsWith('http://') || String(cell).startsWith('https://')) {
          postLink = String(cell).trim();
          break;
        }
      }
    }

    posts.push({
      pillar: rawPillar ? rawPillar.trim().toUpperCase() : '',
      productPillar: rawProductPillar ? rawProductPillar.trim().toUpperCase() : undefined,
      post: rawPost.trim(),
      airedDate: parseAndFormatDate(rawAiredDate),
      reach: parseNum(rawReach),
      interact: interactVal,
      link: postLink,
    });
  }

  return {
    posts,
    headers,
    mappings: {
      createdTimeIdx,
      contentIdx,
      reachIdx,
      interactIdx,
      pillarIdx,
      linkIdx,
      productPillarIdx,
    },
    rawSampleRows: rows.slice(0, 5),
    headerRowIdx,
    isEmpty: posts.length === 0,
  };
}

// 3. Fetch data from the source sheet
export async function fetchSheetData(
  token: string,
  spreadsheetId: string,
  sheetName: string
): Promise<FetchSheetDataResult> {
  if (isDemoOrPlaceholderToken(token)) {
    // Try fetching public sheet CSV automatically
    try {
      const apiEndpoint = typeof window !== 'undefined' ? '/api/fetch-public-sheet' : 'http://localhost:3000/api/fetch-public-sheet';
      const publicRes = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId, sheetName }),
      });
      if (publicRes.ok) {
        const data = await publicRes.json();
        if (data.csvText && data.csvText.trim().length > 10) {
          const parsed = parseRawPastedData(data.csvText);
          if (parsed.posts.length > 0) {
            console.log(`[Public Sheet Sync] Đã nạp thành công ${parsed.posts.length} bài viết từ Google Sheet public!`);
            return parsed;
          }
        }
      }
    } catch (publicErr) {
      console.warn('[Public Sheet Fetch Fallback Notice]:', publicErr);
    }

    let postsToUse = DEMO_POSTS;
    try {
      const storedPasted = localStorage.getItem('custom_pasted_posts');
      if (storedPasted) {
        const parsed = JSON.parse(storedPasted);
        if (Array.isArray(parsed) && parsed.length > 0) {
          postsToUse = parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse custom_pasted_posts:', e);
    }

    return {
      posts: postsToUse,
      headers: ['Aired Date', 'Post Content', 'Reach', 'Interact', 'Content Pillar', 'Product Pillar', 'Post URL'],
      mappings: {
        createdTimeIdx: 0,
        contentIdx: 1,
        reachIdx: 2,
        interactIdx: 3,
        pillarIdx: 4,
        productPillarIdx: 5,
        linkIdx: 6,
      },
      rawSampleRows: postsToUse.slice(0, 5).map(p => [p.airedDate || '', p.post, String(p.reach), String(p.interact), p.pillar, p.productPillar || '', p.link || '']),
      headerRowIdx: 0,
      isEmpty: postsToUse.length === 0,
    };
  }

  // Read the entire sheet to automatically include all columns (including P, Q, R, S, T, etc.)
  const rangeStr = `'${sheetName.replace(/'/g, "''")}'`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeStr)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await handleResponse(response);
  const rows = data.values as string[][] | undefined;

  if (!rows || rows.length < 2) {
    throw new Error('No data found in selected source sheet (or empty sheet).');
  }

  // Find the header row dynamically by searching the first 10 rows for expected header terms
  let headerRowIdx = 0;
  let maxMatchedHeadersCount = 0;
  
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!row) continue;
    const cleanCells = row.map(cell => String(cell || '').trim().toLowerCase());
    
    let matchCount = 0;
    if (cleanCells.some(c => c.includes('created time') || c.includes('aired date') || c.includes('ngày đăng') || c.includes('ngày phát') || c === 'date' || c === 'time')) matchCount++;
    if (cleanCells.some(c => c.includes('content') || c === 'post' || c.includes('bài viết') || c.includes('bài đăng') || c.includes('nội dung'))) matchCount++;
    if (cleanCells.some(c => c.includes('reach') || c.includes('lượt tiếp cận') || c.includes('views') || c.includes('view') || c.includes('lượt xem'))) matchCount++;
    if (cleanCells.some(c => c.includes('interact') || c.includes('tương tác') || c.includes('engagement') || c.includes('interaction'))) matchCount++;
    if (cleanCells.some(c => c === 'pillar' || c.includes('chủ đề') || c.includes('phân loại') || c === 'topic')) matchCount++;
    
    // Only accept a row as a header row if it has at least 2 matching header terms
    if (matchCount > maxMatchedHeadersCount && matchCount >= 2) {
      maxMatchedHeadersCount = matchCount;
      headerRowIdx = r;
    }
  }

  const headers = rows[headerRowIdx].map(h => String(h || '').trim());
  const numCols = headers.length;
  
  // Find column indexes dynamically using robust concept-based scoring to avoid collisions (e.g., Post URL matching Post Content)
  const getBestHeaderIndex = (concept: 'CreatedTime' | 'Content' | 'Reach' | 'Interact' | 'Pillar' | 'Link' | 'ProductPillar'): number => {
    let bestIdx = -1;
    let highestScore = -999;

    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const lower = h.toLowerCase().trim();
      let score = 0;

      if (concept === 'CreatedTime') {
        const exacts = ["created date (ngày đăng)", "ngày đăng", "created date", "created_date", "created time", "created_time", "aired date", "aired_date", "timestamp", "date", "ngày", "ngày đăng bài"];
        const partials = ["date", "ngày", "time", "created", "aired", "timestamp"];
        const penalties = ["url", "link", "id", "pillar", "reach", "interact", "comment", "share", "like", "react", "view", "nội dung", "bài viết", "bài đăng"];
        
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;
        
        if (penalties.some(p => lower.includes(p))) score -= 50;
      }
      else if (concept === 'Content') {
        const exacts = ["post content", "post_content", "nội dung bài viết", "nội dung", "content", "bài viết", "bài đăng", "text", "message", "chi tiết bài viết"];
        const partials = ["content", "nội dung", "bài viết", "bài đăng", "text", "message"];
        const penalties = ["url", "link", "id", "title", "tiêu đề", "pillar", "chủ đề", "phân loại", "category", "topic", "reach", "interact", "comment", "share", "view", "date", "ngày"];
        
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;
        else if (lower.includes('post') && !lower.includes('url') && !lower.includes('link') && !lower.includes('id') && !lower.includes('title')) score += 5;

        if (penalties.some(p => lower.includes(p))) score -= 80;
      }
      else if (concept === 'Reach') {
        const exacts = ["reach (số người tiếp cận)", "reach", "lượt tiếp cận", "views", "view", "lượt xem", "unique views", "post total media views unique", "số lượng tiếp cận"];
        const partials = ["reach", "tiếp cận", "view", "xem"];
        const penalties = ["interact", "tương tác", "comment", "share", "like", "react", "url", "link", "id", "pillar", "content", "bài viết", "bài đăng", "nội dung", "date", "ngày"];
        
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;

        if (penalties.some(p => lower.includes(p))) score -= 50;
      }
      else if (concept === 'Interact') {
        const exacts = ["interact (react+comment+share)", "interact", "interaction", "tương tác", "lượt tương tác", "engagement", "tổng tương tác"];
        const partials = ["interact", "interaction", "tương tác", "engagement"];
        const penalties = ["reach", "view", "xem", "url", "link", "id", "pillar", "content", "bài viết", "bài đăng", "nội dung", "date", "ngày"];
        
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;

        if (penalties.some(p => lower.includes(p))) score -= 50;
      }
      else if (concept === 'Pillar') {
        const exacts = ["content pillar", "content_pillar", "pillar", "chủ đề", "phân loại", "category", "topic", "nhóm bài viết", "nhóm chủ đề"];
        const partials = ["pillar", "chủ đề", "phân loại", "category", "topic"];
        const penalties = ["url", "link", "id", "reach", "interact", "comment", "share", "like", "react", "view", "date", "ngày"];
        
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;

        if (penalties.some(p => lower.includes(p))) score -= 50;
      }
      else if (concept === 'Link') {
        const exacts = [
          "post url", "post_url", "link", "url", "post link", "fb link", "facebook link", "path", 
          "link bài viết", "link bài", "url bài viết", "url bài", "đường dẫn bài viết", "đường dẫn bài",
          "đường dẫn", "liên kết"
        ];
        const partials = ["link", "url", "path", "đường dẫn", "liên kết"];
        const penalties = ["content", "nội dung", "id", "reach", "interact", "comment", "share", "like", "react", "view", "date", "ngày"];
        
        // Only penalize "bài viết" or "bài đăng" if there's no strong link indicator
        const hasStrongLinkIndicator = lower.includes('link') || lower.includes('url') || lower.includes('đường dẫn') || lower.includes('liên kết');
        const activePenalties = hasStrongLinkIndicator 
          ? penalties 
          : [...penalties, "bài viết", "bài đăng"];
        
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;

        if (activePenalties.some(p => lower.includes(p))) score -= 50;
      }
      else if (concept === 'ProductPillar') {
        const exacts = ["product pillar", "product_pillar", "pillar sản phẩm", "sản phẩm", "nhóm sản phẩm", "sub pillar", "sub_pillar"];
        const partials = ["product", "sản phẩm", "sub pillar", "sub_pillar"];
        const penalties = ["url", "link", "id", "reach", "interact", "comment", "share", "like", "react", "view", "date", "ngày"];
        
        if (exacts.some(e => lower === e)) score += 100;
        else if (partials.some(p => lower.includes(p))) score += 20;

        if (penalties.some(p => lower.includes(p))) score -= 50;
      }

      if (score > highestScore && score > 0) {
        highestScore = score;
        bestIdx = i;
      }
    }

    return bestIdx;
  };

  let createdTimeIdx = getBestHeaderIndex('CreatedTime');
  let contentIdx = getBestHeaderIndex('Content');
  let reachIdx = getBestHeaderIndex('Reach');
  let interactIdx = getBestHeaderIndex('Interact');
  let pillarIdx = getBestHeaderIndex('Pillar');
  let linkIdx = getBestHeaderIndex('Link');

  let productPillarIdx = getBestHeaderIndex('ProductPillar');
  if (productPillarIdx === -1) {
    // try fallback keywords as well if best matching concept score was not sufficient
    const lowerHeaders = headers.map(h => h.toLowerCase());
    productPillarIdx = lowerHeaders.findIndex(h => 
      h.includes('product pillar') || 
      h.includes('pillar sản phẩm') || 
      h.includes('sản phẩm') || 
      h.includes('nhóm sản phẩm') || 
      h.includes('sub pillar') ||
      h.includes('sub_pillar')
    );
  }

  // --- STATISTICAL AUTO-DETECTION FALLBACK ---
  // If some columns are missing from header-matching, we analyze the first few data rows to guess them.
  const dataRowsForAnalysis = rows.slice(headerRowIdx + 1, headerRowIdx + 7);
  if (dataRowsForAnalysis.length > 0) {
    const colStats = Array.from({ length: numCols }, (_, colIdx) => {
      let dateCount = 0;
      let numCount = 0;
      let totalLength = 0;
      const values: string[] = [];

      dataRowsForAnalysis.forEach(row => {
        const val = String(row[colIdx] || '').trim();
        if (!val) return;
        values.push(val);
        totalLength += val.length;

        // Check date likelihood
        const formattedDate = parseAndFormatDate(val);
        if (formattedDate.includes('-') && formattedDate.length === 10) {
          dateCount++;
        }

        // Check numeric likelihood
        const cleanVal = val.replace(/,/g, '').replace(/\./g, '').trim();
        if (cleanVal && !isNaN(Number(cleanVal))) {
          numCount++;
        }
      });

      return {
        colIdx,
        dateScore: dateCount / dataRowsForAnalysis.length,
        numberScore: numCount / dataRowsForAnalysis.length,
        avgLength: values.length ? totalLength / values.length : 0,
        uniqueCount: new Set(values).size,
      };
    });

    // Best Date Column (if still missing)
    if (createdTimeIdx === -1) {
      const bestDateCol = colStats
        .filter(s => s.dateScore > 0.3)
        .sort((a, b) => b.dateScore - a.dateScore)[0];
      if (bestDateCol) {
        createdTimeIdx = bestDateCol.colIdx;
      }
    }

    // Best Content Column (if still missing, longest text, typically length > 15)
    if (contentIdx === -1) {
      const bestContentCol = colStats
        .filter(s => s.colIdx !== createdTimeIdx)
        .sort((a, b) => b.avgLength - a.avgLength)[0];
      if (bestContentCol && bestContentCol.avgLength > 12) {
        contentIdx = bestContentCol.colIdx;
      }
    }

    // Best Numeric Columns (Reach / Interact)
    const numColsList = colStats
      .filter(s => s.colIdx !== createdTimeIdx && s.colIdx !== contentIdx && s.numberScore > 0.5)
      .sort((a, b) => b.numberScore - a.numberScore);

    if (reachIdx === -1 && numColsList.length > 0) {
      reachIdx = numColsList[0].colIdx;
    }
    if (interactIdx === -1) {
      const remainingNumCols = numColsList.filter(s => s.colIdx !== reachIdx);
      if (remainingNumCols.length > 0) {
        interactIdx = remainingNumCols[0].colIdx;
      }
    }

    // Best Pillar Column (if still missing, short string with moderate distinct counts)
    if (pillarIdx === -1) {
      const bestPillarCol = colStats
        .filter(s => s.colIdx !== createdTimeIdx && s.colIdx !== contentIdx && s.colIdx !== reachIdx && s.colIdx !== interactIdx)
        .filter(s => s.avgLength > 1 && s.avgLength < 30)
        .sort((a, b) => a.uniqueCount - b.uniqueCount)[0];
      if (bestPillarCol) {
        pillarIdx = bestPillarCol.colIdx;
      }
    }
  }

  // Smart Collision-Free Hardcoded Fallbacks scaled to the actual number of columns
  if (createdTimeIdx === -1) createdTimeIdx = 0;
  if (contentIdx === -1) {
    const candidates = [3, 2, 1, 0].filter(idx => idx < numCols && idx !== createdTimeIdx);
    contentIdx = candidates[0] !== undefined ? candidates[0] : 0;
  }
  if (reachIdx === -1) {
    const candidates = [5, 4, 3, 2, 1, 0].filter(idx => idx < numCols && idx !== createdTimeIdx && idx !== contentIdx);
    reachIdx = candidates[0] !== undefined ? candidates[0] : 0;
  }
  if (interactIdx === -1) {
    const candidates = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].filter(idx => idx < numCols && idx !== createdTimeIdx && idx !== contentIdx && idx !== reachIdx);
    interactIdx = candidates[0] !== undefined ? candidates[0] : 0;
  }
  if (pillarIdx === -1) {
    const candidates = [12, 13, 14, 1, 2, 3, 4, 5, 0].filter(idx => idx < numCols && idx !== createdTimeIdx && idx !== contentIdx && idx !== reachIdx && idx !== interactIdx);
    pillarIdx = candidates[0] !== undefined ? candidates[0] : 0;
  }

  const posts: PostItem[] = [];

  // Parse rows from row index headerRowIdx + 1 onwards
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Read values based on matched indexes (with fallbacks)
    const rawAiredDate = row[createdTimeIdx] !== undefined ? row[createdTimeIdx] : (row[0] || '');
    const rawPost = row[contentIdx] !== undefined ? row[contentIdx] : (row[3] || '');
    const rawReach = row[reachIdx] !== undefined ? row[reachIdx] : (row[5] || '');
    const rawInteract = row[interactIdx] !== undefined ? row[interactIdx] : (row[11] || '');
    const rawPillar = row[pillarIdx] !== undefined ? row[pillarIdx] : (row[12] || '');

    // Skip entirely empty rows
    if (!rawAiredDate && !rawPost && !rawReach && !rawInteract && !rawPillar) {
      continue;
    }

    // Process Pillar and Product Sub-Pillar
    const subPillars = ['ÁNH KIM', 'KHUNG TITAN', 'TẤM EUROTONE', 'TẤM SIÊU BẢO VỆ', 'TẤM SIÊU CHỐNG MỐC', 'TẤM SIÊU CHỐNG ẨM', 'SIÊU CHỐNG CHÁY', 'KHÁC'];
    let pillar = (rawPillar || '').trim().toUpperCase();
    let productPillar = productPillarIdx !== -1 && row[productPillarIdx] !== undefined ? String(row[productPillarIdx]).trim().toUpperCase() : '';

    if (subPillars.includes(pillar)) {
      productPillar = pillar;
      pillar = 'PRODUCT';
    }

    // Process Date (Format yyyy-mm-dd)
    const airedDate = parseAndFormatDate(rawAiredDate);

    // Process numeric reach and interact
    const parseNumber = (val: string | number): number => {
      if (typeof val === 'number') return val;
      let cleanVal = String(val || '').trim();
      if (!cleanVal) return 0;
      
      // If it ends with decimals like .00, remove them
      cleanVal = cleanVal.replace(/\.00$/, '').replace(/,00$/, '');
      
      // Handle thousand separators:
      if (cleanVal.includes('.') && !cleanVal.includes(',')) {
        const parts = cleanVal.split('.');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
          cleanVal = cleanVal.replace(/\./g, '');
        }
      } else {
        cleanVal = cleanVal.replace(/,/g, '');
      }
      
      // Remove any non-digit characters except negative sign
      cleanVal = cleanVal.replace(/[^\d\-]/g, '');
      const num = parseInt(cleanVal, 10);
      return isNaN(num) ? 0 : num;
    };

    const reach = parseNumber(rawReach);
    const interact = parseNumber(rawInteract);

    // Extract link if any
    let postLink = '';
    if (linkIdx !== -1) {
      if (row[linkIdx] !== undefined) {
        postLink = String(row[linkIdx]).trim();
      }
      
      // If the link does not start with http/https but contains a domain pattern, prepend https://
      if (postLink && !postLink.startsWith('http://') && !postLink.startsWith('https://')) {
        if (postLink.startsWith('www.') || postLink.includes('.')) {
          postLink = 'https://' + postLink;
        }
      }
    } else {
      // Bulletproof fallback: ONLY search other cells if NO dedicated Link column was found in the sheet headers!
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        if (colIdx === contentIdx) continue; // skip the main post content column
        const valStr = String(row[colIdx] || '').trim();
        if (valStr.startsWith('http://') || valStr.startsWith('https://')) {
          postLink = valStr;
          break; // take the first found URL
        }
      }
      
      // Try to extract a URL from the post content itself
      if (!postLink || !postLink.startsWith('http')) {
        const urlMatch = String(rawPost).match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          postLink = urlMatch[1];
        }
      }
    }

    posts.push({
      pillar,
      productPillar: productPillar || undefined,
      post: rawPost.trim(),
      airedDate,
      reach,
      interact,
      link: postLink || undefined,
    });
  }

  return {
    posts,
    headers,
    mappings: {
      createdTimeIdx,
      contentIdx,
      reachIdx,
      interactIdx,
      pillarIdx,
      linkIdx,
      productPillarIdx,
    },
    rawSampleRows: rows.slice(0, 10),
    headerRowIdx,
    isEmpty: posts.length === 0,
  };
}

// Helper to insert realistic demo sample rows into the current source sheet
export async function insertSampleDataToSheet(
  token: string,
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  if (isDemoOrPlaceholderToken(token)) {
    return 5;
  }
  const fetchRes = await fetchSheetData(token, spreadsheetId, sheetName);
  const headers = fetchRes.headers;
  const mappings = fetchRes.mappings;
  const numCols = Math.max(headers.length, 13);

  const sampleRowsData = [
    {
      pillar: 'BRANDING',
      post: 'Vĩnh Tường đồng hành cùng tổ ấm người Việt - Giải pháp trần tường thạch cao bền đẹp chuẩn chuyên gia hàng đầu.',
      airedDate: '2026-03-01',
      reach: 14500,
      interact: 920,
      link: 'https://facebook.com/vinhtuong/posts/101',
      title: 'Tổ ấm bền đẹp cùng Vĩnh Tường'
    },
    {
      pillar: 'PRODUCT',
      productPillar: 'KHUNG TITAN',
      post: 'Khung Vĩnh Tường TITAN siêu bền, chống rỉ sét vượt trội, vững chãi suốt 10 năm cho mọi công trình hiện đại.',
      airedDate: '2026-03-05',
      reach: 22800,
      interact: 1640,
      link: 'https://facebook.com/vinhtuong/posts/102',
      title: 'Khung Vĩnh Tường TITAN siêu bền'
    },
    {
      pillar: 'PRODUCT',
      productPillar: 'TẤM SIÊU CHỐNG MỐC',
      post: 'Tấm thạch cao Siêu Chống Mốc Vĩnh Tường - Bảo vệ tối đa không gian sống sạch khuẩn, không lo ẩm mốc mùa mưa ẩm.',
      airedDate: '2026-03-10',
      reach: 26500,
      interact: 1890,
      link: 'https://facebook.com/vinhtuong/posts/103',
      title: 'Tấm Siêu Chống Mốc Vĩnh Tường'
    },
    {
      pillar: 'PROMOTION',
      post: 'CHƯƠNG TRÌNH KHUYẾN MÃI ĐẶC BIỆT: Mua Khung Titan nhận ngay combo quà tặng hấp dẫn cùng phiếu giảm giá 15%!',
      airedDate: '2026-03-15',
      reach: 38200,
      interact: 3120,
      link: 'https://facebook.com/vinhtuong/posts/104',
      title: 'Khuyến mãi đặc biệt Vĩnh Tường'
    },
    {
      pillar: 'MINIGAME',
      post: 'MINIGAME: Đuổi hình bắt chữ - Dự đoán đúng tên sản phẩm Vĩnh Tường nhận ngay voucher mua sắm 500.000đ!',
      airedDate: '2026-03-20',
      reach: 31500,
      interact: 4250,
      link: 'https://facebook.com/vinhtuong/posts/105',
      title: 'Minigame Đuổi hình bắt chữ nhận quà'
    }
  ];

  const rowsToAppend: string[][] = sampleRowsData.map((item, idx) => {
    const row = new Array(numCols).fill('');
    if (mappings.createdTimeIdx !== -1) row[mappings.createdTimeIdx] = item.airedDate;
    if (mappings.contentIdx !== -1) row[mappings.contentIdx] = item.post;
    if (mappings.reachIdx !== -1) row[mappings.reachIdx] = String(item.reach);
    if (mappings.interactIdx !== -1) row[mappings.interactIdx] = String(item.interact);
    if (mappings.pillarIdx !== -1) row[mappings.pillarIdx] = item.pillar;
    if (mappings.linkIdx !== -1) row[mappings.linkIdx] = item.link;
    if (mappings.productPillarIdx !== -1 && item.productPillar) row[mappings.productPillarIdx] = item.productPillar;

    // Fill other common columns if found in headers
    headers.forEach((h, hIdx) => {
      const lower = h.toLowerCase();
      if (lower.includes('month') || lower === 'tháng') row[hIdx] = '03/2026';
      if (lower.includes('post id') || lower === 'id') row[hIdx] = `POST_${100 + idx + 1}`;
      if (lower.includes('title') || lower.includes('tiêu đề')) row[hIdx] = item.title;
      if (lower.includes('react') || lower.includes('thích')) row[hIdx] = String(Math.floor(item.interact * 0.7));
      if (lower.includes('comment') || lower.includes('bình luận')) row[hIdx] = String(Math.floor(item.interact * 0.2));
      if (lower.includes('share') || lower.includes('chia sẻ')) row[hIdx] = String(Math.floor(item.interact * 0.1));
      if (lower.includes('view') || lower.includes('xem')) row[hIdx] = String(item.reach * 2);
    });

    return row;
  });

  const rangeStr = `'${sheetName.replace(/'/g, "''")}'`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeStr)}:append?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rowsToAppend }),
  });
  await handleResponse(response);
  return rowsToAppend.length;
}

// 4. Synchronize / write dashboard, configs, and logs back to Google Sheet
export async function writeDashboardToGoogleSheet(
  token: string,
  spreadsheetId: string,
  config: ConfigSettings,
  groups: PillarGroup[],
  logs: LogEntry[]
): Promise<void> {
  if (isDemoOrPlaceholderToken(token)) {
    // Simulate successful sync in demo mode
    return;
  }
  // First, retrieve the sheet list to know which tabs need deleting / recreation
  const details = await fetchSpreadsheetDetails(token, spreadsheetId);
  const existingSheetsMap = new Map<string, number>();
  details.sheets.forEach(s => existingSheetsMap.set(s.title, s.id));

  const deleteRequests: any[] = [];
  const addRequests: any[] = [];

  // Sheets we want to manage
  const targetSheets = ['CONFIG', 'DASHBOARD', 'LOGS'];
  
  // We can only delete a sheet if there is at least one other sheet left in the spreadsheet.
  // The source sheet or some other sheet must remain. Let's make sure we have at least one sheet that is NOT in targetSheets,
  // or if all sheets are targetSheets, we keep one and don't delete it.
  const nonTargetSheets = details.sheets.filter(s => !targetSheets.includes(s.title));
  const hasExternalSheet = nonTargetSheets.length > 0;

  targetSheets.forEach(title => {
    const existingId = existingSheetsMap.get(title);
    if (existingId !== undefined) {
      // If we have an external sheet or there are other sheets, we can delete the target sheet
      // Otherwise, if it is the only sheet, we cannot delete it, but Sheets API will complain, so we skip deleting it.
      if (hasExternalSheet || details.sheets.length > 1) {
        deleteRequests.push({ deleteSheet: { sheetId: existingId } });
      }
    }
    addRequests.push({
      addSheet: {
        properties: {
          title,
          gridProperties: {
            rowCount: title === 'DASHBOARD' ? 2000 : 500,
            columnCount: 10,
          },
        },
      },
    });
  });

  // Execute Deletes and Adds
  // If we delete and then add in the same batch, the delete must happen first
  const setupRequests = [...deleteRequests, ...addRequests];
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests: setupRequests }),
  }).then(handleResponse);

  // Re-fetch sheet list to get new sheet IDs
  const updatedDetails = await fetchSpreadsheetDetails(token, spreadsheetId);
  const newSheetsMap = new Map<string, number>();
  updatedDetails.sheets.forEach(s => newSheetsMap.set(s.title, s.id));

  const configSheetId = newSheetsMap.get('CONFIG')!;
  const dashboardSheetId = newSheetsMap.get('DASHBOARD')!;
  const logsSheetId = newSheetsMap.get('LOGS')!;

  // Prepare batch values and formatting requests
  const valueRanges: any[] = [];
  const formatRequests: any[] = [];

  // ==================== 1. CONFIG SHEET DATA & FORMAT ====================
  const configRows = [
    ['Cấu hình Dashboard', 'Giá trị', 'Mô tả'],
    ['Source Sheet Name', config.sourceSheetName, 'Tên sheet nguồn cần đọc'],
    ['Start Date', config.startDate || 'N/A', 'Ngày bắt đầu lọc dữ liệu (yyyy-mm-dd)'],
    ['End Date', config.endDate || 'N/A', 'Ngày kết thúc lọc dữ liệu (yyyy-mm-dd)'],
    ['Sort By', config.sortBy, 'Trường sắp xếp (interact / reach / airedDate)'],
    ['Sort Order', config.sortOrder, 'Thứ tự sắp xếp (desc / asc)'],
    ['Max Posts Per Pillar', config.unlimitedPosts ? 'Không giới hạn (Lấy hết)' : config.maxPostsPerPillar, 'Số bài tối đa hiển thị trong mỗi Pillar'],
    ['Include Empty Pillar', config.includeEmptyPillar ? 'Yes' : 'No', 'Có lấy dòng không có Pillar không'],
  ];

  valueRanges.push({
    range: 'CONFIG!A1:C8',
    values: configRows,
  });

  // Config format: Teal header, bold first column, clean borders, custom widths
  formatRequests.push(
    // Column widths
    {
      updateDimensionProperties: {
        range: { sheetId: configSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 3 },
        properties: { pixelSize: 200 },
        fields: 'pixelSize',
      },
    },
    // Header Style
    {
      repeatCell: {
        range: { sheetId: configSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 16/255, green: 181/255, blue: 165/255 }, // #10B5A5
            textFormat: { foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 }, bold: true, fontSize: 11 },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
    // Grid borders and alignment for content
    {
      repeatCell: {
        range: { sheetId: configSheetId, startRowIndex: 1, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 3 },
        cell: {
          userEnteredFormat: {
            borders: {
              top: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
              bottom: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
              left: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
              right: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
            },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(borders,verticalAlignment)',
      },
    },
    // First column bold
    {
      repeatCell: {
        range: { sheetId: configSheetId, startRowIndex: 1, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(textFormat)',
      },
    }
  );

  // ==================== 2. DASHBOARD SHEET DATA & FORMAT ====================
  const dashboardRows: any[][] = [];
  let currentRowIdx = 0;

  // Set Column Widths in Dashboard
  // No: 60, Pillar: 120, Product pillar: 150, Post: 600, Aired Date: 120, Reach: 120, Interact: 120
  const columnWidths = [60, 120, 150, 600, 120, 120, 120];
  columnWidths.forEach((width, index) => {
    formatRequests.push({
      updateDimensionProperties: {
        range: { sheetId: dashboardSheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
        properties: { pixelSize: width },
        fields: 'pixelSize',
      },
    });
  });

  groups.forEach((group) => {
    // Title Row
    const titleRowIdx = currentRowIdx;
    dashboardRows.push([group.pillar, '', '', '', '', '', '']);
    dashboardRows.push([]); // Spacer
    
    // Header Row
    const headerRowIdx = titleRowIdx + 2;
    dashboardRows.push(['No.', 'Pillar', 'Product pillar', 'Post', 'Aired date', 'Reach', 'Interact']);
    
    const startDataRowIdx = headerRowIdx + 1;
    const postsCount = group.posts.length;

    group.posts.forEach((post, i) => {
      // Create a Google Sheet HYPERLINK formula if the post has a valid link
      const safePostText = (post.post || '').replace(/"/g, '""');
      const cellValue = post.link && post.link.startsWith('http')
        ? `=HYPERLINK("${post.link}", "${safePostText}")`
        : post.post;

      dashboardRows.push([
        i + 1,
        post.pillar,
        post.productPillar || '',
        cellValue,
        post.airedDate,
        post.reach,
        post.interact,
      ]);
    });

    const endDataRowIdx = startDataRowIdx + postsCount;
    
    // Style requests for this Pillar block
    formatRequests.push(
      // Title style: Font size 18, bold, Teal (#10B5A5) text color, white background
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: titleRowIdx, endRowIndex: titleRowIdx + 1, startColumnIndex: 0, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                fontSize: 18,
                foregroundColor: { red: 16/255, green: 181/255, blue: 165/255 },
              },
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(textFormat,verticalAlignment)',
        },
      },
      // Header style: Background #10B5A5, Text White bold, center alignment, borders black
      {
        repeatCell: {
          range: { sheetId: dashboardSheetId, startRowIndex: headerRowIdx, endRowIndex: headerRowIdx + 1, startColumnIndex: 0, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 16/255, green: 181/255, blue: 165/255 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                fontSize: 11,
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              borders: {
                top: { style: 'MEDIUM', color: { red: 0, green: 0, blue: 0 } },
                bottom: { style: 'MEDIUM', color: { red: 0, green: 0, blue: 0 } },
                left: { style: 'MEDIUM', color: { red: 0, green: 0, blue: 0 } },
                right: { style: 'MEDIUM', color: { red: 0, green: 0, blue: 0 } },
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)',
        },
      }
    );

    if (postsCount > 0) {
      // Style data cells: Borders black, custom text styling, custom alignments
      formatRequests.push(
        {
          repeatCell: {
            range: { sheetId: dashboardSheetId, startRowIndex: startDataRowIdx, endRowIndex: endDataRowIdx, startColumnIndex: 0, endColumnIndex: 7 },
            cell: {
              userEnteredFormat: {
                borders: {
                  top: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
                  bottom: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
                  left: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
                  right: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
                },
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(borders,verticalAlignment)',
          },
        },
        // Column No: Center, bold
        {
          repeatCell: {
            range: { sheetId: dashboardSheetId, startRowIndex: startDataRowIdx, endRowIndex: endDataRowIdx, startColumnIndex: 0, endColumnIndex: 1 },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                textFormat: { bold: true },
              },
            },
            fields: 'userEnteredFormat(horizontalAlignment,textFormat)',
          },
        },
        // Column Pillar: Center
        {
          repeatCell: {
            range: { sheetId: dashboardSheetId, startRowIndex: startDataRowIdx, endRowIndex: endDataRowIdx, startColumnIndex: 1, endColumnIndex: 2 },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(horizontalAlignment)',
          },
        },
        // Column Product pillar: Center
        {
          repeatCell: {
            range: { sheetId: dashboardSheetId, startRowIndex: startDataRowIdx, endRowIndex: endDataRowIdx, startColumnIndex: 2, endColumnIndex: 3 },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(horizontalAlignment)',
          },
        },
        // Column Post: Wrap Text, Color Teal-blue (#0097A7) or standard link color
        {
          repeatCell: {
            range: { sheetId: dashboardSheetId, startRowIndex: startDataRowIdx, endRowIndex: endDataRowIdx, startColumnIndex: 3, endColumnIndex: 4 },
            cell: {
              userEnteredFormat: {
                wrapStrategy: 'WRAP',
                textFormat: {
                  foregroundColor: { red: 0, green: 151/255, blue: 167/255 }, // #0097A7
                },
              },
            },
            fields: 'userEnteredFormat(wrapStrategy,textFormat)',
          },
        },
        // Column Aired Date: Center
        {
          repeatCell: {
            range: { sheetId: dashboardSheetId, startRowIndex: startDataRowIdx, endRowIndex: endDataRowIdx, startColumnIndex: 4, endColumnIndex: 5 },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(horizontalAlignment)',
          },
        },
        // Columns Reach & Interact: Right, format as integer with comma
        {
          repeatCell: {
            range: { sheetId: dashboardSheetId, startRowIndex: startDataRowIdx, endRowIndex: endDataRowIdx, startColumnIndex: 5, endColumnIndex: 7 },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'RIGHT',
                numberFormat: { type: 'NUMBER', pattern: '#,##0' },
              },
            },
            fields: 'userEnteredFormat(horizontalAlignment,numberFormat)',
          },
        }
      );
    }

    // Advance index: title (1 row) + spacer (1 row) + header (1 row) + postsCount + 3 blank spacer rows between blocks
    currentRowIdx += 3 + postsCount + 3;
    
    // Add extra spacers to dashboardRows
    dashboardRows.push([], [], []);
  });

  valueRanges.push({
    range: `DASHBOARD!A1:G${dashboardRows.length}`,
    values: dashboardRows,
  });

  // ==================== 3. LOGS SHEET DATA & FORMAT ====================
  const logRows = [
    ['Time', 'Action', 'Status', 'Message'],
    ...logs.map(log => [log.time, log.action, log.status, log.message]),
  ];

  valueRanges.push({
    range: `LOGS!A1:D${logRows.length}`,
    values: logRows,
  });

  formatRequests.push(
    // Column widths
    {
      updateDimensionProperties: {
        range: { sheetId: logsSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 180 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: logsSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 },
        properties: { pixelSize: 150 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId: logsSheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 450 },
        fields: 'pixelSize',
      },
    },
    // Header Style
    {
      repeatCell: {
        range: { sheetId: logsSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 16/255, green: 181/255, blue: 165/255 },
            textFormat: { foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 }, bold: true, fontSize: 11 },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
    // Cell borders
    {
      repeatCell: {
        range: { sheetId: logsSheetId, startRowIndex: 1, endRowIndex: logRows.length, startColumnIndex: 0, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            borders: {
              top: { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } },
              bottom: { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } },
              left: { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } },
              right: { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } },
            },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(borders,verticalAlignment)',
      },
    }
  );

  // Write values using values:batchUpdate
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: valueRanges,
    }),
  }).then(handleResponse);

  // Apply formatting using spreadsheets:batchUpdate
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests: formatRequests }),
  }).then(handleResponse);
}
