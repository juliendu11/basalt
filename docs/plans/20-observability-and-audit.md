# 20 — Observability and Audit

## Objective

Fournir une architecture permettant de comprendre après coup ce qui s'est passé dans le système — en particulier "pourquoi ce contact n'a pas reçu cet email" — via deux mécanismes distincts et complémentaires : un **journal d'audit** orienté actions utilisateur/organisation, et une **trace d'exécution** orientée debugging technique du Campaign Engine, plus un écran minimal de consultation des jobs en échec.

## Functional requirements

- Journal d'audit des actions significatives (création/suppression d'organisation, invitation, activation de campagne, création de connecteur SMTP, ...).
- Trace détaillée de l'exécution d'une campagne par contact (quel node exécuté, quand, résultat) — déjà modélisée par `campaign_execution_events` (`12-campaign-engine.md`), ce plan en définit la **consultation**.
- Écran de consultation des jobs en échec définitif (BullMQ), avec action de relance manuelle.
- Recherche/filtrage de l'audit log par acteur, action, période, projet.

## User flows

```text
Utilisateur (owner/admin) consulte le journal d'audit d'une organisation ou d'un projet
  → liste paginée, filtrable par acteur/action/date
  → chaque ligne : "Jean Dupont a activé la campagne 'Bienvenue' — il y a 2 heures"

Utilisateur consulte l'historique d'un contact (05-contacts.md, onglet "Historique")
  → liste chronologique croisée : enrollments, campaign_execution_events des exécutions de ce
    contact, email_events le concernant, contact_unsubscribe_events
  → répond directement au besoin "pourquoi ce contact n'a pas reçu cet email" (cf. init.md)

Utilisateur (owner/admin) consulte l'écran "jobs en échec"
  → liste des jobs BullMQ en statut failed (tous domaines confondus, filtrable par file)
  → action "Relancer" par job
```

## Domain concepts

**Deux journaux distincts, ne pas les confondre** (rappel explicite car la distinction n'est pas évidente a priori) :

| | `audit_logs` | `campaign_execution_events` |
|---|---|---|
| Portée | Actions **utilisateur** significatives, échelle organisation/projet | Trace **technique** d'une exécution de campagne pour un contact précis |
| Acteur | `actor_user_id` (ou `null` si système) | Pas d'acteur humain — c'est le moteur qui journalise |
| Volume | Faible (une ligne par action explicite) | Potentiellement élevé (une ligne par transition de node, par contact, par exécution) |
| Rétention | Longue (audit de conformité/traçabilité) | Peut être purgée plus agressivement si le volume devient un problème (voir Performance considerations) |
| Consommateur typique | Admin qui veut savoir "qui a fait quoi" | Développeur/support qui debug "pourquoi ce contact bloque au node X" |

**`AuditLogListener`** : un listener générique unique, déjà référencé dans presque tous les plans précédents (`03-organizations.md` à `18-statistics-dashboard.md`), qui s'abonne à une liste d'events "auditables" et écrit une ligne `audit_logs` standardisée pour chacun — centralise la logique d'écriture plutôt que de la dupliquer dans chaque domaine (chaque domaine se contente d'émettre son event métier normal, déjà nécessaire pour d'autres raisons ; l'audit est un **effet secondaire centralisé** de ces events, pas une responsabilité supplémentaire portée par chaque service).

```text
Events auditables (liste, complétée au fil des plans, référence consolidée ici) :
  OrganizationMemberInvited, OrganizationMemberJoined, OrganizationMemberRemoved,
  OrganizationOwnershipTransferred, ProjectCreated, ProjectDeleted,
  SmtpConnectorCreated, SmtpConnectorUpdated, SmtpConnectorDeleted, SmtpConnectorDefaultChanged,
  EmailTemplateCreated/Updated/Deleted, EmailCreated/Updated/Deleted/Published,
  CampaignActivated, CampaignPaused, CampaignResumed, CampaignArchived, CampaignCompleted,
  CampaignVersionPublished, ContactUnsubscribed (source='manual' uniquement — un désabonnement
    via lien n'a pas d'acteur humain interne, cf. 17-unsubscribe.md, actor_user_id=null sinon)
```

`AuditLogListener` mappe chaque event vers `{ action: 'organization.member_invited', entityType, entityId, metadata }` via une petite table de correspondance explicite (pas une réflexion générique sur le nom de la classe d'event, pour garder le `action` stable même si un nom de classe TypeScript est renommé en refactor).

**Trace d'exécution (`campaign_execution_events`)** : déjà entièrement modélisée et peuplée par `12-campaign-engine.md` (§ Backend architecture, étape 9 de `advance()`) — ce plan documente uniquement l'**écran de consultation**, pas la production de ces données.

## Data model

`audit_logs` déjà défini dans `02-database-design.md` § Audit / Statistiques. `campaign_execution_events` déjà défini dans `02-database-design.md` § Campagnes — exécution. Aucun ajout de table pour ce plan.

## Backend architecture

```text
app/listeners/write_audit_log.ts   (AuditLogListener, table de correspondance event -> action)
app/services/audit/audit_log_service.ts   (paginate/filter, appelé par le controller de consultation)
app/services/jobs/failed_jobs_service.ts  (list/retry — lit directement l'API BullMQ, cf. 14-jobs-and-queues.md)
app/transformers/audit_log_transformer.ts
```

`FailedJobsService.list(queueName?)` : appelle `Queue.getFailed()` (API BullMQ native) pour chaque file ou une file donnée, mappe vers une structure d'affichage simple (`{ id, queue, name, failedReason, attemptsMade, data, timestamp }`). `FailedJobsService.retry(queueName, jobId)` : appelle `Job.retry()` (API BullMQ native) — pas de réimplémentation, une fine couche d'adaptation pour l'UI.

## Frontend architecture

```text
inertia/pages/.../settings/audit-log/
  index.vue    (liste paginée, filtres acteur/action/date)
inertia/pages/.../contacts/[contactId]/
  history.vue  (ou un onglet de show.vue, cf. 05-contacts.md — historique croisé)
inertia/pages/.../settings/jobs/
  index.vue    (jobs en échec, action "Relancer")
```

## Routes

```text
GET  .../settings/audit-log               audit_log.index          [role >= admin]
GET  .../contacts/:contactId/history        contacts.history          [standard lecture]
GET  .../settings/jobs                     failed_jobs.index         [role >= admin]
POST .../settings/jobs/:queue/:jobId/retry  failed_jobs.retry          [role == owner || role == admin]
```

## Controllers

`AuditLogController` (index), `ContactHistoryController` (index — agrège plusieurs sources en lecture seule, cf. Domain concepts), `FailedJobsController` (index, retry).

## Services

Voir Backend architecture. `ContactHistoryController` n'a pas de service dédié complexe — il agrège des lectures déjà exposées par les modèles/scopes d'autres domaines (`enrollments`, `campaign_execution_events` via les exécutions du contact, `email_events`, `contact_unsubscribe_events`), triées par date, dans une simple méthode de controller ou un petit service `ContactHistoryService.build(contact)` si la logique d'assemblage devient non triviale.

## Models

Aucun nouveau modèle (utilise `AuditLog`, `CampaignExecutionEvent` déjà définis, plus les modèles d'autres domaines pour l'historique contact).

## Jobs / Commands

Aucun job propre à ce plan. Purge éventuelle de `campaign_execution_events` ancien (voir Performance considerations) documentée comme piste, pas implémentée en v1.

## Events

Ce plan est **consommateur** de la quasi-totalité des events du système (via `AuditLogListener`), il n'en émet aucun de nouveau.

## Permissions

Consultation de l'audit log et des jobs en échec : réservée à `owner`/`admin` (information potentiellement sensible sur l'activité d'autres membres, et action technique de relance de job). Historique d'un contact : permissions standard de lecture projet (tous les rôles, y compris `viewer`) — c'est une information opérationnelle sur le contact, pas une donnée d'audit sensible sur les membres.

## Validation

`AuditLogController.index` : filtres (`actorUserId?`, `action?`, `from?`, `to?`) validés comme optionnels, pagination standard.

## Edge cases

- Action système sans acteur humain (ex. `CampaignCompleted` déclenché par le job périodique) → `audit_logs.actor_user_id = null`, affiché comme "Système" dans l'UI plutôt qu'un nom vide/erreur.
- Job relancé manuellement qui échoue à nouveau immédiatement → réapparaît dans la liste des jobs en échec avec un `attemptsMade` incrémenté, comportement normal (pas un cas spécial à gérer).
- Historique d'un contact avec un très grand nombre d'événements (contact ancien, très actif) → pagination obligatoire dès la conception de `ContactHistoryController` (jamais un chargement complet non paginé).

## Failure scenarios

`FailedJobsService` qui échoue à contacter Redis (indisponibilité) → l'écran affiche une erreur explicite ("impossible de récupérer les jobs en échec, Redis indisponible") plutôt qu'une page cassée silencieusement — géré par un traitement d'erreur explicite dans le controller, pas un comportement par défaut d'AdonisJS à ne pas laisser faire.

## Idempotency considerations

`AuditLogListener` n'a pas besoin d'idempotence stricte au-delà de ce que le bus d'events interne d'AdonisJS garantit déjà (un event émis une fois dans une requête HTTP normale n'est pas rejoué) — une ligne d'audit en double en cas de bug serait une nuisance mineure, pas une incohérence dangereuse (contrairement à l'idempotence d'envoi d'email, cf. `15-retry-and-idempotency.md`, qui reste le seul mécanisme à garantie stricte du système).

## Performance considerations

- `audit_logs (organization_id, occurred_at)`/`(project_id, occurred_at)` déjà indexés (`02-database-design.md`) — pagination toujours indexée.
- `campaign_execution_events` peut croître rapidement à fort volume de campagnes/contacts — **piste de purge** (non implémentée en v1) : conserver en détail seulement les N derniers jours, ou uniquement les événements des exécutions encore actives/récemment terminées, au-delà agréger en un résumé compact. Documenté comme Open question, pas un mécanisme requis pour la v1 (volumes de départ jugés gérables sans purge).

## Security considerations

- L'écran de jobs en échec peut exposer le `payload` complet d'un job (ex. `email.send { contactId, ... }`) — vérifier qu'aucun secret déchiffré n'y transite jamais (cohérent avec `07-smtp-connectors.md`/`15-retry-and-idempotency.md` : un job référence toujours un `smtpConnectorId`, jamais un mot de passe déchiffré en clair dans son payload).
- `audit_logs.metadata` (JSON libre par event) : même règle — jamais de secret stocké dedans, revue explicite à chaque nouvel event ajouté à la liste auditable.

## Testing strategy

- Unit : `AuditLogListener` — chaque event auditable de la liste produit bien une ligne `audit_logs` avec l'`action` attendue.
- Unit : `FailedJobsService` (mock de l'API BullMQ) — list/retry fonctionnent, gestion d'erreur Redis explicite.
- Functional : parcours complet d'un scénario (ex. activation de campagne) → ligne d'audit visible dans l'UI ; historique contact affiche bien enrollment + execution events + email events dans l'ordre chronologique correct.

## Implementation steps

1. Créer `app/listeners/write_audit_log.ts` (table de correspondance event → action, écrite au fil de l'implémentation des autres plans — ce fichier est amené à être étendu à chaque nouveau domaine, pas figé une fois pour toutes ici).
2. Enregistrer ce listener sur tous les events auditables listés, dans `start/events.ts`.
3. Créer `app/services/audit/audit_log_service.ts`.
4. Créer `app/services/jobs/failed_jobs_service.ts` (dépend de `14-jobs-and-queues.md`).
5. Créer les transformers, controllers (`AuditLogController`, `ContactHistoryController`, `FailedJobsController`) et routes.
6. Créer les pages Inertia listées ci-dessus.
7. Écrire les tests listés ci-dessus.

## Dependencies

Dépend structurellement de la quasi-totalité des plans précédents (consommateur d'events) — implémenté en continu au fil de la roadmap plutôt qu'en un seul bloc final isolé (voir `22-development-roadmap.md`), avec un socle minimal (`AuditLogListener` + écran de base) mis en place tôt (dès `03-organizations.md`) puis étendu à chaque nouveau domaine.

## Open questions

- Purge/rétention de `campaign_execution_events` à long terme : non implémentée en v1, à dimensionner avec des volumes de production réels.
- Alerting proactif (notification sur une action d'audit sensible, ex. suppression d'organisation) : non implémenté en v1, extension naturelle de `AuditLogListener` si demandée.
