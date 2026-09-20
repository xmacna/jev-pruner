# Integração do jev-pruner no Argos — 20/09/2026

## Resultado

O fork OpenRouter foi atualizado do upstream `47d017c` sem perder o provedor
alternativo. O wrapper Codex agora seleciona TypeSafe ou OpenRouter por ambiente,
mantém código e documentos inteiros fora da poda e limita o OpenRouter a seis
requisições por comando. Se a cobertura ficar incompleta, o conteúdo não avaliado
permanece verbatim; falha de rede, autenticação, orçamento ou retenção devolve o
stdout original.

## Evidência

| Prova | Resultado | Relógio | Pico RSS |
| --- | --- | ---: | ---: |
| Reprodução antiga em `193a1bd` | 67.912 caracteres, 11 chamadas simuladas, recibo `RFA-KEEP-130` perdido | 0,09 s | 77.640 KB |
| Reprodução integrada | 67.912 caracteres, 3 chamadas simuladas, decisão `budget_unfit`, original exato | 0,34 s | 89.044 KB |
| SHA-256 entrada/saída integrada | `c967c4cc040f97ca361f8d8c4142dc8d3448e62c8e2649b403230e39b521cbd0` em ambos | incluído acima | incluído acima |
| Suíte offline | 291/291 testes | 3,58 s | 344.840 KB |
| Typecheck | verde | 1,49 s | 273.228 KB |
| Build | verde | 0,78 s | 271.240 KB |
| Validação do plugin Claude | verde; aviso preexistente de `author` ausente | 0,87 s | 211.248 KB |
| Avaliação OpenRouter final | 7/7 testes, 21 chamadas, US$ 0,014210448 | 6,09 s | 112.772 KB |

A investigação live completa, incluindo rodadas deliberadamente falhas para
isolar fixtures e concorrência, somou 106 respostas cobradas e US$ 0,059834292.
Em fixtures antigas com 8 a 18 chamadas simultâneas, uma chamada do endpoint
alpha ficou pendente até o timeout de 90 s em duas rodadas. Com até seis chamadas,
a bateria final concluiu em 6,09 s. Por isso o perfil OpenRouter do wrapper Codex
usa cinco requisições adicionais, seis no total.

O `npm ci` informou cinco vulnerabilidades transitivas já presentes no lockfile
(três moderadas, uma alta e uma crítica). Nenhum `npm audit fix --force` foi
aplicado, pois isso alteraria dependências sem diagnóstico de compatibilidade.

## Contrato operacional do piloto

- O marketplace local está registrado no catálogo do Codex, com o plugin
  desabilitado globalmente e habilitado somente no projeto Argos.
- A skill é opt-in: apenas comandos explicitamente envolvidos pelo wrapper são
  candidatos à poda.
- Só stdout acima de 10.000 tokens estimados é elegível.
- Código, diff, JSON/XML/YAML e material classificado como referência passam
  inteiros, sem chamada ao Jev.
- Antes da primeira chamada, o stdout integral é salvo em `.jev-pruner/`, que se
  autoignora no Git; o resultado podado cita esse caminho.
- Ausência de `CODEX_THREAD_ID`, transcript correspondente, credencial ou rede
  mantém o stdout exato.
- Rollback: remover as entradas `jev-pruner-codex` do `.codex/config.toml` do
  Argos, executar `codex plugin remove jev-pruner@jev-pruner-codex` e remover o
  marketplace local. Nenhum dado de usuário ou credencial fica no repositório.

## Limite conhecido

O endpoint OpenRouter usado é alpha. A bateria final comprova retenção e custo no
perfil curto, mas não constitui SLA. O limite de seis chamadas evita o regime que
falhou durante a investigação e prefere reter conteúdo não avaliado a aumentar
latência ou risco de perda.
