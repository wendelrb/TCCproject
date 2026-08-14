'use server';

import { validarImportacao } from '../../supabase/functions/_shared/importacao/abastecimentos.ts';
import { ESTADO_INICIAL, type EstadoImportacao } from './tipos.ts';

export async function validarArquivo(
  _anterior: EstadoImportacao,
  formData: FormData,
): Promise<EstadoImportacao> {
  const arquivo = formData.get('arquivo');
  const colado = String(formData.get('conteudo') ?? '');
  const texto = arquivo instanceof File && arquivo.size > 0 ? await arquivo.text() : colado;

  if (texto.trim() === '') {
    return { ...ESTADO_INICIAL, estado: 'recusado', mensagem: 'Nada para validar.' };
  }

  try {
    const r = validarImportacao(texto);
    return {
      estado: r.aceito ? 'aceito' : 'recusado',
      mensagem: r.mensagem,
      // Só os NOMES das colunas recusadas cruzam esta fronteira. Nunca valores.
      colunasRejeitadas: r.colunasRejeitadas.map((c) => c.nome),
      linhasAceitas: r.linhas.length,
      linhasRecebidas: r.linhasRecebidas,
      errosLinha: r.errosLinha.map((e) => ({ linha: e.linha, motivo: e.motivo })),
      amostra: r.linhas.slice(0, 5).map((l) => ({
        data: l.data, uf: l.uf, municipio: l.municipio, litros: l.litros, valorTotal: l.valorTotal,
      })),
    };
  } catch (erro) {
    return { ...ESTADO_INICIAL, estado: 'recusado', mensagem: (erro as Error).message };
  }
}
