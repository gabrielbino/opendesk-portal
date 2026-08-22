# Guia de Permissões — Portal OpenDesk

Este documento serve como referência obrigatória sempre que um novo módulo ou submódulo for criado no sistema. Ele descreve os passos necessários para integrar corretamente o novo módulo ao sistema de permissões granulares (CRUD por módulo).

---

## Arquitetura de Permissões

O sistema utiliza permissões granulares por módulo, onde cada módulo pode ter 4 ações independentes:

| Ação | Constante | Descrição |
|------|-----------|-----------|
| Ler | `ACTIONS.READ` | Visualizar dados do módulo |
| Criar | `ACTIONS.CREATE` | Criar novos registros |
| Editar | `ACTIONS.UPDATE` | Alterar registros existentes |
| Excluir | `ACTIONS.DELETE` | Remover registros |

As permissões são armazenadas como JSON no campo `permissions` da tabela `users` e `sys_permission_groups`:

```json
{
  "suporte": { "create": true, "read": true, "update": true, "delete": false },
  "desenvolvimento": { "create": true, "read": true, "update": true, "delete": true }
}
```

---

## Checklist para Novo Módulo

Ao criar um novo módulo, siga **todos** os passos abaixo:

### 1. Registrar no `shared/permissions.ts`

Adicione a constante do módulo no objeto `MODULES`:

```ts
export const MODULES = {
  // ... módulos existentes
  NOVO_MODULO: 'novo_modulo',
} as const;
```

### 2. Atualizar `MODULE_LABELS` nos componentes de UI

Atualize os labels nos seguintes arquivos:

- `client/src/components/PermissionsDialog.tsx` — Dialog de permissões individuais do usuário
- `client/src/pages/PermissionGroupsManagement.tsx` — Gerenciamento de grupos (hierarquia `MODULE_HIERARCHY`)

### 3. Proteger rotas no Backend

Use o middleware `requirePermission` nos procedures tRPC:

```ts
import { requirePermission } from "../permissionMiddleware";
import { MODULES, ACTIONS } from "@shared/permissions";

export const novoModuloRouter = router({
  list: protectedProcedure
    .use(requirePermission(MODULES.NOVO_MODULO, ACTIONS.READ))
    .query(async ({ ctx }) => { /* ... */ }),
    
  create: protectedProcedure
    .use(requirePermission(MODULES.NOVO_MODULO, ACTIONS.CREATE))
    .input(/* ... */)
    .mutation(async ({ ctx, input }) => { /* ... */ }),
});
```

### 4. Proteger rotas no Frontend

Use o componente `PermissionGuard` no `App.tsx`:

```tsx
import { PermissionGuard } from "./components/PermissionGuard";
import { MODULES } from "@shared/permissions";

<Route path="/novo-modulo">
  <ProtectedRoute component={() => (
    <PermissionGuard module={MODULES.NOVO_MODULO}>
      <NovoModulo />
    </PermissionGuard>
  )} />
</Route>
```

### 5. Filtrar no PortalDashboard (se aplicável)

Se o módulo aparece como card no Portal, adicione a verificação em `PortalDashboard.tsx`:

```tsx
const allModules = [
  // ...
  {
    id: 'novo_modulo',
    name: 'Novo Módulo',
    // ...
  },
];

// No filtro visibleModules, o módulo será automaticamente filtrado
// pelo hasModulePermission se o id corresponder a um MODULES key
```

### 6. Adicionar ao ModuleHub (se for submódulo)

Se o novo módulo é um submódulo de outro (ex: dentro de Gestão de Negócios), adicione-o no array `submodules` do componente hub pai com a propriedade `permissionKey`:

```tsx
const submodules: SubmoduleConfig[] = [
  // ...
  {
    id: 'novo_modulo',
    permissionKey: 'NOVO_MODULO', // Deve corresponder à key no MODULES
    name: 'Novo Módulo',
    description: 'Descrição do módulo',
    icon: <Icon size={24} />,
    path: '/novo-modulo',
    color: 'from-color-500 to-color-600',
  },
];
```

### 7. Atualizar Hierarquia no PermissionGroupsManagement

Adicione o novo módulo na constante `MODULE_HIERARCHY` em `PermissionGroupsManagement.tsx`:

```tsx
const MODULE_HIERARCHY: ModuleNode[] = [
  // ...
  { key: MODULES.NOVO_MODULO, label: 'Novo Módulo', description: 'Descrição' },
  // Ou como filho de outro módulo:
  {
    key: MODULES.GESTAO_NEGOCIOS,
    label: 'Gestão de Negócios',
    children: [
      // ...
      { key: MODULES.NOVO_MODULO, label: 'Novo Módulo', description: 'Descrição' },
    ],
  },
];
```

---

## Hierarquia Atual de Módulos

```
├── Suporte (suporte)
├── Desenvolvimento (desenvolvimento)
├── Almoxarifado (almoxarifado)
└── Gestão de Negócios (gestao_negocios)
    ├── Comercial (comercial)
    ├── Superestocados (superestocados)
    └── Contratos (contratos)
        └── Repasses (repasses)
```

---

## Regras Importantes

1. **Admins sempre têm acesso total** — O sistema verifica `user.role === 'admin'` antes de checar permissões.
2. **Módulos pai controlam visibilidade do hub** — Se o usuário não tem permissão no módulo pai (ex: `gestao_negocios`), ele não vê o card no Portal, mas pode ter acesso direto a submódulos se tiver permissão específica.
3. **Submódulos são independentes** — Cada submódulo tem suas próprias permissões CRUD. Ativar o pai não ativa automaticamente os filhos.
4. **Sincronização de grupos** — Quando um grupo é atualizado, as permissões são sincronizadas automaticamente para todos os usuários do grupo.
5. **Formato legado** — O sistema aceita formato boolean legado (`{ "suporte": true }`) e converte automaticamente para granular (`{ "suporte": { create: true, read: true, update: true, delete: true } }`).

---

## Arquivos-Chave

| Arquivo | Responsabilidade |
|---------|-----------------|
| `shared/permissions.ts` | Constantes, tipos e funções de verificação |
| `server/permissionMiddleware.ts` | Middleware tRPC para proteção de procedures |
| `server/routers.ts` | Procedures de permissionGroups e users |
| `server/db.ts` | Funções de banco para CRUD de permissões |
| `client/src/components/PermissionGuard.tsx` | Guard de rota no frontend |
| `client/src/components/PermissionsDialog.tsx` | Dialog de permissões individuais |
| `client/src/pages/PermissionGroupsManagement.tsx` | UI de gerenciamento de grupos |
| `client/src/pages/PortalDashboard.tsx` | Filtro de módulos visíveis no portal |
| `client/src/components/templates/ModuleHub.tsx` | Template de hub com filtro por permissão |
