# 08 — Email Templates

## Objective

Permettre à chaque projet de créer des modèles d'email réutilisables (contenu HTML/texte + variables), servant de point de départ pour la création d'`Email` (voir `09-emails.md`) sans lien live après copie — éditer un template plus tard ne doit jamais modifier rétroactivement les emails déjà créés à partir de lui.

## Functional requirements

- CRUD template (`name`, `subject`, `htmlContent`, `textContent`).
- Preview (rendu HTML avec des valeurs d'exemple pour les variables).
- Duplication d'un template existant.
- Moteur de variables extensible (`{{ contact.firstname }}`, `{{ project.name }}`, `{{ unsubscribe_url }}`, ...).

## User flows

```text
Création : formulaire (name, subject, éditeur HTML, contenu texte optionnel)
  → EmailTemplate créé
Preview : bouton "Aperçu"
  → rendu du htmlContent avec le moteur de variables + un jeu de données d'exemple
    (contact fictif "Jean Dupont", project.name réel, unsubscribe_url fictif)
  → affiché dans un iframe sandboxée (isolation XSS, voir Security considerations)
Duplication : bouton "Dupliquer"
  → nouveau EmailTemplate, name = "<original> (copie)", contenu identique
Utilisation dans un Email : voir 09-emails.md — copie ponctuelle du contenu, pas de référence live
  après création (email_templates.id reste stocké sur emails.email_template_id pour traçabilité
  "créé à partir de", mais son contenu n'est plus jamais relu après la copie initiale)
```

## Domain concepts

**Moteur de variables** : syntaxe `{{ namespace.field }}`, résolu à l'envoi réel (dans le Campaign Engine, `12-campaign-engine.md`) ou avec des valeurs d'exemple (preview). Namespaces v1 :

```text
contact.firstname, contact.lastname, contact.email, contact.company, contact.country, ...
  (tout champ standard de Contact, cf. 05-contacts.md — pas les customFields en v1, voir Open questions)
project.name
unsubscribe_url   (généré dynamiquement par 17-unsubscribe.md, jamais une valeur stockée)
```

Le moteur est un renderer simple à base de remplacement de tokens (pas un moteur de templating complet type Edge/Handlebars avec logique conditionnelle en v1) — volontairement limité pour réduire la surface de risque (pas d'exécution de code dans le contenu utilisateur) et parce qu'aucun besoin de logique conditionnelle dans le contenu n'est exprimé dans le scope v1. Implémentation : une passe de remplacement regex sur les tokens connus, **échappement HTML systématique de la valeur injectée** (sauf pour `unsubscribe_url` qui est une URL, pas du texte libre) avant insertion dans le HTML — voir Security considerations.

**Extensibilité** : le renderer est une fonction `renderVariables(content: string, context: VariableContext): string` où `VariableContext` est un objet TypeScript typé (pas un dictionnaire libre) — ajouter un nouveau namespace (ex. futur `campaign.name`) est un changement additif localisé à ce service, jamais une migration de données.

## Data model

Voir `02-database-design.md` § Templates / Emails (`email_templates`). Pas de colonne `variables` dédiée — les variables utilisées sont détectées par simple scan du contenu au moment du rendu, pas stockées séparément (pas de bénéfice à les persister en v1 : aucune UI ne nécessite de lister "quelles variables ce template utilise" au-delà d'un aperçu visuel).

## Backend architecture

```text
app/services/emails/
  email_template_service.ts   (create, update, delete, duplicate)
  variable_renderer.ts        (renderVariables — partagé avec 09-emails.md et 12-campaign-engine.md)
app/validators/email_template.ts
app/transformers/email_template_transformer.ts
```

`variable_renderer.ts` est délibérément placé dans un module partagé (`app/services/emails/`) plutôt que dupliqué, car il est réutilisé tel quel par `09-emails.md` (preview d'un Email) et par `12-campaign-engine.md` (rendu final avant envoi, avec le vrai contact).

## Frontend architecture

```text
inertia/pages/.../email-templates/
  index.vue    (liste, aperçu miniature)
  create.vue / edit.vue  (formulaire + éditeur HTML — voir Open questions pour le choix d'éditeur)
  preview.vue  (ou modal de preview depuis index/edit, iframe sandboxée)
inertia/components/variable-picker.vue   (insère un token {{ namespace.field }} dans l'éditeur)
```

## Routes

```text
GET    .../email-templates                      email_templates.index
GET    .../email-templates/create                 email_templates.create
POST   .../email-templates                        email_templates.store
GET    .../email-templates/:templateId/edit        email_templates.edit
PATCH  .../email-templates/:templateId             email_templates.update
DELETE .../email-templates/:templateId             email_templates.destroy
POST   .../email-templates/:templateId/duplicate   email_templates.duplicate
POST   .../email-templates/:templateId/preview      email_templates.preview
```

## Controllers

`EmailTemplatesController` (index/create/store/edit/update/destroy/duplicate/preview). `preview` retourne le HTML rendu (pas une page Inertia complète — utilisé dans une iframe `srcdoc`, via `ctx.serialize()`/réponse texte brute selon l'implémentation frontend retenue).

## Services

- `EmailTemplateService.duplicate(template)` : copie `name` (suffixé), `subject`, `htmlContent`, `textContent` dans une nouvelle ligne.
- `EmailTemplateService.delete(template)` : autorisée même si des `Email` ont été créés à partir de ce template (leur `email_template_id` passe à `null` via `onDelete('SET NULL')`, cf. `02-database-design.md` — leur contenu déjà copié n'est pas affecté).
- `VariableRenderer.render(content, context)` : remplace les tokens connus, échappe le HTML des valeurs, laisse tel quel tout token non reconnu (affiché littéralement plutôt que silencieusement supprimé — aide au debugging d'un token mal orthographié).

## Models

`EmailTemplate` (relations : `project`, `emails` — via `emails.email_template_id`, nullable). Scope nommé `EmailTemplate.query().forProject(project)`.

## Jobs / Commands

Aucun.

## Events

`EmailTemplateCreated`, `EmailTemplateUpdated`, `EmailTemplateDeleted` — consommés par `AuditLogListener` uniquement.

## Permissions

Standard projet.

## Validation

`app/validators/email_template.ts` : `name` (requis), `subject` (requis, peut contenir des variables), `htmlContent` (requis, taille max raisonnable ex. 500KB pour éviter un abus), `textContent` (optionnel).

## Edge cases

- Template avec un token de variable inconnu/mal orthographié (ex. `{{ contct.firstname }}`) → affiché tel quel au rendu (pas d'erreur bloquante), visible immédiatement en preview — c'est le mécanisme de détection d'erreur pour l'utilisateur (pas de validation statique de tous les tokens à la sauvegarde, jugée disproportionnée pour la v1).
- `textContent` absent → à l'usage dans un `Email`, un texte brut peut être auto-généré par strip des balises HTML du `htmlContent` (fallback simple) — comportement documenté dans `09-emails.md`, pas dans ce plan.

## Failure scenarios

Aucun scénario de défaillance critique propre à ce domaine (pas d'appel externe, pas d'opération asynchrone).

## Idempotency considerations

CRUD classique, aucun besoin d'idempotence particulier.

## Performance considerations

Volumes faibles à modérés (templates par projet) — aucune préoccupation particulière. `htmlContent`/`textContent` en `longtext` pour supporter des emails HTML riches sans contrainte de taille artificielle (au-delà de la limite de validation applicative § Validation).

## Security considerations

- **XSS dans les templates HTML** : `htmlContent` est du HTML fourni par un utilisateur du projet (pas un tiers non authentifié), donc le risque principal n'est pas un attaquant externe qui injecte du HTML dans le template lui-même, mais **les valeurs de variables injectées dans ce HTML au rendu** (ex. `contact.firstname` contenant `<script>`) — le `VariableRenderer` doit échapper systématiquement toute valeur de variable insérée (sauf `unsubscribe_url`, une URL contrôlée par le système, jamais une donnée contact). Voir `19-security.md` § XSS templates pour la politique transverse partagée avec `09-emails.md`.
- Le rendu de preview côté frontend s'affiche dans une `<iframe sandbox="allow-same-origin">` (sans `allow-scripts`) pour empêcher toute exécution JavaScript même si un `<script>` avait été injecté dans le HTML brut par erreur — défense en profondeur, pas une confiance aveugle dans l'échappement seul.
- Pas de SSRF via le contenu HTML (ex. balises `<img>` pointant vers des URLs arbitraires) : accepté comme risque inhérent à l'emailing HTML standard (les clients email ont le même problème), pas mitigé spécifiquement — hors scope raisonnable.

## Testing strategy

- Unit : `VariableRenderer` — chaque namespace, token inconnu laissé tel quel, échappement HTML des valeurs (test explicite avec une valeur contenant `<script>`).
- Functional : CRUD, duplication (vérifie l'indépendance du contenu copié — modifier l'original n'affecte pas la copie), preview.

## Implementation steps

1. `node ace make:migration create_email_templates_table`.
2. `node ace migration:run`.
3. Créer le modèle `EmailTemplate` (scope `forProject`).
4. Créer `app/validators/email_template.ts`.
5. Créer `app/services/emails/variable_renderer.ts` (partagé, testé isolément).
6. Créer `app/services/emails/email_template_service.ts`.
7. Créer `app/transformers/email_template_transformer.ts`.
8. Créer les events (`app/events/email_template_*.ts`).
9. Créer `EmailTemplatesController` et les routes.
10. Créer les pages Inertia et le composant `variable-picker.vue`.
11. Écrire les tests listés ci-dessus.

## Dependencies

`04-projects.md`. `17-unsubscribe.md` pour la génération réelle de `unsubscribe_url` (le renderer accepte une valeur déjà résolue en contexte, ne la génère pas lui-même — découplage volontaire).

## Open questions

- Éditeur HTML : éditeur riche (WYSIWYG, ex. TipTap) vs. éditeur code brut (ex. CodeMirror) — non tranché dans cette phase, à décider à l'implémentation selon l'effort acceptable (un éditeur code brut est nettement plus simple à livrer et suffisant pour un MVP ; un WYSIWYG améliore l'accessibilité pour des utilisateurs non techniques mais ajoute une dépendance et une complexité de sérialisation HTML significative).
- Support de `customFields.*` dans le moteur de variables : non inclus en v1 (uniquement les champs standards de `Contact`) — extension naturelle du même mécanisme si demandée, mais nécessite une réflexion sur l'échappement de types hétérogènes (JSON) avant d'être ajoutée.
