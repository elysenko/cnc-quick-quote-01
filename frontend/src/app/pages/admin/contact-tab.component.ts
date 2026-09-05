import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon.component';
import { BrandingService } from '../../core/branding.service';
import { ToastService } from '../../shared/toast.service';
import { errorMessage } from '../../core/api';

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

  async save(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    // The address textarea is rendered without a binding, so its lines are read
    // straight off the submitted form.
    const textarea = form.querySelector('#contact-address') as HTMLTextAreaElement | null;
    const addressLines = (textarea?.value ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    try {
      await this.service.saveContact({ ...this.branding(), addressLines });
      this.toast.show('Contact details saved', 'success');
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not save the contact details.'), 'danger');
    }
  }
}
