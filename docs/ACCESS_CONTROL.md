# Controle de acesso por cargo

O MVP contém autenticação simulada para demonstrar provisionamento de aplicativos por função.

## Perfis

### Administrador

- visualiza todo o catálogo;
- acessa o painel administrativo;
- configura disponibilidade e instalação padrão por cargo;
- gerencia aplicativos e configurações locais.

### SDR

- visualiza HubSpot, Salesforce e Plataforma Comercial;
- recebe HubSpot e Plataforma Comercial pré-instalados;
- não acessa o painel administrativo.

### Coordenador

- visualiza Gmail, Calendar, Notion, Looker Studio, Performance Comercial e Enablement Comercial;
- recebe Gmail, Calendar e Performance Comercial pré-instalados;
- não acessa o painel administrativo.

## Política

Cada cargo possui:

- `visiblePluginIds`: aplicativos que aparecem no catálogo e podem ser abertos;
- `defaultInstalledPluginIds`: aplicativos provisionados automaticamente ao acessar;
- descrição administrativa do escopo.

As políticas ficam persistidas no estado local do workspace. O painel permite alterar disponibilidade e instalação padrão.

## Defesa em profundidade

O filtro não existe somente no React. O processo principal valida a sessão e a política antes de:

- listar o catálogo;
- instalar um aplicativo;
- abrir um aplicativo;
- acessar ou alterar políticas;
- executar funções administrativas.

Assim, chamadas IPC manuais não permitem que um SDR abra um aplicativo fora de sua política.

## Limites do demo

- usuários são simulados e não possuem senha;
- sessões vivem somente durante a execução atual do Sales OS;
- não há backend de identidade, SSO ou sincronização central;
- em produção, cargos e políticas deverão vir de um serviço administrativo assinado e auditável.
