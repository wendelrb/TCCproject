import { Card, Alert, Tag } from 'antd';

import { usuarioAtual } from '../lib/demo.ts';
import { benchmark, placar, precoAtual, previsoes } from '../lib/consultas.ts';
import { proveniencia } from '../lib/proveniencia.ts';
import { SemCliente } from '../components/Selos.tsx';
import { assuntoAlerta, corpoAlerta } from '../../supabase/functions/_shared/email/alertaSemanal.ts';

export const dynamic = 'force-dynamic';

export default async function Pagina() {
  const u = await usuarioAtual();
  const [atual, prev, bm, linhasPlacar, proc] = await Promise.all([
    precoAtual(u), previsoes(u), benchmark(u), placar(u, 12), proveniencia(u),
  ]);

  const modelo = linhasPlacar.find((l) => l.modelo !== 'naive-v1');
  const naive = linhasPlacar.find((l) => l.modelo === 'naive-v1');
  const bate = modelo !== undefined && naive !== undefined ? modelo.mae < naive.mae : null;

  const dados = {
    organizacao: u.organizacao,
    uf: u.ufBase,
    semana: atual?.semana ?? '—',
    precoAtual: atual?.uf ?? 0,
    variacaoSemanal: atual?.variacaoSemanal ?? null,
    previsoes: prev.map((p) => ({
      horizonte: p.horizonte, valor: p.valor, p10: p.p10, p90: p.p90, classe: p.classe,
    })),
    benchmarkPercentual: bm?.diferencaPercentual ?? null,
    modeloBateNaive: bate,
    linkDescadastro: 'https://exemplo.invalid/descadastro?t=TOKEN_DEMO',
    // A peça se marca como fictícia quando QUALQUER metade dela é inventada.
    // Hoje isso é sempre verdade quando há destinatário, porque a organização
    // é de demonstração — o alerta só perde a tarja quando existir cliente real.
    ficticio: proc.serie !== 'ANP' || proc.cliente === 'FICTICIO',
  };

  const assunto = assuntoAlerta(dados);
  const html = corpoAlerta(dados);

  if (proc.cliente === 'AUSENTE') {
    return (
      <>
        <div className="cabeca">
          <h1>Alerta semanal</h1>
          <p>Disparado após a ingestão da ANP, uma vez por semana, por organização.</p>
        </div>
        <SemCliente oQue="O alerta semanal" />
      </>
    );
  }

  return (
    <>
      <div className="cabeca">
        <h1>Alerta semanal</h1>
        <p>Disparado após a ingestão da ANP, uma vez por semana, por organização.</p>
      </div>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="E-mail NÃO enviado — Resend não está conectado"
        description={
          <>
            Esta é a peça renderizada pelo mesmo template que a Tarefa 6 usa
            (<code>_shared/email/alertaSemanal.ts</code>). O disparo real depende de chave da
            Resend e de acesso de rede, que este ambiente não tem. O job semanal, o log de
            envio e o processamento do descadastro também ainda não existem — estão listados
            como pendências.
          </>
        }
      />

      <Card size="small" title="Cabeçalho do envio" style={{ marginBottom: 16 }}>
        <table className="tabela-simples">
          <tbody>
            <tr>
              <td style={{ width: 130 }}>Para</td>
              <td style={{ textAlign: 'left' }}>
                <code>{u.rotulo}</code>
              </td>
            </tr>
            <tr>
              <td>Assunto</td>
              <td style={{ textAlign: 'left' }}>
                <code>{assunto}</code>
              </td>
            </tr>
            <tr>
              <td>Frequência</td>
              <td style={{ textAlign: 'left' }}>
                Semanal, após a ingestão da ANP <Tag>Supabase Cron</Tag>
              </td>
            </tr>
            <tr>
              <td>Descadastro</td>
              <td style={{ textAlign: 'left' }}>
                link presente — o template <strong>recusa</strong> gerar corpo sem ele
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card size="small" title="Prévia da peça" styles={{ body: { padding: 0 } }}>
        <iframe
          title="Prévia do alerta semanal"
          srcDoc={html}
          style={{ width: '100%', height: 760, border: 0, display: 'block' }}
        />
      </Card>

      <p className="rodape-nota">
        Repare que o alerta carrega o mesmo aviso do placar: se o modelo não estiver batendo o
        naive naquela UF, o e-mail diz isso antes de o cliente decidir antecipar compra. Um
        alerta que só mostra a previsão e esconde o histórico de erro é o tipo de coisa que
        destrói confiança na primeira vez que erra feio.
      </p>
    </>
  );
}
