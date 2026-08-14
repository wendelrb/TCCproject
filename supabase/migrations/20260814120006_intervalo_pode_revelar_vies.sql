-- Corrige a constraint do intervalo de previsão.
--
-- A original exigia p10 <= valor_previsto <= p90. Parecia óbvia e estava errada.
--
-- O intervalo da v1 vem dos QUANTIS EMPÍRICOS DOS RESÍDUOS walk-forward
-- (SPEC §5). Se o modelo vinha errando sistematicamente para o mesmo lado, os
-- resíduos são todos do mesmo sinal e o intervalo desloca — podendo não conter
-- o ponto. Isso não é inconsistência: é o intervalo denunciando viés do modelo,
-- que é justamente o tipo de coisa que este produto promete não esconder.
--
-- Observado no backtest do motor: 14 de 422 previsões numa série de teste,
-- todas do modelo `drift`, com o intervalo inteiramente acima do ponto.
--
-- A alternativa era corrigir o ponto pelo resíduo mediano para forçá-lo para
-- dentro. Descartada: mudaria o modelo definido na SPEC para deixar o gráfico
-- mais bonito, e o CLAUDE.md proíbe ajustar até o resultado agradar.
-- Ver ASSUMPTIONS.md A-020.

alter table public.forecasts
  drop constraint forecasts_intervalo_coerente;

alter table public.forecasts
  add constraint forecasts_intervalo_ordenado check (p10 <= p90);

comment on column public.forecasts.p10 is
  'Quantil 10 dos resíduos walk-forward somado ao ponto. Pode ficar acima do '
  'ponto quando o modelo está enviesado — é sinal, não erro.';
