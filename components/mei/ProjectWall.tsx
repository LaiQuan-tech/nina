"use client";

import { useEffect, useState } from "react";
import Slot, { type SlotImage } from "@/components/mei/Slot";
import { WORKS, WORK_CATS } from "@/lib/site/content";

// 近期作品：深色滿版照片牆（大格 2×2、兩格 1×1、末格 2×1），分類篩選 + lightbox。
// 手機 2 欄、平板 3 欄、桌機 4 欄。
export default function ProjectWall({ images }: { images?: Record<string, SlotImage> }) {
  const [cat, setCat] = useState<string>("全部");
  const [lb, setLb] = useState<number | null>(null);

  const shown = cat === "全部" ? WORKS : WORKS.filter((w) => w.cat === cat);

  useEffect(() => {
    if (lb === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLb(null);
      if (e.key === "ArrowRight") setLb((i) => (i === null ? i : (i + 1) % shown.length));
      if (e.key === "ArrowLeft") setLb((i) => (i === null ? i : (i - 1 + shown.length) % shown.length));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [lb, shown.length]);

  const cur = lb === null ? null : shown[lb];

  return (
    <section id="works" className="mei-works">
      <div className="mei-page mei-pad">
        <div className="mei-sec-head" style={{ marginBottom: 20 }} data-reveal>
          <h2 className="mei-h2">近期作品</h2>
          <div className="mei-hscroll mei-axis" role="group" aria-label="作品分類">
            {WORK_CATS.map((c) => (
              <button
                key={c}
                type="button"
                className="mei-chip mei-chip-dark"
                data-on={cat === c ? "true" : "false"}
                aria-pressed={cat === c}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="mei-works-empty">這個分類的作品照整理中，可先來電或加 LINE 洽詢。</p>
        ) : (
          <div className="mei-grid">
            {shown.map((w, i) => (
              <button
                key={w.id}
                type="button"
                className="mei-work"
                data-span={cat === "全部" ? w.span : "1x1"}
                data-reveal
                data-d={Math.min(i, 3)}
                onClick={() => setLb(i)}
                aria-label={`放大檢視：${w.title}`}
              >
                {/* 有圖才另外壓標題；沒圖時佔位本身已經有 mono 標籤，避免疊字 */}
                <Slot image={images?.[w.id]} label={`［ ${w.title} ］`} dark />
                {images?.[w.id]?.url ? <span className="cap">{w.title}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {cur && (
        <div className="mei-lb" role="dialog" aria-modal="true" aria-label={cur.title}>
          <button type="button" className="mei-lb-btn mei-lb-close" aria-label="關閉" onClick={() => setLb(null)}>
            ✕
          </button>
          {shown.length > 1 && (
            <>
              <button
                type="button"
                className="mei-lb-btn mei-lb-prev"
                aria-label="上一件"
                onClick={() => setLb((i) => (i === null ? i : (i - 1 + shown.length) % shown.length))}
              >
                ‹
              </button>
              <button
                type="button"
                className="mei-lb-btn mei-lb-next"
                aria-label="下一件"
                onClick={() => setLb((i) => (i === null ? i : (i + 1) % shown.length))}
              >
                ›
              </button>
            </>
          )}
          {images?.[cur.id]?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[cur.id]!.url} alt={images[cur.id]!.alt} />
          ) : (
            <span className="mei-slot mei-slot-dark mei-slot-c ph" role="img" aria-label={`${cur.title}（照片尚未提供）`}>
              <span className="mei-slot-label" aria-hidden="true">
                {cur.slot}
              </span>
            </span>
          )}
          <p className="mei-lb-cap">
            {cur.title}　·　{cur.cat}
          </p>
        </div>
      )}
    </section>
  );
}
