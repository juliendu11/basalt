# 13 — Campaign Enrollment

## Objective

Définir précisément quand et comment un contact entre dans une campagne (à partir de son segment source), les règles de première entrée/sortie/ré-entrée, et les cas où l'enrollment est refusé ou interrompu — le pont entre `06-segments.md` et `12-campaign-engine.md`.

## Functional requirements

- Enroller automatiquement les contacts qui entrent dans le segment source d'une campagne active.
- Refuser/ignorer l'enrollment pour un contact non éligible (désabonné, bloqué, supprimé).
- Gérer la sortie d'un contact du segment source (voir Domain concepts pour la décision retenue).
- Gérer la ré-entrée (contact qui ressort puis rentre à nouveau dans le segment source).
- Historique complet des enrollments passés (jamais supprimés, cf. `decisions/ADR-004-campaign-versioning.md`).

## User flows (déclenché par événements, pas par action utilisateur directe)

```text
SegmentMembershipAdded { segmentId, contactIds[] } émis par 06-segments.md
  → CampaignEnrollmentListener
      → trouve les campaigns actives dont published_version contient un node source
        de subtype 'segment' avec config.segmentId == segmentId
      → pour chaque (campaign, contactId) :
          → CampaignEnrollmentService.enroll(campaign, contact) — voir § Règles ci-dessous
```

## Domain concepts

**Règles d'enrollment (rappel des points explicitement demandés par `init.md`)** :

| Situation | Comportement |
|---|---|
| Première entrée | `CampaignEnrollment` créé (`status='active'`, `campaign_version_id` = version **publiée courante** de la campagne au moment de l'enrollment), `CampaignExecution` créée (`status='pending'`) — déclenche `12-campaign-engine.md`. |
| Sortie du segment source | **Aucune action automatique sur l'enrollment en cours** (décision explicite, voir justification ci-dessous) — un contact qui sort du segment source continue son parcours dans la campagne jusqu'à sa fin naturelle. Seule une **condition explicite `in_segment`** placée par l'utilisateur dans le graphe peut faire dépendre la suite du parcours de l'appartenance au segment. |
| Ré-entrée (sorti puis re-membre du segment) | Un **nouvel** `CampaignEnrollment` est créé si et seulement si le contact n'a **aucun** enrollment `active` en cours pour cette campagne (peu importe la version) — voir "Politique de ré-entrée" ci-dessous pour la configuration. |
| Campagne déjà terminée (`completed`) | Enrollment refusé silencieusement (pas d'erreur visible, juste journalisé) — une campagne `completed` n'accepte plus de nouveaux contacts. |
| Campagne désactivée (`paused`) | Enrollment **différé** : l'event `SegmentMembershipAdded` n'est pas perdu, mais `CampaignEnrollmentService.enroll()` vérifie `campaign.status == 'active'` et sort sans créer d'enrollment si `paused` — **pas de rattrapage automatique à la reprise** en v1 (voir Open questions ; le contact réintégrera naturellement le segment au prochain recalcul et sera capté par un futur `SegmentMembershipAdded`, mais uniquement si son appartenance au segment change à nouveau après la reprise). |
| Contact désabonné | Enrollment refusé (vérifié à `enroll()`, **et** re-vérifié à chaque `send_email` dans `12-campaign-engine.md` — défense en profondeur, l'état peut changer entre l'enrollment et l'exécution). |
| Contact supprimé | Impossible par construction : un contact soft-deleted n'apparaît plus dans `segment_contacts` après le prochain recalcul, et `05-contacts.md` annule déjà les enrollments actifs à la suppression — aucune action supplémentaire nécessaire ici. |
| Contact bloqué (`status='blocked'`) | Enrollment refusé, comme désabonné. |

**Pourquoi ne pas retirer automatiquement un contact qui sort du segment source** : une campagne représente un **parcours engagé** (ex. "séquence de bienvenue sur 2 semaines") — interrompre ce parcours simplement parce qu'un critère de segment a bougé entre-temps (ex. le contact a changé de pays) romprait des séquences en cours de façon souvent non désirée par l'utilisateur marketing. Si un arrêt conditionnel au segment est réellement voulu, l'utilisateur le modélise explicitement avec un node `condition` `in_segment` dans le graphe — c'est un choix de conception du workflow, pas un comportement caché du moteur.

**Politique de ré-entrée** : configurable **par campagne** (`campaigns.reentry_policy`, enum `never | after_exit | always` — colonne à ajouter, absente de `02-database-design.md` car spécifique à ce plan, détaillée ici) :
- `never` (défaut) : un contact qui a déjà eu un enrollment (peu importe son état final) pour cette campagne n'est plus jamais réenrollé.
- `after_exit` : réenrollable uniquement si son dernier enrollment est dans un état terminal (`completed`, `exited`, `cancelled` — pas `active`).
- `always` : réenrollable dès qu'il ré-intègre le segment source, même si un enrollment précédent existe déjà en état terminal récent (pas de délai de carence en v1).

`never` est le défaut le plus sûr (évite le spam d'un contact qui oscille dans/hors du segment) — l'utilisateur doit choisir explicitement une politique plus permissive.

## Data model

Ajout à `campaigns` (complément à `02-database-design.md`, spécifique à ce plan) :

```text
campaigns
  ... (colonnes de 02-database-design.md)
  reentry_policy (enum: never|after_exit|always, défaut 'never')
```

Voir `02-database-design.md` § Campagnes — exécution pour `campaign_enrollments` (rappel : `UNIQUE (campaign_id, contact_id, campaign_version_id)` — une ré-entrée sur la **même** version publiée créerait un conflit, mais c'est en pratique impossible car la politique `never`/`after_exit` empêche déjà un second enrollment actif ; si une ré-entrée est autorisée après republication, `campaign_version_id` diffère naturellement, donc pas de collision).

## Backend architecture

```text
app/services/campaigns/
  campaign_enrollment_service.ts   (enroll — logique de règles ci-dessus)
app/listeners/enroll_contacts_on_segment_membership_added.ts
app/listeners/enroll_existing_segment_members_on_campaign_activated.ts
  (écoute CampaignActivated — rattrape les membres déjà dans le segment
  source au moment de la première activation, cf. Edge cases)
```

`CampaignEnrollmentService.enroll(campaign, contact)` — algorithme :

```text
1. Si campaign.status != 'active' -> sortir (no-op journalisé)
2. Si contact.status not in ['subscribed'] -> sortir (no-op journalisé, raison="not eligible")
3. existingActive = CampaignEnrollment.query()
     .where('campaignId', campaign.id).where('contactId', contact.id)
     .where('status', 'active').first()
   Si existingActive existe -> sortir (déjà engagé, no-op)
4. Selon campaign.reentry_policy :
     'never'       -> si un enrollment (tout statut) existe déjà pour (campaign, contact) -> sortir
     'after_exit'  -> si un enrollment existe ET son dernier statut n'est pas terminal -> sortir
                      (couvert par l'étape 3 de toute façon) ; sinon continue
     'always'      -> continue toujours (sous réserve de l'étape 3)
5. Transaction :
     - CampaignEnrollment créé (campaign_version_id = campaign.published_version_id,
       status='active', source='segment:<segmentId>', enrolled_at=now())
     - CampaignExecution créée (campaign_enrollment_id, status='pending', scheduled_at=now())
6. Émission CampaignEnrollmentCreated
7. Enqueue campaign-engine.advance { executionId } (déclenche 12-campaign-engine.md)
```

Traitée **par lot** quand `SegmentMembershipAdded` contient plusieurs `contactIds` (le recompute de segment émet des events par lot, cf. `06-segments.md`) — chaque contact traité indépendamment dans sa propre mini-transaction (pas une transaction géante pour tout le lot, pour ne pas faire échouer tout le lot si un seul contact pose problème).

## Frontend architecture

Aucune UI dédiée d'action (l'enrollment est 100% automatique). `10-campaigns.md` (`show.vue`) affiche le compte d'enrollments actifs/complétés/sortis, et `18-statistics-dashboard.md` en détaille l'évolution. La configuration `reentry_policy` est un champ du formulaire de campagne (`campaigns.create`/settings, cf. `10-campaigns.md`).

## Routes

Aucune route propre (déclenchement 100% événementiel).

## Controllers

Aucun.

## Services

Voir Backend architecture.

## Models

Pas de nouveau modèle (`CampaignEnrollment` déjà défini dans `02-database-design.md`, utilisé ici). Scope nommé `CampaignEnrollment.query().activeFor(campaign, contact)`.

## Jobs / Commands

Aucun job dédié — le traitement se fait dans le listener (léger, une écriture DB + un enqueue par contact), pas dans un job séparé. Si le volume d'un lot `SegmentMembershipAdded` est important (recompute complet d'un segment à 1M contacts avec beaucoup de nouveaux membres), le listener lui-même peut être transformé en un job asynchrone (`campaign.enroll_batch { campaignId, contactIds[] }`) plutôt que de s'exécuter en ligne dans le traitement de l'event — **décision** : c'est le cas retenu dès la v1 par cohérence avec le principe "les listeners qui déclenchent du travail lourd enqueue un job" (`01-architecture.md` § Event bus interne), donc :

```text
job: campaign.enroll_batch { campaignId, contactIds: number[] }
  queue: campaign-engine
```

## Events

`CampaignEnrollmentCreated { enrollmentId, campaignId, contactId, source }` — consommé par `18-statistics-dashboard.md` et `AuditLogListener`. Écoute en entrée : `SegmentMembershipAdded` (de `06-segments.md`).

## Permissions

Sans objet (processus système). La configuration `reentry_policy` suit les permissions standard d'édition de campagne (`10-campaigns.md`).

## Validation

`reentry_policy` validé comme un enum dans `app/validators/campaign.ts` (complément au validator déjà défini dans `10-campaigns.md`).

## Edge cases

- Un contact appartient déjà au segment source **au moment où la campagne est activée pour la première fois** (pas un nouvel ajout, il était déjà membre avant) → géré explicitement depuis l'ajout de `EnrollExistingSegmentMembersOnCampaignActivated` (écoute `CampaignActivated`, cf. Backend architecture) : au premier `publish()`, tous les membres déjà présents dans `segment_contacts` pour le segment source sont enrollés par lots (`campaign.enroll_batch`), comme s'ils venaient de rejoindre le segment. Avant cet ajout, seul un `SegmentMembershipAdded` (un changement réel de membership) déclenchait l'enrollment et ces contacts n'étaient jamais captés — voir Open questions (résolu).
- Contact enrollé alors que le segment source est modifié juste après (nouvelle `definition`) → aucun impact rétroactif, cohérent avec "sortie du segment source n'affecte pas un enrollment en cours".
- Plusieurs campagnes actives partagent le même segment source → chaque campagne traite l'event `SegmentMembershipAdded` indépendamment, un contact peut être engagé simultanément dans plusieurs campagnes (comportement voulu, pas de règle d'exclusivité en v1).
- Republication d'une campagne pendant qu'un contact a un enrollment `active` sur l'ancienne version → l'enrollment actif continue sur l'ancienne version (cf. `decisions/ADR-004-campaign-versioning.md`) ; si le contact ressort puis rentre à nouveau (politique `always`/`after_exit`), le nouvel enrollment utilise la version publiée **courante** (donc la nouvelle).

## Failure scenarios

- Échec de création de `CampaignExecution` après création réussie de `CampaignEnrollment` (crash entre les deux) → les deux créations sont dans la **même transaction** (étape 5 de l'algorithme), donc atomiques : impossible d'avoir l'un sans l'autre.
- Échec de l'enqueue du job `campaign-engine.advance` après commit de la transaction → l'exécution reste `status='pending'` avec `scheduled_at` déjà passé ; **rattrapée** par le job périodique de scheduling (`12-campaign-engine.md`, `ExecutionSchedulerService.findDueExecutions` inclut aussi les executions `pending` dues, pas seulement `waiting` — précision de conception notée ici pour lever toute ambiguïté).

## Idempotency considerations

`enroll()` est idempotent par construction (étape 3 : vérifie l'absence d'enrollment actif avant d'en créer un). Un même event `SegmentMembershipAdded` traité deux fois (retry de job) ne crée jamais deux enrollments actifs pour le même (campaign, contact).

## Performance considerations

- `campaign_enrollments (campaign_id, contact_id, status)` — nécessite un index composé au-delà de celui déjà listé dans `02-database-design.md` (`project_id, campaign_id, status`) pour que l'étape 3 (`activeFor`) reste indexée ; à ajouter explicitement : `INDEX (campaign_id, contact_id, status)` — précision complémentaire à `02-database-design.md` pour ce plan.
- Traitement par lot (`campaign.enroll_batch`) plutôt qu'un enqueue par contact individuel évite une explosion du nombre de jobs lors d'un recompute de segment massif (ex. 500 000 nouveaux membres d'un coup) — le job lui-même itère et traite chaque contact dans sa propre mini-transaction, mais reste un seul job côté queue.

## Security considerations

Standard (isolation projet — un `CampaignEnrollmentService.enroll()` ne doit jamais être appelable avec un contact et une campagne de projets différents ; vérifié structurellement puisque le listener résout toujours `campaign` et `contact` à partir du même `segmentId`, lui-même scopé projet).

## Testing strategy

- Unit : `CampaignEnrollmentService.enroll` — chaque ligne de la table de règles ci-dessus testée explicitement (première entrée, campagne paused, contact désabonné, campagne completed, chaque `reentry_policy`).
- Functional : bout en bout `SegmentMembershipAdded` → enrollment créé → execution créée → job d'avancement enqueued (vérifié par une fixture qui inspecte la queue de test).
- Regression : un contact qui sort puis rentre dans le segment source sans changer de statut, avec `reentry_policy='never'`, n'est jamais réenrollé (test explicite du cas qui a le plus de risque de régression silencieuse).

## Implementation steps

1. `node ace make:migration add_reentry_policy_to_campaigns_table` (colonne complémentaire à `10-campaigns.md`).
2. `node ace make:migration add_contact_id_status_index_to_campaign_enrollments_table` (index complémentaire).
3. `node ace migration:run`.
4. Créer `app/services/campaigns/campaign_enrollment_service.ts`.
5. Créer l'event `CampaignEnrollmentCreated`.
6. Créer le job `campaign.enroll_batch` (dépend de `14-jobs-and-queues.md`).
7. Créer `app/listeners/enroll_contacts_on_segment_membership_added.ts`, l'enregistrer sur `SegmentMembershipAdded` dans `start/events.ts`.
8. Ajouter `reentry_policy` au validator/formulaire de campagne (`10-campaigns.md`).
9. Écrire les tests listés ci-dessus.

## Dependencies

`06-segments.md` (`SegmentMembershipAdded`), `10-campaigns.md` (modèle `Campaign`), `12-campaign-engine.md` (déclenchement de l'exécution), `14-jobs-and-queues.md`.

## Open questions

- ~~Faut-il une action explicite "enroller les membres existants du segment" à l'activation d'une campagne~~ — **Résolu** : implémenté via `EnrollExistingSegmentMembersOnCampaignActivated` (écoute `CampaignActivated`, déclenché uniquement à la toute première activation, jamais sur une republication). Simule un `SegmentMembershipAdded` pour tous les membres actuels du segment source au moment de l'activation, par lots de 5000 (même taille que `SegmentRecomputeService`), en réutilisant tel quel `campaign.enroll_batch`/`CampaignEnrollmentService.enroll()` — donc soumis aux mêmes règles d'éligibilité (contact `subscribed`, `reentry_policy`, etc.).
- Rattrapage automatique des enrollments différés pendant une pause (cf. table de règles "campagne désactivée") : non implémenté en v1 — à la reprise, seuls les nouveaux changements de segment déclenchent un enrollment, pas un rattrapage rétroactif des contacts qui seraient entrés dans le segment pendant la pause. Piste : à la reprise (`CampaignService.resume`), déclencher un recompute complet du segment source suivi d'une comparaison avec les enrollments existants — non détaillé ici.
