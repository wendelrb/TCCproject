import { Card, Alert, Statistic } from 'antd';

import { Nav } from '../components/Nav.tsx';
import { usuarioAtual } from '../lib/demo.ts';
import { relatorioMensal } from '../lib/consultas.ts';

export const dynamic = 'force-dynamic';

function brl(v: number, casas = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function mesExtenso(mes: string): string {
  const [ano, m] = mes.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(m) - 1] ?? m}/${ano}`;
}

export default async function Pagina() {
  const u = await usuarioAtual();
  const meses = await relatorioMensal(u);

  const totalLitros = meses.reduce((s, m) => s + m.litros, 0);
  const totalValor = meses.reduce((s, m) => s + m.valorTotal, 0);
  const totalExcedente = meses.reduce((s, m) => s + m.excedente, 0);
  const piorMes = [...meses].sort((a, b) => b.diferencaPercentual - a.diferencaPercentual)[0];
  const melhorMes = [...meses].sort((a, b) => a.diferencaPercentual - b.diferencaPercentual)[0];

  return (
    <>
      <Nav />

      <div className="grade">
        <Card size="small">
          <Statistic title="Volume no período" value={`${brl(totalLitros, 0)} L`} valueStyle={{ fontSize: 24 }} />
        </Card>
        <Card size="small">
          <Statistic title="Gasto total" value={`R$ ${brl(totalValor)}`} valueStyle={{ fontSize: 24 }} />
        </Card>
        <Card size="small">
          <Statistic
            title={totalExcedente >= 0 ? 'Excedente sobre a média da região' : 'Economia sobre a média da região'}
            value={`R$ ${brl(Math.abs(totalExcedente))}`}
            valueStyle={{ fontSize: 24, color: totalExcedente >= 0 ? 'var(--series-2)' : 'var(--series-1)' }}
          />
        </Card>
      </div>

      {piorMes !== undefined && melhorMes !== undefined && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Leitura do período"
          description={
            <>
              Seu pior mês foi <strong>{mesExtenso(piorMes.mes)}</strong>, pagando{' '}
              {piorMes.diferencaPercentual.toFixed(1)}% em relação à média da região; o melhor foi{' '}
              <strong>{mesExtenso(melhorMes.mes)}</strong>, com{' '}
              {melhorMes.diferencaPercentual.toFixed(1)}%. A diferença entre os dois, aplicada ao
              volume do período, vale{' '}
              <strong>
                R$ {brl(((piorMes.diferencaPercentual - melhorMes.diferencaPercentual) / 100) *
                  (totalValor / totalLitros) * totalLitros)}
              </strong>
              .
            </>
          }
        />
      )}

      <Card
        size="small"
        title="Relatório mensal — preço pago versus média da região"
        extra={
          <a href="/relatorio/csv" download>
            Exportar CSV
          </a>
        }
      >
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Mês</th>
              <th>Abastec.</th>
              <th>Litros</th>
              <th>Gasto (R$)</th>
              <th>Pago (R$/L)</th>
              <th>Região (R$/L)</th>
              <th>Diferença</th>
              <th>Excedente (R$)</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes}>
                <td style={{ textAlign: 'left' }}>{mesExtenso(m.mes)}</td>
                <td>{m.compras}</td>
                <td>{brl(m.litros, 0)}</td>
                <td>{brl(m.valorTotal)}</td>
                <td>{m.precoPago.toFixed(3)}</td>
                <td>{m.precoRegiao.toFixed(3)}</td>
                <td
                  style={{
                    color: m.diferencaPercentual > 0 ? 'var(--series-2)' : 'var(--series-1)',
                    fontWeight: 600,
                  }}
                >
                  {m.diferencaPercentual > 0 ? '+' : ''}
                  {m.diferencaPercentual.toFixed(1)}%
                </td>
                <td>{brl(m.excedente)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {meses.length === 0 && <p>Nenhum abastecimento importado ainda.</p>}
      </Card>

      <p className="rodape-nota">
        A comparação usa a média da região <strong>ponderada pelos seus litros</strong>, não a
        média simples das semanas. Sem isso, um mês em que o volume se concentra numa semana cara
        apareceria melhor do que foi.
      </p>
    </>
  );
}
