# ADR-0003: pnpm com `node-linker=hoisted` (por causa do Windows)

## Status
Aceito

## Contexto
O ambiente de desenvolvimento de referência deste projeto é Windows. Ao rodar `next build`
(output `standalone`) com o `node_modules` padrão do pnpm (baseado em symlinks), o build falha:

```
Error: EPERM: operation not permitted, symlink '...\node_modules\.pnpm\react@19...' -> '...\.next\standalone\...\node_modules\react'
```

O tracing de arquivos do Next.js (`@vercel/nft`) recria a estrutura de `node_modules` dentro de
`.next/standalone`, e tenta preservar symlinks quando a origem já é um symlink (como é o caso do
`node_modules` do pnpm). Criar symlinks no Windows exige `SeCreateSymbolicLinkPrivilege`
(administrador ou "Developer Mode" habilitado) — privilégio que não podemos assumir que todo
avaliador/desenvolvedor tenha habilitado.

Esse problema é específico do **build nativo no Windows**. Não ocorre em:
- `pnpm dev` (não faz tracing/output standalone);
- builds Docker (containers Linux, sem essa restrição de ACL);
- CI no GitHub Actions (runners Ubuntu).

## Decisão
Adicionar `.npmrc` na raiz com `node-linker=hoisted`, que faz o pnpm montar um `node_modules`
"achatado" (mais parecido com npm/yarn clássico) para dependências de terceiros, em vez da
estrutura padrão baseada em symlinks. Pacotes do próprio workspace (`@seapass/*`) continuam
linkados normalmente entre si — isso não afeta o isolamento entre `apps/web`, `apps/api` e os
`packages/*`.

*Alternativa considerada:* pedir para cada desenvolvedor habilitar "Developer Mode" no Windows
ou rodar o terminal como administrador. Rejeitada por depender de uma configuração de máquina
fora do controle do repositório — `node-linker=hoisted` resolve o problema para todo mundo,
sem exigir nada do ambiente local.

## Consequências
- `next build` funciona nativamente no Windows sem privilégios elevados.
- Perdemos parte do isolamento estrito de dependências que o linker padrão do pnpm garante
  (uma dependência não declarada de um pacote pode, em teoria, "vazar" de outro workspace via
  hoisting) — trade-off aceitável para um monorepo deste tamanho, e não observável na prática
  aqui.
- Builds Docker e CI continuam funcionando da mesma forma (o `.npmrc` vale para qualquer
  ambiente que rode `pnpm install`, não é uma gambiarra local).
