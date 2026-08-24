/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ConfigSettings } from '../types';
import { fetchSpreadsheets, fetchSpreadsheetDetails, parseRawPastedData } from '../googleSheets';
import { googleSignIn } from '../firebase';
import { 
  Settings, 
  FileSpreadsheet, 
  SlidersHorizontal, 
  ArrowUpDown, 
  Hash, 
  RefreshCw, 
  Database,
  Trash2,
  CloudLightning,
  AlertCircle,
  Sparkles,
  LogIn,
  Upload
} from 'lucide-react';

interface ConfigTabProps {
  accessToken: string;
  config: ConfigSettings;
  setConfig: React.Dispatch<React.SetStateAction<ConfigSettings>>;
  onRefreshDashboard: () => void;
  onClearDashboard: () => void;
  onSyncToSheets: () => void;
  onInsertSampleData?: () => void;
  onAuthSuccess?: (googleUser: any, token: string) => void;
  isProcessing: boolean;
  isSyncing: boolean;
  isInsertingSample?: boolean;
  sheetsList: string[];
  setSheetsList: (sheets: string[]) => void;
  dashboardError: string | null;
  setDashboardError: (err: string | null) => void;
}

export const ConfigTab: React.FC<ConfigTabProps> = ({
  accessToken,
  config,
  setConfig,
  onRefreshDashboard,
  onClearDashboard,
  onSyncToSheets,
  onInsertSampleData,
  onAuthSuccess,
  isProcessing,
  isSyncing,
  isInsertingSample,
  sheetsList,
  setSheetsList,
  dashboardError,
  setDashboardError,
}) => {
  const [spreadsheets, setSpreadsheets] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingSpreadsheets, setIsLoadingSpreadsheets] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      const res = await googleSignIn();
      if (res && onAuthSuccess) {
        onAuthSuccess(res.user, res.accessToken);
        alert(`Đăng nhập Google thành công với tài khoản ${res.user.email}! Nhấn "Tạo/Làm mới Dashboard" để tải dữ liệu thật từ Sheet.`);
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      const host = window.location.hostname || 'localhost';
      if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
        alert(
          `⚠️ CHƯA CẤP QUYỀN DOMAIN TRONG FIREBASE:\n\n` +
          `Địa chỉ web hiện tại ("${host}") chưa được thêm vào Authorized Domains của dự án Firebase.\n\n` +
          `👉 HƯỚNG DẪN KHẮC PHÚC (Nếu muốn đăng nhập Google):\n` +
          `1. Mở https://console.firebase.google.com (Dự án: gen-lang-client-0998546740)\n` +
          `2. Chọn Authentication ➔ Settings ➔ Authorized domains\n` +
          `3. Nhấp "Add domain" và nhập: ${host}\n\n` +
          `💡 BẠN VẪN CÓ THỂ SỬ DỤNG BÌNH THƯỜNG:\n` +
          `Ứng dụng vẫn chạy mượt mà 100% chế độ Dashboard, chụp ảnh màn hình bài viết bằng Selenium Chrome và phân loại AI!`
        );
      } else {
        alert(`Lỗi kết nối Google: ${err?.message || err}.`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Fetch recent spreadsheets on mount
  useEffect(() => {
    loadRecentSpreadsheets();
  }, []);

  const loadRecentSpreadsheets = async () => {
    setIsLoadingSpreadsheets(true);
    setErrorMsg('');
    try {
      const files = await fetchSpreadsheets(accessToken);
      setSpreadsheets(files);
      if (files.length > 0 && !config.spreadsheetId) {
        handleSpreadsheetChange(files[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load spreadsheets:', err);
      setErrorMsg('Không thể tải danh sách bảng tính. Vui lòng kiểm tra quyền truy cập.');
    } finally {
      setIsLoadingSpreadsheets(false);
    }
  };

  const handleSpreadsheetChange = async (id: string) => {
    if (!id) return;
    setErrorMsg('');
    setConfig(prev => ({ ...prev, spreadsheetId: id, sourceSheetName: '' }));
    setSheetsList([]);
    try {
      const details = await fetchSpreadsheetDetails(accessToken, id);
      const sheetNames = details.sheets.map(s => s.title);
      setSheetsList(sheetNames);
      
      // Auto select first sheet if none selected or not in list
      if (sheetNames.length > 0) {
        setConfig(prev => ({ 
          ...prev, 
          spreadsheetId: id,
          sourceSheetName: sheetNames[0] 
        }));
      }
    } catch (err: any) {
      console.error('Error fetching sheet details:', err);
      setErrorMsg('Không thể kết nối với Sheet đã chọn. Hãy chắc chắn ID hợp lệ.');
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    // Extract ID from Google Sheet URL
    // Format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...
    let sheetId = inputUrl.trim();
    const match = sheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      sheetId = match[1];
    }

    if (sheetId.length < 15) {
      setErrorMsg('Địa chỉ URL hoặc ID Google Sheet không hợp lệ.');
      return;
    }

    // Add to list if not already there
    if (!spreadsheets.some(s => s.id === sheetId)) {
      setSpreadsheets(prev => [{ id: sheetId, name: 'Google Sheet tự nhập' }, ...prev]);
    }
    handleSpreadsheetChange(sheetId);
    setInputUrl('');

    // Automatically generate dashboard when linking new URL
    setTimeout(() => {
      onRefreshDashboard();
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#10B5A5]" />
          <h2 className="text-lg font-display font-semibold text-slate-800">Cấu hình luồng Dashboard</h2>
        </div>
        <div className="flex items-center gap-2">
          {accessToken === 'demo-mode-token' ? (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="flex items-center gap-1.5 bg-[#10B5A5] hover:bg-[#0EA092] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              <LogIn className={`w-3.5 h-3.5 ${isLoggingIn ? 'animate-spin' : ''}`} />
              {isLoggingIn ? 'Đang kết nối...' : 'Đăng nhập Google'}
            </button>
          ) : (
            <button 
              onClick={loadRecentSpreadsheets}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 bg-slate-100/80 hover:bg-slate-200/80 px-2.5 py-1.5 rounded-lg transition-colors"
              disabled={isLoadingSpreadsheets}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSpreadsheets ? 'animate-spin' : ''}`} />
              Tải lại danh sách
            </button>
          )}
        </div>
      </div>



      {errorMsg && (
        <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs leading-relaxed">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {dashboardError && (
        <div className="flex items-start gap-3 p-4 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-amber-900 text-xs leading-relaxed shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-2.5 flex-1">
            <h4 className="font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
              <span>Thông báo nguồn dữ liệu Google Sheets</span>
            </h4>
            <div className="whitespace-pre-line text-slate-700 font-sans leading-relaxed">
              {dashboardError}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {onInsertSampleData && (
                <button
                  type="button"
                  onClick={onInsertSampleData}
                  disabled={isInsertingSample || isProcessing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isInsertingSample ? 'animate-spin' : ''}`} />
                  {isInsertingSample ? 'Đang thêm dữ liệu mẫu vào Sheet...' : 'Chèn 5 bài viết mẫu vào Sheet này & Tạo Dashboard'}
                </button>
              )}
              <button 
                onClick={() => setDashboardError(null)}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Đóng thông báo
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Connection Setup Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Database className="w-3.5 h-3.5 text-teal-600" />
            Nguồn dữ liệu Google Sheets
          </div>

          {/* Paste URL or ID */}
          <form onSubmit={handleUrlSubmit} className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">Nhập link hoặc ID Google Sheet:</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className="flex-1 polished-input focus:border-[#10B5A5]"
              />
              <button 
                type="submit"
                className="bg-slate-800 hover:bg-slate-900 text-white rounded px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all"
              >
                Liên kết
              </button>
            </div>
          </form>

          {/* Source Sheet Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
              Chọn Sheet (Tab) nguồn dữ liệu:
            </label>
            <select
              value={config.sourceSheetName}
              onChange={(e) => setConfig(prev => ({ ...prev, sourceSheetName: e.target.value }))}
              className="w-full polished-input focus:border-[#10B5A5]"
            >
              {(sheetsList.length > 0 ? sheetsList : [
                'Facebook: Post Insights',
                'Data VT',
                'Data entry',
                'JUN',
                'JUL',
                'inputrange',
                'note',
                'Social_Posts_2026',
                'DASHBOARD',
                'LOGS'
              ]).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <div className="pt-1">
              <input
                type="text"
                placeholder="Hoặc nhập tên tab thủ công..."
                value={config.sourceSheetName}
                onChange={(e) => setConfig(prev => ({ ...prev, sourceSheetName: e.target.value }))}
                className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:border-[#10B5A5]"
              />
            </div>
          </div>

        </div>

        {/* Filters and sorting card */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600" />
            Bộ lọc & Thứ tự sắp xếp
          </div>

          {/* Sorting */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1 uppercase tracking-wider">
                <ArrowUpDown className="w-3 h-3 text-slate-400" /> Sắp xếp theo:
              </label>
              <select
                value={config.sortBy}
                onChange={(e) => setConfig(prev => ({ ...prev, sortBy: e.target.value as any }))}
                className="w-full polished-input focus:border-[#10B5A5]"
              >
                <option value="interact">Interact (Tương tác)</option>
                <option value="reach">Reach (Lượt tiếp cận)</option>
                <option value="airedDate">Aired Date (Ngày đăng)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1 uppercase tracking-wider">
                <ArrowUpDown className="w-3 h-3 text-slate-400" /> Thứ tự:
              </label>
              <select
                value={config.sortOrder}
                onChange={(e) => setConfig(prev => ({ ...prev, sortOrder: e.target.value as any }))}
                className="w-full polished-input focus:border-[#10B5A5]"
              >
                <option value="desc">Giảm dần (Desc)</option>
                <option value="asc">Tăng dần (Asc)</option>
              </select>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
              Lấy dòng không Pillar:
            </label>
            <div className="flex items-center h-9">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={config.includeEmptyPillar} 
                  onChange={(e) => setConfig(prev => ({ ...prev, includeEmptyPillar: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10B5A5]"></div>
                <span className="ml-2 text-xs font-medium text-slate-600">
                  {config.includeEmptyPillar ? 'Có' : 'Không'}
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
      {/* Primary Actions bar */}
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 flex flex-wrap gap-3 items-center justify-between shadow-inner">
        <div className="flex items-center gap-2">
          <button 
            id="btn-refresh-dashboard"
            onClick={onRefreshDashboard}
            disabled={isProcessing || !config.spreadsheetId || !config.sourceSheetName}
            className="flex items-center gap-2 bg-[#10B5A5] hover:bg-[#0EA092] disabled:bg-teal-300 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
            {isProcessing ? 'Đang tạo Dashboard...' : 'Tạo/Làm mới Dashboard'}
          </button>
          
          <button 
            id="btn-clear-dashboard"
            onClick={onClearDashboard}
            className="flex items-center gap-1.5 bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Xóa Dashboard cũ
          </button>
        </div>
      </div>
    </div>
  );
};
