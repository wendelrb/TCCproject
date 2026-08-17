// Fonte única dos tokens de design.
//
// O mesmo mapa alimenta o Ant Design (via ConfigProvider) e o CSS (via
// variáveis em globals.css). Sem isso, componente da biblioteca e componente
// nosso divergem, e é exatamente daí que vem a cara de "template com remendos".
//
// Direção: mesa de operações. Os NÚMEROS são âmbar monoespaçado — referência ao
// display da bomba de combustível; a estrutura ao redor é slate frio e quieta.
//
// A paleta de série foi validada com o validador de contraste/daltonismo
// (superfície #121a23): âmbar #c4842a + azul #4480de → ALL CHECKS PASS.
// Verde e vermelho de sinal FALHARAM a separação para deutan (ΔE 4,2), por isso
// alta e queda carregam SEMPRE seta e sinal, nunca só cor.

export const T = {
  ground: '#090e14',
  surface: '#121a23',
  surface2: '#18222d',
  elev: '#1e2a37',

  hairline: '#223040',
  hairlineForte: '#2d3f50',

  ink: '#e9f0f7',
  ink2: '#92a7b8',
  ink3: '#62788a',

  ambar: '#c4842a',
  ambarClaro: '#e0a34b',
  ambarVeu: '#2a2013',
  azul: '#4480de',
  azulVeu: '#131f33',

  sobe: '#d8524f',
  cai: '#3fa46b',
  sobeVeu: '#2a1616',
  caiVeu: '#12251b',

  demo: '#8c3a34',
  demoInk: '#ffd9d5',

  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
} as const;

/**
 * Tokens do Ant Design.
 *
 * O visual padrão do antd é claro e arredondado; substituindo os tokens de cor,
 * raio e tipografia, os componentes dele passam a falar a mesma língua dos
 * nossos. É o caminho dentro da stack fixa — não troca de biblioteca.
 */
export const tokensAntd = {
  colorPrimary: T.ambar,
  colorInfo: T.azul,
  colorSuccess: T.cai,
  colorError: T.sobe,
  colorWarning: T.ambar,

  // Sem estes explícitos, o Alert e a Tag renderizam com o fundo CLARO do
  // antd mesmo sob darkAlgorithm — texto ilegível. Pego ao renderizar a tela.
  colorInfoBg: T.azulVeu,
  colorInfoBorder: 'color-mix(in srgb, #4480de 40%, transparent)',
  colorSuccessBg: T.caiVeu,
  colorSuccessBorder: 'color-mix(in srgb, #3fa46b 40%, transparent)',
  colorErrorBg: T.sobeVeu,
  colorErrorBorder: 'color-mix(in srgb, #d8524f 40%, transparent)',
  colorWarningBg: T.ambarVeu,
  colorWarningBorder: 'color-mix(in srgb, #c4842a 40%, transparent)',

  colorBgBase: T.ground,
  colorBgContainer: T.surface,
  colorBgElevated: T.elev,
  colorBgLayout: T.ground,
  colorBorder: T.hairlineForte,
  colorBorderSecondary: T.hairline,

  colorText: T.ink,
  colorTextSecondary: T.ink2,
  colorTextTertiary: T.ink3,
  colorTextQuaternary: T.ink3,

  fontFamily: T.sans,
  fontFamilyCode: T.mono,
  fontSize: 14,

  borderRadius: 8,
  borderRadiusLG: 9,
  borderRadiusSM: 6,

  controlHeight: 34,
  wireframe: false,
} as const;

/** Ajustes por componente onde o token global não alcança. */
export const componentesAntd = {
  Card: { headerFontSize: 13.5, headerHeight: 44, paddingLG: 16 },
  Statistic: { contentFontSize: 30, titleFontSize: 11 },
  Table: { headerBg: T.surface2, headerColor: T.ink3, rowHoverBg: T.surface2, borderColor: T.hairline },
  Alert: { withDescriptionPadding: '11px 13px' },
  Slider: { railSize: 3, handleSize: 13, handleSizeHover: 15 },
  Segmented: { itemSelectedBg: T.ambarVeu, itemSelectedColor: T.ambarClaro },
  Select: { optionSelectedBg: T.ambarVeu },
} as const;
