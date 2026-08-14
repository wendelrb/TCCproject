'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

/** Troca a identidade da demo. O id vai para `auth.uid()` e a RLS real filtra. */
export async function trocarUsuario(formData: FormData): Promise<void> {
  const id = String(formData.get('usuario') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const jar = await cookies();
  jar.set('demo_user', id, { httpOnly: true, sameSite: 'lax', path: '/' });
  revalidatePath('/', 'layout');
}
