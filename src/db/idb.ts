/**
 * IndexedDB 管理器：单例连接 + Promise 化事务。
 * D-01 裁决：初始化失败显式报错，不静默降级到内存。
 */
import { DB_NAME, DB_VERSION, STORES } from "./schema";

let _db: IDBDatabase | null = null;
let _ready: Promise<IDBDatabase> | null = null;

/** 打开（或创建）DB，自动建 16 store + 索引。 */
export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_ready) return _ready;

  _ready = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s.name)) {
          const os = db.createObjectStore(s.name, {
            keyPath: s.keyPath,
            autoIncrement: s.autoIncrement,
          });
          for (const idx of s.indexes ?? []) {
            os.createIndex(idx.name, idx.keyPath, {
              unique: idx.unique,
              multiEntry: idx.multiEntry,
            });
          }
        }
      }
      // 写系统元数据：schema 版本（upgradeneeded 内 req.transaction 非空）
      const sys = req.transaction!.objectStore("system");
      sys.put({ key: "schema_version", value: String(DB_VERSION) });
      sys.put({ key: "db_name", value: DB_NAME });
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onerror = () => {
      // 显式报错，不静默降级（D-01）
      const err = req.error?.message ?? "unknown IndexedDB open failure";
      _ready = null;
      reject(new Error(`IndexedDB open failed: ${err}`));
    };
  });

  return _ready;
}

/** 关闭 DB（仅用于测试或 S9 降级）。 */
export function closeDB(): void {
  if (_db) {
    _db.close();
    _db = null;
    _ready = null;
  }
}

/** 事务包装：指定 store 名数组 + readwrite 标志 + 回调。 */
export function tx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => T,
): Promise<T> {
  return openDB().then((db) =>
    new Promise<T>((resolve, reject) => {
      const names = typeof storeNames === "string" ? [storeNames] : storeNames;
      const transaction = db.transaction(names, mode);
      try {
        const result = fn(transaction);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(new Error(transaction.error?.message ?? "tx failed"));
        transaction.onabort = () => reject(new Error("tx aborted"));
      } catch (e) {
        transaction.abort();
        reject(e);
      }
    }),
  );
}

/** ---- 便捷 CRUD ---- */

export async function put<T>(storeName: string, value: T): Promise<T> {
  return tx(storeName, "readwrite", (t) => {
    const req = t.objectStore(storeName).put(value);
    return req.result ? value : value; // put 回写原始对象
  });
}

export async function putMany<T>(storeName: string, values: T[]): Promise<void> {
  return tx(storeName, "readwrite", (t) => {
    const os = t.objectStore(storeName);
    for (const v of values) os.put(v);
  });
}

export async function get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return tx(storeName, "readonly", (t) => {
    const os = t.objectStore(storeName);
    const req = os.get(key);
    return req.result as T | undefined;
  });
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  return tx(storeName, "readonly", (t) => {
    const os = t.objectStore(storeName);
    const req = os.getAll();
    return req.result as T[];
  });
}

export async function getAllBy<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  return tx(storeName, "readonly", (t) => {
    const idx = t.objectStore(storeName).index(indexName);
    const req = idx.getAll(value);
    return req.result as T[];
  });
}

export async function deleteKey(storeName: string, key: IDBValidKey): Promise<void> {
  return tx(storeName, "readwrite", (t) => {
    t.objectStore(storeName).delete(key);
  });
}

export async function clear(storeName: string): Promise<void> {
  return tx(storeName, "readwrite", (t) => {
    t.objectStore(storeName).clear();
  });
}

/** 计数（S3 门禁：断言 16 store 可读写）。 */
export async function count(storeName: string): Promise<number> {
  return tx(storeName, "readonly", (t) => {
    const req = t.objectStore(storeName).count();
    return req.result ?? 0;
  });
}
