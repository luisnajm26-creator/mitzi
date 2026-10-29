import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Mezcla aditiva que no toca el alfa: la luz se suma al fondo CSS detrás del canvas
 * transparente, como un haz real sobre el ambiente.
 */
const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const

const beamVertex = /* glsl */ `
  varying float vY;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vY = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vY;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float edge = pow(abs(dot(vNormal, vView)), 2.4);
    float fall = 0.12 + 0.88 * pow(vY, 1.5);
    float a = edge * fall * uIntensity;
    gl_FragColor = vec4(uColor * a, 0.0);
  }
`

const poolFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = pow(1.0 - smoothstep(0.0, 1.0, r), 2.2) * uIntensity;
    gl_FragColor = vec4(uColor * a, 0.0);
  }
`

const poolVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uPixelRatio;
  attribute vec4 aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float t = uTime * (0.04 + aSeed.x * 0.05);
    p.y = mod(p.y - t + uHeight, uHeight) - uHeight * 0.5;
    p.x += sin(uTime * 0.25 + aSeed.y * 6.28) * 0.08;
    p.z += cos(uTime * 0.2 + aSeed.z * 6.28) * 0.08;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (2.0 + aSeed.w * 4.0) * uPixelRatio * (6.0 / -mv.z);
    float y01 = (p.y / uHeight) + 0.5;
    float twinkle = sin(uTime * (0.6 + aSeed.x) + aSeed.w * 10.0) * 0.5 + 0.5;
    vAlpha = (0.35 + 0.65 * twinkle) * smoothstep(0.0, 0.2, y01) * (1.0 - smoothstep(0.75, 1.0, y01));
  }
`

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha * 0.5;
    gl_FragColor = vec4(uColor * a, 0.0);
  }
`

const DUST_COUNT = 140

interface LightRigProps {
  /** Altura del piso */
  floorY: number
  /** Color objetivo del haz (se mezcla suavemente al cambiar de libro) */
  color: THREE.Color
  /** 0..1 cuánto brilla (baja al abrir un libro) */
  intensity: { current: number }
  /** partículas de polvo en el haz */
  dust: boolean
}

export function LightRig({ floorY, color, intensity, dust: showDust }: LightRigProps) {
  const top = floorY + 4.6
  const height = top - floorY
  const radius = 1.65

  const beam = useMemo(
    () =>
      new THREE.ShaderMaterial({
        ...additive,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uIntensity: { value: 0.26 } },
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
      }),
    [],
  )
  const pool = useMemo(
    () =>
      new THREE.ShaderMaterial({
        ...additive,
        uniforms: { uColor: { value: new THREE.Color() }, uIntensity: { value: 0.32 } },
        vertexShader: poolVertex,
        fragmentShader: poolFragment,
      }),
    [],
  )
  const dust = useMemo(
    () =>
      new THREE.ShaderMaterial({
        ...additive,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uTime: { value: 0 },
          uHeight: { value: height },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader: dustVertex,
        fragmentShader: dustFragment,
      }),
    [height],
  )
  const dustGeometry = useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3)
    const seeds = new Float32Array(DUST_COUNT * 4)
    let s = 11
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < DUST_COUNT; i++) {
      const y = rand()
      // dentro del cono: más ancho abajo
      const r = Math.sqrt(rand()) * radius * (0.15 + 0.8 * (1 - y))
      const a = rand() * Math.PI * 2
      positions.set([Math.cos(a) * r, (y - 0.5) * height, Math.sin(a) * r * 0.6], i * 3)
      seeds.set([rand(), rand(), rand(), rand()], i * 4)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    return g
  }, [height])

  const current = useRef(new THREE.Color().copy(color))
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    current.current.lerp(color, 1 - Math.exp(-dt * 3))
    const k = intensity.current
    beam.uniforms.uColor.value.copy(current.current)
    beam.uniforms.uIntensity.value = 0.26 * k
    pool.uniforms.uColor.value.copy(current.current)
    pool.uniforms.uIntensity.value = 0.32 * k
    dust.uniforms.uColor.value.copy(current.current)
    dust.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <group>
      <mesh position={[0, floorY + height / 2, 0]} material={beam} renderOrder={5}>
        <cylinderGeometry args={[0.07, radius, height, 64, 1, true]} />
      </mesh>
      <mesh position={[0, floorY + height / 2, 0]} material={beam} renderOrder={5} scale={[0.55, 1, 0.55]}>
        <cylinderGeometry args={[0.05, radius, height, 48, 1, true]} />
      </mesh>
      <mesh position={[0, floorY + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={pool} renderOrder={1}>
        <planeGeometry args={[radius * 2.6, radius * 2.6]} />
      </mesh>
      {showDust && <points geometry={dustGeometry} material={dust} position={[0, floorY + height / 2, 0]} renderOrder={6} />}
    </group>
  )
}
