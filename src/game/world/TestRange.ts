import { Color, Entity, StandardMaterial, type AppBase } from 'playcanvas';
import { WORLD } from '../config';
import type { CollisionWorld } from './collision';
import { heightAt } from './heightfield';

/**
 * Temporary controller validation range.
 *
 * Enabled with `?range=1`. It reuses the flat Sunken Plaza so the surface is
 * guaranteed walkable, and adds a low step, two solid pillars of different
 * sizes, a jumpable plateau, a tall wall for camera-boom collision and a ring
 * of thin posts. Every object registers a collider with the collision world.
 */
export class TestRange {
  readonly root: Entity;
  readonly center: { x: number; z: number };
  readonly spawn: { x: number; y: number; z: number; heading: number };
  private readonly materials: StandardMaterial[] = [];

  constructor(app: AppBase, collision?: CollisionWorld) {
    this.root = new Entity('controller-test-range');
    app.root.addChild(this.root);
    this.center = { x: WORLD.plazaCenter.x, z: WORLD.plazaCenter.z };

    const stone = this.material('range-stone', new Color(0.24, 0.25, 0.235, 1), 0.06, 0.3);
    const darkStone = this.material('range-dark-stone', new Color(0.15, 0.16, 0.155, 1), 0.1, 0.22);
    const trim = this.material('range-trim', new Color(0.4, 0.24, 0.1, 1), 0.4, 0.5, new Color(1, 0.55, 0.24), 1.4);

    const obstacle = (
      name: string,
      type: 'cylinder' | 'box',
      dx: number,
      dz: number,
      radius: number,
      height: number,
      walkable: boolean,
      material: StandardMaterial,
      yOffset = 0,
    ): void => {
      const x = this.center.x + dx;
      const z = this.center.z + dz;
      const base = heightAt(x, z) + yOffset;
      if (type === 'cylinder') {
        this.primitive(name, 'cylinder', [x, base + height / 2, z], [radius, height, radius], material, true);
      } else {
        this.primitive(name, 'box', [x, base + height / 2, z], [radius * 2, height, radius * 1.1], material, true);
      }
      collision?.add({ x, z, radius, base: base - 0.05, top: base + height, walkable, kind: name });
    };

    // A low step that can be walked onto without jumping.
    obstacle('range-step', 'cylinder', 8.5, 2.5, 2.1, 0.42, true, darkStone);
    // Two solid pillars of different sizes — wall sliding and push-out.
    obstacle('range-pillar-a', 'cylinder', -6.5, 3.5, 0.85, 2.0, false, stone);
    obstacle('range-pillar-b', 'cylinder', 5.0, 6.5, 1.3, 3.4, false, stone);
    // A tall wall for camera-boom collision.
    obstacle('range-wall', 'box', 0, 9.5, 2.5, 4.6, false, darkStone);
    // A low plateau the player must jump onto and can stand on.
    obstacle('range-plateau', 'cylinder', -7.0, 8.0, 1.7, 0.75, true, stone);

    // Thin posts around the plaza: camera collision + a readable silhouette.
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x = this.center.x + Math.cos(angle) * 11.5;
      const z = this.center.z + Math.sin(angle) * 11.5;
      const base = heightAt(x, z);
      this.primitive(`range-post-${i}`, 'cylinder', [x, base + 1.6, z], [0.22, 3.2, 0.22], trim, true);
      collision?.add({ x, z, radius: 0.26, base, top: base + 3.2, walkable: false, kind: 'range-post' });
    }

    const spawnX = this.center.x;
    const spawnZ = this.center.z + 15;
    this.spawn = {
      x: spawnX,
      y: heightAt(spawnX, spawnZ),
      z: spawnZ,
      heading: Math.PI, // face the plaza and its obstacles
    };
    this.primitive('range-marker', 'torus', [spawnX, this.spawn.y + 0.06, spawnZ], [1.4, 0.05, 1.4], trim);
  }

  private material(
    name: string,
    diffuse: Color,
    metalness: number,
    gloss: number,
    emissive?: Color,
    emissiveIntensity = 0,
  ): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse = diffuse;
    material.useMetalness = true;
    material.metalness = metalness;
    material.gloss = gloss;
    if (emissive) {
      material.emissive = emissive;
      material.emissiveIntensity = emissiveIntensity;
    }
    material.useFog = true;
    material.update();
    this.materials.push(material);
    return material;
  }

  private primitive(
    name: string,
    type: 'cylinder' | 'box' | 'torus',
    position: [number, number, number],
    scale: [number, number, number],
    material: StandardMaterial,
    castShadows = false,
  ): Entity {
    const entity = new Entity(name);
    entity.addComponent('render', { type, material });
    entity.setLocalPosition(...position);
    entity.setLocalScale(...scale);
    entity.render!.castShadows = castShadows;
    entity.render!.receiveShadows = true;
    this.root.addChild(entity);
    return entity;
  }

  dispose(): void {
    for (const material of this.materials) material.destroy();
    this.root.destroy();
  }
}
