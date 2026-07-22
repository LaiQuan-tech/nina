// 前端可安全 import 的純型別（不含任何 server-only 程式碼）。
export type { ParseResult, Segments, SegErr } from "./types";

export type ChatTurn = { role: "user" | "model"; text: string };
