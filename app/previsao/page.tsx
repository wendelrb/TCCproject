import { Card, Tag, Alert } from 'antd';

import { GraficoSerie } from '../components/GraficoSerie.tsx';
import { usuarioAtual } from '../lib/demo.ts';
import { historicoUf, previsoes } from '../lib/consultas.ts';

export const dynamic = 'force-dynamic';

const CORES = { ALTA: 'volcano', QUEDA: 'blue', ESTAVEL: 'default' } as const;
const TEXTO = { ALTA: 'Alta', QUEDA: 'Queda', ESTAVEL: 'Estável' } as const;

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export default async function Pagina() {
  const u = await usuarioAtual();
  const [historico, prev] = await Promise.all([historicoUf(u, 26), previsoes(u)]);

  return (
    <>
      <div className="cabeca">
        <h1>Previsão de 1 a 4 semanas</h1>
        <p>A faixa é o intervalo P10–P90, dos quantis empíricos dos resíduos walk-forward daquela UF.</p>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Como ler esta tela"
        description={
          <>
            A linha tracejada é a previsão pontual; a faixa é o intervalo P10–P90, vindo dos
            quantis empíricos dos resíduos walk-forward por UF e por horizonte. A classe usa
            banda de estabilidade explícita — variação menor que R$ 0,02/L conta como
            estável. Intervalo largo é informação, não defeito: quer dizer que a série
            daquela UF é ruidosa.
          </>
        }
      />

      <Card title={`Previsão 1 a 4 semanas — ${u.ufBase}`} size="small" style={{ marginBottom: 16 }}>
        <GraficoSerie
          historico={historico}
          previsao={prev.map((p) => ({
            semana: p.semanaAlvo,
            valor: p.valor,
            p10: p.p10,
            p90: p.p90,
          }))}
        />
      </Card>

      <Card size="small" title="Detalhe por horizonte">
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Horizonte</th>
              <th>Semana-alvo</th>
              <th>Previsto (R$/L)</th>
              <th>P10</th>
              <th>P90</th>
              <th>Largura</th>
              <th style={{ textAlign: 'left' }}>Classe</th>
            </tr>
          </thead>
          <tbody>
            {prev.map((p) => (
              <tr key={p.horizonte}>
                <td>{p.horizonte} semana{p.horizonte > 1 ? 's' : ''}</td>
                <td>{p.semanaAlvo.split('-').reverse().join('/')}</td>
                <td>
                  <strong>{brl(p.valor)}</strong>
                </td>
                <td>{brl(p.p10)}</td>
                <td>{brl(p.p90)}</td>
                <td>±{brl((p.p90 - p.p10) / 2)}</td>
                <td style={{ textAlign: 'left' }}>
                  <Tag color={CORES[p.classe]}>{TEXTO[p.classe]}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {prev.length === 0 && <p>Nenhuma previsão registrada.</p>}
      </Card>
    </>
  );
}
