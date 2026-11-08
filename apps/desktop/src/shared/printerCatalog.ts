/**
 * Known printers for »Add printer« in the settings: build volume X, Y, Z in mm, the nozzle it ships
 * with and the maker's default layer height (0.2 where the maker names none). Taken from the
 * makers' own data sheets, not from slicer profiles; a pick is copied into an ordinary profile.
 */
export interface CatalogPrinter {
  brand: string;
  model: string;
  bed: readonly [number, number, number];
  nozzle: number;
  layer: number;
  /** The maker's page the values come from. */
  source: string;
  /** When the values were last checked against it, YYYY-MM-DD. */
  checked: string;
}

export const PRINTER_CATALOG: readonly CatalogPrinter[] = [
  { brand: 'Bambu Lab', model: 'X1 Carbon', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, source: 'https://public-cdn.bambulab.com/store/bambulab-X1-carbon-tech-specs.pdf', checked: '2026-11-08' },
  { brand: 'Bambu Lab', model: 'P1S', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, source: 'https://wiki.bambulab.com/en/p1/manual/faq', checked: '2026-11-08' },
  { brand: 'Bambu Lab', model: 'P2S', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, source: 'https://bambulab.com/en/p2s/specs', checked: '2026-11-08' },
  { brand: 'Bambu Lab', model: 'A1', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, source: 'https://bambulab.com/en/a1/tech-specs', checked: '2026-11-08' },
  { brand: 'Bambu Lab', model: 'A1 mini', bed: [180, 180, 180], nozzle: 0.4, layer: 0.2, source: 'https://bambulab.com/en/a1-mini/tech-specs', checked: '2026-11-08' },
  { brand: 'Bambu Lab', model: 'H2D', bed: [325, 320, 325], nozzle: 0.4, layer: 0.2, source: 'https://bambulab.com/en/h2d/tech-specs', checked: '2026-11-08' },
  { brand: 'Bambu Lab', model: 'H2S', bed: [340, 320, 340], nozzle: 0.4, layer: 0.2, source: 'https://bambulab.com/en/h2s/tech-specs', checked: '2026-11-08' },
  { brand: 'Bambu Lab', model: 'H2C', bed: [325, 320, 320], nozzle: 0.4, layer: 0.2, source: 'https://bambulab.com/en/h2c/specs', checked: '2026-11-08' },
  { brand: 'Bambu Lab', model: 'X2D', bed: [256, 256, 260], nozzle: 0.4, layer: 0.2, source: 'https://bambulab.com/en/x2d/specs', checked: '2026-11-08' },
  { brand: 'Bambu Lab', model: 'H3C', bed: [330, 320, 325], nozzle: 0.4, layer: 0.2, source: 'https://bambulab.com/en/h3c/specs', checked: '2026-11-08' },
  { brand: 'Prusa', model: 'MK4S', bed: [250, 210, 220], nozzle: 0.4, layer: 0.2, source: 'https://www.prusa3d.com/product/original-prusa-mk4s-3d-printer-5/', checked: '2026-11-08' },
  { brand: 'Prusa', model: 'CORE One', bed: [250, 220, 270], nozzle: 0.4, layer: 0.2, source: 'https://www.prusa3d.com/product/prusa-core-one/', checked: '2026-11-08' },
  { brand: 'Prusa', model: 'CORE One L', bed: [300, 300, 330], nozzle: 0.4, layer: 0.2, source: 'https://www.prusa3d.com/product/prusa-core-one-l/', checked: '2026-11-08' },
  { brand: 'Prusa', model: 'XL', bed: [360, 360, 360], nozzle: 0.4, layer: 0.2, source: 'https://www.prusa3d.com/product/original-prusa-xl-assembled-single-toolhead-3d-printer/', checked: '2026-11-08' },
  { brand: 'Creality', model: 'K1 Max', bed: [300, 300, 300], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/products/creality-k1-max-3d-printer', checked: '2026-11-08' },
  { brand: 'Creality', model: 'K2 Plus', bed: [350, 350, 350], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/products/creality-k2-plus-cfs-combo', checked: '2026-11-08' },
  { brand: 'Creality', model: 'K2 Pro', bed: [300, 300, 300], nozzle: 0.4, layer: 0.2, source: 'https://store.creality.com/products/k2-pro-combo-3d-printer', checked: '2026-11-08' },
  { brand: 'Creality', model: 'K2', bed: [260, 260, 260], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/products/k2-series-3d-printer', checked: '2026-11-08' },
  { brand: 'Creality', model: 'K2 SE', bed: [220, 215, 245], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/products/k2-se', checked: '2026-11-08' },
  { brand: 'Creality', model: 'K3', bed: [260, 260, 260], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/products/k3', checked: '2026-11-08' },
  { brand: 'Creality', model: 'SparkX i7', bed: [260, 260, 255], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/products/sparkx-i7', checked: '2026-11-08' },
  { brand: 'Creality', model: 'Hi', bed: [260, 260, 300], nozzle: 0.4, layer: 0.2, source: 'https://store.creality.com/products/creality-hi-combo-3d-printer', checked: '2026-11-08' },
  { brand: 'Creality', model: 'Ender-5 Max', bed: [400, 400, 400], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/products/creality-ender-5-max', checked: '2026-11-08' },
  { brand: 'Creality', model: 'Ender-3 V3 Mega', bed: [420, 420, 420], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/products/ender-3-v3-mega', checked: '2026-11-08' },
  { brand: 'Creality', model: 'Ender-3 V3 SE', bed: [220, 220, 250], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/compare/compare-ender-3-v3-series', checked: '2026-11-08' },
  { brand: 'Creality', model: 'Ender-3 V3 KE', bed: [220, 220, 240], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/compare/compare-ender-3-v3-series', checked: '2026-11-08' },
  { brand: 'Creality', model: 'Ender-3 V3', bed: [220, 220, 250], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/compare/compare-ender-3-v3-series', checked: '2026-11-08' },
  { brand: 'Creality', model: 'Ender-3 V3 Plus', bed: [300, 300, 330], nozzle: 0.4, layer: 0.2, source: 'https://www.creality.com/compare/compare-ender-3-v3-series', checked: '2026-11-08' },
  { brand: 'Creality', model: 'Ender-3 V4', bed: [220, 220, 235], nozzle: 0.4, layer: 0.2, source: 'https://store.creality.com/blogs/all/ender-series-3d-printers-parameter-comparison', checked: '2026-11-08' },
  { brand: 'Elegoo', model: 'Centauri Carbon', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, source: 'https://www.elegoo.com/products/centauri-carbon', checked: '2026-11-08' },
  { brand: 'Elegoo', model: 'Centauri Carbon 2', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, source: 'https://www.elegoo.com/products/centauri-carbon-2', checked: '2026-11-08' },
  { brand: 'Elegoo', model: 'Centauri 2', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, source: 'https://www.elegoo.com/products/centauri-2', checked: '2026-11-08' },
  { brand: 'Elegoo', model: 'Neptune 4', bed: [225, 225, 265], nozzle: 0.4, layer: 0.2, source: 'https://www.elegoo.com/products/elegoo-neptune-4-fdm-3d-printer', checked: '2026-11-08' },
  { brand: 'Elegoo', model: 'Neptune 4 Pro', bed: [225, 225, 265], nozzle: 0.4, layer: 0.2, source: 'https://www.elegoo.com/products/elegoo-neptune-4-pro-fdm-3d-printer', checked: '2026-11-08' },
  { brand: 'Elegoo', model: 'Neptune 4 Plus', bed: [320, 320, 385], nozzle: 0.4, layer: 0.2, source: 'https://www.elegoo.com/products/neptune-4-plus-fdm-3d-printer', checked: '2026-11-08' },
  { brand: 'Elegoo', model: 'Neptune 4 Max', bed: [420, 420, 480], nozzle: 0.4, layer: 0.2, source: 'https://www.elegoo.com/products/neptune-4-max-fdm-3d-printer', checked: '2026-11-08' },
  { brand: 'Elegoo', model: 'Neptune 3 Pro', bed: [225, 225, 280], nozzle: 0.4, layer: 0.2, source: 'https://www.elegoo.com/products/elegoo-neptune-3-pro-fdm-3d-printer-225x225x280mm', checked: '2026-11-08' },
  { brand: 'Elegoo', model: 'OrangeStorm Giga', bed: [800, 800, 1000], nozzle: 0.6, layer: 0.2, source: 'https://www.elegoo.com/products/orangestorm-giga', checked: '2026-11-08' },
  { brand: 'Anycubic', model: 'Kobra S1', bed: [250, 250, 250], nozzle: 0.4, layer: 0.2, source: 'https://uk.anycubic.com/products/kobra-s1', checked: '2026-11-08' },
  { brand: 'Anycubic', model: 'Kobra S1 Max', bed: [350, 350, 350], nozzle: 0.4, layer: 0.2, source: 'https://store.anycubic.com/products/kobra-s1-max', checked: '2026-11-08' },
  { brand: 'Anycubic', model: 'Kobra X', bed: [260, 260, 260], nozzle: 0.4, layer: 0.2, source: 'https://store.anycubic.com/products/kobra-x', checked: '2026-11-08' },
  { brand: 'Anycubic', model: 'Kobra 4', bed: [260, 260, 260], nozzle: 0.4, layer: 0.2, source: 'https://store.anycubic.com/products/kobra-4-3d-printer', checked: '2026-11-08' },
  { brand: 'Anycubic', model: 'Kobra 3 V2', bed: [255, 255, 260], nozzle: 0.4, layer: 0.2, source: 'https://store.anycubic.com/products/kobra-3-v2', checked: '2026-11-08' },
  { brand: 'Anycubic', model: 'Kobra 3 Max V2', bed: [420, 420, 500], nozzle: 0.4, layer: 0.2, source: 'https://store.anycubic.com/products/kobra-3-max-v2-3d-printer', checked: '2026-11-08' },
  { brand: 'Sovol', model: 'SV06 ACE', bed: [220, 220, 250], nozzle: 0.4, layer: 0.2, source: 'https://www.sovol3d.com/products/sovol-sv06-ace', checked: '2026-11-08' },
  { brand: 'Sovol', model: 'SV08', bed: [350, 350, 345], nozzle: 0.4, layer: 0.2, source: 'https://www.sovol3d.com/products/sovol-sv08-3d-printer', checked: '2026-11-08' },
  { brand: 'Sovol', model: 'SV08 MAX', bed: [500, 500, 500], nozzle: 0.4, layer: 0.2, source: 'https://www.sovol3d.com/products/sovol-sv08-max-3d-printer', checked: '2026-11-08' },
  { brand: 'Sovol', model: 'M1D', bed: [300, 300, 350], nozzle: 0.4, layer: 0.2, source: 'https://www.sovol3d.com/products/sovol-m1d-3d-printer', checked: '2026-11-08' },
  { brand: 'Qidi', model: 'Q1 Pro', bed: [245, 245, 240], nozzle: 0.4, layer: 0.2, source: 'https://qidi3d.com/products/q1-pro-3d-printer', checked: '2026-11-08' },
  { brand: 'Qidi', model: 'Q2', bed: [270, 270, 256], nozzle: 0.4, layer: 0.2, source: 'https://qidi3d.com/products/qidi-q2', checked: '2026-11-08' },
  { brand: 'Qidi', model: 'Plus4', bed: [305, 305, 280], nozzle: 0.4, layer: 0.2, source: 'https://qidi3d.com/products/plus4-3d-printer', checked: '2026-11-08' },
  { brand: 'Qidi', model: 'X-Max 3', bed: [325, 325, 315], nozzle: 0.4, layer: 0.2, source: 'https://qidi3d.com/products/qidi-x-max-3', checked: '2026-11-08' },
  { brand: 'Flashforge', model: 'Adventurer 5M', bed: [220, 220, 220], nozzle: 0.4, layer: 0.2, source: 'https://www.flashforge.com/products/adventurer-5m-3d-printer', checked: '2026-11-08' },
  { brand: 'Flashforge', model: 'Adventurer 5M Pro', bed: [220, 220, 220], nozzle: 0.4, layer: 0.2, source: 'https://www.flashforge.com/products/adventurer-5m-pro-3d-printer', checked: '2026-11-08' },
  { brand: 'Flashforge', model: 'AD5X', bed: [220, 220, 220], nozzle: 0.4, layer: 0.2, source: 'https://www.flashforge.com/products/flashforge-ad5x-3d-printer', checked: '2026-11-08' },
  { brand: 'Flashforge', model: 'Creator 5', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, source: 'https://www.flashforge.com/products/flashforge-creator-5', checked: '2026-11-08' },
  { brand: 'Flashforge', model: 'Creator 5 Pro', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, source: 'https://www.flashforge.com/products/flashforge-creator-5-pro', checked: '2026-11-08' },
  { brand: 'Artillery', model: 'Sidewinder X3 Plus', bed: [300, 300, 400], nozzle: 0.4, layer: 0.2, source: 'https://eu.artillery3d.com/products/artillery-sidewinder-x3-plus', checked: '2026-11-08' },
  { brand: 'Artillery', model: 'Sidewinder X4 Plus', bed: [300, 300, 400], nozzle: 0.4, layer: 0.2, source: 'https://eu.artillery3d.com/products/sidewinder-x4-plus', checked: '2026-11-08' },
  { brand: 'Artillery', model: 'Sidewinder X4 Pro', bed: [240, 240, 260], nozzle: 0.4, layer: 0.2, source: 'https://eu.artillery3d.com/products/sidewinder-x4-pro', checked: '2026-11-08' },
  { brand: 'Artillery', model: 'M1 Pro', bed: [260, 260, 260], nozzle: 0.4, layer: 0.2, source: 'https://eu.artillery3d.com/products/m1-pro-s1', checked: '2026-11-08' },
  { brand: 'Voron', model: '2.4 250', bed: [250, 250, 210], nozzle: 0.4, layer: 0.2, source: 'https://github.com/VoronDesign/Voron-2/blob/Voron2.4/firmware/klipper_configurations/Octopus/Voron2_Octopus_Config.cfg', checked: '2026-11-08' },
  { brand: 'Voron', model: '2.4 300', bed: [300, 300, 260], nozzle: 0.4, layer: 0.2, source: 'https://github.com/VoronDesign/Voron-2/blob/Voron2.4/firmware/klipper_configurations/Octopus/Voron2_Octopus_Config.cfg', checked: '2026-11-08' },
  { brand: 'Voron', model: '2.4 350', bed: [350, 350, 310], nozzle: 0.4, layer: 0.2, source: 'https://github.com/VoronDesign/Voron-2/blob/Voron2.4/firmware/klipper_configurations/Octopus/Voron2_Octopus_Config.cfg', checked: '2026-11-08' },
  { brand: 'Voron', model: 'Trident 250', bed: [250, 250, 250], nozzle: 0.4, layer: 0.2, source: 'https://github.com/VoronDesign/Voron-Trident', checked: '2026-11-08' },
  { brand: 'Voron', model: 'Trident 300', bed: [300, 300, 250], nozzle: 0.4, layer: 0.2, source: 'https://github.com/VoronDesign/Voron-Trident', checked: '2026-11-08' },
  { brand: 'Voron', model: 'Trident 350', bed: [350, 350, 250], nozzle: 0.4, layer: 0.2, source: 'https://github.com/VoronDesign/Voron-Trident', checked: '2026-11-08' },
  { brand: 'Voron', model: '0.2', bed: [120, 120, 120], nozzle: 0.4, layer: 0.2, source: 'https://github.com/VoronDesign/Voron-0', checked: '2026-11-08' },
  { brand: 'RatRig', model: 'V-Core 4.1 300', bed: [300, 300, 300], nozzle: 0.4, layer: 0.2, source: 'https://ratrig.com/products/rat-rig-v-core-4-1', checked: '2026-11-08' },
  { brand: 'RatRig', model: 'V-Core 4.1 400', bed: [400, 400, 400], nozzle: 0.4, layer: 0.2, source: 'https://ratrig.com/products/rat-rig-v-core-4-1', checked: '2026-11-08' },
  { brand: 'RatRig', model: 'V-Core 4.1 500', bed: [500, 500, 500], nozzle: 0.4, layer: 0.2, source: 'https://ratrig.com/products/rat-rig-v-core-4-1', checked: '2026-11-08' },
];
