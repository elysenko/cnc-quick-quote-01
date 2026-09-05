import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { Quote, QuoteStatus } from '../../core/models';
import { money, percent, shortDate } from '../../core/format';
import { ApiClient, errorMessage } from '../../core/api';
import { QuoteRecord } from '../../core/quote-draft.service';
import { ToastService } from '../../shared/toast.service';

const PAGE_SIZE = 6;

/** The API's status strings map 1:1 onto the union the badges switch on. */
function toQuote(record: QuoteRecord): Quote {
  return {
    id: record.id,
    reference: record.reference,
    drawingName: record.drawingName,
    materialName: record.materialName,
    thicknessMm: record.thicknessMm,
    quantity: record.quantity,
    bendCount: record.bendCount,
    sheetCount: record.sheetCount,
    utilisation: record.utilisation,
    cutLengthMm: record.cutLengthMm,
    totalCents: record.totalCents,
    status: record.status as QuoteStatus,
    createdAt: record.createdAt,
  };
}

@Component({
  selector: 'app-quotes-list',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent, IconComponent],
  templateUrl: './quotes-list.component.html',
  styleUrl: './quotes-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuotesListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  /** The signed-in customer's quotes, newest first, straight from the API. */
  readonly quotes = signal<Quote[]>([]);

  readonly statuses: { value: string; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'quoted', label: 'Quoted' },
    { value: 'ordered', label: 'Ordered' },
    { value: 'expired', label: 'Expired' },
  ];

  readonly money = money;
  readonly percent = percent;
  readonly shortDate = shortDate;

  readonly status = computed(() => this.query()?.get('status') ?? 'all');
  readonly sort = computed(() => this.query()?.get('sort') ?? 'newest');
  readonly page = computed(() => Math.max(1, Number(this.query()?.get('page') ?? '1') || 1));

  readonly filtered = computed(() => {
    const status = this.status();
    const list = this.quotes().filter((q) => status === 'all' || q.status === (status as QuoteStatus));
    const sorted = [...list];
    switch (this.sort()) {
      case 'oldest': sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); break;
      case 'total-desc': sorted.sort((a, b) => b.totalCents - a.totalCents); break;
      case 'total-asc': sorted.sort((a, b) => a.totalCents - b.totalCents); break;
      default: sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
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
      const records = await this.api.get<QuoteRecord[]>('/quotes');
      this.quotes.set(records.map(toQuote));
    } catch (error) {
      this.quotes.set([]);
      this.toast.show(errorMessage(error, 'We could not load your quotes.'), 'danger');
    }
  }

  setStatus(status: string): void {
    this.patch({ status: status === 'all' ? null : status, page: null });
  }

  setSort(sort: string): void {
    this.patch({ sort: sort === 'newest' ? null : sort });
  }

  goToPage(page: number): void {
    this.patch({ page: page <= 1 ? null : String(page) });
  }

  private patch(queryParams: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  badgeClass(status: QuoteStatus): string {
    switch (status) {
      case 'ordered': return 'badge badge--success';
      case 'quoted': return 'badge badge--info';
      case 'expired': return 'badge badge--danger';
      default: return 'badge';
    }
  }
}
