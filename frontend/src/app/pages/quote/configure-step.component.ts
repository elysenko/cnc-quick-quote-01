import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { CostBreakdownComponent } from '../../shared/cost-breakdown.component';
import { IconComponent } from '../../shared/icon.component';
import { money, mm, percent } from '../../core/format';

@Component({
  selector: 'app-configure-step',
  standalone: true,
  imports: [RouterLink, CostBreakdownComponent, IconComponent],
  templateUrl: './configure-step.component.html',
  styleUrl: './configure-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigureStepComponent {
  private readonly draft = inject(QuoteDraftService);

  readonly materials = computed(() => this.draft.materials().filter((m) => m.active));
  readonly materialId = this.draft.materialId;
  readonly material = this.draft.material;
  readonly quantity = this.draft.quantity;
  readonly uploads = this.draft.uploads;
  readonly nesting = this.draft.nesting;
  readonly price = this.draft.price;
  readonly bends = this.draft.bends;
  readonly pricing = this.draft.pricing;

  readonly quantityError = signal<string | null>(null);
  readonly money = money;
  readonly mm = mm;
  readonly percent = percent;

  readonly perSheet = computed(() => {
    const n = this.nesting();
    return n.cols * n.rows;
  });

  selectMaterial(id: string): void {
    this.draft.materialId.set(id);
  }

  setQuantity(raw: string): void {
    const limits = this.uploads();
    const value = Number(raw);
    if (!raw.trim() || Number.isNaN(value)) {
      this.quantityError.set(`Enter a quantity between ${limits.quantityMin} and ${limits.quantityMax}.`);
      return;
    }
    if (value < limits.quantityMin || value > limits.quantityMax) {
      this.quantityError.set(`Quantity must be between ${limits.quantityMin} and ${limits.quantityMax}.`);
      return;
    }
    this.quantityError.set(null);
    this.draft.setQuantity(Math.round(value));
  }

  bump(delta: number): void {
    const limits = this.uploads();
    const next = Math.min(limits.quantityMax, Math.max(limits.quantityMin, this.quantity() + delta));
    this.quantityError.set(null);
    this.draft.setQuantity(next);
  }
}
