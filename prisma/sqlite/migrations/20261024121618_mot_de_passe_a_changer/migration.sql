-- AlterTable : ajout de colonne simple, plutôt que la reconstruction complète de la table générée par Prisma
-- (même schéma ; la comparaison de schémas de Prisma signale à tort users et system_config sous SQLite)
ALTER TABLE "users" ADD COLUMN "must_change_password" INTEGER NOT NULL DEFAULT 0;
