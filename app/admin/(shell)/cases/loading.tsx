// 同一區內「列表 ↔ 詳細頁」換頁也要立刻出骨架：(shell)/loading.tsx 只在切換側欄區段時才會重新顯示，
// 列表→詳細頁時那個 Suspense 已經掛著，React 會讓舊畫面停在原地等資料，所以這一層要有自己的 loading。
export { default } from "../loading";
