/*
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
// Experiment #1876. Extracted from Three.js Ray.intersectTriangle at
// https://github.com/mrdoob/three.js/blob/bd942afdb3aae7fdcecf33ea34191fb43be56cc4/src/math/Ray.js
// Only adaptation: explicit ray argument in place of this. No prototype patch.
export function intersectTriangle( ray, a, b, c, backfaceCulling, target ) {

		// Watertight ray/triangle intersection. Reference: Woop, Benthin, Wald,
		// "Watertight Ray/Triangle Intersection", JCGT vol. 2 no. 1 (2013), Appendix A.
		// https://jcgt.org/published/0002/01/05/

		const origin = ray.origin;
		const direction = ray.direction;

		const dx = direction.x;
		const dy = direction.y;
		const dz = direction.z;

		// triangle vertices relative to the ray origin

		const aox = a.x - origin.x, aoy = a.y - origin.y, aoz = a.z - origin.z;
		const box = b.x - origin.x, boy = b.y - origin.y, boz = b.z - origin.z;
		const cox = c.x - origin.x, coy = c.y - origin.y, coz = c.z - origin.z;

		// Use the dimension where the ray direction is maximal as the projection
		// axis (kz) and read every component already permuted into (kx, ky, kz).
		// kx and ky are swapped when the direction's kz component is negative, to
		// preserve the winding order of triangles.

		const adx = Math.abs( dx ), ady = Math.abs( dy ), adz = Math.abs( dz );

		let dkx, dky, dkz;
		let akx, aky, akz, bkx, bky, bkz, ckx, cky, ckz;

		if ( adx >= ady && adx >= adz ) {

			dkz = dx; akz = aox; bkz = box; ckz = cox;

			if ( dx >= 0 ) {

				dkx = dy; dky = dz;
				akx = aoy; aky = aoz; bkx = boy; bky = boz; ckx = coy; cky = coz;

			} else {

				dkx = dz; dky = dy;
				akx = aoz; aky = aoy; bkx = boz; bky = boy; ckx = coz; cky = coy;

			}

		} else if ( ady >= adz ) {

			dkz = dy; akz = aoy; bkz = boy; ckz = coy;

			if ( dy >= 0 ) {

				dkx = dz; dky = dx;
				akx = aoz; aky = aox; bkx = boz; bky = box; ckx = coz; cky = cox;

			} else {

				dkx = dx; dky = dz;
				akx = aox; aky = aoz; bkx = box; bky = boz; ckx = cox; cky = coz;

			}

		} else {

			dkz = dz; akz = aoz; bkz = boz; ckz = coz;

			if ( dz >= 0 ) {

				dkx = dx; dky = dy;
				akx = aox; aky = aoy; bkx = box; bky = boy; ckx = cox; cky = coy;

			} else {

				dkx = dy; dky = dx;
				akx = aoy; aky = aox; bkx = boy; bky = box; ckx = coy; cky = cox;

			}

		}

		// a zero direction has no maximal axis and cannot intersect

		if ( dkz === 0 ) return null;

		// shear constants that align the ray with the +kz axis

		const sx = dkx / dkz, sy = dky / dkz, sz = 1 / dkz;

		// sheared and scaled vertices

		const ax = akx - sx * akz, ay = aky - sy * akz;
		const bx = bkx - sx * bkz, by = bky - sy * bkz;
		const cx = ckx - sx * ckz, cy = cky - sy * ckz;

		// scaled barycentric coordinates (signed edge functions); the shear makes a
		// shared edge evaluate identically for both adjacent triangles, so the ray
		// can never fall between them

		const u = cx * by - cy * bx;
		const v = ax * cy - ay * cx;
		const w = bx * ay - by * ax;

		if ( backfaceCulling ) {

			if ( u < 0 || v < 0 || w < 0 ) return null;

		} else {

			if ( ( u < 0 || v < 0 || w < 0 ) && ( u > 0 || v > 0 || w > 0 ) ) return null;

		}

		const det = u + v + w;

		// ray is co-planar with the triangle

		if ( det === 0 ) return null;

		// scaled hit distance; t = tScaled / det must lie in front of the origin

		const tScaled = sz * ( u * akz + v * bkz + w * ckz );

		if ( det > 0 ? tScaled < 0 : tScaled > 0 ) return null;

		return ray.at( tScaled / det, target );

	}
