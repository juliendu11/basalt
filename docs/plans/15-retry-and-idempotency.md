# 15 — Retry and Idempotency

## Objective

Définir la stratégie transverse de retry (classification d'erreurs, backoff, max attempts) et consolider le mécanisme d'idempotence déjà esquissé par domaine (`decisions/ADR-005-email-idempotency.md`, `06-segments.md`, `12-campaign-engine.md`) en une politique unique et cohérente, applicable à tous les jobs du système.

## Functional requirements

- Classifier les erreurs en `retryable` / `non-retryable`.
- Stratégie de backoff (délais entre tentatives).
- Nombre maximum de tentatives, au-delà duquel un job est en échec définitif (consultable, pas silencieusement perdu).
- Mécanisme générique de reprise après crash sans double-effet, appliqué à tout job dont l'effet de bord n'est pas naturellement idempotent (l'envoi d'email étant le cas le plus critique, déjà traité dans `decisions/ADR-005-email-idempotency.md`).
- Relance manuelle d'un job en échec définitif (depuis l'écran d'observabilité, `20-observability-and-audit.md`).

## Domain concepts

**Stratégie de retry retenue** (adaptée de l'exemple indicatif de `init.md`, avec un jugement explicite plutôt qu'une reprise telle quelle) :

```text
attempt 1 -> échec -> backoff 30s
attempt 2 -> échec -> backoff 2min
attempt 3 -> échec -> backoff 10min
attempt 4 -> échec -> FAILED (définitif, consultable, relance manuelle possible)
```

Implémenté via la config BullMQ native `attempts: 4, backoff: { type: 'custom' }` avec une fonction de backoff qui retourne `[30_000, 120_000, 600_000][attemptsMade - 1]` — un backoff exponentiel générique (`type: 'exponential'`) est **écarté** au profit de paliers explicites, car les paliers ci-dessus sont dimensionnés spécifiquement pour un cas d'usage SMTP réel (30s pour un blip réseau court, 10min pour laisser le temps à un provider de récupérer d'une panne partielle) plutôt qu'une progression mathématique arbitraire.

Ces valeurs sont la **configuration par défaut** de la file `emails` ; d'autres files peuvent avoir des paramètres différents (ex. `segments` : moins de tentatives mais des délais plus longs, un recompute complet étant coûteux à rejouer) — défini par file dans `QueueRegistry` (`14-jobs-and-queues.md`), pas une constante globale unique.

**Classification des erreurs** :

| Catégorie | Exemples | Comportement |
|---|---|---|
| **Retryable** | Timeout réseau, `ECONNRESET`, erreur SMTP 4xx (erreur temporaire du serveur destinataire), deadlock DB détecté | Retry selon la stratégie de backoff ci-dessus. |
| **Non-retryable** | Erreur SMTP 5xx définitive (adresse inexistante), erreur d'authentification SMTP (credentials invalides), erreur de validation applicative (config de node incohérente) | **Pas de retry** — passe directement en échec définitif, journalisé avec la raison exacte ; retenter automatiquement ne changerait rien (l'erreur n'est pas transitoire). |
| **Incertaine** (rappel `decisions/ADR-005-email-idempotency.md`) | Connexion coupée après que le SMTP a possiblement accepté le message, sans confirmation reçue | Traitée comme retryable, mais avec le mécanisme d'idempotence par clé déterministe (ci-dessous) qui empêche un double envoi si le premier a en fait réussi. |

Chaque `NodeExecutor`/service qui peut échouer doit lever une erreur typée (`RetryableError` / `NonRetryableError`, deux classes dédiées dans `app/exceptions/`) plutôt qu'une erreur générique — c'est ce type qui pilote la décision de retry côté job handler (pas une inspection ad hoc du message d'erreur).

**Mécanisme générique de reprise sans double-effet** — généralisation du pattern déjà détaillé pour l'email (`decisions/ADR-005-email-idempotency.md`) et pour le lock d'exécution (`12-campaign-engine.md`) :

```text
1. Le job calcule une clé déterministe pour l'opération à effet de bord qu'il s'apprête à effectuer
   (PAS un UUID aléatoire — dérivée d'identifiants métier stables : ex. `email-delivery:{executionId}:{nodeId}`)
2. Le job réserve cette clé en base AVANT l'effet de bord (insertion unique, contrainte UNIQUE SQL)
3. Si la réservation échoue (clé déjà présente) :
     - état 'terminé' (sent/delivered/failed) -> l'opération a déjà été faite, sortir en succès (no-op)
     - état 'en cours' récent (< seuil de staleness) -> une autre tentative est probablement en vol,
       sortir sans agir (laisser l'autre tentative terminer)
     - état 'en cours' ancien (>= seuil de staleness) -> tentative précédente probablement crashée,
       reprendre l'opération
4. Effet de bord réel (appel SMTP, écriture externe, ...)
5. Le job marque la réservation comme terminée (UPDATE conditionné sur l'état 'en cours', jamais
   un UPDATE inconditionnel — protège contre un écrasement par une tentative concurrente qui aurait
   dépassé le seuil de staleness en même temps, cf. 12-campaign-engine.md § Concurrence)
```

**Seuil de staleness** : valeur par défaut retenue **5 minutes** — suffisamment long pour couvrir un appel SMTP lent légitime (rarement > quelques secondes en pratique, mais un provider dégradé peut prendre plus de temps), suffisamment court pour ne pas bloquer une reprise légitime après crash pendant des heures. Configurable par domaine si un besoin différent apparaît (ex. le recompute de segment `12-campaign-engine.md`/`06-segments.md` n'a pas besoin de ce mécanisme car intrinsèquement idempotent sans clé de réservation, cf. `decisions/ADR-003-segment-membership.md`).

**Dead letter / jobs en échec définitif** : pas de table SQL dédiée (cf. `14-jobs-and-queues.md` § Data model) — BullMQ conserve nativement les jobs ayant épuisé leurs `attempts` dans un état `failed` consultable. `20-observability-and-audit.md` fournit l'écran de consultation + l'action de relance manuelle (qui réinjecte le même job avec `attempts` réinitialisé, réutilisant le même `jobId`/clé d'idempotence métier si applicable — donc toujours sans risque de double-effet même relancé manuellement).

## Data model

Aucune nouvelle table dédiée à ce plan — les colonnes de réservation/idempotence sont déjà spécifiées par domaine : `email_deliveries.idempotency_key`/`status` (`02-database-design.md`, `decisions/ADR-005-email-idempotency.md`), `campaign_executions.locked_at`/`locked_by`/`lock_version` (`02-database-design.md`, `12-campaign-engine.md`). Ce plan documente le **pattern commun** derrière ces colonnes spécifiques, pas une nouvelle structure.

## Backend architecture

```text
app/exceptions/retryable_error.ts, non_retryable_error.ts
app/services/jobs/
  idempotent_operation.ts   -- helper générique implémentant les étapes 1-5 ci-dessus, paramétré par
                              (table, clé déterministe, seuil de staleness, callback d'effet de bord)
                              -- utilisé par send_email_executor.ts (12-campaign-engine.md) et tout
                              futur job à effet de bord externe non naturellement idempotent
```

`IdempotentOperation` est un helper **générique et réutilisable** plutôt qu'une réimplémentation par domaine — factorise le pattern décrit ci-dessus une seule fois, testé une seule fois de façon approfondie (concurrence, staleness), puis réutilisé par tout nouveau type de job à effet de bord externe futur (ex. un futur envoi SMS) sans repartir de zéro.

## Frontend architecture

Aucune UI propre à ce plan (l'écran de consultation/relance des jobs en échec est documenté dans `20-observability-and-audit.md`, qui **consomme** l'infrastructure définie ici).

## Routes / Controllers / Services / Models

Sans objet direct — ce plan définit une politique et un helper technique consommés par d'autres domaines, pas une feature avec ses propres endpoints.

## Jobs / Commands

Configuration BullMQ par défaut (dans `QueueRegistry`, `14-jobs-and-queues.md`) :

```text
emails            attempts: 4, backoff: [30s, 2min, 10min]
campaign-engine   attempts: 4, backoff: [30s, 2min, 10min]  (advance) — les erreurs de node
                    executor suivent la même classification retryable/non-retryable
segments          attempts: 2, backoff: [5min, 30min]  (un recompute complet est coûteux à rejouer
                    trop vite ; idempotent donc sans risque, mais on évite de marteler la DB)
tracking          attempts: 5, backoff: [10s, 30s, 1min, 5min, 15min]  (ingestion, doit être robuste
                    à des pics de webhook entrants)
statistics        attempts: 3, backoff: [5min, 30min, 2h]
```

## Events

`JobRetried`, `JobFailedPermanently` — events internes optionnels (cf. `14-jobs-and-queues.md` § Events) consommés par `20-observability-and-audit.md` pour alimenter d'éventuelles alertes.

## Permissions

La relance manuelle d'un job en échec est réservée à `owner`/`admin` (action technique sensible) — détaillé dans `20-observability-and-audit.md`.

## Validation

Sans objet (pas de formulaire utilisateur direct).

## Edge cases

Voir `decisions/ADR-005-email-idempotency.md` § Consequences/Risks pour le détail exhaustif du cas email (le plus critique). Généralisation notable :

- Un job dont l'effet de bord est **intrinsèquement idempotent** (upsert, delete-if-exists, insert-ignore) n'a **pas besoin** du mécanisme `IdempotentOperation` — l'utiliser quand même serait une complexité inutile (violerait la priorité "simplicité"). La règle de décision : `IdempotentOperation` est nécessaire **si et seulement si** l'effet de bord est un appel externe non-rejouable sans risque (SMTP, futur SMS/webhook sortant) ou une écriture SQL non naturellement idempotente.

## Failure scenarios

Scénario 6 de `init.md` ("SMTP accepts email, worker crashes before DB update, job gets retried") — couvert intégralement par `decisions/ADR-005-email-idempotency.md`, ce plan ne fait que généraliser le pattern au-delà de ce cas précis.

## Idempotency considerations

C'est l'objet central de ce plan — voir Domain concepts.

## Performance considerations

Le coût du mécanisme `IdempotentOperation` est un `INSERT` supplémentaire avant chaque effet de bord (négligeable comparé à la latence d'un appel SMTP réel) et une contrainte `UNIQUE` indexée (déjà nécessaire pour la garantie elle-même, pas un coût additionnel réel).

## Security considerations

Les messages d'erreur journalisés (`last_error` sur `email_deliveries`, `campaign_executions`) ne doivent jamais contenir de secret (mot de passe SMTP, token) — cohérent avec `07-smtp-connectors.md` § Security considerations ; revu explicitement dans les tests du helper `IdempotentOperation` (assertion qu'aucun payload sensible n'atterrit dans un champ de log en clair).

## Testing strategy

- Unit : `IdempotentOperation` — réservation concurrente simulée (deux appels quasi simultanés, un seul effectue l'effet de bord), reprise après staleness dépassée, no-op sur état déjà terminé.
- Unit : classification d'erreurs (`RetryableError`/`NonRetryableError`) pour chaque type d'erreur SMTP listé en Domain concepts.
- Functional : Scénario 6 de `init.md` reproduit explicitement (déjà listé dans `decisions/ADR-005-email-idempotency.md`, exécuté concrètement ici avec le job réel).
- Functional : un job qui échoue 4 fois passe bien en `failed` définitif et apparaît dans l'écran de consultation (`20-observability-and-audit.md`), et une relance manuelle le réexécute sans double-effet si la première tentative avait en fait réussi côté effet de bord externe (test de non-régression du cas le plus dangereux).

## Implementation steps

1. Créer `app/exceptions/retryable_error.ts`, `non_retryable_error.ts`.
2. Créer `app/services/jobs/idempotent_operation.ts` (helper générique).
3. Configurer les `attempts`/`backoff` par file dans `QueueRegistry` (`14-jobs-and-queues.md`) selon le tableau ci-dessus.
4. Intégrer `IdempotentOperation` dans `send_email_executor.ts` (`12-campaign-engine.md`) — remplace/consolide l'implémentation ad hoc esquissée dans `decisions/ADR-005-email-idempotency.md` par l'appel au helper générique.
5. Écrire les tests listés ci-dessus.

## Dependencies

`14-jobs-and-queues.md` (infrastructure de queue sur laquelle la stratégie de retry s'applique). Consommé par `12-campaign-engine.md` (envoi d'email), `06-segments.md` (recompute), `16-email-tracking.md` (ingestion d'événements).

## Open questions

- Alerting actif (notification à un admin) sur un job en échec définitif répété : non implémenté en v1, l'écran de consultation (`20-observability-and-audit.md`) est passif (l'utilisateur doit aller regarder) — une intégration future (email/Slack) est une extension naturelle non détaillée ici.
- Seuils de backoff/attempts par file : valeurs de départ raisonnables mais à ajuster avec des données de production réelles (taux d'échec transitoire observé chez les providers SMTP réellement utilisés).
