import { usuarioAtual } from '../../lib/demo.ts';
import { relatorioMensal } from '../../lib/consultas.ts';

export const dynamic = 'force-dynamic';

/**
 * Exportação do relatório mensal.
 *
 * Separador `;` e vírgula decimal: é o que o Excel em pt-BR abre sem pedir
 * assistente de importação. BOM no início pelo mesmo motivo — sem ele, acento
 * vira caractere quebrado.
 */
export async function GET(): Promise<Response> {
  const u = await usuarioAtual();
  const meses = await relatorioMensal(u);

  const n = (v: number, casas: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

  const linhas = [
    '# RELATORIO DE DEMONSTRACAO - TODOS OS NUMEROS SAO FICTICIOS',
    `# organizacao: ${u.organizacao}`,
    'mes;abastecimentos;litros;valor total;preco pago (R$/L);media regiao (R$/L);diferenca %;excedente (R$)',
    ...meses.map((m) =>
      [
        m.mes,
        m.compras,
        n(m.litros, 3),
        n(m.valorTotal, 2),
        n(m.precoPago, 3),
        n(m.precoRegiao, 3),
        n(m.diferencaPercentual, 1),
        n(m.excedente, 2),
      ].join(';'),
    ),
  ];

  return new Response(`﻿${linhas.join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="relatorio-mensal-DEMO-FICTICIO.csv"',
    },
  });
}
