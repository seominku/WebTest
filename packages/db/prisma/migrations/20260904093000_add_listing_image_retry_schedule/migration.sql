ALTER TABLE "listing_images"
ADD COLUMN "processing_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3);

CREATE INDEX "listing_images_status_next_attempt_at_idx"
ON "listing_images"("status", "next_attempt_at");
