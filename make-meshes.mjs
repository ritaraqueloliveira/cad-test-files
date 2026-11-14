// Writes the same plate as make-plate.mjs as a triangle mesh: STL (binary), 3MF and GLB.
//   node make-meshes.mjs [output-folder]
// Needs only Node.js 18 or newer, no packages. The output is the same on every run (no dates, no random numbers).
// The mesh is closed and every circle is a regular polygon with N sides, so the volume and the triangle count
// are known exactly; the script checks them before writing and prints them.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const N = 64;                                  // sides of every circle
const [W, H, T] = [120, 80, 15];               // plate, mm
const holes = [                                // floor = Z of the bottom of the hole (0 = through)
  ...[[10, 10], [110, 10], [10, 70], [110, 70]].map(([x, y]) => ({ x, y, r: 3.3, floor: 0 })),
  { x: 40, y: 40, r: 5, floor: T - 8 }, { x: 80, y: 40, r: 5, floor: T - 8 },
  { x: 60, y: 40, r: 12.5, floor: 0 },
  ...[30, 60, 90].map(x => ({ x, y: 65, r: 2.1, floor: T - 10 }))
];
const boss = { x: 60, y: 15, r: 8, h: 10 };

/* ---------- mesh with shared vertices ---------- */
const verts = [], tris = [], index = new Map();
const q = v => Math.round(v * 1e6) / 1e6;
const V = (x, y, z) => {
  const k = `${q(x)},${q(y)},${q(z)}`;
  if (!index.has(k)){ index.set(k, verts.length); verts.push([q(x), q(y), q(z)]); }
  return index.get(k);
};
const tri = (a, b, c, flip) => tris.push(flip ? [a, c, b] : [a, b, c]);
const ring = (c, z) => [...Array(N)].map((_, i) => V(c.x + c.r * Math.cos(2 * Math.PI * i / N), c.y + c.r * Math.sin(2 * Math.PI * i / N), z));
const dist = (a, b) => Math.hypot(verts[a][0] - verts[b][0], verts[a][1] - verts[b][1], verts[a][2] - verts[b][2]);

// Joins two closed rings that go the same way round (outer, inner), always taking the shorter diagonal.
function joinRings(outer, inner, flip){
  let best = 0;
  for (let j = 1; j < inner.length; j++) if (dist(outer[0], inner[j]) < dist(outer[0], inner[best])) best = j;
  const O = i => outer[i % outer.length], I = j => inner[(best + j) % inner.length];
  let i = 0, j = 0;
  while (i < outer.length || j < inner.length){
    const stepOuter = j >= inner.length || (i < outer.length && dist(O(i + 1), I(j)) <= dist(O(i), I(j + 1)));
    if (stepOuter){ tri(O(i), O(i + 1), I(j), flip); i++; }
    else { tri(O(i), I(j + 1), I(j), flip); j++; }
  }
}

// A flat face of the plate at height z with round openings. Each circle sits in its own square; the squares'
// edges are grid lines, the rest of the rectangle is filled with grid cells and each square is joined to its circle.
function cap(z, circles, up){
  const sq = circles.map(c => ({ ...c, h: c.r * 1.1 }));
  const uniq = a => [...new Set(a.map(q))].sort((m, n) => m - n);
  const xs = uniq([0, W, ...sq.flatMap(s => [s.x - s.h, s.x, s.x + s.h])]);
  const ys = uniq([0, H, ...sq.flatMap(s => [s.y - s.h, s.y, s.y + s.h])]);
  const e = 1e-7, inside = (s, x, y) => Math.abs(x - s.x) < s.h - e && Math.abs(y - s.y) < s.h - e;
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++){
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (sq.some(s => inside(s, cx, cy))) continue;
    const a = V(xs[i], ys[j], z), b = V(xs[i + 1], ys[j], z), c = V(xs[i + 1], ys[j + 1], z), d = V(xs[i], ys[j + 1], z);
    tri(a, b, c, !up); tri(a, c, d, !up);
  }
  for (const s of sq){
    const edge = [];
    for (const x of xs) for (const y of ys){
      const dx = Math.abs(x - s.x), dy = Math.abs(y - s.y);
      if (dx < s.h + e && dy < s.h + e && (dx > s.h - e || dy > s.h - e)) edge.push([x, y]);
    }
    const ang = p => { const a = Math.atan2(p[1] - s.y, p[0] - s.x); return a < -e ? a + 2 * Math.PI : a; };
    edge.sort((m, n) => ang(m) - ang(n));
    joinRings(edge.map(p => V(p[0], p[1], z)), ring(s, z), !up);
  }
}

// The wall of a cylinder between two heights; outward = the solid is inside the cylinder (the boss).
function wall(c, z0, z1, outward){
  const a = ring(c, z0), b = ring(c, z1);
  for (let i = 0; i < N; i++){
    const k = (i + 1) % N;
    tri(a[i], a[k], b[k], !outward); tri(a[i], b[k], b[i], !outward);
  }
}
function disc(c, z, up){
  const r = ring(c, z), m = V(c.x, c.y, z);
  for (let i = 0; i < N; i++) tri(m, r[i], r[(i + 1) % N], !up);
}
// A side of the plate: joins the points the top and bottom faces left on that edge.
function side(fixed, isX, outward){
  const along = z => verts.map((v, i) => [v, i]).filter(([v]) => v[2] === z && v[isX ? 0 : 1] === fixed)
    .sort((m, n) => m[0][isX ? 1 : 0] - n[0][isX ? 1 : 0]).map(([, i]) => i);
  const lo = along(0), hi = along(T);
  let i = 0, j = 0;
  while (i + 1 < lo.length || j + 1 < hi.length){
    const stepLo = j + 1 >= hi.length || (i + 1 < lo.length && dist(lo[i + 1], hi[j]) <= dist(lo[i], hi[j + 1]));
    if (stepLo){ tri(lo[i], lo[i + 1], hi[j], !outward); i++; }
    else { tri(lo[i], hi[j + 1], hi[j], !outward); j++; }
  }
}

cap(T, [...holes, boss], true);
cap(0, holes.filter(h => h.floor === 0), false);
for (const h of holes){
  wall(h, h.floor, T, false);
  if (h.floor > 0) disc(h, h.floor, true);
}
wall(boss, T, T + boss.h, true);
disc({ ...boss }, T + boss.h, true);
side(0, false, true);    // y = 0, looking from -Y: X grows to the right
side(W, true, true);     // x = W
side(H, false, false);   // y = H
side(0, true, false);    // x = 0

/* ---------- checks: closed, no flipped triangle, the volume the formula gives ---------- */
const edges = new Map();
for (const [a, b, c] of tris) for (const [m, n] of [[a, b], [b, c], [c, a]]){
  if (edges.has(`${m}>${n}`)) throw new Error('edge used twice in the same direction');
  edges.set(`${m}>${n}`, 1);
}
for (const k of edges.keys()){ const [m, n] = k.split('>'); if (!edges.has(`${n}>${m}`)) throw new Error('open edge'); }
let volume = 0, area = 0;
for (const [a, b, c] of tris){
  const [p, r, s] = [verts[a], verts[b], verts[c]];
  volume += (p[0] * (r[1] * s[2] - r[2] * s[1]) - p[1] * (r[0] * s[2] - r[2] * s[0]) + p[2] * (r[0] * s[1] - r[1] * s[0])) / 6;
  const u = [r[0] - p[0], r[1] - p[1], r[2] - p[2]], w = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const len = Math.hypot(...n);
  if (len < 1e-9) throw new Error('empty triangle');
  area += len / 2;
}
const poly = r => N / 2 * r * r * Math.sin(2 * Math.PI / N);          // area of a regular polygon with N sides
const expected = W * H * T - holes.reduce((s, h) => s + poly(h.r) * (T - h.floor), 0) + poly(boss.r) * boss.h;
if (Math.abs(volume - expected) > 1e-3) throw new Error(`volume ${volume}, expected ${expected}`);   // coordinates are rounded to 1e-6 mm
const exact = W * H * T - holes.reduce((s, h) => s + Math.PI * h.r * h.r * (T - h.floor), 0) + Math.PI * boss.r * boss.r * boss.h;

/* ---------- STL (binary, millimetres, Z up) ---------- */
function stl(){
  const b = Buffer.alloc(84 + tris.length * 50);
  b.write('plate-with-holes, millimetres, made by make-meshes.mjs', 0, 'ascii');
  b.writeUInt32LE(tris.length, 80);
  tris.forEach(([i, j, k], t) => {
    const [p, r, s] = [verts[i], verts[j], verts[k]], o = 84 + t * 50;
    const u = [r[0] - p[0], r[1] - p[1], r[2] - p[2]], w = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n);
    [...n.map(v => v / l), ...p, ...r, ...s].forEach((v, x) => b.writeFloatLE(v, o + x * 4));
  });
  return b;
}

/* ---------- 3MF (a zip with three files, millimetres, Z up) ---------- */
function threeMF(){
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <metadata name="Title">plate-with-holes</metadata>
 <resources>
  <object id="1" type="model" name="plate">
   <mesh>
    <vertices>
${verts.map(v => `     <vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join('\n')}
    </vertices>
    <triangles>
${tris.map(t => `     <triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join('\n')}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="1"/>
 </build>
</model>
`;
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`],
    ['3D/3dmodel.model', model]
  ]);
}
function zip(files){
  const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xFFFFFFFF; for (const x of buf) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files){
    const raw = Buffer.from(text, 'utf8'), data = zlib.deflateRawSync(raw, { level: 9 }), nm = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12);                       // 1980-01-01 00:00
    head.writeUInt32LE(crc(raw), 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(nm.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc(raw), 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nm.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(head, nm, data); central.push(cen, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

/* ---------- GLB (glTF 2.0: metres, Y up, so x→x, z→y, y→−z and everything ÷ 1000) ---------- */
function glb(){
  const pos = Buffer.alloc(verts.length * 12), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  verts.forEach((v, i) => [v[0] / 1000, v[2] / 1000, -v[1] / 1000].forEach((c, k) => {
    pos.writeFloatLE(c, i * 12 + k * 4);
    const f = pos.readFloatLE(i * 12 + k * 4);
    min[k] = Math.min(min[k], f); max[k] = Math.max(max[k], f);
  }));
  const idx = Buffer.alloc(Math.ceil(tris.length * 6 / 4) * 4);
  tris.flat().forEach((v, i) => idx.writeUInt16LE(v, i * 2));
  const bin = Buffer.concat([idx, pos]);
  let json = JSON.stringify({
    asset: { version: '2.0', generator: 'make-meshes.mjs' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'plate', mesh: 0 }],
    meshes: [{ name: 'plate', primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0, mode: 4 }] }],
    materials: [{ name: 'steel', pbrMetallicRoughness: { baseColorFactor: [0.72, 0.74, 0.78, 1], metallicFactor: 0.3, roughnessFactor: 0.6 } }],
    accessors: [
      { bufferView: 0, componentType: 5123, count: tris.length * 3, type: 'SCALAR' },
      { bufferView: 1, componentType: 5126, count: verts.length, type: 'VEC3', min, max }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: tris.length * 6, target: 34963 },
      { buffer: 0, byteOffset: idx.length, byteLength: pos.length, target: 34962 }
    ],
    buffers: [{ byteLength: bin.length }]
  });
  json += ' '.repeat((4 - Buffer.byteLength(json) % 4) % 4);
  const j = Buffer.from(json), head = Buffer.alloc(12), hj = Buffer.alloc(8), hb = Buffer.alloc(8);
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + j.length + bin.length, 8);
  hj.writeUInt32LE(j.length, 0); hj.writeUInt32LE(0x4E4F534A, 4);
  hb.writeUInt32LE(bin.length, 0); hb.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([head, hj, j, hb, bin]);
}

if (verts.length > 65535) throw new Error('too many vertices for 16-bit indices');
const out = process.argv[2] || '.';
fs.mkdirSync(out, { recursive: true });
for (const [name, data] of [['plate-with-holes.stl', stl()], ['plate-with-holes.3mf', threeMF()], ['plate-with-holes.glb', glb()]]){
  fs.writeFileSync(path.join(out, name), data);
  console.log(name, data.length, 'bytes');
}
console.log('triangles', tris.length, '· vertices', verts.length);
console.log('volume of the mesh', volume.toFixed(3), 'mm3 · of the exact solid', exact.toFixed(3), 'mm3');
console.log('surface area of the mesh', area.toFixed(3), 'mm2');
