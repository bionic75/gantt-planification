-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT,
    "is_admin" INTEGER DEFAULT 0,
    "is_expert" INTEGER DEFAULT 0,
    "is_user" INTEGER DEFAULT 0,
    "resource_id" INTEGER,
    "actif" INTEGER DEFAULT 1,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "totp_secret" TEXT,
    "default_tab" TEXT DEFAULT 'accueil',
    "profile_photo" TEXT,
    "trigramme" TEXT,
    "has_reporting_access" INTEGER DEFAULT 0,
    "amoa_ced" INTEGER DEFAULT 0,
    "is_rh" INTEGER DEFAULT 0,
    "must_change_password" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_users" ("actif", "amoa_ced", "created_at", "default_tab", "email", "has_reporting_access", "id", "is_admin", "is_expert", "is_rh", "is_user", "must_change_password", "nom", "password", "prenom", "profile_photo", "resource_id", "telephone", "totp_secret", "trigramme", "username") SELECT "actif", "amoa_ced", "created_at", "default_tab", "email", "has_reporting_access", "id", "is_admin", "is_expert", "is_rh", "is_user", "must_change_password", "nom", "password", "prenom", "profile_photo", "resource_id", "telephone", "totp_secret", "trigramme", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Onglet d'ouverture : Accueil pour tous (la valeur « planning » était l'ancien défaut, indiscernable d'un choix)
UPDATE "users" SET "default_tab" = 'accueil' WHERE "default_tab" = 'planning' OR "default_tab" IS NULL;
