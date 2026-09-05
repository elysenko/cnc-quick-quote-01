import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../shared/modal.component';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { ApiClient, errorMessage } from '../../core/api';
import { Material } from '../../core/models';
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
  private readonly api = inject(ApiClient);
  private readonly draft = inject(QuoteDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  /** The admin catalogue — unlike the customer list this includes retired rows. */
  readonly materials = signal<Material[]>([]);
  readonly money = money;

  /** `?modal=new` and `?edit=<id>` make both panes deep-linkable. */
  readonly showNew = computed(() => this.query()?.get('modal') === 'new');
  readonly editId = computed(() => this.query()?.get('edit'));
  readonly editing = computed(() => this.materials().find((m) => m.id === this.editId()) ?? null);

  readonly draftName = signal('');
  readonly draftThickness = signal('2.0');

  constructor() {
    void this.load();
    // Keeps the machine defaults used for a new sheet size in sync.
    void this.draft.loadReferenceData();
  }

  openNew(): void { this.patch({ modal: 'new', edit: null }); }
  openEdit(id: string): void { this.patch({ edit: id, modal: null }); }
  close(): void { this.patch({ modal: null, edit: null }); }

  private patch(queryParams: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  private async load(): Promise<void> {
    try {
      this.materials.set(await this.api.get<Material[]>('/admin/materials'));
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not load the material catalogue.'), 'danger');
    }
  }

  /** Refreshes both this table and the customer-facing catalogue. */
  private async refresh(): Promise<void> {
    await this.load();
    await this.draft.loadReferenceData();
  }

  async toggleActive(id: string): Promise<void> {
    const material = this.materials().find((m) => m.id === id);
    if (!material) return;
    const nowActive = !material.active;
    try {
      await this.api.patch<Material>(`/admin/materials/${id}`, { active: nowActive });
      await this.refresh();
      this.toast.show(
        nowActive ? 'Material is now available to customers' : 'Material retired — removed from customer lists',
        nowActive ? 'success' : 'info',
      );
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not update that material.'), 'danger');
    }
  }

  async createMaterial(event: Event): Promise<void> {
    event.preventDefault();
    const name = this.draftName().trim();
    const machine = this.draft.machine();
    try {
      const created = await this.api.post<Material>('/admin/materials', {
        name,
        thicknessMm: Number(this.draftThickness()),
        costPerFtCents: 0,
        costMultiplier: 1,
        // A sheet cannot exceed the bed, so the configured bed is the sane
        // starting size; rates are set on the edit pane before quoting.
        sheetWidthMm: machine.bedWidthMm,
        sheetHeightMm: machine.bedHeightMm,
        perSheetCostCents: 0,
        active: true,
      });
      this.draftName.set('');
      await this.refresh();
      this.toast.show(`${created.name} added to the catalogue`, 'success');
      this.close();
    } catch (error) {
      // The modal stays open so the operator can correct the rejected value.
      this.toast.show(errorMessage(error, 'We could not add that material.'), 'danger');
    }
  }

  async saveEdit(event: Event): Promise<void> {
    event.preventDefault();
    const id = this.editing()?.id;
    if (!id) return;
    const form = event.target as HTMLFormElement;
    try {
      await this.api.patch<Material>(`/admin/materials/${id}`, {
        name: fieldValue(form, 'edit-material-name'),
        costPerFtCents: Number(fieldValue(form, 'edit-material-cut')),
        perSheetCostCents: Number(fieldValue(form, 'edit-material-sheet')),
        costMultiplier: Number(fieldValue(form, 'edit-material-mult')),
      });
      await this.refresh();
      this.toast.show('Material updated', 'success');
      this.close();
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not save that material.'), 'danger');
    }
  }
}

/** Reads an input the approved template renders without a two-way binding. */
function fieldValue(form: HTMLFormElement, id: string): string {
  return (form.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? '';
}
