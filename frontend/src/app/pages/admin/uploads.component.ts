import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { ToastService } from '../../shared/toast.service';
import { UploadSettings } from '../../core/models';

@Component({
  selector: 'app-admin-uploads',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './uploads.component.html',
  styleUrl: './uploads.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadsComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly toast = inject(ToastService);

  readonly uploads = this.draft.uploads;

  setText(key: keyof UploadSettings, raw: string): void {
    this.uploads.update((u) => ({ ...u, [key]: raw }));
  }

  setNumber(key: keyof UploadSettings, raw: string): void {
    const value = Number(raw);
    if (Number.isNaN(value)) return;
    this.uploads.update((u) => ({ ...u, [key]: value }));
  }

  save(event: Event): void {
    event.preventDefault();
    this.toast.show('Upload limits saved — applied to the next upload', 'success');
  }
}
