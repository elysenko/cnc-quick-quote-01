import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './shared/toast-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  // Branding is resolved by the APP_INITIALIZER in app.config.ts, before this
  // component renders, so there is no unbranded first paint to correct here.
}
