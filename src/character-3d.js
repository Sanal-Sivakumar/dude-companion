(function exposeCharacter3D(root, factory) {
  const api = factory(root.THREE);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DudeCharacter3D = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCharacter3DModule(THREE) {
  'use strict';

  const OUTFITS = Object.freeze({
    night:  { cloth: '#272a2d', panel: '#393e42', trim: '#9ca94f', glow: '#c3f66b', sole: '#141719' },
    ember:  { cloth: '#37262a', panel: '#553237', trim: '#e77556', glow: '#ffa06f', sole: '#1b1517' },
    moon:   { cloth: '#252c3b', panel: '#33415e', trim: '#829fe5', glow: '#b6ceff', sole: '#141820' },
    forest: { cloth: '#263129', panel: '#36503d', trim: '#7fb36c', glow: '#bce980', sole: '#141a15' },
    frost:  { cloth: '#27363c', panel: '#3c5762', trim: '#91d5e2', glow: '#c9f8fb', sole: '#141b1e' },
    rose:   { cloth: '#362731', panel: '#55384a', trim: '#e47ba4', glow: '#ffb3cc', sole: '#1b1418' }
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = (value) => {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const point = (x, y, z = 0) => ({ x, y, z });

  function rotateZ(p, pivot, angle) {
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return point(pivot.x + dx * cosine - dy * sine, pivot.y + dx * sine + dy * cosine, p.z);
  }

  function limbEnd(start, length, angle, zDelta = 0) {
    return point(start.x - Math.sin(angle) * length, start.y - Math.cos(angle) * length, start.z + zDelta);
  }

  function buildSkeleton(pose) {
    const joints = Object.fromEntries(Object.entries(pose.joints || {}).map(([name, degrees]) => [name, degrees * Math.PI / 180]));
    const torsoAngle = joints.torso || 0;
    const pelvis = point(0, 0.78, 0);
    const shoulderL = rotateZ(point(-0.37, 1.48, 0.025), pelvis, torsoAngle);
    const shoulderR = rotateZ(point(0.37, 1.48, -0.025), pelvis, torsoAngle);
    const hipL = rotateZ(point(-0.17, 0.80, 0.035), pelvis, torsoAngle * 0.22);
    const hipR = rotateZ(point(0.17, 0.80, -0.035), pelvis, torsoAngle * 0.22);
    const neck = rotateZ(point(0, 1.66, 0), pelvis, torsoAngle);

    if (['sit', 'read', 'work', 'nap'].includes(pose.state)) {
      return {
        pelvis, torso: point(-0.03, 1.20, 0), neck, head: point(-0.05, 2.18, 0.02),
        shoulderL, elbowL: point(-0.43, 1.16, 0.10), wristL: point(-0.18, 0.86, 0.26), handL: point(-0.08, 0.81, 0.29),
        shoulderR, elbowR: point(0.43, 1.15, -0.07), wristR: point(0.18, 0.84, 0.23), handR: point(0.08, 0.79, 0.27),
        hipL: point(-0.17, 0.79, 0.08), kneeL: point(0.20, 0.51, 0.22), ankleL: point(0.48, 0.25, 0.17), toeL: point(0.61, 0.19, 0.28),
        hipR: point(0.17, 0.79, -0.08), kneeR: point(-0.21, 0.49, -0.19), ankleR: point(-0.48, 0.24, 0.08), toeR: point(-0.61, 0.18, 0.19)
      };
    }

    const shoulderLAngle = torsoAngle + (joints.shoulderL || 0);
    const shoulderRAngle = torsoAngle + (joints.shoulderR || 0);
    const elbowL = limbEnd(shoulderL, 0.43, shoulderLAngle, 0.035);
    const elbowR = limbEnd(shoulderR, 0.43, shoulderRAngle, -0.035);
    const lowerL = shoulderLAngle + (joints.elbowL || 0);
    const lowerR = shoulderRAngle + (joints.elbowR || 0);
    const wristL = limbEnd(elbowL, 0.36, lowerL, 0.02);
    const wristR = limbEnd(elbowR, 0.36, lowerR, -0.02);
    const handL = limbEnd(wristL, 0.10, lowerL + (joints.wristL || 0));
    const handR = limbEnd(wristR, 0.10, lowerR + (joints.wristR || 0));

    const hipLAngle = torsoAngle * 0.22 + (joints.hipL || 0);
    const hipRAngle = torsoAngle * 0.22 + (joints.hipR || 0);
    const kneeL = limbEnd(hipL, 0.48, hipLAngle, 0.025);
    const kneeR = limbEnd(hipR, 0.48, hipRAngle, -0.025);
    const lowerLegL = hipLAngle + (joints.kneeL || 0);
    const lowerLegR = hipRAngle + (joints.kneeR || 0);
    const ankleL = limbEnd(kneeL, 0.45, lowerLegL);
    const ankleR = limbEnd(kneeR, 0.45, lowerLegR);
    const toeL = limbEnd(ankleL, 0.20, lowerLegL + (joints.ankleL || 0) - Math.PI / 2, 0.09);
    const toeR = limbEnd(ankleR, 0.20, lowerLegR + (joints.ankleR || 0) + Math.PI / 2, 0.09);
    const head = rotateZ(point(0, 2.18, 0), neck, torsoAngle + (joints.head || 0));

    return {
      pelvis, torso: rotateZ(point(0, 1.20, 0), pelvis, torsoAngle), neck, head,
      shoulderL, elbowL, wristL, handL, shoulderR, elbowR, wristR, handR,
      hipL, kneeL, ankleL, toeL, hipR, kneeR, ankleR, toeR
    };
  }

  function requireThree() {
    if (!THREE) throw new Error('The bundled Three.js runtime failed to load.');
  }

  function standardMaterial(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.72,
      metalness: options.metalness ?? 0.03,
      emissive: options.emissive || '#000000',
      emissiveIntensity: options.emissiveIntensity || 0,
      transparent: true,
      opacity: 1,
      depthWrite: true
    });
  }

  function canvasLabelTexture(lines, background, foreground) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 112, 28);
    ctx.fill();
    ctx.fillStyle = foreground;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 30px ui-monospace, SFMono-Regular, Menlo, monospace';
    lines.forEach((line, index) => ctx.fillText(line, 128, 47 + index * 36));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  class CharacterRenderer {
    constructor(canvas, options = {}) {
      requireThree();
      this.canvas = canvas;
      this.gender = options.gender === 'female' ? 'female' : 'male';
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
      this.renderer.setSize(canvas.width, canvas.height, false);
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.16;
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-1.08, 1.08, 1.55, -1.55, 0.1, 20);
      this.camera.position.set(0, 1.34, 6);
      this.camera.lookAt(0, 1.34, 0);
      this.scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x20251d, 2.1));
      const key = new THREE.DirectionalLight(0xffffff, 3.2);
      key.position.set(-3.5, 5.5, 6);
      this.scene.add(key);
      const rim = new THREE.DirectionalLight(0xbce86d, 2.0);
      rim.position.set(4, 3, -4);
      this.scene.add(rim);

      this.root = new THREE.Group();
      this.root.position.y = -0.10;
      this.scene.add(this.root);
      this.shared = {
        sphere: new THREE.SphereGeometry(1, 28, 20),
        cylinder: new THREE.CylinderGeometry(1, 1, 1, 18, 1),
        box: new THREE.BoxGeometry(1, 1, 1),
        torus: new THREE.TorusGeometry(1, 0.08, 12, 42)
      };
      this.base = {};
      this.clothes = {};
      this.details = {};
      this.props = {};
      this.buildModel();
      this.lastFrame = null;
    }

    mesh(name, geometry, material, parent = this.root) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.frustumCulled = false;
      parent.add(mesh);
      return mesh;
    }

    sphere(name, scale, material, parent = this.root) {
      const mesh = this.mesh(name, this.shared.sphere, material, parent);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      return mesh;
    }

    buildModel() {
      const skinColor = this.gender === 'female' ? '#d79a74' : '#ca8961';
      this.materials = {
        skin: standardMaterial(skinColor, { roughness: 0.64 }),
        under: standardMaterial('#25292d', { roughness: 0.8 }),
        face: standardMaterial('#050708', { roughness: 0.54 }),
        hair: standardMaterial('#352620', { roughness: 0.86 }),
        cloth: standardMaterial(OUTFITS.night.cloth),
        panel: standardMaterial(OUTFITS.night.panel),
        trim: standardMaterial(OUTFITS.night.trim, { metalness: 0.08 }),
        sole: standardMaterial(OUTFITS.night.sole),
        glow: standardMaterial(OUTFITS.night.glow, { emissive: OUTFITS.night.glow, emissiveIntensity: 2.8, roughness: 0.3 })
      };

      const segmentNames = ['upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR', 'upperLegL', 'lowerLegL', 'upperLegR', 'lowerLegR'];
      for (const name of segmentNames) this.base[name] = this.mesh(`base-${name}`, this.shared.cylinder, this.materials.skin.clone());
      for (const name of ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']) {
        this.base[name] = this.sphere(`base-${name}`, [1, 1, 1], this.materials.skin.clone());
      }
      this.base.handL = this.sphere('base-handL', [0.13, 0.14, 0.12], this.materials.skin.clone());
      this.base.handR = this.sphere('base-handR', [0.13, 0.14, 0.12], this.materials.skin.clone());
      this.base.torso = this.sphere('base-torso', [this.gender === 'female' ? 0.40 : 0.43, 0.51, 0.33], this.materials.skin.clone());
      this.base.pelvis = this.sphere('base-pelvis', [0.38, 0.23, 0.31], this.materials.skin.clone());
      this.base.footL = this.mesh('base-footL', this.shared.cylinder, this.materials.skin.clone());
      this.base.footR = this.mesh('base-footR', this.shared.cylinder, this.materials.skin.clone());

      const clothingSegments = {
        upperArmL: 'panel', lowerArmL: 'cloth', upperArmR: 'panel', lowerArmR: 'cloth',
        upperLegL: 'cloth', lowerLegL: 'panel', upperLegR: 'cloth', lowerLegR: 'panel'
      };
      for (const [name, role] of Object.entries(clothingSegments)) {
        const mesh = this.mesh(`clothes-${name}`, this.shared.cylinder, this.materials[role].clone());
        mesh.userData.role = role;
        this.clothes[name] = mesh;
      }
      for (const name of ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']) {
        const role = name.startsWith('knee') || name.startsWith('wrist') ? 'panel' : 'cloth';
        const mesh = this.sphere(`clothes-${name}`, [1, 1, 1], this.materials[role].clone());
        mesh.userData.role = role;
        this.clothes[name] = mesh;
      }
      this.clothes.handL = this.sphere('clothes-handL', [0.145, 0.15, 0.135], this.materials.cloth.clone());
      this.clothes.handR = this.sphere('clothes-handR', [0.145, 0.15, 0.135], this.materials.cloth.clone());
      this.clothes.handL.userData.role = this.clothes.handR.userData.role = 'cloth';
      this.clothes.torso = this.sphere('clothes-torso', [this.gender === 'female' ? 0.48 : 0.52, 0.58, 0.40], this.materials.cloth.clone());
      this.clothes.torso.userData.role = 'cloth';
      this.clothes.pelvis = this.sphere('clothes-pelvis', [0.44, 0.25, 0.36], this.materials.panel.clone());
      this.clothes.pelvis.userData.role = 'panel';
      // A continuous coat hem hides the internal hip pivots at every yaw and stride angle.
      this.clothes.coatHem = this.sphere('clothes-coat-hem', [this.gender === 'female' ? 0.47 : 0.51, 0.31, 0.39], this.materials.cloth.clone());
      this.clothes.coatHem.userData.role = 'cloth';
      this.clothes.bootL = this.mesh('clothes-bootL', this.shared.cylinder, this.materials.sole.clone());
      this.clothes.bootR = this.mesh('clothes-bootR', this.shared.cylinder, this.materials.sole.clone());
      this.clothes.bootL.userData.role = this.clothes.bootR.userData.role = 'sole';
      this.clothes.hood = this.sphere('clothes-hood', [this.gender === 'female' ? 0.66 : 0.70, 0.73, 0.63], this.materials.cloth.clone());
      this.clothes.hood.userData.role = 'cloth';

      this.details.innerHead = this.sphere('inner-head', [0.56, 0.59, 0.51], this.materials.face.clone());
      this.details.face = this.sphere('face-panel', [0.50, 0.43, 0.055], this.materials.face.clone());
      this.details.face.position.z = 0.64;
      this.details.rim = this.mesh('hood-rim', this.shared.torus, this.materials.trim.clone());
      this.details.rim.userData.role = 'trim';
      this.details.rim.scale.set(0.57, 0.47, 0.68);
      this.details.rim.position.z = 0.675;
      this.details.eyeL = this.sphere('eye-left', [0.075, this.gender === 'female' ? 0.14 : 0.13, 0.04], this.materials.glow.clone());
      this.details.eyeR = this.sphere('eye-right', [0.075, this.gender === 'female' ? 0.14 : 0.13, 0.04], this.materials.glow.clone());
      this.details.eyeL.position.set(-0.18, -0.02, 0.715);
      this.details.eyeR.position.set(0.18, -0.02, 0.715);
      this.details.zip = this.mesh('jacket-zip', this.shared.box, this.materials.trim.clone());
      this.details.zip.userData.role = 'trim';
      this.details.zip.scale.set(0.025, 0.42, 0.025);
      this.details.badge = this.mesh('jacket-badge', this.shared.box, this.materials.glow.clone());
      this.details.badge.userData.role = 'glow';
      this.details.badge.scale.set(0.12, 0.07, 0.03);

      this.headGroup = new THREE.Group();
      this.root.add(this.headGroup);
      for (const key of ['innerHead', 'face', 'rim', 'eyeL', 'eyeR']) {
        this.root.remove(this.details[key]);
        this.headGroup.add(this.details[key]);
      }
      this.root.remove(this.clothes.hood);
      this.headGroup.add(this.clothes.hood);

      this.hairGroup = new THREE.Group();
      this.headGroup.add(this.hairGroup);
      if (this.gender === 'female') {
        const band = this.sphere('hair-band', [0.17, 0.17, 0.17], this.materials.trim.clone(), this.hairGroup);
        band.position.set(0.46, 0.27, -0.29);
        const pony1 = this.sphere('hair-pony-1', [0.22, 0.31, 0.20], this.materials.hair.clone(), this.hairGroup);
        pony1.position.set(0.58, 0.19, -0.36); pony1.rotation.z = -0.52;
        const pony2 = this.sphere('hair-pony-2', [0.18, 0.28, 0.17], this.materials.hair.clone(), this.hairGroup);
        pony2.position.set(0.71, -0.10, -0.38); pony2.rotation.z = -0.25;
      } else {
        for (let index = 0; index < 3; index += 1) {
          const tuft = this.sphere(`hair-tuft-${index}`, [0.08, 0.18, 0.08], this.materials.hair.clone(), this.hairGroup);
          tuft.position.set(-0.14 + index * 0.14, 0.49 + (index % 2) * 0.04, 0.04);
          tuft.rotation.z = -0.45 + index * 0.42;
        }
      }

      this.censorTextures = Object.fromEntries(Object.entries(OUTFITS).map(([name, palette]) => [name, canvasLabelTexture(['MODESTY', 'PATCH'], '#111315', palette.glow)]));
      this.censor = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.censorTextures.night, transparent: true, depthTest: false }));
      this.censor.scale.set(0.72, 0.36, 1);
      this.censor.visible = false;
      this.censor.renderOrder = 30;
      this.root.add(this.censor);

      this.garmentBundle = this.mesh('garment-bundle', this.shared.box, this.materials.cloth.clone());
      this.garmentBundle.scale.set(0.34, 0.19, 0.18);
      this.garmentBundle.visible = false;
      this.buildProps();
    }

    buildProps() {
      const makeGroup = (name) => {
        const group = new THREE.Group(); group.name = `prop-${name}`; group.visible = false; this.root.add(group); this.props[name] = group; return group;
      };
      const dark = standardMaterial('#202528');
      const olive = standardMaterial('#9ca94f', { metalness: 0.12 });
      const coral = standardMaterial('#e77556');
      const pale = standardMaterial('#d8d5c5', { metalness: 0.18 });
      const laptop = makeGroup('laptop');
      const screen = this.mesh('laptop-screen', this.shared.box, dark.clone(), laptop); screen.scale.set(0.55, 0.36, 0.035); screen.position.set(0, 0.70, 0.50); screen.rotation.x = -0.12;
      const base = this.mesh('laptop-base', this.shared.box, dark.clone(), laptop); base.scale.set(0.60, 0.05, 0.40); base.position.set(0, 0.45, 0.34);
      const laptopGlow = this.mesh('laptop-glow', this.shared.box, olive.clone(), laptop); laptopGlow.scale.set(0.16, 0.025, 0.02); laptopGlow.position.set(0, 0.70, 0.54);
      const book = makeGroup('book');
      for (const side of [-1, 1]) { const page = this.mesh('book-page', this.shared.box, side < 0 ? coral.clone() : pale.clone(), book); page.scale.set(0.34, 0.035, 0.43); page.position.set(side * 0.18, 0.70, 0.48); page.rotation.z = side * -0.16; }
      const coffee = makeGroup('coffee');
      const cup = this.mesh('coffee-cup', new THREE.CylinderGeometry(0.14, 0.12, 0.28, 18), olive.clone(), coffee); cup.position.set(0.28, 0.82, 0.48);
      const chair = makeGroup('chair');
      const chairBack = this.mesh('chair-back', this.shared.box, dark.clone(), chair); chairBack.scale.set(0.62, 0.75, 0.12); chairBack.position.set(0, 0.92, -0.38);
      const chairSeat = this.mesh('chair-seat', this.shared.box, olive.clone(), chair); chairSeat.scale.set(0.68, 0.12, 0.64); chairSeat.position.set(0, 0.50, -0.08);
      const skateboard = makeGroup('skateboard');
      const deck = this.mesh('skateboard-deck', this.shared.box, coral.clone(), skateboard); deck.scale.set(0.88, 0.08, 0.26); deck.position.set(0, 0.08, 0.02);
      for (const x of [-0.30, 0.30]) { const wheel = this.mesh('skateboard-wheel', new THREE.CylinderGeometry(0.08, 0.08, 0.08, 14), dark.clone(), skateboard); wheel.position.set(x, 0.00, 0.06); wheel.rotation.z = Math.PI / 2; }
      const headphones = makeGroup('headphones');
      const band = this.mesh('headphone-band', new THREE.TorusGeometry(0.67, 0.055, 12, 36, Math.PI), olive.clone(), headphones); band.position.set(0, 2.20, 0); band.rotation.z = Math.PI;
      for (const x of [-0.66, 0.66]) { const ear = this.mesh('headphone-ear', this.shared.box, dark.clone(), headphones); ear.scale.set(0.13, 0.30, 0.18); ear.position.set(x, 2.10, 0); }
      const umbrella = makeGroup('umbrella');
      const handle = this.mesh('umbrella-handle', new THREE.CylinderGeometry(0.025, 0.025, 1.45, 10), olive.clone(), umbrella); handle.position.set(0.44, 1.22, 0.24);
      const canopy = this.sphere('umbrella-canopy', [0.72, 0.18, 0.58], coral.clone(), umbrella); canopy.position.set(0.44, 1.96, 0.24);
      const sword = makeGroup('sword');
      const blade = this.mesh('sword-blade', this.shared.box, pale.clone(), sword); blade.scale.set(0.10, 1.10, 0.06); blade.position.set(0.46, 1.20, 0.42); blade.rotation.z = -0.48;
      const guard = this.mesh('sword-guard', this.shared.box, olive.clone(), sword); guard.scale.set(0.44, 0.08, 0.10); guard.position.set(0.20, 0.72, 0.42); guard.rotation.z = -0.48;
      const blaster = makeGroup('foam-blaster');
      const blasterBody = this.mesh('blaster-body', this.shared.box, coral.clone(), blaster); blasterBody.scale.set(0.65, 0.25, 0.24); blasterBody.position.set(0.36, 0.94, 0.45); blasterBody.rotation.z = -0.24;
      const blasterTip = this.mesh('blaster-tip', this.shared.box, olive.clone(), blaster); blasterTip.scale.set(0.28, 0.11, 0.16); blasterTip.position.set(0.78, 1.05, 0.45); blasterTip.rotation.z = -0.24;
    }

    setGender(gender) {
      const normalized = gender === 'female' ? 'female' : 'male';
      if (normalized === this.gender) return;
      this.gender = normalized;
      // Actor instances are created with a stable gender; this path only changes material/silhouette accents defensively.
      const skin = normalized === 'female' ? '#d79a74' : '#ca8961';
      for (const mesh of Object.values(this.base)) if (mesh.material && mesh.name !== 'base-torso' && mesh.name !== 'base-pelvis' && !mesh.name.startsWith('base-foot')) mesh.material.color.set(skin);
    }

    setSegment(mesh, a, b, radius) {
      const start = new THREE.Vector3(a.x, a.y, a.z);
      const end = new THREE.Vector3(b.x, b.y, b.z);
      const direction = end.clone().sub(start);
      const length = Math.max(0.001, direction.length());
      mesh.position.copy(start.add(end).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      mesh.scale.set(radius, length, radius);
    }

    placeSphere(mesh, p, radius) {
      mesh.position.set(p.x, p.y, p.z);
      mesh.scale.set(radius, radius, radius);
    }

    updatePalette(palette) {
      for (const mesh of Object.values(this.clothes)) {
        const role = mesh.userData.role || 'cloth';
        mesh.material.color.set(palette[role]);
      }
      for (const mesh of [this.details.rim, this.details.zip]) mesh.material.color.set(palette.trim);
      this.details.badge.material.color.set(palette.glow);
      this.details.badge.material.emissive.set(palette.glow);
      for (const eye of [this.details.eyeL, this.details.eyeR]) {
        eye.material.color.set(palette.glow);
        eye.material.emissive.set(palette.glow);
      }
    }

    setOpacity(mesh, opacity) {
      mesh.visible = opacity > 0.01;
      if (!mesh.visible) return;
      mesh.material.opacity = clamp(opacity, 0, 1);
      mesh.material.depthWrite = opacity > 0.94;
    }

    render(pose, options = {}) {
      const skeleton = buildSkeleton(pose);
      const wardrobe = options.wardrobe || null;
      const phase = clamp(wardrobe?.phase ?? 1, 0, 1);
      const wardrobeTurn = wardrobe ? smooth(Math.sin(phase * Math.PI)) : 0;
      const requestedYaw = (pose.visual?.yaw || 0) * Math.PI / 180;
      const targetWardrobeYaw = this.gender === 'female' ? Math.PI : 0;
      const yaw = wardrobe ? requestedYaw * (1 - wardrobeTurn) + targetWardrobeYaw * wardrobeTurn : requestedYaw;
      this.root.rotation.y = yaw;
      this.root.scale.set(pose.visual?.squashX || 1, (pose.visual?.squashY || 1) + (pose.breathing || 0), 1);

      const visibleOutfit = (wardrobe && phase < 0.52 ? wardrobe.from : wardrobe?.to) || options.outfit || 'night';
      const visiblePalette = OUTFITS[visibleOutfit] || OUTFITS.night;
      this.updatePalette(visiblePalette);

      const segmentPairs = {
        upperArmL: ['shoulderL', 'elbowL', 0.135], lowerArmL: ['elbowL', 'wristL', 0.115],
        upperArmR: ['shoulderR', 'elbowR', 0.135], lowerArmR: ['elbowR', 'wristR', 0.115],
        upperLegL: ['hipL', 'kneeL', 0.16], lowerLegL: ['kneeL', 'ankleL', 0.135],
        upperLegR: ['hipR', 'kneeR', 0.16], lowerLegR: ['kneeR', 'ankleR', 0.135]
      };
      for (const [name, [start, end, radius]] of Object.entries(segmentPairs)) {
        this.setSegment(this.base[name], skeleton[start], skeleton[end], radius * 0.84);
        this.setSegment(this.clothes[name], skeleton[start], skeleton[end], radius);
      }
      const radii = { shoulder: 0.145, elbow: 0.123, wrist: 0.115, hip: 0.17, knee: 0.145, ankle: 0.13 };
      for (const joint of ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']) {
        const type = Object.keys(radii).find((prefix) => joint.startsWith(prefix));
        this.placeSphere(this.base[joint], skeleton[joint], radii[type] * 0.82);
        this.placeSphere(this.clothes[joint], skeleton[joint], radii[type]);
        this.clothes[joint].rotation.set(0, 0, 0);
      }
      this.base.handL.position.set(skeleton.handL.x, skeleton.handL.y, skeleton.handL.z);
      this.base.handR.position.set(skeleton.handR.x, skeleton.handR.y, skeleton.handR.z);
      this.clothes.handL.position.copy(this.base.handL.position);
      this.clothes.handR.position.copy(this.base.handR.position);
      this.clothes.handL.rotation.set(0, 0, 0);
      this.clothes.handR.rotation.set(0, 0, 0);
      this.base.torso.position.set(skeleton.torso.x, skeleton.torso.y, skeleton.torso.z);
      this.base.pelvis.position.set(skeleton.pelvis.x, skeleton.pelvis.y + 0.03, skeleton.pelvis.z);
      this.clothes.torso.position.copy(this.base.torso.position);
      this.clothes.pelvis.position.copy(this.base.pelvis.position);
      this.clothes.coatHem.position.set(skeleton.pelvis.x, skeleton.pelvis.y + 0.13, skeleton.pelvis.z);
      this.clothes.coatHem.scale.set(this.gender === 'female' ? 0.47 : 0.51, 0.31, 0.39);
      this.clothes.torso.rotation.set(0, 0, 0);
      this.clothes.pelvis.rotation.set(0, 0, 0);
      this.clothes.coatHem.rotation.set(0, 0, (pose.joints?.torso || 0) * Math.PI / 180 * 0.25);
      this.setSegment(this.base.footL, skeleton.ankleL, skeleton.toeL, 0.12);
      this.setSegment(this.base.footR, skeleton.ankleR, skeleton.toeR, 0.12);
      this.setSegment(this.clothes.bootL, skeleton.ankleL, skeleton.toeL, 0.15);
      this.setSegment(this.clothes.bootR, skeleton.ankleR, skeleton.toeR, 0.15);

      this.headGroup.position.set(skeleton.head.x, skeleton.head.y, skeleton.head.z);
      this.headGroup.rotation.z = (pose.joints?.head || 0) * Math.PI / 180;
      this.details.zip.position.set(skeleton.torso.x, skeleton.torso.y, skeleton.torso.z + 0.405);
      this.details.zip.rotation.z = (pose.joints?.torso || 0) * Math.PI / 180;
      this.details.badge.position.set(skeleton.torso.x + 0.19, skeleton.torso.y + 0.08, skeleton.torso.z + 0.41);
      this.details.badge.rotation.z = this.details.zip.rotation.z;

      let garmentOpacity = 1;
      let garmentTravel = 0;
      if (wardrobe) {
        if (phase < 0.5) {
          garmentOpacity = 1 - smooth((phase - 0.20) / 0.26);
          garmentTravel = smooth((phase - 0.12) / 0.34);
        } else {
          garmentOpacity = smooth((phase - 0.54) / 0.32);
          garmentTravel = 1 - smooth((phase - 0.50) / 0.40);
        }
      }
      const travelDirection = this.gender === 'female' ? 1 : -1;
      const clothingPieces = Object.values(this.clothes);
      clothingPieces.forEach((mesh, index) => {
        this.setOpacity(mesh, garmentOpacity);
        if (!wardrobe || !mesh.visible) return;
        const stagger = 0.72 + (index % 5) * 0.07;
        mesh.position.x += travelDirection * garmentTravel * stagger;
        mesh.position.y += garmentTravel * ((index % 3) - 1) * 0.13;
        mesh.rotation.z += travelDirection * garmentTravel * (0.12 + (index % 4) * 0.04);
      });
      // Hip balls are rig controls, not anatomy. Keep them buried inside the hem so
      // they can never read as dangling links escaping the stomach.
      for (const name of ['hipL', 'hipR']) {
        this.base[name].visible = false;
        this.clothes[name].visible = false;
      }
      for (const detail of [this.details.rim, this.details.zip, this.details.badge]) this.setOpacity(detail, garmentOpacity);
      this.clothes.hood.position.x = travelDirection * garmentTravel * 0.86;
      this.clothes.hood.position.y = garmentTravel * 0.32;
      this.clothes.hood.rotation.set(0, 0, travelDirection * garmentTravel * 0.24);
      this.details.rim.position.x = this.clothes.hood.position.x;
      this.details.rim.position.y = this.clothes.hood.position.y;

      const underOpacity = wardrobe ? smooth((phase - 0.17) / 0.17) * (1 - smooth((phase - 0.78) / 0.14)) : 1;
      for (const mesh of Object.values(this.base)) this.setOpacity(mesh, wardrobe ? Math.max(0.28, underOpacity) : 1);
      this.base.hipL.visible = false;
      this.base.hipR.visible = false;
      const patchOpacity = wardrobe ? smooth((phase - 0.19) / 0.12) * (1 - smooth((phase - 0.79) / 0.12)) : 0;
      this.censor.visible = false;
      this.censor.material.opacity = 0;
      this.censor.position.set(0, 0.78, this.gender === 'female' ? -0.63 : 0.63);
      if (this.censor.material.map !== this.censorTextures[visibleOutfit]) {
        this.censor.material.map = this.censorTextures[visibleOutfit] || this.censorTextures.night;
        this.censor.material.needsUpdate = true;
      }
      this.garmentBundle.visible = wardrobe && phase > 0.23 && phase < 0.90;
      if (this.garmentBundle.visible) {
        this.garmentBundle.material.color.set(visiblePalette.cloth);
        this.garmentBundle.position.set(travelDirection * (0.78 + Math.sin(phase * Math.PI) * 0.16), 0.52 + Math.sin(phase * Math.PI) * 0.20, 0.24);
        this.garmentBundle.rotation.set(phase * 0.7, phase * 1.4, travelDirection * -0.22);
      }

      for (const [name, group] of Object.entries(this.props)) group.visible = name === options.prop;
      this.renderer.render(this.scene, this.camera);
      this.lastFrame = {
        yaw: yaw * 180 / Math.PI,
        state: pose.state,
        joints: Object.keys(pose.joints || {}).length,
        wardrobePhase: wardrobe?.phase ?? null,
        coatHemVisible: this.clothes.coatHem.visible,
        hipPivotsVisible: this.base.hipL.visible || this.base.hipR.visible || this.clothes.hipL.visible || this.clothes.hipR.visible
      };
    }

    inspect() {
      return this.lastFrame ? { ...this.lastFrame } : null;
    }

    destroy() {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
  }

  return { CharacterRenderer, OUTFITS, buildSkeleton };
}));
