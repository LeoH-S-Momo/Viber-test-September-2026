# features/

Organização por domínio de negócio (screaming architecture), não por tipo técnico. Cada subpasta agrupa tudo que uma feature precisa: componentes específicos, hooks, chamadas de serviço e tipos locais.

Features atuais:

```
features/
  cruise-discovery/   # home, listagem e filtros de cruzeiros
  cruise-detail/       # pagina de detalhe de um cruzeiro (hero, itinerario, cabines...)
  ship-map/            # mapa interativo do navio (decks, cabines, venues, restaurantes)
  booking/             # fluxo de reserva (hold -> hospedes -> pagamento), ver ADR-0020
  trip/                # "Minha viagem" pos-reserva (timeline, tickets, atividades)
  organizer/           # portal do organizador
  admin/               # painel administrativo global
```

Regra: uma feature pode importar de `components/`, `lib/`, `hooks/` e `services/`, mas outra feature não deve importar diretamente de dentro de uma feature vizinha — extraia para `components/` ou `lib/` se precisar compartilhar.

**Exceção documentada:** `features/booking/cabin-booking-flow.tsx` importa `ShipMap` direto de
`features/ship-map/` — é a ponte deliberada entre o mapa (informativo por si só) e o fluxo de
reserva de verdade (o botão "Selecionar cabine" do mapa só ganha efeito quando `booking` fornece
o handler). Promover `ShipMap` pra `components/` quebraria a organização por domínio sem ganho
real, já que ele só faz sentido dentro do contexto de um cruzeiro; a regra acima vale pra
importações incidentais entre features não-relacionadas, não pra uma composição intencional como
esta.
