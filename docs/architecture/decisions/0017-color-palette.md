# ADR-0017: Paleta de cores "céu e mar"

## Status
Aceito

## Contexto
Pedido explícito do usuário: trocar as cores do site pela paleta publicada em
[colorhunt.co/palette/30afff92eeffd8ffc5c4f7ca](https://colorhunt.co/palette/30afff92eeffd8ffc5c4f7ca) — quatro tons:

| Hex | Aparência |
|---|---|
| `#30AFFF` | Azul vívido (céu/mar) |
| `#92EEFF` | Ciano claro |
| `#D8FFC5` | Verde-limão claro |
| `#C4F7CA` | Verde-menta claro |

A paleta anterior ("oceano": azul-petróleo `#2790a6` + coral/laranja `#ec3f0d`, ver o comentário
original em `globals.css`) foi substituída por completo — não uma adição, uma troca.

## De 4 cores para dois degradês de 10-11 tons
O site inteiro (desde o bootstrap) é construído sobre dois tokens Tailwind — `brand-*` (50 a 950)
e `accent-*` (50 a 900) — usados em toda parte via classes utilitárias (`bg-brand-800`,
`text-accent-600`, badges, botões, gráficos do dashboard). As 4 cores da paleta do ColorHunt não
bastam sozinhas: preciso de tons claros o suficiente para fundos sutis (`brand-50`) e escuros o
suficiente para texto/botão com contraste AA sobre branco (`brand-800`, `accent-600`+).

Resolvido gerando cada degradê por HSL a partir da matiz de duas das quatro cores da paleta,
mantendo a matiz (hue) constante e variando luminosidade/saturação de forma suave — o mesmo
princípio de qualquer sistema de design token (Tailwind, Material), não um punhado de cores soltas:

- **`brand` (azul)** — matiz ~204-214°, ancorado exatamente em `#30AFFF` como `brand-500`
  (a cor mais vívida da paleta permanece literal em algum ponto do degradê, não é só "inspiração").
  `brand-50`/`100` ficam próximos de `#92EEFF` (o ciano claro da paleta); `brand-800`/`900`/`950`
  escurecem a mesma matiz para dar conta de fundos escuros (hero, sidebar ativa, footer).
- **`accent` (verde)** — matiz ~128-144°, com `accent-100`/`200` próximos de `#D8FFC5`/`#C4F7CA`
  (as duas cores claras da paleta, usadas quase literalmente). A paleta original não tem nenhum
  verde escuro o bastante pra servir de fundo de botão com texto branco — `accent-600` em diante
  foi escurecido mantendo a mesma matiz, não inventando uma cor nova.

## Contraste verificado, não assumido
Combinações usadas em texto/botão sobre fundo branco, checadas contra WCAG 2.1 (`(L1+0.05)/(L2+0.05)`,
alvo ≥ 4.5:1 pra texto normal):

| Token | Uso típico | Contraste vs. branco |
|---|---|---|
| `brand-700` | `text-brand-700` (texto em destaque) | 4.85 |
| `brand-800` | `bg-brand-800` (sidebar ativa, hero) | 7.20 |
| `accent-600` | `bg-accent-600 text-white` (botão primário) | **4.79** |
| `accent-700` | hover/variantes | 6.97 |

`accent-600` é o caso mais apertado (todo botão "primary" do site usa `bg-accent-600 text-white`,
ver `button-styles.ts`) — passou por três iterações de luminosidade (38% → 33% → 30%) até cruzar o
piso de 4.5:1; guardado aqui porque é o tipo de ajuste que, sem o registro, pareceria arbitrário
numa leitura futura do código.

## Fora de escopo desta troca
- **Paleta dos gráficos do dashboard** (`RevenueChart`, `OccupancyChart`, `TopListChart` — ver
  ADR-0016) continua com as cores validadas pela skill de visualização de dados (azul/laranja/verde
  específicos, escolhidos por critério de contraste categórico, não pela marca) — trocar teria
  exigido revalidar contraste CVD/categórico do zero sem necessidade, e não foi pedido.
- Nenhuma imagem/ícone estático foi gerada; o favicon e quaisquer assets rasterizados (nenhum
  existe hoje) ficam de fora — só os tokens CSS (`--color-brand-*`/`--color-accent-*` em
  `apps/web/src/app/globals.css`) e, por consequência automática (Tailwind lê os tokens), toda
  classe utilitária que já os referenciava.

## Consequências
- Troca de paleta é so em `apps/web/src/app/globals.css` (2 blocos `@theme`) — confirmado (grep)
  que nenhum componente hardcodeia hex da paleta antiga fora desses tokens, então nenhuma outra
  alteração de arquivo foi necessária.
- Verificado visualmente num navegador real (Home, Login, Meus Ingressos, Minha Viagem, Dashboard
  do organizador) — gradiente do hero, sidebar do organizador, badges, gráficos e cards todos
  coerentes com a nova paleta, sem regressão de contraste percebida.
