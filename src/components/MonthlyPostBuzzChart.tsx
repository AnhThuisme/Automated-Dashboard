/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
import { Target } from 'lucide-react';
import { PostItem, KpiConfig } from '../types';

export interface MonthlyPostBuzzChartProps {
  posts: PostItem[];
  kpiConfig?: KpiConfig;
  isAdmin?: boolean;
  onNavigateToConfig?: () => void;
}

const KPI_STORAGE_KEY = 'social_pillar_kpi_config_v1';

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('vi-VN').format(Math.round(num || 0));
};

export const MonthlyPostBuzzChart: React.FC<MonthlyPostBuzzChartProps> = ({
  posts,
  kpiConfig,
  isAdmin = false,
  onNavigateToConfig,
}) => {
  // Aggregate data by month
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; sortKey: string; year: string; monthNum: number; postCount: number; totalBuzz: number }>();

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
      const monthNum = parseInt(month, 10);
      const label = `Tháng ${monthNum}/${year}`;

      if (!map.has(key)) {
        map.set(key, { month: label, sortKey: key, year, monthNum, postCount: 0, totalBuzz: 0 });
      }

      const entry = map.get(key)!;
      entry.postCount += 1;
      entry.totalBuzz += (post.buzz ?? post.interact) || 0;
    });

    return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [posts]);

  // Fallback to local storage if prop is not passed
  const [localKpi, setLocalKpi] = useState<KpiConfig>(() => {
    try {
      const saved = localStorage.getItem(KPI_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return {
      mode: 'year',
      selectedYear: new Date().getFullYear().toString(),
      yearlyKpi: 0,
      monthlyKpis: {},
    };
  });

  // Sync with localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = localStorage.getItem(KPI_STORAGE_KEY);
        if (saved) {
          setLocalKpi(JSON.parse(saved));
        }
      } catch {}
    };

    window.addEventListener('storage', handleStorageChange);
    handleStorageChange();
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const activeKpi = kpiConfig || localKpi;

  // Calculate monthly KPI for a data row
  const getKpiForDataRow = (rowYear: string, rowMonthNum: number): number => {
    if (activeKpi.mode === 'year') {
      if (activeKpi.yearlyKpi > 0) {
        return Math.round(activeKpi.yearlyKpi / 12);
      }
      return 0;
    } else {
      const key = `${rowYear}-${rowMonthNum}`;
      return activeKpi.monthlyKpis[key] || activeKpi.monthlyKpis[rowMonthNum.toString()] || activeKpi.monthlyKpis[`${activeKpi.selectedYear}-${rowMonthNum}`] || 0;
    }
  };

  // Build chart dataset with KPI target line included
  const chartData = useMemo(() => {
    return monthlyData.map((item) => {
      const kpi = getKpiForDataRow(item.year, item.monthNum);
      return {
        ...item,
        kpiBuzz: kpi > 0 ? kpi : undefined,
      };
    });
  }, [monthlyData, activeKpi]);

  // Has at least one valid KPI configured
  const hasKpi = useMemo(() => {
    return chartData.some((d) => d.kpiBuzz && d.kpiBuzz > 0);
  }, [chartData]);

  // Overall KPI achievement stats
  const stats = useMemo(() => {
    const totalActualBuzz = monthlyData.reduce((acc, curr) => acc + curr.totalBuzz, 0);

    let totalTargetKpi = 0;
    if (activeKpi.mode === 'year') {
      totalTargetKpi = activeKpi.yearlyKpi;
    } else {
      for (let m = 1; m <= 12; m++) {
        totalTargetKpi += activeKpi.monthlyKpis[m.toString()] || activeKpi.monthlyKpis[`${activeKpi.selectedYear}-${m}`] || 0;
      }
    }

    const completionRate = totalTargetKpi > 0 ? (totalActualBuzz / totalTargetKpi) * 100 : 0;

    return {
      totalActualBuzz,
      totalTargetKpi,
      completionRate,
      diff: totalActualBuzz - totalTargetKpi,
    };
  }, [monthlyData, activeKpi]);

  if (monthlyData.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-5">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
        <div>
          <h3 className="font-display font-bold text-slate-800 text-sm flex items-center gap-2 uppercase tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4285F4]"></span>
            Biểu đồ Số lượng Post & Tổng Buzz theo tháng
          </h3>
          <p className="text-[10px] text-slate-400 font-mono italic mt-1">
            Thanh cột: Số lượng bài đăng • Đường đỏ: Tổng Buzz (Comment + Share)
            {hasKpi && <span className="text-[#10B5A5] font-semibold"> • Đường nét đứt xanh ngọc: KPI Mục tiêu</span>}
          </p>
        </div>

        {hasKpi && (
          <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-100 text-[#10B5A5] px-2.5 py-1 rounded-lg text-xs font-semibold">
            <Target className="w-3.5 h-3.5" />
            <span>Mục tiêu: <strong>{formatNumber(stats.totalTargetKpi)}</strong> Buzz</span>
          </div>
        )}
      </div>

      {/* Chart Canvas */}
      <div style={{ width: '100%', height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
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
                value: 'Total Buzz (Comment + Share)',
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
              formatter={(value: any, name: string) => {
                if (value === undefined || value === null) return ['-', ''];
                const formatted = new Intl.NumberFormat('en-US').format(Number(value));
                if (name === 'postCount') return [formatted, 'Số bài Post'];
                if (name === 'totalBuzz') return [formatted, 'Tổng Buzz thực tế'];
                if (name === 'kpiBuzz') return [formatted, 'KPI Mục tiêu'];
                return [formatted, name];
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 8, fontSize: 12, fontWeight: 600 }}
              formatter={(value: string) => {
                if (value === 'postCount') return 'Số bài Post (Cột xanh)';
                if (value === 'totalBuzz') return 'Tổng Buzz (Đường đỏ)';
                if (value === 'kpiBuzz') return 'KPI Mục tiêu Buzz (Đường nét đứt)';
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
              name="postCount"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="totalBuzz"
              stroke="#EA4335"
              strokeWidth={2.5}
              dot={{ r: 5, fill: '#EA4335', stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 7, fill: '#EA4335', stroke: '#fff', strokeWidth: 2 }}
              name="totalBuzz"
            />
            {hasKpi && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="kpiBuzz"
                stroke="#10B5A5"
                strokeWidth={2.2}
                strokeDasharray="5 5"
                dot={{ r: 4, fill: '#10B5A5', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#10B5A5', stroke: '#fff', strokeWidth: 2 }}
                name="kpiBuzz"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
