-- AlterTable
ALTER TABLE "users" ADD COLUMN     "astreinte_ho_ans" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "astreinte_ho_ans_slots" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_by" INTEGER,
    "created_at" TEXT DEFAULT to_char(timezone('UTC'::text, now()), 'YYYY-MM-DD HH24:MI:SS'::text),

    CONSTRAINT "astreinte_ho_ans_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_astreinte_ho_ans_user" ON "astreinte_ho_ans_slots"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "astreinte_ho_ans_slots_date_key" ON "astreinte_ho_ans_slots"("date");

