-- AlterTable
ALTER TABLE "resources" ADD COLUMN "astreinte_apd" INTEGER DEFAULT 0;
ALTER TABLE "resources" ADD COLUMN "astreinte_ho" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "astreinte_ho_slots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "astreinte_ho_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slot_date" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "resource_name" TEXT,
    "action" TEXT NOT NULL,
    "week_start" TEXT NOT NULL,
    "user_id" INTEGER,
    "user_name" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "idx_astreinte_ho_slots_date" ON "astreinte_ho_slots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "astreinte_ho_slots_date_period_resource_id_key" ON "astreinte_ho_slots"("date", "period", "resource_id");

-- CreateIndex
CREATE INDEX "idx_astreinte_ho_log_week" ON "astreinte_ho_log"("week_start");

