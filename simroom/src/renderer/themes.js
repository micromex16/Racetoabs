// Built-in theme presets. A custom theme in room.json uses exactly the same shape.
export const PRESETS = [
  {
    id: 'clubhouse',
    name: 'Clubhouse',
    colors: {
      background: '#0c2418', tile: '#163b28', tileHover: '#1f5238',
      text: '#f7f1e1', muted: '#d2c7a8', accent: '#d4af55', border: '#2f6146',
    },
    fonts: { display: 'Playfair Display', body: 'Inter' },
    background: { type: 'gradient', from: '#16402b', to: '#081a11', angle: 0, radial: true },
  },
  {
    id: 'cinema',
    name: 'Cinema',
    colors: {
      background: '#070707', tile: '#161616', tileHover: '#2a1013',
      text: '#ffffff', muted: '#c4c4c4', accent: '#ff2a36', border: '#343434',
    },
    fonts: { display: 'Bebas Neue', body: 'Inter' },
    background: { type: 'gradient', from: '#1c0507', to: '#050505', angle: 0, radial: true },
  },
  {
    id: 'arcade',
    name: 'Arcade',
    colors: {
      background: '#0a0f2e', tile: '#131b4d', tileHover: '#1b2a70',
      text: '#eef8ff', muted: '#b3cbee', accent: '#2ee6ff', border: '#2d3f96',
    },
    fonts: { display: 'Oswald', body: 'Montserrat' },
    background: { type: 'gradient', from: '#141e5c', to: '#070a22', angle: 160 },
  },
  {
    id: 'sonoran',
    name: 'Sonoran Desert',
    colors: {
      background: '#ecdcc2', tile: '#fff8ec', tileHover: '#f8e4c6',
      text: '#2a170c', muted: '#5a4030', accent: '#b04a1e', border: '#cfb48c',
    },
    fonts: { display: 'Montserrat', body: 'Inter' },
    background: { type: 'gradient', from: '#f3e6d0', to: '#dcc19a', angle: 170 },
  },
  {
    id: 'metal',
    name: 'Brushed Metal',
    colors: {
      background: '#1b1e21', tile: '#2b3035', tileHover: '#394047',
      text: '#f3f5f6', muted: '#bfc7cd', accent: '#a9c3da', border: '#4c555d',
    },
    fonts: { display: 'Roboto Condensed', body: 'Roboto Condensed' },
    background: { type: 'gradient', from: '#353b41', to: '#141619', angle: 165 },
  },
  {
    id: 'black',
    name: 'Black',
    colors: {
      background: '#000000', tile: '#121212', tileHover: '#222222',
      text: '#ffffff', muted: '#b8b8b8', accent: '#ffffff', border: '#2c2c2c',
    },
    fonts: { display: 'Inter', body: 'Inter' },
    background: { type: 'solid' },
  },
];

export function allThemes(room) {
  return [...PRESETS, ...(room.theme.custom || [])];
}

export function findTheme(room) {
  return allThemes(room).find((t) => t.id === room.theme.active) || PRESETS[0];
}
