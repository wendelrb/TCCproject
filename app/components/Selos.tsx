/**
 * Selos de procedência.
 *
 * Cada bloco da tela diz de onde veio o número que ele mostra. Não é decoração:
 * é a condição 2 da emenda de 2026-08-14 ("toda tela carrega marcação visível
 * de dado fictício") aplicada com a granularidade que o dado real exige — agora
 * que a série da ANP é de verdade e só o cliente é inventado, uma tarja única
 * na página mentiria sobre metade do conteúdo.
 */

import type { Proveniencia } from '../lib/proveniencia.ts';
import { dataBr } from '../lib/proveniencia.ts';

/** Selo do bloco alimentado pela série pública (ANP ou seed). */
export function SeloSerie({ p, curto = false }: { p: Proveniencia; curto?: boolean }) {
  switch (p.serie) {
    case 'ANP':
      return (
        <span className="selo selo-real" title={`Coletado em ${dataBr(p.coletadaEm)} · banco ${p.banco}`}>
          ANP{curto ? '' : ` · REAL · coletado ${dataBr(p.coletadaEm)}`}
        </span>
      );
    case 'FICTICIA':
      return <span className="selo selo-ficticio">{curto ? 'FICTÍCIO' : 'SÉRIE FICTÍCIA'}</span>;
    case 'MISTA':
      return (
        <span className="selo selo-alarme" title="Dado da ANP e dado fictício no mesmo banco">
          MISTURA DE FONTES
        </span>
      );
    case 'AUSENTE':
      return <span className="selo selo-vazio">SEM SÉRIE</span>;
  }
}

/** Selo do bloco alimentado por dados do cliente (abastecimentos, organização). */
export function SeloCliente({ p }: { p: Proveniencia }) {
  return p.cliente === 'FICTICIO'
    ? <span className="selo selo-ficticio">CLIENTE FICTÍCIO</span>
    : <span className="selo selo-vazio">SEM CLIENTE</span>;
}

/**
 * Estado vazio honesto para as telas que dependem de um cliente.
 *
 * Aparece quando a série é real mas não há organização nenhuma — o que é a
 * verdade de um produto que ainda não tem primeiro cliente. Melhor dizer isso
 * do que quebrar, e muito melhor do que inventar uma empresa.
 */
export function SemCliente({ oQue }: { oQue: string }) {
  return (
    <div className="vazio-cliente">
      <p className="titulo">Esta tela precisa de dados de um cliente.</p>
      <p>
        {oQue} depende de abastecimentos importados por uma organização, e este banco não tem
        nenhuma. Não há cliente real, e inventar um aqui violaria a regra de dados do projeto —
        a exceção da emenda vale só para o banco <code>tcc_demo</code>.
      </p>
      <p className="dica">
        Para ver esta tela funcionando, rode a demo fictícia: <code>npm run demo</code>.
      </p>
    </div>
  );
}

/** Aviso de topo quando o banco mistura fontes — não deveria acontecer nunca. */
export function AlarmeMistura({ p }: { p: Proveniencia }) {
  if (p.serie !== 'MISTA') return null;
  return (
    <div className="alarme-mistura" role="alert">
      <strong>Banco <code>{p.banco}</code> contém dado da ANP e dado fictício ao mesmo tempo.</strong>{' '}
      A emenda de 2026-08-14 no <code>CLAUDE.md</code> exige que o fictício viva em banco separado.
      Nenhum número desta sessão pode ser citado até que a separação seja restabelecida.
    </div>
  );
}
