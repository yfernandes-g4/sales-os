# Macro Studio

O Macro Studio grava e reproduz interações dentro dos plugins web do Sales OS.

## Capacidades

- gravação de cliques em botões e links;
- gravação de alterações em inputs, textareas e selects;
- etapa inicial de navegação;
- editor para nome, descrição, aplicativo, rótulos, seletores e esperas;
- tipos de execução: ações, coleta ou híbrida;
- parâmetros tipados de entrada (texto, número e booleano);
- variáveis `{{input.chave}}` e `{{output.chave}}` nas etapas;
- etapa de extração de texto, valor, link ou atributo;
- saída esperada como resumo, JSON, tabela, abas ou nenhuma;
- critérios de sucesso: mínimo processado, máximo de falhas, saída obrigatória e todas as etapas obrigatórias;
- resultado estruturado com status, processadas, falhas e outputs;
- execução sequencial com progresso, cancelamento e mensagens de erro;
- persistência local junto à configuração do workspace.

## Segurança

Campos com `type=password` e elementos identificados como password, token, secret, OTP ou one-time code são ignorados. O gravador não persiste cookies nem credenciais da sessão. Macros ficam limitadas ao aplicativo em que foram criadas.

## Seletores

A gravação prioriza, nesta ordem:

1. `id`;
2. `data-testid`, `data-test` ou `data-qa`;
3. atributo `name`;
4. caminho CSS estrutural limitado.

Seletores podem ser corrigidos manualmente no editor quando uma aplicação alterar seu DOM.

## Contrato de execução

Cada macro é definida por quatro blocos:

1. **Entradas:** parâmetros solicitados antes de executar;
2. **Etapas:** ações, esperas, navegações e extrações;
3. **Saída:** formato esperado para os dados retornados;
4. **Critérios de sucesso:** regras usadas para classificar a execução.

O resultado pode alimentar futuras composições entre macros por meio das chaves de output.

## Limites atuais

- não atravessa iframes cross-origin;
- não grava atalhos de teclado ou drag-and-drop;
- contém variáveis simples, mas ainda não possui condições ou loops;
- não executa em segundo plano nem por agendamento;
- CAPTCHA, MFA e autenticação permanecem sob controle humano.
