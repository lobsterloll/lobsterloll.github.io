import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ENGINE_LAYOUTS } from './physics.js';

export class Engine3DViewer {
  constructor(container) {
    this.container = container;
    this.crankAngle = 0;
    this.turboAngle = 0;
    this.fanAngle = 0;
    this.viewMode = 'internals'; // 'internals' | 'cutaway' | 'solid' | 'wireframe' | 'exploded'
    this.explodeFactor = 0;
    this.targetExplode = 0;

    this.parts = {
      housingMeshes: [], // block, head, valve cover (hidden in 'internals' mode)
      housingMats: [],
      pistons: [],
      valves: [],
      cams: [],
      chains: [],
      pulleys: [],
      crankGroup: null,
      flywheel: null,
      turboWheel: null,
      scPulleys: [],
      fanBlades: null,
      exhaustMat: null,
      combustionFlashes: [],
      explodeGroups: []
    };

    this._initScene();
    this._animateLoop();
  }

  _initScene() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 500;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x16181d);
    this.scene.fog = new THREE.FogExp2(0x16181d, 0.018);

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    this.camera.position.set(3.8, 2.2, 4.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    pmrem.dispose();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, 0.72, 0);
    this.controls.minDistance = 1.8;
    this.controls.maxDistance = 14;

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(5, 8, 6);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.2);
    fillLight.position.set(-5, 3, -4);
    this.scene.add(fillLight);

    this.engineRoot = new THREE.Group();
    this.scene.add(this.engineRoot);

    // Sleek Dyno Turntable Pedestal
    const standMat = new THREE.MeshStandardMaterial({ color: 0x161b26, metalness: 0.7, roughness: 0.35 });
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.45, roughness: 0.3 });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.05, 0.08, 48), standMat);
    pedestal.position.y = -0.88;
    this.scene.add(pedestal);
    const glowRing = new THREE.Mesh(new THREE.TorusGeometry(1.92, 0.015, 8, 64), ringMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = -0.84;
    this.scene.add(glowRing);

    this._onResize = () => {
      const cw = this.container.clientWidth;
      const ch = this.container.clientHeight;
      if (!cw || !ch) return;
      this.camera.aspect = cw / ch;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(cw, ch);
    };
    window.addEventListener('resize', this._onResize);
  }

  _makeTube(points, radius, mat, radialSegs = 10, tubularSegs = 20) {
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSegs, radius, radialSegs, false), mat);
  }

  _makeHelicalSpring(radius, height, turns, wireRadius, mat) {
    const pts = [];
    const segs = turns * 12;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, t * height, Math.sin(a) * radius));
    }
    return this._makeTube(pts, wireRadius, mat, 6, segs);
  }

  _makeCamLobe(mat) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 0.048, Math.PI * 0.15, Math.PI * 0.85, false);
    shape.lineTo(-0.018, 0.095);
    shape.absarc(0, 0.095, 0.018, Math.PI, 0, true);
    shape.lineTo(0.042, 0.02);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.042, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005 });
    geo.translate(0, 0, -0.021);
    return new THREE.Mesh(geo, mat);
  }

  _makeCounterweight(mat, radius) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.07, 0);
    shape.lineTo(-radius * 0.72, -radius * 0.95);
    shape.absarc(0, 0, radius * 1.18, -Math.PI * 0.72, -Math.PI * 0.28, false);
    shape.lineTo(0.07, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.055, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008 });
    geo.translate(0, 0, -0.0275);
    return new THREE.Mesh(geo, mat);
  }

  _makeTimingChain(points, matLink, matPin) {
    const group = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(points, true);
    const totalLen = curve.getLength();
    const linkCount = Math.floor(totalLen / 0.042);
    const linkGeo = new THREE.BoxGeometry(0.028, 0.036, 0.042);
    const pinGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.052, 6);
    pinGeo.rotateX(Math.PI / 2);

    const links = [];
    for (let i = 0; i < linkCount; i++) {
      const t = i / linkCount;
      const pos = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const link = new THREE.Mesh(linkGeo, i % 2 === 0 ? matLink : matPin);
      link.position.copy(pos);
      link.rotation.z = Math.atan2(tan.y, tan.x);
      group.add(link);
      links.push({ mesh: link, baseT: t });
    }
    this.parts.chains.push({ curve, totalLen, links });
    return group;
  }

  rebuildEngine(cfg) {
    while (this.engineRoot.children.length > 0) {
      this.engineRoot.remove(this.engineRoot.children[0]);
    }
    this.parts = {
      housingMeshes: [],
      housingMats: [],
      pistons: [],
      valves: [],
      cams: [],
      chains: [],
      pulleys: [],
      crankGroup: null,
      flywheel: null,
      turboWheel: null,
      scPulleys: [],
      fanBlades: null,
      exhaustMat: null,
      combustionFlashes: [],
      explodeGroups: []
    };

    const layout = ENGINE_LAYOUTS[cfg.layout];
    const cylCount = layout.cylinders;
    const isV = layout.type === 'v';
    const isBoxer = layout.type === 'boxer';
    const banks = (isV || isBoxer) ? 2 : 1;
    const cylPerBank = cylCount / banks;
    const bankAngleRad = (layout.bankAngle * Math.PI) / 180;

    const boreScale = cfg.boreMm / 86;
    const strokeScale = cfg.strokeMm / 86;
    const cylRadius = 0.25 * boreScale;
    const cylSpacing = 0.68 * Math.max(0.96, boreScale);
    const crankThrow = 0.22 * strokeScale;
    const rodLen = 0.72 * Math.max(0.92, strokeScale * 0.95);
    const lengthSpan = (cylPerBank - 1) * cylSpacing;
    const frontZ = lengthSpan / 2 + 0.42;
    const rearZ = -lengthSpan / 2 - 0.42;

    // Crisp Machined Steel & Chrome Materials matching reference CAD look
    const matChrome = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.98, roughness: 0.12 });
    const matSteel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.92, roughness: 0.24 });
    const matDarkSteel = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.85, roughness: 0.35 });
    const matBronze = new THREE.MeshStandardMaterial({ color: 0xb48a5a, metalness: 0.88, roughness: 0.25 });
    const matPiston = new THREE.MeshStandardMaterial({
      color: cfg.internals === 'billet' ? 0xfbbf24 : 0xe2e8f0,
      metalness: 0.95, roughness: 0.14
    });
    const matRod = new THREE.MeshStandardMaterial({
      color: cfg.internals === 'cast' ? 0x9ca3af : 0x60a5fa,
      metalness: 0.9, roughness: 0.22
    });
    const matCrank = new THREE.MeshStandardMaterial({
      color: cfg.internals === 'billet' ? 0xd97706 : 0xb0b8c4,
      metalness: 0.94, roughness: 0.18
    });

    const matBlock = new THREE.MeshStandardMaterial({
      color: 0x64748b, metalness: 0.75, roughness: 0.35,
      transparent: true, opacity: 0.22, depthWrite: false
    });
    const matValveCover = new THREE.MeshStandardMaterial({
      color: cfg.driveMode === 'sport' ? 0xb91c1c : cfg.driveMode === 'eco' ? 0x047857 : 0x1d4ed8,
      metalness: 0.45, roughness: 0.35, transparent: true, opacity: 0.32, depthWrite: false
    });
    this.parts.housingMats.push(matBlock, matValveCover);

    const matExhaust = new THREE.MeshStandardMaterial({
      color: cfg.exhaust === 'titanium' ? 0x94a3b8 : 0x78716c,
      metalness: 0.85, roughness: 0.28,
      emissive: new THREE.Color(0x000000), emissiveIntensity: 0
    });
    this.parts.exhaustMat = matExhaust;

    const matAnodizedRed = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.85, roughness: 0.22 });
    const matSilicone = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.15, roughness: 0.5 });

    // 1. CRANKSHAFT, COUNTERWEIGHTS, TRIGGER WHEEL & FLYWHEEL
    const crankGroup = new THREE.Group();
    const crankShaftBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, lengthSpan + 1.15, 24),
      matCrank
    );
    crankShaftBar.rotation.x = Math.PI / 2;
    crankGroup.add(crankShaftBar);

    // Front Crank Timing Sprocket
    const crankSprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 18), matDarkSteel);
    crankSprocket.rotation.x = Math.PI / 2;
    crankSprocket.position.z = frontZ;
    crankGroup.add(crankSprocket);

    // Reluctor / Trigger Wheel in center of crank
    const triggerWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.035, 36), matSteel);
    triggerWheel.rotation.x = Math.PI / 2;
    triggerWheel.position.z = 0;
    crankGroup.add(triggerWheel);
    for (let t = 0; t < 24; t++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.036), matChrome);
      const a = (t / 24) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0);
      tooth.rotation.z = a;
      crankGroup.add(tooth);
    }

    // Rear Machined Flywheel + Starter Ring Gear + Bolt Pattern
    const flywheelGroup = new THREE.Group();
    flywheelGroup.position.z = rearZ - 0.1;
    const fwDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.06, 40), matSteel);
    fwDisc.rotation.x = Math.PI / 2;
    flywheelGroup.add(fwDisc);
    const fwInner = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.075, 32), matChrome);
    fwInner.rotation.x = Math.PI / 2;
    flywheelGroup.add(fwInner);
    for (let i = 0; i < 36; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.035, 0.03), matDarkSteel);
      const a = (i / 36) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 0.59, Math.sin(a) * 0.59, 0);
      tooth.rotation.z = a;
      flywheelGroup.add(tooth);
    }
    crankGroup.add(flywheelGroup);
    this.parts.flywheel = flywheelGroup;

    this.engineRoot.add(crankGroup);
    this.parts.crankGroup = crankGroup;

    // 2. CYLINDER BANKS, PISTONS, 4-VALVE DOHC VALVETRAIN, TIMING CHAIN & GUIDES
    const blockH = rodLen + crankThrow * 2 + 0.3;
    const headY = blockH + 0.34;
    const camY = headY + 0.44;
    const camXOffset = 0.24;

    for (let b = 0; b < banks; b++) {
      const angle = banks === 1 ? 0 : (b === 0 ? -bankAngleRad / 2 : bankAngleRad / 2);
      const bankGroup = new THREE.Group();
      bankGroup.rotation.z = angle;
      this.engineRoot.add(bankGroup);

      // Optional Block & Valve Cover Housing (hidden in 'internals' mode)
      const blockMesh = new THREE.Mesh(
        new THREE.BoxGeometry(cylRadius * 2.7, blockH, lengthSpan + 0.72),
        matBlock
      );
      blockMesh.position.set(0, blockH * 0.5 + 0.14, 0);
      bankGroup.add(blockMesh);
      this.parts.housingMeshes.push(blockMesh);

      const vcMesh = new THREE.Mesh(
        new THREE.BoxGeometry(cylRadius * 2.6, 0.24, lengthSpan + 0.72),
        matValveCover
      );
      vcMesh.position.set(0, camY + 0.16, 0);
      bankGroup.add(vcMesh);
      this.parts.housingMeshes.push(vcMesh);

      // Dual Overhead Camshafts + VVT Cam Phasers + Cam Lobes
      [-camXOffset, camXOffset].forEach((camX, camSide) => {
        const camGroup = new THREE.Group();
        camGroup.position.set(camX, camY, 0);

        const camShaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.036, 0.036, lengthSpan + 0.9, 16),
          matChrome
        );
        camShaft.rotation.x = Math.PI / 2;
        camGroup.add(camShaft);

        // Detailed VVT Cam Phaser Sprocket at front
        const phaserOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 28), matBronze);
        phaserOuter.rotation.x = Math.PI / 2;
        phaserOuter.position.z = frontZ;
        camGroup.add(phaserOuter);

        const phaserInner = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.065, 20), matChrome);
        phaserInner.rotation.x = Math.PI / 2;
        phaserInner.position.z = frontZ;
        camGroup.add(phaserInner);

        // 5 Bolts on VVT phaser
        for (let bl = 0; bl < 5; bl++) {
          const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.075, 6), matDarkSteel);
          bolt.rotation.x = Math.PI / 2;
          const ba = (bl / 5) * Math.PI * 2;
          bolt.position.set(Math.cos(ba) * 0.07, Math.sin(ba) * 0.07, frontZ);
          camGroup.add(bolt);
        }

        // 2 Eccentric Cam Lobes per cylinder (for 4-valve-per-cylinder DOHC)
        for (let c = 0; c < cylPerBank; c++) {
          const zPos = -lengthSpan / 2 + c * cylSpacing;
          [-0.10, 0.10].forEach(zOff => {
            const lobe = this._makeCamLobe(matChrome);
            lobe.position.set(0, 0, zPos + zOff);
            lobe.rotation.z = (c * 1.4) + (camSide * 1.1);
            camGroup.add(lobe);
          });
        }

        bankGroup.add(camGroup);
        this.parts.cams.push(camGroup);
      });

      // Timing Chain Loop + Curved Chain Guides (front of bank)
      const chainPts = [
        new THREE.Vector3(0, -0.09, frontZ),
        new THREE.Vector3(0.10, 0.05, frontZ),
        new THREE.Vector3(camXOffset + 0.17, camY, frontZ),
        new THREE.Vector3(camXOffset, camY + 0.17, frontZ),
        new THREE.Vector3(-camXOffset, camY + 0.17, frontZ),
        new THREE.Vector3(-camXOffset - 0.17, camY, frontZ),
        new THREE.Vector3(-0.10, 0.05, frontZ)
      ];
      const chain = this._makeTimingChain(chainPts, matDarkSteel, matSteel);
      bankGroup.add(chain);

      // Black Polymer Timing Chain Guides on left & right
      const leftGuide = this._makeTube([
        new THREE.Vector3(-0.14, 0.08, frontZ),
        new THREE.Vector3(-0.32, camY * 0.5, frontZ),
        new THREE.Vector3(-camXOffset - 0.18, camY - 0.05, frontZ)
      ], 0.025, matDarkSteel, 6, 12);
      bankGroup.add(leftGuide);

      const rightGuide = this._makeTube([
        new THREE.Vector3(0.14, 0.08, frontZ),
        new THREE.Vector3(0.28, camY * 0.5, frontZ),
        new THREE.Vector3(camXOffset + 0.18, camY - 0.05, frontZ)
      ], 0.025, matDarkSteel, 6, 12);
      bankGroup.add(rightGuide);

      // Cylinders: Crankpins, Counterweights, Pistons, Rods, 4 Valves + Helical Springs, Spark Plugs
      for (let c = 0; c < cylPerBank; c++) {
        const zPos = -lengthSpan / 2 + c * cylSpacing;
        const cylGlobalIdx = b * cylPerBank + c;
        const phaseOffset = (layout.firingOrder[cylGlobalIdx % layout.firingOrder.length] / cylCount) * Math.PI * 2;

        // Crankpin & Counterweights
        const pinX = Math.sin(phaseOffset) * crankThrow;
        const pinY = Math.cos(phaseOffset) * crankThrow;
        const zPin = zPos + (banks === 2 ? (b === 0 ? -0.05 : 0.05) : 0);

        const pinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 16), matChrome);
        pinMesh.rotation.x = Math.PI / 2;
        pinMesh.position.set(pinX, pinY, zPin);
        crankGroup.add(pinMesh);

        [-0.11, 0.11].forEach(cwOff => {
          const cw = this._makeCounterweight(matCrank, crankThrow * 1.25);
          cw.position.set(0, 0, zPin + cwOff);
          cw.rotation.z = -phaseOffset;
          crankGroup.add(cw);
        });

        // Detailed Piston (Crown, 3 Rings, Skirt Cutouts, Wrist Pin)
        const pistonGroup = new THREE.Group();
        pistonGroup.position.set(0, 0.8, zPos);
        const pCrown = new THREE.Mesh(new THREE.CylinderGeometry(cylRadius * 0.92, cylRadius * 0.90, 0.22, 28), matPiston);
        pistonGroup.add(pCrown);
        // 3 Piston Rings
        [0.085, 0.05, 0.015].forEach(ry => {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(cylRadius * 0.925, 0.007, 6, 28), matDarkSteel);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = ry;
          pistonGroup.add(ring);
        });
        // Wrist Pin
        const wristPin = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, cylRadius * 1.65, 12), matChrome);
        wristPin.rotation.x = Math.PI / 2;
        wristPin.position.y = -0.04;
        pistonGroup.add(wristPin);
        bankGroup.add(pistonGroup);

        // Combustion Flash
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.0 });
        const flash = new THREE.Mesh(new THREE.CylinderGeometry(cylRadius * 0.82, cylRadius * 0.82, 0.04, 16), flashMat);
        flash.position.set(0, blockH + 0.06, zPos);
        bankGroup.add(flash);
        this.parts.combustionFlashes.push({ mesh: flash, mat: flashMat, phase: phaseOffset });

        // I-Beam Connecting Rod + Bolted Big-End Cap
        const rodGroup = new THREE.Group();
        const rodBeam = new THREE.Mesh(new THREE.BoxGeometry(0.055, rodLen, 0.06), matRod);
        rodGroup.add(rodBeam);
        const bigEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.11, 18), matRod);
        bigEnd.rotation.x = Math.PI / 2;
        bigEnd.position.y = -rodLen * 0.48;
        rodGroup.add(bigEnd);
        bankGroup.add(rodGroup);

        this.parts.pistons.push({
          mesh: pistonGroup,
          rod: rodGroup,
          zPos,
          phaseOffset,
          bankAngle: angle,
          crankThrow,
          rodLen
        });

        // 4 Angled Valves per Cylinder + Helical Valve Springs + Buckets
        [-1, 1].forEach(vSide => {
          [-0.10, 0.10].forEach(zOff => {
            const vHolder = new THREE.Group();
            vHolder.position.set(vSide * 0.13, headY - 0.02, zPos + zOff);
            vHolder.rotation.z = -vSide * 0.28; // Pentroof valve angle

            const vStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 10), matChrome);
            vStem.position.y = 0.06;
            vHolder.add(vStem);

            const vHead = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.068, 0.035, 16), matChrome);
            vHead.position.y = -0.08;
            vHolder.add(vHead);

            // Actual 3D Helical Valve Spring
            const spring = this._makeHelicalSpring(0.036, 0.15, 5, 0.007, matSteel);
            spring.position.y = 0.02;
            vHolder.add(spring);

            // Valve Bucket / Retainer
            const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 14), matChrome);
            bucket.position.y = 0.18;
            vHolder.add(bucket);

            bankGroup.add(vHolder);
            this.parts.valves.push({
              mesh: vHolder,
              basePos: vHolder.position.clone(),
              axis: new THREE.Vector3(Math.sin(vSide * 0.28), -Math.cos(vSide * 0.28), 0),
              phaseOffset: phaseOffset + (vSide < 0 ? 0.4 : 3.2)
            });
          });
        });

        // Center Spark Plug + Ignition Coil Pack
        const sparkPlug = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.22, 12), matChrome);
        sparkPlug.position.set(0, headY + 0.06, zPos);
        bankGroup.add(sparkPlug);
        const coilTop = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.12, 12), matAnodizedRed);
        coilTop.position.set(0, headY + 0.22, zPos);
        bankGroup.add(coilTop);
      }
    }

    // 3. PERIPHERALS (Exhaust Headers, Turbo, Intake/Fuel Rail, Radiator) positioned cleanly around the core
    const exhaustSide = banks === 1 ? 1 : 1;
    const headerX = exhaustSide * (cylRadius * 2.3 + 0.35);
    const collectorPos = new THREE.Vector3(headerX + 0.25, headY - 0.35, lengthSpan * 0.1);

    for (let c = 0; c < cylPerBank; c++) {
      const zPos = -lengthSpan / 2 + c * cylSpacing;
      const runner = this._makeTube([
        new THREE.Vector3(exhaustSide * (cylRadius * 1.35), headY - 0.05, zPos),
        new THREE.Vector3(headerX, headY - 0.08, zPos),
        new THREE.Vector3(collectorPos.x, collectorPos.y + 0.1, (zPos + collectorPos.z) * 0.5),
        collectorPos
      ], 0.048, matExhaust, 10, 16);
      this.engineRoot.add(runner);
    }

    // Turbocharger mounted at header collector
    if (cfg.turbo !== 'na' && cfg.turbo !== 'super') {
      const turboScale = cfg.turbo === 'small' ? 0.85 : cfg.turbo === 'large' ? 1.28 : 1.05;
      const turboGroup = new THREE.Group();
      turboGroup.position.copy(collectorPos).add(new THREE.Vector3(0.12, 0.08, 0.15));

      const hotHousing = new THREE.Mesh(new THREE.TorusGeometry(0.20 * turboScale, 0.095 * turboScale, 16, 28), matExhaust);
      turboGroup.add(hotHousing);

      const coldHousing = new THREE.Mesh(new THREE.TorusGeometry(0.22 * turboScale, 0.105 * turboScale, 16, 28), matChrome);
      coldHousing.position.z = 0.24 * turboScale;
      turboGroup.add(coldHousing);

      const wheelGroup = new THREE.Group();
      wheelGroup.position.z = 0.24 * turboScale;
      const hub = new THREE.Mesh(new THREE.ConeGeometry(0.06 * turboScale, 0.14 * turboScale, 14), matChrome);
      hub.rotation.x = Math.PI / 2;
      wheelGroup.add(hub);
      for (let bl = 0; bl < 10; bl++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.16 * turboScale, 0.04),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.95, roughness: 0.12 })
        );
        blade.rotation.z = (bl / 10) * Math.PI * 2;
        wheelGroup.add(blade);
      }
      turboGroup.add(wheelGroup);
      this.parts.turboWheel = wheelGroup;

      const filterCone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10 * turboScale, 0.15 * turboScale, 0.22 * turboScale, 18),
        matAnodizedRed
      );
      filterCone.rotation.x = Math.PI / 2;
      filterCone.position.z = 0.45 * turboScale;
      turboGroup.add(filterCone);

      this.engineRoot.add(turboGroup);
      this.parts.explodeGroups.push({ obj: turboGroup, basePos: turboGroup.position.clone(), offset: new THREE.Vector3(0.8, 0.2, 0) });

      // Downpipe + Backfire Flame Cone
      const tPos = turboGroup.position;
      const downpipe = this._makeTube([
        new THREE.Vector3(tPos.x + 0.12, tPos.y + 0.08, tPos.z - 0.12),
        new THREE.Vector3(tPos.x + 0.35, tPos.y - 0.2, tPos.z - 0.65),
        new THREE.Vector3(tPos.x + 0.35, tPos.y - 0.55, rearZ - 0.3)
      ], 0.075, matExhaust, 10, 14);
      this.engineRoot.add(downpipe);

      const flameMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0 });
      const flameCone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 14), flameMat);
      flameCone.rotation.x = -Math.PI / 2;
      flameCone.position.set(tPos.x + 0.35, tPos.y - 0.55, rearZ - 0.58);
      this.engineRoot.add(flameCone);
      this.parts.flameMat = flameMat;
      this.parts.flameMesh = flameCone;
    } else {
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0 });
      const flameCone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.45, 12), flameMat);
      flameCone.rotation.x = -Math.PI / 2;
      flameCone.position.set(collectorPos.x, collectorPos.y, rearZ - 0.35);
      this.engineRoot.add(flameCone);
      this.parts.flameMat = flameMat;
      this.parts.flameMesh = flameCone;
    }

    // Intake Plenum + Fuel Rail on opposite side
    const intakeX = banks === 1 ? -0.82 : 0;
    const intakeY = banks === 1 ? headY + 0.08 : headY + 0.55;
    const plenumGroup = new THREE.Group();
    const plenum = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, lengthSpan + 0.25, 20), matSteel);
    plenum.rotation.x = Math.PI / 2;
    plenum.position.set(intakeX, intakeY, 0);
    plenumGroup.add(plenum);

    const fuelRail = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, lengthSpan + 0.2, 12), matAnodizedRed);
    fuelRail.rotation.x = Math.PI / 2;
    fuelRail.position.set(intakeX * 0.62, intakeY + 0.16, 0);
    plenumGroup.add(fuelRail);

    for (let i = 0; i < cylPerBank; i++) {
      const zPos = -lengthSpan / 2 + i * cylSpacing;
      const runner = this._makeTube([
        new THREE.Vector3(intakeX, intakeY, zPos),
        new THREE.Vector3(intakeX * 0.55, intakeY + 0.05, zPos),
        new THREE.Vector3(banks === 1 ? -cylRadius * 1.25 : -0.18, headY - 0.02, zPos)
      ], 0.048, matSteel, 10, 12);
      plenumGroup.add(runner);

      const injector = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10), matSilicone);
      injector.position.set(intakeX * 0.62, intakeY + 0.1, zPos);
      injector.rotation.z = -0.35;
      plenumGroup.add(injector);
    }
    this.engineRoot.add(plenumGroup);
    this.parts.explodeGroups.push({ obj: plenumGroup, basePos: plenumGroup.position.clone(), offset: new THREE.Vector3(-0.7, 0.6, 0) });

    // Apply current view mode visibility
    this.setViewMode(this.viewMode);
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.targetExplode = mode === 'exploded' ? 1.0 : 0.0;
    const showHousing = mode !== 'internals';
    this.parts.housingMeshes.forEach(m => { m.visible = showHousing; });
    this.parts.housingMats.forEach(mat => {
      mat.wireframe = mode === 'wireframe';
      mat.transparent = mode === 'cutaway';
      mat.opacity = mode === 'cutaway' ? 0.22 : 1.0;
      mat.depthWrite = mode !== 'cutaway';
      mat.needsUpdate = true;
    });
  }

  setCameraPreset(preset) {
    const map = {
      iso:   [3.8, 2.2, 4.4],
      front: [0, 1.0, 5.2],
      side:  [5.2, 1.0, 0],
      top:   [0.1, 5.8, 0.2]
    };
    const pos = map[preset] || map.iso;
    this.camera.position.set(...pos);
    this.controls.target.set(0, 0.72, 0);
    this.controls.update();
  }

  updateTelemetry(rpm, boostPsi, egtC, throttle, dt) {
    const visualRpm = Math.min(rpm, 3200) * 0.25 + rpm * 0.06;
    const omega = (visualRpm * 2 * Math.PI) / 60;
    this.crankAngle += omega * dt;

    if (this.parts.crankGroup) {
      this.parts.crankGroup.rotation.z = -this.crankAngle;
    }
    this.parts.cams.forEach(cam => {
      cam.rotation.z = -this.crankAngle * 0.5;
    });

    // Advance timing chain links along the loop at crank sprocket pitch speed
    for (const chain of this.parts.chains) {
      const offset = (this.crankAngle * 0.085) / chain.totalLen;
      for (const l of chain.links) {
        const t = ((l.baseT - offset) % 1 + 1) % 1;
        const pos = chain.curve.getPointAt(t);
        const tan = chain.curve.getTangentAt(t);
        l.mesh.position.copy(pos);
        l.mesh.rotation.z = Math.atan2(tan.y, tan.x);
      }
    }

    for (const p of this.parts.pistons) {
      const theta = this.crankAngle + p.phaseOffset - p.bankAngle;
      const r = p.crankThrow;
      const l = p.rodLen;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const pinX = r * sinT;
      const pinY = r * cosT;
      const pistonY = pinY + Math.sqrt(Math.max(0.01, l * l - pinX * pinX));

      p.mesh.position.y = pistonY + 0.12;
      p.rod.position.set(pinX * 0.5, (pinY + pistonY) * 0.5, p.zPos);
      p.rod.rotation.z = Math.atan2(pinX, pistonY - pinY);
    }

    for (const v of this.parts.valves) {
      const camCycle = ((this.crankAngle * 0.5 + v.phaseOffset) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const lift = camCycle < 1.2 ? Math.sin((camCycle / 1.2) * Math.PI) * 0.11 : 0;
      v.mesh.position.copy(v.basePos).addScaledVector(v.axis, lift);
    }

    for (const f of this.parts.combustionFlashes) {
      const cycle = ((this.crankAngle + f.phase) % (Math.PI * 4) + Math.PI * 4) % (Math.PI * 4);
      if (cycle < 0.12 && rpm > 50) {
        f.mat.color.setHex(0x60a5fa); // Spark ignition arc
        f.mat.opacity = 0.85;
      } else if (cycle < 0.48 && rpm > 50) {
        f.mat.color.setHex(0xf97316); // Combustion flame front
        f.mat.opacity = (1 - (cycle - 0.12) / 0.36) * (0.25 + 0.75 * throttle);
      } else {
        f.mat.opacity = 0;
      }
    }

    if (this.parts.flameMat) {
      this.parts.flameMat.opacity = Math.max(0, this.parts.flameMat.opacity - dt * 7.5);
    }

    if (this.parts.turboWheel) {
      const turboSpeed = 6 + Math.max(0, boostPsi) * 2.4 + (rpm / 1000) * 1.8;
      this.turboAngle += turboSpeed * dt;
      this.parts.turboWheel.rotation.z = this.turboAngle;
    }

    if (this.parts.exhaustMat) {
      const glow = Math.max(0, Math.min(1, (egtC - 550) / 420));
      this.parts.exhaustMat.emissive.setRGB(glow * 1.0, glow * 0.22, glow * 0.02);
      this.parts.exhaustMat.emissiveIntensity = glow * 2.5;
    }

    this.explodeFactor += (this.targetExplode - this.explodeFactor) * Math.min(1, dt * 7);
    for (const eg of this.parts.explodeGroups) {
      eg.obj.position.copy(eg.basePos).addScaledVector(eg.offset, this.explodeFactor);
    }
  }

  triggerFlame() {
    if (this.parts.flameMat && this.parts.flameMesh) {
      this.parts.flameMat.color.setHex(Math.random() < 0.4 ? 0x38bdf8 : 0xf97316);
      this.parts.flameMat.opacity = 0.95;
      this.parts.flameMesh.scale.set(0.8 + Math.random() * 0.5, 0.7 + Math.random() * 0.8, 0.8 + Math.random() * 0.5);
    }
  }

  _animateLoop() {
    requestAnimationFrame(() => this._animateLoop());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
