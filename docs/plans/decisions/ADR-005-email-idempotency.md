# ADR-005 — Email delivery idempotency

## Context

Scénario critique explicitement signalé dans `init.md` : un worker envoie un email, le serveur SMTP l'**accepte**, puis le worker **crashe avant** de marquer le job comme terminé. Le job est retenté (par BullMQ ou par notre logique de retry) → risque d'envoyer **deux fois** le même email au même contact. C'est le problème d'idempotence le plus important du système (au-dessus, en criticité perçue par un destinataire, du reste des cas de retry).

## Options

**A. Compter sur BullMQ / "au plus une fois" implicite.**
- − BullMQ (comme la quasi-totalité des systèmes de queue) garantit **"at-least-once"**, jamais "exactly-once", par design (un crash entre "traitement terminé" et "ack" est intrinsèquement impossible à distinguer d'un job jamais traité). Ne pas s'appuyer là-dessus pour l'idempotence métier.

**B. Vérifier "ai-je déjà un email envoyé pour ce contact+campagne+node ?" juste avant l'appel SMTP (check-then-act).**
- − Race condition classique : deux exécutions concurrentes du même job (double delivery BullMQ, ou deux workers sur le même execution mal verrouillée) peuvent toutes les deux passer le check avant qu'aucune n'ait écrit le résultat.

**C. Clé d'idempotence unique en base, réservée **avant** l'appel SMTP, dans une transaction qui échoue proprement si la clé existe déjà.**
- + La contrainte `UNIQUE` SQL sur `email_deliveries.idempotency_key` est la seule garantie réellement atomique dans ce contexte (le "check-then-act" devient un "insert-then-act", où l'échec d'insertion *est* le mécanisme de dédoublonnage).

## Decision

**Option C**, avec la séquence suivante dans le job d'envoi (`SendCampaignEmailJob` / service `EmailSendingService.send()`) :

```text
1. idempotencyKey = deterministic(campaignExecutionId, nodeId)
   -- déterministe et stable pour une paire (exécution, node) donnée, PAS un random généré à chaque tentative

2. INSERT INTO email_deliveries (..., idempotency_key = idempotencyKey, status = 'processing')
   -- si la clé existe déjà (contrainte UNIQUE violée) :
   --   -> lire la ligne existante ; si son status est déjà sent/delivered/failed(non-retryable),
   --      NE RIEN FAIRE (c'est un doublon de traitement, pas un nouvel envoi) et sortir en succès
   --   -> si son status est encore 'processing' ET locked récemment, c'est une exécution concurrente
   --      en cours : sortir sans agir (l'autre tentative fera foi)
   --   -> si son status est 'processing' mais bloqué depuis longtemps (crash suspecté, cf. seuil de
   --      staleness), on peut la reprendre (voir 15-retry-and-idempotency.md pour le détail du seuil)

3. Appel SMTP réel (send)

4. UPDATE email_deliveries SET status = 'sent', sent_at = now(), provider_message_id = ...
   WHERE id = ... AND status = 'processing'
   -- l'UPDATE conditionné sur status='processing' protège contre un double UPDATE concurrent
```

L'étape 2 (réservation par insertion unique) doit se produire **avant** l'appel SMTP réel, pas après — c'est ce qui rend le "envoyé mais pas marqué" détectable au prochain retry : si le worker crashe entre l'étape 3 et l'étape 4, la ligne reste en `status = 'processing'`. Au retry, l'étape 2 retrouve cette ligne existante plutôt que d'en recréer une (grâce à la clé déterministe), et applique la règle de staleness pour décider s'il faut renvoyer (risque résiduel assumé, voir Risks) ou attendre.

## Reasons

- Une clé d'idempotence **déterministe** (dérivée de `campaignExecutionId` + `nodeId`, pas un UUID aléatoire par tentative) est ce qui permet à un retry de "retomber" sur la même ligne plutôt que d'en créer une nouvelle — c'est le cœur du mécanisme.
- Réserver la ligne (insert) avant l'appel SMTP, plutôt qu'après, est ce qui transforme "un crash au pire moment" en un état détectable (`processing` figé) plutôt qu'en absence totale de trace.
- S'appuyer sur une contrainte `UNIQUE` SQL plutôt qu'un verrou applicatif (mutex en mémoire, etc.) garantit la garantie même avec plusieurs process worker.

## Consequences

- `email_deliveries.idempotency_key` doit être `UNIQUE` et `NOT NULL` (déjà spécifié dans `02-database-design.md`).
- Pour les envois **hors campagne** (aucun cas identifié en v1, tout envoi passe par le Campaign Engine), la clé d'idempotence devra suivre le même principe (dérivée d'un identifiant stable de la demande d'envoi, jamais d'un timestamp/random).
- Le "seuil de staleness" (à partir de quand une ligne `processing` bloquée est considérée comme un crash et peut être reprise en toute sécurité) est un arbitrage explicite entre risque de doublon et risque de blocage définitif — détaillé et chiffré dans `15-retry-and-idempotency.md` plutôt que dupliqué ici.

## Risks

- Risque résiduel non éliminable à 100% : si le worker crashe **après** que le SMTP a accepté l'email **et après** avoir marqué `sent`, mais qu'un bug fait relire cette ligne comme reprenable, il y a un très faible risque de double-envoi. Ce risque est strictement plus petit avec cette stratégie qu'avec toute alternative "at-least-once" naïve, mais pas nul — documenté explicitement plutôt que promis comme "impossible".
- Si le SMTP accepte l'email mais que la connexion réseau tombe avant que la réponse ne revienne au worker (le worker ne sait pas si l'envoi a réussi), on ne peut pas distinguer ce cas d'un échec réel côté worker — la décision de retry dans ce cas précis est traitée comme une erreur retryable "incertaine" dans `15-retry-and-idempotency.md`, avec un biais délibéré vers "ne pas renvoyer trop vite" plutôt que "ne jamais renvoyer" (un email en retard est préférable à un email dupliqué, mais un email jamais envoyé est pire que les deux).
