# CAD test files with known answers

Small 3D/CAD files for testing viewers, converters and feature-recognition code. Each file comes with the numbers a correct program should report, and with the script that generates it, so you can change the part and get a new file with new known answers.

Made for testing [Viquis 3D](https://www.viquis.com/en/), a 3D and CAD file viewer. Free to use for any purpose.

## plate-with-holes.stp

A STEP AP214 file (23 KB) with one solid: a plate with through holes, blind holes and a cylindrical boss. All faces are exact planes and cylinders (an `ADVANCED_BREP`, not a mesh), so a program that reads the geometry should get these values exactly.

| What | Expected |
|---|---|
| Units | millimetres |
| Bounding box | 120 × 80 × 25 mm (plate 120 × 80 × 15, plus a boss 10 mm high) |
| Solids | 1 |
| Boss | Ø 16 × 10 mm, centre at (60, 15), on the top face |

Holes, all along Z, drilled from the top face of the plate (Z = 15):

| Ø (mm) | Depth (mm) | Type | Count | Centres (X, Y) |
|---|---|---|---|---|
| 4.2 | 10 | blind | 3 | (30, 65) (60, 65) (90, 65) |
| 6.6 | 15 | through | 4 | (10, 10) (110, 10) (10, 70) (110, 70) |
| 10 | 8 | blind | 2 | (40, 40) (80, 40) |
| 25 | 15 | through | 1 | (60, 40) |

Things this file is good at catching:

- holes counted twice (once per cylindrical half or per edge loop);
- a boss reported as a hole (it is a cylinder too, but convex);
- blind holes reported as through holes, or with the wrong depth;
- the Ø 25 hole and the two Ø 10 holes next to it being merged;
- wrong units (the file declares millimetres).

## make-plate.mjs

The generator. It needs only Node.js, no packages:

```
node make-plate.mjs my-plate.stp
```

The plate size, the list of holes and the boss are at the top of the file. Comments are in Portuguese.

## Licence

The files in this repository are released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): use them for anything, no credit needed.
