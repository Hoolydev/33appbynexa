# Sistema de Implantações 33Doctor

Aplicação local para acompanhar roadmaps de implantação, compras, credenciamentos e criação de planos para novas franquias.

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
