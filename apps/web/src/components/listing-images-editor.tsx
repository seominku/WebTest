"use client";

import type { ListingImage, ManagedListingDetail } from "@real-estate/shared";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiAssetUrl, apiRequest } from "@/lib/api";
import { useAuth } from "./auth-provider";

const MAX_FILES = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ImageMutationResponse {
  image: ListingImage;
  version: number;
}

export function ListingImagesEditor({
  listing,
  onChange,
}: {
  listing: ManagedListingDetail;
  onChange: (listing: ManagedListingDetail) => void;
}) {
  const { authenticatedRequest } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editable =
    listing.status === "DRAFT" || listing.status === "NEEDS_CHANGES";
  const hasPendingImages = listing.images.some(
    (image) => image.status === "UPLOADED" || image.status === "SCANNING",
  );
  const canReorder = listing.images.every((image) => image.status === "READY");
  const firstReadyImageId = listing.images.find(
    (image) => image.status === "READY",
  )?.id;

  useEffect(() => {
    if (!hasPendingImages) return;
    let active = true;
    const refresh = () => {
      void apiRequest<ManagedListingDetail>(`/listings/mine/${listing.id}`)
        .then((result) => {
          if (active) onChange(result);
        })
        .catch(() => {
          // 일시적인 조회 실패는 다음 폴링 주기에 다시 시도합니다.
        });
    };
    const timer = window.setInterval(refresh, 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [hasPendingImages, listing.id, onChange]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (listing.images.length + selected.length > MAX_FILES) {
      setMessage(`이미지는 최대 ${MAX_FILES}장까지 등록할 수 있습니다.`);
      return;
    }
    const invalid = selected.find(
      (file) => !ALLOWED_TYPES.has(file.type) || file.size > MAX_BYTES,
    );
    if (invalid) {
      setMessage("JPEG·PNG·WebP 형식의 10MB 이하 이미지만 선택해 주세요.");
      return;
    }

    setPending(true);
    setUploadProgress({ current: 0, total: selected.length });
    setMessage(null);
    let current = listing;
    try {
      for (const [index, file] of selected.entries()) {
        setUploadProgress({ current: index + 1, total: selected.length });
        const formData = new FormData();
        formData.set("version", String(current.version));
        formData.set("image", file);
        const result = await authenticatedRequest<ImageMutationResponse>(
          `/listings/mine/${listing.id}/images`,
          { body: formData, method: "POST" },
        );
        current = {
          ...current,
          images: [...current.images, result.image],
          version: result.version,
        };
        onChange(current);
      }
      setMessage(
        `${selected.length}장의 이미지가 업로드되었습니다. 악성코드 검사와 썸네일 생성을 진행합니다.`,
      );
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "이미지를 업로드하지 못했습니다.",
      );
    } finally {
      setPending(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(image: ListingImage) {
    if (!window.confirm("이 이미지를 삭제할까요?")) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await authenticatedRequest<{
        status: string;
        version: number;
      }>(`/listings/mine/${listing.id}/images/${image.id}`, {
        body: JSON.stringify({ version: listing.version }),
        method: "DELETE",
      });
      onChange({
        ...listing,
        images: listing.images
          .filter((candidate) => candidate.id !== image.id)
          .map((candidate, index) => ({ ...candidate, sortOrder: index })),
        version: result.version,
      });
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "이미지를 삭제하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= listing.images.length) return;
    const images = [...listing.images];
    const source = images[index];
    const target = images[destination];
    if (!source || !target) return;
    images[index] = target;
    images[destination] = source;
    await saveOrder(images);
  }

  async function dropOn(targetImageId: string) {
    if (!draggedImageId || draggedImageId === targetImageId) return;
    const images = [...listing.images];
    const sourceIndex = images.findIndex(
      (image) => image.id === draggedImageId,
    );
    const targetIndex = images.findIndex((image) => image.id === targetImageId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = images.splice(sourceIndex, 1);
    if (!source) return;
    images.splice(targetIndex, 0, source);
    setDraggedImageId(null);
    setDragOverImageId(null);
    await saveOrder(images);
  }

  async function saveOrder(images: ListingImage[]) {
    setPending(true);
    setMessage(null);
    try {
      const result = await authenticatedRequest<{
        status: string;
        version: number;
      }>(`/listings/mine/${listing.id}/images/order`, {
        body: JSON.stringify({
          imageIds: images.map((image) => image.id),
          version: listing.version,
        }),
        method: "PUT",
      });
      onChange({
        ...listing,
        images: images.map((image, order) => ({ ...image, sortOrder: order })),
        version: result.version,
      });
      setMessage(
        "이미지 순서를 저장했습니다. 첫 번째 이미지가 대표 이미지입니다.",
      );
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "이미지 순서를 변경하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">매물 이미지</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            JPEG·PNG·WebP, 장당 최대 10MB, 최소 640×480, 최대 20장입니다. 첫
            번째 검사 완료 이미지가 대표 이미지로 표시됩니다. 업로드 후 악성코드
            검사와 안전한 WebP 변환이 자동으로 진행됩니다.
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-bold text-slate-700">
          {listing.images.length} / {MAX_FILES}장
        </span>
      </div>

      {editable ? (
        <label className="mt-5 block cursor-pointer rounded-xl border border-dashed border-emerald-400 bg-emerald-50 px-5 py-5 text-center font-bold text-emerald-800 hover:bg-emerald-100">
          {pending ? "이미지 업로드 중…" : "이미지 선택"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={pending || listing.images.length >= MAX_FILES}
            onChange={(event) => void upload(event.target.files)}
            className="sr-only"
          />
        </label>
      ) : (
        <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          이미지는 초안 또는 수정 요청 상태에서만 변경할 수 있습니다.
        </p>
      )}

      {message && (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-slate-700"
        >
          {message}
        </p>
      )}

      {uploadProgress && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-4" aria-live="polite">
          <div className="flex justify-between text-sm font-bold text-emerald-900">
            <span>이미지 업로드 진행 중</span>
            <span>
              {uploadProgress.current} / {uploadProgress.total}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={uploadProgress.total}
            aria-valuenow={uploadProgress.current}
            aria-label="이미지 업로드 진행률"
          >
            <div
              className="h-full bg-emerald-600 transition-[width]"
              style={{
                width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {listing.images.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listing.images.map((image, index) => (
            <article
              key={image.id}
              draggable={editable && canReorder && !pending}
              onDragStart={(event) => {
                setDraggedImageId(image.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", image.id);
              }}
              onDragOver={(event) => {
                if (!draggedImageId || draggedImageId === image.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverImageId(image.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                void dropOn(image.id);
              }}
              onDragEnd={() => {
                setDraggedImageId(null);
                setDragOverImageId(null);
              }}
              className={`overflow-hidden rounded-xl border bg-white transition ${
                dragOverImageId === image.id
                  ? "border-emerald-600 ring-2 ring-emerald-200"
                  : "border-stone-200"
              } ${draggedImageId === image.id ? "opacity-50" : ""}`}
            >
              <div className="relative aspect-[4/3] bg-stone-100">
                {image.status === "READY" && image.thumbnailPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={apiAssetUrl(image.thumbnailPath)}
                    alt={`매물 이미지 ${index + 1}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center px-6 text-center text-sm font-bold text-slate-600">
                    {imageStatusLabel(image.status)}
                  </div>
                )}
                {image.id === firstReadyImageId && (
                  <span className="absolute left-3 top-3 rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold text-white">
                    대표 이미지
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div>
                  <span className="block text-xs text-slate-500">
                    {image.width && image.height
                      ? `${image.width}×${image.height} · `
                      : ""}
                    {(image.sizeBytes / 1024).toFixed(0)}KB
                  </span>
                  {editable && canReorder && (
                    <span className="mt-1 block text-[11px] font-semibold text-slate-400">
                      ⠿ 드래그하여 순서 변경
                    </span>
                  )}
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <ImageButton
                      disabled={pending || !canReorder || index === 0}
                      onClick={() => move(index, -1)}
                      label="앞으로 이동"
                    >
                      ←
                    </ImageButton>
                    <ImageButton
                      disabled={
                        pending ||
                        !canReorder ||
                        index === listing.images.length - 1
                      }
                      onClick={() => move(index, 1)}
                      label="뒤로 이동"
                    >
                      →
                    </ImageButton>
                    <ImageButton
                      disabled={pending}
                      onClick={() => remove(image)}
                      label="삭제"
                      danger
                    >
                      삭제
                    </ImageButton>
                  </div>
                )}
              </div>
              {image.rejectionReason && (
                <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                  거부 사유: {image.rejectionReason}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function imageStatusLabel(status: ListingImage["status"]) {
  switch (status) {
    case "UPLOADED":
      return "검사 대기 중…";
    case "SCANNING":
      return "악성코드 검사 중…";
    case "REJECTED":
      return "검사에서 거부됨";
    default:
      return "이미지 준비 완료";
  }
}

function ImageButton({
  children,
  danger = false,
  label,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      className={`rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-30 ${
        danger
          ? "border-red-200 text-red-700"
          : "border-stone-300 text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
