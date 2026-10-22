const paths = {
  folder: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l2 2h8.8A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M19 12H5m6-7-7 7 7 7',
  toc: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  text: 'M4 19 9 5h1l5 14M5.8 14h7.4M15.5 19l3-8 3 8M16.4 16.8h4.2',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
  note: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 8.5l3 3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
  speaker: 'M4 9.5v5h4l5 4v-13l-5 4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  stop: 'M6 6h12v12H6z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  'chevron-down': 'M6 9l6 6 6-6',
  sort: 'M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  bug: 'M8 9h8v6a4 4 0 0 1-8 0zM12 9V6M9 6.5 7.5 5M15 6.5 16.5 5M4 12h4M16 12h4M5 18l3-1.5M19 18l-3-1.5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  notes: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  translate: 'M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c-1 4-4 7-7 8M13 21l4-9 4 9M14.5 18h5',
  chart: 'M5 20V11M11 20V5M17 20v-7M3 20h18',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 22, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={paths[name]} />
    </svg>
  )
}
