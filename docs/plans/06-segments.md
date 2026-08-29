# 06 — Segments

## Objective

Permettre de définir des ensembles dynamiques de contacts via des critères combinables (AND/OR), avec une membership persistée et recalculée efficacement, servant de source principale pour l'enrollment dans les campagnes.

## Functional requirements

- Créer/éditer/supprimer un segment (nom, description, définition de filtres).
- Constructeur de filtres : groupes de conditions combinables en AND/OR (imbrication de groupes autorisée).
- Opérateurs par type de champ : `equals`, `not_equals`, `contains`, `not_contains`, `starts_with`, `ends_with`, `greater_than`, `less_than`, `before`, `after`, `is_null`, `is_not_null`, `in`, `not_in`.
- Aperçu du nombre de contacts correspondants avant sauvegarde (calcul à la volée, sans persister — voir Backend architecture).
- Recalcul manuel à la demande (bouton "Recalculer maintenant").
- Recalcul automatique : ciblé (temps réel sur événement contact) + complet (planifié, filet de sécurité) — voir `decisions/ADR-003-segment-membership.md`.
- Liste des contacts membres d'un segment (réutilise `ContactQueryService` avec `segmentId`, cf. `05-contacts.md`).

## User flows

**Création/édition** :
```text
Utilisateur construit l'arbre de conditions dans l'UI
  → POST/PATCH avec `definition` (JSON) validée
  → SegmentService.save() :
      - valide la forme de `definition` (champs connus, opérateurs compatibles avec le type de champ)
      - extrait et persiste `referenced_fields` (liste des champs standards/custom référencés,
        utilisée pour le recalcul ciblé — voir Domain concepts)
      - enqueue un job de recalcul complet (mode 'full') — asynchrone, pas de blocage de la requête
  → Segment sauvegardé, `last_computation_status = 'running'` jusqu'à la fin du job
```

**Aperçu (preview)** avant sauvegarde : endpoint dédié, exécute la requête dérivée de `definition` avec un simple `COUNT(*)`, **sans** écrire dans `segment_contacts` (le segment n'existe peut-être pas encore) — timeout court (ex. 3s) avec un message "aperçu indisponible pour une définition aussi complexe, sauvegardez pour un calcul complet en arrière-plan" en cas de dépassement.

**Recalcul automatique ciblé** :
```text
ContactUpdated(contact, changedFields) émis (05-contacts.md)
  → SegmentRecomputeListener
      → trouve les segments du projet dont `referenced_fields` intersecte `changedFields`
      → pour chacun, enqueue segment.recompute { segmentId, mode: 'targeted', contactId }
```

## Domain concepts

**Arbre de définition (`segments.definition`)** :

```json
{
  "combinator": "AND",
  "conditions": [
    { "field": "country", "operator": "equals", "value": "France" },
    { "field": "customFields.plan", "operator": "equals", "value": "pro" },
    {
      "combinator": "OR",
      "conditions": [
        { "field": "status", "operator": "equals", "value": "subscribed" },
        { "field": "createdAt", "operator": "after", "value": "2025-01-01" }
      ]
    }
  ]
}
```

- `field` : soit un champ standard de `contacts` (`email`, `firstName`, `status`, `country`, `createdAt`, ...), soit `customFields.<key>`.
- Un groupe est soit une feuille (`field`/`operator`/`value`), soit un nœud (`combinator` + `conditions[]` récursif). Profondeur max imposée en validation (ex. 5 niveaux) pour éviter des arbres pathologiques.
- **`referenced_fields`** (colonne calculée à la sauvegarde, pas fournie par le client) : liste plate des `field` présents dans l'arbre, aplatie et dédupliquée — sert uniquement au recalcul ciblé (§ Backend architecture), jamais à l'évaluation elle-même.

**Segment evaluator** : traduit `definition` en requête Lucid, récursivement :
```text
Segment definition (JSON)
        ↓  SegmentEvaluator.toQuery(definition, baseQuery)
Contact query (Lucid query builder, where/orWhere imbriqués via callbacks)
        ↓ exécution
Contact ids matching
        ↓  diff contre segment_contacts existant
Segment membership (insert/delete)
```

L'évaluateur ne construit **jamais** de SQL par concaténation de chaînes — uniquement le query builder Lucid (bindings paramétrés), y compris pour les champs `customFields.*` (via l'opérateur JSON du query builder, ex. `whereJsonPath` équivalent Lucid/Knex) — voir `19-security.md` § injections.

## Data model

Voir `02-database-design.md` § Segments (`segments`, `segment_contacts`). Ajout non listé dans le schéma générique : `segments.referenced_fields` (json, tableau de strings) — à ajouter à la migration de cette feature (précision détaillée ici car spécifique à ce plan) :

```text
segments
  ... (colonnes de 02-database-design.md)
  referenced_fields (json — ex. ["country", "customFields.plan", "status"])
```

## Backend architecture

```text
app/services/segments/
  segment_service.ts        (save, delete, extractReferencedFields)
  segment_evaluator.ts       (definition -> Lucid query builder, recursif)
  segment_recompute_service.ts (full recompute par lots, targeted recompute par contact)
app/validators/segment.ts   (validation récursive de la definition, whitelist de champs/opérateurs par type)
app/transformers/segment_transformer.ts
app/events/segment_membership_added.ts, segment_membership_removed.ts, segment_recomputed.ts
app/listeners/recompute_segments_on_contact_change.ts
```

**Full recompute (`segment_recompute_service.full(segment)`)**, conçu pour scaler jusqu'à 1M+ contacts (voir `decisions/ADR-003-segment-membership.md`) :

```text
1. currentIds = évaluer definition -> stream des contact_id par lots de 5 000
   (curseur sur contacts.id, jamais tout charger en mémoire)
2. Pour chaque lot :
     - INSERT IGNORE dans segment_contacts (segment_id, contact_id, added_at)
       pour les ids du lot non déjà présents
3. Après tous les lots : DELETE des lignes segment_contacts.segment_id = X
   dont contact_id n'est plus dans l'ensemble courant (requête anti-jointure,
   ex. NOT IN via une table temporaire des ids courants, ou LEFT JOIN ... WHERE NULL)
4. Diff des ids réellement ajoutés/retirés (capturés aux étapes 2/3) -> émission
   SegmentMembershipAdded / SegmentMembershipRemoved par lot (pas un event par contact)
5. segments.contact_count_cache, last_computed_at, last_computation_status mis à jour
```

**Targeted recompute (`segment_recompute_service.targeted(segment, contact)`)** : évalue `definition` pour un seul contact (requête `WHERE contacts.id = ?` combinée aux conditions), compare au résultat à la présence actuelle dans `segment_contacts`, applique l'insert/delete unitaire, émet l'event correspondant si changement.

## Frontend architecture

```text
inertia/pages/.../segments/
  index.vue    (liste, dernier compte, statut de calcul)
  create.vue / edit.vue  (builder de filtres)
  show.vue     (contacts membres, réutilise le composant table de 05-contacts.md)
inertia/components/segment-builder/
  condition-group.vue   (récursif : groupe AND/OR + sous-groupes)
  condition-row.vue     (champ + opérateur + valeur, opérateurs filtrés selon le type du champ choisi)
  field-picker.vue      (liste des champs standards + customFields.* connus du projet)
```

Le builder maintient un état local (arbre JS) traduit en `definition` JSON à la soumission ; un appel debounced à l'endpoint de preview affiche le compte estimé pendant l'édition.

## Routes

```text
GET    .../segments                 segments.index
GET    .../segments/create           segments.create
POST   .../segments                  segments.store
GET    .../segments/:segmentId       segments.show
GET    .../segments/:segmentId/edit  segments.edit
PATCH  .../segments/:segmentId       segments.update
DELETE .../segments/:segmentId       segments.destroy
POST   .../segments/:segmentId/recompute segments.recompute
POST   .../segments/preview          segments.preview   (aperçu avant sauvegarde, sans segmentId)
```

## Controllers

`SegmentsController` (index/create/store/show/edit/update/destroy/recompute), `SegmentPreviewController` (store). Validation de `definition` faite dans le validator (voir Validation), pas dans le controller.

## Services

Voir Backend architecture ci-dessus. `SegmentService.delete(segment)` : vérifie qu'aucune campagne active n'utilise ce segment comme source (`campaign_nodes` de type `source`/`segment` référençant ce `segmentId` dans une `campaign_version` `published`) — bloque avec message explicite plutôt que de casser silencieusement des campagnes en cours (cf. `10-campaigns.md`).

## Models

`Segment` (relations : `project`, `contacts` via `segment_contacts`). `SegmentContact` (relations : `segment`, `contact`). Scope nommé `Segment.query().forProject(project)`.

## Jobs / Commands

```text
job: segment.recompute { segmentId, mode: 'full' | 'targeted', contactId? }
  queue: segments (voir 14-jobs-and-queues.md)

command: node ace segments:recompute [--segment=<id>] [--project=<id>]
  -- enqueue un recompute full pour un segment donné, ou tous les segments d'un projet,
     ou tous les segments de tous les projets si aucun filtre (usage : cron nightly, voir ci-dessous)

scheduler: tous les segments recalculés en 'full' une fois par nuit (heure basse, ex. 03:00 UTC),
  via la command ci-dessus déclenchée par un scheduler externe (cron système ou équivalent —
  AdonisJS n'a pas de scheduler intégré, voir 14-jobs-and-queues.md pour le mécanisme retenu)
```

## Events

`SegmentMembershipAdded { segmentId, contactIds[] }`, `SegmentMembershipRemoved { segmentId, contactIds[] }`, `SegmentRecomputed { segmentId, addedCount, removedCount, durationMs }`. `SegmentMembershipAdded` est l'event clé consommé par `13-campaign-enrollment.md` pour déclencher l'enrollment des campagnes dont ce segment est la source.

## Permissions

Standard projet (voir `19-security.md`).

## Validation

`app/validators/segment.ts` : validation **récursive** de `definition` :
- `combinator` ∈ `{AND, OR}` si nœud, sinon `field`/`operator`/`value` si feuille.
- `field` doit être dans la whitelist des champs standards de `contacts` ou matcher `customFields\.[a-zA-Z0-9_]+`.
- `operator` doit être compatible avec le type inféré du champ (ex. `greater_than`/`less_than`/`before`/`after` interdits sur un champ texte comme `email` ; `contains`/`starts_with`/`ends_with` réservés aux champs texte ; `is_null`/`is_not_null` n'attendent pas de `value`).
- Profondeur d'imbrication max (ex. 5) et nombre max de conditions total (ex. 50) — protège contre des définitions pathologiques côté evaluator.

## Edge cases

- Segment sans aucune condition (`definition.conditions = []`) → interprété comme "tous les contacts du projet" (comportement explicite, documenté dans l'UI, pas une erreur).
- Édition de `definition` d'un segment déjà source d'une campagne **active** → autorisée (le contenu du segment peut évoluer), mais un avertissement UI rappelle que le prochain recalcul peut déclencher de nouveaux enrollments/sorties selon la politique de re-entrée de la campagne (`13-campaign-enrollment.md`).
- Suppression d'un segment source d'une campagne active → bloquée (voir Services).
- Champ custom référencé dans `definition` qui n'existe plus sur aucun contact (clé supprimée/jamais utilisée) → traité comme `NULL` (les opérateurs `is_null`/`equals` avec valeur vide se comportent normalement), pas une erreur de validation à la sauvegarde (on ne peut pas garantir l'existence d'une clé JSON libre).

## Failure scenarios

- Un recompute `full` échoue à mi-parcours (ex. crash worker) → `last_computation_status = 'failed'`, `last_error` renseigné ; le job est repris via le mécanisme de retry générique (`15-retry-and-idempotency.md`) — le recompute `full` est conçu pour être **ré-exécutable sans effet de bord cumulatif** (idempotent, voir ci-dessous), donc une reprise complète depuis le lot 1 est sûre même après un échec partiel.

## Idempotency considerations

- Le recompute `full` est **intrinsèquement idempotent** : ré-exécuter la même définition sur le même état de contacts produit le même set final de `segment_contacts`, quel que soit le nombre de fois où il est exécuté ou interrompu (`INSERT IGNORE` + `DELETE` anti-jointure sont tous deux idempotents). Pas besoin de clé d'idempotence dédiée pour ce job (contrairement à l'envoi d'email, cf. `decisions/ADR-005-email-idempotency.md`).
- Le recompute `targeted` est idempotent pour la même raison (comparaison état actuel vs. évaluation, jamais un simple "insert").

## Performance considerations

- Voir `decisions/ADR-003-segment-membership.md` pour la stratégie de lots et les volumétries de référence (1k/100k/1M).
- Index `segment_contacts (segment_id, contact_id)` unique sert à la fois la contrainte, le `INSERT IGNORE`, et les lectures de membership.
- Index `segment_contacts (contact_id)` sert le recompute `targeted` (retrouver rapidement dans quels segments un contact est actuellement) et l'affichage "segments de ce contact" sur `05-contacts.md`.
- Le `SegmentEvaluator` doit systématiquement s'appuyer sur les index existants de `contacts` (`project_id`, `status`) — un champ fréquemment utilisé dans des segments (ex. `country`) est candidat à un index dédié, à ajouter au fil de l'usage réel plutôt que préventivement pour tous les champs.

## Security considerations

- `SegmentEvaluator` n'utilise jamais de SQL brut interpolé avec la valeur utilisateur — uniquement le query builder Lucid, y compris pour les chemins JSON (`customFields.*`), pour exclure toute injection SQL (voir `19-security.md`).
- Le nombre max de conditions/profondeur (§ Validation) protège aussi contre un déni de service applicatif (requête générée trop coûteuse) au-delà de la seule intégrité fonctionnelle.

## Testing strategy

- Unit : `SegmentEvaluator` (chaque opérateur, combinaisons AND/OR imbriquées, champs standards et `customFields.*`), extraction de `referenced_fields`.
- Unit : `SegmentRecomputeService` — full et targeted, y compris sur un jeu de données avec ajouts ET retraits simultanés (vérifie que le diff est correct dans les deux sens).
- Functional : parcours création → preview → sauvegarde → job de recompute → membership visible en base et dans l'UI.
- Idempotency : exécuter deux fois de suite un recompute `full` sur le même état → résultat identique, aucune erreur, aucun event dupliqué de façon incohérente (les events du deuxième passage doivent être vides puisqu'aucun changement).
- Performance (test dédié, volumétrie réduite en CI mais lots multiples forcés) : vérifie que le recompute traite bien par lots (pas un seul `SELECT *` chargé en mémoire) — testable en vérifiant le nombre de requêtes exécutées plutôt qu'en testant à 1M lignes réelles en CI.

## Implementation steps

1. `node ace make:migration create_segments_table` (inclure `referenced_fields`).
2. `node ace make:migration create_segment_contacts_table`.
3. `node ace migration:run`.
4. Créer les modèles `Segment`, `SegmentContact`.
5. Créer `app/validators/segment.ts` (validation récursive + whitelist champs/opérateurs).
6. Créer `app/services/segments/segment_evaluator.ts` (fonction pure `definition -> query builder`, testable isolément).
7. Créer `app/services/segments/segment_service.ts` (save/delete/extractReferencedFields).
8. Créer `app/services/segments/segment_recompute_service.ts` (full/targeted, par lots).
9. Définir le job `segment.recompute` (dépend de `14-jobs-and-queues.md` — si ce plan n'est pas encore implémenté, le job peut être stubé en exécution synchrone temporaire documentée, à remplacer dès l'infra de queue disponible ; voir `22-development-roadmap.md` pour l'ordre recommandé qui place `14-jobs-and-queues.md` avant ce plan).
10. Créer `app/events/segment_membership_added.ts`, `segment_membership_removed.ts`, `segment_recomputed.ts`.
11. Créer `app/listeners/recompute_segments_on_contact_change.ts`, l'enregistrer sur `ContactCreated`/`ContactUpdated` dans `start/events.ts`.
12. Créer `node ace make:command segments/recompute` (command CLI ci-dessus).
13. Créer `app/transformers/segment_transformer.ts`.
14. Créer `SegmentsController`, `SegmentPreviewController` et les routes.
15. Créer les composants du builder de filtres et les pages Inertia listées ci-dessus.
16. Écrire les tests listés ci-dessus.

## Dependencies

`05-contacts.md` (champs filtrables), `14-jobs-and-queues.md` (exécution asynchrone du recompute — voir note à l'étape 9 sur l'ordre alternatif possible).

## Open questions

- Faut-il exposer aux utilisateurs un scheduler configurable (fréquence de recalcul par segment) plutôt qu'un nightly global unique ? Non retenu en v1 par simplicité ; le recalcul ciblé couvre la majorité des besoins de fraîcheur perçue.
- Index dédiés sur des `customFields.*` fréquemment filtrés (colonnes générées MySQL) : à évaluer avec des données de production réelles, non anticipé en v1 (cf. `05-contacts.md` § Open questions).
