(function exposeCharacterRenderer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DudeCharacter3D = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createCharacterRendererModule() {
  'use strict';

  const OUTFITS = Object.freeze({
    night: 'saturate(.96) contrast(1.025)',
    ember: 'hue-rotate(304deg) saturate(1.42) brightness(1.06)',
    moon: 'hue-rotate(92deg) saturate(1.15) brightness(1.12)',
    forest: 'hue-rotate(34deg) saturate(1.32) brightness(.98)',
    frost: 'hue-rotate(128deg) saturate(.78) brightness(1.13)',
    rose: 'hue-rotate(274deg) saturate(1.25) brightness(1.08)'
  });

  const VIEWS = Object.freeze([
    { yaw: -180, name: 'back' },
    { yaw: -90, name: 'side' },
    { yaw: 0, name: 'front' },
    { yaw: 90, name: 'side-right' },
    { yaw: 180, name: 'back' }
  ]);

  const MASKS = Object.freeze({
    head: [[.01, 0], [.99, 0], [.95, .53], [.06, .53]],
    torso: [[.20, .37], [.80, .37], [.75, .78], [.25, .78]],
    upperArmL: [[.07, .38], [.40, .38], [.37, .67], [.10, .70]],
    upperArmR: [[.60, .38], [.93, .38], [.90, .70], [.63, .67]],
    lowerArmL: [[.06, .55], [.37, .55], [.36, .75], [.07, .78]],
    lowerArmR: [[.63, .55], [.94, .55], [.93, .78], [.64, .75]],
    handL: [[.05, .66], [.36, .65], [.37, .82], [.04, .83]],
    handR: [[.64, .65], [.95, .66], [.96, .83], [.63, .82]],
    upperLegL: [[.20, .65], [.54, .65], [.52, .89], [.17, .91]],
    upperLegR: [[.46, .65], [.80, .65], [.83, .91], [.48, .89]],
    lowerLegL: [[.16, .78], [.52, .78], [.50, .96], [.13, .97]],
    lowerLegR: [[.48, .78], [.84, .78], [.87, .97], [.50, .96]],
    footL: [[.10, .88], [.52, .88], [.50, 1], [.06, 1]],
    footR: [[.48, .88], [.90, .88], [.94, 1], [.50, 1]],
    waistGuard: [[.21, .55], [.79, .55], [.76, .78], [.24, .78]]
  });

  const PIVOTS = Object.freeze({
    pelvis: [.50, .70], head: [.50, .43],
    shoulderL: [.30, .48], shoulderR: [.70, .48],
    elbowL: [.25, .64], elbowR: [.75, .64],
    wristL: [.23, .73], wristR: [.77, .73],
    hipL: [.43, .70], hipR: [.57, .70],
    kneeL: [.39, .84], kneeR: [.61, .84],
    ankleL: [.34, .93], ankleR: [.66, .93]
  });

  const DRAW_ORDER = Object.freeze([
    'lowerLegL', 'lowerLegR', 'footL', 'footR',
    'upperLegL', 'upperLegR',
    'upperArmL', 'upperArmR', 'lowerArmL', 'lowerArmR',
    'torso', 'waistGuard', 'handL', 'handR', 'head'
  ]);

  const PROPS = Object.freeze({
    laptop: '💻', chair: '🪑', coffee: '☕', sword: '🗡️',
    'foam-blaster': '🔫', skateboard: '🛹', umbrella: '☂️', book: '📕', headphones: '🎧'
  });

  // The physics solver can legitimately drive a joint through a large recovery
  // angle. A painted character is not a skinned mesh, though, so displaying the
  // full solver angle would pull neighbouring pixels out of the coat. These
  // weights keep every joint alive while preserving the continuous silhouette.
  const DISPLAY_WEIGHT = Object.freeze({
    torso: .26,
    head: .22,
    shoulderL: .24,
    shoulderR: .24,
    elbowL: .18,
    elbowR: .18,
    wristL: .14,
    wristR: .14,
    hipL: .20,
    hipR: .20,
    kneeL: .17,
    kneeR: .17,
    ankleL: .13,
    ankleR: .13
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = (value) => {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const rad = (degrees) => (Number(degrees) || 0) * Math.PI / 180;

  function normalizeYaw(degrees) {
    let yaw = Number(degrees) || 0;
    yaw = ((yaw + 180) % 360 + 360) % 360 - 180;
    return yaw;
  }

  function viewBlend(degrees) {
    const yaw = normalizeYaw(degrees);
    for (let index = 0; index < VIEWS.length - 1; index += 1) {
      const from = VIEWS[index];
      const to = VIEWS[index + 1];
      if (yaw >= from.yaw && yaw <= to.yaw) {
        const raw = clamp((yaw - from.yaw) / (to.yaw - from.yaw), 0, 1);
        const mix = smooth(raw);
        const dominant = raw < .5 ? from.name : to.name;
        const anchorYaw = raw < .5 ? from.yaw : to.yaw;
        const distance = Math.abs(yaw - anchorYaw) / 45;
        return {
          from: from.name,
          to: to.name,
          dominant,
          mix,
          yaw,
          perspectiveScale: 1 - clamp(distance, 0, 1) * .10,
          perspectiveSkew: clamp((yaw - anchorYaw) / 45, -1, 1) * .022
        };
      }
    }
    return {
      from: 'front', to: 'front', dominant: 'front', mix: 0, yaw,
      perspectiveScale: 1, perspectiveSkew: 0
    };
  }

  function pivot(name, width, height) {
    const value = PIVOTS[name];
    return { x: value[0] * width, y: value[1] * height };
  }

  function around(context, value, angle) {
    if (!angle) return;
    context.translate(value.x, value.y);
    context.rotate(angle);
    context.translate(-value.x, -value.y);
  }

  function transformPiece(context, name, joints, width, height) {
    const angle = (joint) => rad(joints[joint]) * DISPLAY_WEIGHT[joint];
    const torso = angle('torso');
    const pelvis = pivot('pelvis', width, height);
    if (name === 'torso' || name === 'waistGuard' || name === 'head' || /Arm|hand/.test(name)) around(context, pelvis, torso);
    if (/Leg|foot/.test(name)) around(context, pelvis, torso * .22);

    if (name === 'head') {
      around(context, pivot('head', width, height), angle('head'));
      return;
    }
    if (name === 'upperArmL' || name === 'lowerArmL' || name === 'handL') {
      around(context, pivot('shoulderL', width, height), angle('shoulderL'));
      if (name === 'lowerArmL' || name === 'handL') around(context, pivot('elbowL', width, height), angle('elbowL'));
      if (name === 'handL') around(context, pivot('wristL', width, height), angle('wristL'));
      return;
    }
    if (name === 'upperArmR' || name === 'lowerArmR' || name === 'handR') {
      around(context, pivot('shoulderR', width, height), angle('shoulderR'));
      if (name === 'lowerArmR' || name === 'handR') around(context, pivot('elbowR', width, height), angle('elbowR'));
      if (name === 'handR') around(context, pivot('wristR', width, height), angle('wristR'));
      return;
    }
    if (name === 'upperLegL' || name === 'lowerLegL' || name === 'footL') {
      around(context, pivot('hipL', width, height), angle('hipL'));
      if (name === 'lowerLegL' || name === 'footL') around(context, pivot('kneeL', width, height), angle('kneeL'));
      if (name === 'footL') around(context, pivot('ankleL', width, height), angle('ankleL'));
      return;
    }
    if (name === 'upperLegR' || name === 'lowerLegR' || name === 'footR') {
      around(context, pivot('hipR', width, height), angle('hipR'));
      if (name === 'lowerLegR' || name === 'footR') around(context, pivot('kneeR', width, height), angle('kneeR'));
      if (name === 'footR') around(context, pivot('ankleR', width, height), angle('ankleR'));
    }
  }

  function clipMask(context, mask, width, height) {
    context.beginPath();
    mask.forEach(([x, y], index) => {
      const px = x * width;
      const py = y * height;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.closePath();
    context.clip();
  }

  class CharacterRenderer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha: true });
      if (!this.context) throw new Error('The high-detail character canvas failed to initialize.');
      this.gender = options.gender === 'female' ? 'female' : 'male';
      this.images = {};
      this.privacyCanvas = document.createElement('canvas');
      this.privacyCanvas.width = 12;
      this.privacyCanvas.height = 10;
      this.loaded = false;
      this.destroyed = false;
      this.lastFrame = null;
      this.loadImages();
    }

    loadImages() {
      const names = ['front', 'side', 'side-right', 'back', 'sit'];
      let remaining = names.length;
      for (const name of names) {
        const image = new Image();
        const suffix = name === 'front' ? '' : `-${name}`;
        image.decoding = 'async';
        image.src = `assets/${this.gender}${suffix}.png`;
        image.onload = () => {
          remaining -= 1;
          if (remaining === 0) this.loaded = true;
        };
        this.images[name] = image;
      }
    }

    setGender(gender) {
      const next = gender === 'female' ? 'female' : 'male';
      if (next === this.gender) return;
      this.gender = next;
      this.loaded = false;
      this.loadImages();
    }

    outfitFilter(name) {
      return OUTFITS[name] || OUTFITS.night;
    }

    wardrobeMotion(wardrobe, index) {
      if (!wardrobe) return { opacity: 1, x: 0, y: 0, rotation: 0 };
      const phase = clamp(wardrobe.phase, 0, 1);
      const outgoing = phase < .52;
      const amount = outgoing ? smooth((phase - .14) / .34) : 1 - smooth((phase - .50) / .36);
      const opacity = outgoing ? 1 - smooth((phase - .20) / .28) : smooth((phase - .54) / .30);
      const direction = this.gender === 'female' ? 1 : -1;
      return {
        opacity: clamp(opacity, 0, 1),
        x: direction * amount * (22 + (index % 4) * 7),
        y: amount * ((index % 3) - 1) * 7,
        rotation: direction * amount * (.04 + (index % 5) * .012)
      };
    }

    drawPiece(image, name, pose, alpha, outfit, motion, index) {
      if (!image?.complete || image.naturalWidth === 0 || alpha <= .002) return;
      const context = this.context;
      const { width, height } = this.canvas;
      context.save();
      context.globalAlpha = alpha * motion.opacity;
      context.filter = this.outfitFilter(outfit);
      context.translate(motion.x, motion.y);
      if (motion.rotation) around(context, pivot('pelvis', width, height), motion.rotation);
      transformPiece(context, name, pose.joints || {}, width, height);
      clipMask(context, MASKS[name], width, height);
      context.drawImage(image, 0, 0, width, height);
      context.restore();
    }

    applyPerspective(blend) {
      const { width, height } = this.canvas;
      this.context.translate(width * .5, height * .5);
      this.context.transform(blend.perspectiveScale, 0, blend.perspectiveSkew, 1, 0, 0);
      this.context.translate(-width * .5, -height * .5);
    }

    drawArticulated(image, pose, alpha, outfit, wardrobe, blend) {
      this.context.save();
      this.applyPerspective(blend);
      DRAW_ORDER.forEach((name, index) => {
        const motion = name === 'waistGuard'
          ? { opacity: wardrobe ? Math.max(.62, this.wardrobeMotion(wardrobe, index).opacity) : 1, x: 0, y: 0, rotation: 0 }
          : this.wardrobeMotion(wardrobe, index);
        this.drawPiece(image, name, pose, alpha, outfit, motion, index);
      });
      this.context.restore();
    }

    drawPose(image, alpha, outfit, wardrobe) {
      if (!image?.complete || image.naturalWidth === 0) return;
      const motion = this.wardrobeMotion(wardrobe, 2);
      this.context.save();
      this.context.globalAlpha = alpha * motion.opacity;
      this.context.filter = this.outfitFilter(outfit);
      this.context.translate(motion.x, motion.y);
      this.context.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
      this.context.restore();
    }

    drawProp(name) {
      const glyph = PROPS[name];
      if (!glyph) return;
      const context = this.context;
      context.save();
      context.font = '72px Apple Color Emoji, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.shadowColor = 'rgba(0,0,0,.42)';
      context.shadowBlur = 10;
      context.fillText(glyph, this.canvas.width * .68, this.canvas.height * .66);
      context.restore();
    }

    drawGarmentBundle(wardrobe, outfit) {
      if (!wardrobe || wardrobe.phase < .23 || wardrobe.phase > .90) return;
      const context = this.context;
      const direction = this.gender === 'female' ? 1 : -1;
      const x = this.canvas.width * .5 + direction * (116 + Math.sin(wardrobe.phase * Math.PI) * 22);
      const y = this.canvas.height * (.63 - Math.sin(wardrobe.phase * Math.PI) * .08);
      context.save();
      context.translate(x, y);
      context.rotate(direction * wardrobe.phase * .5);
      context.filter = this.outfitFilter(outfit);
      context.fillStyle = '#292b2f';
      context.strokeStyle = '#99a351';
      context.lineWidth = 5;
      context.beginPath();
      context.roundRect(-36, -22, 72, 44, 13);
      context.fill();
      context.stroke();
      context.restore();
    }

    drawPrivacyBlur(wardrobe) {
      if (!wardrobe || wardrobe.phase < .10 || wardrobe.phase > .91) return;
      const context = this.context;
      const female = this.gender === 'female';
      const region = female
        ? { x: .35, y: .60, width: .30, height: .15 }
        : { x: .38, y: .62, width: .24, height: .14 };
      const x = region.x * this.canvas.width;
      const y = region.y * this.canvas.height;
      const width = region.width * this.canvas.width;
      const height = region.height * this.canvas.height;
      const privacyContext = this.privacyCanvas.getContext('2d', { alpha: true });
      privacyContext.clearRect(0, 0, this.privacyCanvas.width, this.privacyCanvas.height);
      privacyContext.imageSmoothingEnabled = true;
      privacyContext.drawImage(
        this.canvas,
        x, y, width, height,
        0, 0, this.privacyCanvas.width, this.privacyCanvas.height
      );

      context.save();
      context.beginPath();
      context.ellipse(x + width / 2, y + height / 2, width * .48, height * .47, 0, 0, Math.PI * 2);
      context.clip();
      context.imageSmoothingEnabled = false;
      context.filter = 'blur(4px) saturate(.42)';
      context.drawImage(this.privacyCanvas, x, y, width, height);
      context.fillStyle = 'rgba(32, 32, 29, .10)';
      context.fillRect(x, y, width, height);
      context.restore();
    }

    render(pose, options = {}) {
      if (this.destroyed) return;
      const context = this.context;
      context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const wardrobe = options.wardrobe || null;
      const phase = clamp(wardrobe?.phase ?? 1, 0, 1);
      const outfit = (wardrobe && phase < .52 ? wardrobe.from : wardrobe?.to) || options.outfit || 'night';
      const sitting = ['sit', 'read', 'work', 'nap'].includes(pose.state);
      const blend = viewBlend(pose.visual?.yaw || 0);

      if (sitting) {
        this.drawPose(this.images.sit, 1, outfit, wardrobe);
      } else {
        // Never cross-fade two complete painted bodies: that creates double
        // eyes, belts and limbs. Perspective compression makes the hand-off
        // between neighbouring high-detail anchors feel like a turn while the
        // silhouette remains a single body on every frame.
        this.drawArticulated(this.images[blend.dominant], pose, 1, outfit, wardrobe, blend);
      }
      this.drawGarmentBundle(wardrobe, outfit);
      this.drawPrivacyBlur(wardrobe);
      this.drawProp(options.prop);
      this.lastFrame = {
        yaw: blend.yaw,
        state: pose.state,
        joints: Object.keys(pose.joints || {}).length,
        wardrobePhase: wardrobe?.phase ?? null,
        coatHemVisible: true,
        hipPivotsVisible: false,
        highDetail: true,
        viewFrom: blend.from,
        viewTo: blend.to,
        viewMix: blend.mix,
        viewSource: blend.dominant,
        perspectiveScale: blend.perspectiveScale
      };
    }

    inspect() {
      return this.lastFrame ? { ...this.lastFrame } : null;
    }

    destroy() {
      this.destroyed = true;
      this.images = {};
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  return { CharacterRenderer, OUTFITS, viewBlend };
}));
