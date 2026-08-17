'use client';

import { useMemo, useState } from 'react';
import { Card, Slider, InputNumber, Alert, Segmented } from 'antd';

import {
  compararEstrategias, simularProspectivo,
  type Parametros,
} from '../../supabase/functions/_shared/simulacao/compra.ts';
import type { PontoSerie } from '../lib/consultas.ts';

const CAMINHOS = 600;
const COR_1 = '#2a78d6';
const COR_2 = '#eb6834';

function brl(v: number, casas = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function Simulador({
  historico,
  residuos,
  precoAtual,
  uf,
}: {
  historico: PontoSerie[];
  residuos: number[];
  precoAtual: number;
  uf: string;
}) {
  const [consumo, setConsumo] = useState(1500);
  const [tanque, setTanque] = useState(8000);
  const [juros, setJuros] = useState(13);
  const [janela, setJanela] = useState<number>(26);

  const params: Parametros = useMemo(
    () => ({
      consumoSemanalLitros: consumo,
      capacidadeTanqueLitros: tanque,
      custoCapitalAnual: juros / 100,
    }),
    [consumo, tanque, juros],
  );

  const retro = useMemo(() => {
    const precos = historico.slice(-janela).map((p) => p.valor);
    return compararEstrategias(precos, params, [1, 2, 3, 4, 6, 8]);
  }, [historico, janela, params]);

  const pros = useMemo(
    () =>
      simularProspectivo(
        precoAtual,
        residuos,
        params,
        { horizonteSemanas: 8, caminhos: CAMINHOS, semente: 20260814 },
        [1, 2, 3, 4, 6, 8],
      ),
    [precoAtual, residuos, params],
  );

  const baseP50 = pros.distribuicoes.find((d) => d.antecipacaoSemanas === 1)?.p50 ?? Number.NaN;
  const semResiduos = residuos.length === 0;

  return (
    <>
      <Card size="small" title="Seus parâmetros" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          <div>
            <div className="rotulo-campo">Consumo semanal (litros)</div>
            <Slider min={200} max={20000} step={100} value={consumo} onChange={setConsumo} />
            <InputNumber value={consumo} onChange={(v) => setConsumo(v ?? 0)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="rotulo-campo">Capacidade de tanque (litros)</div>
            <Slider min={1000} max={120000} step={1000} value={tanque} onChange={setTanque} />
            <InputNumber value={tanque} onChange={(v) => setTanque(v ?? 0)} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="rotulo-campo">Custo de capital (% ao ano)</div>
            <Slider min={0} max={30} step={0.5} value={juros} onChange={setJuros} />
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              Dinheiro parado em tanque tem custo. Zerar isso faz antecipar parecer melhor do que é.
            </p>
          </div>
          <div>
            <div className="rotulo-campo">Janela do retrospectivo</div>
            <Segmented
              value={janela}
              onChange={(v) => setJanela(Number(v))}
              options={[
                { label: '26 semanas', value: 26 },
                { label: '52 semanas', value: 52 },
                { label: '104 semanas', value: 104 },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card
        size="small"
        title={`Retrospectivo — o que cada estratégia teria custado em ${uf}, últimas ${janela} semanas`}
        style={{ marginBottom: 16 }}
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
          Aqui não há previsão envolvida: é a série que já aconteceu. É a evidência mais difícil de
          contestar, porque não depende de o modelo acertar.
        </p>
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Estratégia</th>
              <th>Compras</th>
              <th>Combustível (R$)</th>
              <th>Custo de capital (R$)</th>
              <th>Total (R$)</th>
              <th>R$/L efetivo</th>
              <th>vs comprar toda semana</th>
            </tr>
          </thead>
          <tbody>
            {retro.estrategias.map((e) => {
              const dif = retro.base.viavel && e.viavel ? retro.base.custoTotal - e.custoTotal : 0;
              const melhor = retro.melhor?.antecipacaoSemanas === e.antecipacaoSemanas;
              return (
                <tr key={e.antecipacaoSemanas} style={melhor ? { background: 'var(--surface-2)' } : undefined}>
                  <td style={{ textAlign: 'left' }}>
                    {e.antecipacaoSemanas === 1 ? 'Comprar toda semana' : `Antecipar ${e.antecipacaoSemanas} semanas`}
                    {melhor && <strong style={{ color: COR_1 }}> · melhor</strong>}
                  </td>
                  {e.viavel ? (
                    <>
                      <td>{e.compras}</td>
                      <td>{brl(e.custoCombustivel)}</td>
                      <td>{brl(e.custoCapital)}</td>
                      <td>
                        <strong>{brl(e.custoTotal)}</strong>
                      </td>
                      <td>{brl(e.precoMedioEfetivo, 3)}</td>
                      <td style={{ color: dif > 0 ? COR_1 : dif < 0 ? COR_2 : 'var(--text-secondary)', fontWeight: 600 }}>
                        {dif === 0 ? '—' : `${dif > 0 ? '+' : '−'}${brl(Math.abs(dif))}`}
                      </td>
                    </>
                  ) : (
                    <td colSpan={6} style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                      inviável: {e.motivoInviavel}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card size="small" title="Prospectivo — distribuição do custo nas próximas 8 semanas">
        {semResiduos ? (
          <Alert
            type="warning"
            showIcon
            message="Sem resíduos históricos suficientes"
            description="O cenário prospectivo depende dos resíduos do backtest. Rode scripts/backtest.ts --gravar antes."
          />
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
              {CAMINHOS} caminhos de preço, cada passo sorteando um resíduo real do backtest
              ({residuos.length} disponíveis). Usar os resíduos observados, em vez de uma normal,
              preserva as caudas — e em combustível o choque de alta é mais violento que o passeio de baixa.
            </p>

            {pros.antecipacaoComparada === null ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 14 }}
                message="Nenhuma antecipação cabe no seu tanque"
                description={
                  `Com ${consumo.toLocaleString('pt-BR')} L por semana e tanque de ` +
                  `${tanque.toLocaleString('pt-BR')} L, não sobra espaço para comprar adiantado. ` +
                  'A pergunta "vale antecipar?" não tem resposta neste cenário — aumente o tanque ou reduza o consumo simulado.'
                }
              />
            ) : (
              <Alert
                type={pros.probEsperarCompensa > 0.5 ? 'info' : 'warning'}
                showIcon
                style={{ marginBottom: 14 }}
                message={
                  pros.probEsperarCompensa > 0.5
                    ? `Em ${(pros.probEsperarCompensa * 100).toFixed(0)}% dos cenários, comprar toda semana sai mais barato que antecipar ${pros.antecipacaoComparada}.`
                    : `Em ${((1 - pros.probEsperarCompensa) * 100).toFixed(0)}% dos cenários, antecipar ${pros.antecipacaoComparada} semanas sai mais barato que comprar toda semana.`
                }
                description={
                  `Comparação contra antecipar ${pros.antecipacaoComparada} semanas — a maior que cabe no seu tanque. ` +
                  'Probabilidade não é certeza: a coluna P10–P90 abaixo mostra o quanto o resultado varia.'
                }
              />
            )}

            <FaixaCenarios caminhos={pros.caminhos} precoAtual={precoAtual} />

            <table className="tabela-simples" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Estratégia</th>
                  <th>Custo P10 (R$)</th>
                  <th>Mediana (R$)</th>
                  <th>Custo P90 (R$)</th>
                  <th>Mediana vs semanal</th>
                </tr>
              </thead>
              <tbody>
                {pros.distribuicoes.map((d) => {
                  const dif = Number.isFinite(baseP50) && d.viavel ? baseP50 - d.p50 : 0;
                  return (
                    <tr key={d.antecipacaoSemanas}>
                      <td style={{ textAlign: 'left' }}>
                        {d.antecipacaoSemanas === 1 ? 'Comprar toda semana' : `Antecipar ${d.antecipacaoSemanas} semanas`}
                      </td>
                      {d.viavel ? (
                        <>
                          <td>{brl(d.p10)}</td>
                          <td>
                            <strong>{brl(d.p50)}</strong>
                          </td>
                          <td>{brl(d.p90)}</td>
                          <td style={{ color: dif > 0 ? COR_1 : dif < 0 ? COR_2 : 'var(--text-secondary)', fontWeight: 600 }}>
                            {dif === 0 ? '—' : `${dif > 0 ? '+' : '−'}${brl(Math.abs(dif))}`}
                          </td>
                        </>
                      ) : (
                        <td colSpan={4} style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                          não cabe no tanque
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </>
  );
}

/** Envelope P10–P90 dos caminhos simulados, com a mediana por cima. */
function FaixaCenarios({
  caminhos,
  precoAtual,
}: {
  caminhos: readonly (readonly number[])[];
  precoAtual: number;
}) {
  if (caminhos.length === 0) return null;
  const h = caminhos[0]?.length ?? 0;
  if (h === 0) return null;

  const q = (vals: number[], p: number) => {
    const s = [...vals].sort((a, b) => a - b);
    const pos = (s.length - 1) * p;
    const b = Math.floor(pos);
    return (s[b] ?? 0) + ((s[Math.ceil(pos)] ?? 0) - (s[b] ?? 0)) * (pos - b);
  };

  const passos = Array.from({ length: h }, (_, i) => caminhos.map((c) => c[i] ?? 0));
  const p10 = passos.map((v) => q(v, 0.1));
  const p50 = passos.map((v) => q(v, 0.5));
  const p90 = passos.map((v) => q(v, 0.9));

  const L = 820, A = 210, M = { t: 12, r: 16, b: 26, e: 48 };
  const todos = [precoAtual, ...p10, ...p90];
  const min = Math.min(...todos), max = Math.max(...todos);
  const folga = (max - min) * 0.1 || 0.1;
  const y0 = min - folga, y1 = max + folga;
  const lp = L - M.e - M.r, ap = A - M.t - M.b;
  const X = (i: number) => M.e + (i / h) * lp;
  const Y = (v: number) => M.t + ap - ((v - y0) / (y1 - y0)) * ap;

  const banda =
    `M ${X(0)} ${Y(precoAtual)} ` +
    p90.map((v, i) => `L ${X(i + 1).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ') + ' ' +
    [...p10].map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `L ${X(i + 1).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ') +
    ` L ${X(0)} ${Y(precoAtual)} Z`;

  const mediana = `M ${X(0)} ${Y(precoAtual)} ` + p50.map((v, i) => `L ${X(i + 1).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');

  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="legenda">
        <span>
          <i className="chave" style={{ background: COR_2, opacity: 0.35 }} /> faixa P10–P90 dos cenários
        </span>
        <span>
          <i className="chave" style={{ background: COR_2 }} /> mediana
        </span>
      </div>
      <svg viewBox={`0 0 ${L} ${A}`} width="100%" role="img" aria-label="Faixa de cenários de preço nas próximas semanas">
        {[0, 0.5, 1].map((f) => {
          const v = y0 + f * (y1 - y0);
          return (
            <g key={f}>
              <line x1={M.e} x2={L - M.r} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" />
              <text x={M.e - 8} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: h + 1 }, (_, i) => (
          <text key={i} x={X(i)} y={A - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
            {i === 0 ? 'hoje' : `+${i}`}
          </text>
        ))}
        <path d={banda} fill={COR_2} opacity={0.18} />
        <path d={mediana} fill="none" stroke={COR_2} strokeWidth={2} />
        <circle cx={X(0)} cy={Y(precoAtual)} r={4} fill={COR_1} />
      </svg>
    </div>
  );
}
