CREATE TYPE "ViewingProposalRole" AS ENUM ('CUSTOMER', 'AGENT');

CREATE TYPE "ViewingProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

CREATE TABLE "viewing_reschedule_proposals" (
    "id" UUID NOT NULL,
    "viewing_appointment_id" UUID NOT NULL,
    "proposed_by_id" UUID NOT NULL,
    "proposed_by_role" "ViewingProposalRole" NOT NULL,
    "proposed_at" TIMESTAMPTZ(3) NOT NULL,
    "message" VARCHAR(500),
    "status" "ViewingProposalStatus" NOT NULL DEFAULT 'PENDING',
    "response_message" VARCHAR(500),
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "viewing_reschedule_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "viewing_reschedule_proposals_viewing_appointment_id_status_created_at_idx"
ON "viewing_reschedule_proposals"("viewing_appointment_id", "status", "created_at");

CREATE INDEX "viewing_reschedule_proposals_proposed_by_id_created_at_idx"
ON "viewing_reschedule_proposals"("proposed_by_id", "created_at");

CREATE UNIQUE INDEX "viewing_reschedule_proposals_one_pending_per_viewing_idx"
ON "viewing_reschedule_proposals"("viewing_appointment_id")
WHERE "status" = 'PENDING';

ALTER TABLE "viewing_reschedule_proposals"
ADD CONSTRAINT "viewing_reschedule_proposals_viewing_appointment_id_fkey"
FOREIGN KEY ("viewing_appointment_id") REFERENCES "viewing_appointments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "viewing_reschedule_proposals"
ADD CONSTRAINT "viewing_reschedule_proposals_proposed_by_id_fkey"
FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
