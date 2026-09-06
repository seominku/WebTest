// Only synthetic, intentionally public data. Never export the database here.
export const listings = Object.freeze([
  {
    id: "sample-1",
    title: "서울숲 샘플 1",
    price: "매매 5억",
    area: 59.5,
    floor: "5층 / 20층",
    lat: 37.5445,
    lng: 127.0438,
    description:
      "거실과 방의 구성을 확인하는 가상 매물입니다. 샘플 2와 정확히 같은 좌표에 있어, 동일 위치 매물 선택을 테스트할 수 있습니다.",
  },
  {
    id: "sample-2",
    title: "서울숲 샘플 2",
    price: "매매 6억",
    area: 72,
    floor: "8층 / 20층",
    lat: 37.5445,
    lng: 127.0438,
    description:
      "샘플 1과 같은 위치에 있는 다른 가상 매물입니다. 같은 건물의 서로 다른 매물을 살펴보는 상황을 재현합니다.",
  },
  {
    id: "sample-3",
    title: "서울숲 샘플 3",
    price: "매매 7억",
    area: 84.5,
    floor: "12층 / 20층",
    lat: 37.5445,
    lng: 127.0478,
    description:
      "조금 떨어진 위치의 가상 매물입니다. 지도를 축소하면 가까운 마커가 묶이고, 확대하면 별도 위치로 나뉩니다.",
  },
]);
export const photos = [
  { file: "seoul-forest-living-room.webp", label: "거실" },
  { file: "seoul-forest-exterior.webp", label: "건물 외관" },
  { file: "seoul-forest-bedroom.webp", label: "침실" },
];
export function formatArea(area, unit) {
  return unit === "pyeong"
    ? `약 ${(area / 3.305785).toFixed(2)}평`
    : `${area}㎡`;
}
// Group connected markers in screen pixels, including identical coordinates.
export function groupListings(items, project, distance = 70) {
  const remaining = [...items];
  const groups = [];
  while (remaining.length) {
    const group = [remaining.shift()];
    for (let index = 0; index < group.length; index++) {
      const point = project(group[index]);
      for (let other = remaining.length - 1; other >= 0; other--) {
        const candidate = project(remaining[other]);
        if (
          Math.hypot(point.x - candidate.x, point.y - candidate.y) < distance
        ) {
          group.push(remaining.splice(other, 1)[0]);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}
