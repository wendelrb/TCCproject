-- Quebras de série da ANP, transcritas do preâmbulo do próprio arquivo.
--
-- As linhas 8 a 13 de `SEMANAL_ESTADOS-DESDE_2013.xlsx` trazem notas da ANP
-- sobre períodos sem pesquisa, mudança de cobertura geográfica e mudança de
-- metodologia. São exatamente o tipo de coisa que, ignorada, faz um backtest
-- comparar semanas que não são comparáveis.
--
-- Transcrição, não interpretação: o texto de `descricao` é o da própria ANP,
-- abreviado. As datas vieram do texto e batem com os gaps que o
-- `analisarCadencia` detectou sozinho na ingestão — as duas evidências são
-- independentes e concordam.
--
-- Idempotente: rodar duas vezes não duplica.
--
--   psql "$DATABASE_URL" -f scripts/quebras-anp.sql

insert into public.source_breaks (fonte, tipo, vigente_de, vigente_ate, descricao, evidencia_url)
select * from (values
  (
    'ANP:levantamento-semanal',
    'COBERTURA'::public.tipo_quebra,
    date '2015-08-16', date '2015-08-22',
    'Sem pesquisa de preços: término do contrato que vigeu até 11/8/2015 e '
      'publicação do novo contrato apenas em 21/8/2015. Confirmado pelo gap '
      'detectado na ingestão (2015-08-09 -> 2015-08-23, 14 dias).',
    'preâmbulo do arquivo semanal da ANP, linha 9'
  ),
  (
    'ANP:levantamento-semanal',
    'COBERTURA'::public.tipo_quebra,
    date '2017-07-30', date '2017-12-30',
    'Abrangência reduzida de 501 para 459 municípios: 26 capitais e o DF '
      'semanalmente; outros 432 municípios quinzenalmente, alternando Grupo A '
      'e Grupo B. A própria ANP recomenda comparar semanas INTERCALADAS neste '
      'período — comparar semanas consecutivas mistura conjuntos diferentes de '
      'municípios.',
    'preâmbulo do arquivo semanal da ANP, linhas 10 e 11'
  ),
  (
    'ANP:levantamento-semanal',
    'COBERTURA'::public.tipo_quebra,
    date '2018-05-27', date '2018-06-02',
    'Quantitativo de revendas pesquisadas reduzido em cerca de 85% por causa '
      'da greve dos caminhoneiros. A semana existe na série, mas a média vem '
      'de uma amostra muito menor.',
    'preâmbulo do arquivo semanal da ANP, linha 12'
  ),
  (
    'ANP:levantamento-semanal',
    'COBERTURA'::public.tipo_quebra,
    date '2020-08-18', date '2020-10-17',
    'Sem pesquisa de preços por dois meses. Confirmado pelo gap detectado na '
      'ingestão (2020-08-16 -> 2020-10-18, 63 dias, 8 semanas faltando).',
    'preâmbulo do arquivo semanal da ANP, linha 13'
  ),
  (
    'ANP:levantamento-semanal',
    'METODOLOGIA'::public.tipo_quebra,
    date '2020-08-18', null,
    'Preços de DISTRIBUIÇÃO deixaram de ser coletados pela pesquisa (últimos '
      'em 17/8/2020). Por isso as colunas de distribuição ficam vazias daí em '
      'diante; a série de revenda, que é a usada pelo produto, continua.',
    'preâmbulo do arquivo semanal da ANP, linha 13'
  ),
  (
    'ANP:levantamento-semanal',
    'METODOLOGIA'::public.tipo_quebra,
    date '2022-05-08', null,
    'Resolução ANP nº 858/2021: preços por litro passam a ser expressos com '
      'DUAS casas decimais no painel e nas bombas. Antes disso a série tem três '
      'casas. Muda a granularidade do arredondamento, e portanto o piso do erro '
      'mensurável.',
    'preâmbulo do arquivo semanal da ANP, linha 14'
  ),
  (
    'ANP:levantamento-semanal',
    'NOMENCLATURA'::public.tipo_quebra,
    date '2012-12-30', null,
    'A série publica "OLEO DIESEL" e "OLEO DIESEL S10" em PARALELO durante todo '
      'o período (18.851 e 18.902 linhas no arquivo de estados). "OLEO DIESEL" '
      'é o diesel comum (S500), produto DIFERENTE — não é grafia antiga do S10. '
      'O classificador marca como suspeito e descarta; esta linha é a '
      'confirmação humana de que descartar é o certo.',
    'contagem por produto no arquivo semanal de estados da ANP'
  )
) as v(fonte, tipo, vigente_de, vigente_ate, descricao, evidencia_url)
where not exists (
  select 1 from public.source_breaks s
   where s.fonte = v.fonte and s.tipo = v.tipo and s.vigente_de = v.vigente_de
);
