import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type IconName =
  | 'plus' | 'doc' | 'box' | 'user' | 'sliders' | 'upload' | 'bend' | 'grid'
  | 'check' | 'alert' | 'chevron' | 'trash' | 'play' | 'stop' | 'download'
  | 'card' | 'truck' | 'search' | 'lock' | 'mail' | 'palette' | 'rotate';

@Component({
  selector: 'app-icon',
  standalone: true,
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  @Input({ required: true }) name!: IconName;
  @Input() size = 18;
}
