# Injection de dépendance — Règle obligatoire

Les services (`app/services/**`) ne sont **jamais** instanciés avec `new` ni exportés en singleton
(`export default new X()`). Ils sont résolus par le conteneur IoC d'AdonisJS.

## Classes résolues par le conteneur (contrôleurs, services, middleware, listeners)

Utiliser `@inject()` (`import { inject } from '@adonisjs/core'`) et l'injection par constructeur :

```typescript
@inject()
export default class CampaignVersionsController {
  constructor(protected campaignBuilderService: CampaignBuilderService) {}
}
```

- Pas de `const service = new Service()` au niveau du module.
- Pas de méthode `static` dans les classes de service (utiliser une méthode d'instance ou une fonction de module).
- Pas de paramètre primitif dans un constructeur injecté (`batchSize = 5000`) : utiliser une propriété publique.

## Hors conteneur (commandes ace, preloads `start/*`, handlers de jobs, tests)

Résoudre explicitement :

```typescript
const queueDispatcher = await this.app.container.make(QueueDispatcher) // commande
const service = await app.container.make(MyService) // import app from '@adonisjs/core/services/app'
```

## Singletons

Les services qui doivent exister une seule fois par process (connexions BullMQ, registres en mémoire :
`QueueRegistry`, `QueueDispatcher`, `JobHandlerRegistry`, `ScheduledTaskRegistry`) sont déclarés dans
`providers/app_provider.ts` via `this.app.container.singleton(...)`. Tout nouveau service à état partagé
s'y enregistre ; la classe est exportée telle quelle (`export default class X`).

## Tests

Résoudre les services avec `app.container.make(X)`. Un service sans dépendance peut rester en `new X()`,
mais les singletons doivent toujours venir du conteneur.
