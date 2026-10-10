# Dashboard de Ponto e Vale Alimentação (V4)

Aplicação web local de alta densidade para gestão diária de ponto eletrônico, controle de DSR e apuração automatizada de Vale Alimentação (VA).

---

## 🎨 Paleta de Cores Implementada

A interface foi desenhada no padrão **Dark Mode** de alta legibilidade, integrando a paleta fornecida com a matriz azul ciano/gelo:

| Cor Hex | Descrição Visual | Aplicação no Sistema |
| :--- | :--- | :--- |
| **`#4015B8`** | Violeta Elétrico / Primário | Botões principais, indicadores de foco, abas ativas e realces |
| **`#422985`** | Violeta Real / Secundário | Gradientes de cabeçalho de modal, feriados e bordas de destaque |
| **`#342A52`** | Ardósia Violeta Escuro | Bordas de tabelas, cabeçalhos de coluna e status FALTA |
| **`#282433`** | Grafite Violeta Noturno | Fundo de cartões, formulários e painéis de controle |
| **`#2F2D33`** | Obsidiana Escuro | Superfície de controles, linhas alternadas da matriz |
| **`#0F0F11`** | Fundo Principal Escuro | Fundo base de toda a aplicação |
| **`#00E5FF`** | Ciano Neon | Status `OK`, textos destacados e valores líquidos de VA |
| **`#38BDF8`** | Azul Celeste Claro | Linhas de status de meio período e atraso |
| **`#ADD8E6`** | Azul Gelo | Rótulos secundários, cabeçalhos e legendas |

> **Observação de Design:** Conforme os requisitos, não são utilizados semáforos verde/vermelho. Os status são representados exclusivamente por preenchimentos, bordas e opacidades na gama violeta e azul/ciano.

---

## 🚀 Como Executar a Aplicação

Você tem duas formas muito simples de abrir o sistema:

### Opção 1: Servidor Local (Recomendado)
Dê um duplo clique no arquivo **`iniciar_app.bat`**.  
O servidor iniciará automaticamente na porta `3000` e abrirá seu navegador padrão em:
```
http://localhost:3000
```

### Opção 2: Abertura Direta no Navegador
Como a aplicação foi construída com tecnologia moderna e zero dependências externas, você pode simplesmente abrir o arquivo **`index.html`** diretamente em qualquer navegador (Google Chrome, Microsoft Edge, Firefox, Brave, etc.).

---

## 📋 Funcionalidades Principais

### 1. Matriz Visual de Ponto (Dashboard Principal)
* **Estrutura Planilha (Excel-like):**
  * **Colunas Congeladas à Esquerda (Sticky):** Departamento, Código do Crachá e Nome do Colaborador.
  * **Cabeçalho Duplo Dinâmico:** Linha 1 com a Data (`DD/MM`) e Linha 2 com o Dia da Semana (`SEG`, `TER`, etc.).
  * **Coluna Congelada à Direita (Sticky):** `Qtd. DSR` com o total de descansos perdidos/descontados no mês e tooltip com o extrato.
  * **Tratamento de Domingos:** Preenchidos automaticamente com `DOMINGO` e bloqueados para edição manual.
* **Modo Foco (Toggle no Topo):**
  * Ao ser ativado, oculta colaboradores 100% "OK" no mês selecionado. Colaboradores com qualquer pendência (Falta, Atraso, Atestado, etc.) permanecem visíveis com seus dias.
* **Ordenação Inteligente:**
  * Por Código do Crachá (padrão crescente).
  * Por Ordem Alfabética (Nome).
  * Por Data Inicial (Admissão).
  * Por Departamento (Agrupando colaboradores por setor e ordenando por crachá dentro de cada grupo).
* **Ação em Massa por Data:**
  * Clique no número do dia no cabeçalho para abrir o modal de confirmação: *"Definir status como 'OK' para TODOS os colaboradores desta filial neste dia?"*.
* **Ação Individual e Resolução de Pendências:**
  * Clique em qualquer célula de dia útil para abrir o modal com as batidas (`EM`, `SM`, `ET`, `ST`), cálculo de atraso, override manual (`OK`, `FALTA`, `FM`, `FT`, `FÉRIAS`, `AFASTADO`, `ATESTADO`, `1/2 ATESTADO`), resolução (`Abonar`, `Descontar Ambos`, `Descontar só VA`, `Descontar só Folha`) e opção de replicação para os próximos `[ X ]` dias.

### 2. Motor de DSR (Descanso Semanal Remunerado)
* **Regra Base:** 1 ou mais faltas não justificadas na semana = Perda do DSR (Domingo).
* **Regra de Feriados:** Falta na semana em que há Feriado registrado = Desconta o Domingo + o Feriado (2 DSRs descontados).
* **Transição de Mês (Carry-over):** Se a semana terminar no mês seguinte e houver falta registrada nessa semana final incompleta, o DSR correspondente é transferido automaticamente para o mês subsequente.

### 3. Dashboard de Vale Alimentação (VA)
* **Cálculo Automático de Dias Úteis:** Exclui dinamicamente domingos e feriados da filial.
* **Valor Base:** **R$ 8,00** por dia útil trabalhado integralmente.
* **Regras de Pagamento:**
  * Dia `OK`: Ganha **R$ 8,00**.
  * Dia com `FM`, `FT` ou `1/2 ATESTADO`: Ganha **R$ 4,00** (Desconto: R$ 4,00).
  * Dia com `FALTA`, `ATESTADO` Integral, `FÉRIAS` ou `AFASTADO`: Ganha **R$ 0,00** (Desconto: R$ 8,00).
* **Tabela de Fechamento de VA:**
  * Nome do Colaborador, Crachá e Departamento.
  * Dias Úteis, Dias OK, Meios Dias e Faltas.
  * **Quanto Ganhará (Valor Líquido):** Total final a receber.
  * **Quanto Será Descontado:** Economia/desconto apurado no mês.
  * **Extrato Analítico Individual:** Botão para visualizar dia a dia detalhado com justificativa e valor.

### 4. Módulos de Cadastros e Gestão (CRUDs)
* **Filiais:** Cadastro com Nome e Cidade, alternância instantânea por abas horizontais no topo.
* **Departamentos:** Gestão de setores para padronização.
* **Funcionários:** Nome, Crachá, Admissão, Filial e Departamento.
* **Calendário de Feriados:** Registro de Feriados Nacionais e Locais específicos por filial.

### 5. Exportação e Segurança dos Dados
* **Exportar CSV:** Geração instantânea da planilha de Ponto e do fechamento financeiro de VA.
* **Backup & Restauração:** Exportação completa de todos os dados em arquivo `.json` e importação a qualquer momento.
* **Persistência:** Armazenamento automático e local via `localStorage`.
