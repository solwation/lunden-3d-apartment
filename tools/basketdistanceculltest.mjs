import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DetailCuller, DETAIL_HIDDEN_LAYER } from '../src/detail.js';

test('basket distance opt-in keeps long shots, ordinary details still cull and walls still hide the ball', () => {
  const root=new THREE.Group(), ball=new THREE.Mesh(new THREE.SphereGeometry(.115),new THREE.MeshBasicMaterial());
  ball.userData.noDistanceCull=true; root.userData.moving=true; root.add(ball);
  const ordinary=ball.clone(); ordinary.userData={};root.add(ordinary);
  const d=new DetailCuller(root,{W:10,D:10,roof:7,floor1:3,doorHeight:2},{north:[],south:[],walls:[]});
  const camera=new THREE.PerspectiveCamera();camera.position.set(20,2,20);camera.updateMatrixWorld(true);
  for(const scale of [.6,.75,.9,1]) {
    ball.position.set(20,4,-10);ordinary.position.copy(ball.position);d.setQuality(scale);d.update(camera);
    assert.equal(ball.layers.mask,1);assert.equal(ordinary.layers.mask,1<<DETAIL_HIDDEN_LAYER);
  }
  // Same stationary observer: a moving ball entering the closed flat is still occluded.
  ball.position.set(5,2,5);d.update(camera);
  assert.equal(ball.layers.mask,1<<DETAIL_HIDDEN_LAYER);
  ball.position.set(20,4,-10);d.update(camera);assert.equal(ball.layers.mask,1);
});
