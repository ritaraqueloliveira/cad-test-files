# CAD test files with known answers

Small 3D/CAD files for testing viewers, converters and feature-recognition code. Each file comes with the numbers a correct program should report, and with the script that generates it, so you can change the part and get a new file with new known answers.

Made for testing [Viquis 3D](https://www.viquis.com/en/), a 3D and CAD file viewer. Free to use for any purpose.

The same part, a plate with holes, in five formats:

| File | Format | Geometry | Units and up axis | Size |
|---|---|---|---|---|
| `plate-with-holes.stp` | STEP AP214 | exact solid (`ADVANCED_BREP`) | millimetres, Z up | 23 KB |
| `plate-with-holes.igs` | IGES 5.3 | 23 trimmed surfaces (type 144), not a solid | millimetres, Z up | 80 KB |
| `plate-with-holes.stl` | STL, binary | closed triangle mesh | none stored (the numbers are millimetres), Z up | 201 KB |
| `plate-with-holes.3mf` | 3MF core | closed triangle mesh | millimetres, Z up | 33 KB |
| `plate-with-holes.glb` | glTF 2.0 binary | closed triangle mesh | **metres, Y up** | 49 KB |

## The part

A plate with through holes, blind holes and a cylindrical boss. In the STEP file all faces are exact planes and cylinders, so a program that reads the geometry should get these values exactly.

| What | Expected |
|---|---|
| Bounding box | 120 × 80 × 25 mm (plate 120 × 80 × 15, plus a boss 10 mm high) |
| Solids | 1 |
| Faces | 23: 12 planes and 11 cylinders |
| Boss | Ø 16 × 10 mm, centre at (60, 15), on the top face |
| Volume of the exact solid | 134 922.525 mm³ |

Holes, all along Z, drilled from the top face of the plate (Z = 15):

| Ø (mm) | Depth (mm) | Type | Count | Centres (X, Y) |
|---|---|---|---|---|
| 4.2 | 10 | blind | 3 | (30, 65) (60, 65) (90, 65) |
| 6.6 | 15 | through | 4 | (10, 10) (110, 10) (10, 70) (110, 70) |
| 10 | 8 | blind | 2 | (40, 40) (80, 40) |
| 25 | 15 | through | 1 | (60, 40) |

Things the part is good at catching:

- holes counted twice (once per cylindrical half or per edge loop);
- a boss reported as a hole (it is a cylinder too, but convex);
- blind holes reported as through holes, or with the wrong depth;
- the Ø 25 hole and the two Ø 10 holes next to it being merged;
- wrong units (the STEP file declares millimetres).

## The mesh files (STL, 3MF, GLB)

The three files hold the same mesh. Every circle is a regular polygon with 64 sides, so these numbers are exact for the mesh, not approximations:

| What | Expected |
|---|---|
| Triangles | 4020 |
| Vertices (after merging equal ones) | 2002 |
| Closed, every edge shared by exactly two triangles | yes |
| Separate shells | 1 |
| Through holes (genus) | 5 |
| Volume | 134 937.100 mm³ |
| Surface area | 27 783.066 mm² |

The volume is larger than the exact solid's (134 922.525 mm³) because a polygon drawn inside a circle removes less material than the circle.

What each format adds as a test:

- **STL** stores every triangle on its own (12 060 vertices in the file) and has no units. A reader has to merge equal vertices to see that the mesh is closed.
- **3MF** stores the 2002 shared vertices and says `unit="millimeter"`.
- **GLB** follows the glTF rules: metres and Y up. The bounding box is 0.120 × 0.025 × 0.080, and the boss points to +Y. A program that takes the numbers as millimetres shows a part a thousand times too small. The file has no normals; the glTF specification says a viewer must then use flat shading.

## The IGES file

`plate-with-holes.igs` was converted from the STEP file with OpenCASCADE 8.0 (trimmed-surface mode). It has 23 trimmed surfaces: 12 planes and 11 surfaces of revolution (the cylinders). IGES in this mode carries no solid, so a reader has to sew the faces to get one. The bounding box and the holes are the same as in the STEP file. Checked only by reading it back with OpenCASCADE.

## The generators

Both need only Node.js, no packages:

```
node make-plate.mjs my-plate.stp
node make-meshes.mjs output-folder
```

`make-plate.mjs` writes the STEP file; its comments are in Portuguese. `make-meshes.mjs` writes the STL, 3MF and GLB, checks that the mesh is closed and has the expected volume, and prints the numbers in the table above. The plate size, the list of holes and the boss are at the top of each file; if you change one, change the other too.

The IGES file has no generator here: it needs a CAD kernel.

## Licence

The files in this repository are released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): use them for anything, no credit needed.
