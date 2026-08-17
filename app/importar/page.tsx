import { Alert } from 'antd';

import { Formulario } from './Formulario.tsx';
import { CONFORME, COM_DADO_PESSOAL } from './exemplos.ts';
import { validarArquivo } from './acoes.ts';
import { ESTADO_INICIAL } from './tipos.ts';
import { COLUNAS_PERMITIDAS } from '../../supabase/functions/_shared/importacao/abastecimentos.ts';

export const dynamic = 'force-dynamic';

/**
 * `?validar=pessoal` e `?validar=conforme` deixam os dois desfechos endereçáveis
 * por URL — serve para revisar a regra sem depender de clicar.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { validar } = await searchParams;
  const amostra = validar === 'pessoal' ? COM_DADO_PESSOAL : CONFORME;

  let inicial = ESTADO_INICIAL;
  if (validar === 'pessoal' || validar === 'conforme') {
    const fd = new FormData();
    fd.set('conteudo', amostra);
    inicial = await validarArquivo(ESTADO_INICIAL, fd);
  }

  return (
    <>
      <div className="cabeca">
        <h1>Importar abastecimentos</h1>
        <p>Seis colunas, e só elas: data, UF, município, litros, valor total, produto.</p>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Esta importação aceita seis colunas, e só elas"
        description={
          <>
            <code>{COLUNAS_PERMITIDAS.join(' · ')}</code>
            <br />
            Placa, nome de motorista, CPF e qualquer outro dado pessoal são recusados — o
            arquivo inteiro é rejeitado com mensagem explicando o que remover. A recusa
            acontece na leitura do <strong>cabeçalho</strong>, antes de qualquer célula ser
            lida, então o valor de uma coluna proibida nunca chega a entrar em memória. O CSV
            original também não é persistido, justamente porque pode conter essas colunas.
            <br />
            <br />
            É decisão de escopo fechada do produto, não configuração.
          </>
        }
      />

      <Formulario inicial={inicial} textoInicial={amostra} />

      <p className="rodape-nota">
        Nesta demo a validação roda e mostra o que <em>seria</em> gravado, mas não grava —
        o objetivo aqui é ver a regra de privacidade agindo. A mesma função
        (<code>_shared/importacao/abastecimentos.ts</code>) é a que a Tarefa 5 usa para valer,
        e tem teste automatizado provando que o valor de uma coluna recusada não aparece em
        lugar nenhum do resultado.
      </p>
    </>
  );
}
