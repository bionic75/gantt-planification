# Référence de l’API

> Fichier généré par `npm run routes` à partir des routeurs de l’application : ne pas le modifier à la main.

Conventions :

- requêtes et réponses en JSON ; une erreur répond `{ "error": "message" }` avec le statut HTTP correspondant
  (400 requête invalide, 401 non connecté, 403 non autorisé, 404 introuvable, 429 trop de tentatives) ;
- authentification par le cookie de session `gantt.sid`, ouvert par `POST /api/login` ;
- les modifications (POST, PUT, DELETE) envoyées par un navigateur doivent venir de l’application elle-même
  (protection CSRF, voir [securite.md](securite.md)) ;
- API publique : clé dans l’en-tête `X-Api-Key`.

Protections :

| Protection | Accès |
| --- | --- |
| `public` | Publique |
| `auth` | Utilisateur connecté |
| `admin` | Administrateur |
| `adminOrRh` | Administrateur ou RH |
| `reporting` | Administrateur ou droit « reporting » |
| `affectation` | Administrateur ou accès à « Aide à l’affectation » |
| `mfaPending` | Connexion en attente de double authentification |
| `apiKey` | Clé d’API (en-tête X-Api-Key) |

308 routes, par module (`src/modules/<module>`) :

## admin

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/aide.html` | public |
| GET | `/api/email-config` | admin |
| POST | `/api/email-config` | admin |
| POST | `/api/email-config/test` | admin |
| GET | `/api/help/info` | admin |
| POST | `/api/help/upload` | admin |
| DELETE | `/api/help/upload` | admin |
| GET | `/api/settings` | auth |
| POST | `/api/settings` | admin |
| PUT | `/api/settings` | admin |
| GET | `/api/system/version` | public |
| POST | `/api/system/version` | admin |
| GET | `/api/tab-access` | auth |
| PUT | `/api/tab-access` | admin |
| GET | `/api/theme` | public |
| PUT | `/api/theme` | admin |
| GET | `/api/version` | public |

## affectation

| Méthode | Chemin | Protection |
| --- | --- | --- |
| POST | `/api/affectation/asana/apply` | admin |
| GET | `/api/affectation/asana/config` | admin |
| PUT | `/api/affectation/asana/config` | admin |
| PUT | `/api/affectation/asana/links` | admin |
| POST | `/api/affectation/asana/preview` | admin |
| GET | `/api/affectation/asana/projects` | admin |
| POST | `/api/affectation/asana/refresh-all` | admin |
| GET | `/api/affectation/asana/teams` | admin |
| POST | `/api/affectation/asana/test` | admin |
| DELETE | `/api/affectation/asana/token` | admin |
| GET | `/api/affectation/ateliers` | affectation |
| PUT | `/api/affectation/ateliers` | admin |
| DELETE | `/api/affectation/ateliers/:id` | admin |
| POST | `/api/affectation/ateliers/:id/send` | admin |
| GET | `/api/affectation/ateliers/meta` | affectation |
| POST | `/api/affectation/ateliers/simulate` | affectation |
| PUT | `/api/affectation/colors` | admin |
| GET | `/api/affectation/config` | affectation |
| GET | `/api/affectation/events` | affectation |
| GET | `/api/affectation/export-config` | affectation |
| PUT | `/api/affectation/export-config` | admin |
| POST | `/api/affectation/export/pdf` | affectation |
| POST | `/api/affectation/export/pptx` | affectation |
| POST | `/api/affectation/import/asana-csv` | admin |
| POST | `/api/affectation/import/asana-csv/apply` | admin |
| GET | `/api/affectation/projects` | affectation |
| POST | `/api/affectation/projects` | admin |
| PUT | `/api/affectation/projects/:id` | admin |
| DELETE | `/api/affectation/projects/:id` | admin |
| PUT | `/api/affectation/projects/:id/asana-overrides` | admin |
| POST | `/api/affectation/projects/:id/asana-refresh` | admin |
| GET | `/api/affectation/projects/:id/asana-tasks` | admin |
| PUT | `/api/affectation/projects/:id/assignments/:stage` | affectation |
| POST | `/api/affectation/projects/:id/assignments/:stage/release` | admin |
| GET | `/api/affectation/projects/:id/availability/:stage` | affectation |
| POST | `/api/affectation/projects/:id/event-create` | admin |
| PUT | `/api/affectation/projects/:id/event-link` | admin |
| GET | `/api/affectation/projects/:id/events-candidates` | admin |
| GET | `/api/affectation/projects/:id/history` | affectation |
| GET | `/api/affectation/projects/:id/sync/:stage` | affectation |
| POST | `/api/affectation/projects/:id/sync/:stage` | admin |
| GET | `/api/affectation/resources` | affectation |
| GET | `/api/affectation/stage-event-types` | affectation |
| PUT | `/api/affectation/stage-event-types` | admin |
| POST | `/api/affectation/sync-from-events` | affectation |
| GET | `/api/affectation/template` | affectation |
| PUT | `/api/affectation/template` | admin |
| DELETE | `/api/affectation/template` | admin |
| GET | `/api/affectation/template/preview` | affectation |
| GET | `/api/affectation/users` | admin |

## astreintes

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/all-astreintes-planning` | auth |
| GET | `/api/astreinte/dispos/:expertId/:mois` | auth |
| POST | `/api/astreinte/dispos/:expertId/:mois` | auth |
| POST | `/api/astreinte/generate` | admin |
| POST | `/api/astreinte/indispo` | admin |
| DELETE | `/api/astreinte/indispo/:id` | admin |
| GET | `/api/astreinte/indispos` | admin |
| GET | `/api/astreinte/planning/:mois` | admin |
| PUT | `/api/astreinte/slot/:id` | admin |
| POST | `/api/astreinte/volontaire/:id` | admin |
| GET | `/api/astreinte/volontaires` | admin |
| GET | `/api/astreintes` | auth |
| POST | `/api/astreintes` | auth |
| DELETE | `/api/astreintes-hno/:id` | auth |
| GET | `/api/astreintes-hno/direct` | auth |
| POST | `/api/astreintes-hno/direct` | auth |
| GET | `/api/astreintes-hno/lock-check` | auth |
| PUT | `/api/astreintes/:id` | auth |
| DELETE | `/api/astreintes/:id` | auth |
| GET | `/api/experts-list` | auth |
| GET | `/api/mes-astreintes` | auth |

## astreintes-ho

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/astreintes-ho` | auth |
| POST | `/api/astreintes-ho/automation/:n/send` | admin |
| GET | `/api/astreintes-ho/info` | admin |
| POST | `/api/astreintes-ho/save` | auth |

## auth

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/check-session` | public |
| POST | `/api/forgot-password` | public |
| POST | `/api/login` | public |
| POST | `/api/logout` | public |
| GET | `/api/mfa/config` | admin |
| POST | `/api/mfa/config` | admin |
| POST | `/api/mfa/reset-all` | admin |
| POST | `/api/mfa/reset-totp/:userId` | admin |
| POST | `/api/mfa/send-code` | mfaPending |
| POST | `/api/mfa/totp-confirm` | mfaPending |
| POST | `/api/mfa/totp-setup` | mfaPending |
| GET | `/api/mfa/totp-status/:userId` | mfaPending |
| POST | `/api/mfa/verify` | mfaPending |
| POST | `/api/mobile-login` | public |
| POST | `/api/reset-password` | public |
| POST | `/api/reset-password/check` | public |
| POST | `/api/switch-profile` | auth |

## automations

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/automation/available-months` | admin |
| POST | `/api/automation/cleanup-dates-execute` | admin |
| POST | `/api/automation/cleanup-dates-preview` | admin |
| GET | `/api/automation/config/:id` | admin |
| POST | `/api/automation/config/:id` | admin |
| GET | `/api/automation/diagnose-months` | admin |
| GET | `/api/automation/download/2/:logId` | admin |
| GET | `/api/automation/logs/:id` | admin |
| DELETE | `/api/automation/logs/:id` | admin |
| POST | `/api/automation/preview/2` | admin |
| POST | `/api/automation/send-reminder` | admin |
| POST | `/api/automation/send/2` | admin |
| GET | `/api/automation/test/1` | admin |

## calendar

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/ics-files/school-holidays` | admin |
| POST | `/api/ics-files/school-holidays` | admin |
| DELETE | `/api/ics-files/school-holidays/:id` | admin |
| GET | `/api/ics-files/school-holidays/all-periods` | auth |
| GET | `/api/ics-files/special-dates` | admin |
| POST | `/api/ics-files/special-dates` | admin |
| DELETE | `/api/ics-files/special-dates/:id` | admin |
| PUT | `/api/ics-files/special-dates/:id/config` | admin |
| GET | `/api/ics-files/special-dates/all` | auth |
| GET | `/api/school-holidays` | auth |
| POST | `/api/school-holidays` | admin |

## cra

| Méthode | Chemin | Protection |
| --- | --- | --- |
| POST | `/api/automation/cra/trigger` | admin |
| GET | `/api/cra/:id` | auth |
| POST | `/api/cra/:id/admin-correction` | admin |
| POST | `/api/cra/:id/archive` | admin |
| POST | `/api/cra/:id/astreintes` | auth |
| GET | `/api/cra/:id/collect` | auth |
| POST | `/api/cra/:id/diffuser` | admin |
| GET | `/api/cra/:id/diffusion-log` | auth |
| GET | `/api/cra/:id/diffusion-recipients` | admin |
| POST | `/api/cra/:id/diffusion-resend-all` | admin |
| POST | `/api/cra/:id/diffusion-resend/:logId` | admin |
| GET | `/api/cra/:id/pdf` | auth |
| POST | `/api/cra/:id/prepare-pdf` | adminOrRh |
| POST | `/api/cra/:id/propagate` | auth |
| DELETE | `/api/cra/:id/purge` | admin |
| POST | `/api/cra/:id/recall` | auth |
| POST | `/api/cra/:id/refuser/:niveau` | admin |
| POST | `/api/cra/:id/restore-deleted` | admin |
| POST | `/api/cra/:id/return-to-expert` | admin |
| POST | `/api/cra/:id/rien-a-declarer` | auth |
| POST | `/api/cra/:id/soft-delete` | admin |
| POST | `/api/cra/:id/submit` | auth |
| POST | `/api/cra/:id/unarchive` | admin |
| POST | `/api/cra/:id/visa/:niveau` | admin |
| GET | `/api/cra/admin/archives` | adminOrRh |
| GET | `/api/cra/admin/deleted` | admin |
| GET | `/api/cra/admin/list` | adminOrRh |
| GET | `/api/cra/all-experts` | adminOrRh |
| GET | `/api/cra/all-experts-full` | admin |
| GET | `/api/cra/experts-astreinte` | admin |
| GET | `/api/cra/find-or-create` | auth |
| POST | `/api/cra/launch` | admin |
| GET | `/api/cra/my-list` | auth |
| GET | `/api/cra/pdf-saved/:filename` | auth |
| POST | `/api/cra/rh-recipients` | admin |

## deplacements

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/bons-commande` | auth |
| POST | `/api/bons-commande` | auth |
| PUT | `/api/bons-commande/:id` | auth |
| DELETE | `/api/bons-commande/:id` | auth |
| GET | `/api/deplacements` | auth |
| POST | `/api/deplacements` | auth |
| GET | `/api/deplacements/:id` | auth |
| PUT | `/api/deplacements/:id` | auth |
| DELETE | `/api/deplacements/:id` | auth |
| POST | `/api/deplacements/:id/reaffecter` | auth |
| POST | `/api/deplacements/:id/regularisation` | auth |
| POST | `/api/deplacements/regularisation-technique` | admin |
| GET | `/api/liste-samu` | auth |
| GET | `/api/mes-deplacements` | auth |
| GET | `/api/reporting-deplacements` | auth |

## dump

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/admin/dump` | admin |
| POST | `/api/admin/dump/inspect` | admin |
| POST | `/api/admin/dump/restore` | admin |
| DELETE | `/api/admin/dump/upload/:token` | admin |

## events

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/custom-events` | admin |
| POST | `/api/custom-events` | admin |
| PUT | `/api/custom-events/:id` | admin |
| DELETE | `/api/custom-events/:id` | admin |
| GET | `/api/custom-events/search` | auth |
| GET | `/api/event-types` | auth |
| POST | `/api/event-types` | admin |
| PUT | `/api/event-types/:id` | admin |
| DELETE | `/api/event-types/:id` | admin |
| GET | `/api/event-types/events` | admin |
| PUT | `/api/event-types/events/bulk` | admin |
| GET | `/api/mobile-events` | auth |
| GET | `/api/my-custom-events` | auth |
| POST | `/api/my-custom-events` | auth |
| PUT | `/api/my-custom-events/:id` | auth |
| DELETE | `/api/my-custom-events/:id` | admin |
| POST | `/api/my-custom-events/:id/join` | auth |

## locations

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/locations` | auth |
| POST | `/api/locations` | auth |
| PUT | `/api/locations/:id` | admin |
| DELETE | `/api/locations/:id` | admin |
| GET | `/api/locations/:id/usage` | admin |
| POST | `/api/locations/import` | admin |
| POST | `/api/locations/import/resolve` | admin |

## logs

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/active-sessions` | auth |
| GET | `/api/logs/actions` | admin |
| POST | `/api/logs/add-modification` | auth |
| GET | `/api/logs/planning-debug` | admin |
| DELETE | `/api/logs/purge-all` | admin |
| DELETE | `/api/logs/raz` | admin |
| GET | `/api/reporting/connections` | admin |

## notifications

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/email-queue/status/:batchId` | auth |
| POST | `/api/notifications/clear-all` | admin |
| GET | `/api/notifications/count` | auth |
| POST | `/api/notifications/create-batch` | auth |
| GET | `/api/notifications/list` | auth |
| POST | `/api/notifications/mark-read` | auth |
| POST | `/api/pending-notifications` | auth |
| GET | `/api/pending-notifications/:sessionId` | auth |
| DELETE | `/api/pending-notifications/:sessionId` | auth |
| POST | `/api/push-message` | auth |
| POST | `/api/request-assignment` | auth |
| POST | `/api/send-assignment-emails` | auth |
| POST | `/api/send-assignment-notifications` | auth |
| POST | `/api/send-calendar-email` | auth |
| GET | `/api/sse` | auth |
| POST | `/api/teams/notify` | auth |
| POST | `/api/teams/test` | admin |

## poi

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/poi` | auth |
| POST | `/api/poi` | auth |
| GET | `/api/poi/:id` | auth |
| PUT | `/api/poi/:id` | auth |
| DELETE | `/api/poi/:id` | auth |
| POST | `/api/poi/:id/comments` | auth |
| PUT | `/api/poi/:id/rating` | auth |
| DELETE | `/api/poi/:id/rating` | auth |
| GET | `/api/poi/:id/route` | auth |
| PUT | `/api/poi/comments/:cid` | auth |
| DELETE | `/api/poi/comments/:cid` | auth |
| GET | `/api/poi/meta` | auth |
| GET | `/api/poi/places` | auth |

## public-api

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/admin/api-keys` | admin |
| POST | `/api/admin/api-keys` | admin |
| DELETE | `/api/admin/api-keys/:id` | admin |
| DELETE | `/api/admin/api-keys/:id/permanent` | admin |
| GET | `/api/public/events` | apiKey |

## reporting

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/export/gantt` | auth |
| GET | `/api/export/resources` | auth |
| POST | `/api/reporting/availability` | reporting |
| GET | `/api/reporting/diagnose/:expertId/:year/:month` | reporting |
| GET | `/api/reporting/events-map` | auth |
| POST | `/api/reporting/hno-astreintes` | auth |

## resources

| Méthode | Chemin | Protection |
| --- | --- | --- |
| PUT | `/api/me/samu-assignments` | auth |
| GET | `/api/resource-samu-assignments` | auth |
| GET | `/api/resources` | auth |
| POST | `/api/resources` | admin |
| PUT | `/api/resources/:id` | admin |
| DELETE | `/api/resources/:id` | admin |
| POST | `/api/resources/:id/astreinte` | admin |
| GET | `/api/resources/:id/effective-mad-rate` | auth |
| GET | `/api/resources/:id/mad-history` | auth |
| POST | `/api/resources/:id/mad-history` | admin |
| PUT | `/api/resources/:id/mad-history/:historyId` | admin |
| DELETE | `/api/resources/:id/mad-history/:historyId` | admin |
| GET | `/api/resources/:id/mad-history/:historyId/particularites` | auth |
| POST | `/api/resources/:id/mad-history/:historyId/particularites` | admin |
| PUT | `/api/resources/:id/mad-history/:historyId/particularites/:particulariteId` | admin |
| DELETE | `/api/resources/:id/mad-history/:historyId/particularites/:particulariteId` | admin |
| GET | `/api/resources/:id/samu-assignments` | auth |
| PUT | `/api/resources/:id/samu-assignments` | admin |
| POST | `/api/resources/:id/toggle` | admin |
| GET | `/api/resources/experts-map` | auth |

## schedule

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/schedule` | auth |
| POST | `/api/schedule` | auth |
| POST | `/api/schedule/cleanup-old-format` | admin |
| POST | `/api/schedule/preview-reset-month` | auth |
| POST | `/api/schedule/reset-month` | auth |
| POST | `/api/schedule/save` | auth |

## users

| Méthode | Chemin | Protection |
| --- | --- | --- |
| GET | `/api/app-access` | admin |
| POST | `/api/app-access/:app/users` | admin |
| DELETE | `/api/app-access/:app/users/:userId` | admin |
| POST | `/api/profile/change-password` | auth |
| GET | `/api/profile/photo` | auth |
| POST | `/api/profile/photo` | auth |
| GET | `/api/user/email-by-resource/:resourceId` | auth |
| GET | `/api/users` | admin |
| POST | `/api/users` | admin |
| PUT | `/api/users/:id` | admin |
| DELETE | `/api/users/:id` | admin |
| POST | `/api/users/:id/amoa-ced` | admin |
| POST | `/api/users/:id/astreinte-access` | admin |
| PUT | `/api/users/:id/default-tab` | auth |
| POST | `/api/users/:id/force-logout` | admin |
| POST | `/api/users/:id/reporting-access` | admin |
| POST | `/api/users/:id/reset-password` | admin |
| POST | `/api/users/:id/rh-access` | admin |
| POST | `/api/users/:id/toggle` | admin |
| GET | `/api/users/amoa-ced` | auth |
| POST | `/api/users/change-password` | auth |
| GET | `/api/users/public` | auth |
| GET | `/api/users/search` | admin |
