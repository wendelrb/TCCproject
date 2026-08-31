# Funcionalidades do sistema

Documento de produto: **o que a Mesa Diesel S-10 faz**, como cada parte funciona,
e o que ela deliberadamente se recusa a fazer.

Para requisitos com critério de aceite e status de verificação, ver a
especificação. Para como rodar, `docs/RODAR_LOCAL.md`.

---

## 1. O que o sistema é

Uma ferramenta de inteligência de preço de **diesel S-10** para transportadoras e
indústrias com frota própria. Ela responde três perguntas que hoje a empresa
responde no chute:

1. **Quanto custa o diesel na minha região esta semana?**
2. **Eu estou pagando caro?** — comparado com quem compra no mesmo lugar.
3. **Devo comprar agora ou esperar?**

O insumo público é o **Levantamento de Preços de Combustíveis da ANP**, publicado
semanalmente por estado e por município. O insumo privado é o histórico de
abastecimentos da própria empresa, importado por planilha.

O que distingue o produto não é a previsão — é **publicar a própria acurácia**,
inclusive quando ela é ruim.

---

## 2. As sete telas

### 2.1 Preço e benchmark

A tela de entrada. Mostra, para a semana mais recente:

- **preço médio da UF**, com a variação em relação à semana anterior;
- **preço do município** do cliente, quando a ANP pesquisou lá;
- **piso e teto** praticados na UF, que dão a dispersão real do mercado;
- **número de postos pesquisados**, que é o tamanho da amostra por trás do número;
- o **gráfico** da série histórica.

Abaixo vem o **benchmark**, que é a funcionalidade comercialmente mais forte do
produto:

> Você pagou **2,1% acima** da média da sua região.
> Excedente de **R$ 30.328,75** sobre 219.866 litros.

Dois detalhes que fazem esse número significar alguma coisa:

- **Cada abastecimento é comparado à semana em que aconteceu**, não à semana
  atual. Comparar uma compra de janeiro com o preço de agosto não mede nada.
- **A média da região é ponderada pelos litros do cliente.** Semanas em que a
  empresa comprou mais pesam mais. A média simples das semanas responderia a
  outra pergunta.

Repare que o benchmark **não depende de previsão nenhuma**. É dinheiro presente,
medido contra uma referência pública auditável.

### 2.2 Previsão de 1 a 4 semanas

Para cada horizonte, a tela entrega três coisas — nunca só a primeira:

| O quê | Para quê serve |
|---|---|
| **Ponto** | a estimativa central |
| **Faixa P10–P90** | o intervalo onde o preço deve cair |
| **Classe** ALTA / ESTÁVEL / QUEDA | a leitura acionável |

A classe não sai de um limiar arbitrário. Ela usa uma **banda de estabilidade
calibrada pelo ruído histórico da própria UF** — a mediana da variação semanal
absoluta, com piso de R$ 0,02/L. Mediana, e não média, porque um choque de preço
é justamente o que não pode inflar a banda; e o piso existe porque variação
abaixo de dois centavos não é acionável para quem compra combustível.

Uma consequência que a tela não esconde: **a faixa pode ficar inteiramente acima
ou abaixo do ponto**. Isso acontece quando o modelo vem errando sistematicamente
para o mesmo lado, e é o intervalo denunciando o viés. Forçar o ponto para dentro
deixaria o gráfico mais bonito escondendo informação real.

### 2.3 Simulador de compra

Responde "vale a pena encher o tanque agora?" com quatro controles:

- consumo semanal em litros;
- capacidade do tanque;
- custo de capital (o dinheiro parado em combustível tem preço);
- semanas de antecipação.

O simulador gera **cenários por reamostragem dos erros reais do backtest**, não
por distribuição teórica. A diferença importa: a série de diesel tem choques, e
uma distribuição normal os apagaria justamente quando eles mais importam.

Uma regra que parece detalhe e não é: **só entram na comparação antecipações que
cabem no tanque**. Comparar com um volume que a empresa não consegue armazenar
produz recomendação impossível de executar.

### 2.4 Placar de acurácia

A tela que a maioria dos produtos não tem. Para cada UF e horizonte:

- **MAE** — erro médio em R$/L;
- **RMSE** — pesa mais os erros grandes;
- **MASE** — erro relativo à escala da própria série;
- **cobertura do intervalo** — quantas vezes o realizado caiu dentro da faixa;
- **n** — quantas previsões já têm alvo realizado.

E, ao lado, sempre, **a referência ingênua**: repetir o preço da semana passada.

**Quando o modelo perde do naive, a tela escreve que perdeu.** Não é humildade
decorativa: é o que permite ao cliente calibrar quanta confiança depositar. Um
concorrente que exibe só a previsão está escondendo o mesmo resultado.

### 2.5 Relatório mensal

Consolidado mês a mês, exportável em CSV:

| Coluna | |
|---|---|
| Abastecimentos, litros, gasto | o volume do período |
| Preço pago (R$/L) | o que a empresa efetivamente pagou |
| Preço da região (R$/L) | a referência da ANP, ponderada |
| Diferença % e excedente R$ | o resultado |

Acompanha uma **leitura automática do período** — qual foi o pior mês, qual foi o
melhor, e quanto vale a diferença entre os dois aplicada ao volume total. É o
número que o gestor leva para a reunião interna.

### 2.6 Alerta semanal

A peça de e-mail que fecha o ciclo semanal: preço da semana, previsão com faixa,
posição no benchmark e situação do modelo contra o naive.

O gerador **se recusa a produzir o corpo do e-mail sem link de descadastro**. Não
é validação opcional — é impossível gerar a peça sem ele.

### 2.7 Importar abastecimentos

Recebe a planilha de abastecimentos da empresa e aceita **exclusivamente** seis
colunas: data, UF, município, litros, valor total, produto.

Qualquer coluna com **placa, CPF, CNPJ, nome de motorista, CNH, telefone,
e-mail** ou equivalente **barra o arquivo inteiro**, com mensagem clara.

Ver a seção 4, que explica por que isso é funcionalidade e não limitação.

---

## 3. A máquina por trás das telas

### 3.1 Ingestão da série pública

Lê os arquivos da ANP em `.xlsx` ou CSV — decidindo o formato pelos **primeiros
bytes do conteúdo**, não pela extensão, porque órgão público já publicou arquivo
com extensão trocada.

Quatro comportamentos que definem a qualidade dessa parte:

**Resolve coluna por nome, nunca por posição.** Se um campo obrigatório não é
encontrado, a ingestão **para** e a mensagem lista o cabeçalho recebido inteiro.
O que ela nunca faz é carregar preço na coluna do município em silêncio.

**É idempotente.** Rodar duas vezes o mesmo arquivo devolve zero inserções e não
altera a contagem da tabela. É o que permite reprocessar sem medo toda semana.

**Preserva versões anteriores.** Quando a ANP corrige o preço de uma semana já
publicada, o valor antigo é arquivado em vez de sobrescrito. Sem isso seria
impossível provar qual número existia no momento em que uma previsão foi feita —
e o placar de acurácia perderia o sentido.

**Audita a fonte.** A cadência semanal é *inferida* do arquivo, não assumida como
sete dias, e todo desvio vira relatório. Na série real o sistema detectou sozinho
três buracos, dois deles conferindo com as notas de rodapé impressas pela própria
ANP (fim de contrato da pesquisa em 2015, suspensão de dois meses em 2020).

### 3.2 Previsão sem vazamento

A regra que governa tudo: **para prever `t+h`, só se pode usar informação
disponível até `t`** — e isso inclui escalonadores, escolha de janela e seleção de
modelo.

Três mecanismos garantem isso, em vez de uma promessa:

1. **Desenho defensivo da assinatura.** Nenhuma função de modelo recebe a série
   inteira; todas recebem o histórico já cortado. Não dá para vazar futuro sem
   alterar a assinatura da função.
2. **Prova gravada.** Cada execução registra `dados_ate`, a data de corte, que
   torna a afirmação "não houve vazamento" verificável depois do fato.
3. **Teste de mutação.** A suíte altera valores futuros da série e exige que
   nenhuma previsão anterior mude. Se mudar, houve vazamento, e o teste falha.

A seleção entre os modelos (naive, drift, média móvel de 3 semanas) é **refeita a
cada semana**, usando apenas erros cujo alvo já se realizou naquele momento.
Escolher o vencedor olhando a série inteira e depois "avaliar" nela é o erro
clássico que produz acurácia que evapora em produção.

### 3.3 Registro imutável e placar

Toda previsão é gravada em tabela **imutável**. Correção entra como execução
nova, nunca como reescrita — e a imutabilidade mora em *trigger*, não em política
de acesso, porque quem tem permissão para ignorar política não ignora trigger.

Semanas depois, quando a ANP publica a semana-alvo, o **valor realizado** é
anexado. Ele vem sempre da série pública, nunca do arquivo de quem produziu a
previsão. O realizado é mutável de propósito — se a ANP revisar a semana, ele
acompanha. A previsão, essa, não muda nunca.

Dessa assimetria nasce o placar: erro por linha, calculado sobre registro que não
pode ter sido ajustado depois.

### 3.4 Isolamento entre clientes

Cada organização enxerga apenas os próprios dados, e o filtro roda **dentro do
banco**, por política de linha — não por cláusula na aplicação. Uma consulta que
esqueça de filtrar por organização devolve, ainda assim, só o permitido.

Isso é provado por **teste automatizado** que demonstra que a organização A não
lê dados da B. Inspeção visual não conta como evidência: é exatamente o tipo de
falha que passa despercebida em revisão e aparece em produção.

### 3.5 Origem do dado declarada na tela

Cada bloco da interface declara de onde vem o número — e essa marcação é
**derivada do próprio dado**, não de uma configuração que alguém possa esquecer
de ligar.

- bloco alimentado pela série pública mostra selo de origem e data de coleta;
- bloco alimentado por dados de demonstração mostra selo de fictício;
- se os dois coexistirem na tabela de preços, a interface **alarma** em vez de
  escolher um para exibir;
- tela que depende de cliente e não tem cliente **diz isso**, em vez de mostrar
  zero ou quebrar.

### 3.6 Integração com modelo externo

Um modelo treinado fora do sistema — em outra linguagem, por outra pessoa — entra
por **contrato de arquivo**: entrega um CSV/JSON com identidade do modelo, UF,
semana de origem, data de corte, horizonte, semana-alvo, ponto e faixa. O sistema
valida, grava e passa a pontuá-lo ao lado dos demais.

Duas recusas deliberadas nesse contrato:

- **Métrica pronta não entra.** Coluna com erro, cobertura ou acurácia barra o
  arquivo. Toda métrica é recalculada internamente, com o mesmo protocolo para
  todos os modelos — métrica calculada de um lado não é comparável com a do
  outro, mesmo quando as duas estão certas.
- **Valor realizado não entra.** Ele vem da fonte pública. Importá-lo do arquivo
  de quem prevê criaria uma segunda série não auditável.

---

## 4. O que o sistema se recusa a fazer

Estas não são limitações técnicas. São funcionalidades no sentido inverso: o
produto se define também pelo que não aceita.

### 4.1 Não coleta dado pessoal

A importação aceita seis colunas e recusa qualquer outra que indique pessoa
física. A recusa acontece na leitura do **cabeçalho**, antes de qualquer célula
ser lida — o valor sensível nunca chega a existir em memória.

Do que foi rejeitado, guarda-se no máximo o **nome** da coluna, para a mensagem e
para auditoria. **Nunca o valor.** E o arquivo original não é persistido, porque
ele contém justamente as colunas recusadas.

É o que permite vender para uma empresa que tem receio de LGPD: a conversa deixa
de ser sobre como os dados serão protegidos e passa a ser sobre quais dados nem
chegam a ser pedidos.

### 4.2 Não inventa dado para preencher tabela

Se uma fonte falha, o sistema **para e reporta**. Não completa por aproximação,
não assume valor médio, não usa zero no lugar de ausente. Um preço de R$ 0,00
criado para "não deixar buraco" é pior que buraco declarado.

### 4.3 Não ajusta o modelo até vencer

Quando o resultado é pior que a referência, ele é reportado assim. Ajustar
hiperparâmetro até o número agradar é o caminho mais curto para uma acurácia que
não sobrevive ao primeiro mês em produção.

### 4.4 Não publica número sem procedência

Todo número exibido tem origem rastreável: fonte pública com hash e data de
coleta, ou marcação explícita de demonstração. Não existe número que só exista na
tela.

---

## 5. Fora de escopo na v1

Registrado porque delimitar escopo é parte da especificação:

- integração com ERP, TMS ou cartão de abastecimento;
- telemetria de veículo e otimização de rota;
- previsão por posto individual;
- aplicativo móvel nativo;
- cobrança e faturamento automatizados;
- modelos de aprendizado de máquina complexos — a v1 exige explicabilidade.

---

## 6. Estado atual

O que está construído e verificado por execução:

- ingestão da série real da ANP, em `.xlsx` e CSV, com contrato de colunas,
  idempotência, preservação de revisões e auditoria de cadência;
- as sete telas, operando sobre a série real;
- motor de previsão walk-forward com seleção online e teste de não-vazamento;
- placar de acurácia com comparação obrigatória contra a referência ingênua;
- isolamento entre organizações com teste automatizado;
- recusa de dado pessoal na importação, com teste que verifica ausência de
  vazamento do valor;
- adaptador para modelo externo, com contrato e testes.

O que **não** está construído:

- persistência do lote de importação (a tela valida e mostra, mas não grava);
- autenticação real de usuário;
- envio efetivo do alerta semanal e processamento do descadastro;
- agendamento semanal automático da ingestão;
- implantação em ambiente gerenciado.

Um defeito conhecido, registrado em vez de omitido:

- **a faixa P10–P90 está estreita demais.** Deveria conter o realizado em ~80%
  dos casos; na medição sobre a série real cobre entre 60% e 64%. A correção está
  identificada e pendente.

E um resultado que o produto exibe em vez de esconder:

- **o modelo perde da referência ingênua** nos quatro horizontes. Preço semanal de
  diesel é próximo de um passeio aleatório, e que o naive seja difícil de bater é
  achado clássico em séries de preço. É por isso que o valor do produto está no
  benchmark, que independe de previsão, e na publicação honesta da acurácia.
