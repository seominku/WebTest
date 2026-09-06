ALTER TABLE "listing_images"
ADD COLUMN "processing_started_at" TIMESTAMPTZ(3);

CREATE INDEX "listing_images_status_processing_started_at_idx"
ON "listing_images"("status", "processing_started_at");
