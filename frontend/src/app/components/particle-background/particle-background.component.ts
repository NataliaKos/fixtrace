import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  NgZone,
} from '@angular/core';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  opacity: number;
  // base velocity (before cursor influence)
  baseVx: number;
  baseVy: number;
}

@Component({
  selector: 'app-particle-background',
  standalone: true,
  template: `<canvas #canvas class="particle-canvas"></canvas>`,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
      }
      .particle-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }
    `,
  ],
})
export class ParticleBackgroundComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animFrameId = 0;
  private mouseX = -9999;
  private mouseY = -9999;
  private dpr = 1;

  private readonly PARTICLE_COUNT = 120;
  private readonly CURSOR_RADIUS = 180; // px – influence zone
  private readonly CURSOR_STRENGTH = 0.045; // attraction multiplier
  private readonly FRICTION = 0.97;

  private readonly COLORS = [
    // matching the confetti palette from the Antigravity page
    'rgba(168, 85, 247, A)',  // purple
    'rgba(236, 72, 153, A)',  // pink
    'rgba(59, 130, 246, A)',  // blue
    'rgba(251, 146, 60, A)',  // orange
    'rgba(250, 204, 21, A)',  // yellow
    'rgba(52, 211, 153, A)',  // emerald
    'rgba(239, 68, 68, A)',   // red
    'rgba(99, 102, 241, A)',  // indigo
  ];

  private onMouseMove = (e: MouseEvent) => {
    this.mouseX = e.clientX * this.dpr;
    this.mouseY = e.clientY * this.dpr;
  };

  private onResize = () => this.resize();

  constructor(private zone: NgZone) {}

  ngOnInit(): void {
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    this.initParticles();

    // Run the animation loop outside Angular zone for performance
    this.zone.runOutsideAngular(() => this.animate());
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('resize', this.onResize);
  }

  private resize(): void {
    const canvas = this.canvasRef.nativeElement;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * this.dpr;
    canvas.height = window.innerHeight * this.dpr;
  }

  private initParticles(): void {
    const w = this.canvasRef.nativeElement.width;
    const h = this.canvasRef.nativeElement.height;

    this.particles = Array.from({ length: this.PARTICLE_COUNT }, () => {
      const vx = (Math.random() - 0.5) * 0.6;
      const vy = (Math.random() - 0.5) * 0.6;
      const opacity = 0.25 + Math.random() * 0.55;
      const colorTemplate =
        this.COLORS[Math.floor(Math.random() * this.COLORS.length)];
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx,
        vy,
        baseVx: vx,
        baseVy: vy,
        radius: (1.5 + Math.random() * 3) * this.dpr,
        color: colorTemplate.replace('A', opacity.toFixed(2)),
        opacity,
      };
    });
  }

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);

    const { ctx, particles } = this;
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.width;
    const h = canvas.height;
    const cursorR = this.CURSOR_RADIUS * this.dpr;
    const strength = this.CURSOR_STRENGTH;

    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      // Cursor attraction
      const dx = this.mouseX - p.x;
      const dy = this.mouseY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < cursorR && dist > 0) {
        const force = ((cursorR - dist) / cursorR) * strength;
        p.vx += dx / dist * force;
        p.vy += dy / dist * force;
      }

      // Apply friction to keep motion gentle
      p.vx *= this.FRICTION;
      p.vy *= this.FRICTION;

      // Ensure particles always retain a minimum drift
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed < 0.15) {
        p.vx += p.baseVx * 0.05;
        p.vy += p.baseVy * 0.05;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Wrap edges
      if (p.x < -10) p.x = w + 10;
      else if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      else if (p.y > h + 10) p.y = -10;

      // Draw
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
  };
}
