/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { PillarGroup, PostItem } from '../types';
import { FileSpreadsheet, ExternalLink, Flame, Eye, Sparkles, Camera, Download, Trash2, Loader2, Upload, RefreshCw, Plus, Image as ImageIcon, Maximize2, Minimize2, ZoomIn, ZoomOut, Pencil, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';

// Helper functions for IndexedDB storage of screenshot captures to bypass localStorage size limits (5MB)
const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SocialPillarDB', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('store')) {
        db.createObjectStore('store');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveCapturesToIndexedDB = async (captures: any[]) => {
  try {
    const db = await getDB();
    const tx = db.transaction('store', 'readwrite');
    const store = tx.objectStore('store');
    store.put(captures, 'social_pillar_captures');
  } catch (err) {
    console.error('IndexedDB save failed:', err);
  }
};

const getCapturesFromIndexedDB = async (): Promise<any[]> => {
  try {
    const db = await getDB();
    const tx = db.transaction('store', 'readonly');
    const store = tx.objectStore('store');
    return new Promise((resolve, reject) => {
      const req = store.get('social_pillar_captures');
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('IndexedDB load failed:', err);
    return [];
  }
};

interface DashboardTabProps {
  groups: PillarGroup[];
  lastUpdated: string;
  onUpdatePostPillar?: (post: PostItem, newPillar: string) => void;
  onUpdatePostProductPillar?: (post: PostItem, newProductPillar: string) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ 
  groups, 
  lastUpdated, 
  onUpdatePostPillar,
  onUpdatePostProductPillar
}) => {
  const [activeTab, setActiveTab] = useState<string>('OVERVIEW');
  const currentActiveTab = (activeTab === 'OVERVIEW' || groups.some(g => g.pillar === activeTab)) ? activeTab : 'OVERVIEW';

  const [capturedImages, setCapturedImages] = useState<{ 
    id: string; 
    url: string; 
    timestamp: string; 
    title: string; 
    posts?: PostItem[];
    type?: 'LINK' | 'ELEMENT';
    targetUrl?: string;
    postTitle?: string;
    elementId?: string;
    pillarName?: string;
  }[]>([]);

  const filteredCapturedImages = React.useMemo(() => {
    return capturedImages.filter(img => {
      if (currentActiveTab === 'OVERVIEW') {
        return img.pillarName === 'OVERVIEW' || !img.pillarName || img.title.toLowerCase().includes('tổng quan');
      }
      return img.pillarName === currentActiveTab;
    });
  }, [capturedImages, currentActiveTab]);

  // Helper to detect if a captured image is a fake SVG card or Canvas-generated card (not a real screenshot)
  const isFakeCard = (img: any): boolean => {
    if (!img || !img.url) return false;
    // SVG-based fallback cards from server
    if (img.url.startsWith('data:image/svg+xml')) return true;
    // Canvas-generated cards (from old generateClientSocialCard function)
    if (img.title && img.title.startsWith('Thẻ bài viết đồng bộ')) return true;
    return false;
  };

  useEffect(() => {
    const loadAndCleanCaptures = async () => {
      let loadedCaptures: any[] = [];
      // 1. Load from IndexedDB
      try {
        const idbCaptures = await getCapturesFromIndexedDB();
        if (idbCaptures && idbCaptures.length > 0) {
          loadedCaptures = idbCaptures;
        }
      } catch (err) {
        console.error('Lỗi khi đọc từ IndexedDB:', err);
      }

      // 2. Migration: read from localStorage if present
      if (loadedCaptures.length === 0) {
        try {
          const cached = localStorage.getItem('social_pillar_captures');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.length > 0) {
              loadedCaptures = parsed;
              localStorage.removeItem('social_pillar_captures');
            }
          }
        } catch (err) {
          console.error('Lỗi khi khôi phục/di chuyển ảnh từ localStorage:', err);
        }
      }

      // 3. Filter out fake SVG/Canvas cards — keep only real screenshots and manually uploaded images
      const cleanCaptures = loadedCaptures.filter(img => !isFakeCard(img));
      if (cleanCaptures.length !== loadedCaptures.length) {
        console.log(`[Cleanup] Đã loại bỏ ${loadedCaptures.length - cleanCaptures.length} ảnh thẻ giả (SVG/Canvas). Giữ lại ${cleanCaptures.length} ảnh chụp thực.`);
        await saveCapturesToIndexedDB(cleanCaptures);
      }

      setCapturedImages(cleanCaptures);
    };

    loadAndCleanCaptures();
  }, []);

  const [toastMessage, setToastMessage] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [screenshotLoading, setScreenshotLoading] = useState<Record<string, boolean>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [activeLightboxImg, setActiveLightboxImg] = useState<any | null>(null);
  const activeImgIndex = activeLightboxImg ? filteredCapturedImages.findIndex(img => img.id === activeLightboxImg.id) : -1;
  const [lightboxFitMode, setLightboxFitMode] = useState<'fit' | 'custom'>('fit');
  const [zoomLevel, setZoomLevel] = useState<number>(1000);
  const [expandedImages, setExpandedImages] = useState<Record<string, boolean>>({});
  const colsCount = 5;
  const [editingImgId, setEditingImgId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // Keyboard navigation for image lightbox
  useEffect(() => {
    if (!activeLightboxImg || filteredCapturedImages.length <= 1) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        const idx = filteredCapturedImages.findIndex(img => img.id === activeLightboxImg.id);
        if (idx !== -1) {
          const prevIdx = (idx - 1 + filteredCapturedImages.length) % filteredCapturedImages.length;
          const prevImg = filteredCapturedImages[prevIdx];
          setActiveLightboxImg({ id: prevImg.id, url: prevImg.url, title: prevImg.title });
        }
      } else if (e.key === 'ArrowRight') {
        const idx = filteredCapturedImages.findIndex(img => img.id === activeLightboxImg.id);
        if (idx !== -1) {
          const nextIdx = (idx + 1) % filteredCapturedImages.length;
          const nextImg = filteredCapturedImages[nextIdx];
          setActiveLightboxImg({ id: nextImg.id, url: nextImg.url, title: nextImg.title });
        }
      } else if (e.key === 'Escape') {
        setActiveLightboxImg(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeLightboxImg, filteredCapturedImages]);

  const handleSaveTitle = (id: string) => {
    if (!editingTitle.trim()) {
      setEditingImgId(null);
      return;
    }
    const updated = capturedImages.map(img => {
      if (img.id === id) {
        return { ...img, title: editingTitle.trim() };
      }
      return img;
    });
    saveCaptures(updated);
    setEditingImgId(null);
  };

  // Smart canvas bottom white-space auto-trimmer (Cắt sạch 100% khoảng trắng thừa ở đuôi ảnh)
  const cropScreenshot = (base64DataUrl: string): Promise<string> => {
    if (!base64DataUrl || !base64DataUrl.startsWith('data:image')) {
      return Promise.resolve(base64DataUrl);
    }
    return new Promise((resolve) => {
      let isDone = false;
      const done = (res: string) => {
        if (!isDone) {
          isDone = true;
          resolve(res);
        }
      };

      // 500ms safety timeout to prevent hanging async execution loops
      const timer = setTimeout(() => done(base64DataUrl), 500);

      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return done(base64DataUrl);

          const w = img.width;
          const h = img.height;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0);

          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;

          // Scan from bottom row upwards to find the last row containing content (non-white pixel)
          let lastY = h - 1;
          rowLoop: for (let y = h - 1; y >= 0; y--) {
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const a = data[idx + 3];
              // Detect non-pure white/grey pixel (#f8f8f8 threshold)
              if (a > 30 && (r < 246 || g < 246 || b < 246)) {
                lastY = y;
                break rowLoop;
              }
            }
          }

          // If content ends early, crop height to lastY + 24px padding
          const cropHeight = Math.min(h, Math.max(200, lastY + 24));
          if (cropHeight < h - 40) {
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = w;
            cropCanvas.height = cropHeight;
            const cropCtx = cropCanvas.getContext('2d');
            if (cropCtx) {
              cropCtx.drawImage(canvas, 0, 0, w, cropHeight, 0, 0, w, cropHeight);
              return done(cropCanvas.toDataURL('image/png'));
            }
          }
          done(base64DataUrl);
        } catch (e) {
          done(base64DataUrl);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        done(base64DataUrl);
      };
      img.src = base64DataUrl;
    });
  };

  const handleImageUpload = (file: File, replaceId?: string, pName?: string) => {
    if (!file.type.startsWith('image/')) {
      setToastMessage('Vui lòng chỉ tải lên các file hình ảnh (PNG, JPG, JPEG, WEBP).');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const now = new Date();
      const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

      if (replaceId) {
        // Replace an existing screenshot URL
        const updated = capturedImages.map(img => {
          if (img.id === replaceId) {
            return {
              ...img,
              url: dataUrl,
              timestamp: `${timeStr} - ${dateStr} (Đã thay đổi)`
            };
          }
          return img;
        });
        saveCaptures(updated);
        setToastMessage('Đã thay thế ảnh chụp màn hình thành công!');
      } else {
        // Add a new manual screenshot
        const cleanName = file.name.replace(/\.[^/.]+$/, ""); // strip extension
        const newId = Math.random().toString(36).substring(2, 9);
        const newCapture = {
          id: newId,
          url: dataUrl,
          timestamp: `${timeStr} - ${dateStr} (Tải lên)`,
          title: `Ảnh chụp bài viết: ${cleanName}`,
          pillarName: pName || currentActiveTab,
        };
        saveCaptures([newCapture, ...capturedImages]);
        setToastMessage('Đã tải lên ảnh chụp màn hình thủ công thành công!');
      }
      setTimeout(() => setToastMessage(''), 3000);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0], undefined, currentActiveTab);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0], undefined, currentActiveTab);
    }
  };

  const handleRowImageUpload = (file: File, targetUrl: string, postTitle: string) => {
    if (!file.type.startsWith('image/')) {
      setToastMessage('Vui lòng chỉ tải lên các file hình ảnh (PNG, JPG, JPEG, WEBP).');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const now = new Date();
      const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

      const newId = Math.random().toString(36).substring(2, 9);
      const newCapture = {
        id: newId,
        url: dataUrl,
        timestamp: `${timeStr} - ${dateStr} (Tải lên thủ công)`,
        title: `Ảnh chụp bài viết: ${postTitle.slice(0, 40)}${postTitle.length > 40 ? '...' : ''}`,
        type: 'LINK' as const,
        targetUrl: targetUrl,
        postTitle: postTitle,
      };

      setCapturedImages(prev => {
        const updated = [newCapture, ...prev];
        saveCapturesToIndexedDB(updated).catch(err => console.error(err));
        return updated;
      });
      setToastMessage('Đã tải ảnh lên thủ công thành công cho bài viết!');
      setTimeout(() => setToastMessage(''), 3000);
    };
    reader.readAsDataURL(file);
  };

  const captureLinkScreenshot = async (urlStr: string, postTitle: string, replaceId?: string, pillarName?: string) => {
    if (!urlStr) return;
    const cleanUrl = urlStr.trim().startsWith('http') ? urlStr.trim() : `https://${urlStr.trim()}`;
    const loadingKey = replaceId || cleanUrl;

    try {
      setScreenshotLoading(prev => ({ ...prev, [loadingKey]: true }));
      setToastMessage(`Đang mở trình duyệt Headless Chrome chụp bài viết cho: ${postTitle.slice(0, 30)}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for complete render
      const response = await fetch(`/api/screenshot?url=${encodeURIComponent(cleanUrl)}&title=${encodeURIComponent(postTitle)}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Máy chủ chụp ảnh phản hồi mã lỗi HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.screenshotUrl) {
        const croppedUrl = await cropScreenshot(data.screenshotUrl);
        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

        if (replaceId) {
          setCapturedImages(prev => {
            const updated = prev.map(img => {
              if (img.id === replaceId) {
                return {
                  ...img,
                  url: croppedUrl,
                  timestamp: `${timeStr} - ${dateStr} (Đã chụp lại)`
                };
              }
              return img;
            });
            saveCapturesToIndexedDB(updated).catch(err => console.error(err));
            return updated;
          });
          setToastMessage(`Đã chụp lại bài viết thành công bằng trình duyệt Chrome!`);
        } else {
          const newCaptureId = Math.random().toString(36).substring(2, 9);
          const newCapture = {
            id: newCaptureId,
            url: croppedUrl,
            timestamp: `${timeStr} - ${dateStr}`,
            title: `Ảnh chụp màn hình Web: ${postTitle.slice(0, 40)}${postTitle.length > 40 ? '...' : ''}`,
            type: 'LINK' as const,
            targetUrl: cleanUrl,
            postTitle: postTitle,
            pillarName: pillarName || currentActiveTab,
          };
          
          setCapturedImages(prev => {
            const updated = [newCapture, ...prev];
            saveCapturesToIndexedDB(updated).catch(err => console.error(err));
            return updated;
          });
          setToastMessage(`Đã chụp bài viết thành công và nạp vào Thư viện!`);
        }
      } else {
        setToastMessage(`Không nhận được phản hồi ảnh từ máy chủ: ${data.error || 'Lỗi không xác định'}`);
      }
    } catch (err: any) {
      console.error('Lỗi khi chụp bài viết:', err);
      const errMsg = err?.name === 'AbortError' ? 'Quá thời gian kết nối (timeout 60s)' : (err?.message || 'Lỗi kết nối máy chủ');
      setToastMessage(`Chụp bài viết: ${errMsg}`);
    } finally {
      setScreenshotLoading(prev => ({ ...prev, [loadingKey]: false }));
      setTimeout(() => setToastMessage(''), 4000);
    }
  };

  const captureAllLinkScreenshots = async (posts: PostItem[], groupName: string) => {
    const links = posts
      .map(p => ({
        url: p.link || (p.post && isUrl(p.post) ? (p.post.startsWith('http') ? p.post : `https://${p.post}`) : ''),
        post: p.post
      }))
      .filter(item => item.url !== '');

    if (links.length === 0) {
      setToastMessage('Không tìm thấy link nào để chụp ảnh trong bảng này.');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    setToastMessage(`Đang bắt đầu chụp tuần tự từng link bài viết từ Facebook cho ${links.length} liên kết...`);
    let count = 0;
    
    // Strictly sequential loop - process 1 link at a time
    for (let i = 0; i < links.length; i++) {
      const item = links[i];
      try {
        setToastMessage(`Đang chụp link (${i + 1}/${links.length}): ${item.post.slice(0, 30)}...`);
        setScreenshotLoading(prev => ({ ...prev, [item.url]: true }));
        
        let finalImage = '';
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout per link
          const response = await fetch(`/api/screenshot?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(item.post)}`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.screenshotUrl) {
              finalImage = await cropScreenshot(data.screenshotUrl);
            }
          }
        } catch (e: any) {
          console.warn(`Lỗi khi kết nối trình duyệt Headless Chrome cho link ${item.url}`, e);
        }

        if (finalImage) {
          const now = new Date();
          const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          
          const newCaptureId = Math.random().toString(36).substring(2, 9);
          const newCapture = {
            id: newCaptureId,
            url: finalImage,
            timestamp: `${timeStr} - ${dateStr}`,
            title: `Ảnh chụp bài viết [${groupName}]: ${item.post.slice(0, 40)}${item.post.length > 40 ? '...' : ''}`,
            type: 'LINK' as const,
            targetUrl: item.url,
            postTitle: item.post,
            pillarName: groupName,
            version: 'v4_full_photo_dynamic'
          };
          
          setCapturedImages(prev => {
            const filtered = prev.filter(img => img.targetUrl !== item.url);
            const updated = [newCapture, ...filtered];
            saveCapturesToIndexedDB(updated).catch(err => console.error(err));
            return updated;
          });
          count++;
        }
      } catch (err) {
        console.error(`Lỗi khi xử lý link bài viết: ${item.url}`, err);
      } finally {
        setScreenshotLoading(prev => ({ ...prev, [item.url]: false }));
      }
    }
    
    setToastMessage(`Hoàn tất! Đã chụp thành công màn hình Web cho ${count}/${links.length} bài viết.`);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const saveCaptures = (newCaptures: typeof capturedImages) => {
    setCapturedImages(newCaptures);
    saveCapturesToIndexedDB(newCaptures).catch(err => {
      console.error('Lỗi khi lưu ảnh vào IndexedDB:', err);
    });
  };

  const recaptureScreenshot = async (img: any) => {
    // Determine target URL for Headless Chrome / Selenium recapture
    let targetUrl = img.targetUrl || '';
    let postTitle = img.postTitle || img.title || '';
    let pillarName = img.pillarName || currentActiveTab;

    if (!targetUrl) {
      // Find matching post URL across groups if missing from metadata
      for (const group of groups) {
        for (const post of group.posts) {
          const postUrl = post.link || (post.post && isUrl(post.post) ? (post.post.startsWith('http') ? post.post : `https://${post.post}`) : '');
          if (!postUrl) continue;
          if (img.title.includes(post.post.slice(0, 15)) || post.post.includes(img.title.slice(0, 15))) {
            targetUrl = postUrl;
            postTitle = post.post;
            pillarName = group.pillar;
            break;
          }
        }
        if (targetUrl) break;
      }
    }

    if (targetUrl) {
      setToastMessage(`Đang mở Selenium/Chrome chụp lại trực tiếp từ Facebook cho bài viết...`);
      await captureLinkScreenshot(targetUrl, postTitle, img.id, pillarName);
    } else if (img.type === 'ELEMENT' || img.title.startsWith('Bảng')) {
      const isOverview = pillarName.toLowerCase().includes('tổng quan') || pillarName.toUpperCase().includes('OVERVIEW');
      const elementId = isOverview ? 'capture-overview-container' : 'capture-table-container';
      await captureElement(elementId, pillarName, img.posts, img.id);
    } else {
      setToastMessage('Không tìm thấy liên kết bài viết gốc để chụp lại bằng Selenium.');
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  // Helper to parse values (decimals or percentages)
  const parseVal = (val: string, scale = 1) => {
    if (!val) return 0;
    if (val.endsWith('%')) {
      return (parseFloat(val) / 100) * scale;
    }
    return parseFloat(val);
  };

  // Convert OKLAB color to RGB
  const oklabToRgb = (L: number, a: number, b: number): [number, number, number] => {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855414 * b;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let b_val = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    const fn = (c: number) => {
      const abs = Math.abs(c);
      const res = abs > 0.0031308 ? 1.055 * Math.pow(abs, 1 / 2.4) - 0.055 : 12.92 * abs;
      return Math.sign(c) * res;
    };

    const rOut = Math.round(Math.max(0, Math.min(1, fn(r))) * 255);
    const gOut = Math.round(Math.max(0, Math.min(1, fn(g))) * 255);
    const bOut = Math.round(Math.max(0, Math.min(1, fn(b_val))) * 255);

    return [rOut, gOut, bOut];
  };

  // Convert OKLCH color to RGB
  const oklchToRgb = (L: number, c: number, h: number): [number, number, number] => {
    const hRad = (h * Math.PI) / 180;
    const a = c * Math.cos(hRad);
    const b = c * Math.sin(hRad);
    return oklabToRgb(L, a, b);
  };

  // Replace oklch and oklab strings in CSS text with rgb/rgba
  const replaceOklchAndOklab = (cssText: string) => {
    const colorRegex = /(oklch|oklab)\(([^)]+)\)/gi;

    return cssText.replace(colorRegex, (match, type, inner) => {
      try {
        // Normalize inner content: replace commas and slashes with spaces, then split
        const parts = inner.replace(/,/g, ' ').replace(/\//g, ' ').trim().split(/\s+/).filter(Boolean);
        if (parts.length < 3) return match; // fallback if something is weird

        const isOklch = type.toLowerCase() === 'oklch';
        const val1 = parseVal(parts[0], 1);
        const val2 = parseVal(parts[1], isOklch ? 0.4 : 0.4); // chroma or a
        const val3 = parseVal(parts[2], isOklch ? 360 : 0.4); // hue or b
        const alpha = parts[3] ? parseVal(parts[3], 1) : 1;

        const [rVal, gVal, bVal] = isOklch 
          ? oklchToRgb(val1, val2, val3)
          : oklabToRgb(val1, val2, val3);

        if (isNaN(rVal) || isNaN(gVal) || isNaN(bVal)) {
          return 'rgb(0,0,0)';
        }

        return parts[3] ? `rgba(${rVal}, ${gVal}, ${bVal}, ${alpha})` : `rgb(${rVal}, ${gVal}, ${bVal})`;
      } catch (err) {
        console.error('Error parsing color:', match, err);
        return 'rgb(0,0,0)'; // fallback so it doesn't crash html2canvas
      }
    });
  };

  const copyPostLinks = (posts: PostItem[]) => {
    const links = posts
      .map(p => p.link || (p.post && isUrl(p.post) ? (p.post.startsWith('http') ? p.post : `https://${p.post}`) : ''))
      .filter(link => link !== '');

    if (links.length === 0) {
      setToastMessage('Không tìm thấy link nào trong danh sách bài viết này.');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const textToCopy = links.join('\n');
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setToastMessage(`Đã sao chép thành công ${links.length} link vào bộ nhớ tạm!`);
        setTimeout(() => setToastMessage(''), 3000);
      })
      .catch((err) => {
        console.error('Lỗi khi sao chép:', err);
      });
  };

  const captureElement = async (elementId: string, pillarName: string, posts?: PostItem[], replaceId?: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    setIsCapturing(true);
    if (replaceId) {
      setScreenshotLoading(prev => ({ ...prev, [replaceId]: true }));
    }
    
    const patchCSSStyleDeclarationPrototype = (win: Window) => {
      try {
        const proto = (win as any).CSSStyleDeclaration.prototype;
        const originalGetPropertyValue = proto.getPropertyValue;
        const restoredGetters: Array<{ key: string; descriptor: PropertyDescriptor }> = [];

        proto.getPropertyValue = function (propertyName: string) {
          const val = originalGetPropertyValue.call(this, propertyName);
          if (typeof val === 'string' && (val.includes('oklch') || val.includes('oklab'))) {
            return replaceOklchAndOklab(val);
          }
          return val;
        };

        const descriptors = Object.getOwnPropertyDescriptors(proto);
        for (const key in descriptors) {
          const desc = descriptors[key];
          if (desc && desc.get && typeof desc.get === 'function') {
            const originalGet = desc.get;
            restoredGetters.push({ key, descriptor: desc });
            try {
              Object.defineProperty(proto, key, {
                ...desc,
                get: function () {
                  const val = originalGet.call(this);
                  if (typeof val === 'string' && (val.includes('oklch') || val.includes('oklab'))) {
                    return replaceOklchAndOklab(val);
                  }
                  return val;
                },
              });
            } catch (e) {
              // Ignore read-only or unconfigurable descriptors
            }
          }
        }

        return () => {
          try {
            proto.getPropertyValue = originalGetPropertyValue;
            restoredGetters.forEach(({ key, descriptor }) => {
              try {
                Object.defineProperty(proto, key, descriptor);
              } catch (e) {
                // Ignore restoration errors
              }
            });
          } catch (err) {
            console.error('Error restoring CSSStyleDeclaration prototype:', err);
          }
        };
      } catch (err) {
        console.error('Error patching CSSStyleDeclaration prototype:', err);
        return () => {};
      }
    };

    const patchGetComputedStyle = (win: Window) => {
      try {
        const originalGetComputedStyle = win.getComputedStyle;
        win.getComputedStyle = function (this: any, elt: any, pseudoElt: any) {
          const style = originalGetComputedStyle.call(win, elt, pseudoElt);
          if (!style) return style;
          return new Proxy(style, {
            get(target: any, prop: string | symbol, receiver: any) {
              if (prop === 'getPropertyValue') {
                return function(this: any, propertyName: string) {
                  const val = target.getPropertyValue(propertyName);
                  if (typeof val === 'string' && (val.toLowerCase().includes('oklch') || val.toLowerCase().includes('oklab'))) {
                    return replaceOklchAndOklab(val);
                  }
                  return val;
                };
              }
              const val = Reflect.get(target, prop);
              if (typeof prop === 'string' && typeof val === 'string' && (val.toLowerCase().includes('oklch') || val.toLowerCase().includes('oklab'))) {
                return replaceOklchAndOklab(val);
              }
              if (typeof val === 'function') {
                return val.bind(target);
              }
              return val;
            }
          });
        } as any;
        return () => {
          win.getComputedStyle = originalGetComputedStyle;
        };
      } catch (err) {
        console.error('Error patching getComputedStyle:', err);
        return () => {};
      }
    };

    const restoreMainPrototype = patchCSSStyleDeclarationPrototype(window);
    const restoreMainGetComputedStyle = patchGetComputedStyle(window);

    // Keep track of original style contents to restore them later
    const originalStyles = new Map<HTMLStyleElement, string>();
    const styleElements = Array.from(document.querySelectorAll('style')) as HTMLStyleElement[];
    
    styleElements.forEach(style => {
      originalStyles.set(style, style.innerHTML);
      try {
        style.innerHTML = replaceOklchAndOklab(style.innerHTML);
      } catch (e) {
        console.error('Error rewriting inline style tag:', e);
      }
    });

    // Process all document stylesheets (including dynamic rules from insertRule/replaceSync)
    const convertedDynamicStyleTags: HTMLStyleElement[] = [];
    const disabledSheets: { sheet: CSSStyleSheet; wasDisabled: boolean }[] = [];

    try {
      const sheets = Array.from(document.styleSheets) as CSSStyleSheet[];
      for (const sheet of sheets) {
        try {
          if (sheet.cssRules) {
            const rules = Array.from(sheet.cssRules);
            const cssText = rules.map(rule => rule.cssText).join('\n');
            if (cssText.includes('oklch') || cssText.includes('oklab')) {
              const style = document.createElement('style');
              style.innerHTML = replaceOklchAndOklab(cssText);
              style.setAttribute('data-converted-dynamic-sheet', 'true');
              document.head.appendChild(style);
              convertedDynamicStyleTags.push(style);
              
              disabledSheets.push({ sheet, wasDisabled: sheet.disabled });
              sheet.disabled = true;
            }
          }
        } catch (e) {
          // If security or other error, fallback to fetching or ignore
        }
      }
    } catch (e) {
      console.error('Error preprocessing styleSheets:', e);
    }

    // Pre-fetch and inline any link stylesheets so that we can process them
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
    const convertedStyles: HTMLStyleElement[] = [];
    
    for (const link of links) {
      try {
        const response = await fetch(link.href);
        if (response.ok) {
          const cssText = await response.text();
          const style = document.createElement('style');
          style.innerHTML = replaceOklchAndOklab(cssText);
          style.setAttribute('data-converted-from', link.href);
          document.head.appendChild(style);
          convertedStyles.push(style);
          link.disabled = true;
        }
      } catch (err) {
        console.error('Failed to pre-fetch and inline stylesheet:', link.href, err);
      }
    }

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scale: 2, // Double resolution for ultra-sharp high quality
        logging: false,
        onclone: (clonedDoc) => {
          const clonedWindow = clonedDoc.defaultView;
          if (clonedWindow) {
            patchCSSStyleDeclarationPrototype(clonedWindow);
            patchGetComputedStyle(clonedWindow);
          }

          // Process all style tags in the cloned document to replace unsupported oklch / oklab colors
          const styles = clonedDoc.querySelectorAll('style');
          styles.forEach(style => {
            try {
              style.innerHTML = replaceOklchAndOklab(style.innerHTML);
            } catch (e) {
              console.error('Error rewriting stylesheet oklab/oklch colors:', e);
            }
          });

          // Also process cloned stylesheets (for dynamically injected style sheets in clone)
          try {
            const clonedSheets = Array.from(clonedDoc.styleSheets) as CSSStyleSheet[];
            clonedSheets.forEach(sheet => {
              try {
                if (sheet.cssRules) {
                  const rules = Array.from(sheet.cssRules);
                  const cssText = rules.map(r => r.cssText).join('\n');
                  if (cssText.includes('oklch') || cssText.includes('oklab')) {
                    const style = clonedDoc.createElement('style');
                    style.innerHTML = replaceOklchAndOklab(cssText);
                    clonedDoc.head.appendChild(style);
                    sheet.disabled = true;
                  }
                }
              } catch (e) {
                // Ignore
              }
            });
          } catch (e) {
            // Ignore
          }

          // Also process inline style attributes in the cloned elements
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach(el => {
            try {
              const styleAttr = el.getAttribute('style');
              if (styleAttr && (styleAttr.toLowerCase().includes('oklch') || styleAttr.toLowerCase().includes('oklab'))) {
                el.setAttribute('style', replaceOklchAndOklab(styleAttr));
              }
            } catch (e) {
              // Ignore individual element errors
            }
          });
        }
      });
      
      const dataUrl = canvas.toDataURL('image/png');
      const now = new Date();
      const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      
      if (replaceId) {
        setCapturedImages(prev => {
          const updated = prev.map(img => {
            if (img.id === replaceId) {
              return {
                ...img,
                url: dataUrl,
                timestamp: `${timeStr} - ${dateStr} (Đã chụp lại)`
              };
            }
            return img;
          });
          saveCapturesToIndexedDB(updated).catch(err => console.error(err));
          return updated;
        });
      } else {
        const newCapture = {
          id: Math.random().toString(36).substring(2, 9),
          url: dataUrl,
          timestamp: `${timeStr} - ${dateStr}`,
          title: `Bảng ${pillarName}`,
          posts: posts,
          type: 'ELEMENT' as const,
          elementId: elementId,
          pillarName: pillarName,
        };
        saveCaptures([newCapture, ...capturedImages]);
      }
    } catch (error) {
      console.error('Error capturing element:', error);
    } finally {
      // Restore original CSSStyleDeclaration prototype on main window
      restoreMainPrototype();
      restoreMainGetComputedStyle();

      // Restore original inline style tags
      styleElements.forEach(style => {
        const originalContent = originalStyles.get(style);
        if (originalContent !== undefined) {
          style.innerHTML = originalContent;
        }
      });

      // Restore original stylesheet links and clean up converted style tags
      links.forEach(link => {
        link.disabled = false;
      });
      convertedStyles.forEach(style => {
        style.remove();
      });

      // Restore disabled stylesheets and clean up converted dynamic style tags
      disabledSheets.forEach(({ sheet, wasDisabled }) => {
        try {
          sheet.disabled = wasDisabled;
        } catch (e) {
          // Ignore
        }
      });
      convertedDynamicStyleTags.forEach(style => {
        try {
          style.remove();
        } catch (e) {
          // Ignore
        }
      });

      setIsCapturing(false);
      if (replaceId) {
        setScreenshotLoading(prev => ({ ...prev, [replaceId]: false }));
      }
    }
  };



  // Helper to parse month-year from Date string. Returns format "MM/YYYY" or null
  const parseMonthYear = (dateStr: string): string | null => {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    // Handle standard ISO or YYYY-MM-DD
    const matchYmd = trimmed.match(/^(\d{4})[-/](\d{2})/);
    if (matchYmd) {
      return `${matchYmd[2]}/${matchYmd[1]}`;
    }
    // Handle DD/MM/YYYY
    const matchDmy = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (matchDmy) {
      return `${matchDmy[2]}/${matchDmy[3]}`;
    }
    return null;
  };

  // Extract all available months from original groups
  const availableMonths = React.useMemo(() => {
    const monthsSet = new Set<string>();
    groups.forEach(g => {
      g.posts.forEach(p => {
        const my = parseMonthYear(p.airedDate);
        if (my) {
          monthsSet.add(my);
        }
      });
    });
    return Array.from(monthsSet).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      if (yA !== yB) return yA - yB;
      return mA - mB;
    });
  }, [groups]);

  // Filter groups based on selected month
  const filteredGroups = React.useMemo(() => {
    if (selectedMonth === 'ALL') return groups;
    return groups.map(g => ({
      ...g,
      posts: g.posts.filter(p => parseMonthYear(p.airedDate) === selectedMonth)
    }));
  }, [groups, selectedMonth]);

  // Format numbers with commas
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Helper to detect if content is a URL
  const isUrl = (str: string): boolean => {
    return /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/.test(str.trim());
  };

  // Stats calculation
  const totalPillars = filteredGroups.filter(g => g.posts.length > 0).length;
  const totalPosts = filteredGroups.reduce((sum, g) => sum + g.posts.length, 0);
  
  // Find top posts
  let topInteractPost: PostItem | null = null;
  let topReachPost: PostItem | null = null;

  filteredGroups.forEach(g => {
    g.posts.forEach(p => {
      if (!topInteractPost || p.interact > topInteractPost.interact) {
        topInteractPost = p;
      }
      if (!topReachPost || p.reach > topReachPost.reach) {
        topReachPost = p;
      }
    });
  });

  // Calculate detailed allocation by Pillar & Product Pillar
  const summaryMap: { [key: string]: { pillar: string; productPillar: string; posts: PostItem[] } } = {};
  
  filteredGroups.forEach(g => {
    g.posts.forEach(p => {
      const prodPillar = p.pillar === 'PRODUCT' ? (p.productPillar || 'KHÁC') : '';
      const key = `${p.pillar}||${prodPillar}`;
      if (!summaryMap[key]) {
        summaryMap[key] = {
          pillar: p.pillar,
          productPillar: prodPillar,
          posts: [],
        };
      }
      summaryMap[key].posts.push(p);
    });
  });

  // Sort: BRANDING, NGÂN HÀNG QR, PRODUCT sub-pillars, PROMOTION...
  const summaryList = Object.values(summaryMap).sort((a, b) => {
    if (a.pillar !== b.pillar) {
      return a.pillar.localeCompare(b.pillar);
    }
    return a.productPillar.localeCompare(b.productPillar);
  });

  // Row span calculation for merged Pillar column cells
  const rowSpans: number[] = [];
  let tempSpan = 1;
  for (let i = 0; i < summaryList.length; i++) {
    if (i === 0) {
      rowSpans.push(1);
    } else {
      if (summaryList[i].pillar === summaryList[i - 1].pillar) {
        rowSpans[rowSpans.length - tempSpan] = tempSpan + 1;
        rowSpans.push(0); // 0 means hidden because of rowspan
        tempSpan++;
      } else {
        rowSpans.push(1);
        tempSpan = 1;
      }
    }
  }

  if (groups.length === 0) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center shadow-sm">
        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm mx-auto mb-4">
          <FileSpreadsheet className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="font-display font-semibold text-slate-700 text-base mb-1">Chưa có dữ liệu Dashboard</h3>
        <p className="text-slate-400 text-xs max-w-sm mx-auto leading-relaxed mb-6">
          Vui lòng chọn sheet nguồn trong phần cấu hình và nhấn nút <strong>Làm mới Dashboard</strong> để tạo các bảng phân nhóm Pillar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Dashboard Metadata and Mini Stats */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-slate-800 text-lg">Hệ thống Dashboard theo Pillar</h2>
            <p className="text-slate-400 text-xs">Cập nhật lúc: <span className="font-mono">{lastUpdated || 'N/A'}</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Filter by Month */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Lọc theo tháng:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-[#10B5A5] outline-none cursor-pointer hover:bg-slate-50 transition-all shadow-sm"
              >
                <option value="ALL">Tất cả các tháng</option>
                {availableMonths.map(month => (
                  <option key={month} value={month}>Tháng {month}</option>
                ))}
              </select>
            </div>
            <span className="bg-teal-50 text-[#10B5A5] border border-teal-100 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Hoạt động
            </span>
          </div>
        </div>

        {/* Dynamic Bento Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-center text-[#10B5A5] shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tổng số Pillar</p>
              <h3 className="font-display font-bold text-slate-800 text-xl">{totalPillars}</h3>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-500 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tổng số Bài đăng</p>
              <h3 className="font-display font-bold text-slate-800 text-xl">{totalPosts}</h3>
            </div>
          </div>

          {topInteractPost && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3 col-span-1">
              <div className="w-10 h-10 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-center text-orange-500 shrink-0">
                <Flame className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">Tương tác cao nhất</p>
                <h3 className="font-display font-bold text-slate-800 text-base truncate font-mono">
                  {formatNumber((topInteractPost as PostItem).interact)}
                </h3>
              </div>
            </div>
          )}

          {topReachPost && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3 col-span-1">
              <div className="w-10 h-10 bg-cyan-50 border border-cyan-100 rounded-xl flex items-center justify-center text-cyan-500 shrink-0">
                <Eye className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">Lượt tiếp cận cao nhất</p>
                <h3 className="font-display font-bold text-slate-800 text-base truncate font-mono">
                  {formatNumber((topReachPost as PostItem).reach)}
                </h3>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sub-tabs bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200/80 pb-px">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-200 border-b-2 cursor-pointer flex items-center gap-2 ${
            currentActiveTab === 'OVERVIEW'
              ? 'border-[#10B5A5] text-[#10B5A5] bg-teal-50/20'
              : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Tổng quan phân bổ
        </button>
        {groups.map((group) => {
          const isActive = currentActiveTab === group.pillar;
          const filteredCount = filteredGroups.find(fg => fg.pillar === group.pillar)?.posts.length || 0;
          return (
            <button
              key={group.pillar}
              onClick={() => setActiveTab(group.pillar)}
              className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-200 border-b-2 cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'border-[#10B5A5] text-[#10B5A5] bg-teal-50/20'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              <span>{group.pillar || 'CHƯA PHÂN LOẠI'}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold transition-colors ${
                isActive ? 'bg-[#10B5A5] text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {filteredCount}
              </span>
            </button>
          );
        })}
      </div>

      {currentActiveTab === 'OVERVIEW' ? (
        /* Bảng tổng thể / Summary Table styled exactly like the main flat-tables with teal colors */
        <div id="capture-overview-container" className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h3 className="font-display font-bold text-slate-800 text-sm flex items-center gap-2 uppercase tracking-wide">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B5A5]"></span>
              Bảng Tổng Thế Phân Bổ (Pillar Allocation Summary)
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 font-mono italic">Gợi ý: Trình bày chi tiết theo Product sub-pillar</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="flat-table min-w-[500px] max-w-2xl text-sm">
              <thead>
                <tr>
                  <th className="w-1/3 text-center font-bold">
                    Pillar
                  </th>
                  <th className="w-1/3 text-center font-bold">
                    Product pillar
                  </th>
                  <th className="w-1/6 text-center font-bold">
                    Post count
                  </th>
                  <th className="w-1/6 text-center font-bold">
                    % Allocation
                  </th>
                </tr>
              </thead>
              <tbody>
                {summaryList.map((item, index) => {
                  const span = rowSpans[index];
                  const count = item.posts.length;
                  const percentage = totalPosts > 0 ? (count / totalPosts) * 100 : 0;
                  const isProduct = item.pillar === 'PRODUCT';
                  return (
                    <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                      {isProduct ? (
                        <>
                          {span > 0 && (
                            <td 
                              rowSpan={span} 
                              className="text-center font-bold text-slate-800 bg-slate-50/30 align-middle border-r border-slate-100"
                            >
                              {item.pillar}
                            </td>
                          )}
                          <td className="text-center font-semibold text-slate-600">
                            {item.productPillar || 'KHÁC'}
                          </td>
                        </>
                      ) : (
                        <td 
                          colSpan={2}
                          className="text-center font-bold text-slate-800 bg-slate-50/30 align-middle font-semibold"
                        >
                          {item.pillar}
                        </td>
                      )}
                      <td className="text-center font-semibold text-slate-700 font-mono">
                        {count}
                      </td>
                      <td className="text-center font-semibold text-slate-700 font-mono">
                        {percentage.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
                {/* Grand Total Row with double top border & custom light grey background */}
                <tr className="bg-slate-100 font-bold text-slate-900">
                  <td colSpan={2} className="text-center font-bold">
                    Grand Total
                  </td>
                  <td className="text-center font-mono font-bold">
                    {totalPosts}
                  </td>
                  <td className="text-center font-mono font-bold">
                    100.00%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Render only the selected Pillar group's table */
        <div className="space-y-12">
          {filteredGroups
            .filter((group) => group.pillar === currentActiveTab)
            .map((group) => (
              <div key={group.pillar} id="capture-table-container" className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
                {/* Title Block */}
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <h3 className="font-display font-bold text-2xl text-[#10B5A5] uppercase tracking-tight">
                    {group.pillar || 'CHƯA PHÂN LOẠI'}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-lg mr-1">
                      Số lượng: <span className="font-mono text-slate-700">{group.posts.length}</span> bài viết
                    </span>
                    <button
                      onClick={() => copyPostLinks(group.posts)}
                      className="bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 font-semibold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                      title="Sao chép toàn bộ link bài viết trong bảng này"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Sao chép tất cả Link
                    </button>
                    <button
                      onClick={() => captureAllLinkScreenshots(group.posts, group.pillar)}
                      className="bg-purple-50 border border-purple-200 text-purple-600 hover:bg-purple-100 hover:text-purple-700 font-semibold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                      title="Chụp ảnh màn hình cho từng link bài viết trong bảng này"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Tự động chụp tất cả Link
                    </button>
                  </div>
                </div>

                {/* Table wrapper with exact widths and styles to match the Professional Polish theme */}
                <div className="overflow-x-auto">
                  <table className="flat-table w-full">
                    <thead>
                      <tr>
                        <th className="w-[50px] text-center font-bold">No.</th>
                        <th className="w-[120px] text-center font-bold">Pillar</th>
                        {group.pillar === 'PRODUCT' && (
                          <th className="w-[150px] text-center font-bold">Product pillar</th>
                        )}
                        <th className="min-w-[250px] max-w-[500px] text-left font-bold">Post</th>
                        <th className="w-[110px] text-center font-bold">Aired date</th>
                        <th className="w-[110px] text-right font-bold">Reach</th>
                        <th className="w-[110px] text-right font-bold">Interact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.posts.map((post, index) => {
                        const isLink = isUrl(post.post);
                        
                        return (
                          <tr key={index} className="hover:bg-slate-50 transition-colors">
                            {/* No. */}
                            <td className="text-center font-semibold text-slate-800">
                              {index + 1}
                            </td>
                            
                            {/* Pillar Selector for manual check & override */}
                            <td className="text-center p-2">
                              <select
                                value={post.pillar || 'CHƯA PHÂN LOẠI'}
                                onChange={(e) => onUpdatePostPillar && onUpdatePostPillar(post, e.target.value)}
                                className="text-[10px] font-bold uppercase tracking-wider text-slate-700 bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 focus:border-[#10B5A5] focus:bg-white outline-none cursor-pointer hover:bg-slate-100/70 transition-all shadow-sm w-full"
                              >
                                <option value="PRODUCT">PRODUCT</option>
                                <option value="PROMOTION">PROMOTION</option>
                                <option value="MINIGAME">MINIGAME</option>
                                <option value="BRANDING">BRANDING</option>
                                <option value="CHƯA PHÂN LOẠI">N/A</option>
                              </select>
                            </td>

                            {/* Product Sub-pillar Selector for manual check & override */}
                            {group.pillar === 'PRODUCT' && (
                              <td className="text-center p-2">
                                <select
                                  value={post.productPillar || 'KHÁC'}
                                  onChange={(e) => onUpdatePostProductPillar && onUpdatePostProductPillar(post, e.target.value)}
                                  className="text-[10px] font-bold uppercase tracking-wider text-slate-700 bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 focus:border-[#10B5A5] focus:bg-white outline-none cursor-pointer hover:bg-slate-100/70 transition-all shadow-sm w-full"
                                >
                                  <option value="ÁNH KIM">ÁNH KIM</option>
                                  <option value="KHUNG TITAN">KHUNG TITAN</option>
                                  <option value="TẤM EUROTONE">TẤM EUROTONE</option>
                                  <option value="TẤM SIÊU BẢO VỆ">TẤM SIÊU BẢO VỆ</option>
                                  <option value="TẤM SIÊU CHỐNG MỐC">TẤM SIÊU CHỐNG MỐC</option>
                                  <option value="TẤM SIÊU CHỐNG ẨM">TẤM SIÊU CHỐNG ẨM</option>
                                  <option value="SIÊU CHỐNG CHÁY">SIÊU CHỐNG CHÁY</option>
                                  <option value="KHÁC">KHÁC</option>
                                </select>
                              </td>
                            )}
                            
                            {/* Post Content */}
                            <td className="text-xs text-[#0097A7] font-medium break-words leading-relaxed whitespace-pre-wrap">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-start justify-between gap-2">
                                  {post.link ? (
                                    <a 
                                      href={post.link}
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="hover:underline hover:text-[#006064] text-[#0097A7] cursor-pointer inline-flex items-start break-all"
                                      title={post.post}
                                    >
                                      <span className="line-clamp-3 text-ellipsis overflow-hidden text-left">{post.post}</span>
                                      <ExternalLink className="w-3 h-3 ml-1.5 mt-0.5 text-[#0097A7]/70 shrink-0 inline-block" />
                                    </a>
                                  ) : isLink ? (
                                    <a 
                                      href={post.post.startsWith('http') ? post.post : `https://${post.post}`}
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="hover:underline hover:text-[#006064] text-[#0097A7] cursor-pointer inline-flex items-start break-all"
                                      title={post.post}
                                    >
                                      <span className="line-clamp-3 text-ellipsis overflow-hidden text-left">{post.post}</span>
                                      <ExternalLink className="w-3 h-3 ml-1.5 mt-0.5 text-[#0097A7]/70 shrink-0 inline-block" />
                                    </a>
                                  ) : (
                                    <span className="line-clamp-3 text-ellipsis overflow-hidden text-left" title={post.post}>{post.post}</span>
                                  )}

                                  {/* Screenshot Link Button */}
                                  {(post.link || isLink) && (
                                    <button
                                      onClick={() => {
                                        const targetUrl = post.link || (post.post.startsWith('http') ? post.post : `https://${post.post}`);
                                        captureLinkScreenshot(targetUrl, post.post, undefined, group.pillar);
                                      }}
                                      disabled={screenshotLoading[(post.link || (post.post.startsWith('http') ? post.post : `https://${post.post}`)).trim()]}
                                      className="bg-teal-50 border border-teal-200 text-[#10B5A5] hover:bg-teal-100 hover:text-teal-600 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 shrink-0 select-none shadow-sm"
                                      title="Chụp ảnh màn hình nội dung bài viết này"
                                    >
                                      {screenshotLoading[(post.link || (post.post.startsWith('http') ? post.post : `https://${post.post}`)).trim()] ? (
                                        <Loader2 className="w-3 h-3 animate-spin text-[#10B5A5]" />
                                      ) : (
                                        <Camera className="w-3 h-3" />
                                      )}
                                      Chụp Link
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                            
                            {/* Aired Date */}
                            <td className="text-center text-slate-600 font-mono">
                              {post.airedDate || 'N/A'}
                            </td>
                            
                            {/* Reach */}
                            <td className="text-right font-mono font-medium text-slate-700">
                              {formatNumber(post.reach)}
                            </td>
                            
                            {/* Interact */}
                            <td className="text-right font-mono font-medium text-slate-700">
                              {formatNumber(post.interact)}
                            </td>
                          </tr>
                        );
                      })}

                      {group.posts.length === 0 && (
                        <tr>
                          <td colSpan={group.pillar === 'PRODUCT' ? 7 : 6} className="py-8 text-center text-xs text-slate-400">
                            Không có bài đăng nào trong Pillar này phù hợp với bộ lọc.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Captured Screenshots Gallery / Gallery Ảnh Chụp Màn Hình */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-slate-800 text-sm flex items-center gap-2 uppercase tracking-wide">
              <Camera className="w-4 h-4 text-[#10B5A5]" />
              Thư viện ảnh chụp minh chứng - {currentActiveTab === 'OVERVIEW' ? 'Tổng quan' : currentActiveTab} ({filteredCapturedImages.length})
            </h3>
          </div>
          
          <div className="flex items-center justify-end gap-3 shrink-0">
            {filteredCapturedImages.length > 0 && (
              <>

                <button
                  onClick={() => {
                    const allExpanded = filteredCapturedImages.every(img => expandedImages[img.id]);
                    const nextState: Record<string, boolean> = {};
                    filteredCapturedImages.forEach(img => {
                      nextState[img.id] = !allExpanded;
                    });
                    setExpandedImages(prev => ({ ...prev, ...nextState }));
                  }}
                  className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  title="Mở rộng hoặc thu gọn chiều cao hiển thị của toàn bộ ảnh trong thư viện"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-[#10B5A5]" />
                  <span>{filteredCapturedImages.every(img => expandedImages[img.id]) ? 'Thu gọn tất cả ảnh' : 'Mở rộng toàn bộ ảnh'}</span>
                </button>

                <button
                  onClick={() => {
                    const updated = capturedImages.filter(img => {
                      if (currentActiveTab === 'OVERVIEW') {
                        return img.pillarName !== 'OVERVIEW' && img.pillarName && !img.title.toLowerCase().includes('tổng quan');
                      }
                      return img.pillarName !== currentActiveTab;
                    });
                    saveCaptures(updated);
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xoá tất cả {currentActiveTab === 'OVERVIEW' ? 'Tổng quan' : currentActiveTab}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Empty state: full drag & drop container */}
        {filteredCapturedImages.length === 0 ? (
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragging 
                ? 'border-[#10B5A5] bg-teal-50/40 scale-[0.99]' 
                : 'border-slate-300 hover:border-[#10B5A5] hover:bg-slate-100/30'
            }`}
            onClick={() => {
              const el = document.getElementById('manual-screenshot-upload-empty');
              if (el) el.click();
            }}
          >
            <input 
              type="file" 
              id="manual-screenshot-upload-empty" 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange}
            />
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-3 group-hover:bg-teal-50 group-hover:text-[#10B5A5] transition-all">
              <Upload className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-700">Chưa có ảnh chụp màn hình nào trong pillar này</h4>
            <p className="text-xs text-slate-500 mt-1.5 max-w-md">
              Hệ thống hỗ trợ chụp tự động, tuy nhiên nếu ảnh chụp bị mờ hoặc bị chặn bởi đăng nhập Facebook, bạn có thể **Kéo & Thả ảnh chụp màn hình của bạn vào đây** hoặc click để chọn tải ảnh lên thủ công.
            </p>
            <div className="mt-4 px-4 py-2 bg-[#10B5A5] text-white font-semibold text-xs rounded-lg shadow-sm hover:bg-teal-600 transition-all">
              Tải ảnh lên cho {currentActiveTab === 'OVERVIEW' ? 'Tổng quan' : currentActiveTab}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {/* Standard manual upload card inside grid */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[160px] p-2 ${
                isDragging 
                  ? 'border-[#10B5A5] bg-teal-50/40 scale-[0.98]' 
                  : 'border-slate-300 hover:border-[#10B5A5] hover:bg-slate-100/30'
              }`}
              onClick={() => {
                const el = document.getElementById('manual-screenshot-upload-grid');
                if (el) el.click();
              }}
            >
              <input 
                type="file" 
                id="manual-screenshot-upload-grid" 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange}
              />
              <Upload className="w-5 h-5 text-slate-400 mb-1.5" />
              <p className="text-[10px] font-bold text-slate-600">Thêm ảnh cho {currentActiveTab === 'OVERVIEW' ? 'Tổng quan' : currentActiveTab}</p>
            </div>

            {/* List of captured screenshots */}
            {filteredCapturedImages.map((img) => (
              <div key={img.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all group flex flex-col">
                <div className="p-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-1.5">
                  {editingImgId === img.id ? (
                    <div className="flex-1 min-w-0 flex items-center gap-1 bg-white p-1 rounded border border-slate-200">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTitle(img.id);
                          if (e.key === 'Escape') setEditingImgId(null);
                        }}
                        onBlur={() => {
                          // Allow buttons to fire before blur reset
                          setTimeout(() => {
                            if (editingImgId === img.id) {
                              handleSaveTitle(img.id);
                            }
                          }, 250);
                        }}
                        className="w-full text-[11px] font-bold px-1 py-0.5 bg-transparent border-none outline-none text-slate-800"
                        autoFocus
                        placeholder="Nhập tên ảnh..."
                      />
                      <button 
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSaveTitle(img.id);
                        }}
                        className="p-1 hover:bg-emerald-50 text-emerald-600 rounded transition-all cursor-pointer shrink-0"
                        title="Lưu"
                      >
                        <Check className="w-3 h-3 font-bold" />
                      </button>
                      <button 
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setEditingImgId(null);
                        }}
                        className="p-1 hover:bg-rose-50 text-rose-500 rounded transition-all cursor-pointer shrink-0"
                        title="Huỷ"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="max-w-[55%] truncate">
                      <div 
                        className="flex items-center gap-1 cursor-pointer hover:text-[#10B5A5] group/title min-w-0"
                        onClick={() => {
                          setEditingImgId(img.id);
                          setEditingTitle(img.title);
                        }}
                        title="Click để đổi tên ảnh"
                      >
                        <h4 className="text-xs font-bold text-slate-700 truncate" title={img.title}>{img.title}</h4>
                        <Pencil className="w-2.5 h-2.5 text-slate-400 group-hover/title:text-[#10B5A5] opacity-0 group-hover/title:opacity-100 transition-all shrink-0" />
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">{img.timestamp}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-0.5">
                    {/* Recapture Action */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        recaptureScreenshot(img);
                      }}
                      disabled={screenshotLoading[img.id] || (isCapturing && img.type === 'ELEMENT')}
                      className="p-1 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 rounded-lg transition-all cursor-pointer flex items-center"
                      title="Chụp lại ảnh minh chứng cho liên kết hoặc bảng này"
                    >
                      {screenshotLoading[img.id] ? (
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      {colsCount < 3 && <span className="text-[10px] font-bold ml-1 hidden sm:inline">Chụp lại</span>}
                    </button>

                    {/* Expand/Collapse Height Action */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedImages(prev => ({ ...prev, [img.id]: !prev[img.id] }));
                      }}
                      className={`p-1 rounded-lg transition-all cursor-pointer flex items-center gap-0.5 ${
                        expandedImages[img.id]
                          ? 'text-[#10B5A5] bg-teal-50 font-bold border border-teal-100'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                      title={expandedImages[img.id] ? "Thu gọn ảnh về kích thước gốc" : "Mở rộng hiển thị đầy đủ chiều dọc ảnh ngoài dashboard"}
                    >
                      {expandedImages[img.id] ? (
                        <>
                          <Minimize2 className="w-3 h-3" />
                          {colsCount < 3 && <span className="text-[10px] font-bold hidden sm:inline">Thu gọn</span>}
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3 h-3" />
                          {colsCount < 3 && <span className="text-[10px] font-bold hidden sm:inline">Xem đầy đủ</span>}
                        </>
                      )}
                    </button>

                    <a
                      href={img.url}
                      download={`${img.title.replace(/\s+/g, '_')}_${img.id}.png`}
                      className="p-1 text-[#10B5A5] hover:bg-teal-50 rounded-lg transition-all"
                      title="Tải ảnh xuống"
                    >
                      <Download className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => saveCaptures(capturedImages.filter(c => c.id !== img.id))}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                      title="Xoá ảnh"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 bg-slate-50 relative group/img overflow-hidden border-b border-slate-100">
                  {/* Image viewport - height dynamically set based on expansion */}
                  <div 
                    className={`${
                      expandedImages[img.id] 
                        ? "h-auto overflow-visible" 
                        : "max-h-[360px] h-auto overflow-y-auto"
                    } cursor-zoom-in scrollbar-thin scrollbar-thumb-slate-300 relative`}
                    onClick={() => {
                      setActiveLightboxImg({ id: img.id, url: img.url, title: img.title });
                      setLightboxFitMode('fit');
                      setZoomLevel(1000);
                    }}
                    title="Cuộn chuột để xem chi tiết / Click để phóng to toàn màn hình"
                  >
                    <img 
                      src={img.url} 
                      alt={img.title} 
                      className="w-full h-auto object-top bg-white transition-all duration-200 group-hover/img:brightness-95"
                      style={{ 
                        imageRendering: '-webkit-optimize-contrast'
                      }}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  
                  {/* Pinned action buttons on hover - top positioned for accessibility */}
                  <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none opacity-0 group-hover/img:opacity-100 transition-opacity duration-200">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedImages(prev => ({ ...prev, [img.id]: !prev[img.id] }));
                      }}
                      className="bg-slate-900/90 hover:bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md pointer-events-auto backdrop-blur-sm transition-all cursor-pointer"
                    >
                      {expandedImages[img.id] ? (
                        <>
                          <Minimize2 className="w-3 h-3 text-amber-400" />
                          Thu gọn dọc
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3 h-3 text-[#10B5A5]" />
                          Mở rộng dọc
                        </>
                      )}
                    </button>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveLightboxImg({ id: img.id, url: img.url, title: img.title });
                        setLightboxFitMode('fit');
                        setZoomLevel(1000);
                      }}
                      className="bg-slate-900/90 hover:bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md pointer-events-auto backdrop-blur-sm transition-all cursor-pointer"
                    >
                      <Eye className="w-3 h-3 text-[#10B5A5]" />
                      Xem phóng to
                    </button>
                  </div>

                  {/* Extra UX indicator: banner at the bottom of expanded view to easily collapse back */}
                  {expandedImages[img.id] && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedImages(prev => ({ ...prev, [img.id]: false }));
                      }}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 border-t border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-amber-500" />
                      Thu gọn ảnh chụp lên trên
                    </button>
                  )}
                </div>


                
                {/* Accordion for captured links within this screenshot */}
                {img.posts && img.posts.length > 0 && (
                  <div className="p-3 bg-slate-50 border-t border-slate-100 text-xs">
                    <details className="group">
                      <summary className="list-none flex items-center justify-between font-semibold text-slate-600 cursor-pointer select-none">
                        <span className="flex items-center gap-1.5">
                          <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                          Link trích xuất trong ảnh ({img.posts.filter(p => p.link || isUrl(p.post)).length})
                        </span>
                        <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform duration-200">▼</span>
                      </summary>
                      <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] text-slate-400">Danh sách link gốc của các bài đăng:</span>
                          <button
                            onClick={() => img.posts && copyPostLinks(img.posts)}
                            className="bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-100 text-[10px] px-2 py-0.5 rounded font-semibold cursor-pointer"
                          >
                            Sao chép tất cả
                          </button>
                        </div>
                        {img.posts.filter(p => p.link || isUrl(p.post)).map((post, idx) => {
                          const linkUrl = post.link || (post.post.startsWith('http') ? post.post : `https://${post.post}`);
                          return (
                            <div key={idx} className="flex items-center justify-between py-1 px-1.5 hover:bg-white rounded transition-colors text-[11px]">
                              <span className="text-slate-600 truncate max-w-[70%]" title={post.post}>
                                {idx + 1}. {post.post}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <a 
                                  href={linkUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-indigo-500 hover:text-indigo-600 font-semibold"
                                >
                                  Mở
                                </a>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(linkUrl);
                                    setToastMessage('Đã sao chép link!');
                                    setTimeout(() => setToastMessage(''), 2000);
                                  }}
                                  className="text-teal-600 hover:text-teal-700 font-semibold cursor-pointer"
                                >
                                  Copy
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {img.posts.filter(p => p.link || isUrl(p.post)).length === 0 && (
                          <div className="text-center py-2 text-slate-400 text-[11px]">
                            Không tìm thấy link trong ảnh này.
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast Message HUD Overlay */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900/95 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-slate-800 z-[9999] backdrop-blur-sm transition-all duration-300">
          <Sparkles className="w-4 h-4 text-[#10B5A5]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Lightbox / Full Size Image Modal */}
      {activeLightboxImg && (
        <div 
          className="fixed inset-0 bg-black/95 backdrop-blur-md z-[10000] flex flex-col justify-between p-4 md:p-6 transition-all duration-300 animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveLightboxImg(null);
            }
          }}
        >
          {/* Header */}
          <div 
            className="flex flex-col sm:flex-row sm:items-center justify-between text-white pb-3 border-b border-white/10 gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-full sm:max-w-[45%] flex flex-col gap-1">
              <div className="flex items-center gap-2 overflow-hidden">
                {activeImgIndex !== -1 && (
                  <span className="bg-[#10B5A5]/20 text-[#10B5A5] font-mono text-[11px] px-2 py-0.5 rounded-full border border-[#10B5A5]/30 font-bold shrink-0">
                    Ảnh {activeImgIndex + 1} / {capturedImages.length}
                  </span>
                )}
                <h3 className="text-sm font-bold truncate text-white" title={activeLightboxImg.title}>{activeLightboxImg.title}</h3>
              </div>
            </div>
            
            {/* Interactive Zoom Toolbar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Zoom slider controls */}
              <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1 border border-white/5 shadow-inner">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newZoom = Math.max(300, zoomLevel - 100);
                    setZoomLevel(newZoom);
                    setLightboxFitMode('custom');
                  }}
                  className="p-1 hover:bg-white/10 text-white rounded transition-all cursor-pointer flex items-center justify-center"
                  title="Thu nhỏ ảnh"
                >
                  <ZoomOut className="w-4 h-4 text-white/70 hover:text-white" />
                </button>
                
                <input 
                  type="range" 
                  min="350" 
                  max="2400" 
                  step="50" 
                  value={lightboxFitMode === 'fit' ? 550 : zoomLevel} 
                  onChange={(e) => {
                    e.stopPropagation();
                    setLightboxFitMode('custom');
                    setZoomLevel(Number(e.target.value));
                  }}
                  className="w-20 xs:w-28 sm:w-36 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#10B5A5] focus:outline-none"
                  title="Kéo để điều chỉnh độ to nhỏ"
                />
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newZoom = Math.min(2400, zoomLevel + 100);
                    setZoomLevel(newZoom);
                    setLightboxFitMode('custom');
                  }}
                  className="p-1 hover:bg-white/10 text-white rounded transition-all cursor-pointer flex items-center justify-center"
                  title="Phóng to ảnh"
                >
                  <ZoomIn className="w-4 h-4 text-[#10B5A5]" />
                </button>
                
                <span className="text-[10px] font-mono text-white/80 min-w-[50px] text-center select-none bg-black/30 px-1 py-0.5 rounded">
                  {lightboxFitMode === 'fit' ? 'Vừa khít' : `${zoomLevel}px`}
                </span>
              </div>

              {/* View options */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxFitMode(prev => prev === 'fit' ? 'custom' : 'fit');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                  lightboxFitMode === 'fit' 
                    ? 'bg-[#10B5A5] text-white border-transparent shadow-md shadow-teal-900/30' 
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/5'
                }`}
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Xem vừa khít</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxFitMode('custom');
                  setZoomLevel(1000);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                  lightboxFitMode === 'custom' && zoomLevel === 1000
                    ? 'bg-amber-500 text-slate-950 border-transparent shadow-md' 
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/5'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Cỡ rõ nét (1000px)</span>
              </button>

              <button 
                onClick={() => setActiveLightboxImg(null)}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                Đóng (✕)
              </button>
            </div>
          </div>

          {/* Image Canvas Viewport with Left/Right Navigation Overlay Controls */}
          <div className="flex-1 relative flex items-center justify-between group/lightbox-nav my-4">
            {/* Left navigation arrow */}
            {filteredCapturedImages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = filteredCapturedImages.findIndex(img => img.id === activeLightboxImg.id);
                  if (idx !== -1) {
                    const prevIdx = (idx - 1 + filteredCapturedImages.length) % filteredCapturedImages.length;
                    const prevImg = filteredCapturedImages[prevIdx];
                    setActiveLightboxImg(prevImg);
                  }
                }}
                className="absolute left-4 z-[10010] p-4 bg-slate-900/85 hover:bg-[#10B5A5] hover:scale-110 active:scale-95 text-white/80 hover:text-white rounded-full border border-white/10 shadow-2xl transition-all cursor-pointer backdrop-blur-md flex items-center justify-center group/btn opacity-70 hover:opacity-100"
                title="Ảnh trước (Phím mũi tên Trái ◀)"
              >
                <ChevronLeft className="w-6 h-6 md:w-8 md:h-8 transition-transform group-hover/btn:-translate-x-0.5" />
              </button>
            )}

            {/* Viewport Box */}
            <div className={`flex-1 h-full overflow-auto flex justify-center min-h-0 bg-slate-950/40 rounded-xl border border-white/5 ${
              lightboxFitMode === 'fit' ? 'items-center p-2 md:p-4' : 'items-start'
            }`}>
              {lightboxFitMode === 'fit' ? (
                <div 
                  className="w-full h-full max-h-[78vh] flex justify-center items-center relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img 
                    src={activeLightboxImg.url} 
                    alt={activeLightboxImg.title} 
                    className="max-h-[78vh] max-w-[95vw] md:max-w-[90vw] w-auto h-auto object-contain border border-white/10 rounded-lg shadow-2xl bg-white select-none transition-all duration-200"
                    style={{ 
                      imageRendering: '-webkit-optimize-contrast', 
                      transform: 'translateZ(0)',
                      backfaceVisibility: 'hidden'
                    }}
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div 
                  className="w-full h-full overflow-auto flex justify-center items-start p-4 md:p-8"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img 
                    src={activeLightboxImg.url} 
                    alt={activeLightboxImg.title} 
                    className="max-w-none border border-white/10 rounded shadow-2xl bg-white transition-all duration-150 ease-out"
                    style={{ width: `${zoomLevel}px`, imageRendering: '-webkit-optimize-contrast' }}
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            {/* Right navigation arrow */}
            {filteredCapturedImages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = filteredCapturedImages.findIndex(img => img.id === activeLightboxImg.id);
                  if (idx !== -1) {
                    const nextIdx = (idx + 1) % filteredCapturedImages.length;
                    const nextImg = filteredCapturedImages[nextIdx];
                    setActiveLightboxImg(nextImg);
                  }
                }}
                className="absolute right-4 z-[10010] p-4 bg-slate-900/85 hover:bg-[#10B5A5] hover:scale-110 active:scale-95 text-white/80 hover:text-white rounded-full border border-white/10 shadow-2xl transition-all cursor-pointer backdrop-blur-md flex items-center justify-center group/btn opacity-70 hover:opacity-100"
                title="Ảnh sau (Phím mũi tên Phải ▶)"
              >
                <ChevronRight className="w-6 h-6 md:w-8 md:h-8 transition-transform group-hover/btn:translate-x-0.5" />
              </button>
            )}
          </div>

          {/* Footer controls */}
          <div 
            className="flex flex-col sm:flex-row items-center justify-between text-xs text-white/60 pt-2 border-t border-white/10 gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="hidden sm:inline">
              Mẹo: Bạn có thể điều chỉnh nút gạt thu phóng ở trên, hoặc click nút "Cỡ rõ nét" để xem hình ở kích thước 100% rõ nét không bị nhòe.
            </span>
            <span className="sm:hidden text-[10px]">
              Chế độ hiển thị: {lightboxFitMode === 'fit' ? 'Vừa màn hình' : `Phóng to ${zoomLevel}px`}
            </span>
            <a
              href={activeLightboxImg.url}
              download={`${activeLightboxImg.title.replace(/\s+/g, '_')}.png`}
              className="px-3 py-1.5 bg-[#10B5A5] hover:bg-[#10B5A5]/90 active:bg-teal-600 text-white font-bold rounded-lg transition-all flex items-center gap-1 shrink-0 shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="w-3.5 h-3.5" /> Tải ảnh gốc rõ nét
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
