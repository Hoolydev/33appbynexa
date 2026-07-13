# Sistema de Implantações 33Doctor

Aplicação local para acompanhar roadmaps de implantação, compras, credenciamentos e criação de planos para novas franquias.

## Remodelação multi-tenant

A primeira fase do 33Doctor APP adiciona:

- uma franquia por tenant, com suporte futuro a múltiplas unidades;
- administradores globais e usuários vinculados a franquias;
- perfis `franchise_admin`, `manager` e `user`;
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

> Estado atual: as rotas seguras de upload, listagem, download e exclusão estão disponíveis em `/api/storage/*`. Os campos visuais de “Anexo” que ainda aceitam texto/link precisam ser conectados a essas rotas na implementação de cada fluxo operacional.

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

## Criar usuário de login

O sistema não tem tela de cadastro. Crie usuários diretamente no SQL Editor do Supabase:

```sql
insert into public.app_users (email, name, password_hash, role)
values (
  'admin@nexa.com.br',
  'Admin Nexa',
  extensions.crypt('troque-esta-senha', extensions.gen_salt('bf')),
  'admin'
);
```

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

`SUPABASE_SERVICE_ROLE_KEY` é usada somente pelas funções em `/api/storage/*` para intermediar arquivos privados. Ela nunca é escrita em `supabase-config.js` nem enviada ao navegador.

O bucket aceita PDF, JPG, PNG, WebP, CSV, XLS/XLSX e DOC/DOCX com até 25 MB. Não crie políticas públicas no bucket: a autenticação deste projeto usa `app_sessions`, e as rotas server-side validam o token e o tenant antes de gerar URLs temporárias.

## Checklist depois das migrations

1. Configure `SUPABASE_URL` e `SUPABASE_ANON_KEY` na Vercel.
2. Configure `SUPABASE_SERVICE_ROLE_KEY` apenas na Vercel para o Storage privado.
3. Faça um novo deploy para gerar `supabase-config.js` com URL e chave pública.
4. Confirme que o administrador existe em `app_users`, está ativo e possui senha criada com `extensions.crypt`.
5. Vincule cada usuário franqueado à sua franquia em `tenant_memberships`.
6. Confira os módulos liberados por franquia em `tenant_modules`.
7. Teste login, leitura do portal e uma alteração de implantação antes de liberar usuários finais.

Rodar migrations não configura variáveis da Vercel, não cria automaticamente os vínculos dos novos usuários e não transforma os módulos ainda em construção em fluxos completos. Implantação/Negócios tem persistência implementada; RH, DP, Contabilidade e Financeiro ainda precisam dos cadastros e regras operacionais específicos.

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

Enquanto o banco não for implementado, o deploy carregará os dados do `data.js` e alterações continuarão locais no navegador de cada usuário.

## Atualizar dados das planilhas

Coloque novas planilhas `.xlsx` na pasta `/Users/holydev/Documents/Danielle` seguindo o mesmo padrão dos arquivos atuais e rode:

```bash
/Users/holydev/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 /Users/holydev/Documents/Danielle/franquia-sistema/extract_data.py
```

O arquivo `data.js` será atualizado e basta recarregar o navegador.
