/**
 * GLSL3 vertex + fragment for the superposition raymarch.
 *
 * Mirrors `cloud-3d/shaders.ts` but takes a SIGNED density texture (the
 * cross-term ψ_lo · ψ_hi · cos(ωt) can be negative) and maps:
 *
 *   density > 0 → red emission   (excess relative to static baseline)
 *   density < 0 → blue emission  (deficit relative to static baseline)
 *   |density|   → opacity via gamma curve
 *
 * Normalization is done CPU-side: we upload `density / peakAbs`, so the
 * shader can treat the texture sample as already in [-1, 1].
 *
 * The cross-term IS signed — a voxel can go negative when the interference
 * is destructive at that point and instant. That's a real, observable
 * density-change, not an error. The integrated density stays 1.
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

  uniform sampler3D uDensity;
  uniform float uHalfExtent;
  uniform vec3  uCameraPosObj;
  uniform float uSteps;
  uniform float uDensityScale;
  uniform float uAlphaGamma;
  uniform vec3  uPosColor;
  uniform vec3  uNegColor;

  // Slab-test against the centered cube of half-extent uHalfExtent.
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
      if (any(lessThan(tex, vec3(0.0))) || any(greaterThan(tex, vec3(1.0)))) break;
      // Density is already normalized to [-1, 1] by the CPU-side build.
      float d = clamp(texture(uDensity, tex).r, -1.0, 1.0);
      float mag = pow(abs(d), uAlphaGamma);
      float a = mag * uDensityScale;
      vec3 c = (d >= 0.0) ? uPosColor : uNegColor;
      float inv = 1.0 - acc.a;
      acc.rgb += c * a * inv;
      acc.a   += a * inv;
      if (acc.a >= 0.95) break;
      p += dp;
    }
    fragColor = acc;
  }
`
