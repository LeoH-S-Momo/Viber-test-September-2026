# ADR-0015: Minha Viagem — a experiência central do passageiro

## Status
Aceito

## Contexto
As etapas anteriores construíram cada peça isoladamente: ingresso digital (ADR-0013), eventos e
restaurantes reserváveis (ADR-0014), auth no frontend (ADR-0013). Faltava juntar tudo numa única
tela central que responda, de forma rápida e visual, à pergunta que qualquer passageiro tem durante
a viagem: **"onde eu preciso estar e o que tenho para fazer?"** — e não uma lista de seções
desconexas, e sim uma experiência parecida com um app de viagem de verdade, com uma timeline dia a
dia no centro.

## O que a página mostra — tudo com dado real, nada fabricado
`/reservas` ("Minha Viagem") já existia (ADR-0014) com um resumo básico + reserva de atividades.
Esta etapa a reconstrói como a página central: cruzeiro, navio, cabine, passageiros, ingresso+QR
Code por hóspede, itinerário, eventos reservados, restaurantes, experiências, status de check-in e
uma timeline dia a dia — cada dado vindo de uma API real (`GET /bookings/me`, `GET /tickets/me`,
`GET /cruises/:slug`), nunca inventado no cliente. Isso valeu uma regra de design explícita seguida
em toda a página: **se não há um horário real por trás de um compromisso, ele não ganha um horário
fabricado na tela** — aparece como "horário a confirmar" em vez de um relógio inventado (ver a
timeline, abaixo).

## A timeline — o núcleo da experiência
`apps/web/src/lib/trip-timeline.ts` (`buildTripTimeline`, função pura e testada em isolamento) monta
os dias da viagem a partir de quatro fontes:
- **Embarque/desembarque**: sempre `Cruise.embarkationDate`/`disembarkationDate` (nunca o
  `arrivalAt`/`departureAt` da parada de itinerário correspondente, que pode ser nulo) — a única
  fonte garantidamente não-nula para esses dois compromissos.
- **Paradas de porto** (`ItineraryStop`): uma entrada de "Chegada" e/ou "Partida" por parada, a
  partir de `arrivalAt`/`departureAt` reais; quando NENHUM dos dois existe, a parada ainda aparece
  no dia certo (via `dayNumber`, que já é um dado real do backend), só que sem horário.
- **Eventos e restaurantes reservados**: `EventReservation.event.startAt` e a combinação
  `reservationDate` + `DiningSlot.startTime` (mesmo `combineDateAndTime` do backend — ver
  ADR-0014 — replicado aqui porque o cliente precisa da janela absoluta pra ordenar, não só validar).
- **Check-in**: só aparece na timeline quando JÁ aconteceu de verdade — `CheckIn.checkedInAt`, lido
  via um campo novo em `GET /tickets/me` (ver abaixo). Um check-in ainda pendente não fabrica uma
  entrada com horário adivinhado; ele só aparece como status no cartão de ingresso do hóspede (ver
  "Ingressos", abaixo) — nunca como um item de horário incerto na timeline.

`Experience` fica **de fora da timeline** de propósito: o modelo não tem nenhum campo de horário
(só `durationMinutes`, sem `startAt`) — não há como posicioná-la de verdade num compromisso do dia.
Continua com sua própria seção, somente leitura (ver ADR-0014 sobre por que "adicionar" uma
experiência depois de `CONFIRMED` está fora de escopo).

Cada dia agrupa e ordena seus itens cronologicamente (itens sem horário vêm primeiro); o número do
dia usa a mesma comparação por dia (não hora) já estabelecida em `assertDateWithinCruise`
(ADR-0014) — dia do embarque = dia 1.

### "Próximo na sua agenda" — a resposta direta, antes de rolar a página
`TripTimeline.nextUp`: o primeiro item, entre TODOS os dias, cujo horário real é `>= now`. Exibido
em destaque no topo (`TripHero`), antes de qualquer outra seção — é a resposta objetiva ao "onde eu
preciso estar" sem o usuário precisar procurar.

## "Permita adicionar/remover atividades quando as regras permitirem"
Cada linha da timeline que representa uma reserva cancelável (evento ou restaurante) ganha um botão
"Remover" inline — chama os mesmos endpoints de cancelamento de ADR-0014, e a timeline inteira
recarrega a partir do estado real do servidor (nunca uma remoção otimista sem confirmação). Um
painel "Adicionar ao roteiro" abaixo da timeline reaproveita os formulários de reserva de evento/
restaurante já existentes (ADR-0014) — continuam sujeitos às mesmas regras de capacidade e conflito
de horário do backend, que é quem de fato decide "quando as regras permitirem", nunca o frontend.
Experiências continuam somente leitura (mesma razão de sempre — ver acima).

## Backend: o que faltava para "Minha Viagem" enxergar o check-in
`GET /tickets/me` não devolvia nem `Booking.id` nem o horário/local do check-in — só dava pra saber
`Ticket.status`. Dois campos novos adicionados a `TicketsRepository.findMine`:
- `booking.id`, pra correlacionar um ticket com a reserva certa exibida em Minha Viagem (join por
  `bookingGuestId`/`booking.id`, nunca por nome — nome não é chave confiável).
- `checkIns` (o mais recente, `orderBy checkedInAt desc, take 1`) — `checkedInAt` e `location`, pra
  o passageiro ver quando e onde fez check-in, não só que fez. Continua sem uma rota
  passageiro-facing dedicada de "meu status de check-in" — o próprio `Ticket.status` + o novo
  `checkIns[0]` já bastam, evitando duplicar o que `/check-in/lookup` (staff-only) já expõe de outra
  forma.

Mudança puramente aditiva ao `select` — nenhum contrato existente quebra (`test/unit/tickets.service.spec.ts`
continua passando sem alteração; `check-in.e2e-spec.ts` ganhou dois testes novos confirmando os
campos).

## Arquitetura do frontend
`apps/web/src/features/trip/` (novo, mesmo padrão de pasta por feature de `features/cruise-detail/`):
`trip-hero.tsx` (cabeçalho + "próximo na agenda"), `trip-timeline-view.tsx` (a timeline visual),
`trip-tickets.tsx` (cartões de ingresso/QR por hóspede, estilo "boarding pass"), `trip-info.tsx`
(cabine, navio, embarque/desembarque, documentos por passageiro), `trip-experiences.tsx` (lista
somente leitura), `add-activity-forms.tsx` (os dois formulários de reserva, movidos daqui de dentro
da página). `apps/web/src/app/(passenger)/reservas/page.tsx` orquestra: busca `bookings/me` +
`tickets/me` em paralelo, depois o catálogo do cruzeiro (`GET /cruises/:slug`, mesmo padrão de
ADR-0014), monta a timeline com `useMemo`, e renderiza cada seção.

## Testes
- **Unitário** (`tests/unit/trip-timeline.test.ts`, Vitest): a função pura `buildTripTimeline` —
  embarque/desembarque nos dias certos, combinação de data+hora de restaurante, ordenação
  cronológica dentro do dia, parada de porto sem horário (aparece sem horário, não some), parada com
  chegada E partida (duas entradas), check-in real refletido sem horário fabricado, reservas
  canceladas excluídas, `nextUp` ignorando itens passados e retornando `null` quando não há nenhum
  futuro.
- **Integração** (extensão de `check-in.e2e-spec.ts`): `GET /tickets/me` expõe `bookingGuestId`,
  `booking.id` e `checkIns: []` antes de qualquer check-in; depois de um check-in real, expõe
  `checkIns[0].location` e um `checkedInAt` válido.
- **Verificação visual real** (Playwright, mesmo padrão de ADR-0013/0014): login, página completa
  carregada com timeline de 4 dias, cabeçalho com "próximo compromisso", dois cartões de ingresso
  (um com check-in feito e QR Code, outro pendente), seção de informações importantes com documentos
  reais dos dois hóspedes, e remoção de uma reserva de restaurante refletida imediatamente na
  timeline. Sem erros de console além do 401 esperado do refresh silencioso antes do login.

## Consequências
- Um check-in que aconteça (por qualquer motivo) antes do dia de embarque produz um "Dia -1" (ou
  0) na timeline — matematicamente correto (`dayNumberFor` não trava em 1), mas um cenário que só
  ocorre em dados de teste artificiais; em uso real o check-in sempre acontece no dia do embarque em
  diante. Nenhum tratamento especial foi adicionado para não mascarar um dado real, mesmo que
  incomum.
- Reembarque após parada em porto (múltiplos check-ins por ticket) continua fora de escopo, como já
  documentado desde ADR-0013 — `checkIns` já é um array pronto para isso; a timeline já mostraria
  cada check-in real que existisse, sem mudança nenhuma.
