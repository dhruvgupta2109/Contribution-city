// Adapted from Git City, Samuel Rizzon. SPDX-License-Identifier: AGPL-3.0-only
// Reference: src/components/city/theme.tsx. See NOTICE.
export interface CityTheme {
  name: string;
  sky: [number, string][];
  fog: string;
  ground: string;
  sidewalk: string;
  face: string;
  roof: string;
  off: string;
  windows: string[];
  accent: string;
  road: string;
}
export const CITY_THEMES: CityTheme[] = [
  {
    name: 'Emerald',
    sky: [
      [0, '#000804'],
      [0.15, '#001408'],
      [0.3, '#002810'],
      [0.42, '#003c1c'],
      [0.52, '#004828'],
      [0.6, '#003820'],
      [0.75, '#002014'],
      [0.9, '#001008'],
      [1, '#000604'],
    ],
    fog: '#0a2014',
    ground: '#1e3020',
    sidewalk: '#404848',
    face: '#0c1810',
    roof: '#1e4028',
    off: '#060e08',
    windows: ['#0e4429', '#006d32', '#26a641', '#39d353', '#c8e64a'],
    accent: '#c8e64a',
    road: '#60c080',
  },
  {
    name: 'Midnight',
    sky: [
      [0, '#000206'],
      [0.15, '#020814'],
      [0.3, '#061428'],
      [0.45, '#0c2040'],
      [0.55, '#102850'],
      [0.65, '#0c2040'],
      [0.8, '#061020'],
      [1, '#020608'],
    ],
    fog: '#0a1428',
    ground: '#242c38',
    sidewalk: '#484c58',
    face: '#101828',
    roof: '#2a3858',
    off: '#0c0e18',
    windows: ['#a0c0f0', '#80a0e0', '#6080c8', '#c0d8f8', '#e0e8ff'],
    accent: '#6090e0',
    road: '#8090a0',
  },
  {
    name: 'Sunset',
    sky: [
      [0, '#0c0614'],
      [0.15, '#1c0e30'],
      [0.28, '#3a1850'],
      [0.38, '#6a3060'],
      [0.46, '#a05068'],
      [0.52, '#d07060'],
      [0.57, '#e89060'],
      [0.62, '#f0b070'],
      [0.68, '#f0c888'],
      [0.75, '#c08060'],
      [0.85, '#603030'],
      [1, '#180c10'],
    ],
    fog: '#80405a',
    ground: '#3a3038',
    sidewalk: '#585058',
    face: '#281828',
    roof: '#604050',
    off: '#1a1018',
    windows: ['#f8d880', '#f0b860', '#e89840', '#d07830', '#f0c060'],
    accent: '#c8e64a',
    road: '#d0a840',
  },
  {
    name: 'Neon',
    sky: [
      [0, '#06001a'],
      [0.15, '#100028'],
      [0.3, '#200440'],
      [0.42, '#380650'],
      [0.52, '#500860'],
      [0.6, '#380648'],
      [0.75, '#180230'],
      [0.9, '#0c0118'],
      [1, '#06000c'],
    ],
    fog: '#1a0830',
    ground: '#2c2038',
    sidewalk: '#484058',
    face: '#180830',
    roof: '#3c1858',
    off: '#0a0814',
    windows: ['#ff40c0', '#c040ff', '#00e0ff', '#40ff80', '#ff8040'],
    accent: '#e040c0',
    road: '#c060e0',
  },
];
