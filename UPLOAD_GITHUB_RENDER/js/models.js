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
    // Configure sharp Anisotropic + Trilinear Mipmap filtering on CanvasTextures (anti-blur on zoom out)
    static configureSharpCanvasTexture(texture, isHorizontalSurface = false) {
        if (!texture) return texture;
        const maxAniso = Math.max(1, ProceduralModels.MAX_ANISOTROPY || 4);
        texture.anisotropy = isHorizontalSurface ? Math.min(maxAniso, 8) : Math.min(maxAniso, 4);
        if (typeof THREE !== "undefined") {
            if (THREE.LinearMipmapLinearFilter !== undefined) texture.minFilter = THREE.LinearMipmapLinearFilter;
            if (THREE.LinearFilter !== undefined) texture.magFilter = THREE.LinearFilter;
        }
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        return texture;
    }

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

        const texture = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), false);
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

        // Player Name ONLY — Bold, Huge, Crystal Clear (with dark strokeText for far-zoom sharpness)
        ctx.font = "900 42px 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0, 0, 0, 0.92)";
        ctx.shadowBlur = 6;
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(2, 6, 23, 0.96)";
        ctx.strokeText(cleanName, 298, pillY + pillH / 2 + 2);
        ctx.fillStyle = isLocalPlayer ? "#fef08a" : "#ffffff";
        ctx.fillText(cleanName, 298, pillY + pillH / 2 + 2);

        const texture = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), false);
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

        const tex = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), false);
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
            ctx.lineWidth = 8.5;
            ctx.strokeStyle = "rgba(2, 6, 23, 0.97)";
            ctx.strokeText(t1, 512, 92);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(t1, 512, 92);

            ctx.font = "800 44px 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif";
            ctx.lineWidth = 7.2;
            ctx.strokeText(t2, 512, 162);
            ctx.fillStyle = "#fde047";
            ctx.fillText(t2, 512, 162);
        } else {
            ctx.font = "800 56px 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif";
            ctx.lineWidth = 8.5;
            ctx.strokeStyle = "rgba(2, 6, 23, 0.97)";
            ctx.strokeText(t1, 512, 128);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(t1, 512, 128);
        }

        const texture = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), false);
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

        const texture = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), false);
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
    // C3. 2-TIER MONUMENT LABEL & ZOOM-OUT TIER ICON (CẤP 1 / 2 / 3 / LOCKED / CONQUERED)
    // ------------------------------------------------------------------------
    static createMonumentTierLabelSprite(name, tier, state = { mode: "active" }) {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 216;
        const ctx = canvas.getContext("2d");

        const mode = (state && state.mode) || "active";
        const tierStyleMap = {
            1: { badgeText: "★ CẤP 1", badgeBg: "#059669", border: "#34d399" },
            2: { badgeText: "★★ CẤP 2", badgeBg: "#d97706", border: "#fde047" },
            3: { badgeText: "★★★ CẤP 3", badgeBg: "#dc2626", border: "#fb923c" }
        };
        const baseStyle = tierStyleMap[tier] || tierStyleMap[1];

        let badgeText = baseStyle.badgeText;
        let badgeBg = baseStyle.badgeBg;
        let borderColor = baseStyle.border;
        let conquerorDotColor = null;

        if (mode === "early_locked") {
            badgeText = `🔒 CẤP ${tier} • MỞ 08:30`;
            badgeBg = "#475569";
            borderColor = "#94a3b8";
        } else if (mode === "conquered") {
            const cName = (state && state.conquerorName) ? String(state.conquerorName) : "Đã Chinh Phục";
            badgeText = `✅ ${cName.length > 18 ? cName.slice(0, 17) + "…" : cName}`;
            badgeBg = "#0f172a";
            borderColor = (state && state.conquerorColor) || "#34d399";
            conquerorDotColor = borderColor;
        }

        // Main dark navy plaque with strong high-contrast border
        const x = 18, y = 40, w = 604, h = 154;
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 5;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 22);
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, "rgba(11, 22, 42, 0.96)");
        grad.addColorStop(1, "rgba(7, 15, 30, 0.98)");
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 22);
        ctx.lineWidth = 7;
        ctx.strokeStyle = borderColor;
        ctx.stroke();

        // Top Tier Badge Ribbon (overlapping top edge for crisp 2-tier readability)
        const pillW = mode === "active" ? 310 : 440;
        const pillH = 56;
        const pillX = (640 - pillW) / 2;
        const pillY = 10;

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 16);
        ctx.fillStyle = badgeBg;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 16);
        ctx.lineWidth = 5;
        ctx.strokeStyle = borderColor;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 28px 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = 4;

        if (conquerorDotColor) {
            const textW = Math.min(pillW - 64, ctx.measureText(badgeText).width);
            const dotX = 320 - textW / 2 - 16;
            const dotY = pillY + pillH / 2;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
            ctx.fillStyle = conquerorDotColor;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
            ctx.fillStyle = "#ffffff";
            ctx.fillText(badgeText, 320 + 12, dotY + 1, pillW - 56);
        } else {
            ctx.fillText(badgeText, 320, pillY + pillH / 2 + 1, pillW - 24);
        }

        // Bottom line: Short Monument Name (crisp strokeText + fillText for far zoom)
        const shortName = String(name || "Di Tích").replace(/^Di tích\s+/i, "");
        ctx.font = "900 38px 'Segoe UI', Roboto, sans-serif";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0, 0, 0, 0.92)";
        ctx.shadowBlur = 6;
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(2, 6, 23, 0.96)";
        ctx.strokeText(shortName, 320, y + 98, w - 40);
        ctx.fillStyle = mode === "early_locked" ? "#cbd5e1" : "#ffffff";
        ctx.fillText(shortName, 320, y + 98, w - 40);

        const texture = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), false);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(2.95, 1.00, 1);
        sprite.renderOrder = 995;
        return sprite;
    }

    static createMonumentCompactIconSprite(tier, state = { mode: "active" }) {
        const canvas = document.createElement("canvas");
        canvas.width = 184;
        canvas.height = 184;
        const ctx = canvas.getContext("2d");

        const mode = (state && state.mode) || "active";
        const borderMap = { 1: "#34d399", 2: "#fde047", 3: "#fb923c" };
        const bgAccentMap = { 1: "rgba(5, 150, 105, 0.94)", 2: "rgba(217, 119, 6, 0.94)", 3: "rgba(220, 38, 38, 0.94)" };

        let borderHex = borderMap[tier] || "#fde047";
        let bgHex = "rgba(11, 22, 42, 0.94)";
        let labelText = `🏛️${tier}`;
        let badgePillBg = bgAccentMap[tier] || bgAccentMap[1];

        if (mode === "early_locked") {
            borderHex = "#94a3b8";
            badgePillBg = "rgba(71, 85, 105, 0.95)";
            labelText = `🔒${tier}`;
        } else if (mode === "conquered") {
            borderHex = (state && state.conquerorColor) || "#34d399";
            badgePillBg = borderHex;
            labelText = `✅${tier}`;
        }

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(92, 92, 68, 0, Math.PI * 2);
        ctx.fillStyle = bgHex;
        ctx.fill();
        ctx.restore();

        // Colored top-half arc highlight for instant tier recognition when zoomed out
        ctx.save();
        ctx.beginPath();
        ctx.arc(92, 92, 64, Math.PI * 1.12, Math.PI * 1.88);
        ctx.lineWidth = 10;
        ctx.strokeStyle = badgePillBg;
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(92, 92, 68, 0, Math.PI * 2);
        ctx.lineWidth = 9;
        ctx.strokeStyle = borderHex;
        ctx.stroke();

        ctx.font = "900 60px 'Segoe UI Emoji', 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 6;
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(2, 6, 23, 0.95)";
        ctx.strokeText(labelText, 92, 95);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(labelText, 92, 95);

        const texture = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), false);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.42, 1.42, 1);
        sprite.renderOrder = 990;
        return sprite;
    }

    // ------------------------------------------------------------------------
    // C4. 2-TIER TRADE PORT OWNERSHIP LABEL & ZOOM-OUT ICON (MINE / FREE / OTHER)
    // ------------------------------------------------------------------------
    static createPortOwnershipLabelSprite(portName, specialtyLabel, state = { mode: "free" }) {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 216;
        const ctx = canvas.getContext("2d");

        const mode = (state && state.mode) || "free";
        const needsCoinWarning = Boolean(state && state.needsCoinWarning);
        const ownerName = (state && state.ownerName) ? String(state.ownerName) : "";
        const ownerColor = (state && state.ownerColor) || "#38bdf8";

        let badgeText = "🌐 CẢNG TỰ DO • 0💰";
        let badgeBg = "#0284c7";
        let borderColor = "#38bdf8";
        let cardBorderColor = "#38bdf8";
        let ownerDotColor = null;

        if (mode === "mine") {
            badgeText = "👑 CẢNG CỦA BẠN • 0💰";
            badgeBg = "#15803d";
            borderColor = "#fde047";
            cardBorderColor = "#22c55e";
        } else if (mode === "other") {
            const shortOwner = ownerName.length > 13 ? ownerName.slice(0, 12) + "…" : ownerName;
            if (needsCoinWarning) {
                badgeText = `⚓ ${shortOwner} • ⛔ CẦN 1💰`;
                badgeBg = "#991b1b";
                borderColor = "#fb923c";
                cardBorderColor = "#ef4444";
            } else {
                badgeText = `⚓ ${shortOwner} • THUẾ 1💰`;
                badgeBg = "#0f172a";
                borderColor = ownerColor;
                cardBorderColor = ownerColor;
            }
            ownerDotColor = ownerColor;
        }

        const x = 18, y = 40, w = 604, h = 154;
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 5;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 22);
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, "rgba(10, 22, 42, 0.96)");
        grad.addColorStop(1, "rgba(7, 15, 30, 0.98)");
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 22);
        ctx.lineWidth = 7;
        ctx.strokeStyle = cardBorderColor;
        ctx.stroke();

        // Top Ownership Badge Ribbon
        const pillW = mode === "other" ? 490 : 410;
        const pillH = 54;
        const pillX = (640 - pillW) / 2;
        const pillY = 10;

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 16);
        ctx.fillStyle = badgeBg;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 16);
        ctx.lineWidth = 5;
        ctx.strokeStyle = borderColor;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 26px 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = 4;

        if (ownerDotColor) {
            const textW = Math.min(pillW - 64, ctx.measureText(badgeText).width);
            const dotX = 320 - textW / 2 - 14;
            const dotY = pillY + pillH / 2;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 9, 0, Math.PI * 2);
            ctx.fillStyle = ownerDotColor;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
            ctx.fillStyle = "#ffffff";
            ctx.fillText(badgeText, 320 + 10, dotY + 1, pillW - 54);
        } else {
            ctx.fillText(badgeText, 320, pillY + pillH / 2 + 1, pillW - 24);
        }

        // Port Name & Specialty line (crisp strokeText + fillText)
        const shortPort = String(portName || "Thương Cảng").replace(/^Thương Cảng\s+/i, "Cảng ");
        ctx.font = "900 34px 'Segoe UI', Roboto, sans-serif";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 6;
        ctx.lineWidth = 5.5;
        ctx.strokeStyle = "rgba(2, 6, 23, 0.96)";
        ctx.strokeText(shortPort, 320, y + 84, w - 40);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(shortPort, 320, y + 84, w - 40);

        if (specialtyLabel) {
            ctx.font = "700 22px 'Segoe UI', Roboto, sans-serif";
            ctx.lineWidth = 4;
            ctx.strokeText(specialtyLabel, 320, y + 126, w - 40);
            ctx.fillStyle = "#fde68a";
            ctx.fillText(specialtyLabel, 320, y + 126, w - 40);
        }

        const texture = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), false);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(2.90, 0.98, 1);
        sprite.renderOrder = 994;
        return sprite;
    }

    static createPortCompactIconSprite(state = { mode: "free" }) {
        const canvas = document.createElement("canvas");
        canvas.width = 184;
        canvas.height = 184;
        const ctx = canvas.getContext("2d");

        const mode = (state && state.mode) || "free";
        const needsCoinWarning = Boolean(state && state.needsCoinWarning);
        const ownerColor = (state && state.ownerColor) || "#38bdf8";

        let borderHex = "#38bdf8";
        let outerRingHex = null;
        let labelText = "🌐⚓";

        if (mode === "mine") {
            borderHex = "#22c55e";
            outerRingHex = "#fde047";
            labelText = "👑⚓";
        } else if (mode === "other") {
            borderHex = needsCoinWarning ? "#ef4444" : ownerColor;
            outerRingHex = needsCoinWarning ? "#fb923c" : null;
            labelText = needsCoinWarning ? "⛔⚓" : "⚓";
        }

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(92, 92, 68, 0, Math.PI * 2);
        ctx.fillStyle = mode === "mine" ? "rgba(10, 42, 28, 0.95)" : "rgba(11, 22, 42, 0.94)";
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(92, 92, 68, 0, Math.PI * 2);
        ctx.lineWidth = 10;
        ctx.strokeStyle = borderHex;
        ctx.stroke();

        if (outerRingHex) {
            ctx.beginPath();
            ctx.arc(92, 92, 76, 0, Math.PI * 2);
            ctx.lineWidth = 5;
            ctx.strokeStyle = outerRingHex;
            ctx.stroke();
        }

        ctx.font = labelText.length > 2 ? "900 50px 'Segoe UI Emoji', 'Segoe UI', sans-serif" : "900 62px 'Segoe UI Emoji', 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 6;
        ctx.lineWidth = 5.5;
        ctx.strokeStyle = "rgba(2, 6, 23, 0.95)";
        ctx.strokeText(labelText, 92, 95);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(labelText, 92, 95);

        const texture = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), false);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.40, 1.40, 1);
        sprite.renderOrder = 990;
        return sprite;
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
        const archIdx = ((archetypeId % 5) + 5) % 5;
        const arch = window.GAME_DATA.shipArchetypes[archIdx];
        const style = arch.style || ["dragon_junk", "emerald_catamaran", "ocean_clipper", "golden_galley", "imperial_bark"][archIdx];
        const group = new THREE.Group();

        const teamColor = new THREE.Color(arch.color);
        const mutedTeamColor = teamColor.clone().lerp(new THREE.Color(0x5a4632), 0.24);
        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.04,
            flatShading: true,
            ...opts
        });

        // Natural matte maritime materials (low emissive 0.02-0.08 -> zero plastic gloss)
        const warmWoodMat = mat(0x7a4b2a, { emissiveIntensity: 0.02 });
        const darkWoodMat = mat(0x462612, { emissiveIntensity: 0.02 });
        const bambooMat = mat(0x522e15, { emissiveIntensity: 0.02 });
        const lightDeckMat = mat(0xcfa572, { emissiveIntensity: 0.02 });
        const ropeMat = mat(0x3a2819, { emissiveIntensity: 0.01 });
        const sackMat = mat(0xb89a6a, { emissiveIntensity: 0.02 });
        const crateLightMat = mat(0xb5834b, { emissiveIntensity: 0.02 });
        const crateBlueMat = mat(0x2d5e7a, { emissiveIntensity: 0.03 });
        const glassDarkMat = mat(0x13202e, { emissiveIntensity: 0.02 });
        const creamSailMat = mat(0xefe2c4, { emissive: 0xefe2c4, emissiveIntensity: 0.05, side: THREE.DoubleSide });
        const pureWhiteSailMat = mat(0xf2ead6, { emissive: 0xf2ead6, emissiveIntensity: 0.06, side: THREE.DoubleSide });
        const mintSailMat = mat(0xd8eadf, { emissive: 0xd8eadf, emissiveIntensity: 0.05, side: THREE.DoubleSide });
        const teamMat = mat(mutedTeamColor, { emissive: mutedTeamColor, emissiveIntensity: 0.07 });
        const teamStripeMat = mat(mutedTeamColor, { emissive: mutedTeamColor, emissiveIntensity: 0.08, side: THREE.DoubleSide });
        // Keep team pennant crisp & recognizable for map identification
        const vividFlagMat = mat(teamColor, { emissive: teamColor, emissiveIntensity: 0.22 });
        const crimsonMat = mat(0x9c2222, { emissive: 0x7f1d1d, emissiveIntensity: 0.06 });
        const royalPurpleMat = mat(0x652b8c, { emissive: 0x4c1d70, emissiveIntensity: 0.06 });
        const deepEmeraldMat = mat(0x176348, { emissive: 0x0f4c36, emissiveIntensity: 0.06 });
        const oceanBlueMat = mat(0x1b5e8a, { emissive: 0x134566, emissiveIntensity: 0.06 });
        const goldHullMat = mat(0xc59624, { emissive: 0x9a7318, emissiveIntensity: 0.07 });
        const goldMat = mat(0xd9a734, { emissive: 0xb58620, emissiveIntensity: 0.09 });

        let mainSail = new THREE.Group();
        let foreSail = new THREE.Group();
        let flag = null;

        // Shared lightweight rigging / deck prop helpers (castShadow = false for 60 FPS)
        const addShroudLine = (x1, y1, z1, x2, y2, z2) => {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dz = z2 - z1;
            const len = Math.hypot(dx, dy, dz);
            if (len < 0.05) return;
            const geo = new THREE.CylinderGeometry(0.011, 0.011, len, 4);
            const line = new THREE.Mesh(geo, ropeMat);
            line.position.set((x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5);
            if (typeof THREE.Vector3 === "function" && line.quaternion && typeof line.quaternion.setFromUnitVectors === "function") {
                line.quaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    new THREE.Vector3(dx / len, dy / len, dz / len)
                );
            }
            line.castShadow = false;
            group.add(line);
        };

        const addHelmAndRudder = (xHelm, yHelm, xStern) => {
            // Miniature helm post + wooden steering wheel
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), darkWoodMat);
            post.position.set(xHelm, yHelm + 0.08, 0);
            const wheelGeo = new THREE.RingGeometry(0.065, 0.095, 8);
            wheelGeo.rotateY(Math.PI / 2);
            const wheel = new THREE.Mesh(wheelGeo, warmWoodMat);
            wheel.position.set(xHelm + 0.04, yHelm + 0.14, 0);
            const hub = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.04), goldMat);
            hub.position.set(xHelm + 0.04, yHelm + 0.14, 0);
            // Stern rudder blade dipping to waterline
            const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.04), darkWoodMat);
            rudder.position.set(xStern, 0.16, 0);
            group.add(post, wheel, hub, rudder);
        };

        const addLowDeckRailings = (xStart, xEnd, yBase, halfZ) => {
            const span = Math.max(0.2, xEnd - xStart);
            const midX = (xStart + xEnd) * 0.5;
            [-halfZ, halfZ].forEach((zPos) => {
                const topRail = new THREE.Mesh(new THREE.BoxGeometry(span, 0.032, 0.032), darkWoodMat);
                topRail.position.set(midX, yBase + 0.11, zPos);
                group.add(topRail);
                [xStart + 0.06, midX, xEnd - 0.06].forEach((px) => {
                    const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.03), darkWoodMat);
                    stanchion.position.set(px, yBase + 0.055, zPos);
                    group.add(stanchion);
                });
            });
        };

        const addRopeCoilAndSacks = (x, y, z) => {
            const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.045, 7), sackMat);
            coil.position.set(x, y + 0.025, z);
            const sack1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 0), sackMat);
            sack1.scale.set(1.25, 0.72, 0.95);
            sack1.position.set(x - 0.12, y + 0.06, z * -0.8);
            const sack2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), crateLightMat);
            sack2.scale.set(1.15, 0.68, 0.92);
            sack2.position.set(x - 0.02, y + 0.055, z * -0.95);
            group.add(coil, sack1, sack2);
        };

        const addFlagAt = (x, y, z, flagMat = vividFlagMat, dir = -1) => {
            const flagGeo = new THREE.ConeGeometry(0.15, 0.52, 3);
            flagGeo.rotateZ(dir < 0 ? Math.PI / 2 : -Math.PI / 2);
            const fMesh = new THREE.Mesh(flagGeo, flagMat);
            fMesh.position.set(x + dir * 0.24, y, z);
            const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), goldMat);
            finial.position.set(x, y + 0.08, z);
            group.add(fMesh, finial);
            return fMesh;
        };

        // Helper: Bat-wing Junk Sail with 4-5 horizontal bamboo battens
        const buildJunkBatSail = (wTop, wBot, h, battenCount, xPos, yPos) => {
            const sg = new THREE.Group();
            const segs = battenCount;
            const segH = h / segs;
            for (let i = 0; i < segs; i++) {
                const t = i / Math.max(1, segs - 1);
                const panelW = wBot + (wTop - wBot) * t;
                const yOff = -h * 0.5 + segH * (i + 0.5);
                const sweepX = (t - 0.35) * 0.14;
                const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, segH * 0.94, 0.045), creamSailMat);
                panel.position.set(sweepX, yOff, 0);
                panel.rotation.z = -0.06;
                panel.castShadow = true;
                sg.add(panel);

                // Dark-brown horizontal bamboo batten across each rib
                const batten = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, panelW + 0.06, 5), bambooMat);
                batten.rotation.z = Math.PI / 2 - 0.06;
                batten.position.set(sweepX, yOff + segH * 0.45, 0);
                sg.add(batten);
            }
            // Bottom boom spar
            const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, wBot + 0.08, 5), darkWoodMat);
            boom.rotation.z = Math.PI / 2;
            boom.position.set(-0.04, -h * 0.5, 0);
            sg.add(boom);

            sg.position.set(xPos, yPos, 0);
            return sg;
        };

        // Helper: Billowing Square Sail (with optional muted team stripe & yards)
        const buildSquareSail = (widthZ, height, bulgeX, xPos, yPos, baseMat, stripeMat) => {
            const sg = new THREE.Group();
            const r = Math.max(0.28, widthZ * 0.62);
            const sGeo = new THREE.CylinderGeometry(r, r * 1.04, height, 8, 1, true, -Math.PI * 0.34, Math.PI * 0.68);
            const sMesh = new THREE.Mesh(sGeo, baseMat);
            sMesh.rotation.y = Math.PI / 2;
            sMesh.scale.set(1.0, 1.0, bulgeX);
            sMesh.position.x = -r * 0.46;
            sMesh.castShadow = true;
            sg.add(sMesh);

            if (stripeMat) {
                const stGeo = new THREE.CylinderGeometry(r * 1.02, r * 1.04, height * 0.20, 8, 1, true, -Math.PI * 0.34, Math.PI * 0.68);
                const stMesh = new THREE.Mesh(stGeo, stripeMat);
                stMesh.rotation.y = Math.PI / 2;
                stMesh.scale.set(1.0, 1.0, bulgeX);
                stMesh.position.set(-r * 0.46, 0, 0);
                sg.add(stMesh);
            }

            [height * 0.49, -height * 0.49].forEach(yy => {
                const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, widthZ * 1.08, 5), darkWoodMat);
                spar.rotation.x = Math.PI / 2;
                spar.position.set(r * 0.28, yy, 0);
                sg.add(spar);
            });

            sg.position.set(xPos, yPos, 0);
            return sg;
        };

        // Helper: Sleek Triangular Sail (for Catamaran / Clipper Jib)
        const buildTriangularSail = (baseLen, height, xPos, yPos, sailMat, trimMat, flipX = false) => {
            const sg = new THREE.Group();
            const coneGeo = new THREE.ConeGeometry(baseLen * 0.55, height, 3);
            coneGeo.scale(1.0, 1.0, 0.10);
            const sMesh = new THREE.Mesh(coneGeo, sailMat);
            sMesh.position.set(flipX ? -baseLen * 0.22 : baseLen * 0.22, 0, 0);
            sMesh.rotation.z = flipX ? -0.18 : 0.18;
            sMesh.castShadow = true;
            sg.add(sMesh);

            if (trimMat) {
                const trim = new THREE.Mesh(new THREE.BoxGeometry(baseLen * 0.88, 0.06, 0.07), trimMat);
                trim.position.set(flipX ? -baseLen * 0.22 : baseLen * 0.22, -height * 0.44, 0);
                sg.add(trim);
            }
            sg.position.set(xPos, yPos, 0);
            return sg;
        };

        // ====================================================================
        // STYLE 0: dragon_junk — Crimson Curved Junk + Golden Dragon Head + Bat-Wing Sails
        // ====================================================================
        if (style === "dragon_junk") {
            const hullBodyGeo = new THREE.CylinderGeometry(0.45, 0.30, 1.32, 8);
            hullBodyGeo.rotateZ(Math.PI / 2);
            hullBodyGeo.scale(1.0, 0.62, 0.86);
            const hullBody = new THREE.Mesh(hullBodyGeo, crimsonMat);
            hullBody.position.set(-0.04, 0.22, 0);
            hullBody.castShadow = true;

            const bowGeo = new THREE.ConeGeometry(0.42, 0.86, 6);
            bowGeo.rotateZ(-Math.PI / 2 + 0.22);
            bowGeo.scale(1.0, 0.65, 0.82);
            const bowMesh = new THREE.Mesh(bowGeo, crimsonMat);
            bowMesh.position.set(0.92, 0.34, 0);
            bowMesh.castShadow = true;

            // Raised Stern Poop Deck (-X)
            const sternBase = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.68), crimsonMat);
            sternBase.position.set(-0.82, 0.40, 0);
            sternBase.castShadow = true;
            const sternRail = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.09, 0.72), goldMat);
            sternRail.position.set(-0.82, 0.66, 0);
            const deck = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.64), lightDeckMat);
            deck.position.set(0.05, 0.43, 0);
            const gunwaleGold = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 0.76), goldMat);
            gunwaleGold.position.set(0.02, 0.41, 0);
            group.add(hullBody, bowMesh, sternBase, sternRail, deck, gunwaleGold);

            // Stylized Dragon Head & Golden Horns at Swept-Up Bow (+X)
            const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.20), crimsonMat);
            neck.position.set(1.18, 0.56, 0);
            neck.rotation.z = -0.35;
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.20, 0.24), crimsonMat);
            snout.position.set(1.36, 0.72, 0);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.20), goldMat);
            jaw.position.set(1.36, 0.60, 0);
            const mane = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), goldMat);
            mane.position.set(1.22, 0.80, 0);
            const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.26, 4), goldMat);
            hornL.position.set(1.26, 0.90, 0.10);
            hornL.rotation.z = 0.55;
            const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.26, 4), goldMat);
            hornR.position.set(1.26, 0.90, -0.10);
            hornR.rotation.z = 0.55;
            group.add(neck, snout, jaw, mane, hornL, hornR);

            // 2 Prominent Bat-Wing Junk Sails + Small Stern Mizzen Fan
            const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.052, 2.02, 6), darkWoodMat);
            mainMast.position.set(0.00, 1.40, 0);
            const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, 1.48, 6), darkWoodMat);
            foreMast.position.set(0.64, 1.12, 0);
            const aftMast = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.036, 1.24, 6), darkWoodMat);
            aftMast.position.set(-0.74, 1.18, 0);
            group.add(mainMast, foreMast, aftMast);

            mainSail = buildJunkBatSail(0.56, 0.92, 1.28, 5, 0.04, 1.42);
            foreSail = buildJunkBatSail(0.38, 0.64, 0.92, 4, 0.66, 1.16);
            const aftSail = buildJunkBatSail(0.32, 0.52, 0.72, 4, -0.70, 1.24);
            group.add(mainSail, foreSail, aftSail);

            // Natural rigging shrouds, helm wheel, rudder, deck railings & rope/sacks
            addShroudLine(0.00, 2.15, 0, -0.06, 0.46, 0.35);
            addShroudLine(0.00, 2.15, 0, -0.06, 0.46, -0.35);
            addShroudLine(0.64, 1.72, 0, 0.58, 0.46, 0.30);
            addShroudLine(0.64, 1.72, 0, 0.58, 0.46, -0.30);
            addShroudLine(0.00, 2.20, 0, 0.64, 1.78, 0);
            addLowDeckRailings(-0.42, 0.52, 0.46, 0.34);
            addHelmAndRudder(-0.56, 0.68, -1.16);
            addRopeCoilAndSacks(0.32, 0.47, 0.16);

            flag = addFlagAt(0.00, 2.38, 0, vividFlagMat, -1);

        // ====================================================================
        // STYLE 1: emerald_catamaran — Twin Parallel Hulls + Wide Deck + 2 Triangular Sails
        // ====================================================================
        } else if (style === "emerald_catamaran") {
            [-0.34, 0.34].forEach((zOff) => {
                const hBodyGeo = new THREE.CylinderGeometry(0.18, 0.13, 1.48, 7);
                hBodyGeo.rotateZ(Math.PI / 2);
                hBodyGeo.scale(1.0, 0.85, 0.92);
                const hBody = new THREE.Mesh(hBodyGeo, deepEmeraldMat);
                hBody.position.set(-0.04, 0.18, zOff);
                hBody.castShadow = true;

                const hBowGeo = new THREE.ConeGeometry(0.18, 0.76, 6);
                hBowGeo.rotateZ(-Math.PI / 2);
                hBowGeo.scale(1.0, 0.85, 0.90);
                const hBow = new THREE.Mesh(hBowGeo, deepEmeraldMat);
                hBow.position.set(1.04, 0.20, zOff);
                hBow.castShadow = true;

                const hSternGeo = new THREE.ConeGeometry(0.16, 0.44, 6);
                hSternGeo.rotateZ(Math.PI / 2);
                const hStern = new THREE.Mesh(hSternGeo, deepEmeraldMat);
                hStern.position.set(-0.96, 0.21, zOff);

                const hTrim = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.055, 0.25), warmWoodMat);
                hTrim.position.set(0.02, 0.32, zOff);

                const twinRudder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.035), darkWoodMat);
                twinRudder.position.set(-1.14, 0.16, zOff);

                group.add(hBody, hBow, hStern, hTrim, twinRudder);
            });

            // Wide Bridging Deck + Crossbeams + Dense Cargo Crates, Sacks & Compact Cabin
            const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.09, 0.88), lightDeckMat);
            bridgeDeck.position.set(-0.08, 0.38, 0);
            bridgeDeck.castShadow = true;
            const foreBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.84), warmWoodMat);
            foreBeam.position.set(0.72, 0.36, 0);
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.30, 0.56), warmWoodMat);
            cabin.position.set(-0.46, 0.56, 0);
            const cabinWin = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.10, 0.44), glassDarkMat);
            cabinWin.position.set(-0.46, 0.60, 0);
            const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.06, 0.60), teamMat);
            cabinRoof.position.set(-0.46, 0.73, 0);
            const crateA = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.20, 0.24), crateLightMat);
            crateA.position.set(0.24, 0.52, -0.18);
            const crateB = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.16, 0.20), darkWoodMat);
            crateB.position.set(0.20, 0.50, 0.18);
            const barrelCat = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 7), warmWoodMat);
            barrelCat.position.set(0.44, 0.51, -0.18);
            group.add(bridgeDeck, foreBeam, cabin, cabinWin, cabinRoof, crateA, crateB, barrelCat);

            // Central Mast + 2 Billowing Triangular Sails (Main + Fore Jib)
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.052, 2.08, 7), darkWoodMat);
            mast.position.set(0.08, 1.42, 0);
            group.add(mast);

            mainSail = buildTriangularSail(0.96, 1.46, 0.06, 1.48, mintSailMat, teamMat, true);
            foreSail = buildTriangularSail(0.84, 1.30, 0.14, 1.38, mintSailMat, teamMat, false);
            group.add(mainSail, foreSail);

            // Shrouds anchored cleanly to twin hulls, forestay, low deck rails, helm & sacks
            addShroudLine(0.08, 2.28, 0, 0.04, 0.36, 0.42);
            addShroudLine(0.08, 2.28, 0, 0.04, 0.36, -0.42);
            addShroudLine(0.08, 2.34, 0, 0.96, 0.34, 0.34);
            addShroudLine(0.08, 2.34, 0, 0.96, 0.34, -0.34);
            addLowDeckRailings(-0.62, 0.46, 0.42, 0.42);
            addRopeCoilAndSacks(0.40, 0.43, 0.18);
            const catWheel = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.085, 8), warmWoodMat);
            catWheel.rotation.y = Math.PI / 2;
            catWheel.position.set(-0.18, 0.56, 0);
            group.add(catWheel);

            flag = addFlagAt(0.08, 2.44, 0, vividFlagMat, -1);

        // ====================================================================
        // STYLE 2: ocean_clipper — Long Sleek Hull + Long Bowsprit + 3 Masts White/Blue Sails
        // ====================================================================
        } else if (style === "ocean_clipper") {
            const hullBodyGeo = new THREE.CylinderGeometry(0.36, 0.24, 1.56, 8);
            hullBodyGeo.rotateZ(Math.PI / 2);
            hullBodyGeo.scale(1.0, 0.62, 0.74);
            const hullBody = new THREE.Mesh(hullBodyGeo, oceanBlueMat);
            hullBody.position.set(-0.04, 0.20, 0);
            hullBody.castShadow = true;

            const bowGeo = new THREE.ConeGeometry(0.35, 1.02, 6);
            bowGeo.rotateZ(-Math.PI / 2);
            bowGeo.scale(1.0, 0.64, 0.72);
            const bowMesh = new THREE.Mesh(bowGeo, oceanBlueMat);
            bowMesh.position.set(1.16, 0.24, 0);
            bowMesh.castShadow = true;

            const sternGeo = new THREE.ConeGeometry(0.34, 0.58, 6);
            sternGeo.rotateZ(Math.PI / 2);
            sternGeo.scale(1.0, 0.70, 0.72);
            const sternMesh = new THREE.Mesh(sternGeo, oceanBlueMat);
            sternMesh.position.set(-1.02, 0.25, 0);

            const deck = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.48), lightDeckMat);
            deck.position.set(0.02, 0.38, 0);
            const woodTrim = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.06, 0.56), warmWoodMat);
            woodTrim.position.set(0.02, 0.34, 0);

            // Long Extending Bowsprit (+X)
            const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.036, 0.96, 6), darkWoodMat);
            bowsprit.rotation.z = -Math.PI / 2.75;
            bowsprit.position.set(1.48, 0.56, 0);
            group.add(hullBody, bowMesh, sternMesh, deck, woodTrim, bowsprit);

            // 3 Slender Masts (Fore, Tallest Main, Mizzen)
            const mastFore = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.040, 1.66, 6), darkWoodMat);
            mastFore.position.set(0.58, 1.20, 0);
            const mastMain = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.048, 2.12, 6), darkWoodMat);
            mastMain.position.set(0.00, 1.44, 0);
            const mastMizzen = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.036, 1.46, 6), darkWoodMat);
            mastMizzen.position.set(-0.58, 1.10, 0);
            group.add(mastFore, mastMain, mastMizzen);

            // 3 Off-White Billowing Sails with Ocean-Blue Stripes + Triangular Bow Jib
            mainSail = new THREE.Group();
            const mainLower = buildSquareSail(0.74, 0.68, 0.85, 0, -0.26, pureWhiteSailMat, oceanBlueMat);
            const mainUpper = buildSquareSail(0.58, 0.56, 0.85, 0, 0.42, pureWhiteSailMat, oceanBlueMat);
            mainSail.add(mainLower, mainUpper);
            mainSail.position.set(0.00, 1.42, 0);

            foreSail = new THREE.Group();
            const foreSq = buildSquareSail(0.58, 0.84, 0.85, 0, 0, pureWhiteSailMat, oceanBlueMat);
            const bowJib = buildTriangularSail(0.76, 1.04, 0.52, -0.06, pureWhiteSailMat, oceanBlueMat, false);
            foreSail.add(foreSq, bowJib);
            foreSail.position.set(0.58, 1.24, 0);

            const mizzenSail = buildSquareSail(0.46, 0.72, 0.85, -0.58, 1.18, pureWhiteSailMat, oceanBlueMat);
            group.add(mainSail, foreSail, mizzenSail);

            // Clipper Rigging Stays, Low Rails, Aft Helm Wheel & Rope Coil
            addShroudLine(0.00, 2.26, 0, -0.04, 0.40, 0.28);
            addShroudLine(0.00, 2.26, 0, -0.04, 0.40, -0.28);
            addShroudLine(0.58, 1.92, 0, 1.82, 0.74, 0);
            addShroudLine(0.00, 2.30, 0, 0.58, 1.92, 0);
            addShroudLine(0.00, 2.24, 0, -0.58, 1.76, 0);
            addShroudLine(-0.58, 1.76, 0, -0.96, 0.42, 0);
            addLowDeckRailings(-0.78, 0.82, 0.41, 0.25);
            addHelmAndRudder(-0.82, 0.42, -1.26);
            addRopeCoilAndSacks(0.32, 0.42, 0.11);

            flag = addFlagAt(0.00, 2.48, 0, vividFlagMat, -1);

        // ====================================================================
        // STYLE 3: golden_galley — Golden Shielded Hull + 2-Tier Stern Pavilion + Central Mast
        // ====================================================================
        } else if (style === "golden_galley") {
            const hullBodyGeo = new THREE.CylinderGeometry(0.46, 0.30, 1.46, 8);
            hullBodyGeo.rotateZ(Math.PI / 2);
            hullBodyGeo.scale(1.0, 0.60, 0.88);
            const hullBody = new THREE.Mesh(hullBodyGeo, goldHullMat);
            hullBody.position.set(-0.02, 0.20, 0);
            hullBody.castShadow = true;

            const bowGeo = new THREE.ConeGeometry(0.42, 0.82, 6);
            bowGeo.rotateZ(-Math.PI / 2 + 0.18);
            bowGeo.scale(1.0, 0.64, 0.84);
            const bowMesh = new THREE.Mesh(bowGeo, goldHullMat);
            bowMesh.position.set(0.98, 0.30, 0);
            bowMesh.castShadow = true;

            const sternGeo = new THREE.BoxGeometry(0.76, 0.44, 0.72);
            const sternMesh = new THREE.Mesh(sternGeo, goldHullMat);
            sternMesh.position.set(-0.70, 0.36, 0);
            sternMesh.castShadow = true;

            const deck = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.08, 0.68), lightDeckMat);
            deck.position.set(0.02, 0.41, 0);
            const gunwaleRed = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.06, 0.78), crimsonMat);
            gunwaleRed.position.set(0.02, 0.40, 0);
            group.add(hullBody, bowMesh, sternMesh, deck, gunwaleRed);

            // Row of Circular Antique-Gold Shields along Both Sides of the Hull
            const shieldGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 8);
            shieldGeo.rotateX(Math.PI / 2);
            [-0.41, 0.41].forEach((zSide) => {
                [-0.32, -0.02, 0.28, 0.58].forEach((xPos) => {
                    const sh = new THREE.Mesh(shieldGeo, goldMat);
                    sh.position.set(xPos, 0.36, zSide);
                    const boss = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), crimsonMat);
                    boss.position.set(xPos, 0.36, zSide + (zSide > 0 ? 0.025 : -0.025));
                    group.add(sh, boss);
                });
            });

            // 2-Tier Traditional Pavilion (Lầu Gác 2 Tầng) at the Stern (-X)
            const pav = new THREE.Group();
            const floor1 = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.38, 0.66), warmWoodMat);
            floor1.position.y = 0.19;
            const win1 = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.16, 0.46), glassDarkMat);
            win1.position.y = 0.21;
            const win1Side = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.68), glassDarkMat);
            win1Side.position.y = 0.21;
            const roof1 = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.22, 4), crimsonMat);
            roof1.rotation.y = Math.PI / 4;
            roof1.position.y = 0.47;
            // Upper open-pillar gallery + upturned curved roof
            [[-0.20, -0.20], [0.20, -0.20], [-0.20, 0.20], [0.20, 0.20]].forEach(([px, pz]) => {
                const col = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.38, 6), crimsonMat);
                col.position.set(px, 0.72, pz);
                pav.add(col);
            });
            const upperCore = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.30, 0.32), glassDarkMat);
            upperCore.position.y = 0.70;
            const roof2 = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.28, 4), crimsonMat);
            roof2.rotation.y = Math.PI / 4;
            roof2.position.y = 1.00;
            const roofGoldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.62), goldMat);
            roofGoldTrim.position.y = 0.89;
            const spire = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), goldMat);
            spire.position.y = 1.18;
            pav.add(floor1, win1, win1Side, roof1, upperCore, roof2, roofGoldTrim, spire);
            pav.position.set(-0.62, 0.56, 0);
            group.add(pav);

            // Grand Central Mast + Ceremonial Fore Mast
            const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.056, 1.98, 7), darkWoodMat);
            mainMast.position.set(0.24, 1.38, 0);
            const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.038, 1.30, 6), darkWoodMat);
            foreMast.position.set(0.84, 1.04, 0);
            group.add(mainMast, foreMast);

            mainSail = buildSquareSail(0.82, 1.18, 0.90, 0.24, 1.40, creamSailMat, crimsonMat);
            foreSail = buildSquareSail(0.42, 0.62, 0.80, 0.84, 1.14, creamSailMat, goldMat);
            group.add(mainSail, foreSail);

            // Mast shrouds, stern rudder, low foredeck railings & ceremonial cargo
            addShroudLine(0.24, 2.18, 0, 0.16, 0.44, 0.35);
            addShroudLine(0.24, 2.18, 0, 0.16, 0.44, -0.35);
            addShroudLine(0.24, 2.22, 0, 0.84, 1.66, 0);
            addLowDeckRailings(-0.22, 0.72, 0.44, 0.35);
            const galleyRudder = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.04), darkWoodMat);
            galleyRudder.position.set(-1.12, 0.16, 0);
            group.add(galleyRudder);
            addRopeCoilAndSacks(0.56, 0.45, 0.16);

            flag = addFlagAt(0.24, 2.36, 0, vividFlagMat, -1);

        // ====================================================================
        // STYLE 4: imperial_bark — Wide Purple Merchant Hull + Heavy Cargo + 2 Wide Square Sails
        // ====================================================================
        } else {
            const hullBodyGeo = new THREE.CylinderGeometry(0.56, 0.42, 1.42, 8);
            hullBodyGeo.rotateZ(Math.PI / 2);
            hullBodyGeo.scale(1.0, 0.68, 1.06);
            const hullBody = new THREE.Mesh(hullBodyGeo, royalPurpleMat);
            hullBody.position.set(-0.04, 0.24, 0);
            hullBody.castShadow = true;

            const bowGeo = new THREE.ConeGeometry(0.54, 0.72, 6);
            bowGeo.rotateZ(-Math.PI / 2);
            bowGeo.scale(1.0, 0.68, 1.04);
            const bowMesh = new THREE.Mesh(bowGeo, royalPurpleMat);
            bowMesh.position.set(0.96, 0.27, 0);
            bowMesh.castShadow = true;

            const sternMesh = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.56, 0.96), royalPurpleMat);
            sternMesh.position.set(-0.78, 0.40, 0);
            sternMesh.castShadow = true;

            const deck = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 0.92), lightDeckMat);
            deck.position.set(0.04, 0.46, 0);
            const gunwaleTrim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.065, 1.02), warmWoodMat);
            gunwaleTrim.position.set(0.00, 0.49, 0);
            group.add(hullBody, bowMesh, sternMesh, deck, gunwaleTrim);

            // Abundant Midship Trade Cargo (Wooden Crates, Cloth Bales, Burlap Sacks & Oak Barrels)
            const cargoSpecs = [
                { type: "box", x: 0.16, y: 0.62, z: 0.22, s: [0.28, 0.26, 0.26], m: crateLightMat },
                { type: "box", x: 0.18, y: 0.60, z: -0.22, s: [0.24, 0.22, 0.24], m: warmWoodMat },
                { type: "box", x: 0.16, y: 0.84, z: 0.18, s: [0.20, 0.18, 0.20], m: crateLightMat },
                { type: "box", x: -0.18, y: 0.60, z: -0.24, s: [0.26, 0.22, 0.26], m: crateBlueMat },
                { type: "box", x: -0.20, y: 0.59, z: 0.24, s: [0.22, 0.20, 0.22], m: crateLightMat },
                { type: "box", x: 0.54, y: 0.57, z: 0.18, s: [0.20, 0.18, 0.20], m: warmWoodMat },
                { type: "barrel", x: 0.50, y: 0.57, z: -0.22, r: 0.09, h: 0.20, m: darkWoodMat },
                { type: "barrel", x: -0.44, y: 0.57, z: 0.00, r: 0.09, h: 0.20, m: darkWoodMat }
            ];
            cargoSpecs.forEach((c) => {
                const msh = c.type === "barrel"
                    ? new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.h, 7), c.m)
                    : new THREE.Mesh(new THREE.BoxGeometry(c.s[0], c.s[1], c.s[2]), c.m);
                msh.position.set(c.x, c.y, c.z);
                msh.castShadow = false;
                group.add(msh);
            });

            // 2 Classic Wide Square-Rigged Masts (Warm Ivory Sails with Royal Purple Stripes)
            const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.058, 2.02, 7), darkWoodMat);
            mainMast.position.set(-0.14, 1.44, 0);
            const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.048, 1.62, 7), darkWoodMat);
            foreMast.position.set(0.56, 1.24, 0);
            group.add(mainMast, foreMast);

            mainSail = buildSquareSail(1.06, 1.18, 0.88, -0.14, 1.48, creamSailMat, teamStripeMat);
            foreSail = buildSquareSail(0.82, 0.90, 0.88, 0.56, 1.30, creamSailMat, teamStripeMat);
            group.add(mainSail, foreSail);

            // Merchant Bark Rigging, Low Rails, Aft Helm Wheel, Rudder & Deck Sacks/Rope
            addShroudLine(-0.14, 2.24, 0, -0.20, 0.50, 0.48);
            addShroudLine(-0.14, 2.24, 0, -0.20, 0.50, -0.48);
            addShroudLine(0.56, 1.94, 0, 0.50, 0.50, 0.44);
            addShroudLine(0.56, 1.94, 0, 0.50, 0.50, -0.44);
            addShroudLine(-0.14, 2.28, 0, 0.56, 1.98, 0);
            addLowDeckRailings(-0.46, 0.72, 0.50, 0.47);
            addHelmAndRudder(-0.68, 0.68, -1.12);
            addRopeCoilAndSacks(0.74, 0.50, 0.14);

            flag = addFlagAt(-0.14, 2.44, 0, vividFlagMat, -1);
        }

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

        // 5. Floating Player Ship Nameplate (Rendered via crisp 2D HTML projected label #map-labels-layer)
        const nameSprite = null;

        // 6. Local Player 3D Arrow Marker (ONLY visible on your own ship!)
        let myArrowMarker = null;
        if (isLocalPlayer) {
            myArrowMarker = this.createLocalPlayerArrowMarker(arch.color);
            myArrowMarker.position.set(0, 4.45, 0);
            group.add(myArrowMarker);
        }

        group.scale.setScalar(1.48);
        group.userData = {
            baseShipScale: 1.48,
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
            archetypeId: archIdx,
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

        // Natural warm Low-Poly materials for mainland dioramas (no wash-out, zero emissive, castShadow: false)
        const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
            ...opts
        });

        const woodMat = mat(0x6b3e1b);
        const darkWoodMat = mat(0x4a2511);
        const grayTrunkMat = mat(0x94a3b8);
        const whiteMat = mat(0xf1f5f9);
        const canalTurqMat = mat(0x288fa8);
        const siltCanalMat = mat(0xa86840);

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
            } else if (style === "casuarina") {
                // Cây phi lao chắn gió ven biển Miền Trung (thân mảnh + tán chóp cao thon)
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.036, 0.34, 5), darkWoodMat);
                trunk.position.y = 0.17;
                const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.44, 5), leafMat);
                c1.position.y = 0.46;
                const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 5), leafMat);
                c2.position.y = 0.68;
                t.add(trunk, c1, c2);
            } else if (style === "nipa") {
                // Bụi dừa nước ĐBSCL (tàu lá tỏa thấp sát mặt nước)
                for (let f = 0; f < 6; f++) {
                    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.44, 4), leafMat);
                    frond.rotation.z = 0.92;
                    frond.rotation.y = (f / 6) * Math.PI * 2;
                    frond.position.set(0, 0.20, 0);
                    t.add(frond);
                }
            } else {
                // Cây thông lá kim 3 tầng tán (Trung du & Miền núi Bắc Bộ)
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.24, 5), darkWoodMat);
                trunk.position.y = 0.12;
                const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.32, 6), leafMat);
                c1.position.y = 0.32;
                const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 6), leafMat);
                c2.position.y = 0.52;
                const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 6), leafMat);
                c3.position.y = 0.70;
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
            //    Đồi núi xanh rêu có mỏm đá trầm + cụm cây thông 3 tầng nhiều cỡ (#1b5e20 & #2e7d32)
            //    + ruộng bậc thang + nhà sàn gỗ nhỏ (gom cụm theo góc, chừa thoáng giữa ô).
            const mossDarkMat = mat(0x1b4332);
            const mossMidMat = mat(0x2d6a4f);
            const rockTipMat = mat(0x64748b);

            if (variant === 0) {
                const addMountainPeak = (mx, mz, r, h, bodyMat) => {
                    const body = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), bodyMat);
                    body.position.set(mx, h * 0.5, mz);
                    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.36, h * 0.36, 6), rockTipMat);
                    cap.position.set(mx, h * 0.82, mz);
                    group.add(body, cap);
                };
                addMountainPeak(-0.42, -0.36, 0.62, 1.05, mossDarkMat);
                addMountainPeak(0.26, -0.44, 0.48, 0.80, mossMidMat);

                addHouse(0.42, 0.38, 0.40, 0.22, 0.30, 0x78350f, 0x451a03, true, 0.25);
                // 2 cụm thông 3 tầng nhiều cỡ (#1b5e20 & #2e7d32)
                addTree(-0.58, 0.34, 0.96, "pine", 0x1b5e20);
                addTree(-0.34, 0.54, 0.76, "pine", 0x2e7d32);
                addTree(-0.68, 0.08, 0.70, "pine", 0x2e7d32);
                addTree(0.64, -0.14, 0.86, "pine", 0x1b5e20);
                addTree(0.56, 0.08, 0.68, "pine", 0x2e7d32);

            } else if (variant === 1) {
                const terraceCols = [0x558b2f, 0x7cb342, 0xd4b238];
                for (let t = 0; t < 3; t++) {
                    const step = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.92 - t * 0.22, 1.00 - t * 0.22, 0.16, 7),
                        mat(terraceCols[t])
                    );
                    step.position.set(-0.14 - 0.05 * t, 0.08 + t * 0.15, -0.12 - 0.04 * t);
                    group.add(step);
                }
                addHouse(0.50, 0.40, 0.38, 0.22, 0.28, 0x78350f, 0x451a03, true, -0.2);
                addTree(-0.62, 0.44, 0.92, "pine", 0x1b5e20);
                addTree(-0.42, 0.58, 0.74, "pine", 0x2e7d32);
                addTree(0.46, -0.48, 0.84, "pine", 0x1b5e20);
                addTree(0.66, -0.28, 0.70, "pine", 0x2e7d32);

            } else {
                const teaHill = new THREE.Mesh(new THREE.DodecahedronGeometry(0.58, 0), mat(0x2e7d32));
                teaHill.scale.set(1.18, 0.46, 1.08);
                teaHill.position.set(0.14, 0.14, 0.16);
                group.add(teaHill);
                const backPeak = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.84, 6), mossDarkMat);
                backPeak.position.set(-0.48, 0.42, -0.40);
                const backTip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.30, 6), rockTipMat);
                backTip.position.set(-0.48, 0.70, -0.40);
                group.add(backPeak, backTip);

                addTree(0.56, -0.44, 0.92, "pine", 0x1b5e20);
                addTree(0.32, -0.56, 0.76, "pine", 0x2e7d32);
                addTree(-0.62, 0.16, 0.84, "pine", 0x1b5e20);
                addTree(-0.18, 0.56, 0.72, "pine", 0x2e7d32);
                addHouse(-0.46, 0.46, 0.36, 0.20, 0.26, 0x78350f, 0x451a03, true, 0.3);
            }

        } else if (spec.regionId === 1) {
            // 2. ĐỒNG BẰNG SÔNG HỒNG:
            //    Cụm lũy tre xanh mướt (4–5 bụi) + thửa ruộng lúa xanh vàng chia ô rõ + mái ngói đỏ làng quê + dải sông phù sa nhỏ.
            const canal1 = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.04, 0.24), siltCanalMat);
            canal1.position.set(-0.24, 0.025, 0.38);
            canal1.rotation.y = 0.22;
            const canal2 = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.04, 0.24), siltCanalMat);
            canal2.position.set(0.38, 0.025, 0.20);
            canal2.rotation.y = -0.20;
            group.add(canal1, canal2);

            if (variant === 0) {
                addHouse(-0.36, -0.32, 0.42, 0.20, 0.32, 0xfef3c7, 0xb91c1c, false, 0.10);
                addHouse(0.24, -0.38, 0.36, 0.18, 0.28, 0xfef3c7, 0xc2410c, false, -0.18);
                // 2 cụm lũy tre xanh mướt
                addTree(-0.66, -0.06, 0.94, "bamboo", 0x15803d);
                addTree(-0.56, 0.18, 0.82, "bamboo", 0x16a34a);
                addTree(0.62, -0.16, 0.92, "bamboo", 0x16a34a);
                addTree(0.56, 0.46, 0.84, "bamboo", 0x15803d);
                addTree(0.18, 0.56, 0.78, "bamboo", 0x22c55e);

            } else if (variant === 1) {
                const paddyA = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.48), mat(0x65a30d));
                paddyA.position.set(0.30, 0.03, -0.36);
                const paddyB = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.46), mat(0xd4b238));
                paddyB.position.set(-0.36, 0.03, -0.38);
                group.add(paddyA, paddyB);

                addHouse(-0.46, 0.02, 0.36, 0.18, 0.28, 0xfef3c7, 0xb91c1c, false, 0.18);
                addTree(0.64, -0.34, 0.92, "bamboo", 0x15803d);
                addTree(0.62, -0.08, 0.80, "bamboo", 0x16a34a);
                addTree(-0.60, 0.48, 0.88, "bamboo", 0x16a34a);
                addTree(-0.38, 0.58, 0.76, "bamboo", 0x15803d);

            } else {
                const paddy = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.05, 0.42), mat(0x84cc16));
                paddy.position.set(0.06, 0.03, -0.46);
                group.add(paddy);

                addHouse(-0.36, -0.10, 0.40, 0.20, 0.30, 0xfef3c7, 0xc2410c, false, 0.12);
                addHouse(0.34, -0.14, 0.36, 0.18, 0.26, 0xfef3c7, 0xb91c1c, false, -0.15);
                addTree(-0.66, -0.36, 0.90, "bamboo", 0x15803d);
                addTree(-0.64, 0.24, 0.82, "bamboo", 0x16a34a);
                addTree(0.64, 0.34, 0.92, "bamboo", 0x16a34a);
                addTree(0.42, 0.54, 0.78, "bamboo", 0x15803d);
            }

        } else if (spec.regionId === 2) {
            // 3. DUYÊN HẢI MIỀN TRUNG:
            //    Hàng dừa nghiêng & cụm cây phi lao chắn gió trên cồn cát vàng + đồi Trường Sơn xanh phía trong + tua-bin gió/pin mặt trời gọn.
            const duneLightMat = mat(0xe6cc8a);
            const duneSandMat = mat(0xdcc18a);
            const truongSonMat = mat(0x2e6b36);

            const dune1 = new THREE.Mesh(new THREE.ConeGeometry(0.76, 0.28, 7), duneLightMat);
            dune1.scale.set(1.20, 0.68, 0.90);
            dune1.position.set(0.28, 0.10, 0.34);
            const innerHill = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.68, 6), truongSonMat);
            innerHill.position.set(-0.54, 0.34, -0.36);
            group.add(dune1, innerHill);

            if (variant === 0) {
                addWindTurbine(0.46, -0.34, 1.08, 1.05);
                addWindTurbine(0.14, -0.44, 1.00, 0.98);
                addSolarPanel(-0.24, 0.44, 0.15);
                addTree(0.56, 0.28, 0.92, "palm", 0x16a34a);
                addTree(0.32, 0.48, 0.84, "palm", 0x15803d);
                addTree(-0.58, 0.20, 0.88, "casuarina", 0x166534);
                addTree(-0.42, 0.38, 0.76, "casuarina", 0x15803d);

            } else if (variant === 1) {
                addSolarPanel(-0.34, 0.24, 0.08);
                addSolarPanel(0.04, 0.24, 0.08);
                addWindTurbine(0.38, -0.36, 1.06, 1.02);
                addTree(0.56, 0.34, 0.94, "palm", 0x16a34a);
                addTree(0.42, 0.52, 0.82, "palm", 0x15803d);
                addTree(-0.18, -0.52, 0.90, "casuarina", 0x166534);
                addTree(-0.38, -0.56, 0.78, "casuarina", 0x1b5e20);

            } else {
                const dune2 = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.24, 7), duneSandMat);
                dune2.position.set(0.44, 0.08, -0.24);
                group.add(dune2);
                addWindTurbine(0.38, -0.26, 1.04, 1.00);
                addTree(0.48, 0.36, 0.96, "palm", 0x15803d);
                addTree(0.18, 0.50, 0.90, "palm", 0x16a34a);
                addTree(-0.18, 0.52, 0.84, "casuarina", 0x166534);
                addTree(-0.56, 0.24, 0.92, "casuarina", 0x1b5e20);
                addTree(-0.62, -0.02, 0.78, "casuarina", 0x2e7d32);
            }

        } else if (spec.regionId === 3) {
            // 4. TÂY NGUYÊN:
            //    Gò đất đỏ Bazan + luống cây cà phê xanh đậm xếp hàng + cụm cây rừng tán rộng nhiều tầng + nhà gỗ mái dốc.
            const basaltMat = mat(0x9a441e);
            const coffeeMat = mat(0x14532d);

            const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 0), basaltMat);
            hill.scale.set(1.28, 0.38, 1.12);
            hill.position.set(-0.08, 0.12, -0.14);
            group.add(hill);

            if (variant === 0) {
                addHouse(-0.42, -0.20, 0.48, 0.22, 0.32, 0x78350f, 0x5c2d0c, true, 0.18, 0.56);
                for (let col = -1; col <= 1; col++) {
                    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), coffeeMat);
                    bush.position.set(col * 0.32 - 0.10, 0.16, 0.44);
                    group.add(bush);
                }
                addTree(0.48, -0.34, 0.96, "broadleaf", 0x15803d);
                addTree(0.20, -0.52, 0.86, "broadleaf", 0x166534);
                addTree(0.58, 0.04, 0.80, "broadleaf", 0x2e7d32);
                addTree(0.42, 0.42, 0.76, "broadleaf", 0x14532d);

            } else if (variant === 1) {
                for (let row = -1; row <= 0; row++) {
                    for (let col = -1; col <= 1; col++) {
                        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), coffeeMat);
                        bush.position.set(col * 0.34 + 0.10, 0.20, row * 0.30 + 0.36);
                        group.add(bush);
                    }
                }
                addTree(-0.56, -0.36, 0.94, "broadleaf", 0x15803d);
                addTree(-0.28, -0.54, 0.84, "broadleaf", 0x1b5e20);
                addTree(0.36, -0.46, 0.88, "broadleaf", 0x2e7d32);
                addHouse(0.48, 0.44, 0.36, 0.18, 0.26, 0x78350f, 0x5c2d0c, false, -0.2, 0.55);

            } else {
                addTree(-0.48, -0.36, 0.98, "broadleaf", 0x166534);
                addTree(-0.14, -0.52, 0.88, "broadleaf", 0x15803d);
                addTree(0.48, -0.28, 0.90, "broadleaf", 0x1b5e20);
                addTree(0.56, 0.12, 0.76, "broadleaf", 0x2e7d32);
                addHouse(-0.36, 0.32, 0.46, 0.22, 0.32, 0x78350f, 0x5c2d0c, true, 0.14, 0.55);
                for (let col = 0; col <= 2; col++) {
                    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), coffeeMat);
                    bush.position.set(0.14 + col * 0.24, 0.16, 0.46 - col * 0.06);
                    group.add(bush);
                }
            }

        } else if (spec.regionId === 4) {
            // 5. ĐÔNG NAM BỘ:
            //    Hàng cây cao su thẳng tắp (thân xám, tán xanh sáng) + mảng công viên cây xanh xen cụm cao ốc/nhà xưởng gọn gàng.
            const glassBlueMat = mat(0x7ca6cc);
            const concreteWallMat = mat(0xd8dfe6);
            const roofVaultMat = mat(0x64748b);
            const winSoftMat = mat(0xe6ddb8);

            if (variant === 0) {
                const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.05, 0.38), whiteMat);
                t1.position.set(-0.34, 0.525, -0.26);
                const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.40), winSoftMat);
                w1.position.set(-0.34, 0.78, -0.26);
                const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.80, 0.36), glassBlueMat);
                t2.position.set(0.22, 0.40, -0.34);
                group.add(t1, w1, t2);

                // Mảng công viên cây xanh & hàng cao su góc dưới-phải
                addTree(0.46, 0.20, 0.90, "rubber", 0x4ade80);
                addTree(0.18, 0.44, 0.86, "rubber", 0x22c55e);
                addTree(-0.24, 0.46, 0.88, "orchard", 0x16a34a);
                addTree(-0.56, 0.30, 0.80, "rubber", 0x4ade80);

            } else if (variant === 1) {
                const addArchedWarehouse = (wx, wz, w, h, d) => {
                    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concreteWallMat);
                    wall.position.set(wx, h / 2, wz);
                    const vault = new THREE.Mesh(
                        new THREE.CylinderGeometry(d * 0.5, d * 0.5, w, 8, 1, false, 0, Math.PI),
                        roofVaultMat
                    );
                    vault.rotation.z = Math.PI / 2;
                    vault.position.set(wx, h, wz);
                    group.add(wall, vault);
                };
                addArchedWarehouse(-0.22, -0.32, 0.78, 0.30, 0.40);
                addArchedWarehouse(0.28, 0.30, 0.64, 0.26, 0.34);

                addTree(-0.58, 0.26, 0.90, "rubber", 0x4ade80);
                addTree(-0.52, 0.54, 0.84, "rubber", 0x22c55e);
                addTree(0.52, -0.26, 0.88, "rubber", 0x4ade80);
                addTree(0.56, -0.50, 0.80, "orchard", 0x16a34a);

            } else {
                for (let row = 0; row < 2; row++) {
                    for (let col = -1; col <= 1; col++) {
                        addTree(col * 0.36, 0.20 + row * 0.34, 0.88, "rubber", (col + row) % 2 === 0 ? 0x4ade80 : 0x22c55e);
                    }
                }
                const office = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.84, 0.38), glassBlueMat);
                office.position.set(-0.08, 0.42, -0.44);
                const offWin = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 0.40), winSoftMat);
                offWin.position.set(-0.08, 0.60, -0.44);
                group.add(office, offWin);
            }

        } else {
            // 6. ĐỒNG BẰNG SÔNG CỬU LONG:
            //    Rừng dừa nước & vườn cây ăn trái tán tròn đa sắc xanh (#22c55e, #15803d, #65a30d)
            //    + kênh rạch xanh lam uốn nhẹ có cầu nhỏ & ghe gỗ.
            const dikeMat = mat(0x7c4a21);
            const shrimpWaterMat = mat(0x1d7a9c);

            const canal1 = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.04, 0.28), canalTurqMat);
            canal1.position.set(-0.24, 0.025, 0.08);
            canal1.rotation.y = 0.14;
            const canal2 = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.04, 0.26), canalTurqMat);
            canal2.position.set(0.38, 0.025, -0.04);
            canal2.rotation.y = -0.18;
            group.add(canal1, canal2);

            if (variant === 0) {
                const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.60), whiteMat);
                bridgeDeck.position.set(-0.14, 0.15, 0.08);
                group.add(bridgeDeck);

                const sampan1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.15), woodMat);
                sampan1.position.set(0.36, 0.08, -0.04);
                sampan1.rotation.y = -0.18;
                group.add(sampan1);
                if (animRegistry) animRegistry.push({ type: "bob_boat", mesh: sampan1, baseY: 0.08, phase: r1 * 6.28 });

                // Vườn cây ăn trái đa sắc xanh + bụi dừa nước ven kênh
                addTree(0.48, -0.46, 0.94, "orchard", 0x22c55e);
                addTree(0.18, -0.54, 0.84, "orchard", 0x65a30d);
                addTree(-0.48, -0.42, 0.92, "orchard", 0x15803d);
                addTree(0.44, 0.46, 0.88, "orchard", 0x22c55e);
                addTree(-0.46, 0.42, 0.90, "nipa", 0x15803d);

            } else if (variant === 1) {
                const addShrimpPond = (px, pz, pw, pd) => {
                    const dike = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.10, 0.08, pd + 0.10), dikeMat);
                    dike.position.set(px, 0.04, pz);
                    const pond = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.09, pd), shrimpWaterMat);
                    pond.position.set(px, 0.048, pz);
                    group.add(dike, pond);
                };
                addShrimpPond(-0.32, -0.40, 0.58, 0.40);
                addShrimpPond(0.40, -0.42, 0.52, 0.36);

                const sampan = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.15), woodMat);
                sampan.position.set(0.34, 0.08, -0.04);
                group.add(sampan);
                if (animRegistry) animRegistry.push({ type: "bob_boat", mesh: sampan, baseY: 0.08, phase: r2 * 6.28 });

                addTree(0.46, 0.46, 0.90, "orchard", 0x22c55e);
                addTree(0.16, 0.52, 0.82, "orchard", 0x65a30d);
                addTree(-0.44, 0.46, 0.92, "nipa", 0x15803d);
                addTree(-0.62, 0.32, 0.80, "nipa", 0x22c55e);

            } else {
                const paddyGreen = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.42), mat(0x65a30d));
                paddyGreen.position.set(-0.38, 0.03, -0.42);
                const paddyYellow = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.05, 0.42), mat(0xd4b238));
                paddyYellow.position.set(0.34, 0.03, -0.44);
                group.add(paddyGreen, paddyYellow);

                addTree(-0.48, 0.46, 0.94, "orchard", 0x15803d);
                addTree(-0.18, 0.54, 0.86, "orchard", 0x65a30d);
                addTree(0.48, 0.44, 0.92, "orchard", 0x22c55e);
                addTree(0.60, 0.24, 0.82, "nipa", 0x15803d);
                addHouse(-0.02, -0.42, 0.34, 0.18, 0.26, 0xfef3c7, 0xd97706, true, 0.08);
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
        const typeKey = (resourceType === "food" || resourceType === "wood" || resourceType === "iron") ? resourceType : "food";
        const group = new THREE.Group();

        // Unified Shared Prototype Cache across ALL 3 Mine Types (Lúa, Gỗ, Sắt):
        // - Identical hex island footprint (~60% of hex diameter: r = 0.88..0.96)
        // - Identical height envelope (~1.05..1.20 units, clearly below Ports, Monuments & Storm Clouds)
        // - Reuses BufferGeometries & MeshLambertMaterials (flatShading: true, castShadow: false, zero PointLight!)
        if (!ProceduralModels._resourceNodePrototypes) {
            ProceduralModels._resourceNodePrototypes = {};
        }

        if (!ProceduralModels._resourceNodePrototypes[typeKey]) {
            const protoStatic = new THREE.Group();
            const sharedMat = (color, opts = {}) => new THREE.MeshLambertMaterial({
                color,
                flatShading: true,
                ...opts
            });

            // Unified beveled low-poly hex island base shared geometry
            const baseGeo = new THREE.CylinderGeometry(0.88, 0.96, 0.13, 6);

            if (typeKey === "food") {
                // 🌾 MỎ LÚA: Cánh Đồng Lúa Chín & Kho Thóc Gọn (peak y ≈ 1.06)
                const bundMat = sharedMat(0x78716c);
                const paddyRichMat = sharedMat(0xeab308, { emissive: 0xca8a04, emissiveIntensity: 0.16 });
                const paddyBrightMat = sharedMat(0xfacc15, { emissive: 0xeab308, emissiveIntensity: 0.18 });
                const hutWallMat = sharedMat(0x92400e);
                const thatchMat = sharedMat(0xd97706);
                const haystackMat = sharedMat(0xf59e0b, { emissive: 0xd97706, emissiveIntensity: 0.16 });

                const pad = new THREE.Mesh(baseGeo, bundMat);
                pad.position.y = 0.065;
                protoStatic.add(pad);

                // 3 neat terraced golden rice plots with thin earthen bunds
                [
                    [-0.24, 0.15, 0.24, 0.52, 0.40, paddyRichMat],
                    [0.30, 0.16, 0.20, 0.44, 0.36, paddyBrightMat],
                    [0.08, 0.17, -0.26, 0.62, 0.38, paddyRichMat]
                ].forEach(([px, py, pz, pw, pd, pMat]) => {
                    const bund = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.07, 0.07, pd + 0.07), bundMat);
                    bund.position.set(px, py, pz);
                    const plot = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.085, pd), pMat);
                    plot.position.set(px, py + 0.015, pz);
                    protoStatic.add(bund, plot);
                });

                // 6 compact low golden rice sheaves
                const sheafGeo = new THREE.ConeGeometry(0.12, 0.32, 6);
                [
                    [-0.36, 0.32], [-0.14, 0.18], [0.22, 0.30],
                    [0.42, 0.14], [0.16, -0.20], [0.36, -0.28]
                ].forEach(([sx, sz]) => {
                    const sheaf = new THREE.Mesh(sheafGeo, paddyBrightMat);
                    sheaf.position.set(sx, 0.34, sz);
                    protoStatic.add(sheaf);
                });

                // Compact thatched granary/rice hut in back-left corner (peak y ≈ 1.04)
                const hutBody = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.34, 0.34), hutWallMat);
                hutBody.position.set(-0.32, 0.34, -0.26);
                const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.36, 4), thatchMat);
                hutRoof.rotation.y = Math.PI / 4;
                hutRoof.position.set(-0.32, 0.68, -0.26);
                protoStatic.add(hutBody, hutRoof);

                // 2 round golden haystacks / grain sacks in front-right corner
                const stack1 = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.44, 7), haystackMat);
                stack1.position.set(0.34, 0.38, 0.28);
                const stack2 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 7), haystackMat);
                stack2.position.set(0.12, 0.33, 0.44);
                protoStatic.add(stack1, stack2);

            } else if (typeKey === "wood") {
                // 🌲 MỎ GỖ: Trại Lâm Trường Gọn (peak y ≈ 1.18)
                const grassBaseMat = sharedMat(0x5c7a32);
                const postMat = sharedMat(0x78350f);
                const roofMat = sharedMat(0xb45309);
                const barkMat = sharedMat(0x7c2d12);
                const cutEndMat = sharedMat(0xfde68a, { emissive: 0xfde68a, emissiveIntensity: 0.16 });
                const pineDarkMat = sharedMat(0x15803d);
                const pineFreshMat = sharedMat(0x16a34a);

                const pad = new THREE.Mesh(baseGeo, grassBaseMat);
                pad.position.y = 0.065;
                protoStatic.add(pad);

                // Compact slanted-roof sawmill shed in back-right (matches Food granary scale)
                [
                    [0.10, -0.38, 0.36], [0.54, -0.38, 0.36],
                    [0.10, -0.02, 0.28], [0.54, -0.02, 0.28]
                ].forEach(([px, pz, ph]) => {
                    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, ph, 0.05), postMat);
                    post.position.set(px, 0.13 + ph * 0.5, pz);
                    protoStatic.add(post);
                });
                const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.48), roofMat);
                shedRoof.position.set(0.32, 0.48, -0.20);
                shedRoof.rotation.x = 0.22;
                protoStatic.add(shedRoof);

                // Signature 3-2-1 Pyramid Stack of 6 Round Timber Logs (bark #7c2d12 + bright cream cut ends #fde68a)
                const logGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.60, 7);
                logGeo.rotateZ(Math.PI / 2);
                const cutEndGeo = new THREE.CylinderGeometry(0.070, 0.070, 0.62, 7);
                cutEndGeo.rotateZ(Math.PI / 2);
                [
                    [0, -0.17], [0, 0.0], [0, 0.17],
                    [1, -0.085], [1, 0.085],
                    [2, 0.0]
                ].forEach(([row, zOff]) => {
                    const ly = 0.21 + row * 0.145;
                    const lz = 0.28 + zOff;
                    const logMesh = new THREE.Mesh(logGeo, barkMat);
                    logMesh.position.set(-0.06, ly, lz);
                    const cutMesh = new THREE.Mesh(cutEndGeo, cutEndMat);
                    cutMesh.position.set(-0.06, ly, lz);
                    protoStatic.add(logMesh, cutMesh);
                });

                // 3 compact multi-tier timber/pine trees in back (max height <= 1.18)
                [
                    [-0.46, -0.34, 0.86, pineDarkMat],
                    [-0.16, -0.44, 0.96, pineFreshMat],
                    [-0.58, -0.02, 0.72, pineDarkMat]
                ].forEach(([tx, tz, sc, lMat]) => {
                    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.07, 0.28 * sc, 6), postMat);
                    tr.position.set(tx, 0.13 + 0.14 * sc, tz);
                    const tier1 = new THREE.Mesh(new THREE.ConeGeometry(0.24 * sc, 0.38 * sc, 6), lMat);
                    tier1.position.set(tx, 0.13 + 0.42 * sc, tz);
                    const tier2 = new THREE.Mesh(new THREE.ConeGeometry(0.17 * sc, 0.32 * sc, 6), lMat);
                    tier2.position.set(tx, 0.13 + 0.66 * sc, tz);
                    protoStatic.add(tr, tier1, tier2);
                });

                // 2 low freshly-cut stumps in front revealing bright cut tops (#fde68a)
                [
                    [0.44, 0.30, 0.15],
                    [-0.48, 0.36, 0.13]
                ].forEach(([sx, sz, sh]) => {
                    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, sh, 7), barkMat);
                    stump.position.set(sx, 0.13 + sh * 0.5, sz);
                    const cutTop = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 7), cutEndMat);
                    cutTop.position.set(sx, 0.13 + sh + 0.01, sz);
                    protoStatic.add(stump, cutTop);
                });

            } else {
                // ⛏️ MỎ SẮT: Hầm Mỏ Quặng Gọn (peak y ≈ 1.08 — cân đối hoàn toàn với Mỏ Lúa & Mỏ Gỗ)
                const rockLightMat = sharedMat(0x475569);
                const rockDarkMat = sharedMat(0x334155);
                const tunnelVoidMat = sharedMat(0x0f172a);
                const timberMat = sharedMat(0x78350f);
                const lanternMat = sharedMat(0xfbbf24, { emissive: 0xf59e0b, emissiveIntensity: 0.90 });
                const railMat = sharedMat(0x94a3b8);
                const oreSilverMat = sharedMat(0xcbd5e1, { emissive: 0x38bdf8, emissiveIntensity: 0.18 });

                const pad = new THREE.Mesh(baseGeo, rockDarkMat);
                pad.position.y = 0.065;
                protoStatic.add(pad);

                // Compact angular low-poly rock hill (lowered to match Wood & Food height!)
                const cragGeo = (typeof THREE.DodecahedronGeometry !== "undefined")
                    ? new THREE.DodecahedronGeometry(0.46, 0)
                    : new THREE.OctahedronGeometry(0.46, 0);
                const mainHill = new THREE.Mesh(cragGeo, rockLightMat);
                mainHill.scale.set(1.18, 0.95, 0.88);
                mainHill.position.set(-0.06, 0.46, -0.22);
                const sideHill = new THREE.Mesh(cragGeo, rockDarkMat);
                sideHill.scale.set(0.78, 0.70, 0.74);
                sideHill.position.set(0.36, 0.34, -0.26);
                protoStatic.add(mainHill, sideHill);

                // Mine Tunnel Opening (#0f172a) + U-shaped Timber Frame (#78350f) + Warm Hanging Lantern
                const tunnelVoid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.16), tunnelVoidMat);
                tunnelVoid.position.set(0.0, 0.32, 0.12);
                const postL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.08), timberMat);
                postL.position.set(-0.19, 0.34, 0.19);
                const postR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.08), timberMat);
                postR.position.set(0.19, 0.34, 0.19);
                const topBeam = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.09), timberMat);
                topBeam.position.set(0.0, 0.56, 0.19);
                const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.11, 0.095), lanternMat);
                lantern.position.set(0.0, 0.46, 0.23);
                protoStatic.add(tunnelVoid, postL, postR, topBeam, lantern);

                // 2 short parallel steel rails + loaded silver-ore minecart
                [-0.10, 0.10].forEach(rx => {
                    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.026, 0.60), railMat);
                    rail.position.set(rx, 0.14, 0.46);
                    protoStatic.add(rail);
                });
                [0.28, 0.46, 0.64].forEach(tz => {
                    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.048), timberMat);
                    tie.position.set(0.0, 0.13, tz);
                    protoStatic.add(tie);
                });
                const cartBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.30), rockDarkMat);
                cartBody.position.set(0.0, 0.24, 0.48);
                const oreChunkGeo = (typeof THREE.OctahedronGeometry !== "undefined")
                    ? new THREE.OctahedronGeometry(0.095, 0)
                    : new THREE.BoxGeometry(0.14, 0.14, 0.14);
                const cartOre1 = new THREE.Mesh(oreChunkGeo, oreSilverMat);
                cartOre1.position.set(-0.04, 0.35, 0.46);
                const cartOre2 = new THREE.Mesh(oreChunkGeo, oreSilverMat);
                cartOre2.scale.set(0.85, 0.85, 0.85);
                cartOre2.position.set(0.06, 0.34, 0.52);
                protoStatic.add(cartBody, cartOre1, cartOre2);

                // 2 faceted metallic-silver ore clusters jutting from rock slopes
                [
                    [-0.46, 0.48, -0.06, 0.95, 0.32],
                    [0.32, 0.56, -0.14, 0.88, -0.28]
                ].forEach(([ox, oy, oz, sc, rz]) => {
                    const ore = new THREE.Mesh(oreChunkGeo, oreSilverMat);
                    ore.scale.set(0.85 * sc, 1.20 * sc, 0.85 * sc);
                    ore.rotation.z = rz;
                    ore.position.set(ox, oy, oz);
                    protoStatic.add(ore);
                });
            }

            const mergedProto = this.mergeStaticMeshesByMaterial(protoStatic, new Set(), {
                castShadow: false,
                flatShading: true
            });
            ProceduralModels._resourceNodePrototypes[typeKey] = mergedProto || protoStatic;
        }

        const cachedProto = ProceduralModels._resourceNodePrototypes[typeKey];
        const instanceClone = (cachedProto && typeof cachedProto.clone === "function") ? cachedProto.clone(true) : cachedProto;
        if (instanceClone) group.add(instanceClone);

        // Normalized "Fit-1-Hex" scale (~84% hex width r=1.30/1.55, balanced height ~1.44..1.51, below Ports & Monuments!)
        const scaleByType = {
            food: { x: 1.36, y: 1.36, z: 1.36 },
            wood: { x: 1.36, y: 1.28, z: 1.36 },
            iron: { x: 1.36, y: 1.34, z: 1.36 }
        };
        const sc = scaleByType[typeKey] || scaleByType.food;
        group.scale.set(sc.x, sc.y, sc.z);
        group.userData.baseScale = sc;
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

        // 6. Prominent Harbor Flagpole with Dynamic Owner-Colored Flag (recolored per Charter Owner!)
        const flagPoleMat = mat(0xf8fafc, { emissiveIntensity: 0.25 });
        const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 1.68, 6), flagPoleMat);
        flagPole.position.set(1.06, 1.04, 0.22);
        const flagFinial = new THREE.Mesh(
            new THREE.SphereGeometry(0.075, 6, 6),
            mat(0xfde047, { emissive: 0xf59e0b, emissiveIntensity: 0.75 })
        );
        flagFinial.position.set(1.06, 1.90, 0.22);
        staticGroup.add(flagPole, flagFinial);

        const flagPivot = new THREE.Group();
        flagPivot.position.set(1.06, 1.66, 0.22);
        const ownerFlagMat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            emissive: 0x38bdf8,
            emissiveIntensity: 0.32,
            side: THREE.DoubleSide,
            flatShading: true
        });
        const ownerFlagMesh = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.44, 0.03), ownerFlagMat);
        ownerFlagMesh.position.set(0.39, 0, 0);
        const ownerFlagAccentMat = new THREE.MeshLambertMaterial({
            color: 0x0284c7,
            emissive: 0x38bdf8,
            emissiveIntensity: 0.40,
            side: THREE.DoubleSide,
            flatShading: true
        });
        const ownerFlagAccentMesh = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.14, 0.036), ownerFlagAccentMat);
        ownerFlagAccentMesh.position.set(0.39, 0.15, 0);
        flagPivot.add(ownerFlagMesh, ownerFlagAccentMesh);
        group.add(flagPivot);

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

        // Scale up ~9% in height so Lighthouse & Cranes pop clearly above coastline
        group.scale.set(1.40, 1.62, 1.40);
        group.userData = {
            lantern,
            lhBeamPivot,
            spinY: craneArmGroup,
            flagPivot,
            ownerFlagMesh,
            ownerFlagMat,
            ownerFlagAccentMesh,
            ownerFlagAccentMat,
            baseScale: { x: 1.40, y: 1.62, z: 1.40 }
        };
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
            emissiveIntensity: 0.05,
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

        const shoalTurqMat = mat(0x2dd4bf, { emissive: 0x0d9488, emissiveIntensity: 0.24, transparent: true, opacity: 0.62 });
        const whiteSandMat = mat(0xe6cc8f);
        const rockMat = mat(0x475569);
        const phongBaLeafMat = mat(0x15803d);
        const palmLeafMat = mat(0x22c55e);
        const phongBaTrunkMat = mat(0x6b3e1b);
        const stoneWhiteMat = mat(0xf8fafc);
        const redMat = mat(0xdc2626, { emissive: 0x991b1b, emissiveIntensity: 0.22 });
        const goldMat = mat(0xfacc15, { emissive: 0xca8a04, emissiveIntensity: 0.35 });

        const addPhongBaTree = (tx, ty, tz, sc = 1.0) => {
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * sc, 0.05 * sc, 0.28 * sc, 5), phongBaTrunkMat);
            trunk.position.set(tx, ty + 0.14 * sc, tz);
            trunk.rotation.z = 0.14;
            const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24 * sc, 0), phongBaLeafMat);
            crown.scale.set(1.25, 0.72, 1.15);
            crown.position.set(tx + 0.03 * sc, ty + 0.32 * sc, tz);
            staticGroup.add(trunk, crown);
        };

        const addArchPalm = (tx, ty, tz, sc = 1.0, rotY = 0) => {
            const pGrp = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * sc, 0.042 * sc, 0.50 * sc, 5), phongBaTrunkMat);
            trunk.position.set(0.04 * sc, 0.24 * sc, 0);
            trunk.rotation.z = -0.22;
            pGrp.add(trunk);
            for (let f = 0; f < 5; f++) {
                const frond = new THREE.Mesh(new THREE.ConeGeometry(0.09 * sc, 0.36 * sc, 4), palmLeafMat);
                frond.rotation.z = 1.15;
                frond.rotation.y = (f / 5) * Math.PI * 2;
                frond.position.set(0.09 * sc, 0.48 * sc, 0);
                pGrp.add(frond);
            }
            pGrp.position.set(tx, ty, tz);
            pGrp.rotation.y = rotY;
            staticGroup.add(pGrp);
        };

        // Đảo cát vàng ấm / san hô + viền nước nông xanh ngọc + mỏm đá trầm + cây phong ba & dừa biển
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
                addPhongBaTree(ax, 0.22, az, 0.85 + (idx % 2) * 0.18);
                addArchPalm(ax + 0.22, 0.22, az - 0.16, 0.78, idx * 1.4);
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), rockMat);
                rock.scale.set(1.2, 0.75, 1.0);
                rock.position.set(ax - 0.24, 0.24, az + 0.18);
                staticGroup.add(rock);
            }
        });

        // Cây phong ba & dừa biển trên đảo chính
        addPhongBaTree(0.58, 0.22, -0.34, 1.08);
        addPhongBaTree(-0.62, 0.22, 0.36, 0.94);
        addPhongBaTree(0.46, 0.22, 0.44, 0.88);
        addArchPalm(-0.54, 0.22, -0.44, 0.92, 0.6);
        addArchPalm(0.68, 0.22, 0.06, 0.84, 2.2);

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

        const tex = ProceduralModels.configureSharpCanvasTexture(new THREE.CanvasTexture(canvas), true);
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
        // Dải đất liền & dãy núi biên giới phía Tây & Bắc (~20% dịu hơn 6 vùng Việt Nam, có rừng cây, sườn đá & thung lũng)
        const staticGroup = new THREE.Group();
        const r1 = this.seededRandom(seed + 3);
        const r2 = this.seededRandom(seed + 7);
        const r3 = this.seededRandom(seed + 13);
        const mat = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });

        const cliffMat = mat(0x5d534a);      // Chân đất đá nâu xám
        const turfDarkMat = mat(0x3d5e42);   // Cỏ rừng xanh trầm
        const turfMidMat = mat(0x4b6b4a);    // Cỏ thung lũng xanh dịu
        const rockSlopeMat = mat(0x525e66);  // Sườn đá lộ thiên
        const forestDarkMat = mat(0x264d32); // Rừng thông trầm
        const forestMidMat = mat(0x32613e);  // Rừng tán rộng trầm
        const trunkMat = mat(0x4a3525);

        // 1. Nền đất liền đa tầng (vách nâu xám + mặt cỏ rừng xanh trầm)
        const pads = [
            { x: 0.0,  z: 0.0,  rTop: 3.3, rBot: 4.2, h: 0.42, turf: turfDarkMat },
            { x: -1.8, z: -0.9, rTop: 2.2, rBot: 2.9, h: 0.54, turf: turfMidMat },
            { x: 1.9,  z: 0.8,  rTop: 2.0, rBot: 2.7, h: 0.36, turf: turfDarkMat }
        ];
        pads.forEach(pd => {
            const cliff = new THREE.Mesh(new THREE.CylinderGeometry(pd.rTop, pd.rBot, pd.h, 7), cliffMat);
            cliff.position.set(pd.x, pd.h * 0.45, pd.z);
            const turf = new THREE.Mesh(new THREE.CylinderGeometry(pd.rTop * 0.96, pd.rTop * 1.01, 0.14, 7), pd.turf);
            turf.position.set(pd.x, pd.h * 0.90, pd.z);
            staticGroup.add(cliff, turf);
        });

        // 2. Dãy đồi núi thấp & trung bình nối tiếp nhau có sườn đá lộ thiên và thung lũng xen kẽ
        const peaks = [
            { x: -1.6, z: -0.7, r: 1.65, h: 1.55 + r1 * 0.45, m: turfDarkMat, hasRock: true },
            { x: 0.2,  z: -1.4, r: 1.35, h: 1.20 + r2 * 0.35, m: turfMidMat,  hasRock: true },
            { x: 1.5,  z: 0.5,  r: 1.45, h: 1.05 + r3 * 0.35, m: turfDarkMat, hasRock: false },
            { x: -0.4, z: 1.2,  r: 1.15, h: 0.85 + r1 * 0.25, m: turfMidMat,  hasRock: false },
            { x: -2.4, z: 0.6,  r: 1.10, h: 0.95 + r2 * 0.25, m: turfDarkMat, hasRock: true }
        ];
        peaks.forEach(pk => {
            const body = new THREE.Mesh(new THREE.ConeGeometry(pk.r, pk.h, 6), pk.m);
            body.position.set(pk.x, 0.36 + pk.h * 0.48, pk.z);
            staticGroup.add(body);
            if (pk.hasRock) {
                const rockCap = new THREE.Mesh(new THREE.ConeGeometry(pk.r * 0.42, pk.h * 0.42, 6), rockSlopeMat);
                rockCap.position.set(pk.x, 0.36 + pk.h * 0.78, pk.z);
                staticGroup.add(rockCap);
            }
        });

        // 3. Cụm cây thông & rừng tán rộng low-poly rải thành mảng dọc sườn đồi & chân núi
        const addBorderTree = (tx, ty, tz, sc, isPine) => {
            const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * sc, 0.07 * sc, 0.28 * sc, 5), trunkMat);
            tr.position.set(tx, ty + 0.14 * sc, tz);
            staticGroup.add(tr);
            if (isPine) {
                const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.32 * sc, 0.46 * sc, 5), forestDarkMat);
                c1.position.set(tx, ty + 0.42 * sc, tz);
                const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.22 * sc, 0.38 * sc, 5), forestDarkMat);
                c2.position.set(tx, ty + 0.68 * sc, tz);
                staticGroup.add(c1, c2);
            } else {
                const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 * sc, 0), forestMidMat);
                crown.scale.set(1.18, 0.86, 1.12);
                crown.position.set(tx, ty + 0.42 * sc, tz);
                staticGroup.add(crown);
            }
        };

        const treeSpots = [
            [-0.5, 0.40, 0.1,  1.05, true],
            [0.8,  0.38, -0.3, 0.92, false],
            [1.1,  0.38, 1.4,  0.98, true],
            [2.4,  0.34, 0.1,  0.86, false],
            [-1.3, 0.42, 1.6,  0.94, true],
            [-2.6, 0.46, -0.5, 0.90, true],
            [0.1,  0.40, 1.9,  0.84, false],
            [1.8,  0.36, -1.2, 0.88, true]
        ];
        treeSpots.forEach(([tx, ty, tz, sc, isPine]) => addBorderTree(tx, ty, tz, sc, isPine));

        const merged = this.mergeStaticMeshesByMaterial(staticGroup, new Set(), { castShadow: false, flatShading: true });
        return merged || staticGroup;
    }

    static createOuterCoralIsletCluster(seed = 1) {
        // Đảo nhỏ ngoài khơi giàu sức sống: cát vàng ấm + mỏm đá trầm + 3–4 cây dừa & phong ba xanh mướt
        const staticGroup = new THREE.Group();
        const r1 = this.seededRandom(seed + 5);
        const r2 = this.seededRandom(seed + 11);
        const mat = (col, opts = {}) => new THREE.MeshLambertMaterial({ color: col, flatShading: true, ...opts });

        const shoalMat = mat(0x2dd4bf, { emissive: 0x0d9488, emissiveIntensity: 0.18, transparent: true, opacity: 0.48 });
        const sandMat = mat(0xdcc18a);
        const rockDarkMat = mat(0x475569);
        const rockSlateMat = mat(0x334155);
        const trunkMat = mat(0x6b3e1b);
        const palmLeafMat = mat(0x22c55e);
        const phongBaMat = mat(0x15803d);

        // Bãi cạn xanh ngọc + 2 lớp bãi cát vàng ấm tự nhiên
        const shoal = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.75, 0.05, 10), shoalMat);
        shoal.position.y = 0.02;
        const sandMain = new THREE.Mesh(new THREE.CylinderGeometry(1.58, 1.98, 0.24, 8), sandMat);
        sandMain.position.y = 0.13;
        const sandSpit = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.20, 0.18, 7), sandMat);
        sandSpit.position.set(0.75, 0.10, 0.42);
        staticGroup.add(shoal, sandMain, sandSpit);

        // 3 mỏm đá trầm ven đảo
        const rock1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 0), rockDarkMat);
        rock1.scale.set(1.22, 0.82 + r1 * 0.28, 1.0);
        rock1.position.set(-0.48, 0.42, -0.24);
        const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), rockSlateMat);
        rock2.position.set(0.68, 0.30, -0.34);
        const rock3 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), rockDarkMat);
        rock3.position.set(-0.78, 0.26, 0.38);
        staticGroup.add(rock1, rock2, rock3);

        // Helper: Cây dừa nghiêng ven biển
        const addIsletPalm = (px, pz, sc, rotY) => {
            const pGrp = new THREE.Group();
            const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * sc, 0.05 * sc, 0.62 * sc, 5), trunkMat);
            tr.position.set(0.06 * sc, 0.30 * sc, 0);
            tr.rotation.z = -0.24;
            pGrp.add(tr);
            for (let f = 0; f < 5; f++) {
                const fr = new THREE.Mesh(new THREE.ConeGeometry(0.11 * sc, 0.42 * sc, 4), palmLeafMat);
                fr.rotation.z = 1.14;
                fr.rotation.y = (f / 5) * Math.PI * 2;
                fr.position.set(0.12 * sc, 0.60 * sc, 0);
                pGrp.add(fr);
            }
            pGrp.position.set(px, 0.22, pz);
            pGrp.rotation.y = rotY;
            staticGroup.add(pGrp);
        };

        // Helper: Cây phong ba tán tròn xanh đậm
        const addIsletPhongBa = (px, pz, sc) => {
            const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * sc, 0.06 * sc, 0.30 * sc, 5), trunkMat);
            tr.position.set(px, 0.22 + 0.15 * sc, pz);
            const cr = new THREE.Mesh(new THREE.DodecahedronGeometry(0.30 * sc, 0), phongBaMat);
            cr.scale.set(1.22, 0.78, 1.14);
            cr.position.set(px, 0.22 + 0.38 * sc, pz);
            staticGroup.add(tr, cr);
        };

        // 2 cây dừa nghiêng + 2 cây phong ba tán xanh mướt
        addIsletPalm(0.28, 0.36, 1.05, r1 * 6.28);
        addIsletPalm(-0.18, -0.58, 0.92, r2 * 6.28 + 1.8);
        addIsletPhongBa(0.46, -0.06, 0.96);
        addIsletPhongBa(-0.36, 0.48, 0.84);

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
