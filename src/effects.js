import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Final grade runs after OutputPass, so it works in display space. This keeps the
// filmic grain/vignette predictable and avoids washing out the tone-mapped image.
const GradeShader = {
  name: 'CinematicGrade',
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    grain: { value: 0.016 },
    vignette: { value: 0.34 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform float grain;
    uniform float vignette;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 centred = vUv - 0.5;
      // barely-there lateral colour split toward the edges
      vec2 offset = centred * dot(centred, centred) * 0.0032;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + offset).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - offset).b;

      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));

      // gentle teal shadows / sodium-vapour highlights
      col += mix(vec3(-0.010, 0.004, 0.017), vec3(0.014, 0.004, -0.008), smoothstep(0.18, 0.78, lum));
      col = (col - 0.5) * 1.045 + 0.5;
      col = mix(vec3(lum), col, 1.07);

      float vig = smoothstep(0.92, 0.16, length(centred * vec2(1.0, 1.18)));
      col *= 1.0 - vignette * (1.0 - vig);

      float grainValue = hash(vUv * resolution + fract(time) * 91.0) - 0.5;
      col += grainValue * grain;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export function createPostFX(renderer, scene, camera, { enabled = true } = {}) {
  if (!enabled) {
    return {
      render() { renderer.render(scene, camera); },
      setSize() {},
      setEnabled() {},
      get enabled() { return false; },
    };
  }

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.55, 1.05);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  grade.uniforms.resolution.value.set(size.x, size.y);
  composer.addPass(grade);

  let active = true;

  return {
    composer,
    bloom,
    grade,
    get enabled() { return active; },
    setEnabled(value) {
      active = Boolean(value);
      for (const pass of composer.passes) pass.enabled = active;
    },
    setSize(width, height) {
      composer.setSize(width, height);
      const drawing = renderer.getDrawingBufferSize(new THREE.Vector2());
      grade.uniforms.resolution.value.set(drawing.x, drawing.y);
      bloom.resolution.set(drawing.x, drawing.y);
    },
    render(dt) {
      if (!active) {
        renderer.render(scene, camera);
        return;
      }
      grade.uniforms.time.value = performance.now() * 0.001;
      composer.render(dt);
    },
  };
}
