-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'AGENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'HOUSE', 'OFFICETEL', 'COMMERCIAL', 'LAND');

-- CreateEnum
CREATE TYPE "AddressVisibility" AS ENUM ('APPROXIMATE', 'EXACT_AFTER_INQUIRY', 'PUBLIC');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALE', 'JEONSE', 'MONTHLY_RENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'REVIEW_PENDING', 'NEEDS_CHANGES', 'APPROVED', 'PUBLISHED', 'PAUSED', 'EXPIRED', 'COMPLETED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "ListingImageStatus" AS ENUM ('UPLOADED', 'SCANNING', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'NEEDS_CHANGES', 'REJECTED');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('OPEN', 'RESPONDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('FALSE_LISTING', 'DUPLICATE', 'WRONG_PRICE', 'UNAVAILABLE', 'FRAUD_SUSPECTED', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SanctionType" AS ENUM ('WARNING', 'TEMPORARY_SUSPENSION', 'PERMANENT_BAN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "email_verified_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_secret_hash" CHAR(64) NOT NULL,
    "ip_hash" CHAR(64),
    "user_agent_hash" CHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "license_number" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "status" "AgencyStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "registration_number" VARCHAR(50) NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "is_representative" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "type" "PropertyType" NOT NULL,
    "area_square_meters" DECIMAL(10,2) NOT NULL,
    "floor" INTEGER,
    "total_floors" INTEGER,
    "rooms" INTEGER,
    "bathrooms" INTEGER,
    "build_year" INTEGER,
    "options" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_addresses" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "sido" VARCHAR(50) NOT NULL,
    "sigungu" VARCHAR(50) NOT NULL,
    "eupmyeondong" VARCHAR(80) NOT NULL,
    "road_address" VARCHAR(255) NOT NULL,
    "jibun_address" VARCHAR(255),
    "detail_address" VARCHAR(255),
    "postal_code" VARCHAR(10),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "visibility" "AddressVisibility" NOT NULL DEFAULT 'APPROXIMATE',

    CONSTRAINT "property_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "transaction_type" "TransactionType" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "sale_price_krw" BIGINT,
    "deposit_krw" BIGINT,
    "monthly_rent_krw" BIGINT,
    "maintenance_fee_krw" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_images" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" CHAR(64) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "ListingImageStatus" NOT NULL DEFAULT 'UPLOADED',
    "rejection_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","listing_id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'OPEN',
    "responded_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "handled_by_id" UUID,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_reviews" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_history" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" VARCHAR(80) NOT NULL,
    "from_status" "ListingStatus",
    "to_status" "ListingStatus",
    "changes" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_price_history" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "changed_by_id" UUID,
    "sale_price_krw" BIGINT,
    "deposit_krw" BIGINT,
    "monthly_rent_krw" BIGINT,
    "maintenance_fee_krw" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctions" (
    "id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "issued_by_id" UUID NOT NULL,
    "revoked_by_id" UUID,
    "type" "SanctionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" VARCHAR(100),
    "request_id" VARCHAR(100),
    "ip_hash" CHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_status_locked_until_idx" ON "users"("status", "locked_until");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_idle_expires_at_idx" ON "sessions"("idle_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_consumed_at_idx" ON "auth_tokens"("user_id", "type", "consumed_at");

-- CreateIndex
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_license_number_key" ON "agencies"("license_number");

-- CreateIndex
CREATE INDEX "agencies_status_idx" ON "agencies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_profiles_user_id_key" ON "agent_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_profiles_registration_number_key" ON "agent_profiles"("registration_number");

-- CreateIndex
CREATE INDEX "agent_profiles_agency_id_status_idx" ON "agent_profiles"("agency_id", "status");

-- CreateIndex
CREATE INDEX "properties_agency_id_deleted_at_idx" ON "properties"("agency_id", "deleted_at");

-- CreateIndex
CREATE INDEX "properties_agent_id_deleted_at_idx" ON "properties"("agent_id", "deleted_at");

-- CreateIndex
CREATE INDEX "properties_type_deleted_at_idx" ON "properties"("type", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "property_addresses_property_id_key" ON "property_addresses"("property_id");

-- CreateIndex
CREATE INDEX "property_addresses_sido_sigungu_eupmyeondong_idx" ON "property_addresses"("sido", "sigungu", "eupmyeondong");

-- CreateIndex
CREATE INDEX "listings_status_published_at_idx" ON "listings"("status", "published_at");

-- CreateIndex
CREATE INDEX "listings_transaction_type_status_idx" ON "listings"("transaction_type", "status");

-- CreateIndex
CREATE INDEX "listings_property_id_created_at_idx" ON "listings"("property_id", "created_at");

-- CreateIndex
CREATE INDEX "listings_agent_id_status_idx" ON "listings"("agent_id", "status");

-- CreateIndex
CREATE INDEX "listings_expires_at_status_idx" ON "listings"("expires_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "listing_images_object_key_key" ON "listing_images"("object_key");

-- CreateIndex
CREATE INDEX "listing_images_listing_id_status_idx" ON "listing_images"("listing_id", "status");

-- CreateIndex
CREATE INDEX "listing_images_sha256_idx" ON "listing_images"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "listing_images_listing_id_sort_order_key" ON "listing_images"("listing_id", "sort_order");

-- CreateIndex
CREATE INDEX "favorites_listing_id_idx" ON "favorites"("listing_id");

-- CreateIndex
CREATE INDEX "inquiries_listing_id_status_idx" ON "inquiries"("listing_id", "status");

-- CreateIndex
CREATE INDEX "inquiries_user_id_created_at_idx" ON "inquiries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_listing_id_status_idx" ON "reports"("listing_id", "status");

-- CreateIndex
CREATE INDEX "reports_reporter_id_created_at_idx" ON "reports"("reporter_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_reviews_listing_id_created_at_idx" ON "listing_reviews"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_reviews_reviewer_id_created_at_idx" ON "listing_reviews"("reviewer_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_history_listing_id_created_at_idx" ON "listing_history"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_history_actor_id_created_at_idx" ON "listing_history"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_price_history_listing_id_created_at_idx" ON "listing_price_history"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "sanctions_target_user_id_revoked_at_ends_at_idx" ON "sanctions"("target_user_id", "revoked_at", "ends_at");

-- CreateIndex
CREATE INDEX "sanctions_issued_by_id_created_at_idx" ON "sanctions"("issued_by_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_addresses" ADD CONSTRAINT "property_addresses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_history" ADD CONSTRAINT "listing_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_history" ADD CONSTRAINT "listing_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_price_history" ADD CONSTRAINT "listing_price_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_price_history" ADD CONSTRAINT "listing_price_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Application invariants that Prisma schema cannot currently express.
ALTER TABLE "users"
ADD CONSTRAINT "users_failed_login_count_check"
CHECK ("failed_login_count" >= 0);

CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (LOWER("email"));

ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_expiration_check"
CHECK ("idle_expires_at" <= "expires_at" AND "expires_at" > "created_at");

ALTER TABLE "auth_tokens"
ADD CONSTRAINT "auth_tokens_expiration_check"
CHECK ("expires_at" > "created_at");

ALTER TABLE "properties"
ADD CONSTRAINT "properties_numeric_values_check"
CHECK (
    "area_square_meters" > 0
    AND ("total_floors" IS NULL OR "total_floors" > 0)
    AND ("rooms" IS NULL OR "rooms" >= 0)
    AND ("bathrooms" IS NULL OR "bathrooms" >= 0)
    AND ("build_year" IS NULL OR "build_year" BETWEEN 1800 AND 2200)
);

ALTER TABLE "property_addresses"
ADD CONSTRAINT "property_addresses_coordinates_check"
CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL)
    OR (
        "latitude" BETWEEN -90 AND 90
        AND "longitude" BETWEEN -180 AND 180
    )
);

ALTER TABLE "listings"
ADD CONSTRAINT "listings_price_shape_check"
CHECK (
    (
        "transaction_type" = 'SALE'
        AND "sale_price_krw" > 0
        AND "deposit_krw" IS NULL
        AND "monthly_rent_krw" IS NULL
    )
    OR (
        "transaction_type" = 'JEONSE'
        AND "sale_price_krw" IS NULL
        AND "deposit_krw" > 0
        AND "monthly_rent_krw" IS NULL
    )
    OR (
        "transaction_type" = 'MONTHLY_RENT'
        AND "sale_price_krw" IS NULL
        AND "deposit_krw" >= 0
        AND "monthly_rent_krw" > 0
    )
);

ALTER TABLE "listings"
ADD CONSTRAINT "listings_other_values_check"
CHECK (
    "version" > 0
    AND ("maintenance_fee_krw" IS NULL OR "maintenance_fee_krw" >= 0)
    AND ("expires_at" IS NULL OR "published_at" IS NULL OR "expires_at" > "published_at")
);

ALTER TABLE "listing_images"
ADD CONSTRAINT "listing_images_dimensions_check"
CHECK (
    "size_bytes" > 0
    AND ("width" IS NULL OR "width" > 0)
    AND ("height" IS NULL OR "height" > 0)
);

ALTER TABLE "sanctions"
ADD CONSTRAINT "sanctions_period_check"
CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");
