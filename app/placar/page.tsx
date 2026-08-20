import { Card, Alert } from 'antd';

import { usuarioAtual } from '../lib/demo.ts';
import { placar } from '../lib/consultas.ts';
import { dataBr, proveniencia } from '../lib/proveniencia.ts';
import { SeloSerie } from '../components/Selos.tsx';

export const dynamic = 'force-dynamic';

export default async function Pagina() {
  const u = await usuarioAtual();
  const [linhas, proc] = await Promise.all([placar(u, 12), proveniencia(u)]);
  const real = proc.serie === 'ANP';

  const modelo = linhas.find((l) => l.modelo !== 'naive-v1');
  const naive = linhas.find((l) => l.modelo === 'naive-v1');
  const modeloPerde = modelo !== undefined && naive !== undefined && modelo.mae >= naive.mae;

  return (
    <>
      <div className="cabeca">
        <h1>Placar de acurácia</h1>
        <p>O modelo escolhido aparece lado a lado com o naive. Se não estiver batendo o naive, é isso que a tela mostra.</p>
      </div>

      {/*
        O aviso é DERIVADO da procedência da série. Antes era fixo no código e
        dizia "estes números são fictícios" mesmo quando deixassem de ser — o que
        seria mentira na direção oposta, e igualmente inaceitável num produto
        cuja proposta é honestidade sobre acurácia.
      */}
      {real ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Backtest walk-forward sobre a série real da ANP"
          description={
            <>
              {proc.semanas.toLocaleString('pt-BR')} semanas de {dataBr(proc.primeiraSemana)} a{' '}
              {dataBr(proc.ultimaSemana)}, coletadas em {dataBr(proc.coletadaEm)}. O modelo é
              reescolhido a cada origem usando <strong>só</strong> erros cujo alvo já se realizou —
              sem olhar o futuro. Os números abaixo são resultado de execução real e podem ser
              citados, com a proveniência junto.
            </>
          }
        />
      ) : (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="ESTES NÚMEROS SÃO FICTÍCIOS"
          description={
            <>
              A série deste banco não é da ANP. As previsões saem do motor de verdade, mas sobre
              preços inventados — o que torna a acurácia igualmente inventada.{' '}
              <strong>Não cite nenhum destes valores como acurácia do produto.</strong>
            </>
          }
        />
      )}

      <Card
        size="small"
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Placar das últimas 12 semanas — {u.ufBase} <SeloSerie p={proc} curto />
          </span>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 0 }}>
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
