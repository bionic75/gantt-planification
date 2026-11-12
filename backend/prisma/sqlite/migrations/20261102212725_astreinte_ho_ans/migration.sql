-- AlterTable
ALTER TABLE "users" ADD COLUMN "astreinte_ho_ans" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "astreinte_ho_ans_slots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "idx_astreinte_ho_ans_user" ON "astreinte_ho_ans_slots"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "astreinte_ho_ans_slots_date_key" ON "astreinte_ho_ans_slots"("date");

