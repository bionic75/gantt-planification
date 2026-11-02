-- CreateTable
CREATE TABLE "affectation_assignment_days" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "stage_key" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "created_at" TEXT DEFAULT to_char(timezone('UTC'::text, now()), 'YYYY-MM-DD HH24:MI:SS'::text),

    CONSTRAINT "affectation_assignment_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_aff_assign_days_stage" ON "affectation_assignment_days"("project_id", "stage_key");

-- CreateIndex
CREATE UNIQUE INDEX "affectation_assignment_days_project_id_stage_key_resource_i_key" ON "affectation_assignment_days"("project_id", "stage_key", "resource_id", "date");

