import {
  BLEND_ADDITIVEALPHA,
  CULLFACE_NONE,
  Color,
  Entity,
  Mesh,
  MeshInstance,
  StandardMaterial,
  type AppBase,
  type Texture,
} from 'playcanvas';
import { WORLD } from '../config';
import type { AssetManager } from '../core/AssetManager';
import { clamp, createRandom, damp, lerp } from '../util/math';
import { addQuad, buildMesh, createMeshData } from '../util/meshBuilder';
import { createTexture, generateGlowSprite, generateMoteSprite } from '../util/textures';
import { heightAt } from './heightfield';

interface MoteGroup {
  entity: Entity;
  speed: number;
  phase: number;
}

/**
 * Living atmosphere: the survey drone companion, drifting motes, a lake mist
 * bank and the Echo Pulse scan ring.
 */
export class Atmosphere {
  readonly root: Entity;
  private readonly app: AppBase;
  private readonly assets: AssetManager;
  private readonly drone: Entity;
  private readonly droneRings: Entity[] = [];
  private readonly droneLight: Entity;
  private readonly motes: MoteGroup[] = [];
  private readonly mist: Entity[] = [];
  private readonly pulse: Entity;
  private readonly pulseMaterial: StandardMaterial;
  private readonly materials: StandardMaterial[] = [];
  private readonly meshes: Mesh[] = [];
  private readonly droneVelocity = { x: 0, z: 0 };
  private pulseTime = 1.2;
  private readonly pulseDuration = 1.25;
  private droneAnchor = { x: 0, y: 0, z: 0 };

  constructor(app: AppBase, assets: AssetManager, playerStart: { x: number; y: number; z: number }) {
    this.app = app;
    this.assets = assets;
    this.root = new Entity('atmosphere');
    app.root.addChild(this.root);

    const moteTexture = createTexture(app.graphicsDevice, generateMoteSprite(), {
      srgb: true,
      mipmaps: false,
      name: 'mote-sprite',
    });
    const glowTexture = createTexture(app.graphicsDevice, generateGlowSprite(256, [1, 0.86, 0.66]), {
      srgb: true,
      mipmaps: true,
      name: 'mist-glow',
    });

    this.drone = new Entity('survey-drone');
    this.root.addChild(this.drone);
    this.buildDrone();
    this.droneAnchor = { x: playerStart.x + 1.6, y: playerStart.y + 2.3, z: playerStart.z - 1.8 };
    this.drone.setPosition(this.droneAnchor.x, this.droneAnchor.y, this.droneAnchor.z);

    this.droneLight = new Entity('drone-light');
    this.droneLight.addComponent('light', {
      type: 'point',
      color: new Color(0.4, 0.95, 0.85),
      intensity: 1.6,
      range: 9,
      castShadows: false,
    });
    this.drone.addChild(this.droneLight);

    this.buildMotes(moteTexture);
    this.buildMist(glowTexture);

    this.pulseMaterial = new StandardMaterial();
    this.pulseMaterial.diffuse = new Color(0.2, 0.85, 0.75, 1);
    this.pulseMaterial.emissive = new Color(0.45, 1, 0.88);
    this.pulseMaterial.emissiveIntensity = 2.2;
    this.pulseMaterial.useLighting = false;
    this.pulseMaterial.blendType = BLEND_ADDITIVEALPHA;
    this.pulseMaterial.depthWrite = false;
    this.pulseMaterial.opacity = 0;
    this.pulseMaterial.cull = CULLFACE_NONE;
    this.pulseMaterial.useFog = false;
    this.pulseMaterial.update();
    this.materials.push(this.pulseMaterial);

    this.pulse = new Entity('echo-pulse');
    this.pulse.addComponent('render', { type: 'torus', material: this.pulseMaterial });
    this.pulse.render!.castShadows = false;
    this.pulse.enabled = false;
    this.root.addChild(this.pulse);
  }

  private buildDrone(): void {
    const body = this.assets.instantiate('drone_body', { castShadows: true, receiveShadows: false }) ??
      this.assets.createFallback('drone_body');
    body.setLocalScale(1, 1, 1);
    this.drone.addChild(body);

    for (let i = 0; i < 2; i++) {
      const ring = this.assets.instantiate('drone_ring', { castShadows: false, receiveShadows: false }) ??
        this.assets.createFallback('drone_ring');
      ring.setLocalScale(1 + i * 0.18, 1, 1 + i * 0.18);
      ring.setLocalPosition(0, -0.08 - i * 0.06, 0);
      this.drone.addChild(ring);
      this.droneRings.push(ring);
    }
  }

  private buildMotes(texture: Texture): void {
    const rand = createRandom(30303);
    for (let group = 0; group < 3; group++) {
      const data = createMeshData();
      const count = 26;
      for (let i = 0; i < count; i++) {
        const radius = 3 + rand() * 26;
        const angle = rand() * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = -1.5 + rand() * 9;

        for (let quad = 0; quad < 3; quad++) {
          const a = (quad / 3) * Math.PI + angle;
          const size = 0.06 + rand() * 0.12;
          const dx = Math.cos(a) * size;
          const dz = Math.sin(a) * size;
          const shade = 0.35 + rand() * 0.65;
          addQuad(
            data,
            { p: [x - dx, y - size, z - dz], uv: [0, 0], c: [shade, shade, shade * 0.9, 1] },
            { p: [x + dx, y - size, z + dz], uv: [1, 0], c: [shade, shade, shade * 0.9, 1] },
            { p: [x + dx, y + size, z + dz], uv: [1, 1], c: [shade, shade, shade * 0.9, 1] },
            { p: [x - dx, y + size, z - dz], uv: [0, 1], c: [shade, shade, shade * 0.9, 1] },
          );
        }
      }
      const mesh = buildMesh(this.app.graphicsDevice, data, `motes-${group}`);
      this.meshes.push(mesh);
      const material = new StandardMaterial();
      material.name = `mote-material-${group}`;
      material.diffuse = new Color(1, 1, 1, 1);
      material.diffuseMap = texture;
      material.opacityMap = texture;
      material.opacity = 0.55;
      material.useLighting = false;
      material.blendType = BLEND_ADDITIVEALPHA;
      material.depthWrite = false;
      material.cull = CULLFACE_NONE;
      material.useFog = true;
      material.update();
      this.materials.push(material);

      const entity = new Entity(`motes-${group}`);
      entity.addComponent('render');
      entity.render!.meshInstances = [new MeshInstance(mesh, material)];
      entity.render!.castShadows = false;
      this.root.addChild(entity);
      this.motes.push({ entity, speed: 0.6 + rand() * 1.2, phase: rand() * Math.PI * 2 });
    }
  }

  private buildMist(texture: Texture): void {
    const rand = createRandom(4848);
    for (let i = 0; i < 4; i++) {
      const material = new StandardMaterial();
      material.name = `mist-${i}`;
      material.diffuse = new Color(0.6, 0.78, 0.78, 1);
      material.opacityMap = texture;
      material.diffuseMap = texture;
      material.opacity = 0.16;
      material.blendType = BLEND_ADDITIVEALPHA;
      material.useLighting = false;
      material.depthWrite = false;
      material.cull = CULLFACE_NONE;
      material.useFog = true;
      material.update();
      this.materials.push(material);

      const data = createMeshData();
      const size = 120 + rand() * 90;
      addQuad(
        data,
        { p: [-size, 0, -size], uv: [0, 0], c: [1, 1, 1, 1] },
        { p: [size, 0, -size], uv: [1, 0], c: [1, 1, 1, 1] },
        { p: [size, 0, size], uv: [1, 1], c: [1, 1, 1, 1] },
        { p: [-size, 0, size], uv: [0, 1], c: [1, 1, 1, 1] },
      );
      const mesh = buildMesh(this.app.graphicsDevice, data, `mist-${i}`);
      this.meshes.push(mesh);
      const entity = new Entity(`mist-${i}`);
      entity.addComponent('render');
      entity.render!.meshInstances = [new MeshInstance(mesh, material)];
      entity.render!.castShadows = false;
      entity.render!.receiveShadows = false;
      const angle = rand() * Math.PI * 2;
      const radius = WORLD.lakeRadius * (0.4 + rand() * 0.8);
      entity.setPosition(
        WORLD.lakeCenter.x + Math.cos(angle) * radius,
        WORLD.waterLevel + 1.2 + rand() * 3,
        WORLD.lakeCenter.z + Math.sin(angle) * radius,
      );
      this.root.addChild(entity);
      this.mist.push(entity);
    }
  }

  triggerPulse(x: number, y: number, z: number): void {
    this.pulseTime = 0;
    this.pulse.enabled = true;
    this.pulse.setPosition(x, Math.max(y, heightAt(x, z)) + 0.5, z);
    this.pulse.setLocalScale(0.4, 0.4, 0.4);
    this.pulseMaterial.opacity = 0.9;
    this.pulseMaterial.update();
  }

  update(dt: number, time: number, player: { x: number; y: number; z: number }, yaw: number): void {
    // Drone: hovers off the player's shoulder, banking with their motion.
    const targetX = player.x + Math.cos(yaw) * 1.5 + Math.sin(yaw) * 1.2;
    const targetZ = player.z - Math.sin(yaw) * 1.5 + Math.cos(yaw) * 1.2;
    const ground = heightAt(targetX, targetZ);
    const targetY = Math.max(ground + 2.2, player.y + 2.35) + Math.sin(time * 1.6) * 0.12;

    this.droneAnchor.x = damp(this.droneAnchor.x, targetX, 2.2, dt);
    this.droneAnchor.z = damp(this.droneAnchor.z, targetZ, 2.2, dt);
    this.droneAnchor.y = damp(this.droneAnchor.y, targetY, 3.2, dt);
    const dx = this.droneAnchor.x - this.drone.getPosition().x;
    const dz = this.droneAnchor.z - this.drone.getPosition().z;
    this.droneVelocity.x = damp(this.droneVelocity.x, dx * 4, 5, dt);
    this.droneVelocity.z = damp(this.droneVelocity.z, dz * 4, 5, dt);
    this.drone.setPosition(this.droneAnchor.x, this.droneAnchor.y, this.droneAnchor.z);
    this.drone.setEulerAngles(clamp(-this.droneVelocity.z * 6, -16, 16), (yaw * 180) / Math.PI, clamp(this.droneVelocity.x * 6, -16, 16));
    for (let i = 0; i < this.droneRings.length; i++) {
      const ring = this.droneRings[i];
      ring.rotate(0, (i === 0 ? 55 : -38) * dt, 0);
    }
    this.droneLight.light!.intensity = 1.3 + Math.sin(time * 2.2) * 0.25;

    // Motes drift around the player, always within arm's reach.
    for (let i = 0; i < this.motes.length; i++) {
      const group = this.motes[i];
      const drift = Math.sin(time * group.speed + group.phase) * 1.8;
      group.entity.setPosition(
        player.x + Math.cos(group.phase + time * 0.05) * 3 + drift * 0.2,
        player.y + 1.2 + Math.sin(time * 0.6 + group.phase) * 1.4,
        player.z + Math.sin(group.phase + time * 0.05) * 3,
      );
      group.entity.rotate(0, 4 * dt, 0);
    }

    for (let i = 0; i < this.mist.length; i++) {
      const entity = this.mist[i];
      const y = entity.getPosition().y;
      entity.setPosition(entity.getPosition().x, y + Math.sin(time * 0.12 + i) * 0.003, entity.getPosition().z);
      entity.rotate(0, (0.7 + i * 0.2) * dt, 0);
    }

    if (this.pulseTime < this.pulseDuration) {
      this.pulseTime += dt;
      const t = clamp(this.pulseTime / this.pulseDuration, 0, 1);
      const scale = lerp(0.4, 34, 1 - Math.pow(1 - t, 2.2));
      this.pulse.setLocalScale(scale, 0.3 + t * 1.6, scale);
      this.pulseMaterial.opacity = (1 - t) * 0.85;
      this.pulseMaterial.emissiveIntensity = 2.4 * (1 - t) + 0.2;
      this.pulseMaterial.update();
      if (t >= 1) {
        this.pulse.enabled = false;
        this.pulseTime = this.pulseDuration;
      }
    }
  }

  destroy(): void {
    for (const mesh of this.meshes) mesh.destroy();
    for (const material of this.materials) material.destroy();
    this.root.destroy();
    void this.app;
  }
}
