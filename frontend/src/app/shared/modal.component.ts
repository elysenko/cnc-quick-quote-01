import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Presentational dialog. Openness is owned by the URL (`?modal=<name>` or
 * `?edit=<id>`) so every modal state is deep-linkable and reviewable.
 * On narrow viewports it presents as a bottom sheet.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  @Input({ required: true }) open = false;
  @Input({ required: true }) title = '';
  @Input() description = '';
  @Input() testid = 'modal';
  @Output() closed = new EventEmitter<void>();
}
