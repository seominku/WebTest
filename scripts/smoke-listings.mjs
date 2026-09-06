const apiBase = (
  process.env.SMOKE_API_BASE_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");

async function request(path, expectedStatus = 200) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => undefined);

  if (response.status !== expectedStatus) {
    throw new Error(
      `GET ${path}: expected ${expectedStatus}, received ${response.status}`,
    );
  }
  return { body, headers: response.headers };
}

const list = await request("/listings");
if (list.body.pagination.total !== 5 || list.body.items.length !== 5) {
  throw new Error("Expected exactly five public sample listings");
}
if (!list.headers.get("cache-control")?.includes("public")) {
  throw new Error("Public listings must return a public cache policy");
}
if (
  list.body.items.some((item) => typeof item.price.salePriceKrw === "number")
) {
  throw new Error("Prices must not be serialized as JavaScript numbers");
}

const monthly = await request("/listings?transactionType=MONTHLY_RENT");
if (
  monthly.body.pagination.total !== 1 ||
  monthly.body.items[0]?.property.type !== "OFFICETEL"
) {
  throw new Error(
    "Transaction type filter did not return the sample officetel",
  );
}

const seoul = await request(
  `/listings?sido=${encodeURIComponent("서울특별시")}`,
);
if (seoul.body.pagination.total !== 4) {
  throw new Error("Location filter did not return the four Seoul listings");
}

const expensive = await request("/listings?minPriceManwon=120000");
if (expensive.body.pagination.total !== 2) {
  throw new Error("Minimum price filter did not return two sale listings");
}

const compact = await request("/listings?maxAreaSquareMeters=80");
if (compact.body.pagination.total !== 2) {
  throw new Error("Maximum area filter did not return two compact listings");
}

const salePriceAscending = await request(
  "/listings?transactionType=SALE&sort=PRICE_ASC",
);
if (
  salePriceAscending.body.items.map((item) => item.id).join(",") !==
  [
    "60000000-0000-4000-8000-000000000005",
    "60000000-0000-4000-8000-000000000001",
    "60000000-0000-4000-8000-000000000006",
  ].join(",")
) {
  throw new Error("Sale price ascending sort returned an unexpected order");
}

const areaDescending = await request("/listings?sort=AREA_DESC");
if (
  areaDescending.body.items[0]?.id !== "60000000-0000-4000-8000-000000000003"
) {
  throw new Error("Area descending sort did not return the largest listing");
}

const approximate = await request(
  "/listings/60000000-0000-4000-8000-000000000001",
);
if (approximate.body.location.roadAddress !== null) {
  throw new Error("Approximate addresses must not expose a road address");
}

const publicAddress = await request(
  "/listings/60000000-0000-4000-8000-000000000002",
);
if (!publicAddress.body.location.roadAddress) {
  throw new Error("Public addresses should expose the configured road address");
}

await request("/listings/60000000-0000-4000-8000-000000000004", 404);
await request("/listings/not-a-uuid", 400);
await request("/listings?propertyType=INVALID", 400);
await request("/listings?minPriceManwon=10&maxPriceManwon=1", 400);
await request("/listings?minAreaSquareMeters=100&maxAreaSquareMeters=50", 400);
await request("/listings?sort=PRICE_ASC", 400);
await request("/listings?sort=INVALID", 400);

console.log(
  JSON.stringify({
    status: "ok",
    checks: [
      "published-only",
      "pagination",
      "transaction-filter",
      "location-filter",
      "price-range-filter",
      "area-range-filter",
      "listing-sort",
      "price-string-serialization",
      "address-visibility",
      "draft-not-found",
      "invalid-input-rejected",
      "public-cache-policy",
    ],
  }),
);
