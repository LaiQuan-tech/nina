/**
 * Vercel Cron 觸發排程任務時，若在 dashboard 幫這個 cron job 設定過，平台會自動帶
 * `Authorization: Bearer <CRON_SECRET>`（CRON_SECRET 是專案的環境變數）。
 * expectedSecret 沒設定（undefined／空字串）一律視為未通過——不能讓「忘記在 Vercel 設
 * CRON_SECRET」意外變成「這支端點對任何人開放」。
 */
export function isValidCronSecret(authHeader: string | null | undefined, expectedSecret: string | undefined): boolean {
  return Boolean(expectedSecret) && authHeader === `Bearer ${expectedSecret}`;
}
