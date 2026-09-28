/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // client router 對動態頁的快取秒數（Next 14 預設 30 秒）。後台是營運工具：同事剛改、掃描站剛回報，
    // 換頁就要看到最新資料，所以設 0 一律重抓；loading 骨架仍會被 Link 預取、點下去立刻顯示。
    // 注意：瀏覽器「上一頁／下一頁」依 Next 設計仍會直接還原當時畫面，不受這個設定影響。
    staleTimes: { dynamic: 0 },
    // @hyzyla/pdfium 被 webpack 打包後，ESM 版取 createRequire 的寫法會壞（init 丟 TypeError: e is not a function），
    // PDF／.ai 縮圖因此從未產成功。改成不打包、執行時直接 require node_modules，pdfium.wasm 也會被檔案追蹤帶進函式。
    serverComponentsExternalPackages: ["@hyzyla/pdfium"],
  },
};

export default nextConfig;
