# Integração do jev-pruner para o Argos

**Objetivo:** incorporar o upstream `47d017c` à variante OpenRouter do Rafael, provar que o pruner preserva informação necessária sob orçamento e preparar um piloto opt-in, sem ativação global.

**Base:** `origin/main` em `fe3ba01`, que contém os commits OpenRouter `098f08a..193a1bd` e a configuração canônica do Codex. O upstream comum é `93d4c5c`; o alvo é `upstream/main` em `47d017c`.

## Restrições

- Não alterar nem trocar a branch do checkout original `~/repos/jev-pruner`.
- Não fazer push para `upstream`; publicar somente no fork `origin` depois da revisão.
- Preservar suporte TypeSafe e OpenRouter, sem registrar credenciais.
- Erro, timeout, 429, resposta incerta ou retenção impossível devolve o conteúdo original.
- JSON/XML/YAML, diff, código, documento, stderr e comando com falha mantêm os bypasses definidos pelo produto.
- O wrapper Codex é opt-in; shell comum não deve parecer interceptado.
- Nenhuma ativação global ou instalação de `fast-jev-compaction` nesta etapa.

## Task 1 — incorporar upstream sem perder OpenRouter

- [x] Reproduzir a perda conhecida em `193a1bd` com zero chamadas reais.
- [x] Mesclar `upstream/main` no checkout isolado e resolver conflitos preservando as duas linhas de evolução.
- [x] Instalar dependências pelo lock e executar testes/typecheck/build antes de mudanças próprias.
- [x] Confirmar por testes que seleção de provedor, endpoint, modelo, custo e fallback OpenRouter continuam válidos.

## Task 2 — regressões do contrato do Argos

- [x] Adicionar teste do recibo obrigatório com escore simulado 0,99 e orçamento de 8.000 caracteres.
- [x] Cobrir falha/refinamento insuficiente e garantir retorno exato do original quando o necessário não cabe.
- [x] Cobrir bypasses e recuperação integral por hash sem depender de precisão do modelo.
- [x] Rodar o reprodutor arquivado contra a integração e registrar chamadas, bytes, tempo e RSS.

## Task 3 — harness real e piloto opt-in

- [x] Validar plugin Claude e wrapper Codex na versão instalada, sem habilitação global.
- [x] Provar contexto/ID ausente como bypass, nunca como uso do transcript de outra sessão.
- [x] Se houver credencial dedicada disponível, executar avaliação live pequena e registrar custo total, latência e retenção; caso contrário, registrar a limitação sem simular prova live.
- [x] Documentar instalação reversível no Argos, elegibilidade acima de 10k tokens e arquivo integral recuperável.

## Porta final

- Suíte offline, typecheck, build e validação de plugin verdes.
- Reprodução de `required_receipt` preserva o dado ou retorna exatamente o original.
- OpenRouter e TypeSafe mantêm contratos separados e testados.
- Nenhuma configuração global, credencial, ativação automática ou push upstream.
- Relatório separa teste offline, integração local, live e ainda não medido.
