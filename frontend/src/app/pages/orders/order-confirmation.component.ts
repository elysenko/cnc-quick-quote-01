import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../../shared/icon.component';
import { BrandingService } from '../../core/branding.service';
import { ApiClient, errorMessage } from '../../core/api';
import { ToastService } from '../../shared/toast.service';
import { Order } from '../../core/models';
import { money } from '../../core/format';

const FIRST_DELAY_MS = 1500;
const MAX_DELAY_MS = 5000;
const GIVE_UP_AFTER_MS = 60_000;

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './order-confirmation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderConfirmationComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly brandingService = inject(BrandingService);
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private delay = FIRST_DELAY_MS;
  private startedAt = 0;
  private destroyed = false;
  private warned = false;

  private readonly order = signal<Order | null>(null);
  /** True once polling has run out of patience, so the page stops spinning. */
  private readonly gaveUp = signal(false);

  readonly branding = this.brandingService.branding;
  readonly sessionId = computed(() => this.query()?.get('session_id') ?? '');
  /** Still waiting on the webhook — `?state=pending` also holds this view. */
  readonly stuck = computed(() => this.query()?.get('state') === 'pending' || this.gaveUp());
  readonly settled = signal(false);

  get orderNumber(): string {
    return this.order()?.orderNumber ?? '';
  }

  readonly material = computed<{ name: string }>(() => ({ name: this.order()?.materialName ?? '' }));
  readonly quantity = computed(() => this.order()?.quantity ?? 0);
  readonly money = money;
  readonly grandTotal = computed(() => this.order()?.totalCents ?? 0);

  readonly ready = computed(() => this.settled() && !this.stuck());

  ngOnInit(): void {
    // Polls by session id: the webhook may land before or after the browser
    // returns from the provider, and both orderings converge on one order.
    if (!this.sessionId()) return;
    this.startedAt = Date.now();
    this.poll();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private poll(): void {
    void (async () => {
      if (this.destroyed) return;
      try {
        const result = await this.api.get<{ order: Order | null }>('/checkout/sessions/order', {
          session_id: this.sessionId(),
        });
        if (this.destroyed) return;
        if (result.order) {
          this.order.set(result.order);
          this.settled.set(true);
          return;
        }
      } catch (error) {
        if (this.destroyed) return;
        // One notice is enough; the poll keeps retrying quietly behind it.
        if (!this.warned) {
          this.warned = true;
          this.toast.show(errorMessage(error, 'We could not confirm your payment yet.'), 'danger');
        }
      }

      if (Date.now() - this.startedAt >= GIVE_UP_AFTER_MS) {
        this.gaveUp.set(true);
        return;
      }
      this.timer = setTimeout(() => this.poll(), this.delay);
      this.delay = Math.min(Math.round(this.delay * 1.5), MAX_DELAY_MS);
    })();
  }

  /** Streams the stored PDF receipt to disk. */
  async downloadReceipt(event: Event): Promise<void> {
    event.preventDefault();
    const order = this.order();
    if (!order) return;
    try {
      const blob = await this.api.blob(`/orders/${order.id}/receipt`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${order.orderNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not download that receipt.'), 'danger');
    }
  }
}
