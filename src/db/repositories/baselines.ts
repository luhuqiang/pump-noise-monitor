/**
 * 基线仓储：IndexedDB baselines store + 停用旧基线事务。
 */
import { getAllBy, put, tx } from "../idb";

export type BaselineRecord = {
  id: string;
  asset_id: string;
  point_id: string | null;
  version: number;
  frames: number;
  buckets: number;
  fingerprint: string;
  created_at: number;
  is_active: number;
};

export async function saveBaseline(
  assetId: string,
  pointId: string | null,
  fingerprint: string,
  frames: number,
  buckets: number,
): Promise<void> {
  const id = `${assetId}-${pointId ?? "global"}-${Date.now()}`;

  // 停用旧基线 + 插入新基线（同事务）
  await tx(["baselines"], "readwrite", (t) => {
    const os = t.objectStore("baselines");
    const idx = os.index("by_asset");

    // 停用：asset_id 匹配 + point_id 匹配
    const old = idx.getAllKeys(assetId);
    old.onsuccess = () => {
      for (const key of old.result) {
        os.get(key).onsuccess = () => {
          const rec = (os.get(key).result as BaselineRecord | undefined);
          if (rec && (rec.point_id ?? "global") === (pointId ?? "global")) {
            rec.is_active = 0;
            os.put(rec);
          }
        };
      }
    };
  });

  // 计算新版本号
  const existing = await getAllBy<BaselineRecord>("baselines", "by_asset", assetId);
  const currentMax = Math.max(0, ...existing.map((b) => b.version ?? 0));

  await put("baselines", {
    id,
    asset_id: assetId,
    point_id: pointId,
    version: currentMax + 1,
    frames,
    buckets,
    fingerprint,
    created_at: Date.now(),
    is_active: 1,
  });
}

export async function getActiveBaseline(
  assetId: string,
  pointId: string | null,
): Promise<BaselineRecord | null> {
  const rows = await getAllBy<BaselineRecord>("baselines", "by_asset", assetId);
  const active = rows.find(
    (r) =>
      r.is_active === 1 &&
      (r.point_id ?? "global") === (pointId ?? "global"),
  );
  return active ?? null;
}
