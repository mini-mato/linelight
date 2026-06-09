/**
 * GLSL3 vertex + fragment for the volumetric raymarch.
 *
 * Matches the colormap & compositing convention in `colormap.ts` so the
 * shader output and the CPU-side reference implementation agree.
 *
 * Fragment shader does:
 *   1. Compute the entry/exit points of the camera ray with the centered
 *      box in object space (uHalfExtent on each axis, in object units = the
 *      same Bohr-radius units as the grid).
 *   2. March 128 steps front-to-back, sampling `texture(uPsi, p).r` (signed ψ).
 *   3. Map signed sample → red/blue color, magnitude → gamma-curve alpha.
 *   4. Accumulate over-operator; early-out at α ≥ 0.95.
 *   5. Output RGBA (premultiplied).
 *
 * Uniforms:
 *   uPsi          sampler3D — the signed ψ field (RedFormat / FloatType).
 *   uPeakAbs      max |ψ| over the grid (used to normalize brightness).
 *   uHalfExtent   half the cube side in object-space units (matches grid).
 *   uCameraPosObj camera position transformed into the box's object space.
 *   uSteps        number of march steps (default 128).
 *   uDensityScale per-step alpha multiplier.
 *   uAlphaGamma   exponent of |ψ|/peak applied to brightness.
 */

export const VERTEX_SHADER = /* glsl */ `#version 300 es
  precision highp float;
  in vec3 position;
  uniform mat4 modelMatrix;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  out vec3 vPosObj;
  void main() {
    vPosObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
  precision highp float;
  precision highp sampler3D;

  in vec3 vPosObj;
  out vec4 fragColor;

  uniform sampler3D uPsi;
  uniform float uPeakAbs;
  uniform float uHalfExtent;
  uniform vec3  uCameraPosObj;
  uniform float uSteps;
  uniform float uDensityScale;
  uniform float uAlphaGamma;
  uniform vec3  uPosColor;
  uniform vec3  uNegColor;

  // Slab-test against the centered cube of half-extent uHalfExtent.
  // Returns vec2(tEnter, tExit) along the ray (origin + t*dir). If miss, x>y.
  vec2 hitBox(vec3 origin, vec3 dir) {
    vec3 box = vec3(uHalfExtent);
    vec3 invDir = 1.0 / dir;
    vec3 tMinV  = (-box - origin) * invDir;
    vec3 tMaxV  = ( box - origin) * invDir;
    vec3 t0 = min(tMinV, tMaxV);
    vec3 t1 = max(tMinV, tMaxV);
    float tEnter = max(max(t0.x, t0.y), t0.z);
    float tExit  = min(min(t1.x, t1.y), t1.z);
    return vec2(tEnter, tExit);
  }

  // Object-space [-half, +half]³ → texture-space [0, 1]³.
  vec3 toTex(vec3 p) {
    return (p / (2.0 * uHalfExtent)) + 0.5;
  }

  void main() {
    // Ray from camera (in object space) through this fragment's world point.
    vec3 origin = uCameraPosObj;
    vec3 dir = normalize(vPosObj - origin);

    vec2 tHit = hitBox(origin, dir);
    if (tHit.x > tHit.y) discard;
    float tEnter = max(tHit.x, 0.0);
    float tExit  = tHit.y;

    int steps = int(uSteps);
    float stepLen = (tExit - tEnter) / uSteps;
    vec3 p = origin + tEnter * dir;
    vec3 dp = dir * stepLen;

    vec4 acc = vec4(0.0);
    for (int i = 0; i < 256; i++) {
      if (i >= steps) break;
      vec3 tex = toTex(p);
      // Out-of-range guard (linear filter wraps would be visible at faces).
      if (any(lessThan(tex, vec3(0.0))) || any(greaterThan(tex, vec3(1.0)))) break;
      float psi = texture(uPsi, tex).r;
      float t = clamp(psi / max(uPeakAbs, 1e-12), -1.0, 1.0);
      float mag = pow(abs(t), uAlphaGamma);
      float a = mag * uDensityScale;
      vec3 c = (t >= 0.0) ? uPosColor : uNegColor;
      float inv = 1.0 - acc.a;
      acc.rgb += c * a * inv;
      acc.a   += a * inv;
      if (acc.a >= 0.95) break;
      p += dp;
    }
    fragColor = acc;
  }
`
