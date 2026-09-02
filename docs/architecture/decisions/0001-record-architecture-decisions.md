# ADR-0001: Registrar decisões de arquitetura em ADRs

## Status
Aceito

## Contexto
O SeaPass é um projeto de teste técnico onde a maturidade do processo de decisão é tão avaliada quanto o código em si. Decisões de stack e estrutura tomadas sem registro tendem a ser questionadas ou revertidas sem contexto do porquê.

## Decisão
Toda decisão de arquitetura relevante (escolha de tecnologia, padrão estrutural, trade-off aceito) é registrada como um ADR nesta pasta, seguindo o formato: Status, Contexto, Decisão, Consequências. Numeração sequencial, arquivo nunca editado retroativamente — decisões revistas geram um novo ADR que supersede o anterior.

## Consequências
- Qualquer pessoa entrando no projeto entende o "porquê" sem precisar perguntar.
- Pequeno overhead de escrita a cada decisão importante — aceitável dado o ganho de rastreabilidade.
