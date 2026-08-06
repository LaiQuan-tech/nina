// 圖片位。有圖顯示圖，沒圖 fallback 成設計稿的條紋佔位＋mono 說明標籤。
// 一律填滿父層容器（父層負責尺寸／圓角／overflow），且只用 phrasing content，
// 這樣放進 <button>（服務卡、作品格）仍是合法 HTML。
export type SlotImage = { url: string; alt: string; width?: number; height?: number } | null;

export default function Slot({
  image,
  label,
  dark = false,
  center = false,
  eager = false,
}: {
  image?: SlotImage;
  label: string;
  dark?: boolean;
  center?: boolean;
  eager?: boolean;
}) {
  if (image?.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image.url}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="mei-slot-img"
      />
    );
  }
  return (
    <span
      className={["mei-slot", dark ? "mei-slot-dark" : "", center ? "mei-slot-c" : ""]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={`${label.replace(/[［］]/g, "").trim()}（照片尚未提供）`}
    >
      <span className="mei-slot-label" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
