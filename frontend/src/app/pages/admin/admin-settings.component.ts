import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';
import { ApiClient, errorMessage } from '../../core/api';
import { ServiceCredential } from '../../core/models';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent {
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);

  /** The live catalogue: one row per backing service and per integration. */
  readonly credentials = signal<ServiceCredential[]>([]);

  readonly backingServices = computed(() => this.credentials().filter((c) => c.kind === 'backing-service'));
  readonly integrations = computed(() => this.credentials().filter((c) => c.kind === 'integration'));

  readonly unconfiguredIntegrations = computed(() =>
    this.integrations().filter((c) => !c.configured).map((c) => c.service),
  );

  readonly bannerText = computed(() => {
    const names = this.unconfiguredIntegrations();
    return names.length ? `The following need credentials to activate: ${names.join(', ')}.` : '';
  });

  readonly editingId = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.credentials.set(await this.api.get<ServiceCredential[]>('/admin/credentials'));
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not load the service credentials.'), 'danger');
    }
  }

  startEdit(id: string): void { this.editingId.set(id); }
  cancel(): void { this.editingId.set(null); }

  async save(id: string, value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) {
      this.toast.show('Enter a value before saving', 'danger');
      return;
    }
    const credential = this.credentials().find((c) => c.id === id);
    if (!credential) return;
    try {
      // The response is the refreshed catalogue, already masked.
      this.credentials.set(
        await this.api.patch<ServiceCredential[]>('/admin/credentials', {
          key: credential.key,
          value: trimmed,
        }),
      );
      this.editingId.set(null);
      this.toast.show('Credential saved', 'success');
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not save that credential.'), 'danger');
    }
  }
}
