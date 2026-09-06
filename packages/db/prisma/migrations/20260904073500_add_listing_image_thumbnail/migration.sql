ALTER TABLE "listing_images"
ADD COLUMN "thumbnail_object_key" VARCHAR(512);

CREATE UNIQUE INDEX "listing_images_thumbnail_object_key_key"
ON "listing_images"("thumbnail_object_key");
