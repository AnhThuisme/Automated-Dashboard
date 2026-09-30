/**
 * useServerSync - Đồng bộ trạng thái ứng dụng qua local server API.
 * Hoạt động xuyên suốt các tab thường và tab ẩn danh vì tất cả đều gọi
 * cùng một endpoint http://localhost:3000/api/sync-state.
 */

const SYNC_ENDPOINT = '/api/sync-state';
const SYNC_INTERVAL_MS = 3000; // Poll mỗi 3 giây ở tab ẩn danh / tab khác

export interface SyncState {
  config?: Record<string, unknown>;
  sheetsList?: string[];
  kpiConfig?: Record<string, unknown>;
  groups?: unknown[];
  lastUpdated?: string;
  logs?: unknown[];
  _savedAt?: number;
}

/** Đọc trạng thái từ server */
export async function loadSyncState(): Promise<SyncState | null> {
  try {
    const res = await fetch(SYNC_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: SyncState & { exists?: boolean } = await res.json();
    if (data.exists === false) return null;
    return data;
  } catch {
    return null;
  }
}

/** Lưu trạng thái lên server */
export async function saveSyncState(state: SyncState): Promise<boolean> {
  try {
    const res = await fetch(SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state, _savedAt: Date.now() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Bắt đầu polling trạng thái server mỗi SYNC_INTERVAL_MS ms.
 * Trả về hàm để dừng polling.
 * onUpdate được gọi khi server có dữ liệu mới hơn dữ liệu hiện tại.
 */
export function startSyncPolling(
  getCurrentSavedAt: () => number,
  onUpdate: (state: SyncState) => void,
): () => void {
  let stopped = false;
  const poll = async () => {
    if (stopped) return;
    const state = await loadSyncState();
    if (state && state._savedAt && state._savedAt > getCurrentSavedAt()) {
      onUpdate(state);
    }
    if (!stopped) {
      setTimeout(poll, SYNC_INTERVAL_MS);
    }
  };
  poll();
  return () => { stopped = true; };
}
