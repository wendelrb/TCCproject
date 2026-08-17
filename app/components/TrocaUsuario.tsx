'use client';

import { Select, Button, Space } from 'antd';
import { useState } from 'react';

import { trocarUsuario } from '../actions.ts';
import type { UsuarioDemo } from '../lib/demo.ts';

export function TrocaUsuario({
  atual,
  usuarios,
}: {
  atual: string;
  usuarios: UsuarioDemo[];
}) {
  const [valor, setValor] = useState(atual);

  return (
    <form action={trocarUsuario}>
      <Space.Compact>
        <Select
          value={valor}
          onChange={setValor}
          size="small" style={{ minWidth: 210 }}
          options={usuarios.map((u) => ({ value: u.id, label: `${u.organizacao} — ${u.rotulo}` }))}
        />
        <input type="hidden" name="usuario" value={valor} />
        <Button htmlType="submit" size="small">
          Trocar
        </Button>
      </Space.Compact>
    </form>
  );
}
