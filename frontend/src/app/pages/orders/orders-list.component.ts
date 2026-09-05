import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { Order, OrderStatus } from '../../core/models';
import { money, shortDate } from '../../core/format';

const PAGE_SIZE = 5;

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent, IconComponent],
  templateUrl: './orders-list.component.html',
  styleUrl: './orders-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly orders = signal<Order[]>([
    { id: 'o_3041', orderNumber: 'ORD-2026-3041', quoteRef: 'Q-2026-0148', customerName: 'Jordan Reyes', customerEmail: 'j.reyes@northgate-eng.com', materialName: 'Mild steel 3.0 mm', quantity: 24, shippingMethod: 'Standard freight', subtotalCents: 27840, shippingCents: 2400, totalCents: 30240, status: 'paid', placedAt: '2026-09-05T09:22:00Z', emailError: null },
    { id: 'o_3038', orderNumber: 'ORD-2026-3038', quoteRef: 'Q-2026-0147', customerName: 'Jordan Reyes', customerEmail: 'j.reyes@northgate-eng.com', materialName: 'Mild steel 1.5 mm', quantity: 120, shippingMethod: 'Per-sheet pallet freight', subtotalCents: 51260, shippingCents: 3600, totalCents: 54860, status: 'in_production', placedAt: '2026-09-03T16:02:00Z', emailError: null },
    { id: 'o_3021', orderNumber: 'ORD-2026-3021', quoteRef: 'Q-2026-0144', customerName: 'Jordan Reyes', customerEmail: 'j.reyes@northgate-eng.com', materialName: 'Mild steel 1.5 mm', quantity: 60, shippingMethod: 'Workshop collection', subtotalCents: 39960, shippingCents: 0, totalCents: 39960, status: 'shipped', placedAt: '2026-08-19T14:10:00Z', emailError: 'Resend timed out; receipt available for download' },
    { id: 'o_2994', orderNumber: 'ORD-2026-2994', quoteRef: 'Q-2026-0139', customerName: 'Jordan Reyes', customerEmail: 'j.reyes@northgate-eng.com', materialName: 'Aluminium 5052 2.0 mm', quantity: 30, shippingMethod: 'Standard freight', subtotalCents: 61200, shippingCents: 2400, totalCents: 63600, status: 'shipped', placedAt: '2026-07-28T10:44:00Z', emailError: null },
    { id: 'o_2960', orderNumber: 'ORD-2026-2960', quoteRef: 'Q-2026-0131', customerName: 'Jordan Reyes', customerEmail: 'j.reyes@northgate-eng.com', materialName: 'Stainless 304 1.2 mm', quantity: 12, shippingMethod: 'Standard freight', subtotalCents: 28900, shippingCents: 2400, totalCents: 31300, status: 'shipped', placedAt: '2026-07-02T09:05:00Z', emailError: null },
    { id: 'o_2933', orderNumber: 'ORD-2026-2933', quoteRef: 'Q-2026-0126', customerName: 'Jordan Reyes', customerEmail: 'j.reyes@northgate-eng.com', materialName: 'Mild steel 3.0 mm', quantity: 8, shippingMethod: 'Workshop collection', subtotalCents: 15400, shippingCents: 0, totalCents: 15400, status: 'cancelled', placedAt: '2026-06-14T12:30:00Z', emailError: null },
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
