/**
 * 模組層互斥佇列：同一時間只讓一個 task 執行，其餘依呼叫順序排隊。
 * 前一個 task 成功或失敗都不影響下一個（佇列本身永不 reject；各 task 的結果／錯誤只回給它自己的呼叫端）。
 * 給 PDFium 單例用（lib/thumbnail/renderPdf.ts）：wasm 呼叫本來就同步佔住主執行緒，串行化不損失吞吐，
 * 但能保證同一個 wasm heap 裡一次只有一份文件＋一張點陣圖。
 */
export type SerialQueue = <T>(task: () => Promise<T>) => Promise<T>;

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}
