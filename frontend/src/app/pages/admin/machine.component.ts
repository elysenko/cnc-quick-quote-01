import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { WorkBedCanvasComponent } from '../../canvas/work-bed-canvas.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { ToastService } from '../../shared/toast.service';
import { ApiClient, errorMessage } from '../../core/api';
import { MachineSettings } from '../../core/models';

@Component({
  selector: 'app-admin-machine',
  standalone: true,
  imports: [IconComponent, WorkBedCanvasComponent],
  templateUrl: './machine.component.html',
  styleUrl: './machine.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineComponent {
  private readonly api = inject(ApiClient);
  private readonly draft = inject(QuoteDraftService);
  private readonly toast = inject(ToastService);

  readonly machine = this.draft.machine;
  readonly nesting = this.draft.nesting;
  readonly polylines = this.draft.partPolylines;
  readonly bends = this.draft.bends;

  constructor() {
    void this.draft.loadReferenceData();
  }

  set(key: keyof MachineSettings, raw: string): void {
    const value = Number(raw);
    if (Number.isNaN(value)) return;
    this.machine.update((m) => ({ ...m, [key]: value }));
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    try {
      await this.api.put<unknown>('/admin/settings/machine', this.machine());
      await this.draft.loadReferenceData();
      this.toast.show('Machine settings saved — applied to the next quote', 'success');
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not save the machine settings.'), 'danger');
    }
  }
}
