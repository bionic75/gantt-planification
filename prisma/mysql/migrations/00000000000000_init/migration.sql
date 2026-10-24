-- CreateTable
CREATE TABLE `action_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `action_type` LONGTEXT NOT NULL,
    `details` LONGTEXT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affectation_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `stage_key` VARCHAR(191) NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `affectation_assignments_project_id_stage_key_resource_id_key`(`project_id`, `stage_key`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affectation_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project_id` INTEGER NOT NULL,
    `samu_name` LONGTEXT NULL,
    `user_id` INTEGER NULL,
    `user_name` LONGTEXT NULL,
    `action` LONGTEXT NOT NULL,
    `details` LONGTEXT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    INDEX `idx_aff_hist_project`(`project_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affectation_projects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `samu_name` LONGTEXT NOT NULL,
    `location_id` INTEGER NULL,
    `chef_projet_id` INTEGER NULL,
    `date_debut` LONGTEXT NOT NULL,
    `date_mise_en_service` LONGTEXT NULL,
    `date_mise_en_production` LONGTEXT NULL,
    `periods` LONGTEXT NOT NULL DEFAULT ('{}'),
    `created_by` INTEGER NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `updated_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `label` LONGTEXT NOT NULL,
    `key_hash` VARCHAR(191) NOT NULL,
    `key_prefix` LONGTEXT NOT NULL,
    `created_by` INTEGER NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `last_used_at` LONGTEXT NULL,
    `revoked` INTEGER NULL DEFAULT 0,

    UNIQUE INDEX `api_keys_key_hash_key`(`key_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_user_access` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_key` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `app_user_access_app_key_user_id_key`(`app_key`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `astreinte_disponibilites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `type_creneau` LONGTEXT NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `astreinte_disponibilites_resource_id_date_key`(`resource_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `astreinte_indisponibilites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `type_creneau` VARCHAR(191) NOT NULL,
    `motif` LONGTEXT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `astreinte_indisponibilites_resource_id_date_type_creneau_key`(`resource_id`, `date`, `type_creneau`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `astreinte_planning` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` VARCHAR(191) NOT NULL,
    `type_creneau` VARCHAR(191) NOT NULL,
    `resource_id` INTEGER NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `astreinte_planning_date_type_creneau_key`(`date`, `type_creneau`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `astreintes_hno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` LONGTEXT NOT NULL,
    `date_debut` LONGTEXT NOT NULL,
    `date_fin` LONGTEXT NOT NULL,
    `heure_debut` LONGTEXT NULL,
    `heure_fin` LONGTEXT NULL,
    `samu` LONGTEXT NULL,
    `tous_samu` INTEGER NULL DEFAULT 0,
    `objet` LONGTEXT NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `updated_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `automation_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `automation_id` INTEGER NOT NULL,
    `expert_id` INTEGER NULL,
    `expert_name` LONGTEXT NULL,
    `expert_email` LONGTEXT NULL,
    `target_month` LONGTEXT NULL,
    `sent_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `recipients_list` LONGTEXT NULL,
    `file_content` LONGTEXT NULL,
    `filename` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bons_commande` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `intitule` LONGTEXT NOT NULL,
    `titulaire` LONGTEXT NULL,
    `date_debut` LONGTEXT NOT NULL,
    `date_fin` LONGTEXT NOT NULL,
    `nb_uo` INTEGER NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `created_by` INTEGER NULL,
    `actif` INTEGER NULL DEFAULT 1,
    `solde` INTEGER NULL DEFAULT 0,
    `regularisation_cible_bdc_id` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `connection_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `username` LONGTEXT NOT NULL,
    `nom` LONGTEXT NOT NULL,
    `prenom` LONGTEXT NOT NULL,
    `profile` LONGTEXT NOT NULL,
    `login_time` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `modifications` LONGTEXT NULL DEFAULT (''),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `resource_id` INTEGER NULL,
    `mois` INTEGER NOT NULL,
    `annee` INTEGER NOT NULL,
    `statut` VARCHAR(191) NOT NULL DEFAULT 'a_completer',
    `commentaire_expert` LONGTEXT NULL,
    `submitted_at` LONGTEXT NULL,
    `vise_n1_at` LONGTEXT NULL,
    `vise_n1_by` INTEGER NULL,
    `vise_n2_at` LONGTEXT NULL,
    `vise_n2_by` INTEGER NULL,
    `diffuse_at` LONGTEXT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `rien_a_declarer` INTEGER NULL DEFAULT 0,
    `commentaire_refus` LONGTEXT NULL,
    `refuse_by` INTEGER NULL,
    `refuse_at` LONGTEXT NULL,
    `deleted` INTEGER NULL DEFAULT 0,
    `pre_delete_statut` LONGTEXT NULL,
    `pre_delete_archived` INTEGER NULL,
    `modifie_admin_at` LONGTEXT NULL,
    `modifie_admin_nom` LONGTEXT NULL,
    `archived` INTEGER NULL DEFAULT 0,
    `pdf_filename` LONGTEXT NULL,

    UNIQUE INDEX `cra_user_id_mois_annee_key`(`user_id`, `mois`, `annee`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cra_diffusion_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cra_id` INTEGER NOT NULL,
    `recipient_email` LONGTEXT NOT NULL,
    `recipient_name` LONGTEXT NULL,
    `recipient_type` VARCHAR(191) NULL DEFAULT 'rh_es',
    `sent_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `email_batch_id` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cra_rh_recipients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `nom` LONGTEXT NULL,

    UNIQUE INDEX `cra_rh_recipients_resource_id_email_key`(`resource_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cra_signatures` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cra_id` INTEGER NOT NULL,
    `rang` INTEGER NOT NULL,
    `signer_user_id` INTEGER NULL,
    `signer_name` LONGTEXT NOT NULL,
    `signer_email` LONGTEXT NOT NULL,
    `signed_at` VARCHAR(19) NOT NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `ip_address` LONGTEXT NULL,
    `user_agent` LONGTEXT NULL,
    `token` VARCHAR(191) NULL,
    `token_used` INTEGER NULL DEFAULT 0,
    `token_expires_at` LONGTEXT NULL,

    UNIQUE INDEX `cra_signatures_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_event_external_participants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_id` INTEGER NOT NULL,
    `nom` LONGTEXT NULL,
    `prenom` LONGTEXT NULL,
    `email` LONGTEXT NULL,
    `added_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_event_participants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `event_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `added_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `custom_event_participants_event_id_user_id_key`(`event_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `label` LONGTEXT NOT NULL,
    `start_date` LONGTEXT NOT NULL,
    `end_date` LONGTEXT NOT NULL,
    `config` LONGTEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `needs_resources` INTEGER NULL DEFAULT 0,
    `resources_count` INTEGER NULL DEFAULT 1,
    `type_id` INTEGER NULL,
    `grist` INTEGER NULL DEFAULT 0,
    `location_id` INTEGER NULL,
    `period` VARCHAR(191) NULL DEFAULT 'FULL',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deplacements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `amoa_ced_id` INTEGER NULL,
    `date_debut` LONGTEXT NOT NULL,
    `date_fin` LONGTEXT NOT NULL,
    `samu` LONGTEXT NOT NULL,
    `ville` LONGTEXT NOT NULL,
    `bon_commande_id` INTEGER NULL,
    `nb_uo` INTEGER NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `a_regulariser` INTEGER NULL DEFAULT 0,
    `regularisation_source_bdc_id` INTEGER NULL,
    `commentaire` LONGTEXT NULL,
    `regularisation_cible_bdc_id` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `host` LONGTEXT NOT NULL,
    `port` INTEGER NOT NULL,
    `secure` INTEGER NULL DEFAULT 0,
    `user` LONGTEXT NOT NULL,
    `password` LONGTEXT NOT NULL,
    `updated_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_queue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batch_id` LONGTEXT NOT NULL,
    `recipient_email` LONGTEXT NOT NULL,
    `recipient_name` LONGTEXT NOT NULL,
    `sender_name` LONGTEXT NOT NULL,
    `sender_email` LONGTEXT NOT NULL,
    `subject` LONGTEXT NOT NULL,
    `html_body` LONGTEXT NOT NULL,
    `ics_content` LONGTEXT NULL,
    `ics_method` LONGTEXT NULL,
    `ics_filename` LONGTEXT NULL,
    `pdf_attachment` LONGTEXT NULL,
    `pdf_filename` LONGTEXT NULL,
    `status` VARCHAR(191) NULL DEFAULT 'pending',
    `attempts` INTEGER NULL DEFAULT 0,
    `max_attempts` INTEGER NULL DEFAULT 3,
    `error_message` LONGTEXT NULL,
    `action_type` LONGTEXT NULL,
    `resource_id` INTEGER NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `processed_at` LONGTEXT NULL,
    `next_retry_at` LONGTEXT NULL,
    `cc_emails` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NULL,
    `label_long` LONGTEXT NOT NULL,
    `label_short` VARCHAR(191) NOT NULL DEFAULT '',
    `icon` VARCHAR(191) NOT NULL DEFAULT 'tag',
    `bg_color` VARCHAR(191) NOT NULL DEFAULT '#ffeb3b',
    `text_color` VARCHAR(191) NOT NULL DEFAULT '#000000',
    `border_color` VARCHAR(191) NOT NULL DEFAULT '#000000',
    `is_other` INTEGER NOT NULL DEFAULT 0,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `event_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expert_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `expert_id` INTEGER NOT NULL,
    `date` LONGTEXT NOT NULL,
    `period` LONGTEXT NOT NULL,
    `activity_name` LONGTEXT NOT NULL,
    `requester_name` LONGTEXT NOT NULL,
    `action_type` LONGTEXT NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `is_read` INTEGER NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ics_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `file_id` INTEGER NOT NULL,
    `event_date` LONGTEXT NOT NULL,
    `event_end_date` LONGTEXT NULL,
    `summary` LONGTEXT NULL,
    `zone` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ics_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` LONGTEXT NOT NULL,
    `filename` LONGTEXT NOT NULL,
    `content` LONGTEXT NULL,
    `config` LONGTEXT NULL,
    `imported_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `libelle_long` VARCHAR(191) NOT NULL,
    `libelle_court` LONGTEXT NOT NULL,
    `adresse` LONGTEXT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `updated_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `locations_libelle_long_key`(`libelle_long`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mfa_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `code` LONGTEXT NOT NULL,
    `expires_at` LONGTEXT NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `mfa_codes_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mfa_validations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `validated_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `created_at` LONGTEXT NOT NULL,
    `expires_at` LONGTEXT NOT NULL,
    `used_at` LONGTEXT NULL,

    UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pending_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` LONGTEXT NOT NULL,
    `resource_id` INTEGER NOT NULL,
    `expert_id` INTEGER NOT NULL,
    `assignment_data` LONGTEXT NOT NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pending_push_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `to_user_id` INTEGER NOT NULL,
    `from_user_id` INTEGER NOT NULL,
    `from_name` LONGTEXT NULL,
    `from_photo` LONGTEXT NULL,
    `message` LONGTEXT NOT NULL,
    `sent_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `poi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `location_id` INTEGER NOT NULL,
    `category` LONGTEXT NOT NULL,
    `name` LONGTEXT NOT NULL,
    `address` LONGTEXT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `comment` LONGTEXT NULL,
    `website` LONGTEXT NULL,
    `phone` LONGTEXT NULL,
    `osm_ref` LONGTEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `updated_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    INDEX `idx_poi_location`(`location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `poi_comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `poi_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `text` LONGTEXT NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `updated_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    INDEX `idx_poi_comments_poi`(`poi_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `poi_ratings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `poi_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `rating` INTEGER NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `updated_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `poi_ratings_poi_id_user_id_key`(`poi_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resource_mad_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `taux` DOUBLE NOT NULL,
    `date_debut` LONGTEXT NOT NULL,
    `date_fin` LONGTEXT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `created_by` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resource_mad_particularites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `mad_history_id` INTEGER NOT NULL,
    `taux` DOUBLE NOT NULL,
    `date_debut` LONGTEXT NOT NULL,
    `date_fin` LONGTEXT NOT NULL,
    `motif` LONGTEXT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `created_by` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resource_samu_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `samu` VARCHAR(191) NOT NULL,
    `role` LONGTEXT NOT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `resource_samu_assignments_resource_id_samu_key`(`resource_id`, `samu`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nom` LONGTEXT NOT NULL,
    `prenom` LONGTEXT NOT NULL,
    `trigramme` LONGTEXT NOT NULL,
    `email` LONGTEXT NULL,
    `telephone` LONGTEXT NULL,
    `taux` DOUBLE NOT NULL,
    `samu` LONGTEXT NOT NULL,
    `actif` INTEGER NULL DEFAULT 1,
    `date_debut` LONGTEXT NULL,
    `date_fin` LONGTEXT NULL,
    `es_rattachement` LONGTEXT NULL,
    `fonction` LONGTEXT NULL,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `astreinte_volontaire` INTEGER NULL DEFAULT 0,
    `date_fin_mad` LONGTEXT NULL,
    `jours_max_mad` INTEGER NULL,
    `is_mad_volante` INTEGER NULL DEFAULT 0,
    `contacts_rh` LONGTEXT NULL,
    `astreinte_date_activation` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_data` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `resource_id` INTEGER NOT NULL,
    `date_key` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `value` LONGTEXT NOT NULL,
    `notification` VARCHAR(191) NULL DEFAULT '0',
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    UNIQUE INDEX `schedule_data_resource_id_date_key_type_key`(`resource_id`, `date_key`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` LONGTEXT NOT NULL,

    UNIQUE INDEX `settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `version` LONGTEXT NOT NULL,
    `updated_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(191) NOT NULL,
    `password` LONGTEXT NOT NULL,
    `nom` LONGTEXT NOT NULL,
    `prenom` LONGTEXT NOT NULL,
    `email` LONGTEXT NOT NULL,
    `telephone` LONGTEXT NULL,
    `is_admin` INTEGER NULL DEFAULT 0,
    `is_expert` INTEGER NULL DEFAULT 0,
    `is_user` INTEGER NULL DEFAULT 0,
    `resource_id` INTEGER NULL,
    `actif` INTEGER NULL DEFAULT 1,
    `created_at` VARCHAR(19) NULL DEFAULT (date_format(utc_timestamp(), '%Y-%m-%d %H:%i:%s')),
    `totp_secret` LONGTEXT NULL,
    `default_tab` VARCHAR(191) NULL DEFAULT 'planning',
    `profile_photo` LONGTEXT NULL,
    `trigramme` LONGTEXT NULL,
    `has_reporting_access` INTEGER NULL DEFAULT 0,
    `amoa_ced` INTEGER NULL DEFAULT 0,
    `is_rh` INTEGER NULL DEFAULT 0,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
