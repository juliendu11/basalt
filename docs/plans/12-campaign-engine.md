# 12 — Campaign Engine

## Objective

Exécuter le graphe défini par `11-campaign-builder.md` pour chaque contact engagé (`campaign_enrollments`), en gérant l'avancement nœud par nœud, les attentes (wait/scheduling) sans requête ouverte, la reprise après crash/redémarrage, et la concurrence entre workers — le cœur de fiabilité du produit.

## Functional requirements

- Faire avancer un `campaign_execution` d'un node à l'autre selon le type de node (action exécutée, condition évaluée, wait planifié).
- Exécuter les actions : `send_email`, `wait`, `add_tag`, `remove_tag`, `add_to_segment`, `remove_from_segment`.
- Évaluer les conditions : `contact_field`, `in_segment`, `email_opened`, `email_clicked`.
- Survivre aux redémarrages serveur/crashs/déploiements (aucune requête HTTP ouverte pendant un wait — cf. `init.md`).
- Empêcher la double-exécution d'un même `campaign_execution` par deux workers concurrents.
- Vérifier systématiquement l'éligibilité du contact (statut `subscribed`) avant tout envoi.

## User flows (runtime, pas d'interaction utilisateur directe — déclenché par `13-campaign-enrollment.md`)

```text
CampaignEnrollment créé (status='active') par 13-campaign-enrollment.md
  → CampaignExecution créée : status='pending', current_node_id=null,
    scheduled_at=now() (à traiter immédiatement)
  → job campaign-engine.advance { executionId } enqueued

Worker traite le job (voir § Traversée du graphe pour l'algorithme complet) :
  → verrouille l'execution (voir § Concurrence)
  → détermine le node à exécuter (current_node_id, ou le node source si c'est le premier passage)
  → exécute selon le type :
      action     -> effectue l'action, détermine le node suivant (edge unique sortante),
                    ré-enqueue immédiatement campaign-engine.advance pour continuer
      wait       -> calcule scheduled_at (now + durée, ou prochaine occurrence de waitUntil),
                    status='waiting', PAS de ré-enqueue immédiat — voir § Scheduling
      condition  -> évalue, choisit l'edge 'true' ou 'false', ré-enqueue immédiatement
      (fin de graphe, pas d'edge sortante) -> execution status='completed',
                    enrollment status='completed'
  → déverrouille l'execution
```

## Domain concepts

**Distinction Design vs Runtime** (rappel structurant, cf. `init.md` et `decisions/ADR-004-campaign-versioning.md`) : ce plan ne connaît **que** `campaign_versions` figées (`published` ou `archived` — une exécution ne s'exécute jamais sur un `draft`). `CampaignEnrollment.campaign_version_id` détermine intégralement le graphe utilisé, immuable pour la durée de vie de l'enrollment.

**Traversée du graphe** :

```text
Contact
  ↓
Campaign (via CampaignEnrollment, figé sur une CampaignVersion)
  ↓
CampaignExecution (current_node_id, status, scheduled_at)
  ↓
Execute action / évalue condition
  ↓
Determine next node (via campaign_edges, filtré par source_handle si condition)
```

**Wait / Scheduling — pas de requête ouverte** : un node `wait` ne "bloque" jamais un process. Il transforme `campaign_executions.scheduled_at` en une date future et passe `status='waiting'`, puis **rend la main** (le job BullMQ se termine normalement). Un **scheduler périodique** (voir `14-jobs-and-queues.md` § Scheduling des wait) interroge régulièrement `campaign_executions WHERE status='waiting' AND scheduled_at <= now()` et enqueue un job `campaign-engine.advance` pour chaque exécution due. C'est ce mécanisme (poll périodique + queue, pas un `setTimeout`/process qui dort) qui garantit la survie aux redémarrages (cf. Scénario 3 de `init.md`) : l'état complet de "où en est ce contact et quand le réveiller" vit uniquement en base, jamais en mémoire process.

Calcul de `scheduled_at` pour `waitUntil` (heure précise/jour de semaine) : résolu **au moment où le node wait est atteint**, dans le fuseau du projet (`projects.timezone`, cf. `02-database-design.md` § Dates et timezones), via Luxon — jamais un calcul d'offset fixe qui ignorerait les changements d'heure été/hiver.

**Concurrence — verrouillage optimiste** : `campaign_executions.lock_version` (entier, incrémenté à chaque transition). Un worker qui traite une exécution lit `lock_version`, effectue son travail, puis écrit son résultat avec `UPDATE campaign_executions SET ..., lock_version = lock_version + 1 WHERE id = ? AND lock_version = ?`. Si l'`UPDATE` affecte 0 ligne, un autre worker a déjà traité cette exécution entre-temps → le worker courant **abandonne silencieusement** (pas d'erreur, pas de retry — l'autre worker a fait le travail). Complété par `locked_at`/`locked_by` (renseignés au début du traitement, effacés à la fin) : un job qui prend ce lock au-delà d'un seuil de staleness (ex. 5 minutes) sans l'avoir libéré est considéré comme un worker crashé, et un autre worker peut reprendre l'exécution (voir `15-retry-and-idempotency.md` pour le détail du mécanisme de staleness, partagé avec l'idempotence d'envoi).

Ceci répond directement au Scénario 5 de `init.md` ("Two workers receive the same execution") : la combinaison lock optimiste + staleness garantit qu'au plus un worker fait progresser une exécution à un instant donné, sans jamais bloquer indéfiniment si un worker crashe en tenant le lock.

## Data model

Voir `02-database-design.md` § Campagnes — exécution (`campaign_executions`, `campaign_execution_events`) et § Campagnes — définition pour `campaign_nodes`/`campaign_edges`. Rappel des colonnes clés pour ce plan : `status`, `scheduled_at`, `current_node_id`, `attempt_count`, `locked_at`, `locked_by`, `lock_version`.

## Backend architecture

```text
app/services/automation/
  campaign_engine_service.ts    (advance — point d'entrée principal, orchestre tout ce qui suit)
  node_executors/
    send_email_executor.ts
    wait_executor.ts
    add_tag_executor.ts, remove_tag_executor.ts
    add_to_segment_executor.ts, remove_from_segment_executor.ts
    condition_evaluator.ts      (contact_field, in_segment, email_opened, email_clicked)
  execution_lock_service.ts     (acquire/release, verrouillage optimiste + staleness)
  execution_scheduler_service.ts (trouve les executions 'waiting' dues, enqueue advance)
```

Chaque `node_executors/*` implémente une interface commune `NodeExecutor { execute(execution, node, contact): NextStep }` où `NextStep` = `{ outcome: 'continue', nextNodeId } | { outcome: 'wait', scheduledAt } | { outcome: 'branch', handle: 'true'|'false' } | { outcome: 'end' }`. `CampaignEngineService.advance()` sélectionne l'executor par `node.subtype`, exécute, journalise un `campaign_execution_events`, puis décide de la suite (ré-enqueue immédiat, ou fin si `wait`).

**`CampaignEngineService.advance(executionId)` — algorithme complet** :

```text
1. ExecutionLockService.acquire(executionId) -- lock optimiste + staleness, voir Domain concepts
   -- si échec (déjà lock par un autre worker actif) : sortir silencieusement (no-op)
2. Recharge execution + enrollment + contact + campaign_version (avec ses nodes/edges)
3. Vérifications d'éligibilité (voir Edge cases) : contact.status=='subscribed' (sauf pour les
   actions non-email comme add_tag), campaign.status=='active' (sinon repousse, cf. 10-campaigns.md),
   enrollment.status=='active'
   -- si une vérification échoue : execution -> 'cancelled' ou repoussée selon le cas (voir Edge cases)
4. node = current_node_id ? charge ce node : charge le node source de la version
5. executor = résout NodeExecutor pour node.subtype
6. result = executor.execute(execution, node, contact)  -- peut lever une erreur (voir 15-retry-and-idempotency.md)
7. Selon result.outcome :
     'continue' -> current_node_id = result.nextNodeId, status='pending', scheduled_at=now()
                   -> ré-enqueue campaign-engine.advance immédiatement (nouveau job, pas une boucle
                      synchrone dans le même job -- évite qu'un graphe très long ne bloque un worker
                      indéfiniment sur un seul job)
     'branch'   -> résout l'edge sortante avec ce source_handle, comme 'continue'
     'wait'     -> current_node_id = node.id (reste sur ce node), status='waiting',
                   scheduled_at=result.scheduledAt -- PAS de ré-enqueue (voir Scheduling)
     'end'      -> execution.status='completed', finished_at=now(),
                   enrollment.status='completed', exited_at=now()
8. ExecutionLockService.release(executionId, newLockVersion)
9. campaign_execution_events : une ligne journalisée pour cette transition (node, type, message)
```

## Frontend architecture

Pas d'UI dédiée à ce plan (moteur backend pur). La visualisation de l'état d'exécution d'un contact (à quel node il en est) est un besoin d'observabilité couvert par `20-observability-and-audit.md` (page "historique d'exécution" par enrollment), pas par ce plan.

## Routes

Aucune route HTTP propre (exécution 100% asynchrone, via jobs). Un éventuel endpoint de debug/statut ("où en est ce contact dans cette campagne") est documenté comme faisant partie de `20-observability-and-audit.md`, réutilisant les modèles de ce plan en lecture seule.

## Controllers

Aucun.

## Services

Voir Backend architecture. Point notable supplémentaire :

- `ExecutionSchedulerService.findDueExecutions(limit)` : `campaign_executions.where('status', 'waiting').where('scheduledAt', '<=', now()).limit(limit)`, appelée par un job périodique (`14-jobs-and-queues.md`) qui enqueue un `campaign-engine.advance` par exécution due, par lots (ex. 500 à la fois) pour ne jamais charger l'intégralité des exécutions dues en une fois sur un système à fort volume.

## Models

`CampaignExecution` (relations : `enrollment`, `currentNode`), `CampaignExecutionEvent` (relations : `execution`, `node`). Scopes nommés : `CampaignExecution.query().due()`, `.stale(thresholdMinutes)`.

## Jobs / Commands

```text
job: campaign-engine.advance { executionId }
  queue: campaign-engine

job (périodique): campaign-engine.schedule_due_executions
  -- appelle ExecutionSchedulerService.findDueExecutions par lots, enqueue campaign-engine.advance
     pour chacune ; fréquence recommandée : toutes les 60 secondes (granularité acceptable pour
     un "Wait until 09:00" ou "Wait 2 days" — pas besoin de la seconde près)
```

Voir `14-jobs-and-queues.md` pour le mécanisme de déclenchement périodique retenu (pas de scheduler intégré à AdonisJS).

## Events

`CampaignNodeCompleted { executionId, nodeId, outcome }`, `CampaignExecutionCompleted`, `CampaignExecutionFailed`, `CampaignExecutionCancelled` — consommés par `18-statistics-dashboard.md` (compteurs) et `AuditLogListener`. `EmailQueued`/`EmailSent`/`EmailFailed` sont émis par `send_email_executor.ts` mais détaillés dans `16-email-tracking.md` (ce plan délègue l'envoi réel et son idempotence à `15-retry-and-idempotency.md`/`16-email-tracking.md`, il ne fait qu'invoquer le service d'envoi).

## Permissions

Sans objet (aucune action utilisateur directe — le moteur agit avec les droits du système, pas ceux d'un utilisateur).

## Validation

Aucune validation de payload utilisateur (le graphe est déjà validé structurellement à la publication, cf. `11-campaign-builder.md`). Le moteur suppose un graphe publié valide — une incohérence détectée à l'exécution (ex. node sans edge sortante alors que ce n'est pas un node terminal attendu) est traitée comme une erreur non-retryable journalisée, pas silencieusement ignorée.

## Edge cases

- **Campagne mise en pause pendant qu'une exécution est `waiting`** : à l'étape 3 de `advance()`, `campaign.status != 'active'` → l'exécution n'est **ni** avancée **ni** modifiée, le job se termine sans effet (elle sera réévaluée par le prochain job de scheduling tant qu'elle reste due) — cf. `10-campaigns.md` § Domain concepts.
- **Contact désabonné/bloqué pendant une attente** : vérifié à **chaque** passage dans `advance()` (pas seulement à l'enrollment) — si le node courant est un `send_email` et `contact.status != 'subscribed'`, l'action est **sautée** (pas d'erreur) et le moteur passe directement au node suivant comme si l'edge avait été suivie normalement (pas de retry, pas de blocage — un email non éligible n'est simplement jamais envoyé) ; un `campaign_execution_events` journalise explicitement "email skipped: contact not subscribed". Répond au Scénario 7 de `init.md`.
- **Campagne archivée pendant qu'un contact est engagé** : `enrollment.status` déjà passé à `cancelled` par `CampaignService.archive()` (cf. `10-campaigns.md`) — à l'étape 3, `enrollment.status != 'active'` → l'exécution est marquée `cancelled` immédiatement (nettoyage, pas de repoussée indéfinie comme pour une pause).
- **Node `send_email` dont l'`Email` référencé a été supprimé après publication** : impossible — le `config` est figé (copié) à la publication, cf. `decisions/ADR-004-campaign-versioning.md`, aucune relecture de l'`Email` original au runtime.
- **Graphe très long (des dizaines de nodes sans wait)** : chaque transition `continue`/`branch` ré-enqueue un nouveau job plutôt que boucler en mémoire (cf. étape 7) — protège contre un worker qui monopoliserait indéfiniment un slot de concurrence sur un graphe pathologiquement long ; documente aussi une garde applicative (ex. compteur de transitions consécutives sans wait, seuil configurable, au-delà duquel l'exécution est marquée `failed` avec une erreur explicite "possible boucle infinie détectée" — filet de sécurité complémentaire à l'interdiction de cycle en validation de graphe).

## Failure scenarios

**Scénario 1 (`init.md`)** — `Segment A → Campaign starts → Email A → Wait 2 days → Email B` : couvert nativement par l'algorithme ci-dessus (chaque étape = un `advance()`, le `wait` suspend sans requête ouverte).

**Scénario 2** — SMTP timeout puis retry puis succès : le `send_email_executor` propage l'erreur au mécanisme générique de retry (`15-retry-and-idempotency.md`) plutôt que de la gérer lui-même ; à la reprise réussie, l'exécution continue normalement.

**Scénario 3** — redémarrage serveur pendant un wait de 3 jours : aucun impact, l'état vit en base (`campaign_executions.status='waiting'`, `scheduled_at`) ; au redémarrage, le job périodique de scheduling reprend son fonctionnement normal et retrouve l'exécution due le moment venu.

**Scénario 5** — deux workers reçoivent la même exécution : couvert par le verrouillage optimiste (§ Domain concepts).

## Idempotency considerations

- Chaque transition d'état (`advance()`) est protégée par le lock optimiste (`lock_version`) — une ré-exécution accidentelle du même job (retry BullMQ après un crash juste après le commit mais avant l'ack) retrouve `lock_version` déjà incrémenté par la première exécution réussie et n'a plus rien à faire d'utile pour les transitions déjà appliquées ; cependant, les **effets de bord non transactionnels avec le commit SQL** (ex. l'appel SMTP réel dans `send_email_executor`) nécessitent leur **propre** mécanisme d'idempotence, entièrement traité dans `decisions/ADR-005-email-idempotency.md` et `15-retry-and-idempotency.md` — ce plan délègue explicitement ce sous-problème plutôt que de le dupliquer.
- `add_tag`/`remove_tag`/`add_to_segment`/`remove_from_segment` sont naturellement idempotents (upsert / delete-if-exists) — rejouer l'action deux fois ne produit pas d'état différent.

## Performance considerations

- `campaign_executions (status, scheduled_at)` indexé — requête de scheduling (§ Jobs/Commands) toujours indexée, jamais un scan complet.
- Le traitement "un job par transition" (plutôt qu'une boucle en mémoire) répartit naturellement la charge entre workers et évite qu'un worker unique soit monopolisé par un contact à graphe long — au prix d'un léger surcoût de latence par transition (un aller-retour queue supplémentaire), jugé négligeable pour ce cas d'usage (les campagnes marketing ne sont pas sensibles à la milliseconde entre deux nodes).
- Le job périodique de scheduling doit traiter les exécutions dues **par lots bornés** (voir `ExecutionSchedulerService.findDueExecutions(limit)`) pour rester prévisible même si un très grand nombre d'exécutions arrivent à échéance simultanément (ex. beaucoup de contacts avec un `waitUntil` identique "09:00 tous les jours").

## Security considerations

- Le moteur agit avec des privilèges "système" (pas de vérification Bouncer par requête, car aucune requête HTTP utilisateur n'est impliquée) — toute donnée qu'il manipule doit néanmoins rester strictement scopée par `project_id` (une exécution ne doit jamais pouvoir traverser vers un node/segment/email d'un autre projet — garanti structurellement puisque tout le graphe d'une `campaign_version` appartient à une seule `campaign`/`project`).
- Voir `19-security.md` pour la politique transverse de vérification d'éligibilité avant tout envoi (rappelée ici en Edge cases mais définie une fois pour toutes là-bas).

## Testing strategy

- Unit : chaque `NodeExecutor` isolément (mock du contact/node, vérifie le `NextStep` retourné pour chaque cas).
- Unit : `ExecutionLockService` — acquisition concurrente simulée (deux appels rapprochés, un seul doit réussir), libération après staleness.
- Functional : Scénarios 1, 2, 3, 5, 7 de `init.md` reproduits explicitement comme tests d'intégration (avec le temps mocké/avancé artificiellement pour les waits, pas d'attente réelle de plusieurs jours en test).
- Functional : campagne mise en pause pendant une exécution `waiting` → reprise correcte après `resume()`.
- Regression : garde anti-boucle infinie (graphe pathologique construit en fixture de test, vérifie la transition vers `failed` au seuil configuré).

## Implementation steps

1. Créer `app/services/automation/execution_lock_service.ts` (acquire/release, lock optimiste + staleness).
2. Créer `app/services/automation/node_executors/*.ts` (un fichier par subtype d'action/condition listé en Domain concepts), avec l'interface commune `NodeExecutor`.
3. Créer `app/services/automation/campaign_engine_service.ts` (`advance()`, orchestration complète décrite ci-dessus).
4. Créer `app/services/automation/execution_scheduler_service.ts` (`findDueExecutions`).
5. Créer les events (`app/events/campaign_node_completed.ts`, etc.).
6. Créer les jobs `campaign-engine.advance` et `campaign-engine.schedule_due_executions` (dépend de `14-jobs-and-queues.md`).
7. Enregistrer le job périodique de scheduling selon le mécanisme retenu dans `14-jobs-and-queues.md`.
8. Écrire les tests listés ci-dessus, en particulier les scénarios reproduits de `init.md`.

## Dependencies

`11-campaign-builder.md` (graphe publié), `13-campaign-enrollment.md` (création des `campaign_enrollments`/`campaign_executions` initiales), `14-jobs-and-queues.md` (infrastructure d'exécution asynchrone), `15-retry-and-idempotency.md` (gestion des erreurs d'envoi), `07-smtp-connectors.md` (envoi réel), `06-segments.md`/`05-contacts.md` (actions `add_to_segment`/`add_tag`).

## Open questions

- Nodes `trigger` (`email_opened`, `webhook_received`, ...) : le graphe peut les contenir (validés par `11-campaign-builder.md`) mais **aucune exécution associée n'est implémentée en v1** — un contact n'est jamais "réveillé" par un événement externe en dehors du cycle `advance()`/scheduling classique. Une future version pourrait faire en sorte qu'un `EmailOpened`/`WebhookReceived` (cf. `16-email-tracking.md`) enqueue directement un `campaign-engine.advance` pour les exécutions en attente sur un node `trigger` correspondant — architecture compatible avec ce qui est documenté ici (le point d'entrée `advance()` resterait le même), mais non détaillée/implémentée davantage dans cette phase.
- Seuil exact de staleness du lock et seuil de garde anti-boucle infinie : valeurs par défaut à fixer en implémentation (ex. 5 minutes / 50 transitions consécutives), ajustables sans changement de modèle de données.
