// Public, synthetic values only. This module never reads the application's DB.
export const sampleListings = [59.5, 72, 84.5].map((area, index) => ({
  id: `60000000-0000-4000-8000-00000000000${index + 1}`,
  title: `[가상 매물] 서울숲 샘플 ${index + 1}`,
  summary: "원본 화면 확인용 가상 매물입니다. 실제 거래 대상이 아닙니다.",
  description:
    "원본 사이트의 사진, 매물 정보, 면적 단위와 화면 배치를 확인하기 위한 가상 매물입니다. 가격·주소·중개사 정보는 모두 예시이며 사진은 AI로 생성한 샘플입니다. 같은 좌표의 매물 2개와 가까운 위치의 매물 1개를 포함합니다.",
  transactionType: "SALE",
  publishedAt: "2026-09-06T00:00:00.000Z",
  imageCount: 3,
  primaryImagePath: null,
  imagePaths: [],
  agency: {
    agentName: "가상 담당자",
    name: "샘플 중개사무소 (실제 업체 아님)",
    phone: "연락처 없음",
    registrationNumber: "가상 정보",
  },
  location: {
    sido: "서울특별시",
    sigungu: "성동구",
    eupmyeondong: "성수동1가",
    roadAddress: "가상 테스트 위치 — 실제 매물 주소 아님",
    latitude: 37.5445,
    longitude: index === 2 ? 127.0478 : 127.0438,
  },
  property: {
    type: "APARTMENT",
    areaSquareMeters: String(area),
    bathrooms: 2,
    rooms: 3,
    floor: 5 + index * 3,
  },
  price: {
    salePriceKrw: String(500000000 + index * 100000000),
    depositKrw: null,
    monthlyRentKrw: null,
    maintenanceFeeKrw: "150000",
  },
}));
