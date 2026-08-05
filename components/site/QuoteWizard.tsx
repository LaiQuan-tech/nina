"use client";

import { useState } from "react";
import { MATS, FINS, STEPS, CONTACT } from "@/lib/site/data";
import { calcQuote } from "@/lib/site/pricing";
import IntakeFlow from "@/components/intake/IntakeFlow";

const DEMO = [
  { me: false, t: "您好，這次是室內還是室外用？大概要掛多久？我幫您挑材質。" },
  { me: true, t: "戶外，活動三天，兩塊帆布。" },
  { me: false, t: "短期戶外建議無接縫帆布＋車邊打孔。選一下材質與尺寸，我馬上算區間。" },
];

export default function QuoteWizard() {
  const [mat, setMat] = useState(0);
  const [w, setW] = useState(300);
  const [h, setH] = useState(90);
  const [q, setQ] = useState(2);
  const [fins, setFins] = useState<number[]>([0]);
  const [mode, setMode] = useState<"calc" | "intake">("calc");

  const { range, detail } = calcQuote({ mat, w, h, q, fins });

  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    set(Number.isNaN(v) ? 0 : v);
  };

  return (
    <section id="quote" className="s-quote">
      <div className="s-quote-grid">
        {/* 左：說明與五步驟 */}
        <div className="s-quote-l">
          <div className="s-kicker">03 — AI 報價精靈</div>
          <h2 className="s-h2">
            問材質、算價格、
            <br />
            收稿、下單，一次做完
          </h2>
          <p className="s-lead" style={{ marginBottom: 0 }}>
            從詢問用途到成立訂單，一段對話走完。價格區間即時試算，稿件直接上傳並自動檢查檔名；需要議價或特殊工法，隨時轉真人接手。
          </p>

          <div className="s-steps">
            {STEPS.map((s) => (
              <div key={s.n} className="s-step">
                <div className="n">{s.n}</div>
                <div>
                  <div className="t">{s.t}</div>
                  <div className="d">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右：試算面板 ／ 收稿 */}
        <div className="s-quote-r">
          <div className="s-panel">
            <div className="row s-panel-head">
              <span className="l">{mode === "calc" ? "QUOTE WIZARD · 試算" : "UPLOAD · 收稿"}</span>
              <span className="r">
                <i aria-hidden="true" />
                AI 線上
              </span>
            </div>

            {mode === "calc" ? (
              <>
                <div className="row">
                  {DEMO.map((d, i) => (
                    <div key={i} className={`s-bub${d.me ? " me" : ""}`}>
                      {d.t}
                    </div>
                  ))}
                </div>

                <div className="row">
                  <div className="s-field-label">材質（單選）</div>
                  <div className="s-chips" style={{ marginBottom: 0 }}>
                    {MATS.map((m, i) => (
                      <button key={m.name} type="button" className="s-chip" data-on={i === mat ? "true" : "false"} onClick={() => setMat(i)}>
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="row">
                  <div className="s-sizes">
                    <label>
                      <div className="lb">寬 CM</div>
                      <input type="number" inputMode="numeric" value={w} onChange={num(setW)} />
                    </label>
                    <label>
                      <div className="lb">高 CM</div>
                      <input type="number" inputMode="numeric" value={h} onChange={num(setH)} />
                    </label>
                    <label>
                      <div className="lb">數量</div>
                      <input type="number" inputMode="numeric" value={q} onChange={num(setQ)} />
                    </label>
                  </div>
                </div>

                <div className="row">
                  <div className="s-field-label">後加工（可複選）</div>
                  <div className="s-chips" style={{ marginBottom: 0 }}>
                    {FINS.map((f, i) => {
                      const on = fins.includes(i);
                      return (
                        <button
                          key={f.name}
                          type="button"
                          className="s-chip"
                          data-on={on ? "true" : "false"}
                          data-fin="true"
                          onClick={() => setFins(on ? fins.filter((x) => x !== i) : [...fins, i])}
                        >
                          {f.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="row" style={{ padding: 0 }}>
                  <div className="s-est">
                    <div className="lb">估價區間 ／ 未稅</div>
                    <div className="v">{range}</div>
                    <div className="d">{detail}</div>
                  </div>
                </div>

                <div className="row">
                  <div className="s-actions">
                    <button type="button" className="s-btn s-btn-ink a" onClick={() => setMode("intake")}>
                      上傳稿件並成立訂單
                    </button>
                    <a className="s-btn" href={CONTACT.line} target="_blank" rel="noopener noreferrer">
                      轉真人／LINE
                    </a>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="row" style={{ padding: 0 }}>
                  <div className="s-est">
                    <div className="lb">本次估價 ／ 未稅</div>
                    <div className="v">{range}</div>
                    <div className="d">{detail}</div>
                  </div>
                </div>
                <div className="row">
                  <IntakeFlow />
                </div>
                <div className="row">
                  <div className="s-actions">
                    <button type="button" className="s-btn a" onClick={() => setMode("calc")}>
                      ← 回試算
                    </button>
                    <a className="s-btn" href={CONTACT.line} target="_blank" rel="noopener noreferrer">
                      轉真人／LINE
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>

          <p style={{ fontSize: 12.5, color: "var(--s-dim)", marginTop: 12, lineHeight: 1.6 }}>
            ＊估價為參考區間，非最終報價；實際以稿件、材質與後加工由業務確認。
          </p>
        </div>
      </div>
    </section>
  );
}
