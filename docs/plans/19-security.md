# 19 — Security

## Objective

Consolider en un seul endroit les politiques de sécurité transverses déjà évoquées ponctuellement dans les plans de feature (isolation, autorisation, chiffrement, XSS, CSRF, rate limiting, tokens publics) — ce plan est la référence normative, les autres plans y renvoient plutôt que de dupliquer les règles.

## Functional requirements

- Isolation stricte organisation/projet sur toute donnée métier.
- Autorisation basée sur des rôles (Bouncer), vérifiée à chaque requête, jamais seulement côté frontend.
- Validation systématique des inputs (VineJS, déjà en place dans le projet — voir `app/validators/user.ts` existant comme référence de convention).
- Credentials SMTP chiffrés au repos, jamais exposés.
- Prévention XSS dans les templates email.
- Prévention des injections SQL (query builder Lucid uniquement, jamais de SQL brut interpolé).
- CSRF : protection standard AdonisJS Shield pour les routes authentifiées, exemptions explicites documentées pour les routes publiques (tracking, unsubscribe, webhooks).
- Rate limiting sur les endpoints publics non authentifiés.
- Tokens publics (unsubscribe, invitation, tracking) non-devinables, jamais dérivés d'un ID interne brut.
- Architecture prête pour des webhooks entrants futurs (signature vérifiable), sans les implémenter tous en v1.

## Isolation organisation/projet

**Principe** : l'organisation/le projet actifs en session sont une **convenience de navigation**, jamais la source d'autorité de sécurité (rappelé dans `03-organizations.md` et `04-projects.md`). Chaque requête qui agit sur une ressource scoped-projet revérifie l'appartenance via les paramètres d'URL, à travers deux middlewares empilés :

```text
organization_context_middleware  -- résout ctx.organization à partir de :organizationId, vérifie
                                     que l'utilisateur a un organization_memberships pour cette
                                     organisation (404 sinon, jamais 403)
project_context_middleware       -- résout ctx.project à partir de :projectId, vérifie que
                                     project.organization_id == ctx.organization.id (404 sinon)
```

**Règle de service** : tout service de domaine (`ContactService`, `SegmentService`, ...) qui reçoit un `project` en paramètre doit l'utiliser pour **scoper** toute requête (`Model.query().forProject(project)` — scope nommé systématique, déjà présent dans chaque plan de domaine). Un service ne doit **jamais** exposer de méthode qui accepte un ID nu sans le `project` associé (ex. `ContactService.find(contactId)` est une signature interdite ; `ContactService.find(project, contactId)` est la signature correcte) — convention à faire respecter en revue de code plutôt que par un mécanisme automatique, faute d'un moyen simple de l'imposer statiquement en TypeScript sans alourdir considérablement chaque signature.

**Donnée partagée globalement (`InertiaMiddleware.share()`)** : minimale par construction — uniquement `{ id, name, slug, role }` par organisation/projet accessible à l'utilisateur (jamais l'ensemble des données d'une organisation/projet non actif), cohérent avec le principe déjà en place dans `app/middleware/inertia_middleware.ts` (qui ne partage aujourd'hui que `UserTransformer.transform(auth.user)`, jamais `password`).

## Autorisation — Bouncer

**Décision** : utiliser `@adonisjs/bouncer` (policies + abilities) plutôt qu'un système de permissions maison. Justification : les alias de subpath imports `#policies/*` et `#abilities/*` sont **déjà réservés** dans `package.json` (héritage du starter kit AdonisJS auth, cf. `imports` existant) — signal fort que Bouncer est l'outil anticipé par la structure du projet, sans qu'il ait encore été installé/utilisé.

```text
app/policies/
  organization_policy.ts   (voir/éditer/supprimer une organisation, gérer les membres)
  project_policy.ts        (dérive du rôle d'organisation, voir 04-projects.md)
  contact_policy.ts, segment_policy.ts, smtp_connector_policy.ts, email_policy.ts, campaign_policy.ts
    (toutes suivent la même matrice standard ci-dessous, sauf mention contraire dans leur plan)
app/abilities/
  manage_organization_members.ts   (ability transverse réutilisée par plusieurs policies)
```

**Matrice de permissions standard "projet"** (référence unique, chaque plan de domaine y renvoie sauf exception documentée dans ce plan-là) :

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| Consulter (lecture) | ✅ | ✅ | ✅ | ✅ |
| Créer / éditer / supprimer une donnée métier (contact, segment, template, email, campagne) | ✅ | ✅ | ✅ | ❌ |
| Gérer les connecteurs SMTP | ✅ | ✅ | ❌ | ❌ |
| Éditer les settings du projet | ✅ | ✅ | ❌ | ❌ |
| Supprimer le projet | ✅ | ✅ | ❌ | ❌ |

Exceptions déjà documentées dans leur plan respectif : gestion des membres/organisation (`03-organizations.md`), réabonnement manuel restreint à owner/admin (`17-unsubscribe.md`).

**Vérification côté controller** : chaque action de controller appelle `await bouncer.with(XPolicy).authorize('action', resource)` (pattern standard Bouncer) — jamais une vérification de rôle ad hoc réimplémentée par controller. Le frontend peut masquer des actions non autorisées pour l'ergonomie (ex. bouton "Supprimer" caché pour un `viewer`), mais ceci est un **complément**, jamais un substitut à la vérification serveur.

## Validation des inputs

Convention déjà en place dans le projet (`app/validators/user.ts`) : chaque controller d'écriture appelle `request.validateUsing(xValidator)` avant tout traitement, jamais un accès direct à `request.body()`/`request.all()` pour construire un modèle. Chaque plan de domaine définit son `app/validators/x.ts` — pas de règle nouvelle ici au-delà de la confirmation que cette convention s'applique uniformément à tous les nouveaux domaines.

## SMTP credentials

Voir `07-smtp-connectors.md` § Security considerations pour le détail complet (chiffrement AES-256-GCM via `@adonisjs/core/services/encryption`/`APP_KEY`, jamais exposé en sortie de transformer, formulaire write-only). Politique complémentaire transverse : `APP_KEY` (déjà une variable d'environnement du projet, `config/encryption.ts` existant) doit être **différent** entre les environnements (dev/staging/prod) et jamais committé — déjà couvert par `.env`/`.gitignore` standard AdonisJS, rappelé ici comme prérequis explicite pour que le chiffrement SMTP ait un sens.

## XSS dans les templates HTML

Voir `08-email-templates.md`/`09-emails.md` § Security considerations pour le détail. Règle transverse : **toute** valeur dynamique injectée dans un contenu HTML destiné à être envoyé par email (variables de contact, futur contenu personnalisé) doit passer par le `VariableRenderer` qui échappe systématiquement — jamais une concaténation de chaîne manuelle ailleurs dans le code qui contournerait ce point de passage unique.

## Injections SQL

Toutes les requêtes passent par le query builder Lucid (bindings paramétrés) — en particulier `06-segments.md` (`SegmentEvaluator`) qui construit dynamiquement des requêtes à partir d'un input utilisateur (`definition` JSON) est le point du système le plus exposé structurellement à ce risque, et documente explicitement (dans son propre plan) l'absence de toute concaténation SQL brute. Règle transverse : `db.rawQuery()`/`.whereRaw()` avec une valeur utilisateur interpolée directement dans la chaîne est **interdit** dans tout le codebase (bindings paramétrés `?` obligatoires si `whereRaw` est réellement nécessaire pour une expression que le query builder ne couvre pas nativement).

## CSRF et protections Inertia

`@adonisjs/shield` est déjà actif globalement (`start/kernel.ts`, `router.use([... shield_middleware ...])`) — aucune action requise pour les routes authentifiées standard (Inertia gère nativement le token CSRF sur les requêtes `POST`/`PATCH`/`DELETE`). **Exemptions explicites nécessaires** pour les routes publiques suivantes, qui ne peuvent par nature pas porter de token CSRF de session :

```text
GET  /track/open/:deliveryToken.gif    (16-email-tracking.md)
GET  /track/click/:deliveryToken        (16-email-tracking.md)
POST /webhooks/smtp/:connectorId        (16-email-tracking.md)
GET  /unsubscribe/:token                (17-unsubscribe.md — action déclenchée par GET, volontairement,
                                          car c'est un clic de lien email, pas un formulaire soumis)
```

Ces exemptions sont configurées via l'option d'exclusion de `config/shield.ts` (mécanisme standard AdonisJS Shield pour exclure des routes du CSRF) — **jamais** en désactivant Shield globalement. Chacune de ces routes compense l'absence de CSRF par son propre mécanisme (token opaque non-devinable, signature de webhook) déjà documenté dans son plan respectif.

## Rate limiting

**Décision** : rate limiting appliqué aux endpoints **publics non authentifiés** (les endpoints authentifiés sont protégés par ailleurs — session, autorisation, et un attaquant authentifié est déjà identifiable/bannissable au niveau compte) :

```text
/unsubscribe/:token         limite par IP (ex. 20 req/min) — protège contre l'énumération de tokens
/track/open/:token.gif      limite plus permissive par IP (ex. 200 req/min — un client email peut
                              précharger, et de nombreux destinataires différents partagent parfois
                              une même IP sortante de passerelle mail)
/track/click/:token         limite par IP (ex. 60 req/min)
/webhooks/smtp/:connectorId limite par IP source du provider si connue, sinon un plafond généreux
                              (ex. 1000 req/min — un provider peut envoyer des rafales de notifications)
/login, /signup              limite par IP (ex. 10 req/min) — déjà des routes existantes du starter,
                              non actuellement rate-limitées ; ajout recommandé à l'implémentation
                              de ce plan même si hors du scope fonctionnel nouveau
```

Implémentation recommandée : `@adonisjs/limiter` (package officiel AdonisJS, cohérent avec l'écosystème déjà utilisé par le projet — non installé actuellement, à ajouter lors de l'implémentation de ce plan).

## Endpoints de tracking

Voir `16-email-tracking.md` § Security considerations pour le détail complet (token HMAC non-devinable, validation de schéma d'URL avant redirection, rejet silencieux plutôt qu'erreur bruyante pour ne pas désactiver l'intégration provider). Rappel transverse : ces endpoints ne doivent **jamais** effectuer d'écriture SQL synchrone dans le cycle de requête (toujours enqueue + traitement asynchrone, cf. `14-jobs-and-queues.md`) — à la fois pour la performance et pour limiter la surface d'un endpoint public qui écrit directement en base sur simple réception d'une requête non authentifiée.

## Unsubscribe tokens

Voir `17-unsubscribe.md` § Security considerations (token CSPRNG 32 bytes, jamais dérivé de l'ID contact).

## Webhooks futurs

`init.md` évoque des "webhooks futurs" (trigger de campagne, intégrations) hors scope d'implémentation v1 (cf. `12-campaign-engine.md` § Open questions, nodes `trigger`). Politique anticipée pour quand ils seront implémentés : tout webhook **entrant** (reçu par l'application) doit vérifier une signature HMAC avec un secret par intégration (jamais un webhook accepté sans authentification, à la différence des webhooks SMTP sortants documentés en `16-email-tracking.md` où l'absence de signature du provider est un risque accepté et documenté au cas par cas) ; tout webhook **sortant** (futur, si l'app notifie des systèmes tiers) devrait signer ses propres payloads de la même façon pour permettre au destinataire de les vérifier.

## Edge cases

- Un utilisateur retiré d'une organisation en cours de session (autre onglet ouvert) → la requête suivante échoue en 404 sur `organization_context_middleware` (le rôle est toujours revérifié en base à chaque requête, jamais mis en cache de session au-delà de l'ID actif) — cf. `03-organizations.md` § Security considerations.
- Un token public (unsubscribe/tracking) partagé/republié publiquement par erreur (ex. capture d'écran d'un email avec le lien visible) → risque résiduel accepté et documenté (un token de désabonnement ne donne accès à rien d'autre que désabonner ce contact précis ; un token de tracking ne permet que d'enregistrer de faux événements d'engagement, pas d'accéder à des données).

## Failure scenarios

Sans objet en tant que tel (ce plan est une politique transverse, pas un domaine avec ses propres flux d'exécution) — les scénarios de défaillance sont couverts dans les plans de domaine respectifs qui appliquent cette politique.

## Idempotency considerations

Sans objet directement (couvert par `15-retry-and-idempotency.md`).

## Performance considerations

Le rate limiting (Redis-backed, cohérent avec l'infrastructure déjà retenue pour BullMQ, cf. `14-jobs-and-queues.md`) ajoute une opération Redis par requête publique — négligeable comparé au reste du traitement.

## Security considerations

Ce document **est** la section sécurité transverse ; il n'a pas de sous-section supplémentaire.

## Testing strategy

- Authorization : chaque policy testée exhaustivement contre la matrice de permissions (déjà listé dans chaque plan de domaine — ce plan sert de référence pour éviter les incohérences entre plans, cf. `22-development-roadmap.md` § Vérification finale).
- Security : suite de tests dédiée par endpoint public (token invalide, rate limit dépassé, CSRF correctement exempté mais pas globalement désactivé — test explicite qu'une route authentifiée standard **continue** d'exiger un token CSRF valide, pour détecter une régression si l'exemption est mal scopée).
- Injection : test explicite que `SegmentEvaluator` (`06-segments.md`) rejette/échappe correctement une valeur de condition contenant une tentative d'injection SQL classique (ex. `' OR '1'='1`) sans jamais l'interpréter comme du SQL.

## Implementation steps

1. `npm install @adonisjs/bouncer` (si pas déjà fait par `03-organizations.md`, première feature qui en a besoin).
2. `npm install @adonisjs/limiter`.
3. Configurer `config/limiter.ts` (nouveau fichier) avec les seuils listés ci-dessus par route/groupe de routes.
4. Configurer les exemptions CSRF dans `config/shield.ts` pour les routes publiques listées.
5. Documenter (revue de code / CONTRIBUTING, hors `docs/plans/`) la convention "service scope toujours par project" comme règle de revue.
6. Écrire les tests transverses listés ci-dessus, en plus des tests d'autorisation déjà spécifiés dans chaque plan de domaine.

## Dependencies

Ce plan est transverse — dépend structurellement de tous les plans de domaine pour son application concrète, mais son infrastructure (`@adonisjs/bouncer`, `@adonisjs/limiter`, `config/shield.ts`) doit être en place dès `03-organizations.md` (première feature nécessitant Bouncer).

## Open questions

- Faut-il un audit de sécurité externe avant une mise en production réelle (au-delà de la revue de code interne) ? Hors scope de ces plans de documentation, mais recommandé avant tout déploiement traitant des données de contacts réelles à grande échelle.
- Politique de rétention des données (RGPD — droit à l'effacement au-delà du soft delete documenté en `05-contacts.md`) : le soft delete actuel garde les données indéfiniment pour l'audit ; une purge définitive après un délai configurable serait nécessaire pour une conformité RGPD complète — non détaillée dans ces plans, à traiter comme un chantier dédié si prioritisé.
