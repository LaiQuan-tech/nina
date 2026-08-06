export type UploadBatchSummary = {
  successCount: number;
  failureCount: number;
  canFinish: boolean;
};

export function summarizeUploadBatch(results: boolean[]): UploadBatchSummary {
  const successCount = results.filter(Boolean).length;
  const failureCount = results.length - successCount;
  return { successCount, failureCount, canFinish: successCount > 0 };
}
