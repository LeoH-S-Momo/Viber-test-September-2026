# SeaPass — Backlog do Projeto

> Plataforma de comercialização e gestão de cruzeiros temáticos.
> Conceito: Booking (descoberta e reserva) + Sympla (eventos/ingressos) + sistema de gestão de cruzeiros (operação).
>
> Este documento é o backlog de referência para o teste técnico de desenvolvedor pleno. Não contém código — apenas escopo, histórias de usuário, modelo de dados e decisões de arquitetura a serem validadas antes da implementação.

---

## 1. Visão Geral

O SeaPass conecta três públicos:

1. **Passageiros** — descobrem cruzeiros temáticos, exploram navios/cabines/itinerários/eventos, reservam, pagam (simulado) e acompanham a viagem via ingresso digital.
2. **Organizadores** — empresas/produtoras que criam e administram seus próprios cruzeiros temáticos (line-up de eventos, cabines disponíveis, preços, parceiros).
3. **Administração da Plataforma (Global Admin)** — equipe interna do SeaPass, gerencia organizadores, navios cadastrados na plataforma, políticas, moderação de conteúdo e visão financeira agregada.

---

## 2. Personas

| Persona | Descrição | Objetivo principal |
|---|---|---|
| **Passageiro (Guest)** | Visitante não autenticado | Explorar catálogo de cruzeiros sem barreira |
| **Passageiro (Cliente)** | Usuário autenticado | Reservar cabine, comprar addons, acompanhar viagem |
| **Organizador (Admin do Cruzeiro)** | Dono/gestor de um cruzeiro temático | Criar e operar seu cruzeiro (navio, itinerário, cabines, eventos, preços) |
| **Operador do Organizador** | Membro da equipe do organizador com permissões restritas | Executar tarefas operacionais (check-in, suporte, gestão de eventos) sem acesso financeiro total |
| **Admin Global (SeaPass)** | Equipe interna da plataforma | Aprovar organizadores, moderar conteúdo, monitorar saúde da plataforma, suporte a disputas |

---

## 3. Mapa de Módulos (Domínios)

1. **Catálogo & Descoberta** — busca, filtros, temas, navios, itinerários
2. **Inventário do Navio** — decks, cabines, categorias de cabine, capacidade
3. **Itinerário & Eventos** — portos, datas, shows, palestras, experiências temáticas
4. **Restaurantes & Experiências** — reserva de mesas, experiências pagas/inclusas
5. **Reservas (Booking)** — carrinho, seleção de cabine, hóspedes, addons
6. **Pagamento Simulado** — checkout fake com estados (aprovado/recusado/pendente)
7. **Ingresso Digital** — geração de e-ticket/QR code, comprovante de embarque
8. **Acompanhamento de Viagem** — timeline da viagem, notificações, itinerário pessoal
9. **Conta do Passageiro** — perfil, histórico, documentos de viagem
10. **Painel do Organizador** — CRUD de cruzeiros, navios, cabines, eventos, preços, relatórios de vendas
11. **Painel Admin Global** — aprovação de organizadores, moderação, configuração da plataforma, analytics agregada
12. **Autenticação & Autorização** — multi-perfil (passageiro / organizador / admin), RBAC
13. **Notificações** — e-mail/in-app (confirmação de reserva, lembrete de embarque, mudanças de itinerário)

---

## 4. Épicos e Histórias de Usuário

### Épico A — Descoberta de Cruzeiros (Público)

- **US-A1**: Como visitante, quero pesquisar cruzeiros por tema (ex: "Rock", "Gastronomia", "Eletrônica"), data e porto de embarque, para encontrar uma viagem do meu interesse.
- **US-A2**: Como visitante, quero filtrar por preço, duração, navio e categoria de cabine, para refinar minha busca.
- **US-A3**: Como visitante, quero ver a página de um cruzeiro com descrição, line-up de eventos, navio, itinerário e faixa de preços, para decidir se compro.
- **US-A4**: Como visitante, quero ver detalhes do navio (decks, estrutura, comodidades, fotos), para conhecer a experiência a bordo.
- **US-A5**: Como visitante, quero ver o itinerário dia a dia (portos, datas, horários de embarque/desembarque), para planejar minha viagem.
- **US-A6**: Como visitante, quero ver a lista de restaurantes e experiências disponíveis no cruzeiro, para avaliar o que está incluso.
- **US-A7**: Como visitante, quero ver avaliações/nota média de cruzeiros passados do mesmo organizador ou navio, para embasar minha decisão.

### Épico B — Cabines e Inventário

- **US-B1**: Como passageiro, quero visualizar as categorias de cabine disponíveis (interna, externa, varanda, suíte) com preço e capacidade, para escolher a que cabe no meu orçamento.
- **US-B2**: Como passageiro, quero ver um mapa/planta do deck com a localização da cabine, para entender a posição no navio.
- **US-B3**: Como passageiro, quero ver a disponibilidade em tempo real de cabines por categoria, para evitar reservar algo esgotado.
- **US-B4**: Como organizador, quero cadastrar decks e cabines vinculados a um navio, definindo capacidade, categoria e preço-base, para compor o inventário do cruzeiro.

### Épico C — Reserva (Booking)

- **US-C1**: Como passageiro, quero selecionar uma cabine, informar os hóspedes (nome, documento, idade) e adicionar ao carrinho, para iniciar minha reserva.
- **US-C2**: Como passageiro, quero adicionar experiências/eventos pagos e reservas de restaurante à minha reserva, para personalizar minha viagem.
- **US-C3**: Como passageiro, quero ver o resumo do pedido com valor total antes de confirmar, para revisar antes de pagar.
- **US-C4**: Como passageiro, quero que o sistema bloqueie temporariamente a cabine selecionada durante o checkout (hold), para evitar overbooking por concorrência.
- **US-C5**: Como passageiro, quero cancelar ou alterar uma reserva dentro da política do organizador, para ter flexibilidade.

### Épico D — Pagamento Simulado

- **US-D1**: Como passageiro, quero escolher uma forma de pagamento simulada (cartão fake, Pix fake, boleto fake), para concluir a compra sem gateway real.
- **US-D2**: Como passageiro, quero receber feedback claro de aprovação, recusa ou pendência do pagamento simulado, para saber o status da minha reserva.
- **US-D3**: Como sistema, ao pagamento ser aprovado, a reserva deve mudar de status "pendente" para "confirmada" e gerar o ingresso digital automaticamente.
- **US-D4**: Como passageiro, quero simular reembolso ao cancelar uma reserva paga, para entender o fluxo financeiro completo.

### Épico E — Ingresso Digital

- **US-E1**: Como passageiro, quero receber um ingresso digital (e-ticket) com QR code após a confirmação do pagamento, para apresentar no embarque.
- **US-E2**: Como passageiro, quero baixar/visualizar o ingresso com dados da reserva (cabine, hóspedes, datas, itinerário resumido), a qualquer momento pela minha conta.
- **US-E3**: Como organizador/operador, quero validar o QR code do ingresso digital (check-in simulado), para confirmar o embarque do passageiro.

### Épico F — Acompanhamento de Viagem

- **US-F1**: Como passageiro, quero ver uma timeline da minha viagem (pré-embarque, embarque, dias no mar, portos, desembarque), para acompanhar o andamento.
- **US-F2**: Como passageiro, quero ver minha agenda pessoal de eventos e reservas de restaurante dentro da viagem, para organizar meu dia a bordo.
- **US-F3**: Como passageiro, quero receber notificações sobre mudanças de itinerário ou lembretes de embarque, para não perder informações importantes.

### Épico G — Conta do Passageiro

- **US-G1**: Como passageiro, quero criar conta e fazer login (e-mail/senha, e opcionalmente social login), para gerenciar minhas reservas.
- **US-G2**: Como passageiro, quero ver meu histórico de cruzeiros (passados, atuais, futuros), para acompanhar minha jornada.
- **US-G3**: Como passageiro, quero gerenciar meus dados pessoais e documentos de viagem, para manter minha conta atualizada.

### Épico H — Painel do Organizador

- **US-H1**: Como organizador, quero me cadastrar na plataforma e passar por um processo de aprovação, para poder publicar cruzeiros.
- **US-H2**: Como organizador, quero cadastrar um novo cruzeiro temático (tema, descrição, navio, datas, itinerário), para publicá-lo no catálogo.
- **US-H3**: Como organizador, quero gerenciar o line-up de eventos (shows, palestras, workshops) com data/hora/local a bordo, para compor a programação.
- **US-H4**: Como organizador, quero gerenciar restaurantes e experiências (capacidade, horários, se é incluso ou pago), para estruturar a oferta a bordo.
- **US-H5**: Como organizador, quero definir preços e políticas de cancelamento por categoria de cabine, para controlar minha estratégia comercial.
- **US-H6**: Como organizador, quero visualizar um dashboard de vendas (ocupação, receita simulada, reservas por status), para acompanhar o desempenho do meu cruzeiro.
- **US-H7**: Como organizador, quero convidar operadores da minha equipe com permissões restritas (ex: apenas check-in), para delegar tarefas operacionais.
- **US-H8**: Como organizador, quero publicar comunicados/alterações de itinerário que notificam os passageiros já reservados, para manter todos informados.

### Épico I — Painel Admin Global (Plataforma)

- **US-I1**: Como admin global, quero aprovar ou rejeitar cadastros de novos organizadores, para manter a qualidade da plataforma.
- **US-I2**: Como admin global, quero gerenciar o cadastro mestre de navios (para reuso entre organizadores, se aplicável), para padronizar dados de infraestrutura.
- **US-I3**: Como admin global, quero moderar conteúdo publicado (descrições, imagens, eventos) que viole diretrizes, para manter a plataforma segura.
- **US-I4**: Como admin global, quero ver analytics agregada da plataforma (GMV simulado, cruzeiros ativos, organizadores ativos, taxa de conversão), para acompanhar a saúde do negócio.
- **US-I5**: Como admin global, quero suspender/bloquear um organizador ou cruzeiro em caso de irregularidade, para mitigar riscos.
- **US-I6**: Como admin global, quero acessar logs de auditoria de ações críticas (aprovações, cancelamentos, mudanças de preço), para rastreabilidade.

### Épico J — Autenticação, Autorização e Segurança

- **US-J1**: Como sistema, devo suportar três perfis de acesso (passageiro, organizador, admin global) com permissões distintas (RBAC), para segregar responsabilidades.
- **US-J2**: Como sistema, devo impedir que um organizador acesse ou edite cruzeiros de outro organizador, para garantir isolamento de dados (multi-tenancy lógica).
- **US-J3**: Como sistema, devo validar e sanitizar todas as entradas de formulários públicos, para prevenir vulnerabilidades comuns (XSS, injection).

---

## 5. Modelo de Dados — Entidades Principais (alto nível)

```
User (passageiro | organizador | admin_operator | admin_global)
Organizer (empresa organizadora) 1---N CruiseTheme (cruzeiro temático)
Ship (navio) 1---N Deck 1---N Cabin
CruiseTheme 1---1 Ship
CruiseTheme 1---N ItineraryStop (porto, data, hora chegada/saída)
CruiseTheme 1---N Event (show, palestra, workshop — local a bordo, horário)
CruiseTheme 1---N Restaurant 1---N DiningSlot (horário/mesa)
CruiseTheme 1---N CabinCategoryPricing (categoria, preço, política de cancelamento)
Booking (User + CruiseTheme + Cabin) 1---N Guest
Booking 1---N BookingAddon (evento pago, mesa reservada, experiência)
Booking 1---1 Payment (simulado: status, método, valor, timestamps)
Booking 1---1 DigitalTicket (QR code, estado de check-in)
Notification (User, tipo, canal, status)
AuditLog (ator, ação, entidade afetada, timestamp)
```

**Pontos de atenção de modelagem:**
- `Booking` precisa de máquina de estados clara: `carrinho → aguardando_pagamento → confirmada → check-in → em_viagem → concluída` / `cancelada` / `reembolsada`.
- Necessário mecanismo de **hold temporário** de cabine durante checkout para evitar overbooking (ex: TTL de 10–15 min).
- `CabinCategoryPricing` deve suportar preço dinâmico por período (alta/baixa temporada) — opcional para v2.
- Multi-tenancy lógica: todo dado de `Organizer` deve ser filtrado por `organizer_id` nas queries do painel do organizador.

---

## 6. Requisitos Não Funcionais

- **Responsivo**: fluxo de descoberta e reserva deve funcionar bem em mobile (público final compra por celular).
- **Performance**: catálogo com busca/filtro deve responder rápido mesmo com paginação de muitos cruzeiros.
- **Segurança**: autenticação robusta, RBAC por perfil, proteção contra IDOR (ex: passageiro acessando reserva de outro usuário via ID na URL).
- **Auditabilidade**: ações administrativas críticas (aprovação, bloqueio, mudança de preço) devem ser logadas.
- **Consistência de dados**: reserva e pagamento devem ser transacionais (evitar reserva "confirmada" sem pagamento correspondente).
- **Testabilidade**: regras de negócio centrais (disponibilidade de cabine, cálculo de preço, máquina de estados da reserva) devem ter cobertura de testes automatizados.
- **Simulação realista de pagamento**: deve haver cenários determinísticos para aprovado/recusado/pendente (ex: por valor ou flag de teste), para permitir testes automatizados e QA manual.

---

## 7. Fora de Escopo (v1)

- Integração com gateway de pagamento real.
- Emissão de documentos fiscais reais (NF-e).
- Integração com sistemas reais de companhias marítimas.
- App mobile nativo (apenas web responsivo).
- Pagamento internacional multi-moeda.

---

## 8. Considerações Técnicas a Definir com o Time

Estas decisões impactam a modelagem e devem ser fechadas antes do início da implementação:

1. **Stack** (frontend/backend/banco de dados) — a definir conforme requisitos do teste técnico.
2. **Estratégia de autenticação** — JWT próprio vs. provedor (ex: Auth0/Clerk) vs. sessão simples.
3. **Estrutura de projeto** — monorepo (frontend + backend juntos) vs. repositórios separados.
4. **Geração de QR code do ingresso** — biblioteca client-side vs. server-side.
5. **Nível de fidelidade do pagamento simulado** — apenas mudança de status vs. simulação de webhook assíncrono (mais realista para demonstrar conhecimento de arquitetura).

---

## 9. Priorização Sugerida (MoSCoW para v1 do teste técnico)

**Must have**
- Catálogo de cruzeiros + página de detalhe (A1–A6)
- Cabines com disponibilidade (B1–B3)
- Fluxo de reserva completo (C1–C3)
- Pagamento simulado com máquina de estados (D1–D3)
- Ingresso digital com QR (E1–E2)
- Autenticação multi-perfil + RBAC básico (J1)
- Painel do organizador: CRUD de cruzeiro, navio, cabines, eventos (H2–H5)
- Painel admin global: aprovação de organizador (I1)

**Should have**
- Dashboard de vendas do organizador (H6)
- Acompanhamento de viagem / timeline (F1–F2)
- Check-in via QR (E3)
- Analytics agregada do admin global (I4)

**Could have**
- Avaliações de cruzeiros passados (A7)
- Notificações automáticas (F3, H8)
- Operadores com permissões restritas (H7)
- Auditoria completa (I6)

**Won't have (v1)**
- Preço dinâmico por temporada
- Multi-moeda
- App nativo

---

*Documento vivo — atualizar conforme decisões forem tomadas com o time/avaliador do teste técnico.*
