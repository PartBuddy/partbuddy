/**
 * Mock data for the prototype. Feature and parameter lists mirror the fixture script
 * (tools/fixtures/cable-clip.script.json); values are the script's nominal values.
 */

export type FeatureKind = 'box' | 'fillet' | 'chamfer' | 'cylinder' | 'hole';
export type Operation = 'new' | 'join' | 'cut';

export interface Feature {
  /** SolidCraft feature id; face names start with it (F5:side#1). */
  id: string;
  name: string;
  kind: FeatureKind;
  operation: Operation;
}

export const timeline: Feature[] = [
  { id: 'F1', name: 'BasePlate', kind: 'box', operation: 'new' },
  { id: 'F2', name: 'PlateCorners', kind: 'fillet', operation: 'new' },
  { id: 'F3', name: 'PlateEdgeChamfer', kind: 'chamfer', operation: 'new' },
  { id: 'F4', name: 'ClipBlock', kind: 'box', operation: 'join' },
  { id: 'F5', name: 'CableChannel', kind: 'cylinder', operation: 'cut' },
  { id: 'F6', name: 'SnapOpening', kind: 'box', operation: 'cut' },
  { id: 'F7', name: 'ClipTopRounds', kind: 'fillet', operation: 'new' },
  { id: 'F8', name: 'MountHoleRight', kind: 'hole', operation: 'cut' },
  { id: 'F9', name: 'MountHoleLeft', kind: 'hole', operation: 'cut' },
];

export type ParameterRole = 'nominal' | 'compensation';

export interface Parameter {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  role: ParameterRole;
  favorite: boolean;
}

export const parameters: Parameter[] = [
  { name: 'cable_d_nominal', value: 12, min: 6, max: 16, step: 0.5, role: 'nominal', favorite: true },
  { name: 'slot_width', value: 9, min: 5, max: 12, step: 0.5, role: 'nominal', favorite: true },
  { name: 'base_length', value: 64, min: 50, max: 90, step: 1, role: 'nominal', favorite: true },
  { name: 'base_width', value: 32, min: 26, max: 48, step: 1, role: 'nominal', favorite: true },
  { name: 'base_thickness', value: 4, min: 3, max: 6, step: 0.2, role: 'nominal', favorite: false },
  { name: 'clip_height', value: 16, min: 14, max: 24, step: 0.5, role: 'nominal', favorite: false },
  { name: 'hole_spacing', value: 48, min: 36, max: 70, step: 1, role: 'nominal', favorite: false },
  { name: 'komp_channel', value: 0, min: -0.5, max: 0.5, step: 0.05, role: 'compensation', favorite: false },
];

export type VerificationLevel = 'R' | 'L' | 'TG' | 'SC' | 'SL' | 'PD';
export const verificationLevels: VerificationLevel[] = ['R', 'L', 'TG', 'SC', 'SL', 'PD'];

export interface Project {
  id: string;
  name: string;
  part: string;
  version: string;
  levels: VerificationLevel[];
  printRecords: number;
  state: 'active' | 'waiting' | 'done';
}

export const projects: Project[] = [
  { id: 'cable-clip', name: 'Cable clip', part: 'cable-clip', version: '0.1.0', levels: ['L', 'TG', 'SC'], printRecords: 0, state: 'active' },
  { id: 'shelf-bracket', name: 'Shelf bracket', part: 'bracket', version: '1.2.0', levels: ['L', 'TG', 'SC', 'SL', 'PD'], printRecords: 3, state: 'done' },
  { id: 'desk-grommet', name: 'Desk grommet', part: 'grommet', version: '0.2.0', levels: ['L', 'TG', 'SC', 'SL'], printRecords: 0, state: 'waiting' },
  { id: 'hinge-study', name: 'Hinge study', part: 'hinge', version: '0.0.1', levels: ['R'], printRecords: 0, state: 'active' },
];

export const designRevision = 14;
