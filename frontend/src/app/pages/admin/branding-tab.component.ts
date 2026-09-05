import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { BrandingService } from '../../core/branding.service';
import { ToastService } from '../../shared/toast.service';

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

  update(key: 'companyName' | 'tagline' | 'logoMark' | 'primaryColor' | 'accentColor', value: string): void {
    this.service.apply({ [key]: value });
  }

  save(event: Event): void {
    event.preventDefault();
    this.toast.show('Branding saved — applied across the site and emails', 'success');
  }
}
