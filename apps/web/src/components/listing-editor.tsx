"use client";

import type { ManagedListingDetail } from "@real-estate/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { ListingImagesEditor } from "./listing-images-editor";

type TransactionType = "SALE" | "JEONSE" | "MONTHLY_RENT";

export function ListingEditor({ id }: { id?: string }) {
  const router = useRouter();
  const { user, loading, authenticatedRequest } = useAuth();
  const [listing, setListing] = useState<ManagedListingDetail | null>(null);
  const [transactionType, setTransactionType] =
    useState<TransactionType>("SALE");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (!id || loading || user?.role !== "AGENT") return;
    void apiRequest<ManagedListingDetail>(`/listings/mine/${id}`)
      .then((result) => {
        setListing(result);
        setTransactionType(result.transactionType);
      })
      .catch(() => setMessage("매물을 불러오지 못했거나 수정 권한이 없습니다."))
      .finally(() => setLoaded(true));
  }, [id, loading, user]);

  if (loading || !loaded)
    return <p className="text-slate-500">매물 정보를 준비하는 중…</p>;
  if (!user || user.role !== "AGENT")
    return (
      <p className="rounded-xl bg-amber-50 p-5 text-amber-900">
        활성 중개사 계정으로 로그인해야 합니다.
      </p>
    );
  if (id && !listing)
    return <p className="rounded-xl bg-red-50 p-5 text-red-700">{message}</p>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const optionalNumber = (name: string) =>
      value(name) ? Number(value(name)) : undefined;
    const body = {
      transactionType,
      propertyType: value("propertyType"),
      areaSquareMeters: value("areaSquareMeters"),
      floor: optionalNumber("floor"),
      totalFloors: optionalNumber("totalFloors"),
      rooms: optionalNumber("rooms"),
      bathrooms: optionalNumber("bathrooms"),
      buildYear: optionalNumber("buildYear"),
      sido: value("sido"),
      sigungu: value("sigungu"),
      eupmyeondong: value("eupmyeondong"),
      roadAddress: value("roadAddress"),
      detailAddress: value("detailAddress") || undefined,
      postalCode: value("postalCode") || undefined,
      addressVisibility: value("addressVisibility"),
      title: value("title"),
      description: value("description"),
      salePriceKrw:
        transactionType === "SALE" ? value("salePriceKrw") : undefined,
      depositKrw: transactionType !== "SALE" ? value("depositKrw") : undefined,
      monthlyRentKrw:
        transactionType === "MONTHLY_RENT"
          ? value("monthlyRentKrw")
          : undefined,
      maintenanceFeeKrw: value("maintenanceFeeKrw") || undefined,
      ...(listing ? { version: listing.version } : {}),
    };
    try {
      const saved = await authenticatedRequest<ManagedListingDetail>(
        id ? `/listings/${id}` : "/listings",
        {
          method: id ? "PUT" : "POST",
          body: JSON.stringify(body),
        },
      );
      router.push(id ? "/agent/listings" : `/agent/listings/${saved.id}/edit`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 409
          ? "다른 곳에서 먼저 수정되었습니다. 목록에서 다시 열어 주세요."
          : error instanceof ApiError
            ? error.message
            : "매물을 저장하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  const d = listing;
  const fieldClass =
    "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";
  return (
    <>
      {id && listing && (
        <ListingImagesEditor listing={listing} onChange={setListing} />
      )}
      <form onSubmit={submit} className="space-y-8">
        <section className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-xl font-bold">기본 정보</h2>
          <SelectField
            label="거래 유형"
            name="transactionType"
            value={transactionType}
            onChange={(v) => setTransactionType(v as TransactionType)}
            options={[
              ["SALE", "매매"],
              ["JEONSE", "전세"],
              ["MONTHLY_RENT", "월세"],
            ]}
          />
          <SelectField
            label="매물 유형"
            name="propertyType"
            defaultValue={d?.property.type ?? "APARTMENT"}
            options={[
              ["APARTMENT", "아파트"],
              ["HOUSE", "주택"],
              ["OFFICETEL", "오피스텔"],
              ["COMMERCIAL", "상가"],
              ["LAND", "토지"],
            ]}
          />
          <Input
            label="제목"
            name="title"
            defaultValue={d?.title}
            minLength={5}
            maxLength={120}
            className="sm:col-span-2"
          />
          <DescriptionField
            defaultValue={d?.description}
            fieldClass={fieldClass}
          />
        </section>
        <section className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-3">
          <h2 className="sm:col-span-3 text-xl font-bold">면적과 구조</h2>
          <Input
            label="전용면적(㎡)"
            name="areaSquareMeters"
            type="number"
            inputMode="decimal"
            min="0.01"
            max="99999999.99"
            step="0.01"
            defaultValue={d?.property.areaSquareMeters}
            placeholder="예: 84 또는 84.92"
            description="정수와 소수를 모두 입력할 수 있으며, 소수점 둘째 자리까지 허용됩니다."
          />
          <Input
            label="해당 층"
            name="floor"
            type="number"
            defaultValue={d?.property.floor ?? ""}
            required={false}
          />
          <Input
            label="전체 층"
            name="totalFloors"
            type="number"
            min={1}
            defaultValue={d?.property.totalFloors ?? ""}
            required={false}
          />
          <Input
            label="방 수"
            name="rooms"
            type="number"
            min={0}
            defaultValue={d?.property.rooms ?? ""}
            required={false}
          />
          <Input
            label="욕실 수"
            name="bathrooms"
            type="number"
            min={0}
            defaultValue={d?.property.bathrooms ?? ""}
            required={false}
          />
          <Input
            label="준공 연도"
            name="buildYear"
            type="number"
            min={1800}
            max={2200}
            defaultValue={d?.property.buildYear ?? ""}
            required={false}
          />
        </section>
        <section className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-xl font-bold">주소</h2>
          <Input
            label="시·도"
            name="sido"
            defaultValue={d?.address.sido}
            maxLength={50}
          />
          <Input
            label="시·군·구"
            name="sigungu"
            defaultValue={d?.address.sigungu}
            maxLength={50}
          />
          <Input
            label="읍·면·동"
            name="eupmyeondong"
            defaultValue={d?.address.eupmyeondong}
            maxLength={80}
          />
          <Input
            label="우편번호"
            name="postalCode"
            defaultValue={d?.address.postalCode ?? ""}
            required={false}
            inputMode="numeric"
            maxLength={5}
            pattern="[0-9]{5}"
            placeholder="예: 06236"
            description="대한민국 5자리 우편번호를 숫자로 입력해 주세요."
          />
          <Input
            label="도로명 주소"
            name="roadAddress"
            defaultValue={d?.address.roadAddress}
            maxLength={255}
            className="sm:col-span-2"
          />
          <Input
            label="상세 주소"
            name="detailAddress"
            defaultValue={d?.address.detailAddress ?? ""}
            required={false}
            maxLength={255}
          />
          <SelectField
            label="주소 공개 범위"
            name="addressVisibility"
            defaultValue={d?.address.visibility ?? "APPROXIMATE"}
            options={[
              ["APPROXIMATE", "동까지만 공개"],
              ["EXACT_AFTER_INQUIRY", "문의 후 공개"],
              ["PUBLIC", "도로명 공개"],
            ]}
          />
        </section>
        <section className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-xl font-bold">가격 (원)</h2>
          {transactionType === "SALE" && (
            <Input
              label="매매가"
              name="salePriceKrw"
              type="number"
              min={1}
              defaultValue={d?.price.salePriceKrw ?? ""}
            />
          )}
          {transactionType !== "SALE" && (
            <Input
              label="보증금"
              name="depositKrw"
              type="number"
              min={transactionType === "JEONSE" ? 1 : 0}
              defaultValue={d?.price.depositKrw ?? ""}
            />
          )}
          {transactionType === "MONTHLY_RENT" && (
            <Input
              label="월세"
              name="monthlyRentKrw"
              type="number"
              min={1}
              defaultValue={d?.price.monthlyRentKrw ?? ""}
            />
          )}
          <Input
            label="관리비"
            name="maintenanceFeeKrw"
            type="number"
            min={0}
            defaultValue={d?.price.maintenanceFeeKrw ?? ""}
            required={false}
          />
        </section>
        {message && (
          <p
            aria-live="polite"
            className="rounded-xl bg-red-50 p-4 text-red-700"
          >
            {message}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-stone-300 px-5 py-3 font-bold"
          >
            취소
          </button>
          <button
            disabled={pending}
            className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white disabled:opacity-60"
          >
            {pending ? "저장 중…" : "초안 저장"}
          </button>
        </div>
      </form>
    </>
  );
}

function Input({
  label,
  description,
  className = "",
  required = true,
  ...props
}: {
  label: string;
  description?: string;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`${className} text-sm font-semibold text-slate-800`}>
      {label}
      <input
        {...props}
        required={required}
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
      />
      {description && (
        <span className="mt-2 block text-xs font-normal leading-5 text-slate-500">
          {description}
        </span>
      )}
    </label>
  );
}

function DescriptionField({
  defaultValue = "",
  fieldClass,
}: {
  defaultValue?: string;
  fieldClass: string;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <label className="sm:col-span-2 text-sm font-semibold text-slate-800">
      설명
      <textarea
        name="description"
        required
        minLength={20}
        maxLength={5000}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={6}
        aria-describedby="description-count"
        className={fieldClass}
      />
      <span
        id="description-count"
        aria-live="polite"
        className={`mt-2 flex justify-between text-xs font-normal ${
          value.length > 0 && value.length < 20
            ? "text-amber-700"
            : "text-slate-500"
        }`}
      >
        <span>최소 20자</span>
        <span>{value.length.toLocaleString("ko-KR")} / 5,000자</span>
      </span>
    </label>
  );
}

function SelectField({
  label,
  options,
  onChange,
  ...props
}: {
  label: string;
  options: [string, string][];
  onChange?: (value: string) => void;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange">) {
  return (
    <label className="text-sm font-semibold text-slate-800">
      {label}
      <select
        {...props}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-normal"
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
