# Sales OS MVP

Aplicativo desktop baseado em Electron/Chromium para centralizar as ferramentas usadas pela operação comercial.

## Funcionalidades

- home operacional com favoritos e acessos recentes;
- catálogo corporativo de aplicações;
- instalação, remoção, favoritos e habilitação local;
- execução de aplicações web em `WebContentsView` isolado;
- múltiplos aplicativos mantidos vivos em segundo plano, acessíveis pela barra lateral;
- múltiplas abas por aplicativo, exibidas no topo;
- links com `target=_blank` e `window.open`, como deals do HubSpot, capturados como novas abas internas;
- menu de contexto nativo com copiar, recortar, colar, selecionar tudo, abrir/copiar links, imagens e navegação;
- retorno instantâneo ao mesmo estado do aplicativo e de cada aba, sem recarregar ao alternar;
- cookies, storage e sessões persistentes compartilhados pelas abas do mesmo aplicativo e isolados entre aplicativos;
- restauração dos aplicativos e respectivas abas após reiniciar o Sales OS;
- controles de voltar, avançar, recarregar, ocultar e encerrar;
- cadastro de aplicações web personalizadas;
- importação e exportação da configuração do workspace;
- Macro Studio com gravação de cliques e preenchimentos, editor de etapas e reprodução;
- proteção automática contra captura de senhas, tokens, OTPs e campos sensíveis;
- renderer isolado, sem acesso direto a Node.js ou ao sistema de arquivos.

## Requisitos

- Node.js 20 ou superior;
- npm 10 ou superior;
- Windows 10/11 para o piloto inicial.

## Executar

```bash
npm install
npm run dev
```

O Vite inicia a interface em `127.0.0.1:5173` e o Electron abre a janela desktop.

## Validar e gerar build

```bash
npm run typecheck
npm test
npm run build
npm start
```

O build local é gerado em `dist/`. Este MVP ainda não produz instalador assinado.

## Adicionar um plugin

Use **Administração → Adicionar aplicativo**, ou edite `resources/plugins.json`. Consulte [docs/PLUGIN_MANIFEST.md](docs/PLUGIN_MANIFEST.md).

## Segurança

- `contextIsolation: true`;
- `nodeIntegration: false`;
- renderer em sandbox;
- IPC mínimo e explícito;
- URLs customizadas limitadas a HTTP/HTTPS;
- permissões de mídia e notificações dependem do manifesto;
- credenciais permanecem nas sessões Chromium dos próprios serviços.

## Limites do MVP

O Macro Studio inicial executa cliques, preenchimentos, navegação e esperas no aplicativo associado. Condições, loops, variáveis, agendamento e sincronização remota ainda não fazem parte deste corte.

Não há backend, SSO próprio, assinatura de plugins, telemetria central ou controle remoto. A base foi separada para receber essas camadas posteriormente. Controle remoto deverá sempre exigir consentimento visível e auditoria.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Manifesto de plugins](docs/PLUGIN_MANIFEST.md)
- [Macro Studio](docs/MACRO_STUDIO.md)
- [Roadmap](docs/ROADMAP.md)
