import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { IconComponent } from '../../shared/icon.component';
import { Quote, QuoteStatus } from '../../core/models';
import { money, percent, shortDate } from '../../core/format';

const PAGE_SIZE = 6;

@Component({
  selector: 'app-quotes-list',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent, IconComponent],
  templateUrl: './quotes-list.component.html',
  styleUrl: './quotes-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuotesListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly quotes = signal<Quote[]>([
    { id: 'q_0148', reference: 'Q-2026-0148', drawingName: 'bracket-rev-c.dxf', materialName: 'Mild steel 3.0 mm', thicknessMm: 3, quantity: 24, bendCount: 2, sheetCount: 1, utilisation: 0.295, cutLengthMm: 1268.4, totalCents: 27840, status: 'quoted', createdAt: '2026-09-05T09:14:00Z' },
    { id: 'q_0147', reference: 'Q-2026-0147', drawingName: 'gusset-plate.dxf', materialName: 'Mild steel 1.5 mm', thicknessMm: 1.5, quantity: 120, bendCount: 0, sheetCount: 2, utilisation: 0.61, cutLengthMm: 642.0, totalCents: 51260, status: 'ordered', createdAt: '2026-09-03T15:41:00Z' },
    { id: 'q_0146', reference: 'Q-2026-0146', drawingName: 'enclosure-lid.dxf', materialName: 'Aluminium 5052 2.0 mm', thicknessMm: 2, quantity: 40, bendCount: 4, sheetCount: 2, utilisation: 0.48, cutLengthMm: 1890.5, totalCents: 84320, status: 'quoted', createdAt: '2026-09-02T11:02:00Z' },
    { id: 'q_0145', reference: 'Q-2026-0145', drawingName: 'mount-arm.dxf', materialName: 'Stainless 304 1.2 mm', thicknessMm: 1.2, quantity: 8, bendCount: 3, sheetCount: 1, utilisation: 0.12, cutLengthMm: 980.2, totalCents: 19400, status: 'expired', createdAt: '2026-08-21T08:30:00Z' },
    { id: 'q_0144', reference: 'Q-2026-0144', drawingName: 'cover-panel.dxf', materialName: 'Mild steel 1.5 mm', thicknessMm: 1.5, quantity: 60, bendCount: 1, sheetCount: 1, utilisation: 0.72, cutLengthMm: 1120.9, totalCents: 39960, status: 'ordered', createdAt: '2026-08-19T13:55:00Z' },
    { id: 'q_0143', reference: 'Q-2026-0143', drawingName: 'spacer-ring.dxf', materialName: 'Aluminium 5052 2.0 mm', thicknessMm: 2, quantity: 200, bendCount: 0, sheetCount: 3, utilisation: 0.55, cutLengthMm: 386.4, totalCents: 68210, status: 'quoted', createdAt: '2026-08-14T10:11:00Z' },
    { id: 'q_0142', reference: 'Q-2026-0142', drawingName: 'clip-bracket.dxf', materialName: 'Mild steel 3.0 mm', thicknessMm: 3, quantity: 15, bendCount: 2, sheetCount: 1, utilisation: 0.19, cutLengthMm: 744.0, totalCents: 22150, status: 'draft', createdAt: '2026-08-11T16:20:00Z' },
  ]);

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
