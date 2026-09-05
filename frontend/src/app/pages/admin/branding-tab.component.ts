import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { BrandingService } from '../../core/branding.service';
import { ToastService } from '../../shared/toast.service';
import { errorMessage } from '../../core/api';

@Component({
  selector: 'app-admin-branding-tab',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './branding-tab.component.html',
  styleUrl: './branding-tab.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandingTabComponent {
  private readonly service = inject(BrandingService);
  private readonly toast = inject(ToastService);
  readonly branding = this.service.branding;

  /** Applies each keystroke to the shell so the preview is the real thing. */
  update(key: 'companyName' | 'tagline' | 'logoMark' | 'primaryColor' | 'accentColor', value: string): void {
    this.service.apply({ [key]: value });
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    try {
      await this.service.save(this.branding());
      this.toast.show('Branding saved — applied across the site and emails', 'success');
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not save the branding.'), 'danger');
    }
  }
}
