import { Alert } from 'antd';

import { Simulador } from './Simulador.tsx';
import { usuarioAtual } from '../lib/demo.ts';
import { historicoUf, precoAtual, residuosH1 } from '../lib/consultas.ts';

export const dynamic = 'force-dynamic';

export default async function Pagina() {
  const u = await usuarioAtual();
  const [historico, atual, residuos] = await Promise.all([
    historicoUf(u, 104),
    precoAtual(u),
    residuosH1(u),
  ]);

  return (
    <>
      <div className="cabeca">
        <h1>Compro agora ou espero?</h1>
        <p>Em reais, sobre o seu volume — não em R$/L abstrato.</p>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="O que este simulador responde"
        description={
          <>
            &ldquo;Compro agora ou espero?&rdquo; — em reais, sobre o <strong>seu</strong> volume, não em
            R$/L abstrato. Ele mostra as duas leituras: o que cada estratégia <em>teria custado</em> na
            série que já aconteceu, e a <em>distribuição</em> do custo nas próximas semanas. Nunca um
            número único sobre o futuro.
          </>
        }
      />

      <Simulador
        historico={historico}
        residuos={residuos}
        precoAtual={atual?.uf ?? 0}
        uf={u.ufBase}
      />

      <p className="rodape-nota">
        O custo de capital entra na conta de propósito: antecipar compra imobiliza dinheiro em tanque, e
        ignorar isso faz antecipar parecer sempre melhor do que é. O motor tem teste automatizado que
        exige o comportamento correto nos dois extremos — em série que só sobe, antecipar tem de ganhar;
        em série que só cai, tem de perder.
      </p>
    </>
  );
}
