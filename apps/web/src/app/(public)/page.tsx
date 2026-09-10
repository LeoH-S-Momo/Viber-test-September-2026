import Link from 'next/link';
import { Compass, PartyPopper, ShieldCheck, Sparkles, UtensilsCrossed } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { buttonVariants } from '@/components/ui/button-styles';
import { ErrorState } from '@/components/ui/error-state';
import { CruiseGrid } from '@/features/cruise-discovery/cruise-grid';
import { FeaturedCruiseBanner } from '@/features/home/featured-cruise-banner';
import { ScrollReveal } from '@/features/home/scroll-reveal';
import { TestimonialsSection } from '@/features/home/testimonials-section';
import { UpcomingMarquee } from '@/features/home/upcoming-marquee';
import { WaveDivider } from '@/features/home/wave-divider';
import { listCruises } from '@/services/cruises.service';
import { getReviewHighlights } from '@/services/reviews.service';

/**
 * Foto real de navio pro fundo do hero (efeito Ken Burns precisa de uma imagem, não só
 * gradiente) — verificada visualmente antes de entrar aqui, mesmo critério das fotos de capa dos
 * cruzeiros (ver seedAguasPassadasCruise/coverImageUrlFor no seed).
 */
const HERO_IMAGE_URL = 'https://commons.wikimedia.org/wiki/Special:FilePath/Sunset_Ship.jpg?width=1600';

export default async function HomePage() {
  const [cruisesResult, highlightsResult] = await Promise.all([
    listCruises({
      sortBy: 'embarkationDate',
      sortOrder: 'asc',
      pageSize: '8',
      embarkationFrom: new Date().toISOString(),
    }),
    getReviewHighlights(6),
  ]);

  const upcomingCruises = cruisesResult.ok ? cruisesResult.data.data : [];
  const [featuredCruise, ...otherCruises] = upcomingCruises;
  const gridCruises = otherCruises.slice(0, 6);
  const cruiseCount = cruisesResult.ok ? cruisesResult.data.meta.total : upcomingCruises.length;

  return (
    <>
      <section className="relative overflow-hidden bg-brand-950">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL externa, sem loader configurado */}
          <img src={HERO_IMAGE_URL} alt="" className="h-full w-full animate-ken-burns object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-brand-950/95 via-brand-900/80 to-brand-800/55" />
        </div>
        <div
          className="animate-wave-scroll absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M0 30 Q15 15 30 30 T60 30' stroke='white' stroke-width='1' fill='none'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'repeat',
          }}
          aria-hidden="true"
        />

        <Container className="relative py-20 sm:py-28">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent-400">
            Cruzeiros temáticos
          </p>
          <h1 className="max-w-2xl font-display text-4xl font-extrabold leading-tight text-white sm:text-6xl">
            Viva experiências únicas em alto mar
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/80">
            Shows, gastronomia, festas e roteiros inesquecíveis. Encontre o cruzeiro temático
            perfeito para a sua próxima viagem.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/cruzeiros" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
              <Compass className="h-5 w-5" aria-hidden="true" />
              Explorar cruzeiros
            </Link>
          </div>
        </Container>

        <div className="absolute inset-x-0 bottom-0 z-10">
          <WaveDivider fill="#ffffff" />
        </div>
      </section>

      <UpcomingMarquee cruises={upcomingCruises} />

      <section className="border-b border-slate-100 bg-white py-10">
        <Container>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <ScrollReveal>
              <ValueProp
                icon={<PartyPopper className="h-5 w-5" aria-hidden="true" />}
                title="Shows e eventos"
                description="Line-ups exclusivos com artistas e atrações a bordo."
              />
            </ScrollReveal>
            <ScrollReveal delayMs={100}>
              <ValueProp
                icon={<UtensilsCrossed className="h-5 w-5" aria-hidden="true" />}
                title="Gastronomia a bordo"
                description="Restaurantes variados, do casual ao fine dining."
              />
            </ScrollReveal>
            <ScrollReveal delayMs={200}>
              <ValueProp
                icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
                title="Reserva sem burocracia"
                description="Compare cabines, preços e roteiros num só lugar."
              />
            </ScrollReveal>
          </div>
        </Container>
      </section>

      {featuredCruise && <FeaturedCruiseBanner cruise={featuredCruise} />}

      <section className="py-16">
        <Container>
          <ScrollReveal>
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-600">
                  Em destaque
                </p>
                <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
                  <Sparkles className="h-6 w-6 text-brand-600" aria-hidden="true" />
                  Próximos embarques
                </h2>
              </div>
              <Link
                href="/cruzeiros"
                className="hidden text-sm font-semibold text-brand-700 hover:underline sm:inline"
              >
                Ver todos →
              </Link>
            </div>
          </ScrollReveal>

          {cruisesResult.ok ? (
            <ScrollReveal delayMs={100}>
              <CruiseGrid cruises={gridCruises} />
            </ScrollReveal>
          ) : (
            <ErrorState message={cruisesResult.message} />
          )}

          <div className="mt-8 text-center sm:hidden">
            <Link href="/cruzeiros" className={buttonVariants({ variant: 'outline' })}>
              Ver todos os cruzeiros
            </Link>
          </div>
        </Container>
      </section>

      {highlightsResult.ok && (
        <TestimonialsSection
          reviews={highlightsResult.data.items}
          totalReviews={highlightsResult.data.total}
          averageRating={highlightsResult.data.averageRating}
          cruiseCount={cruiseCount}
        />
      )}
    </>
  );
}

function ValueProp({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        {icon}
      </span>
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
    </div>
  );
}
