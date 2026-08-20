import { Card, Alert } from 'antd';

import { GraficoSerie } from './components/GraficoSerie.tsx';
import { usuarioAtual } from './lib/demo.ts';
import { benchmark, historicoUf, precoAtual } from './lib/consultas.ts';
import { proveniencia } from './lib/proveniencia.ts';
import { SeloCliente, SeloSerie, SemCliente } from './components/Selos.tsx';

export const dynamic = 'force-dynamic';

function nf(v: number | null | undefined, casas = 3): string {
  return v == null || Number.isNaN(v)
    ? '—'
    : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

const inteiro = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const money = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Delta com seta E sinal — a cor é reforço, nunca a informação (ver app/tema.ts). */
function ChipDelta({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="chip chip-neutro">—</span>;
  if (Math.abs(valor) < 1e-9) return <span className="chip chip-neutro">estável</span>;
  const sobe = valor > 0;
  return (
    <span className={`chip ${sobe ? 'chip-sobe' : 'chip-cai'}`}>
      {sobe ? '▲ +' : '▼ −'}
      {nf(Math.abs(valor))}
    </span>
  );
}

export default async function Pagina() {
  const u = await usuarioAtual();
  const [atual, historico, bm, proc] = await Promise.all([
    precoAtual(u), historicoUf(u), benchmark(u), proveniencia(u),
  ]);
  const acima = bm !== null && bm.diferencaPercentual > 0;

  return (
    <>
      <div className="cabeca">
        <h1>Preço da sua região</h1>
        <p>Levantamento semanal da ANP, preço médio de revenda do diesel S-10.</p>
      </div>

      <Card size="small" styles={{ body: { padding: 0 } }} style={{ marginBottom: 14 }}>
        {/* Um número dominante, não quatro cartões de peso igual. */}
        <div className="heroi" style={{ padding: '20px 16px 18px', borderBottom: '1px solid var(--hairline)' }}>
          <div>
            <div className="rot">Preço médio {u.ufBase}</div>
            <div className="valor">
              {nf(atual?.uf)}
              <i> R$/L</i>
            </div>
            <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ChipDelta valor={atual?.variacaoSemanal ?? null} />
              <span className="rot">vs semana anterior</span>
            </div>
          </div>
          <div className="secundarios">
            <div>
              <div className="rot">{u.municipioBase}</div>
              <div className="v">{nf(atual?.municipio)}</div>
            </div>
            <div>
              <div className="rot">Piso da UF</div>
              <div className="v">{nf(atual?.minRegiao)}</div>
            </div>
            <div>
              <div className="rot">Teto da UF</div>
              <div className="v">{nf(atual?.maxRegiao)}</div>
            </div>
            <div>
              <div className="rot">Postos pesquisados</div>
              <div className="v">{atual?.numPostos ?? '—'}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 16px 16px' }}>
          <GraficoSerie historico={historico} />
          <div className="linha-fonte">
            <SeloSerie p={proc} />
            <span>preço médio de revenda, diesel S-10</span>
          </div>
        </div>
      </Card>

      <Card
        size="small"
        title="Benchmark"
        extra={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className="rot">preço pago vs média da região</span>
            <SeloCliente p={proc} />
          </span>
        }
      >
        {bm === null ? (
          <SemCliente oQue="O benchmark" />
        ) : (
          <>
            <Alert
              type={acima ? 'error' : 'success'}
              showIcon
              style={{ marginBottom: 14 }}
              message={
                <>
                  Você pagou <strong>{Math.abs(bm.diferencaPercentual).toFixed(1)}%{' '}
                  {acima ? 'acima' : 'abaixo'}</strong> da média da sua região.
                </>
              }
              description={
                `${acima ? 'Excedente' : 'Economia'} de R$ ${money(Math.abs(bm.excedente))} ` +
                `sobre ${inteiro(bm.litros)} litros.`
              }
            />
            <table className="tabela-simples">
              <tbody>
                <tr>
                  <td>Preço médio pago</td>
                  <td>{nf(bm.precoMedioPago)}</td>
                </tr>
                <tr>
                  <td>Média da região, ponderada pelos seus litros</td>
                  <td>{nf(bm.precoMedioRegiao)}</td>
                </tr>
                <tr>
                  <td>Abastecimentos considerados</td>
                  <td>{bm.compras}</td>
                </tr>
                <tr>
                  <td>Volume total (L)</td>
                  <td>{inteiro(bm.litros)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </Card>
    </>
  );
}
