import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { BrandingService } from '../../core/branding.service';
import { ToastService } from '../../shared/toast.service';

@Component({
  selector: 'app-admin-contact-tab',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './contact-tab.component.html',
  styleUrl: './contact-tab.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactTabComponent {
  private readonly service = inject(BrandingService);
  private readonly toast = inject(ToastService);
  readonly branding = this.service.branding;

  update(key: 'supportEmail' | 'supportPhone', value: string): void {
    this.service.apply({ [key]: value });
  }

  save(event: Event): void {
    event.preventDefault();
    this.toast.show('Contact details saved', 'success');
  }
}
