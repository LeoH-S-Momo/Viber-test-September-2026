# features/

Organização por domínio de negócio (screaming architecture), não por tipo técnico. Cada subpasta agrupa tudo que uma feature precisa: componentes específicos, hooks, chamadas de serviço e tipos locais.

Exemplo esperado:

```
features/
  cruise-discovery/
  booking-flow/
  digital-ticket/
  organizer-dashboard/
  admin-console/
```

Regra: uma feature pode importar de `components/`, `lib/`, `hooks/` e `services/`, mas outra feature não deve importar diretamente de dentro de uma feature vizinha — extraia para `components/` ou `lib/` se precisar compartilhar.
