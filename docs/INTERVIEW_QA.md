# SeaPass — 50 perguntas que um avaliador poderia fazer

Complementa a seção ["Decisões técnicas que eu explicaria em uma entrevista"](../README.md#decisões-técnicas-que-eu-explicaria-em-uma-entrevista)
do README — aqui o formato é pergunta direta + resposta, para simular a dinâmica real de uma
entrevista técnica. Organizado por tema; cada resposta cita o arquivo/ADR relevante para quem
quiser verificar a afirmação no código, não só confiar na palavra.

---

## Arquitetura e organização

**1. Por que monorepo, e não repositórios separados para API e frontend?**
Porque `packages/contracts` (schemas Zod) precisa ser importado por ambos, e um schema
desincronizado entre repos é uma classe inteira de bug que o monorepo elimina por construção —
o mesmo arquivo valida no backend e tipa o frontend. Turborepo cacheia e paraleliza build/lint/
test entre os workspaces; o custo (setup um pouco mais complexo que 2 repos simples) compensa pelo
ganho de nunca ter os dois lados fora de sincronia.

**2. Por que NestJS em vez de Express puro ou Fastify?**
Porque o projeto precisava de estrutura opinativa desde o início (módulos, DI, guards, pipes) para
um domínio com bastante regra de negócio — Express puro exigiria reinventar essa organização à
mão, com risco real de inconsistência entre módulos escritos por pessoas diferentes. O trade-off é
mais "mágica"/curva de aprendizado; pagou-se esse custo porque o benefício (guards de auth
declarativos, DI testável) importa mais aqui do que a performance bruta de Fastify.

**3. Por que Next.js App Router em vez de Pages Router?**
Server Components eliminam uma classe de waterfall de loading (o catálogo público já chega
renderizado com dado real, sem round-trip de "monta a página, depois busca os dados"). O
trade-off documentado: só componentes client (`'use client'`) podem usar hooks de estado — o
projeto usa isso conscientemente (ex.: `ShipMap`/`BookingModal` são client, o resto do catálogo é
server).

**4. Como os módulos do backend estão organizados, e por que `catalog` é um módulo só (não um por
sub-recurso)?**
Um módulo Nest por domínio de negócio, não por tabela — `catalog/` reúne navio, deck, cabine,
categoria de cabine, cruzeiro, itinerário, evento, restaurante, artista e porto porque todos
pertencem ao mesmo agregado conceitual ("o catálogo de um cruzeiro") e mudam juntos (ver
[ADR-0006](../docs/architecture/decisions/0006-catalog-layering.md)). Um módulo por tabela teria
sido granularidade artificial — a fronteira certa é de domínio, não de schema.

**5. Como vocês garantem que não há dependência circular entre módulos?**
Regra de dependência explícita: um módulo só acessa outro através do `service` que ele exporta,
nunca importando o repository/Prisma de outro módulo direto. Isso foi verificado manualmente
(traçando o grafo de `imports` de cada `*.module.ts`) numa auditoria — o grafo é um DAG, mesmo
depois de `BookingsModule`/`AdminModule` passarem a importar `TicketsModule`/`ActivitiesModule`
(nenhum dos dois importa de volta).

**6. Por que `packages/ui` existe mas está vazio?**
Decisão deliberada contra abstração prematura: um componente só é promovido pra lá quando já se
repete em 2+ features de `apps/web/src/features`. Criar um design system genérico antes de haver
reuso real teria significado adivinhar a interface certa sem dado nenhum — o pacote existe pra não
precisar criar a estrutura depois, mas fica vazio até o primeiro caso de reuso genuíno.

---

## Banco de dados e modelagem

**7. Por que Prisma em vez de TypeORM ou um query builder cru (Knex/Kysely)?**
Migrations declarativas + client tipado automaticamente a partir do schema — nenhum tipo de
retorno de query escrito à mão que pode dessincronizar do banco real. `$transaction` e
`$queryRaw`/`SELECT ... FOR UPDATE` cobrem os casos onde o query builder do Prisma não alcança
(lock pessimista), então não houve trade-off real de expressividade perdida.

**8. Como o preço de uma reserva foi modelado? Por que não referenciar direto o preço da
categoria?**
Preço é uma foto no tempo: `Booking.totalAmount`, `BookingExperience.priceAtBooking` são colunas
próprias, congeladas no momento da reserva/checkout. Se o organizador mudar o preço da categoria
depois, reservas já feitas não mudam de valor — só o cálculo do PRÓXIMO checkout usa o preço novo.
Ver [ADR-0011](../docs/architecture/decisions/0011-pricing-engine.md).

**9. Por que cancelamento é sempre soft-delete (`status` + `cancelledAt`), nunca `DELETE`?**
Auditoria, relatório do organizador ("quantas reservas foram canceladas este mês") e o próprio
ingresso (que precisa existir pra provar que foi emitido e depois invalidado) dependem do
histórico. `Cabin`/`CabinCategory` seguem o mesmo princípio — nunca excluídas, só um campo de
status de operação.

**10. Como a integridade referencial é garantida — `onDelete` de cada relação foi pensado ou é o
default?**
Cada `onDelete` é uma escolha documentada, não o default do Prisma: `Restrict` em relações onde
apagar o pai destruiria histórico que precisa sobreviver (ex.: `Experience` referenciada por
`BookingExperience`), `Cascade` só onde o filho não faz sentido sem o pai (ex.: `RefreshToken` ao
apagar `User`).

**11. Por que cada cruzeiro tem seu próprio preço por categoria de cabine, em vez de um preço fixo
por categoria?**
Porque a mesma cabine física pode estar num sailing de alta temporada (mais caro) e um de baixa —
`CruiseCabinPricing` é a tabela de junção que carrega o preço POR (cruzeiro, categoria), nunca um
valor fixo na categoria em si.

---

## Concorrência, transações e idempotência

**12. Como vocês evitam duas pessoas reservando a mesma cabine ao mesmo tempo?**
`SELECT ... FOR UPDATE` trava a linha da cabine antes de checar disponibilidade e criar o hold,
dentro da mesma transação — a segunda requisição espera o lock, vê o hold que a primeira acabou de
criar, e é rejeitada. Um índice único parcial no banco é a segunda linha de defesa: mesmo com um
bug hipotético na aplicação, o Postgres recusaria a segunda linha ativa pra mesma cabine+cruzeiro.
Ver [ADR-0009](../docs/architecture/decisions/0009-cabin-hold-engine.md).

**13. Por que lock pessimista (`SELECT FOR UPDATE`) em vez de otimista (campo `version`/
`updatedAt`)?**
Porque o domínio tem contenção real e esperada (vários usuários mirando a mesma cabine/vaga de
evento ao mesmo tempo), onde otimista pagaria o custo de retry sob alta contenção sem ganho real —
pessimista evita esse custo pagando um lock curto (a transação é rápida).

**14. O que impede um deadlock quando duas transações travam linhas em ordem diferente?**
Em `updateDetails`, as linhas de `Experience` são travadas numa ordem estável (por id) antes de
somar quem já reservou — evita que duas chamadas concorrentes travem A depois B numa e B depois A
noutra, o clássico cenário de deadlock cruzado.

**15. Como a concorrência é testada de verdade, e não só no "feliz caminho"?**
Testes de integração disparam N requisições genuinamente simultâneas (`Promise.all` sem `await`
entre os disparos) contra o mesmo recurso e confirmam que só uma vence e as outras recebem 409 —
não é um teste sequencial disfarçado de concorrente. Ver `cabin-hold-concurrency.e2e-spec.ts` e a
seção "overbooking prevention under real concurrency" de `activities.e2e-spec.ts`.

**16. O que garante que um hold de cabine expira de verdade, mesmo se o job de expiração
(BullMQ) falhar?**
O job é só uma melhoria de UX, nunca a fonte de verdade — a próxima tentativa de hold da MESMA
cabine sempre recompara `holdExpiresAt` contra `now` dentro da própria transação
(`expireStaleHold`) antes de decidir. Se o job nunca rodasse, o pior caso é a cabine "parecer"
ocupada até alguém tentar reservá-la de novo — nunca ficar presa para sempre nem liberar cedo
demais.

**17. Como funciona idempotência no checkout? O que acontece se o cliente reenviar a mesma
requisição (retry de rede)?**
`Idempotency-Key` opcional no header — reenviar com a MESMA chave enquanto o pagamento ainda está
pendente reutiliza o mesmo `Payment` e consulta o gateway de novo (nunca cobra duas vezes);
reenviar com uma chave DIFERENTE enquanto há um pagamento pendente é rejeitado (409) — o cliente
deveria esperar ou cancelar. Ver [ADR-0010](../docs/architecture/decisions/0010-booking-domain.md)/
[ADR-0012](../docs/architecture/decisions/0012-checkout-payment-gateway.md).

**18. Por que a chamada ao gateway de pagamento acontece FORA da transação que prepara o
pagamento?**
Nunca segurar o lock da linha da reserva durante uma chamada de rede (que pode demorar segundos ou
nunca voltar) — o método abre duas transações, uma antes (prepara o `Payment`) e outra depois
(aplica o resultado), com a chamada ao gateway no meio, sem lock nenhum seguro.

---

## API e Backend

**19. Por que Zod para validação, em vez de `class-validator` (o padrão mais comum em NestJS)?**
Porque o mesmo schema Zod é compartilhado com o frontend via `packages/contracts` — `class-validator`
exigiria manter uma classe de DTO no backend E um tipo TypeScript espelhado à mão no frontend,
uma fonte a mais de dessincronia. Com Zod, `z.infer<typeof Schema>` gera o tipo dos dois lados do
MESMO arquivo.

**20. Como a validação de entrada é garantida em toda rota, não só nas "óbvias"?**
Todo `@Body()`/`@Query()` passa por `ZodValidationPipe` com um schema explícito — verificado rota
por rota numa auditoria (nenhuma rota depende de validação implícita). As duas exceções que
existiam (schemas Zod definidos inline em vez de vir de `@seapass/contracts`) foram encontradas e
corrigidas.

**21. Por que 404 em vez de 403 quando um recurso pertence a outro organizador?**
403 confirma que o recurso existe (só que não é seu) — isso vaza informação (um organizador
poderia enumerar quantos recursos um concorrente tem). 404 é indistinguível de "esse ID nunca
existiu". Ver [ADR-0005](../docs/architecture/decisions/0005-auth-and-rbac-design.md) — e uma
auditoria encontrou 2 módulos que não seguiam essa regra, corrigidos com teste de regressão.

**22. Como funciona a paginação? Cursor ou offset, e por quê?**
Offset (`page`/`pageSize`) — mais simples de implementar e suficiente pro volume de dado deste
domínio (uma organizadora não tem milhões de reservas). Cursor seria a escolha certa se a
paginação precisasse ser estável sob escrita concorrente pesada nas primeiras páginas, o que não é
o cenário aqui.

**23. Qual é a estratégia de tratamento de erros? O que o cliente recebe quando algo quebra?**
`AllExceptionsFilter` global captura tudo que não foi tratado explicitamente, loga o stack
completo + `req.id` (pra correlacionar no log estruturado) e devolve uma mensagem genérica ao
cliente fora de desenvolvimento — nunca um stack trace ou detalhe interno vaza numa resposta HTTP
de produção.

**24. `BookingsService` tem quase 800 linhas — isso não é um "god service"?**
Não: é o ciclo de vida inteiro de UM agregado (hold → detalhes → checkout → resultado do
pagamento → confirmar/cancelar/expirar), com métodos privados (recálculo de preço, chamada ao
gateway, aplicação do resultado) compartilhados entre os públicos. O teste de "está bem dividido"
não é contagem de linha, é se cada parte muda pela MESMA razão — aqui, tudo muda pela mesma regra
de negócio (o ciclo de vida da reserva). Contraste real no mesmo projeto: `OrganizersService`
(~400 linhas) mistura duas razões de mudar de verdade (CRUD de tenant vs. analytics) — considerado
numa auditoria e documentado como candidato real de split, ao contrário de `BookingsService`.

---

## Autenticação e segurança

**25. Como funciona a autenticação — por que JWT e não sessão de servidor?**
JWT permite o backend ser stateless (sem precisar de um store de sessão compartilhado se escalar
horizontalmente) — o trade-off (não dá pra invalidar um access token individual antes de expirar)
é mitigado por um TTL curto (15min) e pela lista de revogação real vivendo só no refresh token
(que É stateful, guardado no banco).

**26. Por que o access token fica em memória no frontend e o refresh token num cookie
httpOnly?**
`localStorage` é acessível a qualquer script (risco de XSS). O refresh token (7 dias, dano maior
se vazado) fica num cookie `httpOnly` — inacessível a JavaScript por design. O access token (15min,
dano limitado por natureza) fica em memória — se vazar por XSS, a janela de exploração é curta e o
refresh token nunca fica exposto no processo.

**27. O que é rotação de refresh token, e por que isso importa?**
Cada uso do refresh token o invalida e emite um par novo. Se um refresh token roubado for
reapresentado DEPOIS que o dono já o usou (rotacionado), o sistema detecta que um token já-revogado
está sendo reapresentado — sinal de roubo — e revoga TODOS os tokens do usuário, forçando login em
todo lugar.

**28. Vocês tiveram um bug real de rotação concorrente — o que aconteceu e como foi corrigido?**
O timer de renovação silenciosa (10min) e o listener de `visibilitychange` (aba voltando ao foco)
podiam disparar `POST /auth/refresh` quase juntos, com o MESMO cookie. A detecção de reuso via
rotação (pergunta 27) tratava a SEGUNDA chamada concorrente como possível roubo (o token já tinha
sido rotacionado pela primeira) e deslogava uma sessão legítima. A correção não foi abandonar a
rotação — foi um guard de "renovação em voo" (a segunda chamada reusa a Promise da primeira em vez
de disparar uma segunda requisição).

**29. Como a autorização multi-tenant é garantida — um organizador nunca vê dado de outro?**
O filtro de tenant (`organizerId`) vive DENTRO do `where` da própria query, nunca aplicado depois
de buscar (que abriria uma janela de "buscou e depois descartou", mais lento e mais arriscado).
Verificado com 30+ testes de integração dedicados (`rbac.e2e-spec.ts`,
`organizer-portal.e2e-spec.ts`) que tentam ativamente ler/alterar dado de outro organizador e
confirmam que falha.

**30. O que foi feito contra SQL injection, XSS e CSRF especificamente?**
SQL injection: toda query usa Prisma parametrizado ou `Prisma.sql`/tagged template, nunca
concatenação de string (auditado). XSS: nenhum `dangerouslySetInnerHTML` no frontend — todo texto
passa pelo escape automático do React. CSRF: o único fluxo por cookie (`/auth/refresh`,
`/auth/logout`) usa `SameSite=Lax`, que bloqueia o cookie em POST cross-site forjado; toda outra
rota autenticada usa Bearer token no header, que uma página CSRF não consegue forjar.

**31. Como senhas e segredos são protegidos?**
Senha: hash com bcrypt, nunca reversível. Token de recuperação de senha: hash de 32 bytes
aleatórios, e o valor cru nunca é logado fora de desenvolvimento (uma auditoria encontrou e
corrigiu um `logger.warn` que gravava o token em produção). Segredos JWT: mínimo de 32 caracteres,
e os dois (access/refresh) precisam ser diferentes entre si — validado em runtime, a API recusa
subir se não cumprir.

---

## Pagamentos

**32. Como funciona o gateway de pagamento simulado, e o que mudaria pra um real?**
`PaymentGateway` é uma interface (`charge`/`retrieve`) com uma implementação fake — a troca pra
Stripe/Mercado Pago real seria uma nova classe implementando a mesma interface, sem tocar em
`BookingsService`. A prova de que não é abstração decorativa: é a peça literalmente trocada nos
testes via injeção de dependência.

**33. O que acontece se o pagamento demorar (timeout) e ninguém souber se foi aprovado?**
O checkout nunca assume timeout como falha — sempre CONSULTA o resultado real (`retrieve`) antes
de decidir, tanto no fluxo síncrono quanto num callback posterior. A reserva fica
`PAYMENT_PENDING` até esse resultado real chegar, nunca é cancelada só por não ter recebido
resposta a tempo.

**34. Por que PIX e Boleto são tratados de forma diferente?**
PIX aprova/recusa na hora (síncrono) — o usuário vê o resultado na própria resposta do checkout.
Boleto tem compensação bancária real (dias), então fica `PAYMENT_PENDING` até um callback
assíncrono (`POST /bookings/:id/confirm-payment`) fechar o ciclo — o domínio já espera essa
diferença, não é tratada como um caso especial improvisado.

---

## Eventos assíncronos e notificações

**35. O que é síncrono e o que é assíncrono neste sistema, e por quê?**
Síncrono: tudo que o usuário precisa saber na resposta HTTP (aprovação PIX, disponibilidade,
preço). Assíncrono: só I/O de rede pra um serviço externo que pode ser lento ou falhar (envio de
e-mail via SMTP). A regra geral: async não é sinônimo de "melhor" — só compensa quando o trabalho é
genuinamente lento/não-confiável.

**36. Como funciona a fila de notificações — o que acontece se o envio de e-mail falhar 5
vezes?**
BullMQ com retry (5 tentativas, backoff exponencial). Depois de esgotar, o job cai numa fila
dead-letter separada + a notificação é marcada `FAILED` no banco + um `AuditLog` é gravado — nunca
silenciosamente descartado, sempre visível pra quem opera o sistema.

**37. Por que duas camadas de evento (`EventEmitter2` síncrono + BullMQ assíncrono) em vez de só
uma fila pra tudo?**
`EventEmitter2` desacopla QUEM causa algo (ex.: `BookingsService`) de QUEM reage (o listener de
notificações) sem forçar tudo a virar fila — é só uma chamada de função em memória. A fila entra
só onde há I/O de rede de verdade (o envio do e-mail em si). Tratar as duas camadas como a mesma
coisa seria confundir "desacoplamento" com "assíncrono" — são propriedades diferentes.

**38. Como vocês evitam mandar a mesma notificação duas vezes (ex.: um retry do BullMQ)?**
Duas camadas de idempotência: um `jobId` determinístico evita duplicar o enfileiramento; dentro do
processor, uma checagem de `deliveryStatus` no banco (já `SENT`?) evita reenviar mesmo que o job
rode de novo depois de um sucesso parcial anterior.

---

## Testes

**39. Qual é a estratégia de testes — o que é unitário, integração e E2E aqui?**
Unitário (274, API): toda `*.policy.ts` (regra pura, sem I/O) testada isolada, services com mock só
na fronteira real de I/O. Integração (141): contra Postgres/Redis REAIS, provando concorrência,
transação, RBAC. E2E (10, Playwright): browser real, incluindo o fluxo de reserva completo de
ponta a ponta.

**40. Por que testes de integração rodam contra Postgres/Redis reais, e não mockados?**
Porque a classe de bug que este domínio mais precisa provar que NÃO existe (race condition,
deadlock, comportamento real de transação) é exatamente a que um mock de Prisma não reproduz — um
mock nunca tem uma condição de corrida de verdade. É mais lento de propósito; "rápido com mock" e
"prova ausência de race condition" são objetivos diferentes, e este domínio precisava do segundo.

**41. Como um teste prova concorrência de verdade, e não é só um teste sequencial disfarçado?**
Disparando as N requisições com `Promise.all` SEM `await` entre os disparos — todas saem "ao mesmo
tempo" de verdade, não uma esperando a outra terminar. O teste então confirma que exatamente uma
teve sucesso e as outras receberam o erro esperado (409).

**42. O que vocês NÃO testaram, e por quê?**
Gateway de pagamento real (não existe ainda, é simulado — nada a testar de verdade). Leitura de QR
Code por câmera (não implementada). Carga/performance sob volume alto (fora do escopo de um teste
técnico — a suíte prova corretude sob concorrência, não throughput sob carga).

**43. Como a suíte lida com dados que se acumulam num banco de dev compartilhado entre execuções
locais?**
Nesta máquina específica (sem Docker), testes de integração locais rodam contra o MESMO Postgres
de dev — reservas de teste HELD/PAYMENT_PENDING podem se acumular. Documentado explicitamente como
característica do ambiente (não do design do sistema); em CI, cada job sobe infraestrutura efêmera
própria (`docker compose ... down -v` sempre no final), sem esse problema.

---

## Frontend e UX

**44. Por que a sessão do frontend não usa `localStorage`?**
Ver pergunta 26 — o access token fica só em memória (React state/Context), nunca em storage
persistente, especificamente para não anular o design do refresh token em cookie httpOnly (que já
foi pensado pra não expor um token de longa duração a XSS).

**45. Como o frontend lida com um access token expirado no meio do uso (sessão longa)?**
Renovação silenciosa proativa a cada 10 minutos (bem antes dos 15min de expiração) + um listener
de `visibilitychange` (cobre o caso de uma aba minimizada/suspensa por mais tempo que o timer
sozinho garantiria). Um refresh que falha de verdade (token expirado/revogado) limpa o estado
local, deixando o guard de rota redirecionar pro login de forma limpa — não um erro confuso na
tela.

**46. Qual é a estratégia de acessibilidade do projeto?**
`lang="pt-BR"` global, toda imagem com `alt`, nenhum `<div>` clicável sem role/label, formulários
com `<label>` associado, estados vazios/erro/loading sempre visíveis (nunca uma tela em branco),
tabelas com `overflow-x-auto` (nunca corta conteúdo em telas pequenas). Gap conhecido e documentado:
hierarquia de heading (`<h1>` ausente na maior parte do app autenticado) e foco preso incompleto no
componente de Modal.

**47. O botão "Consultar" numa categoria de cabine não reserva direto — por que não?**
Porque uma categoria de preço é um RESUMO (não tem uma cabine física associada) — a seleção de
verdade acontece no mapa do navio, onde cada cabine tem disponibilidade própria. O botão leva até
lá (âncora), em vez de fingir reservar a partir de um resumo que não tem informação suficiente pra
isso.

---

## Performance

**48. Qual índice vocês adicionaram por causa de um problema de performance real, e como
acharam?**
`BookingExperience` só tinha um índice composto `(bookingId, experienceId)` — mas a consulta de
disponibilidade de adicional filtra só por `experienceId` (não é a coluna líder desse índice
composto), então rodava sequential scan num hot path (toda leitura de disponibilidade + todo
`updateDetails`). Achado numa auditoria comparando o padrão de índice de `BookingExperience` contra
o de `EventReservation`/`DiningReservation` (que já tinham o índice certo para o mesmo tipo de
consulta) — corrigido com uma migration dedicada.

**49. Onde há N+1 no projeto, e por que não foi tudo corrigido?**
Cascata de cancelamento (cruzeiro → reservas → tickets → reservas de atividade) usa `updateMany`
em bulk desde a primeira versão, exatamente para evitar N+1 num cruzeiro com dezenas de reservas.
Um N+1 real e conhecido existe no dashboard do organizador (`getOccupancyByCategory`, uma query de
contagem por categoria×cruzeiro) — documentado como limitação conhecida, não corrigido nesta
rodada porque o volume de dado do cenário de demonstração não o torna um problema visível, e a
correção (um `groupBy` agregado) é direta quando o volume justificar.

---

## Meta / reflexão

**50. O que vocês fariam diferente se tivessem mais uma semana?**
Na ordem de impacto: (1) gateway de pagamento real em sandbox — é o maior "isso ainda é uma
simulação" visível; (2) separar `OrganizersService` em CRUD de tenant + um `OrganizerDashboardService`
de analytics, já que a mistura de responsabilidades ali é real (documentada, não escondida); (3)
um componente genérico de tabela/modal pro painel admin, reduzindo a duplicação real entre as ~14
páginas; (4) métricas mínimas (mesmo um `/metrics` simples) — hoje a observabilidade é só log
estruturado + health check, o que cobre esta fase mas não substitui um painel de métricas de
produção.
