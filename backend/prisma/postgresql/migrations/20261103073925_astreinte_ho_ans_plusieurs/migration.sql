-- DropIndex
DROP INDEX "astreinte_ho_ans_slots_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "astreinte_ho_ans_slots_date_user_id_key" ON "astreinte_ho_ans_slots"("date", "user_id");

