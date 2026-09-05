import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../../shared/icon.component';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { BrandingService } from '../../core/branding.service';
import { ShippingMethod } from '../../core/models';
import { money } from '../../core/format';

@Component({
  selector: 'app-checkout-shipping',
  standalone: true,
  imports: [RouterLink, IconComponent, EmptyStateComponent],
  templateUrl: './checkout-shipping.component.html',
  styleUrl: './checkout-shipping.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutShippingComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly brandingService = inject(BrandingService);

  private readonly params = toSignal(this.route.paramMap, { initialValue: null });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly methods = signal<ShippingMethod[]>([
    { id: 'ship_1', name: 'Standard freight', kind: 'flat', costCents: 2400, etaDays: 5, active: true },
    { id: 'ship_2', name: 'Per-sheet pallet freight', kind: 'per_sheet', costCents: 1800, etaDays: 3, active: true },
    { id: 'ship_3', name: 'Workshop collection', kind: 'flat', costCents: 0, etaDays: 2, active: true },
  ]);

  readonly branding = this.brandingService.branding;
  readonly quoteId = computed(() => this.params()?.get('quoteId') ?? 'q_0148');
  /** `?methods=none` renders the blocked state so it stays reviewable. */
  readonly blocked = computed(() => this.query()?.get('methods') === 'none');
  readonly selectedId = computed(() => this.query()?.get('ship') ?? 'ship_1');

  readonly nesting = this.draft.nesting;
  readonly price = this.draft.price;
  readonly money = money;

  readonly priced = computed(() =>
    this.methods()
      .filter((m) => m.active)
      .map((m) => ({
        ...m,
        computedCents: m.kind === 'per_sheet' ? m.costCents * this.nesting().sheetCount : m.costCents,
      })),
  );

  readonly selected = computed(() => this.priced().find((m) => m.id === this.selectedId()) ?? this.priced()[0]);
  readonly grandTotal = computed(() => this.price().totalCents + this.selected().computedCents);

  select(id: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { ship: id }, queryParamsHandling: 'merge' });
  }
}
