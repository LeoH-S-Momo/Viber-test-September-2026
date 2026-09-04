'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Tag } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { AdminActionButton } from '@/features/admin/admin-action-button';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminDetail } from '@/features/admin/use-admin-detail';
import { useAdminList } from '@/features/admin/use-admin-list';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatPrice } from '@/lib/format';
import {
  activateCoupon,
  createCoupon,
  deactivateCoupon,
  getCoupon,
  listCoupons,
  updateCoupon,
} from '@/services/admin.service';
import type { AdminCouponFormInput, AdminCouponListItem } from '@/types/admin';

const emptyForm: AdminCouponFormInput = {
  code: '',
  discountType: 'PERCENTAGE',
  discountValue: 10,
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  isActive: true,
  applicableCruiseIds: [],
};

function CouponFormModal({
  couponId,
  onClose,
  onSaved,
}: {
  couponId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accessToken } = useAuth();
  const existing = useAdminDetail(couponId ? getCoupon : async () => ({ ok: true as const, data: null }), couponId ?? '');
  const [form, setForm] = useState<AdminCouponFormInput>(emptyForm);
  const [hydrated, setHydrated] = useState(!couponId);
  const [cruiseIdsText, setCruiseIdsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hydrated || existing === 'loading' || existing === 'error' || existing === null) return;
    setForm({
      code: existing.code,
      organizerId: existing.organizer?.id,
      discountType: existing.discountType,
      discountValue: Number(existing.discountValue),
      minPurchaseAmount: existing.minPurchaseAmount ? Number(existing.minPurchaseAmount) : undefined,
      maxUses: existing.maxUses ?? undefined,
      maxUsesPerUser: existing.maxUsesPerUser ?? undefined,
      validFrom: existing.validFrom.slice(0, 10),
      validUntil: existing.validUntil.slice(0, 10),
      isActive: existing.isActive,
      applicableCruiseIds: existing.applicableCruises.map((c) => c.cruise.id),
    });
    setCruiseIdsText(existing.applicableCruises.map((c) => c.cruise.id).join(', '));
    setHydrated(true);
  }, [existing, hydrated]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    const payload: AdminCouponFormInput = {
      ...form,
      applicableCruiseIds: cruiseIdsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const result = couponId ? await updateCoupon(accessToken, couponId, payload) : await createCoupon(accessToken, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Modal title={couponId ? 'Editar cupom' : 'Novo cupom'} onClose={onClose}>
      {!hydrated && <Skeleton className="h-64 w-full rounded-xl" />}
      {hydrated && (
        <form className="flex flex-col gap-4 text-sm" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            Código
            <input
              required
              disabled={!!couponId}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              className={`${filterInputClassName} disabled:bg-slate-100`}
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              Tipo de desconto
              <select
                value={form.discountType}
                onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as AdminCouponFormInput['discountType'] }))}
                className={filterInputClassName}
              >
                <option value="PERCENTAGE">Percentual</option>
                <option value="FIXED_AMOUNT">Valor fixo</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Valor do desconto
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={form.discountValue}
                onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))}
                className={filterInputClassName}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              Válido de
              <input
                required
                type="date"
                value={form.validFrom.slice(0, 10)}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                className={filterInputClassName}
              />
            </label>
            <label className="flex flex-col gap-1">
              Válido até
              <input
                required
                type="date"
                value={form.validUntil.slice(0, 10)}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                className={filterInputClassName}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              Compra mínima (opcional)
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.minPurchaseAmount ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, minPurchaseAmount: e.target.value ? Number(e.target.value) : undefined }))}
                className={filterInputClassName}
              />
            </label>
            <label className="flex flex-col gap-1">
              ID do organizador (opcional)
              <input
                value={form.organizerId ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, organizerId: e.target.value || undefined }))}
                placeholder="Vazio = cupom global"
                className={filterInputClassName}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              Usos máximos totais (opcional)
              <input
                type="number"
                min={1}
                value={form.maxUses ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value ? Number(e.target.value) : undefined }))}
                className={filterInputClassName}
              />
            </label>
            <label className="flex flex-col gap-1">
              Usos máximos por usuário (opcional)
              <input
                type="number"
                min={1}
                value={form.maxUsesPerUser ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, maxUsesPerUser: e.target.value ? Number(e.target.value) : undefined }))}
                className={filterInputClassName}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            IDs de cruzeiros aplicáveis (opcional, separados por vírgula — vazio = todos)
            <input value={cruiseIdsText} onChange={(e) => setCruiseIdsText(e.target.value)} className={filterInputClassName} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            Ativo
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button type="button" onClick={onClose} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function AdminCouponsPage() {
  const [q, setQ] = useState('');
  const [formTarget, setFormTarget] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null);
  const { state, page, setPage, filters, updateFilter, reload } = useAdminList(listCoupons, {} as { q?: string; isActive?: boolean });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Cupons"
        icon={<Tag className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Cupons de desconto da plataforma — globais ou de um organizador específico."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateFilter({ q: q || undefined });
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código…" className={`${filterInputClassName} w-64`} />
          <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Buscar
          </button>
          <select
            value={filters.isActive === undefined ? '' : String(filters.isActive)}
            onChange={(e) => updateFilter({ isActive: e.target.value === '' ? undefined : e.target.value === 'true' })}
            className={filterInputClassName}
          >
            <option value="">Ativos e inativos</option>
            <option value="true">Somente ativos</option>
            <option value="false">Somente inativos</option>
          </select>
        </form>
        <button type="button" onClick={() => setFormTarget({ mode: 'create' })} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
          Novo cupom
        </button>
      </div>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} onRetry={reload} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Tag className="h-6 w-6" aria-hidden="true" />} title="Nenhum cupom encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Organizador</th>
                    <th className="px-4 py-3">Desconto</th>
                    <th className="px-4 py-3">Uso</th>
                    <th className="px-4 py-3">Validade</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((coupon: AdminCouponListItem) => (
                    <tr key={coupon.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">{coupon.code}</td>
                      <td className="px-4 py-3">{coupon.organizer?.name ?? 'Global'}</td>
                      <td className="px-4 py-3">
                        {coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}%` : formatPrice(coupon.discountValue)}
                      </td>
                      <td className="px-4 py-3">
                        {coupon.usedCount}
                        {coupon.maxUses ? ` / ${coupon.maxUses}` : ''}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(coupon.validFrom)} – {formatDate(coupon.validUntil)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={coupon.isActive ? 'success' : 'neutral'}>{coupon.isActive ? 'Ativo' : 'Inativo'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setFormTarget({ mode: 'edit', id: coupon.id })}
                            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                          >
                            Editar
                          </button>
                          {coupon.isActive ? (
                            <AdminActionButton
                              label="Desativar"
                              danger
                              confirmMessage={`Desativar o cupom ${coupon.code}?`}
                              action={(token) => deactivateCoupon(token, coupon.id)}
                              onDone={reload}
                            />
                          ) : (
                            <AdminActionButton
                              label="Ativar"
                              confirmMessage={`Reativar o cupom ${coupon.code}?`}
                              action={(token) => activateCoupon(token, coupon.id)}
                              onDone={reload}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AdminPagination meta={state.result.data.meta} page={page} setPage={setPage} />
        </>
      )}

      {formTarget && (
        <CouponFormModal
          couponId={formTarget.mode === 'edit' ? formTarget.id : null}
          onClose={() => setFormTarget(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}
