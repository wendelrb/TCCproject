import type { ReactNode } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';

import './globals.css';
import { usuarioAtual, USUARIOS } from './lib/demo.ts';
import { TrocaUsuario } from './components/TrocaUsuario.tsx';

export const metadata = {
  title: 'Diesel S-10 — DEMO com dados fictícios',
  description: 'Demonstração navegável. Nenhum dado desta tela é real.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const usuario = await usuarioAtual();

  return (
    <html lang="pt-BR">
      <body>
        <AntdRegistry>
          {/* Exigência da emenda no CLAUDE.md: marcação visível em TODA tela. */}
          <div className="faixa-demo">
            ⚠️ DEMONSTRAÇÃO — TODOS OS NÚMEROS SÃO FICTÍCIOS. NÃO SÃO DADOS DA ANP E NÃO
            SÃO RESULTADO DE BACKTEST.
          </div>
          <div className="conteudo">
            <header
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
                marginBottom: 18,
              }}
            >
              <div>
                <h1 style={{ fontSize: 19, margin: 0 }}>Inteligência de preço · Diesel S-10</h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {usuario.organizacao} · região base {usuario.ufBase}
                </p>
              </div>
              <TrocaUsuario atual={usuario.id} usuarios={[...USUARIOS]} />
            </header>
            {children}
            <p className="rodape-nota">
              Esta demo roda contra as migrations reais do projeto, com a RLS de produção
              ativa: as consultas executam sob <code>role authenticated</code> com
              <code> request.jwt.claims</code> preenchido, e a separação entre as duas
              organizações é a mesma que o teste automatizado verifica. O que é fictício é o
              dado, não o mecanismo. Trocar de organização acima muda o
              <code> auth.uid()</code> e você vê a RLS filtrando de verdade.
            </p>
          </div>
        </AntdRegistry>
      </body>
    </html>
  );
}
