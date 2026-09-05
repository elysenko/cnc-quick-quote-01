import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../shared/modal.component';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { money } from '../../core/format';

@Component({
  selector: 'app-admin-materials',
  standalone: true,
  imports: [ModalComponent, IconComponent],
  templateUrl: './materials.component.html',
  styleUrl: './materials.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialsComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly materials = this.draft.materials;
  readonly money = money;

  /** `?modal=new` and `?edit=<id>` make both panes deep-linkable. */
  readonly showNew = computed(() => this.query()?.get('modal') === 'new');
  readonly editId = computed(() => this.query()?.get('edit'));
  readonly editing = computed(() => this.materials().find((m) => m.id === this.editId()) ?? null);

  readonly draftName = signal('');
  readonly draftThickness = signal('2.0');

  openNew(): void { this.patch({ modal: 'new', edit: null }); }
  openEdit(id: string): void { this.patch({ edit: id, modal: null }); }
  close(): void { this.patch({ modal: null, edit: null }); }

  private patch(queryParams: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  toggleActive(id: string): void {
    let nowActive = false;
    this.materials.update((list) =>
      list.map((m) => {
        if (m.id !== id) return m;
        nowActive = !m.active;
        return { ...m, active: nowActive };
      }),
    );
    this.toast.show(
      nowActive ? 'Material is now available to customers' : 'Material retired — removed from customer lists',
      nowActive ? 'success' : 'info',
    );
  }

  createMaterial(event: Event): void {
    event.preventDefault();
    const name = this.draftName().trim() || 'New material';
    this.materials.update((list) => [
      ...list,
      {
        id: `mat_${list.length + 1}${Date.now() % 100}`,
        name,
        thicknessMm: Number(this.draftThickness()) || 2,
        costPerFtCents: 260,
        costMultiplier: 1.2,
        sheetWidthMm: 2500,
        sheetHeightMm: 1250,
        perSheetCostCents: 8600,
        active: true,
      },
    ]);
    this.draftName.set('');
    this.toast.show(`${name} added to the catalogue`, 'success');
    this.close();
  }

  saveEdit(event: Event): void {
    event.preventDefault();
    this.toast.show('Material updated', 'success');
    this.close();
  }
}
