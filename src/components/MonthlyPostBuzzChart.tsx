/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PostItem } from '../types';

interface MonthlyPostBuzzChartProps {
  posts: PostItem[];
}

/**
 * Aggregates posts by month and renders a combo chart:
 * - Blue bars = number of posts per month (left Y-axis)
 * - Red line = total buzz (interact) per month (right Y-axis)
 */
export const MonthlyPostBuzzChart: React.FC<MonthlyPostBuzzChartProps> = ({ posts }) => {
  // Aggregate data by month
  const monthlyData = React.useMemo(() => {
    const map = new Map<string, { month: string; sortKey: string; postCount: number; totalBuzz: number }>();

    posts.forEach((post) => {
      if (!post.airedDate) return;
      const trimmed = post.airedDate.trim();

      let year = '';
      let month = '';

      // ISO: YYYY-MM-DD
      const matchYmd = trimmed.match(/^(\d{4})[-/](\d{2})/);
      if (matchYmd) {
        year = matchYmd[1];
        month = matchYmd[2];
      } else {
        // DD/MM/YYYY
        const matchDmy = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
        if (matchDmy) {
          year = matchDmy[3];
          month = matchDmy[2];
        }
      }

      if (!year || !month) return;

      const key = `${year}-${month}`;
      const label = `Tháng ${parseInt(month, 10)}/${year}`;

      if (!map.has(key)) {
        map.set(key, { month: label, sortKey: key, postCount: 0, totalBuzz: 0 });
      }

      const entry = map.get(key)!;
      entry.postCount += 1;
      entry.totalBuzz += post.interact || 0;
    });

    return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [posts]);

  if (monthlyData.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="font-display font-bold text-slate-800 text-sm flex items-center gap-2 uppercase tracking-wide">
          <span className="w-2.5 h-2.5 rounded-full bg-[#4285F4]"></span>
          Biểu đồ Số lượng Post & Tổng Buzz theo tháng
        </h3>
        <p className="text-[10px] text-slate-400 font-mono italic mt-1">
          Thanh cột: Số lượng bài đăng • Đường đỏ: Tổng tương tác (Comment + Share + React)
        </p>
      </div>

      <div style={{ width: '100%', height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={monthlyData}
            margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              angle={-30}
              textAnchor="end"
              height={60}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: '#4285F4', fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: '#4285F4', strokeWidth: 1.5 }}
              label={{
                value: 'Số bài Post',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: '#4285F4', fontWeight: 700 },
                offset: 0,
              }}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: '#EA4335', fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: '#EA4335', strokeWidth: 1.5 }}
              label={{
                value: 'Total Buzz (Tương tác)',
                angle: 90,
                position: 'insideRight',
                style: { fontSize: 11, fill: '#EA4335', fontWeight: 700 },
                offset: 0,
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                padding: '10px 14px',
                fontSize: 12,
              }}
              labelStyle={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}
              formatter={(value: number, name: string) => {
                const formatted = new Intl.NumberFormat('en-US').format(value);
                const label = name === 'postCount' ? 'Số bài Post' : 'Total Buzz';
                return [formatted, label];
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 8, fontSize: 12, fontWeight: 600 }}
              formatter={(value: string) => {
                if (value === 'postCount') return 'Post';
                if (value === 'totalBuzz') return 'Total buzz (Comment + Share)';
                return value;
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="postCount"
              fill="#4285F4"
              radius={[4, 4, 0, 0]}
              barSize={Math.max(20, Math.min(48, 400 / monthlyData.length))}
              opacity={0.85}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="totalBuzz"
              stroke="#EA4335"
              strokeWidth={2.5}
              dot={{ r: 5, fill: '#EA4335', stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 7, fill: '#EA4335', stroke: '#fff', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
