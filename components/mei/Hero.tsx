import Slot, { type SlotImage } from "@/components/mei/Slot";
import OpenChatButton from "@/components/mei/OpenChatButton";
import { HERO_STATS } from "@/lib/site/content";

// Hero：桌機左文右圖（1fr / 1.05fr）；手機圖移到標題上方、高 260px。
export default function Hero({ image }: { image?: SlotImage }) {
  return (
    <section id="top" className="mei-page mei-hero">
      <div className="mei-hero-l">
        <p className="mei-kicker" style={{ margin: 0 }}>
          <span className="dot" aria-hidden="true">
            ●
          </span>
          FTP 24 小時收檔
        </p>

        <h1 className="mei-h1">
          你的招牌，
          <br />
          從這裡開始
          <span className="m">。</span>
        </h1>

        <p className="mei-lead">
          二十餘年大圖輸出經驗，機台自有、材質齊全。
          <br />
          報價、審稿、施工一次到位。
        </p>

        <div className="mei-hero-btns">
          <OpenChatButton>找 AI 幫我報價</OpenChatButton>
          <a href="#works" className="mei-btn mei-btn-ghost" role="button">
            看作品集
          </a>
        </div>

        <div className="mei-stats">
          {HERO_STATS.map((s) => (
            <div key={s.k}>
              <div className="v">
                {s.v}
                <small>{s.u}</small>
              </div>
              <div className="k">{s.k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mei-hero-img">
        <Slot image={image} label="［ 主視覺 — 現場施工／大圖近拍 ］" eager />
      </div>
    </section>
  );
}
