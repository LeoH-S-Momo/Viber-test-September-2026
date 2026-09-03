import { toPageResult, toSkipTake } from '../../src/modules/catalog/domain/pagination';

describe('pagination', () => {
  describe('toSkipTake', () => {
    it('computes skip/take for page 1', () => {
      expect(toSkipTake(1, 20)).toEqual({ skip: 0, take: 20 });
    });

    it('computes skip/take for later pages', () => {
      expect(toSkipTake(3, 10)).toEqual({ skip: 20, take: 10 });
    });
  });

  describe('toPageResult', () => {
    it('builds the meta block including total pages', () => {
      const result = toPageResult(['a', 'b'], 45, 2, 20);

      expect(result).toEqual({
        data: ['a', 'b'],
        meta: { page: 2, pageSize: 20, total: 45, totalPages: 3 },
      });
    });

    it('never reports fewer than 1 total page, even with zero results', () => {
      const result = toPageResult([], 0, 1, 20);

      expect(result.meta.totalPages).toBe(1);
    });
  });
});
