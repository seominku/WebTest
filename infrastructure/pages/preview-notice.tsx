export function PagesPreviewNotice() {
  return (
    <aside
      className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm leading-6 text-amber-950"
      aria-label="원본 화면 미리보기 안내"
    >
      <strong>원본 화면 미리보기 · 서비스 미운영</strong>
      <span className="block">
        가상 매물만 표시합니다. 로그인·회원가입·검색 조건
        적용·등록·문의·업로드는 비활성 상태입니다.
      </span>
      <span className="block text-xs">
        지도·사진·㎡/평 전환과 화면 이동은 확인할 수 있습니다. 실제 개인정보를
        입력하지 마세요.
      </span>
    </aside>
  );
}
