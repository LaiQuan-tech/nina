"use client";

import { useState } from "react";
import { WORKS, CATS } from "@/lib/site/data";

export default function Works() {
  const [cat, setCat] = useState("全部");
  const works = cat === "全部" ? WORKS.slice(0, 8) : WORKS.filter((w) => w.cat === cat);

  return (
    <section id="works" className="s-sec s-pad">
      <div className="s-sec-head">
        <div>
          <div className="s-kicker">04 — PROJECTS</div>
          <h2 className="s-h2">作品展示</h2>
        </div>
        <div className="s-mono" style={{ fontSize: 12, letterSpacing: ".12em", color: "var(--s-dim)" }}>
          {works.length} 件案例
        </div>
      </div>

      <div className="s-chips">
        {CATS.map((c) => (
          <button key={c} type="button" className="s-chip" data-on={c === cat ? "true" : "false"} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="s-gridlines s-works">
        {works.map((w) => (
          <div key={w.title} className="s-work">
            <div className="s-slot">
              <span className="s-slot-label">{w.slot}</span>
            </div>
            <div className="body">
              <div className="cat">
                <i style={{ background: w.c }} aria-hidden="true" />
                {w.cat}
              </div>
              <div className="t">{w.title}</div>
              <div className="m">{w.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
