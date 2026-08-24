/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigSettings } from './types';

// Fast local rule-based classifier based on keywords
export function classifyByRules(postText: string, config: ConfigSettings): { pillar: string; productPillar?: string } {
  const text = (postText || '').toLowerCase();
  
  // 1. Minigame check: "sẽ có chữ Minigame trên đầu caption"
  const minigameKeys = (config.minigameKeywords || 'Minigame, mini game')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);
  
  const isMinigame = minigameKeys.some(key => text.includes(key));
  if (isMinigame) return { pillar: 'MINIGAME' };

  // 2. Promotion check: "Phi mã vượt đỉnh, Chiến thần siêu bảo vệ"
  const promoKeys = (config.promotionKeywords || 'Phi mã vượt đỉnh, Chiến thần siêu bảo vệ')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);
  
  const isPromo = promoKeys.some(key => text.includes(key));
  if (isPromo) return { pillar: 'PROMOTION' };

  // 3. Product check: "KHUNG VĨNH TƯỜNG TITAN, TẤM SIÊU CHỐNG MỐC..."
  const prodKeys = (config.productKeywords || 'KHUNG VĨNH TƯỜNG TITAN, TẤM SIÊU CHỐNG MỐC, TRẦN VĨNH TƯỜNG SIÊU BẢO VỆ, NGỌC LỤC BẢO, SIÊU CHỐNG CHÁY, VĨNH TƯỜNG')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);
  
  const isProd = prodKeys.some(key => text.includes(key));
  if (isProd) {
    let subPillar = 'KHÁC';
    if (text.includes('ánh kim')) {
      subPillar = 'ÁNH KIM';
    } else if (text.includes('titan') || text.includes('khung') || text.includes('basi')) {
      subPillar = 'KHUNG TITAN';
    } else if (text.includes('eurotone')) {
      subPillar = 'TẤM EUROTONE';
    } else if (text.includes('bảo vệ')) {
      subPillar = 'TẤM SIÊU BẢO VỆ';
    } else if (text.includes('mốc')) {
      subPillar = 'TẤM SIÊU CHỐNG MỐC';
    } else if (text.includes('ẩm')) {
      subPillar = 'TẤM SIÊU CHỐNG ẨM';
    } else if (text.includes('cháy')) {
      subPillar = 'SIÊU CHỐNG CHÁY';
    }
    return { pillar: 'PRODUCT', productPillar: subPillar };
  }

  return { pillar: 'BRANDING' };
}

// Backend caller for server-side Gemini AI classification
export async function classifyWithAI(
  postsToClassify: { id: string | number; post: string }[]
): Promise<Map<string, { pillar: string; productPillar?: string }>> {
  const response = await fetch('/api/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ posts: postsToClassify }),
  });
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Lỗi gọi API phân loại AI.');
  }
  
  const data = await response.json();
  const resultMap = new Map<string, { pillar: string; productPillar?: string }>();
  
  if (data.success && Array.isArray(data.classifications)) {
    data.classifications.forEach((item: any) => {
      if (item.id && item.pillar) {
        resultMap.set(String(item.id), {
          pillar: item.pillar.toUpperCase(),
          productPillar: item.productPillar ? item.productPillar.toUpperCase() : undefined,
        });
      }
    });
  }
  
  return resultMap;
}
