// Gera um STEP (AP214) de uma placa com furos passantes, cegos e um ressalto cilíndrico, para testar os furos.
import fs from 'node:fs';
const [W, H, T] = [120, 80, 15];
const furos = [
  ...[[10, 10], [110, 10], [10, 70], [110, 70]].map(([x, y]) => ({ x, y, r: 3.3, fundo: 0 })),   // 4 × Ø6,6 passantes
  { x: 40, y: 40, r: 5, fundo: T - 8 }, { x: 80, y: 40, r: 5, fundo: T - 8 },                 // 2 × Ø10 cegos prof 8
  { x: 60, y: 40, r: 12.5, fundo: 0 },                                                        // Ø25 passante
  ...[30, 60, 90].map(x => ({ x, y: 65, r: 2.1, fundo: T - 10 }))                             // 3 × Ø4,2 cegos prof 10
];
const ressalto = { x: 60, y: 15, r: 8, h: 10 };                                                // veio Ø16 × 10
let n = 100; const L = [];
const ent = s => { const id = ++n; L.push(`#${id}=${s};`); return id; };
const num = v => { const s = Number(v).toFixed(6).replace(/0+$/, ''); return s.endsWith('.') ? s : s; };
const pt = p => ent(`CARTESIAN_POINT('',(${p.map(num).join(',')}))`);
const dir = d => ent(`DIRECTION('',(${d.map(num).join(',')}))`);
const ax = (o, z, x) => ent(`AXIS2_PLACEMENT_3D('',#${pt(o)},#${dir(z)},#${dir(x)})`);
const vtx = p => ent(`VERTEX_POINT('',#${pt(p)})`);
const lineEdge = (va, vb, a, b) => {
  const d = b.map((v, i) => v - a[i]), l = Math.hypot(...d);
  const ln = ent(`LINE('',#${pt(a)},#${ent(`VECTOR('',#${dir(d.map(v => v / l))},1.)`)})`);
  return ent(`EDGE_CURVE('',#${va},#${vb},#${ln},.T.)`);
};
const circEdge = (c, r, z) => {
  const v = vtx([c[0] + r, c[1], z]);
  const cr = ent(`CIRCLE('',#${ax([c[0], c[1], z], [0, 0, 1], [1, 0, 0])},${num(r)})`);
  return { e: ent(`EDGE_CURVE('',#${v},#${v},#${cr},.T.)`), v };
};
const oe = (e, s) => ent(`ORIENTED_EDGE('',*,*,#${e},${s ? '.T.' : '.F.'})`);
const loop = oes => ent(`EDGE_LOOP('',(${oes.map(x => '#' + x).join(',')}))`);
const face = (bounds, surf, sense) => ent(`ADVANCED_FACE('',(${bounds.map((b, i) => `#${ent(`${i ? 'FACE_BOUND' : 'FACE_OUTER_BOUND'}('',#${b},.T.)`)}`).join(',')}),#${surf},${sense ? '.T.' : '.F.'})`);
const plane = (o, z, x) => ent(`PLANE('',#${ax(o, z, x)})`);

// caixa
const C = {}, P = {};
for (const [k, p] of Object.entries({ a: [0, 0, 0], b: [W, 0, 0], c: [W, H, 0], d: [0, H, 0], e: [0, 0, T], f: [W, 0, T], g: [W, H, T], h: [0, H, T] })){ P[k] = p; C[k] = vtx(p); }
const arestas = new Map();
const lado = (p, q) => {   // aresta da caixa de p para q (cria uma vez); devolve a orientada
  const ch = [p, q].sort().join('');
  if (!arestas.has(ch)) arestas.set(ch, { e: lineEdge(C[p], C[q], P[p], P[q]), ini: p });
  const a = arestas.get(ch);
  return oe(a.e, a.ini === p);
};
const caminho = ks => ks.map((k, i) => lado(k, ks[(i + 1) % ks.length]));
const faces = [];
const furosTopo = [], furosBaixo = [];
for (const f of furos){
  const cima = circEdge([f.x, f.y], f.r, T), baixo = circEdge([f.x, f.y], f.r, f.fundo);
  const costura = lineEdge(baixo.v, cima.v, [f.x + f.r, f.y, f.fundo], [f.x + f.r, f.y, T]);
  furosTopo.push(loop([oe(cima.e, false)]));
  if (f.fundo === 0) furosBaixo.push(loop([oe(baixo.e, true)]));
  else faces.push(face([loop([oe(baixo.e, true)])], plane([f.x, f.y, f.fundo], [0, 0, 1], [1, 0, 0]), true));     // fundo do furo cego
  const cil = ent(`CYLINDRICAL_SURFACE('',#${ax([f.x, f.y, f.fundo], [0, 0, 1], [1, 0, 0])},${num(f.r)})`);
  faces.push(face([loop([oe(costura, true), oe(cima.e, true), oe(costura, false), oe(baixo.e, false)])], cil, false));
}
// ressalto (veio) em cima
{
  const { x, y, r, h } = ressalto;
  const b = circEdge([x, y], r, T), c = circEdge([x, y], r, T + h);
  const costura = lineEdge(b.v, c.v, [x + r, y, T], [x + r, y, T + h]);
  furosTopo.push(loop([oe(b.e, false)]));
  const cil = ent(`CYLINDRICAL_SURFACE('',#${ax([x, y, T], [0, 0, 1], [1, 0, 0])},${num(r)})`);
  faces.push(face([loop([oe(b.e, true), oe(costura, true), oe(c.e, false), oe(costura, false)])], cil, true));
  faces.push(face([loop([oe(c.e, true)])], plane([x, y, T + h], [0, 0, 1], [1, 0, 0]), true));
}
faces.push(face([loop(caminho(['e', 'f', 'g', 'h'])), ...furosTopo], plane([0, 0, T], [0, 0, 1], [1, 0, 0]), true));
faces.push(face([loop(caminho(['a', 'd', 'c', 'b'])), ...furosBaixo], plane([0, 0, 0], [0, 0, -1], [1, 0, 0]), true));
faces.push(face([loop(caminho(['a', 'b', 'f', 'e']))], plane([0, 0, 0], [0, -1, 0], [1, 0, 0]), true));
faces.push(face([loop(caminho(['b', 'c', 'g', 'f']))], plane([W, 0, 0], [1, 0, 0], [0, 1, 0]), true));
faces.push(face([loop(caminho(['c', 'd', 'h', 'g']))], plane([0, H, 0], [0, 1, 0], [-1, 0, 0]), true));
faces.push(face([loop(caminho(['d', 'a', 'e', 'h']))], plane([0, 0, 0], [-1, 0, 0], [0, -1, 0]), true));
const shell = ent(`CLOSED_SHELL('',(${faces.map(f => '#' + f).join(',')}))`);
const brep = ent(`MANIFOLD_SOLID_BREP('placa',#${shell})`);
const orig = ax([0, 0, 0], [0, 0, 1], [1, 0, 0]);
const cab = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('placa de teste dos furos'),'2;1');
FILE_NAME('placa-furos-teste.stp','2026-10-29T00:00:00',(''),(''),'Viquis 3D','Viquis 3D','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
#1=APPLICATION_CONTEXT('core data for automotive mechanical design processes');
#2=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#1);
#3=PRODUCT_CONTEXT('',#1,'mechanical');
#4=PRODUCT('placa','placa','',(#3));
#5=PRODUCT_DEFINITION_FORMATION('','',#4);
#6=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');
#7=PRODUCT_DEFINITION('design','',#5,#6);
#8=PRODUCT_DEFINITION_SHAPE('','',#7);
#9=SHAPE_DEFINITION_REPRESENTATION(#8,#20);
#10=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));
#11=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));
#12=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());
#13=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#10,'distance_accuracy_value','');
#14=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#13))GLOBAL_UNIT_ASSIGNED_CONTEXT((#10,#11,#12))REPRESENTATION_CONTEXT('',''));
#20=ADVANCED_BREP_SHAPE_REPRESENTATION('placa',(#${brep},#${orig}),#14);
`;
fs.writeFileSync(process.argv[2], cab + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n');
console.log('faces', faces.length);
