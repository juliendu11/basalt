# 03 — Organizations

## Objective

Permettre à un utilisateur d'appartenir à une ou plusieurs organisations, chacune avec ses membres et ses rôles, comme racine de l'isolation multi-tenant (une organisation contient des projets, qui contiennent les données marketing).

## Functional requirements

- Création d'organisation (par un utilisateur authentifié, qui en devient `owner`).
- Édition (nom) et suppression d'organisation (owner uniquement, avec confirmation et cascade documentée).
- Liste des membres, avec leur rôle.
- Rôles : `owner` (un seul par organisation, transférable), `admin`, `member`, `viewer` — évolutif (voir Open questions).
- Invitation de nouveaux membres par email (avec rôle assigné à l'invitation).
- Acceptation/refus d'une invitation (par l'utilisateur invité, y compris s'il doit d'abord créer un compte).
- Révocation d'une invitation en attente, retrait d'un membre.
- Changement de rôle d'un membre existant (par owner/admin, selon la matrice de permissions).
- Sélection de l'"organisation active" (contexte courant, mémorisé en session, resélectionnable via un switcher UI).
- Isolation stricte : aucune donnée d'une organisation n'est visible/modifiable par un utilisateur qui n'en est pas membre.

## User flows

**Création (onboarding)** : à l'inscription (`NewAccountController.store`), une organisation par défaut est créée automatiquement pour l'utilisateur (nommée d'après son nom, éditable ensuite), avec l'utilisateur comme `owner` et `organization_memberships.joined_at = now()` — évite l'écran vide "vous n'avez aucune organisation" pour un onboarding B2B qui doit rester simple pour une petite équipe/un solo. L'utilisateur peut ensuite créer d'autres organisations ou en rejoindre via invitation.

**Invitation** :
```text
Admin/Owner saisit un email + rôle
  → organization_invitations créée (token, expires_at = +7 jours)
  → email envoyé (lien /invitations/:token)
  → destinataire clique
      → non connecté : redirigé vers signup/login avec le token conservé (query param), puis
        retour automatique sur la page d'acceptation après connexion
      → connecté : page "Vous êtes invité à rejoindre {organization}" → Accepter/Refuser
          → Accepter : organization_memberships créée (ou activée si une ligne existait déjà en
            attente), organization_invitations.accepted_at = now(), organisation active = celle-ci
          → Refuser : organization_invitations.revoked_at = now()
```

**Switch d'organisation active** : menu déroulant listant les organisations dont l'utilisateur est membre → sélection → `session.organizationId` mis à jour → redirection vers le dashboard du dernier projet actif de cette organisation (ou vers la liste de projets si aucun projet actif mémorisé).

## Domain concepts

- **Organisation active** = convenience de navigation (mémorisée en session), **jamais** la source d'autorité pour la sécurité : toute route qui agit sur une organisation/un projet vérifie l'appartenance via les paramètres d'URL (`organization_context_middleware`), pas seulement via la session. Voir `19-security.md`.
- **Rôle** attaché à la paire (user, organization) via `organization_memberships`, pas un rôle global de l'utilisateur — un utilisateur peut être `owner` d'une organisation et `viewer` d'une autre.
- **Owner unique** : exactement un membre `owner` par organisation à tout instant (transférable, jamais vacant). La création d'organisation assigne automatiquement `owner` au créateur.

## Data model

Voir `02-database-design.md` § Identité / Organisations / Projets pour `organizations`, `organization_memberships`, `organization_invitations`. Rappel des points clés :

- `organizations.owner_user_id` est dénormalisé en plus de la ligne `organization_memberships` correspondante (rôle `owner`) — pratique pour des requêtes directes ("mes organisations en tant que owner") et pour garantir par contrainte applicative qu'il n'y a jamais deux owners simultanés (le service de transfert de propriété met à jour les deux en une transaction).
- `organization_memberships.joined_at` nullable : une invitation en attente peut préexister sous forme de ligne `organization_memberships` non jointe, ou (choix retenu) rester uniquement dans `organization_invitations` jusqu'à acceptation — **décision** : ne créer la ligne `organization_memberships` qu'à l'acceptation (pas avant), pour ne jamais lister un utilisateur "membre" avant qu'il n'ait accepté. `joined_at` est donc toujours renseigné dès la création de la ligne ; conservé comme colonne (plutôt que d'utiliser `created_at`) pour permettre une future distinction entre "ligne créée par un import" et "date d'acceptation réelle".

## Backend architecture

```text
app/services/organizations/
  organization_service.ts        (create, update, delete, transferOwnership)
  organization_membership_service.ts (invite, accept, revoke, changeRole, remove)
app/policies/organization_policy.ts  (Bouncer policy — voir 19-security.md)
app/validators/organization.ts
app/transformers/organization_transformer.ts, organization_membership_transformer.ts
app/events/organization_member_invited.ts, organization_member_joined.ts, organization_member_removed.ts
app/listeners/send_organization_invitation_email.ts
app/mails/organization_invitation_mail.ts
```

## Frontend architecture

```text
inertia/pages/organizations/
  index.vue        (liste des organisations de l'utilisateur, bouton "créer")
  create.vue        (formulaire de création)
  show.vue          (settings généraux : nom, danger zone suppression/transfert)
  members/index.vue (liste membres + invitations en attente, formulaire d'invitation)
inertia/pages/invitations/
  show.vue          (page d'acceptation via token)
inertia/components/organization-switcher.vue  (composant réutilisé dans le layout, cf. 04-projects.md)
```

Le switcher d'organisation est un composant partagé injecté dans `inertia/layouts/default.vue` (à côté du logo actuel), alimenté par une prop partagée globalement (`organizations`, `currentOrganization`) ajoutée dans `InertiaMiddleware.share()` — voir `19-security.md` pour la donnée exacte partagée (jamais plus que `id, name, slug, role`).

## Routes

```text
GET    /organizations                          organizations.index
GET    /organizations/create                    organizations.create
POST   /organizations                           organizations.store
GET    /organizations/:organizationId/settings   organizations.show          [organization_context, role >= admin]
PATCH  /organizations/:organizationId            organizations.update        [role >= admin]
DELETE /organizations/:organizationId            organizations.destroy       [role == owner]
POST   /organizations/:organizationId/switch     organizations.switch        [role >= viewer]

GET    /organizations/:organizationId/members             organization_members.index   [role >= admin]
POST   /organizations/:organizationId/members/invitations  organization_invitations.store [role >= admin]
DELETE /organizations/:organizationId/members/invitations/:invitationId organization_invitations.destroy [role >= admin]
PATCH  /organizations/:organizationId/members/:membershipId organization_members.update  [role >= admin]
DELETE /organizations/:organizationId/members/:membershipId organization_members.destroy  [role >= admin, cible != owner]

GET    /invitations/:token                       invitations.show    [auth]
POST   /invitations/:token/accept                 invitations.accept  [auth]
POST   /invitations/:token/decline                invitations.decline [auth]
```

Toutes les routes `/organizations/:organizationId/*` passent par `organization_context_middleware` qui résout `ctx.organization`, vérifie la présence d'un `organization_memberships` pour l'utilisateur courant (404 sinon — jamais 403, pour ne pas confirmer l'existence de l'organisation à un non-membre), et expose le rôle courant à `ctx.organizationRole` pour les policies.

## Controllers

`OrganizationsController` (index/create/store/show/update/destroy/switch), `OrganizationMembersController` (index/update/destroy), `OrganizationInvitationsController` (store/destroy), `InvitationsController` (show/accept/decline). Controllers fins : validation VineJS → délégation service → transformer/redirect + flash message.

## Services

- `OrganizationService.create(user, payload)` : transaction (create organization + membership owner).
- `OrganizationService.delete(organization)` : vérifie owner, cascade DB (`onDelete cascade`) supprime tout (memberships, invitations, et transitivement tous les projets et leurs données — confirmation UI à double étape obligatoire, cf. Edge cases).
- `OrganizationService.transferOwnership(organization, newOwnerMembership)` : transaction, met à jour `owner_user_id` + les deux rôles de membership.
- `OrganizationMembershipService.invite(organization, actor, email, role)` : vérifie policy, crée/rafraîchit `organization_invitations`, émet `OrganizationMemberInvited`.
- `OrganizationMembershipService.accept(invitation, user)` : transaction (crée `organization_memberships`, marque l'invitation acceptée), émet `OrganizationMemberJoined`.
- `OrganizationMembershipService.changeRole(membership, newRole, actor)` : refuse de rétrograder le dernier owner sans transfert explicite.
- `OrganizationMembershipService.remove(membership, actor)` : refuse si cible == owner.

## Models

`Organization` (relations : `memberships`, `invitations`, `projects`, `owner`), `OrganizationMembership` (relations : `organization`, `user`), `OrganizationInvitation` (relations : `organization`, `invitedBy`). Scopes nommés : `Organization.query().forUser(user)` (join memberships), `OrganizationMembership.query().withRoleAtLeast('admin')`.

## Jobs / Commands

Aucun job asynchrone dédié (l'envoi de l'email d'invitation passe par le système de mail existant, synchrone ou via une queue générique `mail` — hors périmètre de cette feature, réutiliser le mécanisme standard AdonisJS Mail). Aucune command ace spécifique.

## Events

`OrganizationMemberInvited`, `OrganizationMemberJoined`, `OrganizationMemberRemoved`, `OrganizationOwnershipTransferred` — consommés au minimum par `AuditLogListener` (voir `20-observability-and-audit.md`) et par le listener d'envoi d'email d'invitation.

## Permissions

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| Voir l'organisation, switcher dessus | ✅ | ✅ | ✅ | ✅ |
| Éditer nom/settings | ✅ | ✅ | ❌ | ❌ |
| Inviter/retirer un membre, changer un rôle | ✅ | ✅ | ❌ | ❌ |
| Supprimer l'organisation | ✅ | ❌ | ❌ | ❌ |
| Transférer la propriété | ✅ | ❌ | ❌ | ❌ |

Implémenté via Bouncer (`app/policies/organization_policy.ts`), voir `19-security.md` pour le détail du mécanisme et son extension au niveau projet.

## Validation

`app/validators/organization.ts` : `createOrganizationValidator` (`name`: string 2–120), `updateOrganizationValidator` (idem), `inviteMemberValidator` (`email`, `role` enum), `changeRoleValidator` (`role` enum, refuse `owner` — le transfert de propriété est une action dédiée, pas un simple changement de rôle).

## Edge cases

- Suppression d'une organisation avec des projets contenant des campagnes actives → confirmation à double étape (taper le nom de l'organisation), avertissement explicite listant le nombre de projets/campagnes actives impactées (calculé par le service avant suppression).
- Invitation d'un email déjà membre → erreur de validation explicite plutôt qu'une invitation dupliquée.
- Invitation renvoyée à un email déjà invité (en attente) → réutilise/rafraîchit l'invitation existante (nouveau token, `expires_at` repoussé) plutôt que d'en créer une deuxième.
- Dernier `owner` qui essaie de quitter l'organisation ou de changer son propre rôle → refusé explicitement, message invitant à transférer la propriété d'abord.
- Utilisateur invité par email qui n'a pas encore de compte → le lien d'invitation redirige vers signup avec le token préservé ; après création de compte, acceptation automatique proposée.
- Invitation expirée (`expires_at` dépassé) → page d'acceptation affiche une erreur explicite avec possibilité (pour un admin) de renvoyer une invitation.

## Failure scenarios

- Échec d'envoi de l'email d'invitation (SMTP applicatif indisponible) → l'invitation est tout de même créée en base (le token existe), l'admin peut copier/partager le lien manuellement depuis l'UI ; l'échec d'envoi est loggé mais ne bloque pas la création.
- Deux admins invitent simultanément le même email avec des rôles différents → contrainte `UNIQUE` applicative (vérifiée en transaction) sur les invitations actives par (organization, email) ; la seconde tentative met à jour l'invitation existante plutôt que d'échouer bêtement.

## Idempotency considerations

- Acceptation d'une invitation déjà acceptée (double clic, lien rouvert) → `accept()` est idempotent : si `organization_memberships` existe déjà pour (organization, user), retourne succès sans dupliquer.
- Suppression d'une organisation déjà supprimée (double soumission) → 404 propre, pas d'erreur 500.

## Performance considerations

Volumes attendus faibles (nombre d'organisations/membres par utilisateur, dizaines tout au plus) — aucune préoccupation de performance particulière. Index `UNIQUE (organization_id, user_id)` sur `organization_memberships` suffit pour toutes les requêtes de résolution de contexte (exécutées à chaque requête HTTP via le middleware, donc doivent rester sub-milliseconde : un seul `SELECT` indexé).

## Security considerations

- 404 (pas 403) pour un non-membre qui tente d'accéder à une organisation — évite de confirmer l'existence d'un `organizationId`.
- Token d'invitation : aléatoire (32 bytes, encodé base64url), jamais dérivé de données prévisibles (email, id).
- Un membre retiré doit perdre l'accès **immédiatement** à la requête suivante (pas de cache de session obsolète — le rôle est relu à chaque requête via `organization_context_middleware`, jamais mis en session de façon durable au-delà de l'`organizationId` actif).
- Voir `19-security.md` pour l'isolation transverse.

## Testing strategy

- Unit : `OrganizationMembershipService` (invite/accept/changeRole/remove), en particulier les règles "dernier owner", "invitation déjà acceptée".
- Functional : parcours complet création → invitation → acceptation (avec et sans compte préexistant) ; vérification 404 pour un non-membre sur toutes les routes `/organizations/:id/*`.
- Authorization : matrice de permissions ci-dessus testée exhaustivement (chaque rôle × chaque action).

## Implementation steps

1. `node ace make:migration create_organizations_table` — colonnes selon `02-database-design.md`.
2. `node ace make:migration create_organization_memberships_table`.
3. `node ace make:migration create_organization_invitations_table`.
4. `node ace migration:run` (régénère `database/schema.ts`).
5. Créer les modèles `Organization`, `OrganizationMembership`, `OrganizationInvitation` (`app/models/`), composant sur les schémas générés comme `User`/`UserSchema`.
6. Ajouter les scopes nommés (`forUser`, `withRoleAtLeast`).
7. Créer `app/validators/organization.ts`.
8. Créer `app/policies/organization_policy.ts` (nécessite `@adonisjs/bouncer` — voir `19-security.md` pour l'installation, à faire une seule fois lors de cette étape si pas déjà fait par une feature précédente de la roadmap).
9. Créer `app/middleware/organization_context_middleware.ts`, l'enregistrer comme middleware nommé dans `start/kernel.ts` (`middleware.organization()`).
10. Créer `app/services/organizations/organization_service.ts` et `organization_membership_service.ts`.
11. Créer les events (`app/events/organization_*.ts`) et le listener d'envoi d'email (`app/mails/organization_invitation_mail.ts`, `app/listeners/send_organization_invitation_email.ts`), les enregistrer dans `start/events.ts` (à créer si absent).
12. Créer les transformers.
13. Créer les controllers (`app/controllers/organizations/*`) et les routes dans `start/routes.ts` (nouveau groupe, sous `middleware.auth()`).
14. Modifier `InertiaMiddleware.share()` pour exposer `organizations`/`currentOrganization` à toutes les pages (données minimales, voir `19-security.md`).
15. Créer les pages Inertia (`inertia/pages/organizations/*`, `inertia/pages/invitations/show.vue`) et le composant `organization-switcher.vue`, l'intégrer dans `inertia/layouts/default.vue`.
16. Modifier `NewAccountController.store` pour créer l'organisation par défaut à l'inscription (transaction avec la création de l'utilisateur).
17. Écrire les tests (unit, functional, authorization) listés ci-dessus.

## Dependencies

- `@adonisjs/bouncer` (à installer si non déjà présent — première feature qui en a besoin, cf. `19-security.md`).
- Mécanisme d'envoi d'email applicatif (AdonisJS Mail — non encore configuré dans le projet ; à installer/configurer ici ou en amont si une autre feature en a besoin avant, sinon settle ici).

## Open questions

- Faut-il un accès restreint par projet (un membre `member` de l'organisation mais sans accès à certains projets) ? Non retenu en v1 (tous les membres de l'organisation voient tous ses projets, filtré par rôle). Si nécessaire plus tard : table `project_memberships` en complément, avec un rôle projet qui ne peut pas *élargir* le rôle organisation, seulement le restreindre.
- Faut-il des rôles personnalisés (au-delà de owner/admin/member/viewer) ? Non retenu en v1 ; la conception (rôle = valeur d'enum sur `organization_memberships`) permettrait de migrer vers un système de permissions à la carte (table `permissions` + `role_permissions`) sans changer la forme des autres tables, si le besoin apparaît.
