import {
  Application,
  CameraFrame,
  Color,
  DEVICETYPE_WEBGL2,
  DEVICETYPE_WEBGPU,
  DISPLAYFORMAT_LDR,
  Entity,
  FILLMODE_FILL_WINDOW,
  RESOLUTION_AUTO,
  SSAOTYPE_COMBINE,
  SSAOTYPE_NONE,
  TONEMAP_ACES,
  createGraphicsDevice,
  revision,
  type GraphicsDevice,
  type Texture,
} from 'playcanvas';
import { CAMERA, QUALITY_PROFILES, WORLD, type QualityProfile } from '../config';
import { AdaptiveResolution, type AdaptiveSnapshot } from './adaptive';
import { Emitter } from './emitter';
import type { Settings } from './settings';

export interface EngineEvents extends Record<string, unknown> {
  resize: { width: number; height: number };
  resolution: { scale: number; adaptive: AdaptiveSnapshot };
  contextlost: undefined;
  contextrestored: undefined;
}

export interface GraphicsCapabilities {
  backend: string;
  webgpu: boolean;
  webgl2: boolean;
  instancing: boolean;
  maxTextureSize: number;
  maxAnisotropy: number;
  maxSamples: number;
}

export interface FramePerformance {
  renderer: string;
  fps: number;
  frameMs: number;
  cpuMs: number;
  renderMs: number;
  drawCalls: number;
  primitives: number;
  vramMb: number;
  resolutionScale: number;
  adaptive: AdaptiveSnapshot;
}

/**
 * Owns the PlayCanvas graphics device, application, camera and HDR camera frame.
 * Device creation prefers WebGPU and falls back to WebGL 2 automatically.
 */
export class Engine extends Emitter<EngineEvents> {
  readonly canvas: HTMLCanvasElement;
  app!: Application;
  device!: GraphicsDevice;
  cameraEntity!: Entity;
  frame!: CameraFrame;
  rendererLabel = 'WebGL 2';
  capabilities: GraphicsCapabilities = {
    backend: 'WebGL 2',
    webgpu: false,
    webgl2: true,
    instancing: true,
    maxTextureSize: 4096,
    maxAnisotropy: 1,
    maxSamples: 1,
  };
  readonly version = revision;
  readonly adaptive = new AdaptiveResolution();
  private lastFrameStats: FramePerformance | null = null;

  private resizeTimer = 0;
  private started = false;
  private readonly resizeHandler = (): void => {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.resize(), 90);
  };
  private readonly contextLostHandler?: (event: Event) => void;
  private readonly contextRestoredHandler?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    super();
    this.canvas = canvas;
    this.contextLostHandler = (event: Event): void => {
      event.preventDefault();
      this.emit('contextlost', undefined);
    };
    this.contextRestoredHandler = (): void => this.emit('contextrestored', undefined);
  }

  async init(settings: Settings): Promise<void> {
    const profile = QUALITY_PROFILES[settings.quality];
    const device = await this.createCompatibleDevice();
    this.device = device;
    this.rendererLabel = device.isWebGPU ? 'WebGPU' : 'WebGL 2';
    this.capabilities = {
      backend: this.rendererLabel,
      webgpu: device.isWebGPU,
      webgl2: device.isWebGL2,
      instancing: device.supportsInstancing,
      maxTextureSize: device.maxTextureSize,
      maxAnisotropy: device.maxAnisotropy,
      maxSamples: device.maxSamples,
    };
    device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap);

    this.app = new Application(this.canvas, { graphicsDevice: device, devtools: true });
    this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(RESOLUTION_AUTO);

    // Scene-wide defaults. Tone mapping and HDR composition belong to the camera frame.
    this.app.scene.ambientLight = new Color(0.07, 0.1, 0.12);
    this.app.scene.exposure = 1.0;
    this.app.scene.skyboxIntensity = 1;
    this.app.scene.fog.type = 'linear';
    this.app.scene.fog.color = new Color(...WORLD.fogColor);
    this.app.scene.fog.start = 90;
    this.app.scene.fog.end = profile.drawDistance * 1.35;

    this.cameraEntity = new Entity('main-camera');
    this.cameraEntity.addComponent('camera', {
      clearColor: new Color(0.24, 0.32, 0.34),
      fov: CAMERA.fov,
      nearClip: 0.1,
      farClip: 1400,
      priority: 0,
    });
    this.app.root.addChild(this.cameraEntity);
    this.cameraEntity.setPosition(0, 4, 14);

    this.frame = new CameraFrame(this.app, this.cameraEntity.camera!);
    this.frame.rendering.toneMapping = TONEMAP_ACES;
    this.frame.rendering.renderTargetScale = 1;
    this.frame.rendering.samples = Math.max(1, Math.min(profile.samples, device.maxSamples || 1));
    this.frame.rendering.sharpness = 0.06;
    this.frame.bloom.threshold = 1.02;
    this.frame.bloom.blurLevel = profile.bloomLevel;
    this.frame.bloom.intensity = 0;
    this.frame.vignette.inner = 0.58;
    this.frame.vignette.outer = 1.3;
    this.frame.vignette.curvature = 0.7;
    this.frame.vignette.intensity = 0;
    this.frame.grading.saturation = 1.04;
    this.frame.grading.contrast = 1.02;
    this.frame.grading.brightness = 1.0;
    this.frame.colorEnhance.enabled = false;
    this.frame.ssao.enabled = false;
    this.frame.ssao.type = SSAOTYPE_NONE;
    this.applySettings(settings);

    this.bindResize();
    this.bindContextLoss();
  }

  applySettings(settings: Settings): void {
    if (!this.frame || !this.app) return;
    const profile = QUALITY_PROFILES[settings.quality];
    this.device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap);
    this.frame.rendering.samples = Math.max(1, Math.min(profile.samples, this.device.maxSamples || 1));
    this.frame.rendering.sharpness = settings.adaptiveResolution ? 0.14 : 0.05;
    this.frame.bloom.intensity = settings.bloom && profile.bloom ? 0.055 : 0;
    this.frame.bloom.blurLevel = profile.bloomLevel;
    this.frame.vignette.intensity = settings.vignette ? 0.32 : 0;
    this.frame.grading.saturation = 1.04;
    this.frame.grading.contrast = 1.025;

    // SSAO only works when its type is enabled; setting `enabled` alone leaves it
    // at SSAOTYPE_NONE, which silently rendered nothing in the previous build.
    const ssao = this.frame.ssao;
    ssao.type = profile.ssao ? SSAOTYPE_COMBINE : SSAOTYPE_NONE;
    ssao.enabled = profile.ssao;
    ssao.blurEnabled = true;
    ssao.randomize = false;
    if (profile.ssao) {
      ssao.radius = 24;
      ssao.intensity = 0.36;
      ssao.samples = profile.ssaoSamples;
      ssao.power = 4.5;
      ssao.minAngle = 8;
    }

    const enhance = this.frame.colorEnhance;
    enhance.enabled = profile.colorEnhance;
    if (profile.colorEnhance) {
      enhance.shadows = -0.16;
      enhance.highlights = -0.2;
      enhance.vibrance = 0.1;
      enhance.midtones = 0.025;
      enhance.dehaze = 0.04;
    }

    this.adaptive.setEnabled(settings.adaptiveResolution);
    this.adaptive.setBounds(profile.adaptiveMinScale, profile.renderScale);
    if (!settings.adaptiveResolution) this.adaptive.setScale(profile.renderScale);
    this.applyRenderScale();

    const camera = this.cameraEntity.camera!;
    camera.fov = settings.fov;
    camera.farClip = Math.max(900, profile.drawDistance * 2.2);

    const fog = this.app.scene.fog;
    fog.start = profile.drawDistance * 0.14;
    fog.end = profile.drawDistance * 1.28;

    this.resize();
  }

  /** One frame timing sample; the camera frame keeps pixel scale in sync. */
  sampleFrame(frameMs: number): void {
    if (!this.frame) return;
    if (this.adaptive.sample(frameMs)) this.applyRenderScale();
  }

  private applyRenderScale(): void {
    if (!this.frame) return;
    this.frame.rendering.renderTargetScale = this.adaptive.scale;
    this.frame.rendering.sharpness = this.adaptive.scale < 0.99 ? 0.16 : 0.05;
    this.emit('resolution', { scale: this.adaptive.scale, adaptive: this.adaptive.snapshot });
  }

  performanceSnapshot(): FramePerformance {
    const stats = this.app?.stats;
    const frame = stats?.frame;
    const previous = this.lastFrameStats;
    if (!stats) {
      return previous ?? {
        renderer: this.rendererLabel,
        fps: 0,
        frameMs: 0,
        cpuMs: 0,
        renderMs: 0,
        drawCalls: 0,
        primitives: 0,
        vramMb: 0,
        resolutionScale: this.adaptive.scale,
        adaptive: this.adaptive.snapshot,
      };
    }
    const vram = stats.vram;
    const vramMb = (vram.tex + vram.texShadow + vram.vb + vram.ib + vram.ub + vram.sb) / (1024 * 1024);
    const snapshot: FramePerformance = {
      renderer: this.rendererLabel,
      fps: stats.fps,
      frameMs: stats.frameTime,
      cpuMs: stats.cpuUpdateTime,
      renderMs: frame?.renderTime ?? 0,
      drawCalls: stats.drawCallCount,
      primitives: stats.primitiveCount ?? 0,
      vramMb,
      resolutionScale: this.adaptive.scale,
      adaptive: this.adaptive.snapshot,
    };
    this.lastFrameStats = snapshot;
    return snapshot;
  }

  private async createCompatibleDevice(): Promise<GraphicsDevice> {
    const attempts: Array<{ deviceTypes: string[]; label: string }> = [
      { deviceTypes: [DEVICETYPE_WEBGPU, DEVICETYPE_WEBGL2], label: 'WebGPU / WebGL 2' },
      { deviceTypes: [DEVICETYPE_WEBGL2], label: 'WebGL 2' },
    ];
    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        return await createGraphicsDevice(this.canvas, {
          deviceTypes: attempt.deviceTypes as never,
          antialias: true,
          alpha: false,
          depth: true,
          stencil: false,
          powerPreference: 'high-performance',
          displayFormat: DISPLAYFORMAT_LDR,
        });
      } catch (error) {
        lastError = error;
        console.warn(`[graphics] ${attempt.label} device creation failed; trying the next fallback.`, error);
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`No compatible graphics device could be created. This build requires WebGL 2 or WebGPU.\n${message}`);
  }

  private bindResize(): void {
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('orientationchange', this.resizeHandler);
  }

  private bindContextLoss(): void {
    if (this.contextLostHandler) {
      this.canvas.addEventListener('webglcontextlost', this.contextLostHandler, false);
      this.canvas.addEventListener('webgpucontextlost', this.contextLostHandler as EventListener, false);
    }
    if (this.contextRestoredHandler) {
      this.canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler, false);
    }
  }

  resize(): void {
    if (!this.app) return;
    this.app.resizeCanvas();
    this.emit('resize', { width: this.device.width, height: this.device.height });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.app.start();
  }

  setSkybox(skybox: Texture | null, envAtlas: Texture | null): void {
    this.app.scene.skybox = skybox;
    this.app.scene.envAtlas = envAtlas;
  }

  destroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('orientationchange', this.resizeHandler);
    if (this.contextLostHandler) {
      this.canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
      this.canvas.removeEventListener('webgpucontextlost', this.contextLostHandler as EventListener);
    }
    if (this.contextRestoredHandler) this.canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
    if (this.app) this.app.destroy();
    this.lastFrameStats = null;
    this.clear();
  }
}
