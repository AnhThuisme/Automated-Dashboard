/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LogEntry } from '../types';
import { History, CheckCircle2, XCircle, Trash2, AlertCircle } from 'lucide-react';

interface LogsTabProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const LogsTab: React.FC<LogsTabProps> = ({ logs, onClearLogs }) => {
  return (
    <div className="space-y-6">
      {/* Header and delete logs */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-[#10B5A5]" />
          <h2 className="text-lg font-display font-semibold text-slate-800">Nhật ký hoạt động (LOGS)</h2>
        </div>
        
        {logs.length > 0 && (
          <button 
            onClick={onClearLogs}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 bg-slate-100/80 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Xóa nhật ký
          </button>
        )}
      </div>

      {/* Logs Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-100">
                <th className="px-5 py-3 w-[180px]">Thời gian</th>
                <th className="px-5 py-3 w-[180px]">Hành động</th>
                <th className="px-5 py-3 w-[120px]">Trạng thái</th>
                <th className="px-5 py-3">Chi tiết thông điệp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {logs.map((log, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3.5 text-slate-500 font-mono">
                    {log.time}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-700">
                    {log.action}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      log.status === 'Success' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                        : log.status === 'Warning'
                        ? 'bg-amber-50 text-amber-700 border border-amber-100'
                        : 'bg-rose-50 text-rose-700 border border-rose-100'
                    }`}>
                      {log.status === 'Success' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Thành công
                        </>
                      ) : log.status === 'Warning' ? (
                        <>
                          <AlertCircle className="w-3 h-3" /> Chú ý
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" /> Lỗi
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 leading-relaxed max-w-md break-words font-sans">
                    {log.message}
                  </td>
                </tr>
              ))}

              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400 font-medium">
                    Chưa có hoạt động nào được ghi lại.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
