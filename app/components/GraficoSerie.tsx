'use client';

import { useMemo, useState } from 'react';

/**
 * Série temporal com banda de previsão opcional.
 *
 * Decisões de forma, seguindo a orientação de dataviz:
 * - eixo único (jamais dois eixos y);
 * - linha de 2px, grade recessiva, rótulo direto no fim da série em vez de
 *   número em todo ponto;
 * - camada de hover com crosshair + tooltip, que é o padrão para gráfico
 *   HTML/SVG e não um extra;
 * - identidade nunca só por cor: cada série tem rótulo direto e legenda.
 * Cores: slots 1 e 2 da paleta de referência, validadas nesta sessão.
 */

export interface Ponto {
  readonly semana: string;
  readonly valor: number;
}

export interface PontoPrevisao {
  readonly semana: string;
  readonly valor: number;
  readonly p10: number;
  readonly p90: number;
}

const COR_HIST = 'var(--ambar)';
const COR_PREV = 'var(--azul)';

const M = { topo: 16, direita: 74, baixo: 30, esquerda: 52 };

function formatarBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a?.slice(2)}`;
}

export function GraficoSerie({
  historico,
  previsao = [],
  altura = 260,
  largura = 860,
}: {
  historico: readonly Ponto[];
  previsao?: readonly PontoPrevisao[];
  altura?: number;
  largura?: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);

  const modelo = useMemo(() => {
    const todos = [
      ...historico.map((p) => ({ ...p, tipo: 'hist' as const, p10: p.valor, p90: p.valor })),
      ...previsao.map((p) => ({ ...p, tipo: 'prev' as const })),
    ];
    const valores = todos.flatMap((p) => [p.valor, p.p10, p.p90]);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const folga = (max - min) * 0.12 || 0.1;
    const y0 = min - folga;
    const y1 = max + folga;

    const larguraPlot = largura - M.esquerda - M.direita;
    const alturaPlot = altura - M.topo - M.baixo;

    const x = (i: number) => M.esquerda + (i / Math.max(1, todos.length - 1)) * larguraPlot;
    const y = (v: number) => M.topo + alturaPlot - ((v - y0) / (y1 - y0)) * alturaPlot;

    return { todos, x, y, y0, y1, larguraPlot, alturaPlot };
  }, [historico, previsao, altura, largura]);

  const { todos, x, y, y0, y1, alturaPlot } = modelo;
  if (todos.length === 0) return <p>Sem dados.</p>;

  const iCorte = historico.length - 1;
  const linhaHist = historico.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.valor)}`).join(' ');

  const idxPrev = previsao.map((_, k) => historico.length + k);
  const linhaPrev =
    previsao.length > 0
      ? `M ${x(iCorte)} ${y(historico[iCorte]?.valor ?? 0)} ` +
        previsao.map((p, k) => `L ${x(idxPrev[k] ?? 0)} ${y(p.valor)}`).join(' ')
      : '';

  const banda =
    previsao.length > 0
      ? `M ${x(iCorte)} ${y(historico[iCorte]?.valor ?? 0)} ` +
        previsao.map((p, k) => `L ${x(idxPrev[k] ?? 0)} ${y(p.p90)}`).join(' ') +
        ' ' +
        [...previsao]
          .map((p, k) => ({ p, k }))
          .reverse()
          .map(({ p, k }) => `L ${x(idxPrev[k] ?? 0)} ${y(p.p10)}`)
          .join(' ') +
        ` L ${x(iCorte)} ${y(historico[iCorte]?.valor ?? 0)} Z`
      : '';

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => y0 + f * (y1 - y0));
  const passoRotulo = Math.max(1, Math.ceil(todos.length / 8));
  const pontoAtivo = ativo === null ? null : todos[ativo];

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <div className="legenda">
        <span>
          <i className="chave" style={{ background: COR_HIST }} /> Preço médio observado
        </span>
        {previsao.length > 0 && (
          <span>
            <i className="chave" style={{ background: COR_PREV }} /> Previsão (faixa = P10–P90)
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        width="100%"
        role="img"
        aria-label="Série semanal do preço médio de revenda do diesel S-10"
        onMouseLeave={() => setAtivo(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.esquerda} x2={largura - M.direita} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth={1} />
            <text x={M.esquerda - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        {todos.map((p, i) =>
          i % passoRotulo === 0 ? (
            <text key={p.semana + i} x={x(i)} y={altura - 10} textAnchor="middle" fontSize={10} fill="var(--ink-3)">
              {formatarData(p.semana)}
            </text>
          ) : null,
        )}

        {banda !== '' && <path d={banda} fill={COR_PREV} opacity={0.16} />}
        <path d={linhaHist} fill="none" stroke={COR_HIST} strokeWidth={2} strokeLinejoin="round" />
        {linhaPrev !== '' && (
          <path d={linhaPrev} fill="none" stroke={COR_PREV} strokeWidth={2} strokeDasharray="5 4" />
        )}

        {/* Rótulo direto: identidade sem depender só de cor. */}
        <text
          x={x(iCorte) + 6}
          y={y(historico[iCorte]?.valor ?? 0) - 8}
          fontSize={11}
          fontWeight={600}
          fill="var(--ink-2)"
        >
          {previsao.length > 0 ? 'hoje' : `R$ ${formatarBRL(historico[iCorte]?.valor ?? 0)}`}
        </text>
        {previsao.length > 0 && (
          <text
            x={x(todos.length - 1) + 6}
            y={y(previsao[previsao.length - 1]?.valor ?? 0) + 4}
            fontSize={11}
            fontWeight={600}
            fill={COR_PREV}
          >
            +{previsao.length}s
          </text>
        )}

        {pontoAtivo !== null && pontoAtivo !== undefined && ativo !== null && (
          <g>
            <line
              x1={x(ativo)}
              x2={x(ativo)}
              y1={M.topo}
              y2={M.topo + alturaPlot}
              stroke="var(--ink-3)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={x(ativo)}
              cy={y(pontoAtivo.valor)}
              r={5}
              fill={pontoAtivo.tipo === 'hist' ? COR_HIST : COR_PREV}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
        )}

        {todos.map((p, i) => (
          <rect
            key={`hit-${p.semana}-${i}`}
            x={x(i) - 6}
            y={M.topo}
            width={12}
            height={alturaPlot}
            fill="transparent"
            onMouseEnter={() => setAtivo(i)}
          />
        ))}
      </svg>

      {pontoAtivo !== null && pontoAtivo !== undefined && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'var(--elev)',
            border: '1px solid var(--hairline-forte)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,.08)',
          }}
        >
          <strong>{formatarData(pontoAtivo.semana)}</strong>
          <br />
          R$ {formatarBRL(pontoAtivo.valor)}/L
          {pontoAtivo.tipo === 'prev' && (
            <>
              <br />
              <span style={{ color: 'var(--ink-2)' }}>
                P10–P90: {formatarBRL(pontoAtivo.p10)}–{formatarBRL(pontoAtivo.p90)}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
