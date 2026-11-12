-- CreateTable
CREATE TABLE "atelier_sondages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "retroplanning_id" INTEGER NOT NULL,
    "ligne" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'brouillon',
    "organisateur_id" INTEGER,
    "destinataires" TEXT,
    "cc_user_ids" TEXT,
    "message" TEXT,
    "created_by" INTEGER,
    "sent_at" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "atelier_sondage_options" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sondage_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "heure" TEXT,
    "heure_fin" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "atelier_sondage_reponses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sondage_id" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "atelier_sondages_token_key" ON "atelier_sondages"("token");

-- CreateIndex
CREATE UNIQUE INDEX "atelier_sondages_retroplanning_id_ligne_key" ON "atelier_sondages"("retroplanning_id", "ligne");

-- CreateIndex
CREATE INDEX "atelier_sondage_options_sondage_id_idx" ON "atelier_sondage_options"("sondage_id");

-- CreateIndex
CREATE INDEX "atelier_sondage_reponses_sondage_id_idx" ON "atelier_sondage_reponses"("sondage_id");

