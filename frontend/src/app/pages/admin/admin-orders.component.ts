import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { Order, OrderStatus } from '../../core/models';
import { money, shortDate } from '../../core/format';

const PAGE_SIZE = 6;

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly orders = signal<Order[]>([
    { id: 'o_3041', orderNumber: 'ORD-2026-3041', quoteRef: 'Q-2026-0148', customerName: 'Jordan Reyes', customerEmail: 'j.reyes@northgate-eng.com', materialName: 'Mild steel 3.0 mm', quantity: 24, shippingMethod: 'Standard freight', subtotalCents: 27840, shippingCents: 2400, totalCents: 30240, status: 'paid', placedAt: '2026-09-05T09:22:00Z', emailError: null },
    { id: 'o_3040', orderNumber: 'ORD-2026-3040', quoteRef: 'Q-2026-0151', customerName: 'Priya Menon', customerEmail: 'p.menon@harbourworks.io', materialName: 'Aluminium 5052 2.0 mm', quantity: 48, shippingMethod: 'Per-sheet pallet freight', subtotalCents: 92400, shippingCents: 5400, totalCents: 97800, status: 'in_production', placedAt: '2026-09-05T08:04:00Z', emailError: null },
    { id: 'o_3039', orderNumber: 'ORD-2026-3039', quoteRef: 'Q-2026-0150', customerName: 'Tomas Berg', customerEmail: 't.berg@axlemetal.se', materialName: 'Stainless 304 1.2 mm', quantity: 6, shippingMethod: 'Overnight courier', subtotalCents: 18600, shippingCents: 8900, totalCents: 27500, status: 'shipped', placedAt: '2026-09-04T17:33:00Z', emailError: 'Resend rejected the recipient domain' },
    { id: 'o_3038', orderNumber: 'ORD-2026-3038', quoteRef: 'Q-2026-0147', customerName: 'Jordan Reyes', customerEmail: 'j.reyes@northgate-eng.com', materialName: 'Mild steel 1.5 mm', quantity: 120, shippingMethod: 'Per-sheet pallet freight', subtotalCents: 51260, shippingCents: 3600, totalCents: 54860, status: 'in_production', placedAt: '2026-09-03T16:02:00Z', emailError: null },
    { id: 'o_3037', orderNumber: 'ORD-2026-3037', quoteRef: 'Q-2026-0145', customerName: 'Lena Fischer', customerEmail: 'l.fischer@bauwerk.de', materialName: 'Mild steel 3.0 mm', quantity: 200, shippingMethod: 'Standard freight', subtotalCents: 184300, shippingCents: 2400, totalCents: 186700, status: 'shipped', placedAt: '2026-09-02T11:47:00Z', emailError: null },
    { id: 'o_3036', orderNumber: 'ORD-2026-3036', quoteRef: 'Q-2026-0142', customerName: 'Sam Whitfield', customerEmail: 'sam@whitfield-fab.co.uk', materialName: 'Mild steel 1.5 mm', quantity: 16, shippingMethod: 'Workshop collection', subtotalCents: 12400, shippingCents: 0, totalCents: 12400, status: 'cancelled', placedAt: '2026-08-30T09:15:00Z', emailError: null },
    { id: 'o_3035', orderNumber: 'ORD-2026-3035', quoteRef: 'Q-2026-0141', customerName: 'Priya Menon', customerEmail: 'p.menon@harbourworks.io', materialName: 'Aluminium 5052 2.0 mm', quantity: 75, shippingMethod: 'Standard freight', subtotalCents: 143800, shippingCents: 2400, totalCents: 146200, status: 'shipped', placedAt: '2026-08-27T14:20:00Z', emailError: null },
  ]);

  readonly statuses = [
    { value: 'all', label: 'All' },
    { value: 'paid', label: 'Paid' },
    { value: 'in_production', label: 'In production' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  readonly money = money;
  readonly shortDate = shortDate;

  readonly status = computed(() => this.query()?.get('status') ?? 'all');
  readonly page = computed(() => Math.max(1, Number(this.query()?.get('page') ?? '1') || 1));

  readonly filtered = computed(() => {
    const status = this.status();
    return this.orders().filter((o) => status === 'all' || o.status === (status as OrderStatus));
  });

  readonly revenueCents = computed(() =>
    this.filtered().filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.totalCents, 0),
  );

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  readonly visible = computed(() => {
    const start = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  setStatus(status: string): void {
    this.patch({ status: status === 'all' ? null : status, page: null });
  }

  goToPage(page: number): void {
    this.patch({ page: page <= 1 ? null : String(page) });
  }

  private patch(queryParams: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  statusLabel(status: OrderStatus): string {
    return status === 'in_production' ? 'In production' : status.charAt(0).toUpperCase() + status.slice(1);
  }

  badgeClass(status: OrderStatus): string {
    switch (status) {
      case 'shipped': return 'badge badge--success';
      case 'in_production': return 'badge badge--warning';
      case 'cancelled': return 'badge badge--danger';
      default: return 'badge badge--info';
    }
  }
}
