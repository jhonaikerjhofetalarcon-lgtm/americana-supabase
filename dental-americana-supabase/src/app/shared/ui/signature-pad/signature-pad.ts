import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

@Component({
  selector: 'app-signature-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p id="signature-help">Firma con el dedo, un lápiz digital o el ratón.</p>
    <canvas #canvas width="900" height="240" aria-label="Firma del presupuesto" aria-describedby="signature-help"
      (pointerdown)="start($event)" (pointermove)="move($event)" (pointerup)="finish()"
      (pointercancel)="finish()" (lostpointercapture)="finish()"></canvas>
    <div><span role="status">{{ signed() ? 'Firma capturada' : 'Firma pendiente' }}</span>
      <button type="button" [disabled]="disabled()" (click)="clear()">Borrar firma</button></div>`,
  styles: [`:host{display:block}p{font-size:.8rem;color:#526875}canvas{display:block;width:100%;height:160px;border:1px dashed #809ca8;border-radius:12px;background:white;touch-action:none}div{display:flex;align-items:center;justify-content:space-between;margin-top:8px;font-size:.8rem}button{background:#eff6f8;border:1px solid #cbdde4;border-radius:8px;padding:8px 12px;color:#20556a}button:disabled{opacity:.5}`],
})
export class SignaturePadComponent {
  readonly disabled = input(false);
  readonly signed = signal(false);
  readonly changed = output<string>();
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private pointer: number | null = null;
  private point(event: PointerEvent) {
    const canvas = this.canvas().nativeElement, box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) * canvas.width / box.width,
      y: (event.clientY - box.top) * canvas.height / box.height };
  }
  start(event: PointerEvent): void {
    if (this.disabled() || this.pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const canvas = this.canvas().nativeElement, context = canvas.getContext('2d');
    if (!context) return;
    this.pointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    const point = this.point(event);
    context.strokeStyle = '#163b48'; context.lineWidth = 3; context.lineCap = 'round'; context.lineJoin = 'round';
    context.beginPath(); context.moveTo(point.x, point.y);
  }
  move(event: PointerEvent): void {
    if (this.disabled() || this.pointer !== event.pointerId) return;
    const context = this.canvas().nativeElement.getContext('2d'), point = this.point(event);
    context?.lineTo(point.x, point.y); context?.stroke(); this.signed.set(true);
  }
  finish(): void {
    if (this.pointer === null) return;
    this.pointer = null;
    if (this.signed()) this.changed.emit(this.canvas().nativeElement.toDataURL('image/png'));
  }
  clear(): void {
    if (this.disabled()) return;
    const canvas = this.canvas().nativeElement;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    this.pointer = null; this.signed.set(false); this.changed.emit('');
  }
}
