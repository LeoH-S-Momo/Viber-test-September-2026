import Link from 'next/link';
import { Quote, Star } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { ScrollReveal } from './scroll-reveal';
import { StatsCounter } from './stats-counter';
import type { ReviewHighlight } from '@/services/reviews.service';

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < rating ? 'fill-accent-400 text-accent-400' : 'text-white/20'}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function TestimonialsSection({
  reviews,
  totalReviews,
  averageRating,
  cruiseCount,
}: {
  reviews: ReviewHighlight[];
  totalReviews: number;
  averageRating: number | null;
  cruiseCount: number;
}) {
  if (reviews.length === 0) return null;

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 py-20">
      <Container>
        <ScrollReveal>
          <StatsCounter
            stats={[
              { value: cruiseCount, label: 'cruzeiros publicados' },
              { value: totalReviews, label: 'avaliações de passageiros reais' },
              { value: averageRating ?? 0, label: 'nota média', decimals: 1 },
              { value: 5, label: 'personas atendidas pela plataforma' },
            ]}
          />
        </ScrollReveal>

        <ScrollReveal delayMs={100} className="mt-16">
          <p className="mb-1 text-center text-xs font-semibold uppercase tracking-wider text-accent-400">
            Quem já embarcou conta
          </p>
          <h2 className="text-center font-display text-2xl font-bold text-white sm:text-3xl">
            Depoimentos de passageiros
          </h2>
        </ScrollReveal>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {reviews.slice(0, 6).map((review, index) => (
            <ScrollReveal key={review.id} delayMs={index * 80}>
              <figure className="flex h-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <Quote className="h-6 w-6 text-accent-400" aria-hidden="true" />
                <StarRow rating={review.rating} />
                <blockquote className="flex-1 text-sm leading-relaxed text-white/85">
                  “{review.comment}”
                </blockquote>
                <figcaption className="border-t border-white/10 pt-3 text-sm">
                  <span className="font-semibold text-white">{review.passengerName}</span>
                  <Link href={`/cruzeiros/${review.cruiseSlug}`} className="block text-white/60 hover:text-accent-400 hover:underline">
                    {review.cruiseTitle}
                  </Link>
                </figcaption>
              </figure>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
