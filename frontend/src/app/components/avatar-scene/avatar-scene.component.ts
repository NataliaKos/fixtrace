/**
 * AvatarSceneComponent
 *
 * Renders a fun procedural robot avatar made from Three.js primitives.
 *
 * Animations:
 *  - Lip sync    : lower jaw drops based on audio RMS amplitude
 *  - Eye blink   : periodic random blink (~every 3-5 s)
 *  - Talking     : head nod + gentle side rock + arm swings
 *  - Listening   : head tilts side-to-side (curious robot pose)
 *  - Idle        : gentle float bob + slow head sway
 */

import {
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  ViewChild,
} from '@angular/core';
import * as THREE from 'three';

// ─── Robot colour palette ─────────────────────────────────────────────────────
const C = {
  chassis: 0xffffff,   // bright white body
  chassisDark: 0xd1d5db,  // subtle grey for joints
  accent: 0x2563eb,   // brand blue
  accentDark: 0x1d4ed8,   // deeper blue
  eyeWhite: 0xffffff,
  eyeCyan: 0x3b82f6,   // blue glowing eyes
  eyePupil: 0x0f172a,   // near-black pupil
  antennaGlow: 0x60a5fa,  // light blue ball
  specular: 0xffffff,
  dark: 0x0f172a,   // mouth interior / shadows
  chestLight: 0x3b82f6,   // blue chest indicator
};

@Component({
  selector: 'app-avatar-scene',
  standalone: true,
  template: `<canvas #canvas class="avatar-canvas"></canvas>`,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .avatar-canvas { display: block; width: 100%; height: 100%; }
  `],
})
export class AvatarSceneComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  // ── Three.js internals ─────────────────────────────────────────────────────
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private animFrameId = 0;

  // ── Robot part references ─────────────────────────────────────────────────
  private robotGroup!: THREE.Group;   // whole robot – handles float bob
  private headPivot!: THREE.Group;    // head + face – handles nod, tilt, sway
  private leftEyeContainer!: THREE.Group;
  private rightEyeContainer!: THREE.Group;
  private lowerLipMesh!: THREE.Mesh;
  private lowerLipBaseY = -0.048;     // resting y inside mouthGroup
  private leftArmPivot!: THREE.Group;
  private rightArmPivot!: THREE.Group;

  // ── Persistent lights (eye glow) ──────────────────────────────────────────
  private leftEyeLight!: THREE.PointLight;
  private rightEyeLight!: THREE.PointLight;

  // ── Animation state ────────────────────────────────────────────────────────
  private isPlaying = false;
  private isListening = false;

  // jaw / lip sync
  private jawOpen = 0;

  // eye blink
  private blinkTimer = 2.0;     // countdown to next blink
  private blinkProgress = 0;       // 0=open, peaks at 1=closed
  private blinkActive = false;

  // ── Audio analysis ─────────────────────────────────────────────────────────
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  // ── Streaming playback (Gemini Live 24 kHz PCM) ───────────────────────────
  private streamCtx: AudioContext | null = null;
  private streamAnalyser: AnalyserNode | null = null;
  private streamNextStart = 0;

  // ── Resize observer ────────────────────────────────────────────────────────
  private resizeObserver!: ResizeObserver;

  // ═══════════════════════════════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  ngAfterViewInit(): void {
    this.initThree();
    this.startRenderLoop();
    this.observeResize();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
    this.audioCtx?.close();
    this.stopStreamPlayback();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Public API – called by ChatPanelComponent
  // ═══════════════════════════════════════════════════════════════════════════

  async playAndAnimate(audioBuffer: ArrayBuffer): Promise<void> {
    if (this.audioCtx) await this.audioCtx.close();
    this.audioCtx = new AudioContext();
    const decoded = await this.audioCtx.decodeAudioData(audioBuffer);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    const source = this.audioCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(this.analyser);
    source.connect(this.audioCtx.destination);
    this.isPlaying = true;
    source.start();
    source.onended = () => { this.isPlaying = false; this.jawOpen = 0; };
  }

  startStreamPlayback(): void {
    this.stopStreamPlayback();
    this.streamCtx = new AudioContext({ sampleRate: 24000 });
    this.streamAnalyser = this.streamCtx.createAnalyser();
    this.streamAnalyser.fftSize = 256;
    this.freqData = new Uint8Array(this.streamAnalyser.frequencyBinCount);
    this.streamAnalyser.connect(this.streamCtx.destination);
    this.streamNextStart = this.streamCtx.currentTime;
    this.analyser = this.streamAnalyser;
    this.isPlaying = true;
    this.isListening = false;
  }

  queuePcmChunk(pcm: ArrayBuffer): void {
    if (!this.streamCtx || !this.streamAnalyser) return;
    const samples = new Int16Array(pcm);
    const buf = this.streamCtx.createBuffer(1, samples.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = (samples[i] ?? 0) / 32768;
    const src = this.streamCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.streamAnalyser);
    const t = Math.max(this.streamNextStart, this.streamCtx.currentTime);
    src.start(t);
    this.streamNextStart = t + buf.duration;
    console.log(`[avatar] queued PCM chunk: samples=${samples.length} duration=${buf.duration.toFixed(3)}s scheduledEnd=${this.streamNextStart.toFixed(3)}s ctxTime=${this.streamCtx.currentTime.toFixed(3)}s`);
  }

  /** Gracefully stop stream playback, waiting for queued audio to finish. */
  stopStreamPlayback(): void {
    if (!this.streamCtx) {
      this.isPlaying = false;
      this.jawOpen = 0;
      return;
    }
    const remaining = this.streamNextStart - this.streamCtx.currentTime;
    console.log(`[avatar] stopStreamPlayback called — remaining=${remaining.toFixed(3)}s`);
    if (remaining > 0.05) {
      // Let queued audio finish playing before closing
      setTimeout(() => {
        console.log(`[avatar] deferred stop — closing stream now`);
        this._closeStream();
      }, remaining * 1000 + 100);
    } else {
      this._closeStream();
    }
  }

  private _closeStream(): void {
    this.isPlaying = false;
    if (this.analyser === this.streamAnalyser) this.analyser = null;
    this.streamCtx?.close();
    this.streamCtx = null;
    this.streamAnalyser = null;
    this.streamNextStart = 0;
    this.jawOpen = 0;
  }

  /** Call when user starts/stops recording so the avatar enters listening pose. */
  setListening(listening: boolean): void {
    this.isListening = listening;
    if (listening) this.isPlaying = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Three.js setup
  // ═══════════════════════════════════════════════════════════════════════════

  private initThree(): void {
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 220;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene
    this.scene = new THREE.Scene();

    // Camera – slightly elevated, looking at robot center
    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100);
    this.camera.position.set(0, 0.25, 3.9);
    this.camera.lookAt(0, 0.1, 0);

    this.buildLighting();
    this.buildRobot();
  }

  // ── Lighting ───────────────────────────────────────────────────────────────
  private buildLighting(): void {
    // Soft ambient fill
    this.scene.add(new THREE.AmbientLight(0xdde8ff, 0.55));

    // Key light – warm top-right
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    this.scene.add(key);

    // Rim light – cool back-left
    const rim = new THREE.DirectionalLight(0x94a3ff, 0.4);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);

    // Under fill – subtle warm bounce
    const fill = new THREE.DirectionalLight(0xffe8c0, 0.2);
    fill.position.set(0, -3, 3);
    this.scene.add(fill);
  }

  // ── Robot geometry ─────────────────────────────────────────────────────────
  private buildRobot(): void {
    this.robotGroup = new THREE.Group();
    this.scene.add(this.robotGroup);

    this.buildBody();
    this.buildArms();
    this.buildNeck();
    this.buildHead();
  }

  private mat(color: number, shininess = 70, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshPhongMaterial {
    return new THREE.MeshPhongMaterial({
      color, shininess,
      specular: new THREE.Color(C.specular),
      emissive: new THREE.Color(emissive),
      emissiveIntensity,
    });
  }

  /** Torso + chest panel + LED indicator */
  private buildBody(): void {
    // Main torso
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.82, 0.66),
      this.mat(C.chassis, 80),
    );
    body.position.y = -0.62;
    this.robotGroup.add(body);

    // Chest panel recess
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.35, 0.04),
      this.mat(C.chassisDark, 40),
    );
    panel.position.set(0, -0.62, 0.345);
    this.robotGroup.add(panel);

    // Glowing chest LED
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 16, 16),
      this.mat(C.chestLight, 10, C.chestLight, 0.8),
    );
    led.position.set(0, -0.62, 0.38);
    this.robotGroup.add(led);

    // Pelvis connector bar
    const pelvis = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.12, 0.55),
      this.mat(C.chassisDark, 50),
    );
    pelvis.position.y = -1.07;
    this.robotGroup.add(pelvis);
  }

  /** Shoulder-pivoted arms */
  private buildArms(): void {
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.85, -0.24, 0);
      this.robotGroup.add(pivot);

      // Upper arm
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.09, 0.52, 10),
        this.mat(C.chassis, 70),
      );
      upper.position.y = -0.26;
      pivot.add(upper);

      // Elbow sphere
      const elbow = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 14, 14),
        this.mat(C.accent, 50),
      );
      elbow.position.y = -0.54;
      pivot.add(elbow);

      // Lower arm
      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.08, 0.42, 10),
        this.mat(C.chassis, 70),
      );
      lower.position.y = -0.77;
      pivot.add(lower);

      // Hand
      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 14, 14),
        this.mat(C.chassisDark, 60),
      );
      hand.position.y = -1.0;
      pivot.add(hand);

      if (side === -1) this.leftArmPivot = pivot;
      else this.rightArmPivot = pivot;
    }
  }

  /** Neck cylinder */
  private buildNeck(): void {
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.185, 0.22, 10),
      this.mat(C.chassisDark, 60),
    );
    neck.position.y = -0.11;
    this.robotGroup.add(neck);
  }

  /** Head with face features, antennae, ears */
  private buildHead(): void {
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = 0.56;
    this.robotGroup.add(this.headPivot);

    // ── Main head box ────────────────────────────────────────────────────────
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 1.0, 0.9),
      this.mat(C.chassis, 80),
    );
    this.headPivot.add(head);

    // Rounded-look side "cheek" panels
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.58, 0.72),
        this.mat(C.chassisDark, 50),
      );
      cheek.position.set(sx * 0.595, 0, 0);
      this.headPivot.add(cheek);
    }

    // Forehead panel (accent stripe)
    const forehead = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.15, 0.04),
      this.mat(C.accent, 40),
    );
    forehead.position.set(0, 0.37, 0.455);
    this.headPivot.add(forehead);

    // ── Eyes ─────────────────────────────────────────────────────────────────
    for (const sx of [-1, 1]) {
      const container = new THREE.Group();
      container.position.set(sx * 0.245, 0.1, 0.46);
      this.headPivot.add(container);

      // White sclera lens
      const sclera = new THREE.Mesh(
        new THREE.CylinderGeometry(0.145, 0.145, 0.055, 24),
        this.mat(C.eyeWhite, 30),
      );
      sclera.rotation.x = Math.PI / 2;
      container.add(sclera);

      // Cyan iris (emissive glow)
      const iris = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.022, 24),
        this.mat(C.eyeCyan, 10, C.eyeCyan, 1.2),
      );
      iris.rotation.x = Math.PI / 2;
      iris.position.z = 0.018;
      container.add(iris);

      // Dark pupil
      const pupil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.052, 0.022, 20),
        this.mat(C.eyePupil, 10),
      );
      pupil.rotation.x = Math.PI / 2;
      pupil.position.z = 0.028;
      container.add(pupil);

      // Point light inside eye for ambient glow
      const eyeGlow = new THREE.PointLight(C.eyeCyan, 0.6, 0.8);
      eyeGlow.position.z = 0.05;
      container.add(eyeGlow);

      if (sx === -1) { this.leftEyeContainer = container; this.leftEyeLight = eyeGlow; }
      else { this.rightEyeContainer = container; this.rightEyeLight = eyeGlow; }
    }

    // ── Mouth ────────────────────────────────────────────────────────────────
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, -0.22, 0.455);
    this.headPivot.add(mouthGroup);

    // Dark background behind lips
    const mouthBG = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.2, 0.015),
      this.mat(C.dark, 5),
    );
    mouthBG.position.z = -0.005;
    mouthGroup.add(mouthBG);

    // Upper lip (fixed)
    const upperLip = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.062, 0.04),
      this.mat(C.accent, 50),
    );
    upperLip.position.y = 0.055;
    mouthGroup.add(upperLip);

    // Lower lip (moves down for jaw-open / lip sync)
    this.lowerLipMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.062, 0.04),
      this.mat(C.accentDark, 50),
    );
    this.lowerLipMesh.position.y = this.lowerLipBaseY;
    mouthGroup.add(this.lowerLipMesh);

    // ── Ears (side decorative vents) ─────────────────────────────────────────
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.3, 0.52),
        this.mat(C.chassisDark, 40),
      );
      ear.position.set(sx * 0.59, -0.05, 0.04);
      this.headPivot.add(ear);
    }

    // ── Antennae ──────────────────────────────────────────────────────────────
    for (const sx of [-1, 1]) {
      const aPivot = new THREE.Group();
      aPivot.position.set(sx * 0.24, 0.51, 0.06);
      this.headPivot.add(aPivot);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.02, 0.32, 8),
        this.mat(C.chassisDark, 50),
      );
      pole.position.y = 0.16;
      aPivot.add(pole);

      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 14, 14),
        this.mat(C.antennaGlow, 10, C.antennaGlow, 1.0),
      );
      ball.position.y = 0.34;
      aPivot.add(ball);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Render loop
  // ═══════════════════════════════════════════════════════════════════════════

  private startRenderLoop(): void {
    const tick = () => {
      this.animFrameId = requestAnimationFrame(tick);
      const dt = this.clock.getDelta();
      const t = this.clock.getElapsedTime();

      // 1. Sample audio amplitude
      const rms = this.sampleRms();

      // 2. Jaw / lip sync
      const targetJaw = this.isPlaying ? Math.min(rms * 1.8, 0.26) : 0;
      this.jawOpen += (targetJaw - this.jawOpen) * 0.35;
      this.lowerLipMesh.position.y = this.lowerLipBaseY - this.jawOpen;

      // 3. Eye blink
      this.tickBlink(dt);

      // 4. Robot composite animations
      this.tickRobotAnimation(t, rms);

      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  /** Read RMS from whichever analyser is active; returns 0 if silent. */
  private sampleRms(): number {
    if (!this.analyser || !this.freqData) return 0;
    this.analyser.getByteTimeDomainData(this.freqData);
    let sum = 0;
    for (let i = 0; i < this.freqData.length; i++) {
      const v = (this.freqData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.freqData.length);
  }

  /** Handle periodic eye blink. */
  private tickBlink(dt: number): void {
    const BLINK_SPEED = 8;   // 1/s – governs how fast lids close/open

    if (!this.blinkActive) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkActive = true;
        this.blinkProgress = 0;
        // Next blink in 2.5–5 s
        this.blinkTimer = 2.5 + Math.random() * 2.5;
      }
    } else {
      // Blink curve: 0→1 (close) then 1→0 (open), triangle wave
      this.blinkProgress += dt * BLINK_SPEED;
      const eyeOpen = this.blinkProgress < 1
        ? 1 - this.blinkProgress          // closing
        : this.blinkProgress - 1;         // opening (clamp below)

      const scaleY = Math.max(0.05, Math.min(eyeOpen, 1));
      this.leftEyeContainer.scale.y = scaleY;
      this.rightEyeContainer.scale.y = scaleY;
      // dim eye glow while closed
      const g = scaleY;
      this.leftEyeLight.intensity = g * 0.6;
      this.rightEyeLight.intensity = g * 0.6;

      if (this.blinkProgress >= 2) {
        this.blinkActive = false;
        this.leftEyeContainer.scale.y = 1;
        this.rightEyeContainer.scale.y = 1;
        this.leftEyeLight.intensity = 0.6;
        this.rightEyeLight.intensity = 0.6;
      }
    }
  }

  /**
   * Drive the robot's body language:
   *  - Talking  → head nods + slight rock, arms swing with amplitude
   *  - Listening → head tilts side-to-side (dog-curious pose)
   *  - Idle     → gentle float + slow head sway
   */
  private tickRobotAnimation(t: number, rms: number): void {
    // ── Float bob (always on) ─────────────────────────────────────────────────
    this.robotGroup.position.y = Math.sin(t * 1.1) * 0.04;

    if (this.isPlaying) {
      // ── TALKING ──────────────────────────────────────────────────────────────
      const amp = 0.25 + rms * 2.5;     // amplitude modifier

      // Head nod (pitch) – faster when more amplitude
      this.headPivot.rotation.x = Math.sin(t * 4.5) * 0.07 * amp;
      // Gentle side rock (roll)
      this.headPivot.rotation.z = Math.sin(t * 3.0) * 0.035 * amp;
      // Very slight yaw
      this.headPivot.rotation.y = Math.sin(t * 2.2) * 0.04 * amp;

      // Arms swing – out of phase for natural look
      this.leftArmPivot.rotation.x = Math.sin(t * 3.5) * 0.22 * amp;
      this.rightArmPivot.rotation.x = Math.sin(t * 3.5 + Math.PI) * 0.22 * amp;
      // Slight outward flare
      this.leftArmPivot.rotation.z = -0.12 + Math.sin(t * 2.0) * 0.06 * amp;
      this.rightArmPivot.rotation.z = 0.12 + Math.sin(t * 2.0 + Math.PI) * 0.06 * amp;

    } else if (this.isListening) {
      // ── LISTENING – head tilts side-to-side ──────────────────────────────────
      // Very slow oscillation (period ≈ 4 s per full cycle)
      this.headPivot.rotation.z = Math.sin(t * 0.8) * 0.2;
      // Slight forward lean (curious)
      this.headPivot.rotation.x = 0.05 + Math.sin(t * 0.5) * 0.03;
      this.headPivot.rotation.y = Math.sin(t * 0.6) * 0.04;

      // Arms relaxed at sides – slowly drift back to neutral
      this.leftArmPivot.rotation.x += (-0.05 - this.leftArmPivot.rotation.x) * 0.05;
      this.rightArmPivot.rotation.x += (-0.05 - this.rightArmPivot.rotation.x) * 0.05;
      this.leftArmPivot.rotation.z += (-0.08 - this.leftArmPivot.rotation.z) * 0.05;
      this.rightArmPivot.rotation.z += (0.08 - this.rightArmPivot.rotation.z) * 0.05;

    } else {
      // ── IDLE ─────────────────────────────────────────────────────────────────
      // Slow ambient head sway
      this.headPivot.rotation.y = Math.sin(t * 0.5) * 0.12;
      this.headPivot.rotation.x += (0 - this.headPivot.rotation.x) * 0.03;
      this.headPivot.rotation.z += (0 - this.headPivot.rotation.z) * 0.03;

      // Arms gently drift to sides
      this.leftArmPivot.rotation.x += (0 - this.leftArmPivot.rotation.x) * 0.04;
      this.rightArmPivot.rotation.x += (0 - this.rightArmPivot.rotation.x) * 0.04;
      this.leftArmPivot.rotation.z += (-0.08 - this.leftArmPivot.rotation.z) * 0.04;
      this.rightArmPivot.rotation.z += (0.08 - this.rightArmPivot.rotation.z) * 0.04;
    }
  }

  // ── Resize handling ────────────────────────────────────────────────────────
  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement!);
  }

  private onResize(): void {
    const parent = this.canvasRef.nativeElement.parentElement!;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
