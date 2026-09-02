/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AuthOverlay } from './components/AuthOverlay';
import { ConfigTab } from './components/ConfigTab';
import { DashboardTab } from './components/DashboardTab';
import { LogsTab } from './components/LogsTab';
import { initAuth, googleSignOut } from './firebase';
import { fetchSheetData, writeDashboardToGoogleSheet, insertSampleDataToSheet } from './googleSheets';
import { classifyByRules, classifyWithAI } from './utils';
import { ConfigSettings, PillarGroup, LogEntry, PostItem } from './types';
import { 
  FileSpreadsheet, 
  Settings, 
  History, 
  LogOut, 
  Sparkles, 
  ChevronRight,
  Database,
  User as UserIcon,
  HelpCircle,
  ShieldCheck,
  Check,
  ChevronDown,
  UserCheck,
  Crown,
  Key
} from 'lucide-react';

export default function App() {
  const [userRole, setUserRole] = useState<'ADMIN' | 'DEMO' | 'GOOGLE'>(() => {
    return (localStorage.getItem('app_user_role') as any) || 'DEMO';
  });
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  const [accessToken, setAccessToken] = useState<string | null>('demo-mode-token');
  const [user, setUser] = useState<any | null>(() => {
    const savedRole = localStorage.getItem('app_user_role');
    if (savedRole === 'ADMIN') {
      return { displayName: 'Quản trị viên (Admin)', email: 'admin@socialpillar.vn', role: 'ADMIN' };
    }
    return { displayName: 'Khách (Demo Mode)', email: 'demo@app.local', role: 'DEMO' };
  });

  const handleSwitchRole = (role: 'ADMIN' | 'DEMO') => {
    setUserRole(role);
    localStorage.setItem('app_user_role', role);
    if (role === 'ADMIN') {
      setUser({
        displayName: 'Quản trị viên (Admin)',
        email: 'admin@socialpillar.vn',
        role: 'ADMIN'
      });
      setAccessToken('admin-mode-token');
      addLog('XÁC THỰC', 'Success', 'Đã chuyển sang phân quyền Quản trị viên (Admin).');
    } else {
      setUser({
        displayName: 'Khách (Demo Mode)',
        email: 'demo@app.local',
        role: 'DEMO'
      });
      setAccessToken('demo-mode-token');
      setActiveTab('dashboard');
      addLog('XÁC THỰC', 'Success', 'Đã chuyển sang phân quyền Khách (Demo Mode).');
    }
    setShowRoleMenu(false);
  };
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Active navigation tab (Default to 'dashboard' for Khách, 'config' for Admin)
  const [activeTab, setActiveTab] = useState<'config' | 'dashboard' | 'logs'>(() => {
    const savedRole = localStorage.getItem('app_user_role');
    return savedRole === 'ADMIN' ? 'config' : 'dashboard';
  });

  // Available sheets list inside selected Spreadsheet
  const [sheetsList, setSheetsList] = useState<string[]>([
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
  ]);

  // Config settings
  const [config, setConfig] = useState<ConfigSettings>({
    spreadsheetId: 'demo-sheet-2026',
    sourceSheetName: 'Facebook: Post Insights',
    startDate: '',
    endDate: '',
    sortBy: 'interact',
    sortOrder: 'desc',
    maxPostsPerPillar: 10000,
    unlimitedPosts: true,
    includeEmptyPillar: false,
    classifyMode: 'sheet',
    productKeywords: 'KHUNG VĨNH TƯỜNG TITAN, TẤM SIÊU CHỐNG MỐC, TRẦN VĨNH TƯỜNG SIÊU BẢO VỆ, NGỌC LỤC BẢO, SIÊU CHỐNG CHÁY, VĨNH TƯỜNG, TẤM THẠCH CAO',
    promotionKeywords: 'Phi mã vượt đỉnh, Chiến thần siêu bảo vệ',
    minigameKeywords: 'Minigame, mini game',
  });

  // Generated Dashboard groups
  const [groups, setGroups] = useState<PillarGroup[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isInsertingSample, setIsInsertingSample] = useState<boolean>(false);

  // Logs list (loaded from localStorage or empty)
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const stored = localStorage.getItem('social_pillar_logs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Save logs to local storage when changed
  useEffect(() => {
    try {
      localStorage.setItem('social_pillar_logs', JSON.stringify(logs));
    } catch (e) {
      console.error('Failed to save logs:', e);
    }
  }, [logs]);

  // Load cache of groups and config if available
  useEffect(() => {
    try {
      const cachedGroups = localStorage.getItem('social_pillar_groups');
      const cachedConfig = localStorage.getItem('social_pillar_config');
      const cachedLastUpdate = localStorage.getItem('social_pillar_last_update');
      
      if (cachedGroups) {
        const parsedGroups: PillarGroup[] = JSON.parse(cachedGroups);
        const subPillars = ['ÁNH KIM', 'KHUNG TITAN', 'TẤM EUROTONE', 'TẤM SIÊU BẢO VỆ', 'TẤM SIÊU CHỐNG MỐC', 'TẤM SIÊU CHỐNG ẨM', 'SIÊU CHỐNG CHÁY', 'KHÁC'];
        
        // Collapse legacy sub-pillars into PRODUCT
        const normalizedGroupsMap = new Map<string, PostItem[]>();
        parsedGroups.forEach(g => {
          let targetPillar = (g.pillar || '').trim().toUpperCase();
          if (subPillars.includes(targetPillar)) {
            targetPillar = 'PRODUCT';
          }
          if (!normalizedGroupsMap.has(targetPillar)) {
            normalizedGroupsMap.set(targetPillar, []);
          }
          if (Array.isArray(g.posts)) {
            g.posts.forEach(p => {
              normalizedGroupsMap.get(targetPillar)!.push({
                ...p,
                pillar: targetPillar
              });
            });
          }
        });

        const collapsedGroups: PillarGroup[] = [];
        normalizedGroupsMap.forEach((posts, pillar) => {
          collapsedGroups.push({
            pillar,
            posts
          });
        });
        collapsedGroups.sort((a, b) => a.pillar.localeCompare(b.pillar));
        setGroups(collapsedGroups);
      }
      if (cachedConfig) setConfig(JSON.parse(cachedConfig));
      if (cachedLastUpdate) setLastUpdated(cachedLastUpdate);
    } catch (e) {
      console.error('Failed to load cached dashboard data:', e);
    }
  }, []);

  // Save cache of groups and config when changed
  useEffect(() => {
    if (groups.length > 0) {
      try {
        localStorage.setItem('social_pillar_groups', JSON.stringify(groups));
        localStorage.setItem('social_pillar_config', JSON.stringify(config));
        localStorage.setItem('social_pillar_last_update', lastUpdated);
      } catch (e) {
        console.error('Failed to cache dashboard:', e);
      }
    }
  }, [groups, config, lastUpdated]);

  // Initialize auth listener (optional Google Login)
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setNeedsAuth(false);
        setIsLoadingAuth(false);
      },
      () => {
        // Fallback to Demo / Local mode if no Google session
        setUser({ displayName: 'Khách (Demo Mode)', email: 'demo@app.local' });
        setAccessToken('demo-mode-token');
        setNeedsAuth(false);
        setIsLoadingAuth(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Auto-generate initial dashboard on first visit
  useEffect(() => {
    if (groups.length === 0) {
      handleRefreshDashboard();
    }
  }, []);

  const handleAuthSuccess = (googleUser: any, token: string) => {
    setUser(googleUser);
    setAccessToken(token);
    setNeedsAuth(false);
    addLog('Kết nối Google', 'Success', `Xác thực thành công cho tài khoản ${googleUser.email}`);
  };

  const handleSignOut = async () => {
    const confirmLogout = window.confirm('Bạn có muốn về lại Chế độ Demo (Chưa đăng nhập Google) không?');
    if (!confirmLogout) return;

    try {
      await googleSignOut();
      setUser({ displayName: 'Khách (Demo Mode)', email: 'demo@app.local' });
      setAccessToken('demo-mode-token');
      setNeedsAuth(false);
      addLog('Đăng xuất Google', 'Success', 'Đã chuyển về Chế độ Demo.');
    } catch (err: any) {
      console.error('Sign out failed:', err);
    }
  };

  // Helper to add log entries
  const addLog = (action: string, status: 'Success' | 'Error' | 'Warning', message: string) => {
    const now = new Date();
    const formattedTime = now.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const entry: LogEntry = {
      time: formattedTime,
      action,
      status,
      message,
    };
    setLogs(prev => [entry, ...prev]);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  // Clear Dashboard function
  const handleClearDashboard = () => {
    const confirmed = window.confirm('Bạn có chắc chắn muốn xóa Dashboard hiện tại? Tất cả cấu hình lọc và danh sách nhóm sẽ được làm sạch.');
    if (!confirmed) return;

    setGroups([]);
    setLastUpdated('');
    localStorage.removeItem('social_pillar_groups');
    localStorage.removeItem('social_pillar_last_update');
    addLog('Xóa Dashboard', 'Success', 'Đã làm sạch dữ liệu Dashboard hiển thị.');
    setActiveTab('config');
  };

  // Insert sample data into Google Sheet
  const handleInsertSampleData = async () => {
    if (!accessToken || !config.spreadsheetId || !config.sourceSheetName) return;
    setIsInsertingSample(true);
    try {
      addLog('Chèn dữ liệu mẫu', 'Success', `Đang ghi 5 bài viết mẫu vào Sheet "${config.sourceSheetName}"...`);
      const count = await insertSampleDataToSheet(accessToken, config.spreadsheetId, config.sourceSheetName);
      addLog('Chèn dữ liệu mẫu', 'Success', `Đã chèn thành công ${count} dòng bài viết mẫu.`);
      setDashboardError(null);
      await handleRefreshDashboard();
    } catch (err: any) {
      console.warn('Lỗi khi chèn dữ liệu mẫu:', err);
      addLog('Chèn dữ liệu mẫu', 'Error', err.message || 'Không thể ghi dữ liệu vào Sheet.');
      setDashboardError(err.message || 'Không thể ghi dữ liệu vào Sheet.');
    } finally {
      setIsInsertingSample(false);
    }
  };

  // Refresh Dashboard - reads sheet data, processes, and displays
  const handleRefreshDashboard = async () => {
    if (!accessToken) return;
    setDashboardError(null);
    if (!config.spreadsheetId || !config.sourceSheetName) {
      setDashboardError('Vui lòng hoàn thành cấu hình nguồn dữ liệu trước.');
      return;
    }

    setIsProcessing(true);
    try {
      addLog('Tải dữ liệu', 'Success', `Bắt đầu nạp bài đăng từ Sheet: "${config.sourceSheetName}"`);
      
      const sheetResult = await fetchSheetData(accessToken, config.spreadsheetId, config.sourceSheetName);
      const rawPosts = sheetResult.posts;
      
      const m = sheetResult.mappings;
      const h = sheetResult.headers;
      const colName = (idx: number) => idx !== -1 && h[idx] ? `"${h[idx]}" (Cột #${idx + 1})` : 'Không tìm thấy (N/A)';
      
      addLog('Ánh xạ cột', 'Success', `Ánh xạ cột thành công:\n` +
        `• Ngày đăng: ${colName(m.createdTimeIdx)}\n` +
        `• Nội dung: ${colName(m.contentIdx)}\n` +
        `• Lượt tiếp cận: ${colName(m.reachIdx)}\n` +
        `• Tương tác: ${colName(m.interactIdx)}\n` +
        `• Nhóm Pillar: ${colName(m.pillarIdx)}\n` +
        `• URL Bài viết: ${colName(m.linkIdx)}`
      );

      if (rawPosts.length === 0) {
        const colNames = sheetResult.headers || [];
        const headerRow = (sheetResult.headerRowIdx !== undefined ? sheetResult.headerRowIdx : 0) + 1;
        const msg = `Bảng tính "${config.sourceSheetName}" đã nhận diện đúng ${colNames.length} cột tiêu đề (Dòng #${headerRow}).\n\n` +
          `• Hiện tại bảng tính chưa có hàng dữ liệu bài viết nào bên dưới (Dòng #${headerRow + 1} đang trống).\n\n` +
          `👉 Bạn hãy dán hoặc nhập các dòng bài viết vào Google Sheet (từ dòng #${headerRow + 1} trở đi) rồi bấm "Tạo / Cập nhật Dashboard"! Hoặc bấm nút bên dưới để chèn 5 bài viết mẫu thử nghiệm ngay.`;
        
        addLog('Tải dữ liệu', 'Warning', msg);
        setDashboardError(msg);
        setIsProcessing(false);
        return;
      }

      if (sheetResult.rawSampleRows && sheetResult.rawSampleRows.length > 0) {
        const rawRowsStr = sheetResult.rawSampleRows
          .slice(0, 5)
          .map((row, rIdx) => `Dòng #${rIdx + 1}: ${JSON.stringify(row)}`)
          .join('\n');
        addLog('Chẩn đoán dữ liệu nguồn', 'Success', `Xem 5 dòng dữ liệu thô đầu tiên từ Sheet:\n${rawRowsStr}`);
      }
      
      // Auto-classify Posts based on selected Mode
      let processedRawPosts = rawPosts.map((p, idx) => ({
        ...p,
        id: `post-${idx}`, // temporary internal id
      }));

      const mode = config.classifyMode || 'sheet';
      
      if (mode === 'rules') {
        addLog('Tự động phân loại', 'Success', 'Đang phân loại bài viết bằng bộ từ khóa quy tắc...');
        processedRawPosts = processedRawPosts.map(p => {
          const res = classifyByRules(p.post, config);
          return {
            ...p,
            pillar: res.pillar,
          };
        });
      } else if (mode === 'ai') {
        addLog('Tự động phân loại', 'Success', 'Đang phân loại bài viết bằng trí tuệ nhân tạo Gemini...');
        const payload = processedRawPosts.map(p => ({ id: p.id, post: p.post }));
        try {
          const aiResults = await classifyWithAI(payload);
          processedRawPosts = processedRawPosts.map(p => {
            const aiRes = aiResults.get(p.id);
            return {
              ...p,
              pillar: aiRes ? aiRes.pillar : 'BRANDING',
            };
          });
          addLog('Tự động phân loại', 'Success', `AI Gemini đã phân loại thành công ${processedRawPosts.length} bài đăng.`);
        } catch (aiErr: any) {
          console.error('AI classification failed:', aiErr);
          addLog('Tự động phân loại', 'Error', `AI phân loại thất bại: ${aiErr.message || 'Lỗi kết nối'}. Chuyển sang Phân loại bằng Từ khóa.`);
          processedRawPosts = processedRawPosts.map(p => {
            const res = classifyByRules(p.post, config);
            return {
              ...p,
              pillar: res.pillar,
            };
          });
        }
      } else if (mode === 'hybrid') {
        addLog('Tự động phân loại', 'Success', 'Chế độ Kết hợp: Lọc phân loại từ khóa trước...');
        const ruleClassified = processedRawPosts.map(p => {
          const res = classifyByRules(p.post, config);
          return {
            ...p,
            pillar: res.pillar,
          };
        });

        const brandingPosts = ruleClassified.filter(p => p.pillar === 'BRANDING');
        if (brandingPosts.length > 0) {
          addLog('Tự động phân loại', 'Success', `Tìm thấy ${brandingPosts.length} bài viết cần AI phân loại chuyên sâu...`);
          const payload = brandingPosts.map(p => ({ id: p.id, post: p.post }));
          try {
            const aiResults = await classifyWithAI(payload);
            processedRawPosts = ruleClassified.map(p => {
              if (p.pillar === 'BRANDING') {
                const aiRes = aiResults.get(p.id);
                return {
                  ...p,
                  pillar: aiRes ? aiRes.pillar : 'BRANDING',
                };
              }
              return p;
            });
            addLog('Tự động phân loại', 'Success', `AI Gemini đã phân loại thành công ${brandingPosts.length} bài viết BRANDING.`);
          } catch (aiErr: any) {
            console.error('AI Hybrid classification failed:', aiErr);
            addLog('Tự động phân loại', 'Error', `AI phân loại chuyên sâu thất bại: ${aiErr.message || 'Lỗi kết nối'}. Giữ nguyên kết quả Từ khóa.`);
            processedRawPosts = ruleClassified;
          }
        } else {
          processedRawPosts = ruleClassified;
        }
      } else {
        // 'sheet' mode: Use what is in the sheet, or auto-classify if sheet has no Pillar column
        processedRawPosts = processedRawPosts.map(p => {
          const rawPillar = (p.pillar || '').trim().toUpperCase();
          if (!rawPillar) {
            const res = classifyByRules(p.post, config);
            return {
              ...p,
              pillar: res.pillar,
              productPillar: p.productPillar || res.productPillar,
            };
          }
          return {
            ...p,
            pillar: rawPillar,
          };
        });
      }

      // Always ensure PRODUCT pillar posts have productPillar extracted if missing
      processedRawPosts = processedRawPosts.map(p => {
        if (p.pillar === 'PRODUCT' && !p.productPillar) {
          const res = classifyByRules(p.post, config);
          return {
            ...p,
            productPillar: res.productPillar || 'KHÁC',
          };
        }
        return p;
      });

      // Ensure each post has a valid pillar
      const subPillars = ['ÁNH KIM', 'KHUNG TITAN', 'TẤM EUROTONE', 'TẤM SIÊU BẢO VỆ', 'TẤM SIÊU CHỐNG MỐC', 'TẤM SIÊU CHỐNG ẨM', 'SIÊU CHỐNG CHÁY', 'KHÁC'];
      processedRawPosts = processedRawPosts.map(p => {
        let pillar = (p.pillar || '').trim().toUpperCase() || 'CHƯA PHÂN LOẠI';
        let productPillar = p.productPillar || '';
        if (subPillars.includes(pillar)) {
          productPillar = pillar;
          pillar = 'PRODUCT';
        }
        return {
          ...p,
          pillar,
          productPillar: productPillar || undefined,
        };
      });

      // Process & Filter Posts
      let filteredPosts = [...processedRawPosts];

      // Smart Fallback: If includeEmptyPillar is false but ALL loaded rows have empty/missing pillars,
      // we auto-toggle includeEmptyPillar to true to prevent an empty dashboard, and log a friendly warning.
      const hasAnyPillar = processedRawPosts.some(p => p.pillar && p.pillar.trim() !== '');
      let shouldFilterEmptyPillars = !config.includeEmptyPillar;

      if (shouldFilterEmptyPillars && !hasAnyPillar) {
        shouldFilterEmptyPillars = false;
        addLog('Tạo Dashboard', 'Success', 'Bảng tính không có cột hoặc giá trị Pillar. Tự động hiển thị nhóm "CHƯA PHÂN LOẠI".');
      }

      // 1. Filter empty pillars if necessary
      if (shouldFilterEmptyPillars) {
        filteredPosts = filteredPosts.filter(p => p.pillar && p.pillar.trim() !== '');
      }

      if (filteredPosts.length === 0) {
        const totalRaw = rawPosts.length;
        const withPillarCount = rawPosts.filter(p => p.pillar && p.pillar.trim() !== '').length;
        
        let errorMsg = `Không tìm thấy dữ liệu phù hợp với bộ lọc.\n`;
        errorMsg += `• Tổng số dòng tải được từ Sheet: ${totalRaw} dòng.\n`;
        errorMsg += `• Số dòng có chứa phân loại Pillar: ${withPillarCount} dòng (Thiết lập "Lọc trống": ${config.includeEmptyPillar ? 'Đang lấy' : 'Đang bỏ qua'}).\n`;
        
        errorMsg += `\nGợi ý: Hãy thử bật "Lấy dòng không Pillar" để xem tất cả bài viết.`;
        throw new Error(errorMsg);
      }

      // Group posts by Pillar
      const pillarMap = new Map<string, PostItem[]>();
      
      filteredPosts.forEach(post => {
        const key = post.pillar || 'CHƯA PHÂN LOẠI';
        if (!pillarMap.has(key)) {
          pillarMap.set(key, []);
        }
        pillarMap.get(key)!.push(post);
      });

      const processedGroups: PillarGroup[] = [];

      pillarMap.forEach((postsList, pillar) => {
        // Sort posts inside each pillar
        postsList.sort((a, b) => {
          let valA: any = a[config.sortBy];
          let valB: any = b[config.sortBy];

          if (config.sortBy === 'airedDate') {
            valA = a.airedDate ? new Date(a.airedDate).getTime() : 0;
            valB = b.airedDate ? new Date(b.airedDate).getTime() : 0;
          }

          if (config.sortOrder === 'desc') {
            return valB > valA ? 1 : valB < valA ? -1 : 0;
          } else {
            return valA > valB ? 1 : valA < valB ? -1 : 0;
          }
        });

        // Include 100% of posts without capping
        const limitedPosts = postsList;

        processedGroups.push({
          pillar,
          posts: limitedPosts,
        });
      });

      // Sort pillars themselves alphabetically to have a clean structure
      processedGroups.sort((a, b) => a.pillar.localeCompare(b.pillar));

      // Update state
      setGroups(processedGroups);
      
      const now = new Date();
      const timestamp = now.toLocaleString('vi-VN');
      setLastUpdated(timestamp);

      addLog('Tạo Dashboard', 'Success', `Đã tạo thành công ${processedGroups.length} bảng Pillar với tổng cộng ${filteredPosts.length} bài đăng.`);
      setActiveTab('dashboard');
    } catch (err: any) {
      console.warn('Refresh dashboard notice:', err?.message || err);
      addLog('Tạo Dashboard', 'Error', err.message || 'Lỗi không xác định khi nạp dữ liệu.');
      setDashboardError(err.message || 'Lỗi không xác định khi nạp dữ liệu.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual correction of a post's Content Pillar
  const handleUpdatePostPillar = (postToUpdate: PostItem, newPillar: string) => {
    const normalizedNewPillar = newPillar.trim().toUpperCase() || 'CHƯA PHÂN LOẠI';
    
    // Extract all posts across current groups
    const allPosts: PostItem[] = [];
    groups.forEach(g => {
      g.posts.forEach(p => {
        if (p.post === postToUpdate.post && p.airedDate === postToUpdate.airedDate) {
          allPosts.push({
            ...p,
            pillar: normalizedNewPillar,
          });
        } else {
          allPosts.push(p);
        }
      });
    });

    // Group them back by pillar
    const pillarMap = new Map<string, PostItem[]>();
    allPosts.forEach(post => {
      const key = post.pillar || 'CHƯA PHÂN LOẠI';
      if (!pillarMap.has(key)) {
        pillarMap.set(key, []);
      }
      pillarMap.get(key)!.push(post);
    });

    const processedGroups: PillarGroup[] = [];
    pillarMap.forEach((postsList, pillar) => {
      // Sort posts inside each pillar
      postsList.sort((a, b) => {
        let valA: any = a[config.sortBy];
        let valB: any = b[config.sortBy];

        if (config.sortBy === 'airedDate') {
          valA = a.airedDate ? new Date(a.airedDate).getTime() : 0;
          valB = b.airedDate ? new Date(b.airedDate).getTime() : 0;
        }

        if (config.sortOrder === 'desc') {
          return valB > valA ? 1 : valB < valA ? -1 : 0;
        } else {
          return valA > valB ? 1 : valA < valB ? -1 : 0;
        }
      });

      processedGroups.push({
        pillar,
        posts: postsList,
      });
    });

    processedGroups.sort((a, b) => a.pillar.localeCompare(b.pillar));
    setGroups(processedGroups);
    
    // Persist updated groups to localStorage
    localStorage.setItem('social_pillar_groups', JSON.stringify(processedGroups));
    
    addLog('Chỉnh sửa Pillar', 'Success', `Đã chuyển bài đăng sang nhóm "${normalizedNewPillar}" thủ công.`);
  };

  // Manual correction of a post's Product Sub-Pillar
  const handleUpdatePostProductPillar = (postToUpdate: PostItem, newProductPillar: string) => {
    const normalizedNewProductPillar = newProductPillar.trim().toUpperCase() || 'KHÁC';
    
    // Extract all posts across current groups
    const allPosts: PostItem[] = [];
    groups.forEach(g => {
      g.posts.forEach(p => {
        if (p.post === postToUpdate.post && p.airedDate === postToUpdate.airedDate) {
          allPosts.push({
            ...p,
            productPillar: normalizedNewProductPillar,
          });
        } else {
          allPosts.push(p);
        }
      });
    });

    // Group them back by pillar
    const pillarMap = new Map<string, PostItem[]>();
    allPosts.forEach(post => {
      const key = post.pillar || 'CHƯA PHÂN LOẠI';
      if (!pillarMap.has(key)) {
        pillarMap.set(key, []);
      }
      pillarMap.get(key)!.push(post);
    });

    const processedGroups: PillarGroup[] = [];
    pillarMap.forEach((postsList, pillar) => {
      // Sort posts inside each pillar
      postsList.sort((a, b) => {
        let valA: any = a[config.sortBy];
        let valB: any = b[config.sortBy];

        if (config.sortBy === 'airedDate') {
          valA = a.airedDate ? new Date(a.airedDate).getTime() : 0;
          valB = b.airedDate ? new Date(b.airedDate).getTime() : 0;
        }

        if (config.sortOrder === 'desc') {
          return valB > valA ? 1 : valB < valA ? -1 : 0;
        } else {
          return valA > valB ? 1 : valA < valB ? -1 : 0;
        }
      });

      processedGroups.push({
        pillar,
        posts: postsList,
      });
    });

    processedGroups.sort((a, b) => a.pillar.localeCompare(b.pillar));
    setGroups(processedGroups);
    
    // Persist updated groups to localStorage
    localStorage.setItem('social_pillar_groups', JSON.stringify(processedGroups));
    
    addLog('Chỉnh sửa Sub-Pillar', 'Success', `Đã chuyển dòng sản phẩm sang nhóm "${normalizedNewProductPillar}" thủ công.`);
  };

  // Sync back to Google Sheets
  const handleSyncToSheets = async () => {
    if (!accessToken) return;
    if (groups.length === 0) {
      alert('Không có dữ liệu Dashboard để đồng bộ. Vui lòng nhấn "Tạo/Làm mới Dashboard" trước.');
      return;
    }

    const confirmed = window.confirm(
      'XÁC NHẬN ĐỒNG BỘ:\n\nHành động này sẽ tạo mới hoặc ghi đè toàn bộ dữ liệu tại các sheet "CONFIG", "DASHBOARD", "LOGS" trong Google Sheet đã chọn của bạn để trình bày báo cáo.\n\nBạn có chắc chắn muốn tiến hành ghi dữ liệu không?'
    );
    if (!confirmed) return;

    setIsSyncing(true);
    addLog('Ghi Sheets', 'Success', 'Bắt đầu quá trình đồng bộ ngược dữ liệu định dạng lên Google Sheets...');
    
    try {
      await writeDashboardToGoogleSheet(accessToken, config.spreadsheetId, config, groups, logs);
      addLog('Ghi Sheets', 'Success', 'Đồng bộ Google Sheets thành công! Các tab CONFIG, DASHBOARD, LOGS đã được định dạng chuẩn xác.');
      alert('Đồng bộ Google Sheets thành công! Hãy mở Google Sheet của bạn để xem kết quả báo cáo tuyệt đẹp.');
    } catch (err: any) {
      console.error('Sync error:', err);
      addLog('Ghi Sheets', 'Error', err.message || 'Không thể ghi dữ liệu định dạng lên Google Sheets.');
      alert(`Đồng bộ thất bại: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 font-medium font-sans">Đang tải cấu hình ứng dụng...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans text-slate-700 selection:bg-teal-100 selection:text-teal-900 flex flex-col justify-between">
      <div>
        {/* Top Header Navigation */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            
            {/* Logo and title */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center border border-teal-100 shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-[#10B5A5]" />
              </div>
              <div>
                <h1 className="font-display font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1">
                  Automated <span className="font-sans font-normal text-slate-500">Dashboard</span>
                </h1>
                <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                  <Database className="w-3 h-3 text-emerald-500" /> Google Sheets API Active
                </p>
              </div>
            </div>

            {/* Navigation Controls */}
            <nav className="flex items-center bg-slate-100 p-1 rounded-xl">
              {userRole === 'ADMIN' && (
                <button
                  onClick={() => setActiveTab('config')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'config' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Cấu hình (CONFIG)
                </button>
              )}
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'dashboard' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Báo cáo (DASHBOARD)
                {groups.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[#10B5A5] animate-pulse"></span>
                )}
              </button>
              {userRole === 'ADMIN' && (
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'logs' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  Nhật ký (LOGS)
                  {logs.length > 0 && (
                    <span className="bg-slate-200 text-slate-600 px-1.5 py-0.25 text-[9px] rounded-md font-bold font-mono">
                      {logs.length}
                    </span>
                  )}
                </button>
              )}
            </nav>

            {/* User Status / Interactive Role Switcher Dropdown */}
            <div className="relative flex items-center gap-2">
              <button
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                className="flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl py-1.5 px-3 text-left transition-all cursor-pointer shadow-sm group select-none"
                title="Nhấp để chuyển đổi phân quyền Quản trị viên (Admin) hoặc Khách"
              >
                <div className={`w-7 h-7 font-bold rounded-lg flex items-center justify-center text-xs shadow-sm transition-transform group-hover:scale-105 ${
                  userRole === 'ADMIN' 
                    ? 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white' 
                    : 'bg-[#10B5A5] text-white'
                }`}>
                  {userRole === 'ADMIN' ? 'AD' : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'DE')}
                </div>
                <div className="min-w-0 pr-1">
                  <div className="flex items-center gap-1">
                    {userRole === 'ADMIN' && <Crown className="w-3 h-3 text-amber-500 inline-block shrink-0" />}
                    <p className="text-[11px] font-bold text-slate-800 leading-none truncate max-w-[130px]">
                      {userRole === 'ADMIN' ? 'Quản trị viên (Admin)' : (user?.displayName || 'Khách (Demo Mode)')}
                    </p>
                  </div>
                  <p className="text-[9px] text-slate-400 leading-none truncate max-w-[130px] font-mono mt-0.5">
                    {userRole === 'ADMIN' ? 'admin@socialpillar.vn' : (user?.email || 'demo@app.local')}
                  </p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showRoleMenu ? 'rotate-180 text-teal-600' : ''}`} />
              </button>

              {/* Role Switcher Dropdown Popup Menu */}
              {showRoleMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40"
                    onClick={() => setShowRoleMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/60 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chọn Phân quyền Hệ thống</p>
                    </div>

                    {/* Admin Role Button */}
                    <button
                      onClick={() => handleSwitchRole('ADMIN')}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all text-left cursor-pointer ${
                        userRole === 'ADMIN'
                          ? 'bg-amber-50/80 border border-amber-200/60 text-amber-950 font-bold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm">
                          AD
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                            Quản trị viên (Admin)
                            <Crown className="w-3 h-3 text-amber-500 inline-block" />
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">admin@socialpillar.vn</p>
                        </div>
                      </div>
                      {userRole === 'ADMIN' && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
                    </button>

                    {/* Guest / Demo Role Button */}
                    <button
                      onClick={() => handleSwitchRole('DEMO')}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all text-left cursor-pointer mt-1 ${
                        userRole === 'DEMO'
                          ? 'bg-teal-50/80 border border-teal-200/60 text-teal-950 font-bold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#10B5A5] text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm">
                          DE
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">Khách (Demo Mode)</p>
                          <p className="text-[10px] text-slate-400 font-mono">demo@app.local</p>
                        </div>
                      </div>
                      {userRole === 'DEMO' && <Check className="w-4 h-4 text-[#10B5A5] shrink-0" />}
                    </button>

                    <div className="border-t border-slate-100 my-1 pt-1">
                      <button
                        onClick={() => {
                          setShowRoleMenu(false);
                          setActiveTab('config');
                        }}
                        className="w-full flex items-center gap-2 p-2 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-teal-600 text-xs font-medium transition-all cursor-pointer"
                      >
                        <Key className="w-3.5 h-3.5 text-teal-500" />
                        <span>Cấu hình Google Sheets / Auth...</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        </header>

        {/* Main Body */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Active tab router */}
          <div className="min-h-[500px]">
            {activeTab === 'config' && (
              <ConfigTab 
                accessToken={accessToken}
                config={config}
                setConfig={setConfig}
                onRefreshDashboard={handleRefreshDashboard}
                onClearDashboard={handleClearDashboard}
                onSyncToSheets={handleSyncToSheets}
                onInsertSampleData={handleInsertSampleData}
                onAuthSuccess={handleAuthSuccess}
                isProcessing={isProcessing}
                isSyncing={isSyncing}
                isInsertingSample={isInsertingSample}
                sheetsList={sheetsList}
                setSheetsList={setSheetsList}
                dashboardError={dashboardError}
                setDashboardError={setDashboardError}
              />
            )}

            {activeTab === 'dashboard' && (
              <DashboardTab 
                groups={groups}
                lastUpdated={lastUpdated}
                onUpdatePostPillar={handleUpdatePostPillar}
                onUpdatePostProductPillar={handleUpdatePostProductPillar}
                isAdmin={userRole === 'ADMIN'}
              />
            )}

            {activeTab === 'logs' && (
              <LogsTab 
                logs={logs}
                onClearLogs={handleClearLogs}
              />
            )}
          </div>

        </main>
      </div>

    </div>
  );
}
