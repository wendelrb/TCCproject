'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Menu agrupado por intenção, não lista plana.
 *
 * O agrupamento comunica que o produto tem partes com propósitos diferentes —
 * é o que separa "painel de sistema" de "lista de links".
 */
const GRUPOS = [
  ['Mercado', [
    { href: '/', rotulo: 'Preço e benchmark' },
    { href: '/previsao', rotulo: 'Previsão 1–4 semanas' },
  ]],
  ['Decisão', [
    { href: '/simulador', rotulo: 'Simulador de compra' },
  ]],
  ['Confiança', [
    { href: '/placar', rotulo: 'Placar de acurácia' },
  ]],
  ['Dados', [
    { href: '/relatorio', rotulo: 'Relatório mensal' },
    { href: '/alerta', rotulo: 'Alerta semanal' },
    { href: '/importar', rotulo: 'Importar abastecimentos' },
  ]],
] as const;

export function Nav() {
  const atual = usePathname();
  return (
    <>
      {GRUPOS.map(([grupo, itens]) => (
        <div key={grupo} style={{ display: 'contents' }}>
          <div className="rot grupo">{grupo}</div>
          {itens.map((i) => (
            <Link key={i.href} href={i.href} className={atual === i.href ? 'ativo' : ''}>
              {i.rotulo}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}
