import { listings, photos, formatArea, groupListings } from "./data.mjs";

const element = (id) => document.getElementById(id);
let selected = listings[0];
let activeGroup = listings.filter(
  (item) => item.lat === selected.lat && item.lng === selected.lng,
);
let map;
let markers;
function setPhoto(index) {
  const photo = photos[index];
  element("main-photo").src = `./assets/${photo.file}`;
  element("main-photo").alt =
    `AI 생성 ${photo.label} 예시 사진 · 실제 매물 사진 아님`;
  document.querySelectorAll("[data-photo]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.photo) === index),
    );
  });
}
function renderArea() {
  element("detail-area").textContent = formatArea(
    selected.area,
    element("area-unit").value,
  );
}
function showListing(item, group, navigate = true) {
  selected = item;
  activeGroup = group;
  element("detail-title").textContent = item.title;
  element("detail-price").textContent = item.price;
  element("detail-floor").textContent = item.floor;
  element("detail-description").textContent = item.description;
  element("group-label").textContent = `선택한 마커의 매물 ${group.length}개`;
  element("group-choices").replaceChildren(
    ...group.map((member) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = member.title;
      button.setAttribute("aria-pressed", String(member.id === item.id));
      button.addEventListener("click", () => showListing(member, group));
      return button;
    }),
  );
  document.querySelectorAll("[data-listing]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.listing === item.id),
    );
  });
  renderArea();
  setPhoto(0);
  if (navigate) history.replaceState(null, "", `#${item.id}`);
}
function focusDetails() {
  if (window.matchMedia("(max-width: 760px)").matches) {
    element("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  element("detail").focus({ preventScroll: true });
}
function renderMarkers() {
  markers.clearLayers();
  const groups = groupListings(listings, (item) =>
    map.latLngToLayerPoint([item.lat, item.lng]),
  );
  groups.forEach((group) => {
    const position = [
      group.reduce((sum, item) => sum + item.lat, 0) / group.length,
      group.reduce((sum, item) => sum + item.lng, 0) / group.length,
    ];
    const title = `가상 매물 ${group.length}개 보기`;
    const icon = window.L.divIcon({
      className: "listing-marker",
      html: `<span class="pin">${group.length}</span>`,
      iconSize: [48, 54],
      iconAnchor: [24, 54],
    });
    window.L.marker(position, { icon, title, alt: title, keyboard: true })
      .addTo(markers)
      .on("click", () => {
        showListing(
          group.find((item) => item.id === selected.id) ?? group[0],
          group,
        );
        focusDetails();
      });
  });
}
function fitMap() {
  map?.fitBounds(
    listings.map((item) => [item.lat, item.lng]),
    { padding: [60, 60], maxZoom: 16 },
  );
}
element("cards").replaceChildren(
  ...listings.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.dataset.listing = item.id;
    const image = document.createElement("img");
    image.src = `./assets/${photos[index].file}`;
    image.alt = `AI 생성 ${photos[index].label} 예시 사진`;
    image.loading = "lazy";
    image.width = 768;
    image.height = 512;
    const content = document.createElement("span");
    content.className = "card-body";
    [
      item.title,
      item.price,
      `${item.area}㎡ · 약 ${(item.area / 3.305785).toFixed(2)}평 · ${item.floor}`,
    ].forEach((text) => {
      const line = document.createElement("span");
      line.textContent = text;
      content.append(line);
    });
    button.append(image, content);
    button.addEventListener("click", () => {
      showListing(
        item,
        listings.filter(
          (other) => other.lat === item.lat && other.lng === item.lng,
        ),
      );
      map?.setView([item.lat, item.lng], 17);
      focusDetails();
    });
    return button;
  }),
);
document
  .querySelectorAll("[data-photo]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      setPhoto(Number(button.dataset.photo)),
    ),
  );
element("area-unit").addEventListener("change", renderArea);
element("reset-map").addEventListener("click", fitMap);
function restoreHash() {
  const item =
    listings.find((candidate) => `#${candidate.id}` === location.hash) ??
    listings[0];
  showListing(
    item,
    listings.filter(
      (other) => other.lat === item.lat && other.lng === item.lng,
    ),
    false,
  );
}
window.addEventListener("hashchange", restoreHash);
restoreHash();
function initializeMap() {
  if (!window.L) {
    element("map-status").textContent =
      "지도를 불러오지 못했습니다. 아래 매물 카드를 이용하거나 새로고침해 주세요.";
    element("reset-map").disabled = true;
    return;
  }
  map = window.L.map("map", { scrollWheelZoom: false }).setView(
    [37.5445, 127.045],
    16,
  );
  const tiles = window.L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  ).addTo(map);
  tiles.on("tileerror", () => {
    element("map-status").textContent =
      "일부 지도 배경을 불러오지 못했습니다. 매물 정보는 계속 볼 수 있습니다.";
  });
  markers = window.L.layerGroup().addTo(map);
  map.on("zoomend", renderMarkers);
  new ResizeObserver(() => map.invalidateSize()).observe(element("map"));
  fitMap();
  renderMarkers();
}
if (document.readyState === "complete") initializeMap();
else window.addEventListener("load", initializeMap, { once: true });
