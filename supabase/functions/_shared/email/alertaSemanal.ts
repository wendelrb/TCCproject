// Template do alerta semanal (Tarefa 6).
//
// HTML de e-mail é um universo próprio: tabela em vez de flex, estilo inline em
// vez de classe, largura fixa. O que está aqui é o subconjunto que sobrevive em
// Gmail, Outlook e Apple Mail.
//
// O link de descadastro NÃO é decorativo — é obrigação legal e a função exige
// que ele venha preenchido.

export interface DadosAlerta {
  readonly organizacao: string;
  readonly uf: string;
  readonly semana: string;
  readonly precoAtual: number;
  readonly variacaoSemanal: number | null;
  readonly previsoes: readonly {
    readonly horizonte: number;
    readonly valor: number;
    readonly p10: number;
    readonly p90: number;
    readonly classe: 'ALTA' | 'ESTAVEL' | 'QUEDA';
  }[];
  readonly benchmarkPercentual: number | null;
  readonly modeloBateNaive: boolean | null;
  readonly linkDescadastro: string;
  /** Marca a peça como demonstração. Fora da demo, vem `false`. */
  readonly ficticio: boolean;
}

const TEXTO_CLASSE = { ALTA: 'Alta', ESTAVEL: 'Estável', QUEDA: 'Queda' } as const;
const COR_CLASSE = { ALTA: '#c1440e', ESTAVEL: '#52514e', QUEDA: '#1c5cab' } as const;

function brl(v: number, casas = 3): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function dataBr(iso: string): string {
  return iso.split('-').reverse().join('/');
}

export function assuntoAlerta(d: DadosAlerta): string {
  const seta = d.variacaoSemanal === null ? '' : d.variacaoSemanal > 0 ? '↑' : d.variacaoSemanal < 0 ? '↓' : '→';
  const prefixo = d.ficticio ? '[DEMO FICTÍCIA] ' : '';
  return `${prefixo}Diesel S-10 ${d.uf}: R$ ${brl(d.precoAtual)} ${seta} — semana de ${dataBr(d.semana)}`;
}

export function corpoAlerta(d: DadosAlerta): string {
  if (d.linkDescadastro.trim() === '') {
    throw new Error('alerta sem link de descadastro: envio bloqueado');
  }

  const variacao =
    d.variacaoSemanal === null
      ? '<span style="color:#77756f">sem semana anterior para comparar</span>'
      : `<strong style="color:${d.variacaoSemanal > 0 ? '#c1440e' : '#1c5cab'}">${
          d.variacaoSemanal > 0 ? '+' : ''
        }R$ ${brl(d.variacaoSemanal)}</strong> sobre a semana anterior`;

  const linhasPrevisao = d.previsoes
    .map(
      (p) => `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid #e3e1dc">${p.horizonte} sem.</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e3e1dc;text-align:right"><strong>R$ ${brl(p.valor)}</strong></td>
        <td style="padding:7px 10px;border-bottom:1px solid #e3e1dc;text-align:right;color:#52514e">R$ ${brl(p.p10)} – ${brl(p.p90)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e3e1dc;color:${COR_CLASSE[p.classe]}"><strong>${TEXTO_CLASSE[p.classe]}</strong></td>
      </tr>`,
    )
    .join('');

  const benchmark =
    d.benchmarkPercentual === null
      ? ''
      : `<p style="margin:0 0 14px">No período importado, você pagou
         <strong style="color:${d.benchmarkPercentual > 0 ? '#c1440e' : '#1c7a4a'}">
         ${Math.abs(d.benchmarkPercentual).toFixed(1)}% ${d.benchmarkPercentual > 0 ? 'acima' : 'abaixo'}</strong>
         da média da sua região.</p>`;

  // A honestidade do placar vale também no e-mail. Se o modelo não está batendo
  // o naive, quem recebe precisa saber antes de decidir comprar.
  const aviso =
    d.modeloBateNaive === false
      ? `<p style="margin:0 0 14px;padding:10px 12px;background:#fff8e6;border-left:3px solid #eda100;font-size:13px">
           <strong>Atenção:</strong> nas últimas 12 semanas o nosso modelo não superou a
           referência ingênua nesta UF. Trate a previsão acima com cautela.
         </p>`
      : '';

  const faixaDemo = d.ficticio
    ? `<div style="background:#b3261e;color:#fff;padding:10px;text-align:center;font-size:12px;font-weight:bold">
         DEMONSTRAÇÃO — TODOS OS NÚMEROS SÃO FICTÍCIOS
       </div>`
    : '';

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f3f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
${faixaDemo}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f0;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fcfcfb;border:1px solid #e3e1dc;border-radius:8px">
  <tr><td style="padding:22px 24px 8px">
    <p style="margin:0 0 4px;font-size:12px;color:#77756f;text-transform:uppercase;letter-spacing:.05em">Semana de ${dataBr(d.semana)}</p>
    <h1 style="margin:0 0 2px;font-size:19px;color:#0b0b0b">Diesel S-10 — ${d.uf}</h1>
    <p style="margin:0;font-size:13px;color:#52514e">${d.organizacao}</p>
  </td></tr>

  <tr><td style="padding:14px 24px 0">
    <p style="margin:0;font-size:32px;font-weight:700;color:#0b0b0b">R$ ${brl(d.precoAtual)}<span style="font-size:15px;font-weight:400;color:#52514e">/L</span></p>
    <p style="margin:4px 0 18px;font-size:13px;color:#52514e">${variacao}</p>
    ${benchmark}
    ${aviso}
  </td></tr>

  <tr><td style="padding:0 24px 6px">
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0b0b0b">Previsão para as próximas semanas</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
      <tr style="color:#52514e;font-size:11px;text-transform:uppercase;letter-spacing:.04em">
        <td style="padding:0 10px 6px">Horizonte</td>
        <td style="padding:0 10px 6px;text-align:right">Previsto</td>
        <td style="padding:0 10px 6px;text-align:right">P10–P90</td>
        <td style="padding:0 10px 6px">Tendência</td>
      </tr>
      ${linhasPrevisao}
    </table>
  </td></tr>

  <tr><td style="padding:20px 24px 24px">
    <p style="margin:0;font-size:11px;color:#77756f;line-height:1.6">
      Preços de revenda do levantamento semanal da ANP. Previsão com intervalo P10–P90
      calculado a partir dos resíduos históricos da própria UF.<br>
      <a href="${d.linkDescadastro}" style="color:#2a78d6">Cancelar o envio deste alerta</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
