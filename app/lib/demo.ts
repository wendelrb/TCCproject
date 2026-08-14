import { cookies } from 'next/headers';

/**
 * "Autenticação" da demo.
 *
 * O Supabase Auth não roda neste ambiente (sem Docker), então a identidade vem
 * de um cookie. É a ÚNICA parte simulada do caminho de dados: a partir daqui, o
 * user id entra em `request.jwt.claims` e a RLS real assume.
 */

export interface UsuarioDemo {
  readonly id: string;
  readonly rotulo: string;
  readonly organizacao: string;
  readonly ufBase: string;
  readonly municipioBase: string;
}

export const USUARIOS: readonly UsuarioDemo[] = [
  {
    id: 'd0000000-0000-4000-8000-0000000000a1',
    rotulo: 'demo-a@exemplo.invalid',
    organizacao: 'TRANSPORTADORA DEMO A',
    ufBase: 'SP',
    municipioBase: 'CAMPINAS',
  },
  {
    id: 'd0000000-0000-4000-8000-0000000000b1',
    rotulo: 'demo-b@exemplo.invalid',
    organizacao: 'INDÚSTRIA DEMO B',
    ufBase: 'MG',
    municipioBase: 'UBERLANDIA',
  },
];

export async function usuarioAtual(): Promise<UsuarioDemo> {
  const jar = await cookies();
  const id = jar.get('demo_user')?.value;
  return USUARIOS.find((u) => u.id === id) ?? (USUARIOS[0] as UsuarioDemo);
}
