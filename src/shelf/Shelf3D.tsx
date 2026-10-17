import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import * as THREE from 'three'
import type { BookRecord } from '../library/db'
import { isTouchDevice, platform } from '../platform'
import { ambientColors } from '../library/palette'
import { CarouselController } from './carousel'
import { LightRig } from './LightRig'
import { BOOK_HEIGHT, bookDims, createBookModel, getShared } from './textures'
import { hideSplashAfterPaint } from '../app/splash'

/** Vueltas del libro central (radianes por segundo). */
const SPIN_SPEED = 0.42
/** Sin tocar nada durante este tiempo, el libro deja de girar y se pausa el dibujo. */
const IDLE_MS = 25_000
/** Duración de la animación de abrir un libro. */
export const OPEN_MS = 1300
/** Al volver del lector, la misma animación al revés: el libro se cierra y vuelve al estante. */
export const CLOSE_MS = 1150
/** Libros que se montan a cada lado del central. */
const WINDOW = isTouchDevice ? 4 : 6

export interface ShelfMotion {
  ctrl: CarouselController
  spin: { speed: number }
  openingAt: number | null
  closingAt: number | null
  intensity: { current: number }
  /** Reanuda el dibujo si estaba en pausa (lo asigna Shelf3D). */
  wake?: () => void
}

export function createMotion(): ShelfMotion {
  return { ctrl: new CarouselController(), spin: { speed: SPIN_SPEED }, openingAt: null, closingAt: null, intensity: { current: 1 } }
}

interface Layout {
  first: number
  rest: number
  depthFirst: number
  depthRest: number
  sideAngle: number
  sideScale: number
  camZ: number
  bookY: number
  lookY: number
  pxPerBook: number
  aspect: number
}

const FOV = 30
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180)
const CAMERA_Y = 0.6

/**
 * Coloca la cámara para que el libro central quepa entre la barra de arriba y el
 * título de abajo, en cualquier pantalla (teléfono vertical, tablet, PC).
 */
function computeLayout(width: number, height: number): Layout {
  const aspect = width / height
  const portrait = aspect < 0.85
  const topReserve = 72
  const bottomReserve = portrait ? 250 : 215
  const avail = Math.max(140, height - topReserve - bottomReserve)
  const bookPx = Math.min(avail * 0.9, height * (portrait ? 0.48 : 0.6))
  // distancia para que el libro mida bookPx de alto (y en vertical, que no sea muy ancho)
  let camZ = (BOOK_HEIGHT * height) / (bookPx * 2 * TAN)
  if (portrait) camZ = Math.max(camZ, (1.45 * height) / (0.6 * width * 2 * TAN))
  const worldPerPx = (2 * camZ * TAN) / height
  // centro vertical del espacio libre, pasado a unidades 3D
  const bookY = -(topReserve + avail / 2 - height / 2) * worldPerPx
  return portrait
    ? { first: 1.8, rest: 0.85, depthFirst: 1.6, depthRest: 0.6, sideAngle: 0.62, sideScale: 0.82, camZ, bookY, lookY: 0, pxPerBook: width * 0.6, aspect }
    : { first: 2.4, rest: 1.25, depthFirst: 1.3, depthRest: 0.6, sideAngle: 0.55, sideScale: 0.84, camZ, bookY, lookY: 0, pxPerBook: Math.max(220, width * 0.24), aspect }
}

const smooth = (x: number) => x * x * (3 - 2 * x)
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Ángulo equivalente en (-π, π]. */
const wrapAngle = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2))

/**
 * Etapas de la animación de abrir (cada una de 0 a 1):
 * front: el libro se pone de frente y se acerca; cover: la tapa gira sobre el lomo;
 * zoom: la cámara entra a la primera página; fade: el foco se apaga.
 */
function openingStages(motion: ShelfMotion) {
  let p: number
  if (motion.openingAt !== null) p = clamp01((performance.now() - motion.openingAt) / OPEN_MS)
  else if (motion.closingAt !== null) {
    p = 1 - clamp01((performance.now() - motion.closingAt) / CLOSE_MS)
    if (p <= 0) {
      motion.closingAt = null
      return null
    }
  } else return null
  return {
    front: smooth(clamp01(p / 0.3)),
    cover: easeInOut(clamp01((p - 0.18) / 0.47)),
    zoom: easeInOut(clamp01((p - 0.58) / 0.42)),
    fade: smooth(clamp01((p - 0.5) / 0.4)),
  }
}

interface BookProps {
  book: BookRecord
  index: number
  motion: ShelfMotion
  layout: Layout
  anisotropy: number
  onTap(index: number): void
}

const Book = memo(function Book({ book, index, motion, layout, anisotropy, onTap }: BookProps) {
  const dims = useMemo(() => bookDims(book), [book])
  const model = useMemo(() => createBookModel(book, dims, anisotropy), [book, dims, anisotropy])
  const invalidate = useThree(s => s.invalidate)
  const group = useRef<THREE.Group>(null)
  const pivot = useRef<THREE.Group>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null)
  const angle = useRef(0)

  useEffect(() => {
    model.ready.then(() => {
      invalidate()
      // el libro del centro ya tiene su portada: se puede quitar la pantalla de inicio
      if (index === motion.ctrl.center) hideSplashAfterPaint()
    })
    return () => model.dispose()
  }, [model, invalidate])

  useFrame((state, rawDt) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(rawDt, 0.05)
    const { ctrl, spin } = motion
    const rel = index - ctrl.offset
    const a = Math.abs(rel)
    g.visible = a < WINDOW - 0.5
    if (!g.visible) return
    const s = Math.sign(rel)
    const near = Math.min(a, 1)
    const far = Math.max(0, a - 1)
    const centerW = smooth(clamp01(1 - a * 1.4))
    const stages = openingStages(motion)
    const isOpening = stages !== null && index === ctrl.center
    const front = isOpening ? stages.front : 0

    // el libro central gira; los demás vuelven a mirar al frente
    if (centerW > 0.6 && spin.speed > 0.01 && !stages) angle.current += spin.speed * dt
    else angle.current = wrapAngle(angle.current) * Math.exp(-dt * (isOpening ? 9 : 3.5))

    const bob = centerW * Math.sin(state.clock.elapsedTime * 1.3) * 0.035 * Math.min(1, spin.speed / SPIN_SPEED) * (1 - front)
    let x = s * (near * layout.first + far * layout.rest)
    let y = layout.bookY + bob
    let z = -(near * layout.depthFirst + far * layout.depthRest)
    const scale = 1 - near * (1 - layout.sideScale) - far * 0.04

    if (stages && !isOpening) {
      // los demás libros se apartan para dejar el escenario libre
      x *= 1 + stages.front * 1.3
      z -= stages.front * 1.5
    }
    if (isOpening) {
      const w = dims.width
      // 1) de frente y más cerca, hasta que quepa el libro abierto (dos páginas)
      const fitHeight = BOOK_HEIGHT / (0.66 * 2 * TAN)
      const fitSpread = (2 * w * 1.12) / (2 * TAN * layout.aspect)
      const z1 = layout.camZ - Math.max(fitHeight, fitSpread)
      // 2) la cámara entra a la primera página hasta llenar la pantalla
      const zF = layout.camZ - Math.min(BOOK_HEIGHT / (2 * TAN), w / (2 * TAN * layout.aspect)) * 0.9
      z = lerp(lerp(z, z1, stages.front), zF, stages.zoom)
      y = lerp(y, (CAMERA_Y * z) / layout.camZ, stages.front)
      // con la tapa abierta se centra el libro; al entrar a la página se centra la página
      x = (w / 2) * stages.cover * (1 - stages.zoom)
    }

    g.position.set(x, y, z)
    g.rotation.y = -s * near * layout.sideAngle * (1 - front) + angle.current * centerW
    g.scale.setScalar(isOpening ? lerp(scale, 1, front) : scale)
    if (pivot.current) pivot.current.rotation.y = isOpening ? -stages.cover * Math.PI * 0.985 : 0

    if (shadow.current && shadowMat.current) {
      const floorY = layout.bookY - BOOK_HEIGHT / 2 - 0.03
      shadow.current.position.y = (floorY - g.position.y) / g.scale.x
      shadowMat.current.opacity = (0.32 + 0.4 * centerW) * (1 - (stages?.front ?? 0))
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return
    e.stopPropagation()
    onTap(index)
  }

  const { cover, spine, back, block } = model
  return (
    <group ref={group} onClick={handleClick}>
      <mesh geometry={back.geometry} material={back.materials} position={back.position} />
      <mesh geometry={spine.geometry} material={spine.materials} position={spine.position} />
      <mesh geometry={block.geometry} material={block.materials} position={block.position} />
      <group ref={pivot} position={model.pivot}>
        <mesh geometry={cover.geometry} material={cover.materials} position={cover.position} />
      </group>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} renderOrder={2}>
        <planeGeometry args={[(dims.width + 0.25) / 0.56, (dims.depth + 0.4) / 0.56]} />
        <meshBasicMaterial ref={shadowMat} map={getShared().shadow} color="black" transparent depthWrite={false} />
      </mesh>
    </group>
  )
})

/** Baja la resolución si el equipo no alcanza a dibujar fluido. */
function PerformanceGuard() {
  const setDpr = useThree(s => s.setDpr)
  const dpr = useThree(s => s.viewport.dpr)
  const ema = useRef(1 / 60)
  const slowFrames = useRef(0)
  useFrame((_, dt) => {
    if (dt > 0.2) return
    ema.current = ema.current * 0.95 + dt * 0.05
    slowFrames.current = ema.current > 1 / 40 ? slowFrames.current + 1 : 0
    if (slowFrames.current > 120 && dpr > 1) {
      setDpr(Math.max(1, dpr - 0.5))
      slowFrames.current = 0
    }
  })
  return null
}

interface SceneProps {
  books: BookRecord[]
  motion: ShelfMotion
  palette: BookRecord['palette'] | null
  onCenterChange(index: number): void
  onTap(index: number): void
  onSleep(): void
}

function Scene({ books, motion, palette, onCenterChange, onTap, onSleep }: SceneProps) {
  const size = useThree(s => s.size)
  const camera = useThree(s => s.camera)
  const scene = useThree(s => s.scene)
  const gl = useThree(s => s.gl)
  const layout = useMemo(() => computeLayout(size.width, size.height), [size.width, size.height])
  const anisotropy = useMemo(() => Math.min(8, gl.capabilities.getMaxAnisotropy()), [gl])
  const [center, setCenter] = useState(motion.ctrl.center)
  const centerRef = useRef(center)
  const spot = useRef<THREE.SpotLight>(null)
  const rim = useRef<THREE.PointLight>(null)
  const readLight = useRef<THREE.DirectionalLight>(null)

  const colors = useMemo(() => {
    const amb = palette ? ambientColors(palette) : null
    return {
      beam: new THREE.Color(amb?.beam ?? '#fff6e6'),
      rim: new THREE.Color(amb?.rim ?? '#9d8cff'),
      fog: new THREE.Color(amb?.bottom ?? '#0d0b12'),
    }
  }, [palette])

  useEffect(() => {
    camera.position.set(0, CAMERA_Y, layout.camZ)
    camera.lookAt(0, layout.lookY, 0)
    // la niebla empieza detrás del libro central: los lejanos se funden con el fondo
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = layout.camZ + 1.2
      scene.fog.far = layout.camZ + 9
    } else scene.fog = new THREE.Fog(colors.fog.clone(), layout.camZ + 1.2, layout.camZ + 9)
  }, [camera, layout, scene]) // el color de la niebla se mezcla en cada frame

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const { ctrl, spin } = motion
    ctrl.update(dt)

    const idleFor = performance.now() - ctrl.lastInput
    const target = idleFor > IDLE_MS ? 0 : SPIN_SPEED
    spin.speed += (target - spin.speed) * (1 - Math.exp(-dt * 1.6))

    // al abrir un libro: luz de lectura desde la cámara y el foco se apaga al final
    const stages = openingStages(motion)
    if (readLight.current) readLight.current.intensity = 0.5 + 1.6 * (stages?.front ?? 0)
    motion.intensity.current = 1 - (stages?.fade ?? 0)

    const k = 1 - Math.exp(-dt * 3)
    spot.current?.color.lerp(colors.beam, k)
    rim.current?.color.lerp(colors.rim, k)
    if (scene.fog instanceof THREE.Fog) scene.fog.color.lerp(colors.fog, k)

    if (ctrl.center !== centerRef.current) {
      centerRef.current = ctrl.center
      setCenter(ctrl.center)
      onCenterChange(ctrl.center)
    }
    if (idleFor > IDLE_MS + 3500 && ctrl.settled && motion.openingAt === null && motion.closingAt === null) onSleep()
  })

  const floorY = layout.bookY - BOOK_HEIGHT / 2 - 0.03
  const from = Math.max(0, center - WINDOW)
  const to = Math.min(books.length, center + WINDOW + 1)

  return (
    <>
      <PerformanceGuard />
      <ambientLight intensity={0.28} />
      <hemisphereLight args={['#cfc8ff', '#120e18', 0.55]} />
      <spotLight ref={spot} position={[0, floorY + 4.9, 1.3]} angle={0.42} penumbra={0.85} intensity={46} decay={2} />
      <directionalLight ref={readLight} position={[0, 1.2, 6]} intensity={0.5} />
      <pointLight ref={rim} position={[0, 1.4, -2.6]} intensity={9} distance={9} />
      <LightRig floorY={floorY} color={colors.beam} intensity={motion.intensity} />
      {books.slice(from, to).map((book, i) => (
        <Book key={book.id} book={book} index={from + i} motion={motion} layout={layout} anisotropy={anisotropy} onTap={onTap} />
      ))}
    </>
  )
}

interface Shelf3DProps {
  books: BookRecord[]
  motion: ShelfMotion
  palette: BookRecord['palette'] | null
  active: boolean
  onCenterChange(index: number): void
  onOpen(index: number): void
}

export function Shelf3D({ books, motion, palette, active, onCenterChange, onOpen }: Shelf3DProps) {
  const [awake, setAwake] = useState(true)
  const awakeRef = useRef(awake)
  awakeRef.current = awake
  const pointer = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const wheelAcc = useRef({ value: 0, lockUntil: 0 })

  const wake = () => {
    motion.ctrl.touch()
    if (!awakeRef.current) setAwake(true)
  }
  motion.wake = wake

  useEffect(() => {
    motion.ctrl.setCount(books.length)
  }, [books.length, motion])

  // la biblioteca anima en continuo: frecuencia alta solo mientras está despierta y visible
  useEffect(() => {
    platform.setHighRefresh?.(active && awake)
  }, [active, awake])

  useEffect(() => {
    if (active) wake()
    const onMove = () => wake()
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('keydown', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onMove)
    }
  }, [active])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false }
    wake()
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const p = pointer.current
    if (!p || p.id !== e.pointerId) return
    if (!p.dragging && Math.abs(e.clientX - p.x) > 6) {
      p.dragging = true
      wrapper.current?.setPointerCapture(e.pointerId)
      const width = wrapper.current?.clientWidth ?? window.innerWidth
      const height = wrapper.current?.clientHeight ?? window.innerHeight
      motion.ctrl.beginDrag(p.x, computeLayout(width, height).pxPerBook)
    }
    if (p.dragging) motion.ctrl.moveDrag(e.clientX)
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const p = pointer.current
    if (!p || p.id !== e.pointerId) return
    if (p.dragging) {
      motion.ctrl.endDrag()
      wrapper.current?.releasePointerCapture(e.pointerId)
    }
    pointer.current = null
  }
  const onWheel = (e: ReactWheelEvent) => {
    wake()
    const acc = wheelAcc.current
    const now = performance.now()
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    acc.value += delta
    if (now < acc.lockUntil || Math.abs(acc.value) < 40) return
    motion.ctrl.step(Math.sign(acc.value))
    acc.value = 0
    acc.lockUntil = now + 110
  }

  const handleTap = (index: number) => {
    wake()
    if (index === motion.ctrl.center && Math.abs(motion.ctrl.offset - index) < 0.2) onOpen(index)
    else motion.ctrl.goTo(index)
  }

  const frameloop = !active ? 'never' : awake ? 'always' : 'demand'

  return (
    <div
      ref={wrapper}
      className="shelf-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <Canvas
        dpr={[1, Math.min(2, window.devicePixelRatio)]}
        frameloop={frameloop}
        camera={{ fov: FOV, near: 0.05, far: 80, position: [0, CAMERA_Y, 8] }}
        gl={{ antialias: window.devicePixelRatio < 2, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping
          gl.toneMappingExposure = 1.05
        }}
      >
        <Scene
          books={books}
          motion={motion}
          palette={palette}
          onCenterChange={onCenterChange}
          onTap={handleTap}
          onSleep={() => setAwake(false)}
        />
      </Canvas>
    </div>
  )
}
