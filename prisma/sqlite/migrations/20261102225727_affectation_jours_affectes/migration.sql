-- CreateTable
CREATE TABLE "affectation_assignment_days" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_id" INTEGER NOT NULL,
    "stage_key" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "idx_aff_assign_days_stage" ON "affectation_assignment_days"("project_id", "stage_key");

-- CreateIndex
CREATE UNIQUE INDEX "affectation_assignment_days_project_id_stage_key_resource_id_date_key" ON "affectation_assignment_days"("project_id", "stage_key", "resource_id", "date");

