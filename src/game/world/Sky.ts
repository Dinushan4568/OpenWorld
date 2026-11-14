import { Color, EnvLighting, SKYTYPE_INFINITE, type AppBase, type Texture } from 'playcanvas';
import { createTexture, generateSkyTexture } from '../util/textures';

export interface SkySetup {
  sunDirection: [number, number, number];
  skybox: Texture;
  envAtlas: Texture;
}

/**
 * Builds the visible sky, the prefiltered environment lighting atlas and the
 * fog tint from one procedurally generated equirectangular panorama.
 */
export class SkySystem {
  readonly setup: SkySetup;
  private readonly source: Texture;
  private readonly lightingSource: Texture;
  private readonly app: AppBase;

  constructor(app: AppBase, anisotropy = 4, textureScale = 1) {
    this.app = app;
    const device = app.graphicsDevice;
    const { canvas, sunDirection } = generateSkyTexture(2048 * Math.max(0.5, Math.min(1, textureScale)));
    this.source = createTexture(device, canvas, {
      srgb: true,
      mipmaps: true,
      anisotropy,
      name: 'sky-equirect-source',
    });

    const skybox = EnvLighting.generateSkyboxCubemap(this.source);
    this.lightingSource = EnvLighting.generateLightingSource(this.source, { size: 128 });
    const envAtlas = EnvLighting.generateAtlas(this.lightingSource, {
      size: textureScale < 0.7 ? 128 : 256,
      numReflectionSamples: textureScale < 0.7 ? 64 : 128,
      numAmbientSamples: textureScale < 0.7 ? 256 : 512,
    });

    app.scene.skybox = skybox;
    app.scene.envAtlas = envAtlas;
    app.scene.sky.type = SKYTYPE_INFINITE;
    app.scene.sky.enabled = true;
    app.scene.skyboxIntensity = 1;
    app.scene.skyboxLuminance = 0;
    app.scene.ambientLight = new Color(0.05, 0.08, 0.09);

    this.setup = { sunDirection, skybox, envAtlas };
  }

  /** Re-tint the distance fog to match the horizon under the current sun. */
  applyFog(color: [number, number, number], start: number, end: number): void {
    const fog = this.app.scene.fog;
    fog.type = 'linear';
    fog.color.set(...color);
    fog.start = start;
    fog.end = end;
  }

  destroy(): void {
    this.setup.skybox.destroy();
    this.setup.envAtlas.destroy();
    this.lightingSource.destroy();
    this.source.destroy();
  }
}
