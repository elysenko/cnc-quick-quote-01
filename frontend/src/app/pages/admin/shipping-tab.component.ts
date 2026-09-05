import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ModalComponent } from '../../shared/modal.component';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';
import { ApiClient, errorMessage } from '../../core/api';
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
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly methods = signal<ShippingMethod[]>([]);

  readonly money = money;
  readonly showNew = computed(() => this.query()?.get('modal') === 'shipping');
  readonly newName = signal('');
  readonly newCost = signal('25.00');

  constructor() {
    void this.load();
  }

  open(): void { this.patch({ modal: 'shipping' }); }
  close(): void { this.patch({ modal: null }); }

  private patch(queryParams: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  private async load(): Promise<void> {
    try {
      this.methods.set(await this.api.get<ShippingMethod[]>('/admin/shipping-methods'));
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not load the shipping methods.'), 'danger');
    }
  }

  async toggle(id: string): Promise<void> {
    const method = this.methods().find((m) => m.id === id);
    if (!method) return;
    const active = !method.active;
    try {
      await this.api.patch<ShippingMethod>(`/admin/shipping-methods/${id}`, { active });
      await this.load();
      this.toast.show(active ? 'Method offered at checkout' : 'Method hidden from checkout', 'info');
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not update that method.'), 'danger');
    }
  }

  async create(event: Event): Promise<void> {
    event.preventDefault();
    const name = this.newName().trim();
    try {
      const created = await this.api.post<ShippingMethod>('/admin/shipping-methods', {
        name,
        kind: 'flat',
        costCents: Math.round(Number(this.newCost()) * 100),
        // The approved form captures no lead time; 0 reads as "not stated"
        // until it is set, rather than inventing a delivery promise.
        etaDays: 0,
        active: true,
      });
      this.newName.set('');
      await this.load();
      this.toast.show(`${created.name} added`, 'success');
      this.close();
    } catch (error) {
      this.toast.show(errorMessage(error, 'We could not add that method.'), 'danger');
    }
  }
}
