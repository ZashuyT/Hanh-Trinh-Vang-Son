// ============================================================================
// THE GOLDEN JOURNEY (HÀNH TRÌNH VÀNG SON) — ULTRA-DETAILED LIVING 3D DIORAMA & MODEL ENGINE
// - Ultra-Detailed 3-Mast Royal Clipper/Junk Ships with Sculpted Dragon Prow,
//   Horns, 2-Tier Stern Pagoda Gallery, Glowing Lanterns, Rigging Shrouds,
//   Ship Wheel, Deck Cargo Barrels, Dragon Shields & Bamboo-Battened Sails
// - 18+ Distinct, Animated 3D Land Hex Dioramas across 6 Economic Regions &
//   Truong Son Frontier (Waterwheels, 5-Tier Terraces, Village Communal Halls,
//   Hoi An Townhouses, Central Highlands Campfires, Skyscrapers, Mekong Orchards)
// - 9 Bespoke Architectural Relic Monument Masterpieces, Grand Harbor Cranes,
//   and Living Ocean Wildlife & Fleet (Jumping Dolphins, Fish Schools, Flapping
//   Seagulls, Traditional Vietnamese Sampans, Lighthouses, Offshore Oil Rigs)
// ============================================================================

class ProceduralModels {
    // Deterministic pseudo-random helper from integer seed
    static seededRandom(seed) {
        const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
        return x - Math.floor(x);
    }

    // Lightweight BufferGeometry merger (Three.js r128 compatible) for static diorama batching
    static mergeGeometries(geometries) {
        if (!geometries || geometries.length === 0) return null;
        let totalVerts = 0;
        const prepared = [];

        for (let i = 0; i < geometries.length; i++) {
            const raw = geometries[i];
            if (!raw || !raw.attributes || !raw.attributes.position) continue;
            const g = raw.index ? raw.toNonIndexed() : raw;
            if (!g.attributes.normal && g.computeVertexNormals) {
                g.computeVertexNormals();
            }
            const posAttr = g.attributes.position;
            const normAttr = g.attributes.normal;
            if (!posAttr || posAttr.count === 0) continue;
            totalVerts += posAttr.count;
            prepared.push({ pos: posAttr, norm: normAttr, count: posAttr.count });
        }

        if (totalVerts === 0) return null;

        const positions = new Float32Array(totalVerts * 3);
        const normals = new Float32Array(totalVerts * 3);
        let offset = 0;

        for (let i = 0; i < prepared.length; i++) {
            const item = prepared[i];
            positions.set(item.pos.array, offset);
            if (item.norm && item.norm.array && item.norm.array.length === item.pos.array.length) {
                normals.set(item.norm.array, offset);
            }
            offset += item.count * 3;
        }

        const merged = new THREE.BufferGeometry();
        merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
        return merged;
    }

    // Merge all static meshes inside a container group by material key, leaving animated meshes untouched
    static mergeStaticMeshesByMaterial(rootGroup, animatedMeshesSet = new Set(), options = {}) {
        if (!rootGroup || typeof rootGroup.updateMatrixWorld !== "function") return null;
        rootGroup.updateMatrixWorld(true);

        const castShadowOpt = Boolean(options.castShadow);
        const flatShadingOpt = Boolean(options.flatShading);

        const isInsideAnimated = (obj) => {
            let cur = obj;
            while (cur) {
                if (animatedMeshesSet.has(cur)) return true;
                cur = cur.parent;
            }
            return false;
        };

        const buckets = new Map();
        const toRemove = [];

        rootGroup.traverse((child) => {
            if (!child.isMesh || !child.geometry || !child.material) return;
            if (Array.isArray(child.material)) return;
            if (isInsideAnimated(child)) return;
            if (!child.geometry.attributes || !child.geometry.attributes.position) return;

            const mat = child.material;
            const colHex = mat.color ? mat.color.getHexString() : "ffffff";
            const emHex = mat.emissive ? mat.emissive.getHexString() : "000000";
            const emInt = mat.emissiveIntensity !== undefined ? mat.emissiveIntensity.toFixed(2) : "0";
            const transp = mat.transparent ? `t_${(mat.opacity !== undefined ? mat.opacity : 1).toFixed(2)}` : "o";
            const flat = (mat.flatShading || flatShadingOpt) ? "f" : "s";
            const key = `${colHex}_${emHex}_${emInt}_${transp}_${flat}`;

            if (!buckets.has(key)) {
                buckets.set(key, {
                    material: new THREE.MeshLambertMaterial({
                        color: mat.color ? mat.color.clone() : 0xffffff,
                        emissive: mat.emissive ? mat.emissive.clone() : 0x000000,
                        emissiveIntensity: mat.emissiveIntensity || 0,
                        transparent: Boolean(mat.transparent),
                        opacity: mat.opacity !== undefined ? mat.opacity : 1.0,
                        flatShading: Boolean(mat.flatShading || flatShadingOpt),
                        side: mat.side !== undefined ? mat.side : THREE.FrontSide
                    }),
                    geometries: []
                });
            }

            const clonedGeo = child.geometry.clone();
            clonedGeo.applyMatrix4(child.matrixWorld);
            buckets.get(key).geometries.push(clonedGeo);
            toRemove.push(child);
        });

        if (toRemove.length === 0) return null;

        toRemove.forEach((m) => {
            if (m.parent) m.parent.remove(m);
        });

        const mergedGroup = new THREE.Group();
        buckets.forEach((bucket) => {
            const mergedGeo = this.mergeGeometries(bucket.geometries);
            bucket.geometries.forEach((g) => { if (g.dispose) g.dispose(); });
            if (mergedGeo) {
                const mesh = new THREE.Mesh(mergedGeo, bucket.material);
                mesh.castShadow = castShadowOpt;
                mesh.receiveShadow = true;
                mergedGroup.add(mesh);
            }
        });

        return mergedGroup;
    }

    // ------------------------------------------------------------------------
    // A. LOCATION PLAQUE (WARM ANTIQUE PARCHMENT & BRASS SCROLL)
    // Distinctly identifies Monuments, Trading Ports & Resource Nodes
    // ------------------------------------------------------------------------
    static createLabelCanvas(text, subtext, bgColor = "rgba(11, 19, 30, 0.92)", borderColor = "#fbbf24", scaleX = 3.9, scaleY = 1.24, categoryBadge = "ĐỊA ĐIỂM") {
        const canvas = document.createElement("canvas");
        canvas.width = 620;
        canvas.height = 196;
        const ctx = canvas.getContext("2d");

        const x = 16, y = 26, w = 588, h = 152, ch = 18;

        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.beginPath();
        ctx.moveTo(x + ch, y + 6);
        ctx.lineTo(x + w - ch, y + 6);
        ctx.lineTo(x + w, y + ch + 6);
        ctx.lineTo(x + w, y + h - ch + 6);
        ctx.lineTo(x + w - ch, y + h + 6);
        ctx.lineTo(x + ch, y + h + 6);
        ctx.lineTo(x, y + h - ch + 6);
        ctx.lineTo(x, y + ch + 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const drawChamferRect = (rx, ry, rw, rh, c) => {
            ctx.beginPath();
            ctx.moveTo(rx + c, ry);
            ctx.lineTo(rx + rw - c, ry);
            ctx.lineTo(rx + rw, ry + c);
            ctx.lineTo(rx + rw, ry + rh - c);
            ctx.lineTo(rx + rw - c, ry + rh);
            ctx.lineTo(rx + c, ry + rh);
            ctx.lineTo(rx, ry + rh - c);
            ctx.lineTo(rx, ry + c);
            ctx.closePath();
        };

        drawChamferRect(x, y, w, h, ch);
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, "rgba(10, 20, 38, 0.96)");
        grad.addColorStop(0.55, "rgba(14, 28, 52, 0.96)");
        grad.addColorStop(1, "rgba(7, 14, 28, 0.97)");
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.lineWidth = 8;
        ctx.strokeStyle = borderColor || "#fbbf24";
        ctx.stroke();

        drawChamferRect(x + 8, y + 8, w - 16, h - 16, ch - 4);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.stroke();

        const rivets = [
            [x + 18, y + 18],
            [x + w - 18, y + 18],
            [x + 18, y + h - 18],
            [x + w - 18, y + h - 18]
        ];
        rivets.forEach(([rx, ry]) => {
            ctx.beginPath();
            ctx.arc(rx, ry, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = borderColor || "#fbbf24";
            ctx.fill();
        });

        let catLabel = categoryBadge;
        if (text.includes("🏛️")) catLabel = "🏛️ DI TÍCH LỊCH SỬ - ĐỊA LÝ";
        else if (text.includes("⚓")) catLabel = "⚓ THƯƠNG CẢNG HÀNG HẢI";
        else if (text.includes("🌾") || text.includes("🌲") || text.includes("⛏️")) catLabel = "⛏️ ĐIỂM KHAI THÁC TÀI NGUYÊN";
        else if (text.includes("🚢")) catLabel = "🚢 THƯƠNG ĐOÀN QUỐC TẾ (FDI)";
        else if (text.includes("🧙‍♂️")) catLabel = "🚢 THƯƠNG ĐOÀN QUỐC TẾ (FDI)";

        const pillW = 330, pillH = 32, pillX = (620 - pillW) / 2, pillY = 8;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 10);
        ctx.fillStyle = borderColor || "#d97706";
        ctx.fill();

        ctx.fillStyle = "#0b1324";
        ctx.font = "900 18px 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(catLabel, 310, pillY + pillH / 2 + 1);

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 36px 'Segoe UI', Roboto, sans-serif";
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 6;
        ctx.fillText(text, 310, subtext ? 82 : 106);

        if (subtext) {
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.roundRect(x + 24, 114, w - 48, 46, 10);
            ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
            ctx.fill();

            ctx.fillStyle = "#fde047";
            ctx.font = "800 25px 'Segoe UI', Roboto, sans-serif";
            ctx.fillText(subtext, 310, 137);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(scaleX, scaleY, 1);
        sprite.renderOrder = 995;
        return sprite;
    }

    // ------------------------------------------------------------------------
    // B. PLAYER SHIP NAMEPLATE (FRAMED, HIGH-CONTRAST COLOR BADGE — NAME ONLY!)
    // ------------------------------------------------------------------------
    static createPlayerShipNameplate(playerName, vesselTitle = "", shipColorHex = "#38bdf8", isLocalPlayer = false) {
        const cleanName = String(playerName || "Thuyền Trưởng").trim().slice(0, 18);
        const canvas = document.createElement("canvas");
        canvas.width = 560;
        canvas.height = 160;
        const ctx = canvas.getContext("2d");

        const pillX = 28, pillY = 14, pillW = 504, pillH = 96, radius = 24;

        ctx.save();
        ctx.shadowColor = isLocalPlayer ? "rgba(250, 204, 21, 0.95)" : "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = isLocalPlayer ? 18 : 14;
        ctx.shadowOffsetY = 4;

        // Downward pointer triangle pointing directly at the ship
        ctx.beginPath();
        ctx.moveTo(280 - 24, pillY + pillH - 2);
        ctx.lineTo(280 + 24, pillY + pillH - 2);
        ctx.lineTo(280, pillY + pillH + 34);
        ctx.closePath();
        ctx.fillStyle = isLocalPlayer ? "#fde047" : shipColorHex;
        ctx.fill();

        // Framed Rectangular Pill Box
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, radius);
        const bgGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
        if (isLocalPlayer) {
            bgGrad.addColorStop(0, "rgba(6, 46, 34, 0.98)");
            bgGrad.addColorStop(1, "rgba(4, 28, 22, 0.98)");
        } else {
            bgGrad.addColorStop(0, "rgba(8, 15, 32, 0.96)");
            bgGrad.addColorStop(1, "rgba(15, 25, 48, 0.96)");
        }
        ctx.fillStyle = bgGrad;
        ctx.fill();
        ctx.restore();

        // Thick Vibrant Color Frame
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, radius);
        ctx.lineWidth = isLocalPlayer ? 10 : 8;
        ctx.strokeStyle = isLocalPlayer ? "#fde047" : shipColorHex;
        ctx.stroke();

        // Inner Crisp Accent Rim
        ctx.beginPath();
        ctx.roundRect(pillX + 8, pillY + 8, pillW - 16, pillH - 16, radius - 6);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = isLocalPlayer ? "rgba(52, 211, 153, 0.9)" : "rgba(255, 255, 255, 0.65)";
        ctx.stroke();

        // Left Color Dot Badge
        const dotX = pillX + 48, dotY = pillY + pillH / 2;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 21, 0, Math.PI * 2);
        ctx.fillStyle = shipColorHex;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = isLocalPlayer ? "#fde047" : "#ffffff";
        ctx.stroke();

        // Player Name ONLY — Bold, Huge, Crystal Clear
        ctx.fillStyle = isLocalPlayer ? "#fef08a" : "#ffffff";
        ctx.font = "900 42px 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0, 0, 0, 0.92)";
        ctx.shadowBlur = 6;
        ctx.fillText(cleanName, 298, pillY + pillH / 2 + 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(isLocalPlayer ? 3.55 : 3.25, isLocalPlayer ? 1.02 : 0.92, 1);
        sprite.renderOrder = isLocalPlayer ? 1018 : 1010;
        return sprite;
    }

    // ------------------------------------------------------------------------
    // B2. LOCAL PLAYER 3D ARROW MARKER (ONLY VISIBLE ON YOUR OWN SHIP!)
    // ------------------------------------------------------------------------
    static createLocalPlayerArrowMarker(shipColorHex = "#00e676") {
        const markerGroup = new THREE.Group();

        const arrowMat = new THREE.MeshStandardMaterial({
            color: 0xffea00,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.95,
            metalness: 0.45,
            roughness: 0.15
        });
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95
        });

        // 3D Downward-Pointing Cone Head
        const headGeo = new THREE.ConeGeometry(0.52, 0.82, 6);
        headGeo.rotateX(Math.PI);
        const headMesh = new THREE.Mesh(headGeo, arrowMat);
        headMesh.position.y = 0;
        markerGroup.add(headMesh);

        // 3D Arrow Shaft
        const shaftGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.68, 6);
        const shaftMesh = new THREE.Mesh(shaftGeo, arrowMat);
        shaftMesh.position.y = 0.62;
        markerGroup.add(shaftMesh);

        // Glowing Halo Ring around the Arrow
        const haloGeo = new THREE.RingGeometry(0.56, 0.76, 28);
        haloGeo.rotateX(-Math.PI / 2);
        const haloMesh = new THREE.Mesh(haloGeo, ringMat);
        haloMesh.position.y = -0.24;
        markerGroup.add(haloMesh);

        // High-Contrast "▼ THUYỀN CỦA BẠN" Tag Above Arrow
        const canvas = document.createElement("canvas");
        canvas.width = 420;
        canvas.height = 104;
        const ctx = canvas.getContext("2d");
        ctx.beginPath();
        ctx.roundRect(14, 12, 392, 80, 40);
        ctx.fillStyle = "#064e3b";
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = "#fde047";
        ctx.stroke();
        ctx.fillStyle = "#fef08a";
        ctx.font = "900 34px 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("▼ THUYỀN CỦA BẠN", 210, 53);

        const tex = new THREE.CanvasTexture(canvas);
        const badgeSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        badgeSprite.scale.set(2.45, 0.62, 1);
        badgeSprite.position.set(0, 1.34, 0);
        badgeSprite.renderOrder = 1025;
        markerGroup.add(badgeSprite);

        markerGroup.userData = { headMesh, shaftMesh, haloMesh };
        return markerGroup;
    }

    // ------------------------------------------------------------------------
    // C. HIGH-RESOLUTION REGION BANNER PLAQUE (2X CANVAS 1024x256, BOLD VIETNAMESE)
    // ------------------------------------------------------------------------
    static createRegionBannerSprite(line1, line2 = "", borderHex = "#38bdf8", scaleX = 5.4, scaleY = 1.35) {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");

        const x = 22, y = 24, w = 980, h = 208, rad = 36;

        // Soft drop shadow behind dark badge
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, rad);
        ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
        ctx.fill();
        ctx.restore();

        // Crisp 2px-equivalent bright region border (6px on 2x canvas)
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, rad);
        ctx.lineWidth = 7;
        ctx.strokeStyle = borderHex || "#38bdf8";
        ctx.stroke();

        // Uppercase Bold Vietnamese Text with thin dark outline & shadow
        const t1 = String(line1 || "").toUpperCase();
        const t2 = String(line2 || "").toUpperCase();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0, 0, 0, 0.92)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;

        if (t2) {
            ctx.font = "800 50px 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif";
            ctx.lineWidth = 7;
            ctx.strokeStyle = "rgba(2, 6, 23, 0.95)";
            ctx.strokeText(t1, 512, 92);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(t1, 512, 92);

            ctx.font = "800 44px 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif";
            ctx.lineWidth = 6;
            ctx.strokeText(t2, 512, 162);
            ctx.fillStyle = "#fde047";
            ctx.fillText(t2, 512, 162);
        } else {
            ctx.font = "800 56px 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif";
            ctx.lineWidth = 7;
            ctx.strokeStyle = "rgba(2, 6, 23, 0.95)";
            ctx.strokeText(t1, 512, 128);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(t1, 512, 128);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(scaleX, scaleY, 1);
        sprite.renderOrder = 998;
        sprite.userData = { baseScaleX: scaleX, baseScaleY: scaleY };
        return sprite;
    }

    // ------------------------------------------------------------------------
    // C2. COMPACT ICON BADGE FOR ZOOM-OUT LOD (MONUMENTS 🏛️, PORTS ⚓, RESOURCES)
    // ------------------------------------------------------------------------
    static createCompactPOIIconSprite(icon, borderHex = "#fbbf24", sizeScale = 1.25) {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 160;
        const ctx = canvas.getContext("2d");

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.80)";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(80, 80, 58, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(80, 80, 58, 0, Math.PI * 2);
        ctx.lineWidth = 7;
        ctx.strokeStyle = borderHex;
        ctx.stroke();

        ctx.font = "800 62px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(icon, 80, 84);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(sizeScale, sizeScale, 1);
        sprite.renderOrder = 990;
        return sprite;
    }

    static createCompactResourceIconSprite(resourceType) {
        const cfg = {
            food: { icon: "🌾", border: "#facc15" },
            wood: { icon: "🌲", border: "#4ade80" },
            iron: { icon: "⛏️", border: "#cbd5e1" }
        }[resourceType] || { icon: "⛏️", border: "#facc15" };
        return this.createCompactPOIIconSprite(cfg.icon, cfg.border, 1.05);
    }

    // ------------------------------------------------------------------------
    // 1. 5 LOW-POLY TRADITIONAL MERCHANT SAILING SHIPS (DISTINCT TEAM COLORS)
    //    - MeshLambertMaterial with flatShading: true, zero PointLight
    //    - Tapered curved bow & raised stern (y = 0 at waterline), warm wood hull
    //      with vivid team-colored gunwale stripe, light wood deck, stern cabin
    //      with dark glass windows, cargo barrels, 2 masts + 2 cream billowing
    //      sails with horizontal team-colored stripes & fluttering pennant flag!
    // ------------------------------------------------------------------------
    static createPlayerShip(archetypeId, playerName = "", isLocalPlayer = false) {
        const arch = window.GAME_DATA.shipArchetypes[archetypeId % 5];
        const group = new THREE.Group();

        const teamColor = new THREE.Color(arch.color);
        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.16,
            flatShading: true,
            ...opts
        });

        const warmWoodMat = mat(0x854d27);
        const darkWoodMat = mat(0x4e270f);
        const lightDeckMat = mat(0xdeb078);
        const glassDarkMat = mat(0x0f172a, { emissiveIntensity: 0.05 });
        const creamSailMat = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.18, side: THREE.DoubleSide });
        const teamMat = mat(teamColor, { emissive: teamColor, emissiveIntensity: 0.30 });
        const teamStripeMat = mat(teamColor, { emissive: teamColor, emissiveIntensity: 0.30, side: THREE.DoubleSide });
        const goldMat = mat(0xfacc15, { emissive: 0xeab308, emissiveIntensity: 0.28 });

        // 1. Sculpted Tapered Wooden Hull (Pointed Bow +X, Gently Raised Stern -X, Waterline at y = 0)
        const hullBodyGeo = new THREE.CylinderGeometry(0.46, 0.30, 1.32, 8);
        hullBodyGeo.rotateZ(Math.PI / 2);
        hullBodyGeo.scale(1.0, 0.62, 0.88);
        const hullBody = new THREE.Mesh(hullBodyGeo, warmWoodMat);
        hullBody.position.set(-0.04, 0.20, 0);
        hullBody.castShadow = true;

        // Pointed Tapered Bow (+X)
        const bowGeo = new THREE.ConeGeometry(0.44, 0.88, 6);
        bowGeo.rotateZ(-Math.PI / 2);
        bowGeo.scale(1.0, 0.64, 0.84);
        const bowMesh = new THREE.Mesh(bowGeo, warmWoodMat);
        bowMesh.position.set(0.96, 0.24, 0);
        bowMesh.castShadow = true;

        // Gently Raised Tapered Stern (-X)
        const sternGeo = new THREE.ConeGeometry(0.42, 0.66, 6);
        sternGeo.rotateZ(Math.PI / 2);
        sternGeo.scale(1.0, 0.72, 0.84);
        const sternMesh = new THREE.Mesh(sternGeo, darkWoodMat);
        sternMesh.position.set(-0.92, 0.28, 0);
        sternMesh.castShadow = true;

        // Team-Colored Gunwale Trim Stripe along Both Sides of the Hull
        const stripeBodyGeo = new THREE.CylinderGeometry(0.48, 0.45, 1.34, 8);
        stripeBodyGeo.rotateZ(Math.PI / 2);
        stripeBodyGeo.scale(1.0, 0.22, 0.91);
        const hullStripe = new THREE.Mesh(stripeBodyGeo, teamMat);
        hullStripe.position.set(-0.04, 0.38, 0);

        const bowStripeGeo = new THREE.ConeGeometry(0.45, 0.86, 6);
        bowStripeGeo.rotateZ(-Math.PI / 2);
        bowStripeGeo.scale(1.0, 0.22, 0.88);
        const bowStripe = new THREE.Mesh(bowStripeGeo, teamMat);
        bowStripe.position.set(0.95, 0.39, 0);

        // Light-Wood Main Deck
        const deckGeo = new THREE.CylinderGeometry(0.40, 0.40, 1.36, 8);
        deckGeo.rotateZ(Math.PI / 2);
        deckGeo.scale(1.0, 0.10, 0.82);
        const mainDeck = new THREE.Mesh(deckGeo, lightDeckMat);
        mainDeck.position.set(0.02, 0.41, 0);

        // Bowsprit pointing forward at bow
        const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.042, 0.70, 6), darkWoodMat);
        bowsprit.rotation.z = -Math.PI / 3.1;
        bowsprit.position.set(1.32, 0.56, 0);

        group.add(hullBody, bowMesh, sternMesh, hullStripe, bowStripe, mainDeck, bowsprit);

        // 2. Small Stern Pilot Cabin with Dark Glass Windows + 2 Mini Wooden Cargo Crates/Barrels
        const cabinBody = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.54), warmWoodMat);
        cabinBody.position.set(-0.56, 0.60, 0);
        cabinBody.castShadow = true;
        const cabinWindows = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.11, 0.44), glassDarkMat);
        cabinWindows.position.set(-0.56, 0.64, 0);
        const cabinSideWin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.56), glassDarkMat);
        cabinSideWin.position.set(-0.56, 0.64, 0);
        const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.60), teamMat);
        cabinRoof.position.set(-0.56, 0.80, 0);
        group.add(cabinBody, cabinWindows, cabinSideWin, cabinRoof);

        const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), darkWoodMat);
        crate1.position.set(0.24, 0.50, 0.18);
        const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.17, 7), darkWoodMat);
        barrel1.position.set(0.22, 0.50, -0.18);
        group.add(crate1, barrel1);

        // 3. Two Masts (Tall Main Mast + Shorter Fore Mast) + 2 Curved Cream Sails with Team Stripes
        const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.056, 1.98, 7), darkWoodMat);
        mainMast.position.set(-0.02, 1.38, 0);
        const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.044, 1.44, 7), darkWoodMat);
        foreMast.position.set(0.62, 1.12, 0);
        group.add(mainMast, foreMast);

        const buildStripedBillowingSail = (radius, height, xPos, yPos) => {
            const sGroup = new THREE.Group();
            const sGeo = new THREE.CylinderGeometry(radius, radius * 1.04, height, 10, 1, true, -Math.PI * 0.34, Math.PI * 0.68);
            const sMesh = new THREE.Mesh(sGeo, creamSailMat);
            sMesh.rotation.y = Math.PI / 2;
            sMesh.position.x = -radius * 0.52;
            sMesh.castShadow = true;
            sGroup.add(sMesh);

            // 2 Horizontal Team-Colored Stripes across the Billowing Sail
            [-height * 0.22, height * 0.22].forEach(sy => {
                const stGeo = new THREE.CylinderGeometry(radius * 1.015, radius * 1.03, height * 0.16, 10, 1, true, -Math.PI * 0.34, Math.PI * 0.68);
                const stMesh = new THREE.Mesh(stGeo, teamStripeMat);
                stMesh.rotation.y = Math.PI / 2;
                stMesh.position.set(-radius * 0.52, sy, 0);
                sGroup.add(stMesh);
            });

            // Top & Bottom Wooden Yard Spars
            [height * 0.48, -height * 0.48].forEach(yy => {
                const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, radius * 1.24, 5), darkWoodMat);
                spar.rotation.x = Math.PI / 2;
                spar.position.set(radius * 0.36, yy, 0);
                sGroup.add(spar);
            });

            sGroup.position.set(xPos, yPos, 0);
            return sGroup;
        };

        const mainSail = buildStripedBillowingSail(0.66, 1.22, -0.02, 1.38);
        const foreSail = buildStripedBillowingSail(0.46, 0.86, 0.62, 1.14);
        group.add(mainSail, foreSail);

        // Small Fluttering Pennant Flag on Top of Main Mast
        const flagGeo = new THREE.ConeGeometry(0.16, 0.56, 3);
        flagGeo.rotateZ(Math.PI / 2);
        const flag = new THREE.Mesh(flagGeo, teamMat);
        flag.position.set(-0.26, 2.30, 0);
        const mastFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), goldMat);
        mastFinial.position.set(-0.02, 2.40, 0);
        group.add(flag, mastFinial);

        // 4. Water Surface Identification Halo Ring + Vertical Light Beacon Pillar
        const outerRingGeo = new THREE.RingGeometry(1.06, 1.32, 28);
        outerRingGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(
            outerRingGeo,
            new THREE.MeshBasicMaterial({ color: teamColor, side: THREE.DoubleSide, transparent: true, opacity: 0.94 })
        );
        ring.position.y = 0.05;
        group.add(ring);

        const innerDiscGeo = new THREE.CircleGeometry(1.02, 24);
        innerDiscGeo.rotateX(-Math.PI / 2);
        const innerDisc = new THREE.Mesh(
            innerDiscGeo,
            new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.24, side: THREE.DoubleSide })
        );
        innerDisc.position.y = 0.03;
        group.add(innerDisc);

        const pillarGeo = new THREE.CylinderGeometry(0.84, 1.08, 2.65, 18, 1, true);
        const pillarMat = new THREE.MeshBasicMaterial({
            color: isLocalPlayer ? 0xfde047 : teamColor,
            transparent: true,
            opacity: isLocalPlayer ? 0.20 : 0.12,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const beaconPillar = new THREE.Mesh(pillarGeo, pillarMat);
        beaconPillar.position.y = 1.36;
        group.add(beaconPillar);

        let localRadarRing = null;
        if (isLocalPlayer) {
            const radarGeo = new THREE.RingGeometry(1.34, 1.56, 28);
            radarGeo.rotateX(-Math.PI / 2);
            localRadarRing = new THREE.Mesh(
                radarGeo,
                new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
            );
            localRadarRing.position.y = 0.06;
            group.add(localRadarRing);
        }

        // 5. Floating Player Ship Nameplate
        const nameSprite = this.createPlayerShipNameplate(playerName || arch.name, arch.vesselTitle, arch.color, isLocalPlayer);
        nameSprite.position.set(0, 3.10, 0);
        group.add(nameSprite);

        // 6. Local Player 3D Arrow Marker (ONLY visible on your own ship!)
        let myArrowMarker = null;
        if (isLocalPlayer) {
            myArrowMarker = this.createLocalPlayerArrowMarker(arch.color);
            myArrowMarker.position.set(0, 4.45, 0);
            group.add(myArrowMarker);
        }

        group.scale.setScalar(1.50);
        group.userData = {
            baseShipScale: 1.50,
            mainSail,
            foreSail,
            flag,
            ring,
            innerDisc,
            beaconPillar,
            localRadarRing,
            nameSprite,
            myArrowMarker,
            archetype: arch,
            archetypeId: archetypeId % 5,
            playerName: playerName || arch.name,
            isLocalPlayer: Boolean(isLocalPlayer)
        };
        return group;
    }

    // ------------------------------------------------------------------------
    // 2. FRESH, GEOGRAPHICALLY ACCURATE LOW-POLY 3D DIORAMAS FOR ALL 6 REGIONS
    //    - Scale ~0.65x-0.75x (set in World3D), random Y rotation & ±12% jitter
    //    - MeshLambertMaterial + flatShading: true, castShadow: false, zero PointLight
    //    - Static parts merged by material in World3D; rotors/boats kept separate!
    // ------------------------------------------------------------------------
    static createLandHexDiorama(spec, surfaceY, animRegistry = null) {
        const group = new THREE.Group();
        group.position.y = surfaceY;

        const seed = Math.abs((spec.q * 73856093) ^ (spec.r * 19349663) ^ (spec.regionId * 83492791));
        const r1 = this.seededRandom(seed + 1);
        const r2 = this.seededRandom(seed + 2);
        const r3 = this.seededRandom(seed + 3);
        const variant = (Math.abs(spec.q * 3 + spec.r * 5)) % 3;

        const mat = (color, opts = {}) => {
            const mutedCol = new THREE.Color(color);
            mutedCol.offsetHSL(0, -0.26, -0.03);
            return new THREE.MeshLambertMaterial({
                color: mutedCol,
                flatShading: true,
                ...opts
            });
        };

        const woodMat = mat(0x6b3e1b);
        const darkWoodMat = mat(0x4a2511);
        const grayTrunkMat = mat(0x94a3b8);
        const whiteMat = mat(0xf8fafc);
        const canalTurqMat = mat(0x38a3b8); // Muted turquoise canal (no emissive on background props)
        const siltCanalMat = mat(0xa86840); // Muted reddish-brown alluvial canal

        const addTree = (x, z, scale = 1.0, style = "pine", leafColorHex = 0x15803d) => {
            const t = new THREE.Group();
            const localSeed = Math.abs(Math.floor((x * 131 + z * 257 + seed) * 10));
            const randRot = this.seededRandom(localSeed + 5) * Math.PI * 2;
            const randScale = scale * (0.88 + this.seededRandom(localSeed + 9) * 0.24); // ±12% natural variation
            const leafMat = mat(leafColorHex);

            if (style === "palm") {
                // Hàng dừa nghiêng thân mảnh ven biển
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.048, 0.56, 5), woodMat);
                trunk.position.set(0.04, 0.27, 0);
                trunk.rotation.z = -0.20;
                t.add(trunk);
                for (let f = 0; f < 5; f++) {
                    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.40, 4), leafMat);
                    frond.rotation.z = 1.15;
                    frond.rotation.y = (f / 5) * Math.PI * 2;
                    frond.position.set(0.10, 0.54, 0);
                    t.add(frond);
                }
            } else if (style === "bamboo") {
                // Lũy tre xanh mảnh (4 thân tre mảnh + chòm lá xanh mướt)
                const stalkMat = mat(0x22c55e);
                for (let b = 0; b < 4; b++) {
                    const h = 0.64 + (b % 3) * 0.12;
                    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, h, 5), stalkMat);
                    stalk.position.set((b - 1.5) * 0.065, h / 2, ((b % 2) - 0.5) * 0.08);
                    stalk.rotation.z = (b - 1.5) * 0.06;
                    t.add(stalk);
                }
                const tuft = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), leafMat);
                tuft.scale.set(1.30, 0.58, 1.10);
                tuft.position.y = 0.74;
                t.add(tuft);
            } else if (style === "broadleaf") {
                // Rừng cây lá rộng thân cao (Tây Nguyên)
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.068, 0.52, 5), darkWoodMat);
                trunk.position.y = 0.26;
                const cMain = new THREE.Mesh(new THREE.DodecahedronGeometry(0.30, 0), leafMat);
                cMain.scale.set(1.22, 0.88, 1.18);
                cMain.position.y = 0.66;
                const cSide = new THREE.Mesh(new THREE.DodecahedronGeometry(0.20, 0), leafMat);
                cSide.position.set(0.18, 0.56, 0.08);
                t.add(trunk, cMain, cSide);
            } else if (style === "rubber") {
                // Cây cao su thân xám thẳng tắp, tán xanh nhạt (Đông Nam Bộ)
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.44, 5), grayTrunkMat);
                trunk.position.y = 0.22;
                const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.21, 0), leafMat);
                crown.scale.set(1.05, 0.92, 1.05);
                crown.position.y = 0.52;
                t.add(trunk, crown);
            } else if (style === "orchard") {
                // Vườn cây ăn trái tán tròn xanh tươi (ĐBSCL)
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.28, 5), woodMat);
                trunk.position.y = 0.14;
                const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), leafMat);
                crown.scale.set(1.12, 0.94, 1.12);
                crown.position.y = 0.40;
                t.add(trunk, crown);
            } else {
                // Cây thông lá kim 3 tầng tán (Trung du & Miền núi Bắc Bộ)
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.26, 5), darkWoodMat);
                trunk.position.y = 0.13;
                const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.34, 6), leafMat);
                c1.position.y = 0.34;
                const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.30, 6), leafMat);
                c2.position.y = 0.56;
                const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 6), leafMat);
                c3.position.y = 0.76;
                t.add(trunk, c1, c2, c3);
            }
            t.position.set(x, 0, z);
            t.rotation.y = randRot;
            t.scale.setScalar(randScale);
            group.add(t);
            return t;
        };

        const addHouse = (x, z, w, h, d, wallCol, roofCol, onStilts = false, rotY = 0, roofHeightMul = 0.72) => {
            const hGroup = new THREE.Group();
            let baseY = 0;
            if (onStilts) {
                baseY = 0.16;
                [[-w * 0.38, -d * 0.38], [w * 0.38, -d * 0.38], [-w * 0.38, d * 0.38], [w * 0.38, d * 0.38]].forEach(([sx, sz]) => {
                    const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.18, 5), darkWoodMat);
                    stilt.position.set(sx, 0.09, sz);
                    hGroup.add(stilt);
                });
            }
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(wallCol));
            body.position.y = baseY + h / 2;
            const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.80, h * roofHeightMul, 4), mat(roofCol));
            roof.rotation.y = Math.PI / 4;
            roof.position.y = baseY + h + h * (roofHeightMul * 0.44);
            hGroup.add(body, roof);
            hGroup.position.set(x, 0, z);
            hGroup.rotation.y = rotY;
            group.add(hGroup);
            return hGroup;
        };

        // Helper: Tua-bin điện gió trắng thân mảnh (cánh quạt tách riêng xoay chậm)
        const addWindTurbine = (tx, tz, height = 1.26, speed = 1.05) => {
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.054, height, 6), whiteMat);
            mast.position.set(tx, height / 2, tz);
            const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.14), mat(0xe2e8f0));
            nacelle.position.set(tx, height, tz);
            group.add(mast, nacelle);

            const rotor = new THREE.Group();
            for (let b = 0; b < 3; b++) {
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.48, 0.016), whiteMat);
                blade.position.y = 0.23;
                const p = new THREE.Group();
                p.rotation.z = (b / 3) * Math.PI * 2;
                p.add(blade);
                rotor.add(p);
            }
            rotor.position.set(tx, height, tz + 0.08);
            group.add(rotor);
            if (animRegistry) animRegistry.push({ type: "spin_z", mesh: rotor, speed });
        };

        // Helper: Tấm pin mặt trời nghiêng màu xanh lam đậm ánh sáng nhẹ
        const addSolarPanel = (px, pz, rotY = 0) => {
            const pGroup = new THREE.Group();
            const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.16, 5), grayTrunkMat);
            stand.position.y = 0.08;
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.24), mat(0xcbd5e1));
            frame.position.y = 0.16;
            frame.rotation.x = 0.42;
            const cellMat = mat(0x1e3a8a);
            const cell = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.03, 0.21), cellMat);
            cell.position.y = 0.166;
            cell.rotation.x = 0.42;
            pGroup.add(stand, frame, cell);
            pGroup.position.set(px, 0, pz);
            pGroup.rotation.y = rotY;
            group.add(pGroup);
        };

        // ====================================================================
        // 6 VIETNAMESE ECONOMIC REGIONS — GEOGRAPHICALLY ACCURATE LOW-POLY CLUSTERS
        // ====================================================================
        if (spec.regionId === 0) {
            // 1. TRUNG DU & MIỀN NÚI BẮC BỘ:
            //    Đồi núi đa giác xếp lớp 2–3 tầng xanh rêu đậm có chóp xám đá nhạt,
            //    ruộng bậc thang 3 tầng (xanh non xen vàng nhạt), luống đồi chè xanh mướt,
            //    cây thông lá kim 3 tầng tán & nhà sàn gỗ nhỏ mái nâu đậm.
            const mossDarkMat = mat(0x1b4332);
            const mossMidMat = mat(0x2d6a4f);
            const rockTipMat = mat(0x94a3b8);

            if (variant === 0) {
                // Cụm núi 3 tầng xanh rêu đậm có chóp xám đá nhạt + thông 3 tầng + nhà sàn gỗ
                const addMountainPeak = (mx, mz, r, h, bodyMat) => {
                    const body = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), bodyMat);
                    body.position.set(mx, h * 0.5, mz);
                    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.36, h * 0.36, 6), rockTipMat);
                    cap.position.set(mx, h * 0.84, mz);
                    group.add(body, cap);
                };
                addMountainPeak(-0.30, -0.26, 0.76, 1.32, mossDarkMat);
                addMountainPeak(0.38, -0.30, 0.56, 0.96, mossMidMat);
                addMountainPeak(-0.56, 0.28, 0.44, 0.68, mossMidMat);

                addHouse(0.30, 0.34, 0.42, 0.24, 0.32, 0x78350f, 0x451a03, true, 0.25);
                addTree(-0.12, 0.46, 0.88, "pine", 0x166534);
                addTree(0.66, 0.16, 0.82, "pine", 0x14532d);

            } else if (variant === 1) {
                // Ruộng bậc thang 3 tầng uốn lượn (xanh non xen vàng nhạt) + nhà sàn gỗ + thông
                const terraceCols = [0x65a30d, 0x84cc16, 0xfde047];
                for (let t = 0; t < 3; t++) {
                    const step = new THREE.Mesh(
                        new THREE.CylinderGeometry(1.06 - t * 0.26, 1.16 - t * 0.26, 0.18, 7),
                        mat(terraceCols[t])
                    );
                    step.position.set(-0.08 * t, 0.09 + t * 0.17, -0.06 * t);
                    group.add(step);
                }
                addHouse(0.46, 0.42, 0.38, 0.22, 0.30, 0x78350f, 0x451a03, true, -0.2);
                addTree(-0.58, 0.42, 0.86, "pine", 0x15803d);
                addTree(-0.34, -0.58, 0.80, "pine", 0x166534);

            } else {
                // Luống đồi chè xanh mướt xếp lớp + đỉnh núi chóp đá + cụm thông 3 tầng
                const teaHill = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 0), mat(0x16a34a));
                teaHill.scale.set(1.25, 0.52, 1.15);
                teaHill.position.set(0.04, 0.16, 0.06);
                group.add(teaHill);
                for (let row = -1; row <= 1; row++) {
                    const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.05 - Math.abs(row) * 0.20, 0.14, 0.16), mat(row === 0 ? 0x22c55e : 0x15803d));
                    ridge.position.set(0.04, 0.28 + (row === 0 ? 0.06 : 0), 0.06 + row * 0.28);
                    ridge.rotation.y = 0.18;
                    group.add(ridge);
                }
                const backPeak = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.92, 6), mossDarkMat);
                backPeak.position.set(-0.46, 0.46, -0.36);
                const backTip = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 6), rockTipMat);
                backTip.position.set(-0.46, 0.78, -0.36);
                group.add(backPeak, backTip);

                addTree(0.54, -0.44, 0.88, "pine", 0x14532d);
                addTree(0.24, -0.54, 0.78, "pine", 0x166534);
                addHouse(-0.42, 0.46, 0.36, 0.22, 0.28, 0x78350f, 0x451a03, true, 0.3);
            }

        } else if (spec.regionId === 1) {
            // 2. ĐỒNG BẰNG SÔNG HỒNG:
            //    Cụm làng quê truyền thống (2–3 nhà tường vàng nhạt mái ngói đỏ gạch)
            //    bao quanh bởi lũy tre xanh mảnh; thửa ruộng lúa xanh mướt xen kênh phù sa nâu đỏ nhạt.
            const canal1 = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.04, 0.28), siltCanalMat);
            canal1.position.set(-0.26, 0.025, 0.34);
            canal1.rotation.y = 0.24;
            const canal2 = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.04, 0.28), siltCanalMat);
            canal2.position.set(0.36, 0.025, 0.16);
            canal2.rotation.y = -0.22;
            group.add(canal1, canal2);

            if (variant === 0) {
                // Cụm làng quê 3 nhà tường vàng nhạt mái ngói đỏ gạch + lũy tre xanh mảnh
                addHouse(-0.34, -0.26, 0.44, 0.22, 0.34, 0xfef3c7, 0xb91c1c, false, 0.10);
                addHouse(0.24, -0.34, 0.38, 0.20, 0.30, 0xfef3c7, 0xc2410c, false, -0.18);
                addHouse(-0.02, 0.02, 0.34, 0.18, 0.26, 0xfef3c7, 0xb91c1c, false, 0.05);
                addTree(-0.66, -0.06, 0.96, "bamboo", 0x15803d);
                addTree(0.62, -0.14, 0.94, "bamboo", 0x16a34a);
                addTree(0.18, 0.56, 0.88, "bamboo", 0x15803d);

            } else if (variant === 1) {
                // Thửa ruộng lúa xanh mướt chia ô rõ nét + 2 nhà làng quê + lũy tre
                const paddyA = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, 0.52), mat(0x4ade80));
                paddyA.position.set(0.28, 0.03, -0.34);
                const paddyB = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.48), mat(0x84cc16));
                paddyB.position.set(-0.38, 0.03, -0.36);
                group.add(paddyA, paddyB);

                addHouse(-0.44, 0.02, 0.38, 0.20, 0.30, 0xfef3c7, 0xb91c1c, false, 0.18);
                addHouse(0.02, -0.04, 0.32, 0.18, 0.26, 0xfef3c7, 0xc2410c, false, -0.12);
                addTree(0.64, -0.32, 0.94, "bamboo", 0x15803d);
                addTree(-0.56, 0.52, 0.86, "bamboo", 0x16a34a);

            } else {
                // Làng quê bên kênh phù sa + ruộng lúa xanh mướt + lũy tre bao quanh
                const paddy = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.05, 0.44), mat(0x22c55e));
                paddy.position.set(0.06, 0.03, -0.46);
                group.add(paddy);

                addHouse(-0.32, -0.10, 0.44, 0.22, 0.32, 0xfef3c7, 0xc2410c, false, 0.12);
                addHouse(0.30, -0.12, 0.38, 0.20, 0.28, 0xfef3c7, 0xb91c1c, false, -0.15);
                addTree(-0.66, -0.34, 0.92, "bamboo", 0x15803d);
                addTree(0.64, 0.34, 0.94, "bamboo", 0x16a34a);
            }

        } else if (spec.regionId === 2) {
            // 3. DUYÊN HẢI MIỀN TRUNG:
            //    Đụn cát vàng nhạt ven biển thoai thoải + hàng dừa nghiêng thân mảnh;
            //    cụm 2–3 tua-bin điện gió trắng thân mảnh (cánh quạt xoay chậm) + tấm pin mặt trời xanh lam đậm!
            const duneLightMat = mat(0xfef08a);
            const duneSandMat = mat(0xfde68a);

            const dune1 = new THREE.Mesh(new THREE.ConeGeometry(0.84, 0.36, 7), duneLightMat);
            dune1.scale.set(1.28, 0.72, 0.95);
            dune1.position.set(-0.22, 0.13, 0.28);
            const dune2 = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.30, 7), duneSandMat);
            dune2.scale.set(1.18, 0.68, 0.88);
            dune2.position.set(0.42, 0.10, -0.24);
            group.add(dune1, dune2);

            if (variant === 0) {
                // Cụm 3 tua-bin điện gió trắng thân mảnh + tấm pin mặt trời
                addWindTurbine(-0.46, -0.30, 1.28, 1.05);
                addWindTurbine(0.16, -0.36, 1.16, 0.98);
                addWindTurbine(0.48, 0.22, 1.22, 1.15);
                addSolarPanel(-0.26, 0.42, 0.15);
                addSolarPanel(0.14, 0.42, 0.15);

            } else if (variant === 1) {
                // Trang trại điện mặt trời (4 tấm pin xanh lam đậm) + 2 tua-bin điện gió + dừa nghiêng
                addSolarPanel(-0.42, 0.12, 0.08);
                addSolarPanel(-0.02, 0.12, 0.08);
                addSolarPanel(-0.42, 0.44, 0.08);
                addSolarPanel(-0.02, 0.44, 0.08);
                addWindTurbine(0.36, -0.34, 1.24, 1.02);
                addWindTurbine(-0.34, -0.38, 1.14, 1.12);
                addTree(0.52, 0.34, 0.96, "palm", 0x16a34a);

            } else {
                // Đụn cát vàng nhạt + hàng dừa nghiêng thân mảnh ven biển + 2 tua-bin điện gió
                addWindTurbine(-0.36, -0.34, 1.24, 1.00);
                addWindTurbine(0.38, -0.22, 1.14, 1.10);
                addTree(-0.46, 0.38, 1.02, "palm", 0x15803d);
                addTree(-0.04, 0.46, 0.96, "palm", 0x16a34a);
                addTree(0.40, 0.34, 0.92, "palm", 0x15803d);
            }

        } else if (spec.regionId === 3) {
            // 4. TÂY NGUYÊN:
            //    Gò đồi đất đỏ nâu Bazan đặc trưng + luống cây cà phê tán tròn xanh đậm xếp hàng ngay ngắn;
            //    cụm rừng cây lá rộng thân cao + nhà gỗ mái dốc thấp hài hòa đất đỏ.
            const basaltMat = mat(0x9a3412);
            const coffeeMat = mat(0x14532d);

            const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(0.76, 0), basaltMat);
            hill.scale.set(1.36, 0.42, 1.20);
            hill.position.set(0, 0.13, -0.10);
            group.add(hill);

            if (variant === 0) {
                // Nhà gỗ mái dốc thấp + 2 luống cà phê xếp hàng + cụm rừng cây lá rộng thân cao
                addHouse(-0.34, -0.14, 0.52, 0.24, 0.34, 0x78350f, 0x5c2d0c, true, 0.18, 0.56);
                for (let row = 0; row < 2; row++) {
                    for (let col = -1; col <= 1; col++) {
                        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), coffeeMat);
                        bush.scale.set(1.08, 0.88, 1.08);
                        bush.position.set(col * 0.34, 0.18, 0.30 + row * 0.28);
                        group.add(bush);
                    }
                }
                addTree(0.44, -0.32, 0.98, "broadleaf", 0x15803d);
                addTree(0.12, -0.50, 0.90, "broadleaf", 0x166534);

            } else if (variant === 1) {
                // Luống cây cà phê tán tròn xanh đậm xếp hàng ngay ngắn (3x3) trên đồi đất đỏ Bazan
                for (let row = -1; row <= 1; row++) {
                    for (let col = -1; col <= 1; col++) {
                        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), coffeeMat);
                        bush.scale.set(1.08, 0.86, 1.08);
                        bush.position.set(col * 0.38, 0.24, row * 0.34 - 0.06);
                        group.add(bush);
                    }
                }
                addTree(-0.62, -0.44, 0.92, "broadleaf", 0x15803d);
                addHouse(0.48, 0.48, 0.38, 0.20, 0.28, 0x78350f, 0x5c2d0c, false, -0.2, 0.55);

            } else {
                // Cụm rừng cây lá rộng thân cao + nhà gỗ mái dốc thấp + 1 luống cà phê
                addTree(-0.46, -0.34, 1.04, "broadleaf", 0x166534);
                addTree(0.06, -0.44, 0.96, "broadleaf", 0x15803d);
                addTree(0.50, -0.24, 0.92, "broadleaf", 0x14532d);
                addHouse(-0.28, 0.26, 0.50, 0.24, 0.34, 0x78350f, 0x5c2d0c, true, 0.14, 0.55);
                for (let col = 0; col <= 2; col++) {
                    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), coffeeMat);
                    bush.position.set(0.18 + col * 0.24, 0.20, 0.36 - col * 0.08);
                    group.add(bush);
                }
            }

        } else if (spec.regionId === 4) {
            // 5. ĐÔNG NAM BỘ:
            //    Cụm đô thị & công nghiệp hiện đại: Cao ốc trắng/xanh kính nhạt (cửa sổ emissive dịu),
            //    nhà xưởng mái vòm gọn gàng, và hàng cây cao su thẳng tắp thân xám tán xanh nhạt!
            const glassBlueMat = mat(0x88b4d8);
            const concreteWallMat = mat(0xd8dfe6);
            const roofVaultMat = mat(0x94a3b8);
            const winSoftMat = mat(0xe6ddb8);

            if (variant === 0) {
                // Cụm cao ốc trắng / xanh kính nhạt (cửa sổ emissive dịu) + cây cao su
                const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.42, 0.42), whiteMat);
                t1.position.set(-0.26, 0.71, -0.16);
                const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), winSoftMat);
                w1.position.set(-0.26, 1.06, -0.16);
                const w1b = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), winSoftMat);
                w1b.position.set(-0.26, 0.64, -0.16);

                const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.40, 1.04, 0.40), glassBlueMat);
                t2.position.set(0.30, 0.52, 0.12);
                const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), winSoftMat);
                w2.position.set(0.30, 0.74, 0.12);

                const t3 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.68, 0.36), concreteWallMat);
                t3.position.set(-0.34, 0.34, 0.42);
                group.add(t1, w1, w1b, t2, w2, t3);

                addTree(0.42, -0.40, 0.90, "rubber", 0x86efac);
                addTree(0.10, -0.44, 0.88, "rubber", 0x4ade80);

            } else if (variant === 1) {
                // Khu công nghiệp: 2 nhà xưởng mái vòm gọn gàng + hàng cây cao su thẳng tắp
                const addArchedWarehouse = (wx, wz, w, h, d) => {
                    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concreteWallMat);
                    wall.position.set(wx, h / 2, wz);
                    const win = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.08, d + 0.02), winSoftMat);
                    win.position.set(wx, h * 0.62, wz);
                    const vault = new THREE.Mesh(
                        new THREE.CylinderGeometry(d * 0.5, d * 0.5, w, 8, 1, false, 0, Math.PI),
                        roofVaultMat
                    );
                    vault.rotation.z = Math.PI / 2;
                    vault.position.set(wx, h, wz);
                    group.add(wall, win, vault);
                };
                addArchedWarehouse(-0.18, -0.24, 0.86, 0.34, 0.44);
                addArchedWarehouse(0.24, 0.32, 0.72, 0.30, 0.38);

                addTree(-0.56, 0.30, 0.90, "rubber", 0x86efac);
                addTree(-0.56, 0.58, 0.88, "rubber", 0x4ade80);

            } else {
                // Hàng cây cao su thẳng tắp (thân xám, tán xanh nhạt) + 1 tòa văn phòng kính nhạt
                for (let row = 0; row < 2; row++) {
                    for (let col = -1; col <= 1; col++) {
                        addTree(col * 0.38, 0.14 + row * 0.36, 0.92, "rubber", (col + row) % 2 === 0 ? 0x86efac : 0x4ade80);
                    }
                }
                const office = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.96, 0.42), glassBlueMat);
                office.position.set(0.0, 0.48, -0.44);
                const offWin = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.44), winSoftMat);
                offWin.position.set(0.0, 0.68, -0.44);
                group.add(office, offWin);
            }

        } else {
            // 6. ĐỒNG BẰNG SÔNG CỬU LONG:
            //    Ô ruộng lúa xanh vàng, vườn cây ăn trái tán tròn xanh tươi,
            //    ao nuôi tôm hình chữ nhật có bờ đất gọn gàng;
            //    kênh rạch xanh ngọc uốn quanh có cầu nhỏ trắng & 1–2 ghe gỗ mini neo đậu.
            const dikeMat = mat(0x92400e);
            const shrimpWaterMat = mat(0x2890b0);

            // Kênh rạch xanh ngọc uốn nhẹ
            const canal1 = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.04, 0.30), canalTurqMat);
            canal1.position.set(-0.24, 0.025, 0.10);
            canal1.rotation.y = 0.14;
            const canal2 = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.04, 0.28), canalTurqMat);
            canal2.position.set(0.38, 0.025, -0.02);
            canal2.rotation.y = -0.18;
            group.add(canal1, canal2);

            if (variant === 0) {
                // Kênh xanh ngọc + cầu nhỏ màu trắng + 2 ghe gỗ mini neo đậu + vườn cây ăn trái
                const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.64), whiteMat);
                bridgeDeck.position.set(-0.14, 0.16, 0.10);
                const railL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.10, 0.64), whiteMat);
                railL.position.set(-0.24, 0.23, 0.10);
                const railR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.10, 0.64), whiteMat);
                railR.position.set(-0.04, 0.23, 0.10);
                group.add(bridgeDeck, railL, railR);

                const sampan1 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.16), woodMat);
                sampan1.position.set(0.36, 0.08, -0.02);
                sampan1.rotation.y = -0.18;
                group.add(sampan1);
                if (animRegistry) animRegistry.push({ type: "bob_boat", mesh: sampan1, baseY: 0.08, phase: r1 * 6.28 });

                const sampan2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.14), darkWoodMat);
                sampan2.position.set(-0.56, 0.08, 0.14);
                sampan2.rotation.y = 0.16;
                group.add(sampan2);

                addTree(0.46, -0.44, 0.96, "orchard", 0x22c55e);
                addTree(-0.46, -0.42, 0.92, "orchard", 0x16a34a);
                addTree(0.38, 0.48, 0.90, "orchard", 0x15803d);

            } else if (variant === 1) {
                // Ao nuôi tôm hình chữ nhật có bờ đất gọn gàng + ruộng lúa xanh vàng + 1 ghe gỗ
                const addShrimpPond = (px, pz, pw, pd) => {
                    const dike = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.12, 0.09, pd + 0.12), dikeMat);
                    dike.position.set(px, 0.045, pz);
                    const pond = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.10, pd), shrimpWaterMat);
                    pond.position.set(px, 0.052, pz);
                    group.add(dike, pond);
                };
                addShrimpPond(-0.30, -0.38, 0.62, 0.42);
                addShrimpPond(0.40, -0.40, 0.54, 0.38);

                const paddyGold = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.05, 0.42), mat(0xeab308));
                paddyGold.position.set(-0.20, 0.03, 0.50);
                group.add(paddyGold);

                const sampan = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.16), woodMat);
                sampan.position.set(0.34, 0.08, -0.02);
                group.add(sampan);
                if (animRegistry) animRegistry.push({ type: "bob_boat", mesh: sampan, baseY: 0.08, phase: r2 * 6.28 });

                addTree(0.46, 0.46, 0.90, "orchard", 0x22c55e);

            } else {
                // Ô ruộng lúa xanh vàng xen kẽ + vườn cây ăn trái tán tròn xanh tươi + nhà sàn nhỏ
                const paddyGreen = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.05, 0.44), mat(0x84cc16));
                paddyGreen.position.set(-0.36, 0.03, -0.40);
                const paddyYellow = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.44), mat(0xfacc15));
                paddyYellow.position.set(0.34, 0.03, -0.42);
                group.add(paddyGreen, paddyYellow);

                addTree(-0.46, 0.46, 0.98, "orchard", 0x16a34a);
                addTree(0.02, 0.52, 0.92, "orchard", 0x22c55e);
                addTree(0.48, 0.44, 0.94, "orchard", 0x15803d);
                addHouse(-0.02, -0.42, 0.36, 0.20, 0.28, 0xfef3c7, 0xd97706, true, 0.08);
            }
        }

        group.rotation.y = ((seed % 6) * (Math.PI / 3)) + (r3 - 0.5) * 0.30;
        return group;
    }

    // ------------------------------------------------------------------------
    // 3. DETAILED LOW-POLY 3D RESOURCE NODES (SCALE x1.3, MERGED STATIC MESHES)
    //    - MeshLambertMaterial with flatShading: true, zero PointLight
    //    - Distinct silhouettes at zoom-out: Rice Paddy, Timber Yard, Iron Mine
    // ------------------------------------------------------------------------
    static createResourceNodeModel(resourceType) {
        const group = new THREE.Group();
        const staticGroup = new THREE.Group();
        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.18,
            flatShading: true,
            ...opts
        });

        const woodMat = mat(0x5c2d0c);
        const lightCutMat = mat(0xfef3c7, { emissive: 0xfef3c7, emissiveIntensity: 0.22 });

        if (resourceType === "food") {
            // MỎ LÚA: Đế nâu đậm + bó lúa vàng rực (#fde047 / #f59e0b)
            const bundMat = mat(0x451a03, { emissiveIntensity: 0.10 });
            const paddyGreenMat = mat(0x84cc16, { emissiveIntensity: 0.20 });
            const riceGoldMat = mat(0xfde047, { emissive: 0xf59e0b, emissiveIntensity: 0.26 });
            const strawMat = mat(0xf59e0b, { emissive: 0xd97706, emissiveIntensity: 0.24 });
            const thatchMat = mat(0xd97706, { emissiveIntensity: 0.20 });
            const rimMat = mat(0xfde047, { emissive: 0xf59e0b, emissiveIntensity: 0.85 });

            const basePad = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.40, 0.14, 6), bundMat);
            basePad.position.y = 0.07;
            const emRim = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.44, 0.07, 6), rimMat);
            emRim.position.y = 0.04;
            staticGroup.add(basePad, emRim);

            // 3 Terraced Paddy Plots with Brown Earthen Bunds
            [
                [-0.36, 0.15, 0.34, 0.72, 0.56],
                [0.42, 0.18, 0.30, 0.66, 0.52],
                [0.02, 0.21, -0.34, 0.88, 0.54]
            ].forEach(([px, py, pz, pw, pd]) => {
                const bund = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.10, 0.10, pd + 0.10), bundMat);
                bund.position.set(px, py, pz);
                const plot = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.12, pd), paddyGreenMat);
                plot.position.set(px, py + 0.02, pz);
                staticGroup.add(bund, plot);
            });

            // Clusters of Golden Rice Sheaves at Varied Heights
            const sheafSpecs = [
                [-0.52, 0.44, 0.24, 0.62], [-0.24, 0.22, 0.22, 0.50], [-0.40, 0.12, 0.20, 0.56],
                [0.34, 0.42, 0.24, 0.68], [0.56, 0.20, 0.20, 0.52], [0.16, -0.22, 0.22, 0.60],
                [-0.24, -0.34, 0.24, 0.66], [0.42, -0.36, 0.20, 0.54]
            ];
            sheafSpecs.forEach(([sx, sz, r, h]) => {
                const sheaf = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), riceGoldMat);
                sheaf.position.set(sx, 0.22 + h / 2, sz);
                staticGroup.add(sheaf);
            });

            // Conical Haystack (Đống rơm hình chóp)
            const haystack = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.76, 7), strawMat);
            haystack.position.set(0.56, 0.56, -0.18);
            staticGroup.add(haystack);

            // Wooden Stilt Hut with Thatched Roof (Chòi gỗ mái lá)
            const hutBody = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.40, 0.42), woodMat);
            hutBody.position.set(-0.18, 0.48, -0.22);
            const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.42, 4), thatchMat);
            hutRoof.rotation.y = Math.PI / 4;
            hutRoof.position.set(-0.18, 0.88, -0.22);
            staticGroup.add(hutBody, hutRoof);

            // Animated Mini Bamboo Waterwheel
            const wheel = new THREE.Group();
            const wRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 12), strawMat);
            wheel.add(wRim);
            for (let s = 0; s < 4; s++) {
                const sp = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.035), woodMat);
                sp.rotation.z = (s / 4) * Math.PI;
                wheel.add(sp);
            }
            wheel.position.set(0.18, 0.44, 0.56);
            group.add(wheel);
            group.userData.spinZ = wheel;

        } else if (resourceType === "wood") {
            // MỎ GỖ: Đế rêu đậm + thân gỗ nâu socola sẫm (#451a03) tương phản cực mạnh với mặt cắt vàng kem sáng (#fef3c7) + lá thông xanh lục đậm
            const barkMat = mat(0x451a03, { emissiveIntensity: 0.12 });
            const forestFloorMat = mat(0x14532d, { emissiveIntensity: 0.12 });
            const leafMat = mat(0x15803d, { emissive: 0x15803d, emissiveIntensity: 0.22 });
            const shedRoofMat = mat(0x9a3412, { emissiveIntensity: 0.18 });
            const rimMat = mat(0x4ade80, { emissive: 0x16a34a, emissiveIntensity: 0.82 });

            const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.40, 0.14, 6), forestFloorMat);
            mound.position.y = 0.07;
            const emRim = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.44, 0.07, 6), rimMat);
            emRim.position.y = 0.04;
            staticGroup.add(mound, emRim);

            // Pyramid Stack of 6 Round Timber Logs (3 + 2 + 1) with Bright Cut Ends
            const logCoords = [
                [0, -0.24], [0, 0.0], [0, 0.24],     // Bottom row (3)
                [1, -0.12], [1, 0.12],                // Middle row (2)
                [2, 0.0]                              // Top log (1)
            ];
            logCoords.forEach(([row, zOff]) => {
                const ly = 0.24 + row * 0.19;
                const lz = 0.36 + zOff;
                const logBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.86, 7), barkMat);
                logBody.rotation.z = Math.PI / 2;
                logBody.position.set(-0.08, ly, lz);
                // Bright cut ends on both sides
                const endL = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.88, 7), lightCutMat);
                endL.rotation.z = Math.PI / 2;
                endL.position.set(-0.08, ly, lz);
                staticGroup.add(logBody, endL);
            });

            // 3 Freshly-Cut Tree Stumps (Gốc cây vừa cưa)
            [[-0.68, -0.12, 0.26], [0.64, 0.24, 0.24], [-0.56, 0.56, 0.20]].forEach(([sx, sz, sh]) => {
                const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, sh, 7), barkMat);
                stump.position.set(sx, 0.14 + sh / 2, sz);
                const cutTop = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 7), lightCutMat);
                cutTop.position.set(sx, 0.14 + sh + 0.01, sz);
                staticGroup.add(stump, cutTop);
            });

            // Small Wooden Logging Shed (Lán gỗ nhỏ) + 2 Background Pine Trees
            const shedBody = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.46), woodMat);
            shedBody.position.set(0.32, 0.36, -0.34);
            const shedRoof = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.36, 4), shedRoofMat);
            shedRoof.rotation.y = Math.PI / 4;
            shedRoof.position.set(0.32, 0.74, -0.34);
            staticGroup.add(shedBody, shedRoof);

            [[-0.36, -0.46, 1.05], [-0.72, -0.42, 0.85]].forEach(([tx, tz, sc]) => {
                const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 0.42, 6), barkMat);
                tr.position.set(tx, 0.32, tz);
                const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.34 * sc, 0.54 * sc, 6), leafMat);
                c1.position.set(tx, 0.62 * sc, tz);
                const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.24 * sc, 0.44 * sc, 6), leafMat);
                c2.position.set(tx, 0.92 * sc, tz);
                staticGroup.add(tr, c1, c2);
            });

            // Spinning Sawmill Blade
            const sawBlade = new THREE.Mesh(
                new THREE.CylinderGeometry(0.24, 0.24, 0.03, 10),
                mat(0xe2e8f0, { emissive: 0x64748b, emissiveIntensity: 0.25 })
            );
            sawBlade.rotation.x = Math.PI / 2;
            sawBlade.position.set(0.52, 0.36, 0.36);
            group.add(sawBlade);
            group.userData.spinZ = sawBlade;

        } else if (resourceType === "iron") {
            // MỎ SẮT / KHOÁNG SẢN: Vách đá đen than (#0f172a) làm bật cụm tinh thể xanh điện quang (#38bdf8) và bạc sáng (#f1f5f9) emissive 0.65
            const cragMat = mat(0x0f172a, { emissiveIntensity: 0.06 });
            const darkCragMat = mat(0x0f172a, { emissiveIntensity: 0.05 });
            const steelMat = mat(0xe2e8f0, { emissiveIntensity: 0.22 });
            const oreCrystalMat = mat(0x38bdf8, { emissive: 0x38bdf8, emissiveIntensity: 0.65 });
            const silverOreMat = mat(0xf1f5f9, { emissive: 0xf1f5f9, emissiveIntensity: 0.65 });
            const rimMat = mat(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.84 });

            const stonePad = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.40, 0.14, 6), darkCragMat);
            stonePad.position.y = 0.07;
            const emRim = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.44, 0.07, 6), rimMat);
            emRim.position.y = 0.04;
            staticGroup.add(stonePad, emRim);

            // Faceted Dark-Gray Rock Crags
            const crag1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 0), cragMat);
            crag1.scale.set(1.25, 1.35, 1.05);
            crag1.position.set(-0.18, 0.68, -0.22);
            const crag2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), darkCragMat);
            crag2.scale.set(1.05, 1.15, 0.95);
            crag2.position.set(0.46, 0.50, -0.32);
            staticGroup.add(crag1, crag2);

            // Embedded Glowing Metallic Ore Crystals
            [
                [-0.58, 0.72, 0.04, oreCrystalMat, 1.15, 0.3],
                [0.24, 0.84, -0.02, silverOreMat, 1.10, -0.25],
                [0.62, 0.58, -0.18, oreCrystalMat, 0.95, -0.4],
                [-0.36, 0.56, -0.62, silverOreMat, 0.90, 0.2]
            ].forEach(([cx, cy, cz, cMat, sc, rz]) => {
                const crys = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 0), cMat);
                crys.scale.set(0.68 * sc, 1.65 * sc, 0.68 * sc);
                crys.rotation.z = rz;
                crys.position.set(cx, cy, cz);
                staticGroup.add(crys);
            });

            // Mine Railway Track (Đoạn ray nhỏ) + Ore Minecart (Xe goòng chở quặng)
            [-0.14, 0.14].forEach(rx => {
                const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.96), steelMat);
                rail.position.set(0.18 + rx, 0.16, 0.42);
                staticGroup.add(rail);
            });
            for (let t = 0; t < 5; t++) {
                const tie = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.03, 0.07), woodMat);
                tie.position.set(0.18, 0.15, 0.04 + t * 0.19);
                staticGroup.add(tie);
            }
            // Minecart Body + Wheels + Glowing Ore Heap inside
            const cartBody = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.46), mat(0x475569));
            cartBody.position.set(0.18, 0.32, 0.48);
            const cartOre1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), oreCrystalMat);
            cartOre1.position.set(0.14, 0.48, 0.44);
            const cartOre2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), silverOreMat);
            cartOre2.position.set(0.24, 0.46, 0.54);
            staticGroup.add(cartBody, cartOre1, cartOre2);

            // Top Rotating Ore Crystal
            const topCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), oreCrystalMat);
            topCrystal.position.set(-0.18, 1.56, -0.22);
            group.add(topCrystal);
            group.userData.spinY = topCrystal;
        }

        // Merge static parts by material (flatShading: true, castShadow: false for high FPS!)
        const mergedRes = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), {
            castShadow: false,
            flatShading: true
        });
        if (mergedRes) {
            group.add(mergedRes);
        } else {
            group.add(staticGroup);
        }

        // Scale x1.3 for clear Resource Node silhouette (stays neatly within hex footprint)
        group.scale.set(1.32, 1.42, 1.32);
        group.userData.baseScale = { x: 1.32, y: 1.42, z: 1.32 };
        return group;
    }

    // ------------------------------------------------------------------------
    // 4. 6 REGIONAL LOW-POLY 3D TRADE PORTS (SCALE x1.35, MERGED STATIC MESHES)
    //    - Pier extends toward +X (world3d.js auto-rotates toward nearest open sea)
    //    - Light-gray concrete quay + Cyan emissive base + Red-White Lighthouse
    //      + Colorful Containers + L-shaped Gantry Crane + Regional Landmarks!
    // ------------------------------------------------------------------------
    static createTradePortModel(regionColor, regionId = 0) {
        const group = new THREE.Group();
        const staticGroup = new THREE.Group();

        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.18,
            flatShading: true,
            ...opts
        });

        const concreteMat = mat(0x334155, { emissiveIntensity: 0.12 });
        const darkConcreteMat = mat(0xf8fafc, { emissiveIntensity: 0.22 });
        const cyanRimMat = mat(0x06b6d4, { emissive: 0x06b6d4, emissiveIntensity: 0.88 });
        const woodPierMat = mat(0x78350f);
        const whiteMat = mat(0xffffff, { emissiveIntensity: 0.22 });
        const redMat = mat(0xef4444, { emissive: 0xef4444, emissiveIntensity: 0.24 });
        const craneYellowMat = mat(0xfacc15, { emissive: 0xfacc15, emissiveIntensity: 0.26 });
        const craneOrangeMat = mat(0xfacc15, { emissive: 0xeab308, emissiveIntensity: 0.26 });
        const bollardMat = mat(0x1e293b, { emissiveIntensity: 0.06 });

        const containerColors = [0xef4444, 0x2563eb, 0xf97316, 0x16a34a];

        // 1. Common Base: Dark Slate-Blue Quay (#334155, y = 0) + Cyan Emissive Trim
        const quay = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.42, 0.20, 6), concreteMat);
        quay.position.y = 0.10;
        const emRim = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.45, 0.08, 6), cyanRimMat);
        emRim.position.y = 0.04;
        staticGroup.add(quay, emRim);

        // 2. Bright White Pier (#f8fafc) Extending Toward Open Sea (+X) + Mooring Bollards
        const isMekong = (regionId === 5);
        const pierDeck = new THREE.Mesh(
            new THREE.BoxGeometry(1.18, 0.14, 0.64),
            isMekong ? woodPierMat : darkConcreteMat
        );
        pierDeck.position.set(0.68, 0.16, 0);
        staticGroup.add(pierDeck);

        [0.45, 0.85, 1.18].forEach(bx => {
            [-0.26, 0.26].forEach(bz => {
                const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 6), bollardMat);
                bollard.position.set(bx, 0.28, bz);
                staticGroup.add(bollard);
            });
        });

        // 3. Red-and-White Striped Lighthouse with Yellow Emissive Lantern
        const lhX = 0.54, lhZ = 0.56;
        const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.42, 8), whiteMat);
        lhBase.position.set(lhX, 0.40, lhZ);
        const lhStripe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.34, 8), redMat);
        lhStripe1.position.set(lhX, 0.78, lhZ);
        const lhStripe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.32, 8), whiteMat);
        lhStripe2.position.set(lhX, 1.11, lhZ);
        const lhCap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.28, 8), redMat);
        lhCap.position.set(lhX, 1.64, lhZ);
        staticGroup.add(lhBase, lhStripe1, lhStripe2, lhCap);

        const lantern = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 8, 8),
            mat(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 0.98 })
        );
        lantern.position.set(lhX, 1.40, lhZ);
        group.add(lantern);

        // Slowly Rotating Soft Translucent Lighthouse Cone Beam (Zero PointLight, AdditiveBlending!)
        const lhBeamPivot = new THREE.Group();
        lhBeamPivot.position.set(lhX, 1.40, lhZ);
        const lhConeGeo = new THREE.ConeGeometry(0.88, 3.1, 10, 1, true);
        lhConeGeo.rotateZ(Math.PI / 2);
        lhConeGeo.translate(1.55, 0, 0);
        const lhConeMat = new THREE.MeshBasicMaterial({
            color: 0xfef08a,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const lhBeamMesh = new THREE.Mesh(lhConeGeo, lhConeMat);
        lhBeamPivot.add(lhBeamMesh);
        group.add(lhBeamPivot);

        // Helper: Add a stacked container at (x, y, z)
        const addContainer = (cx, cy, cz, colorIdx, rotY = 0) => {
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(0.44, 0.20, 0.22),
                mat(containerColors[colorIdx % containerColors.length])
            );
            box.position.set(cx, cy, cz);
            box.rotation.y = rotY;
            staticGroup.add(box);
        };

        // Helper: Add a static L-shaped Gantry Crane
        const addStaticGantryCrane = (gx, gz, height, craneMat) => {
            const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.08), craneMat);
            leg1.position.set(gx, 0.20 + height / 2, gz - 0.14);
            const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.08), craneMat);
            leg2.position.set(gx, 0.20 + height / 2, gz + 0.14);
            const cross = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.36), craneMat);
            cross.position.set(gx, 0.20 + height - 0.08, gz);
            const boom = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.09, 0.12), craneMat);
            boom.position.set(gx + 0.32, 0.20 + height + 0.02, gz);
            staticGroup.add(leg1, leg2, cross, boom);
        };

        // 4. Primary Animated L-Shaped Harbor Crane on Pier
        const cranePost = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.05, 0.11), craneYellowMat);
        cranePost.position.set(0.38, 0.72, -0.46);
        staticGroup.add(cranePost);

        const craneArmGroup = new THREE.Group();
        const boom = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.08), craneOrangeMat);
        boom.position.set(0.28, 0, 0);
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 4), bollardMat);
        cable.position.set(0.62, -0.20, 0);
        const hookBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.16), mat(containerColors[regionId % containerColors.length]));
        hookBox.position.set(0.62, -0.40, 0);
        craneArmGroup.add(boom, cable, hookBox);
        craneArmGroup.position.set(0.38, 1.24, -0.46);
        group.add(craneArmGroup);

        // 5. Regional Port Differentiation
        if (regionId === 0 || regionId === 1) {
            // CẢNG BẮC BỘ (HẢI PHÒNG / CÁI LÂN): Ụ kho than + bãi container dày + 2 cần cẩu lớn
            const coalMound = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.44, 7), mat(0x1f2937));
            coalMound.position.set(-0.56, 0.40, -0.42);
            staticGroup.add(coalMound);

            addContainer(-0.52, 0.30, 0.22, 0);
            addContainer(-0.52, 0.30, 0.48, 1);
            addContainer(-0.52, 0.50, 0.35, 3);
            addContainer(-0.02, 0.30, 0.46, 2);
            addStaticGantryCrane(0.08, -0.58, 1.15, craneOrangeMat);

        } else if (regionId === 2 || regionId === 3) {
            // CẢNG MIỀN TRUNG (ĐÀ NẴNG / QUY NHƠN): Bến tàu du lịch hiện đại + vách đá chắn sóng thấp
            const terminal = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.38, 0.56), whiteMat);
            terminal.position.set(-0.46, 0.39, 0.16);
            const termRoof = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 0.64), mat(0x0284c7));
            termRoof.position.set(-0.46, 0.62, 0.16);
            staticGroup.add(terminal, termRoof);

            // Low rocky breakwater seawall protecting the harbor
            [[-0.22, -0.82, 0.28], [0.16, -0.88, 0.24], [0.54, -0.84, 0.22]].forEach(([rx, rz, rr]) => {
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), mat(0x64748b));
                rock.scale.set(1.2, 0.72, 1.0);
                rock.position.set(rx, 0.22, rz);
                staticGroup.add(rock);
            });

            addContainer(-0.42, 0.30, -0.42, 1);
            addContainer(-0.42, 0.50, -0.42, 4);
            addContainer(-0.02, 0.30, 0.48, 0);

        } else if (regionId === 4) {
            // CẢNG ĐÔNG NAM BỘ (CÁI MÉP – SÀI GÒN): Quy mô lớn nhất, 2 cần cẩu giàn cao & cụm container xếp 3 tầng!
            addStaticGantryCrane(-0.05, -0.60, 1.38, craneYellowMat);
            addStaticGantryCrane(-0.05, 0.60, 1.28, craneOrangeMat);

            // 3-Tier Stacked Container Cluster (6 containers stacked 3 high!)
            addContainer(-0.56, 0.30, -0.22, 0);
            addContainer(-0.56, 0.30, 0.06, 1);
            addContainer(-0.56, 0.30, 0.34, 2);
            addContainer(-0.56, 0.50, -0.08, 3);
            addContainer(-0.56, 0.50, 0.20, 4);
            addContainer(-0.56, 0.70, 0.06, 0);

        } else {
            // CẢNG ĐBSCL (CẦN THƠ – CỬU LONG): Cầu cảng gỗ + kho thóc mái vòm + vài chiếc ghe nhỏ neo sát mép
            const granary = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.34, 0.60), mat(0xfef3c7));
            granary.position.set(-0.46, 0.37, 0.08);
            const domeRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.72, 8, 1, false, 0, Math.PI), mat(0xd97706));
            domeRoof.rotation.z = Math.PI / 2;
            domeRoof.position.set(-0.46, 0.54, 0.08);
            staticGroup.add(granary, domeRoof);

            addContainer(-0.42, 0.30, -0.50, 2);
            addContainer(-0.42, 0.50, -0.50, 4);

            // 2 Small River Sampans moored right next to the wooden pier
            [[0.82, -0.54, 0.25], [0.98, 0.48, -0.30]].forEach(([bx, bz, rot]) => {
                const boat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.20), woodPierMat);
                boat.position.set(bx, 0.14, bz);
                boat.rotation.y = rot;
                const cargo = new THREE.Mesh(new THREE.DodecahedronGeometry(0.10, 0), mat(0xfacc15));
                cargo.position.set(bx, 0.24, bz);
                staticGroup.add(boat, cargo);
            });
        }

        // Merge static port parts by material (flatShading: true, castShadow: true) for high FPS!
        const mergedPort = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), {
            castShadow: true,
            flatShading: true
        });
        if (mergedPort) {
            group.add(mergedPort);
        } else {
            staticGroup.traverse(c => { if (c.isMesh) c.castShadow = true; });
            group.add(staticGroup);
        }
        craneArmGroup.traverse(c => { if (c.isMesh) c.castShadow = true; });

        // Scale x1.35 for Trade Ports (base fits cleanly within hex tile)
        group.scale.set(1.36, 1.48, 1.36);
        group.userData = { lantern, lhBeamPivot, spinY: craneArmGroup, baseScale: { x: 1.36, y: 1.48, z: 1.36 } };
        return group;
    }

    // ------------------------------------------------------------------------
    // 4B. TÀU FDI — THƯƠNG ĐOÀN QUỐC TẾ (MODERN CONTAINER / SURVEY VESSEL)
    //     Replaces old NPC character with a sleek steel ship: Red waterline,
    //     Navy-blue lower hull, White upper hull, 2 rows of colorful containers,
    //     multi-tier White bridge with dark glass, funnel, spinning radar &
    //     rotating golden emissive positioning ring at waterline y = 0!
    // ------------------------------------------------------------------------
    static createFDIShipModel() {
        const group = new THREE.Group();
        const staticGroup = new THREE.Group();
        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.18,
            flatShading: true,
            ...opts
        });

        const waterlineRedMat = mat(0xdc2626, { emissiveIntensity: 0.22 });
        const navyHullMat = mat(0x1d4ed8, { emissiveIntensity: 0.22 });
        const whiteHullMat = mat(0xffffff, { emissiveIntensity: 0.22 });
        const deckGrayMat = mat(0x64748b);
        const darkGlassMat = mat(0x0f172a, { emissiveIntensity: 0.06 });
        const goldRingMat = mat(0xfbbf24, { emissive: 0xf59e0b, emissiveIntensity: 0.92, side: THREE.DoubleSide });

        // 1. Long Sleek Steel Hull (Waterline y = 0, Pointed Bow +X)
        const redBase = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.12, 0.72), waterlineRedMat);
        redBase.position.set(-0.08, 0.06, 0);
        const redBow = new THREE.Mesh(new THREE.ConeGeometry(0.40, 0.72, 4), waterlineRedMat);
        redBow.rotation.z = -Math.PI / 2;
        redBow.rotation.x = Math.PI / 4;
        redBow.scale.set(1.0, 0.22, 0.90);
        redBow.position.set(1.16, 0.06, 0);

        const navyHull = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.22, 0.76), navyHullMat);
        navyHull.position.set(-0.08, 0.23, 0);
        const navyBow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.76, 4), navyHullMat);
        navyBow.rotation.z = -Math.PI / 2;
        navyBow.rotation.x = Math.PI / 4;
        navyBow.scale.set(1.0, 0.38, 0.92);
        navyBow.position.set(1.18, 0.23, 0);

        const whiteUpper = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.14, 0.78), whiteHullMat);
        whiteUpper.position.set(-0.08, 0.41, 0);
        const whiteBow = new THREE.Mesh(new THREE.ConeGeometry(0.43, 0.78, 4), whiteHullMat);
        whiteBow.rotation.z = -Math.PI / 2;
        whiteBow.rotation.x = Math.PI / 4;
        whiteBow.scale.set(1.0, 0.24, 0.93);
        whiteBow.position.set(1.18, 0.41, 0);

        const deck = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.04, 0.72), deckGrayMat);
        deck.position.set(-0.06, 0.49, 0);
        staticGroup.add(redBase, redBow, navyHull, navyBow, whiteUpper, whiteBow, deck);

        // 2. Forward Cargo Deck: 2 Rows of Colorful Stacked Containers (Red, Yellow, Orange, Green)
        const cCols = [0xdc2626, 0xeab308, 0xf97316, 0x16a34a, 0x2563eb, 0xf59e0b];
        let ci = 0;
        [0.14, 0.64].forEach(cx => {
            [-0.17, 0.17].forEach(cz => {
                const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.20, 0.28), mat(cCols[ci++ % cCols.length]));
                c1.position.set(cx, 0.61, cz);
                const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.20, 0.28), mat(cCols[ci++ % cCols.length]));
                c2.position.set(cx, 0.81, cz);
                staticGroup.add(c1, c2);
            });
        });

        // 3. Multi-Tier White Command Bridge at Stern with Dark Glass Strip & Small Funnel
        const bridge1 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.68), whiteHullMat);
        bridge1.position.set(-0.62, 0.72, 0);
        const bridge2 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.58), whiteHullMat);
        bridge2.position.set(-0.62, 1.10, 0);
        const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.60), darkGlassMat);
        bridgeGlass.position.set(-0.60, 1.14, 0);
        const bridgeWings = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.92), whiteHullMat);
        bridgeWings.position.set(-0.56, 1.12, 0);

        const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.38, 6), navyHullMat);
        funnel.position.set(-0.82, 1.12, 0);
        const funnelTip = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.10, 6), waterlineRedMat);
        funnelTip.position.set(-0.82, 1.32, 0);
        staticGroup.add(bridge1, bridge2, bridgeGlass, bridgeWings, funnel, funnelTip);

        const mergedFDI = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), { castShadow: true, flatShading: true });
        group.add(mergedFDI || staticGroup);

        // 4. Continuously Rotating Radar Bar on Roof of Bridge
        const radarGroup = new THREE.Group();
        const radarMast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.24, 5), whiteHullMat);
        radarMast.position.y = 0.12;
        const radarBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.52), mat(0xfbbf24, { emissive: 0xd97706, emissiveIntensity: 0.45 }));
        radarBar.position.y = 0.26;
        radarGroup.add(radarMast, radarBar);
        radarGroup.position.set(-0.62, 1.28, 0);
        group.add(radarGroup);

        // 5. Rotating Golden Emissive Positioning Ring around Waterline
        const ringGeo = new THREE.RingGeometry(1.26, 1.46, 6);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, goldRingMat);
        ring.position.y = 0.04;
        group.add(ring);

        group.scale.setScalar(1.36);
        group.userData = {
            radarGroup,
            ring,
            baseScale: { x: 1.36, y: 1.36, z: 1.36 }
        };
        return group;
    }

    static createNPCharacterModel() {
        return this.createFDIShipModel();
    }

    // ------------------------------------------------------------------------
    // 5. 9 BESPOKE LOW-POLY 3D VIETNAMESE LANDMARK MONUMENTS (REAL SILHOUETTES!)
    //    - MeshLambertMaterial with flatShading: true (zero PointLight, emissive only)
    //    - Static parts merged by material via mergeStaticMeshesByMaterial for high FPS
    //    - Bottom pivot y = 0, fits cleanly inside hex tile, tier-colored emissive base
    // ------------------------------------------------------------------------
    static createMonumentModel(modelType, tierLevel = 1) {
        const group = new THREE.Group();
        const staticGroup = new THREE.Group();

        // Tier emissive colors: Tier 1 Emerald, Tier 2 Gold, Tier 3 Orange-Red
        const tierColors = { 1: 0x10b981, 2: 0xf59e0b, 3: 0xf97316 };
        const tierCol = tierColors[tierLevel] || 0xf59e0b;

        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.20,
            flatShading: true,
            ...opts
        });

        // Dark charcoal-slate stone pedestal (#1e293b / #334155) + glowing tier rim to sharply separate every Monument!
        const stonePedMat = mat(0x1e293b, { emissiveIntensity: 0.06 });
        const tierEmissiveMat = mat(tierCol, { emissive: tierCol, emissiveIntensity: 0.92 });
        const goldMat = mat(0xfacc15, { emissive: 0xeab308, emissiveIntensity: 0.36 });

        // 1. Elevated 2-Tier Hexagonal Stone Pedestal (raised 1 clear step above surrounding ground, y = 0 at bottom)
        const pedLower = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.52, 0.24, 6), stonePedMat);
        pedLower.position.y = 0.12;
        const pedUpper = new THREE.Mesh(new THREE.CylinderGeometry(1.30, 1.38, 0.18, 6), mat(0x334155, { emissiveIntensity: 0.10 }));
        pedUpper.position.y = 0.33;
        const glowRing = new THREE.Mesh(new THREE.CylinderGeometry(1.47, 1.53, 0.11, 6), tierEmissiveMat);
        glowRing.position.y = 0.06;
        staticGroup.add(pedLower, pedUpper, glowRing);

        const baseY = 0.42;
        let crownY = 2.65;

        if (modelType === "karst_archipelago") {
            // 1. VỊNH HẠ LONG — Nước xanh ngọc rực #06b6d4 + đá vôi sáng
            const jadeWaterMat = mat(0x06b6d4, { emissive: 0x06b6d4, emissiveIntensity: 0.48 });
            const karstRockMat = mat(0xcbd5e1, { emissiveIntensity: 0.18 });
            const treeMat = mat(0x16a34a, { emissiveIntensity: 0.22 });
            const sailMat = mat(0xf59e0b, { emissiveIntensity: 0.24 });

            const waterPad = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.30, 0.08, 6), jadeWaterMat);
            waterPad.position.y = baseY + 0.04;
            staticGroup.add(waterPad);

            // Hòn Trống (Left leaning limestone rock)
            const rockL = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56, 0), karstRockMat);
            rockL.scale.set(0.72, 2.25, 0.78);
            rockL.rotation.z = -0.22;
            rockL.position.set(-0.46, baseY + 0.92, -0.05);
            const capL = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), treeMat);
            capL.scale.set(1.1, 0.55, 1.0);
            capL.position.set(-0.28, baseY + 1.98, -0.05);

            // Hòn Mái (Right leaning limestone rock facing Hòn Trống)
            const rockR = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), karstRockMat);
            rockR.scale.set(0.70, 1.95, 0.76);
            rockR.rotation.z = 0.24;
            rockR.position.set(0.46, baseY + 0.80, -0.02);
            const capR = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), treeMat);
            capR.scale.set(1.1, 0.55, 1.0);
            capR.position.set(0.28, baseY + 1.72, -0.02);

            // Small background karst islet + tiny red-brown junk boat
            const rockBack = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 6), karstRockMat);
            rockBack.position.set(0.05, baseY + 0.48, -0.68);
            const boatHull = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.10, 0.16), mat(0x78350f));
            boatHull.position.set(0.0, baseY + 0.12, 0.62);
            const boatSail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 3), sailMat);
            boatSail.position.set(0.0, baseY + 0.32, 0.62);

            staticGroup.add(rockL, capL, rockR, capR, rockBack, boatHull, boatSail);
            crownY = 2.48;

        } else if (modelType === "terraced_peak") {
            // 2. ĐỈNH FANSIPAN & RUỘNG BẬC THANG SA PA — Ruộng xanh cốm–vàng chanh + chóp bạc + cờ đỏ tươi
            const tCols = [0x22c55e, 0x84cc16, 0xbef264, 0xfde047];
            for (let i = 0; i < 4; i++) {
                const layer = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.18 - i * 0.20, 1.26 - i * 0.20, 0.18, 7),
                    mat(tCols[i])
                );
                layer.position.set(0, baseY + 0.09 + i * 0.17, 0.08 * (3 - i) * 0.25);
                staticGroup.add(layer);
            }

            // Sharp Fansipan Granite Summit Peak + White Peak Cap
            const peak = new THREE.Mesh(new THREE.ConeGeometry(0.56, 1.15, 6), mat(0x64748b));
            peak.position.set(0, baseY + 1.18, -0.05);
            const snowRidge = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.52, 6), mat(0xf8fafc, { emissiveIntensity: 0.24 }));
            snowRidge.position.set(0, baseY + 1.56, -0.05);

            // Fansipan 3143m Steel Pyramid Landmark + Red Flag
            const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 4), mat(0xf1f5f9, { emissive: 0x94a3b8, emissiveIntensity: 0.35 }));
            marker.rotation.y = Math.PI / 4;
            marker.position.set(0, baseY + 1.92, -0.05);

            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.56, 5), goldMat);
            pole.position.set(0.22, baseY + 1.95, -0.05);
            const flag = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.20, 0.03), mat(0xef4444, { emissive: 0xdc2626, emissiveIntensity: 0.38 }));
            flag.position.set(0.38, baseY + 2.12, -0.05);

            staticGroup.add(peak, snowRidge, marker, pole, flag);
            crownY = 2.65;

        } else if (modelType === "khue_van_cac") {
            // 3. VĂN MIẾU – QUỐC TỬ GIÁM — Gạch đỏ son rực + cửa sổ mặt trời vàng sáng
            const brickRedMat = mat(0xdc2626, { emissiveIntensity: 0.24 });
            const woodRedMat = mat(0xb91c1c, { emissiveIntensity: 0.22 });
            const tileRoofMat = mat(0xef4444, { emissiveIntensity: 0.24 });
            const sunWindowMat = mat(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 0.94 });

            // Square stone terrace under pillars
            const terrace = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.16, 1.18), mat(0xe7e5e4));
            terrace.position.y = baseY + 0.08;
            staticGroup.add(terrace);

            // 4 Square Red Brick Pillars
            [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]].forEach(([px, pz]) => {
                const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), brickRedMat);
                pillar.position.set(px, baseY + 0.52, pz);
                staticGroup.add(pillar);
            });

            // Upper Wooden Pavilion + 4 Glowing Round Sun Windows (Mặt Trời Chân Lý)
            const upperFloor = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.92), woodRedMat);
            upperFloor.position.y = baseY + 1.14;
            const sunNS = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.96, 12), sunWindowMat);
            sunNS.rotation.x = Math.PI / 2;
            sunNS.position.y = baseY + 1.14;
            const sunEW = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.96, 12), sunWindowMat);
            sunEW.rotation.z = Math.PI / 2;
            sunEW.position.y = baseY + 1.14;

            // Double-Tiered Red Tile Roofs
            const roof1 = new THREE.Mesh(new THREE.ConeGeometry(1.06, 0.36, 4), tileRoofMat);
            roof1.rotation.y = Math.PI / 4;
            roof1.position.y = baseY + 1.56;
            const roof2 = new THREE.Mesh(new THREE.ConeGeometry(0.76, 0.42, 4), brickRedMat);
            roof2.rotation.y = Math.PI / 4;
            roof2.position.y = baseY + 1.92;
            const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), goldMat);
            finial.position.y = baseY + 2.18;

            staticGroup.add(upperFloor, sunNS, sunEW, roof1, roof2, finial);
            crownY = 2.65;

        } else if (modelType === "limestone_cavern") {
            // 4. VƯỜN QUỐC GIA PHONG NHA – KẺ BÀNG — Vòm đá xám đậm + sông ngầm xanh lam phát sáng mạnh
            const rockMat = mat(0x475569, { emissiveIntensity: 0.14 });
            const darkCaveMat = mat(0x0f172a, { emissiveIntensity: 0.04 });
            const riverMat = mat(0x38bdf8, { emissive: 0x0ea5e9, emissiveIntensity: 0.85 });
            const foliageMat = mat(0x16a34a, { emissiveIntensity: 0.22 });

            // Underground glowing emerald river flowing out of cave
            const river = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 1.85), riverMat);
            river.position.set(0, baseY + 0.04, 0.15);
            staticGroup.add(river);

            // Massive Limestone Cavern Arch (Left wall + Right wall + Top Mountain Vault)
            const wallL = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56, 0), rockMat);
            wallL.scale.set(0.85, 1.55, 1.35);
            wallL.position.set(-0.68, baseY + 0.72, -0.05);
            const wallR = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56, 0), rockMat);
            wallR.scale.set(0.85, 1.55, 1.35);
            wallR.position.set(0.68, baseY + 0.72, -0.05);
            const archTop = new THREE.Mesh(new THREE.DodecahedronGeometry(0.76, 0), rockMat);
            archTop.scale.set(1.45, 0.82, 1.25);
            archTop.position.set(0, baseY + 1.48, -0.08);
            const caveBack = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.05, 0.30), darkCaveMat);
            caveBack.position.set(0, baseY + 0.54, -0.52);

            // Jungle Foliage Crown on top of Karst Mountain
            [[-0.45, 1.88, -0.1], [0.10, 1.98, -0.15], [0.48, 1.84, -0.05]].forEach(([tx, ty, tz]) => {
                const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.30, 0), foliageMat);
                bush.position.set(tx, baseY + ty, tz);
                staticGroup.add(bush);
            });

            // Glowing Golden Stalactites hanging from Cave Roof + Explorer Boat
            [-0.24, 0, 0.24].forEach((sx, idx) => {
                const stal = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38 - (idx % 2) * 0.08, 5), goldMat);
                stal.rotation.x = Math.PI;
                stal.position.set(sx, baseY + 1.02, 0.38);
                staticGroup.add(stal);
            });
            const boat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.50), mat(0x92400e));
            boat.position.set(0, baseY + 0.11, 0.62);

            staticGroup.add(wallL, wallR, archTop, caveBack, boat);
            crownY = 2.55;

        } else if (modelType === "imperial_citadel") {
            // 5. QUẦN THỂ DI TÍCH CỐ ĐÔ HUẾ — Thành xám rêu đậm + mái vàng rực #facc15
            const mossStoneMat = mat(0x3f4f46, { emissiveIntensity: 0.12 });
            const darkArchMat = mat(0x0f172a, { emissiveIntensity: 0.04 });
            const imperialRedMat = mat(0xb91c1c, { emissiveIntensity: 0.22 });
            const yellowRoofMat = mat(0xfacc15, { emissive: 0xeab308, emissiveIntensity: 0.46 });
            const greenRoofMat = mat(0x10b981, { emissive: 0x059669, emissiveIntensity: 0.28 });

            // U-Shaped Fortress Wall (Center + Left Wing + Right Wing)
            const mainWall = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.64, 0.68), mossStoneMat);
            mainWall.position.set(0, baseY + 0.32, -0.18);
            const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.64, 0.88), mossStoneMat);
            wingL.position.set(-0.68, baseY + 0.32, 0.24);
            const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.64, 0.88), mossStoneMat);
            wingR.position.set(0.68, baseY + 0.32, 0.24);

            // 3 Arched Gates in Main Wall
            [-0.42, 0, 0.42].forEach((gx, i) => {
                const arch = new THREE.Mesh(new THREE.BoxGeometry(i === 1 ? 0.28 : 0.20, i === 1 ? 0.44 : 0.36, 0.72), darkArchMat);
                arch.position.set(gx, baseY + (i === 1 ? 0.22 : 0.18), -0.18);
                staticGroup.add(arch);
            });

            // Central Lầu Ngũ Phụng (Imperial Red Hall + Brilliant Yellow Roof)
            const centerHall = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.46, 0.50), imperialRedMat);
            centerHall.position.set(0, baseY + 0.86, -0.18);
            const centerRoof1 = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.34, 4), yellowRoofMat);
            centerRoof1.rotation.y = Math.PI / 4;
            centerRoof1.scale.set(1.25, 1, 0.78);
            centerRoof1.position.set(0, baseY + 1.24, -0.18);
            const centerRoof2 = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.30, 4), yellowRoofMat);
            centerRoof2.rotation.y = Math.PI / 4;
            centerRoof2.scale.set(1.20, 1, 0.78);
            centerRoof2.position.set(0, baseY + 1.54, -0.18);

            // Left & Right Pavilions with Emerald Tile Roofs
            [-0.68, 0.68].forEach(wx => {
                const sideHall = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.66), imperialRedMat);
                sideHall.position.set(wx, baseY + 0.80, 0.24);
                const sideRoof = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.32, 4), greenRoofMat);
                sideRoof.rotation.y = Math.PI / 4;
                sideRoof.scale.set(0.85, 1, 1.3);
                sideRoof.position.set(wx, baseY + 1.12, 0.24);
                staticGroup.add(sideHall, sideRoof);
            });

            staticGroup.add(mainWall, wingL, wingR, centerHall, centerRoof1, centerRoof2);
            crownY = 2.25;

        } else if (modelType === "cham_tower") {
            // 6. THÁNH ĐỊA MỸ SƠN — Gạch nung đỏ cam rực #ea580c
            const brickMat = mat(0xea580c, { emissive: 0xea580c, emissiveIntensity: 0.26 });
            const darkBrickMat = mat(0xc2410c, { emissiveIntensity: 0.20 });
            const sandstoneMat = mat(0xfde047, { emissiveIntensity: 0.28 });

            const addChamTower = (tx, tz, sc) => {
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.62 * sc, 0.72 * sc, 0.62 * sc), brickMat);
                body.position.set(tx, baseY + 0.36 * sc, tz);
                const door = new THREE.Mesh(new THREE.BoxGeometry(0.24 * sc, 0.42 * sc, 0.66 * sc), darkBrickMat);
                door.position.set(tx, baseY + 0.22 * sc, tz + 0.04 * sc);
                const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.50 * sc, 0.34 * sc, 0.50 * sc), brickMat);
                t1.position.set(tx, baseY + 0.88 * sc, tz);
                const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.38 * sc, 0.30 * sc, 0.38 * sc), darkBrickMat);
                t2.position.set(tx, baseY + 1.18 * sc, tz);
                const t3 = new THREE.Mesh(new THREE.BoxGeometry(0.26 * sc, 0.24 * sc, 0.26 * sc), brickMat);
                t3.position.set(tx, baseY + 1.44 * sc, tz);
                const spire = new THREE.Mesh(new THREE.ConeGeometry(0.18 * sc, 0.38 * sc, 4), sandstoneMat);
                spire.rotation.y = Math.PI / 4;
                spire.position.set(tx, baseY + 1.72 * sc, tz);
                staticGroup.add(body, door, t1, t2, t3, spire);
            };

            addChamTower(0, -0.14, 1.12);
            addChamTower(-0.62, 0.26, 0.72);
            addChamTower(0.62, 0.26, 0.72);
            crownY = 2.52;

        } else if (modelType === "rong_house") {
            // 7. NHÀ RÔNG & CỒNG CHIÊNG TÂY NGUYÊN — Mái nâu gụ sẫm + lửa cam sáng + chiêng vàng
            const woodMat = mat(0x3b1706, { emissiveIntensity: 0.12 });
            const bambooMat = mat(0x78350f, { emissiveIntensity: 0.16 });
            const thatchMat = mat(0x5c2208, { emissive: 0x7c2d12, emissiveIntensity: 0.18 });
            const fireMat = mat(0xf97316, { emissive: 0xf97316, emissiveIntensity: 0.98 });

            // 8 Wooden Stilts lifting the Floor
            for (let ix = -1; ix <= 1; ix += 0.66) {
                [-0.24, 0.24].forEach(sz => {
                    const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 5), woodMat);
                    stilt.position.set(ix * 0.48 - 0.08, baseY + 0.21, sz - 0.12);
                    staticGroup.add(stilt);
                });
            }

            // Wooden Stilt Floor & Compact Hall Body
            const floor = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.10, 0.68), woodMat);
            floor.position.set(-0.08, baseY + 0.44, -0.12);
            const hall = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.36, 0.54), bambooMat);
            hall.position.set(-0.08, baseY + 0.66, -0.12);

            // Wooden Entrance Staircase
            const stairs = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.48), woodMat);
            stairs.rotation.x = 0.62;
            stairs.position.set(-0.08, baseY + 0.24, 0.32);

            // Iconic Giant Axe-Blade Thatch Roof (Height ~2.8x hall body!)
            const roofGeo = new THREE.ConeGeometry(0.84, 1.92, 4);
            roofGeo.scale(1.18, 1.0, 0.48);
            roofGeo.rotateY(Math.PI / 4);
            const roof = new THREE.Mesh(roofGeo, thatchMat);
            roof.position.set(-0.08, baseY + 1.62, -0.12);

            // Gong Frame + Bronze Gong + Glowing Festival Campfire
            const gongPostL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 5), woodMat);
            gongPostL.position.set(0.56, baseY + 0.36, 0.44);
            const gongPostR = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 5), woodMat);
            gongPostR.position.set(0.94, baseY + 0.36, 0.44);
            const gongBar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.05), woodMat);
            gongBar.position.set(0.75, baseY + 0.72, 0.44);
            const gong = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), goldMat);
            gong.rotation.x = Math.PI / 2;
            gong.position.set(0.75, baseY + 0.46, 0.44);

            const fire = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), fireMat);
            fire.position.set(-0.62, baseY + 0.16, 0.56);

            staticGroup.add(floor, hall, stairs, roof, gongPostL, gongPostR, gongBar, gong, fire);
            crownY = 2.95;

        } else if (modelType === "dragon_wharf") {
            // 8. BẾN NHÀ RỒNG — Tường vàng kem sáng + mái đỏ tươi + rồng vàng
            const creamMat = mat(0xfef08a, { emissiveIntensity: 0.22 });
            const trimWhiteMat = mat(0xffffff, { emissiveIntensity: 0.24 });
            const redRoofMat = mat(0xef4444, { emissive: 0xdc2626, emissiveIntensity: 0.26 });
            const darkWinMat = mat(0x3b1706, { emissiveIntensity: 0.06 });

            // 2-Story Colonial Cream Villa
            const floor1 = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.48, 0.86), creamMat);
            floor1.position.set(0, baseY + 0.24, 0);
            const cornice = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.08, 0.94), trimWhiteMat);
            cornice.position.set(0, baseY + 0.50, 0);
            const floor2 = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.48, 0.80), creamMat);
            floor2.position.set(0, baseY + 0.78, 0);

            // Veranda Arch Columns & Windows across Front Facade
            [-0.48, -0.16, 0.16, 0.48].forEach(cx => {
                const col1 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.46, 0.10), trimWhiteMat);
                col1.position.set(cx, baseY + 0.24, 0.44);
                const col2 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.46, 0.10), trimWhiteMat);
                col2.position.set(cx, baseY + 0.78, 0.41);
                staticGroup.add(col1, col2);
            });
            [-0.32, 0, 0.32].forEach(wx => {
                const win1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.06), darkWinMat);
                win1.position.set(wx, baseY + 0.24, 0.42);
                const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.06), darkWinMat);
                win2.position.set(wx, baseY + 0.78, 0.39);
                staticGroup.add(win1, win2);
            });

            // Red Tile Pitched Roof + Twin Golden Dragons Flanking the Moon on Ridge!
            const roof = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.56, 4), redRoofMat);
            roof.rotation.y = Math.PI / 4;
            roof.scale.set(1.24, 1.0, 0.78);
            roof.position.set(0, baseY + 1.30, 0);

            const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.10), goldMat);
            ridge.position.set(0, baseY + 1.56, 0);
            const moon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), mat(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 0.85 }));
            moon.position.set(0, baseY + 1.72, 0);
            const dragonL = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.055, 6, 10, Math.PI), goldMat);
            dragonL.position.set(-0.32, baseY + 1.62, 0);
            const dragonR = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.055, 6, 10, Math.PI), goldMat);
            dragonR.position.set(0.32, baseY + 1.62, 0);

            staticGroup.add(floor1, cornice, floor2, roof, ridge, moon, dragonL, dragonR);
            crownY = 2.38;

        } else {
            // 9. CHỢ NỔI CÁI RĂNG — Nước xanh đậm + 4 ghe trái cây đỏ/vàng/xanh/cam rực
            const riverMat = mat(0x1d4ed8, { emissive: 0x1e40af, emissiveIntensity: 0.42 });
            const boatWoodMat = mat(0x5c2d0c, { emissiveIntensity: 0.14 });
            const canopyMat = mat(0xf59e0b, { emissiveIntensity: 0.22 });
            const bambooPoleMat = mat(0xfde047, { emissiveIntensity: 0.24 });

            const waterPad = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.30, 0.08, 6), riverMat);
            waterPad.position.y = baseY + 0.04;
            staticGroup.add(waterPad);

            const sampanConfigs = [
                { x: -0.46, z: -0.30, rot: 0.35, fruitCol: 0x22c55e, poleH: 1.15 }, // Dưa hấu xanh
                { x: 0.46,  z: -0.22, rot: -0.45, fruitCol: 0xf97316, poleH: 1.25 }, // Cam xoàn vàng cam
                { x: -0.20, z: 0.44,  rot: -0.20, fruitCol: 0xef4444, poleH: 1.05 }, // Thanh long đỏ
                { x: 0.52,  z: 0.42,  rot: 0.55,  fruitCol: 0xfacc15, poleH: 1.18 }  // Khóm / Dứa vàng
            ];

            sampanConfigs.forEach(sc => {
                const bGroup = new THREE.Group();
                const hull = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.16, 0.28), boatWoodMat);
                hull.position.y = 0.08;
                const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.30, 6, 1, false, 0, Math.PI), canopyMat);
                canopy.rotation.z = Math.PI / 2;
                canopy.position.set(-0.14, 0.18, 0);

                // Tall Cây Bẹo Bamboo Pole on Bow + Hanging Fruit Cluster
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, sc.poleH, 5), bambooPoleMat);
                pole.position.set(0.24, sc.poleH / 2 + 0.10, 0);
                const fruit1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), mat(sc.fruitCol, { emissive: sc.fruitCol, emissiveIntensity: 0.28 }));
                fruit1.position.set(0.24, sc.poleH + 0.06, 0);
                const fruit2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.10, 0), mat(0xfef08a));
                fruit2.position.set(0.32, sc.poleH - 0.14, 0.06);

                bGroup.add(hull, canopy, pole, fruit1, fruit2);
                bGroup.position.set(sc.x, baseY + 0.06, sc.z);
                bGroup.rotation.y = sc.rot;
                staticGroup.add(bGroup);
            });
            crownY = 2.08;
        }

        // Merge all static architectural parts by material (flatShading: true, castShadow: true) for maximum FPS!
        const mergedMonument = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), {
            castShadow: true,
            flatShading: true
        });
        if (mergedMonument) {
            group.add(mergedMonument);
        } else {
            staticGroup.traverse(c => { if (c.isMesh) c.castShadow = true; });
            group.add(staticGroup);
        }

        // 1 Small Rotating Emissive Emblem Crystal on Top (adjusted for elevated pedestal)
        const finalCrownY = crownY + 0.26;
        const relicCrown = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.22, 0),
            mat(tierCol, { emissive: tierCol, emissiveIntensity: 0.95 })
        );
        relicCrown.position.y = finalCrownY;
        group.add(relicCrown);

        // Prominent Scale (x1.4-1.5, prioritizing height, base stays cleanly inside hex tile)
        group.scale.set(1.36, 1.52, 1.36);
        group.userData = {
            relicCrown,
            crownBaseY: finalCrownY,
            glowRing,
            baseScale: { x: 1.36, y: 1.52, z: 1.36 }
        };
        return group;
    }

    // ------------------------------------------------------------------------
    // 6. RICH LIVING SURROUNDING OCEAN SCENERY MODELS
    // ------------------------------------------------------------------------
    static createDistantKarstOutcrop(scale = 1.0) {
        const group = new THREE.Group();
        const rockMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
        const foliageMat = new THREE.MeshLambertMaterial({ color: 0x15803d });
        const sandMat = new THREE.MeshLambertMaterial({ color: 0xfde68a });

        const beach = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.7, 0.28, 9), sandMat);
        beach.position.y = 0.06;
        group.add(beach);

        const peaks = [
            [0, 1.85, 0, 1.38, 3.9],
            [-1.15, 1.15, 0.52, 0.98, 2.5],
            [1.05, 1.35, -0.45, 0.88, 2.8]
        ];
        peaks.forEach(([x, y, z, r, h]) => {
            const spire = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rockMat);
            spire.position.set(x, y, z);
            const moss = new THREE.Mesh(new THREE.ConeGeometry(r * 0.84, h * 0.48, 7), foliageMat);
            moss.position.set(x, y + h * 0.26, z);
            group.add(spire, moss);
        });

        group.scale.setScalar(scale);
        return group;
    }

    static createSeaLighthouseIsland() {
        const group = new THREE.Group();
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
        const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
        const lampMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.98 });

        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 1), rockMat);
        rock.scale.set(1.35, 0.58, 1.25);
        rock.position.y = 0.22;
        group.add(rock);

        const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 2.3, 12), whiteMat);
        towerBase.position.y = 1.42;
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.42, 0.68, 12), redMat);
        stripe.position.y = 1.52;
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.40, 12), lampMat);
        lamp.position.y = 2.70;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.40, 0.45, 12), redMat);
        roof.position.y = 3.08;

        const beamGeo = new THREE.ConeGeometry(1.5, 5.2, 14, 1, true);
        beamGeo.rotateZ(Math.PI / 2);
        beamGeo.translate(2.6, 0, 0);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0xfef08a,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = 2.70;

        group.add(towerBase, stripe, lamp, roof, beam);
        group.userData = { beam };
        return group;
    }

    static createOffshoreOilRig() {
        // Giàn khoan dầu khí ngoài khơi màu vàng–đỏ có ngọn lửa emissive nhỏ trên tháp
        const group = new THREE.Group();
        const staticGroup = new THREE.Group();
        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

        const yellowMat = mat(0xeab308);
        const redMat = mat(0xdc2626);
        const steelMat = mat(0x475569);
        const flameMat = mat(0xf97316, { emissive: 0xea580c, emissiveIntensity: 0.98 });

        [[-0.78, -0.78], [0.78, -0.78], [-0.78, 0.78], [0.78, 0.78]].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 1.95, 6), redMat);
            leg.position.set(lx, 0.78, lz);
            staticGroup.add(leg);
        });

        const platform = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.32, 2.15), yellowMat);
        platform.position.y = 1.66;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.48, 0.74), redMat);
        cabin.position.set(0.45, 2.04, 0.42);
        const derrick = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.85, 4), yellowMat);
        derrick.position.set(-0.26, 2.72, -0.10);
        const flareBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.45, 5), steelMat);
        flareBoom.rotation.z = -Math.PI / 4;
        flareBoom.position.set(1.06, 2.24, -0.25);
        staticGroup.add(platform, cabin, derrick, flareBoom);

        const mergedRig = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), { castShadow: false, flatShading: true });
        group.add(mergedRig || staticGroup);

        const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), flameMat);
        flame.position.set(1.56, 2.76, -0.25);
        group.add(flame);
        group.userData = { flame };
        return group;
    }

    static createAmbientFishingSampan() {
        const group = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3e1b, roughness: 0.68 });
        const canopyMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 });
        const sailMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.55, side: THREE.DoubleSide });

        const hullGeo = new THREE.CylinderGeometry(0.26, 0.16, 1.18, 8);
        hullGeo.rotateZ(Math.PI / 2);
        hullGeo.scale(1.15, 0.55, 0.72);
        const hull = new THREE.Mesh(hullGeo, woodMat);
        hull.position.y = 0.09;

        const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.42, 8, 1, false, 0, Math.PI), canopyMat);
        canopy.rotation.z = Math.PI / 2;
        canopy.position.set(-0.18, 0.16, 0);

        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.95, 6), woodMat);
        mast.position.set(0.16, 0.52, 0);
        const sail = new THREE.Mesh(new THREE.ConeGeometry(0.40, 0.76, 4), sailMat);
        sail.position.set(0.08, 0.60, 0);

        group.add(hull, canopy, mast, sail);
        return group;
    }

    static createJumpingDolphinPod() {
        const group = new THREE.Group();
        const dolphinMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.25,
            roughness: 0.22,
            metalness: 0.45
        });

        const buildDolphin = (offsetX, offsetZ) => {
            const d = new THREE.Group();
            const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.85, 8), dolphinMat);
            body.rotation.z = -Math.PI / 2;
            const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), dolphinMat);
            dorsal.position.set(-0.05, 0.18, 0);
            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.32), dolphinMat);
            tail.position.set(-0.44, 0, 0);
            d.add(body, dorsal, tail);
            d.position.set(offsetX, 0, offsetZ);
            return d;
        };

        const d1 = buildDolphin(0, 0);
        const d2 = buildDolphin(-0.85, 0.55);
        group.add(d1, d2);
        group.userData = { d1, d2 };
        return group;
    }

    static createGlowingFishSchool() {
        const group = new THREE.Group();
        const colors = [0xfacc15, 0xf97316, 0x38bdf8, 0x4ade80];
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            const r = 0.45 + (i % 3) * 0.35;
            const fish = new THREE.Mesh(
                new THREE.ConeGeometry(0.08, 0.32, 5),
                new THREE.MeshBasicMaterial({ color: colors[i % colors.length] })
            );
            fish.rotation.z = -Math.PI / 2;
            fish.rotation.y = -a;
            fish.position.set(Math.cos(a) * r, -0.06, Math.sin(a) * r);
            group.add(fish);
        }
        return group;
    }

    static createSeagullFlock() {
        // Low-Poly V-shaped Seagulls (3-4 staggered birds, 2 hinged wings for smooth flapping, nose facing +X)
        const group = new THREE.Group();
        const birdMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc, flatShading: true, side: THREE.DoubleSide });
        const tipMat = new THREE.MeshLambertMaterial({ color: 0x64748b, flatShading: true });
        const offsets = [
            [0.0, 0.0, 0.0, 0.0],
            [-0.95, 0.22, -0.68, 1.1],
            [-0.85, -0.14, 0.72, 2.2],
            [-1.75, 0.34, -0.12, 3.4]
        ];
        const wings = [];
        offsets.forEach(([bx, by, bz, phase]) => {
            const bird = new THREE.Group();
            const body = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), birdMat);
            body.rotation.z = -Math.PI / 2;
            bird.add(body);

            // Hinged Left Wing (swept back in V silhouette)
            const wingLPivot = new THREE.Group();
            const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.38), birdMat);
            wingL.position.set(-0.04, 0, -0.19);
            wingL.rotation.y = 0.24;
            const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.14), tipMat);
            tipL.position.set(-0.08, 0, -0.42);
            wingLPivot.add(wingL, tipL);

            // Hinged Right Wing
            const wingRPivot = new THREE.Group();
            const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.38), birdMat);
            wingR.position.set(-0.04, 0, 0.19);
            wingR.rotation.y = -0.24;
            const tipR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.14), tipMat);
            tipR.position.set(-0.08, 0, 0.42);
            wingRPivot.add(wingR, tipR);

            bird.add(wingLPivot, wingRPivot);
            bird.position.set(bx, by, bz);
            group.add(bird);
            wings.push({ wingL: wingLPivot, wingR: wingRPivot, flapPhase: phase });
        });
        group.userData = { wings };
        return group;
    }

    // ------------------------------------------------------------------------
    // 7. SOVEREIGNTY ARCHIPELAGO DIORAMA (QUẦN ĐẢO HOÀNG SA & TRƯỜNG SA)
    //    Đảo cát trắng/san hô, viền nước nông xanh ngọc, cây phong ba nhỏ & cột mốc chủ quyền trắng
    // ------------------------------------------------------------------------
    static createSovereigntyArchipelago(titleText, subText) {
        const group = new THREE.Group();
        const staticGroup = new THREE.Group();
        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

        const shoalTurqMat = mat(0x2dd4bf, { emissive: 0x0d9488, emissiveIntensity: 0.28, transparent: true, opacity: 0.65 });
        const whiteSandMat = mat(0xfef9c3);
        const phongBaLeafMat = mat(0x15803d);
        const phongBaTrunkMat = mat(0x6b3e1b);
        const stoneWhiteMat = mat(0xf8fafc);
        const redMat = mat(0xdc2626, { emissive: 0x991b1b, emissiveIntensity: 0.22 });
        const goldMat = mat(0xfacc15, { emissive: 0xca8a04, emissiveIntensity: 0.35 });

        const addPhongBaTree = (tx, ty, tz, sc = 1.0) => {
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * sc, 0.05 * sc, 0.26 * sc, 5), phongBaTrunkMat);
            trunk.position.set(tx, ty + 0.13 * sc, tz);
            trunk.rotation.z = 0.14;
            const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 * sc, 0), phongBaLeafMat);
            crown.scale.set(1.25, 0.72, 1.15);
            crown.position.set(tx + 0.03 * sc, ty + 0.30 * sc, tz);
            staticGroup.add(trunk, crown);
        };

        // Đảo cát trắng / san hô + viền nước nông xanh ngọc + cây phong ba nhỏ
        const atolls = [
            [0, 0, 1.38],
            [-1.32, -0.92, 0.76],
            [1.24, 0.84, 0.82],
            [-0.90, 1.12, 0.62]
        ];
        atolls.forEach(([ax, az, r], idx) => {
            const shoalRim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.24, r * 1.34, 0.06, 10), shoalTurqMat);
            shoalRim.position.set(ax, 0.03, az);
            const sand = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 1.04, 0.20, 9), whiteSandMat);
            sand.position.set(ax, 0.14, az);
            staticGroup.add(shoalRim, sand);
            if (idx > 0) {
                addPhongBaTree(ax, 0.22, az, 0.82 + (idx % 2) * 0.18);
            }
        });

        // Cây phong ba nhỏ trên đảo chính
        addPhongBaTree(0.58, 0.22, -0.34, 1.05);
        addPhongBaTree(-0.62, 0.22, 0.36, 0.92);
        addPhongBaTree(0.46, 0.22, 0.44, 0.85);

        // Cột mốc chủ quyền màu trắng nổi bật + lá cờ đỏ sao vàng
        const obeliskBase = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.72), stoneWhiteMat);
        obeliskBase.position.set(-0.08, 0.36, 0);
        const obeliskBody = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.32, 1.56, 4), stoneWhiteMat);
        obeliskBody.rotation.y = Math.PI / 4;
        obeliskBody.position.set(-0.08, 1.22, 0);
        const obeliskCap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 4), redMat);
        obeliskCap.rotation.y = Math.PI / 4;
        obeliskCap.position.set(-0.08, 2.18, 0);

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.02, 5), goldMat);
        pole.position.set(0.36, 0.76, 0.18);
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.36, 0.04), redMat);
        flag.position.set(0.64, 1.08, 0.18);
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), goldMat);
        star.position.set(0.64, 1.08, 0.21);
        staticGroup.add(obeliskBase, obeliskBody, obeliskCap, pole, flag, star);

        const mergedArch = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), { castShadow: false, flatShading: true });
        group.add(mergedArch || staticGroup);

        const banner = this.createRegionBannerSprite(titleText, subText, "#d97706", 4.9, 1.38);
        banner.position.set(0, 3.25, 0);
        group.add(banner);
        return group;
    }

    static createTabletopCompassAndTitlePlaque() {
        const group = new THREE.Group();
        const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.78, roughness: 0.25 });
        const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3e2411, roughness: 0.65, metalness: 0.12 });
        const dialMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.45 });

        const compassGroup = new THREE.Group();
        const outerRim = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.0, 0.34, 24), darkWoodMat);
        outerRim.position.y = 0.18;
        const brassRing = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.65, 0.40, 24), brassMat);
        brassRing.position.y = 0.21;
        const dialFace = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 0.44, 24), dialMat);
        dialFace.position.y = 0.23;

        const needleNS = new THREE.Mesh(new THREE.ConeGeometry(0.38, 4.0, 4), new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.4 }));
        needleNS.rotation.x = Math.PI / 2;
        needleNS.position.y = 0.48;
        const needleEW = new THREE.Mesh(new THREE.ConeGeometry(0.32, 3.6, 4), brassMat);
        needleEW.rotation.z = Math.PI / 2;
        needleEW.position.y = 0.46;
        const centerPin = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), brassMat);
        centerPin.position.y = 0.54;

        compassGroup.add(outerRim, brassRing, dialFace, needleNS, needleEW, centerPin);
        compassGroup.position.set(-22.5, 0.85, -3.5);
        group.add(compassGroup);

        return group;
    }

    static createStartingAnchorBuoy() {
        // Subtle floating mooring buoy (no hex border line around tile)
        const group = new THREE.Group();
        const buoyMat = new THREE.MeshLambertMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.55,
            flatShading: true
        });
        const buoy = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), buoyMat);
        buoy.position.y = 0.14;
        group.add(buoy);
        return group;
    }

    // ------------------------------------------------------------------------
    // 8. 4-LAYER SHALLOW REEF SHOAL & MARITIME WARNING BUOY (LOW-POLY 3D)
    //    - Shallow turquoise water shoal (y = 0.02, opacity ~0.55)
    //    - Asymmetric slate-gray + mossy waterline rocks (merged static meshes)
    //    - 2 Animated white wave foam rings (shared rhythm variable in World3D)
    //    - Mini red/black maritime warning buoy with blinking red emissive lamp
    // ------------------------------------------------------------------------
    static createReefShoalModel(seed = 1) {
        const group = new THREE.Group();
        const staticGroup = new THREE.Group();
        const r1 = this.seededRandom(seed + 11);
        const r2 = this.seededRandom(seed + 23);
        const r3 = this.seededRandom(seed + 37);

        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
            ...opts
        });

        // 1. Shallow Water Shoal (Turquoise/Teal disc right at waterline y ≈ 0.02)
        const outerShoalMat = mat(0x2dd4bf, { emissive: 0x0d9488, emissiveIntensity: 0.25, transparent: true, opacity: 0.55 });
        const innerShoalMat = mat(0x5eead4, { emissive: 0x14b8a6, emissiveIntensity: 0.22, transparent: true, opacity: 0.45 });
        const outerShoal = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.58, 0.03, 12), outerShoalMat);
        outerShoal.position.y = 0.02;
        const innerShoal = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 1.06, 0.03, 10), innerShoalMat);
        innerShoal.position.set(-0.14, 0.035, -0.10);
        staticGroup.add(outerShoal, innerShoal);

        // 2. Asymmetric Multi-Tier Reef Rocks (Slate gray #475569/#334155 + dark mossy waterline #3f4f44)
        const slateLightMat = mat(0x475569);
        const slateDarkMat = mat(0x334155);
        const mossBaseMat = mat(0x3f4f44);

        const rockSpecs = [
            // Main low-medium tilted reef rock
            { x: -0.22, z: -0.18, r: 0.50, sx: 1.28, sy: 0.78, sz: 0.96, rx: 0.14, rz: -0.20, m: slateLightMat, geo: "dodec" },
            // 4 smaller off-center asymmetric rock outcrops
            { x: 0.26,  z: -0.34, r: 0.34, sx: 1.15, sy: 0.68, sz: 0.90, rx: -0.18, rz: 0.22, m: slateDarkMat, geo: "ico" },
            { x: -0.62, z: 0.14,  r: 0.32, sx: 1.20, sy: 0.62, sz: 0.88, rx: 0.20, rz: -0.15, m: slateDarkMat, geo: "dodec" },
            { x: 0.10,  z: 0.28,  r: 0.28, sx: 1.10, sy: 0.56, sz: 1.05, rx: -0.12, rz: 0.16, m: slateLightMat, geo: "ico" },
            { x: -0.34, z: -0.56, r: 0.25, sx: 1.05, sy: 0.54, sz: 0.92, rx: 0.16, rz: 0.18, m: slateDarkMat, geo: "ico" }
        ];

        const rockCluster = new THREE.Group();
        rockSpecs.forEach((rk, idx) => {
            const g = rk.geo === "dodec"
                ? new THREE.DodecahedronGeometry(rk.r, 0)
                : new THREE.IcosahedronGeometry(rk.r, 0);
            const rock = new THREE.Mesh(g, rk.m);
            rock.scale.set(rk.sx, rk.sy, rk.sz);
            rock.rotation.set(rk.rx, idx * 1.1 + r1 * 3.14, rk.rz);
            rock.position.set(rk.x, rk.r * rk.sy * 0.52 + 0.04, rk.z);
            rockCluster.add(rock);

            // Dark mossy waterline collar hugging the sea level
            const moss = new THREE.Mesh(new THREE.DodecahedronGeometry(rk.r * 1.06, 0), mossBaseMat);
            moss.scale.set(rk.sx * 1.04, 0.26, rk.sz * 1.04);
            moss.rotation.y = idx * 0.9;
            moss.position.set(rk.x, 0.09, rk.z);
            rockCluster.add(moss);
        });
        rockCluster.rotation.y = r2 * Math.PI * 2;
        const scVar = 0.90 + r3 * 0.18;
        rockCluster.scale.set(scVar, 0.88 + r1 * 0.18, scVar);
        staticGroup.add(rockCluster);

        // Merge static shoal + asymmetric reef rocks by material (castShadow: false, flatShading: true)
        const mergedReef = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), {
            castShadow: false,
            flatShading: true
        });
        group.add(mergedReef || staticGroup);

        // 3. Animated White Wave Foam Rings around Rock Cluster (2 thin rings, opacity ~0.65)
        const foamMat1 = new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
        const foamGeo1 = new THREE.RingGeometry(0.84, 0.98, 20);
        foamGeo1.rotateX(-Math.PI / 2);
        const foamInner = new THREE.Mesh(foamGeo1, foamMat1);
        foamInner.position.set(-0.12, 0.055, -0.08);

        const foamMat2 = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.48, side: THREE.DoubleSide });
        const foamGeo2 = new THREE.RingGeometry(1.12, 1.24, 22);
        foamGeo2.rotateX(-Math.PI / 2);
        const foamOuter = new THREE.Mesh(foamGeo2, foamMat2);
        foamOuter.position.set(-0.12, 0.05, -0.08);
        group.add(foamInner, foamOuter);

        // 4. Mini Maritime Warning Buoy at Edge of Reef (Red/Black float + slim tower + blinking red emissive lamp)
        const buoyGroup = new THREE.Group();
        const buoyBlackMat = mat(0x1e293b);
        const buoyRedMat = mat(0xdc2626);
        const lampMat = mat(0xfca5a5, { emissive: 0xef4444, emissiveIntensity: 0.95 });

        const floatBlack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.10, 8), buoyBlackMat);
        floatBlack.position.y = 0.06;
        const floatRed = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.12, 8), buoyRedMat);
        floatRed.position.y = 0.17;
        const towerFrame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 4), buoyRedMat);
        towerFrame.position.y = 0.40;
        const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 6), lampMat);
        lampBulb.position.y = 0.60;

        buoyGroup.add(floatBlack, floatRed, towerFrame, lampBulb);
        const buoyAngle = r1 * Math.PI * 2;
        buoyGroup.position.set(Math.cos(buoyAngle) * 0.92, 0.02, Math.sin(buoyAngle) * 0.92);
        group.add(buoyGroup);

        group.userData = {
            isReefShoal: true,
            foamInner,
            foamOuter,
            buoyGroup,
            lampMat,
            phase: r2 * Math.PI * 2,
            baseScale: { x: 1.0, y: 1.0, z: 1.0 }
        };
        return group;
    }
    // ------------------------------------------------------------------------
    // 8B. OUTER SEA CHART, MUTED BORDER TERRAIN & OFFSHORE ACCENTS (60 FPS)
    //     - Zero PointLight, flatShading: true, castShadow: false, merged static
    // ------------------------------------------------------------------------
    static createSeaCompassRoseOverlay() {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext("2d");
        const cx = 256, cy = 256;

        ctx.clearRect(0, 0, 512, 512);
        ctx.strokeStyle = "#f5deb3";
        ctx.fillStyle = "#f5deb3";

        // Outer & inner nautical rings
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, 196, 0, Math.PI * 2);
        ctx.stroke();

        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 178, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 72, 0, Math.PI * 2);
        ctx.stroke();

        // 32 subtle degree ticks around compass ring
        for (let i = 0; i < 32; i++) {
            const a = (i / 32) * Math.PI * 2;
            const r1 = (i % 4 === 0) ? 168 : 178;
            const r2 = 196;
            ctx.lineWidth = (i % 4 === 0) ? 3 : 1.5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
            ctx.stroke();
        }

        // 8-point nautical star (4 cardinal + 4 intercardinal)
        const drawStarPoint = (angle, len, halfW, fillHex) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, -len);
            ctx.lineTo(halfW, 0);
            ctx.lineTo(0, 0);
            ctx.closePath();
            ctx.fillStyle = fillHex;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(0, -len);
            ctx.lineTo(-halfW, 0);
            ctx.lineTo(0, 0);
            ctx.closePath();
            ctx.strokeStyle = "#f5deb3";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        };

        for (let i = 0; i < 4; i++) {
            drawStarPoint(i * Math.PI / 2, 152, 24, "#e6c37a");
            drawStarPoint(i * Math.PI / 2 + Math.PI / 4, 108, 16, "#d4a84f");
        }

        // Cardinal letters N - E - S - W
        ctx.font = "800 44px 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fef3c7";
        ctx.fillText("N", cx, 30);
        ctx.fillText("S", cx, 482);
        ctx.fillText("E", 482, cy);
        ctx.fillText("W", 30, cy);

        const tex = new THREE.CanvasTexture(canvas);
        const geo = new THREE.PlaneGeometry(18, 18);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 0.36,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = false;
        return mesh;
    }

    static createMutedBorderTerrainCluster(seed = 1) {
        const staticGroup = new THREE.Group();
        const r1 = this.seededRandom(seed + 3);
        const r2 = this.seededRandom(seed + 7);
        const mat = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
        const hillMatA = mat(0x526b7a); // Muted gray-blue
        const hillMatB = mat(0x6e7b74); // Muted sage-gray
        const baseMat = mat(0x8a8675);  // Muted pale-beige

        const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, 0.32, 7), baseMat);
        base.position.y = 0.08;
        staticGroup.add(base);

        const mounds = [
            { x: -1.1, z: -0.4, r: 2.1, h: 1.45 + r1 * 0.55, m: hillMatA },
            { x: 1.3,  z: 0.5,  r: 1.8, h: 1.15 + r2 * 0.45, m: hillMatB },
            { x: 0.1,  z: -1.3, r: 1.5, h: 0.95 + r1 * 0.35, m: hillMatA }
        ];
        mounds.forEach(md => {
            const hill = new THREE.Mesh(new THREE.ConeGeometry(md.r, md.h, 6), md.m);
            hill.position.set(md.x, 0.20 + md.h * 0.45, md.z);
            staticGroup.add(hill);
        });

        const merged = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), { castShadow: false, flatShading: true });
        return merged || staticGroup;
    }

    static createOuterCoralIsletCluster(seed = 1) {
        const staticGroup = new THREE.Group();
        const r1 = this.seededRandom(seed + 5);
        const mat = (col, opts = {}) => new THREE.MeshLambertMaterial({ color: col, flatShading: true, ...opts });
        const shoalMat = mat(0x2dd4bf, { emissive: 0x0d9488, emissiveIntensity: 0.18, transparent: true, opacity: 0.46 });
        const sandMat = mat(0xe7d8b1);
        const rockMat = mat(0x475569);
        const bushMat = mat(0x2d6a4f);

        const shoal = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 0.05, 9), shoalMat);
        shoal.position.y = 0.02;
        const sand = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.85, 0.22, 8), sandMat);
        sand.position.y = 0.12;
        const rock1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 0), rockMat);
        rock1.scale.set(1.2, 0.85 + r1 * 0.35, 1.0);
        rock1.position.set(-0.35, 0.44, -0.15);
        const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), rockMat);
        rock2.position.set(0.55, 0.30, 0.32);
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), bushMat);
        bush.position.set(0.28, 0.38, -0.34);
        staticGroup.add(shoal, sand, rock1, rock2, bush);

        const merged = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), { castShadow: false, flatShading: true });
        return merged || staticGroup;
    }

    static createMiniAmbientCargoShip() {
        // Tiny neutral gray-white decorative cargo ship (much smaller than player ships!)
        const staticGroup = new THREE.Group();
        const mat = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
        const hullMat = mat(0x64748b);
        const whiteMat = mat(0xe2e8f0);
        const cargoMat = mat(0x94a3b8);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.22, 0.42), hullMat);
        hull.position.y = 0.11;
        const bow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.44, 4), hullMat);
        bow.rotation.z = -Math.PI / 2;
        bow.rotation.x = Math.PI / 4;
        bow.position.set(0.84, 0.11, 0);
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.32, 0.36), whiteMat);
        bridge.position.set(-0.38, 0.36, 0);
        const cargo1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.30), cargoMat);
        cargo1.position.set(0.06, 0.30, 0);
        const cargo2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.28), whiteMat);
        cargo2.position.set(0.42, 0.30, 0);
        staticGroup.add(hull, bow, bridge, cargo1, cargo2);

        const merged = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), { castShadow: false, flatShading: true });
        const ship = merged || staticGroup;
        ship.scale.setScalar(0.72);
        return ship;
    }

    static createSlowWhaleSilhouette() {
        // Subtle Low-Poly ocean whale silhouette gliding slowly just beneath/at the outer sea surface
        const group = new THREE.Group();
        const whaleMat = new THREE.MeshLambertMaterial({
            color: 0x1e4e68,
            transparent: true,
            opacity: 0.72,
            flatShading: true
        });
        const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 0), whaleMat);
        body.scale.set(2.15, 0.58, 0.82);
        const tailBase = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.35, 5), whaleMat);
        tailBase.rotation.z = Math.PI / 2;
        tailBase.position.set(-1.45, -0.04, 0);
        const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 1.25), whaleMat);
        fluke.position.set(-2.08, -0.02, 0);
        const finL = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.58), whaleMat);
        finL.rotation.y = 0.45;
        finL.position.set(0.22, -0.06, 0.66);
        const finR = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.58), whaleMat);
        finR.rotation.y = -0.45;
        finR.position.set(0.22, -0.06, -0.66);
        group.add(body, tailBase, fluke, finL, finR);
        group.scale.setScalar(0.95);
        return group;
    }
}

window.ProceduralModels = ProceduralModels;
