# Sistema de Implantações 33Doctor

Aplicação local para acompanhar roadmaps de implantação, compras, credenciamentos e criação de planos para novas franquias.

## Remodelação multi-tenant

A primeira fase do 33Doctor APP adiciona:

- uma franquia por tenant, com suporte futuro a múltiplas unidades;
- equipe da franqueadora com cargos `admin`, `gestao` e `user`;
- usuários vinculados a franquias com perfis `franchise_admin`, `manager` e `user`;
- módulos de Negócios, RH, Departamento Pessoal, Contabilidade e Financeiro;
- solicitação, ativação, suspensão e bloqueio de módulos;
- Central Administrativa para criar usuários, definir acessos e liberar módulos;
- leitura e alterações filtradas no banco pela franquia do usuário.

Antes de publicar o frontend remodelado, aplique as migrations pendentes em ordem. A migration principal desta fase é:

```text
supabase/migrations/202607120001_multitenant_foundation.sql
```

Ela depende das migrations anteriores de perfil, credenciamento e registros operacionais. Os usuários atuais com papel `admin` continuam com acesso global.

A estrutura de arquivos privados fica na migration:

```text
supabase/migrations/202607130001_tenant_private_storage.sql
```

Ela cria o bucket privado `tenant-documents`, a tabela `tenant_files` e a validação de acesso por franquia. Os arquivos ficam no Storage; nome, categoria, tenant, unidade, módulo e responsável ficam no Postgres.

Os registros operacionais dos novos departamentos ficam na migration:

```text
supabase/migrations/202607130002_department_modules.sql
```

Ela cria `module_records` e as RPCs multi-tenant de leitura, criação, edição e exclusão. Os módulos disponíveis são:

- RH: vagas, candidatos, pipeline, página pública e classificação de aderência;
- Departamento Pessoal: colaboradores e competências da folha;
- Contabilidade: documentos por competência, status, observações e anexos privados;
- Financeiro: contas a pagar e receber, vencimentos, pagamentos e indicadores calculados.

## Autenticação oficial

A identidade e a senha de todos os usuários agora pertencem ao **Supabase Authentication**. A migration:

```text
supabase/migrations/202607300001_supabase_auth_identity.sql
```

faz a ligação entre:

- `auth.users`: e-mail, senha, confirmação e sessões do Supabase;
- `app_users`: nome, cargo e papel interno;
- `tenant_memberships`: franquias que o usuário pode acessar.

O token de renovação fica em cookie `HttpOnly`, com `SameSite=Strict`, e não no armazenamento JavaScript do navegador.

Os cargos da franqueadora são:

- `admin`: cria, gerencia e exclui usuários;
- `gestao`: cria usuários, mas não pode excluir nem conceder o cargo `admin`;
- `user`: utiliza a operação, sem administrar usuários.

Os perfis das franquias permanecem `franchise_admin`, `manager` e `user`.

## Onde os dados ficam hoje

Hoje o sistema é estático:

- `data.js`: dados consolidados extraídos das planilhas `.xlsx`.
- `localStorage` do navegador: alterações feitas na interface, como status editados e novas franquias criadas na sessão.

Isso é suficiente para protótipo e apresentação, mas não é banco de dados compartilhado. Em produção, se duas pessoas acessarem o sistema, cada navegador terá seus próprios dados locais.

## Supabase em produção

Para uso real, o sistema agora está preparado para Supabase.

As migrations ficam em:

```text
supabase/migrations/
```

Elas criam:

- usuários internos em `app_users`;
- sessões em `app_sessions`;
- unidades em `units`;
- templates do roadmap em `roadmap_task_templates`;
- etapas por unidade em `roadmap_tasks`;
- templates de compras em `purchase_item_templates`;
- compras por unidade em `purchase_items`;
- credenciamentos em `accreditation_*`;
- histórico em `audit_events`.

A migration `202606230002_seed_current_spreadsheets.sql` sobe os dados atuais das planilhas para o banco.

## Criar usuários

Depois que o primeiro administrador estiver no Authentication, use:

```text
Configurações → Usuários → Criar usuário
```

O formulário cria a identidade em `Authentication → Users`, confirma o e-mail automaticamente e, em seguida, grava perfil, cargo e vínculos nas tabelas públicas.

Não insira linhas manualmente em `auth.users` nem crie novas senhas em `app_users`. Para criar ou migrar o primeiro administrador com a API oficial do Supabase:

```bash
export SUPABASE_URL='https://SEU-PROJETO.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='SUA_SERVICE_ROLE'
export AUTH_BOOTSTRAP_USERS='[
  {
    "email": "admin@nexa.com.br",
    "password": "UMA-SENHA-TEMPORARIA-FORTE",
    "name": "Admin Nexa",
    "role": "admin",
    "jobTitle": "Administrador"
  }
]'
npm run bootstrap:auth-users
```

O mesmo comando aceita vários objetos no array. As senhas ficam somente na variável de ambiente do comando e não são gravadas no repositório.

Usuários que já existiam em `Authentication → Users` antes da migration são vinculados automaticamente por e-mail. Quando não houver perfil anterior, eles entram sem franquia e sem cargo da franqueadora até que um administrador atribua o acesso correto.

Contas legadas que existem somente em `app_users` são migradas automaticamente no primeiro login bem-sucedido. A senha antiga é validada uma última vez, a identidade é criada no Supabase Authentication e os próximos logins passam a usar exclusivamente o Auth.

Para antecipar essa migração e fazer todas as contas legadas aparecerem imediatamente em `Authentication → Users`, rode uma vez com a `service_role`:

```bash
npm run migrate:legacy-auth-users
```

O comando envia ao Auth somente os hashes bcrypt já existentes, sem conhecer ou redefinir as senhas. Usuários já presentes no Authentication são apenas vinculados ao perfil público correspondente.

## Configurar conexão Supabase

Edite `supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_ANON_KEY"
};
```

Nunca use a `service_role key` no frontend.

Na Vercel, configure estas variáveis e faça um novo deploy:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` é usada somente pelas funções server-side em `/api/*` para intermediar arquivos privados e administrar o Supabase Authentication. Ela nunca é escrita em `supabase-config.js` nem enviada ao navegador.

Para usar a análise de candidatos com um modelo de IA, configure também no servidor:

```text
OPENAI_API_KEY
OPENAI_SCORING_MODEL
```

Sem essas duas variáveis, o recrutamento continua funcionando com uma classificação automática determinística baseada nos requisitos e nas competências informadas.

O bucket aceita PDF, JPG, PNG, WebP, CSV, XLS/XLSX e DOC/DOCX com até 25 MB. Não crie políticas públicas no bucket. As rotas server-side verificam o usuário do Supabase e o tenant antes de administrar identidades; o acesso aos arquivos continua usando a sessão operacional vinculada ao mesmo usuário durante a transição das RPCs.

## Checklist depois das migrations

1. Aplique `202607300001_supabase_auth_identity.sql` depois das migrations anteriores.
2. Configure `SUPABASE_URL` e `SUPABASE_ANON_KEY` na Vercel.
3. Configure `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor da Vercel.
4. Rode `npm run bootstrap:auth-users` para criar o primeiro administrador, ou `npm run migrate:legacy-auth-users` para preservar e migrar todas as contas antigas.
5. Confirme que ele aparece em `Authentication → Users` e consegue entrar.
6. Crie os demais usuários pela Central Administrativa do sistema.
7. Confira os vínculos de franquia em `tenant_memberships`.
8. Teste login, criação e exclusão com `admin`, criação sem exclusão com `gestao` e bloqueio administrativo com `user`.

Rodar migrations não cria identidades no Authentication por si só. O primeiro administrador pode ser criado pelo bootstrap; os demais usuários legados também podem ser convertidos automaticamente ao entrarem com a senha atual.

## Nova unidade

Ao criar uma nova franquia pelo sistema, a função `create_unit_from_template` cria automaticamente:

- a unidade;
- todas as etapas do roadmap existentes nas planilhas;
- todos os itens da checklist de compras;
- a entrada da unidade na área de credenciamentos.

## Abrir

Com o servidor local rodando:

```bash
cd /Users/holydev/Documents/Danielle/franquia-sistema
/Users/holydev/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m http.server 4173
```

Acesse:

```text
http://localhost:4173
```

## Deploy na Vercel

O projeto está preparado para deploy estático.

No GitHub, suba a pasta `franquia-sistema` como repositório. Na Vercel, importe esse repositório e use:

- Framework Preset: `Other`
- Build Command: `npm run build`
- Output Directory: `.`
- Install Command: vazio ou padrão

Em produção, o build remove os dados estáticos de `data.js`; o conteúdo autenticado é carregado do Supabase.

## Atualizar dados das planilhas

Coloque novas planilhas `.xlsx` na pasta `/Users/holydev/Documents/Danielle` seguindo o mesmo padrão dos arquivos atuais e rode:

```bash
/Users/holydev/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 /Users/holydev/Documents/Danielle/franquia-sistema/extract_data.py
```

O arquivo `data.js` será atualizado e basta recarregar o navegador.
