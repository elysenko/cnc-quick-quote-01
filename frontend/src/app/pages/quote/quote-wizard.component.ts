import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { money } from '../../core/format';

@Component({
  selector: 'app-quote-wizard',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './quote-wizard.component.html',
  styleUrl: './quote-wizard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteWizardComponent {
  private readonly draft = inject(QuoteDraftService);

  readonly steps = [
    { index: 1, label: 'Upload drawing', short: 'Upload', path: 'upload', testid: 'step-upload' },
    { index: 2, label: 'Mark bends', short: 'Bends', path: 'bends', testid: 'step-bends' },
    { index: 3, label: 'Material & quantity', short: 'Configure', path: 'configure', testid: 'step-configure' },
    { index: 4, label: 'Quote & work bed', short: 'Result', path: 'result', testid: 'step-result' },
  ];

  readonly drawing = this.draft.drawing;
  readonly price = this.draft.price;
  readonly money = money;
}
