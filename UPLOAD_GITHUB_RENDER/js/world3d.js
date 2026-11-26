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
        this.graphicsQuality = "pretty"; // 'pretty' ("✨ Đẹp (Tối ưu)") | 'smooth' ("⚡ Siêu Mượt")
        this.cameraLockEnabled = false;
        this.cameraLockShipKey = null;
        this.menuOrbitMode = false;
        this.menuOrbitAngle = 0.28;
        this.lobbyMouseX = 0;
        this.lobbyMouseY = 0;
        this.lobbyParallaxX = 0;
        this.lobbyParallaxY = 0;
        this.lobbyScene = null;
        this.lobbyCamera = null;
        this.lobbyWaveMesh = null;
        this.lobbyWaveBaseXZ = null;
        this.lobbyWaveSmooth = false;
        this.lobbyBeaconPivot = null;
        this.lobbyShips = [];
        this.lobbyClouds = [];
        this.lobbyGulls = [];
        this.weatherMode = "sunny";
        this._frameCount = 0;
        this._lastCamSig = "";
        this._lastShipSig = "";
        this._hasActiveLabelFade = true;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredHex = null;
        this.reachablePaths = new Map(); // "q,r" -> { steps, path: [tile, ...] }

        this.clock = new THREE.Clock();
        this.initScene();
        this.initAtmosphereAndWeather();
        this.initOcean();
        this.initLobbySunsetScene();
        this.initEvents();
    }

    static getPlayerShipKey(player, fallbackIdx = 0) {
        if (!player) return `ship_${fallbackIdx}`;
        if (player.shipKey) return String(player.shipKey);
        if (player.clientId) return `client_${player.clientId}`;
        if (player.seatIndex !== undefined && player.seatIndex !== null) return `seat_${player.seatIndex}`;
        return `id_${player.id !== undefined ? player.id : fallbackIdx}`;
    }

    getOptimalPixelRatio() {
        if (this.graphicsQuality === "smooth") return 1;
        const ua = (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent : "";
        const isMobile = /Android|iPhone|iPad|iPod|Mobi/i.test(ua) || (typeof window !== "undefined" && window.innerWidth <= 900);
        const cap = isMobile ? 1.5 : 2;
        return Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, cap);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x38bdf8);
        this.scene.fog = new THREE.Fog(0xbae6fd, 280, 680);

        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;

        this.camera = new THREE.PerspectiveCamera(40, w / h, 0.5, 900);
        this.camera.position.set(12, 84, 66);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(this.getOptimalPixelRatio());
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        this.maxAnisotropy = (this.renderer.capabilities && typeof this.renderer.capabilities.getMaxAnisotropy === "function")
            ? Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8)
            : 1;
        if (typeof ProceduralModels !== "undefined") {
            ProceduralModels.MAX_ANISOTROPY = this.maxAnisotropy;
        }
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

        // Bright, Crisp Daytime Lighting: Sunny baseline (Hemi #f0f9ff/#38bdf8 0.95, Sun #fffcf0 1.45)
        this.hemiLight = new THREE.HemisphereLight(0xf0f9ff, 0x38bdf8, 0.95);
        this.hemiLight.position.set(0, 120, 0);
        this.scene.add(this.hemiLight);

        this.sunLight = new THREE.DirectionalLight(0xfffcf0, 1.45);
        this._baseSunIntensity = 1.45;
        this.sunLight.position.set(62, 72, -72);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 20;
        this.sunLight.shadow.camera.far = 210;
        this.sunLight.shadow.camera.left = -58;
        this.sunLight.shadow.camera.right = 58;
        this.sunLight.shadow.camera.top = 68;
        this.sunLight.shadow.camera.bottom = -68;
        this.sunLight.shadow.bias = -0.0005;
        this.scene.add(this.sunLight);

        this.boardGroup = new THREE.Group();
        this.scene.add(this.boardGroup);

        this.pathPreviewGroup = new THREE.Group();
        this.scene.add(this.pathPreviewGroup);
        this.pathPreviewAnimItems = null;
        this.getPathPreviewMeta = null;
        this.isPathLocked = false;
        this.onCancelLockedPath = null;

        // Crisp 2D HTML Projected Map Labels Engine (#map-labels-layer)
        this.htmlLabels = new Map();
        this.htmlLabelLayer = (typeof document !== "undefined") ? document.getElementById("map-labels-layer") : null;
        this._projVec = new THREE.Vector3();
        this._lastHoveredHtmlId = null;
        this.htmlLabelMode = "compact"; // "compact" | "full" | "hidden"
        if (this.htmlLabelLayer) {
            this.htmlLabelLayer.classList.remove("labels-compact", "labels-full", "labels-hidden");
            this.htmlLabelLayer.classList.add("labels-compact");
        }

        this.effectsGroup = new THREE.Group();
        this.scene.add(this.effectsGroup);
    }

    initAtmosphereAndWeather() {
        this.weatherGroup = new THREE.Group();
        this.scene.add(this.weatherGroup);

        // 1. Lightweight Gradient Sky Dome (1 single SphereGeometry mesh, BackSide, depthWrite: false, fog: false)
        this.skyDomeCanvas = document.createElement("canvas");
        this.skyDomeCanvas.width = 32;
        this.skyDomeCanvas.height = 256;
        this.skyDomeCtx = this.skyDomeCanvas.getContext("2d");
        this.skyDomeTexture = new THREE.CanvasTexture(this.skyDomeCanvas);
        if (THREE.ClampToEdgeWrapping !== undefined) {
            this.skyDomeTexture.wrapS = THREE.ClampToEdgeWrapping;
            this.skyDomeTexture.wrapT = THREE.ClampToEdgeWrapping;
        }
        const skyDomeGeo = new THREE.SphereGeometry(420, 24, 16);
        const skyDomeMat = new THREE.MeshBasicMaterial({
            map: this.skyDomeTexture,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false
        });
        this.skyDomeMesh = new THREE.Mesh(skyDomeGeo, skyDomeMat);
        this.skyDomeMesh.renderOrder = -100;
        this.weatherGroup.add(this.skyDomeMesh);

        // 1b. Lightweight 3D Sun Group (1 Core Sphere r=10 + 1 Radial-Gradient Additive Sprite, zero PointLight, fog: false)
        this.sunGroup = new THREE.Group();
        const sunCoreGeo = new THREE.SphereGeometry(10, 16, 12);
        this.sunCoreMat = new THREE.MeshBasicMaterial({
            color: 0xfffef0,
            transparent: true,
            opacity: 1.0,
            fog: false
        });
        this.sunCoreMesh = new THREE.Mesh(sunCoreGeo, this.sunCoreMat);
        this.sunCoreMesh.castShadow = false;
        this.sunCoreMesh.receiveShadow = false;
        this.sunCoreMesh.renderOrder = -50;
        this.sunGroup.add(this.sunCoreMesh);

        const glowCanvas = document.createElement("canvas");
        glowCanvas.width = 128;
        glowCanvas.height = 128;
        const glowCtx = glowCanvas.getContext ? glowCanvas.getContext("2d") : null;
        if (glowCtx && typeof glowCtx.createRadialGradient === "function" && typeof glowCtx.fillRect === "function") {
            const gGrad = glowCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
            gGrad.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
            gGrad.addColorStop(0.28, "rgba(255, 255, 255, 0.78)");
            gGrad.addColorStop(0.62, "rgba(255, 255, 255, 0.25)");
            gGrad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");
            glowCtx.fillStyle = gGrad;
            glowCtx.fillRect(0, 0, 128, 128);
        }
        const glowTex = new THREE.CanvasTexture(glowCanvas);
        this.sunGlowMat = new THREE.SpriteMaterial({
            map: glowTex,
            color: 0xfef08a,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        });
        this.sunGlowSprite = new THREE.Sprite(this.sunGlowMat);
        this.sunGlowSprite.scale.set(60, 60, 1);
        this.sunGlowSprite.renderOrder = -49;
        this.sunGroup.add(this.sunGlowSprite);
        this.sunGroup.position.set(105, 52, -155);
        this.weatherGroup.add(this.sunGroup);

        // Pre-allocated weather lerp buffers (zero allocation inside render loop)
        this._weatherInitialized = false;
        this._weatherLerpElapsed = 2.0;
        this._weatherLerpDuration = 2.0;
        this._curSkyTop = new THREE.Color(0x38bdf8);
        this._curSkyMid = new THREE.Color(0x7dd3fc);
        this._curSkyBot = new THREE.Color(0xe0f7ff);
        this._tmpSkyTop = new THREE.Color();
        this._tmpSkyMid = new THREE.Color();
        this._tmpSkyBot = new THREE.Color();
        this._nextLightningAt = 0;
        this._lightningEndAt = 0;

        this._weatherFrom = {
            bg: new THREE.Color(0x38bdf8),
            fog: new THREE.Color(0xbae6fd),
            skyTop: new THREE.Color(0x38bdf8),
            skyMid: new THREE.Color(0x7dd3fc),
            skyBot: new THREE.Color(0xe0f7ff),
            oceanCol: new THREE.Color(0x0ea5c6),
            oceanEm: new THREE.Color(0x0369a1),
            oceanEmInt: 0.25,
            hemiSky: new THREE.Color(0xf0f9ff),
            hemiGround: new THREE.Color(0x38bdf8),
            hemiInt: 0.95,
            sunCol: new THREE.Color(0xfffcf0),
            sunInt: 1.45,
            sunPos: new THREE.Vector3(62, 72, -72),
            sunObjPos: new THREE.Vector3(105, 52, -155),
            sunObjScale: 1.0,
            sunCoreCol: new THREE.Color(0xfffef0),
            sunGlowCol: new THREE.Color(0xfef08a),
            sunCoreOp: 1.0,
            sunGlowOp: 0.85,
            cloudCol: new THREE.Color(0xffffff),
            cloudOp: 0.85,
            starsOp: 0.0,
            rainOp: 0.0,
            waveAmp: 1.0
        };
        this._weatherTo = {
            bg: new THREE.Color(0x38bdf8),
            fog: new THREE.Color(0xbae6fd),
            skyTop: new THREE.Color(0x38bdf8),
            skyMid: new THREE.Color(0x7dd3fc),
            skyBot: new THREE.Color(0xe0f7ff),
            oceanCol: new THREE.Color(0x0ea5c6),
            oceanEm: new THREE.Color(0x0369a1),
            oceanEmInt: 0.25,
            hemiSky: new THREE.Color(0xf0f9ff),
            hemiGround: new THREE.Color(0x38bdf8),
            hemiInt: 0.95,
            sunCol: new THREE.Color(0xfffcf0),
            sunInt: 1.45,
            sunPos: new THREE.Vector3(62, 72, -72),
            sunObjPos: new THREE.Vector3(105, 52, -155),
            sunObjScale: 1.0,
            sunCoreCol: new THREE.Color(0xfffef0),
            sunGlowCol: new THREE.Color(0xfef08a),
            sunCoreOp: 1.0,
            sunGlowOp: 0.85,
            cloudCol: new THREE.Color(0xffffff),
            cloudOp: 0.85,
            starsOp: 0.0,
            rainOp: 0.0,
            waveAmp: 1.0
        };
        this.updateSkyDomeGradient(this._curSkyTop, this._curSkyMid, this._curSkyBot);

        // Soft Low-Poly Clouds (3-5 squashed Icosahedron puffs per cloud, 1 InstancedMesh!)
        // Positioned along outer sea & continental margins so they NEVER obscure Monuments or Trade Ports!
        this.clouds = [];
        this.cloudPuffs = [];
        const cloudMat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.85,
            flatShading: true
        });

        const cloudSlots = [
            { x: -62, z: -48, y: 18 }, { x: 54, z: -46, y: 19 },
            { x: -56, z: -20, y: 21 }, { x: 64, z: -18, y: 20 },
            { x: -58, z: 12,  y: 19 }, { x: 66, z: 16,  y: 21 },
            { x: -52, z: 42,  y: 20 }, { x: 56, z: 44,  y: 18 },
            { x: -18, z: -58, y: 22 }, { x: 24, z: 58,  y: 20 },
            { x: 46,  z: -32, y: 23 }, { x: -46, z: 28, y: 22 }
        ];
        cloudSlots.forEach((slot, i) => {
            const puffCount = 3 + (i % 3); // 3 to 5 puffs per cloud
            const cloudObj = {
                x: slot.x,
                y: slot.y,
                z: slot.z,
                speed: 0.36 + (i % 4) * 0.10,
                bobOffset: i * 1.15,
                puffs: []
            };
            for (let p = 0; p < puffCount; p++) {
                const s = 1.25 + ((p === 1 || p === 2) ? 0.55 : 0.15) + (i % 2) * 0.2;
                const puffInfo = {
                    cloud: cloudObj,
                    ox: (p - (puffCount - 1) / 2) * 1.45,
                    oy: (p % 2 === 0 ? -0.10 : 0.18),
                    oz: ((p % 3) - 1) * 0.65,
                    sx: s * 1.55,
                    sy: s * 0.44,
                    sz: s * 1.05,
                    instanceIdx: this.cloudPuffs.length
                };
                cloudObj.puffs.push(puffInfo);
                this.cloudPuffs.push(puffInfo);
            }
            this.clouds.push(cloudObj);
        });

        if (typeof THREE.InstancedMesh === "function") {
            const unitPuffGeo = new THREE.IcosahedronGeometry(1.0, 0);
            this.cloudInstancedMesh = new THREE.InstancedMesh(unitPuffGeo, cloudMat, this.cloudPuffs.length);
            this.cloudInstancedMesh.visible = this.cloudsVisible;
            this.cloudDummy = new THREE.Object3D();
            this.updateCloudInstances(0);
            this.weatherGroup.add(this.cloudInstancedMesh);
        } else {
            this.cloudInstancedMesh = null;
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
            new THREE.PointsMaterial({ color: 0xfef9c3, size: 0.48, transparent: true, opacity: 0.0 })
        );
        this.weatherGroup.add(this.starField);

        // Unified Rain & Storm Particle Field (1 THREE.Points with BufferGeometry)
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

    updateCloudInstances(elapsed) {
        if (!this.cloudInstancedMesh || !this.cloudDummy) return;
        const dummy = this.cloudDummy;
        for (let i = 0; i < this.cloudPuffs.length; i++) {
            const pf = this.cloudPuffs[i];
            const c = pf.cloud;
            dummy.position.set(c.x + pf.ox, c.y + pf.oy, c.z + pf.oz);
            dummy.scale.set(pf.sx, pf.sy, pf.sz);
            dummy.updateMatrix();
            this.cloudInstancedMesh.setMatrixAt(i, dummy.matrix);
        }
        this.cloudInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    toggleClouds() {
        this.cloudsVisible = !this.cloudsVisible;
        if (this.cloudInstancedMesh) {
            this.cloudInstancedMesh.visible = this.cloudsVisible && this.graphicsQuality !== "smooth";
        }
        return this.cloudsVisible;
    }

    toggleGraphicsQuality() {
        const nextMode = this.graphicsQuality === "smooth" ? "pretty" : "smooth";
        return this.setGraphicsQuality(nextMode);
    }

    setGraphicsQuality(mode) {
        const isSmooth = mode === "smooth";
        this.graphicsQuality = isSmooth ? "smooth" : "pretty";

        // 1. PixelRatio (1 in smooth mode, <=1.5 PC / <=1.25 mobile in pretty mode)
        if (this.renderer) {
            this.renderer.setPixelRatio(this.getOptimalPixelRatio());
            this.renderer.shadowMap.enabled = !isSmooth;
            if (this.renderer.shadowMap) {
                this.renderer.shadowMap.needsUpdate = true;
            }
        }
        if (this.sunLight) {
            this.sunLight.castShadow = !isSmooth;
        }

        // 2. Clouds visibility
        if (this.cloudInstancedMesh) {
            this.cloudInstancedMesh.visible = !isSmooth && this.cloudsVisible;
        }

        // 3. Wildlife (birds, fish, dolphins, sampans, foam) & Lobby Sunset Wave Density
        this.applyMinimalistMode();
        if (this.lobbyScene && typeof this.buildLobbyWaveMesh === "function") {
            this.buildLobbyWaveMesh(isSmooth);
        }
        return this.graphicsQuality;
    }

    toggleMinimalistMode() {
        this.minimalistMode = !this.minimalistMode;
        this.applyMinimalistMode();
        return this.minimalistMode;
    }

    applyMinimalistMode() {
        const showExtra = !this.minimalistMode && this.graphicsQuality !== "smooth";

        // 1. Toggle ambient wildlife & outer scenery (birds, fish, dolphins, sampans, lighthouses, oil rigs)
        if (this.sceneryGroup) {
            this.sceneryGroup.visible = showExtra;
        }
        if (this.foamRings) {
            this.foamRings.forEach(f => {
                if (f.mesh) f.mesh.visible = showExtra;
            });
        }

        // 2. Toggle ship light pillars & lanterns in minimalist/smooth mode (while keeping ship, hull ring & local arrow visible)
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

    setMenuOrbitMode(enabled) {
        this.menuOrbitMode = Boolean(enabled);
        if (this.controls) {
            this.controls.enabled = !this.menuOrbitMode;
        }
        const labelsLayer = document.getElementById("map-labels-layer");
        if (labelsLayer) {
            labelsLayer.classList.toggle("hidden", this.menuOrbitMode);
        }
        if (this.menuOrbitMode && !this.lobbyScene && typeof this.initLobbySunsetScene === "function") {
            this.initLobbySunsetScene();
        }
    }

    // ========================================================================
    // GOLDEN SUNSET LOW-POLY 3D LOBBY DIORAMA (SHARED SINGLE WebGLRenderer)
    // ========================================================================
    getLobbyWaveY(x, z, t) {
        return (
            Math.sin(x * 0.15 + t * 1.25) * 0.40 +
            Math.cos(z * 0.18 - t * 1.02) * 0.34 +
            Math.sin((x * 0.8 - z * 0.6) * 0.13 + t * 0.90) * 0.22 +
            Math.cos((x + z) * 0.24 - t * 1.48) * 0.10
        );
    }

    createLobbyGlowTexture(innerRgba, midRgba) {
        if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
        const canvas = document.createElement("canvas");
        if (!canvas || typeof canvas.getContext !== "function") return null;
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
        grad.addColorStop(0, innerRgba);
        grad.addColorStop(0.4, midRgba);
        grad.addColorStop(1, "rgba(255, 210, 110, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(canvas);
    }

    buildLobbyWaveMesh(isSmooth = false) {
        if (!this.lobbyScene) return;
        if (this.lobbyWaveMesh && this.lobbyWaveSmooth === Boolean(isSmooth)) return;
        if (this.lobbyWaveMesh) {
            this.lobbyScene.remove(this.lobbyWaveMesh);
            if (this.lobbyWaveMesh.geometry && this.lobbyWaveMesh.geometry.dispose) {
                this.lobbyWaveMesh.geometry.dispose();
            }
        }
        this.lobbyWaveSmooth = Boolean(isSmooth);
        const segX = isSmooth ? 24 : 48;
        const segZ = isSmooth ? 18 : 36;
        const geo = new THREE.PlaneGeometry(184, 134, segX, segZ);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes && geo.attributes.position;
        if (pos && pos.count) {
            const count = pos.count;
            this.lobbyWaveBaseXZ = new Float32Array(count * 2);
            const colors = new Float32Array(count * 3);
            // Deep matte ocean teal #114f60 -> Warm amber-gold sunset sheen #dfb056
            const r0 = 0x11 / 255, g0 = 0x4f / 255, b0 = 0x60 / 255;
            const r1 = 0xdf / 255, g1 = 0xb0 / 255, b1 = 0x56 / 255;

            for (let i = 0; i < count; i++) {
                const vx = pos.getX(i);
                const vz = pos.getZ(i);
                this.lobbyWaveBaseXZ[i * 2] = vx;
                this.lobbyWaveBaseXZ[i * 2 + 1] = vz;
                // Soft golden sunset reflection path shimmering toward horizon
                const distFromSunPath = Math.abs(vx - 1.8 - vz * 0.05);
                const sunFactor = Math.max(0, 1 - distFromSunPath / 18) * (vz < 16 ? 0.54 : 0.24);
                colors[i * 3] = r0 + (r1 - r0) * sunFactor;
                colors[i * 3 + 1] = g0 + (g1 - g0) * sunFactor;
                colors[i * 3 + 2] = b0 + (b1 - b0) * sunFactor;
            }
            if (typeof THREE.BufferAttribute === "function") {
                geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
            }
        }

        const mat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            vertexColors: true,
            flatShading: true
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 0, -24);
        this.lobbyScene.add(mesh);
        this.lobbyWaveMesh = mesh;
    }

    initLobbySunsetScene() {
        try {
            if (typeof THREE === "undefined" || !THREE.Scene || !THREE.PerspectiveCamera) return;
            const w = (this.container && this.container.clientWidth) || (typeof window !== "undefined" ? window.innerWidth : 1280);
            const h = (this.container && this.container.clientHeight) || (typeof window !== "undefined" ? window.innerHeight : 720);

            this.lobbyScene = new THREE.Scene();
            this.lobbyScene.background = new THREE.Color(0x162e42);
            if (typeof THREE.FogExp2 === "function") {
                this.lobbyScene.fog = new THREE.FogExp2(0xa37c46, 0.0086);
            }

            this.lobbyCamera = new THREE.PerspectiveCamera(46, w / Math.max(1, h), 0.5, 420);
            this.lobbyCamera.position.set(0, 7.6, 30.5);
            if (typeof this.lobbyCamera.lookAt === "function") {
                this.lobbyCamera.lookAt(0.5, 4.4, -22);
            }

            // 1. Sunset Sky Dome (Deep Navy #0e2236 -> Antique Gold #d9a441 -> Warm Horizon #f4c86a)
            let skyTex = null;
            if (typeof document !== "undefined" && typeof document.createElement === "function") {
                const skyCanvas = document.createElement("canvas");
                if (skyCanvas && typeof skyCanvas.getContext === "function") {
                    skyCanvas.width = 64;
                    skyCanvas.height = 512;
                    const sctx = skyCanvas.getContext("2d");
                    if (sctx) {
                        const g = sctx.createLinearGradient(0, 0, 0, 512);
                        g.addColorStop(0.00, "#0b1c2d");
                        g.addColorStop(0.28, "#142b3b");
                        g.addColorStop(0.46, "#454c52");
                        g.addColorStop(0.56, "#b98a3b");
                        g.addColorStop(0.64, "#e8b959");
                        g.addColorStop(0.72, "#f4c86a");
                        g.addColorStop(1.00, "#145e6e");
                        sctx.fillStyle = g;
                        sctx.fillRect(0, 0, 64, 512);
                        skyTex = new THREE.CanvasTexture(skyCanvas);
                    }
                }
            }
            const skyDome = new THREE.Mesh(
                new THREE.SphereGeometry(210, 20, 12),
                new THREE.MeshBasicMaterial({
                    map: skyTex || undefined,
                    color: skyTex ? 0xffffff : 0x1e3c52,
                    side: THREE.BackSide,
                    fog: false,
                    depthWrite: false
                })
            );
            this.lobbyScene.add(skyDome);

            // Glowing Sunset Sun Disk + Soft Halo (low slightly right of center)
            const sunDisk = new THREE.Mesh(
                new THREE.CircleGeometry(9.5, 24),
                new THREE.MeshBasicMaterial({ color: 0xffe49e, fog: false, depthWrite: false })
            );
            sunDisk.position.set(4.5, 11.5, -135);
            this.lobbyScene.add(sunDisk);

            const sunGlowTex = this.createLobbyGlowTexture("rgba(255, 236, 168, 0.92)", "rgba(244, 192, 92, 0.42)");
            if (sunGlowTex && typeof THREE.Sprite === "function") {
                const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: sunGlowTex,
                    color: 0xffd97d,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    fog: false
                }));
                sunGlow.position.set(4.5, 11.5, -134);
                sunGlow.scale.set(56, 56, 1);
                this.lobbyScene.add(sunGlow);
            }

            // 2. Golden Sunset Lights (Zero PointLight!)
            const hemi = new THREE.HemisphereLight(0x285678, 0xd9a441, 1.05);
            this.lobbyScene.add(hemi);

            const sunDir = new THREE.DirectionalLight(0xffcf70, 1.48);
            sunDir.position.set(10, 16, -68);
            this.lobbyScene.add(sunDir);

            const fillDir = new THREE.DirectionalLight(0x5293a8, 0.36);
            fillDir.position.set(-28, 18, 28);
            this.lobbyScene.add(fillDir);

            // 3. Animated Faceted Low-Poly Waves
            this.buildLobbyWaveMesh(this.graphicsQuality === "smooth");

            // Shared Matte Natural Flat-Shaded Low-Poly Materials (Low emissive 0.03-0.06 — Zero Plastic Sheen!)
            const flatMat = (hex, extra = {}) => new THREE.MeshLambertMaterial({
                color: hex,
                emissive: hex,
                emissiveIntensity: 0.04,
                flatShading: true,
                ...extra
            });
            const rockMat = flatMat(0x58656b);
            const rockDarkMat = flatMat(0x414d54);
            const rockWarmMat = flatMat(0x6b675e);
            const mossMat = flatMat(0x3a6f31);
            const hillMat = flatMat(0x3f7330);
            const hillDarkMat = flatMat(0x2a5324);
            const cliffBrownMat = flatMat(0x5c4734);
            const terraceMats = [flatMat(0x4b7f30), flatMat(0x638d34), flatMat(0x829b38), flatMat(0xa6a540), flatMat(0xc4a448)];
            const redWoodMat = flatMat(0x8c2322);
            const roofRedMat = flatMat(0xa42b28);
            const goldTrimMat = flatMat(0xd4a23e, { emissiveIntensity: 0.08 });
            const lhWhiteMat = flatMat(0xe8dec8);
            const lhRedMat = flatMat(0xb33328);

            // 4A. Left & Background Ha Long Karst Limestone Islands (Sculpted Multi-Crag Clusters — No Single Cylinders!)
            const karstSpecs = [
                { x: -34, z: -18, r: 5.2, h: 12.2, rot: 0.4 },
                { x: -24, z: -26, r: 3.8, h: 8.0, rot: 1.2 },
                { x: -17, z: -34, r: 5.0, h: 13.6, rot: 2.1 },
                { x: -21.5, z: -40, r: 3.0, h: 6.6, rot: 0.9 },
                { x: -7.5, z: -42, r: 3.4, h: 9.2, rot: 1.7 },
                { x: -39, z: -34, r: 5.8, h: 10.8, rot: 2.8 }
            ];
            karstSpecs.forEach((ks, idx) => {
                const g = new THREE.Group();
                // Multi-tiered jagged karst base & spires
                const baseCrag = new THREE.Mesh(new THREE.DodecahedronGeometry(ks.r * 0.95, 0), rockDarkMat);
                baseCrag.scale.set(1.22, 0.56, 1.05);
                baseCrag.position.y = ks.r * 0.28;
                g.add(baseCrag);

                const mainPeak = new THREE.Mesh(
                    new THREE.ConeGeometry(ks.r * 0.78, ks.h, 6),
                    idx % 2 === 0 ? rockMat : rockWarmMat
                );
                mainPeak.scale.set(0.95, 1.0, 0.82);
                mainPeak.position.set(0, ks.h * 0.48, 0);
                mainPeak.rotation.y = ks.rot;
                g.add(mainPeak);

                const sidePeak1 = new THREE.Mesh(new THREE.ConeGeometry(ks.r * 0.54, ks.h * 0.68, 5), rockDarkMat);
                sidePeak1.position.set(ks.r * 0.54, ks.h * 0.30, 0.45);
                sidePeak1.rotation.y = ks.rot + 0.8;
                g.add(sidePeak1);

                const sidePeak2 = new THREE.Mesh(new THREE.DodecahedronGeometry(ks.r * 0.46, 0), rockMat);
                sidePeak2.scale.set(1.0, 1.35, 0.9);
                sidePeak2.position.set(-ks.r * 0.48, ks.h * 0.36, -0.35);
                g.add(sidePeak2);

                // Layered moss-green foliage tufts clinging to karst ledges
                const cap1 = new THREE.Mesh(new THREE.DodecahedronGeometry(ks.r * 0.56, 0), mossMat);
                cap1.scale.set(1.12, 0.48, 0.95);
                cap1.position.set(0, ks.h * 0.84, 0);
                const cap2 = new THREE.Mesh(new THREE.DodecahedronGeometry(ks.r * 0.36, 0), hillMat);
                cap2.scale.set(1.1, 0.45, 0.9);
                cap2.position.set(ks.r * 0.50, ks.h * 0.58, 0.42);
                g.add(cap1, cap2);

                g.position.set(ks.x, -0.5, ks.z);
                this.lobbyScene.add(g);
            });

            // Distant misty mountain range along far horizon
            const farHills = [
                { x: -12, z: -64, r: 14, h: 8.5 },
                { x: 3.5, z: -66, r: 13, h: 7.2 },
                { x: 20, z: -58, r: 16, h: 11.5 }
            ];
            farHills.forEach((fh) => {
                const m = new THREE.Mesh(new THREE.ConeGeometry(fh.r, fh.h, 6), hillDarkMat);
                m.position.set(fh.x, fh.h * 0.36 - 0.6, fh.z);
                this.lobbyScene.add(m);
            });

            // 4B. Right Coastal Peninsula + Stepped Rice Terraces + Khue Van Cac Pavilion
            const rightCoast = new THREE.Group();
            const cliffBase = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 16.5, 5.2, 8), cliffBrownMat);
            cliffBase.position.set(27, 1.4, -14);
            rightCoast.add(cliffBase);

            const grassPlateau = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.8, 1.2, 8), hillMat);
            grassPlateau.position.set(27, 4.1, -14);
            rightCoast.add(grassPlateau);

            // Tall terraced hills behind the peninsula
            const bigHill1 = new THREE.Mesh(new THREE.ConeGeometry(13.5, 14.5, 7), hillMat);
            bigHill1.position.set(35, 9.5, -26);
            rightCoast.add(bigHill1);

            const bigHill2 = new THREE.Mesh(new THREE.ConeGeometry(10.5, 11.2, 6), hillDarkMat);
            bigHill2.position.set(24, 8.2, -31);
            rightCoast.add(bigHill2);

            // 5-Step Low-Poly Rice Terraces (Green -> Straw Gold)
            for (let t = 0; t < 5; t++) {
                const terr = new THREE.Mesh(
                    new THREE.BoxGeometry(11.5 - t * 1.4, 0.72, 6.2 - t * 0.75),
                    terraceMats[t % terraceMats.length]
                );
                terr.position.set(33.5 + t * 0.35, 4.7 + t * 0.72, -16.5 - t * 0.9);
                terr.rotation.y = -0.22;
                rightCoast.add(terr);
            }

            // Crimson Khue Van Cac Miniature Pavilion on Right Bluff
            const pavilion = new THREE.Group();
            const pavPlinth = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.6, 4.4), rockMat);
            pavPlinth.position.y = 0.3;
            pavilion.add(pavPlinth);
            [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]].forEach(([px, pz]) => {
                const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.5, 0.42), redWoodMat);
                pillar.position.set(px, 1.8, pz);
                pavilion.add(pillar);
            });
            const pavUpper = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.45, 3.4), redWoodMat);
            pavUpper.position.y = 3.55;
            pavilion.add(pavUpper);
            const roof1 = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.25, 4), roofRedMat);
            roof1.rotation.y = Math.PI / 4;
            roof1.position.y = 3.1;
            pavilion.add(roof1);
            const roof2 = new THREE.Mesh(new THREE.ConeGeometry(2.85, 1.45, 4), roofRedMat);
            roof2.rotation.y = Math.PI / 4;
            roof2.position.y = 4.75;
            pavilion.add(roof2);
            const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), goldTrimMat);
            finial.position.y = 5.65;
            pavilion.add(finial);
            pavilion.position.set(22.5, 4.65, -15.5);
            pavilion.rotation.y = -0.35;
            rightCoast.add(pavilion);

            // Low-Poly Trees along the green bluff
            [[18.2, 4.7, -14.2], [19.8, 4.7, -17.5], [25.6, 4.7, -12.8], [27.2, 4.7, -16.8], [16.5, 4.7, -19.2]].forEach(([tx, ty, tz], i) => {
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.1, 5), cliffBrownMat);
                trunk.position.set(tx, ty + 0.55, tz);
                const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85 + (i % 2) * 0.22, 0), i % 2 === 0 ? mossMat : hillMat);
                crown.position.set(tx, ty + 1.45, tz);
                rightCoast.add(trunk, crown);
            });
            this.lobbyScene.add(rightCoast);

            // 4C. Iconic Red-and-White Striped Low-Poly Lighthouse + 360° Rotating Golden Beam
            const lhGroup = new THREE.Group();
            const lhBluff = new THREE.Mesh(new THREE.ConeGeometry(7.2, 5.4, 7), hillMat);
            lhBluff.position.y = 2.1;
            lhGroup.add(lhBluff);

            const stripeHeights = [1.3, 1.25, 1.2, 1.15, 1.1];
            let curY = 4.55;
            for (let s = 0; s < stripeHeights.length; s++) {
                const rBot = 1.38 - s * 0.13;
                const rTop = 1.25 - s * 0.13;
                const band = new THREE.Mesh(
                    new THREE.CylinderGeometry(rTop, rBot, stripeHeights[s], 8),
                    s % 2 === 0 ? lhRedMat : lhWhiteMat
                );
                band.position.y = curY + stripeHeights[s] * 0.5;
                lhGroup.add(band);
                curY += stripeHeights[s];
            }
            const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.92, 0.28, 8), rockDarkMat);
            gallery.position.y = curY + 0.14;
            lhGroup.add(gallery);

            const lanternGlowMat = new THREE.MeshLambertMaterial({
                color: 0xfff7c2,
                emissive: 0xfef08a,
                emissiveIntensity: 1.0,
                flatShading: true
            });
            const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 1.05, 8), lanternGlowMat);
            lantern.position.y = curY + 0.78;
            lhGroup.add(lantern);

            const lhCap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.05, 8), lhRedMat);
            lhCap.position.y = curY + 1.78;
            lhGroup.add(lhCap);

            // Soft radial golden halo sprite on lighthouse lamp (Zero PointLight!)
            const lhGlowTex = this.createLobbyGlowTexture("rgba(255, 245, 185, 0.95)", "rgba(254, 224, 102, 0.45)");
            if (lhGlowTex && typeof THREE.Sprite === "function") {
                const lhSprite = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: lhGlowTex,
                    color: 0xfef08a,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                }));
                lhSprite.position.set(0, curY + 0.8, 0);
                lhSprite.scale.set(7.8, 7.8, 1);
                lhGroup.add(lhSprite);
            }

            // 360° Rotating Soft Translucent Golden Light Beam (ConeGeometry, opacity 0.115, depthWrite: false)
            this.lobbyBeaconPivot = new THREE.Group();
            this.lobbyBeaconPivot.position.set(0, curY + 0.78, 0);
            const beamGeo = new THREE.ConeGeometry(4.0, 34, 14, 1, true);
            beamGeo.translate(0, -17, 0);
            beamGeo.rotateZ(-Math.PI / 2);
            const beamMat = new THREE.MeshBasicMaterial({
                color: 0xfef08a,
                transparent: true,
                opacity: 0.115,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const beam1 = new THREE.Mesh(beamGeo, beamMat);
            const beam2 = new THREE.Mesh(beamGeo, beamMat);
            beam2.rotation.y = Math.PI;
            this.lobbyBeaconPivot.add(beam1, beam2);
            lhGroup.add(this.lobbyBeaconPivot);

            lhGroup.position.set(8.2, -0.35, -24.5);
            this.lobbyScene.add(lhGroup);

            // 5. 5 Distinct Sailing Ships Cruising STRICTLY Along Bow Direction (+X = Math.atan2(-vz, vx))
            this.lobbyShips = [];
            const wakeGeo = new THREE.RingGeometry(0.45, 0.85, 12);
            wakeGeo.rotateX(-Math.PI / 2);
            const wakeMat = new THREE.MeshBasicMaterial({
                color: 0xf1f5f9,
                transparent: true,
                opacity: 0.36,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            // 2 Hero ships closer in foreground + 3 mid/far ships cruising naturally across the bay
            const shipLanes = [
                { arch: 0, x: -9.5, z: 12.8, vx: 2.25, vz: -0.22, scale: 1.85 },  // Foreground Hero: Dragon Junk (L -> R)
                { arch: 1, x: 13.0, z: 7.4,  vx: -2.35, vz: -0.18, scale: 1.72 }, // Foreground Hero: Emerald Catamaran (R -> L)
                { arch: 2, x: -16.0, z: 0.2, vx: 2.05, vz: 0.16, scale: 1.48 },   // Midground: Ocean Clipper (L -> R)
                { arch: 3, x: 4.5,  z: -6.8, vx: -1.75, vz: -0.12, scale: 1.32 }, // Mid-Far: Golden Galley (R -> L)
                { arch: 4, x: -20.0, z: -14.2, vx: 1.55, vz: 0.10, scale: 1.15 }  // Far Bay: Imperial Bark (L -> R)
            ];
            if (typeof ProceduralModels !== "undefined" && typeof ProceduralModels.createPlayerShip === "function") {
                shipLanes.forEach((lane, i) => {
                    const ship = ProceduralModels.createPlayerShip(lane.arch, "", false);
                    if (ship.userData) {
                        ["ring", "innerDisc", "beaconPillar", "localRadarRing", "myArrowMarker"].forEach(k => {
                            if (ship.userData[k]) ship.userData[k].visible = false;
                        });
                    }
                    // Dial down emissiveIntensity to matte natural 0.04-0.08 so hulls & sails never look plastic!
                    if (typeof ship.traverse === "function") {
                        ship.traverse((child) => {
                            if (child && child.isMesh && child.material && typeof child.material.emissiveIntensity === "number") {
                                child.material.emissiveIntensity = Math.min(child.material.emissiveIntensity, 0.06);
                            }
                        });
                    }
                    const speed = Math.hypot(lane.vx, lane.vz) || 1;
                    const nx = lane.vx / speed;
                    const nz = lane.vz / speed;
                    const headingYaw = Math.atan2(-lane.vz, lane.vx);

                    ship.scale.setScalar(lane.scale);
                    ship.position.set(lane.x, 0.2, lane.z);
                    ship.rotation.y = headingYaw;
                    this.lobbyScene.add(ship);

                    // Subtle white foam wake rings trailing strictly behind the stern (-nx, -nz)
                    const wakes = [];
                    for (let wIdx = 0; wIdx < 2; wIdx++) {
                        const wk = new THREE.Mesh(wakeGeo, wakeMat.clone());
                        wk.position.set(lane.x - nx * (2.2 + wIdx * 1.9), 0.16, lane.z - nz * (2.2 + wIdx * 1.9));
                        this.lobbyScene.add(wk);
                        wakes.push({ mesh: wk, phase: wIdx * 0.5 + i * 0.17 });
                    }
                    this.lobbyShips.push({
                        mesh: ship,
                        lane,
                        baseZ: lane.z,
                        nx,
                        nz,
                        baseYaw: headingYaw,
                        wakes,
                        phase: i * 1.35
                    });
                });
            }

            // 6. 8 Drifting Low-Poly Sunset Clouds
            this.lobbyClouds = [];
            const cloudMat = flatMat(0xf5dfbe);
            const cloudSpecs = [
                { x: -34, y: 22.5, z: -26, s: 2.3, spd: 0.55 },
                { x: -16, y: 21.0, z: -38, s: 1.6, spd: 0.42 },
                { x: -24, y: 15.2, z: -48, s: 1.4, spd: 0.35 },
                { x: 12, y: 23.8, z: -32, s: 2.1, spd: 0.50 },
                { x: 32, y: 22.0, z: -24, s: 2.5, spd: 0.58 },
                { x: 8, y: 16.5, z: -42, s: 1.8, spd: 0.38 },
                { x: 36, y: 16.2, z: -36, s: 1.5, spd: 0.44 },
                { x: -42, y: 18.0, z: -32, s: 1.9, spd: 0.48 }
            ];
            cloudSpecs.forEach((cs) => {
                const cg = new THREE.Group();
                const p1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7, 0), cloudMat);
                p1.scale.set(2.1, 0.72, 1.0);
                const p2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), cloudMat);
                p2.position.set(1.7, -0.15, 0.15);
                p2.scale.set(1.6, 0.62, 0.9);
                const p3 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), cloudMat);
                p3.position.set(-1.6, -0.2, -0.1);
                p3.scale.set(1.5, 0.58, 0.85);
                cg.add(p1, p2, p3);
                cg.scale.setScalar(cs.s);
                cg.position.set(cs.x, cs.y, cs.z);
                this.lobbyScene.add(cg);
                this.lobbyClouds.push({ mesh: cg, speed: cs.spd });
            });

            // 7. 6 Low-Poly Flapping Seagulls Circling Lighthouse & Karst Islands
            this.lobbyGulls = [];
            const gullMat = new THREE.MeshBasicMaterial({ color: 0xfff8ea, side: THREE.DoubleSide });
            const wingGeo = new THREE.BoxGeometry(0.68, 0.04, 0.22);
            wingGeo.translate(0.34, 0, 0);
            const gullSpecs = [
                { cx: 11, cy: 14.5, cz: -25, r: 7.5, spd: 0.55, ph: 0.0 },
                { cx: 13, cy: 15.8, cz: -27, r: 9.2, spd: 0.48, ph: 1.5 },
                { cx: 9, cy: 13.8, cz: -23, r: 6.4, spd: 0.62, ph: 3.1 },
                { cx: -20, cy: 14.8, cz: -28, r: 8.0, spd: 0.50, ph: 0.9 },
                { cx: -23, cy: 16.0, cz: -31, r: 9.5, spd: 0.45, ph: 2.4 },
                { cx: -16, cy: 13.5, cz: -33, r: 7.2, spd: 0.58, ph: 4.2 }
            ];
            gullSpecs.forEach((gs) => {
                const gg = new THREE.Group();
                const leftW = new THREE.Mesh(wingGeo, gullMat);
                const rightW = new THREE.Mesh(wingGeo, gullMat);
                rightW.scale.x = -1;
                gg.add(leftW, rightW);
                this.lobbyScene.add(gg);
                this.lobbyGulls.push({ group: gg, leftW, rightW, ...gs });
            });
        } catch (err) {
            this.lobbyScene = null;
            this.lobbyCamera = null;
        }
    }

    updateLobbySunsetScene(elapsed, delta) {
        if (!this.lobbyScene || !this.lobbyCamera) return;

        // 1. Animate Faceted Low-Poly Ocean Waves
        if (this.lobbyWaveMesh && this.lobbyWaveBaseXZ) {
            const shouldStepWaves = !this.lobbyWaveSmooth || (this._frameCount % 2 === 0);
            if (shouldStepWaves) {
                const geo = this.lobbyWaveMesh.geometry;
                const pos = geo && geo.attributes && geo.attributes.position;
                if (pos) {
                    const base = this.lobbyWaveBaseXZ;
                    const count = pos.count;
                    for (let i = 0; i < count; i++) {
                        const vx = base[i * 2];
                        const vz = base[i * 2 + 1];
                        pos.setY(i, this.getLobbyWaveY(vx, vz, elapsed));
                    }
                    pos.needsUpdate = true;
                    geo.computeVertexNormals();
                }
            }
        }

        // 2. Rotate Lighthouse 360° Soft Golden Light Beam Gently
        if (this.lobbyBeaconPivot) {
            this.lobbyBeaconPivot.rotation.y += delta * 0.36;
        }

        // 3. Cruise 5 Sailing Ships Strictly Along Bow (+X = atan2(-vz, vx)) + Wave Pitch/Roll + Wakes
        for (let i = 0; i < this.lobbyShips.length; i++) {
            const s = this.lobbyShips[i];
            const mesh = s.mesh;
            const lane = s.lane;
            mesh.position.x += lane.vx * delta;
            mesh.position.z += lane.vz * delta;

            if (lane.vx > 0 && mesh.position.x > 46) {
                mesh.position.x = -46;
                mesh.position.z = s.baseZ;
            } else if (lane.vx < 0 && mesh.position.x < -46) {
                mesh.position.x = 46;
                mesh.position.z = s.baseZ;
            }

            const wx = mesh.position.x;
            const wz = mesh.position.z - (-24);
            const waveY = this.getLobbyWaveY(wx, wz, elapsed);
            const waveAhead = this.getLobbyWaveY(wx + s.nx * 1.6, wz + s.nz * 1.6, elapsed);
            const waveRight = this.getLobbyWaveY(wx - s.nz * 1.2, wz + s.nx * 1.2, elapsed);

            mesh.position.y = waveY + 0.14;
            mesh.rotation.y = s.baseYaw + Math.sin(elapsed * 0.85 + s.phase) * 0.028;
            // Pitch bow (+X) up/down with forward slope, roll gently side-to-side
            mesh.rotation.z = (waveAhead - waveY) * 0.22;
            mesh.rotation.x = (waveRight - waveY) * -0.18;

            if (mesh.userData) {
                if (mesh.userData.flag) {
                    mesh.userData.flag.rotation.y = Math.sin(elapsed * 5.2 + s.phase) * 0.28;
                }
                if (mesh.userData.mainSail) {
                    mesh.userData.mainSail.scale.z = 1 + Math.sin(elapsed * 2.4 + s.phase) * 0.05;
                }
                if (mesh.userData.foreSail) {
                    mesh.userData.foreSail.scale.z = 1 + Math.cos(elapsed * 2.6 + s.phase) * 0.04;
                }
            }

            // Update trailing white foam wakes strictly behind the stern (-nx, -nz)
            for (let w = 0; w < s.wakes.length; w++) {
                const wk = s.wakes[w];
                const prog = (elapsed * 0.65 + wk.phase) % 1;
                const distBehind = (1.5 + prog * 3.4) * (lane.scale / 1.48);
                wk.mesh.position.set(
                    wx - s.nx * distBehind,
                    waveY + 0.12,
                    mesh.position.z - s.nz * distBehind
                );
                const sc = (0.72 + prog * 1.32) * (lane.scale / 1.48);
                wk.mesh.scale.set(sc, sc, sc);
                if (wk.mesh.material) wk.mesh.material.opacity = (1 - prog) * 0.36;
            }
        }

        // 4. Drift Low-Poly Sunset Clouds
        for (let i = 0; i < this.lobbyClouds.length; i++) {
            const c = this.lobbyClouds[i];
            c.mesh.position.x += c.speed * delta;
            if (c.mesh.position.x > 62) c.mesh.position.x = -62;
        }

        // 5. Flap & Circle Low-Poly Seagulls
        for (let i = 0; i < this.lobbyGulls.length; i++) {
            const g = this.lobbyGulls[i];
            const ang = elapsed * g.spd + g.ph;
            const gx = g.cx + Math.cos(ang) * g.r;
            const gz = g.cz + Math.sin(ang) * g.r * 0.62;
            const gy = g.cy + Math.sin(elapsed * 1.4 + g.ph) * 0.45;
            g.group.position.set(gx, gy, gz);
            g.group.rotation.y = -ang;
            const flap = Math.sin(elapsed * 7.8 + g.ph * 2) * 0.58;
            g.leftW.rotation.z = flap;
            g.rightW.rotation.z = -flap;
        }

        // 6. Smooth Cinematic Mouse Parallax (Gentle Lerp — Keeps 4 Corner UIs Clean)
        const lerpF = Math.min(1, delta * 3.2);
        this.lobbyParallaxX += (this.lobbyMouseX - this.lobbyParallaxX) * lerpF;
        this.lobbyParallaxY += (this.lobbyMouseY - this.lobbyParallaxY) * lerpF;

        const baseX = this.lobbyParallaxX * 2.4 + Math.sin(elapsed * 0.18) * 0.55;
        const baseY = 7.6 - this.lobbyParallaxY * 0.85 + Math.cos(elapsed * 0.22) * 0.18;
        this.lobbyCamera.position.set(baseX, baseY, 30.5);
        if (typeof this.lobbyCamera.lookAt === "function") {
            this.lobbyCamera.lookAt(0.5 + this.lobbyParallaxX * 0.5, 4.4 - this.lobbyParallaxY * 0.25, -22);
        }
    }

    clearMatchVisuals() {
        if (this.shipMeshes) {
            this.shipMeshes.forEach(mesh => this.scene && this.scene.remove(mesh));
            this.shipMeshes.clear();
        }
        if (typeof this.clearHtmlLabels === "function") {
            this.clearHtmlLabels("ship");
        }
        if (typeof this.clearPathPreview === "function") {
            this.clearPathPreview();
        }
        if (typeof this.clearReachableHexes === "function") {
            this.clearReachableHexes();
        }
        if (Array.isArray(this.hexTiles)) {
            this.hexTiles.forEach(t => {
                t.stormRestricted = false;
                t.resourceCooldown = 0;
                t.monumentLocked = false;
            });
            if (typeof this.updateResourceVisuals === "function") {
                this.updateResourceVisuals();
            }
        }
        if (typeof this.setWeatherMode === "function") {
            this.setWeatherMode("sunny");
        }
        this.cameraLockEnabled = false;
        this.cameraLockShipKey = null;
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

    updateSkyDomeGradient(topColor, midColor, botColor) {
        if (!this.skyDomeCtx || typeof this.skyDomeCtx.fillRect !== "function" || !this.skyDomeCanvas || !this.skyDomeTexture) return;
        const ctx = this.skyDomeCtx;
        const w = this.skyDomeCanvas.width;
        const h = this.skyDomeCanvas.height;
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        const toCss = (c, fallback) => {
            if (typeof c === "string") return c;
            if (c && typeof c.getStyle === "function") return c.getStyle();
            if (c && typeof c.getHexString === "function") return "#" + c.getHexString();
            return fallback;
        };
        const topStyle = toCss(topColor, "#2e86de");
        const midStyle = toCss(midColor, "#73b8ef");
        const botStyle = toCss(botColor, "#b8e9ff");
        // Sphere UV: y=0% is zenith (top), y=52% is exact horizon, 52%..100% solid horizon/sea match
        grad.addColorStop(0.0, topStyle);
        grad.addColorStop(0.30, midStyle);
        grad.addColorStop(0.52, botStyle);
        grad.addColorStop(1.0, botStyle);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        this.skyDomeTexture.needsUpdate = true;
    }

    setWeatherMode(mode, instant = false) {
        const validModes = new Set(["sunny", "tropical_rain", "thunderstorm", "sunset", "night", "super_typhoon_yagi"]);
        const validMode = validModes.has(mode) ? mode : "sunny";
        this.weatherMode = validMode;
        const presets = {
            sunny: {
                bg: 0x38bdf8, fog: 0xbae6fd,
                skyTop: 0x38bdf8, skyMid: 0x7dd3fc, skyBot: 0xe0f7ff,
                oceanCol: 0x0ea5c6, oceanEm: 0x0369a1, oceanEmInt: 0.25,
                hemiSky: 0xf0f9ff, hemiGround: 0x38bdf8, hemiInt: 0.95,
                sunCol: 0xfffcf0, sunInt: 1.45, sunPos: [62, 72, -72],
                sunObjPos: [105, 52, -155], sunObjScale: 1.0,
                sunCoreCol: 0xfffef0, sunGlowCol: 0xfef08a, sunCoreOp: 1.0, sunGlowOp: 0.85,
                cloudCol: 0xffffff, cloudOp: 0.85, waveAmp: 1.0, starsOp: 0.0, rainOp: 0.0
            },
            tropical_rain: {
                bg: 0x4a6572, fog: 0x8ca3b0,
                skyTop: 0x4a6572, skyMid: 0x748c98, skyBot: 0x9fb3be,
                oceanCol: 0x1e4e5f, oceanEm: 0x0d2530, oceanEmInt: 0.22,
                hemiSky: 0xcbd5e1, hemiGround: 0x1e293b, hemiInt: 0.75,
                sunCol: 0xe8f1f8, sunInt: 0.95, sunPos: [72, 76, 54],
                sunObjPos: null, sunObjScale: 1.0,
                sunCoreCol: 0xfffbeb, sunGlowCol: 0xfde68a, sunCoreOp: 0.0, sunGlowOp: 0.0,
                cloudCol: 0xcbd5e1, cloudOp: 0.85, waveAmp: 1.38, starsOp: 0.0, rainOp: 0.65
            },
            thunderstorm: {
                bg: 0x1b2a41, fog: 0x3b526b,
                skyTop: 0x1b2a41, skyMid: 0x324861, skyBot: 0x486581,
                oceanCol: 0x123447, oceanEm: 0x071a26, oceanEmInt: 0.22,
                hemiSky: 0x94a3b8, hemiGround: 0x0f172a, hemiInt: 0.72,
                sunCol: 0xdbeafe, sunInt: 0.92, sunPos: [70, 74, 52],
                sunObjPos: null, sunObjScale: 1.0,
                sunCoreCol: 0xfffbeb, sunGlowCol: 0xfde68a, sunCoreOp: 0.0, sunGlowOp: 0.0,
                cloudCol: 0x64748b, cloudOp: 0.90, waveAmp: 1.75, starsOp: 0.15, rainOp: 0.82
            },
            sunset: {
                bg: 0x4f5d95, fog: 0xfdba74,
                skyTop: 0x4f5d95, skyMid: 0xf97316, skyBot: 0xfde047,
                oceanCol: 0x1d5f7a, oceanEm: 0x9a3412, oceanEmInt: 0.30,
                hemiSky: 0xfed7aa, hemiGround: 0x475569, hemiInt: 0.88,
                sunCol: 0xffe8c8, sunInt: 1.38, sunPos: [-68, 34, -84],
                sunObjPos: [-110, 28, -150], sunObjScale: 1.5,
                sunCoreCol: 0xfef08a, sunGlowCol: 0xfb923c, sunCoreOp: 1.0, sunGlowOp: 0.92,
                cloudCol: 0xffedd5, cloudOp: 0.84, waveAmp: 1.05, starsOp: 0.32, rainOp: 0.0
            },
            night: {
                bg: 0x091428, fog: 0x16324f,
                skyTop: 0x091428, skyMid: 0x122843, skyBot: 0x1c3d5e,
                oceanCol: 0x0b2840, oceanEm: 0x051626, oceanEmInt: 0.22,
                hemiSky: 0x93c5fd, hemiGround: 0x0f172a, hemiInt: 0.72,
                sunCol: 0xe0f2fe, sunInt: 0.98, sunPos: [68, 76, 54],
                sunObjPos: null, sunObjScale: 1.0,
                sunCoreCol: 0xfffbeb, sunGlowCol: 0xfde68a, sunCoreOp: 0.0, sunGlowOp: 0.0,
                cloudCol: 0x3b5575, cloudOp: 0.55, waveAmp: 0.88, starsOp: 0.95, rainOp: 0.0
            },
            super_typhoon_yagi: {
                bg: 0x13262f, fog: 0x2b4c54,
                skyTop: 0x13262f, skyMid: 0x244149, skyBot: 0x355c63,
                oceanCol: 0x0c2c38, oceanEm: 0x061b24, oceanEmInt: 0.22,
                hemiSky: 0x94a3b8, hemiGround: 0x0f242c, hemiInt: 0.72,
                sunCol: 0xe2e8f0, sunInt: 0.95, sunPos: [72, 74, 54],
                sunObjPos: null, sunObjScale: 1.0,
                sunCoreCol: 0xfffbeb, sunGlowCol: 0xfde68a, sunCoreOp: 0.0, sunGlowOp: 0.0,
                cloudCol: 0x475569, cloudOp: 0.94, waveAmp: 2.15, starsOp: 0.08, rainOp: 0.92
            }
        };

        const p = presets[validMode] || presets.sunny;
        if (this.scene && this.scene.fog) {
            this.scene.fog.near = 280;
            this.scene.fog.far = 680;
        }
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        if (validMode === "thunderstorm" || validMode === "super_typhoon_yagi") {
            this._nextLightningAt = now + 2800 + Math.random() * 4200;
        } else {
            this._nextLightningAt = 0;
            this._lightningEndAt = 0;
        }

        // Apply immediately on first init or when instant=true; otherwise smooth 2s lerp in render loop
        if (instant || !this._weatherInitialized) {
            this._weatherInitialized = true;
            this._weatherLerpElapsed = this._weatherLerpDuration;
            this.scene.background.setHex(p.bg);
            this.scene.fog.color.setHex(p.fog);
            this._curSkyTop.setHex(p.skyTop);
            this._curSkyMid.setHex(p.skyMid);
            this._curSkyBot.setHex(p.skyBot);
            this.updateSkyDomeGradient(this._curSkyTop, this._curSkyMid, this._curSkyBot);
            if (this.oceanMesh && this.oceanMesh.material) {
                this.oceanMesh.material.color.setHex(p.oceanCol);
                if (this.oceanMesh.material.emissive) this.oceanMesh.material.emissive.setHex(p.oceanEm);
                this.oceanMesh.material.emissiveIntensity = p.oceanEmInt;
            }
            this.hemiLight.color.setHex(p.hemiSky);
            this.hemiLight.groundColor.setHex(p.hemiGround);
            this.hemiLight.intensity = p.hemiInt;
            this.sunLight.color.setHex(p.sunCol);
            this.sunLight.intensity = p.sunInt;
            this._baseSunIntensity = p.sunInt;
            this.sunLight.position.set(...p.sunPos);
            if (this.sunGroup && this.sunCoreMat && this.sunGlowMat) {
                if (p.sunObjPos) this.sunGroup.position.set(...p.sunObjPos);
                this.sunGroup.scale.setScalar(p.sunObjScale);
                this.sunCoreMat.color.setHex(p.sunCoreCol);
                this.sunCoreMat.opacity = p.sunCoreOp;
                this.sunGlowMat.color.setHex(p.sunGlowCol);
                this.sunGlowMat.opacity = p.sunGlowOp;
                this.sunGroup.visible = (p.sunCoreOp > 0.01 || p.sunGlowOp > 0.01);
            }
            this.cloudMaterial.color.setHex(p.cloudCol);
            this.cloudMaterial.opacity = p.cloudOp;
            this.starField.material.opacity = p.starsOp;
            if (this.rainField) this.rainField.material.opacity = p.rainOp || 0.0;
            this.waveMultiplier = p.waveAmp;
            return;
        }

        // Snapshot current live state into _weatherFrom
        const f = this._weatherFrom;
        f.bg.copy(this.scene.background);
        f.fog.copy(this.scene.fog.color);
        f.skyTop.copy(this._curSkyTop);
        f.skyMid.copy(this._curSkyMid);
        f.skyBot.copy(this._curSkyBot);
        if (this.oceanMesh && this.oceanMesh.material) {
            f.oceanCol.copy(this.oceanMesh.material.color);
            if (this.oceanMesh.material.emissive) f.oceanEm.copy(this.oceanMesh.material.emissive);
            f.oceanEmInt = this.oceanMesh.material.emissiveIntensity || 0.22;
        }
        f.hemiSky.copy(this.hemiLight.color);
        f.hemiGround.copy(this.hemiLight.groundColor);
        f.hemiInt = this.hemiLight.intensity;
        f.sunCol.copy(this.sunLight.color);
        f.sunInt = this._baseSunIntensity !== undefined ? this._baseSunIntensity : this.sunLight.intensity;
        f.sunPos.copy(this.sunLight.position);
        if (this.sunGroup && this.sunCoreMat && this.sunGlowMat) {
            f.sunObjPos.copy(this.sunGroup.position);
            f.sunObjScale = this.sunGroup.scale.x || 1.0;
            f.sunCoreCol.copy(this.sunCoreMat.color);
            f.sunGlowCol.copy(this.sunGlowMat.color);
            f.sunCoreOp = this.sunCoreMat.opacity;
            f.sunGlowOp = this.sunGlowMat.opacity;
        }
        f.cloudCol.copy(this.cloudMaterial.color);
        f.cloudOp = this.cloudMaterial.opacity;
        f.starsOp = this.starField.material.opacity;
        f.rainOp = this.rainField ? this.rainField.material.opacity : 0.0;
        f.waveAmp = this.waveMultiplier || 1.0;

        // Populate _weatherTo target state
        const t = this._weatherTo;
        t.bg.setHex(p.bg);
        t.fog.setHex(p.fog);
        t.skyTop.setHex(p.skyTop);
        t.skyMid.setHex(p.skyMid);
        t.skyBot.setHex(p.skyBot);
        t.oceanCol.setHex(p.oceanCol);
        t.oceanEm.setHex(p.oceanEm);
        t.oceanEmInt = p.oceanEmInt;
        t.hemiSky.setHex(p.hemiSky);
        t.hemiGround.setHex(p.hemiGround);
        t.hemiInt = p.hemiInt;
        t.sunCol.setHex(p.sunCol);
        t.sunInt = p.sunInt;
        t.sunPos.set(...p.sunPos);
        if (p.sunObjPos) {
            t.sunObjPos.set(...p.sunObjPos);
            t.sunObjScale = p.sunObjScale;
            t.sunCoreCol.setHex(p.sunCoreCol);
            t.sunGlowCol.setHex(p.sunGlowCol);
            // If sun was previously hidden (night/storm), fade it in right at the target East/West position
            if (f.sunCoreOp < 0.02 && f.sunGlowOp < 0.02) {
                f.sunObjPos.copy(t.sunObjPos);
                f.sunObjScale = t.sunObjScale;
                f.sunCoreCol.copy(t.sunCoreCol);
                f.sunGlowCol.copy(t.sunGlowCol);
            }
        } else {
            // Fading out to clouds/night: keep current position & color so sun dims smoothly in place
            t.sunObjPos.copy(f.sunObjPos);
            t.sunObjScale = f.sunObjScale;
            t.sunCoreCol.copy(f.sunCoreCol);
            t.sunGlowCol.copy(f.sunGlowCol);
        }
        t.sunCoreOp = p.sunCoreOp;
        t.sunGlowOp = p.sunGlowOp;
        t.cloudCol.setHex(p.cloudCol);
        t.cloudOp = p.cloudOp;
        t.starsOp = p.starsOp;
        t.rainOp = p.rainOp || 0.0;
        t.waveAmp = p.waveAmp;

        this._weatherLerpElapsed = 0.0;
    }

    initOcean() {
        this.waveMultiplier = 1.0;
        // 48x48 dynamic 3D wave mesh (2,401 vertices) gives rich rolling waves with 55% less CPU cost
        const oceanGeo = new THREE.PlaneGeometry(340, 340, 48, 48);
        oceanGeo.rotateX(-Math.PI / 2);

        const pos = oceanGeo.attributes.position;
        this.oceanBaseY = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
            this.oceanBaseY[i] = pos.getY(i);
        }

        const oceanMat = new THREE.MeshStandardMaterial({
            color: 0x0ea5c6,
            emissive: 0x0369a1,
            emissiveIntensity: 0.25,
            roughness: 0.30,
            metalness: 0.25,
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

        this.initWakePool();
        this.initAmbientOceanScenery();
    }

    // ------------------------------------------------------------------------
    // OBJECT-POOLED V-SHAPED SHIP WAKE FOAM (ZERO ALLOCATION IN RENDER LOOP!)
    // ------------------------------------------------------------------------
    initWakePool() {
        this.wakePool = [];
        this.wakePoolCursor = 0;
        const poolSize = 48;
        const sharedGeo = new THREE.RingGeometry(0.10, 0.24, 10);
        sharedGeo.rotateX(-Math.PI / 2);

        for (let i = 0; i < poolSize; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0xf0f9ff,
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(sharedGeo, mat);
            mesh.visible = false;
            this.effectsGroup.add(mesh);
            this.wakePool.push({
                mesh,
                mat,
                active: false,
                birth: 0,
                life: 800,
                vx: 0,
                vz: 0,
                initScale: 1.0
            });
        }
    }

    spawnWakeParticle(x, y, z, yawRad = 0, speedNorm = 1.0) {
        if (!this.wakePool || this.wakePool.length === 0) return;
        const now = performance.now();
        // Ship forward vector is (+cos(yaw), -sin(yaw)); stern is behind it
        const fwdX = Math.cos(yawRad);
        const fwdZ = -Math.sin(yawRad);
        const rightX = -fwdZ;
        const rightZ = fwdX;
        const sternX = x - fwdX * 1.15;
        const sternZ = z - fwdZ * 1.15;

        // Emit a V-shaped pair (left & right wake arms) behind the stern
        [-1, 1].forEach((side) => {
            const p = this.wakePool[this.wakePoolCursor];
            this.wakePoolCursor = (this.wakePoolCursor + 1) % this.wakePool.length;
            p.active = true;
            p.birth = now;
            p.life = 800;
            p.initScale = 0.85 + speedNorm * 0.25;
            p.vx = (-fwdX * 0.55 + rightX * side * 0.85) * (0.65 + speedNorm * 0.45);
            p.vz = (-fwdZ * 0.55 + rightZ * side * 0.85) * (0.65 + speedNorm * 0.45);
            p.mesh.position.set(sternX + rightX * side * 0.22, y + 0.03, sternZ + rightZ * side * 0.22);
            p.mesh.scale.set(p.initScale, 1, p.initScale);
            p.mat.opacity = 0.72;
            p.mesh.visible = true;
        });
    }

    initAmbientOceanScenery() {
        // Static Outer Sea Chart & Muted Border Terrain (always visible, zero raycast, castShadow: false)
        this.seaChartGroup = new THREE.Group();
        this.scene.add(this.seaChartGroup);

        // 1A. Flat Compass Rose (N-E-S-W) in open NE sea corner outside hex grid (y = 0.01, opacity ~0.36)
        const seaCompass = ProceduralModels.createSeaCompassRoseOverlay();
        seaCompass.position.set(50, 0.01, -46);
        this.seaChartGroup.add(seaCompass);

        // 1B. Ultra-thin, faint Latitude & Longitude Nautical Grid (opacity ~0.12, merged into 1 static mesh)
        const gridGroup = new THREE.Group();
        const gridLineMat = new THREE.MeshBasicMaterial({
            color: 0xf5e6c4,
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        for (let coord = -108; coord <= 108; coord += 18) {
            const latBar = new THREE.Mesh(new THREE.PlaneGeometry(216, 0.12), gridLineMat);
            latBar.rotation.x = -Math.PI / 2;
            latBar.position.set(0, 0.006, coord);
            const lonBar = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 216), gridLineMat);
            lonBar.rotation.x = -Math.PI / 2;
            lonBar.position.set(coord, 0.006, 0);
            gridGroup.add(latBar, lonBar);
        }
        const mergedGrid = ProceduralModels.mergeStaticMeshesByMaterial(gridGroup, new Set(), { castShadow: false, flatShading: false });
        this.seaChartGroup.add(mergedGrid || gridGroup);

        // 2. Muted Low-Poly Border Terrain along West & North edges (outside hex grid, fades into THREE.Fog)
        const borderClusters = [
            { x: -34, z: -58, sx: 2.2, sy: 1.0, sz: 1.8, rot: 0.3 },
            { x: -8,  z: -62, sx: 2.5, sy: 1.1, sz: 1.7, rot: 1.1 },
            { x: 18,  z: -59, sx: 2.1, sy: 0.9, sz: 1.6, rot: 2.2 },
            { x: -46, z: -38, sx: 1.9, sy: 1.0, sz: 2.2, rot: 0.8 },
            { x: -44, z: -14, sx: 1.8, sy: 0.9, sz: 2.1, rot: 1.9 },
            { x: -46, z: 12,  sx: 1.9, sy: 0.85, sz: 2.0, rot: 2.6 }
        ];
        borderClusters.forEach((bc, idx) => {
            const ridge = ProceduralModels.createMutedBorderTerrainCluster(idx + 11);
            ridge.position.set(bc.x, -0.22, bc.z);
            ridge.scale.set(bc.sx, bc.sy, bc.sz);
            ridge.rotation.y = bc.rot;
            this.seaChartGroup.add(ridge);
        });

        // 3A. 4 Sparse Decorative Outer-Sea Coral/Rock Islets (far outside playable hex grid)
        const outerIslets = [
            { x: 48,  z: -22, sc: 0.95, rot: 0.4 },
            { x: 58,  z: 4,   sc: 1.05, rot: 1.8 },
            { x: 44,  z: 52,  sc: 0.90, rot: 2.5 },
            { x: -46, z: 42,  sc: 0.92, rot: 1.1 }
        ];
        outerIslets.forEach((islet, idx) => {
            const mesh = ProceduralModels.createOuterCoralIsletCluster(idx + 21);
            mesh.position.set(islet.x, -0.18, islet.z);
            mesh.scale.setScalar(islet.sc);
            mesh.rotation.y = islet.rot;
            this.seaChartGroup.add(mesh);
        });

        // 3B. Dashed International Shipping Lane along far SE outer sea (cream-white, opacity ~0.28)
        const lanePts = [
            { x: 54, z: -34 },
            { x: 56, z: -10 },
            { x: 54, z: 16 },
            { x: 48, z: 42 },
            { x: 38, z: 62 }
        ];
        this.shippingLaneWaypoints = lanePts;
        const laneDashGroup = new THREE.Group();
        const dashMat = new THREE.MeshBasicMaterial({
            color: 0xf5f0e1,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        for (let s = 0; s < lanePts.length - 1; s++) {
            const p0 = lanePts[s];
            const p1 = lanePts[s + 1];
            const dx = p1.x - p0.x;
            const dz = p1.z - p0.z;
            const segLen = Math.hypot(dx, dz);
            const ang = Math.atan2(dz, dx);
            const dashCount = Math.max(3, Math.floor(segLen / 3.8));
            for (let d = 0; d < dashCount; d++) {
                const t = (d + 0.5) / dashCount;
                const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.22), dashMat);
                dash.rotation.x = -Math.PI / 2;
                dash.rotation.z = -ang;
                dash.position.set(p0.x + dx * t, 0.015, p0.z + dz * t);
                laneDashGroup.add(dash);
            }
        }
        const mergedLane = ProceduralModels.mergeStaticMeshesByMaterial(laneDashGroup, new Set(), { castShadow: false, flatShading: false });
        this.seaChartGroup.add(mergedLane || laneDashGroup);

        // Animated Outer Scenery Group (hidden automatically in "⚡ Siêu Mượt" mode!)
        this.sceneryGroup = new THREE.Group();
        this.scene.add(this.sceneryGroup);

        this.ambientLighthouses = [];
        this.ambientOilRigs = [];
        this.ambientSampans = [];
        this.ambientDolphins = [];
        this.ambientFishSchools = [];
        this.ambientSeagulls = [];
        this.ambientCargoShips = [];
        this.ambientWhales = [];

        // 1. 2 Offshore Oil & Gas Platforms off Southeast Vietnam (Giàn Khoan Dầu Khí Đông Nam Bộ)
        const oilRigCoords = [
            { x: 42, z: 24, rot: 0.28 },
            { x: 48, z: 36, rot: -0.32 }
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

        // 2. 2 Tiny Neutral Cargo Ships gliding very slowly along the far SE International Shipping Lane
        [0.12, 0.62].forEach((startProgress, idx) => {
            const ship = ProceduralModels.createMiniAmbientCargoShip();
            this.sceneryGroup.add(ship);
            this.ambientCargoShips.push({
                mesh: ship,
                progress: startProgress,
                speed: 0.009 + idx * 0.002,
                dir: idx === 0 ? 1 : -1,
                phase: idx * 2.7
            });
        });

        // 3. 2 Slow Low-Poly Whale Silhouettes gliding calmly in outer empty sea (hidden in Smooth mode)
        const whaleOrbits = [
            { cx: -46, cz: 26, rx: 6.5, rz: 9.0, speed: 0.09, phase: 0.4 },
            { cx: 52,  cz: -8, rx: 5.5, rz: 8.5, speed: 0.08, phase: 3.1 }
        ];
        whaleOrbits.forEach(wo => {
            const whale = ProceduralModels.createSlowWhaleSilhouette();
            whale.position.set(wo.cx, -0.18, wo.cz);
            this.sceneryGroup.add(whale);
            this.ambientWhales.push({ mesh: whale, ...wo });
        });

        // 4. 4 Graceful V-Shaped Seagull Flocks Circling Broadly Along the S-Shaped Coastline
        const gullOrbits = [
            { cx: 16, cz: -34, rx: 14, rz: 9,  y: 9.2, speed: 0.28, phase: 0.0 },
            { cx: 24, cz: -4,  rx: 15, rz: 10, y: 9.8, speed: 0.24, phase: 1.6 },
            { cx: 20, cz: 26,  rx: 14, rz: 9,  y: 9.0, speed: 0.26, phase: 3.1 },
            { cx: 44, cz: 10,  rx: 11, rz: 14, y: 8.6, speed: 0.25, phase: 4.7 }
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
            // 1. TRUNG DU & MIỀN NÚI BẮC BỘ (Region 0) — Miền Bắc giàu Sắt, ít Lúa, khan hiếm Gỗ
            "-14,3":  { terrain: "coast", monumentId: "mon_sapa", regionId: 0, navigable: true },
            "-13,4":  { terrain: "coast", isPort: true, portName: "Thương Cảng Cái Lân (Quảng Ninh)", regionId: 0, navigable: true },
            "-13,8":  { terrain: "sea", resourceType: "iron", regionId: 0, navigable: true, isOffshore: true },
            "-12,4":  { terrain: "coast", resourceType: "iron", regionId: 0, navigable: true },
            "-12,6":  { terrain: "sea", resourceType: "iron", regionId: 0, navigable: true },
            "-11,3":  { terrain: "island", monumentId: "mon_halong", regionId: 0, navigable: true },
            "-11,5":  { terrain: "reef", isReef: true, regionId: 0, navigable: true },
            "-11,9":  { terrain: "sea", resourceType: "food", regionId: 0, navigable: true, isOffshore: true },

            // 2. ĐỒNG BẰNG SÔNG HỒNG (Region 1) — Cảng Hải Phòng đẩy xuống mép Nam Vùng 1 (cách Cái Lân 6 ô biển)
            "-10,3":  { terrain: "coast", resourceType: "food", regionId: 1, navigable: true },
            "-10,5":  { terrain: "sea", resourceType: "wood", regionId: 1, navigable: true },
            "-9,2":   { terrain: "coast", monumentId: "mon_vanmieu", regionId: 1, navigable: true },
            "-9,4":   { terrain: "reef", isReef: true, regionId: 1, navigable: true },
            "-9,8":   { terrain: "sea", resourceType: "iron", regionId: 1, navigable: true, isOffshore: true },
            "-8,1":   { terrain: "coast", isPort: true, portName: "Thương Cảng Hải Phòng", regionId: 1, navigable: true },
            "-8,6":   { terrain: "sea", resourceType: "iron", regionId: 1, navigable: true, isOffshore: true },

            // 3. BẮC TRUNG BỘ & DUYÊN HẢI MIỀN TRUNG (Region 2) — Miền Trung & Tây Nguyên giàu Gỗ, ít Sắt, khan hiếm Lúa
            "-7,0":   { terrain: "coast", resourceType: "wood", regionId: 2, navigable: true },
            "-6,-1":  { terrain: "coast", resourceType: "wood", regionId: 2, navigable: true },
            "-6,2":   { terrain: "reef", isReef: true, regionId: 2, navigable: true },
            "-6,7":   { terrain: "sea", resourceType: "iron", regionId: 2, navigable: true, isOffshore: true },
            "-4,0":   { terrain: "coast", monumentId: "mon_phongnha", regionId: 2, navigable: true },
            "-4,5":   { terrain: "sea", resourceType: "wood", regionId: 2, navigable: true, isOffshore: true },
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
            "4,3":    { terrain: "coast", resourceType: "wood", regionId: 3, navigable: true },
            "4,5":    { terrain: "sea", resourceType: "iron", regionId: 3, navigable: true },

            // 5. ĐÔNG NAM BỘ (Region 4) — Miền Nam giàu Lúa, ít Gỗ, khan hiếm Sắt
            "5,2":    { terrain: "coast", resourceType: "wood", regionId: 4, navigable: true },
            "5,4":    { terrain: "reef", isReef: true, regionId: 4, navigable: true },
            "6,1":    { terrain: "coast", isPort: true, portName: "Thương Cảng Quốc Tế Cái Mép – Sài Gòn", regionId: 4, navigable: true },
            "6,8":    { terrain: "sea", resourceType: "food", regionId: 4, navigable: true, isOffshore: true },
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
                        minLandCol: rowSpec.minCol,
                        maxLandCol: rowSpec.maxCol,
                        isCoastalEdge: (col === rowSpec.maxCol || col === rowSpec.minCol || r === -14 || r === 14),
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

        this._sandInstances = [];
        this._landBaseInstances = [];
        this._landCapInstances = [];
        this._landRimInstances = [];
        this._reefSpireInstances = [];
        this._reefCoralInstances = [];
        this._poiHexCoords = layoutSpec
            .filter(s => s.monumentId || s.isPort || s.resourceType)
            .map(s => ({ q: s.q, r: s.r }));
        this.staticDioramaGroup = new THREE.Group();
        this.boardGroup.add(this.staticDioramaGroup);

        layoutSpec.forEach((spec, idx) => {
            const tile = this.createHexTile(spec, idx, monumentAssignments);
            this.hexTiles.push(tile);
            this.hexMap.set(`${spec.q},${spec.r}`, tile);
            this.boardGroup.add(tile.group);
        });

        this.finalizeBoardInstancingAndMerging();
        this.buildRegionBoundaries3D();
        this.buildRegionBanners();
        this.applyMinimalistMode();
    }

    // ------------------------------------------------------------------------
    // 3D REGION BOUNDARY STRIPS FOR ALL 6 ECONOMIC REGIONS (MERGED BY COLOR!)
    // Real 3D extruded strips along every region's outer & inter-region borders
    // ------------------------------------------------------------------------
    buildRegionBoundaries3D() {
        const regionColors = [
            0x22c55e, // 0: Trung du & MN Bắc Bộ (Xanh lá đậm rực)
            0xfacc15, // 1: Đồng bằng Sông Hồng (Vàng rực)
            0x38bdf8, // 2: Duyên hải Miền Trung (Xanh lam sáng)
            0xf97316, // 3: Tây Nguyên (Cam đất đỏ)
            0xf43f5e, // 4: Đông Nam Bộ (Đỏ hồng năng động)
            0x84cc16  // 5: Đồng bằng Sông Cửu Long (Xanh cốm tươi)
        ];

        // Axial neighbor directions for pointy-top hexes:
        // E(1,0), SE(0,1), SW(-1,1), W(-1,0), NW(0,-1), NE(1,-1)
        const edgeDirs = [
            { dq: 1,  dr: 0,  a0: -Math.PI / 6,     a1: Math.PI / 6 },
            { dq: 0,  dr: 1,  a0: Math.PI / 6,      a1: Math.PI / 2 },
            { dq: -1, dr: 1,  a0: Math.PI / 2,      a1: 5 * Math.PI / 6 },
            { dq: -1, dr: 0,  a0: 5 * Math.PI / 6,  a1: 7 * Math.PI / 6 },
            { dq: 0,  dr: -1, a0: 7 * Math.PI / 6,  a1: 3 * Math.PI / 2 },
            { dq: 1,  dr: -1, a0: 3 * Math.PI / 2,  a1: 11 * Math.PI / 6 }
        ];

        const boundaryGroup = new THREE.Group();
        const R = this.hexRadius * 1.005;
        const mats = regionColors.map(hex => new THREE.MeshLambertMaterial({
            color: hex,
            emissive: hex,
            emissiveIntensity: 0.48,
            flatShading: true
        }));

        this.hexTiles.forEach(tile => {
            if (tile.navigable || tile.terrain === "archipelago") return;
            const regId = tile.regionId;
            const bMat = mats[regId] || mats[0];

            for (let d = 0; d < 6; d++) {
                const ed = edgeDirs[d];
                const nb = this.hexMap.get(`${tile.q + ed.dq},${tile.r + ed.dr}`);
                const isSameLandRegion = Boolean(nb && !nb.navigable && nb.terrain !== "archipelago" && nb.regionId === regId);
                if (isSameLandRegion) continue;

                const x0 = tile.x + Math.cos(ed.a0) * R;
                const z0 = tile.z + Math.sin(ed.a0) * R;
                const x1 = tile.x + Math.cos(ed.a1) * R;
                const z1 = tile.z + Math.sin(ed.a1) * R;

                const mx = (x0 + x1) * 0.5;
                const mz = (z0 + z1) * 0.5;
                const segLen = Math.hypot(x1 - x0, z1 - z0) + 0.14;
                const angle = Math.atan2(z1 - z0, x1 - x0);

                const strip = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.14, 0.22), bMat);
                strip.position.set(mx, tile.height + 0.03, mz);
                strip.rotation.y = -angle;
                boundaryGroup.add(strip);
            }
        });

        const mergedBorders = ProceduralModels.mergeStaticMeshesByMaterial(boundaryGroup, new Set(), {
            castShadow: false,
            flatShading: true
        });
        this.boardGroup.add(mergedBorders || boundaryGroup);
    }

    finalizeBoardInstancingAndMerging() {
        const useInstanced = typeof THREE.InstancedMesh === "function" && typeof THREE.Object3D === "function";
        const dummy = useInstanced ? new THREE.Object3D() : null;

        // 1. InstancedMesh for Coastal Sand Skirts (1 Draw Call, warm coastal beach sand #dcc18a)
        if (useInstanced && this._sandInstances.length > 0) {
            const sandGeo = new THREE.CylinderGeometry(this.hexRadius * 1.02, this.hexRadius * 1.07, 0.16, 6);
            const sandMat = new THREE.MeshLambertMaterial({ color: 0xdcc18a, flatShading: true });
            const sandIM = new THREE.InstancedMesh(sandGeo, sandMat, this._sandInstances.length);
            sandIM.receiveShadow = true;
            sandIM.castShadow = false;
            this._sandInstances.forEach((it, i) => {
                dummy.position.set(it.x, -0.02, it.z);
                dummy.scale.set(1, 1, 1);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                sandIM.setMatrixAt(i, dummy.matrix);
            });
            sandIM.instanceMatrix.needsUpdate = true;
            this.boardGroup.add(sandIM);
        }

        // 2. InstancedMesh for Static Land Hex Cliff Columns (1 Draw Call, warm earthy cliff sides #6e5239 / #5c4938)
        if (useInstanced && this._landBaseInstances.length > 0) {
            const unitHexGeo = new THREE.CylinderGeometry(this.hexRadius * 0.96, this.hexRadius * 1.0, 1.0, 6);
            const landMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
            const landIM = new THREE.InstancedMesh(unitHexGeo, landMat, this._landBaseInstances.length);
            landIM.receiveShadow = true;
            landIM.castShadow = false;
            this._landBaseInstances.forEach((it, i) => {
                dummy.position.set(it.x, it.height / 2 - 0.1, it.z);
                dummy.scale.set(1, it.height, 1);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                landIM.setMatrixAt(i, dummy.matrix);
                if (landIM.setColorAt) landIM.setColorAt(i, it.color);
            });
            landIM.instanceMatrix.needsUpdate = true;
            if (landIM.instanceColor) landIM.instanceColor.needsUpdate = true;
            this.boardGroup.add(landIM);
        }

        // 3. InstancedMesh for Static Land Top Turf Plateau Caps (1 Draw Call, rich natural 6-region turf)
        if (useInstanced && this._landCapInstances.length > 0) {
            const capGeo = new THREE.CylinderGeometry(this.hexRadius * 0.94, this.hexRadius * 0.975, 0.13, 6);
            const capMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
            const capIM = new THREE.InstancedMesh(capGeo, capMat, this._landCapInstances.length);
            capIM.receiveShadow = true;
            capIM.castShadow = false;
            this._landCapInstances.forEach((it, i) => {
                dummy.position.set(it.x, it.height - 0.055, it.z);
                dummy.scale.set(1, 1, 1);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                capIM.setMatrixAt(i, dummy.matrix);
                if (capIM.setColorAt) capIM.setColorAt(i, it.color);
            });
            capIM.instanceMatrix.needsUpdate = true;
            if (capIM.instanceColor) capIM.instanceColor.needsUpdate = true;
            this.boardGroup.add(capIM);
        }

        // 4. InstancedMesh for Static Land Hex Rims (1 Draw Call)
        if (useInstanced && this._landRimInstances.length > 0) {
            const rimGeo = new THREE.RingGeometry(this.hexRadius * 0.88, this.hexRadius * 0.96, 6);
            rimGeo.rotateX(-Math.PI / 2);
            rimGeo.rotateZ(Math.PI / 6);
            const rimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
            const rimIM = new THREE.InstancedMesh(rimGeo, rimMat, this._landRimInstances.length);
            this._landRimInstances.forEach((it, i) => {
                dummy.position.set(it.x, it.height - 0.085, it.z);
                dummy.scale.set(1, 1, 1);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                rimIM.setMatrixAt(i, dummy.matrix);
                if (rimIM.setColorAt) rimIM.setColorAt(i, it.color);
            });
            rimIM.instanceMatrix.needsUpdate = true;
            if (rimIM.instanceColor) rimIM.instanceColor.needsUpdate = true;
            this.boardGroup.add(rimIM);
        }

        // 4b. Single-Draw-Call Ultra-Thin Static Hex Outlines for Land & Coastal Tiles (crisp terrain definition at far zoom!)
        if (this._landBaseInstances.length > 0 && typeof THREE.LineSegments !== "undefined") {
            const edgeVerts = [];
            const rEdge = this.hexRadius * 0.965;
            const cornerX = [];
            const cornerZ = [];
            for (let k = 0; k < 6; k++) {
                const theta = (k * Math.PI) / 3;
                cornerX.push(rEdge * Math.sin(theta));
                cornerZ.push(rEdge * Math.cos(theta));
            }
            this._landBaseInstances.forEach(it => {
                const ey = it.height + 0.02;
                for (let k = 0; k < 6; k++) {
                    const n = (k + 1) % 6;
                    edgeVerts.push(
                        it.x + cornerX[k], ey, it.z + cornerZ[k],
                        it.x + cornerX[n], ey, it.z + cornerZ[n]
                    );
                }
            });
            const edgeGeo = new THREE.BufferGeometry();
            if (typeof THREE.Float32BufferAttribute !== "undefined") {
                edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgeVerts, 3));
            }
            const edgeMat = new THREE.LineBasicMaterial({
                color: 0x1e293b,
                transparent: true,
                opacity: 0.24,
                depthWrite: false
            });
            const hexOutlineSegments = new THREE.LineSegments(edgeGeo, edgeMat);
            hexOutlineSegments.renderOrder = 12;
            this.boardGroup.add(hexOutlineSegments);
        }

        // 5. InstancedMesh for Sharp Dark-Gray Reef Spires & Thin White Foam Rings (2 Draw Calls for all reefs!)
        if (useInstanced && this._reefSpireInstances.length > 0) {
            const spireGeo = new THREE.ConeGeometry(0.26, 1.0, 5);
            const reefMat = new THREE.MeshLambertMaterial({ color: 0x1e293b, flatShading: true });
            const spireIM = new THREE.InstancedMesh(spireGeo, reefMat, this._reefSpireInstances.length);
            spireIM.castShadow = false;
            this._reefSpireInstances.forEach((it, i) => {
                dummy.position.set(it.x, it.y, it.z);
                dummy.scale.set(it.sx || 1, it.h, it.sz || 1);
                dummy.rotation.set(0, it.rot || 0, 0);
                dummy.updateMatrix();
                spireIM.setMatrixAt(i, dummy.matrix);
            });
            spireIM.instanceMatrix.needsUpdate = true;
            this.boardGroup.add(spireIM);
        }
        if (useInstanced && this._reefCoralInstances.length > 0) {
            const foamGeo = new THREE.RingGeometry(0.72, 0.92, 18);
            foamGeo.rotateX(-Math.PI / 2);
            const foamMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
            const foamIM = new THREE.InstancedMesh(foamGeo, foamMat, this._reefCoralInstances.length);
            this._reefCoralInstances.forEach((it, i) => {
                dummy.position.set(it.x, it.y, it.z);
                dummy.scale.set(1, 1, 1);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                foamIM.setMatrixAt(i, dummy.matrix);
            });
            foamIM.instanceMatrix.needsUpdate = true;
            this.boardGroup.add(foamIM);
        }

        // 6. Merge static mainland diorama meshes by material (keeps animatedLandProps separate!)
        if (ProceduralModels.mergeStaticMeshesByMaterial && this.staticDioramaGroup) {
            const animSet = new Set();
            this.animatedLandProps.forEach(p => {
                if (p && p.mesh) animSet.add(p.mesh);
            });
            const mergedDioramas = ProceduralModels.mergeStaticMeshesByMaterial(this.staticDioramaGroup, animSet);
            if (mergedDioramas) {
                this.boardGroup.add(mergedDioramas);
            }
        }

        // 7. Auto-orient all 6 Trade Ports so their piers (+X) extend directly toward the nearest open sea hex!
        const axialDirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        this.hexTiles.forEach(tile => {
            if (!tile.isPort || !tile.propModel) return;
            let sumX = 0, sumZ = 0, count = 0;
            axialDirs.forEach(([dq, dr]) => {
                const nb = this.hexMap.get(`${tile.q + dq},${tile.r + dr}`);
                if (nb && nb.navigable && nb.terrain === "sea") {
                    sumX += (nb.x - tile.x);
                    sumZ += (nb.z - tile.z);
                    count++;
                }
            });
            if (count === 0) {
                axialDirs.forEach(([dq, dr]) => {
                    const nb = this.hexMap.get(`${tile.q + dq},${tile.r + dr}`);
                    if (nb && nb.navigable) {
                        sumX += (nb.x - tile.x);
                        sumZ += (nb.z - tile.z);
                        count++;
                    }
                });
            }
            if (count > 0 && Math.hypot(sumX, sumZ) > 0.01) {
                tile.propModel.rotation.y = -Math.atan2(sumZ, sumX);
            }
        });
    }

    clearHtmlLabels(kindFilter = null) {
        if (!this.htmlLabels) return;
        for (const [id, entry] of this.htmlLabels.entries()) {
            if (kindFilter && entry.kind !== kindFilter) continue;
            if (entry.el && entry.el.parentNode) {
                entry.el.parentNode.removeChild(entry.el);
            }
            this.htmlLabels.delete(id);
        }
    }

    registerHtmlLabel(id, kind, className, html, anchorVec = null, shipMesh = null, yOffset = 0) {
        if (typeof document === "undefined") return null;
        if (!this.htmlLabelLayer) {
            this.htmlLabelLayer = document.getElementById("map-labels-layer");
        }
        if (!this.htmlLabelLayer) return null;

        let entry = this.htmlLabels.get(id);
        if (!entry) {
            const el = document.createElement("div");
            el.className = `map-lbl ${className}`;
            el.innerHTML = html;
            el.style.display = "none";
            this.htmlLabelLayer.appendChild(el);
            entry = { id, kind, el, anchor: anchorVec, shipMesh, yOffset, hidden: true };
            this.htmlLabels.set(id, entry);
        } else {
            entry.el.className = `map-lbl ${className}`;
            entry.el.innerHTML = html;
            if (anchorVec) entry.anchor = anchorVec;
            entry.shipMesh = shipMesh;
            entry.yOffset = yOffset;
        }
        return entry;
    }

    setHtmlLabelMode(mode = "compact") {
        const valid = ["compact", "full", "regions-blockade", "hidden"].includes(mode) ? mode : "compact";
        this.htmlLabelMode = valid;
        if (!this.htmlLabelLayer && typeof document !== "undefined") {
            this.htmlLabelLayer = document.getElementById("map-labels-layer");
        }
        if (this.htmlLabelLayer) {
            this.htmlLabelLayer.classList.remove("labels-compact", "labels-full", "labels-regions-blockade", "labels-hidden");
            this.htmlLabelLayer.classList.add(`labels-${valid}`);
        }
        return valid;
    }

    setMonumentHtmlLabel(tile, state = { mode: "active" }) {
        if (!tile || !tile.monumentId) return;
        const tier = tile.monumentTier || 1;
        const mode = (state && state.mode) || "active";
        const shortMonMap = {
            mon_sapa: "Sa Pa",
            mon_halong: "Vịnh Hạ Long",
            mon_vanmieu: "Văn Miếu",
            mon_phongnha: "Phong Nha",
            mon_hue: "Cố Đô Huế",
            mon_myson: "Mỹ Sơn",
            mon_taynguyen: "Nhà Rông",
            mon_bennharong: "Bến Nhà Rồng",
            mon_cairang: "Chợ Nổi"
        };
        const shortName = shortMonMap[tile.monumentId] || String(tile.monumentName || "Di Tích").replace(/^Di tích\s+/i, "");
        const stars = tier === 1 ? "★" : (tier === 2 ? "★★" : "★★★");

        let cls = `map-lbl-monument tier-${tier}`;
        let badgeHtml = `${stars}${tier}`;
        let customStyle = "";

        if (mode === "early_locked") {
            cls = `map-lbl-monument mode-locked`;
            badgeHtml = `🔒${tier}`;
        } else if (mode === "conquered") {
            const cCol = (state && state.conquerorColor) || "#34d399";
            cls = `map-lbl-monument mode-conquered`;
            badgeHtml = `<span class="map-lbl-dot" style="background:${cCol}"></span>✅`;
            customStyle = `--conq-color:${cCol};`;
        }

        const html = `
            <div class="mon-pill" style="${customStyle}">
                <span class="mon-badge">${badgeHtml}</span>
                <span class="map-label-name">${shortName}</span>
            </div>
        `;
        const anchor = new THREE.Vector3(tile.x, (tile.height || 0.22) + 3.95, tile.z);
        this.registerHtmlLabel(`mon_${tile.monumentId}`, "monument", cls, html, anchor);
    }

    setPortHtmlLabel(tile, state = { mode: "free" }) {
        if (!tile || !tile.isPort) return;
        const mode = (state && state.mode) || "free";
        const needsWarn = Boolean(state && state.needsCoinWarning);
        const ownerColor = (state && state.ownerColor) || "#38bdf8";

        const shortPortMap = {
            0: "Cái Lân",
            1: "Hải Phòng",
            2: "Tiên Sa",
            3: "Quy Nhơn",
            4: "Cái Mép",
            5: "Cần Thơ"
        };
        const shortPort = shortPortMap[tile.regionId] || String(tile.portName || "Thương Cảng").replace(/^Thương Cảng\s+/i, "");

        let cls = "map-lbl-port port-free";
        let compactBadgeHtml = `🌐⚓`;
        let fullPrefixHtml = `🌐`;
        let fullNameHtml = shortPort;
        let customStyle = "";

        if (mode === "mine") {
            cls = "map-lbl-port port-mine";
            compactBadgeHtml = `👑⚓`;
            fullPrefixHtml = `👑`;
            fullNameHtml = shortPort;
        } else if (mode === "other") {
            if (needsWarn) {
                cls = "map-lbl-port port-other port-warn";
                compactBadgeHtml = `⛔`;
                fullPrefixHtml = `⛔`;
                fullNameHtml = shortPort;
            } else {
                cls = "map-lbl-port port-other";
                compactBadgeHtml = `<span class="map-lbl-dot" style="background:${ownerColor}"></span>⚓1💰`;
                fullPrefixHtml = `<span class="map-lbl-dot" style="background:${ownerColor}"></span>⚓`;
                fullNameHtml = `${shortPort} • 1💰`;
            }
            customStyle = `--owner-color:${ownerColor};`;
        }

        const html = `
            <div class="port-pill" style="${customStyle}">
                <span class="port-badge port-compact-only">${compactBadgeHtml}</span>
                <span class="port-badge port-full-only">${fullPrefixHtml}</span>
                <span class="map-label-name">${fullNameHtml}</span>
            </div>
        `;
        const anchor = new THREE.Vector3(tile.x, (tile.height || 0.22) + 3.55, tile.z);
        this.registerHtmlLabel(`port_${tile.regionId}`, "port", cls, html, anchor);
    }

    updateHtmlLabelsProjection() {
        if (!this.htmlLabelLayer || !this.htmlLabels || this.htmlLabels.size === 0 || !this.camera || !this.renderer) return;

        // Expand ONLY the hovered Monument or Port label in Compact mode (no camera-distance override!)
        const hovId = this.hoveredHex
            ? (this.hoveredHex.monumentId ? `mon_${this.hoveredHex.monumentId}` : (this.hoveredHex.isPort ? `port_${this.hoveredHex.regionId}` : null))
            : null;
        if (hovId !== this._lastHoveredHtmlId) {
            if (this._lastHoveredHtmlId) {
                const prev = this.htmlLabels.get(this._lastHoveredHtmlId);
                if (prev && prev.el) prev.el.classList.remove("is-hovered");
            }
            if (hovId) {
                const cur = this.htmlLabels.get(hovId);
                if (cur && cur.el) cur.el.classList.add("is-hovered");
            }
            this._lastHoveredHtmlId = hovId;
        }

        const domEl = this.renderer.domElement;
        const w = (domEl && domEl.clientWidth) || (typeof window !== "undefined" ? window.innerWidth : 1280);
        const h = (domEl && domEl.clientHeight) || (typeof window !== "undefined" ? window.innerHeight : 720);
        const v = this._projVec;
        if (!v || typeof v.project !== "function") return;

        this.htmlLabels.forEach(entry => {
            if (!entry.el) return;
            if (entry.shipMesh) {
                if (!entry.shipMesh.visible) {
                    if (!entry.hidden) {
                        entry.el.style.display = "none";
                        entry.hidden = true;
                    }
                    return;
                }
                v.set(entry.shipMesh.position.x, entry.shipMesh.position.y + (entry.yOffset || 3.15), entry.shipMesh.position.z);
            } else if (entry.anchor) {
                v.copy(entry.anchor);
            } else {
                return;
            }

            v.project(this.camera);
            if (v.z > 1 || v.z < -1) {
                if (!entry.hidden) {
                    entry.el.style.display = "none";
                    entry.hidden = true;
                }
                return;
            }

            const sx = (v.x * 0.5 + 0.5) * w;
            const sy = (-v.y * 0.5 + 0.5) * h;
            if (sx < -140 || sx > w + 140 || sy < -90 || sy > h + 90) {
                if (!entry.hidden) {
                    entry.el.style.display = "none";
                    entry.hidden = true;
                }
                return;
            }

            if (entry.hidden) {
                entry.el.style.display = "";
                entry.hidden = false;
            }
            entry.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-100%)`;
        });
    }

    buildRegionBanners() {
        this.regionBannerSprites = [];
        this.clearHtmlLabels("region");
        const regionBanners = [
            { id: "reg_0", r: -14.2, col: -5.2, line1: "MN BẮC BỘ" },
            { id: "reg_1", r: -9.6,  col: -1.6, line1: "ĐB SÔNG HỒNG" },
            { id: "reg_2", r: -4.5,  col: -4.4, line1: "MIỀN TRUNG" },
            { id: "reg_3", r: 1.5,   col: -2.2, line1: "TÂY NGUYÊN" },
            { id: "reg_4", r: 6.2,   col: -3.2, line1: "ĐÔNG NAM BỘ" },
            { id: "reg_5", r: 11.2,  col: -6.8, line1: "ĐB SÔNG CỬU LONG" }
        ];
        regionBanners.forEach(rb => {
            const q = -Math.floor(rb.r / 2) + rb.col;
            const { x, z } = this.axialToWorld(q, rb.r);
            this.registerHtmlLabel(rb.id, "region", "map-label-region", `<span>${rb.line1}</span>`, new THREE.Vector3(x, 2.0, z));
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
        // Warm earthy stone-brown cliff walls for mainland hex sides (#6e5239 / #5c4938)
        let cliffColor = new THREE.Color(jitter > 0.5 ? 0x6e5239 : 0x5c4938);

        if (spec.terrain === "sea") {
            height = 0.14;
            const seaDist = Math.max(1, (spec.col || 0) - (spec.maxLandCol !== undefined ? spec.maxLandCol : 0));
            if (spec.isSpawnRim) {
                topColor = new THREE.Color(0x135b82);
            } else if (seaDist <= 2) {
                topColor = new THREE.Color(0x11557a);
            } else if (seaDist <= 4) {
                topColor = new THREE.Color(0x0f4e70);
            } else {
                topColor = new THREE.Color(0x0c4766);
            }
        } else if (spec.terrain === "coast") {
            height = 0.19;
            topColor = new THREE.Color(0x155d80).lerp(new THREE.Color(region.color), 0.10);
        } else if (spec.terrain === "river_channel") {
            height = 0.18;
            topColor = new THREE.Color(0x136685);
        } else if (spec.terrain === "reef") {
            height = 0.21;
            topColor = new THREE.Color(0x114f6e);
        } else if (spec.terrain === "archipelago") {
            height = 0.36;
            topColor = new THREE.Color(0x1e6b6b);
            cliffColor = topColor.clone();
        } else if (!spec.navigable) {
            // 6 VIETNAMESE ECONOMIC REGIONS — RICH, WARM, NATURAL TOP TURF COLORS (NO WASH-OUT, NO EMISSIVE)
            const rId = spec.regionId;
            if (rId === 0) {
                // Vùng 0 (TD&MN Bắc Bộ): Xanh rừng núi trầm (#356b3d) xen mảng xanh rêu (#2b5832), địa hình cao hơn đồng bằng
                height = 0.72 + jitter * 0.22;
                capColor = new THREE.Color(jitter > 0.45 ? 0x356b3d : 0x2b5832);
            } else if (rId === 1) {
                // Vùng 1 (ĐB Sông Hồng): Xanh lúa đồng bằng ấm (#6b943a) xen đất phù sa nhẹ (#87993c)
                height = 0.34 + jitter * 0.06;
                capColor = new THREE.Color(jitter > 0.48 ? 0x6b943a : 0x87993c);
            } else if (rId === 2) {
                // Vùng 2 (Bắc Trung Bộ & DHMT): Xanh đồi duyên hải (#53844a) chuyển sáng nhẹ về phía biển
                const isMountainEdge = (spec.terrain === "mountain");
                height = isMountainEdge ? (0.58 + jitter * 0.14) : (0.42 + jitter * 0.09);
                capColor = new THREE.Color(0x53844a);
                if (spec.col === spec.maxLandCol) {
                    capColor.lerp(new THREE.Color(0x739c58), 0.35);
                } else if (isMountainEdge) {
                    capColor.lerp(new THREE.Color(0x3b683b), 0.35);
                }
            } else if (rId === 3) {
                // Vùng 3 (Tây Nguyên): Đất đỏ Bazan đặc trưng (#8f4a27) xen mảng xanh đồi cà phê (#6e5128), cao nguyên nâng rõ
                height = 0.62 + jitter * 0.16;
                capColor = new THREE.Color(jitter > 0.40 ? 0x8f4a27 : 0x6e5128);
            } else if (rId === 4) {
                // Vùng 4 (Đông Nam Bộ): Xanh ô-liu pha đất xám (#5d803d)
                height = 0.42 + jitter * 0.08;
                capColor = new THREE.Color(0x5d803d).offsetHSL(0, 0, (jitter - 0.5) * 0.03);
            } else {
                // Vùng 5 (ĐB Sông Cửu Long): Xanh miệt vườn phù sa tươi dịu (#4c8c3b)
                height = 0.32 + jitter * 0.06;
                capColor = new THREE.Color(0x4c8c3b).offsetHSL(0, 0, (jitter - 0.5) * 0.03);
            }
            topColor = cliffColor.clone();
        } else if (spec.terrain === "island") {
            height = 0.32;
            topColor = new THREE.Color(0x4a7c45);
            capColor = topColor.clone();
        } else {
            height = 0.26;
        }

        const isWaterHex = (spec.terrain === "sea" || spec.terrain === "coast" || spec.terrain === "river_channel");
        const isStaticLandHex = !spec.navigable;
        const defaultBaseOpacity = spec.terrain === "sea" ? 0.50 : (isWaterHex ? 0.70 : 1.0);
        const useInstanced = typeof THREE.InstancedMesh === "function";

        // Stratified Layer 1: Warm Golden Sandy Beach Skirt (#dcc18a) along coastal mainland edges & islands
        const needsCoastalSand = (!isWaterHex && spec.terrain !== "reef") && (spec.isCoastalEdge || spec.terrain === "island" || spec.terrain === "archipelago");
        if (needsCoastalSand) {
            if (useInstanced) {
                this._sandInstances.push({ x, z });
            } else {
                const sandGeo = new THREE.CylinderGeometry(this.hexRadius * 1.02, this.hexRadius * 1.07, 0.16, 6);
                const sandMat = new THREE.MeshLambertMaterial({ color: 0xdcc18a, flatShading: true });
                const sandSkirt = new THREE.Mesh(sandGeo, sandMat);
                sandSkirt.position.y = -0.02;
                sandSkirt.receiveShadow = true;
                group.add(sandSkirt);
            }
        }

        // Stratified Layer 2: Main Hex Column (Static land hexes batched via InstancedMesh — sides ~25% darker than top turf for 3D edge crispness!)
        let baseMesh = null;
        if (isStaticLandHex && useInstanced) {
            const sideColor = (capColor && typeof capColor.clone === "function" && typeof capColor.multiplyScalar === "function")
                ? capColor.clone().multiplyScalar(0.75)
                : topColor;
            this._landBaseInstances.push({ x, z, height, color: sideColor });
        } else {
            const hexGeo = new THREE.CylinderGeometry(this.hexRadius * 0.96, this.hexRadius * 1.0, height, 6);
            const hexMat = new THREE.MeshLambertMaterial({
                color: topColor,
                transparent: true,
                opacity: defaultBaseOpacity
            });
            baseMesh = new THREE.Mesh(hexGeo, hexMat);
            baseMesh.position.y = height / 2 - 0.1;
            baseMesh.receiveShadow = true;
            baseMesh.castShadow = false;
            group.add(baseMesh);
            // CPU Optimization: Raycast ONLY interactive navigable hexes!
            if (spec.navigable) {
                this.pickableMeshes.push(baseMesh);
            }
        }

        // Stratified Layer 3: Beveled Top Plateau Cap for Mainland Hexes (InstancedMesh!)
        if (!spec.navigable && spec.terrain !== "archipelago") {
            if (useInstanced) {
                this._landCapInstances.push({ x, z, height, color: capColor });
            } else {
                const capGeo = new THREE.CylinderGeometry(this.hexRadius * 0.84, this.hexRadius * 0.94, 0.09, 6);
                const capMat = new THREE.MeshLambertMaterial({ color: capColor });
                const capMesh = new THREE.Mesh(capGeo, capMat);
                capMesh.position.y = height - 0.06;
                capMesh.receiveShadow = true;
                capMesh.castShadow = false;
                group.add(capMesh);
            }
        }

        // Hex border lines removed for a clean, seamless map ("Xóa các đường xung quanh tất cả các ô đang có hiện tại")
        const defaultRimOpacity = 0.0;
        const rimMesh = null;

        let highlightRing = null;
        if (spec.navigable) {
            const hlGeo = new THREE.RingGeometry(this.hexRadius * 0.82, this.hexRadius * 0.98, 6);
            hlGeo.rotateX(-Math.PI / 2);
            hlGeo.rotateZ(Math.PI / 6);
            const hlMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide
            });
            highlightRing = new THREE.Mesh(hlGeo, hlMat);
            highlightRing.position.y = height - 0.05;
            group.add(highlightRing);
        }

        const surfaceY = height - 0.1;

        let reefPropGroup = null;
        if (spec.terrain === "reef" || spec.isReef) {
            reefPropGroup = ProceduralModels.createReefShoalModel(tileSeed);
            reefPropGroup.position.y = surfaceY;
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
                // Stage Clearing: automatically omit trees/decorations adjacent (dist <= 1) to any Monument, Port, or Resource!
                let minPoiDist = 99;
                if (this._poiHexCoords) {
                    for (let p = 0; p < this._poiHexCoords.length; p++) {
                        const d = World3D.hexDistance(spec, this._poiHexCoords[p]);
                        if (d < minPoiDist) minPoiDist = d;
                    }
                }
                if (minPoiDist > 1) {
                    const landDiorama = ProceduralModels.createLandHexDiorama(spec, surfaceY + 0.04, this.animatedLandProps);
                    landDiorama.scale.setScalar(minPoiDist === 2 ? 0.66 : 0.74);
                    landDiorama.position.x = x;
                    landDiorama.position.z = z;
                    this.staticDioramaGroup.add(landDiorama);
                }
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

        if (baseMesh) baseMesh.userData = { tile: tileObj };
        if (rimMesh) rimMesh.userData = { tile: tileObj };
        if (highlightRing) highlightRing.userData = { tile: tileObj };

        // Helper: Raised Emissive Hexagonal Pedestal Rim under Interactive POIs (zero extra lights!)
        const addPOIEmissiveRim = (colHex, emissiveHex) => {
            const rimGeo = new THREE.CylinderGeometry(this.hexRadius * 0.90, this.hexRadius * 0.96, 0.11, 6, 1, true);
            const rimMat = new THREE.MeshLambertMaterial({
                color: colHex,
                emissive: emissiveHex,
                emissiveIntensity: 0.85,
                side: THREE.DoubleSide
            });
            const pedRim = new THREE.Mesh(rimGeo, rimMat);
            pedRim.position.y = surfaceY + 0.055;
            pedRim.userData = { baseEmissiveIntensity: 0.85 };
            group.add(pedRim);
            tileObj.poiEmissiveRim = pedRim;
        };

        if (spec.monumentId) {
            const monData = window.GAME_DATA.monuments.find(m => m.id === spec.monumentId);
            const tier = tileObj.monumentTier;
            const monModel = ProceduralModels.createMonumentModel(monData.modelType, tier);
            monModel.position.y = surfaceY;
            group.add(monModel);
            tileObj.propModel = monModel;
            tileObj.monumentName = monData.name;
            tileObj.monumentVisualKey = "active||";

            // Tier-colored Emissive Base Rim for Monuments (Tier 1: Emerald, Tier 2: Gold, Tier 3: Orange-Red)
            const tierRimPalette = {
                1: { col: 0x34d399, em: 0x059669 },
                2: { col: 0xfde047, em: 0xd97706 },
                3: { col: 0xfb923c, em: 0xdc2626 }
            }[tier] || { col: 0xfde047, em: 0xd97706 };
            addPOIEmissiveRim(tierRimPalette.col, tierRimPalette.em);

            // Tiered Lightweight Ground Halo + Vertical Light Column (MeshBasicMaterial, AdditiveBlending, depthWrite: false, zero PointLight)
            const tierBeaconCfg = {
                1: { color: 0x34d399, haloColor: 0x10b981, height: 3.6, rTop: 0.14, rBot: 0.54, opacity: 0.16 },
                2: { color: 0xfde047, haloColor: 0xf59e0b, height: 5.4, rTop: 0.17, rBot: 0.62, opacity: 0.19 },
                3: { color: 0xfb923c, haloColor: 0xef4444, height: 7.2, rTop: 0.20, rBot: 0.72, opacity: 0.22 }
            }[tier] || { color: 0xfde047, haloColor: 0xf59e0b, height: 5.4, rTop: 0.17, rBot: 0.62, opacity: 0.19 };

            const glowGroup = new THREE.Group();
            glowGroup.position.y = surfaceY;

            const haloGeo = new THREE.RingGeometry(1.16, 1.58, 24);
            haloGeo.rotateX(-Math.PI / 2);
            const haloMat = new THREE.MeshBasicMaterial({
                color: tierBeaconCfg.haloColor,
                transparent: true,
                opacity: 0.42,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const outerHalo = new THREE.Mesh(haloGeo, haloMat);
            outerHalo.position.y = 0.08;
            glowGroup.add(outerHalo);

            const beaconGeo = new THREE.CylinderGeometry(tierBeaconCfg.rTop, tierBeaconCfg.rBot, tierBeaconCfg.height, 12, 1, true);
            const beaconMat = new THREE.MeshBasicMaterial({
                color: tierBeaconCfg.color,
                transparent: true,
                opacity: tierBeaconCfg.opacity,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
            beaconMesh.position.y = tierBeaconCfg.height * 0.5 + 0.12;
            glowGroup.add(beaconMesh);

            glowGroup.userData = {
                beaconMesh,
                outerHalo,
                baseColor: tierBeaconCfg.color,
                baseOpacity: tierBeaconCfg.opacity,
                tier,
                hiddenByState: false
            };
            group.add(glowGroup);
            tileObj.monumentGlowGroup = glowGroup;

            // Crisp 2D HTML Monument Label (replaces blurry 3D CanvasTexture sprite)
            tileObj.labelSprite = null;
            tileObj.iconSprite = null;
            this.setMonumentHtmlLabel(tileObj, { mode: "active" });

        } else if (spec.isPort) {
            const portModel = ProceduralModels.createTradePortModel(region.color, spec.regionId);
            portModel.position.y = surfaceY;
            group.add(portModel);
            tileObj.propModel = portModel;
            tileObj.portSpecialtyLabel = `${region.specialty.icon} ${region.specialty.shortName}`;
            tileObj.portVisualKey = "free|||0";

            // Emissive Base Rim for Trade Ports (dynamically recolored by Charter Owner!)
            addPOIEmissiveRim(0x38bdf8, 0x0284c7);

            // Wide Sea Halo Ring + Gold Outer Accent Ring (for player's own port) + Vertical Lighthouse Beam (zero PointLight!)
            const portGlowGroup = new THREE.Group();
            portGlowGroup.position.y = surfaceY;

            const seaHaloGeo = new THREE.RingGeometry(1.42, 1.92, 28);
            seaHaloGeo.rotateX(-Math.PI / 2);
            const seaHaloMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.42,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const seaHalo = new THREE.Mesh(seaHaloGeo, seaHaloMat);
            seaHalo.position.y = 0.07;
            portGlowGroup.add(seaHalo);

            const goldOuterGeo = new THREE.RingGeometry(1.92, 2.12, 28);
            goldOuterGeo.rotateX(-Math.PI / 2);
            const goldOuterMat = new THREE.MeshBasicMaterial({
                color: 0xfde047,
                transparent: true,
                opacity: 0.56,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const goldOuterHalo = new THREE.Mesh(goldOuterGeo, goldOuterMat);
            goldOuterHalo.position.y = 0.09;
            goldOuterHalo.visible = false;
            portGlowGroup.add(goldOuterHalo);

            const portBeaconGeo = new THREE.CylinderGeometry(0.15, 0.52, 5.2, 12, 1, true);
            const portBeaconMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.15,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const portBeaconMesh = new THREE.Mesh(portBeaconGeo, portBeaconMat);
            portBeaconMesh.position.y = 2.72;
            portGlowGroup.add(portBeaconMesh);

            portGlowGroup.userData = {
                seaHalo,
                goldOuterHalo,
                beaconMesh: portBeaconMesh,
                mode: "free",
                baseOpacity: 0.15
            };
            group.add(portGlowGroup);
            tileObj.portGlowGroup = portGlowGroup;

            // Crisp 2D HTML Trade Port Label (replaces blurry 3D CanvasTexture sprite)
            tileObj.labelSprite = null;
            tileObj.iconSprite = null;
            this.setPortHtmlLabel(tileObj, { mode: "free" });

        } else if (spec.resourceType) {
            const resModel = ProceduralModels.createResourceNodeModel(spec.resourceType);
            resModel.position.y = surfaceY;
            group.add(resModel);
            tileObj.propModel = resModel;

            // Resource-colored Emissive Base Rim
            const resStyle = {
                food: { col: 0xfacc15, em: 0xca8a04 },
                wood: { col: 0x4ade80, em: 0x15803d },
                iron: { col: 0xe2e8f0, em: 0x94a3b8 }
            }[spec.resourceType] || { col: 0xfacc15, em: 0xca8a04 };

            addPOIEmissiveRim(resStyle.col, resStyle.em);

            // Visual Hierarchy Tier 3: Resource Nodes show compact icon badge ONLY at distance (full name on hover!)
            const iconSprite = ProceduralModels.createCompactResourceIconSprite(spec.resourceType);
            iconSprite.position.set(0, surfaceY + 2.35, 0);
            group.add(iconSprite);
            tileObj.labelSprite = iconSprite;
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

        const npcModel = ProceduralModels.createFDIShipModel();
        npcModel.position.set(0, surfaceY, 0);
        chosen.group.add(npcModel);
        chosen.propModel = npcModel;
        this.cacheTilePropMeshes(chosen);

        const sprite = ProceduralModels.createLabelCanvas(
            "🚢 Tàu FDI Quốc Tế",
            "Thương Đoàn • +2~3 Xu",
            "rgba(8, 17, 34, 0.95)",
            "#fbbf24",
            2.45,
            0.60
        );
        sprite.position.set(0, surfaceY + 2.75, 0);
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
        this.clearHtmlLabels("ship");

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
            shipMesh.userData.wavePhase = Math.random() * Math.PI * 2;
            shipMesh.userData.isMoving = false;
            shipMesh.userData.moveSpeedNorm = 0;
            shipMesh.userData.turnBankRad = 0;
            shipMesh.userData.movePitchRad = 0;
            shipMesh.visible = !p.eliminated;
            this.scene.add(shipMesh);
            this.shipMeshes.set(shipKey, shipMesh);
            this.placeShipOnHexImmediate(p, p.q, p.r, idx, players.length);

            // Crisp 2D HTML Ship Name Label glued above mast (Player Name ONLY)
            const shipCol = p.color || "#38bdf8";
            const shipHtml = `<span class="map-lbl-dot" style="background:${shipCol}"></span><span>${p.name}</span>`;
            const shipEntry = this.registerHtmlLabel(
                `ship_${shipKey}`,
                "ship",
                `map-lbl-ship ${isLocal ? 'is-local' : ''}`,
                shipHtml,
                null,
                shipMesh,
                3.25
            );
            if (shipEntry && shipEntry.el && shipEntry.el.style && typeof shipEntry.el.style.setProperty === "function") {
                shipEntry.el.style.setProperty("--ship-color", shipCol);
            }
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
        shipMesh.userData.dockBaseY = dockPos.y;
        // At initial match spawn (before first move), orient ship bow toward the open sea (+X East)
        if (!shipMesh.userData.hasMovedYet) {
            shipMesh.rotation.y = Math.PI / 2;
        }
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

        const endPos = waypoints[waypoints.length - 1];
        const useCurve = waypoints.length >= 3 && typeof THREE.CatmullRomCurve3 === "function";
        const curve = useCurve ? new THREE.CatmullRomCurve3(waypoints, false, "centripetal", 0.5) : null;

        // Snappy total duration: ease-in -> steady cruise -> ease-out
        const totalDuration = Math.min(1850, Math.max(360, pathTiles.length * 320));
        const animToken = (shipMesh.userData._animToken || 0) + 1;
        shipMesh.userData._animToken = animToken;
        shipMesh.userData.isMoving = true;

        // Smooth trapezoidal cruise easing (first 20% ease-in, middle 60% steady, last 20% ease-out)
        const cruiseEase = (u) => {
            if (u <= 0) return 0;
            if (u >= 1) return 1;
            const a = 0.20;
            const norm = 1 / (1 - a); // 1.25
            if (u < a) return 0.5 * (u * u / a) * norm;
            if (u > 1 - a) {
                const r = 1 - u;
                return 1 - 0.5 * (r * r / a) * norm;
            }
            return (u - 0.5 * a) * norm;
        };

        const samplePoint = (s) => {
            if (curve) return curve.getPoint(s);
            return new THREE.Vector3().lerpVectors(waypoints[0], endPos, s);
        };

        const sampleTangent = (s) => {
            if (curve) return curve.getTangent(s);
            return new THREE.Vector3(endPos.x - waypoints[0].x, 0, endPos.z - waypoints[0].z);
        };

        window.SFX.playSail();
        const startTime = performance.now();
        let prevTime = startTime;
        let lastWakeTime = startTime;
        let currentYaw = shipMesh.rotation.y;
        let currentBank = 0;

        const step = (now) => {
            if (shipMesh.userData._animToken !== animToken) return;

            const dt = Math.min(0.05, Math.max(0.004, (now - prevTime) / 1000));
            prevTime = now;

            const u = Math.min(1, (now - startTime) / totalDuration);
            const s = cruiseEase(u);

            // Instantaneous speed profile (0 at start/end, ~1.0 at cruise)
            const eps = 0.01;
            const speedNorm = Math.min(1.2, Math.max(0, (cruiseEase(Math.min(1, u + eps)) - cruiseEase(Math.max(0, u - eps))) / (2 * eps)));

            // 1. Position along smooth CatmullRomCurve3
            const pos = samplePoint(s);
            shipMesh.position.set(pos.x, pos.y + Math.sin(u * Math.PI) * 0.05, pos.z);

            // 2. Shortest-angle Yaw lerp along curve tangent + Turn Banking (Roll 8°–12°) + Acceleration Pitch (~4°–6°)
            const tan = sampleTangent(Math.min(0.995, s));
            let yawDiff = 0;
            if (Math.hypot(tan.x, tan.z) > 0.005) {
                const targetYaw = -Math.atan2(tan.z, tan.x);
                yawDiff = ((targetYaw - currentYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                currentYaw += yawDiff * Math.min(1, dt * 13.0);
                shipMesh.rotation.y = currentYaw;
            }

            // Roll into turn up to ±11° (±0.19 rad), level out on straightaways
            const targetBank = Math.max(-0.20, Math.min(0.20, -yawDiff * 0.65 * speedNorm));
            currentBank += (targetBank - currentBank) * Math.min(1, dt * 10.0);

            shipMesh.userData.moveSpeedNorm = speedNorm;
            shipMesh.userData.turnBankRad = currentBank;
            shipMesh.userData.movePitchRad = 0.088 * speedNorm; // ~5° bow rise while cruising!

            // 3. Emit pooled V-shaped wake foam behind stern while moving
            if (speedNorm > 0.18 && (now - lastWakeTime) > 58) {
                lastWakeTime = now;
                this.spawnWakeParticle(shipMesh.position.x, pos.y, shipMesh.position.z, currentYaw, speedNorm);
            }

            if (u < 1) {
                requestAnimationFrame(step);
            } else {
                // Exact 100% arrival at destination tile center / berth
                shipMesh.position.copy(endPos);
                shipMesh.userData.dockBaseY = endPos.y;
                shipMesh.userData.isMoving = false;
                shipMesh.userData.moveSpeedNorm = 0;
                shipMesh.userData.turnBankRad = 0;
                shipMesh.userData.movePitchRad = 0;
                if (onComplete) onComplete();
            }
        };

        requestAnimationFrame(step);
    }

    createPathDestinationBadgeSprite(meta, isCustomDrawn = false) {
        if (typeof document === "undefined") return null;
        const canvas = document.createElement("canvas");
        const lines = [];
        const steps = meta.steps || 0;
        const apText = meta.isInfiniteMove ? "♾️ 0 AP" : `-${meta.apCost || 0} ⚡AP`;
        lines.push({
            text: `⛵ ${steps} ô • ${apText}`,
            color: "#ffffff",
            font: "900 32px 'Segoe UI', Roboto, sans-serif"
        });
        if ((meta.reefHits || 0) > 0) {
            lines.push({
                text: `⚠️ CHẠM ĐÁ NGẦM (-${meta.reefHits} ❤️)`,
                color: "#ff6b6b",
                font: "900 26px 'Segoe UI', Roboto, sans-serif"
            });
        }
        if (meta.portTaxMode === "blocked0") {
            lines.push({
                text: "⛔ Thiếu 1 Xu thuế",
                color: "#fca5a5",
                font: "900 25px 'Segoe UI', Roboto, sans-serif"
            });
        } else if (meta.portTaxMode === "pay1") {
            lines.push({
                text: "💰 Thuế cảng: 1 Xu",
                color: "#fde047",
                font: "800 25px 'Segoe UI', Roboto, sans-serif"
            });
        }
        if (meta.isLocked) {
            lines.push({
                text: "✅ Bấm lại ô này để đi • Chuột phải: Hủy",
                color: "#86efac",
                font: "900 23px 'Segoe UI', Roboto, sans-serif"
            });
        }

        canvas.width = meta.isLocked ? 620 : 520;
        canvas.height = 76 + (lines.length - 1) * 44;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        const hasDanger = (meta.reefHits || 0) > 0 || meta.portTaxMode === "blocked0";
        const borderHex = hasDanger ? "#ff2e2e" : (isCustomDrawn ? "#4ade80" : "#fde047");

        const x = 14, y = 10, w = canvas.width - 28, h = canvas.height - 20;
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 18);
        ctx.fillStyle = "rgba(11, 22, 42, 0.96)";
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 18);
        ctx.lineWidth = 6;
        ctx.strokeStyle = borderHex;
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0, 0, 0, 0.92)";
        ctx.shadowBlur = 5;

        lines.forEach((ln, idx) => {
            const cy = y + 32 + idx * 42;
            ctx.font = ln.font;
            ctx.fillStyle = ln.color;
            ctx.fillText(ln.text, canvas.width / 2, cy, w - 30);
        });

        const texture = new THREE.CanvasTexture(canvas);
        if (typeof ProceduralModels !== "undefined" && ProceduralModels.configureSharpCanvasTexture) {
            ProceduralModels.configureSharpCanvasTexture(texture, false);
        } else {
            texture.needsUpdate = true;
        }
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        const aspect = canvas.width / canvas.height;
        const scaleH = 0.56 + (lines.length - 1) * 0.28;
        sprite.scale.set(scaleH * aspect, scaleH, 1);
        sprite.renderOrder = 998;
        return sprite;
    }

    showPathPreview(pathTiles, isCustomDrawn = false) {
        this.clearPathPreview();
        if (!pathTiles || pathTiles.length === 0) return;

        // Fetch enriched path metadata (start tile, AP cost, reef hits, port tax, valid drag neighbors)
        const meta = (typeof this.getPathPreviewMeta === "function")
            ? this.getPathPreviewMeta(pathTiles, isCustomDrawn)
            : {
                fullPath: pathTiles,
                steps: Math.max(0, pathTiles.length - 1),
                apCost: Math.ceil(Math.max(0, pathTiles.length - 1) / 2),
                isInfiniteMove: false,
                reefHits: pathTiles.slice(1).filter(t => t && t.isReef).length,
                portTaxMode: "none",
                nextNeighbors: []
            };

        const fullPath = (meta && meta.fullPath && meta.fullPath.length > 0) ? meta.fullPath : pathTiles;
        const mainColor = isCustomDrawn ? 0x4ade80 : 0xfde047;
        const outlineColor = isCustomDrawn ? 0x052e16 : 0x0f172a;
        const dangerColor = 0xff2e2e;
        const dangerOutline = 0x450a0a;

        const animItems = { chevrons: [], targetOuterRing: null, targetCenterDot: null };
        let chevronCounter = 0;

        const baseY = (tile) => Math.max(tile && typeof tile.height === "number" ? tile.height : 0, 0) + 0.48;

        // 1. Valid next adjacent hex hints while custom dragging
        if (isCustomDrawn && meta && Array.isArray(meta.nextNeighbors) && meta.nextNeighbors.length > 0) {
            meta.nextNeighbors.forEach(nb => {
                const nbColor = nb.isReef ? dangerColor : 0x4ade80;
                const nbGeo = new THREE.RingGeometry(0.84, 0.96, 6);
                nbGeo.rotateX(-Math.PI / 2);
                nbGeo.rotateY(Math.PI / 6);
                const nbMat = new THREE.MeshBasicMaterial({
                    color: nbColor,
                    transparent: true,
                    opacity: nb.isReef ? 0.55 : 0.44,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const nbMesh = new THREE.Mesh(nbGeo, nbMat);
                nbMesh.position.set(nb.x, baseY(nb) - 0.03, nb.z);
                nbMesh.renderOrder = 845;
                this.pathPreviewGroup.add(nbMesh);
            });
        }

        // 2. Connected Wide Ribbon + Dark Contrast Underlay + Directional Chevrons between consecutive hexes
        for (let i = 0; i < fullPath.length - 1; i++) {
            const a = fullPath[i];
            const b = fullPath[i + 1];
            if (!a || !b) continue;

            const isDangerSeg = Boolean(b.isReef);
            const segColor = isDangerSeg ? dangerColor : mainColor;
            const segOutline = isDangerSeg ? dangerOutline : outlineColor;

            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const segLen = Math.hypot(dx, dz);
            if (segLen < 0.05) continue;

            const midX = (a.x + b.x) * 0.5;
            const midZ = (a.z + b.z) * 0.5;
            const segY = Math.max(baseY(a), baseY(b));
            const yaw = Math.atan2(dx, dz);

            // Dark contrast underlay ribbon (visible even in bright Sun / Sunset)
            const underGeo = new THREE.PlaneGeometry(0.62, segLen);
            underGeo.rotateX(-Math.PI / 2);
            const underMat = new THREE.MeshBasicMaterial({
                color: segOutline,
                transparent: true,
                opacity: 0.68,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const underMesh = new THREE.Mesh(underGeo, underMat);
            underMesh.position.set(midX, segY - 0.02, midZ);
            underMesh.rotation.y = yaw;
            underMesh.renderOrder = 850;
            this.pathPreviewGroup.add(underMesh);

            // Main bright ribbon strip (width 0.44)
            const stripGeo = new THREE.PlaneGeometry(0.44, segLen);
            stripGeo.rotateX(-Math.PI / 2);
            const stripMat = new THREE.MeshBasicMaterial({
                color: segColor,
                transparent: true,
                opacity: 0.92,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const stripMesh = new THREE.Mesh(stripGeo, stripMat);
            stripMesh.position.set(midX, segY + 0.01, midZ);
            stripMesh.rotation.y = yaw;
            stripMesh.renderOrder = 852;
            this.pathPreviewGroup.add(stripMesh);

            // Directional triangle Chevrons pointing from A -> B
            const chevFractions = [0.34, 0.68];
            chevFractions.forEach(frac => {
                const cx = a.x + dx * frac;
                const cz = a.z + dz * frac;
                // CircleGeometry(r, 3) has a vertex at +X; rotate flat so tip points along +Z before applying yaw
                const chevGeo = new THREE.CircleGeometry(0.24, 3);
                chevGeo.rotateX(-Math.PI / 2);
                chevGeo.rotateY(-Math.PI / 2);
                const chevMat = new THREE.MeshBasicMaterial({
                    color: isDangerSeg ? 0xffe4e6 : 0xffffff,
                    transparent: true,
                    opacity: 0.92,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const chevMesh = new THREE.Mesh(chevGeo, chevMat);
                chevMesh.position.set(cx, segY + 0.04, cz);
                chevMesh.rotation.y = yaw;
                chevMesh.renderOrder = 856;
                this.pathPreviewGroup.add(chevMesh);
                animItems.chevrons.push({ mesh: chevMesh, orderIdx: chevronCounter++ });
            });
        }

        // 3. Intermediate Waypoint Rings & Final 2-Layer Target Reticle
        const lastIdx = fullPath.length - 1;
        fullPath.forEach((t, idx) => {
            if (!t) return;
            const ty = baseY(t);
            const isDangerHex = Boolean(t.isReef) && idx > 0;
            const nodeColor = isDangerHex ? dangerColor : mainColor;
            const nodeOutline = isDangerHex ? dangerOutline : outlineColor;

            if (idx > 0 && idx < lastIdx) {
                // Intermediate hex: dark backing + bright circular ring + center dot
                const backGeo = new THREE.RingGeometry(0.30, 0.62, 20);
                backGeo.rotateX(-Math.PI / 2);
                const backMesh = new THREE.Mesh(
                    backGeo,
                    new THREE.MeshBasicMaterial({ color: nodeOutline, transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthWrite: false })
                );
                backMesh.position.set(t.x, ty - 0.01, t.z);
                backMesh.renderOrder = 858;
                this.pathPreviewGroup.add(backMesh);

                const ringGeo = new THREE.RingGeometry(0.36, 0.56, 20);
                ringGeo.rotateX(-Math.PI / 2);
                const ringMesh = new THREE.Mesh(
                    ringGeo,
                    new THREE.MeshBasicMaterial({ color: nodeColor, transparent: true, opacity: 0.96, side: THREE.DoubleSide, depthWrite: false })
                );
                ringMesh.position.set(t.x, ty + 0.02, t.z);
                ringMesh.renderOrder = 860;
                this.pathPreviewGroup.add(ringMesh);

                const dotGeo = new THREE.CircleGeometry(0.16, 16);
                dotGeo.rotateX(-Math.PI / 2);
                const dotMesh = new THREE.Mesh(
                    dotGeo,
                    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96, side: THREE.DoubleSide, depthWrite: false })
                );
                dotMesh.position.set(t.x, ty + 0.03, t.z);
                dotMesh.renderOrder = 862;
                this.pathPreviewGroup.add(dotMesh);
            } else if (idx === lastIdx && (meta.steps > 0 || isCustomDrawn)) {
                // Final Destination Hex: 2-Layer Rotating Target Reticle + Bright Center Dot
                const destDanger = Boolean(t.isReef) || (meta && meta.portTaxMode === "blocked0");
                const reticleColor = destDanger ? dangerColor : mainColor;
                const reticleOutline = destDanger ? dangerOutline : outlineColor;

                const backGeo = new THREE.RingGeometry(0.62, 0.96, 6);
                backGeo.rotateX(-Math.PI / 2);
                const backMesh = new THREE.Mesh(
                    backGeo,
                    new THREE.MeshBasicMaterial({ color: reticleOutline, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false })
                );
                backMesh.position.set(t.x, ty, t.z);
                backMesh.renderOrder = 864;
                this.pathPreviewGroup.add(backMesh);

                const outerGeo = new THREE.RingGeometry(0.68, 0.90, 6);
                outerGeo.rotateX(-Math.PI / 2);
                const outerMesh = new THREE.Mesh(
                    outerGeo,
                    new THREE.MeshBasicMaterial({ color: reticleColor, transparent: true, opacity: 0.98, side: THREE.DoubleSide, depthWrite: false })
                );
                outerMesh.position.set(t.x, ty + 0.03, t.z);
                outerMesh.renderOrder = 868;
                this.pathPreviewGroup.add(outerMesh);
                animItems.targetOuterRing = outerMesh;

                const innerDotGeo = new THREE.CircleGeometry(0.24, 18);
                innerDotGeo.rotateX(-Math.PI / 2);
                const innerDotMesh = new THREE.Mesh(
                    innerDotGeo,
                    new THREE.MeshBasicMaterial({ color: destDanger ? 0xffe4e6 : 0xffffff, transparent: true, opacity: 0.98, side: THREE.DoubleSide, depthWrite: false })
                );
                innerDotMesh.position.set(t.x, ty + 0.04, t.z);
                innerDotMesh.renderOrder = 870;
                this.pathPreviewGroup.add(innerDotMesh);
                animItems.targetCenterDot = innerDotMesh;

                // Floating Sprite Badge above destination hex (Steps + AP + Reef/Tax warnings)
                if (meta && meta.steps > 0) {
                    const badge = this.createPathDestinationBadgeSprite(meta, isCustomDrawn);
                    if (badge) {
                        badge.position.set(t.x, ty + 1.55, t.z);
                        this.pathPreviewGroup.add(badge);
                    }
                }
            }
        });

        this.pathPreviewAnimItems = animItems;
    }

    clearPathPreview() {
        while (this.pathPreviewGroup.children.length > 0) {
            const child = this.pathPreviewGroup.children[0];
            this.pathPreviewGroup.remove(child);
            if (child.geometry && typeof child.geometry.dispose === "function") {
                child.geometry.dispose();
            }
            if (child.material) {
                if (child.material.map && typeof child.material.map.dispose === "function") {
                    child.material.map.dispose();
                }
                if (typeof child.material.dispose === "function") {
                    child.material.dispose();
                }
            }
        }
        this.pathPreviewAnimItems = null;
    }

    // (spawnWakeParticle is now object-pooled above in initWakePool)

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
            if (!tile.highlightRing) return;
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

    getSharedStormMineAssets() {
        if (this._stormMineAssets) return this._stormMineAssets;
        const outerRingGeo = new THREE.RingGeometry(1.26, 1.54, 24);
        outerRingGeo.rotateX(-Math.PI / 2);
        const innerRingGeo = new THREE.RingGeometry(1.06, 1.25, 24);
        innerRingGeo.rotateX(-Math.PI / 2);
        const cloudPuffGeo = (typeof THREE.DodecahedronGeometry !== "undefined")
            ? new THREE.DodecahedronGeometry(0.32, 0)
            : new THREE.SphereGeometry(0.32, 6, 6);

        const outerRingMat = new THREE.MeshBasicMaterial({
            color: 0xe11d48,
            transparent: true,
            opacity: 0.78,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const innerRingMat = new THREE.MeshBasicMaterial({
            color: 0x9333ea,
            transparent: true,
            opacity: 0.62,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const cloudMat = new THREE.MeshLambertMaterial({
            color: 0x1e293b,
            emissive: 0x3b0764,
            emissiveIntensity: 0.35,
            flatShading: true
        });
        this._stormMineAssets = { outerRingGeo, innerRingGeo, cloudPuffGeo, outerRingMat, innerRingMat, cloudMat };
        return this._stormMineAssets;
    }

    updateResourceVisuals() {
        this.hexTiles.forEach(tile => {
            if (tile.resourceType && tile.propModel) {
                const depleted = tile.resourceCooldown > 0;
                tile.propModel.position.y = (tile.height - 0.1) - (depleted ? 0.12 : 0);

                const stormLabelId = `storm_mine_${tile.q}_${tile.r}`;
                // Mục 4B: Lightweight 3D Red-Purple Warning Ring + Spinning Dark Storm Cloud + Always-Visible 2D HTML Badge
                if (tile.stormRestricted) {
                    if (!tile.stormRestrictGroup) {
                        const assets = this.getSharedStormMineAssets();
                        const restrictGroup = new THREE.Group();
                        restrictGroup.position.y = tile.height + 0.06;

                        const outerRing = new THREE.Mesh(assets.outerRingGeo, assets.outerRingMat);
                        outerRing.renderOrder = 40;
                        const innerRing = new THREE.Mesh(assets.innerRingGeo, assets.innerRingMat);
                        innerRing.position.y = 0.02;
                        innerRing.renderOrder = 41;
                        restrictGroup.add(outerRing, innerRing);

                        const cloudCluster = new THREE.Group();
                        cloudCluster.position.y = 1.92;
                        const puffOffsets = [
                            [0, 0.14, 0, 1.15],
                            [-0.36, 0.0, 0.14, 0.85],
                            [0.34, -0.02, -0.12, 0.90]
                        ];
                        puffOffsets.forEach(([px, py, pz, sc]) => {
                            const puff = new THREE.Mesh(assets.cloudPuffGeo, assets.cloudMat);
                            puff.position.set(px, py, pz);
                            puff.scale.set(sc * 1.25, sc * 0.72, sc);
                            puff.castShadow = false;
                            cloudCluster.add(puff);
                        });
                        restrictGroup.add(cloudCluster);
                        restrictGroup.userData = { outerRing, innerRing, cloudCluster };

                        tile.group.add(restrictGroup);
                        tile.stormRestrictGroup = restrictGroup;
                    }
                    // Always-visible 2D HTML warning badge on #map-labels-layer
                    this.registerHtmlLabel(
                        stormLabelId,
                        "storm_mine",
                        "map-lbl-storm-mine",
                        "⛈️ PHONG TỎA",
                        new THREE.Vector3(tile.x, (tile.height || 0.22) + 2.85, tile.z)
                    );
                } else {
                    if (tile.stormRestrictGroup) {
                        tile.group.remove(tile.stormRestrictGroup);
                        tile.stormRestrictGroup = null;
                    }
                    if (this.htmlLabels && this.htmlLabels.has(stormLabelId)) {
                        const ent = this.htmlLabels.get(stormLabelId);
                        if (ent && ent.el && ent.el.parentNode) ent.el.parentNode.removeChild(ent.el);
                        this.htmlLabels.delete(stormLabelId);
                    }
                }
            }
        });
    }

    updateMonumentVisuals(earlyLockActive = false, conquerorsMap = {}) {
        const tierRimPalette = {
            1: { col: 0x34d399, em: 0x059669 },
            2: { col: 0xfde047, em: 0xd97706 },
            3: { col: 0xfb923c, em: 0xdc2626 }
        };

        this.hexTiles.forEach(tile => {
            if (!tile.monumentId) return;
            const tier = tile.monumentTier || 1;
            const conqueror = (conquerorsMap && conquerorsMap[tile.monumentId]) || tile.monumentConqueror || null;

            let mode = "active";
            let conquerorName = "";
            let conquerorColor = "";
            if (conqueror && conqueror.name) {
                mode = "conquered";
                conquerorName = conqueror.name;
                conquerorColor = conqueror.color || "#34d399";
            } else if (earlyLockActive && tier >= 2) {
                mode = "early_locked";
            }

            const cacheKey = `${mode}|${tier}|${conquerorName}|${conquerorColor}`;
            if (tile.monumentVisualKey === cacheKey) return;
            tile.monumentVisualKey = cacheKey;

            // 1. Toggle Light Column & Ground Halo visibility by state
            if (tile.monumentGlowGroup && tile.monumentGlowGroup.userData) {
                const gd = tile.monumentGlowGroup.userData;
                const hideGlow = (mode !== "active");
                gd.hiddenByState = hideGlow;
                if (gd.beaconMesh) gd.beaconMesh.visible = !hideGlow;
                if (gd.outerHalo) gd.outerHalo.visible = !hideGlow;
            }

            // 2. Update Base Emissive Rim color (conqueror ship color / steel gray / tier color)
            if (tile.poiEmissiveRim && tile.poiEmissiveRim.material) {
                if (mode === "conquered") {
                    const cHex = new THREE.Color(conquerorColor);
                    tile.poiEmissiveRim.material.color.copy(cHex);
                    if (tile.poiEmissiveRim.material.emissive) tile.poiEmissiveRim.material.emissive.copy(cHex);
                } else if (mode === "early_locked") {
                    tile.poiEmissiveRim.material.color.setHex(0x64748b);
                    if (tile.poiEmissiveRim.material.emissive) tile.poiEmissiveRim.material.emissive.setHex(0x334155);
                } else {
                    const pal = tierRimPalette[tier] || tierRimPalette[1];
                    tile.poiEmissiveRim.material.color.setHex(pal.col);
                    if (tile.poiEmissiveRim.material.emissive) tile.poiEmissiveRim.material.emissive.setHex(pal.em);
                }
            }

            // 3. Update crisp 2D HTML Monument Label
            this.setMonumentHtmlLabel(tile, { mode, conquerorName, conquerorColor });
        });
    }

    updatePortOwnershipVisuals(portStatesMap = {}) {
        this.hexTiles.forEach(tile => {
            if (!tile.isPort) return;
            const st = portStatesMap[tile.regionId] || { mode: "free", ownerName: "", ownerColor: "#38bdf8", needsCoinWarning: false };
            const mode = st.mode || "free";
            const ownerName = st.ownerName || "";
            const ownerColor = st.ownerColor || "#38bdf8";
            const needsWarn = st.needsCoinWarning ? "1" : "0";
            const cacheKey = `${mode}|${ownerName}|${ownerColor}|${needsWarn}`;
            if (tile.portVisualKey === cacheKey) return;
            tile.portVisualKey = cacheKey;

            // 1. Sea Halo Ring, Gold Outer Accent & Vertical Lighthouse Beam
            if (tile.portGlowGroup && tile.portGlowGroup.userData) {
                const pg = tile.portGlowGroup.userData;
                pg.mode = mode;
                if (mode === "mine") {
                    pg.baseOpacity = 0.21;
                    if (pg.seaHalo && pg.seaHalo.material) pg.seaHalo.material.color.setHex(0x22c55e);
                    if (pg.goldOuterHalo) pg.goldOuterHalo.visible = true;
                    if (pg.beaconMesh && pg.beaconMesh.material) pg.beaconMesh.material.color.setHex(0x22c55e);
                } else if (mode === "free") {
                    pg.baseOpacity = 0.15;
                    if (pg.seaHalo && pg.seaHalo.material) pg.seaHalo.material.color.setHex(0x38bdf8);
                    if (pg.goldOuterHalo) pg.goldOuterHalo.visible = false;
                    if (pg.beaconMesh && pg.beaconMesh.material) pg.beaconMesh.material.color.setHex(0x38bdf8);
                } else {
                    pg.baseOpacity = 0.16;
                    const c = new THREE.Color(st.needsCoinWarning ? "#ef4444" : ownerColor);
                    if (pg.seaHalo && pg.seaHalo.material) pg.seaHalo.material.color.copy(c);
                    if (pg.goldOuterHalo) pg.goldOuterHalo.visible = false;
                    if (pg.beaconMesh && pg.beaconMesh.material) pg.beaconMesh.material.color.copy(c);
                }
            }

            // 2. Base Emissive Rim Color
            if (tile.poiEmissiveRim && tile.poiEmissiveRim.material) {
                if (mode === "mine") {
                    tile.poiEmissiveRim.material.color.setHex(0x22c55e);
                    if (tile.poiEmissiveRim.material.emissive) tile.poiEmissiveRim.material.emissive.setHex(0x16a34a);
                } else if (mode === "free") {
                    tile.poiEmissiveRim.material.color.setHex(0x38bdf8);
                    if (tile.poiEmissiveRim.material.emissive) tile.poiEmissiveRim.material.emissive.setHex(0x0284c7);
                } else {
                    const c = new THREE.Color(st.needsCoinWarning ? "#ef4444" : ownerColor);
                    tile.poiEmissiveRim.material.color.copy(c);
                    if (tile.poiEmissiveRim.material.emissive) tile.poiEmissiveRim.material.emissive.copy(c);
                }
            }

            // 3. Harbor Flagpole Flag Color (Mine = own ship color, Free = white & blue, Other = owner ship color)
            if (tile.propModel && tile.propModel.userData && tile.propModel.userData.ownerFlagMat) {
                const ud = tile.propModel.userData;
                if (mode === "free") {
                    ud.ownerFlagMat.color.setHex(0xffffff);
                    if (ud.ownerFlagMat.emissive) ud.ownerFlagMat.emissive.setHex(0x38bdf8);
                    if (ud.ownerFlagAccentMat) {
                        ud.ownerFlagAccentMat.color.setHex(0x0284c7);
                        if (ud.ownerFlagAccentMat.emissive) ud.ownerFlagAccentMat.emissive.setHex(0x38bdf8);
                    }
                } else {
                    const shipCol = new THREE.Color(ownerColor);
                    ud.ownerFlagMat.color.copy(shipCol);
                    if (ud.ownerFlagMat.emissive) ud.ownerFlagMat.emissive.copy(shipCol);
                    if (ud.ownerFlagAccentMat) {
                        const accentCol = mode === "mine" ? new THREE.Color(0xfde047) : new THREE.Color(0xffffff);
                        ud.ownerFlagAccentMat.color.copy(accentCol);
                        if (ud.ownerFlagAccentMat.emissive) ud.ownerFlagAccentMat.emissive.copy(accentCol);
                    }
                }
            }

            // 4. Update crisp 2D HTML Trade Port Ownership Label
            this.setPortHtmlLabel(tile, st);
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
            if (this.lobbyCamera) {
                this.lobbyCamera.aspect = w / h;
                this.lobbyCamera.updateProjectionMatrix();
            }
            this.renderer.setPixelRatio(this.getOptimalPixelRatio());
            this.renderer.setSize(w, h);
        });

        // Smooth pointer parallax input for Golden Sunset Lobby Scene
        window.addEventListener("pointermove", (ev) => {
            if (!this.menuOrbitMode) return;
            const ww = window.innerWidth || 1;
            const wh = window.innerHeight || 1;
            this.lobbyMouseX = ((ev.clientX / ww) - 0.5) * 2;
            this.lobbyMouseY = ((ev.clientY / wh) - 0.5) * 2;
        }, { passive: true });

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
            const activeEl = (typeof document !== "undefined") ? document.activeElement : null;
            const activeTag = activeEl ? String(activeEl.tagName || "").toUpperCase() : "";
            const isTypingInField = Boolean(
                activeTag === "INPUT" ||
                activeTag === "TEXTAREA" ||
                (activeEl && activeEl.isContentEditable)
            );
            if (isTypingInField) {
                if (!isDown) {
                    this.keyState.w = this.keyState.s = this.keyState.a = this.keyState.d = false;
                }
                return;
            }
            const code = e.code || "";
            const key = (e.key || "").toLowerCase();
            if (code === "KeyW" || key === "w" || code === "ArrowUp") this.keyState.w = isDown;
            if (code === "KeyS" || key === "s" || code === "ArrowDown") this.keyState.s = isDown;
            if (code === "KeyA" || key === "a" || code === "ArrowLeft") this.keyState.a = isDown;
            if (code === "KeyD" || key === "d" || code === "ArrowRight") this.keyState.d = isDown;
            if (isDown && (code === "Escape" || key === "escape")) {
                if (this.isPathLocked && this.onCancelLockedPath) {
                    this.onCancelLockedPath();
                }
            }
            if (isDown && !e.repeat && (code === "KeyL" || key === "l")) {
                if (typeof window !== "undefined" && window.GAME && typeof window.GAME.cycleMapLabelMode === "function") {
                    window.GAME.cycleMapLabelMode();
                }
            }
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

        let rightDownPos = null;
        this.renderer.domElement.addEventListener("contextmenu", (e) => {
            e.preventDefault();
        });

        this.renderer.domElement.addEventListener("pointerdown", (e) => {
            // Right-click tracking (< 6px drag = cancel locked path; >= 6px = normal camera orbit)
            if (e.button === 2) {
                rightDownPos = { x: e.clientX, y: e.clientY };
                return;
            }
            // Only left mouse button / touch triggers hex click & custom path drawing
            if (e.button !== 0) return;

            pointerDownPos = { x: e.clientX, y: e.clientY };
            const tile = pickTileAtClientPos(e.clientX, e.clientY);
            pointerDownTile = tile;
            isLeftPointerDown = true;
            this.hasDraggedToOtherHex = false;
        });

        this.renderer.domElement.addEventListener("pointermove", (e) => {
            const now = performance.now();
            // Throttle hover raycast to 40ms (30-50ms target) for low CPU usage
            if (!this.isDrawingCustomPath && !isLeftPointerDown) {
                if (now - lastHoverRaycastTime < 40) return;
            }
            lastHoverRaycastTime = now;

            const tile = pickTileAtClientPos(e.clientX, e.clientY);

            // A. Active custom path drawing while holding left mouse button
            if (this.isDrawingCustomPath) {
                if (tile && tile.navigable && this.onCustomPathStep) {
                    if (pointerDownTile && (tile.q !== pointerDownTile.q || tile.r !== pointerDownTile.r)) {
                        this.hasDraggedToOtherHex = true;
                    }
                    this.onCustomPathStep(tile);
                }
                return;
            }

            // B. Hold Left-Click + Drag across navigable hexes starts custom manual path drawing
            if (isLeftPointerDown && pointerDownTile && pointerDownTile.navigable && tile && tile.navigable) {
                const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
                if ((tile.q !== pointerDownTile.q || tile.r !== pointerDownTile.r) && moveDist > 14 && this.onCustomPathStart) {
                    const started = this.onCustomPathStart(pointerDownTile);
                    if (started) {
                        this.isDrawingCustomPath = true;
                        this.hasDraggedToOtherHex = true;
                        try {
                            this.renderer.domElement.setPointerCapture(e.pointerId);
                        } catch (_) {}
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
                        // When a path is locked, NEVER overwrite or clear the locked 3D path preview on hover!
                        if (!this.isPathLocked) {
                            this.showPathPreview(this.reachablePaths.get(key).path, false);
                        }
                    } else {
                        tile.highlightRing.material.opacity = 0.0;
                        if (!this.isPathLocked) {
                            this.clearPathPreview();
                        }
                    }

                    if (!this.menuOrbitMode && this.onHexHover) this.onHexHover(tile, e.clientX, e.clientY);
                }
            } else if (this.hoveredHex) {
                if (this.hoveredHex.highlightRing) {
                    this.hoveredHex.highlightRing.material.opacity = 0.0;
                }
                this.hoveredHex = null;
                this.renderer.domElement.style.cursor = "default";
                if (!this.isPathLocked) {
                    this.clearPathPreview();
                }
                if (this.onHexHover) this.onHexHover(null, 0, 0);
            }
        });

        this.renderer.domElement.addEventListener("pointerup", (e) => {
            // Right-click (< 6px movement) cancels locked move path without interfering with camera orbit!
            if (e.button === 2) {
                if (rightDownPos) {
                    const rDist = Math.hypot(e.clientX - rightDownPos.x, e.clientY - rightDownPos.y);
                    rightDownPos = null;
                    if (rDist < 6 && this.isPathLocked && this.onCancelLockedPath) {
                        this.onCancelLockedPath();
                    }
                }
                return;
            }
            if (e.button !== 0) return;
            isLeftPointerDown = false;
            try {
                this.renderer.domElement.releasePointerCapture(e.pointerId);
            } catch (_) {}

            if (this.isDrawingCustomPath) {
                this.isDrawingCustomPath = false;
                this.isClickDrawMode = false;
                // Releasing drag LOCKS the drawn custom path (does NOT move ship immediately!)
                if (this.onCustomPathCommit) {
                    this.onCustomPathCommit();
                }
                return;
            }

            const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
            if (moveDist > 28) return;

            const tile = pickTileAtClientPos(e.clientX, e.clientY);
            if (!this.menuOrbitMode && tile && this.onHexClick) {
                this.onHexClick(tile);
            }
        });
    }

    // ------------------------------------------------------------------------
    // 3D FLOATING QUICK EMOTE SPEECH BUBBLE ABOVE SHIP (3.5s, ZERO POINTLIGHT)
    // ------------------------------------------------------------------------
    showShipEmoteBubble(shipKey, text, durationMs = 3500) {
        if (!this.shipMeshes || !shipKey || !text) return;
        const shipMesh = this.shipMeshes.get(shipKey);
        if (!shipMesh) return;

        // Remove any existing emote bubble on this ship
        if (shipMesh.userData.emoteBubble) {
            shipMesh.remove(shipMesh.userData.emoteBubble);
            if (shipMesh.userData.emoteTimer) {
                clearTimeout(shipMesh.userData.emoteTimer);
            }
            shipMesh.userData.emoteBubble = null;
        }

        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 148;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, 512, 148);

        // Cream parchment bubble with navy-gold border + bottom pointer triangle
        ctx.fillStyle = "rgba(15, 41, 66, 0.94)";
        ctx.strokeStyle = "#f4cd68";
        ctx.lineWidth = 6;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(18, 14, 476, 98, 28);
        } else {
            ctx.rect(18, 14, 476, 98);
        }
        ctx.fill();
        ctx.stroke();

        // Pointer triangle
        ctx.beginPath();
        ctx.moveTo(234, 112);
        ctx.lineTo(256, 140);
        ctx.lineTo(278, 112);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.font = "800 34px 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fef3c7";
        ctx.fillText(String(text).slice(0, 26), 256, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const spMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spMat);
        sprite.scale.set(4.2, 1.22, 1);
        sprite.position.set(0, 4.55, 0);
        sprite.renderOrder = 30;
        shipMesh.add(sprite);
        shipMesh.userData.emoteBubble = sprite;

        shipMesh.userData.emoteTimer = setTimeout(() => {
            if (shipMesh.userData.emoteBubble === sprite) {
                shipMesh.remove(sprite);
                shipMesh.userData.emoteBubble = null;
            }
        }, durationMs);
    }

    startRenderLoop() {
        const animate = () => {
            requestAnimationFrame(animate);
            const delta = Math.min(0.05, this.clock.getDelta());
            const elapsed = this.clock.getElapsedTime();
            const now = performance.now();
            this._frameCount = (this._frameCount || 0) + 1;

            // SHARED SINGLE WebGLRenderer: When on Main Menu / Pre-Match Lobby, render ONLY lobbyScene for locked 60 FPS!
            if (this.menuOrbitMode && this.lobbyScene && this.lobbyCamera) {
                this.updateLobbySunsetScene(elapsed, delta);
                this.renderer.render(this.lobbyScene, this.lobbyCamera);
                return;
            }

            const isSmoothMode = this.graphicsQuality === "smooth";
            const showWildlife = !this.minimalistMode && !isSmoothMode;

            // 1. Dynamic Ocean Waves (30Hz vertex update in Pretty mode; zero-CPU swell in Smooth mode)
            if (this.oceanMesh) {
                const amp = this.waveMultiplier || 1.0;
                if (isSmoothMode) {
                    this.oceanMesh.position.y = -0.22 + Math.sin(elapsed * 1.1) * 0.04 * amp;
                } else if (this._frameCount % 2 === 0) {
                    const pos = this.oceanMesh.geometry.attributes.position;
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
            }

            if (showWildlife) {
                this.foamRings.forEach(f => {
                    const s = 0.8 + Math.sin(elapsed * f.speed + f.phase) * 0.35;
                    f.mesh.scale.set(s, s, s);
                    f.mesh.material.opacity = 0.12 + Math.sin(elapsed * f.speed + f.phase) * 0.10;
                });
            }

            // 1a. Smooth ~2s Weather Color/Lighting Interpolation (Zero allocations!)
            if (this._weatherLerpElapsed < this._weatherLerpDuration) {
                this._weatherLerpElapsed = Math.min(this._weatherLerpDuration, this._weatherLerpElapsed + delta);
                const rawP = this._weatherLerpElapsed / this._weatherLerpDuration;
                const t = rawP * rawP * (3 - 2 * rawP); // Smoothstep easing
                const f = this._weatherFrom;
                const to = this._weatherTo;

                this.scene.background.copy(f.bg).lerp(to.bg, t);
                this.scene.fog.color.copy(f.fog).lerp(to.fog, t);
                if (this.oceanMesh && this.oceanMesh.material) {
                    this.oceanMesh.material.color.copy(f.oceanCol).lerp(to.oceanCol, t);
                    if (this.oceanMesh.material.emissive) {
                        this.oceanMesh.material.emissive.copy(f.oceanEm).lerp(to.oceanEm, t);
                    }
                    this.oceanMesh.material.emissiveIntensity = f.oceanEmInt + (to.oceanEmInt - f.oceanEmInt) * t;
                }
                this.hemiLight.color.copy(f.hemiSky).lerp(to.hemiSky, t);
                this.hemiLight.groundColor.copy(f.hemiGround).lerp(to.hemiGround, t);
                this.hemiLight.intensity = f.hemiInt + (to.hemiInt - f.hemiInt) * t;
                this.sunLight.color.copy(f.sunCol).lerp(to.sunCol, t);
                this._baseSunIntensity = f.sunInt + (to.sunInt - f.sunInt) * t;
                this.sunLight.position.lerpVectors(f.sunPos, to.sunPos, t);
                if (this.sunGroup && this.sunCoreMat && this.sunGlowMat) {
                    this.sunGroup.position.lerpVectors(f.sunObjPos, to.sunObjPos, t);
                    const sScale = f.sunObjScale + (to.sunObjScale - f.sunObjScale) * t;
                    this.sunGroup.scale.setScalar(sScale);
                    this.sunCoreMat.color.copy(f.sunCoreCol).lerp(to.sunCoreCol, t);
                    this.sunGlowMat.color.copy(f.sunGlowCol).lerp(to.sunGlowCol, t);
                    const coreOp = f.sunCoreOp + (to.sunCoreOp - f.sunCoreOp) * t;
                    const glowOp = f.sunGlowOp + (to.sunGlowOp - f.sunGlowOp) * t;
                    this.sunCoreMat.opacity = coreOp;
                    this.sunGlowMat.opacity = glowOp;
                    this.sunGroup.visible = (coreOp > 0.01 || glowOp > 0.01);
                }
                this.cloudMaterial.color.copy(f.cloudCol).lerp(to.cloudCol, t);
                this.cloudMaterial.opacity = f.cloudOp + (to.cloudOp - f.cloudOp) * t;
                this.starField.material.opacity = f.starsOp + (to.starsOp - f.starsOp) * t;
                if (this.rainField) {
                    this.rainField.material.opacity = f.rainOp + (to.rainOp - f.rainOp) * t;
                }
                this.waveMultiplier = f.waveAmp + (to.waveAmp - f.waveAmp) * t;

                this._curSkyTop.copy(f.skyTop).lerp(to.skyTop, t);
                this._curSkyMid.copy(f.skyMid).lerp(to.skyMid, t);
                this._curSkyBot.copy(f.skyBot).lerp(to.skyBot, t);
                if (this._frameCount % 2 === 0 || rawP >= 1.0) {
                    this.updateSkyDomeGradient(this._curSkyTop, this._curSkyMid, this._curSkyBot);
                }
            }

            // 1a-ii. Subtle Lightning Flash during Thunderstorm & Super Typhoon Yagi (120ms pulse to ~2.1, every 6-11s)
            if (this.weatherMode === "thunderstorm" || this.weatherMode === "super_typhoon_yagi") {
                if (this._nextLightningAt > 0 && now >= this._nextLightningAt) {
                    this._lightningEndAt = now + 120;
                    this._nextLightningAt = now + 6000 + Math.random() * 5000;
                }
                if (now < this._lightningEndAt) {
                    const remain = (this._lightningEndAt - now) / 120;
                    this.sunLight.intensity = this._baseSunIntensity + (2.1 - this._baseSunIntensity) * remain;
                } else {
                    this.sunLight.intensity = this._baseSunIntensity;
                }
            } else {
                this.sunLight.intensity = this._baseSunIntensity;
            }

            // 1b. Unified Rain & Storm Particle Field (1 THREE.Points BufferGeometry, wind-slanted in Storm/Yagi)
            if (this.rainField && this.rainField.material.opacity > 0.01) {
                const rPos = this.rainField.geometry.attributes.position;
                const isYagi = this.weatherMode === "super_typhoon_yagi";
                const isStorm = this.weatherMode === "thunderstorm";
                const fallSpeed = (isYagi ? 38 : (isStorm ? 31 : 25)) * delta;
                const windDriftX = (isYagi ? -16 : (isStorm ? -10 : -3.5)) * delta;
                const windDriftZ = (isYagi ? 6.5 : (isStorm ? 4.2 : 1.0)) * delta;
                for (let i = 0; i < rPos.count; i++) {
                    let y = rPos.getY(i) - fallSpeed;
                    let x = rPos.getX(i) + windDriftX;
                    let z = rPos.getZ(i) + windDriftZ;
                    if (y < 0 || x < -95 || z > 95) {
                        y = 52 + Math.random() * 5;
                        x = (Math.random() - 0.5) * 190;
                        z = (Math.random() - 0.5) * 190;
                    }
                    rPos.setY(i, y);
                    rPos.setX(i, x);
                    rPos.setZ(i, z);
                }
                rPos.needsUpdate = true;
            }

            // 2. Sky Clouds (Single InstancedMesh updated cleanly)
            if (this.cloudsVisible && !isSmoothMode && this.cloudInstancedMesh) {
                for (let i = 0; i < this.clouds.length; i++) {
                    const c = this.clouds[i];
                    c.x += c.speed * 0.012;
                    c.y += Math.sin(elapsed * 0.8 + c.bobOffset) * 0.002;
                    if (c.x > 85) c.x = -85;
                }
                this.updateCloudInstances(elapsed);
            }

            if (showWildlife) {
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

                // 7. Flapping Seagull Flocks (Elliptical orbits, nose accurately aligned to flight tangent!)
                this.ambientSeagulls.forEach(sg => {
                    const ang = elapsed * sg.speed + sg.phase;
                    const rx = sg.rx || sg.r || 12;
                    const rz = sg.rz || sg.r || 9;
                    const nx = sg.cx + Math.cos(ang) * rx;
                    const nz = sg.cz + Math.sin(ang) * rz;
                    const vx = -Math.sin(ang) * rx;
                    const vz = Math.cos(ang) * rz;
                    sg.mesh.position.x = nx;
                    sg.mesh.position.z = nz;
                    sg.mesh.position.y = sg.y + Math.sin(elapsed * 1.2 + sg.phase) * 0.40;
                    sg.mesh.rotation.y = -Math.atan2(vz, vx);
                    const birdWings = sg.wings || sg.birds;
                    if (Array.isArray(birdWings)) {
                        birdWings.forEach((b, bIdx) => {
                            const flap = Math.sin(elapsed * 6.2 + (b.flapPhase || bIdx * 1.15)) * 0.42;
                            if (b.wingL) b.wingL.rotation.x = 0.12 + flap;
                            if (b.wingR) b.wingR.rotation.x = -0.12 - flap;
                        });
                    }
                });

                // 7b. Tiny Decorative Cargo Ships gliding very slowly along the far SE Shipping Lane
                if (this.ambientCargoShips && this.shippingLaneWaypoints && this.shippingLaneWaypoints.length >= 2) {
                    const pts = this.shippingLaneWaypoints;
                    const segCount = pts.length - 1;
                    this.ambientCargoShips.forEach(cs => {
                        cs.progress = (cs.progress + cs.speed * delta * cs.dir + 1.0) % 1.0;
                        const scaled = cs.progress * segCount;
                        const segIdx = Math.min(segCount - 1, Math.floor(scaled));
                        const frac = scaled - segIdx;
                        const p0 = pts[segIdx];
                        const p1 = pts[segIdx + 1];
                        const nx = p0.x + (p1.x - p0.x) * frac;
                        const nz = p0.z + (p1.z - p0.z) * frac;
                        const dx = (p1.x - p0.x) * cs.dir;
                        const dz = (p1.z - p0.z) * cs.dir;
                        cs.mesh.position.set(nx, -0.14 + Math.sin(elapsed * 1.6 + cs.phase) * 0.03, nz);
                        cs.mesh.rotation.y = -Math.atan2(dz, dx);
                    });
                }

                // 7c. Slow Low-Poly Whale Silhouettes gliding calmly in outer empty sea
                if (this.ambientWhales) {
                    this.ambientWhales.forEach(wh => {
                        const ang = elapsed * wh.speed + wh.phase;
                        const nx = wh.cx + Math.cos(ang) * wh.rx;
                        const nz = wh.cz + Math.sin(ang) * wh.rz;
                        const vx = -Math.sin(ang) * wh.rx;
                        const vz = Math.cos(ang) * wh.rz;
                        wh.mesh.position.set(nx, -0.16 + Math.sin(elapsed * 0.7 + wh.phase) * 0.12, nz);
                        wh.mesh.rotation.y = -Math.atan2(vz, vx);
                    });
                }
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
                const ph = ship.userData.wavePhase !== undefined ? ship.userData.wavePhase : (shipIdx * 1.7);
                const moveBoost = ship.userData.isMoving ? (ship.userData.moveSpeedNorm || 0.8) : 0;
                const turnBank = ship.userData.turnBankRad || 0;
                const movePitch = ship.userData.movePitchRad || 0;

                // Idle vertical wave bobbing (unique phase per ship so they never rock in unison)
                if (!ship.userData.isMoving && ship.userData.dockBaseY !== undefined) {
                    ship.position.y = ship.userData.dockBaseY + Math.sin(elapsed * 2.1 + ph) * 0.045;
                }

                // Combined physical Pitch (bow-up while cruising) & Roll (banking into turns + wave rock)
                ship.rotation.z = movePitch + Math.sin(elapsed * 2.2 + ph) * wavePitch;
                ship.rotation.x = turnBank + Math.cos(elapsed * 1.75 + ph) * (wavePitch * 0.82);

                // Speed-reactive Flag flutter & Sail billow
                const flagFreq = 5.2 + moveBoost * 4.5;
                const flagAmp = 0.26 + moveBoost * 0.22;
                if (ship.userData.flag) {
                    ship.userData.flag.rotation.y = Math.sin(elapsed * flagFreq + ph) * flagAmp;
                }
                if (ship.userData.foreFlag) {
                    ship.userData.foreFlag.rotation.y = Math.cos(elapsed * flagFreq + ph) * (flagAmp * 0.9);
                }
                if (ship.userData.mainSail) {
                    const breath = 1.0 + moveBoost * 0.14 + Math.sin(elapsed * (2.4 + moveBoost * 2.2) + ph) * (0.04 + moveBoost * 0.03);
                    ship.userData.mainSail.scale.set(breath, 1.0, breath);
                }
                if (ship.userData.foreSail) {
                    const fBreath = 1.0 + moveBoost * 0.12 + Math.cos(elapsed * (2.6 + moveBoost * 2.2) + ph) * (0.035 + moveBoost * 0.025);
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
            // Track camera, ship & hover state so floating labels & LOD only update when needed!
            const camSig = `${this.camera.position.x.toFixed(1)},${this.camera.position.y.toFixed(1)},${this.camera.position.z.toFixed(1)}`;
            const shipSig = Array.from(occupiedHexKeys).sort().join("|");
            const hoverSig = this.hoveredHex ? `${this.hoveredHex.q},${this.hoveredHex.r}` : "";
            const shouldUpdateLabels = (camSig !== this._lastCamSig) || (shipSig !== this._lastShipSig) || (hoverSig !== this._lastHoverSig) || this._hasActiveLabelFade;
            this._lastCamSig = camSig;
            this._lastShipSig = shipSig;
            this._lastHoverSig = hoverSig;
            let anyLabelStillFading = false;

            const camDistToTarget = this.camera.position.distanceTo(this.controls.target);
            const isZoomedOut = camDistToTarget > 62;

            // Dynamic camera-distance scaling for the 6 Region Banners (runs ONLY when camera moves!)
            if (shouldUpdateLabels && this.regionBannerSprites && this.regionBannerSprites.length > 0) {
                const camPos = this.camera.position;
                for (let b = 0; b < this.regionBannerSprites.length; b++) {
                    const sp = this.regionBannerSprites[b];
                    const bx = sp.userData.baseScaleX || 5.2;
                    const by = sp.userData.baseScaleY || 1.30;
                    const dx = camPos.x - sp.position.x;
                    const dy = camPos.y - sp.position.y;
                    const dz = camPos.z - sp.position.z;
                    const dist = Math.hypot(dx, dy, dz);
                    const k = Math.max(0.75, Math.min(1.95, dist / 68));
                    sp.scale.set(bx * k, by * k, 1);
                }
            }

            const lerpRate = Math.min(1, delta * 9.0);
            // Shared low-CPU wave pulse variables for all Reef Shoal foam rings & warning buoy blink
            const reefFoamPulse = Math.sin(elapsed * 2.0);
            const reefFoamScale1 = 1.0 + reefFoamPulse * 0.06;
            const reefFoamScale2 = 1.0 - reefFoamPulse * 0.07;
            const reefLampBlink = 0.25 + (0.5 + 0.5 * Math.sin(elapsed * 2.6)) * 1.15;

            for (let i = 0; i < this.hexTiles.length; i++) {
                const tile = this.hexTiles[i];
                if (!tile.navigable && !tile.monumentGlowGroup && !tile.labelSprite && !tile.propModel) continue;
                const isOccupied = occupiedHexKeys.has(`${tile.q},${tile.r}`);

                // A. Fade the tile's baseMesh & rimMesh when occupied by a ship
                if (tile.baseMesh && tile.baseMesh.material) {
                    const targetBaseOp = isOccupied ? 0.20 : tile.defaultBaseOpacity;
                    if (Math.abs(tile.baseMesh.material.opacity - targetBaseOp) > 0.008) {
                        tile.baseMesh.material.opacity += (targetBaseOp - tile.baseMesh.material.opacity) * lerpRate;
                    }
                }
                if (tile.rimMesh && tile.rimMesh.material) {
                    const targetRimOp = isOccupied ? 0.04 : tile.defaultRimOpacity;
                    if (Math.abs(tile.rimMesh.material.opacity - targetRimOp) > 0.005) {
                        tile.rimMesh.material.opacity += (targetRimOp - tile.rimMesh.material.opacity) * lerpRate;
                    }
                }

                // B. Animate, hover-boost (+10% scale + brighter emissive rim) & gently fade when occupied by a ship
                const isHoveredPOI = Boolean(this.hoveredHex === tile && (tile.monumentId || tile.isPort || tile.resourceType || tile.hasNPC));
                if (tile.propModel) {
                    const bs = (tile.propModel.userData && tile.propModel.userData.baseScale) || { x: 1.0, y: 1.0, z: 1.0 };
                    let mult = (tile.resourceType && tile.resourceCooldown > 0) ? 0.55 : 1.0;
                    if (isOccupied) mult *= 0.72;
                    else if (isHoveredPOI) mult *= 1.10;

                    const tx = bs.x * mult;
                    const ty = bs.y * mult;
                    const tz = bs.z * mult;
                    if (Math.abs(tile.propModel.scale.x - tx) > 0.006 || Math.abs(tile.propModel.scale.y - ty) > 0.006) {
                        tile.propModel.scale.set(
                            tile.propModel.scale.x + (tx - tile.propModel.scale.x) * lerpRate,
                            tile.propModel.scale.y + (ty - tile.propModel.scale.y) * lerpRate,
                            tile.propModel.scale.z + (tz - tile.propModel.scale.z) * lerpRate
                        );
                    }

                    if (tile.poiEmissiveRim && tile.poiEmissiveRim.material) {
                        const baseEm = (tile.poiEmissiveRim.userData && tile.poiEmissiveRim.userData.baseEmissiveIntensity) || 0.85;
                        const targetEm = isHoveredPOI ? 1.65 : (isOccupied ? 0.45 : baseEm);
                        if (Math.abs((tile.poiEmissiveRim.material.emissiveIntensity || baseEm) - targetEm) > 0.02) {
                            tile.poiEmissiveRim.material.emissiveIntensity =
                                (tile.poiEmissiveRim.material.emissiveIntensity || baseEm) +
                                (targetEm - (tile.poiEmissiveRim.material.emissiveIntensity || baseEm)) * lerpRate;
                        }
                        const targetRimSc = isHoveredPOI ? 1.04 : 1.0;
                        if (Math.abs(tile.poiEmissiveRim.scale.x - targetRimSc) > 0.004) {
                            const ns = tile.poiEmissiveRim.scale.x + (targetRimSc - tile.poiEmissiveRim.scale.x) * lerpRate;
                            tile.poiEmissiveRim.scale.set(ns, 1, ns);
                        }
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
                            const crownBaseY = tile.propModel.userData.crownBaseY || 2.35;
                            crown.rotation.y = elapsed * 1.6;
                            crown.position.y = crownBaseY + Math.sin(elapsed * 2.6 + tile.index) * 0.10;
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
                        if (tile.propModel.userData.lhBeamPivot) {
                            tile.propModel.userData.lhBeamPivot.rotation.y = elapsed * 0.65 + tile.index;
                        }
                    } else if (tile.resourceType) {
                        const ud = tile.propModel.userData;
                        if (ud.spinZ) {
                            ud.spinZ.rotation.z = elapsed * (tile.resourceType === "wood" ? -5.0 : 1.8);
                        }
                        if (ud.spinY) {
                            ud.spinY.rotation.y = elapsed * 1.4;
                        }
                    } else if (tile.isReef && tile.propModel.userData && tile.propModel.userData.isReefShoal) {
                        const rud = tile.propModel.userData;
                        if (rud.foamInner) {
                            rud.foamInner.scale.set(reefFoamScale1, reefFoamScale1, 1);
                            rud.foamInner.material.opacity = isOccupied ? 0.18 : (0.55 + reefFoamPulse * 0.14);
                        }
                        if (rud.foamOuter) {
                            rud.foamOuter.scale.set(reefFoamScale2, reefFoamScale2, 1);
                            rud.foamOuter.material.opacity = isOccupied ? 0.14 : (0.42 - reefFoamPulse * 0.12);
                        }
                        if (rud.buoyGroup) {
                            rud.buoyGroup.position.y = 0.02 + Math.sin(elapsed * 2.3 + rud.phase) * 0.035;
                            rud.buoyGroup.rotation.z = Math.sin(elapsed * 1.9 + rud.phase) * 0.08;
                        }
                        if (rud.lampMat) {
                            rud.lampMat.emissiveIntensity = reefLampBlink;
                        }
                    } else if (tile.hasNPC) {
                        // Gentle wave bobbing + rotating radar + slowly spinning golden emissive ring on FDI Ship
                        tile.propModel.position.y = (tile.height - 0.1) + Math.sin(elapsed * 2.4) * 0.04;
                        tile.propModel.rotation.z = Math.sin(elapsed * 1.9) * 0.035;
                        tile.propModel.rotation.x = Math.cos(elapsed * 1.5) * 0.025;
                        if (tile.propModel.userData.radarGroup) {
                            tile.propModel.userData.radarGroup.rotation.y = elapsed * 2.8;
                        }
                        if (tile.propModel.userData.ring) {
                            tile.propModel.userData.ring.rotation.z = elapsed * 0.55;
                        }
                    }
                }

                // C. Animate & fade Monument Sky Beacon, Halo Rings, Orbiting Crystals & Label Sprite
                if (tile.monumentGlowGroup) {
                    const gd = tile.monumentGlowGroup.userData;
                    const isHidden = Boolean(gd.hiddenByState || tile.monumentLocked);
                    if (gd.outerHalo) {
                        gd.outerHalo.visible = !isHidden;
                        if (!isHidden) {
                            const pulse = 1.0 + Math.sin(elapsed * 2.8 + tile.index) * 0.06;
                            gd.outerHalo.scale.set(pulse, pulse, 1);
                            gd.outerHalo.material.opacity = isOccupied ? 0.18 : (0.38 + Math.sin(elapsed * 2.8 + tile.index) * 0.12);
                        }
                    }
                    if (gd.beaconMesh) {
                        gd.beaconMesh.visible = !isHidden;
                        if (!isHidden) {
                            const baseOp = gd.baseOpacity || 0.18;
                            gd.beaconMesh.material.opacity = isOccupied ? (baseOp * 0.45) : (baseOp + Math.sin(elapsed * 2.2 + tile.index) * 0.035);
                        }
                    }
                }
                if (tile.portGlowGroup && tile.portGlowGroup.userData) {
                    const pg = tile.portGlowGroup.userData;
                    const isMine = (pg.mode === "mine");
                    if (pg.seaHalo) {
                        const pulse = isMine ? (1.0 + Math.sin(elapsed * 3.2 + tile.index) * 0.075) : (1.0 + Math.sin(elapsed * 1.8 + tile.index) * 0.03);
                        pg.seaHalo.scale.set(pulse, pulse, 1);
                        pg.seaHalo.material.opacity = isMine
                            ? (0.48 + Math.sin(elapsed * 3.2 + tile.index) * 0.18)
                            : (0.34 + Math.sin(elapsed * 1.8 + tile.index) * 0.08);
                    }
                    if (pg.goldOuterHalo && pg.goldOuterHalo.visible) {
                        const gPulse = 1.0 + Math.sin(elapsed * 3.2 + tile.index) * 0.09;
                        pg.goldOuterHalo.scale.set(gPulse, gPulse, 1);
                        pg.goldOuterHalo.material.opacity = 0.54 + Math.sin(elapsed * 3.2 + tile.index) * 0.22;
                    }
                    if (pg.beaconMesh) {
                        const bOp = pg.baseOpacity || 0.15;
                        pg.beaconMesh.material.opacity = isOccupied ? (bOp * 0.45) : (bOp + Math.sin(elapsed * (isMine ? 3.0 : 1.8) + tile.index) * (isMine ? 0.05 : 0.025));
                    }
                }
                if (tile.propModel && tile.propModel.userData && tile.propModel.userData.flagPivot) {
                    tile.propModel.userData.flagPivot.rotation.y = Math.sin(elapsed * 2.6 + tile.index) * 0.18;
                }
                if (tile.stormRestrictGroup && tile.stormRestrictGroup.userData) {
                    const sg = tile.stormRestrictGroup.userData;
                    if (sg.outerRing) sg.outerRing.rotation.y = elapsed * 1.1;
                    if (sg.innerRing) sg.innerRing.rotation.y = -elapsed * 1.4;
                    if (sg.cloudCluster) {
                        sg.cloudCluster.rotation.y = elapsed * 0.85 + tile.index;
                        sg.cloudCluster.position.y = 1.92 + Math.sin(elapsed * 2.4 + tile.index) * 0.08;
                    }
                }
                if (shouldUpdateLabels) {
                    // Zoom-Level LOD:
                    // - Zoomed out: Show compact icon (🏛️, ⚓) on Monuments/Ports, hide Resource labels (reveal full label on hover!)
                    // - Zoomed in: Show full label on Monuments/Ports & icon on Resources
                    if (tile.monumentId || tile.isPort) {
                        const showFullLabel = !isZoomedOut || isHoveredPOI;
                        if (tile.labelSprite && tile.labelSprite.material) {
                            tile.labelSprite.visible = showFullLabel;
                            if (showFullLabel) {
                                const targetOp = isOccupied ? 0.15 : 0.95;
                                if (Math.abs(tile.labelSprite.material.opacity - targetOp) > 0.01) {
                                    tile.labelSprite.material.opacity += (targetOp - tile.labelSprite.material.opacity) * lerpRate;
                                    anyLabelStillFading = true;
                                }
                            }
                        }
                        if (tile.iconSprite && tile.iconSprite.material) {
                            tile.iconSprite.visible = !showFullLabel;
                            if (!showFullLabel) {
                                const targetIconOp = isOccupied ? 0.25 : 0.95;
                                if (Math.abs(tile.iconSprite.material.opacity - targetIconOp) > 0.01) {
                                    tile.iconSprite.material.opacity += (targetIconOp - tile.iconSprite.material.opacity) * lerpRate;
                                    anyLabelStillFading = true;
                                }
                            }
                        }
                    } else if (tile.resourceType) {
                        if (tile.labelSprite && tile.labelSprite.material) {
                            const showResIcon = !isZoomedOut || isHoveredPOI;
                            tile.labelSprite.visible = showResIcon;
                            if (showResIcon) {
                                const targetOp = isOccupied ? 0.18 : 0.92;
                                if (Math.abs(tile.labelSprite.material.opacity - targetOp) > 0.01) {
                                    tile.labelSprite.material.opacity += (targetOp - tile.labelSprite.material.opacity) * lerpRate;
                                    anyLabelStillFading = true;
                                }
                            }
                        }
                    } else if (tile.labelSprite && tile.labelSprite.material) {
                        const targetLabelOp = isOccupied ? 0.15 : 0.95;
                        if (Math.abs(tile.labelSprite.material.opacity - targetLabelOp) > 0.01) {
                            tile.labelSprite.material.opacity += (targetLabelOp - tile.labelSprite.material.opacity) * lerpRate;
                            anyLabelStillFading = true;
                        }
                    }
                }
            }
            this._hasActiveLabelFade = anyLabelStillFading;

            // 10b. Lightweight Path Preview Chevron Wave & Destination Reticle Animation (Zero Allocations!)
            if (this.pathPreviewAnimItems) {
                const pa = this.pathPreviewAnimItems;
                for (let ci = 0; ci < pa.chevrons.length; ci++) {
                    const ch = pa.chevrons[ci];
                    if (ch.mesh && ch.mesh.material) {
                        const wave = 0.5 + 0.5 * Math.sin(elapsed * 6.4 - ch.orderIdx * 0.85);
                        ch.mesh.material.opacity = 0.50 + wave * 0.50;
                    }
                }
                if (pa.targetOuterRing) {
                    pa.targetOuterRing.rotation.y = elapsed * 1.15;
                }
                if (pa.targetCenterDot) {
                    const sc = 1.0 + Math.sin(elapsed * 4.6) * 0.14;
                    pa.targetCenterDot.scale.set(sc, 1, sc);
                }
            }

            // 10c. Crisp 2D HTML Map Labels 3D -> 2D GPU Projection (60 FPS, zero GC)
            const htmlCamDist = (this.camera && this.controls && typeof this.camera.position.distanceTo === "function")
                ? this.camera.position.distanceTo(this.controls.target)
                : 80;
            this.updateHtmlLabelsProjection(htmlCamDist);

            // 11. Object-Pooled V-Shaped Ship Wake Foam Update (Zero Mesh Alloc/Remove!)
            if (this.wakePool) {
                for (let w = 0; w < this.wakePool.length; w++) {
                    const wp = this.wakePool[w];
                    if (!wp.active) continue;
                    const age = now - wp.birth;
                    if (age >= wp.life) {
                        wp.active = false;
                        wp.mesh.visible = false;
                        continue;
                    }
                    const prog = age / wp.life;
                    wp.mesh.position.x += wp.vx * delta;
                    wp.mesh.position.z += wp.vz * delta;
                    const s = wp.initScale * (1.0 + prog * 1.9);
                    wp.mesh.scale.set(s, 1, s);
                    wp.mat.opacity = (1.0 - prog) * 0.72;
                }
            }

            // 11b. Burst, Lightning Bolt & Monument Trap Effects
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

            // 12 & 13. Main Menu Scenic Auto-Orbit OR In-Match Camera Pan / Follow Lock
            if (this.menuOrbitMode) {
                this.menuOrbitAngle += delta * 0.095;
                const orbitRadius = 74;
                const centerX = 0;
                const centerZ = 2;
                this.camera.position.x = centerX + Math.sin(this.menuOrbitAngle) * orbitRadius;
                this.camera.position.z = centerZ + Math.cos(this.menuOrbitAngle) * orbitRadius;
                this.camera.position.y = 54 + Math.sin(this.menuOrbitAngle * 0.7) * 4;
                this.controls.target.set(centerX, 0, centerZ);
            } else {
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
            }

            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }
}

window.World3D = World3D;
