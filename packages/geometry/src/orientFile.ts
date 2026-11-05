import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Vector3 } from 'three';

import { orientationQuaternion, type Down } from './orientation';

/**
 * Turns an exported mesh file into the print orientation (M7) and sets it onto the bed (lowest
 * point at z 0), so the slicer opens it lying the way PartBuddy checked it. The vertices are
 * turned themselves instead of a 3MF build transform, which every slicer reads the same way.
 */
export function orientMeshFile(format: '3mf' | 'stl', data: Uint8Array, down: Down): Uint8Array {
  return format === '3mf' ? orient3mf(data, down) : orientStl(data, down);
}

const VERTEX = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*\/>/g;

function orient3mf(data: Uint8Array, down: Down): Uint8Array {
  const files = unzipSync(data);
  const q = orientationQuaternion(down);
  const v = new Vector3();
  const models = Object.keys(files).filter((name) => /\.model$/i.test(name));
  // The lowest point over all models, so several bodies keep their places relative to each other.
  let minZ = Infinity;
  for (const name of models) {
    for (const match of strFromU8(files[name] ?? new Uint8Array()).matchAll(VERTEX)) {
      v.set(Number(match[1]), Number(match[2]), Number(match[3])).applyQuaternion(q);
      minZ = Math.min(minZ, v.z);
    }
  }
  const lift = Number.isFinite(minZ) ? -minZ : 0;
  for (const name of models) {
    const text = strFromU8(files[name] ?? new Uint8Array()).replace(VERTEX, (_all, x: string, y: string, z: string) => {
      v.set(Number(x), Number(y), Number(z)).applyQuaternion(q);
      return `<vertex x="${fmt(v.x)}" y="${fmt(v.y)}" z="${fmt(v.z + lift)}"/>`;
    });
    files[name] = strToU8(text);
  }
  return zipSync(files);
}

const fmt = (value: number) => String(Math.round(value * 1e6) / 1e6);

function orientStl(data: Uint8Array, down: Down): Uint8Array {
  const q = orientationQuaternion(down);
  const count = data.length >= 84 ? new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(80, true) : -1;
  if (count >= 0 && data.length === 84 + count * 50) return orientBinaryStl(data, count, q);
  return orientAsciiStl(data, q);
}

function orientBinaryStl(data: Uint8Array, count: number, q: ReturnType<typeof orientationQuaternion>): Uint8Array {
  const out = data.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const v = new Vector3();
  let minZ = Infinity;
  for (let t = 0; t < count; t += 1) {
    const base = 84 + t * 50;
    for (let k = 0; k < 4; k += 1) {
      const at = base + k * 12;
      v.set(view.getFloat32(at, true), view.getFloat32(at + 4, true), view.getFloat32(at + 8, true)).applyQuaternion(q);
      view.setFloat32(at, v.x, true);
      view.setFloat32(at + 4, v.y, true);
      view.setFloat32(at + 8, v.z, true);
      if (k > 0) minZ = Math.min(minZ, v.z);
    }
  }
  if (Number.isFinite(minZ)) {
    for (let t = 0; t < count; t += 1) {
      for (let k = 1; k < 4; k += 1) {
        const at = 84 + t * 50 + k * 12 + 8;
        view.setFloat32(at, view.getFloat32(at, true) - minZ, true);
      }
    }
  }
  return out;
}

const ASCII_VECTOR = /(facet normal|vertex)\s+(\S+)\s+(\S+)\s+(\S+)/g;

function orientAsciiStl(data: Uint8Array, q: ReturnType<typeof orientationQuaternion>): Uint8Array {
  const v = new Vector3();
  const text = strFromU8(data);
  let minZ = Infinity;
  for (const match of text.matchAll(ASCII_VECTOR)) {
    if (match[1] !== 'vertex') continue;
    v.set(Number(match[2]), Number(match[3]), Number(match[4])).applyQuaternion(q);
    minZ = Math.min(minZ, v.z);
  }
  const lift = Number.isFinite(minZ) ? -minZ : 0;
  const turned = text.replace(ASCII_VECTOR, (_all, kind: string, x: string, y: string, z: string) => {
    v.set(Number(x), Number(y), Number(z)).applyQuaternion(q);
    const dz = kind === 'vertex' ? lift : 0;
    return `${kind} ${fmt(v.x)} ${fmt(v.y)} ${fmt(v.z + dz)}`;
  });
  return strToU8(turned);
}
