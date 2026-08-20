/**
 * Nota de rodapé — escrita a partir da procedência, não fixa no código.
 *
 * A versão antiga afirmava "dados inteiramente fictícios" em toda página. Com a
 * série real da ANP carregada isso passou a ser falso, e afirmação falsa sobre
 * procedência é o pior tipo de erro que este produto pode cometer: ele vende
 * justamente honestidade sobre de onde vem o número.
 */

import type { Proveniencia } from '../lib/proveniencia.ts';
import { dataBr } from '../lib/proveniencia.ts';

function Serie({ p }: { p: Proveniencia }) {
  switch (p.serie) {
    case 'ANP':
      return (
        <>
          A série de preços é <strong>real</strong>: levantamento semanal da ANP, diesel S-10,{' '}
          <strong>{p.semanas.toLocaleString('pt-BR')} semanas</strong> de{' '}
          {dataBr(p.primeiraSemana)} a {dataBr(p.ultimaSemana)}
          {p.municipios > 0 ? `, ${p.municipios.toLocaleString('pt-BR')} municípios` : ''}, coletada
          em {dataBr(p.coletadaEm)}. Proveniência com URL, licença e hash SHA-256 em{' '}
          <code>DATA_PROVENANCE.md</code>. A previsão e o placar de acurácia são calculados sobre
          essa série.
        </>
      );
    case 'FICTICIA':
      return (
        <>
          A série de preços é <strong>fictícia</strong>, gerada por{' '}
          <code>scripts/seed-demo.ts</code> — <strong>nenhum número desta tela pode ser citado como
          métrica do produto</strong>. As previsões não são semeadas: saem do motor de verdade
          rodando sobre a série inventada, o que torna a acurácia exibida igualmente fictícia.
        </>
      );
    case 'MISTA':
      return (
        <>
          Este banco contém <strong>dado da ANP e dado fictício ao mesmo tempo</strong>. Nenhum
          número daqui pode ser usado para nada até a separação ser restabelecida.
        </>
      );
    case 'AUSENTE':
      return (
        <>
          Não há série de preços carregada neste banco. Rode <code>npm run demo</code> para a versão
          fictícia, ou a ingestão da ANP descrita em <code>docs/INGESTAO_ANP.md</code>.
        </>
      );
  }
}

function Cliente({ p }: { p: Proveniencia }) {
  return p.cliente === 'FICTICIO' ? (
    <>
      {' '}A empresa cliente e os abastecimentos dela são <strong>fictícios</strong> — o produto
      ainda não tem primeiro cliente, e tudo que deriva deles (benchmark, relatório mensal, alerta)
      carrega essa marca.
    </>
  ) : (
    <>
      {' '}Não há organização neste banco, então as telas que dependem de dados de cliente aparecem
      vazias em vez de mostrar número inventado.
    </>
  );
}

export function Rodape({ p }: { p: Proveniencia }) {
  return (
    <p className="rodape-nota">
      <Serie p={p} />
      <Cliente p={p} />{' '}
      As consultas rodam sob <code>role authenticated</code> com <code>request.jwt.claims</code>{' '}
      preenchido, contra as migrations de produção: a RLS que separa as organizações é a real.
      Trocar de organização acima muda o <code>auth.uid()</code> e o filtro acontece dentro do
      Postgres. Paleta de série validada para separação em daltonismo; alta e queda carregam seta e
      sinal, nunca só cor. Banco: <code>{p.banco}</code>.
    </p>
  );
}
