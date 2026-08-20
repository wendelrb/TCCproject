# Backtest walk-forward sobre a série REAL da ANP

Execução de 2026-08-20 nesta sessão. Fonte: `tcc_real`, série da ANP
ingerida dos arquivos registrados em `DATA_PROVENANCE.md`.

Comando:

```
node scripts/backtest.ts --db postgres://…/tcc_real --gravar
```

Saída bruta, sem edição:

```
=== BACKTEST WALK-FORWARD POR UF ===
fonte: postgres:***@127.0.0.1:55432/tcc_real | min. treino: 26 semanas
modelo escolhido online entre naive / drift / mm3, sem olhar o futuro

UF   modelo               n      MAE     RMSE    MASE   dir.%   PICP%
------------------------------------------------------------------------
AC   escolhido (wf)    2636   0.0889   0.1860   3.952     2.0    64.4
AC   naive (referência)  2636   0.0885   0.1859   3.938     0.0    64.8
     ⚠️  em AC o modelo NÃO bate o naive (MAE 0.0889 vs 0.0885)
AL   escolhido (wf)    2652   0.0778   0.1532   2.836    18.3    64.8
AL   naive (referência)  2652   0.0774   0.1528   2.821     0.0    66.5
     ⚠️  em AL o modelo NÃO bate o naive (MAE 0.0778 vs 0.0774)
AM   escolhido (wf)    2652   0.0787   0.1533   2.926    14.0    64.4
AM   naive (referência)  2652   0.0783   0.1528   2.912     0.0    65.0
     ⚠️  em AM o modelo NÃO bate o naive (MAE 0.0787 vs 0.0783)
AP   escolhido (wf)    2624   0.0881   0.1595   2.910     1.2    58.8
AP   naive (referência)  2624   0.0880   0.1595   2.905     0.0    59.3
     ⚠️  em AP o modelo NÃO bate o naive (MAE 0.0881 vs 0.0880)
BA   escolhido (wf)    2656   0.0952   0.1963   3.525     1.1    59.8
BA   naive (referência)  2656   0.0949   0.1963   3.517     0.0    60.2
     ⚠️  em BA o modelo NÃO bate o naive (MAE 0.0952 vs 0.0949)
CE   escolhido (wf)    2656   0.0782   0.1573   6.207     2.1    59.2
CE   naive (referência)  2656   0.0781   0.1573   6.202     0.0    59.4
     ⚠️  em CE o modelo NÃO bate o naive (MAE 0.0782 vs 0.0781)
DF   escolhido (wf)    2640   0.0819   0.1811   4.444     0.9    62.3
DF   naive (referência)  2640   0.0817   0.1809   4.431     0.0    62.5
     ⚠️  em DF o modelo NÃO bate o naive (MAE 0.0819 vs 0.0817)
ES   escolhido (wf)    2656   0.0653   0.1370   2.406     8.2    66.2
ES   naive (referência)  2656   0.0650   0.1368   2.393     0.0    66.5
     ⚠️  em ES o modelo NÃO bate o naive (MAE 0.0653 vs 0.0650)
GO   escolhido (wf)    2656   0.0755   0.1746   3.751     0.7    61.5
GO   naive (referência)  2656   0.0753   0.1746   3.745     0.0    61.7
     ⚠️  em GO o modelo NÃO bate o naive (MAE 0.0755 vs 0.0753)
MA   escolhido (wf)    2656   0.0767   0.1672   5.510     1.9    59.9
MA   naive (referência)  2656   0.0765   0.1671   5.499     0.0    60.3
     ⚠️  em MA o modelo NÃO bate o naive (MAE 0.0767 vs 0.0765)
MG   escolhido (wf)    2656   0.0688   0.1601   5.392     1.1    61.1
MG   naive (referência)  2656   0.0686   0.1600   5.377     0.0    61.4
     ⚠️  em MG o modelo NÃO bate o naive (MAE 0.0688 vs 0.0686)
MS   escolhido (wf)    2656   0.0759   0.1525   5.440     0.9    59.8
MS   naive (referência)  2656   0.0758   0.1525   5.431     0.0    60.1
     ⚠️  em MS o modelo NÃO bate o naive (MAE 0.0759 vs 0.0758)
MT   escolhido (wf)    2652   0.0807   0.1629   4.505     1.7    58.5
MT   naive (referência)  2652   0.0806   0.1629   4.498     0.0    58.5
     ⚠️  em MT o modelo NÃO bate o naive (MAE 0.0807 vs 0.0806)
PA   escolhido (wf)    2656   0.0820   0.1645   5.956     1.2    61.2
PA   naive (referência)  2656   0.0817   0.1644   5.938     0.0    61.4
     ⚠️  em PA o modelo NÃO bate o naive (MAE 0.0820 vs 0.0817)
PB   escolhido (wf)    2656   0.0663   0.1458   3.844     1.1    62.4
PB   naive (referência)  2656   0.0661   0.1457   3.832     0.0    62.7
     ⚠️  em PB o modelo NÃO bate o naive (MAE 0.0663 vs 0.0661)
PE   escolhido (wf)    2656   0.0722   0.1550   7.776     1.1    59.5
PE   naive (referência)  2656   0.0720   0.1549   7.755     0.0    59.8
     ⚠️  em PE o modelo NÃO bate o naive (MAE 0.0722 vs 0.0720)
PI   escolhido (wf)    2652   0.0810   0.1709   5.639     0.8    61.3
PI   naive (referência)  2652   0.0808   0.1709   5.626     0.0    61.7
     ⚠️  em PI o modelo NÃO bate o naive (MAE 0.0810 vs 0.0808)
PR   escolhido (wf)    2656   0.0703   0.1634   5.123     1.1    62.1
PR   naive (referência)  2656   0.0701   0.1634   5.107     0.0    62.2
     ⚠️  em PR o modelo NÃO bate o naive (MAE 0.0703 vs 0.0701)
RJ   escolhido (wf)    2656   0.0625   0.1348   2.142     3.9    65.8
RJ   naive (referência)  2656   0.0624   0.1347   2.136     0.0    66.2
     ⚠️  em RJ o modelo NÃO bate o naive (MAE 0.0625 vs 0.0624)
RN   escolhido (wf)    2652   0.0823   0.1597   7.047     2.3    60.0
RN   naive (referência)  2652   0.0820   0.1597   7.024     0.0    60.3
     ⚠️  em RN o modelo NÃO bate o naive (MAE 0.0823 vs 0.0820)
RO   escolhido (wf)    2648   0.0708   0.1427   5.901     0.0    60.7
RO   naive (referência)  2648   0.0708   0.1427   5.901     0.0    60.7
     ⚠️  em RO o modelo NÃO bate o naive (MAE 0.0708 vs 0.0708)
RR   escolhido (wf)    2652   0.0732   0.1476   5.977     1.1    61.7
RR   naive (referência)  2652   0.0727   0.1475   5.942     0.0    62.1
     ⚠️  em RR o modelo NÃO bate o naive (MAE 0.0732 vs 0.0727)
RS   escolhido (wf)    2656   0.0663   0.1468   3.340     0.7    64.0
RS   naive (referência)  2656   0.0661   0.1467   3.331     0.0    64.1
     ⚠️  em RS o modelo NÃO bate o naive (MAE 0.0663 vs 0.0661)
SC   escolhido (wf)    2656   0.0670   0.1494   3.549     1.1    62.1
SC   naive (referência)  2656   0.0669   0.1494   3.544     0.0    62.3
     ⚠️  em SC o modelo NÃO bate o naive (MAE 0.0670 vs 0.0669)
SE   escolhido (wf)    2656   0.0861   0.1695   5.772     1.1    58.6
SE   naive (referência)  2656   0.0860   0.1694   5.762     0.0    58.9
     ⚠️  em SE o modelo NÃO bate o naive (MAE 0.0861 vs 0.0860)
SP   escolhido (wf)    2656   0.0652   0.1500   4.169     1.6    64.0
SP   naive (referência)  2656   0.0650   0.1499   4.159     0.0    64.0
     ⚠️  em SP o modelo NÃO bate o naive (MAE 0.0652 vs 0.0650)
TO   escolhido (wf)    2656   0.0786   0.1745   6.482     0.7    61.7
TO   naive (referência)  2656   0.0785   0.1744   6.473     0.0    62.0
     ⚠️  em TO o modelo NÃO bate o naive (MAE 0.0786 vs 0.0785)

143764 previsões gravadas.
```

## Consolidado

Consultas sobre `v_forecast_placar` depois da gravação:

```
 ufs | venceu | perdeu | mae_modelo | mae_naive | picp%
-----+--------+--------+------------+-----------+-------
  27 |      0 |     27 |     0.0761 |    0.0759 |  61.8
```

```
 h |   n   |  mae   | picp
---+-------+--------+------
 1 | 17317 | 0.0413 | 64.1
 2 | 17265 | 0.0647 | 61.8
 3 | 17213 | 0.0886 | 61.4
 4 | 17161 | 0.1098 | 59.9
```

143.764 previsões gravadas, todas oficiais, dois modelos (`wf-selecao-v1` e
`naive-v1`), alvos de 2013-08-25 a 2026-09-06.

## Leitura honesta

**Em 27 das 27 UFs o modelo escolhido perde para o naive.** A margem é pequena
(MAE médio 0,0761 contra 0,0759, ou 0,26% pior), mas perde em todas — não há uma
única UF em que vença. Isso não vai ser ajustado até virar vitória: o CLAUDE.md
proíbe, e a tela do produto mostra assim.

Três observações que valem para o TCC, e que são conclusões, não desculpas:

1. **Preço semanal de combustível é próximo de um passeio aleatório.** O naive é
   uma referência forte de verdade nesta série. Qualquer modelo — inclusive o
   ARIMA do colega — encontra a mesma parede. Mostrar isso com 701 semanas e 27
   UFs é resultado, não fracasso.

2. **O intervalo P10–P90 está estreito demais.** O nominal é 80% de cobertura; o
   observado é **61,8%**, e piora com o horizonte (64,1% em h=1 para 59,9% em
   h=4). Os quantis empíricos dos resíduos da janela de treino subestimam a
   volatilidade futura. É um defeito real e mensurado do método atual.

3. **O erro cresce de forma quase linear com o horizonte** (0,0413 → 0,1098 de
   h=1 a h=4), o que é a assinatura de série integrada. Previsão de 4 semanas
   erra ~2,7 vezes mais que a de 1 semana.

**Nenhum destes números pode ser apresentado como acurácia de produto vendável
sem esta página junto.**
