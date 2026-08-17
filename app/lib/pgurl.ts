/**
 * Onde vive o banco da DEMO.
 *
 * Uma variável só para configurar: `DATABASE_URL` aponta para o SERVIDOR
 * Postgres (qualquer banco). O nome do banco é forçado para `tcc_demo`, porque
 * é ele que o seed cria e derruba — apontar a demo para outro banco por
 * acidente é exatamente o tipo de erro que a trava do seed existe para impedir.
 *
 * `DEMO_DATABASE_URL` tem precedência, para quem quiser mandar na mão.
 */
export const BANCO_DEMO = 'tcc_demo';

export function urlDemo(): string {
  const explicita = process.env.DEMO_DATABASE_URL;
  if (explicita !== undefined && explicita.trim() !== '') return explicita;

  const base = process.env.DATABASE_URL;
  if (base !== undefined && base.trim() !== '') {
    try {
      const u = new URL(base);
      u.pathname = `/${BANCO_DEMO}`;
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
  return `postgres://${cred}@${host}:${porta}/${BANCO_DEMO}`;
}

/** Versão sem senha, para imprimir em log sem vazar credencial. */
export function urlDemoSegura(): string {
  return urlDemo().replace(/:\/\/([^:@/]+):[^@]*@/, '://$1:***@');
}
