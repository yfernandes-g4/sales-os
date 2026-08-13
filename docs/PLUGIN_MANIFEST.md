# Manifesto de plugins

Plugins do MVP são aplicações web declarativas.

```json
{
  "id": "crm-interno",
  "name": "CRM interno",
  "description": "Gestão do pipeline comercial",
  "startUrl": "https://crm.empresa.com/",
  "category": "CRM",
  "permissions": ["navigation", "notifications"],
  "enabled": true,
  "accent": "#665CF6"
}
```

## Campos

- `id`: identificador único em letras minúsculas, números e hífen;
- `name`: nome apresentado ao usuário;
- `description`: função operacional do aplicativo;
- `startUrl`: URL HTTP/HTTPS carregada ao abrir;
- `category`: `Produtividade`, `CRM`, `Comunicação`, `Dados` ou `Interno`;
- `permissions`: subconjunto de `navigation`, `notifications`, `media`, `downloads`;
- `enabled`: disponibilidade padrão;
- `accent`: cor hexadecimal usada no ícone gerado.

## Próxima versão

O manifesto poderá receber versão, publisher, assinatura, allowed origins, políticas de atualização, comandos e eventos de um SDK nativo.
