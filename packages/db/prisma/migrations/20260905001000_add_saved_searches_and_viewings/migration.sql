CREATE TYPE "ViewingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED');

CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "transaction_type" "TransactionType",
    "property_type" "PropertyType",
    "sido" VARCHAR(50),
    "sigungu" VARCHAR(50),
    "min_price_manwon" BIGINT,
    "max_price_manwon" BIGINT,
    "min_area_square_meters" DECIMAL(10,2),
    "max_area_square_meters" DECIMAL(10,2),
    "sort" VARCHAR(20) NOT NULL DEFAULT 'LATEST',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saved_search_matches" (
    "id" UUID NOT NULL,
    "saved_search_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_search_matches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "viewing_appointments" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "message" VARCHAR(500),
    "status" "ViewingStatus" NOT NULL DEFAULT 'PENDING',
    "response_message" VARCHAR(500),
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "viewing_appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_searches_user_id_updated_at_idx" ON "saved_searches"("user_id", "updated_at");
CREATE UNIQUE INDEX "saved_search_matches_saved_search_id_listing_id_key" ON "saved_search_matches"("saved_search_id", "listing_id");
CREATE INDEX "saved_search_matches_listing_id_idx" ON "saved_search_matches"("listing_id");
CREATE INDEX "saved_search_matches_saved_search_id_viewed_at_created_at_idx" ON "saved_search_matches"("saved_search_id", "viewed_at", "created_at");
CREATE INDEX "viewing_appointments_user_id_requested_at_idx" ON "viewing_appointments"("user_id", "requested_at");
CREATE INDEX "viewing_appointments_listing_id_status_requested_at_idx" ON "viewing_appointments"("listing_id", "status", "requested_at");

ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_saved_search_id_fkey" FOREIGN KEY ("saved_search_id") REFERENCES "saved_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "viewing_appointments" ADD CONSTRAINT "viewing_appointments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "viewing_appointments" ADD CONSTRAINT "viewing_appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
