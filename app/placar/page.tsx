import { Card, Alert } from 'antd';

import { Nav } from '../components/Nav.tsx';
import { usuarioAtual } from '../lib/demo.ts';
import { placar } from '../lib/consultas.ts';

export const dynamic = 'force-dynamic';

export default async function Pagina() {
  const u = await usuarioAtual();
  const linhas = await placar(u, 12);

  const modelo = linhas.find((l) => l.modelo !== 'naive-v1');
  const naive = linhas.find((l) => l.modelo === 'naive-v1');
  const modeloPerde = modelo !== undefined && naive !== undefined && modelo.mae >= naive.mae;

  return (
    <>
      <Nav />

      <Alert
        type="error"
        showIcon
        style={{ marginBottom: 16 }}
        message="ESTES NÚMEROS SÃO FICTÍCIOS"
        description={
          <>
            Não saíram de backtest nenhum. São o resultado de um seed de demonstração, com
            preços inventados e previsões inventadas. <strong>Não cite nenhum destes valores
            como acurácia do produto.</strong> O placar real só existe depois que a Tarefa 4
            rodar o walk-forward contra a série da ANP.
          </>
        }
      />

      <Card
        size="small"
        title={
          <span>
            Placar das últimas 12 semanas — {u.ufBase} <span className="selo-ficticio">FICTÍCIO</span>
          </span>
        }
        className="marca-dagua"
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
          O produto mostra o modelo escolhido <em>lado a lado com o naive</em>. Se o modelo
          não estiver batendo o naive, é isso que aparece na tela — a regra do projeto é
          reportar, não esconder.
        </p>

        <table className="tabela-simples" style={{ position: 'relative', zIndex: 2 }}>
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Previsões avaliadas</th>
              <th>MAE (R$/L)</th>
              <th>RMSE (R$/L)</th>
              <th>Cobertura P10–P90</th>
              <th>Acerto direcional</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.modelo}>
                <td>
                  <strong>{l.modelo === 'naive-v1' ? 'naive (referência)' : l.modelo}</strong>
                </td>
                <td>{l.n}</td>
                <td>{l.mae.toFixed(4)}</td>
                <td>{l.rmse.toFixed(4)}</td>
                <td>{l.picp.toFixed(1)}%</td>
                <td>{l.direcional.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        {modelo !== undefined && naive !== undefined && (
          <Alert
            style={{ marginTop: 16 }}
            type={modeloPerde ? 'warning' : 'success'}
            showIcon
            message={
              modeloPerde
                ? `Nesta janela, o modelo NÃO está batendo o naive em ${u.ufBase}.`
                : `Nesta janela, o modelo está à frente do naive em ${u.ufBase}.`
            }
            description={
              modeloPerde
                ? 'É exatamente este aviso que a especificação exige que apareça no produto, em vez de esconder o resultado ruim.'
                : `MAE ${modelo.mae.toFixed(4)} contra ${naive.mae.toFixed(4)} do naive — diferença de ${(((naive.mae - modelo.mae) / naive.mae) * 100).toFixed(1)}%.`
            }
          />
        )}
      </Card>
    </>
  );
}
