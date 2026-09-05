import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { IconComponent } from '../../shared/icon.component';
import { bytes, mm } from '../../core/format';

type UploadState = 'idle' | 'uploading' | 'parsed' | 'error';

@Component({
  selector: 'app-upload-step',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './upload-step.component.html',
  styleUrl: './upload-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadStepComponent {
  private readonly draft = inject(QuoteDraftService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly drawing = this.draft.drawing;
  readonly uploads = this.draft.uploads;
  readonly progress = signal(0);
  readonly dragOver = signal(false);
  readonly bytes = bytes;
  readonly mm = mm;

  /** `?state=` keeps every upload state deep-linkable for review. */
  readonly state = computed<UploadState>(() => {
    const q = this.query()?.get('state');
    if (q === 'idle' || q === 'uploading' || q === 'error') return q;
    return this.drawing() ? 'parsed' : 'idle';
  });

  readonly cutLengthLabel = computed(() => mm(this.drawing()?.cutLengthMm ?? 0, 1));

  private setState(state: UploadState | null): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { state },
      queryParamsHandling: 'merge',
    });
  }

  simulateUpload(): void {
    this.setState('uploading');
    this.progress.set(0);
    const timer = setInterval(() => {
      this.progress.update((p) => Math.min(p + 12, 100));
      if (this.progress() >= 100) {
        clearInterval(timer);
        this.setState(null);
      }
    }, 90);
  }

  showParseError(): void {
    this.setState('error');
  }

  reset(): void {
    this.setState('idle');
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(): void {
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.simulateUpload();
  }
}
