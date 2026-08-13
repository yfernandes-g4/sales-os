# Macro Studio

O Macro Studio grava e reproduz interações dentro dos plugins web do Sales OS.

## Primeiro corte

- gravação de cliques em botões e links;
- gravação de alterações em inputs, textareas e selects;
- etapa inicial de navegação;
- editor para nome, descrição, aplicativo, rótulos, seletores e esperas;
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

## Limites atuais

- não atravessa iframes cross-origin;
- não grava atalhos de teclado ou drag-and-drop;
- não contém condições, loops ou variáveis;
- não executa em segundo plano nem por agendamento;
- CAPTCHA, MFA e autenticação permanecem sob controle humano.
