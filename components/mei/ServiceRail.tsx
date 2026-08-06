"use client";

import { useMemo, useRef, useState } from "react";
import Slot, { type SlotImage } from "@/components/mei/Slot";
import { openChat } from "@/components/mei/OpenChatButton";
import { AXES, SERVICES, type AxisKey } from "@/lib/site/content";

// 服務項目：三軸切換（依用途／依材質／依製程）＋橫向捲動卡片列。
// 切換時依該軸的分組重新排序，卡片上方顯示所屬分組。
export default function ServiceRail({ images }: { images?: Record<string, SlotImage> }) {
  const [axis, setAxis] = useState<AxisKey>("use");
  const railRef = useRef<HTMLDivElement>(null);

  const cards = useMemo(() => {
    const groups: string[] = [];
    for (const s of SERVICES) if (!groups.includes(s[axis])) groups.push(s[axis]);
    return groups.flatMap((g) => SERVICES.filter((s) => s[axis] === g).map((s) => ({ s, g })));
  }, [axis]);

  function scrollBy(dir: 1 | -1) {
    railRef.current?.scrollBy({ left: dir * 246, behavior: "smooth" });
  }

  return (
    <section id="service" className="mei-page mei-sec">
      <div className="mei-sec-head mei-pad" data-reveal>
        <div className="t">
          <div className="mei-kicker">OUR SERVICE</div>
          <h2 className="mei-h2">你要做的是哪一種？</h2>
        </div>
        <div className="mei-hscroll mei-axis" role="group" aria-label="服務分類方式">
          {AXES.map((a) => (
            <button
              key={a.key}
              type="button"
              className="mei-chip"
              data-on={axis === a.key ? "true" : "false"}
              aria-pressed={axis === a.key}
              onClick={() => setAxis(a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mei-rail-wrap">
        <button
          type="button"
          className="mei-rail-nav mei-rail-prev"
          aria-label="上一批服務"
          onClick={() => scrollBy(-1)}
        >
          ‹
        </button>

        <div className="mei-hscroll mei-rail" ref={railRef}>
          {cards.map(({ s, g }, i) => (
            <button
              key={s.slug}
              type="button"
              className="mei-card"
              data-reveal
              data-d={Math.min(i, 3)}
              onClick={() => openChat(`我想問「${s.name}」的價格`)}
            >
              <span className="mei-thumb">
                <Slot image={images?.[`service.${s.slug}`]} label={s.slot} center />
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 5, textAlign: "left" }}>
                <span className="grp">{g}</span>
                <span className="nm">{s.name}</span>
                <span className="note">{s.note}</span>
              </span>
            </button>
          ))}

          <a href="/#service" className="mei-card-all" data-reveal data-d="3">
            <span className="a">看全部服務項目</span>
            <span className="b">15+ 分類 →</span>
          </a>
        </div>

        <button
          type="button"
          className="mei-rail-nav mei-rail-next"
          aria-label="下一批服務"
          onClick={() => scrollBy(1)}
        >
          ›
        </button>
      </div>
    </section>
  );
}
