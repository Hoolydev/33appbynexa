# Matriz funcional - Manual Mestre 33Doctor x sistema atual

## Escopo

Leitura funcional do `MANUAL MESTRE DO SISTEMA 33DOCTOR.pdf` (69 páginas). Layout, paleta e protótipos do documento foram desconsiderados, conforme solicitado. Esta matriz orienta a implementação das capacidades que ainda não existem ou estão apenas representadas visualmente.

## Regra transversal obrigatória

Todos os módulos operacionais devem compartilhar o mesmo contrato de interação:

- contexto de franquia, unidade, período e perfil;
- filtros, busca, ordenação e exportação respeitando o escopo do usuário;
- cadastro, edição, salvamento em rascunho e envio para workflow;
- responsável, prazo, prioridade, status e critério de conclusão;
- anexos vinculados ao registro, com histórico e metadados;
- aprovação ou rejeição com justificativa;
- inativação, cancelamento ou arquivamento auditável no lugar de exclusão irrestrita;
- trilha com autor, data, valor anterior, valor novo e justificativa;
- notificações originadas pelo registro e direcionadas ao usuário correto.

## Situação por bloco

| Bloco do manual | Estado atual | Lacuna principal | Prioridade |
| --- | --- | --- | --- |
| Primeiro acesso e portais | Login individual e perfis de franqueadora/unidade existentes | Aceite de termos, MFA opcional e seleção explícita de contexto quando houver mais de um perfil | Alta |
| Navegação e busca global | Menu, breadcrumbs e busca por tela existentes | Busca realmente global com resultados tipados e atalho para o registro de origem | Alta |
| Perfis e permissões | Admin, gestão e usuário com escopo de tenant | Perfis funcionais completos, escopo por unidade/processo e segregação para auditoria/consulta | Alta |
| Página inicial | Indicadores, alertas, unidades e notificações existentes | Agenda consolidada, atividade recente completa e ação rápida vinculada ao módulo de origem | Média |
| Painel executivo | Parte da visão está na página inicial | Painel independente com filtros, metas, tendências, ranking e drill-down | Média |
| Indicadores | Indicadores fixos e gráficos de resumo | Catálogo de KPI com fórmula, fonte, periodicidade, meta, faixas e responsável | Alta |
| Unidades | Cadastro, pasta digital e progresso existentes | Dossiê consolidado com vínculos de contratos, pessoas, chamados, riscos e histórico | Média |
| Jornada de implantação | Roadmap, cronograma, pendências, documentos e compras existentes | Aprovações, agenda e linha do tempo precisam usar registros reais, anexos e histórico único | Alta |
| Credenciamento | Procedimentos e registros editáveis existentes | Cadastro completo de prestador, negociação, documentação, aprovação e ativação operacional | Alta |
| Operação | Não existe como módulo próprio | Rotina da unidade, checklists recorrentes, evidências, ocorrências e planos de ação | Alta |
| Financeiro | Workspace genérico e seções visuais | Lançamentos estruturados, aprovação, baixa, conciliação, orçamento, DRE e rastreio por competência | Alta |
| Departamento Pessoal | Workspace genérico em Folha | Colaborador, admissão, ponto, férias, benefícios, folha, encargos e rescisão com documentos | Alta |
| Recursos Humanos | Vagas/candidatos parcialmente implementados | Requisição, publicação, triagem, entrevistas, decisão, onboarding, avaliações e treinamentos integrados | Alta |
| Projetos | Compras funcionais; demais telas genéricas | Projeto/obra, cronograma, marcos, custos, fornecedores, entregas, riscos e aceite | Alta |
| Qualidade e Processos | Telas e registros genéricos | Auditoria, não conformidade, causa, plano de ação, verificação de eficácia e versionamento de processos | Alta |
| Documentos | Pasta digital e anexos operacionais | Biblioteca governada com versão, validade, aprovação, distribuição, ciência e descarte | Alta |
| Contratos | Não existe como módulo ativo | Partes, objeto, vigência, valores, obrigações, reajuste, documentos e alertas | Alta |
| Compliance | Não existe como módulo ativo | Obrigações, controles, riscos, incidentes, investigação, evidências e aprovação segregada | Alta |
| Comunicação | Registros genéricos | Público-alvo, agendamento, publicação, anexos, confirmação de leitura e métricas | Média |
| Treinamentos | Apenas pontos isolados no produto | Catálogo, turmas, inscrições, presença, avaliação, certificado e validade | Média |
| Chamados e suporte | Interface genérica | Protocolo, SLA, fila, prioridade, mensagens, anexos, solução, avaliação e reabertura | Alta |
| Configurações | Usuários, papéis e acesso parcialmente funcionais | Perfis customizáveis, matrizes de permissão, cadastros-mestres, integrações, logs, backup e parâmetros | Alta |

## Ordem de implementação recomendada

1. Contrato transversal de registros: status, responsável, prazo, prioridade, observação, anexo, histórico e workflow.
2. Perfis, escopos e trilha de auditoria.
3. Jornada de implantação e credenciamento, aproveitando as tabelas atuais.
4. Operação, chamados e documentos governados.
5. Financeiro, DP, RH, projetos e qualidade.
6. Contratos, compliance, comunicação e treinamentos.
7. Painel executivo, catálogo de indicadores e busca global sobre dados homologados.

## Entrega desta etapa

- Landing page pública reconstruída conforme a referência fornecida.
- Login redesenhado sem biometria.
- Lembrança de e-mail, exibição de senha e solicitação de recuperação de acesso.
- Fluxo de definição de nova senha preparado para o link de recuperação do Supabase.
- Nenhuma alteração publicada ou enviada ao repositório remoto.
