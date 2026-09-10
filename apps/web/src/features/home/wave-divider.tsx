/** Divisor em forma de onda entre o hero e a seção seguinte — `fill` deve bater com o fundo da
 * seção de baixo (o SVG "cobre" a transição, não é um efeito de borda). */
export function WaveDivider({ fill = '#ffffff' }: { fill?: string }) {
  return (
    <svg
      viewBox="0 0 1440 96"
      preserveAspectRatio="none"
      className="block h-16 w-full sm:h-24"
      aria-hidden="true"
    >
      <path
        d="M0,32 C240,96 480,0 720,32 C960,64 1200,16 1440,48 L1440,96 L0,96 Z"
        fill={fill}
      />
    </svg>
  );
}
