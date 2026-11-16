-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_deployment_statuses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "pattern" TEXT NOT NULL DEFAULT 'plein',
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_service" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_deployment_statuses" ("color", "id", "is_service", "label", "position") SELECT "color", "id", "is_service", "label", "position" FROM "deployment_statuses";
DROP TABLE "deployment_statuses";
ALTER TABLE "new_deployment_statuses" RENAME TO "deployment_statuses";
CREATE UNIQUE INDEX "deployment_statuses_label_key" ON "deployment_statuses"("label");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

