import type { ReactNode } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, theme } from 'antd';
import ptBR from 'antd/locale/pt_BR';

import './globals.css';
import { componentesAntd, tokensAntd } from './tema.ts';
import { usuarioAtual, USUARIOS } from './lib/demo.ts';
import { TrocaUsuario } from './components/TrocaUsuario.tsx';
import { Nav } from './components/Nav.tsx';
import { AlarmeMistura, SeloCliente, SeloSerie } from './components/Selos.tsx';
import { precoAtual } from './lib/consultas.ts';
import { proveniencia } from './lib/proveniencia.ts';
import { Rodape } from './components/Rodape.tsx';

export const metadata = {
  title: 'Mesa Diesel S-10',
  description: 'Preço, previsão e benchmark de diesel S-10 a partir do levantamento semanal da ANP.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const usuario = await usuarioAtual();
  const [atual, proc] = await Promise.all([
    precoAtual(usuario).catch(() => null),
    proveniencia(usuario),
  ]);
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
                {/*
                  Marcação visível em toda tela (emenda no CLAUDE.md), mas
                  derivada do dado: um selo para a série pública, outro para o
                  cliente. Com série real e cliente fictício, os dois aparecem —
                  que é exatamente o estado do produto hoje.
                */}
                <SeloSerie p={proc} curto />
                {proc.cliente === 'FICTICIO' ? <SeloCliente p={proc} /> : null}
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
                <AlarmeMistura p={proc} />
                {children}
                <Rodape p={proc} />
              </main>
            </div>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
