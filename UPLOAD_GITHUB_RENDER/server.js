const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 8090;
const ROOT = __dirname;
const ROOMS_DB_FILE = path.join(os.tmpdir(), "tgj_rooms_db_v5.json");
const LIVE_URL_FILE = path.join(ROOT, "..", "LINK_ONLINE_HIEN_TAI.txt");

// Prevent any unexpected socket/network error from crashing the server process
process.on("uncaughtException", (err) => {
    console.error("[UNCAUGHT EXCEPTION - KEPT ALIVE]", err && err.message ? err.message : err);
});
process.on("unhandledRejection", (reason) => {
    console.error("[UNHANDLED REJECTION - KEPT ALIVE]", reason);
});

let currentPublicUrl = "";
let tunnelProc = null;
let tunnelFailCount = 0;

function recordPublicUrl(url) {
    if (!url || url === currentPublicUrl) return;
    currentPublicUrl = url;
    tunnelFailCount = 0;
    console.log(`[CLOUDFLARE ONLINE TUNNEL READY] ${currentPublicUrl}`);
    try {
        const content = [
            "================================================================",
            "  THE GOLDEN JOURNEY (HANH TRINH VANG SON) - LINK CHOI ONLINE",
            "================================================================",
            "",
            `Link Online gửi cho bạn bè: ${currentPublicUrl}`,
            `Link trên máy chủ của bạn : http://localhost:${PORT}`,
            `Cập nhật lúc              : ${new Date().toLocaleString("vi-VN")}`,
            ""
        ].join("\r\n");
        fs.writeFileSync(LIVE_URL_FILE, content, "utf-8");
    } catch (e) {}
}

function startSelfHealingPublicTunnel() {
    // If deployed on Cloud (Render, Railway, Fly.io), no local tunnel needed
    if (process.env.RENDER_EXTERNAL_URL) {
        recordPublicUrl(process.env.RENDER_EXTERNAL_URL);
        return;
    }

    if (tunnelProc) {
        try { tunnelProc.kill(); } catch (e) {}
        tunnelProc = null;
    }

    const localCf = path.join(ROOT, "cloudflared.exe");
    const parentCf = path.join(ROOT, "..", "cloudflared.exe");
    const cloudflaredPath = fs.existsSync(localCf) ? localCf : parentCf;
    const useCloudflared = fs.existsSync(cloudflaredPath);

    try {
        if (useCloudflared) {
            tunnelProc = spawn(cloudflaredPath, [
                "tunnel",
                "--url", `http://localhost:${PORT}`,
                "--no-autoupdate",
                "--protocol", "http2"
            ], { windowsHide: true });

            const parseCfOutput = (chunk) => {
                const text = String(chunk || "");
                const matches = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi);
                if (matches && matches.length > 0) {
                    recordPublicUrl(matches[matches.length - 1]);
                }
            };

            tunnelProc.stdout.on("data", parseCfOutput);
            tunnelProc.stderr.on("data", parseCfOutput);

            tunnelProc.on("close", (code) => {
                console.log(`[ONLINE TUNNEL] cloudflared exited (${code}), reconnecting in 2s...`);
                tunnelProc = null;
                setTimeout(startSelfHealingPublicTunnel, 2000);
            });

            tunnelProc.on("error", (err) => {
                console.error("[ONLINE TUNNEL ERROR]", err.message);
            });
        } else {
            const args = [
                "-o", "StrictHostKeyChecking=no",
                "-o", "ServerAliveInterval=20",
                "-o", "ServerAliveCountMax=3",
                "-o", "ExitOnForwardFailure=yes",
                "-R", `80:localhost:${PORT}`,
                "nokey@localhost.run"
            ];
            tunnelProc = spawn("ssh", args, { windowsHide: true });

            const parseSshOutput = (chunk) => {
                const text = String(chunk || "");
                const matches = text.match(/https:\/\/[a-z0-9-]+\.lhr\.life/gi);
                if (matches && matches.length > 0) {
                    recordPublicUrl(matches[matches.length - 1]);
                }
            };

            tunnelProc.stdout.on("data", parseSshOutput);
            tunnelProc.stderr.on("data", parseSshOutput);

            tunnelProc.on("close", (code) => {
                console.log(`[ONLINE TUNNEL] SSH exited (${code}), reconnecting in 2s...`);
                tunnelProc = null;
                setTimeout(startSelfHealingPublicTunnel, 2000);
            });
        }
    } catch (e) {
        console.error("Failed to spawn public tunnel:", e.message);
    }
}

// Keep-alive ping every 35s to keep the tunnel warm (without killing active cloudflared subdomain)
setInterval(() => {
    if (!currentPublicUrl || process.env.RENDER_EXTERNAL_URL) return;
    try {
        const req = https.get(`${currentPublicUrl}/api/room/list`, { timeout: 8000 }, (res) => {
            res.resume();
        });
        req.on("error", () => {});
        req.on("timeout", () => {
            req.destroy();
        });
    } catch (e) {}
}, 35000);

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml"
};

const rooms = new Map();

function loadRoomsFromDisk() {
    try {
        if (fs.existsSync(ROOMS_DB_FILE)) {
            const raw = fs.readFileSync(ROOMS_DB_FILE, "utf-8");
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                const now = Date.now();
                arr.forEach(r => {
                    if (r && r.code && (now - (r.updatedAt || 0) < 12 * 3600 * 1000)) {
                        rooms.set(r.code, r);
                    }
                });
            }
        }
    } catch (e) {
        console.error("Failed to load rooms_db.json:", e.message);
    }
}

let saveTimer = null;
function saveRoomsToDisk() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            const arr = Array.from(rooms.values());
            await fs.promises.writeFile(ROOMS_DB_FILE, JSON.stringify(arr), "utf-8");
        } catch (e) {
            console.error("Failed to save rooms_db.json:", e.message);
        }
    }, 600);
}

loadRoomsFromDisk();

function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return rooms.has(code) ? generateRoomCode() : code;
}

function normalizeCode(raw) {
    return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

const DEFAULT_ARCHETYPES = [
    { name: "Hải Đội Hồng Hà", vesselTitle: "Chiến Thuyền Lưỡng Long (Đỏ Thẫm)", color: "#ff2424" },
    { name: "Hải Đội Hạ Long", vesselTitle: "Thương Thuyền Ngọc Lục Bảo (Xanh Lá)", color: "#00e676" },
    { name: "Hải Đội Trường Sơn", vesselTitle: "Hải Thuyền Đại Dương (Xanh Lam)", color: "#00b0ff" },
    { name: "Hải Đội Cửu Long", vesselTitle: "Ghe Ngo Hoàng Kim (Vàng Rực)", color: "#ffea00" },
    { name: "Hải Đội Sài Gòn", vesselTitle: "Viễn Dương Hạm Tím Hoàng Gia", color: "#e040fb" }
];

function parseBody(req) {
    return new Promise((resolve) => {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
            try { resolve(JSON.parse(body || "{}")); }
            catch { resolve({}); }
        });
    });
}

function sanitizeRoom(room) {
    if (!room) return null;
    const { password, ...safeRoom } = room;
    return {
        ...safeRoom,
        isPrivate: Boolean(room.isPrivate)
    };
}

function sendJSON(res, status, payload) {
    const out = { ...payload, publicUrl: currentPublicUrl };
    if (out.room) {
        out.room = sanitizeRoom(out.room);
    }
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(JSON.stringify(out));
}

function finalizeRoomTurnOrder(room) {
    if (!room || !room.gameState || !room.gameState.players || !room.openingQuiz || !room.openingQuiz.quiz) return;
    if (room.openingQuiz.completed) return;

    const answers = room.openingAnswers || {};
    const quiz = room.openingQuiz.quiz;
    const correctIdx = quiz.correct;

    // Ensure every player has an answer entry
    room.gameState.players.forEach(p => {
        const key = p.clientId || `seat_${p.seatIndex}`;
        if (!answers[key]) {
            const fallbackChoice = p.isAI
                ? (Math.random() < 0.7 ? correctIdx : (correctIdx + 1) % 4)
                : 0;
            const fallbackTime = p.isAI
                ? Math.floor(3500 + Math.random() * 5200)
                : 19000;
            answers[key] = {
                clientId: key,
                playerName: p.name,
                chosenIdx: fallbackChoice,
                correct: fallbackChoice === correctIdx,
                elapsedMs: fallbackTime
            };
        }
    });

    // Sort players:
    // 1. Correct answers come BEFORE wrong answers
    // 2. Faster response time (smaller elapsedMs) comes FIRST!
    const playersWithStats = room.gameState.players.map(p => {
        const key = p.clientId || `seat_${p.seatIndex}`;
        const ans = answers[key];
        return {
            player: p,
            chosenIdx: ans.chosenIdx,
            correct: Boolean(ans.correct),
            elapsedMs: Number(ans.elapsedMs) || 15000
        };
    });

    playersWithStats.sort((a, b) => {
        if (Boolean(a.player.isAI) !== Boolean(b.player.isAI)) {
            return a.player.isAI ? 1 : -1;
        }
        if (a.correct !== b.correct) {
            return a.correct ? -1 : 1;
        }
        return a.elapsedMs - b.elapsedMs;
    });

    const rankings = [];
    const sortedPlayers = playersWithStats.map((item, newTurnIdx) => {
        const p = item.player;
        if (!p.shipKey) {
            p.shipKey = p.clientId ? `client_${p.clientId}` : `seat_${p.seatIndex ?? newTurnIdx}`;
        }
        p.id = newTurnIdx;
        p.turnRank = newTurnIdx + 1;
        rankings.push({
            rank: newTurnIdx + 1,
            name: p.name,
            vesselTitle: p.vesselTitle,
            color: p.color,
            isAI: p.isAI,
            clientId: p.clientId,
            shipKey: p.shipKey,
            chosenIdx: item.chosenIdx,
            correct: item.correct,
            elapsedMs: item.elapsedMs
        });
        return p;
    });

    room.gameState.players = sortedPlayers;
    room.gameState.activePlayerIdx = 0;
    room.openingQuiz.rankings = rankings;
    room.openingQuiz.completed = true;
}

// ============================================================================
// BOT TAKEOVER & SEAMLESS RECONNECT ENGINE (VÁ 2 — ZERO-STALL PVP!)
// - Tracks per-client `lastSeen` timestamp on status, sync, and market-tx
// - On `/api/room/leave` during "playing" OR > 40s inactivity:
//   + Keeps ship in match, flips player to `isAI = true` with " [Bot]" suffix
//   + Preserves position, cargo, HP, points, originalClientId & originalName
//   + Auto-transfers Host role to earliest remaining real human player
// - On reconnect (F5 or re-entering code with same clientId / name):
//   + Flips `isAI = false`, strips " [Bot]", hands control right back!
// ============================================================================
const DISCONNECT_TAKEOVER_MS = 40 * 1000;

function touchClientActivity(room, clientId) {
    if (!room || !clientId || String(clientId).startsWith("bot_")) return;
    if (!room.clientLastSeen) room.clientLastSeen = {};
    room.clientLastSeen[clientId] = Date.now();
}

function initAllHumanLastSeen(room) {
    if (!room) return;
    const now = Date.now();
    if (!room.clientLastSeen) room.clientLastSeen = {};
    (room.seats || []).forEach(s => {
        if (s.type === "human" && s.clientId && !String(s.clientId).startsWith("bot_")) {
            room.clientLastSeen[s.clientId] = now;
        }
    });
    room.matchStartedAt = now;
}

function pushTakeoverEvent(room, type, text) {
    if (!room) return;
    if (!Array.isArray(room.takeoverEvents)) room.takeoverEvents = [];
    room.takeoverEvents.push({
        id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type,
        text,
        ts: Date.now()
    });
    if (room.takeoverEvents.length > 20) {
        room.takeoverEvents = room.takeoverEvents.slice(-20);
    }
}

function transferHostToEarliestHuman(room) {
    if (!room || !Array.isArray(room.seats)) return null;
    const remainingHumans = room.seats
        .filter(s => s.type === "human" && !s.botTakenOver && s.clientId)
        .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    if (remainingHumans.length === 0) return null;

    room.seats.forEach(s => { s.isHost = false; });
    const newHost = remainingHumans[0];
    newHost.isHost = true;
    newHost.occupiedBy = `${newHost.name} (Chủ Phòng)`;
    room.hostClientId = newHost.clientId;
    room.hostName = newHost.name;
    return newHost;
}

function takeoverPlayerByBot(room, seat, reasonLabel = "mất kết nối") {
    if (!room || !seat || room.status !== "playing") return false;
    if (seat.botTakenOver) return false;

    const oldClientId = seat.originalClientId || seat.clientId;
    const origName = (seat.originalName || seat.name || `Thuyền Trưởng #${seat.seatIndex + 1}`).replace(/\s*\[Bot\]$/i, "");
    const botDisplayName = `${origName} [Bot]`;
    const wasHost = Boolean(seat.isHost);

    seat.originalClientId = oldClientId;
    seat.originalName = origName;
    seat.botTakenOver = true;
    seat.type = "ai";
    seat.name = botDisplayName;
    seat.occupiedBy = `${origName} [Bot]`;
    seat.isHost = false;

    if (room.gameState && Array.isArray(room.gameState.players)) {
        const gp = room.gameState.players.find(
            p => (oldClientId && (p.clientId === oldClientId || p.originalClientId === oldClientId)) || p.seatIndex === seat.seatIndex
        );
        if (gp) {
            gp.originalClientId = gp.originalClientId || oldClientId || gp.clientId;
            gp.originalName = gp.originalName || origName;
            gp.isAI = true;
            gp.botTakenOver = true;
            gp.name = botDisplayName;
        }
    }

    if (wasHost || !room.seats.some(s => s.type === "human" && !s.botTakenOver && s.isHost)) {
        transferHostToEarliestHuman(room);
    }

    pushTakeoverEvent(room, "takeover", `🤖 Tàu Máy (Bot) đã tiếp quản tàu của [${origName}] (${reasonLabel}) — giữ nguyên vị trí, kho hàng & điểm số!`);
    room.version++;
    room.updatedAt = Date.now();
    return true;
}

function restorePlayerFromBot(room, seat, newClientId) {
    if (!room || !seat) return false;
    const wasTakenOver = Boolean(seat.botTakenOver);
    const oldClientId = seat.originalClientId || seat.clientId;
    const origName = (seat.originalName || seat.name || `Thuyền Trưởng #${seat.seatIndex + 1}`).replace(/\s*\[Bot\]$/i, "");

    seat.type = "human";
    seat.botTakenOver = false;
    seat.clientId = newClientId;
    seat.originalClientId = newClientId;
    seat.name = origName;
    seat.originalName = origName;

    const hasActiveHost = room.seats.some(s => s.type === "human" && !s.botTakenOver && s.isHost && s.seatIndex !== seat.seatIndex);
    if (!hasActiveHost) {
        seat.isHost = true;
        room.hostClientId = newClientId;
        room.hostName = origName;
    }
    seat.occupiedBy = seat.isHost ? `${origName} (Chủ Phòng)` : `${origName} (Người chơi)`;

    if (room.gameState && Array.isArray(room.gameState.players)) {
        const gp = room.gameState.players.find(
            p => (oldClientId && (p.clientId === oldClientId || p.originalClientId === oldClientId)) || p.seatIndex === seat.seatIndex
        );
        if (gp) {
            gp.isAI = false;
            gp.botTakenOver = false;
            gp.clientId = newClientId;
            gp.originalClientId = newClientId;
            gp.name = origName;
            gp.originalName = origName;
        }
    }

    touchClientActivity(room, newClientId);
    if (wasTakenOver) {
        pushTakeoverEvent(room, "handover", `👤 Thuyền trưởng [${origName}] đã kết nối lại — Tàu Máy (Bot) đã bàn giao lại quyền điều khiển tàu!`);
    }
    room.version++;
    room.updatedAt = Date.now();
    return true;
}

function enforceTakenOverBotFlagsOnGameState(room) {
    if (!room || room.status !== "playing" || !room.gameState || !Array.isArray(room.gameState.players)) return;
    (room.seats || []).forEach(seat => {
        if (!seat.botTakenOver) return;
        const gp = room.gameState.players.find(
            p => (seat.originalClientId && (p.clientId === seat.originalClientId || p.originalClientId === seat.originalClientId)) || p.seatIndex === seat.seatIndex
        );
        if (gp) {
            const origName = (seat.originalName || gp.originalName || gp.name || "").replace(/\s*\[Bot\]$/i, "");
            gp.originalClientId = gp.originalClientId || seat.originalClientId;
            gp.originalName = gp.originalName || origName;
            gp.isAI = true;
            gp.botTakenOver = true;
            gp.name = `${origName} [Bot]`;
        }
    });
}

function checkDisconnectedPlayersInRoom(room) {
    if (!room || room.status !== "playing" || !Array.isArray(room.seats)) return false;
    const now = Date.now();
    let changed = false;
    room.seats.forEach(seat => {
        if (seat.type !== "human" || seat.botTakenOver || !seat.clientId) return;
        const last = (room.clientLastSeen && room.clientLastSeen[seat.clientId]) || room.matchStartedAt || seat.joinedAt || now;
        if (now - last > DISCONNECT_TAKEOVER_MS) {
            if (takeoverPlayerByBot(room, seat, "mất tín hiệu quá 40 giây")) {
                changed = true;
            }
        }
    });
    if (changed) saveRoomsToDisk();
    return changed;
}

// Background sweep every 5 seconds to catch disconnects promptly even if other clients are slow to poll
setInterval(() => {
    rooms.forEach(room => {
        if (room && room.status === "playing") {
            checkDisconnectedPlayersInRoom(room);
        }
    });
}, 5000);

http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        return sendJSON(res, 200, { ok: true });
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const urlPath = decodeURIComponent(parsedUrl.pathname);

    // 1. CREATE ROOM (Supports roomName, Public/Private & Password, Random Ship Assignment)
    if (urlPath === "/api/room/create" && req.method === "POST") {
        const body = await parseBody(req);
        const code = generateRoomCode();
        const clientId = body.clientId || ("client_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7));
        const hostName = (body.hostName || body.playerName || "Thuyền Trưởng").trim();
        const roomName = (body.roomName || `Phòng của ${hostName}`).trim();
        const isPrivate = Boolean(body.isPrivate);
        const password = isPrivate ? String(body.password || "").trim() : "";

        if (isPrivate && !password) {
            return sendJSON(res, 400, { ok: false, error: "Vui lòng nhập mật khẩu cho phòng Riêng tư (Private)!" });
        }

        const now = Date.now();
        const seats = DEFAULT_ARCHETYPES.map((arch, idx) => ({
            seatIndex: idx,
            name: idx === 0 ? hostName : "Đang chờ người chơi...",
            vesselTitle: "🎲 Thuyền Ngẫu Nhiên Khi Vào Trận",
            color: "#38bdf8",
            type: idx === 0 ? "human" : "empty",
            clientId: idx === 0 ? clientId : null,
            occupiedBy: idx === 0 ? `${hostName} (Chủ Phòng)` : null,
            isHost: idx === 0,
            joinedAt: idx === 0 ? now : null
        }));

        const room = {
            code,
            roomName,
            isPrivate,
            password,
            hostClientId: clientId,
            hostName,
            status: "waiting", // 'waiting' | 'turn_order_quiz' | 'playing'
            seats,
            version: 1,
            openingQuiz: null,
            openingAnswers: {},
            gameState: null,
            clientLastSeen: { [clientId]: now },
            takeoverEvents: [],
            updatedAt: now
        };
        rooms.set(code, room);
        saveRoomsToDisk();
        return sendJSON(res, 200, { ok: true, room, assignedSeat: 0, clientId });
    }

    // 2. JOIN ROOM BY 6-CHAR CODE (With Private Password Check)
    if (urlPath === "/api/room/join" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const clientId = body.clientId || ("client_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7));
        const playerName = (body.playerName || "Thuyền Trưởng").trim();
        const inputPassword = String(body.password || "").trim();

        const room = rooms.get(code);
        if (!room) {
            return sendJSON(res, 404, {
                ok: false,
                roomClosed: true,
                error: `Không tìm thấy phòng [${code || "TRỐNG"}] (hoặc phòng đã đóng)!`
            });
        }

        const existingSeat = room.seats.find(s =>
            (s.clientId && s.clientId === clientId) ||
            (s.originalClientId && s.originalClientId === clientId)
        );
        if (existingSeat) {
            if (existingSeat.botTakenOver) {
                restorePlayerFromBot(room, existingSeat, clientId);
                saveRoomsToDisk();
                return sendJSON(res, 200, { ok: true, room, assignedSeat: existingSeat.seatIndex, clientId, reconnected: true, restoredFromBot: true });
            }
            if (playerName) {
                existingSeat.name = playerName;
                existingSeat.originalName = playerName;
                existingSeat.occupiedBy = existingSeat.isHost ? `${playerName} (Chủ Phòng)` : `${playerName} (Người chơi)`;
                if (existingSeat.isHost) room.hostName = playerName;
            }
            touchClientActivity(room, clientId);
            room.version++;
            room.updatedAt = Date.now();
            saveRoomsToDisk();
            return sendJSON(res, 200, { ok: true, room, assignedSeat: existingSeat.seatIndex, clientId });
        }

        if (room.status !== "waiting") {
            // Allow returning player (F5 or re-entering code with same name/clientId) to seamlessly reclaim their ship from Bot!
            const normName = playerName.toLowerCase();
            const seatByName = room.seats.find(s => {
                const origN = String(s.originalName || s.name || "").replace(/\s*\[Bot\]$/i, "").toLowerCase();
                return (s.type === "human" || s.botTakenOver) && origN && normName && origN === normName;
            }) || room.seats.find(s => s.botTakenOver) || room.seats.find(s => s.type === "human" && !s.isHost);

            if (seatByName) {
                const wasBot = Boolean(seatByName.botTakenOver);
                restorePlayerFromBot(room, seatByName, clientId);
                saveRoomsToDisk();
                return sendJSON(res, 200, { ok: true, room, assignedSeat: seatByName.seatIndex, clientId, reconnected: true, restoredFromBot: wasBot });
            }

            return sendJSON(res, 400, {
                ok: false,
                error: `Phòng [${code}] đã bắt đầu trận đấu rồi!`
            });
        }

        // Enforce password if room is Private
        if (room.isPrivate && room.password) {
            if (!inputPassword) {
                return sendJSON(res, 200, {
                    ok: false,
                    requirePassword: true,
                    code: room.code,
                    roomName: room.roomName,
                    error: `Phòng "${room.roomName}" là phòng Riêng tư (Private). Vui lòng nhập mật khẩu!`
                });
            }
            if (inputPassword !== room.password) {
                return sendJSON(res, 200, {
                    ok: false,
                    requirePassword: true,
                    wrongPassword: true,
                    code: room.code,
                    roomName: room.roomName,
                    error: "Mật khẩu không chính xác! Vui lòng kiểm tra lại."
                });
            }
        }

        const targetSeat = room.seats.find(s => s.type === "empty");
        if (!targetSeat) {
            return sendJSON(res, 400, {
                ok: false,
                error: `Phòng [${code}] hiện đã đầy 5/5 vị trí!`
            });
        }

        targetSeat.type = "human";
        targetSeat.name = playerName || `Thuyền Trưởng #${targetSeat.seatIndex + 1}`;
        targetSeat.originalName = targetSeat.name;
        targetSeat.clientId = clientId;
        targetSeat.originalClientId = clientId;
        targetSeat.occupiedBy = `${targetSeat.name} (Người chơi)`;
        targetSeat.isHost = false;
        targetSeat.joinedAt = Date.now();
        touchClientActivity(room, clientId);

        room.version++;
        room.updatedAt = Date.now();
        saveRoomsToDisk();
        return sendJSON(res, 200, { ok: true, room, assignedSeat: targetSeat.seatIndex, clientId });
    }

    // 3. UPDATE SEAT (Add Bot or Clear Seat)
    if (urlPath === "/api/room/update-seat" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const room = rooms.get(code);
        if (!room) return sendJSON(res, 200, { ok: false, roomClosed: true, error: "Phòng đã đóng!" });

        const seatIdx = Number(body.seatIndex);
        const seat = room.seats[seatIdx];
        if (!seat) return sendJSON(res, 400, { ok: false, error: "Vị trí không hợp lệ!" });

        const action = body.action;
        if (action === "add_bot") {
            const arch = DEFAULT_ARCHETYPES[seatIdx] || DEFAULT_ARCHETYPES[1];
            seat.type = "ai";
            seat.name = `${arch.name} (Tàu Máy)`;
            seat.vesselTitle = "🎲 Thuyền Ngẫu Nhiên Khi Vào Trận";
            seat.clientId = `bot_seat_${seatIdx}`;
            seat.occupiedBy = "Tàu Máy (Bot)";
            seat.isHost = false;
            seat.joinedAt = null;
        } else if (action === "clear_seat" && !seat.isHost) {
            seat.type = "empty";
            seat.name = "Đang chờ người chơi...";
            seat.vesselTitle = "🎲 Thuyền Ngẫu Nhiên Khi Vào Trận";
            seat.clientId = null;
            seat.occupiedBy = null;
            seat.isHost = false;
            seat.joinedAt = null;
        }

        room.version++;
        room.updatedAt = Date.now();
        saveRoomsToDisk();
        return sendJSON(res, 200, { ok: true, room });
    }

    // 4. LEAVE ROOM (During "playing": Bot takes over ship & auto-transfers Host; During "waiting": clears seat)
    if (urlPath === "/api/room/leave" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const clientId = body.clientId;
        const room = rooms.get(code);
        if (room) {
            const seat = room.seats.find(s => s.clientId === clientId || s.originalClientId === clientId);
            if (seat) {
                if (room.status === "playing" && room.gameState) {
                    // Do NOT delete the ship! Convert player to Bot Takeover & transfer Host to earliest remaining real player!
                    takeoverPlayerByBot(room, seat, "rời phòng ngang");
                    saveRoomsToDisk();
                    return sendJSON(res, 200, { ok: true, botTakenOver: true });
                }

                const wasHost = Boolean(seat.isHost);
                seat.type = "empty";
                seat.name = "Đang chờ người chơi...";
                seat.vesselTitle = "🎲 Thuyền Ngẫu Nhiên Khi Vào Trận";
                seat.clientId = null;
                seat.originalClientId = null;
                seat.originalName = null;
                seat.botTakenOver = false;
                seat.occupiedBy = null;
                seat.isHost = false;
                seat.joinedAt = null;

                // Check remaining human players in the room
                const remainingHumans = room.seats
                    .filter(s => s.type === "human" && s.clientId)
                    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

                if (remainingHumans.length === 0) {
                    // All human players have left -> Automatically close/delete the room!
                    rooms.delete(code);
                    saveRoomsToDisk();
                    return sendJSON(res, 200, { ok: true, roomClosed: true });
                }

                // If the host left, transfer Host role to the person who joined earliest after the host!
                if (wasHost || !room.seats.some(s => s.isHost)) {
                    transferHostToEarliestHuman(room);
                }

                room.version++;
                room.updatedAt = Date.now();
                saveRoomsToDisk();
            }
        }
        return sendJSON(res, 200, { ok: true });
    }

    // 4B. CLOSE ROOM (Host explicitly closes the entire room)
    if (urlPath === "/api/room/close" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const room = rooms.get(code);
        if (room) {
            rooms.delete(code);
            saveRoomsToDisk();
        }
        return sendJSON(res, 200, { ok: true, roomClosed: true });
    }

    // 5. LIST ACTIVE WAITING ROOMS
    if (urlPath === "/api/room/list" && req.method === "GET") {
        const now = Date.now();
        const waitingRooms = [];
        rooms.forEach((r) => {
            const hasHuman = r.seats && r.seats.some(s => s.type === "human");
            if (!hasHuman) {
                rooms.delete(r.code);
                return;
            }
            if (now - (r.updatedAt || 0) < 2 * 3600 * 1000 && r.status === "waiting") {
                const activeCount = r.seats.filter(s => s.type === "human" || s.type === "ai").length;
                const emptyCount = r.seats.filter(s => s.type === "empty").length;
                const hostSeat = r.seats.find(s => s.isHost) || r.seats.find(s => s.type === "human");
                waitingRooms.push({
                    code: r.code,
                    roomName: r.roomName || `Phòng của ${r.hostName}`,
                    isPrivate: Boolean(r.isPrivate),
                    hostName: hostSeat ? hostSeat.name : r.hostName,
                    activeCount,
                    emptyCount,
                    updatedAt: r.updatedAt
                });
            }
        });
        waitingRooms.sort((a, b) => b.updatedAt - a.updatedAt);
        return sendJSON(res, 200, { ok: true, rooms: waitingRooms.slice(0, 12) });
    }

    // 6. START ROOM -> LAUNCHES PHASE 0: OPENING TURN-ORDER SPEED QUIZ FOR ALL PLAYERS!
    if (urlPath === "/api/room/start" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const room = rooms.get(code);
        if (!room) return sendJSON(res, 200, { ok: false, roomClosed: true, error: "Phòng đã đóng!" });

        const activeSeats = room.seats.filter(s => s.type === "human" || s.type === "ai");
        if (activeSeats.length < 1) {
            return sendJSON(res, 400, {
                ok: false,
                error: "Cần tối thiểu 1 người chơi trong phòng để bắt đầu ván đấu!"
            });
        }

        const quizObj = (body.openingQuiz && body.openingQuiz.quiz) ? body.openingQuiz.quiz : body.openingQuiz;

        if (body.skipOpeningQuiz || activeSeats.length === 1) {
            room.status = "playing";
            room.gameState = body.gameState || null;
            room.openingQuiz = null;
            room.openingAnswers = {};
            initAllHumanLastSeen(room);
            room.version++;
            room.updatedAt = Date.now();
            saveRoomsToDisk();
            return sendJSON(res, 200, { ok: true, room });
        }

        room.status = "turn_order_quiz";
        room.gameState = body.gameState || null;
        initAllHumanLastSeen(room);
        const nowMs = Date.now();
        room.openingQuiz = {
            quiz: quizObj,
            countdownEndsAt: nowMs + 10000,
            startedAt: nowMs + 10000,
            completed: false,
            rankings: []
        };
        room.openingAnswers = {};

        // Pre-populate simulated Bot AI response times so Bots also compete fairly in the turn-order race
        if (room.gameState && Array.isArray(room.gameState.players) && quizObj) {
            const correctIdx = quizObj.correct;
            room.gameState.players.forEach(p => {
                if (p.isAI) {
                    const key = p.clientId || `seat_${p.seatIndex}`;
                    const botIsCorrect = Math.random() < 0.72;
                    const botChoice = botIsCorrect ? correctIdx : ((correctIdx + 1 + Math.floor(Math.random() * 3)) % 4);
                    const botTimeMs = Math.floor(3400 + Math.random() * 5200);
                    room.openingAnswers[key] = {
                        clientId: key,
                        playerName: p.name,
                        chosenIdx: botChoice,
                        correct: botIsCorrect,
                        elapsedMs: botTimeMs
                    };
                }
            });
        }

        room.version++;
        room.updatedAt = Date.now();
        saveRoomsToDisk();
        return sendJSON(res, 200, { ok: true, room });
    }

    // 7. SUBMIT ANSWER TO OPENING TURN-ORDER SPEED QUIZ
    if (urlPath === "/api/room/opening-answer" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const room = rooms.get(code);
        if (!room) return sendJSON(res, 404, { ok: false, error: "Room not found" });

        const clientId = body.clientId || `seat_${body.seatIndex}`;
        const chosenIdx = Number(body.chosenIdx);
        const elapsedMs = Math.max(100, Number(body.elapsedMs) || 5000);
        const quizObj = room.openingQuiz ? room.openingQuiz.quiz : null;

        if (clientId && quizObj && !room.openingAnswers[clientId]) {
            const p = (room.gameState && room.gameState.players)
                ? room.gameState.players.find(pl => pl.clientId === clientId || pl.seatIndex === body.seatIndex)
                : null;
            const key = (p && p.clientId) ? p.clientId : clientId;
            room.openingAnswers[key] = {
                clientId: key,
                playerName: p ? p.name : "Thuyền Trưởng",
                chosenIdx,
                correct: chosenIdx === quizObj.correct,
                elapsedMs
            };

            // Build partial rankings so early finishers immediately see their speed entry
            const partialList = Object.values(room.openingAnswers).map((ans) => {
                const pl = (room.gameState && room.gameState.players)
                    ? room.gameState.players.find(x => x.clientId === ans.clientId)
                    : null;
                return {
                    name: ans.playerName,
                    color: pl ? pl.color : "#c59b27",
                    isAI: pl ? pl.isAI : false,
                    correct: ans.correct,
                    elapsedMs: ans.elapsedMs
                };
            });
            partialList.sort((a, b) => {
                if (a.correct !== b.correct) return a.correct ? -1 : 1;
                return a.elapsedMs - b.elapsedMs;
            });
            room.openingQuiz.rankings = partialList.map((item, i) => ({ ...item, rank: i + 1 }));
        }

        // Check if all human players have answered
        const humanPlayers = (room.gameState && room.gameState.players)
            ? room.gameState.players.filter(pl => !pl.isAI)
            : [];
        const allHumansAnswered = humanPlayers.every(pl => {
            const key = pl.clientId || `seat_${pl.seatIndex}`;
            return Boolean(room.openingAnswers[key]);
        });

        if (allHumansAnswered || body.forceFinalize) {
            finalizeRoomTurnOrder(room);
        }

        room.version++;
        room.updatedAt = Date.now();
        saveRoomsToDisk();
        return sendJSON(res, 200, { ok: true, room });
    }

    // 8. BEGIN ACTUAL BOARD PLAY AFTER TURN-ORDER QUIZ LEADERBOARD
    if (urlPath === "/api/room/begin-play" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const room = rooms.get(code);
        if (!room) return sendJSON(res, 404, { ok: false, error: "Room not found" });

        if (room.openingQuiz && !room.openingQuiz.completed) {
            finalizeRoomTurnOrder(room);
        }
        room.status = "playing";
        initAllHumanLastSeen(room);
        if (body.gameState) {
            room.gameState = body.gameState;
        }
        room.version++;
        room.updatedAt = Date.now();
        saveRoomsToDisk();
        return sendJSON(res, 200, { ok: true, room });
    }

    // 9. SYNC LIVE GAME STATE (Records lastSeen & preserves Bot Takeover flags!)
    if (urlPath === "/api/room/sync" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const room = rooms.get(code);
        if (!room) return sendJSON(res, 404, { ok: false, error: "Room not found" });

        if (body.clientId) touchClientActivity(room, body.clientId);
        if (body.gameState) {
            room.gameState = body.gameState;
            enforceTakenOverBotFlagsOnGameState(room);
            checkDisconnectedPlayersInRoom(room);
            room.version++;
            room.updatedAt = Date.now();
            saveRoomsToDisk();
        }
        return sendJSON(res, 200, { ok: true, version: room.version });
    }

    // 9B. ANY-TURN P2P MARKET TRANSACTION (0 AP, WORKS ON ANY PLAYER'S TURN)
    if (urlPath === "/api/room/market-tx" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const room = rooms.get(code);
        if (!room || !room.gameState) return sendJSON(res, 404, { ok: false, error: "Room or gameState not found" });

        if (body.clientId) touchClientActivity(room, body.clientId);

        if (Array.isArray(body.marketListings)) {
            room.gameState.marketListings = body.marketListings;
        }
        if (Array.isArray(body.buyOrders)) {
            room.gameState.buyOrders = body.buyOrders;
        }
        if (Array.isArray(body.barterOrders)) {
            room.gameState.barterOrders = body.barterOrders;
        }
        if (Array.isArray(body.tradeBulletinNotices)) {
            room.gameState.tradeBulletinNotices = body.tradeBulletinNotices;
        }
        if (body.portResourceStock && typeof body.portResourceStock === "object") {
            room.gameState.portResourceStock = body.portResourceStock;
        }
        if (typeof body.portResResetRemainingSec === "number") {
            room.gameState.portResResetRemainingSec = body.portResResetRemainingSec;
        }
        if (body.matchStats && typeof body.matchStats === "object") {
            const curStats = room.gameState.matchStats || { portTrades: {}, portVisits: {}, totalP2P: 0, disasterDamage: 0, stormReefDamage: 0 };
            room.gameState.matchStats = {
                ...curStats,
                ...body.matchStats,
                totalP2P: Math.max(curStats.totalP2P || 0, body.matchStats.totalP2P || 0)
            };
        }
        const incomingPlayers = Array.isArray(body.updatedPlayers)
            ? body.updatedPlayers
            : (Array.isArray(body.players) ? body.players : null);
        if (incomingPlayers && Array.isArray(room.gameState.players)) {
            incomingPlayers.forEach(up => {
                const target = room.gameState.players.find(p =>
                    (up.shipKey && p.shipKey === up.shipKey) ||
                    (up.clientId && p.clientId === up.clientId) ||
                    p.id === up.id
                );
                if (target) {
                    if (typeof up.coins === "number") target.coins = Math.min(30, Math.max(0, up.coins));
                    if (typeof up.food === "number") target.food = up.food;
                    if (typeof up.wood === "number") target.wood = up.wood;
                    if (typeof up.iron === "number") target.iron = up.iron;
                    if (typeof up.maxCargo === "number") target.maxCargo = Math.max(target.maxCargo || 12, up.maxCargo);
                    if (up.charterRegionId !== undefined) target.charterRegionId = up.charterRegionId;
                    if (Array.isArray(up.specialties)) target.specialties = up.specialties;
                    // Sync P2P stats, Secret Quest progress & Prosperity Points so off-turn trades never lose progress!
                    if (typeof up.p2pTrades === "number") target.p2pTrades = Math.max(target.p2pTrades || 0, up.p2pTrades);
                    if (typeof up.p2pCount === "number") target.p2pCount = Math.max(target.p2pCount || 0, up.p2pCount);
                    if (typeof up.tradeCount === "number") target.tradeCount = Math.max(target.tradeCount || 0, up.tradeCount);
                    if (up.stats && typeof up.stats === "object") target.stats = { ...(target.stats || {}), ...up.stats };
                    if (Array.isArray(up.secretQuests)) target.secretQuests = up.secretQuests;
                    if (typeof up.secretPoints === "number") target.secretPoints = Math.max(target.secretPoints || 0, up.secretPoints);
                    if (typeof up.prosperityPoints === "number") target.prosperityPoints = Math.max(target.prosperityPoints || 0, up.prosperityPoints);
                    if (typeof up.publicPoints === "number") target.publicPoints = Math.max(target.publicPoints || 0, up.publicPoints);
                }
            });
        }
        room.version++;
        room.updatedAt = Date.now();
        saveRoomsToDisk();
        return sendJSON(res, 200, { ok: true, version: room.version, gameState: room.gameState });
    }

    // 9C. RETURN ROOM TO WAITING LOBBY AFTER VICTORY CELEBRATION (15S)
    if (urlPath === "/api/room/return-to-lobby" && req.method === "POST") {
        const body = await parseBody(req);
        const code = normalizeCode(body.code);
        const room = rooms.get(code);
        if (!room) return sendJSON(res, 200, { ok: false, roomClosed: true });

        room.status = "waiting";
        room.gameState = null;
        room.openingQuiz = null;
        room.openingAnswers = {};
        room.version++;
        room.updatedAt = Date.now();
        saveRoomsToDisk();
        return sendJSON(res, 200, { ok: true, room });
    }

    // 10. POLL ROOM STATUS (WITH LIGHTWEIGHT VERSION DELTA CHECK + HEARTBEAT & 40S DISCONNECT WATCHDOG)
    if (urlPath === "/api/room/status" && req.method === "GET") {
        const code = normalizeCode(parsedUrl.searchParams.get("code"));
        const clientVersion = Number(parsedUrl.searchParams.get("v") || 0);
        const clientId = parsedUrl.searchParams.get("clientId") || "";
        const room = rooms.get(code);
        if (!room) return sendJSON(res, 200, { ok: false, roomClosed: true, error: "Phòng đã đóng!" });
        if (clientId) touchClientActivity(room, clientId);
        if (room.status === "playing") {
            checkDisconnectedPlayersInRoom(room);
        }
        if (clientVersion > 0 && clientVersion === room.version) {
            return sendJSON(res, 200, { ok: true, unchanged: true, version: room.version });
        }
        return sendJSON(res, 200, { ok: true, room });
    }

    // STATIC FILES (Supports standard subfolders AND flat root upload on GitHub/Render)
    let staticPath = urlPath === "/" ? "/index.html" : urlPath;
    let filePath = path.join(ROOT, staticPath);

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end("Forbidden");
    }

    if (!fs.existsSync(filePath)) {
        const baseName = path.basename(staticPath);
        const flatCandidate = path.join(ROOT, baseName);
        const monCandidate = path.join(ROOT, "monuments", baseName);
        const assetsMonCandidate = path.join(ROOT, "assets", "monuments", baseName);
        if (fs.existsSync(flatCandidate)) {
            filePath = flatCandidate;
        } else if (fs.existsSync(monCandidate)) {
            filePath = monCandidate;
        } else if (fs.existsSync(assetsMonCandidate)) {
            filePath = assetsMonCandidate;
        }
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end("Not found");
        }
        const ext = path.extname(filePath).toLowerCase();
        const isImage = ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".svg";
        res.writeHead(200, {
            "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
            "Cache-Control": isImage ? "public, max-age=3600" : "no-cache"
        });
        res.end(data);
    });
}).listen(PORT, () => {
    console.log(`The Golden Journey V3.3 Server running at http://localhost:${PORT}`);
    startSelfHealingPublicTunnel();
});
