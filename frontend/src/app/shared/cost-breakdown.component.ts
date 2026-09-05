import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { BreakdownLine } from '../core/models';
import { money } from '../core/format';

@Component({
  selector: 'app-cost-breakdown',
  standalone: true,
  templateUrl: './cost-breakdown.component.html',
  styleUrl: './cost-breakdown.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CostBreakdownComponent {
  @Input({ required: true }) lines: BreakdownLine[] = [];
  @Input({ required: true }) totalCents = 0;
  @Input() subtotalCents: number | null = null;
  @Input() minimumApplied = false;
  @Input() minimumCents = 0;
  @Input() totalLabel = 'Quote total';
  readonly money = money;
}
