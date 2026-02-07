// Virus-themed morphing particle backdrop.
//
// Inspired by the technique in:
//   https://github.com/chrismaldona2/tsl-morphing-particles
//
// Note: that repo did not include a LICENSE file as of 2026-02-07, so we
// implement the underlying idea (TSL + WebGPU + baked surface samples) rather
// than vendoring/copying its code or assets.

import {
  AdditiveBlending,
  CapsuleGeometry,
  Color,
  DataArrayTexture,
  DataTexture,
  FloatType,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusKnotGeometry,
  Texture,
  Vector2,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { SpriteNodeMaterial, WebGPURenderer } from 'three/webgpu';
import {
  cross,
  hash,
  instanceIndex,
  ivec2,
  mix,
  pow,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

export type VirusMorphingTone = 'neutral' | 'infected' | 'sterile';
export type VirusMorphingQuality = 'low' | 'medium' | 'high';

export type VirusMorphingOptions = {
  tone?: VirusMorphingTone;
  quality?: VirusMorphingQuality;
};

type MeshAsset = {
  id: number;
  mesh: Mesh;
  texture: Texture;
};

type MorphTextures = {
  positions: DataArrayTexture;
  uvs: DataArrayTexture;
};

function createSolidTexture(color: ColorRepresentation): DataTexture {
  const c = new Color(color);
  const data = new Uint8Array([
    Math.round(c.r * 255),
    Math.round(c.g * 255),
    Math.round(c.b * 255),
    255,
  ]);
  const t = new DataTexture(data, 1, 1);
  t.format = RGBAFormat;
  t.needsUpdate = true;
  // Treat as color (not data).
  t.colorSpace = SRGBColorSpace;
  return t;
}

function createNoiseTexture(size = 256): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    const v = Math.floor(Math.random() * 256);
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  const t = new DataTexture(data, size, size);
  t.format = RGBAFormat;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  // This is sampled as scalar noise; keep it linear.
  t.colorSpace = NoColorSpace;
  return t;
}

function displaceAlongNormals(mesh: Mesh, amount = 0.18) {
  const geom: any = mesh.geometry;
  if (!geom?.attributes?.position) return;
  const pos = geom.attributes.position;
  const v = new Vector3();
  const n = new Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();

    // Deterministic-ish "spike" based on position.
    const spike =
      (Math.sin(v.x * 7.1) * Math.cos(v.y * 9.7) * Math.sin(v.z * 6.3) + 1) *
      0.5;
    const s = amount * spike * spike;
    v.addScaledVector(n, s);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geom.computeVertexNormals();
  pos.needsUpdate = true;
}

function bakeSurfaceSamples(meshes: MeshAsset[], resolution: number): MorphTextures {
  const particlesCount = resolution * resolution;
  const paramsPerParticle = 4; // vec4 per particle
  const depth = meshes.length;
  const layerStride = particlesCount * paramsPerParticle;
  const totalSize = layerStride * depth;

  const posData = new Float32Array(totalSize);
  const uvData = new Float32Array(totalSize);
  const tmpPos = new Vector3();
  const tmpUv = new Vector2();

  for (const m of meshes) {
    const sampler = new MeshSurfaceSampler(m.mesh).build();
    for (let i = 0; i < particlesCount; i++) {
      sampler.sample(tmpPos, undefined, undefined, tmpUv);
      const base = m.id * layerStride + i * paramsPerParticle;

      posData[base] = tmpPos.x;
      posData[base + 1] = tmpPos.y;
      posData[base + 2] = tmpPos.z;
      posData[base + 3] = Math.random(); // per-particle size factor

      uvData[base] = tmpUv.x;
      uvData[base + 1] = tmpUv.y;
      uvData[base + 2] = 0;
      uvData[base + 3] = 0;
    }
  }

  const mk = (data: Float32Array) => {
    const t = new DataArrayTexture(data, resolution, resolution, depth);
    t.format = RGBAFormat;
    t.type = FloatType;
    t.minFilter = NearestFilter;
    t.magFilter = NearestFilter;
    t.needsUpdate = true;
    // This is pure data; keep it linear.
    t.colorSpace = NoColorSpace;
    return t;
  };

  return {
    positions: mk(posData),
    uvs: mk(uvData),
  };
}

function tonePalette(tone: VirusMorphingTone): ColorRepresentation[] {
  switch (tone) {
    case 'infected':
      return ['#ff2a3d', '#33ff66', '#ff9f1a'];
    case 'sterile':
      return ['#44ddcc', '#33ff66', '#f8fafc'];
    case 'neutral':
    default:
      return ['#33ff66', '#44ddcc', '#ff2a3d'];
  }
}

function qualityResolution(q: VirusMorphingQuality): number {
  switch (q) {
    case 'low':
      return 96;
    case 'high':
      return 144;
    case 'medium':
    default:
      return 128;
  }
}

function qualityMaxDpr(q: VirusMorphingQuality): number {
  switch (q) {
    case 'low':
      return 1.25;
    case 'high':
      return 2;
    case 'medium':
    default:
      return 1.5;
  }
}

export async function startVirusMorphingParticles(
  canvas: HTMLCanvasElement,
  opts: VirusMorphingOptions = {},
): Promise<() => void> {
  const tone: VirusMorphingTone = opts.tone ?? 'neutral';
  const quality: VirusMorphingQuality = opts.quality ?? 'medium';

  if (typeof window === 'undefined') {
    throw new Error('Virus morphing particles can only run in a browser.');
  }

  // Quick guard: avoid attempting WebGPU init on unsupported browsers.
  const hasWebGPU = typeof (navigator as any).gpu !== 'undefined';
  if (!hasWebGPU) throw new Error('WebGPU is not available in this browser.');

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) throw new Error('Canvas has no size.');

  const renderer = new WebGPURenderer({
    canvas,
    powerPreference: 'high-performance',
    antialias: true,
    alpha: true,
    stencil: false,
  });
  await renderer.init();

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(36, rect.width / rect.height, 0.1, 50);
  camera.position.set(0, 0.15, 6);

  const resolution = qualityResolution(quality);
  const particleCount = resolution * resolution;

  // Procedural "virus-ish" meshes, no external assets.
  const palette = tonePalette(tone);

  const spiky = new Mesh(new SphereGeometry(1.25, 64, 32), new MeshBasicMaterial());
  displaceAlongNormals(spiky, 0.22);

  const knot = new Mesh(
    new TorusKnotGeometry(0.95, 0.3, 180, 18),
    new MeshBasicMaterial(),
  );
  const capsule = new Mesh(
    new CapsuleGeometry(0.7, 1.3, 8, 22),
    new MeshBasicMaterial(),
  );

  const meshes: MeshAsset[] = [
    { id: 0, mesh: spiky, texture: createSolidTexture(palette[0]) },
    { id: 1, mesh: knot, texture: createSolidTexture(palette[1]) },
    { id: 2, mesh: capsule, texture: createSolidTexture(palette[2]) },
  ];

  const dataTextures = bakeSurfaceSamples(meshes, resolution);
  const noiseTex = createNoiseTexture(256);

  // Uniforms (TSL uniform nodes expose `.value` for updates).
  const uniforms = {
    meshAIndex: uniform(0),
    meshBIndex: uniform(1),
    mapA: texture(meshes[0].texture),
    mapB: texture(meshes[1].texture),
    animationProgress: uniform(0),
    animationSynchronization: uniform(0.58),
    animationChaosAmplitude: uniform(0.7),
    animationChaosFrequency: uniform(0.18),
    oscillationAmplitude: uniform(0.02),
    oscillationSpeed: uniform(0.08),
    particleSize: uniform(0.052),
    particleGlowSpread: uniform(0.42),
    particleAlphaCutoff: uniform(0.23),
    particleSharpness: uniform(5.0),
  };

  // Decode instance -> texel coordinate.
  const idx = instanceIndex.toVar();
  const x = idx.mod(resolution).toInt();
  const y = idx.div(resolution).toInt();
  const coord = ivec2(x, y);

  const sampleLayer = (tex: DataArrayTexture, layer: any) =>
    texture(tex, coord).setSampler(false).depth(layer);

  // Positions / UVs for shape A/B.
  const shapeA = sampleLayer(dataTextures.positions, uniforms.meshAIndex);
  const shapeB = sampleLayer(dataTextures.positions, uniforms.meshBIndex);
  const uvA = sampleLayer(dataTextures.uvs, uniforms.meshAIndex);
  const uvB = sampleLayer(dataTextures.uvs, uniforms.meshBIndex);

  const posA = shapeA.rgb;
  const posB = shapeB.rgb;

  // Noise-based per-particle delay to avoid a uniform "wipe".
  const noiseA = texture(noiseTex, uvA.xy.mul(1.6)).r;
  const noiseB = texture(noiseTex, uvB.xy.mul(1.6)).r;
  const noiseMix = mix(noiseA, noiseB, uniforms.animationProgress);

  const delay = uniforms.animationSynchronization.oneMinus().mul(noiseMix);
  const end = delay.add(uniforms.animationSynchronization);
  const progress = smoothstep(delay, end, uniforms.animationProgress);

  // Mid-flight bell curve (peaks at 0.5).
  const mid = progress.mul(progress.oneMinus()).mul(4.0);

  const randUv = vec2(hash(idx), hash(idx.add(97))).mul(10.0);

  // Idle oscillation.
  const osc = texture(
    noiseTex,
    randUv.add(time.mul(uniforms.oscillationSpeed).mul(0.1)),
  )
    .rgb.mul(2.0)
    .sub(1.0)
    .mul(uniforms.oscillationAmplitude);

  // Curl-ish chaos while morphing.
  const chaosDir = texture(
    noiseTex,
    randUv.add(time.mul(uniforms.animationChaosFrequency).mul(0.1)),
  )
    .rgb.mul(2.0)
    .sub(1.0);
  const curl = cross(chaosDir, vec3(0, 1, 0));
  const chaos = mix(chaosDir, curl, 0.5)
    .mul(mid)
    .mul(uniforms.animationChaosAmplitude);

  const positionNode = mix(posA, posB, progress).add(chaos).add(osc);

  // Particle size.
  const currentSize = mix(shapeA.a, shapeB.a, progress);
  const scaleNode = uniforms.particleSize.mul(currentSize);

  // Particle sprite shape.
  const dist = uv().distance(0.5);
  const glow = uniforms.particleGlowSpread.div(dist);
  const sharp = pow(glow, uniforms.particleSharpness);
  const opacityNode = sharp
    .sub(uniforms.particleAlphaCutoff.mul(uniforms.particleSharpness))
    .clamp(0, 1);

  // Particle colors.
  const colorA = texture(uniforms.mapA, uvA.xy);
  const colorB = texture(uniforms.mapB, uvB.xy);
  const colorNode = mix(colorA, colorB, progress);

  const material = new SpriteNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.blending = AdditiveBlending;
  material.positionNode = positionNode;
  material.scaleNode = scaleNode;
  material.opacityNode = opacityNode;
  material.colorNode = colorNode;

  const geom = new PlaneGeometry(1, 1);
  const instanced = new InstancedMesh(geom, material, particleCount);
  instanced.frustumCulled = false;

  // Ensure instance matrices don't zero-out the mesh. (WebGPU + instancing uses
  // the instanceMatrix even if we override positions in the shader.)
  const identity = new Matrix4().identity();
  for (let i = 0; i < particleCount; i++) {
    instanced.setMatrixAt(i, identity);
  }
  instanced.instanceMatrix.needsUpdate = true;

  scene.add(instanced);

  let lastPxW = 0;
  let lastPxH = 0;
  let lastDpr = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, qualityMaxDpr(quality));
    const pxW = Math.max(1, Math.floor(r.width * dpr));
    const pxH = Math.max(1, Math.floor(r.height * dpr));
    if (pxW === lastPxW && pxH === lastPxH && dpr === lastDpr) return;
    lastPxW = pxW;
    lastPxH = pxH;
    lastDpr = dpr;

    // WebGPU ultimately presents via the canvas size; keep it in sync with CSS pixels.
    canvas.width = pxW;
    canvas.height = pxH;
    renderer.setPixelRatio(dpr);
    renderer.setSize(r.width, r.height, false);

    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // Morphing state machine.
  const morphMs = 4800;
  const dwellMs = 650;
  const shapeCount = meshes.length;
  let a = 0;
  let b = 1;
  let phase = 0; // 0=morph, 1=dwell
  let phaseStart = performance.now();

  let raf = 0;
  let stopped = false;

  const animate = () => {
    if (stopped) return;

    const now = performance.now();
    const elapsed = now - phaseStart;

    if (phase === 0) {
      const t = Math.min(1, elapsed / morphMs);
      uniforms.animationProgress.value = t;

      if (t >= 1) {
        // Advance to next morph target.
        phase = 1;
        phaseStart = now;

        a = b;
        b = (b + 1) % shapeCount;
        uniforms.meshAIndex.value = a;
        uniforms.meshBIndex.value = b;
        uniforms.mapA.value = meshes[a].texture;
        uniforms.mapB.value = meshes[b].texture;
        uniforms.animationProgress.value = 0;
      }
    } else {
      // Dwell (still animating oscillation/chaos time terms).
      if (elapsed >= dwellMs) {
        phase = 0;
        phaseStart = now;
      }
    }

    // Gentle drift; makes the background feel alive.
    instanced.rotation.y = now * 0.00008;
    instanced.rotation.x = Math.sin(now * 0.00007) * 0.1;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  };

  raf = requestAnimationFrame(animate);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    ro.disconnect();

    try {
      instanced.removeFromParent();
      geom.dispose();
      material.dispose();
      noiseTex.dispose();
      dataTextures.positions.dispose();
      dataTextures.uvs.dispose();
      for (const m of meshes) m.texture.dispose();
      renderer.dispose();
    } catch {
      // Best-effort cleanup; WebGPU renderer disposal can throw on some browsers.
    }
  };
}
