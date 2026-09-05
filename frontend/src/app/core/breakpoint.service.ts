import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * Minimal viewport observer. Kept dependency-free on purpose: the deploy image
 * prebakes node_modules for the template's exact dependency set, so adding
 * @angular/cdk just for BreakpointObserver would cost a full cold install.
 */
@Injectable({ providedIn: 'root' })
export class BreakpointService {
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly query = this.doc.defaultView?.matchMedia('(max-width: 768px)') ?? null;

  readonly isHandset = signal<boolean>(this.query?.matches ?? false);

  constructor() {
    if (!this.query) return;
    const onChange = (e: MediaQueryListEvent) => this.isHandset.set(e.matches);
    this.query.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => this.query?.removeEventListener('change', onChange));
  }
}
