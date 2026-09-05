import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../../shared/icon.component';
import { CostBreakdownComponent } from '../../shared/cost-breakdown.component';
import { ApiClient, errorMessage } from '../../core/api';
import { ToastService } from '../../shared/toast.service';
import { Order } from '../../core/models';
import { PriceResult } from '../../core/pricing';
import { dateTime, money } from '../../core/format';

/** The order detail payload: `Order` plus the fields only this screen needs. */
interface AdminOrderDetail extends Order {
  customerCompany: string | null;
  drawingName: string;
  shippingEtaDays: number | null;
  internalNote: string | null;
  breakdown: PriceResult | null;
  minimumOrderCents: number;
}

const EMPTY_BREAKDOWN: PriceResult = {
  lines: [],
  subtotalCents: 0,
  totalCents: 0,
  minimumApplied: false,
  totalCutLengthMm: 0,
  totalBends: 0,
};

@Component({
  selector: 'app-admin-order-detail',
  standalone: true,
  imports: [RouterLink, IconComponent, CostBreakdownComponent],
  templateUrl: './admin-order-detail.component.html',
  styleUrl: './admin-order-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrderDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly params = toSignal(this.route.paramMap, { initialValue: null });

  private readonly order = signal<AdminOrderDetail | null>(null);

  readonly orderId = computed(() => this.params()?.get('orderId') ?? '');
  readonly orderNumber = computed(() => this.order()?.orderNumber ?? '—');
  readonly quoteRef = computed(() => this.order()?.quoteRef ?? '—');
  readonly stripeSessionId = computed(() => this.order()?.stripeSessionId ?? '—');
  readonly customerName = computed(() => this.order()?.customerName ?? '—');
  readonly customerEmail = computed(() => this.order()?.customerEmail ?? '—');
  readonly customerCompany = computed(() => this.order()?.customerCompany || '—');
  readonly drawingName = computed(() => this.order()?.drawingName ?? '—');
  readonly placedAt = computed(() => this.order()?.placedAt ?? '');
  readonly quantity = computed(() => this.order()?.quantity ?? 0);

  /** Kept as an object so the template's `material().name` binding still works. */
  readonly material = computed(() => ({ name: this.order()?.materialName ?? '—' }));

  readonly deliveryLabel = computed(() => {
    const order = this.order();
    if (!order) return '—';
    const eta = order.shippingEtaDays;
    return eta === null ? order.shippingMethod : `${order.shippingMethod} · ${eta} days`;
  });

  readonly statusLabel = computed(() => {
    const status = this.order()?.status ?? '';
    if (!status) return '—';
    return status === 'in_production'
      ? 'In production'
      : status.charAt(0).toUpperCase() + status.slice(1);
  });

  /** The frozen breakdown the customer was charged from. */
  readonly price = computed<PriceResult>(() => this.order()?.breakdown ?? EMPTY_BREAKDOWN);
  readonly pricing = computed(() => ({ minimumOrderCents: this.order()?.minimumOrderCents ?? 0 }));
  /** Parts subtotal plus the delivery actually charged. */
  readonly totalPaidCents = computed(() => this.order()?.totalCents ?? 0);

  readonly note = signal('');
  readonly savingNote = signal(false);

  readonly money = money;
  readonly dateTime = dateTime;

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const id = this.orderId();
    if (!id) return;
    try {
      const order = await this.api.get<AdminOrderDetail>(`/orders/${id}`);
      this.order.set(order);
      this.note.set(order.internalNote ?? '');
    } catch (error) {
      this.toast.show(errorMessage(error, 'That order could not be loaded.'), 'danger');
    }
  }

  async saveNote(): Promise<void> {
    const id = this.orderId();
    if (!id || this.savingNote()) return;
    this.savingNote.set(true);
    try {
      const updated = await this.api.patch<AdminOrderDetail>(`/admin/orders/${id}`, {
        internalNote: this.note(),
      });
      this.order.set(updated);
      this.toast.show('Note saved', 'success');
    } catch (error) {
      this.toast.show(errorMessage(error, 'That note could not be saved.'), 'danger');
    } finally {
      this.savingNote.set(false);
    }
  }

  async downloadReceipt(event: Event): Promise<void> {
    event.preventDefault();
    const order = this.order();
    if (!order) return;
    try {
      const blob = await this.api.blob(`/orders/${order.id}/receipt`);
      triggerDownload(blob, `receipt-${order.orderNumber}.pdf`);
    } catch (error) {
      this.toast.show(errorMessage(error, 'That receipt could not be downloaded.'), 'danger');
    }
  }
}

/** Streams a fetched blob to disk without leaking the temporary object URL. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
