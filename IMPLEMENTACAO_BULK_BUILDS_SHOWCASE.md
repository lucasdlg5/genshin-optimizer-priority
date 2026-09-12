# Plano de implementação: prioridade, Bulk Builds e Showcase

## Objetivo

Adicionar ao Genshin Optimizer três capacidades integradas:

1. **Prioridade global de personagens**: personagens no topo podem utilizar artefatos equipados por personagens abaixo; personagens abaixo não podem utilizar os artefatos equipados pelos personagens acima.
2. **Bulk Builds**: selecionar vários personagens, escolher `Solo` ou uma equipe salva para cada personagem e executar a geração de builds sequencialmente, sem abrir manualmente cada página de otimização.
3. **Showcase**: transformar a visualização atual do personagem em uma experiência dedicada, aberta como modal/popup sobre a lista de personagens, com equipamento, artefatos, talentos, constelações e imagem de destaque.

As imagens anexadas são referências de UX. O comportamento e o modelo de dados devem respeitar as abstrações já existentes no projeto, em vez de copiar código ou layout do HSR Optimizer.

## Estado da análise

| Item | Estado | Observação |
|---|---|---|
| Repositório Genshin Optimizer | **Analisado** | Monorepo Nx/Yarn, versão `10.38.1`. |
| Pasta `hsr-optimizer-main` na raiz | **Corrigido** | O código foi localizado em `C:\Users\Asminn\Downloads\hsr-optimizer-main\hsr-optimizer-main`. |
| Código HSR externo | **Analisado** | Foram examinados os stores de personagens, opções do otimizador, Showcase e modais; nenhum código foi copiado. |
| Página de personagens | **Mapeada** | `libs/gi/page-characters/src/index.tsx`. |
| Página/modal de personagem | **Mapeada** | `CharacterEditor` em `libs/gi/ui/src/components/character/editor`. |
| Equipes e personagens da equipe | **Mapeados** | `libs/gi/page-teams`, `libs/gi/page-team` e `TeamDataManager`. |
| Configuração do otimizador | **Mapeada** | `OptConfigDataManager` e `libs/gi/page-team/src/CharacterDisplay/Tabs/TabOptimize`. |
| Artefatos equipados | **Mapeados** | `CharacterDataManager`, `ArtifactDataManager` e locais de equipamento. |
| Implementação das três funcionalidades | **Primeira implementação feita** | Prioridade persistida e integrada ao filtro do otimizador; página Bulk Builds e fila segura adicionadas; Showcase existente preservado. |

## Referências concretas encontradas no HSR Optimizer

O repositório HSR fornecido foi usado somente como referência técnica e de UX. Os pontos relevantes são:

| Referência HSR | Aplicação planejada no Genshin |
|---|---|
| `src/lib/stores/character/characterStore.ts` | A lista ordenável de personagens já representa bem a prioridade: `insertCharacter(id, index)` reordena, `charactersById` acelera acesso e uma assinatura sincroniza a posição com o filtro do otimizador. No Genshin, a ordem deve ser persistida no banco local e não apenas em um store React. |
| `src/lib/tabs/tabOptimizer/optimizerForm/components/OptimizerOptionsDisplay.tsx` | O HSR já possui `rank`, `rankFilter`, `exclude`, `includeEquippedRelics` e `keepCurrentRelics`, além de um `PriorityCombobox`. Isso confirma que a prioridade deve ser uma entrada explícita da solicitação do otimizador, mas no Genshin será necessário converter a posição em `excludedLocations`/IDs de artefatos sem alterar o inventário. |
| `src/lib/tabs/tabCharacters/CharacterGrid.tsx` | O HSR usa `@dnd-kit` para drag-and-drop vertical, rank visual, overlay durante arraste e persistência posterior. Essa é uma boa referência para a tela de ordenação de prioridade do Genshin; a primeira versão pode usar controles MUI de mover para cima/baixo se drag-and-drop aumentar o escopo. |
| `src/lib/characterPreview/CharacterPreview.tsx` e `src/lib/characterPreview/card/*` | O Showcase do HSR é composto por componentes de apresentação separados: header, portrait, light cone, relics, estatísticas, scoring e customização. No Genshin, esses papéis correspondem ao `CharacterEditor`, `Content`, `EquipmentSection`, `ArtifactCard` e componentes de estatísticas existentes. |
| `src/lib/overlays/modals/CharacterModal.tsx` e `src/lib/overlays/GlobalModals.tsx` | O HSR centraliza modais em um registro global com stores de abertura/fechamento. No Genshin, a rota `/characters/:characterKey` já controla o editor; a implementação deve manter a rota como fonte de verdade e usar `ModalWrapper`, evitando criar um segundo estado global concorrente. |
| `src/lib/tabs/tabShowcase/ShowcaseTab.tsx` | O Showcase HSR tem seleção de personagem, estado de carregamento, painel lateral, presets e preview. O Genshin não precisa importar o fluxo de UID remoto: deve reutilizar os dados locais e abrir o showcase sobre a página de personagens. |
| `src/lib/tabs/tabOptimizer/optimizerForm/optimizerFormActions.ts` | A execução HSR passa por actions e worker/solver, com recalculação de permutações por mudanças no formulário. A fila Genshin deve extrair a mesma camada programática da aba `TabOptimize`, aguardando o solver real em vez de disparar cliques ou trocar rotas. |

### O que o HSR não fornece pronto para esta tarefa

- Não foi encontrada uma página `Bulk Builds` pronta no código analisado; a fila sequencial será uma funcionalidade nova no Genshin.
- A prioridade do HSR é uma ordem de personagens combinada com filtros do otimizador; ela não implementa automaticamente a semântica completa “o personagem acima pode roubar do abaixo, mas o abaixo não pode roubar do acima”. Essa regra será implementada no pipeline de artefatos do Genshin.
- O Showcase do HSR usa dados/IDs de Honkai: Star Rail, sprites Spine e modelos próprios. Somente a composição visual e a separação de responsabilidades são transferíveis.

## Arquitetura existente que será reutilizada

- A entrada da aplicação e o roteamento ficam em `apps/frontend/src/app/App.tsx`.
- Personagens são exibidos em `libs/gi/page-characters`; a rota atual aceita `/:characterKey` e abre `CharacterEditor`.
- A edição/visualização detalhada reutilizável está em `libs/gi/ui/src/components/character/editor`.
- Equipes salvas são gerenciadas por `database.teams`; seus três slots apontam para `teamChars` e `loadoutData`.
- A otimização depende do contexto de equipe em `libs/gi/page-team`, especialmente `TeamCharacterContext`, `DataContext`, `OptTargetWrapper` e o conteúdo da aba `TabOptimize`.
- O estado persistido é local e versionado em `libs/gi/db/src/Database`; mudanças de formato deverão passar por migração.
- A seleção de artefatos já suporta locais excluídos em `OptConfig.excludedLocations`, mas isso atualmente é uma configuração por personagem, não uma política de prioridade global.

## Modelo de dados proposto

### 1. Prioridade de personagens

Adicionar uma entrada persistida de visualização/configuração, preferencialmente `CharacterPriorityEntry`, em `libs/gi/db/src/Database/DataEntries`, contendo:

```ts
type CharacterPriorityEntry = {
  orderedCharacterKeys: CharacterKey[]
  enabled: boolean
}
```

Regras:

- A lista deve conter cada personagem existente no máximo uma vez.
- Personagens novos entram no final.
- Personagens removidos são retirados da lista.
- A posição menor representa maior prioridade.
- A política deve ser opt-in (`enabled`) para preservar o comportamento atual.
- A ordem exibida na lista de personagens e a ordem usada pelo otimizador devem ser independentes: a prioridade é uma regra de disponibilidade, não necessariamente o único critério de ordenação visual.

Para cada personagem alvo `P` na posição `i`, o otimizador em massa deverá excluir:

- artefatos equipados por personagens nas posições `0..i-1`;
- artefatos marcados como indisponíveis por outras regras já existentes.

O personagem atual continua podendo usar os próprios artefatos, de acordo com `useEquippedArts`/configuração equivalente. A implementação não deve alterar permanentemente `location` dos artefatos apenas para simular prioridade.

### 2. Configuração de Bulk Builds

Adicionar estado persistido de configuração da página, preferencialmente `DisplayBulkBuildsEntry`, contendo:

```ts
type BulkBuildSelection = {
  characterKey: CharacterKey
  mode: 'solo' | 'team'
  teamId?: string
}

type BulkBuildState = {
  selections: BulkBuildSelection[]
  priorityEnabled: boolean
  stopOnError: boolean
}
```

As seleções devem ser reconstruídas/validadas contra personagens e equipes atuais. Equipe removida deve voltar para `solo` ou ser marcada como inválida de forma explícita.

### 3. Execução sequencial

Criar um controlador de fila, isolado da UI, por exemplo:

`libs/gi/page-bulk-builds/src/bulkBuildQueue.ts`

Responsabilidades:

- validar a seleção antes de iniciar;
- resolver `solo` como uma equipe temporária de um único personagem;
- resolver `team` por `teamId` e localizar o personagem dentro de `loadoutData`;
- criar/reutilizar a configuração de otimização do personagem;
- executar um alvo por vez;
- aguardar o término real do solver antes de liberar o próximo;
- publicar progresso, sucesso, erro e cancelamento;
- nunca executar duas otimizações concorrentes sobre o mesmo banco;
- aplicar a política de prioridade antes de cada item da fila;
- não substituir automaticamente builds/equipamentos sem uma ação explícita de equipar ou uma opção claramente nomeada.

O caminho de execução deve reutilizar o mesmo serviço/hook usado pela aba `TabOptimize`. Não deve simular cliques nem depender de navegar para a rota de cada personagem.

### 4. Showcase

O Showcase deve usar os componentes existentes de editor/display sempre que possível. O fluxo proposto é:

- `/characters` continua sendo a grade/lista;
- `/characters/:characterKey` abre `CharacterEditor` em `ModalWrapper` ou contêiner equivalente;
- o conteúdo visual do popup é extraído para componentes reutilizáveis, sem duplicar a lógica de equipamento;
- o popup mostra nível, talentos, constelações, arma, cinco artefatos, estatísticas e imagem de destaque;
- controles de edição continuam disponíveis conforme o fluxo atual;
- fechar o popup retorna para `/characters`, preservando filtros e posição de rolagem quando possível;
- deep link direto para o personagem continua funcionando;
- se futuramente houver uma rota nominal `showcase`, ela deve reutilizar o mesmo componente e não criar uma segunda fonte de verdade.

## Arquivos previstos para alteração/criação

### Roteamento e navegação

- `apps/frontend/src/app/App.tsx`: registrar a nova página `PageBulkBuilds` e a rota `/bulk-builds`.
- `apps/frontend/src/app/Header.tsx`: adicionar o item “Bulk Builds” e, se aprovado no desenho final, o acesso “Showcase”.
- arquivos de tradução de `libs/gi/localization/assets/locales/*`: adicionar os textos de página, estados da fila, erros e acessibilidade.

### Nova página Bulk Builds

Criar o pacote `libs/gi/page-bulk-builds` seguindo as convenções dos pacotes `page-characters` e `page-teams`:

- `src/index.tsx`: composição da página;
- `src/BulkBuildCharacterCard.tsx`: card com checkbox, personagem e modo de geração;
- `src/BulkBuildSelectionControls.tsx`: filtros e ações de seleção;
- `src/TeamModeSelector.tsx`: `Solo` ou equipe salva;
- `src/BulkBuildProgress.tsx`: fila, progresso, mensagens e cancelamento;
- `src/bulkBuildQueue.ts`: controlador sem dependência de componentes React;
- `project.json`, `package.json`, `README.md`: integração Nx e documentação do pacote.

O layout inicial deve seguir a referência anexada: cards em grade, seleção individual, configuração por card, botão global desabilitado quando não houver seleção e painel fixo de progresso.

### Prioridade e persistência

- `libs/gi/db/src/Database/DataEntries/CharacterPriorityEntry.ts`: modelo e validação.
- `libs/gi/db/src/Database/DataEntries/DisplayBulkBuildsEntry.ts`: seleção e preferências da página.
- `libs/gi/db/src/Database/ArtCharDatabase.ts`: registrar os novos entries, persistência, exportação e listeners.
- `libs/gi/db/src/Database/migrate.ts`: nova versão/migração com defaults seguros.
- `libs/gi/db/src/Database/DataManagers/OptConfigDataManager.ts`: integração da lista de locais excluídos calculada pela prioridade, sem aceitar IDs inválidos.
- `libs/gi/db/src/Database/DataManagers/CharacterDataManager.ts`: manter a ordem sincronizada ao adicionar/remover personagem.

Se a convenção atual indicar que a configuração deve ser um `DataManager` em vez de `DataEntry`, manter o mesmo contrato funcional e seguir o padrão encontrado durante a implementação.

### Showcase e componentes compartilhados

- `libs/gi/page-characters/src/index.tsx`: manter a grade e conectar a abertura do showcase.
- `libs/gi/ui/src/components/character/editor/CharacterEditor.tsx`: ajustar o contêiner/modal, se necessário.
- `libs/gi/ui/src/components/character/editor/Content.tsx`: extrair somente partes comuns caso o popup precise de uma composição diferente.
- `libs/gi/ui/src/components/character/CharacterCard*.tsx` e `libs/gi/ui/src/components/artifact/ArtifactCard.tsx`: reutilizar cards e dados existentes, evitando cópia.

### Otimizador

- `libs/gi/page-team/src/CharacterDisplay/Tabs/TabOptimize/index.tsx` e componentes adjacentes: expor uma API de execução reutilizável pela fila.
- `libs/gi/page-team/src/CharacterDisplay/Tabs/TabOptimize/Components/UseEquipped.tsx` e `UseTeammateArt.tsx`: garantir que as regras de artefatos equipados sejam aplicadas por configuração, sem efeitos colaterais.
- solver/engine apenas se a API atual não permitir execução programática; mudanças devem ser mínimas e cobertas por teste.

## Fases de implementação

### Fase 1 — fundação e migração

- [x] Definir o contrato final de prioridade e defaults.
- [x] Criar entries e registrar no `ArtCharDatabase`.
- [x] Adicionar migração/versionamento.
- [x] Implementar sincronização com personagens removidos/adicionados.
- [x] Adicionar testes de validação de seleção e prioridade.

### Fase 2 — prioridade no otimizador

- [x] Criar função pura que recebe a ordem, personagem alvo e artefatos equipados e retorna os IDs bloqueados.
- [x] Integrar a função ao filtro do pipeline de otimização sem alterar `location`.
- [x] Garantir que artefatos de personagens acima nunca sejam considerados por personagens abaixo.
- [x] Garantir que a política desligada produza exatamente o comportamento anterior.
- [x] Cobrir personagens sem equipamento e artefatos compartilhados no teste puro.

### Fase 3 — API de geração e fila

- [x] Identificar o ponto único que inicia o solver atual.
- [ ] Extrair uma API programática que aceite uma equipe e o alvo.
- [ ] Implementar equipe temporária solo sem persistir lixo no banco.
- [x] Implementar seleção de personagem dentro de equipes salvas na validação/resolução da fila.
- [x] Implementar fila sequencial, cancelamento e erro.
- [x] Testar que a ordem da fila é determinística e que o próximo item só começa após o anterior terminar.

### Fase 4 — página Bulk Builds

- [x] Criar pacote Nx e registrar alias/import.
- [x] Implementar cards, seleção em massa e modo solo/equipe.
- [ ] Exibir resumo “selecionados / solo / equipes”.
- [x] Exibir progresso do item atual e histórico dos concluídos.
- [x] Desabilitar ações incompatíveis durante execução.
- [x] Adicionar traduções e estado não iniciado.
- [x] Integrar o botão de navegação no header.

### Fase 5 — Showcase

- [x] Reestruturar o `CharacterEditor` para ser o popup oficial.
- [x] Preservar deep links, fechar e voltar.
- [x] Confirmar exibição de arma, artefatos, talentos, constelações, foto e estatísticas via componentes existentes.
- [ ] Adicionar testes de renderização e navegação.

### Fase 6 — qualidade e documentação

- [ ] Executar testes direcionados dos pacotes alterados.
- [ ] Executar typecheck/lint/format pelos alvos Nx afetados.
- [ ] Validar migração com banco antigo e banco vazio.
- [ ] Validar acessibilidade básica dos cards, checkboxes, modal e progresso.
- [x] Atualizar READMEs e este arquivo com o estado real de cada item.
- [x] Permitir alterar a posição por número e por arrastar na lista de prioridade.
- [x] Definir todos os conjuntos como ativos por padrão e Rainbow Builds desativado.
- [x] Limitar Generate Builds a uma build e equipar automaticamente o primeiro resultado.

## Critérios de aceitação

- A prioridade é persistida, editável e determinística.
- Para uma sequência `A > B > C`, um artefato equipado em `A` pode ser usado por `A`, mas não por `B` nem `C`; um artefato equipado em `B` pode ser usado por `B`, mas não por `C`.
- Desligar a prioridade não muda os resultados atuais.
- A página Bulk Builds permite selecionar personagens individualmente ou em massa.
- Cada personagem possui seleção `Solo` ou equipe salva válida.
- A geração ocorre um por vez, na ordem mostrada, com progresso observável e sem navegação manual.
- Falhas são informadas por personagem e não são silenciosamente ignoradas.
- O Showcase abre sobre a lista, pode ser fechado e não duplica a lógica de dados existente.
- Bancos existentes continuam carregando sem perda de personagens, equipes, armas, artefatos ou builds.

## Riscos e decisões a preservar

- **Não criar cópia paralela do solver**: a fila deve chamar a mesma implementação da otimização individual.
- **Não alterar localização física de artefatos para representar prioridade**: isso corromperia o estado do inventário e afetaria outras telas.
- **Não autoequipar resultados por padrão**: gerar build e equipar build são ações diferentes.
- **Não usar um `teamId` fictício persistido para Solo**: usar contexto temporário ou uma API de execução que aceite loadout em memória.
- **Não importar diretamente componentes do HSR**: os jogos possuem modelos, slots e regras diferentes.
- **Compatibilidade de dados**: toda nova propriedade deve ter default e ser ignorada/normalizada quando inválida.
- **Performance**: a fila deve liberar dados/resultados do item anterior quando possível e evitar renderizações de toda a grade a cada atualização de progresso.

## Registro de execução

### Fase inicial - concluída

- Commit `5b619c98`: fundação de prioridade, persistência, página Bulk Builds, fila, navegação e integração transitória do filtro do otimizador.
- Commit posterior: ordenação determinística da fila pela prioridade e testes de execução sequencial/resolução de equipe.
- O solver real continua deliberadamente não conectado: a geração existente depende de `TeamCharacterContext`, `DataContext` e estado React da aba `TabOptimize`. A página informa o erro explicitamente em vez de simular sucesso ou alterar builds.
- O próximo trabalho necessário para geração real é extrair o corpo de `generateBuilds` para um serviço compartilhado que receba uma equipe em memória, incluindo uma representação Solo sem persistência.
- A geração individual agora força `topN: 1`, remove o seletor de quantidade e aplica automaticamente o primeiro resultado ao personagem ao finalizar.
- Configurações sem uma exclusão explícita de Rainbow recebem `rainbow: [2, 4]`; os demais conjuntos permanecem ativos por padrão.
- A página Bulk Builds agora filtra personagens por nome traduzido, move os selecionados para o início da grade e exibe o progresso entre a prioridade e os cards.
- Antes da fila, a página abre um preflight com atalhos para configurar Target Selector e Artifact Set Configuration na área de equipes. A execução programática ainda precisa da extração do solver para deixar de usar o erro explícito atual.

### Concluído nesta sessão

- [x] Renomeada a branch para `map-bulk-builds-showcase`.
- [x] Verificada a estrutura do monorepo e os pontos de entrada Genshin.
- [x] Confirmado que `hsr-optimizer-main` não está na raiz do projeto e localizado o repositório em `C:\Users\Asminn\Downloads\hsr-optimizer-main\hsr-optimizer-main`.
- [x] Mapeados personagens, equipes, banco local, configuração do otimizador e editor de personagem.
- [x] Criado este guia persistente.
- [x] Criadas as entradas persistentes de prioridade e Bulk Builds, com validação, sincronização e migração 27.
- [x] Integrada a política de prioridade ao filtro de artefatos do otimizador sem modificar locais físicos.
- [x] Criado o pacote `gi-page-bulk-builds`, navegação, cards, seleção persistente, prioridade editável e fila sequencial.
- [x] Mantido o `CharacterEditor` existente como modal da rota `/characters/:characterKey`.
- [x] Corrigida a validação da entrada `DisplayBulkBuildsEntry` e completada a passagem de gênero nos nomes de personagens da nova página.

### Não concluído nesta sessão

- [ ] Execução da fila ainda não chama o solver: a página exibe uma falha explícita até existir uma API programática compartilhada.
- [ ] Não foi criado um contexto temporário persistível para equipes Solo.
- [ ] Não foram adicionados testes de renderização do Showcase.

### Validação

- `git diff --check` executado com sucesso.
- Os testes direcionados foram adicionados, mas não puderam ser executados neste worktree porque as dependências executáveis do Yarn/Nx não estão instaladas; `git diff --check` e a validação dos JSON passaram.

## Como retomar

1. Ler este arquivo antes de editar o código.
2. Confirmar se a API atual do solver permite execução fora da rota `/teams/:teamId`.
3. Implementar as fases na ordem indicada, mantendo cada checkbox atualizado.
4. Após cada fase, registrar arquivos alterados, testes executados e limitações na seção “Registro de execução”.
5. Só marcar este plano como concluído quando os critérios de aceitação e a compatibilidade de migração estiverem verificados.
