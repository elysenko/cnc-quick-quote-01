import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { Order, OrderStatus } from '../../core/models';
import { money, shortDate } from '../../core/format';
import { ApiClient, errorMessage } from '../../core/api';
import { ToastService } from '../../shared/toast.service';

const PAGE_SIZE = 5;

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent, IconComponent],
  templateUrl: './orders-list.component.html',
  styleUrl: './orders-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  /** The signed-in customer's own orders, straight from the API. */
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

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  readonly visible = computed(() => {
    const start = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  ngOnInit(): void {
    void this.load();
  }

  /** A failure leaves the list empty and says so — never a stand-in row. */
  private async load(): Promise<void> {
    try {
      this.orders.set(await this.api.get<Order[]>('/orders'));
    } catch (error) {
      this.orders.set([]);
      this.toast.show(errorMessage(error, 'We could not load your orders.'), 'danger');
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

  /** Streams the stored PDF receipt for one row to disk. */
  async downloadReceipt(event: Event, orderId: string): Promise<void> {
    event.preventDefault();
    const order = this.orders().find((candidate) => candidate.id === orderId);
    if (!order) return;
    try {
      const blob = await this.api.blob(`/orders/${order.id}/receipt`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${order.orderNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not download that receipt.'), 'danger');
    }
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
