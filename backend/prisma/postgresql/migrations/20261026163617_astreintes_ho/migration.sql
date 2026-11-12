-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "astreinte_apd" INTEGER DEFAULT 0,
ADD COLUMN     "astreinte_ho" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "astreinte_ho_slots" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT to_char(timezone('UTC'::text, now()), 'YYYY-MM-DD HH24:MI:SS'::text),

    CONSTRAINT "astreinte_ho_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "astreinte_ho_log" (
    "id" SERIAL NOT NULL,
    "slot_date" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "resource_name" TEXT,
    "action" TEXT NOT NULL,
    "week_start" TEXT NOT NULL,
    "user_id" INTEGER,
    "user_name" TEXT,
    "created_at" TEXT DEFAULT to_char(timezone('UTC'::text, now()), 'YYYY-MM-DD HH24:MI:SS'::text),

    CONSTRAINT "astreinte_ho_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_astreinte_ho_slots_date" ON "astreinte_ho_slots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "astreinte_ho_slots_date_period_resource_id_key" ON "astreinte_ho_slots"("date", "period", "resource_id");

-- CreateIndex
CREATE INDEX "idx_astreinte_ho_log_week" ON "astreinte_ho_log"("week_start");

