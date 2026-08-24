/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { googleSignIn } from '../firebase';
import { Database, FileSpreadsheet, Sparkles, ArrowRight, ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';

interface AuthOverlayProps {
  onAuthSuccess: (user: any, token: string) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
}

export const AuthOverlay: React.FC<AuthOverlayProps> = ({ onAuthSuccess, isLoading, setIsLoading }) => {
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLocalLoading(true);
    setError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        onAuthSuccess(result.user, result.accessToken);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message || err?.code || err?.toString() || 'Đã xảy ra lỗi khi kết nối.');
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 selection:bg-teal-100 selection:text-teal-900">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-100/50 p-8 flex flex-col items-center">
        {/* App Icon */}
        <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center border border-teal-100 shadow-sm mb-6">
          <FileSpreadsheet className="w-8 h-8 text-[#10B5A5]" />
        </div>

        {/* Title & Desc */}
        <h1 className="font-display text-2xl font-bold text-slate-800 text-center tracking-tight mb-2">
          Social Pillar Dashboard
        </h1>
        <p className="text-slate-500 text-sm text-center font-sans leading-relaxed mb-8 max-w-sm">
          Tự động đọc dữ liệu bài đăng social từ Google Sheet của bạn và tạo báo cáo Dashboard phân loại theo từng Pillar nội dung.
        </p>

        {/* Features/Value List */}
        <div className="w-full space-y-4 mb-8">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="p-1.5 bg-white rounded-lg border border-slate-200 text-[#10B5A5] shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-700">Đọc dữ liệu trực tiếp</h3>
              <p className="text-[11px] text-slate-500">Kết nối an toàn tới các bảng tính Google Sheets của bạn.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="p-1.5 bg-white rounded-lg border border-slate-200 text-[#10B5A5] shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-700">Tự động phân nhóm theo Pillar</h3>
              <p className="text-[11px] text-slate-500">Phân tách và tạo bảng riêng biệt cho BRANDING, PRODUCT, QR, ...</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="p-1.5 bg-white rounded-lg border border-slate-200 text-[#10B5A5] shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-700">Đồng bộ hai chiều</h3>
              <p className="text-[11px] text-slate-500">Xem trực tiếp trên ứng dụng hoặc ghi ngược lại các tab định dạng trong Sheet.</p>
            </div>
          </div>
        </div>

        {/* Error message / troubleshooting helper */}
        {error && (
          <div className="w-full mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-950 text-xs space-y-2.5 shadow-sm">
            <div className="flex items-center gap-2 font-bold text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Lỗi xác thực Google Auth</span>
            </div>
            
            {error.includes('popup-closed-by-user') ? (
              <div className="space-y-2 leading-relaxed text-slate-600">
                <p>
                  Môi trường thử nghiệm AI Studio chạy ứng dụng bên trong một thẻ <strong>Iframe bảo mật</strong>. Điều này khiến trình duyệt tự động chặn hoặc ngắt kết nối với cửa sổ đăng nhập Google (Popup).
                </p>
                <div className="bg-white p-3 rounded-xl border border-rose-200/60 space-y-1.5 shadow-sm">
                  <p className="font-bold text-slate-800 flex items-center gap-1">
                    👉 Cách khắc phục cực kỳ đơn giản:
                  </p>
                  <p className="text-slate-700 font-medium">
                    Nhấp vào nút <strong className="text-[#10B5A5]">"Mở trong tab mới"</strong> (hoặc biểu tượng mũi tên chéo <ExternalLink className="w-3.5 h-3.5 inline-block text-[#10B5A5]" /> ở góc trên bên phải khung xem trước của AI Studio) để mở hẳn ứng dụng ra ngoài. Đăng nhập tại tab mới sẽ thành công 100%!
                  </p>
                </div>
              </div>
            ) : error.includes('unauthorized-domain') ? (
              <div className="space-y-2 leading-relaxed text-slate-600">
                <p className="font-medium text-slate-700">
                  Domain/Địa chỉ web bạn đang mở chưa được thêm vào danh sách cho phép của Firebase Authentication.
                </p>
                <div className="bg-white p-3 rounded-xl border border-rose-200/60 space-y-2 shadow-sm">
                  <p className="font-bold text-slate-800">
                    👉 Cách khắc phục:
                  </p>
                  <div className="text-slate-700 space-y-1.5 text-[11px]">
                    <p>
                      <strong>Cách 1 (Nhanh nhất):</strong> Hãy mở ứng dụng bằng địa chỉ <code className="bg-slate-100 px-1 py-0.5 rounded text-teal-700 font-bold">http://localhost:3000</code> hoặc <code className="bg-slate-100 px-1 py-0.5 rounded text-teal-700 font-bold">http://127.0.0.1:3000</code> trên trình duyệt web của bạn.
                    </p>
                    <p>
                      <strong>Cách 2 (Thêm domain vào Firebase):</strong>
                    </p>
                    <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-600">
                      <li>Vào <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-teal-600 underline font-semibold">Firebase Console</a> chọn dự án của bạn.</li>
                      <li>Vào <strong>Authentication</strong> &rarr; tab <strong>Settings</strong> &rarr; <strong>Authorized domains</strong>.</li>
                      <li>Nhấp <strong>Add domain</strong> và thêm tên miền hiện tại của bạn.</li>
                    </ol>
                  </div>
                </div>
              </div>
            ) : (
              <p className="leading-relaxed text-slate-600">
                Chi tiết lỗi: {error}. <br />
                Mẹo: Bạn hãy thử nhấp nút <strong className="text-[#10B5A5]">"Mở trong tab mới"</strong> ở góc trên bên phải khung xem trước AI Studio để đăng nhập ổn định hơn nhé.
              </p>
            )}
          </div>
        )}

        {/* Sign In Button */}
        {localLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
            <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Đang kết nối tài khoản Google...</span>
          </div>
        ) : (
          <button 
            id="btn-google-signin"
            onClick={handleLogin}
            className="gsi-material-button w-full shadow-sm flex items-center justify-center transition-all hover:border-slate-400"
          >
            <div className="gsi-material-button-state"></div>
            <div className="gsi-material-button-content-wrapper">
              <div className="gsi-material-button-icon">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents">Kết nối với Google Sheets</span>
            </div>
          </button>
        )}
      </div>

      <div className="mt-8 text-[11px] text-slate-400 font-mono">
        Bảo mật thông tin • Chỉ đọc bảng tính được cấp quyền
      </div>
    </div>
  );
};
