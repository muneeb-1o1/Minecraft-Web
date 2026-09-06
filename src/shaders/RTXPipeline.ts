import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Volumetric Crepuscular Sun Rays Shader
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    sunScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    sunColor: { value: new THREE.Color(1.0, 0.88, 0.62) },
    sunVisibility: { value: 0.0 },
    density: { value: 0.80 },
    weight: { value: 0.012 },
    decay: { value: 0.94 },
    exposure: { value: 0.22 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 sunScreenPos;
    uniform vec3 sunColor;
    uniform float sunVisibility;
    uniform float density;
    uniform float weight;
    uniform float decay;
    uniform float exposure;
    varying vec2 vUv;

    void main() {
      vec4 baseColor = texture2D(tDiffuse, vUv);
      if (sunVisibility <= 0.001) {
        gl_FragColor = baseColor;
        return;
      }

      // Ray direction towards sun (optimized 10-tap march)
      vec2 deltaTextCoord = (vUv - sunScreenPos) * (1.0 / 10.0) * density;
      vec2 textCoord = vUv;
      float illuminationDecay = 1.0;
      vec4 rayColor = vec4(0.0);

      // Multi-tap ray marching
      for (int i = 0; i < 10; i++) {
        textCoord -= deltaTextCoord;
        vec4 sampleCol = texture2D(tDiffuse, clamp(textCoord, 0.0, 1.0));
        // Only bright areas (sun & horizon sky) contribute to rays
        float luma = dot(sampleCol.rgb, vec3(0.299, 0.587, 0.114));
        if (luma > 0.68) {
          sampleCol *= illuminationDecay * (weight * 1.8);
          rayColor += sampleCol;
        }
        illuminationDecay *= decay;
      }

      vec3 finalRays = rayColor.rgb * sunColor * exposure * sunVisibility;
      gl_FragColor = vec4(baseColor.rgb + finalRays, baseColor.a);
    }
  `
};

// Cinematic RTX Grading, Vignette, and Water Caustics Shader
const RTXGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    vignetteStrength: { value: 0.025 },
    saturation: { value: 1.04 },
    contrast: { value: 1.00 },
    exposure: { value: 1.00 },
    isUnderwater: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignetteStrength;
    uniform float saturation;
    uniform float contrast;
    uniform float exposure;
    uniform float isUnderwater;
    varying vec2 vUv;

    // Neutral cinematic filmic tone mapping with soft highlight roll-off and lifted shadows
    vec3 FilmicTonemap(vec3 x) {
      vec3 x2 = max(vec3(0.0), x - 0.002);
      vec3 mapped = (x2 * (6.2 * x2 + 0.5)) / (x2 * (6.2 * x2 + 1.7) + 0.06);
      return mapped;
    }

    void main() {
      vec2 uv = vUv;

      // Underwater wave refraction distortion
      if (isUnderwater > 0.5) {
        float waveX = sin(uv.y * 25.0 + time * 3.0) * 0.004;
        float waveY = cos(uv.x * 25.0 + time * 3.0) * 0.004;
        uv += vec2(waveX, waveY);
      }

      vec4 color = texture2D(tDiffuse, uv);
      vec3 rgb = color.rgb;

      // Natural, photorealistic filmic tone mapping
      rgb = FilmicTonemap(rgb * exposure);

      // Soft natural contrast (lifts shadow detail gently, avoids harsh crushed darks)
      rgb = clamp((rgb - 0.5) * contrast + 0.5, 0.0, 1.0);

      // Realistic natural saturation
      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(vec3(luma), rgb, saturation);

      // Soft natural optical lens vignette
      vec2 coord = (vUv - 0.5) * 2.0;
      float vig = 1.0 - dot(coord, coord) * vignetteStrength;
      rgb *= clamp(vig, 0.0, 1.0);

      // Underwater crystal azure color filter and projected caustics overlay
      if (isUnderwater > 0.5) {
        rgb = mix(rgb, vec3(0.06, 0.32, 0.54), 0.30);

        // Submerged underwater volumetric blue water caustics overlay
        vec2 cUv = uv * 6.5 + vec2(time * 0.20, time * 0.15);
        vec2 cp1 = cUv * 1.5 + vec2(sin(time * 0.7), cos(time * 0.6));
        vec2 cp2 = cUv * 2.1 - vec2(cos(time * 0.8), sin(time * 0.5));
        float cw1 = sin(cp1.x + sin(cp1.y * 1.3 + time * 0.9)) * cos(cp1.y + cos(cp1.x * 1.2 - time * 0.8));
        float cw2 = sin(cp2.x - cos(cp2.y * 1.4 - time * 0.85)) * cos(cp2.y + sin(cp2.x * 1.5 + time * 0.95));
        float submergedCaustics = pow(clamp((cw1 + cw2) * 0.5 + 0.5, 0.0, 1.0), 2.8);
        rgb += vec3(0.25, 0.68, 0.98) * submergedCaustics * 0.36;
      }

      gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
    }
  `
};

export class RTXPipeline {
  public composer: EffectComposer;
  public renderPass: RenderPass;
  public bloomPass: UnrealBloomPass;
  public godRaysPass: ShaderPass;
  public gradingPass: ShaderPass;

  public isEnabled: boolean = true;
  public godRaysEnabled: boolean = true;
  public bloomEnabled: boolean = true;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private tempVec: THREE.Vector3 = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const size = new THREE.Vector2();
    renderer.getSize(size);

    this.composer = new EffectComposer(renderer);

    // 1. Scene render pass
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // 2. Unreal Bloom pass (Soft radiant glow for sun, torches, lava, glowing ores - initialized at half-res)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.round(size.x / 2), Math.round(size.y / 2)),
      0.15, // subtle, realistic glow
      0.42, // radius
      0.88  // threshold (isolates specular and emissive blocks)
    );
    this.composer.addPass(this.bloomPass);

    // 3. Volumetric God Rays pass
    this.godRaysPass = new ShaderPass(GodRaysShader);
    this.composer.addPass(this.godRaysPass);

    // 4. Grading and Vignette pass
    this.gradingPass = new ShaderPass(RTXGradingShader);
    this.composer.addPass(this.gradingPass);
  }

  public setSize(width: number, height: number) {
    this.composer.setSize(width, height);
    // Half-resolution bloom runs 4x faster with identical soft glow quality
    this.bloomPass.setSize(Math.round(width / 2), Math.round(height / 2));
    // Three.js composer.setSize sets inline canvas styles; override them to keep 100vw/100vh display
    this.renderer.setSize(width, height, false);
    if (this.renderer.domElement) {
      this.renderer.domElement.style.width = '100vw';
      this.renderer.domElement.style.height = '100vh';
    }
  }

  public updateSun(sunWorldPos: THREE.Vector3, sunElevation: number, timeSeconds: number, isHeadUnderwater: boolean) {
    // Project sun into NDC coordinates (-1 to 1)
    this.tempVec.copy(sunWorldPos).project(this.camera);

    // Check if sun is in front of the camera (z between -1 and 1)
    const inFront = this.tempVec.z < 1.0;
    const screenX = (this.tempVec.x + 1.0) / 2.0;
    const screenY = (this.tempVec.y + 1.0) / 2.0;

    const onScreen = inFront && screenX >= -0.2 && screenX <= 1.2 && screenY >= -0.2 && screenY <= 1.2;
    const shouldRunRays = this.godRaysEnabled && onScreen && sunElevation > 0.05 && !isHeadUnderwater;
    this.godRaysPass.enabled = shouldRunRays;

    if (shouldRunRays) {
      // Calculate ray intensity based on screen distance and elevation
      const centerDist = Math.sqrt(Math.pow(screenX - 0.5, 2) + Math.pow(screenY - 0.5, 2));
      const rayFactor = Math.max(0, 1.0 - centerDist * 0.75);

      this.godRaysPass.uniforms.sunScreenPos.value.set(screenX, screenY);
      this.godRaysPass.uniforms.sunVisibility.value = rayFactor * Math.min(1.0, (sunElevation - 0.05) * 4.0);

      // Warm golden rays during sunset/sunrise, crisp sunlight during noon
      if (sunElevation < 0.35) {
        this.godRaysPass.uniforms.sunColor.value.setRGB(1.0, 0.65, 0.35);
      } else {
        this.godRaysPass.uniforms.sunColor.value.setRGB(1.0, 0.92, 0.72);
      }
    } else {
      this.godRaysPass.uniforms.sunVisibility.value = 0.0;
    }

    // Update grading uniforms
    this.gradingPass.uniforms.time.value = timeSeconds;
    this.gradingPass.uniforms.isUnderwater.value = isHeadUnderwater ? 1.0 : 0.0;
  }

  public setGraphicsPreset(preset: 'rtx-ultra' | 'rtx' | 'fancy' | 'retro') {
    if (preset === 'rtx-ultra') {
      this.isEnabled = true;
      this.bloomEnabled = true;
      this.godRaysEnabled = true;
      this.bloomPass.enabled = true;
      this.godRaysPass.enabled = true;
      this.bloomPass.strength = 0.15;
      this.bloomPass.radius = 0.42;
      this.gradingPass.uniforms.contrast.value = 0.98; // Soft, natural filmic curve (no harsh crushed darks)
      this.gradingPass.uniforms.saturation.value = 1.03; // Lush, realistic colors
      this.gradingPass.uniforms.exposure.value = 1.05;
      this.gradingPass.uniforms.vignetteStrength.value = 0.018;
    } else if (preset === 'rtx') {
      this.isEnabled = true;
      this.bloomEnabled = true;
      this.godRaysEnabled = true;
      this.bloomPass.enabled = true;
      this.godRaysPass.enabled = true;
      this.bloomPass.strength = 0.10;
      this.bloomPass.radius = 0.35;
      this.gradingPass.uniforms.contrast.value = 0.96;
      this.gradingPass.uniforms.saturation.value = 1.01;
      this.gradingPass.uniforms.exposure.value = 1.00;
      this.gradingPass.uniforms.vignetteStrength.value = 0.012;
    } else if (preset === 'fancy') {
      this.isEnabled = true;
      this.bloomEnabled = true;
      this.godRaysEnabled = false;
      this.bloomPass.enabled = true;
      this.godRaysPass.enabled = false;
      this.bloomPass.strength = 0.08;
      this.gradingPass.uniforms.contrast.value = 0.95;
      this.gradingPass.uniforms.saturation.value = 1.00;
      this.gradingPass.uniforms.exposure.value = 1.00;
      this.gradingPass.uniforms.vignetteStrength.value = 0.010;
    } else {
      // Vanilla Retro
      this.isEnabled = false;
      this.bloomEnabled = false;
      this.godRaysEnabled = false;
      this.bloomPass.enabled = false;
      this.godRaysPass.enabled = false;
    }
  }

  public toggleGodRays(): boolean {
    this.godRaysEnabled = !this.godRaysEnabled;
    this.godRaysPass.enabled = this.godRaysEnabled && this.isEnabled;
    return this.godRaysEnabled;
  }

  public toggleBloom(): boolean {
    this.bloomEnabled = !this.bloomEnabled;
    this.bloomPass.enabled = this.bloomEnabled && this.isEnabled;
    return this.bloomEnabled;
  }

  public render(dt: number) {
    if (this.isEnabled) {
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
