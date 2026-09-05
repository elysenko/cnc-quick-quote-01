import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';
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
  private readonly toast = inject(ToastService);

  readonly credentials = signal<ServiceCredential[]>([
    { id: 'svc_pg', service: 'PostgreSQL', key: 'DATABASE_URL', description: 'Primary datastore connection string.', maskedValue: 'postgresql://••••/cnc', configured: true, kind: 'backing-service' },
    { id: 'svc_minio', service: 'MinIO', key: 'S3_ENDPOINT', description: 'Object storage endpoint for drawings and receipts.', maskedValue: 'https://minio.••••:9000', configured: true, kind: 'backing-service' },
    { id: 'svc_llm', service: 'LLM', key: 'LLM_API_BASE', description: 'Provisioned model endpoint. No feature consumes it yet.', maskedValue: null, configured: false, kind: 'backing-service' },

    { id: 'int_stripe', service: 'Stripe SDK (Python)', key: 'STRIPE_SDK_PYTHON_API_KEY', description: 'Creates hosted Checkout sessions and verifies payment webhooks.', maskedValue: null, configured: false, kind: 'integration' },
    { id: 'int_resend', service: 'Resend API (Python SDK)', key: 'RESEND_API_PYTHON_SDK_API_KEY', description: 'Sends the order confirmation email with the PDF receipt.', maskedValue: null, configured: false, kind: 'integration' },
    { id: 'int_minio', service: 'MinIO / S3 API (boto3)', key: 'MINIO_S3_API_BOTO3_API_KEY', description: 'Reads and writes CAD drawings and PDF receipts.', maskedValue: null, configured: false, kind: 'integration' },
    { id: 'int_pg', service: 'PostgreSQL', key: 'POSTGRESQL_API_KEY', description: 'Database credential used by the API service.', maskedValue: null, configured: false, kind: 'integration' },
    { id: 'int_redis', service: 'Redis', key: 'REDIS_API_KEY', description: 'Backs the API rate-limit counters.', maskedValue: null, configured: false, kind: 'integration' },
  ]);

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

  startEdit(id: string): void { this.editingId.set(id); }
  cancel(): void { this.editingId.set(null); }

  save(id: string, value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
      this.toast.show('Enter a value before saving', 'danger');
      return;
    }
    this.credentials.update((list) =>
      list.map((c) =>
        c.id === id
          ? { ...c, configured: true, maskedValue: `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}` }
          : c,
      ),
    );
    this.editingId.set(null);
    this.toast.show('Credential saved', 'success');
  }
}
