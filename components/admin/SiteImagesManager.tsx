"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteImageAdminRecord } from "@/lib/site/siteImages";
import { groupAdminImages, replaceAdminImage } from "@/lib/site/siteImagesAdminState";
import { MAX_SITE_IMAGE_BYTES } from "@/lib/site/imageUpload";

type Draft = { file: File; previewUrl: string; width?: number; height?: number };
type Notice = { kind: "success" | "error"; message: string };

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function SiteImagesManager({ initial }: { initial: SiteImageAdminRecord[] }) {
  const [images, setImages] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function setNotice(slotKey: string, notice: Notice) {
    setNotices((current) => ({ ...current, [slotKey]: notice }));
  }

  function chooseFile(slotKey: string, file?: File) {
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      setNotice(slotKey, { kind: "error", message: "只接受 JPG、PNG 或 WebP" });
      return;
    }
    if (file.size > MAX_SITE_IMAGE_BYTES) {
      setNotice(slotKey, { kind: "error", message: "圖片不可超過 8 MB" });
      return;
    }

    const oldUrl = drafts[slotKey]?.previewUrl;
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      previewUrls.current.delete(oldUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    previewUrls.current.add(previewUrl);
    setDrafts((current) => ({ ...current, [slotKey]: { file, previewUrl } }));
    setNotices((current) => {
      const next = { ...current };
      delete next[slotKey];
      return next;
    });

    const probe = new Image();
    probe.onload = () => {
      setDrafts((current) => {
        const draft = current[slotKey];
        if (!draft || draft.previewUrl !== previewUrl) return current;
        return { ...current, [slotKey]: { ...draft, width: probe.naturalWidth, height: probe.naturalHeight } };
      });
    };
    probe.src = previewUrl;
  }

  async function upload(slotKey: string) {
    const draft = drafts[slotKey];
    if (!draft || uploading) return;

    setUploading(slotKey);
    setNotice(slotKey, { kind: "success", message: "上傳中…" });
    const form = new FormData();
    form.set("slotKey", slotKey);
    form.set("file", draft.file);
    if (draft.width) form.set("width", String(draft.width));
    if (draft.height) form.set("height", String(draft.height));

    try {
      const response = await fetch("/api/admin/site-images", { method: "POST", body: form });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        image?: SiteImageAdminRecord;
        message?: string;
      };
      if (!response.ok || !result.ok || !result.image) throw new Error(result.message || "圖片上傳失敗");

      setImages((current) => replaceAdminImage(current, result.image!));
      setDrafts((current) => {
        const next = { ...current };
        delete next[slotKey];
        return next;
      });
      URL.revokeObjectURL(draft.previewUrl);
      previewUrls.current.delete(draft.previewUrl);
      setNotice(slotKey, { kind: "success", message: "已更新，前台將顯示新圖片" });
    } catch (error) {
      setNotice(slotKey, { kind: "error", message: error instanceof Error ? error.message : "圖片上傳失敗" });
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="adm-site-groups">
      {groupAdminImages(images).map((group) => (
        <section className="adm-site-group" key={group.key}>
          <div className="adm-site-group-head">
            <h2>{group.label}</h2>
            <span>{group.images.length} 個圖片位</span>
          </div>
          <div className="adm-site-grid">
            {group.images.map((image) => {
              const draft = drafts[image.slotKey];
              const notice = notices[image.slotKey];
              const preview = draft?.previewUrl ?? image.publicUrl;
              return (
                <article className="adm-site-card" key={image.slotKey}>
                  <div className="adm-site-preview" style={{ aspectRatio: image.aspect.replace(":", " / ") }}>
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt={draft ? `待上傳預覽：${image.alt}` : image.alt} />
                    ) : (
                      <div className="adm-site-empty">尚未上圖</div>
                    )}
                    {draft ? <span className="adm-site-pending">待上傳</span> : null}
                  </div>
                  <div className="adm-site-info">
                    <div>
                      <h3>{image.label}</h3>
                      <code>{image.slotKey}</code>
                    </div>
                    <span className="adm-site-aspect">{image.aspect}</span>
                  </div>
                  <p className="adm-site-meta">
                    {image.status === "ready" ? (image.source === "upload" ? "管理員上傳" : "AI 示意圖") : "等待上圖"}
                    {image.width && image.height ? ` · ${image.width}×${image.height}` : ""}
                  </p>
                  <div className="adm-site-actions">
                    <label className="adm-site-file">
                      {image.publicUrl ? "選擇替換圖片" : "選擇圖片"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => chooseFile(image.slotKey, event.target.files?.[0])}
                        disabled={uploading !== null}
                      />
                    </label>
                    <button type="button" onClick={() => upload(image.slotKey)} disabled={!draft || uploading !== null}>
                      {uploading === image.slotKey ? "上傳中…" : "確認上傳"}
                    </button>
                  </div>
                  {notice ? (
                    <p className={`adm-site-notice ${notice.kind}`} role="status">
                      {notice.message}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
