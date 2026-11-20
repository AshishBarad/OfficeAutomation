/**
 * Temporary In-Memory Store
 *
 * Stored strictly in Node.js process RAM (via globalThis).
 * Persists as long as the application process is running (survives client-side page refreshes).
 * Once the application is killed (process exits), all RAM is automatically freed by the OS,
 * erasing all stored data completely.
 */

declare global {
  var __APP_TEMP_MEMORY__: Map<string, any> | undefined;
  var __APP_INSTANCE_ID__: string | undefined;
}

function getMemoryStore(): Map<string, any> {
  if (!globalThis.__APP_TEMP_MEMORY__) {
    globalThis.__APP_TEMP_MEMORY__ = new Map<string, any>();
  }
  return globalThis.__APP_TEMP_MEMORY__;
}

export function getInstanceId(): string {
  if (!globalThis.__APP_INSTANCE_ID__) {
    globalThis.__APP_INSTANCE_ID__ =
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  return globalThis.__APP_INSTANCE_ID__;
}

export function getTempMemory<T>(key: string): { data: T | null; instanceId: string } {
  const store = getMemoryStore();
  return {
    data: (store.get(key) as T) ?? null,
    instanceId: getInstanceId(),
  };
}

export function setTempMemory<T>(key: string, data: T): { success: boolean; instanceId: string } {
  const store = getMemoryStore();
  store.set(key, data);
  return {
    success: true,
    instanceId: getInstanceId(),
  };
}

export function clearTempMemory(key?: string): { success: boolean } {
  const store = getMemoryStore();
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
  return { success: true };
}
