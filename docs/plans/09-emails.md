# 09 — Emails

## Objective

Permettre de créer des `Email` (contenu prêt à être utilisé dans une campagne), optionnellement à partir d'un `EmailTemplate` ou d'un `EmailLayout` (`08b-email-layouts.md`), avec une gestion explicite du contenu "gelé" au moment où une campagne est publiée — pour qu'une édition ultérieure d'un `Email` n'affecte jamais une campagne déjà active.

## Functional requirements

- CRUD `Email` (`name`, `subject`, `preheader`, `senderName`, `senderEmail`, `replyTo`, `textContent`, et l'un des deux champs mutuellement exclusifs `htmlContent`/`bodyContent` selon `email_layout_id`, voir Domain concepts).
- Création "vierge", "à partir d'un template" (copie ponctuelle du contenu, cf. `08-email-templates.md`), ou "à partir d'un layout" (lien live, cf. `08b-email-layouts.md`) — trois modes mutuellement exclusifs au niveau du formulaire.
- Statut `draft`/`published` — voir Domain concepts pour sa portée exacte (différente du statut de campagne).
- Preview (même mécanisme que les templates, `VariableRenderer` partagé ; composé via `email_layout_composer.ts` si layout-lié).
- Utilisation dans un node `send_email` d'une campagne (référence + gel de contenu à la publication — voir `10-campaigns.md`/`decisions/ADR-004-campaign-versioning.md`).

## User flows

```text
Création : choix "vierge", "depuis un template", ou "depuis un layout"
  → si depuis template : copie htmlContent/textContent/subject du EmailTemplate choisi
    (email_template_id renseigné pour traçabilité, mais aucun lien live ensuite —
    08-email-templates.md § Objective)
  → si depuis layout : bodyContent saisi par l'utilisateur (avec subject, comme "vierge" —
    un EmailLayout n'a pas de subject propre), htmlContent reste null, email_layout_id
    est une référence LIVE (08b-email-layouts.md § Objective)
  → Email créé avec status='draft'
Édition : autorisée librement tant que l'Email n'est référencé par AUCUN node send_email
  d'une campaign_version publiée (voir Domain concepts) — sinon avertissement explicite
  (édition toujours autorisée, mais n'affecte jamais les campagnes déjà publiées, voir Domain concepts)
Publication (status -> 'published') : marque l'email comme "prêt à l'usage" dans le sélecteur
  du Campaign Builder — un email en draft reste sélectionnable pour édition mais l'UI du builder
  avertit avant de publier une version de campagne qui référence un email encore en draft
```

## Domain concepts

**Distinction `Email` vs `EmailTemplate` vs `EmailLayout`** (rappel `init.md`) : un `EmailTemplate` est un point de départ réutilisable (contenu copié ponctuellement), un `EmailLayout` est un cadre de branding HTML partagé en live (`08b-email-layouts.md`), un `Email` est le contenu réellement envoyé par une campagne. Les deux mécanismes sont mutuellement exclusifs au niveau du formulaire de création (voir Open questions de `08b-email-layouts.md`). **Ce plan ne réintroduit pas de duplication conceptuelle avec `08-email-templates.md`/`08b-email-layouts.md`** au-delà de cette distinction déjà actée.

**`htmlContent` vs `bodyContent`** : un `Email` avec `email_layout_id` non nul ne stocke que `bodyContent` (`htmlContent` reste `null`) — son HTML effectif est calculé à la demande par `composeEmailHtml(email, layout)` (`email_layout_composer.ts`, `08b-email-layouts.md` § Domain concepts). Un `Email` "vierge" ou créé depuis un `EmailTemplate` garde `htmlContent` (`bodyContent` reste `null`) — les deux champs sont mutuellement exclusifs selon `email_layout_id`.

**Statut `draft`/`published` d'un Email** : indicateur **informationnel** pour l'UI (aide à distinguer "brouillon en cours d'écriture" de "prêt à envoyer"), **jamais** un verrou technique — même un `Email` `published` reste éditable. Ce n'est **pas** le mécanisme qui protège les campagnes actives : ce mécanisme est le **gel de contenu à la publication de la campaign_version** (voir ci-dessous), qui s'applique indépendamment du statut de l'`Email` au moment considéré. Ne pas confondre les deux, erreur explicitement mise en garde dans `init.md`.

**Gel de contenu (rappel de `decisions/ADR-004-campaign-versioning.md`)** :

```text
Email (mutable, peut être édité à tout moment)
   ↓ référencé par un node "send_email" (campaign_nodes.config.emailId) pendant l'édition du draft
   ↓ à la PUBLICATION de la campaign_version (CampaignBuilderService.publish()) :
       campaign_nodes.config reçoit une COPIE figée :
         { emailId, subject, htmlContent, textContent, senderName, senderEmail, replyTo }
       htmlContent est ici composeEmailHtml(email, email.emailLayout) — pas email.htmlContent
       brut — c'est le moment précis où le cadre de branding "live" d'un layout
       (08b-email-layouts.md § Objective) cesse de l'être POUR CE NODE : il est figé
       avec sa valeur courante
   ↓ le Campaign Engine n'utilise QUE cette copie figée pour composer l'envoi réel,
     jamais une relecture de l'Email (ni du EmailLayout) au moment de l'exécution
```

Ainsi, éditer un `Email` (ou son `EmailLayout` lié) après publication d'une campagne qui le référence est **sans danger** pour les contacts déjà/en cours d'engagement sur cette version publiée — mais **affecte le prochain draft** créé à partir de cette version (le clonage de draft, cf. `decisions/ADR-004-campaign-versioning.md`, clone le `config` figé de la version publiée tel quel ; si l'utilisateur veut que le nouveau draft reflète les changements de l'`Email` depuis la publication, une action explicite "resynchroniser avec l'email source" est nécessaire dans le builder — voir `11-campaign-builder.md`).

## Data model

Voir `02-database-design.md` § Templates / Emails (`emails`). `email_template_id` nullable (`SET NULL`) — traçabilité de "créé à partir de", sans dépendance forte. `email_layout_id` nullable (`SET NULL`) — une vraie référence live pour `htmlContent` (§ Domain concepts, `08b-email-layouts.md`), pas seulement de la traçabilité ; suppression d'un `EmailLayout` référencé : `EmailLayoutService.delete()` (`08b-email-layouts.md` § Services) matérialise `composeEmailHtml(email, layout)` dans `html_content` pour chaque `Email` référençant le layout avant que le `SET NULL` ne se déclenche. `html_content`/`body_content` (`longtext`, nullables) : mutuellement exclusifs selon `email_layout_id`.

## Backend architecture

```text
app/services/emails/
  email_service.ts   (create, createFromTemplate, update, delete, duplicate, publish/unpublish)
  (variable_renderer.ts déjà défini dans 08-email-templates.md, réutilisé tel quel)
app/validators/email.ts
app/transformers/email_transformer.ts
```

## Frontend architecture

```text
inertia/pages/.../emails/
  index.vue    (liste, statut, "utilisé dans N campagnes" — requête de comptage sur campaign_nodes)
  create.vue   (choix vierge/depuis template)
  edit.vue
  preview.vue  (identique au mécanisme de 08-email-templates.md)
```

## Routes

```text
GET    .../emails                    emails.index
GET    .../emails/create               emails.create
POST   .../emails                      emails.store
GET    .../emails/:emailId/edit        emails.edit
PATCH  .../emails/:emailId             emails.update
DELETE .../emails/:emailId             emails.destroy
POST   .../emails/:emailId/duplicate   emails.duplicate
POST   .../emails/:emailId/publish     emails.publish
POST   .../emails/:emailId/preview     emails.preview
```

## Controllers

`EmailsController` (index/create/store/edit/update/destroy/duplicate/publish/preview). Analogue à `EmailTemplatesController`.

## Services

- `EmailService.createFromTemplate(project, template, overrides)` : copie `subject`/`htmlContent`/`textContent` du template, applique les `overrides` fournis par l'utilisateur (ex. `name` différent), `email_template_id = template.id`.
- `EmailService.createFromLayout(project, layout, payload)` : lie `bodyContent = payload.bodyContent` (fourni par l'utilisateur), `htmlContent` reste `null`, `email_layout_id = layout.id` — `subject`/`textContent` fournis directement par l'utilisateur (pas copiés, un layout n'en a pas, `08b-email-layouts.md` § Objective).
- `EmailService.update(email, payload)` / `EmailService.updateFromLayout(email, payload)` : selon que `email.emailLayoutId` est nul ou non, le contrôleur choisit le validateur et la méthode de service correspondants (`htmlContent` vs `bodyContent`) — un `Email` layout-lié n'expose jamais de champ `htmlContent` éditable, seul son `bodyContent`. Un `Email` créé depuis un `EmailTemplate` classique n'a pas ce traitement particulier : une fois créé, il est éditable comme un email vierge (`htmlContent` normal), `email_template_id` n'étant que de la traçabilité.
- `EmailService.duplicate(email)` / `EmailService.translate(email, targetLanguage)` : copient `bodyContent` (et le traduisent, pour `translate`) au lieu de `htmlContent` quand `email.emailLayoutId` est non nul — la copie reste liée au même layout.
- `EmailService.delete(email)` : autorisée même si référencé par un node `send_email` d'une campagne (la copie figée dans `campaign_nodes.config` n'est pas affectée, `emails.email_template_id` équivalent inverse n'existe pas ici — c'est `campaign_nodes.config.emailId` qui devient une référence orpheline non résolvable, géré explicitement par l'UI du builder qui affiche alors "email source supprimé" sans casser l'exécution, puisque le moteur ne relit jamais l'`Email` en runtime).

## Models

`Email` (relations : `project`, `emailTemplate` nullable, `emailLayout` nullable). Scope nommé `Email.query().forProject(project)`.

## Jobs / Commands

Aucun.

## Events

`EmailCreated`, `EmailUpdated`, `EmailDeleted`, `EmailPublished` — consommés par `AuditLogListener` uniquement.

## Permissions

Standard projet.

## Validation

`app/validators/email.ts` : `name`, `subject`, `senderName`, `senderEmail` (email valide), `replyTo` (email valide, optionnel), `preheader` (optionnel, string courte ex. max 150 caractères), `textContent` (optionnel), et `htmlContent` (email vierge/créé depuis template, `createEmailValidator`/`updateEmailValidator`) ou `bodyContent` (email layout-lié, `createEmailFromLayoutValidator`/`updateEmailFromLayoutValidator`) — jamais les deux dans le même validateur. `senderEmail` : **pas** de vérification qu'il correspond au domaine du connecteur SMTP choisi en v1 (ce choix se fait au niveau du node `send_email` dans le builder, pas ici) — noté comme risque de délivrabilité en Open questions, pas bloqué techniquement.

## Edge cases

- Suppression d'un `Email` référencé par un node `send_email` d'un **draft** (pas encore publié) → le builder doit détecter la référence orpheline à l'ouverture du draft et inviter à resélectionner un email (le node reste en place, `config.emailId` devient invalide) — comportement détaillé dans `11-campaign-builder.md`.
- Édition du contenu d'un `Email` déjà `published` → autorisée (rappel Domain concepts : le statut `published` n'est pas un verrou), affecte uniquement les futurs usages (nouveaux drafts créés après l'édition), jamais les versions déjà figées.
- `textContent` absent à l'usage réel (envoi) → fallback texte auto-généré par strip HTML du `htmlContent` au moment de l'envoi (dans le Campaign Engine, cf. `12-campaign-engine.md`), pas au moment de la sauvegarde de l'`Email`.

## Failure scenarios

Aucun scénario de défaillance critique propre à ce domaine (pas d'appel externe).

## Idempotency considerations

CRUD classique. Le point d'idempotence critique du domaine "email" concerne l'**envoi**, traité intégralement dans `12-campaign-engine.md` et `decisions/ADR-005-email-idempotency.md` — pas ce plan.

## Performance considerations

Volumes faibles à modérés. Le comptage "utilisé dans N campagnes" (affiché en liste) doit être une requête agrégée indexée sur `campaign_nodes.subtype = 'send_email'` filtrée par `config->>'$.emailId'` — potentiellement coûteux si non indexé sur de gros volumes de nodes ; acceptable en v1 (volumes de nodes par projet restent modérés, des dizaines à quelques centaines), à revisiter si besoin réel constaté.

## Security considerations

Identiques à `08-email-templates.md` § Security considerations (XSS via variables, preview en iframe sandboxée) — le `VariableRenderer` est partagé, la politique est donc strictement la même, documentée une seule fois dans `19-security.md` comme référence transverse.

## Testing strategy

- Unit : `EmailService.createFromTemplate` (copie correcte, indépendance ensuite — modifier le template original n'affecte pas l'email créé).
- Functional : CRUD, création depuis template, preview.
- Regression : test explicite du "gel de contenu" — modifier un `Email` après qu'une campagne l'a référencé dans une version publiée ne doit **pas** changer le `config` déjà figé sur `campaign_nodes` de cette version (ce test vit plus naturellement dans `10-campaigns.md`/`11-campaign-builder.md` car il exerce le mécanisme de publication, mais est listé ici comme garantie attendue de ce domaine).

## Implementation steps

1. `node ace make:migration create_emails_table`.
2. `node ace migration:run`.
3. Créer le modèle `Email` (scope `forProject`).
4. Créer `app/validators/email.ts`.
5. Créer `app/services/emails/email_service.ts` (réutilise `VariableRenderer` de `08-email-templates.md`).
6. Créer `app/transformers/email_transformer.ts`.
7. Créer les events (`app/events/email_*.ts`).
8. Créer `EmailsController` et les routes.
9. Créer les pages Inertia listées ci-dessus.
10. Écrire les tests listés ci-dessus.

## Dependencies

`08-email-templates.md` (création depuis template, `VariableRenderer` partagé), `04-projects.md`.

## Open questions

- Vérification de cohérence domaine expéditeur / connecteur SMTP (éviter un `senderEmail` qui ne correspond à aucun domaine authentifié du connecteur, risque de délivrabilité/spam) : non implémentée en v1, pourrait devenir un avertissement non bloquant dans le builder si un besoin réel est identifié.
- Versionning propre à l'`Email` lui-même (historique de ses éditions, indépendamment du gel par campagne) : non retenu en v1, le gel par `campaign_version` couvre le besoin de non-régression exprimé dans `init.md` ; un historique d'édition général serait une feature d'audit de contenu distincte, non priorisée.
