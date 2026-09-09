import { ConflictException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ReviewModerationPolicy } from '../../src/modules/reviews/domain/review-moderation.policy';

describe('ReviewModerationPolicy', () => {
  it('permite PENDING -> APPROVED', () => {
    expect(() => ReviewModerationPolicy.assertValidTransition(ReviewStatus.PENDING, 'APPROVED')).not.toThrow();
  });

  it('permite PENDING -> REJECTED', () => {
    expect(() => ReviewModerationPolicy.assertValidTransition(ReviewStatus.PENDING, 'REJECTED')).not.toThrow();
  });

  it('permite APPROVED -> HIDDEN', () => {
    expect(() => ReviewModerationPolicy.assertValidTransition(ReviewStatus.APPROVED, 'HIDDEN')).not.toThrow();
  });

  it('permite REJECTED -> HIDDEN', () => {
    expect(() => ReviewModerationPolicy.assertValidTransition(ReviewStatus.REJECTED, 'HIDDEN')).not.toThrow();
  });

  it('rejeita APPROVED -> REJECTED (uma decisao inicial nao vira outra)', () => {
    expect(() => ReviewModerationPolicy.assertValidTransition(ReviewStatus.APPROVED, 'REJECTED')).toThrow(ConflictException);
  });

  it('rejeita HIDDEN -> APPROVED (HIDDEN e terminal)', () => {
    expect(() => ReviewModerationPolicy.assertValidTransition(ReviewStatus.HIDDEN, 'APPROVED')).toThrow(ConflictException);
  });

  it('rejeita PENDING -> HIDDEN (precisa passar por uma decisao antes)', () => {
    expect(() => ReviewModerationPolicy.assertValidTransition(ReviewStatus.PENDING, 'HIDDEN')).toThrow(ConflictException);
  });
});
