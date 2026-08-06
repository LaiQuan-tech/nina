import Slot, { type SlotImage } from "@/components/mei/Slot";
import OpenChatButton from "@/components/mei/OpenChatButton";
import { HERO_STATS } from "@/lib/site/content";

// Hero：桌機左文右圖（1fr / 1.05fr）；手機圖移到標題上方、高 260px。
export default function Hero({ image, mobileImage }: { image?: SlotImage; mobileImage?: SlotImage }) {
  const fallbackImage = image ?? mobileImage;

  return (
    <section id="top" className="mei-page mei-hero">
      <div className="mei-hero-l">
        <p className="mei-kicker" style={{ margin: 0 }} data-reveal>
          <span className="dot" aria-hidden="true">
            ●
          </span>
          FTP 24 小時收檔
        </p>

        <h1 className="mei-h1" data-reveal data-d="1">
          你的招牌，
          <br />
          從這裡開始
          <span className="m">。</span>
        </h1>

        <p className="mei-lead" data-reveal data-d="2">
          二十餘年大圖輸出經驗，機台自有、材質齊全。
          <br />
          報價、審稿、施工一次到位。
        </p>

        <div className="mei-hero-btns" data-reveal data-d="3">
          <OpenChatButton>找 AI 幫我報價</OpenChatButton>
          <a href="#works" className="mei-btn mei-btn-ghost" role="button">
            看作品集
          </a>
        </div>

        <div className="mei-stats" data-reveal data-d="4">
          {HERO_STATS.map((s) => (
            <div key={s.k}>
              <div className="v">
                <span data-count={s.v}>{s.v}</span>
                <small>{s.u}</small>
              </div>
              <div className="k">{s.k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mei-hero-img" data-reveal="zoom">
        {fallbackImage?.url ? (
          <picture>
            {image?.url ? <source media="(min-width: 640px)" srcSet={image.url} /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mobileImage?.url ?? fallbackImage.url}
              alt={mobileImage?.alt ?? fallbackImage.alt}
              width={mobileImage?.width ?? fallbackImage.width}
              height={mobileImage?.height ?? fallbackImage.height}
              loading="eager"
              decoding="async"
              className="mei-slot-img"
            />
          </picture>
        ) : (
          <Slot label="［ 主視覺 — 現場施工／大圖近拍 ］" eager />
        )}
      </div>
    </section>
  );
}
