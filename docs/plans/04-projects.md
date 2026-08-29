# 04 — Projects

## Objective

Fournir l'espace de travail principal (`Project`) dans lequel toutes les données marketing (contacts, segments, SMTP, emails, campagnes, statistiques) sont créées et strictement isolées les unes des autres, au sein d'une organisation.

## Functional requirements

- Création/édition/suppression d'un projet, dans le contexte d'une organisation.
- Un projet a un nom, un slug (unique dans son organisation), un fuseau horaire (`timezone`, utilisé pour le scheduling des campagnes — voir `02-database-design.md` § Dates et timezones), des `settings` libres (JSON, non structurants en v1).
- Sélection du "projet actif" (mémorisé en session, en complément de l'organisation active).
- Isolation stricte : toute donnée d'un domaine (contacts, segments, ...) porte `project_id` et n'est jamais accessible en dehors du contexte de ce projet.
- Liste des projets d'une organisation, avec navigation rapide entre eux (switcher).

## User flows

```text
Organisation active sélectionnée
  → si aucun projet actif en session OU projet actif non accessible : redirection vers
    /organizations/:organizationId/projects (liste)
  → si un seul projet existe : sélection automatique, redirection directe vers son dashboard
  → sinon : l'utilisateur choisit un projet dans la liste ou via le switcher du layout
       → session.projectId mis à jour → redirection vers le dashboard du projet
```

Création d'un premier projet : proposée directement depuis l'écran d'organisation vide ("Créer votre premier projet") pour éviter une étape morte dans l'onboarding.

## Domain concepts

- **Projet actif** : même principe que l'organisation active (§ `03-organizations.md`) — convenience de session, jamais source d'autorité de sécurité. Toute route `/organizations/:organizationId/projects/:projectId/*` vérifie via `project_context_middleware` que le projet appartient bien à `ctx.organization` et que l'utilisateur y a accès (dérivé du rôle d'organisation, v1 sans restriction par projet — voir `03-organizations.md` § Open questions).
- **Isolation** : chaque domaine (`Contact`, `Segment`, `SmtpConnector`, `EmailTemplate`, `Email`, `Campaign`, ...) référence `project_id`. Aucun service métier ne doit exposer une méthode qui accepte un ID sans le projet courant en paramètre implicite ou explicite — convention détaillée en `19-security.md`.

## Data model

Voir `02-database-design.md` § Identité / Organisations / Projets (table `projects`). Pas de table `project_memberships` en v1 (accès dérivé du rôle d'organisation).

## Backend architecture

```text
app/services/projects/project_service.ts   (create, update, delete)
app/policies/project_policy.ts             (dérive du rôle d'organisation, pas de rôle propre en v1)
app/middleware/project_context_middleware.ts
app/validators/project.ts
app/transformers/project_transformer.ts
app/events/project_created.ts, project_deleted.ts
```

## Frontend architecture

```text
inertia/pages/organizations/[organizationId]/projects/
  index.vue   (liste des projets de l'organisation)
  create.vue
  show/settings.vue   (nom, slug, timezone)
inertia/components/project-switcher.vue
```

`project-switcher.vue` s'affiche uniquement quand une organisation est active, à côté de `organization-switcher.vue` dans `inertia/layouts/default.vue`. Une fois un projet actif sélectionné, toutes les pages "feature" (contacts, segments, ...) vivent sous un layout dédié `inertia/layouts/project.vue` (étend `default.vue`) qui affiche la navigation latérale décrite dans `init.md` (Dashboard / Contacts / Segments / Campaigns / Emails / Templates / Settings).

## Routes

```text
GET    /organizations/:organizationId/projects                projects.index
GET    /organizations/:organizationId/projects/create           projects.create
POST   /organizations/:organizationId/projects                  projects.store
GET    /organizations/:organizationId/projects/:projectId       projects.show          (dashboard, cf. 18-statistics-dashboard.md)
GET    /organizations/:organizationId/projects/:projectId/settings projects.settings
PATCH  /organizations/:organizationId/projects/:projectId       projects.update        [role >= admin]
DELETE /organizations/:organizationId/projects/:projectId       projects.destroy       [role >= admin]
POST   /organizations/:organizationId/projects/:projectId/switch projects.switch        [role >= viewer]
```

Toutes les routes de feature ultérieures (`contacts`, `segments`, etc., dans leurs plans respectifs) sont nichées sous `/organizations/:organizationId/projects/:projectId/...` et passent par `project_context_middleware` en plus de `organization_context_middleware`.

## Controllers

`ProjectsController` (index/create/store/show/settings/update/destroy/switch). Fin, délègue à `ProjectService`.

## Services

- `ProjectService.create(organization, actor, payload)` : vérifie policy (role >= admin), génère un slug unique dans l'organisation si non fourni (slugify du nom, suffixe numérique si collision).
- `ProjectService.delete(project, actor)` : cascade DB supprime toutes les données du domaine (contacts, segments, campagnes, ...) — confirmation UI à double étape obligatoire (comme pour l'organisation), listant les volumes impactés.
- `ProjectService.update(project, payload)` : changement de `timezone` documenté comme n'affectant que les futurs calculs de scheduling, jamais les `campaign_executions.scheduled_at` déjà calculées (déjà figées en UTC).

## Models

`Project` (relations : `organization`, et toutes les relations `hasMany` vers les entités de domaine définies dans les plans suivants). Scope nommé `Project.query().forOrganization(organization)`.

## Jobs / Commands

Aucun en propre. La suppression d'un projet avec un volume important de données (ex. 1M contacts, historique d'emails) pourrait être longue en cascade SQL synchrone — **décision** : la suppression reste synchrone dans la requête HTTP pour la v1 (volumes de test/petite équipe), avec une note explicite en Open questions pour la faire passer en job asynchrone si nécessaire.

## Events

`ProjectCreated`, `ProjectDeleted` — consommés par `AuditLogListener` (`20-observability-and-audit.md`).

## Permissions

Dérivées du rôle d'organisation de l'utilisateur (pas de rôle par projet en v1) :

| Action | owner/admin | member | viewer |
|---|---|---|---|
| Voir un projet, switcher dessus | ✅ | ✅ | ✅ |
| Créer/éditer un projet | ✅ | ❌ | ❌ |
| Supprimer un projet | ✅ | ❌ | ❌ |

## Validation

`app/validators/project.ts` : `createProjectValidator` (`name` string 2–120, `timezone` string validé contre la liste IANA via une contrainte custom VineJS, `slug` optionnel format `[a-z0-9-]+`), `updateProjectValidator` (idem, `slug` immuable après création — voir Edge cases).

## Edge cases

- Slug de projet dupliqué dans la même organisation → suffixe auto (`-2`, `-3`, ...) à la création ; à l'édition, erreur de validation explicite si collision.
- Changement de `timezone` d'un projet avec des campagnes actives contenant des nœuds "Wait until 09:00" déjà planifiés → n'affecte pas les `scheduled_at` déjà calculées (figées en UTC), seulement les calculs futurs ; avertissement explicite dans l'UI au changement.
- Suppression du dernier projet d'une organisation → autorisée (l'organisation peut rester sans projet), pas de cas spécial.
- Slug immuable après création : changer un slug casserait tout lien externe futur (ex. lien de désabonnement ne dépend pas du slug — voir `17-unsubscribe.md` — mais un futur webhook entrant pourrait) ; verrouillé par simplicité et cohérence, ré-évaluable si un besoin réel apparaît.

## Failure scenarios

- Timeout lors d'une suppression de projet volumineux (cascade SQL longue) → documenté comme risque connu en v1 (voir Open questions), pas de mitigation implémentée dans cette phase.

## Idempotency considerations

- Création de projet : pas de contrainte d'idempotence particulière au-delà de la gestion normale de double-soumission de formulaire (bouton désactivé après clic côté frontend, erreur de validation propre si un slug généré entre-temps par une requête concurrente entre en collision — retry côté service avec un nouveau suffixe).

## Performance considerations

Volumes de projets par organisation faibles (dizaines) — aucune préoccupation particulière. `project_context_middleware` doit rester une requête indexée unique (`projects.where('id', projectId).where('organizationId', organization.id)`).

## Security considerations

- 404 (pas 403) si `projectId` n'appartient pas à `organizationId` de la route, ou si l'organisation n'appartient pas à l'utilisateur — ne jamais fuiter l'existence d'un projet à un tiers.
- Voir `19-security.md` pour la convention transverse d'isolation appliquée à tous les domaines qui suivent.

## Testing strategy

- Unit : `ProjectService` (génération de slug, cascade de suppression).
- Functional : création/édition/suppression avec matrice de rôles ; vérification 404 croisée (projet d'une autre organisation, projet d'une organisation dont l'utilisateur n'est pas membre).
- Isolation : test explicite "les données d'un projet A ne sont jamais retournées par une requête scoping projet B", à décliner dans chaque plan de domaine ultérieur (contacts, segments, ...) plutôt que dupliqué ici.

## Implementation steps

1. `node ace make:migration create_projects_table`.
2. `node ace migration:run`.
3. Créer le modèle `Project` (relations vers `Organization`, scope `forOrganization`).
4. Créer `app/validators/project.ts`.
5. Créer `app/policies/project_policy.ts` (délègue au rôle d'organisation).
6. Créer `app/middleware/project_context_middleware.ts`, l'enregistrer dans `start/kernel.ts` (`middleware.project()`).
7. Créer `app/services/projects/project_service.ts`.
8. Créer les events (`app/events/project_*.ts`).
9. Créer `app/transformers/project_transformer.ts`.
10. Créer `ProjectsController` et les routes correspondantes dans `start/routes.ts`.
11. Créer `inertia/layouts/project.vue` (navigation latérale) et le composant `project-switcher.vue`.
12. Créer les pages Inertia listées ci-dessus.
13. Étendre `InertiaMiddleware.share()` pour exposer `currentProject`/`projects` quand une organisation est active.
14. Écrire les tests listés ci-dessus.

## Dependencies

`03-organizations.md` (organisation active, rôle, `organization_context_middleware`) doit être implémenté avant.

## Open questions

- Suppression de projet volumineux : passer en job asynchrone (avec statut "suppression en cours") si les volumes réels dépassent ce qu'une transaction HTTP synchrone peut raisonnablement absorber. Non résolu en v1, à trancher avec des données de production réelles.
- Accès restreint par projet (cf. `03-organizations.md` § Open questions) : si retenu plus tard, `project_context_middleware` devra vérifier une table `project_memberships` en plus du rôle d'organisation.
