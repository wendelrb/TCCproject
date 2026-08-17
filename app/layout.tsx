import type { ReactNode } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, theme } from 'antd';
import ptBR from 'antd/locale/pt_BR';

import './globals.css';
import { componentesAntd, tokensAntd } from './tema.ts';
import { usuarioAtual, USUARIOS } from './lib/demo.ts';
import { TrocaUsuario } from './components/TrocaUsuario.tsx';
import { Nav } from './components/Nav.tsx';
import { precoAtual } from './lib/consultas.ts';

export const metadata = {
  title: 'Mesa Diesel S-10',
  description: 'Demonstração com dados fictícios. Nenhum número desta tela é real.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const usuario = await usuarioAtual();
  const atual = await precoAtual(usuario).catch(() => null);
  const semana = atual?.semana ?? '—';

  return (
    <html lang="pt-BR">
      <body>
        <AntdRegistry>
          {/*
            O algoritmo escuro do antd mais a substituição de tokens fazem os
            componentes da biblioteca falarem a mesma língua dos nossos. É o
            caminho dentro da stack fixa — não troca de biblioteca, e não
            precisa de Vue: framework não é o que define o visual.
          */}
          <ConfigProvider
            locale={ptBR}
            theme={{
              algorithm: theme.darkAlgorithm,
              token: tokensAntd,
              components: componentesAntd,
            }}
          >
            <div className="barra">
              <div className="marca">
                Mesa <b>Diesel S-10</b> <em>ANP · semanal</em>
              </div>
              <div className="dir">
                {/* Exigência da emenda no CLAUDE.md: marcação visível em toda tela. */}
                <span className="selo-demo">DADOS FICTÍCIOS</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  semana{' '}
                  <b style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)', fontWeight: 600 }}>
                    {semana.split('-').reverse().join('/')}
                  </b>
                </span>
                <TrocaUsuario atual={usuario.id} usuarios={[...USUARIOS]} />
              </div>
            </div>

            <div className="layout">
              <nav className="rail" aria-label="Navegação">
                <Nav />
              </nav>
              <main className="conteudo">
                {children}
                <p className="rodape-nota">
                  Demonstração com dados inteiramente fictícios — nenhum número aqui pode ser citado
                  como métrica do produto. As consultas rodam sob <code>role authenticated</code> com{' '}
                  <code>request.jwt.claims</code> preenchido, contra as migrations de produção: a RLS que
                  separa as organizações é a real. Trocar de organização acima muda o{' '}
                  <code>auth.uid()</code> e o filtro acontece dentro do Postgres. Paleta de série
                  validada para separação em daltonismo; alta e queda carregam seta e sinal, nunca só cor.
                </p>
              </main>
            </div>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
