/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PostItem {
  pillar: string;
  productPillar?: string;
  post: string;
  airedDate: string; // yyyy-mm-dd
  reach: number;
  interact: number;
  link?: string;
}

export interface ConfigSettings {
  spreadsheetId: string;
  sourceSheetName: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  sortBy: 'interact' | 'reach' | 'airedDate';
  sortOrder: 'desc' | 'asc';
  maxPostsPerPillar: number;
  unlimitedPosts?: boolean;
  includeEmptyPillar: boolean;
  classifyMode?: 'sheet' | 'rules' | 'ai' | 'hybrid';
  productKeywords?: string;
  promotionKeywords?: string;
  minigameKeywords?: string;
}

export interface LogEntry {
  time: string;
  action: string;
  status: 'Success' | 'Error' | 'Warning';
  message: string;
}

export interface PillarGroup {
  pillar: string;
  posts: PostItem[];
}
