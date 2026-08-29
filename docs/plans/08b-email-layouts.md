# 08b — Email Layouts

## Objective

Permettre à chaque projet de définir un cadre de branding HTML réutilisable (header/footer, mise en page) partagé en **live** par plusieurs `Email` — distinct d'un `EmailTemplate` (`08-email-templates.md`), qui reste un point de départ copié ponctuellement. Un `EmailLayout` n'a **pas** de `subject`/`textContent` propre (uniquement la version HTML, cf. discussion produit) : son `htmlContent` contient un placeholder réservé `{{ email_body }}` où le contenu propre à chaque `Email` lié est injecté au moment du rendu — jamais copié. Éditer un `EmailLayout` met donc à jour instantanément le rendu de tous les `Email` qui le référencent, jusqu'à ce que la campagne qui les utilise soit publiée (le gel de contenu à la publication, `decisions/ADR-004-campaign-versioning.md`, s'applique alors comme pour tout autre champ d'`Email`).

## Functional requirements

- CRUD `EmailLayout` (`name`, `htmlContent`).
- Preview (rendu HTML avec un corps d'exemple + des valeurs d'exemple pour les variables).
- Duplication d'un layout existant.
- Réutilise le moteur de variables de `08-email-templates.md` (`{{ contact.firstname }}`, `{{ project.name }}`, `{{ unsubscribe_url }}`, ...).

## User flows

```text
Création : formulaire (name, éditeur HTML avec placeholder {{ email_body }})
  → EmailLayout créé
Preview : bouton "Aperçu"
  → compose le htmlContent avec un corps d'exemple (`EXAMPLE_BODY_CONTENT`),
    puis rendu du moteur de variables + un jeu de données d'exemple
    (contact fictif "Jean Dupont", project.name réel, unsubscribe_url fictif)
  → affiché dans un iframe sandboxée (isolation XSS, voir Security considerations)
Duplication : bouton "Dupliquer"
  → nouveau EmailLayout, name = "<original> (copie)", contenu identique
Utilisation dans un Email : voir 09-emails.md — email_layout_id est une référence LIVE
  (pas une traçabilité de "créé à partir de") : email.bodyContent est injecté dans
  layout.htmlContent à CHAQUE rendu (preview, gel de campagne), jamais copié dans
  email.htmlContent tant que le lien n'est pas rompu (suppression du layout, voir
  Services)
```

## Domain concepts

**Placeholder `{{ email_body }}`** : marqueur structurel réservé, syntaxiquement dans le même style que les tokens `{{ namespace.field }}` du moteur de variables mais traité par une passe distincte et **antérieure** — `app/services/emails/email_layout_composer.ts` (`composeEmailHtml(email, layout)`), qui remplace `{{ email_body }}` dans `layout.htmlContent` par `email.bodyContent` **sans échappement** (contenu HTML de confiance, auteur = le même utilisateur projet que le layout, pas une donnée de contact — même traitement que `unsubscribe_url`, voir Security considerations). Cette passe tourne AVANT `renderVariables` (`08-email-templates.md` § Domain concepts), donc les tokens `{{ namespace.field }}` présents dans le corps de l'email OU dans le layout sont tous rendus ensemble dans la passe `renderVariables` qui suit — aucune modification de `variable_renderer.ts` n'est nécessaire. Un layout sans `{{ email_body }}` compose silencieusement un HTML où le corps n'apparaît nulle part (pas d'erreur bloquante, visible immédiatement en preview — même philosophie que les tokens inconnus dans `08-email-templates.md` § Edge cases).

**Lien live vs copie ponctuelle** : contrairement à `EmailTemplate` (`08-email-templates.md` § Objective), le `htmlContent` d'un `EmailLayout` n'est **jamais** copié dans l'`Email` qui le référence — `email_layout_composer.ts` relit `layout.htmlContent` à chaque rendu (preview, gel de publication de campagne). C'est ce qui rend le cadre "live" : une édition du layout s'applique instantanément à tous les emails qui l'utilisent.

## Data model

Voir `09-emails.md` § Data model pour `emails.email_layout_id`/`emails.body_content`. `email_layouts` : `id`, `project_id`, `name`, `html_content` (`longtext`, NOT NULL) — pas de `subject`/`text_content` (layout HTML-only, § Objective), pas de colonne `variables` dédiée (même rationale que `08-email-templates.md` § Data model).

## Backend architecture

```text
app/services/emails/
  email_layout_service.ts     (create, update, delete, duplicate)
  email_layout_composer.ts    (composeEmailHtml — compose layout.htmlContent + email.bodyContent)
  variable_renderer.ts        (réutilisé tel quel, 08-email-templates.md)
app/validators/email_layout.ts
app/transformers/email_layout_transformer.ts
```

## Frontend architecture

```text
inertia/pages/.../email-layouts/
  index.vue    (liste)
  create.vue / edit.vue  (formulaire + éditeur HTML avec placeholder {{ email_body }})
inertia/components/variable-picker.vue   (prop `include-email-body` ajoute un bouton
  d'insertion du placeholder — seulement sur les pages email-layouts)
```

Nav : entrée "Layouts" dans `app_sidebar.vue`, au même niveau que "Emails"/"Templates".

## Routes

```text
GET    .../email-layouts                      email_layouts.index
GET    .../email-layouts/create                 email_layouts.create
POST   .../email-layouts                        email_layouts.store
GET    .../email-layouts/:layoutId/edit          email_layouts.edit
PATCH  .../email-layouts/:layoutId               email_layouts.update
DELETE .../email-layouts/:layoutId               email_layouts.destroy
POST   .../email-layouts/:layoutId/duplicate     email_layouts.duplicate
POST   .../email-layouts/:layoutId/preview       email_layouts.preview
```

## Controllers

`EmailLayoutsController` (index/create/store/edit/update/destroy/duplicate/preview). `preview` compose `layout.htmlContent` avec un corps d'exemple (`EXAMPLE_BODY_CONTENT`, aucun `Email` réel dans ce contexte) avant `renderVariables` — retourne le HTML rendu (pas une page Inertia, utilisé dans une iframe `srcdoc`, même mécanisme que `EmailTemplatesController#preview`).

## Services

- `EmailLayoutService.duplicate(layout)` : copie `name` (suffixé), `htmlContent` dans une nouvelle ligne.
- `EmailLayoutService.delete(layout)` : autorisée même si des `Email` référencent encore ce layout — mais comme `htmlContent` est un lien live (§ Objective), supprimer le layout sans précaution viderait le rendu de ces emails dès que `email_layout_id` passe à `null` (`onDelete('SET NULL')`). Pour éviter cette perte de contenu silencieuse, `delete()` matérialise d'abord, pour chaque `Email` référençant le layout, son HTML composé actuel (`composeEmailHtml(email, layout)`) dans `emails.html_content` et vide `emails.body_content` — dans la même transaction que la suppression — avant que le detach FK ne s'exécute.
- `composeEmailHtml(email, layout)` (`email_layout_composer.ts`) : voir § Domain concepts.

## Models

`EmailLayout` (relations : `project`, `emails` — via `emails.email_layout_id`, nullable). Scope nommé `EmailLayout.query().forProject(project)`.

## Jobs / Commands

Aucun.

## Events

`EmailLayoutCreated`, `EmailLayoutUpdated`, `EmailLayoutDeleted` — consommés par `AuditLogListener` uniquement (même pattern que `EmailTemplate*`, `write_audit_log.ts`).

## Permissions

Standard projet (`EmailLayoutPolicy`, identique à `EmailTemplatePolicy`).

## Validation

`app/validators/email_layout.ts` : `name` (requis), `htmlContent` (requis, 500KB max comme `08-email-templates.md` § Validation).

## Edge cases

- Layout sans `{{ email_body }}` → voir § Domain concepts.
- Suppression d'un layout référencé par des `Email` → voir § Services (matérialisation avant suppression, pas de perte de contenu silencieuse).
- Token de variable inconnu/mal orthographié dans le layout ou dans `bodyContent` → même comportement que `08-email-templates.md` § Edge cases (affiché tel quel, pas d'erreur bloquante).

## Failure scenarios

Aucun scénario de défaillance critique propre à ce domaine (pas d'appel externe, pas d'opération asynchrone).

## Idempotency considerations

CRUD classique. `delete()` matérialise dans une transaction DB (§ Services) — pas de scénario de retry spécifique au-delà des garanties transactionnelles standard.

## Performance considerations

Volumes faibles à modérés (layouts par projet). `html_content` en `longtext` (même rationale que `08-email-templates.md` § Performance considerations).

## Security considerations

Identiques à `08-email-templates.md` § Security considerations (XSS via variables, preview en iframe sandboxée). Particularité : `{{ email_body }}` n'est **jamais** échappé par construction (même traitement que `unsubscribe_url`) — acceptable car `email.bodyContent` est du HTML de confiance écrit par un utilisateur du même projet, pas une donnée de contact (voir § Domain concepts).

## Testing strategy

- Unit : `composeEmailHtml` — substitution du placeholder, non-échappement du `bodyContent`, `Email` non lié rendu tel quel (`email_layout_composer.ts`, testé indirectement via `EmailService`/`EmailLayoutService` specs). `EmailLayoutService.delete` — matérialisation du HTML composé dans chaque `Email` référençant le layout avant suppression.
- Functional : CRUD, duplication (indépendance du contenu copié), preview, création/édition d'un `Email` depuis un layout (`emails.spec.ts`).

## Implementation steps

1. `node ace make:migration create_email_layouts_table`.
2. `node ace make:migration add_email_layout_id_to_emails_table` (+ `emails.body_content`/`emails.html_content` nullable, partagé avec `09-emails.md`).
3. `node ace migration:run`.
4. Créer le modèle `EmailLayout` (scope `forProject`), relation `Email.emailLayout`.
5. Créer `app/validators/email_layout.ts`.
6. Créer `app/services/emails/email_layout_composer.ts` (partagé, testé isolément).
7. Créer `app/services/emails/email_layout_service.ts`.
8. Créer `app/transformers/email_layout_transformer.ts`.
9. Créer les events (`app/events/email_layout_*.ts`) + les brancher dans `start/events.ts`/`write_audit_log.ts`.
10. Créer `app/policies/email_layout_policy.ts`.
11. Créer `EmailLayoutsController` et les routes.
12. Créer les pages Inertia (`inertia/pages/email_layouts/`), le lien "Layouts" dans `app_sidebar.vue`, et étendre `variable-picker.vue` (prop `include-email-body`).
13. Étendre `EmailService`/`EmailsController`/`inertia/pages/emails/{create,edit}.vue` pour le mode "From a layout" (troisième mode, aux côtés de "Blank"/"From a template").
14. Étendre `CampaignBuilderService.publish()` pour composer via `email.emailLayout` au moment du gel de contenu.
15. Écrire les tests listés ci-dessus.

## Dependencies

`08-email-templates.md` (moteur de variables partagé, distinction avec `EmailTemplate`), `09-emails.md` (`Email.emailLayoutId`/`bodyContent`), `04-projects.md`.

## Open questions

- Un `EmailLayout` pourrait à terme accepter plusieurs placeholders nommés (ex. `{{ email_header }}`/`{{ email_footer }}` distincts) plutôt qu'un unique `{{ email_body }}` — non retenu en v1, un seul placeholder couvre le besoin exprimé ("même cadre de branding, corps différent").
- Un `Email` ne peut pas aujourd'hui combiner "créé depuis un `EmailTemplate`" ET "lié à un `EmailLayout`" (les deux mécanismes sont mutuellement exclusifs au niveau du formulaire de création, § User flows) — jugé hors scope v1 : un template classique produit déjà un `htmlContent` complet, l'assembler ensuite dans un layout nécessiterait une réflexion UX distincte (quel contenu prime ?), non demandée.
