import * as THREE from 'three';

/** Desktop-only complete source-cell groups. The original mesh stays the query master. */
export function terrainCellGroups(master, ranges) {
  const source = master.geometry, original = source.index, indices = [[], []];
  let cursor = 0;
  for (const [start, count] of ranges) {
    for (; cursor < start; cursor++) indices[0].push(original.getX(cursor));
    for (const end = start + count; cursor < end; cursor++) indices[1].push(original.getX(cursor));
  }
  for (; cursor < original.count; cursor++) indices[0].push(original.getX(cursor));
  return indices.map((index, i) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(index);
    // Shared attributes include the other group too; bound only this group's referenced vertices.
    const position = source.attributes.position, point = new THREE.Vector3(), box = new THREE.Box3();
    for (const vertex of index) box.expandByPoint(point.fromBufferAttribute(position, vertex));
    const center = box.getCenter(new THREE.Vector3());
    let radiusSquared = 0;
    for (const vertex of index) radiusSquared = Math.max(radiusSquared, center.distanceToSquared(point.fromBufferAttribute(position, vertex)));
    geometry.boundingBox = box;
    geometry.boundingSphere = new THREE.Sphere(center, Math.sqrt(radiusSquared));
    const mesh = new THREE.Mesh(geometry, master.material);
    mesh.name = `site-terrain-${i ? 'southeast' : 'remainder'}`;
    mesh.castShadow = master.castShadow;
    mesh.receiveShadow = master.receiveShadow;
    mesh.layers.mask = master.layers.mask;
    // Physical hits belong only to the unchanged named master, including default-layer queries.
    mesh.raycast = () => {};
    return mesh;
  });
}
