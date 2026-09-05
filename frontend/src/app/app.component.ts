import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './shared/toast-host.component';
import { BrandingService } from './core/branding.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly branding = inject(BrandingService);

  constructor() {
    // Publishes branding tokens onto :root. In production this is driven by the
    // public `branding` query resolved during app initialisation.
    this.branding.apply({});
  }
}
