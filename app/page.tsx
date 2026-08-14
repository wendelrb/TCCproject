import { Card, Statistic, Alert } from 'antd';

import { Nav } from './components/Nav.tsx';
import { GraficoSerie } from './components/GraficoSerie.tsx';
import { usuarioAtual } from './lib/demo.ts';
import { benchmark, historicoUf, precoAtual } from './lib/consultas.ts';

export const dynamic = 'force-dynamic';

function brl(v: number, casas = 3): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export default async function Pagina() {
  const u = await usuarioAtual();
  const [atual, historico, bm] = await Promise.all([precoAtual(u), historicoUf(u), benchmark(u)]);

  const acima = bm !== null && bm.diferencaPercentual > 0;

  return (
    <>
      <Nav />

      <div className="grade">
        <Card size="small">
          <Statistic
            title={`Preço médio ${u.ufBase} — semana de ${atual?.semana ?? '—'}`}
            value={atual?.uf === null || atual === null ? '—' : `R$ ${brl(atual.uf)}`}
            valueStyle={{ fontSize: 26 }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            {atual?.numPostos ?? '—'} postos pesquisados
          </p>
        </Card>

        <Card size="small">
          <Statistic
            title="Variação sobre a semana anterior"
            value={
              atual?.variacaoSemanal === null || atual === null
                ? '—'
                : `${atual.variacaoSemanal > 0 ? '+' : ''}${brl(atual.variacaoSemanal)}`
            }
            valueStyle={{
              fontSize: 26,
              color:
                (atual?.variacaoSemanal ?? 0) > 0
                  ? 'var(--series-2)'
                  : (atual?.variacaoSemanal ?? 0) < 0
                    ? 'var(--series-1)'
                    : 'var(--text-secondary)',
            }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>R$/L</p>
        </Card>

        <Card size="small">
          <Statistic
            title={`Seu município (${u.municipioBase})`}
            value={atual?.municipio == null ? '—' : `R$ ${brl(atual.municipio)}`}
            valueStyle={{ fontSize: 26 }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            faixa da UF: {atual?.minRegiao == null ? '—' : brl(atual.minRegiao)} a{' '}
            {atual?.maxRegiao == null ? '—' : brl(atual.maxRegiao)}
          </p>
        </Card>
      </div>

      <Card title={`Histórico semanal — ${u.ufBase}`} size="small" style={{ marginBottom: 16 }}>
        <GraficoSerie historico={historico} />
      </Card>

      <Card title="Benchmark — o que você pagou versus a média da sua região" size="small">
        {bm === null ? (
          <p>Nenhum abastecimento importado ainda.</p>
        ) : (
          <>
            <Alert
              type={acima ? 'warning' : 'success'}
              showIcon
              message={
                acima
                  ? `Você pagou ${bm.diferencaPercentual.toFixed(1)}% acima da média da sua região`
                  : `Você pagou ${Math.abs(bm.diferencaPercentual).toFixed(1)}% abaixo da média da sua região`
              }
              description={
                acima
                  ? `No período importado, o excedente soma R$ ${bm.excedente.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sobre ${bm.litros.toLocaleString('pt-BR')} litros.`
                  : `A economia soma R$ ${Math.abs(bm.excedente).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sobre ${bm.litros.toLocaleString('pt-BR')} litros.`
              }
              style={{ marginBottom: 14 }}
            />
            <table className="tabela-simples">
              <tbody>
                <tr>
                  <td>Preço médio pago</td>
                  <td>R$ {brl(bm.precoMedioPago)}</td>
                </tr>
                <tr>
                  <td>Média da região no mesmo período, ponderada pelos seus litros</td>
                  <td>R$ {brl(bm.precoMedioRegiao)}</td>
                </tr>
                <tr>
                  <td>Abastecimentos considerados</td>
                  <td>{bm.compras}</td>
                </tr>
                <tr>
                  <td>Volume total</td>
                  <td>{bm.litros.toLocaleString('pt-BR')} L</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </Card>
    </>
  );
}
