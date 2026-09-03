# Incident — Les nœuds `wait` ne reprennent jamais après le 1er cycle (dédup de `jobId` BullMQ)

- **Date de détection** : 2026-09-03
- **Première occurrence** : ~2026-08-31 10:12 UTC (12:12 Europe/Paris)
- **Composants** : Campaign Engine (`campaign-engine.schedule_due_executions`), BullMQ
- **Gravité** : haute — arrêt silencieux de toutes les campagnes multi-étapes après leur 2e envoi, sans aucun signal d'erreur
- **Correctif** : commit qui supprime le `jobId` statique dans `start/scheduler.ts` + test de régression `tests/functional/automation/campaign_engine_scenarios.spec.ts` (« two consecutive wait cycles both resume via the scheduler »)

---

## Résumé

Le scheduler enfilait le job de reprise d'une exécution en attente avec un `jobId`
**statique par exécution** : `campaign-engine.advance-${execution.id}`. BullMQ
déduplique `queue.add` contre les jobs de **tous les états**, y compris les jobs
`completed`/`failed` qu'on **conserve volontairement**
(`removeOnComplete`/`removeOnFail` dans `queue_dispatcher.ts`) et que BullMQ ne
purge que **paresseusement** (au moment où un autre job de la même file se
termine), jamais sur une minuterie.

Conséquence : dès qu'un premier job de reprise pour une exécution donnée s'était
terminé et restait en rétention, **chaque** passe suivante de
`schedule_due_executions` (toutes les 60 s) rappelait `queue.add` avec le même
`jobId`, récupérait le job terminé en rétention, et **n'enfilait rien**.
L'exécution restait `waiting` avec un `scheduled_at` dans le passé indéfiniment.
Aucun job créé ⇒ aucun « failed job » ⇒ aucun signal côté dashboard, alors que
scheduler et worker tournaient normalement.

Avec des nœuds `wait` à cadence journalière (~24 h), la tentative de reprise
tombait pile sur la fenêtre de rétention `age: 24h` — le bug se déclenchait donc
au **2e cycle `wait`** de quasiment chaque enrollment.

## Impact observé

Sur l'exécution `campaign_executions.id = 1` (contact `julien.dacosta1@outlook.fr`),
reconstituée depuis `campaign_execution_events` + `email_deliveries` :

| Date (UTC)       | Nœud            | Événement                                            |
| ---------------- | --------------- | --------------------------------------------------- |
| 29/08 10:11:56   | 1 (source)      | `node_executed`                                      |
| 29/08 10:11:57   | 2 (send email)  | `node_executed` → delivery 1 `sent` (`idem 1:2`)     |
| 29/08 10:11:57   | 3 (wait 1j)     | `node_waiting`                                       |
| **30/08 10:12:14** | 3             | `node_executed` — le wait a **bien** repris          |
| 30/08 10:12:15   | 4 (send email)  | `node_executed` → delivery 2 `sent` (`idem 1:4`)     |
| 30/08 10:12:15   | 5 (wait 1j)     | `node_waiting` → `scheduled_at = 31/08 10:12:15`     |
| 31/08 10:12:15   | —               | **rien.** Exécution figée en `waiting` depuis 4 jours |

`locked_at = NULL` (pas un lock coincé), `last_error = NULL`, `lock_version = 6`,
`updated_at = 2026-08-29` (dernière écriture d'état = l'entrée dans ce wait).
L'exécution était pourtant « due » (`status='waiting' AND scheduled_at <= now`) à
chaque passe du scheduler.

Le badge « Now » de l'Email timeline apparaissait entre le dernier `sent`
(30/08 12:12) et le premier `upcoming` en retard (31/08 12:12) — symptôme visible
exact de l'état bloqué.

## Diagnostic

1. Le `jobId` déterministe `campaign-engine.advance-1` n'est créé **que** par le
   chemin de reprise du scheduler. L'`advance` initial de l'enrollment
   (`campaign_enrollment_service.ts` étape 7) et les ré-enqueues internes du
   moteur après une transition `continue`/`branch`
   (`campaign_engine_service.ts`) utilisent des ids numériques auto-générés — pas
   de collision de ce côté.
2. **1re reprise (30/08 10:12:14)** : le job `campaign-engine.advance-1` du cycle
   précédent avait > 24 h et avait été purgé (par le `queue.add` de la passe
   courante qui déclenche le trim paresseux) → l'`add` passe → le nœud 3 reprend,
   l'email #2 part. Ce job se termine et **reste dans le set `completed`**
   (`finishedOn ≈ 30/08 10:12:14`).
3. **2e reprise (à partir du 31/08 10:12:15, puis toutes les 60 s)** :
   `dispatch(..., { jobId: 'campaign-engine.advance-1' })`. La clé
   `bull:campaign-engine:campaign-engine.advance-1` est toujours présente dans le
   set `completed` — rien d'autre ne s'est terminé sur la file `campaign-engine`
   pour déclencher le trim par âge. `queue.add` renvoie silencieusement le job
   existant et **n'enfile rien**. L'exécution ne repart jamais → l'email du
   31/08 puis celui du 1er sept ne partent jamais.

## Cause racine

Un `jobId` statique, à durée de vie « éternelle » (celle de l'exécution),
combiné à :

- la dédup de `queue.add` de BullMQ qui **inclut les états terminaux retenus**,
  pas seulement `waiting`/`delayed`/`active` ;
- la purge de `removeOnComplete`/`removeOnFail` qui est **paresseuse** (déclenchée
  par la complétion d'un autre job sur la même file), pas temporisée — donc une
  file peu active garde ses jobs terminés bien au-delà de `age` ;
- une cadence `wait` (journalière) qui tombe pile sur `age: 24h`.

Le plan `14-jobs-and-queues.md` décrivait la dédup par `jobId` comme un moyen
d'« éviter d'enqueue deux fois le même `campaign-engine.advance` pour la même
`executionId` **si déjà en attente** » — le raisonnement ne couvrait que l'état
`waiting`, pas les jobs terminés retenus.

## Pourquoi ça n'a pas été détecté

- Les tests de scénario du Campaign Engine
  (`campaign_engine_scenarios.spec.ts`) appelaient `engine.advance()` **en
  direct**, court-circuitant `QueueDispatcher` et BullMQ — le chemin qui contient
  le bug n'était jamais exercé.
- Le scénario « survit à un redémarrage » ne faisait **qu'un seul** cycle
  `wait` → reprise. Le bug n'apparaît qu'au 2e.
- Aucun job n'est créé quand la dédup mord ⇒ aucun « failed job », aucune
  exception, aucun log d'erreur. Scheduler et worker paraissent sains.

## Correctif

`start/scheduler.ts` — **suppression du `jobId`** dans le `dispatch` de
`schedule_due_executions`. On enfile un `campaign-engine.advance` sans id
déterministe ; les éventuels doublons (1-2 jobs no-op par exécution par fenêtre
de 60 s, jusqu'à ce que le worker dépile le premier) sont inoffensifs.

### Pourquoi c'est sans risque de double envoi

Le `jobId` n'était **jamais** un mécanisme de correction — juste une
optimisation anti-redondance. Ce qui empêche réellement un double envoi reste
intact :

1. **`ExecutionLockService.acquire()`** — `UPDATE ... WHERE locked_at IS NULL OR
   locked_at < staleBefore` atomique : au plus un worker fait avancer une
   exécution donnée à la fois. Les `advance` en trop reçoivent `null` et
   no-op.
2. **Le nœud courant est relu depuis `execution.currentNodeId` sous le lock** —
   un job en retard fait avancer l'exécution depuis sa position **réelle**,
   jamais depuis une position périmée.
3. **Idempotence de `send_email`** —
   `email_deliveries.idempotency_key = ${execution.id}:${node.id}` (contrainte
   UNIQUE) + court-circuit si le statut est terminal. Un nœud `send_email` donné
   envoie au plus une fois par exécution
   (`decisions/ADR-005-email-idempotency.md`, scénario 5 des tests).
4. **La garde `waiting && scheduledAt > now`** dans `advance()` rejette un job
   pas encore dû.

BullMQ retente déjà chaque `advance` jusqu'à 4 fois (`attempts: 4`) : ces
protections encaissent déjà ce cas.

### Test de régression

`tests/functional/automation/campaign_engine_scenarios.spec.ts` →
« Regression: two consecutive wait cycles both resume via the scheduler ».
Publie un graphe `source → send → wait → send → wait → send`, lance un **vrai
Worker BullMQ** et pilote **deux** cycles `wait` via la tâche
`campaign-engine.schedule_due_executions` réelle. Vérifie que l'exécution
atteint `completed` et qu'il y a **exactement 3** deliveries `sent` (ni 2 =
bloqué au 2e wait, ni 4+ = double envoi).

Vérifié : avec l'ancien code (`jobId` statique) ce test échoue au cycle 2
(`waitUntil: condition not met` — la reprise est dédupliquée) ; avec le correctif
il passe.

## Remédiation en production

1. Supprimer les clés de jobs retenus qui bloquent la ré-injection :
   ```
   redis-cli --scan --pattern 'bull:campaign-engine:campaign-engine.advance-*'
   redis-cli DEL bull:campaign-engine:campaign-engine.advance-<id>   # pour chaque id listé
   ```
   (ou `Queue('campaign-engine').clean(0, 0, 'completed')`). À la passe suivante,
   le scheduler ré-enfile et l'exécution repart.
2. Lister toutes les victimes du même mécanisme :
   ```sql
   SELECT id, scheduled_at, current_node_id
   FROM campaign_executions
   WHERE status = 'waiting' AND scheduled_at <= UTC_TIMESTAMP();
   ```
3. Au redémarrage, le moteur enverra les emails en retard **en rafale** (un par
   cycle de reprise : 31/08, 1er, 2, 3 sept pour ce contact). Décider si ce
   rattrapage est souhaité ou s'il faut avancer `scheduled_at` / sauter les
   nœuds périmés avant de débloquer.

## Prévention / suivi

- **Fait** : test de scénario qui traverse le vrai chemin
  `QueueDispatcher` → BullMQ → Worker, sur **deux** cycles `wait`.
- Tout futur usage d'un `jobId` explicite dans `QueueDispatcher` doit avoir une
  durée de vie **bornée et alignée sur la fenêtre de dédup voulue** (ex. inclure
  `scheduled_at` : `advance-${id}-${scheduledAt.toMillis()}` dédupe les passes
  d'une même fenêtre due sans jamais bloquer la fenêtre suivante). Ne jamais
  réutiliser un `jobId` dont la portée dépasse la rétention `removeOnComplete`.
- Piste d'observabilité : alerter sur une exécution `waiting` dont
  `scheduled_at` est dépassé de plus de N minutes (aujourd'hui, rien ne le
  signale).
- `docs/plans/14-jobs-and-queues.md` § dédup `jobId` à préciser : la dédup joue
  aussi contre les jobs terminés retenus.
