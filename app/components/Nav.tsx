'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS = [
  { href: '/', rotulo: 'Preço e benchmark' },
  { href: '/previsao', rotulo: 'Previsão 1–4 semanas' },
  { href: '/placar', rotulo: 'Placar de acurácia' },
  { href: '/relatorio', rotulo: 'Relatório mensal' },
  { href: '/alerta', rotulo: 'Alerta semanal' },
  { href: '/importar', rotulo: 'Importar abastecimentos' },
] as const;

export function Nav() {
  const atual = usePathname();
  return (
    <nav className="nav">
      {ITENS.map((i) => (
        <Link key={i.href} href={i.href} className={atual === i.href ? 'ativo' : ''}>
          {i.rotulo}
        </Link>
      ))}
    </nav>
  );
}
