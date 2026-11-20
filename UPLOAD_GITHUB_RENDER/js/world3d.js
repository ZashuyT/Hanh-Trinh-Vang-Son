// ============================================================================
// THE GOLDEN JOURNEY (HÀNH TRÌNH VÀNG SON) — V7.0 ULTRA-HD 3D WORLD
// - High-Resolution Vietnam S-Curve Map (29 Rows: r = -14..+14)
// - Stratified 3-Layer Hex Terrain with Coastal Sand Shelves & Beveled Plateaus
// - Living Ocean: 12 Ambient Sampans, 6 Dolphin Pods, 8 Fish Schools, 10 Seagull
//   Flocks, 4 Lighthouse Islands, 3 Offshore Oil Rigs, 10 Karst Outcrops
// - Dynamic Weather & Time-of-Day Cycle (Sunny, Rain, Thunderstorm, Sunset,
//   Starry Night, Super Typhoon Yagi)
// - Right-Click Camera Rotate, WASD Camera Pan, Double-Click Custom Path
//   Drawing, and Occupied-Tile Fade + Ship Highlight
// ============================================================================

class World3D {
    constructor(containerId, onHexClickCallback, onHexHoverCallback) {
        this.container = document.getElementById(containerId);
        this.onHexClick = onHexClickCallback;
        this.onHexHover = onHexHoverCallback;

        this.hexRadius = 2.26;
        this.hexTiles = [];
        this.hexMap = new Map(); // "q,r" -> tileObj
        this.pickableMeshes = [];
        this.shipMeshes = new Map(); // shipKey -> THREE.Group
        this.floatingEffects = [];
        this.animatedLandProps = [];
        this.fairSpawnAnchors = [];
        this.activeNPCTile = null;

        this.cloudsVisible = true;
        this.minimalistMode = false;
        this.cameraLockEnabled = false;
        this.cameraLockShipKey = null;
        this.weatherMode = "sunny";

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredHex = null;
        this.reachablePaths = new Map(); // "q,r" -> { steps, path: [tile, ...] }

        this.clock = new THREE.Clock();
        this.initScene();
        this.initAtmosphereAndWeather();
        this.initOcean();
        this.initEvents();
    }

    static getPlayerShipKey(player, fallbackIdx = 0) {
        if (!player) return `ship_${fallbackIdx}`;
        if (player.shipKey) return String(player.shipKey);
        if (player.clientId) return `client_${player.clientId}`;
        if (player.seatIndex !== undefined && player.seatIndex !== null) return `seat_${player.seatIndex}`;
        return `id_${player.id !== undefined ? player.id : fallbackIdx}`;
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b3954);
        this.scene.fog = new THREE.FogExp2(0x0d4768, 0.0028);

        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;

        this.camera = new THREE.PerspectiveCamera(40, w / h, 0.5, 900);
        this.camera.position.set(12, 84, 66);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.18;
        this.container.innerHTML = "";
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.enablePan = false; // Panning is controlled via W A S D keys
        this.controls.mouseButtons = {
            LEFT: -1, // Left mouse button is reserved for selecting hexes & custom path drawing
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE // Right mouse button rotates camera view
        };
        this.controls.maxPolarAngle = Math.PI / 2.22;
        this.controls.minPolarAngle = Math.PI / 11;
        this.controls.minDistance = 14;
        this.controls.maxDistance = 225;
        this.controls.target.set(0, 0, 2);

        // Rich Tropical Daylight + Warm Golden Sun + Cool Ocean Rim Light
        this.hemiLight = new THREE.HemisphereLight(0xfffbeb, 0x0369a1, 1.08);
        this.hemiLight.position.set(0, 120, 0);
        this.scene.add(this.hemiLight);

        this.sunLight = new THREE.DirectionalLight(0xfff3c4, 1.55);
        this.sunLight.position.set(64, 118, 56);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 5;
        this.sunLight.shadow.camera.far = 290;
        const d = 115;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.sunLight.shadow.bias = -0.00045;
        this.scene.add(this.sunLight);

        this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.58);
        this.rimLight.position.set(-72, 48, -62);
        this.scene.add(this.rimLight);

        this.boardGroup = new THREE.Group();
        this.scene.add(this.boardGroup);

        this.pathPreviewGroup = new THREE.Group();
        this.scene.add(this.pathPreviewGroup);

        this.effectsGroup = new THREE.Group();
        this.scene.add(this.effectsGroup);
    }

    initAtmosphereAndWeather() {
        this.weatherGroup = new THREE.Group();
        this.scene.add(this.weatherGroup);

        this.clouds = [];
        const cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.88,
            transparent: true,
            opacity: 0.58
        });

        for (let i = 0; i < 14; i++) {
            const cGroup = new THREE.Group();
            const puffCount = 3 + (i % 3);
            for (let p = 0; p < puffCount; p++) {
                const puffGeo = new THREE.DodecahedronGeometry(1.15 + Math.random() * 1.0, 1);
                puffGeo.scale(1.4, 0.48, 1.0);
                const puff = new THREE.Mesh(puffGeo, cloudMat);
                puff.position.set(
                    (p - puffCount / 2) * 1.3,
                    (Math.random() - 0.5) * 0.25,
                    (Math.random() - 0.5) * 0.8
                );
                cGroup.add(puff);
            }
            const sideZ = (i % 2 === 0 ? 1 : -1) * (34 + Math.random() * 34);
            cGroup.position.set(
                (Math.random() - 0.5) * 145,
                22 + Math.random() * 11,
                sideZ
            );
            cGroup.visible = this.cloudsVisible;
            this.weatherGroup.add(cGroup);
            this.clouds.push({
                mesh: cGroup,
                speed: 0.45 + Math.random() * 0.65,
                bobOffset: Math.random() * Math.PI * 2
            });
        }
        this.cloudMaterial = cloudMat;

        const starCount = 340;
        const starGeo = new THREE.BufferGeometry();
        const starPos = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            starPos[i * 3] = (Math.random() - 0.5) * 260;
            starPos[i * 3 + 1] = 3 + Math.random() * 55;
            starPos[i * 3 + 2] = (Math.random() - 0.5) * 260;
        }
        starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
        this.starField = new THREE.Points(
            starGeo,
            new THREE.PointsMaterial({ color: 0xfef08a, size: 0.48, transparent: true, opacity: 0.0 })
        );
        this.weatherGroup.add(this.starField);

        // Rain Particle Field for Tropical Rain / Thunderstorm / Super Typhoon Yagi
        const rainCount = 650;
        const rainGeo = new THREE.BufferGeometry();
        const rainPos = new Float32Array(rainCount * 3);
        for (let i = 0; i < rainCount; i++) {
            rainPos[i * 3] = (Math.random() - 0.5) * 190;
            rainPos[i * 3 + 1] = Math.random() * 55;
            rainPos[i * 3 + 2] = (Math.random() - 0.5) * 190;
        }
        rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
        this.rainField = new THREE.Points(
            rainGeo,
            new THREE.PointsMaterial({ color: 0xbae6fd, size: 0.34, transparent: true, opacity: 0.0 })
        );
        this.weatherGroup.add(this.rainField);
    }

    toggleClouds() {
        this.cloudsVisible = !this.cloudsVisible;
        if (this.clouds) {
            this.clouds.forEach(c => {
                if (c.mesh) c.mesh.visible = this.cloudsVisible;
            });
        }
        return this.cloudsVisible;
    }

    toggleMinimalistMode() {
        this.minimalistMode = !this.minimalistMode;
        this.applyMinimalistMode();
        return this.minimalistMode;
    }

    applyMinimalistMode() {
        const showExtra = !this.minimalistMode;

        // 1. Toggle ambient wildlife & outer scenery (birds, fish, dolphins, sampans, lighthouses, oil rigs)
        if (this.sceneryGroup) {
            this.sceneryGroup.visible = showExtra;
        }
        if (this.foamRings) {
            this.foamRings.forEach(f => {
                if (f.mesh) f.mesh.visible = showExtra;
            });
        }

        // 2. Toggle ship light pillars & lanterns in minimalist mode (while keeping ship, hull ring & local arrow visible)
        if (this.shipMeshes) {
            this.shipMeshes.forEach(ship => {
                if (ship.userData) {
                    const pillar = ship.userData.beaconPillar || ship.userData.lightPillar;
                    if (pillar) pillar.visible = showExtra;
                }
            });
        }
    }

    setCameraLockTarget(player = null) {
        if (player) {
            this.cameraLockShipKey = World3D.getPlayerShipKey(player);
        }
    }

    toggleCameraLock(player = null) {
        if (player) {
            this.cameraLockShipKey = World3D.getPlayerShipKey(player);
        }
        this.cameraLockEnabled = !this.cameraLockEnabled;
        if (this.cameraLockEnabled && this.cameraLockShipKey) {
            const shipMesh = this.shipMeshes.get(this.cameraLockShipKey);
            if (shipMesh) {
                const offset = this.camera.position.clone().sub(this.controls.target);
                this.controls.target.set(shipMesh.position.x, 0, shipMesh.position.z);
                this.camera.position.copy(this.controls.target).add(offset);
            }
        }
        return this.cameraLockEnabled;
    }

    setWeatherMode(mode) {
        const validModes = new Set(["sunny", "tropical_rain", "thunderstorm", "sunset", "night", "super_typhoon_yagi"]);
        const validMode = validModes.has(mode) ? mode : "sunny";
        this.weatherMode = validMode;
        const presets = {
            sunny: {
                bg: 0x0b3954, fog: 0x0d4768, hemiSky: 0xfffbeb, hemiGround: 0x0369a1, hemiInt: 1.08,
                sunCol: 0xfff3c4, sunInt: 1.55, sunPos: [64, 118, 56], cloudCol: 0xffffff, cloudOp: 0.58,
                waveAmp: 1.0, starsOp: 0.0, rainOp: 0.0
            },
            tropical_rain: {
                bg: 0x162d3d, fog: 0x1c374a, hemiSky: 0x94a3b8, hemiGround: 0x0f172a, hemiInt: 0.78,
                sunCol: 0xcbd5e1, sunInt: 0.92, sunPos: [40, 100, 35], cloudCol: 0x64748b, cloudOp: 0.80,
                waveAmp: 1.38, starsOp: 0.0, rainOp: 0.65
            },
            thunderstorm: {
                bg: 0x091522, fog: 0x0d1d2e, hemiSky: 0x64748b, hemiGround: 0x070e17, hemiInt: 0.62,
                sunCol: 0x93c5fd, sunInt: 0.75, sunPos: [25, 95, 25], cloudCol: 0x334155, cloudOp: 0.88,
                waveAmp: 1.75, starsOp: 0.15, rainOp: 0.82
            },
            sunset: {
                bg: 0x3b1832, fog: 0x5c233a, hemiSky: 0xfda4af, hemiGround: 0x1e1b4b, hemiInt: 0.96,
                sunCol: 0xf97316, sunInt: 1.75, sunPos: [-78, 46, 52], cloudCol: 0xfed7aa, cloudOp: 0.68,
                waveAmp: 1.05, starsOp: 0.42, rainOp: 0.0
            },
            night: {
                bg: 0x030c18, fog: 0x041224, hemiSky: 0x38bdf8, hemiGround: 0x020617, hemiInt: 0.52,
                sunCol: 0x60a5fa, sunInt: 0.74, sunPos: [-45, 86, -45], cloudCol: 0x1e293b, cloudOp: 0.46,
                waveAmp: 0.88, starsOp: 0.92, rainOp: 0.0
            },
            super_typhoon_yagi: {
                bg: 0x14070d, fog: 0x1e0913, hemiSky: 0xf43f5e, hemiGround: 0x090408, hemiInt: 0.65,
                sunCol: 0xfda4af, sunInt: 0.82, sunPos: [15, 90, 20], cloudCol: 0x4c0519, cloudOp: 0.92,
                waveAmp: 2.15, starsOp: 0.10, rainOp: 0.92
            }
        };

        const p = presets[validMode] || presets.sunny;
        this.scene.background.setHex(p.bg);
        this.scene.fog.color.setHex(p.fog);
        this.hemiLight.color.setHex(p.hemiSky);
        this.hemiLight.groundColor.setHex(p.hemiGround);
        this.hemiLight.intensity = p.hemiInt;
        this.sunLight.color.setHex(p.sunCol);
        this.sunLight.intensity = p.sunInt;
        this.sunLight.position.set(...p.sunPos);
        this.cloudMaterial.color.setHex(p.cloudCol);
        this.cloudMaterial.opacity = p.cloudOp;
        this.starField.material.opacity = p.starsOp;
        if (this.rainField) {
            this.rainField.material.opacity = p.rainOp || 0.0;
        }
        this.waveMultiplier = p.waveAmp;
    }

    initOcean() {
        this.waveMultiplier = 1.0;
        // 72x72 dynamic 3D wave mesh gives rich rolling 3D waves at silky-smooth 60 FPS
        const oceanGeo = new THREE.PlaneGeometry(340, 340, 72, 72);
        oceanGeo.rotateX(-Math.PI / 2);

        const pos = oceanGeo.attributes.position;
        this.oceanBaseY = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
            this.oceanBaseY[i] = pos.getY(i);
        }

        const oceanMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            emissive: 0x042f49,
            emissiveIntensity: 0.34,
            roughness: 0.20,
            metalness: 0.38,
            flatShading: false
        });

        this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
        this.oceanMesh.position.y = -0.22;
        this.oceanMesh.receiveShadow = true;
        this.scene.add(this.oceanMesh);

        // Deep Ocean Seabed Floor
        const seabedGeo = new THREE.PlaneGeometry(360, 360);
        seabedGeo.rotateX(-Math.PI / 2);
        const seabedMat = new THREE.MeshBasicMaterial({ color: 0x021b2d });
        const seabed = new THREE.Mesh(seabedGeo, seabedMat);
        seabed.position.y = -1.65;
        this.scene.add(seabed);

        this.foamRings = [];
        const foamMat = new THREE.MeshBasicMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.20,
            side: THREE.DoubleSide
        });
        for (let i = 0; i < 48; i++) {
            const rGeo = new THREE.RingGeometry(0.32, 0.48, 12);
            rGeo.rotateX(-Math.PI / 2);
            const rMesh = new THREE.Mesh(rGeo, foamMat.clone());
            rMesh.position.set(
                (Math.random() - 0.5) * 185,
                -0.14,
                (Math.random() - 0.5) * 165
            );
            this.scene.add(rMesh);
            this.foamRings.push({
                mesh: rMesh,
                phase: Math.random() * Math.PI * 2,
                speed: 0.7 + Math.random() * 1.1
            });
        }

        this.initAmbientOceanScenery();
    }

    initAmbientOceanScenery() {
        this.sceneryGroup = new THREE.Group();
        this.scene.add(this.sceneryGroup);

        this.ambientLighthouses = [];
        this.ambientOilRigs = [];
        this.ambientSampans = [];
        this.ambientDolphins = [];
        this.ambientFishSchools = [];
        this.ambientSeagulls = [];

        // 1. 10 Distant Limestone Karst Islands Around the Outer Horizon
        const karstLocations = [
            { x: 56, z: -48, scale: 1.45, rot: 0.4 },
            { x: 66, z: -26, scale: 1.75, rot: 1.7 },
            { x: 68, z: 2, scale: 1.38, rot: 0.9 },
            { x: 64, z: 32, scale: 1.65, rot: 2.3 },
            { x: 52, z: 54, scale: 1.50, rot: 2.8 },
            { x: -46, z: -44, scale: 1.40, rot: 0.8 },
            { x: -54, z: -16, scale: 1.60, rot: 2.1 },
            { x: -52, z: 16, scale: 1.35, rot: 1.2 },
            { x: -46, z: 48, scale: 1.55, rot: 2.5 },
            { x: 10, z: 66, scale: 1.42, rot: 0.3 }
        ];
        karstLocations.forEach(kl => {
            const kMesh = ProceduralModels.createDistantKarstOutcrop(kl.scale);
            kMesh.position.set(kl.x, -0.18, kl.z);
            kMesh.rotation.y = kl.rot;
            this.sceneryGroup.add(kMesh);
        });

        // 2. 4 Decorative Sea Lighthouses with Rotating Light Beams
        const lighthouseCoords = [
            { x: 46, z: -40 },
            { x: 56, z: -6 },
            { x: 52, z: 26 },
            { x: 38, z: 52 }
        ];
        lighthouseCoords.forEach((lc, idx) => {
            const lh = ProceduralModels.createSeaLighthouseIsland();
            lh.position.set(lc.x, -0.16, lc.z);
            this.sceneryGroup.add(lh);
            this.ambientLighthouses.push({
                mesh: lh,
                beam: lh.userData.beam || lh.userData.beamPivot,
                speed: 0.85 + idx * 0.20,
                phase: idx * 1.5
            });
        });

        // 3. 3 Offshore Oil & Gas Platforms (Giàn Khoan Dầu Khí Biển Đông)
        const oilRigCoords = [
            { x: 46, z: 38, rot: 0.25 },
            { x: 58, z: 14, rot: -0.35 },
            { x: 26, z: 58, rot: 0.65 }
        ];
        oilRigCoords.forEach((rc, idx) => {
            const rig = ProceduralModels.createOffshoreOilRig();
            rig.position.set(rc.x, -0.18, rc.z);
            rig.rotation.y = rc.rot;
            this.sceneryGroup.add(rig);
            this.ambientOilRigs.push({
                mesh: rig,
                flame: rig.userData.flame,
                radar: rig.userData.radar,
                phase: idx * 2.1
            });
        });

        // 4. 12 Ambient Sailing Fishing Sampans Patrolling the Outer Sea
        const sampanColors = ["#d97706", "#b45309", "#0284c7", "#dc2626", "#15803d", "#7c3aed"];
        const sampanOrbits = [
            { cx: 42, cz: -32, rx: 6.5, rz: 4.5, speed: 0.34, phase: 0.0 },
            { cx: 52, cz: -16, rx: 5.5, rz: 6.5, speed: 0.28, phase: 1.1 },
            { cx: 54, cz: 6, rx: 6.5, rz: 5.5, speed: 0.32, phase: 2.2 },
            { cx: 48, cz: 26, rx: 5.5, rz: 4.8, speed: 0.30, phase: 3.3 },
            { cx: 36, cz: 46, rx: 6.2, rz: 5.2, speed: 0.27, phase: 4.1 },
            { cx: 14, cz: 56, rx: 7.0, rz: 4.2, speed: 0.31, phase: 5.0 },
            { cx: -36, cz: -34, rx: 5.2, rz: 5.2, speed: 0.29, phase: 0.7 },
            { cx: -42, cz: -8, rx: 5.5, rz: 6.2, speed: 0.26, phase: 1.9 },
            { cx: -40, cz: 22, rx: 5.5, rz: 4.8, speed: 0.33, phase: 3.0 },
            { cx: -32, cz: 46, rx: 6.0, rz: 4.5, speed: 0.28, phase: 4.4 },
            { cx: 34, cz: -50, rx: 5.8, rz: 4.2, speed: 0.30, phase: 2.6 },
            { cx: -14, cz: -52, rx: 6.5, rz: 4.0, speed: 0.32, phase: 1.4 }
        ];
        sampanOrbits.forEach((orb, idx) => {
            const boat = ProceduralModels.createAmbientFishingSampan(sampanColors[idx % sampanColors.length]);
            boat.position.set(orb.cx, -0.14, orb.cz);
            this.sceneryGroup.add(boat);
            this.ambientSampans.push({
                mesh: boat,
                ...orb
            });
        });

        // 5. 6 Jumping Dolphin Pods in the Open East Sea
        const dolphinLocations = [
            { x: 38, z: -22, rot: 0.4, phase: 0.0 },
            { x: 46, z: -2, rot: -0.3, phase: 1.2 },
            { x: 44, z: 18, rot: 0.7, phase: 2.4 },
            { x: 32, z: 38, rot: 1.1, phase: 3.6 },
            { x: -32, z: 8, rot: -0.8, phase: 4.8 },
            { x: 18, z: -44, rot: 0.2, phase: 5.5 }
        ];
        dolphinLocations.forEach(dl => {
            const pod = ProceduralModels.createJumpingDolphinPod();
            pod.position.set(dl.x, -0.16, dl.z);
            pod.rotation.y = dl.rot;
            this.sceneryGroup.add(pod);
            this.ambientDolphins.push({
                group: pod,
                d1: pod.userData.d1,
                d2: pod.userData.d2,
                dolphins: pod.userData.dolphins,
                phase: dl.phase
            });
        });

        // 6. 8 Glowing Underwater Fish Schools
        const fishSchoolCoords = [
            { cx: 28, cz: -30, r: 2.4, speed: 0.65, phase: 0.0 },
            { cx: 36, cz: -10, r: 2.8, speed: 0.55, phase: 1.3 },
            { cx: 40, cz: 10, r: 2.5, speed: 0.60, phase: 2.1 },
            { cx: 34, cz: 28, r: 2.6, speed: 0.58, phase: 3.4 },
            { cx: 20, cz: 44, r: 2.4, speed: 0.62, phase: 4.2 },
            { cx: -28, cz: -20, r: 2.5, speed: 0.56, phase: 5.1 },
            { cx: -30, cz: 28, r: 2.5, speed: 0.60, phase: 2.7 },
            { cx: 24, cz: -40, r: 2.3, speed: 0.64, phase: 0.9 }
        ];
        fishSchoolCoords.forEach(fc => {
            const school = ProceduralModels.createGlowingFishSchool();
            school.position.set(fc.cx, -0.22, fc.cz);
            this.sceneryGroup.add(school);
            this.ambientFishSchools.push({
                mesh: school,
                ...fc
            });
        });

        // 7. 10 Circling Seagull Flocks High Above the Coast & Islands
        const gullOrbits = [
            { cx: 14, cz: -32, r: 9, y: 8.5, speed: 0.46, phase: 0.0 },
            { cx: 22, cz: -14, r: 10, y: 9.2, speed: 0.40, phase: 1.1 },
            { cx: 28, cz: 4, r: 11, y: 8.8, speed: 0.42, phase: 2.3 },
            { cx: 24, cz: 24, r: 9.5, y: 8.4, speed: 0.44, phase: 3.5 },
            { cx: 10, cz: 40, r: 10, y: 8.6, speed: 0.39, phase: 4.7 },
            { cx: -16, cz: -24, r: 8.5, y: 9.4, speed: 0.43, phase: 5.4 },
            { cx: -12, cz: 14, r: 9.0, y: 9.0, speed: 0.41, phase: 1.8 },
            { cx: 42, cz: -8, r: 8.5, y: 7.8, speed: 0.48, phase: 2.9 },
            { cx: 38, cz: 24, r: 8.5, y: 7.6, speed: 0.45, phase: 4.0 },
            { cx: -18, cz: 36, r: 9.0, y: 8.8, speed: 0.42, phase: 0.6 }
        ];
        gullOrbits.forEach(go => {
            const flock = ProceduralModels.createSeagullFlock();
            flock.position.set(go.cx, go.y, go.cz);
            this.sceneryGroup.add(flock);
            this.ambientSeagulls.push({
                mesh: flock,
                wings: flock.userData.wings,
                birds: flock.userData.birds,
                ...go
            });
        });
    }

    axialToWorld(q, r) {
        const size = this.hexRadius * 1.025;
        const x = size * Math.sqrt(3) * (q + r / 2);
        const z = size * (3 / 2) * r;
        return { x, z };
    }

    static hexDistance(a, b) {
        return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    }

    // ========================================================================
    // HIGH-RESOLUTION VIETNAM S-CURVE LAND PROFILE (29 ROWS: r = -14 .. +14)
    // Exact cartographic silhouette of Vietnam with all 6 Economic Regions:
    //  - Wide Northern Fan (Đông Bắc – Tây Bắc & Đồng Bằng Sông Hồng)
    //  - Narrow Central Waist (Khúc Ruột Miền Trung, Thanh Hóa -> Hải Vân)
    //  - Eastern Bulge (Quảng Nam – Quy Nhơn – Phú Yên & Tây Nguyên)
    //  - Southern Taper & Mekong Peninsula (Đông Nam Bộ & Mũi Cà Mau)
    // ========================================================================
    getVietnamLandRowSpec(r) {
        const table = {
            "-14": { minCol: -2, maxCol: 2,  getReg: () => 0 }, // Hà Giang - Cao Bằng
            "-13": { minCol: -4, maxCol: 3,  getReg: () => 0 }, // Lào Cai - Lạng Sơn
            "-12": { minCol: -5, maxCol: 3,  getReg: () => 0 }, // Điện Biên - Yên Bái - Quảng Ninh
            "-11": { minCol: -5, maxCol: 2,  getReg: (c) => (c >= -1 ? 1 : 0) }, // Sơn La - Phú Thọ - Bắc Ninh
            "-10": { minCol: -5, maxCol: 2,  getReg: (c) => (c >= -2 ? 1 : 0) }, // Hòa Bình - Hà Nội - Hải Phòng
            "-9":  { minCol: -4, maxCol: 1,  getReg: (c) => (c >= -3 ? 1 : 0) }, // Hưng Yên - Thái Bình - Nam Định
            "-8":  { minCol: -4, maxCol: 0,  getReg: () => 1 }, // Ninh Bình - Tam Điệp (Filled solid delta)

            "-7":  { minCol: -5, maxCol: -1, getReg: () => 2 }, // Thanh Hóa
            "-6":  { minCol: -5, maxCol: -2, getReg: () => 2 }, // Nghệ An (Vinh)
            "-5":  { minCol: -5, maxCol: -2, getReg: () => 2 }, // Hà Tĩnh (Hoành Sơn)
            "-4":  { minCol: -4, maxCol: -1, getReg: () => 2 }, // Quảng Bình (Phong Nha)
            "-3":  { minCol: -3, maxCol: 0,  getReg: () => 2 }, // Quảng Trị - Thừa Thiên Huế
            "-2":  { minCol: -2, maxCol: 2,  getReg: () => 2 }, // Đà Nẵng - Hội An

            "-1":  { minCol: -1, maxCol: 2,  getReg: (c) => (c <= 0 ? 3 : 2) }, // Kon Tum - Quảng Ngãi
            "0":   { minCol: -1, maxCol: 3,  getReg: (c) => (c <= 1 ? 3 : 2) }, // Gia Lai - Bình Định
            "1":   { minCol: 0,  maxCol: 4,  getReg: (c) => (c <= 2 ? 3 : 2) }, // Đắk Lắk - Phú Yên (Cực Đông)
            "2":   { minCol: 0,  maxCol: 4,  getReg: (c) => (c <= 2 ? 3 : 2) }, // Buôn Ma Thuột - Khánh Hòa
            "3":   { minCol: -1, maxCol: 3,  getReg: (c) => (c <= 1 ? 3 : 2) }, // Đắk Nông - Ninh Thuận
            "4":   { minCol: -1, maxCol: 2,  getReg: (c) => (c <= 0 ? 3 : 2) }, // Lâm Đồng - Bình Thuận

            "5":   { minCol: -3, maxCol: 1,  getReg: (c) => (c <= 0 ? 4 : 2) }, // Bình Phước - Tây Ninh - Phan Thiết
            "6":   { minCol: -4, maxCol: 0,  getReg: () => 4 }, // Bình Dương - Đồng Nai - TP.HCM
            "7":   { minCol: -5, maxCol: 0,  getReg: () => 4 }, // TP.HCM - Bà Rịa Vũng Tàu

            "8":   { minCol: -6, maxCol: -1, getReg: (c) => (c >= -2 ? 4 : 5) }, // Long An - Tiền Giang - Cần Giờ
            "9":   { minCol: -7, maxCol: -2, getReg: () => 5 }, // Đồng Tháp - Vĩnh Long - Bến Tre
            "10":  { minCol: -8, maxCol: -2, getReg: () => 5 }, // An Giang - Cần Thơ - Trà Vinh
            "11":  { minCol: -8, maxCol: -3, getReg: () => 5 }, // Kiên Giang - Hậu Giang - Sóc Trăng
            "12":  { minCol: -8, maxCol: -4, getReg: () => 5 }, // Bạc Liêu - Bán đảo Cà Mau
            "13":  { minCol: -8, maxCol: -5, getReg: () => 5 }, // Cà Mau
            "14":  { minCol: -7, maxCol: -5, getReg: () => 5 }  // Đất Mũi Cà Mau
        };
        return table[String(r)] || { minCol: -2, maxCol: 1, getReg: () => 2 };
    }

    buildBoard(monumentAssignments) {
        while (this.boardGroup.children.length > 0) {
            this.boardGroup.remove(this.boardGroup.children[0]);
        }
        this.hexTiles = [];
        this.hexMap.clear();
        this.pickableMeshes = [];
        this.animatedLandProps = [];
        this.fairSpawnAnchors = [];
        this.activeNPCTile = null;

        // 5 Balanced Starting Anchorages along the S-Shaped Sea Lane
        const spawnAnchorKeys = new Set([
            "-10,6", // Anchor 1 (Vịnh Bắc Bộ)
            "-5,3",  // Anchor 2 (Bắc Trung Bộ)
            "0,7",   // Anchor 3 (Duyên hải Miền Trung – Tây Nguyên)
            "6,5",   // Anchor 4 (Đông Nam Bộ)
            "11,2"   // Anchor 5 (Đồng bằng Sông Cửu Long)
        ]);

        // Special POIs placed in the Coastal & Sea Waters along the 29-row S-Curve
        // Plus 10 Offshore Resource Nodes ("Tăng thêm các ô khai thác tài nguyên ngoài biển xa đất liền")
        const specialPlacements = {
            // 1. TRUNG DU & MIỀN NÚI BẮC BỘ (Region 0)
            "-14,3":  { terrain: "coast", monumentId: "mon_sapa", regionId: 0, navigable: true },
            "-13,4":  { terrain: "coast", resourceType: "iron", regionId: 0, navigable: true },
            "-13,8":  { terrain: "sea", resourceType: "iron", regionId: 0, navigable: true, isOffshore: true },
            "-12,4":  { terrain: "coast", isPort: true, portName: "Thương Cảng Cái Lân (Quảng Ninh)", regionId: 0, navigable: true },
            "-12,6":  { terrain: "sea", resourceType: "wood", regionId: 0, navigable: true },
            "-11,3":  { terrain: "island", monumentId: "mon_halong", regionId: 0, navigable: true },
            "-11,5":  { terrain: "reef", isReef: true, regionId: 0, navigable: true },
            "-11,9":  { terrain: "sea", resourceType: "food", regionId: 0, navigable: true, isOffshore: true },

            // 2. ĐỒNG BẰNG SÔNG HỒNG (Region 1)
            "-10,3":  { terrain: "coast", isPort: true, portName: "Thương Cảng Hải Phòng", regionId: 1, navigable: true },
            "-10,5":  { terrain: "sea", resourceType: "food", regionId: 1, navigable: true },
            "-9,2":   { terrain: "coast", monumentId: "mon_vanmieu", regionId: 1, navigable: true },
            "-9,4":   { terrain: "reef", isReef: true, regionId: 1, navigable: true },
            "-9,8":   { terrain: "sea", resourceType: "wood", regionId: 1, navigable: true, isOffshore: true },
            "-8,1":   { terrain: "coast", resourceType: "food", regionId: 1, navigable: true },
            "-8,6":   { terrain: "sea", resourceType: "iron", regionId: 1, navigable: true, isOffshore: true },

            // 3. BẮC TRUNG BỘ & DUYÊN HẢI MIỀN TRUNG (Region 2)
            "-7,0":   { terrain: "coast", resourceType: "wood", regionId: 2, navigable: true },
            "-6,-1":  { terrain: "coast", resourceType: "iron", regionId: 2, navigable: true },
            "-6,2":   { terrain: "reef", isReef: true, regionId: 2, navigable: true },
            "-6,7":   { terrain: "sea", resourceType: "food", regionId: 2, navigable: true, isOffshore: true },
            "-4,0":   { terrain: "coast", monumentId: "mon_phongnha", regionId: 2, navigable: true },
            "-4,5":   { terrain: "sea", resourceType: "iron", regionId: 2, navigable: true, isOffshore: true },
            "-3,1":   { terrain: "coast", monumentId: "mon_hue", regionId: 2, navigable: true },
            "-3,3":   { terrain: "reef", isReef: true, regionId: 2, navigable: true },
            "-2,3":   { terrain: "coast", isPort: true, portName: "Thương Cảng Tiên Sa (Đà Nẵng)", regionId: 2, navigable: true },
            "-2,8":   { terrain: "archipelago", archipelagoName: "QUẦN ĐẢO HOÀNG SA", archipelagoSub: "TP. Đà Nẵng • Chủ Quyền Việt Nam", regionId: 2, navigable: false },
            "-1,3":   { terrain: "coast", monumentId: "mon_myson", regionId: 2, navigable: true },
            "0,4":    { terrain: "coast", resourceType: "food", regionId: 2, navigable: true },
            "0,5":    { terrain: "reef", isReef: true, regionId: 2, navigable: true },

            // 4. TÂY NGUYÊN & LIÊN KẾT NAM TRUNG BỘ (Region 3)
            "1,5":    { terrain: "coast", isPort: true, portName: "Thương Cảng Liên Vùng Tây Nguyên – Quy Nhơn", regionId: 3, navigable: true },
            "1,9":    { terrain: "sea", resourceType: "wood", regionId: 3, navigable: true, isOffshore: true },
            "2,5":    { terrain: "coast", resourceType: "wood", regionId: 3, navigable: true },
            "2,7":    { terrain: "reef", isReef: true, regionId: 3, navigable: true },
            "3,4":    { terrain: "coast", monumentId: "mon_taynguyen", regionId: 3, navigable: true },
            "3,8":    { terrain: "sea", resourceType: "iron", regionId: 3, navigable: true, isOffshore: true },
            "4,3":    { terrain: "coast", resourceType: "iron", regionId: 3, navigable: true },
            "4,5":    { terrain: "sea", resourceType: "food", regionId: 3, navigable: true },

            // 5. ĐÔNG NAM BỘ (Region 4)
            "5,2":    { terrain: "coast", resourceType: "wood", regionId: 4, navigable: true },
            "5,4":    { terrain: "reef", isReef: true, regionId: 4, navigable: true },
            "6,1":    { terrain: "coast", isPort: true, portName: "Thương Cảng Quốc Tế Cái Mép – Sài Gòn", regionId: 4, navigable: true },
            "6,8":    { terrain: "sea", resourceType: "iron", regionId: 4, navigable: true, isOffshore: true },
            "7,1":    { terrain: "coast", monumentId: "mon_bennharong", regionId: 4, navigable: true },
            "7,3":    { terrain: "sea", resourceType: "iron", regionId: 4, navigable: true },
            "8,1":    { terrain: "reef", isReef: true, regionId: 4, navigable: true },
            "8,7":    { terrain: "archipelago", archipelagoName: "QUẦN ĐẢO TRƯỜNG SA", archipelagoSub: "Tỉnh Khánh Hòa • Chủ Quyền Việt Nam", regionId: 4, navigable: false },

            // 6. ĐỒNG BẰNG SÔNG CỬU LONG (Region 5)
            "9,-1":   { terrain: "coast", resourceType: "food", regionId: 5, navigable: true },
            "9,2":    { terrain: "reef", isReef: true, regionId: 5, navigable: true },
            "10,-1":  { terrain: "coast", monumentId: "mon_cairang", regionId: 5, navigable: true },
            "10,5":   { terrain: "sea", resourceType: "food", regionId: 5, navigable: true, isOffshore: true },
            "11,-2":  { terrain: "coast", isPort: true, portName: "Thương Cảng Cần Thơ – Cửu Long", regionId: 5, navigable: true },
            "12,-3":  { terrain: "coast", resourceType: "wood", regionId: 5, navigable: true },
            "12,0":   { terrain: "reef", isReef: true, regionId: 5, navigable: true },
            "13,-4":  { terrain: "coast", resourceType: "food", regionId: 5, navigable: true }
        };

        const layoutSpec = [];
        for (let r = -14; r <= 14; r++) {
            const rowSpec = this.getVietnamLandRowSpec(r);
            const qCenterOffset = -Math.floor(r / 2);

            const minSeaCol = rowSpec.minCol - 1;
            const maxSeaCol = 9;

            for (let col = minSeaCol; col <= maxSeaCol; col++) {
                const q = qCenterOffset + col;
                const key = `${r},${col}`;
                const custom = specialPlacements[key];
                const isSpawnAnchor = spawnAnchorKeys.has(key);
                const regId = custom && custom.regionId !== undefined
                    ? custom.regionId
                    : rowSpec.getReg(col);

                if (isSpawnAnchor) {
                    this.fairSpawnAnchors.push({ q, r, col, regionId: regId });
                }

                // A. MAINLAND VIETNAM HEXES (Decorative Diorama Only — Non-Navigable)
                if (col >= rowSpec.minCol && col <= rowSpec.maxCol) {
                    let mainTerrain = "delta_land";
                    if (regId === 0) mainTerrain = "mountain";
                    else if (regId === 1) mainTerrain = "delta_land";
                    else if (regId === 2) mainTerrain = (col === rowSpec.minCol && r <= -3) ? "mountain" : "coast_land";
                    else if (regId === 3) mainTerrain = "highland";
                    else if (regId === 4) mainTerrain = "southeast_land";
                    else mainTerrain = "delta_land";

                    layoutSpec.push({
                        q,
                        r,
                        col,
                        maxLandCol: rowSpec.maxCol,
                        regionId: regId,
                        terrain: mainTerrain,
                        navigable: false
                    });
                }
                // B. SPECIAL COASTAL / ISLAND / REEF / PORT / MONUMENT / ARCHIPELAGO HEXES
                else if (custom) {
                    layoutSpec.push({
                        q,
                        r,
                        col,
                        maxLandCol: rowSpec.maxCol,
                        regionId: regId,
                        terrain: custom.terrain,
                        navigable: custom.navigable !== false,
                        isReef: !!custom.isReef || custom.terrain === "reef",
                        isOffshore: !!custom.isOffshore,
                        monumentId: custom.monumentId || null,
                        isPort: !!custom.isPort,
                        portName: custom.portName || null,
                        resourceType: custom.resourceType || null,
                        archipelagoName: custom.archipelagoName || null,
                        archipelagoSub: custom.archipelagoSub || null,
                        isSpawnRim: isSpawnAnchor
                    });
                }
                // C. NAVIGABLE SEA & COASTAL WATER HEXES
                else {
                    const isCoastalWater = (col === rowSpec.maxCol + 1 || col === rowSpec.minCol - 1);
                    layoutSpec.push({
                        q,
                        r,
                        col,
                        maxLandCol: rowSpec.maxCol,
                        regionId: regId,
                        terrain: isCoastalWater ? "coast" : "sea",
                        navigable: true,
                        isSpawnRim: isSpawnAnchor
                    });
                }
            }
        }

        layoutSpec.forEach((spec, idx) => {
            const tile = this.createHexTile(spec, idx, monumentAssignments);
            this.hexTiles.push(tile);
            this.hexMap.set(`${spec.q},${spec.r}`, tile);
            this.boardGroup.add(tile.group);
        });

        this.buildRegionBanners();
        this.applyMinimalistMode();
    }

    buildRegionBanners() {
        const regionBanners = [
            { r: -13, col: -2, line1: "1. TRUNG DU &", line2: "MIỀN NÚI BẮC BỘ", color: "#2d7a36" },
            { r: -10, col: -2, line1: "2. ĐỒNG BẰNG", line2: "SÔNG HỒNG", color: "#f5b81c" },
            { r: -5,  col: -3, line1: "3. DUYÊN HẢI", line2: "MIỀN TRUNG", color: "#5a7f91" },
            { r: 2,   col: 1,  line1: "4. TÂY NGUYÊN", line2: "ĐẠI NGÀN BAZAN", color: "#994920" },
            { r: 6,   col: -2, line1: "5. ĐÔNG NAM BỘ", line2: "ĐẦU TÀU KINH TẾ", color: "#8a2430" },
            { r: 11,  col: -6, line1: "6. ĐỒNG BẰNG", line2: "SÔNG CỬU LONG", color: "#659b38" }
        ];
        regionBanners.forEach(rb => {
            const q = -Math.floor(rb.r / 2) + rb.col;
            const { x, z } = this.axialToWorld(q, rb.r);
            const sprite = ProceduralModels.createRegionBannerSprite(rb.line1, rb.line2, rb.color, 2.75, 0.68);
            sprite.position.set(x, 2.45, z);
            this.boardGroup.add(sprite);
        });

        const compass = ProceduralModels.createTabletopCompassAndTitlePlaque();
        this.boardGroup.add(compass);
    }

    createHexTile(spec, index, monumentAssignments) {
        const region = window.GAME_DATA.regions[spec.regionId];
        const { x, z } = this.axialToWorld(spec.q, spec.r);
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Deterministic micro-elevation variation for natural organic relief
        const tileSeed = Math.abs((spec.q * 49297) ^ (spec.r * 9301));
        const jitter = ProceduralModels.seededRandom(tileSeed);

        let height = 0.22;
        let topColor = new THREE.Color(region.color);
        let capColor = topColor.clone();

        if (spec.terrain === "sea") {
            height = 0.14;
            const seaDist = Math.max(1, (spec.col || 0) - (spec.maxLandCol !== undefined ? spec.maxLandCol : 0));
            if (spec.isSpawnRim) {
                topColor = new THREE.Color(0x0284c7);
            } else if (seaDist <= 2) {
                topColor = new THREE.Color(0x0369a1);
            } else if (seaDist <= 4) {
                topColor = new THREE.Color(0x075985);
            } else {
                topColor = new THREE.Color(0x0c4a6e);
            }
        } else if (spec.terrain === "coast") {
            height = 0.19;
            topColor = new THREE.Color(0x0ea5e9).lerp(new THREE.Color(region.color), 0.22);
        } else if (spec.terrain === "river_channel") {
            height = 0.18;
            topColor = new THREE.Color(0x06b6d4);
        } else if (spec.terrain === "reef") {
            height = 0.21;
            topColor = new THREE.Color(0x1e293b);
        } else if (spec.terrain === "archipelago") {
            height = 0.36;
            topColor = new THREE.Color(0x0d9488);
        } else if (spec.terrain === "mountain") {
            height = 0.62 + jitter * 0.22;
            topColor.offsetHSL(0, (jitter - 0.5) * 0.06, (jitter - 0.5) * 0.05);
            capColor = topColor.clone().offsetHSL(0, 0.05, 0.06);
        } else if (spec.terrain === "highland") {
            height = 0.52 + jitter * 0.16;
            topColor.offsetHSL(0, (jitter - 0.5) * 0.05, (jitter - 0.5) * 0.04);
            capColor = topColor.clone().offsetHSL(0, 0.04, 0.05);
        } else if (spec.terrain === "southeast_land") {
            height = 0.42 + jitter * 0.10;
            capColor = topColor.clone().offsetHSL(0, 0.03, 0.05);
        } else if (spec.terrain === "coast_land") {
            height = 0.38 + jitter * 0.09;
            capColor = topColor.clone().offsetHSL(0, 0.04, 0.06);
        } else if (spec.terrain === "delta_land") {
            height = 0.34 + jitter * 0.07;
            capColor = topColor.clone().offsetHSL(0, 0.04, 0.05);
        } else if (spec.terrain === "island") {
            height = 0.32;
            capColor = topColor.clone().offsetHSL(0, 0.04, 0.05);
        } else {
            height = 0.26;
        }

        const isWaterHex = (spec.terrain === "sea" || spec.terrain === "coast" || spec.terrain === "river_channel");
        const defaultBaseOpacity = spec.terrain === "sea" ? 0.50 : (isWaterHex ? 0.70 : 1.0);

        // Stratified Layer 1: Golden Sandy Beach / Coastal Shelf Skirt for Mainland & Islands
        if (!isWaterHex && spec.terrain !== "reef") {
            const sandGeo = new THREE.CylinderGeometry(this.hexRadius * 1.01, this.hexRadius * 1.05, 0.15, 6);
            const sandMat = new THREE.MeshStandardMaterial({
                color: 0xfde68a,
                roughness: 0.85,
                metalness: 0.05
            });
            const sandSkirt = new THREE.Mesh(sandGeo, sandMat);
            sandSkirt.position.y = -0.02;
            sandSkirt.receiveShadow = true;
            group.add(sandSkirt);
        }

        // Stratified Layer 2: Main Hex Column
        const hexGeo = new THREE.CylinderGeometry(this.hexRadius * 0.96, this.hexRadius * 1.0, height, 6);
        const hexMat = new THREE.MeshStandardMaterial({
            color: topColor,
            roughness: isWaterHex ? 0.22 : 0.56,
            metalness: isWaterHex ? 0.32 : 0.10,
            transparent: true,
            opacity: defaultBaseOpacity
        });

        const baseMesh = new THREE.Mesh(hexGeo, hexMat);
        baseMesh.position.y = height / 2 - 0.1;
        baseMesh.receiveShadow = true;
        baseMesh.castShadow = !isWaterHex;
        group.add(baseMesh);
        this.pickableMeshes.push(baseMesh);

        // Stratified Layer 3: Beveled Top Plateau Cap for Mainland Hexes
        if (!spec.navigable && spec.terrain !== "archipelago") {
            const capGeo = new THREE.CylinderGeometry(this.hexRadius * 0.84, this.hexRadius * 0.94, 0.09, 6);
            const capMat = new THREE.MeshStandardMaterial({
                color: capColor,
                roughness: 0.52,
                metalness: 0.08
            });
            const capMesh = new THREE.Mesh(capGeo, capMat);
            capMesh.position.y = height - 0.06;
            capMesh.receiveShadow = true;
            capMesh.castShadow = true;
            group.add(capMesh);
        }

        const defaultRimOpacity = isWaterHex ? 0.06 : 0.42;
        const rimGeo = new THREE.RingGeometry(this.hexRadius * 0.88, this.hexRadius * 0.96, 6);
        rimGeo.rotateX(-Math.PI / 2);
        rimGeo.rotateZ(Math.PI / 6);
        const rimColor = spec.terrain === "reef"
            ? new THREE.Color(0xef4444)
            : new THREE.Color(region.color);
        const rimMat = new THREE.MeshBasicMaterial({
            color: rimColor,
            transparent: true,
            opacity: defaultRimOpacity,
            side: THREE.DoubleSide
        });
        const rimMesh = new THREE.Mesh(rimGeo, rimMat);
        rimMesh.position.y = height - 0.085;
        group.add(rimMesh);

        const hlGeo = new THREE.RingGeometry(this.hexRadius * 0.82, this.hexRadius * 0.98, 6);
        hlGeo.rotateX(-Math.PI / 2);
        hlGeo.rotateZ(Math.PI / 6);
        const hlMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide
        });
        const highlightRing = new THREE.Mesh(hlGeo, hlMat);
        highlightRing.position.y = height - 0.05;
        group.add(highlightRing);

        const surfaceY = height - 0.1;

        let reefPropGroup = null;
        if (spec.terrain === "reef" || spec.isReef) {
            reefPropGroup = new THREE.Group();
            reefPropGroup.position.y = surfaceY;
            const reefMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.82, metalness: 0.18 });
            const tipMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0x9f1239, emissiveIntensity: 0.35, roughness: 0.5 });
            [[-0.55, -0.35, 0.56], [-0.22, -0.58, 0.44], [-0.66, 0.05, 0.38], [0.05, -0.55, 0.40]].forEach(([rx, rz, h]) => {
                const spire = new THREE.Mesh(new THREE.ConeGeometry(0.24, h, 5), reefMat);
                spire.position.set(rx, h / 2, rz);
                spire.castShadow = true;
                reefPropGroup.add(spire);

                const coral = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), tipMat);
                coral.position.set(rx, h * 0.85, rz);
                reefPropGroup.add(coral);
            });
            const warnRingGeo = new THREE.RingGeometry(0.55, 0.82, 18);
            warnRingGeo.rotateX(-Math.PI / 2);
            const warnRing = new THREE.Mesh(
                warnRingGeo,
                new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.50, side: THREE.DoubleSide })
            );
            warnRing.position.set(-0.35, 0.03, -0.35);
            reefPropGroup.add(warnRing);
            group.add(reefPropGroup);
        } else if (!spec.navigable) {
            if (spec.terrain === "archipelago" && spec.archipelagoName) {
                const archModel = ProceduralModels.createSovereigntyArchipelago(
                    spec.archipelagoName,
                    spec.archipelagoSub || "Chủ Quyền Biển Đảo Việt Nam"
                );
                archModel.position.y = surfaceY;
                group.add(archModel);
            } else {
                const landDiorama = ProceduralModels.createLandHexDiorama(spec, surfaceY + 0.04, this.animatedLandProps);
                group.add(landDiorama);
            }
        } else if (spec.isSpawnRim) {
            const buoy = ProceduralModels.createStartingAnchorBuoy();
            buoy.position.y = surfaceY;
            group.add(buoy);
        }

        const tileObj = {
            index,
            q: spec.q,
            r: spec.r,
            x,
            z,
            height,
            defaultBaseOpacity,
            defaultRimOpacity,
            regionId: spec.regionId,
            region,
            terrain: spec.terrain,
            navigable: spec.navigable !== false,
            isReef: !!spec.isReef || spec.terrain === "reef",
            isOffshore: !!spec.isOffshore,
            isSpawnRim: !!spec.isSpawnRim,
            isPort: !!spec.isPort,
            portName: spec.portName || null,
            resourceType: spec.resourceType || null,
            resourceCooldown: 0,
            stormRestricted: false,
            stormRestrictGroup: null,
            monumentId: spec.monumentId || null,
            monumentTier: spec.monumentId ? (monumentAssignments[spec.monumentId] || 1) : null,
            monumentLocked: false,
            monumentGlowGroup: null,
            hasNPC: false,
            group,
            baseMesh,
            rimMesh,
            highlightRing,
            propModel: reefPropGroup,
            propMeshes: [],
            labelSprite: null
        };

        baseMesh.userData = { tile: tileObj };
        rimMesh.userData = { tile: tileObj };
        highlightRing.userData = { tile: tileObj };

        if (spec.monumentId) {
            const monData = window.GAME_DATA.monuments.find(m => m.id === spec.monumentId);
            const tier = tileObj.monumentTier;
            const monModel = ProceduralModels.createMonumentModel(monData.modelType, tier);
            monModel.position.y = surfaceY;
            group.add(monModel);
            tileObj.propModel = monModel;

            // Radiant Monument Sky Beacon + Double Magic Halo Rings + 3 Orbiting Crystals
            const tierHexColors = { 1: 0x10b981, 2: 0xf59e0b, 3: 0xef4444 };
            const glowHex = tierHexColors[tier] || 0xfbbf24;
            const glowGroup = new THREE.Group();
            glowGroup.position.y = surfaceY;

            // 1. Vertical Sky Beacon Pillar
            const beaconGeo = new THREE.CylinderGeometry(0.18, 0.72, 6.2, 16, 1, true);
            const beaconMat = new THREE.MeshBasicMaterial({
                color: glowHex,
                transparent: true,
                opacity: 0.24,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
            beaconMesh.position.y = 3.1;
            glowGroup.add(beaconMesh);

            // 2. Pulsing Outer Hex Halo Ring
            const outerHaloGeo = new THREE.RingGeometry(this.hexRadius * 0.80, this.hexRadius * 1.02, 6);
            outerHaloGeo.rotateX(-Math.PI / 2);
            outerHaloGeo.rotateZ(Math.PI / 6);
            const outerHalo = new THREE.Mesh(
                outerHaloGeo,
                new THREE.MeshBasicMaterial({ color: glowHex, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
            );
            outerHalo.position.y = 0.04;
            glowGroup.add(outerHalo);

            // 3. Inner Golden Magic Ring
            const innerHaloGeo = new THREE.RingGeometry(0.95, 1.25, 24);
            innerHaloGeo.rotateX(-Math.PI / 2);
            const innerHalo = new THREE.Mesh(
                innerHaloGeo,
                new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
            );
            innerHalo.position.set(-0.42, 0.06, -0.38);
            glowGroup.add(innerHalo);

            // 4. Orbiting Floating Star Crystals
            const orbitGroup = new THREE.Group();
            orbitGroup.position.set(-0.42, 1.35, -0.38);
            for (let c = 0; c < 3; c++) {
                const ang = (c / 3) * Math.PI * 2;
                const crys = new THREE.Mesh(
                    new THREE.OctahedronGeometry(0.14, 0),
                    new THREE.MeshBasicMaterial({ color: 0xfef08a })
                );
                crys.position.set(Math.cos(ang) * 0.95, 0, Math.sin(ang) * 0.95);
                orbitGroup.add(crys);
            }
            glowGroup.add(orbitGroup);

            glowGroup.userData = { beaconMesh, outerHalo, innerHalo, orbitGroup, baseColor: glowHex };
            group.add(glowGroup);
            tileObj.monumentGlowGroup = glowGroup;

            const tierShortLabel = {
                1: "★ Cấp 1 (Dễ)",
                2: "★★ Cấp 2 (Vừa)",
                3: "★★★ Cấp 3 (Khó)"
            };
            const tierColors = { 1: "#10b981", 2: "#f59e0b", 3: "#ef4444" };
            const sprite = ProceduralModels.createLabelCanvas(
                `🏛️ ${monData.name}`,
                tierShortLabel[tier],
                "rgba(4, 15, 30, 0.92)",
                tierColors[tier],
                2.55,
                0.60
            );
            sprite.position.set(-0.42, surfaceY + 2.55, -0.38);
            group.add(sprite);
            tileObj.labelSprite = sprite;

        } else if (spec.isPort) {
            const portModel = ProceduralModels.createTradePortModel(region.color);
            portModel.position.y = surfaceY;
            group.add(portModel);
            tileObj.propModel = portModel;

            const sprite = ProceduralModels.createLabelCanvas(
                `⚓ ${spec.portName}`,
                `${region.specialty.icon} ${region.specialty.shortName}`,
                "rgba(10, 32, 56, 0.92)",
                "#38bdf8",
                2.45,
                0.56
            );
            sprite.position.set(-0.42, surfaceY + 2.08, -0.38);
            group.add(sprite);
            tileObj.labelSprite = sprite;

        } else if (spec.resourceType) {
            const resModel = ProceduralModels.createResourceNodeModel(spec.resourceType);
            resModel.position.y = surfaceY;
            group.add(resModel);
            tileObj.propModel = resModel;
        }

        if (tileObj.propModel) {
            this.cacheTilePropMeshes(tileObj);
        }

        return tileObj;
    }

    cacheTilePropMeshes(tileObj) {
        tileObj.propMeshes = [];
        if (!tileObj.propModel) return;
        tileObj.propModel.traverse(child => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.userData = child.material.userData || {};
                if (child.material.userData.baseOpacity === undefined) {
                    child.material.userData.baseOpacity = child.material.opacity !== undefined ? child.material.opacity : 1.0;
                }
                child.userData = child.userData || {};
                child.userData.tile = tileObj;
                tileObj.propMeshes.push(child);
                if (tileObj.navigable) {
                    this.pickableMeshes.push(child);
                }
            }
        });
    }

    despawnRareNPC() {
        if (!this.activeNPCTile) return;
        const t = this.activeNPCTile;
        t.hasNPC = false;
        if (t.propModel) {
            t.group.remove(t.propModel);
            t.propModel = null;
            t.propMeshes = [];
        }
        if (t.labelSprite) {
            t.group.remove(t.labelSprite);
            t.labelSprite = null;
        }
        this.activeNPCTile = null;
    }

    spawnRareNPCOnRandomSeaHex() {
        this.despawnRareNPC();
        const seaCandidates = this.hexTiles.filter(t =>
            t.terrain === "sea" &&
            t.navigable &&
            !t.monumentId &&
            !t.isPort &&
            !t.resourceType &&
            !t.isReef &&
            !t.isSpawnRim
        );
        if (seaCandidates.length === 0) return null;

        const chosen = seaCandidates[Math.floor(Math.random() * seaCandidates.length)];
        chosen.hasNPC = true;
        const surfaceY = chosen.height - 0.1;

        const npcModel = ProceduralModels.createNPCharacterModel("#38bdf8", false);
        npcModel.position.set(-0.42, surfaceY, -0.38);
        chosen.group.add(npcModel);
        chosen.propModel = npcModel;
        this.cacheTilePropMeshes(chosen);

        const sprite = ProceduralModels.createLabelCanvas(
            "🧙‍♂️ Tiên Ông Rìu Vàng",
            "Giải đố +2~3 Xu",
            "rgba(15, 23, 42, 0.92)",
            "#fbbf24",
            2.35,
            0.55
        );
        sprite.position.set(-0.42, surfaceY + 2.1, -0.38);
        chosen.group.add(sprite);
        chosen.labelSprite = sprite;

        this.activeNPCTile = chosen;
        this.triggerBurstAnimation(chosen.q, chosen.r, 0xfbbf24, 24);
        return chosen;
    }

    // ------------------------------------------------------------------------
    // PLAYER SHIPS — CLEAR HARBOR BERTH & OCCUPIED-TILE FADE / SHIP SPOTLIGHT
    // ------------------------------------------------------------------------
    getShipDockPositionOnTile(tile, player, playerIdx = 0, totalPlayers = 1) {
        const hasLandmark = Boolean(tile.monumentId || tile.isPort || tile.resourceType || tile.isReef || tile.hasNPC);
        const berthOffsetX = hasLandmark ? 0.56 : 0;
        const berthOffsetZ = hasLandmark ? 0.52 : 0;
        const seatOrIdx = (player && player.seatIndex !== undefined) ? player.seatIndex : playerIdx;
        const angle = (seatOrIdx / Math.max(1, totalPlayers)) * Math.PI * 2;
        const multiRadius = totalPlayers > 1 ? 0.36 : 0;
        return new THREE.Vector3(
            tile.x + berthOffsetX + Math.cos(angle) * multiRadius,
            tile.height + 0.14,
            tile.z + berthOffsetZ + Math.sin(angle) * multiRadius
        );
    }

    spawnShips(players, localPlayer = null) {
        this.shipMeshes.forEach(mesh => this.scene.remove(mesh));
        this.shipMeshes.clear();

        const localKey = localPlayer ? World3D.getPlayerShipKey(localPlayer) : null;
        if (localKey) {
            this.cameraLockShipKey = localKey;
        }

        players.forEach((p, idx) => {
            const shipKey = World3D.getPlayerShipKey(p, idx);
            const isLocal = Boolean(localKey && shipKey === localKey);
            const shipMesh = ProceduralModels.createPlayerShip(p.archetypeId, p.name, isLocal);
            shipMesh.userData.shipKey = shipKey;
            shipMesh.userData.playerName = p.name;
            shipMesh.userData.archetypeId = p.archetypeId % 5;
            shipMesh.userData.isLocalPlayer = isLocal;
            shipMesh.userData.lastQ = p.q;
            shipMesh.userData.lastR = p.r;
            shipMesh.visible = !p.eliminated;
            this.scene.add(shipMesh);
            this.shipMeshes.set(shipKey, shipMesh);
            this.placeShipOnHexImmediate(p, p.q, p.r, idx, players.length);
        });
        this.applyMinimalistMode();
    }

    syncShipsSmoothly(players, localPlayer = null) {
        if (this.shipMeshes.size !== players.length) {
            this.spawnShips(players, localPlayer);
            return;
        }

        const localKey = localPlayer ? World3D.getPlayerShipKey(localPlayer) : null;

        const needsRebuild = players.some((p, idx) => {
            const shipKey = World3D.getPlayerShipKey(p, idx);
            const mesh = this.shipMeshes.get(shipKey);
            if (!mesh) return true;
            const isLocal = Boolean(localKey && shipKey === localKey);
            return (
                mesh.userData.playerName !== p.name ||
                mesh.userData.archetypeId !== (p.archetypeId % 5) ||
                mesh.userData.isLocalPlayer !== isLocal
            );
        });

        if (needsRebuild) {
            this.spawnShips(players, localPlayer);
            return;
        }

        players.forEach((p, idx) => {
            const shipKey = World3D.getPlayerShipKey(p, idx);
            const shipMesh = this.shipMeshes.get(shipKey);
            if (!shipMesh) return;
            shipMesh.visible = !p.eliminated;
            if (shipMesh.userData.lastQ !== p.q || shipMesh.userData.lastR !== p.r) {
                shipMesh.userData.lastQ = p.q;
                shipMesh.userData.lastR = p.r;
                const destTile = this.hexMap.get(`${p.q},${p.r}`);
                if (destTile) {
                    this.animateShipAlongPath(p, [destTile], idx, players.length);
                }
            }
        });
    }

    placeShipOnHexImmediate(player, q, r, playerIdx = 0, totalPlayers = 1) {
        const shipKey = World3D.getPlayerShipKey(player, playerIdx);
        const shipMesh = this.shipMeshes.get(shipKey);
        const tile = this.hexMap.get(`${q},${r}`);
        if (!shipMesh || !tile) return;

        shipMesh.userData.lastQ = q;
        shipMesh.userData.lastR = r;
        const dockPos = this.getShipDockPositionOnTile(tile, player, playerIdx, totalPlayers);
        shipMesh.position.copy(dockPos);
    }

    animateShipAlongPath(player, pathTiles, playerIdx = 0, totalPlayers = 1, onComplete = null) {
        const shipKey = World3D.getPlayerShipKey(player, playerIdx);
        const shipMesh = this.shipMeshes.get(shipKey);
        if (!shipMesh || !pathTiles || pathTiles.length === 0) {
            if (onComplete) onComplete();
            return;
        }
        shipMesh.userData.lastQ = player.q;
        shipMesh.userData.lastR = player.r;

        this.clearPathPreview();

        const waypoints = [shipMesh.position.clone()];
        pathTiles.forEach((t, idx) => {
            const isLast = (idx === pathTiles.length - 1);
            if (isLast) {
                waypoints.push(this.getShipDockPositionOnTile(t, player, playerIdx, totalPlayers));
            } else {
                const hasLandmark = Boolean(t.monumentId || t.isPort || t.resourceType || t.isReef || t.hasNPC);
                waypoints.push(new THREE.Vector3(
                    t.x + (hasLandmark ? 0.42 : 0),
                    t.height + 0.14,
                    t.z + (hasLandmark ? 0.38 : 0)
                ));
            }
        });

        let segIndex = 0;
        const segDuration = 290;

        const runNextSegment = () => {
            if (segIndex >= waypoints.length - 1) {
                if (onComplete) onComplete();
                return;
            }

            const startPos = waypoints[segIndex];
            const endPos = waypoints[segIndex + 1];
            const startRotY = shipMesh.rotation.y;
            const dx = endPos.x - startPos.x;
            const dz = endPos.z - startPos.z;
            let targetRotY = startRotY;
            if (Math.hypot(dx, dz) > 0.02) {
                targetRotY = -Math.atan2(dz, dx);
            }

            let deltaAngle = targetRotY - startRotY;
            while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
            while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

            window.SFX.playSail();
            const segStart = performance.now();
            let lastWakeTime = segStart;

            const step = (now) => {
                const t = Math.min(1, (now - segStart) / segDuration);
                const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

                shipMesh.position.lerpVectors(startPos, endPos, ease);
                shipMesh.rotation.y = startRotY + deltaAngle * Math.min(1, t * 1.65);

                if (shipMesh.userData.mainSail) {
                    const swell = 1.0 + Math.sin(t * Math.PI) * 0.22;
                    shipMesh.userData.mainSail.scale.set(swell, 1.0, swell);
                }

                if (now - lastWakeTime > 48) {
                    lastWakeTime = now;
                    this.spawnWakeParticle(shipMesh.position.x, shipMesh.position.y, shipMesh.position.z);
                }

                if (t < 1) {
                    requestAnimationFrame(step);
                } else {
                    if (shipMesh.userData.mainSail) {
                        shipMesh.userData.mainSail.scale.set(1, 1, 1);
                    }
                    segIndex++;
                    runNextSegment();
                }
            };
            requestAnimationFrame(step);
        };

        runNextSegment();
    }

    showPathPreview(pathTiles, isCustomDrawn = false) {
        this.clearPathPreview();
        if (!pathTiles || pathTiles.length === 0) return;

        const accentColor = isCustomDrawn ? 0x10b981 : 0xfbbf24;
        const points = [];
        pathTiles.forEach((t, idx) => {
            const py = t.height + 0.30;
            points.push(new THREE.Vector3(t.x, py, t.z));
            const dot = new THREE.Mesh(
                new THREE.SphereGeometry(isCustomDrawn ? 0.24 : 0.18, 12, 12),
                new THREE.MeshBasicMaterial({ color: accentColor })
            );
            dot.position.set(t.x, py, t.z);
            this.pathPreviewGroup.add(dot);

            if (idx > 0 || isCustomDrawn) {
                const ringGeo = new THREE.RingGeometry(0.45, 0.72, 6);
                ringGeo.rotateX(-Math.PI / 2);
                ringGeo.rotateY(Math.PI / 6);
                const ringMat = new THREE.MeshBasicMaterial({
                    color: accentColor,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: isCustomDrawn ? 0.90 : 0.65
                });
                const ringMesh = new THREE.Mesh(ringGeo, ringMat);
                ringMesh.position.set(t.x, t.height + 0.12, t.z);
                this.pathPreviewGroup.add(ringMesh);
            }
        });

        if (points.length >= 2) {
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({ color: accentColor, linewidth: 3 });
            const line = new THREE.Line(lineGeo, lineMat);
            this.pathPreviewGroup.add(line);
        }
    }

    clearPathPreview() {
        while (this.pathPreviewGroup.children.length > 0) {
            this.pathPreviewGroup.remove(this.pathPreviewGroup.children[0]);
        }
    }

    spawnWakeParticle(x, y, z) {
        const geo = new THREE.RingGeometry(0.14, 0.36, 14);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + 0.02, z);
        this.effectsGroup.add(mesh);

        this.floatingEffects.push({
            mesh,
            type: "wake",
            birth: performance.now(),
            life: 620
        });
    }

    triggerBurstAnimation(q, r, colorHex = 0xfbbf24, count = 20) {
        const tile = this.hexMap.get(`${q},${r}`);
        if (!tile) return;

        for (let i = 0; i < count; i++) {
            const geo = new THREE.OctahedronGeometry(0.16, 0);
            const mat = new THREE.MeshBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 1
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(tile.x, tile.height + 0.6, tile.z);
            this.effectsGroup.add(mesh);

            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
            const speed = 1.6 + Math.random() * 2.2;
            this.floatingEffects.push({
                mesh,
                type: "burst",
                vx: Math.cos(angle) * speed,
                vy: 2.5 + Math.random() * 2.2,
                vz: Math.sin(angle) * speed,
                birth: performance.now(),
                life: 920
            });
        }
    }

    focusCameraOnHex(q, r) {
        const tile = this.hexMap.get(`${q},${r}`);
        if (!tile) return;
        const startTarget = this.controls.target.clone();
        const endTarget = new THREE.Vector3(tile.x, 0, tile.z);
        const camOffset = this.camera.position.clone().sub(startTarget);
        const startTime = performance.now();
        const duration = 560;

        const animateCam = (now) => {
            const t = Math.min(1, (now - startTime) / duration);
            const ease = 1 - Math.pow(1 - t, 3);
            this.controls.target.lerpVectors(startTarget, endTarget, ease);
            this.camera.position.copy(this.controls.target).add(camOffset);
            if (t < 1) requestAnimationFrame(animateCam);
        };
        requestAnimationFrame(animateCam);
    }

    updateReachableHighlights(reachablePathsMap, activeHexKey) {
        this.reachablePaths = reachablePathsMap;
        this.activeHexKey = activeHexKey;
        this.hexTiles.forEach(tile => {
            if (this.hoveredHex === tile) {
                const key = `${tile.q},${tile.r}`;
                if (this.reachablePaths && this.reachablePaths.has(key)) {
                    tile.highlightRing.material.color.setHex(0x22c55e);
                    tile.highlightRing.material.opacity = 0.85;
                } else {
                    tile.highlightRing.material.opacity = 0.0;
                }
            } else {
                tile.highlightRing.material.opacity = 0.0;
            }
        });
    }

    updateResourceVisuals() {
        this.hexTiles.forEach(tile => {
            if (tile.resourceType && tile.propModel) {
                const depleted = tile.resourceCooldown > 0;
                tile.propModel.position.y = (tile.height - 0.1) - (depleted ? 0.12 : 0);

                // Thunderstorm restriction indicator ("Một số ô khai thác tài nguyên bị hạn chế không thể vào")
                if (tile.stormRestricted && !tile.stormRestrictGroup) {
                    const restrictGroup = new THREE.Group();
                    restrictGroup.position.y = tile.height - 0.06;
                    const barRingGeo = new THREE.RingGeometry(0.85, 1.35, 24);
                    barRingGeo.rotateX(-Math.PI / 2);
                    const barRing = new THREE.Mesh(
                        barRingGeo,
                        new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.82, side: THREE.DoubleSide })
                    );
                    restrictGroup.add(barRing);

                    const crossMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
                    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.22), crossMat);
                    bar1.position.y = 0.45;
                    bar1.rotation.y = Math.PI / 4;
                    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.22), crossMat);
                    bar2.position.y = 0.45;
                    bar2.rotation.y = -Math.PI / 4;
                    restrictGroup.add(bar1, bar2);

                    tile.group.add(restrictGroup);
                    tile.stormRestrictGroup = restrictGroup;
                } else if (!tile.stormRestricted && tile.stormRestrictGroup) {
                    tile.group.remove(tile.stormRestrictGroup);
                    tile.stormRestrictGroup = null;
                }
            }
        });
    }

    // ------------------------------------------------------------------------
    // 3D LIGHTNING STRIKE & MONUMENT TRAP EFFECTS (Arrows, Boulders, Lightning)
    // ------------------------------------------------------------------------
    triggerLightningStrikeEffect(q, r) {
        const tile = this.hexMap.get(`${q},${r}`);
        if (!tile) return;

        // 1. Jagged 3D Lightning Bolt from Sky to Tile
        const boltGroup = new THREE.Group();
        boltGroup.position.set(tile.x, tile.height, tile.z);
        const boltPts = [];
        const segs = 12;
        for (let i = 0; i <= segs; i++) {
            const y = (1 - i / segs) * 28;
            const jx = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 2.4;
            const jz = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 2.4;
            boltPts.push(new THREE.Vector3(jx, y, jz));
        }
        const boltGeo = new THREE.BufferGeometry().setFromPoints(boltPts);
        const boltMat = new THREE.LineBasicMaterial({ color: 0xe0f2fe, linewidth: 4, transparent: true, opacity: 1.0 });
        const boltLine = new THREE.Line(boltGeo, boltMat);
        boltGroup.add(boltLine);

        // Glowing Plasma Cylinder Core
        const beamGeo = new THREE.CylinderGeometry(0.18, 0.55, 28, 8);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.78 });
        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.y = 14;
        boltGroup.add(beamMesh);

        // Expanding Shockwave Ring
        const ringGeo = new THREE.RingGeometry(0.3, 0.9, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.y = 0.12;
        boltGroup.add(ringMesh);

        this.effectsGroup.add(boltGroup);
        this.floatingEffects.push({
            mesh: boltGroup,
            beamMat,
            ringMesh,
            ringMat,
            type: "lightning_bolt",
            birth: performance.now(),
            life: 850
        });

        this.triggerBurstAnimation(q, r, 0x38bdf8, 26);
    }

    triggerMonumentTrapEffect(q, r, tier = 1) {
        const tile = this.hexMap.get(`${q},${r}`);
        if (!tile) return;

        if (tier === 1) {
            // Tier 1 Trap: Volley of Poison / Fire Arrows Raining Down (-1 HP)
            for (let i = 0; i < 10; i++) {
                const arrowGroup = new THREE.Group();
                const shaft = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.035, 0.035, 1.35, 6),
                    new THREE.MeshBasicMaterial({ color: 0x78350f })
                );
                const tip = new THREE.Mesh(
                    new THREE.ConeGeometry(0.12, 0.34, 6),
                    new THREE.MeshBasicMaterial({ color: 0xef4444 })
                );
                tip.position.y = -0.75;
                tip.rotation.x = Math.PI;
                arrowGroup.add(shaft, tip);

                const ox = (Math.random() - 0.5) * 1.8;
                const oz = (Math.random() - 0.5) * 1.8;
                arrowGroup.position.set(tile.x + ox, tile.height + 7.5 + i * 0.45, tile.z + oz);
                this.effectsGroup.add(arrowGroup);

                this.floatingEffects.push({
                    mesh: arrowGroup,
                    type: "trap_arrow",
                    targetY: tile.height + 0.45,
                    vy: -15.5,
                    birth: performance.now(),
                    life: 1200
                });
            }
            this.triggerBurstAnimation(q, r, 0xef4444, 18);
        } else if (tier === 2) {
            // Tier 2 Trap: Rolling Giant Stone Boulders Crashing In (-2 HP)
            for (let i = 0; i < 5; i++) {
                const boulder = new THREE.Mesh(
                    new THREE.DodecahedronGeometry(0.48 + Math.random() * 0.16, 1),
                    new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.85 })
                );
                const angle = (i / 5) * Math.PI * 2;
                boulder.position.set(
                    tile.x + Math.cos(angle) * 1.6,
                    tile.height + 4.8 + i * 0.4,
                    tile.z + Math.sin(angle) * 1.6
                );
                this.effectsGroup.add(boulder);

                this.floatingEffects.push({
                    mesh: boulder,
                    type: "trap_boulder",
                    vx: -Math.cos(angle) * 1.6,
                    vy: -6.5,
                    vz: -Math.sin(angle) * 1.6,
                    floorY: tile.height + 0.45,
                    birth: performance.now(),
                    life: 1350
                });
            }
            this.triggerBurstAnimation(q, r, 0xf97316, 24);
        } else {
            // Tier 3 Trap: Ancient Curse Lightning + Falling Boulders (-3 HP)
            this.triggerLightningStrikeEffect(q, r);
            this.triggerMonumentTrapEffect(q, r, 2);
        }
    }

    initEvents() {
        window.addEventListener("resize", () => {
            const w = this.container.clientWidth || window.innerWidth;
            const h = this.container.clientHeight || window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });

        let pointerDownPos = { x: 0, y: 0 };
        let pointerDownTile = null;
        let isLeftPointerDown = false;
        let lastTapTime = 0;
        let lastHoverRaycastTime = 0;
        this.singleClickTimer = null;
        this.isDrawingCustomPath = false;
        this.isClickDrawMode = false;
        this.hasDraggedToOtherHex = false;

        // Prevent browser context menu on right-click so right-click smoothly rotates camera
        this.renderer.domElement.addEventListener("contextmenu", (e) => {
            e.preventDefault();
        });

        // W A S D (and Arrow keys) camera panning state
        this.keyState = { w: false, a: false, s: false, d: false };
        const updateKeyState = (e, isDown) => {
            if (isDown && e.target) {
                const tag = (e.target.tagName || "").toUpperCase();
                if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) {
                    return;
                }
            }
            const code = e.code || "";
            const key = (e.key || "").toLowerCase();
            if (code === "KeyW" || key === "w" || code === "ArrowUp") this.keyState.w = isDown;
            if (code === "KeyS" || key === "s" || code === "ArrowDown") this.keyState.s = isDown;
            if (code === "KeyA" || key === "a" || code === "ArrowLeft") this.keyState.a = isDown;
            if (code === "KeyD" || key === "d" || code === "ArrowRight") this.keyState.d = isDown;
        };
        window.addEventListener("keydown", (e) => updateKeyState(e, true));
        window.addEventListener("keyup", (e) => updateKeyState(e, false));
        window.addEventListener("blur", () => {
            this.keyState = { w: false, a: false, s: false, d: false };
        });

        const pickTileAtClientPos = (clientX, clientY) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const rawHits = this.raycaster.intersectObjects(this.pickableMeshes, false);
            if (rawHits.length === 0) return null;

            const firstObj = rawHits[0].object;
            const firstTile = firstObj && firstObj.userData ? firstObj.userData.tile : null;
            if (!firstTile) return null;
            if (firstTile.navigable) return firstTile;

            for (let i = 1; i < rawHits.length; i++) {
                const t = rawHits[i].object && rawHits[i].object.userData ? rawHits[i].object.userData.tile : null;
                if (t && t.navigable && (rawHits[i].distance - rawHits[0].distance) <= 2.4) {
                    return t;
                }
            }
            return firstTile;
        };

        this.renderer.domElement.addEventListener("pointerdown", (e) => {
            // Only left mouse button / touch triggers hex click & custom path drawing
            if (e.button !== 0) return;

            pointerDownPos = { x: e.clientX, y: e.clientY };
            const tile = pickTileAtClientPos(e.clientX, e.clientY);
            pointerDownTile = tile;
            isLeftPointerDown = true;
            const now = performance.now();

            // If already in click-draw mode (user double-clicked and released, then hovered across tiles),
            // clicking again commits the drawn path immediately!
            if (this.isClickDrawMode) {
                this.isClickDrawMode = false;
                this.isDrawingCustomPath = false;
                if (tile && tile.navigable && this.onCustomPathStep) {
                    this.onCustomPathStep(tile);
                }
                if (this.onCustomPathCommit) {
                    this.onCustomPathCommit();
                }
                lastTapTime = 0;
                return;
            }

            if (tile && tile.navigable) {
                // Double-click + hold & drag (or double-click then move) custom path drawing:
                if ((now - lastTapTime) <= 680 && this.onCustomPathStart) {
                    clearTimeout(this.singleClickTimer);
                    this.singleClickTimer = null;
                    const started = this.onCustomPathStart(tile);
                    if (started) {
                        this.isDrawingCustomPath = true;
                        this.hasDraggedToOtherHex = false;
                        try {
                            this.renderer.domElement.setPointerCapture(e.pointerId);
                        } catch (_) {}
                        lastTapTime = 0;
                        return;
                    }
                }
                lastTapTime = now;
            }
        });

        this.renderer.domElement.addEventListener("pointermove", (e) => {
            const now = performance.now();
            if (!this.isDrawingCustomPath && !this.isClickDrawMode && !isLeftPointerDown) {
                if (now - lastHoverRaycastTime < 22) return;
            }
            lastHoverRaycastTime = now;

            const tile = pickTileAtClientPos(e.clientX, e.clientY);

            // A. Active custom path drawing (either holding mouse button or in click-draw mode)
            if (this.isDrawingCustomPath || this.isClickDrawMode) {
                if (tile && tile.navigable && this.onCustomPathStep) {
                    if (pointerDownTile && (tile.q !== pointerDownTile.q || tile.r !== pointerDownTile.r)) {
                        this.hasDraggedToOtherHex = true;
                    }
                    this.onCustomPathStep(tile);
                }
                return;
            }

            // B. Direct Left-Click + Drag across hexes also starts custom path drawing if starting on a valid 1-step hex!
            if (isLeftPointerDown && pointerDownTile && pointerDownTile.navigable && tile && tile.navigable) {
                const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
                if ((tile.q !== pointerDownTile.q || tile.r !== pointerDownTile.r) && moveDist > 14 && this.onCustomPathStart) {
                    clearTimeout(this.singleClickTimer);
                    this.singleClickTimer = null;
                    const started = this.onCustomPathStart(pointerDownTile);
                    if (started) {
                        this.isDrawingCustomPath = true;
                        this.hasDraggedToOtherHex = true;
                        if (this.onCustomPathStep) {
                            this.onCustomPathStep(tile);
                        }
                        return;
                    }
                }
            }

            if (tile) {
                if (this.hoveredHex !== tile) {
                    if (this.hoveredHex && this.hoveredHex.highlightRing) {
                        this.hoveredHex.highlightRing.material.opacity = 0.0;
                    }
                    this.hoveredHex = tile;

                    const key = `${tile.q},${tile.r}`;
                    const isReachable = this.reachablePaths && this.reachablePaths.has(key);
                    this.renderer.domElement.style.cursor = isReachable ? "pointer" : (tile.navigable ? "default" : "not-allowed");

                    if (isReachable) {
                        tile.highlightRing.material.color.setHex(0x22c55e);
                        tile.highlightRing.material.opacity = 0.85;
                        this.showPathPreview(this.reachablePaths.get(key).path, false);
                    } else {
                        tile.highlightRing.material.opacity = 0.0;
                        this.clearPathPreview();
                    }

                    if (this.onHexHover) this.onHexHover(tile, e.clientX, e.clientY);
                }
            } else if (this.hoveredHex) {
                if (this.hoveredHex.highlightRing) {
                    this.hoveredHex.highlightRing.material.opacity = 0.0;
                }
                this.hoveredHex = null;
                this.renderer.domElement.style.cursor = "default";
                this.clearPathPreview();
                if (this.onHexHover) this.onHexHover(null, 0, 0);
            }
        });

        this.renderer.domElement.addEventListener("pointerup", (e) => {
            if (e.button !== 0) return;
            isLeftPointerDown = false;
            try {
                this.renderer.domElement.releasePointerCapture(e.pointerId);
            } catch (_) {}

            if (this.isDrawingCustomPath) {
                this.isDrawingCustomPath = false;
                if (this.hasDraggedToOtherHex) {
                    // User held the second click and dragged across tiles -> commit immediately on release!
                    this.isClickDrawMode = false;
                    if (this.onCustomPathCommit) {
                        this.onCustomPathCommit();
                    }
                } else {
                    // User did a quick double-click without dragging yet -> stay in click-draw mode so they can move across tiles and click to finish!
                    this.isClickDrawMode = true;
                }
                return;
            }

            const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
            if (moveDist > 28) return;

            const tile = pickTileAtClientPos(e.clientX, e.clientY);
            if (tile && this.onHexClick) {
                // Delay single-click move by 240ms so the first click of a double-click doesn't immediately move the ship
                clearTimeout(this.singleClickTimer);
                this.singleClickTimer = setTimeout(() => {
                    this.singleClickTimer = null;
                    if (!this.isDrawingCustomPath && !this.isClickDrawMode) {
                        this.onHexClick(tile);
                    }
                }, 240);
            }
        });
    }

    startRenderLoop() {
        const animate = () => {
            requestAnimationFrame(animate);
            const delta = Math.min(0.05, this.clock.getDelta());
            const elapsed = this.clock.getElapsedTime();
            const now = performance.now();

            // 1. Dynamic Ocean Waves
            if (this.oceanMesh) {
                const pos = this.oceanMesh.geometry.attributes.position;
                const amp = this.waveMultiplier || 1.0;
                for (let i = 0; i < pos.count; i++) {
                    const vx = pos.getX(i);
                    const vz = pos.getZ(i);
                    const wave = Math.sin(vx * 0.16 + elapsed * 1.75) * 0.095 * amp +
                                 Math.cos(vz * 0.19 + elapsed * 1.45) * 0.085 * amp +
                                 Math.sin((vx + vz) * 0.09 + elapsed * 2.15) * 0.055 * amp;
                    pos.setY(i, this.oceanBaseY[i] + wave);
                }
                pos.needsUpdate = true;
                this.oceanMesh.geometry.computeVertexNormals();
            }

            if (!this.minimalistMode) {
                this.foamRings.forEach(f => {
                    const s = 0.8 + Math.sin(elapsed * f.speed + f.phase) * 0.35;
                    f.mesh.scale.set(s, s, s);
                    f.mesh.material.opacity = 0.12 + Math.sin(elapsed * f.speed + f.phase) * 0.10;
                });
            }

            // 1b. Rain Particle Field (Tropical Rain / Thunderstorm / Super Typhoon Yagi)
            if (this.rainField && this.rainField.material.opacity > 0.01) {
                const rPos = this.rainField.geometry.attributes.position;
                const fallSpeed = (this.weatherMode === "super_typhoon_yagi" ? 38 : 26) * delta;
                const windDrift = (this.weatherMode === "super_typhoon_yagi" ? -12 : -4) * delta;
                for (let i = 0; i < rPos.count; i++) {
                    let y = rPos.getY(i) - fallSpeed;
                    let x = rPos.getX(i) + windDrift;
                    if (y < 0) {
                        y = 52 + Math.random() * 5;
                        x = (Math.random() - 0.5) * 190;
                    }
                    rPos.setY(i, y);
                    rPos.setX(i, x);
                }
                rPos.needsUpdate = true;
            }

            // 2. Sky Clouds
            if (this.cloudsVisible) {
                this.clouds.forEach(c => {
                    c.mesh.position.x += c.speed * 0.012;
                    c.mesh.position.y += Math.sin(elapsed * 0.8 + c.bobOffset) * 0.002;
                    if (c.mesh.position.x > 85) c.mesh.position.x = -85;
                });
            }

            if (!this.minimalistMode) {
                // 3. Ambient Sea Lighthouses & Offshore Oil Rigs
                this.ambientLighthouses.forEach(lh => {
                    if (lh.beam) {
                        lh.beam.rotation.y = elapsed * lh.speed + lh.phase;
                    }
                });
                this.ambientOilRigs.forEach(rig => {
                    if (rig.flame) {
                        const flicker = 0.85 + Math.sin(elapsed * 14 + rig.phase) * 0.25 + Math.cos(elapsed * 23) * 0.15;
                        rig.flame.scale.set(flicker, 0.8 + flicker * 0.35, flicker);
                    }
                    if (rig.radar) {
                        rig.radar.rotation.y = elapsed * 2.2 + rig.phase;
                    }
                });

                // 4. Ambient Fishing Sampans
                this.ambientSampans.forEach(sp => {
                    const t = elapsed * sp.speed + sp.phase;
                    const nx = sp.cx + Math.cos(t) * sp.rx;
                    const nz = sp.cz + Math.sin(t) * sp.rz;
                    const dx = -Math.sin(t) * sp.rx;
                    const dz = Math.cos(t) * sp.rz;
                    sp.mesh.position.set(nx, -0.14 + Math.sin(elapsed * 2.5 + sp.phase) * 0.04, nz);
                    sp.mesh.rotation.y = -Math.atan2(dz, dx);
                    sp.mesh.rotation.z = Math.sin(elapsed * 2.2 + sp.phase) * 0.05;
                });

                // 5. Jumping Dolphin Pods
                this.ambientDolphins.forEach(pod => {
                    if (pod.d1 && pod.d2) {
                        [pod.d1, pod.d2].forEach((d, dIdx) => {
                            const cycle = elapsed * 2.1 + pod.phase + dIdx * 1.1;
                            const jumpH = Math.sin(cycle);
                            d.position.y = Math.max(-0.35, jumpH * 0.85);
                            d.rotation.z = -Math.cos(cycle) * 0.75;
                        });
                    } else if (Array.isArray(pod.dolphins)) {
                        pod.dolphins.forEach(d => {
                            const cycle = elapsed * 2.1 + pod.phase + d.phaseOffset;
                            const jumpH = Math.sin(cycle);
                            d.pivot.position.y = Math.max(-0.35, jumpH * 0.85);
                            d.pivot.position.x = Math.cos(cycle) * 0.65;
                            d.bodyGroup.rotation.z = -Math.cos(cycle) * 0.85;
                        });
                    }
                });

                // 6. Glowing Fish Schools
                this.ambientFishSchools.forEach(fs => {
                    const ang = elapsed * fs.speed + fs.phase;
                    fs.mesh.position.x = fs.cx + Math.cos(ang) * fs.r;
                    fs.mesh.position.z = fs.cz + Math.sin(ang) * fs.r;
                    fs.mesh.rotation.y = -ang + Math.PI / 2;
                });

                // 7. Flapping Seagull Flocks
                this.ambientSeagulls.forEach(sg => {
                    const ang = elapsed * sg.speed + sg.phase;
                    sg.mesh.position.x = sg.cx + Math.cos(ang) * sg.r;
                    sg.mesh.position.z = sg.cz + Math.sin(ang) * sg.r;
                    sg.mesh.position.y = sg.y + Math.sin(elapsed * 1.4 + sg.phase) * 0.45;
                    sg.mesh.rotation.y = -ang;
                    const birdWings = sg.wings || sg.birds;
                    if (Array.isArray(birdWings)) {
                        birdWings.forEach((b, bIdx) => {
                            const flap = Math.sin(elapsed * 7.5 + (b.flapPhase || bIdx * 1.2)) * 0.48;
                            if (b.wingL) b.wingL.rotation.z = 0.15 + flap;
                            if (b.wingR) b.wingR.rotation.z = -0.15 - flap;
                        });
                    }
                });
            }

            // 8. Animated Regional Mainland Props (Waterwheels, Windmills, Turbines, Smoke, Lanterns, Boats)
            this.animatedLandProps.forEach(prop => {
                if (!prop || !prop.mesh) return;
                if (prop.type === "spin_z" || prop.type === "wheel_z") {
                    prop.mesh.rotation.z = elapsed * (prop.speed || 1.5);
                } else if (prop.type === "wheel_x") {
                    prop.mesh.rotation.x = elapsed * (prop.speed || 1.5);
                } else if (prop.type === "spin_y") {
                    prop.mesh.rotation.y = elapsed * (prop.speed || 1.5);
                } else if (prop.type === "sway_flag" || prop.type === "flag_wave") {
                    prop.mesh.rotation.y = Math.sin(elapsed * 3.8 + (prop.phase || 0)) * 0.25;
                } else if (prop.type === "lantern_sway") {
                    prop.mesh.position.y = (prop.baseY || 0.7) + Math.sin(elapsed * 2.8 + (prop.phase || 0)) * 0.03;
                    prop.mesh.rotation.z = Math.sin(elapsed * 2.2 + (prop.phase || 0)) * 0.12;
                } else if (prop.type === "smoke_rise") {
                    const progress = ((elapsed * 0.45 + (prop.phase || 0)) % 1.0);
                    prop.mesh.position.y = (prop.baseY || 0.72) + progress * 0.55;
                    const s = 0.7 + progress * 0.9;
                    prop.mesh.scale.set(s, s, s);
                } else if (prop.type === "orbit_cloud" || prop.type === "mist_drift") {
                    const bx = prop.basePos ? prop.basePos.x : (prop.baseX || -0.25);
                    const by = prop.basePos ? prop.basePos.y : (prop.baseY || 1.25);
                    prop.mesh.position.x = bx + Math.sin(elapsed * 0.9 + (prop.phase || 0)) * 0.18;
                    prop.mesh.position.y = by + Math.cos(elapsed * 1.1 + (prop.phase || 0)) * 0.04;
                } else if (prop.type === "flicker_fire" || prop.type === "fire_flicker") {
                    const fl = 0.82 + Math.sin(elapsed * 16 + (prop.phase || 0)) * 0.24;
                    prop.mesh.scale.set(fl, 0.85 + fl * 0.3, fl);
                } else if (prop.type === "bob_boat" || prop.type === "boat_bob") {
                    prop.mesh.position.y = (prop.baseY || 0.09) + Math.sin(elapsed * 2.6 + (prop.phase || 0)) * 0.025;
                    prop.mesh.rotation.z = Math.sin(elapsed * 2.0 + (prop.phase || 0)) * 0.06;
                } else if (prop.type === "shimmer_water") {
                    prop.mesh.scale.y = 0.96 + Math.sin(elapsed * 5.0 + (prop.phase || 0)) * 0.06;
                } else if (prop.type === "crane_swing") {
                    prop.mesh.rotation.y = (prop.baseRot || 0) + Math.sin(elapsed * 0.75 + (prop.phase || 0)) * 0.45;
                }
            });

            // 9. Player Ships: Sails, Flags, Lanterns, Pearls, Radar Ring, Arrow Marker & Spotlight Scale
            const occupiedHexKeys = new Set();
            let shipIdx = 0;
            const wavePitch = (this.waveMultiplier || 1.0) * 0.048;
            this.shipMeshes.forEach((ship) => {
                if (ship.visible && ship.userData.lastQ !== undefined && ship.userData.lastR !== undefined) {
                    const key = `${ship.userData.lastQ},${ship.userData.lastR}`;
                    occupiedHexKeys.add(key);

                    // Scale ship up slightly so it stands out prominently on its tile
                    const baseSc = ship.userData.baseShipScale || 1.52;
                    const targetShipSc = baseSc * 1.14;
                    const curShipSc = ship.scale.x || baseSc;
                    if (Math.abs(curShipSc - targetShipSc) > 0.005) {
                        ship.scale.setScalar(curShipSc + (targetShipSc - curShipSc) * Math.min(1, delta * 8.0));
                    }
                }
                ship.rotation.z = Math.sin(elapsed * 2.3 + shipIdx) * wavePitch;
                ship.rotation.x = Math.cos(elapsed * 1.85 + shipIdx) * (wavePitch * 0.78);
                if (ship.userData.flag) {
                    ship.userData.flag.rotation.y = Math.sin(elapsed * 5.2 + shipIdx) * 0.28;
                }
                if (ship.userData.foreFlag) {
                    ship.userData.foreFlag.rotation.y = Math.cos(elapsed * 5.6 + shipIdx) * 0.25;
                }
                if (ship.userData.mainSail) {
                    const breath = 1.0 + Math.sin(elapsed * 2.4 + shipIdx) * 0.045;
                    ship.userData.mainSail.scale.set(breath, 1.0, breath);
                }
                if (ship.userData.foreSail) {
                    const fBreath = 1.0 + Math.cos(elapsed * 2.6 + shipIdx) * 0.04;
                    ship.userData.foreSail.scale.set(fBreath, 1.0, fBreath);
                }
                const aftSail = ship.userData.mizzenSail || ship.userData.aftSail;
                if (aftSail) {
                    const aBreath = 1.0 + Math.sin(elapsed * 2.2 + shipIdx + 1.0) * 0.035;
                    aftSail.scale.set(aBreath, 1.0, aBreath);
                }
                if (ship.userData.lanternL && ship.userData.lanternR) {
                    const swing = Math.sin(elapsed * 3.2 + shipIdx) * 0.14;
                    ship.userData.lanternL.rotation.x = swing;
                    ship.userData.lanternR.rotation.x = -swing;
                }
                if (ship.userData.pearl) {
                    const pScale = 0.92 + Math.sin(elapsed * 4.5 + shipIdx) * 0.15;
                    ship.userData.pearl.scale.set(pScale, pScale, pScale);
                }
                if (ship.userData.ring) {
                    const rPulse = 1.10 + Math.sin(elapsed * 3.2 + shipIdx) * 0.10;
                    ship.userData.ring.scale.set(rPulse, 1, rPulse);
                }
                if (ship.userData.localRadarRing) {
                    const radarPulse = 1.0 + ((elapsed * 1.15) % 1.0) * 0.55;
                    ship.userData.localRadarRing.scale.set(radarPulse, 1, radarPulse);
                    ship.userData.localRadarRing.material.opacity = 0.92 * (1.0 - ((elapsed * 1.15) % 1.0) * 0.72);
                }
                const shipPillar = ship.userData.beaconPillar || ship.userData.lightPillar;
                if (shipPillar) {
                    shipPillar.material.opacity = (ship.userData.isLocalPlayer ? 0.24 : 0.13) + Math.sin(elapsed * 2.8 + shipIdx) * 0.05;
                }
                if (ship.userData.myArrowMarker) {
                    ship.userData.myArrowMarker.position.y = 4.55 + Math.sin(elapsed * 4.2) * 0.24;
                    if (ship.userData.myArrowMarker.userData.headMesh) {
                        ship.userData.myArrowMarker.userData.headMesh.rotation.y = elapsed * 2.4;
                    }
                    if (ship.userData.myArrowMarker.userData.shaftMesh) {
                        ship.userData.myArrowMarker.userData.shaftMesh.rotation.y = elapsed * 2.4;
                    }
                    const collar = ship.userData.myArrowMarker.userData.haloMesh || ship.userData.myArrowMarker.userData.collarMesh;
                    if (collar) {
                        const cScale = 1.0 + Math.sin(elapsed * 5.0) * 0.15;
                        collar.scale.set(cScale, cScale, 1);
                    }
                }
                shipIdx++;
            });

            // 10. Monuments, Ports, Resources & Occupied-Tile Fade Effect
            const lerpRate = Math.min(1, delta * 9.0);
            for (let i = 0; i < this.hexTiles.length; i++) {
                const tile = this.hexTiles[i];
                const isOccupied = occupiedHexKeys.has(`${tile.q},${tile.r}`);

                // A. Fade the tile's baseMesh & rimMesh when occupied by a ship
                const targetBaseOp = isOccupied ? 0.20 : tile.defaultBaseOpacity;
                if (Math.abs(tile.baseMesh.material.opacity - targetBaseOp) > 0.008) {
                    tile.baseMesh.material.opacity += (targetBaseOp - tile.baseMesh.material.opacity) * lerpRate;
                }
                if (tile.rimMesh) {
                    const targetRimOp = isOccupied ? 0.04 : tile.defaultRimOpacity;
                    if (Math.abs(tile.rimMesh.material.opacity - targetRimOp) > 0.005) {
                        tile.rimMesh.material.opacity += (targetRimOp - tile.rimMesh.material.opacity) * lerpRate;
                    }
                }

                // B. Animate & gently fade the tile's 3D propModel when occupied by a ship
                if (tile.propModel) {
                    const basePropScale = (tile.resourceType && tile.resourceCooldown > 0) ? 0.52 : 1.0;
                    const targetPropScale = isOccupied ? (basePropScale * 0.72) : basePropScale;
                    const curScale = tile.propModel.scale.x || 1.0;
                    if (Math.abs(curScale - targetPropScale) > 0.006) {
                        tile.propModel.scale.setScalar(curScale + (targetPropScale - curScale) * lerpRate);
                    }

                    if (tile.propMeshes && tile.propMeshes.length > 0) {
                        for (let m = 0; m < tile.propMeshes.length; m++) {
                            const pm = tile.propMeshes[m];
                            const mat = pm.material;
                            const origOp = (mat.userData && mat.userData.baseOpacity !== undefined) ? mat.userData.baseOpacity : 1.0;
                            const targetMeshOp = isOccupied ? (origOp * 0.30) : origOp;
                            if (Math.abs(mat.opacity - targetMeshOp) > 0.01) {
                                mat.transparent = true;
                                mat.opacity += (targetMeshOp - mat.opacity) * lerpRate;
                            }
                        }
                    }

                    if (tile.monumentId) {
                        const crown = tile.propModel.userData.relicCrown;
                        if (crown) {
                            crown.rotation.y = elapsed * 1.4;
                            crown.position.y = 2.15 + Math.sin(elapsed * 2.6 + tile.index) * 0.12;
                        }
                    } else if (tile.isPort) {
                        const crane = tile.propModel.userData.spinY || tile.propModel.userData.craneArm;
                        if (crane) {
                            crane.rotation.y = -0.35 + Math.sin(elapsed * 0.9 + tile.index) * 0.35;
                        }
                        const lantern = tile.propModel.userData.lantern || tile.propModel.userData.lighthouseGlow;
                        if (lantern) {
                            const s = 0.9 + Math.sin(elapsed * 4.0 + tile.index) * 0.18;
                            lantern.scale.set(s, s, s);
                        }
                    } else if (tile.resourceType) {
                        const ud = tile.propModel.userData;
                        if (ud.spinZ) {
                            ud.spinZ.rotation.z = elapsed * (tile.resourceType === "wood" ? -5.0 : 1.8);
                        }
                        if (ud.spinY) {
                            ud.spinY.rotation.y = elapsed * 1.4;
                        }
                    } else if (tile.hasNPC) {
                        tile.propModel.position.y = (tile.height - 0.1) + Math.sin(elapsed * 3.0) * 0.06;
                        if (tile.propModel.userData.gem) {
                            tile.propModel.userData.gem.rotation.y = elapsed * 2.2;
                        }
                    }
                }

                // C. Animate & fade Monument Sky Beacon, Halo Rings, Orbiting Crystals & Label Sprite
                if (tile.monumentGlowGroup) {
                    const gd = tile.monumentGlowGroup.userData;
                    const isLocked = !!tile.monumentLocked;
                    if (gd.outerHalo) {
                        const pulse = 1.0 + Math.sin(elapsed * 3.2 + tile.index) * 0.08;
                        gd.outerHalo.scale.set(pulse, pulse, 1);
                        gd.outerHalo.material.opacity = isLocked ? 0.18 : (isOccupied ? 0.22 : (0.58 + Math.sin(elapsed * 3.2 + tile.index) * 0.22));
                    }
                    if (gd.innerHalo) {
                        gd.innerHalo.rotation.z = elapsed * 1.2;
                        gd.innerHalo.material.opacity = isLocked ? 0.12 : (isOccupied ? 0.18 : (0.50 + Math.cos(elapsed * 2.8 + tile.index) * 0.20));
                    }
                    if (gd.beaconMesh) {
                        gd.beaconMesh.material.opacity = isLocked ? 0.04 : (isOccupied ? 0.08 : (0.16 + Math.sin(elapsed * 2.4 + tile.index) * 0.08));
                    }
                    if (gd.orbitGroup) {
                        gd.orbitGroup.visible = !isLocked && !isOccupied;
                        gd.orbitGroup.rotation.y = elapsed * 1.85 + tile.index;
                        gd.orbitGroup.position.y = 1.35 + Math.sin(elapsed * 2.5 + tile.index) * 0.15;
                    }
                }
                if (tile.labelSprite && tile.labelSprite.material) {
                    const targetLabelOp = isOccupied ? 0.15 : 0.95;
                    if (Math.abs(tile.labelSprite.material.opacity - targetLabelOp) > 0.01) {
                        tile.labelSprite.material.opacity += (targetLabelOp - tile.labelSprite.material.opacity) * lerpRate;
                    }
                }
            }

            // 11. Wake, Burst, Lightning Bolt & Monument Trap Effects
            for (let i = this.floatingEffects.length - 1; i >= 0; i--) {
                const fx = this.floatingEffects[i];
                const age = now - fx.birth;
                if (age >= fx.life) {
                    this.effectsGroup.remove(fx.mesh);
                    this.floatingEffects.splice(i, 1);
                    continue;
                }
                const progress = age / fx.life;
                if (fx.type === "wake") {
                    const s = 1 + progress * 2.4;
                    fx.mesh.scale.set(s, s, s);
                    fx.mesh.material.opacity = (1 - progress) * 0.72;
                } else if (fx.type === "burst") {
                    fx.mesh.position.x += fx.vx * 0.016;
                    fx.mesh.position.y += fx.vy * 0.016;
                    fx.mesh.position.z += fx.vz * 0.016;
                    fx.vy -= 5.8 * 0.016;
                    fx.mesh.rotation.x += 0.12;
                    fx.mesh.rotation.y += 0.15;
                    fx.mesh.material.opacity = 1 - progress;
                } else if (fx.type === "lightning_bolt") {
                    const flash = (Math.floor(age / 55) % 2 === 0) ? 1.0 : 0.25;
                    if (fx.beamMat) fx.beamMat.opacity = (1 - progress) * 0.85 * flash;
                    if (fx.ringMesh) {
                        const rs = 1 + progress * 4.5;
                        fx.ringMesh.scale.set(rs, rs, rs);
                    }
                    if (fx.ringMat) fx.ringMat.opacity = (1 - progress) * 0.95;
                } else if (fx.type === "trap_arrow") {
                    if (fx.mesh.position.y > fx.targetY) {
                        fx.mesh.position.y = Math.max(fx.targetY, fx.mesh.position.y + fx.vy * 0.016);
                    }
                } else if (fx.type === "trap_boulder") {
                    fx.mesh.position.x += fx.vx * 0.016;
                    fx.mesh.position.z += fx.vz * 0.016;
                    fx.mesh.position.y += fx.vy * 0.016;
                    if (fx.mesh.position.y <= fx.floorY) {
                        fx.mesh.position.y = fx.floorY;
                        fx.vy = Math.abs(fx.vy) * 0.45;
                    } else {
                        fx.vy -= 12.0 * 0.016;
                    }
                    fx.mesh.rotation.x += 0.16;
                    fx.mesh.rotation.z += 0.14;
                }
            }

            // 12. WASD / Arrow Keys Camera Panning (Up / Down / Left / Right relative to camera heading)
            if (this.keyState && (this.keyState.w || this.keyState.s || this.keyState.a || this.keyState.d)) {
                const moveF = (this.keyState.w ? 1 : 0) - (this.keyState.s ? 1 : 0);
                const moveR = (this.keyState.d ? 1 : 0) - (this.keyState.a ? 1 : 0);
                if (moveF !== 0 || moveR !== 0) {
                    const fx = this.controls.target.x - this.camera.position.x;
                    const fz = this.controls.target.z - this.camera.position.z;
                    const fLen = Math.hypot(fx, fz) || 1;
                    const dirX = fx / fLen;
                    const dirZ = fz / fLen;
                    const rightX = -dirZ;
                    const rightZ = dirX;
                    const panSpeed = 42 * delta;
                    const dx = (dirX * moveF + rightX * moveR) * panSpeed;
                    const dz = (dirZ * moveF + rightZ * moveR) * panSpeed;
                    const maxBound = 75;
                    this.controls.target.x = Math.max(-maxBound, Math.min(maxBound, this.controls.target.x + dx));
                    this.controls.target.z = Math.max(-maxBound, Math.min(maxBound, this.controls.target.z + dz));
                    this.camera.position.x += dx;
                    this.camera.position.z += dz;
                }
            }

            // 13. Smooth Camera Follow Lock ("Thêm nút khóa góc nhìn để có thể tự di theo thuyền")
            if (this.cameraLockEnabled && this.cameraLockShipKey) {
                const lockedShip = this.shipMeshes.get(this.cameraLockShipKey);
                if (lockedShip) {
                    const dx = lockedShip.position.x - this.controls.target.x;
                    const dz = lockedShip.position.z - this.controls.target.z;
                    if (Math.hypot(dx, dz) > 0.005) {
                        const lerpFactor = Math.min(1, delta * 9.5);
                        this.controls.target.x += dx * lerpFactor;
                        this.controls.target.z += dz * lerpFactor;
                        this.camera.position.x += dx * lerpFactor;
                        this.camera.position.z += dz * lerpFactor;
                    }
                }
            }

            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }
}

window.World3D = World3D;
