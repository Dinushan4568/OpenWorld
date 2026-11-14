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
  TONEMAP_ACES,
  createGraphicsDevice,
  revision,
  type GraphicsDevice,
  type Texture,
} from 'playcanvas';
import { CAMERA, QUALITY_PROFILES, WORLD } from '../config';
import { Emitter } from './emitter';
import type { Settings } from './settings';

export interface EngineEvents extends Record<string, unknown> {
  resize: { width: number; height: number };
  contextlost: undefined;
  contextrestored: undefined;
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
  readonly version = revision;

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
    let device: GraphicsDevice;
    try {
      device = await createGraphicsDevice(this.canvas, {
        deviceTypes: [DEVICETYPE_WEBGPU, DEVICETYPE_WEBGL2],
        antialias: true,
        alpha: false,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance',
        displayFormat: DISPLAYFORMAT_LDR,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`No compatible graphics device could be created. This build requires WebGL 2 or WebGPU.\n${message}`);
    }

    this.device = device;
    this.rendererLabel = device.deviceType === 'webgpu' ? 'WebGPU' : 'WebGL 2';
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
    this.frame.rendering.samples = profile.samples;
    this.frame.bloom.threshold = 1.05;
    this.frame.bloom.blurLevel = 8;
    this.frame.bloom.intensity = 0;
    this.frame.vignette.inner = 0.58;
    this.frame.vignette.outer = 1.3;
    this.frame.vignette.curvature = 0.7;
    this.frame.vignette.intensity = 0;
    this.frame.grading.saturation = 1.06;
    this.frame.grading.contrast = 1.03;
    this.frame.ssao.enabled = false;
    this.applySettings(settings);

    this.bindResize();
    this.bindContextLoss();
  }

  applySettings(settings: Settings): void {
    if (!this.frame || !this.app) return;
    const profile = QUALITY_PROFILES[settings.quality];
    this.device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap);
    this.frame.rendering.samples = profile.samples;
    this.frame.rendering.renderTargetScale = profile.renderScale;
    this.frame.bloom.intensity = settings.bloom && profile.bloom ? 0.042 : 0;
    this.frame.vignette.intensity = settings.vignette ? 0.3 : 0;
    this.frame.ssao.enabled = profile.ssao;
    if (profile.ssao) {
      this.frame.ssao.radius = 26;
      this.frame.ssao.intensity = 0.42;
      this.frame.ssao.samples = 10;
    }

    const camera = this.cameraEntity.camera!;
    camera.fov = settings.fov;
    camera.farClip = Math.max(900, profile.drawDistance * 2.2);

    const fog = this.app.scene.fog;
    fog.start = profile.drawDistance * 0.16;
    fog.end = profile.drawDistance * 1.35;

    this.resize();
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
    this.clear();
  }
}
