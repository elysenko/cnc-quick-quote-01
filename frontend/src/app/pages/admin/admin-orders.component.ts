import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ToastService } from '../../shared/toast.service';
import { ApiClient, errorMessage } from '../../core/api';
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
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  /** Every customer's orders — filtering and paging stay client-side. */
  readonly orders = signal<Order[]>([]);

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

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.orders.set(await this.api.get<Order[]>('/admin/orders'));
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not load the orders.'), 'danger');
    }
  }

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
