# Audit de sécurité — Basalt / meutic.julien-dacosta.dev

- **Date** : 2026-10-06
- **Périmètre** : revue statique du code (`app/`, `config/`, `start/`) + vérifications non destructives en production (`https://meutic.julien-dacosta.dev`)
- **Branche auditée** : `develop` @ `07bccd4`
- **Méthode** : lecture du code source (auth, multi-tenant, endpoints publics, SMTP, tracking, validation) ; en prod, uniquement inspection d'en-têtes HTTP et un test d'open-redirect avec cible bénigne (`example.com`). **Aucune** tentative de brute-force, d'exfiltration ou d'action destructive n'a été menée.

> La base est **globalement bien sécurisée** : l'isolation multi-tenant des ressources imbriquées (contacts, emails, campagnes, SMTP, clés API, segments, tags, custom fields, versions/nodes de campagne, membres, invitations) est correcte partout (scoping systématique + 404). **Une seule exception, une vraie fuite inter-tenant** : l'écran « jobs échoués » (#10, ci-dessous), ajouté lors de la vérification d'isolation demandée.

---

## Synthèse

| # | Vulnérabilité | Sévérité | Confirmé | Statut |
|---|---------------|----------|----------|--------|
| 10 | **Fuite inter-tenant** : l'écran « jobs échoués » liste et relance les jobs de **tous** les tenants | **Élevé** | Code | ✅ corrigé |
| 1 | Aucun rate-limiting sur l'authentification (login/signup) | **Élevé** | Code | ✅ corrigé |
| 2 | SSRF via le test de connexion SMTP | **Moyen→Élevé** | Code | ✅ corrigé |
| 3 | Open redirect sur `/track/click` (indépendant de la validité du token) | **Moyen** | **Prod** | ✅ corrigé |
| 4 | Endpoints publics non limités → flooding de la file de jobs (DoS) | **Moyen** | Code | ⚠️ partiel (webhook + unsubscribe ; `/track/*` volontairement libre) |
| 5 | Webhook SMTP sans vérification de signature | **Faible→Moyen** | Code (déjà noté) | ✅ corrigé |
| 6 | Désinscription déclenchée en `GET` (prefetch / scanners) | **Faible→Moyen** | Code | ✅ corrigé |
| 7 | Content-Security-Policy désactivée | **Faible** | **Prod** | ⏸ non retenu |
| 8 | Politique de mot de passe faible (max 32, pas de complexité) | **Faible/Info** | Code | ⏸ non retenu |
| 9 | En-têtes `Referrer-Policy` / `Permissions-Policy` absents | **Info** | **Prod** | ⏸ non retenu |

> **Légende** : ✅ corrigé · ⚠️ partiellement traité · ⏸ non retenu (décision du 2026-10-07 de ne pas traiter #7, #8 et #9 ; risque accepté).

---

## 10. Fuite inter-tenant via l'écran « jobs échoués » — **Élevé**

**Fichiers** : `app/controllers/jobs/failed_jobs_controller.ts`, `app/services/jobs/failed_jobs_service.ts`, `app/policies/observability_policy.ts`, routes `/organizations/:organizationId/projects/:projectId/settings/jobs*`.

C'est **le** point qui répond à la question « un utilisateur peut-il accéder aux ressources d'un autre utilisateur / d'une autre organisation ». Partout ailleurs, le chargement d'une ressource par id est scopé au projet courant (`.withScopes((s) => s.forProject(project)).where('id', params.x)`) et renvoie 404 sinon — pas d'IDOR. **Sauf ici.**

La file BullMQ est **globale**, partagée par tous les projets/organisations. Or :

```ts
// FailedJobsService.list() — aucun filtre par tenant
const jobs = await queue.getFailed()   // TOUS les jobs échoués, tous tenants confondus
return jobs.map((job) => ({ ..., failedReason: job.failedReason, data: job.data }))
```

```ts
// retry() — relance n'importe quel jobId global
const job = await queue.getJob(jobId)
await job.retry()
```

La `ObservabilityPolicy` ne vérifie que « l'utilisateur est admin **de sa propre** organisation » (`roleAtLeast(role, 'admin')` sur `project.organizationId`), pas que le job appartient à cette organisation.

**Chaîne d'exploitation (entièrement atteignable par n'importe quel inscrit)** :
1. Je m'inscris → je deviens **`owner`** de mon organisation (`organization_service.create`, rôle `owner` = rang 3 ≥ `admin`).
2. Je crée un projet (tout membre peut).
3. Je vais sur `…/settings/jobs` → `viewFailedJobs` passe (je suis owner), et je vois **les jobs échoués de tous les autres tenants** : `failedReason` (messages d'erreur SMTP pouvant contenir des adresses destinataires / réponses serveur) et `data` (ids de campagnes/contacts/livraisons d'autres organisations).
4. Je peux **relancer** (`retry`) le job d'un autre tenant → effet de bord cross-tenant (ré-envoi d'un email d'une autre organisation, recalcul de segment, etc.).

**Impact** : divulgation inter-tenant (payloads + raisons d'échec d'autres organisations) **et** action inter-tenant (relance). Sur l'app hébergée multi-tenant, c'est une rupture d'isolation réelle, déclenchable par simple auto-inscription.

**Remédiation** (au choix, à trancher) :
- **(a) Scoper par projet** : embarquer `projectId` dans le payload de chaque job au dispatch, puis filtrer `list()`/`retry()` sur `ctx.project.id` (rejeter un `jobId` dont le `projectId` ne correspond pas). Le plus correct, mais touche tous les points de dispatch + les jobs déjà en file (sans `projectId`) à traiter comme non affichables.
- **(b) Réserver l'écran à un opérateur d'instance** : allowlist d'emails/ids via env (pas de notion de super-admin aujourd'hui) — simple, adapté si l'observabilité est pensée pour l'exploitant, pas pour les admins de tenant.
- **Court terme** : si l'écran n'est pas indispensable en prod multi-tenant, le désactiver (ou le restreindre à `(b)`) en attendant `(a)`.

> **✅ Corrigé (option a)** — `FailedJobsService.list()`/`retry()` prennent désormais `projectId` et ne renvoient/relancent que les jobs de ce projet. Plutôt que de muter le payload à chaque dispatch (les endpoints publics `/track/*` sont volontairement sans accès DB, et les jobs déjà en file n'auraient pas le champ), le projet propriétaire est **résolu depuis les ids du payload** (`deliveryId`→livraison, `segmentId`→segment, `campaignId`→campagne, `executionId`→enrollment), en requêtes `whereIn` groupées (quelques requêtes quel que soit le nombre de jobs). Un job qui ne se résout pas au projet courant (autre tenant, ou job d'instance comme `statistics.aggregate_daily`) est **invisible et non relançable** — un `retry` cross-tenant est traité comme « job introuvable », sans révéler son existence. Couvert par `tests/unit/jobs/failed_jobs_service.spec.ts` (isolation `list`/`retry` entre deux projets). Fichiers : `app/services/jobs/failed_jobs_service.ts`, `app/controllers/jobs/failed_jobs_controller.ts`.

---

## 1. Aucun rate-limiting sur l'authentification — **Élevé**

**Fichiers** : `start/limiter.ts:14`, `start/routes.ts:49-52` (groupe login/signup `middleware.guest()`).

Le limiteur global est défini mais **jamais appliqué** :

```ts
// start/limiter.ts
export const throttle = limiter.define('global', () => {
  return limiter.allowRequests(10).every('1 minute')
})
```

`grep` confirme que `throttle` n'est utilisé sur aucune route. Seul `/api/v1/*` est protégé (`apiThrottle`, `start/routes.ts:597`). Les routes `POST /login` et `POST /signup` n'ont **aucune** limite.

**Impact** : brute-force / credential-stuffing illimité sur `/login`, et création de comptes / énumération en masse sur `/signup` (le validateur `unique` sur l'email révèle les emails déjà enregistrés). scrypt (`config/hash.ts`, cost 16384) ralentit l'attaque hors-ligne mais ne protège pas l'endpoint en ligne.

**Remédiation** : appliquer un throttle par IP (+ par email) sur les routes d'auth, par ex. `.use(throttle)` sur le groupe guest, idéalement un limiteur dédié plus strict (5–10 essais / 15 min, avec blocage progressif). Penser aussi à limiter `/invitations/:token/accept` et `/unsubscribe/:token`.

---

## 2. SSRF via le test de connexion SMTP — **Moyen→Élevé**

**Fichiers** : `app/controllers/smtp_connectors/smtp_connector_tests_controller.ts:20-26`, `app/services/smtp/smtp_connection_tester.ts`.

L'action `test` prend `host`/`port` directement du formulaire et ouvre une connexion réseau côté serveur, puis **retourne le message d'erreur au client** :

```ts
const payload = await request.validateUsing(testSmtpConnectionValidator)
const result = await smtpConnectionTester.test(payload)   // connecte host:port fourni
return response.json(result)                               // { success, message: error.message }
```

**Impact** : un utilisateur authentifié (toute personne autorisée à créer un connecteur dans un projet) peut faire se connecter le serveur à des adresses internes — `127.0.0.1`, `169.254.169.254` (métadonnées cloud), Redis/MariaDB internes, autres services du réseau privé. Le couple **message d'erreur + timeout de 8 s** permet de distinguer port ouvert / fermé / filtré → scan de ports interne semi-aveugle. Sur une appli hébergée multi-tenant, c'est un pivot réseau depuis n'importe quel locataire.

**Remédiation** : avant de tester, résoudre le `host` en IP et **rejeter** les plages privées/loopback/link-local (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, fc00::/7) ; refaire la vérification après résolution DNS (anti-DNS-rebinding) ; ne pas renvoyer le message d'erreur brut au client (un booléen + message générique suffit).

---

## 3. Open redirect sur `/track/click` — **Moyen** (confirmé en prod)

**Fichier** : `app/controllers/tracking/tracking_controller.ts:49-75`.

Le redirect est effectué **dès qu'une cible `u` http(s) valide est présente, que le token soit valide ou non** :

```ts
const deliveryId = deliveryTokenService.decode(params.deliveryToken) // peut être null
const targetUrl = this.#validRedirectTarget(rawUrl)
...
if (targetUrl) return response.redirect().withQs(false).toPath(targetUrl)
```

**Preuve (prod, non destructif)** :
```
GET /track/click/invalidtoken?u=https%3A%2F%2Fexample.com%2F
→ HTTP/2 302, location: https://example.com/
```

Le domaine de confiance redirige vers une URL arbitraire sans aucun token valide. `javascript:`/`data:` sont bien bloqués (seuls `http`/`https` passent), donc pas de XSS — mais c'est un **open redirect** exploitable en phishing (le lien part du domaine légitime de l'app/emailing, ce qui est particulièrement crédible pour cette cible).

**Remédiation** : n'effectuer le redirect que si `deliveryId !== null` (token valide) ; mieux, **signer la cible** dans le token de clic (HMAC sur `u`) pour qu'on ne puisse pas substituer `u`. Au minimum, ne rediriger que vers des URLs effectivement présentes dans le contenu de l'email associé à la livraison.

---

## 4. Endpoints publics non limités → flooding de la file de jobs — **Moyen**

**Fichiers** : `start/routes.ts:28-41` (`/track/open`, `/track/click`, `/webhooks/smtp/:connectorId`), chacun appelle `queueDispatcher.dispatch('tracking', ...)`.

Ces routes publiques, non authentifiées et sans rate-limit, poussent un job BullMQ à chaque requête. `/webhooks/smtp/:connectorId` renvoie toujours `200` et traite un payload arbitraire.

**Impact** : un attaquant peut inonder la file Redis/BullMQ (épuisement mémoire/CPU, retard de traitement des vrais événements) sans authentification. Le webhook, n'ayant pas de signature (cf. #5), accepte en plus n'importe quel corps.

**⚠️ Partiel** : `POST /webhooks/smtp/*` (`webhookThrottle`, 120 req/min/IP) et `POST /unsubscribe/:token` sont limités. `/track/*` reste **volontairement** non limité (les ouvertures légitimes transitent par des IP de proxys partagés type Gmail ; un plafond par IP perdrait de vrais événements). Le webhook ne dispatche désormais un job que pour une livraison connue du projet du connecteur (cf. #5). La taille du payload n'est pas bornée explicitement.

**Remédiation** : appliquer un throttle par IP sur `/track/*` et `/webhooks/smtp/*` ; borner la taille du payload webhook ; éventuellement ne dispatcher un job que si le token/`providerMessageId` correspond à une livraison connue (déplacer la résolution en amont du dispatch pour `/track/*` comme déjà fait pour le webhook).

---

## 5. Webhook SMTP sans vérification de signature — **Faible→Moyen**

**Fichier** : `app/controllers/tracking/smtp_webhooks_controller.ts` (déjà documenté comme gap assumé dans le code).

N'importe qui peut `POST /webhooks/smtp/:connectorId` avec un `providerMessageId` connu/deviné pour forger des événements `opened`/`clicked`/`bounced`/`delivered`.

**Impact** : pollution/falsification des statistiques de campagne et de l'état de délivrabilité des contacts (un contact peut être marqué « bounce » à tort → exclusion des envois). Pas d'impact confidentialité, mais intégrité des données.

**Remédiation** : ajouter une colonne secret de signature par connecteur et vérifier la signature HMAC du provider ; en attendant, au minimum un secret partagé dans l'URL/segment `:connectorId` non devinable.

**✅ Corrigé (variante « secret dans l'URL »)** : nouvelle colonne `smtp_connectors.webhook_secret` (32 octets aléatoires, générée à la création par un hook du modèle, backfill des connecteurs existants par la migration). La route est désormais `POST /webhooks/smtp/:connectorId/:secret` : connecteur inconnu ou secret faux → **404** (comparaison constant-time) ; les événements ne sont appliqués qu'aux livraisons **du projet du connecteur**. L'URL complète est affichée sur l'écran d'édition du connecteur (réservé aux admins/owners ; le secret n'est pas dans le transformer). **À faire côté exploitation** : mettre à jour l'URL du webhook chez le fournisseur (l'ancienne `/webhooks/smtp/:id` n'existe plus). **Rotation** : bouton « Regenerate secret » sur l'écran d'édition (`POST …/settings/smtp/:connectorId/webhook-secret`, admin/owner, audité via `smtp_connector.updated`) ; l'ancienne URL cesse de fonctionner immédiatement. **Limite** : une vraie vérification de signature HMAC par fournisseur reste un chantier à part.

---

## 6. Désinscription déclenchée en `GET` — **Faible→Moyen**

**Fichiers** : `start/routes.ts:46`, `app/controllers/unsubscribe_controller.ts:26-39`.

`GET /unsubscribe/:token` **modifie l'état** (marque le token `usedAt` et désinscrit le contact immédiatement).

**Impact** : les scanners de liens antivirus/entreprise (Outlook SafeLinks, proxies Gmail, etc.) et le prefetch des navigateurs suivent les liens `GET` → désinscriptions involontaires de contacts. C'est aussi non conforme au one-click `List-Unsubscribe-Post` (RFC 8058), qui attend un `POST`.

**Remédiation** : page de confirmation en `GET` + action réelle en `POST` (bouton), et exposer l'en-tête `List-Unsubscribe-Post: List-Unsubscribe=One-Click` avec un endpoint `POST` dédié (à exempter de CSRF explicitement).

**✅ Corrigé** : `GET /unsubscribe/:token` n'affiche plus qu'une page de confirmation (lookup `peek()` en lecture seule, `usedAt` non touché) ; la désinscription est `POST /unsubscribe/:token` (bouton, CSRF actif, throttle). **Reste** : l'en-tête `List-Unsubscribe` / `List-Unsubscribe-Post` (RFC 8058) n'est pas émis par l'application aujourd'hui ; s'il est ajouté, le `POST` devra être exempté de CSRF dans `config/shield.ts`.

---

## 7. Content-Security-Policy désactivée — **Faible** (confirmé en prod)

**Fichier** : `config/shield.ts` (`csp.enabled: false`). En prod, aucun en-tête `Content-Security-Policy` n'est renvoyé.

**Impact** : perte de défense en profondeur. Si une XSS apparaît un jour (contenu d'email, champs contact, noms de projet/orga rendus côté SPA), rien ne la contient. À noter : pas de `v-html` trouvé côté Inertia et le `variable_renderer` échappe bien le HTML — le risque XSS actuel est faible, mais la CSP reste un filet recommandé.

**Remédiation** : activer une CSP (au moins `default-src 'self'`, `frame-ancestors 'none'`, ajustée pour Vite/Inertia). Ajouter aussi `Referrer-Policy` et `Permissions-Policy` (cf. #9).

---

## 8. Politique de mot de passe faible — **Faible/Info**

**Fichier** : `app/validators/user.ts:5` — `minLength(8).maxLength(32)`, aucune règle de complexité, aucun contrôle contre les mots de passe compromis.

**Remédiation** : relever la limite haute (≥64/128, scrypt gère) pour autoriser les passphrases/gestionnaires de mots de passe ; envisager un contrôle de longueur minimale plus élevé ou une liste de mots de passe interdits (HaveIBeenPwned k-anonymity).

---

## 9. En-têtes de sécurité complémentaires absents — **Info** (prod)

En prod on observe bien `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. Manquent : `Referrer-Policy` (ex. `strict-origin-when-cross-origin`) et `Permissions-Policy`. À noter : HSTS en prod = `max-age=15552000` (180 j) **sans `includeSubDomains` ni `preload`** — à compléter si tous les sous-domaines sont en HTTPS.

---

## Ce qui est bien fait ✅

- **Isolation multi-tenant exemplaire** : `organization_context_middleware` / `project_context_middleware` résolvent org/projet côté serveur et renvoient **404 systématique** (jamais 403) pour ne pas divulguer l'existence des ressources. La clé API résout `ctx.project` depuis la clé, jamais depuis l'URL (`api_key_auth_middleware`). Pas d'IDOR apparent.
- **Autorisation RBAC** via policies Bouncer, ops destructives réservées à `admin`/`owner` (`organization_policy`).
- **Tokens** : clés API en SHA-256 derrière index unique, jamais stockées en clair ; `deliveryToken` signé HMAC avec comparaison **constant-time** ; mots de passe SMTP chiffrés (`encryption.encrypt`), champ write-only.
- **Hash scrypt** (memory-hard, cost 16384).
- **CSRF activé** avec exemptions justifiées et bornées (`/api/v1/*` Bearer, webhook externe) ; cookies `HttpOnly` + `Secure` (prod) + `SameSite=Lax`.
- **`variable_renderer`** : pas de moteur de template → pas de SSTI ; échappement HTML systématique sauf `unsubscribe_url` (justifié).
- **Redirect de tracking** : schémas `javascript:`/`data:` rejetés.
- **CORS** prod verrouillé (`origin: []`).
- **Lucid ORM** partout (requêtes paramétrées) → pas de SQLi repérée.
- **Handler d'exceptions** : `debug` off en prod, pas de stack trace exposée.

---

## Priorisation recommandée

1. **#1 rate-limiting auth** — rapide (`.use(throttle)` + limiteur dédié), fort gain.
2. **#2 SSRF SMTP** — bloquer les IP internes + ne pas renvoyer l'erreur brute.
3. **#3 open redirect** — ne rediriger que sur token valide / signer `u`.
4. **#4 throttle endpoints publics**, puis **#6 unsubscribe POST**, **#5 signature webhook**. *(#7 CSP, #8 mot de passe, #9 en-têtes : non retenus.)*

---

## Corrections appliquées (2026-10-06)

| # | Correctif | Fichiers |
|---|-----------|----------|
| 1 | Limiteur `authThrottle` (10 essais / 15 min, par IP) sur `POST /login` et `POST /signup` uniquement (les GET de page restent libres). | `start/limiter.ts`, `start/routes.ts` |
| 2 | Garde anti-SSRF : résolution DNS du host SMTP puis **refus** de toute IP privée / loopback / link-local (dont `169.254.169.254`) avant d'ouvrir le socket ; connexion sur l'IP vérifiée (anti DNS-rebinding), SNI conservé pour la validation TLS ; message générique pour les cibles internes. **Appliqué en production uniquement** : la prod hébergée multi-tenant ne doit jamais laisser un locataire atteindre le réseau interne de l'hôte, mais en dev/test (et sur un déploiement auto-hébergé mono-tenant) le relais SMTP est légitimement en `localhost` / LAN privé (Mailcatcher sur `localhost:1025`), où le garde serait un faux positif. | `app/utils/network.ts` (nouveau), `app/services/smtp/smtp_connection_tester.ts` |
| 3 | `/track/click` ne redirige que si le `deliveryToken` est valide **et** si la signature HMAC `s` lie l'URL `u` au token (`u` trafiqué → signature invalide → 404). Ferme l'open redirect anonyme **et** la substitution de `u` par un détenteur de token. | `delivery_token_service.ts`, `tracking_content_rewriter.ts`, `tracking_controller.ts` |
| 4 | Limiteur `webhookThrottle` (120 req/min par IP) sur `POST /webhooks/smtp/:connectorId/:secret` et sur `POST /unsubscribe/:token`. `/track/*` laissé libre à dessein (opens légitimes via proxies partagés type Gmail). | `start/limiter.ts`, `start/routes.ts` |
| 5 | Secret par connecteur dans l'URL du webhook (`smtp_connectors.webhook_secret`), 404 si faux, événements restreints au projet du connecteur ; affichage de l'URL et **rotation** du secret depuis l'écran d'édition. | migration `add_webhook_secret_to_smtp_connectors_table`, `app/models/smtp_connector.ts`, `smtp_webhooks_controller.ts`, `smtp_connectors_controller.ts`, `smtp_connector_service.ts`, `settings/smtp/edit.vue`, `config/shield.ts` |
| 6 | `GET /unsubscribe/:token` = page de confirmation sans effet de bord ; désinscription par `POST` (CSRF actif). L'en-tête `List-Unsubscribe` n'est pas émis par l'app (hors périmètre). | `unsubscribe_controller.ts`, `unsubscribe_token_service.ts` (`peek`), `unsubscribe/show.vue`, `start/routes.ts` |
| 10 | Écran « jobs échoués » scopé par projet (résolution du projet propriétaire depuis les ids du payload). | `failed_jobs_service.ts`, `failed_jobs_controller.ts` |

**Tests** : ajout de `tests/unit/utils/network.spec.ts` (classificateur d'adresses, IPv4/IPv6/IPv4-mapped/CGNAT/publiques) ; mise à jour de `tests/functional/tracking/tracking.spec.ts` (le test qui assertait l'ancien open redirect valide désormais le 404) ; `LIMITER_STORE=memory` ajouté à `.env.test` pour que les compteurs de throttle ne persistent pas entre runs. Ajout de `smtp_webhook_secret.spec.ts` (rotation, droits), de tests de secret/isolation webhook, et de tests GET-sans-effet / POST-CSRF pour la désinscription. **Suite complète : 389 tests au vert.** `tsc --noEmit` et `eslint` passent.

**#3 désormais totalement fermé (signature HMAC de `u`)** : chaque lien de clic porte un paramètre `s = HMAC(APP_KEY, token + "\n" + url)` apposé par `TrackingContentRewriter`. `/track/click` ne redirige (et n'enregistre le clic) que si `token` valide **ET** `u` http(s) **ET** `s` vérifie la paire — une URL `u` trafiquée invalide la signature. **Sans repli** : les emails déjà envoyés (liens sans `s`) ne redirigent plus — compromis accepté. Fichiers : `app/services/tracking/delivery_token_service.ts` (`signUrl`/`verifyUrl`, comparaison constant-time), `app/services/tracking/tracking_content_rewriter.ts`, `app/controllers/tracking/tracking_controller.ts`. Tests : `tracking.spec.ts` (u trafiqué / signature absente → 404, lien signé valide → 302), `delivery_token_service.spec.ts`, `tracking_content_rewriter.spec.ts`.

**Non traités (décision du 2026-10-07)** : **#7 CSP**, **#8 politique de mot de passe**, **#9 en-têtes complémentaires** — risque accepté, à rouvrir au besoin.

**Points résiduels** : pas de limitation de `/invitations/:token/accept` (évoquée en #1) ; pas d'en-tête `List-Unsubscribe` (#6) ; pas de vérification de signature HMAC propre à chaque fournisseur (#5) ; taille du payload webhook non bornée (#4). **Déploiement** : exécuter la migration `webhook_secret` et reconfigurer l'URL du webhook chez le fournisseur ; les liens de clic des emails déjà envoyés ne redirigent plus (#3).

---

*Rapport généré le 2026-10-06. Vérifications prod limitées à l'inspection d'en-têtes et un test d'open-redirect bénin ; aucune donnée ni service impacté.*
