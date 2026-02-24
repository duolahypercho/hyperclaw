// src/components/models/vrm/VRMLoader.ts
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMUtils } from "@pixiv/three-vrm";
import { VRMLookAtQuaternionProxy } from "@pixiv/three-vrm-animation";
import { Group, Object3D, Scene, Vector3, Box3, Quaternion } from "three";

let loader: GLTFLoader;

export function useVRMLoader() {
  if (loader) return loader;

  loader = new GLTFLoader();
  loader.crossOrigin = "anonymous";
  loader.register((parser) => new VRMLoaderPlugin(parser));
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  return loader;
}

export async function loadVrm(
  model: string,
  options?: {
    scene?: Scene;
    lookAt?: boolean;
    onProgress?: (progress: ProgressEvent<EventTarget>) => void;
  }
) {
  const loader = useVRMLoader();
  const gltf = await loader.loadAsync(model, options?.onProgress);

  const _vrm = gltf.userData.vrm;
  if (!_vrm) return undefined;

  // Performance optimizations
  VRMUtils.removeUnnecessaryVertices(_vrm.scene);
  VRMUtils.combineSkeletons(_vrm.scene);

  // Disable frustum culling
  _vrm.scene.traverse((object: Object3D) => {
    object.frustumCulled = false;
  });

  // Add look-at support
  if (options?.lookAt && _vrm.lookAt) {
    const lookAtQuatProxy = new VRMLookAtQuaternionProxy(_vrm.lookAt);
    lookAtQuatProxy.name = "lookAtQuaternionProxy";
    _vrm.scene.add(lookAtQuatProxy);
  }

  const _vrmGroup = new Group();
  _vrmGroup.add(_vrm.scene);

  if (options?.scene) {
    options.scene.add(_vrmGroup);
  }

  // Set facing direction
  const targetDirection = new Vector3(0, 0, -1);
  const lookAt = _vrm.lookAt;
  const quaternion = new Quaternion();

  if (lookAt) {
    const facingDirection = lookAt.faceFront;
    quaternion.setFromUnitVectors(
      facingDirection.normalize(),
      targetDirection.normalize()
    );
    _vrmGroup.quaternion.premultiply(quaternion);
    _vrmGroup.updateMatrixWorld(true);
  }

  _vrm.springBoneManager?.reset();
  _vrmGroup.updateMatrixWorld(true);

  // Calculate bounding box
  const box = new Box3();
  box.setFromObject(_vrmGroup);
  const modelCenter = box.getCenter(new Vector3());
  const modelSize = box.getSize(new Vector3());

  return {
    _vrm,
    _vrmGroup,
    modelCenter,
    modelSize,
    initialCameraOffset: new Vector3(0, modelCenter.y, modelSize.length() * 2),
  };
}
