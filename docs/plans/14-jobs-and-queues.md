# 14 — Jobs and Queues

## Objective

Mettre en place l'infrastructure de queue asynchrone (BullMQ + Redis, cf. `decisions/ADR-002-queue-system.md`) sur laquelle reposent tous les traitements différés du système : envoi d'email, avancement de campagne, recalcul de segment, ingestion de tracking, agrégation de statistiques.

## Functional requirements

- Définir/enregistrer des files (queues) par domaine de charge.
- Fournir un mécanisme générique d'enqueue typé (`queue.dispatch('emails', 'send', payload)`).
- Fournir un ou plusieurs process worker (commande ace) consommant les files.
- Supporter les jobs différés (`delay`) pour le scheduling de wait.
- Supporter le retry avec backoff (configuration générique, affinée par domaine dans `15-retry-and-idempotency.md`).
- Exposer une visibilité minimale sur les jobs en échec (liste consultable, cf. `20-observability-and-audit.md`).
- Fournir un mécanisme de déclenchement **périodique** (pas de scheduler natif dans BullMQ/AdonisJS — voir Domain concepts) pour les jobs récurrents (nightly segment recompute, scheduling des waits dus, agrégation de stats).

## User flows

Sans objet direct (infrastructure interne, pas de flux utilisateur). Flux opérationnel de déploiement :

```text
Déploiement
  → process HTTP démarré (node ace serve / build + start)
  → process worker démarré séparément (node ace queue:work --queue=emails,campaign-engine,segments,tracking,statistics)
  → process scheduler démarré séparément OU cron système appelant des commands ace ponctuelles
    (voir § Scheduling périodique pour le choix retenu)
```

## Domain concepts

**Files retenues** (rappel `decisions/ADR-002-queue-system.md`) :

```text
emails            concurrency élevée mais rate-limitée PAR CONNECTEUR SMTP (voir ci-dessous)
campaign-engine   concurrency élevée, latence importante (chaque transition de graphe)
segments          concurrency faible, jobs potentiellement longs (recompute complet)
tracking          concurrency élevée, jobs très courts (ingestion d'un event)
statistics        concurrency faible, jobs planifiés
```

**Rate limiting par connecteur SMTP** : BullMQ supporte un rate limiter par file (`limiter: { max, duration }`), mais un projet peut avoir plusieurs connecteurs avec des limites différentes (`smtp_connectors.daily_limit`) — une seule file `emails` globale ne suffit pas à isoler ces limites. **Décision** : le rate limiting fin par connecteur n'est **pas** implémenté via des files BullMQ séparées par connecteur (explosion du nombre de files, complexité opérationnelle disproportionnée) mais via un **compteur applicatif** (Redis, `INCR` avec expiration à minuit UTC du fuseau projet) vérifié par `send_email_executor.ts` (`12-campaign-engine.md`) juste avant l'appel SMTP : si la limite quotidienne est atteinte, le job échoue avec une erreur **retryable** classée "rate limited" (retry différé de quelques heures, pas le backoff court standard — voir `15-retry-and-idempotency.md`).

**Scheduling périodique — pas de scheduler intégré** : AdonisJS n'a pas de scheduler cron intégré. **Décision** : un process **scheduler** dédié (commande ace `node ace scheduler:run`, tournant en continu avec une boucle interne `setInterval`-like ou relancé par un cron système externe toutes les minutes) déclenche les jobs périodiques suivants :

```text
toutes les 60s   -> campaign-engine.schedule_due_executions   (12-campaign-engine.md)
toutes les 60s   -> tracking.flush (si une file d'attente d'ingestion batch existe — voir 16-email-tracking.md)
1x/jour (03:00 UTC) -> segments.recompute_all   (06-segments.md)
1x/jour (02:00 UTC) -> statistics.aggregate_daily (18-statistics-dashboard.md)
1x/heure         -> campaign-engine.check_completion (10-campaigns.md)
```

Alternative écartée : un cron système (crontab) appelant directement des commands ace ponctuelles pour chaque ligne ci-dessus — **valide aussi** et plus simple à opérer sur une infrastructure qui a déjà un cron (pas de process supplémentaire à superviser), mais moins portable (dépend de l'environnement de déploiement). **Décision retenue** : documenter les deux comme options équivalentes, la command ace `scheduler:run` étant l'option par défaut recommandée (portable, ne dépend pas de crontab), mais l'implémentation doit permettre à un opérateur de préférer un cron système appelant des commands ace individuelles (`node ace segments:recompute`, déjà prévue par `06-segments.md`) sans changement de code applicatif — les deux approches consomment les mêmes commands ace sous-jacentes.

## Data model

Aucune nouvelle table (BullMQ persiste son état dans Redis, pas MySQL). Une table `failed_jobs` applicative n'est **pas** créée en v1 : BullMQ conserve nativement les jobs en échec définitif (après épuisement des `attempts`) consultables via son API — un écran d'admin minimal (`20-observability-and-audit.md`) interroge directement Redis/BullMQ plutôt que de dupliquer cet état en SQL.

## Backend architecture

```text
app/services/jobs/
  queue_registry.ts     (définit les files, leur config par défaut — concurrency, attempts, backoff)
  queue_dispatcher.ts    (queue.dispatch(queueName, jobName, payload, options?) — point d'entrée unique
                          utilisé par tous les listeners/services du reste du code, jamais un accès
                          direct à BullMQ ailleurs dans le code métier)
config/queue.ts          (connexion Redis, config par file — nouveau fichier)
commands/queue_work.ts   (node ace queue:work, démarre les Worker BullMQ pour les files demandées)
commands/scheduler_run.ts (node ace scheduler:run, boucle de déclenchement périodique)
```

`QueueDispatcher` est la **seule** façade utilisée par le reste du code (`app/listeners/*`, `app/services/**`) pour enqueue un job — centralise la sérialisation du payload, l'ajout systématique d'un `jobId` déterministe quand le job doit être idempotent à l'enqueue (voir `15-retry-and-idempotency.md`), et permet de swapper BullMQ pour autre chose plus tard sans toucher au reste du code (isolation de dépendance, cohérent avec le principe de frontière de module de `01-architecture.md`).

## Frontend architecture

Aucune UI propre à ce plan. Un écran minimal de consultation des jobs en échec est documenté dans `20-observability-and-audit.md` (dépend de ce plan pour l'accès aux données BullMQ).

## Routes

Aucune route HTTP applicative.

## Controllers

Aucun (sauf, potentiellement, un controller d'administration technique documenté dans `20-observability-and-audit.md`, hors périmètre de ce plan).

## Services

Voir Backend architecture (`QueueRegistry`, `QueueDispatcher`).

## Models

Aucun.

## Jobs / Commands

```text
command: node ace queue:work --queue=<name>[,<name>...]
  -- démarre un ou plusieurs BullMQ Worker (un par file demandée), avec la concurrency configurée
     dans QueueRegistry pour chaque file ; conçue pour tourner en process séparé, en continu

command: node ace scheduler:run
  -- boucle infinie (avec gestion propre de SIGTERM pour arrêt gracieux), déclenche les jobs
     périodiques listés en Domain concepts aux fréquences indiquées
```

Chaque job métier concret (`segment.recompute`, `campaign-engine.advance`, `campaign.enroll_batch`, `email.send`, `tracking.process_event`, `statistics.aggregate_daily`, ...) est défini dans le plan de son domaine respectif (déjà référencés dans `06-segments.md`, `12-campaign-engine.md`, `13-campaign-enrollment.md`) — ce plan-ci ne redéfinit pas leur logique métier, seulement l'infrastructure qui les exécute.

## Events

Aucun event propre. `QueueDispatcher` peut néanmoins émettre des events internes légers pour l'observabilité (`JobEnqueued`, `JobFailed` — optionnel, voir `20-observability-and-audit.md`).

## Permissions

Sans objet (infrastructure interne, pas d'accès utilisateur direct sauf via l'écran d'observabilité, dont les permissions sont définies dans `20-observability-and-audit.md`).

## Validation

Chaque job a un payload typé (TypeScript) validé par une assertion de forme à la désérialisation (pas VineJS — les payloads de job sont générés par le code applicatif lui-même, pas par un utilisateur externe, donc le risque est une erreur de programmation, pas une entrée malicieuse ; une vérification de type stricte à la compilation suffit, complétée par une vérification défensive minimale au runtime pour attraper une éventuelle désérialisation corrompue).

## Edge cases

- Un job enqueue alors que Redis est temporairement indisponible → `QueueDispatcher.dispatch()` doit décider explicitement du comportement : **échouer bruyamment** (propager l'erreur à l'appelant) plutôt que d'avaler silencieusement l'échec — un enqueue perdu silencieusement serait un email jamais envoyé sans aucune trace. Le code appelant (ex. `CampaignEnrollmentService`) doit alors décider s'il annule sa transaction DB associée ou journalise une incohérence à rattraper manuellement — documenté au cas par cas dans chaque plan appelant, pas générique ici.
- Deux workers `queue:work` démarrés par erreur pour la même file → sans danger, BullMQ gère nativement la distribution des jobs entre plusieurs consommateurs d'une même file (c'est le comportement normal de scaling horizontal, pas un bug).
- `scheduler:run` démarré deux fois (déploiement dupliqué par erreur) → chaque déclenchement périodique doit être conçu pour être sans danger en cas de double déclenchement (ex. `campaign-engine.schedule_due_executions` enqueue des `advance` protégés par le lock optimiste de `12-campaign-engine.md`, donc un double scheduling ne cause pas de double exécution) — responsabilité du job appelé, pas du scheduler lui-même.

## Failure scenarios

- Worker qui crashe en plein traitement d'un job → BullMQ détecte le job "stalled" (au-delà de `lockDuration`) et le remet en file pour un autre worker — combiné à l'idempotence applicative documentée par domaine (`15-retry-and-idempotency.md`), c'est le mécanisme de reprise de base sur lequel toute la fiabilité du système repose.
- Redis indisponible pendant une période prolongée → tous les process worker/scheduler doivent logger l'échec de connexion de façon visible (pas silencieuse) et retenter la connexion avec un backoff (comportement standard `ioredis`/BullMQ, à configurer explicitement plutôt que laisser les valeurs par défaut sans les vérifier).

## Idempotency considerations

Ce plan fournit l'infrastructure ; l'idempotence des jobs eux-mêmes est de la responsabilité de chaque domaine (déjà traitée dans `06-segments.md`, `12-campaign-engine.md`, et formalisée transversalement dans `15-retry-and-idempotency.md`). Point d'infrastructure notable : `QueueDispatcher` supporte un `jobId` optionnel explicite — quand fourni, BullMQ refuse silencieusement d'ajouter un second job avec le même `jobId` déjà présent dans la file (déduplication native), utilisé par les domaines qui en ont besoin (ex. éviter d'enqueue deux fois le même `campaign-engine.advance` pour la même `executionId` si déjà en attente).

## Performance considerations

- La concurrency par file (`QueueRegistry`) doit être configurable par variable d'environnement (pas seulement en dur dans le code) pour permettre d'ajuster le débit en production sans redéploiement de code — ex. `QUEUE_EMAILS_CONCURRENCY`.
- Le palier "petite installation" (`01-architecture.md`) fait tourner un seul process `queue:work` consommant toutes les files avec une concurrency modeste ; le palier "installation plus importante" peut dédier des process distincts par file (ex. un process dédié uniquement à `emails` pour isoler son débit du reste) — le code ne change pas, seule la commande de démarrage change (`--queue=emails` vs `--queue=emails,campaign-engine,...`).

## Security considerations

- Connexion Redis : `REDIS_PASSWORD` obligatoire en production (pas seulement en dev où `docker-compose.dev.yml` n'en configure pas), documenté dans `19-security.md`.
- Les payloads de job ne doivent jamais contenir de secret en clair évitable (ex. un job d'envoi d'email référence `smtpConnectorId`, pas le mot de passe déchiffré — le déchiffrement a lieu au moment de l'exécution du job, pas avant, cf. `07-smtp-connectors.md`) — Redis n'est pas traité comme un stockage aussi protégé que MySQL.

## Testing strategy

- Unit : `QueueDispatcher` (dispatch appelle bien BullMQ avec la bonne config par file, gestion de `jobId` pour la déduplication).
- Functional : un test d'intégration par domaine utilisateur de la queue (déjà couvert dans les plans respectifs) utilise une file BullMQ de test (Redis de test dédié, ou une implémentation en mémoire si le projet préfère mocker BullMQ en test — à trancher à l'implémentation selon la stratégie retenue dans `21-testing-strategy.md`).
- Un test dédié vérifie que `queue:work` démarre proprement, traite un job trivial, et s'arrête proprement sur `SIGTERM` (pas de job perdu à l'arrêt).

## Implementation steps

1. Ajouter les dépendances npm : `bullmq`, `ioredis`.
2. Ajouter `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` à `.env.example` et créer `config/queue.ts` (connexion Redis dédiée à BullMQ).
3. Créer `app/services/jobs/queue_registry.ts` (définition des 5 files, concurrency/attempts/backoff par défaut, overridable par env var).
4. Créer `app/services/jobs/queue_dispatcher.ts`.
5. Créer la command `node ace make:command queue/work` (démarre les `Worker` BullMQ pour les files demandées en argument).
6. Créer la command `node ace make:command scheduler/run` (boucle de déclenchement périodique, avec gestion `SIGTERM`).
7. Documenter (README ou note de déploiement, hors `docs/plans/`) le besoin de deux process supplémentaires en production (`queue:work`, `scheduler:run`) en plus du process HTTP.
8. Écrire les tests listés ci-dessus.

## Dependencies

Aucune dépendance sur un autre plan de feature (c'est une brique d'infrastructure transverse) — mais doit être implémenté **avant** tout plan qui enqueue effectivement des jobs (`06-segments.md`, `12-campaign-engine.md`, `13-campaign-enrollment.md`, `16-email-tracking.md`, `18-statistics-dashboard.md`), cf. `22-development-roadmap.md`.

## Open questions

- Bull Board (UI d'admin BullMQ) : non installée en v1 par défaut (dépendance supplémentaire) — le besoin minimal de consultation des jobs en échec est couvert par `20-observability-and-audit.md` via une lecture directe de l'API BullMQ dans une page Inertia légère ; Bull Board reste une option d'amélioration future si le besoin d'un vrai back-office de queue se confirme.
- `scheduler:run` en process unique est un point de défaillance unique (SPOF) pour tous les traitements périodiques — acceptable en v1 (un redémarrage rapide suffit, aucun traitement périodique n'est perdu, seulement retardé, cf. la nature idempotente/rattrapable de tous les jobs concernés) ; une solution à haute disponibilité (élection de leader entre plusieurs instances de scheduler) n'est pas nécessaire tant qu'un seul process suffit à la charge réelle.
