'use client';

import { useActionState, useState } from 'react';
import { Card, Button, Alert, Space } from 'antd';

import { validarArquivo } from './acoes.ts';
import { ESTADO_INICIAL, type EstadoImportacao } from './tipos.ts';
import { CONFORME, COM_DADO_PESSOAL } from './exemplos.ts';

export function Formulario({
  inicial = ESTADO_INICIAL,
  textoInicial = CONFORME,
}: {
  inicial?: EstadoImportacao;
  textoInicial?: string;
}) {
  const [estado, acao, pendente] = useActionState(validarArquivo, inicial);
  const [texto, setTexto] = useState(textoInicial);

  return (
    <>
      <Card size="small" title="Conteúdo do CSV" style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 10 }} wrap>
          <Button size="small" onClick={() => setTexto(CONFORME)}>
            Carregar exemplo conforme
          </Button>
          <Button size="small" danger onClick={() => setTexto(COM_DADO_PESSOAL)}>
            Carregar exemplo com placa, motorista e CPF
          </Button>
        </Space>

        <form action={acao}>
          <textarea
            name="conteudo"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={7}
            spellCheck={false}
            style={{
              width: '100%',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              padding: 10,
              border: '1px solid var(--grid)',
              borderRadius: 6,
              background: 'var(--surface-1)',
            }}
          />
          <div style={{ marginTop: 10 }}>
            <Button htmlType="submit" type="primary" loading={pendente}>
              Validar importação
            </Button>
          </div>
        </form>
      </Card>

      {estado.estado !== 'inicial' && (
        <Card size="small" title="Resultado da validação">
          <Alert
            type={estado.estado === 'aceito' ? 'success' : 'error'}
            showIcon
            message={estado.estado === 'aceito' ? 'Arquivo aceito' : 'Arquivo recusado'}
            description={estado.mensagem}
          />

          {estado.colunasRejeitadas.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Colunas recusadas</strong> — guardamos só o nome, para a mensagem e
                auditoria. Nenhum valor dessas colunas foi lido:
              </p>
              <ul style={{ margin: 0, fontSize: 13 }}>
                {estado.colunasRejeitadas.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {estado.errosLinha.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Linhas com problema</strong> ({estado.errosLinha.length}):
              </p>
              <ul style={{ margin: 0, fontSize: 13 }}>
                {estado.errosLinha.slice(0, 6).map((e) => (
                  <li key={e.linha}>
                    linha {e.linha}: {e.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {estado.amostra.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>{estado.linhasAceitas}</strong> de {estado.linhasRecebidas} linhas
                aceitas. Amostra do que seria gravado:
              </p>
              <table className="tabela-simples">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>UF</th>
                    <th>Município</th>
                    <th>Litros</th>
                    <th>Valor total</th>
                    <th>R$/L</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.amostra.map((l, i) => (
                    <tr key={`${l.data}-${i}`}>
                      <td style={{ textAlign: 'left' }}>{l.data.split('-').reverse().join('/')}</td>
                      <td>{l.uf}</td>
                      <td style={{ textAlign: 'left' }}>{l.municipio}</td>
                      <td>{l.litros.toLocaleString('pt-BR')}</td>
                      <td>{l.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td>{(l.valorTotal / l.litros).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
