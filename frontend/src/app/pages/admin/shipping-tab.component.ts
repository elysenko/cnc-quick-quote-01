import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../shared/modal.component';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';
import { ShippingMethod } from '../../core/models';
import { money } from '../../core/format';

@Component({
  selector: 'app-admin-shipping-tab',
  standalone: true,
  imports: [ModalComponent, IconComponent],
  templateUrl: './shipping-tab.component.html',
  styleUrl: './shipping-tab.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingTabComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly methods = signal<ShippingMethod[]>([
    { id: 'ship_1', name: 'Standard freight', kind: 'flat', costCents: 2400, etaDays: 5, active: true },
    { id: 'ship_2', name: 'Per-sheet pallet freight', kind: 'per_sheet', costCents: 1800, etaDays: 3, active: true },
    { id: 'ship_3', name: 'Workshop collection', kind: 'flat', costCents: 0, etaDays: 2, active: true },
    { id: 'ship_4', name: 'Overnight courier', kind: 'flat', costCents: 8900, etaDays: 1, active: false },
  ]);

  readonly money = money;
  readonly showNew = computed(() => this.query()?.get('modal') === 'shipping');
  readonly newName = signal('');
  readonly newCost = signal('25.00');

  open(): void { this.patch({ modal: 'shipping' }); }
  close(): void { this.patch({ modal: null }); }

  private patch(queryParams: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  toggle(id: string): void {
    let active = false;
    this.methods.update((list) =>
      list.map((m) => {
        if (m.id !== id) return m;
        active = !m.active;
        return { ...m, active };
      }),
    );
    this.toast.show(active ? 'Method offered at checkout' : 'Method hidden from checkout', 'info');
  }

  create(event: Event): void {
    event.preventDefault();
    const name = this.newName().trim() || 'New shipping method';
    this.methods.update((list) => [
      ...list,
      {
        id: `ship_${list.length + 1}`,
        name,
        kind: 'flat',
        costCents: Math.round(Number(this.newCost()) * 100) || 0,
        etaDays: 4,
        active: true,
      },
    ]);
    this.newName.set('');
    this.toast.show(`${name} added`, 'success');
    this.close();
  }
}
