import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { QuoteDraftService } from '../../core/quote-draft.service';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../shared/toast.service';
import { ApiClient, errorMessage } from '../../core/api';
import { Drawing } from '../../core/models';
import { bytes, mm } from '../../core/format';

type UploadState = 'idle' | 'uploading' | 'parsed' | 'error';

/** API shape of a stored drawing; `createdAt` becomes `uploadedAt` in the UI. */
interface DrawingResponse extends Omit<Drawing, 'uploadedAt'> {
  createdAt: string;
}

@Component({
  selector: 'app-upload-step',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './upload-step.component.html',
  styleUrl: './upload-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadStepComponent implements OnInit {
  private readonly draft = inject(QuoteDraftService);
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly drawing = this.draft.drawing;
  readonly uploads = this.draft.uploads;
  readonly progress = signal(0);
  readonly dragOver = signal(false);
  readonly parseError = signal<string | null>(null);
  /** Name of the file currently in flight, shown on the progress panel. */
  readonly uploadingName = signal('your drawing');
  readonly bytes = bytes;
  readonly mm = mm;

  /** `?state=` keeps every upload state deep-linkable. */
  readonly state = computed<UploadState>(() => {
    const q = this.query()?.get('state');
    if (q === 'idle' || q === 'uploading' || q === 'error') return q;
    return this.drawing() ? 'parsed' : 'idle';
  });

  readonly cutLengthLabel = computed(() => mm(this.drawing()?.cutLengthMm ?? 0, 1));

  ngOnInit(): void {
    void this.draft.loadReferenceData();
  }

  private setState(state: UploadState | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { state },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Opens the file picker and uploads the chosen DXF: the API parses it and the
   * geometry it returns drives every later step of the wizard.
   */
  chooseFile(): void {
    // The approved markup has no <input type="file">, so one is created here
    // rather than editing the design-owned template.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.uploads().allowedExtensions;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.uploadFile(file);
    });
    input.click();
  }

  async uploadFile(file: File): Promise<void> {
    this.parseError.set(null);
    this.progress.set(0);
    this.uploadingName.set(file.name);
    this.setState('uploading');

    const form = new FormData();
    form.append('file', file, file.name);

    try {
      const response = await this.api.uploadWithProgress<DrawingResponse>(
        '/drawings',
        form,
        (percent) => this.progress.set(percent),
      );
      this.draft.setDrawing({ ...response, uploadedAt: response.createdAt });
      this.setState(null);
      this.toast.show(`${file.name} parsed — ${mm(response.cutLengthMm, 1)} of cut path`, 'success');
    } catch (error) {
      this.parseError.set(errorMessage(error, 'We could not read that drawing.'));
      this.setState('error');
    }
  }

  /** Deep link to the rejected-file state; kept addressable for review. */
  showParseError(): void {
    this.setState('error');
  }

  reset(): void {
    this.parseError.set(null);
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
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.uploadFile(file);
  }
}
