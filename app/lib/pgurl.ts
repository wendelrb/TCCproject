/**
 * Onde vive o banco.
 *
 * Duas funções de propósito diferente, e a diferença importa:
 *
 * - `urlDemo()` **força** `tcc_demo`. É a que o seed usa. A emenda de 2026-08-14
 *   no CLAUDE.md exige que dado fictício viva em banco separado, então o seed
 *   não pode apontar para outro lugar nem por acidente.
 *
 * - `urlBanco()` respeita `TCC_BANCO`. É a que o APP usa, porque o app precisa
 *   conseguir ler tanto a demo fictícia quanto a série real da ANP — em bancos
 *   distintos, nunca no mesmo.
 *
 * A configuração continua sendo de UMA variável para quem só quer a demo:
 * `DATABASE_URL` aponta para o servidor, e o padrão é `tcc_demo`.
 */
export const BANCO_DEMO = 'tcc_demo';

/** Nome do banco que o app deve abrir. Padrão seguro: a demo fictícia. */
export function nomeDoBanco(): string {
  const escolhido = process.env.TCC_BANCO?.trim();
  return escolhido === undefined || escolhido === '' ? BANCO_DEMO : escolhido;
}

function montarUrl(banco: string): string {
  const base = process.env.DATABASE_URL;
  if (base !== undefined && base.trim() !== '') {
    try {
      const u = new URL(base);
      u.pathname = `/${banco}`;
      return u.toString();
    } catch {
      throw new Error(`DATABASE_URL inválida: ${base}`);
    }
  }

  const host = process.env.PGHOST ?? '127.0.0.1';
  const porta = process.env.PGPORT ?? '55432';
  const usuario = process.env.PGUSER ?? 'postgres';
  const senha = process.env.PGPASSWORD;
  const cred = senha === undefined || senha === '' ? usuario : `${usuario}:${encodeURIComponent(senha)}`;
  return `postgres://${cred}@${host}:${porta}/${banco}`;
}

/** Banco do APP: `TCC_BANCO` ou a demo. */
export function urlBanco(): string {
  return montarUrl(nomeDoBanco());
}

/**
 * Banco da DEMO, sempre `tcc_demo`.
 *
 * `DEMO_DATABASE_URL` tem precedência para quem quiser mandar na mão — mas a
 * trava do seed (`PERMITIR_SEED_DEMO` + recusa de host Supabase) continua valendo.
 */
export function urlDemo(): string {
  const explicita = process.env.DEMO_DATABASE_URL;
  if (explicita !== undefined && explicita.trim() !== '') return explicita;
  return montarUrl(BANCO_DEMO);
}

/** Versão sem senha, para imprimir em log sem vazar credencial. */
function mascarar(url: string): string {
  return url.replace(/:\/\/([^:@/]+):[^@]*@/, '://$1:***@');
}

export function urlDemoSegura(): string {
  return mascarar(urlDemo());
}

export function urlBancoSegura(): string {
  return mascarar(urlBanco());
}
