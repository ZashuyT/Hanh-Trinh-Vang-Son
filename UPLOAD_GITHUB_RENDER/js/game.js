// ============================================================================
// THE GOLDEN JOURNEY (HÀNH TRÌNH VÀNG SON) — V3.2 SHARED-MAP MULTIPLAYER ENGINE
// - Removed Tidal & River Estuary mechanics for cleaner, pure coastal navigation
// - True Shared-Map Multiplayer: 1 Ship per Player on 1 Synchronized 3D Board
// - Opening Speed Quiz (Đầu trận câu hỏi xếp thứ tự lượt chơi theo tốc độ trả lời + Ảnh minh họa)
// - Auto-End Turn when AP reaches 0 (or manual End Turn button)
// - Free Spectator Camera during other players' turns + Live Shared Quiz Broadcast
//   (All players see quizzes & Visual Memory Cards live; only active player can click A/B/C/D)
// ============================================================================

class GoldenJourneyGame {
    constructor() {
        this.players = [];
        this.activePlayerIdx = 0;
        this.roundNumber = 1;
        this.monumentAssignments = {};
        this.isBusy = false;
        this.isGameStarted = false;

        // Unique client ID per browser tab so multiple tabs or devices never collide
        this.clientId = sessionStorage.getItem("golden_journey_client_id");
        if (!this.clientId) {
            this.clientId = "cj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            sessionStorage.setItem("golden_journey_client_id", this.clientId);
        }

        // Rare Golden/Silver Axe NPC Spawner state (Spawns every 4-5 rounds!)
        this.nextNPCSpawnRound = 4;

        // Shared Maritime Market Floor (Anonymous Sell/Buy Orders + Public 0-Xu Barter) & 6 Port Inventories
        this.marketListings = [];
        this.buyOrders = [];
        this.barterOrders = [];
        this.nextListingId = 1;
        this.tradeBulletinNotices = [];
        this.portInventories = {};
        this.portResetIntervalSec = 510; // 8 minutes 30 seconds = 510s (Key rotation)
        this.portResetRemainingSec = 510;
        this.portResourceStock = {};
        this.portResResetIntervalSec = 300; // 5 minutes = 300s (Independent limited raw resource stock)
        this.portResResetRemainingSec = 300;
        this.selectedMarketPortFilter = "all";

        // 45-Minute In-Game Clock & Automatic Phased Weather Engine
        this.matchElapsedSec = 0;
        this.earlyLockReleased = Boolean(this.sandboxMode);
        this.exhaustedTiersNotified = new Set();
        this.blockedMineIds = [];
        this.finalFiveMinNotified = false;
        this.sprint12NotifiedIds = new Set();
        this.sandboxAllowTimeout = false;
        // Mục 4D: Chống AFK 50s (45s + 5s cảnh báo), Đóng băng đồng hồ 45:00 & Tự chuyển lượt 5s khi 0 AP
        this.lastInteractionAt = Date.now();
        this.lastGameplayActionAt = Date.now();
        this.isMatchClockFrozen = false;
        this.afkWarningRemainingSec = null;
        this.afkAutoNoticeShown = false;
        this.afkAutoNoticeShownAt = 0;
        this.hideAfkAutoNotice();
        this.zeroApCountdownSec = null;
        this.zeroApCountdownInterval = null;
        this.currentWeatherPhase = "sunny";
        this.weatherClockInterval = null;
        this.thunderstormChallengeTriggered = false;
        this.stormReadingTimerInterval = null;
        this.activePendingQuiz = null;
        this.activeQuizTimerInterval = null;
        this.exhaustedTiersNotified = new Set();
        this.tickerCollapsed = false;

        // Manual Custom Drag-Path State (Double-click + Hold-drag to steer around Reefs)
        this.lockedMovePath = null;
        if (this.world) this.world.isPathLocked = false;
        this.customDrawnPath = [];
        this.selectedRuleCategory = "overview";

        // Live Shared Quiz Broadcast state (synced to all players in room)
        this.liveQuizState = null;
        this.showingSpectatorQuizId = null;
        this.spectatorClosedAskingQuizId = null;
        this.spectatorHiddenAnsweredQuizId = null;
        this.lastSpectatorQuizSnapshot = null;
        this.quizAutoCloseInterval = null;

        // Hover Tooltip 0.5s Delay State (Only for POIs: Monument, Port, Resource, Rare NPC)
        this.hoverTooltipTimer = null;
        this.hoveredPOITileKey = null;
        this.lastHoverMouseX = 0;
        this.lastHoverMouseY = 0;

        // Sandbox / Creative Mode State (Minecraft-style creative controls)
        this.sandboxMode = false;
        this.sandboxInfiniteMove = false;
        this.sandboxTeleport = false;

        // Match Victory state (synced to all players + 15s auto-return to room lobby)
        this.matchWinner = null;
        this.victoryShownForMatch = false;
        this.victoryCountdownInterval = null;

        // Opening Turn-Order Speed Quiz state + 10s Pre-Game Countdown
        this.openingQuizState = null;
        this.openingQuizStartMs = 0;
        this.openingTimerInterval = null;
        this.preGameCountdownInterval = null;
        this.isPreGameCountingDown = false;
        this.hasSubmittedOpeningAnswer = false;
        this.localOpeningChoice = null;
        this.localOpeningElapsedMs = 0;

        // Auto-end turn timer guard
        this.autoEndTurnTimer = null;

        // Multiplayer Room & Waiting Screen State
        this.lobbySubView = "welcome"; // 'welcome' | 'browse'
        this.createRoomIsPrivate = false;
        this.roomState = {
            code: null,
            roomName: "",
            isPrivate: false,
            isHost: false,
            localPlayerName: localStorage.getItem("golden_player_name") || "Thuyền Trưởng",
            localSeatIdx: 0,
            status: "waiting", // 'waiting' | 'turn_order_quiz' | 'playing'
            seats: this.createEmptyLobbySeats(),
            version: 0
        };
        this.openRoomsList = [];
        this.roomPollTimer = null;
        this.openRoomsPollTimer = null;
        this.cleanUIMode = false;

        // Real-Time Room Chat State (Lobby + In-Match SSE + Sandbox Local)
        this.roomChatMessages = [];
        this.roomChatSeenIds = new Set();
        this.roomChatUnreadCount = 0;
        this.isInMatchChatOpen = false;
        this.chatEventSource = null;
        this.chatStreamRoomCode = null;
        this.lastChatSentAt = 0;
        this.chatConsecutiveCount = 0;
        this.chatSpamCooldownUntil = 0;
        this.chatSpamTimer = null;

        // Cross-tab instant synchronization channel
        try {
            this.roomChannel = new BroadcastChannel("golden_journey_v3_room");
            this.roomChannel.onmessage = (ev) => this.handleRoomBroadcast(ev.data);
        } catch (e) {
            this.roomChannel = null;
        }

        this.monumentAssignments = this.randomizeMonumentTiers();
        this.resetAllPortInventories(false);
        this.resetAllPortResourceStocks(false);

        // Initialize 3D Ocean & Board Vista in the background
        try {
            this.world = new World3D(
                "canvas-container",
                (tile) => this.handleHexClick(tile),
                (tile, x, y) => this.handleHexHover(tile, x, y)
            );
            this.world.onCustomPathStart = (tile) => this.startCustomPathDrag(tile);
            this.world.onCustomPathStep = (tile) => this.stepCustomPathDrag(tile);
            this.world.onCustomPathCommit = () => this.commitCustomPathDrag();
            this.world.getPathPreviewMeta = (pathTiles, isCustomDrawn) => this.buildPathPreviewMeta(pathTiles, isCustomDrawn);
            this.world.onCancelLockedPath = () => this.cancelLockedMovePath(true);
            this.lockedMovePath = null;
            this.world.buildBoard(this.monumentAssignments);
            this.world.startRenderLoop();
        } catch (err) {
            console.error("World3D initialization error:", err);
        }

        this.bindUIEvents();

        // Check if URL has ?room=XXXXXX invite parameter or active session room on reload (F5)
        const params = new URLSearchParams(window.location.search);
        const urlRoomCode = (params.get("room") || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        const sessionRoomCode = (sessionStorage.getItem("golden_active_room_code") || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        this.prefilledRoomCode = urlRoomCode || sessionRoomCode || "";

        // Show Main Menu Lobby Screen (Liên Quân / Free Fire style) by default!
        this.showMainMenuScreen();

        // If player reloaded (F5) while inside an active room, automatically reconnect them!
        if (sessionRoomCode && sessionRoomCode.length >= 4) {
            setTimeout(() => {
                this.joinMultiplayerRoomByCode(sessionRoomCode);
            }, 250);
        } else if (urlRoomCode && urlRoomCode.length >= 4) {
            setTimeout(() => {
                this.openPvpLobbyFromMainMenu();
            }, 200);
        }
    }

    createEmptyLobbySeats() {
        return window.GAME_DATA.shipArchetypes.map((arch, idx) => ({
            seatIndex: idx,
            name: idx === 0 ? "Thuyền Trưởng Hồng Hà" : "Đang chờ người chơi...",
            vesselTitle: arch.vesselTitle,
            color: arch.color,
            type: idx === 0 ? "human" : "empty", // Slot 1 = Host, Slots 2-5 = Empty!
            clientId: idx === 0 ? this.clientId : null,
            occupiedBy: idx === 0 ? "Chủ Phòng" : null,
            isHost: idx === 0
        }));
    }

    // ========================================================================
    // TURN OWNERSHIP & PLAYER IDENTITY HELPERS (SHARED MAP MULTIPLAYER)
    // ========================================================================
    getLocalPlayer() {
        if (!this.players || this.players.length === 0) return null;
        const myClientKey = `client_${this.clientId}`;
        const byShipKey = this.players.find(p => p.shipKey && p.shipKey === myClientKey);
        if (byShipKey) return byShipKey;
        const byClient = this.players.find(p => p.clientId && p.clientId === this.clientId);
        if (byClient) return byClient;
        if (this.roomState.code) {
            const bySeat = this.players.find(p => p.seatIndex === this.roomState.localSeatIdx);
            if (bySeat) return bySeat;
        }
        return this.players.find(p => !p.isAI) || this.players[0];
    }

    isMyTurn() {
        if (!this.isGameStarted) return false;
        if (this.roomState.code && this.roomState.status !== "playing") return false;
        const active = this.getActivePlayer();
        if (!active || active.isAI || active.eliminated) return false;
        if (!this.roomState.code) {
            // Offline / Solo Sandbox mode: local player controls human turns
            return true;
        }
        const localP = this.getLocalPlayer();
        if (localP) {
            return World3D.getPlayerShipKey(active) === World3D.getPlayerShipKey(localP);
        }
        return active.clientId === this.clientId || active.seatIndex === this.roomState.localSeatIdx;
    }

    isModalOpen() {
        const overlay = document.getElementById("modal-overlay");
        return overlay && !overlay.classList.contains("hidden");
    }

    // ========================================================================
    // MAIN MENU LOBBY SCREEN (#main-menu-screen) & UNIFIED EXIT FLOW
    // ========================================================================
    syncMainMenuUI() {
        const nameEl = document.getElementById("mm-captain-name");
        if (nameEl) {
            nameEl.textContent = this.roomState.localPlayerName || "Thuyền Trưởng";
        }
        const gfxBtn = document.getElementById("btn-mm-graphics");
        if (gfxBtn && this.world) {
            gfxBtn.textContent = this.world.graphicsQuality === "smooth"
                ? "⚡ Đồ họa: Siêu Mượt"
                : "✨ Đồ họa: Đẹp (Tối ưu)";
        }
        const audioBtn = document.getElementById("btn-mm-audio");
        if (audioBtn && window.SFX) {
            audioBtn.textContent = window.SFX.muted ? "🔇 Âm Thanh: Tắt" : "🔊 Âm Thanh: Bật";
        }
    }

    showMainMenuScreen() {
        this.isGameStarted = false;
        this.isInMatchLobbyOverlayOpen = false;
        clearInterval(this.openRoomsPollTimer);
        const menuEl = document.getElementById("main-menu-screen");
        if (menuEl) menuEl.classList.remove("hidden");
        const waitOverlay = document.getElementById("waiting-screen-overlay");
        if (waitOverlay) {
            waitOverlay.classList.add("hidden");
            waitOverlay.classList.remove("in-match-overlay");
        }
        const topHud = document.getElementById("top-hud-bar");
        if (topHud) topHud.classList.add("hidden-hud");
        const leftHud = document.getElementById("left-hud-panel");
        if (leftHud) leftHud.classList.add("hidden-hud");
        const rightHud = document.getElementById("right-hud-panel");
        if (rightHud) rightHud.classList.add("hidden-hud");
        const tickerWrap = document.getElementById("bottom-live-ticker-wrap");
        if (tickerWrap) tickerWrap.classList.add("hidden-hud");
        const yagiBanner = document.getElementById("yagi-red-alert-banner");
        if (yagiBanner) yagiBanner.classList.add("hidden");
        const sbPanel = document.getElementById("sandbox-creative-panel");
        if (sbPanel) sbPanel.classList.add("hidden");
        const reopenBtn = document.getElementById("reopen-quiz-btn");
        if (reopenBtn) reopenBtn.classList.add("hidden");
        const pregameBanner = document.getElementById("pregame-countdown-banner");
        if (pregameBanner) pregameBanner.classList.add("hidden");
        const tooltip = document.getElementById("hex-tooltip");
        if (tooltip) tooltip.classList.add("hidden");
        const pop = document.getElementById("mm-settings-popover");
        if (pop) pop.classList.add("hidden");

        this.hideAfkWarningBanner();
        this.hideAfkAutoNotice();
        this.syncMainMenuUI();
        this.checkMainMenuServerStatus();
        if (this.world && typeof this.world.setMenuOrbitMode === "function") {
            this.world.setMenuOrbitMode(true);
        }
    }

    async checkMainMenuServerStatus(attempt = 0) {
        const statusEl = document.getElementById("mm-server-status");
        if (!statusEl || typeof fetch !== "function") return;
        clearTimeout(this._mmStatusRetryTimer);
        if (attempt === 0) {
            statusEl.classList.remove("is-offline");
            statusEl.classList.add("is-connecting");
            statusEl.innerHTML = `<span class="mm-online-dot"></span> Đang kết nối...`;
        }
        try {
            const resp = await fetch("/api/room/list", { method: "GET", cache: "no-store" });
            if (resp && resp.ok) {
                statusEl.classList.remove("is-connecting", "is-offline");
                statusEl.innerHTML = `<span class="mm-online-dot"></span> Trực tuyến`;
                return;
            }
        } catch (e) {}
        if (attempt < 2) {
            this._mmStatusRetryTimer = setTimeout(() => {
                if (!this.isGameStarted) this.checkMainMenuServerStatus(attempt + 1);
            }, 1800);
            return;
        }
        statusEl.classList.remove("is-connecting");
        statusEl.classList.add("is-offline");
        statusEl.innerHTML = `<span class="mm-online-dot"></span> Ngoại tuyến`;
    }

    hideMainMenuScreen() {
        const menuEl = document.getElementById("main-menu-screen");
        if (menuEl) menuEl.classList.add("hidden");
        const pop = document.getElementById("mm-settings-popover");
        if (pop) pop.classList.add("hidden");
    }

    startMainMenuNameEdit() {
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        const disp = document.getElementById("mm-name-display-row");
        const edit = document.getElementById("mm-name-edit-row");
        const inp = document.getElementById("mm-captain-name-input");
        if (disp) disp.classList.add("hidden");
        if (edit) edit.classList.remove("hidden");
        if (inp) {
            inp.value = this.roomState.localPlayerName || "Thuyền Trưởng";
            inp.focus();
            inp.select();
        }
    }

    saveMainMenuNameEdit() {
        const disp = document.getElementById("mm-name-display-row");
        const edit = document.getElementById("mm-name-edit-row");
        const inp = document.getElementById("mm-captain-name-input");
        if (inp) {
            const clean = inp.value.trim();
            if (clean) {
                this.updateLocalPlayerName(clean);
            }
        }
        if (edit) edit.classList.add("hidden");
        if (disp) disp.classList.remove("hidden");
        this.syncMainMenuUI();
        window.SFX && window.SFX.playClick && window.SFX.playClick();
    }

    toggleMainMenuSettings(ev) {
        if (ev) ev.stopPropagation();
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        const pop = document.getElementById("mm-settings-popover");
        if (pop) {
            pop.classList.toggle("hidden");
            this.syncMainMenuUI();
        }
    }

    toggleMainMenuGraphics() {
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        if (this.world && typeof this.world.toggleGraphicsQuality === "function") {
            const mode = this.world.toggleGraphicsQuality();
            const hudGfxBtn = document.getElementById("btn-graphics-quality");
            if (hudGfxBtn) {
                hudGfxBtn.textContent = mode === "smooth" ? "⚡ Siêu Mượt" : "✨ Đẹp (Tối ưu)";
            }
            this.syncMainMenuUI();
            this.showToast(mode === "smooth"
                ? "⚡ Đã chuyển đồ họa: Siêu Mượt (Tối ưu FPS)"
                : "✨ Đã chuyển đồ họa: Đẹp (Tối ưu)");
        }
    }

    toggleMainMenuAudio() {
        if (window.SFX && typeof window.SFX.toggleMute === "function") {
            const muted = window.SFX.toggleMute();
            const hudAudioBtn = document.getElementById("btn-toggle-audio");
            if (hudAudioBtn) {
                hudAudioBtn.textContent = muted ? "🔇 Âm Thanh: Tắt" : "🔊 Âm Thanh";
            }
            this.syncMainMenuUI();
        }
    }

    openPvpLobbyFromMainMenu() {
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        this.hideMainMenuScreen();
        this.lobbySubView = "browse";
        this.showWaitingScreen();
        this.fetchOpenRoomsList();
    }

    openQuickRoomCodeFromMainMenu() {
        this.openPvpLobbyFromMainMenu();
        setTimeout(() => {
            const codeInp = document.getElementById("wait-join-code");
            if (codeInp) {
                codeInp.focus();
                codeInp.select();
            }
        }, 60);
    }

    async returnToMainMenu(options = {}) {
        const confirmIfPlaying = Boolean(options && options.confirmIfPlaying);
        if (confirmIfPlaying && this.isGameStarted && !this.matchWinner && !this.sandboxMode) {
            if (typeof window !== "undefined" && typeof window.confirm === "function") {
                const ok = window.confirm("Trận đấu đang diễn ra. Bạn có chắc muốn rời phòng và về Sảnh Màn Hình Chính?");
                if (!ok) return false;
            }
        }

        // 1. Dừng và xóa toàn bộ timer / vòng lặp đang chạy
        clearInterval(this.openingTimerInterval);
        this.openingTimerInterval = null;
        clearInterval(this.preGameCountdownInterval);
        this.preGameCountdownInterval = null;
        this.isPreGameCountingDown = false;
        clearInterval(this.quizAutoCloseInterval);
        this.quizAutoCloseInterval = null;
        clearInterval(this.weatherClockInterval);
        this.weatherClockInterval = null;
        clearInterval(this.stormReadingTimerInterval);
        this.stormReadingTimerInterval = null;
        clearInterval(this.victoryCountdownInterval);
        this.victoryCountdownInterval = null;
        clearInterval(this.roomPollTimer);
        this.roomPollTimer = null;
        clearInterval(this.openRoomsPollTimer);
        this.openRoomsPollTimer = null;
        clearTimeout(this.autoEndTurnTimer);
        this.autoEndTurnTimer = null;
        clearTimeout(this.aiTurnTimer);
        this.aiTurnTimer = null;
        clearTimeout(this.aiPostMoveTimer);
        this.aiPostMoveTimer = null;
        clearTimeout(this.hoverTooltipTimer);
        this.hoverTooltipTimer = null;
        this._scheduledBotTurnKey = null;
        this.clearZeroApAutoPassCountdown();

        // 2. Đóng toàn bộ modal, bảng thông báo AFK, Chat Phòng, Quiz & Sảnh trong trận
        this.resetRoomChatState();
        this.closeAtlasLightbox();
        this.hideAfkWarningBanner();
        this.hideAfkAutoNotice();
        this.closeInMatchLobbyOverlay();
        if (typeof this.closeModal === "function") {
            this.closeModal();
        }
        this.pendingQuiz = null;
        this.liveQuizState = null;
        this.currentPortTile = null;
        this.cancelLockedMovePath(false);

        // 3. Rời phòng PvP trên server (chuyển Chủ phòng hoặc dọn phòng sạch sẽ)
        if (this.roomState && this.roomState.code) {
            const leavingCode = this.roomState.code;
            try {
                await fetch("/api/room/leave", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: leavingCode, clientId: this.clientId })
                });
            } catch (e) {}
        }
        try { sessionStorage.removeItem("golden_active_room_code"); } catch (e) {}
        this.roomState.code = null;
        this.roomState.isHost = false;
        this.roomState.status = "waiting";
        this.roomState.seats = this.createEmptyLobbySeats();
        this.updateRoomBadgeUI();

        // 4. Dọn sạch dữ liệu trận cũ trên client & bản đồ 3D
        this.isGameStarted = false;
        this.isBusy = false;
        this.matchWinner = null;
        this.victoryShownForMatch = false;
        this.players = [];
        this.blockedMineIds = [];
        this.isMatchClockFrozen = false;
        this.disableSandboxCreativeMode();
        if (this.world && typeof this.world.clearMatchVisuals === "function") {
            this.world.clearMatchVisuals();
        }

        // 5. Hiện Sảnh Màn Hình Chính + bật camera tự động lướt quanh bản đồ 3D
        this.showMainMenuScreen();
        return true;
    }

    // ========================================================================
    // PRE-GAME WAITING SCREEN & ONLINE MULTIPLAYER ROOM LOBBY
    // ========================================================================
    showWaitingScreen() {
        this.hideMainMenuScreen();
        this.isGameStarted = false;
        this.isInMatchLobbyOverlayOpen = false;
        clearInterval(this.openingTimerInterval);
        clearInterval(this.quizAutoCloseInterval);
        clearInterval(this.weatherClockInterval);
        clearInterval(this.stormReadingTimerInterval);
        clearTimeout(this.autoEndTurnTimer);
        clearTimeout(this.hoverTooltipTimer);
        const overlay = document.getElementById("waiting-screen-overlay");
        if (overlay) {
            overlay.classList.remove("hidden");
            overlay.classList.remove("in-match-overlay");
        }
        document.getElementById("top-hud-bar").classList.add("hidden-hud");
        document.getElementById("left-hud-panel").classList.add("hidden-hud");
        document.getElementById("right-hud-panel").classList.add("hidden-hud");
        const tickerWrap = document.getElementById("bottom-live-ticker-wrap");
        if (tickerWrap) tickerWrap.classList.add("hidden-hud");
        const yagiBanner = document.getElementById("yagi-red-alert-banner");
        if (yagiBanner) yagiBanner.classList.add("hidden");
        const sbPanel = document.getElementById("sandbox-creative-panel");
        if (sbPanel) sbPanel.classList.add("hidden");

        this.renderWaitingScreen();
        this.startOpenRoomsPolling();
    }

    openInMatchLobbyOverlay() {
        if (!this.isGameStarted) {
            this.showWaitingScreen();
            return;
        }
        this.isInMatchLobbyOverlayOpen = true;
        const overlay = document.getElementById("waiting-screen-overlay");
        if (overlay) {
            overlay.classList.remove("hidden");
            overlay.classList.add("in-match-overlay");
        }
        this.renderWaitingScreen();
    }

    closeInMatchLobbyOverlay() {
        if (!this.isInMatchLobbyOverlayOpen) return;
        this.isInMatchLobbyOverlayOpen = false;
        const overlay = document.getElementById("waiting-screen-overlay");
        if (overlay) {
            overlay.classList.add("hidden");
            overlay.classList.remove("in-match-overlay");
        }
    }

    hideWaitingScreenAndShowHUD() {
        this.hideMainMenuScreen();
        this.isGameStarted = true;
        this.isInMatchLobbyOverlayOpen = false;
        clearInterval(this.openRoomsPollTimer);
        if (this.world && typeof this.world.setMenuOrbitMode === "function") {
            this.world.setMenuOrbitMode(false);
        }
        const overlay = document.getElementById("waiting-screen-overlay");
        if (overlay) {
            overlay.classList.add("hidden");
            overlay.classList.remove("in-match-overlay");
        }
        document.getElementById("top-hud-bar").classList.remove("hidden-hud");
        document.getElementById("left-hud-panel").classList.remove("hidden-hud");
        document.getElementById("right-hud-panel").classList.remove("hidden-hud");
        const tickerWrap = document.getElementById("bottom-live-ticker-wrap");
        if (tickerWrap) tickerWrap.classList.remove("hidden-hud");
        this.startMatchClockAndWeatherEngine();
        this.updateRoomBadgeUI();
    }

    renderWaitingScreen() {
        const container = document.getElementById("waiting-screen-body");
        if (!container) return;

        const nameInputEl = document.getElementById("welcome-player-name");
        if (nameInputEl && nameInputEl.value.trim()) {
            this.roomState.localPlayerName = nameInputEl.value.trim();
            localStorage.setItem("golden_player_name", this.roomState.localPlayerName);
        }

        // ====================================================================
        // VIEW 1A: WELCOME SCREEN (GREETING + PLAYER NAME + MAIN BUTTONS — V3)
        // ====================================================================
        if (!this.roomState.code && this.lobbySubView !== "browse") {
            const isMatchRunning = Boolean(this.isGameStarted && this.isInMatchLobbyOverlayOpen);
            container.innerHTML = `
                ${isMatchRunning ? `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding:8px 12px; border-radius:9px; background:#0f2942; border:1.5px solid #e6b84a; color:#fde68a; font-size:12.5px; font-weight:800">
                        <span>⛵ Trận đấu đang diễn ra — Bấm ✕ để quay lại bàn cờ.</span>
                        <button type="button" class="lobby-close-x-btn" onclick="window.GAME.closeInMatchLobbyOverlay()" title="Đóng và quay lại trận đấu">✕</button>
                    </div>
                ` : ''}
                <div class="lobby-hero">
                    <div class="lobby-hero-badge">
                        <span>⛵ Board Game Chiến Thuật 3D Địa Lý &amp; Kinh Tế</span>
                        <span class="lobby-ver-pill">V3</span>
                    </div>
                    <div class="lobby-hero-title-row">
                        <h1>HÀNH TRÌNH VÀNG SON</h1>
                    </div>
                    <p>Khám phá 6 Vùng Kinh Tế Việt Nam, giao thương liên vùng và chạm mốc 15 Điểm Thịnh Vượng</p>
                </div>

                <div class="welcome-name-card">
                    <label for="welcome-player-name">👤 Đặt Tên Thuyền Trưởng Của Bạn</label>
                    <input type="text" id="welcome-player-name" class="clean-input"
                        placeholder="Nhập tên hiển thị trong phòng..."
                        value="${this.roomState.localPlayerName}"
                        oninput="window.GAME.updateLocalPlayerName(this.value)" />
                </div>

                <div class="welcome-actions-grid">
                    <button class="btn-lobby-main primary" onclick="window.GAME.openCreateRoomModal()">
                        <span class="btn-title">➕ Tạo Phòng Chơi</span>
                        <span class="btn-sub">Đặt tên phòng, chọn chế độ Công khai (Public) hoặc Riêng tư (Private có mật khẩu)</span>
                    </button>

                    <button class="btn-lobby-main" onclick="window.GAME.switchToBrowseRoomsView()">
                        <span class="btn-title">🚪 Vào Phòng / Tìm Phòng</span>
                        <span class="btn-sub">Xem danh sách các phòng đang mở hoặc nhập nhanh Mã Code 6 ký tự để tham gia</span>
                    </button>
                </div>

                <div class="welcome-footer-grid">
                    <button class="btn-lobby-sub navy-sub" onclick="window.GAME.startQuickSinglePlayerWithBots()">
                        ⚡ Chơi Đơn Cùng Tàu Máy (Bot)
                    </button>
                    <button class="btn-lobby-sub gold-sub" onclick="window.GAME.startSoloSandboxMode()">
                        🛠️ Chế Độ Sáng Tạo (Sandbox 1 Mình)
                    </button>
                    <button class="btn-lobby-sub navy-sub" onclick="window.GAME.openAtlasModal()">
                        📖 Cẩm Nang 6 Vùng
                    </button>
                    <button class="btn-lobby-sub navy-sub" onclick="window.GAME.openRulebookModal()">
                        📜 Luật Chơi
                    </button>
                </div>
            `;
            return;
        }

        // ====================================================================
        // VIEW 1B: BROWSE OPEN ROOMS & QUICK CODE ENTRY
        // ====================================================================
        if (!this.roomState.code && this.lobbySubView === "browse") {
            const curCodeEl = document.getElementById("wait-join-code");
            const savedJoinCode = (curCodeEl && curCodeEl.value) || this.prefilledRoomCode || "";

            const openRoomsHtml = this.openRoomsList.length === 0
                ? `<div style="color:var(--ink-secondary); font-size:13px; font-weight:600; text-align:center; padding:22px 0">Hiện chưa có phòng nào đang mở. Bạn có thể nhập mã phòng ở trên hoặc quay lại tạo phòng mới!</div>`
                : this.openRoomsList.map(r => `
                    <div class="room-item-row">
                        <div>
                            <div style="display:flex; align-items:center; gap:6px">
                                <strong style="color:#f8fafc; font-size:14.5px">${r.roomName || ('Phòng ' + r.code)}</strong>
                                <span class="room-privacy-tag ${r.isPrivate ? 'private' : 'public'}">
                                    ${r.isPrivate ? '🔒 Riêng tư' : '🌐 Công khai'}
                                </span>
                            </div>
                            <div style="font-size:12px; color:#cbd5e1; margin-top:3px">
                                Mã: <strong style="color:#fde68a">${r.code}</strong> • Chủ phòng: <strong>${r.hostName}</strong> • Người chơi: <strong>${r.activeCount}/5</strong>
                            </div>
                        </div>
                        <button class="btn-trade-action gold" onclick="window.GAME.attemptJoinListedRoom('${r.code}', ${Boolean(r.isPrivate)}, '${(r.roomName || r.code).replace(/'/g, "\\'")}')">
                            ${r.isPrivate ? '🔒 Nhập Mật Khẩu' : '🚪 Vào Phòng'}
                        </button>
                    </div>
                `).join("");

            container.innerHTML = `
                <div class="browse-top-bar">
                    <button class="btn-secondary" onclick="window.GAME.showMainMenuScreen()">⬅️ Màn Hình Chính</button>
                    <div style="display:flex; align-items:center; gap:9px">
                        <img src="assets/logo.png" alt="Logo" class="lobby-mini-logo" />
                        <h3 style="font-size:16px; font-weight:800; margin:0">⚔️ Phòng Đấu PvP (2–5 Người)</h3>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center">
                        <button class="btn-primary-gold" style="padding:7px 12px; font-size:12.5px" onclick="window.GAME.openCreateRoomModal()">➕ Tạo Phòng Mới</button>
                        <button class="btn-secondary" onclick="window.GAME.fetchOpenRoomsList()">🔄 Làm mới</button>
                    </div>
                </div>

                <div class="quick-code-bar">
                    <input type="text" id="wait-join-code" class="clean-input code-input"
                        maxlength="8" placeholder="NHẬP MÃ PHÒNG (6 KÝ TỰ)..." value="${savedJoinCode}" />
                    <button class="btn-primary-gold" style="white-space:nowrap" onclick="window.GAME.joinMultiplayerRoomByCode()">
                        Vào Bằng Mã
                    </button>
                </div>

                <div id="open-rooms-list-box" class="rooms-directory-list">
                    ${openRoomsHtml}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1.5px dashed rgba(110, 70, 32, 0.35); font-size:12.5px; color:var(--ink-secondary); font-weight:600">
                    <span>Thuyền trưởng: <strong style="color:var(--ink-primary)">${this.roomState.localPlayerName}</strong></span>
                    <button class="btn-trade-action" onclick="window.GAME.openCreateRoomModal()">➕ Tạo Phòng Mới</button>
                </div>
            `;
            return;
        }

        // ====================================================================
        // VIEW 2: INSIDE A WAITING ROOM LOBBY (5 PLAYER SEATS, RANDOM SHIPS)
        // ====================================================================
        const seats = this.roomState.seats || [];
        const activeSeats = seats.filter(s => s.type === "human" || s.type === "ai");
        const canStart = activeSeats.length >= 1 && activeSeats.length <= 5;

        const slotsHtml = seats.map((seat, idx) => {
            const isLocalSeat = (seat.clientId === this.clientId || idx === this.roomState.localSeatIdx);
            let cardClass = "slot-empty";
            let titleDisplay = "";
            let subText = "🎲 Chiến thuyền & màu sắc sẽ được phát ngẫu nhiên khi vào trận";
            let actionButtons = "";

            if (seat.type === "human") {
                cardClass = "slot-human";
                titleDisplay = `👤 ${seat.name} ${seat.isHost ? '<span style="color:#fbbf24; font-size:12px">(Chủ phòng)</span>' : ''} ${isLocalSeat ? '<span style="color:#34d399; font-size:12px">[Bạn]</span>' : ''}`;
                if (this.roomState.isHost && !seat.isHost) {
                    actionButtons = `
                        <button class="btn-trade-action danger" onclick="window.GAME.hostClearSeat(${idx})">
                            Mời ra
                        </button>
                    `;
                }
            } else if (seat.type === "ai") {
                cardClass = "slot-ai";
                const cleanBotName = String(seat.name || `Tàu Máy #${idx + 1}`).replace(/Bot AI/gi, "Tàu Máy");
                titleDisplay = `🤖 ${cleanBotName} <span class="slot-status-pill bot-pill">Tàu Máy (Bot)</span>`;
                subText = "Tự động điều hướng, giao thương và tranh tài cùng người chơi";
                if (this.roomState.isHost && !this.isGameStarted) {
                    actionButtons = `
                        <button class="btn-secondary" style="padding:5px 10px; font-size:11.5px" onclick="window.GAME.hostClearSeat(${idx})">
                            Xóa Tàu Máy
                        </button>
                    `;
                }
            } else {
                cardClass = "slot-empty";
                titleDisplay = `Vị trí #${idx + 1} <span class="slot-status-pill empty-pill">Slot trống</span>`;
                subText = this.isGameStarted ? "Vị trí trống trong trận đấu này" : "Đang chờ người chơi tham gia hoặc thêm Tàu Máy (Bot)...";
                if (this.roomState.isHost && !this.isGameStarted) {
                    actionButtons = `
                        <button class="btn-trade-action" onclick="window.GAME.hostAddBotToSeat(${idx})">
                            + Thêm Tàu Máy (Bot)
                        </button>
                    `;
                }
            }

            return `
                <div class="slot-card ${cardClass}">
                    <div class="slot-left-info">
                        <div class="slot-badge-num">${idx + 1}</div>
                        <div>
                            <div class="slot-player-title">${titleDisplay}</div>
                            <div class="slot-vessel-sub">${subText}</div>
                        </div>
                    </div>
                    <div class="slot-actions-right">
                        ${actionButtons}
                    </div>
                </div>
            `;
        }).join("");

        const isMatchRunning = Boolean(this.isGameStarted && this.isInMatchLobbyOverlayOpen);
        const existingLobbyDraftEl = document.getElementById("lobby-chat-input");
        const preservedLobbyDraft = existingLobbyDraftEl ? existingLobbyDraftEl.value : "";
        const wasLobbyChatFocused = Boolean(
            typeof document !== "undefined" &&
            existingLobbyDraftEl &&
            document.activeElement === existingLobbyDraftEl
        );

        container.innerHTML = `
            <div class="room-lobby-banner">
                <div style="display:flex; align-items:center; gap:11px">
                    <img src="assets/logo.png" alt="Logo" class="lobby-mini-logo" />
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px">
                            <strong style="font-size:16px; color:#f8fafc">${this.roomState.roomName || ('Phòng ' + this.roomState.code)}</strong>
                            <span class="room-privacy-tag ${this.roomState.isPrivate ? 'private' : 'public'}">
                                ${this.roomState.isPrivate ? '🔒 Riêng tư (Có mật khẩu)' : '🌐 Công khai'}
                            </span>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px">
                            <span style="font-size:12px; color:#cbd5e1">Mã phòng:</span>
                            <span class="room-code-badge">${this.roomState.code}</span>
                            <button class="btn-secondary" style="padding:5px 10px; font-size:11.5px" onclick="window.GAME.copyRoomCode()">📋 Copy Mã</button>
                        </div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
                    <button class="btn-secondary" onclick="window.GAME.leaveMultiplayerRoom()">⬅️ Rời Phòng</button>
                    ${isMatchRunning ? `
                        <button type="button" class="lobby-close-x-btn" onclick="window.GAME.closeInMatchLobbyOverlay()" title="Đóng và quay lại trận đấu">✕</button>
                    ` : ''}
                </div>
            </div>

            <div class="waiting-room-split">
                <div class="waiting-room-slots-col">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:12.5px">
                        <span style="color:var(--ink-primary); font-weight:800">Danh sách thuyền trưởng (${activeSeats.length}/5)</span>
                        <span style="color:var(--ink-secondary); font-weight:700">🎲 Thuyền ngẫu nhiên khi bắt đầu</span>
                    </div>
                    <div class="slots-list-grid">
                        ${slotsHtml}
                    </div>
                </div>

                <div class="lobby-chat-box">
                    <div class="lobby-chat-header">
                        <span>💬 Chat Phòng Chờ</span>
                        <span class="lobby-chat-sub">Real-time • Giữ lịch sử vào trận</span>
                    </div>
                    <div id="lobby-chat-messages" class="chat-messages-list"></div>
                    <div class="chat-composer-wrap">
                        <div id="lobby-chat-spam-warn" class="chat-spam-warn hidden"></div>
                        <div id="lobby-quick-popover" class="chat-quick-popover hidden" role="menu">
                            <button type="button" class="chat-quick-chip" onclick="window.GAME && window.GAME.sendQuickChatPreset('🌾 Ai đổi tài nguyên?')">🌾 Ai đổi tài nguyên?</button>
                            <button type="button" class="chat-quick-chip" onclick="window.GAME && window.GAME.sendQuickChatPreset('🤝 Lên Chợ P2P nhé!')">🤝 Lên Chợ P2P nhé!</button>
                            <button type="button" class="chat-quick-chip" onclick="window.GAME && window.GAME.sendQuickChatPreset('⏳ Đợi mình chút!')">⏳ Đợi mình chút!</button>
                            <button type="button" class="chat-quick-chip" onclick="window.GAME && window.GAME.sendQuickChatPreset('👏 Chơi hay quá!')">👏 Chơi hay quá!</button>
                        </div>
                        <div class="chat-input-bar">
                            <button type="button" id="btn-lobby-quick-toggle" class="chat-quick-toggle-btn" title="Tin nhắn nhanh" onclick="window.GAME && window.GAME.toggleQuickChatPopover('lobby', event)">⚡</button>
                            <div class="chat-input-box-wrap">
                                <input type="text" id="lobby-chat-input" class="chat-text-input" maxlength="250" autocomplete="off" placeholder="Nhắn tin trong phòng..." oninput="window.GAME && window.GAME.updateChatCharCounter('lobby', this.value)" />
                                <span id="lobby-chat-counter" class="chat-char-counter hidden">0/250</span>
                            </div>
                            <button type="button" id="btn-lobby-chat-send" class="chat-send-btn" onclick="window.GAME && window.GAME.submitLobbyChat()">Gửi</button>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-top:10px; border-top:1.5px dashed rgba(110, 70, 32, 0.35)">
                <div style="font-size:12px; color:var(--ink-secondary); font-weight:600">
                    <div>
                        ${this.roomState.isHost
                            ? `Bạn là <strong style="color:var(--ink-primary)">Chủ phòng</strong> (Nếu rời đi, quyền Chủ phòng tự động chuyển cho người tiếp theo).`
                            : `Đang chờ Chủ phòng bắt đầu trận đấu...`
                        }
                    </div>
                    ${isMatchRunning ? `<div style="margin-top:4px; color:#0f766e; font-weight:800">⛵ Trận đấu đang diễn ra — Bấm ✕ để quay lại bàn cờ.</div>` : ''}
                </div>
                ${(this.roomState.isHost && !isMatchRunning) ? `
                    <div style="display:flex; gap:8px; flex-wrap:wrap">
                        <button class="btn-primary-gold" ${canStart ? '' : 'disabled'} onclick="window.GAME.startRoomGameSession(false)">
                            🚀 Bắt Đầu Ván Đấu (${activeSeats.length} Người)
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
        const newLobbyInput = document.getElementById("lobby-chat-input");
        if (newLobbyInput) {
            if (preservedLobbyDraft) {
                newLobbyInput.value = preservedLobbyDraft;
                this.updateChatCharCounter("lobby", preservedLobbyDraft);
            }
            newLobbyInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.submitLobbyChat();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    this.closeAllQuickChatPopovers();
                    newLobbyInput.blur();
                }
            });
            if (wasLobbyChatFocused) newLobbyInput.focus();
        }
        this.renderRoomChatMessages("lobby");
        this.updateChatSpamCooldownUI();
    }

    updateLocalPlayerName(val) {
        const clean = String(val || "").trim();
        if (clean) {
            this.roomState.localPlayerName = clean;
            localStorage.setItem("golden_player_name", clean);
        }
    }

    switchToBrowseRoomsView() {
        const nameEl = document.getElementById("welcome-player-name");
        if (nameEl && nameEl.value.trim()) {
            this.updateLocalPlayerName(nameEl.value.trim());
        }
        this.lobbySubView = "browse";
        this.renderWaitingScreen();
        this.fetchOpenRoomsList();
    }

    backToWelcomeView() {
        this.lobbySubView = "welcome";
        this.renderWaitingScreen();
    }

    openCreateRoomModal() {
        const nameEl = document.getElementById("welcome-player-name");
        if (nameEl && nameEl.value.trim()) {
            this.updateLocalPlayerName(nameEl.value.trim());
        }
        this.createRoomIsPrivate = false;
        const defaultRoomName = `Phòng của ${this.roomState.localPlayerName}`;

        const html = `
            <div class="modal-header-badge">
                <span>➕ TẠO PHÒNG CHƠI MỚI</span>
            </div>
            <h2 class="modal-title">Thiết Lập Phòng Chơi</h2>
            <p class="modal-desc">Đặt tên phòng và chọn chế độ Công khai (Public) hoặc Riêng tư (Private có mật khẩu).</p>

            <div style="display:flex; flex-direction:column; gap:14px; margin-bottom:16px">
                <div>
                    <label class="parchment-form-label">Tên Phòng Chơi</label>
                    <input type="text" id="modal-room-name" class="clean-input" value="${defaultRoomName}" placeholder="Nhập tên phòng..." />
                </div>

                <div>
                    <label class="parchment-form-label">Chế Độ Phòng</label>
                    <div class="mode-toggle-group">
                        <button type="button" id="mode-btn-public" class="mode-option-btn active" onclick="window.GAME.setCreateRoomPrivacy(false)">
                            🌐 Công Khai (Public)<br/>
                            <small style="font-weight:400; font-size:11px">Ai cũng có thể tham gia</small>
                        </button>
                        <button type="button" id="mode-btn-private" class="mode-option-btn" onclick="window.GAME.setCreateRoomPrivacy(true)">
                            🔒 Riêng Tư (Private)<br/>
                            <small style="font-weight:400; font-size:11px">Cần mật khẩu để vào</small>
                        </button>
                    </div>
                </div>

                <div id="modal-room-password-wrap" class="hidden">
                    <label class="parchment-form-label" style="color:#92400e">🔑 Đặt Mật Khẩu Phòng</label>
                    <input type="password" id="modal-room-password" class="clean-input" placeholder="Nhập mật khẩu cho phòng riêng tư..." />
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn-secondary" onclick="window.GAME.closeModal()">Hủy</button>
                <button class="btn-primary-gold" onclick="window.GAME.createMultiplayerRoom()">✨ Tạo Phòng Ngay</button>
            </div>
        `;
        this.showModal(html);
    }

    setCreateRoomPrivacy(isPrivate) {
        this.createRoomIsPrivate = Boolean(isPrivate);
        const pubBtn = document.getElementById("mode-btn-public");
        const privBtn = document.getElementById("mode-btn-private");
        const passWrap = document.getElementById("modal-room-password-wrap");
        if (pubBtn) pubBtn.classList.toggle("active", !isPrivate);
        if (privBtn) privBtn.classList.toggle("active", isPrivate);
        if (passWrap) passWrap.classList.toggle("hidden", !isPrivate);
    }

    openPasswordPromptModal(code, roomName = "", wrongPassError = "") {
        const html = `
            <div class="modal-header-badge">
                <span>🔒 PHÒNG RIÊNG TƯ (PRIVATE)</span>
            </div>
            <h2 class="modal-title">Nhập Mật Khẩu Vào Phòng</h2>
            <p class="modal-desc">
                Phòng <strong>${roomName || code}</strong> (Mã: <strong>${code}</strong>) yêu cầu mật khẩu từ Chủ phòng để tham gia.
            </p>
            ${wrongPassError ? `<div style="color:#fb7185; font-size:12.5px; font-weight:600; margin-bottom:10px">⚠️ ${wrongPassError}</div>` : ''}
            <div style="margin-bottom:16px">
                <input type="password" id="prompt-room-password" class="clean-input" placeholder="Nhập mật khẩu phòng..." autofocus
                    onkeydown="if(event.key==='Enter') window.GAME.submitPasswordJoin('${code}')" />
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" onclick="window.GAME.closeModal()">Hủy</button>
                <button class="btn-primary-gold" onclick="window.GAME.submitPasswordJoin('${code}')">🚪 Xác Nhận Vào Phòng</button>
            </div>
        `;
        this.showModal(html);
    }

    submitPasswordJoin(code) {
        const passEl = document.getElementById("prompt-room-password");
        const pwd = passEl ? passEl.value.trim() : "";
        if (!pwd) {
            this.showToast("⚠️ Vui lòng nhập mật khẩu phòng!");
            return;
        }
        this.closeModal();
        this.joinMultiplayerRoomByCode(code, pwd);
    }

    attemptJoinListedRoom(code, isPrivate, roomName) {
        if (isPrivate) {
            this.openPasswordPromptModal(code, roomName);
        } else {
            this.joinMultiplayerRoomByCode(code, "");
        }
    }

    startOpenRoomsPolling() {
        clearInterval(this.openRoomsPollTimer);
        this.fetchOpenRoomsList();
        this.openRoomsPollTimer = setInterval(() => {
            if (!this.isGameStarted && !this.roomState.code) {
                this.fetchOpenRoomsList();
            }
        }, 2500);
    }

    async fetchOpenRoomsList() {
        try {
            const resp = await fetch("/api/room/list");
            const data = await resp.json();
            if (data && data.publicUrl) {
                this.publicOnlineUrl = data.publicUrl;
            }
            if (data && data.ok && Array.isArray(data.rooms)) {
                this.openRoomsList = data.rooms;
                if (!this.roomState.code && this.lobbySubView === "browse") {
                    this.renderWaitingScreen();
                }
            }
        } catch (e) {}
    }

    quickJoinRoomCode(code) {
        this.joinMultiplayerRoomByCode(code);
    }

    async createMultiplayerRoom() {
        const roomNameEl = document.getElementById("modal-room-name");
        const passEl = document.getElementById("modal-room-password");
        const hostName = (this.roomState.localPlayerName || "Thuyền Trưởng").trim();
        const roomName = (roomNameEl && roomNameEl.value.trim()) ? roomNameEl.value.trim() : `Phòng của ${hostName}`;
        const isPrivate = Boolean(this.createRoomIsPrivate);
        const password = isPrivate && passEl ? passEl.value.trim() : "";

        if (isPrivate && !password) {
            this.showToast("⚠️ Vui lòng nhập mật khẩu cho phòng Riêng tư!");
            return;
        }

        try {
            const resp = await fetch("/api/room/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hostName,
                    roomName,
                    isPrivate,
                    password,
                    clientId: this.clientId
                })
            });
            const data = await resp.json();
            if (data && data.ok && data.room) {
                this.closeModal();
                this.roomState.code = data.room.code;
                this.roomState.roomName = data.room.roomName || roomName;
                this.roomState.isPrivate = Boolean(data.room.isPrivate);
                this.roomState.isHost = true;
                this.roomState.localSeatIdx = 0;
                this.roomState.status = "waiting";
                this.roomState.seats = data.room.seats;
                this.roomState.version = data.room.version || 1;
            } else {
                this.showToast(`⚠️ ${data && data.error ? data.error : "Không thể tạo phòng!"}`);
                return;
            }
        } catch (err) {
            this.showToast("⚠️ Không thể kết nối tới Máy chủ tạo phòng!");
            return;
        }

        this.saveRoomToLocalStorage();
        this.broadcastRoomMessage({ type: "ROOM_UPDATED", roomState: this.roomState });
        this.startRoomPolling();
        this.updateRoomBadgeUI();
        this.renderWaitingScreen();
        this.showToast(`🔑 Đã tạo "${this.roomState.roomName}" [Mã: ${this.roomState.code}]!`);
    }

    async joinMultiplayerRoomByCode(explicitCode = null, explicitPassword = "") {
        const codeEl = document.getElementById("wait-join-code");
        const rawCode = explicitCode || (codeEl ? codeEl.value : "");
        const code = String(rawCode || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        const playerName = (this.roomState.localPlayerName || "Thuyền Trưởng").trim();

        if (code.length < 4) {
            this.showToast("⚠️ Vui lòng nhập Mã Phòng hợp lệ (6 ký tự)!");
            return;
        }

        try {
            const resp = await fetch("/api/room/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code,
                    playerName,
                    password: explicitPassword,
                    clientId: this.clientId
                })
            });
            const data = await resp.json();

            if (data && data.requirePassword) {
                this.openPasswordPromptModal(
                    data.code || code,
                    data.roomName || `Phòng ${code}`,
                    data.wrongPassword ? "Mật khẩu chưa chính xác! Vui lòng nhập lại." : ""
                );
                return;
            }

            if (data && data.ok && data.room) {
                this.roomState.code = data.room.code;
                this.roomState.roomName = data.room.roomName || `Phòng ${data.room.code}`;
                this.roomState.isPrivate = Boolean(data.room.isPrivate);
                const mySeat = (data.room.seats || []).find(s => s.clientId === this.clientId) || data.room.seats[data.assignedSeat];
                this.roomState.isHost = mySeat ? Boolean(mySeat.isHost) : (data.assignedSeat === 0);
                this.roomState.localSeatIdx = data.assignedSeat;
                this.roomState.status = data.room.status;
                this.roomState.seats = data.room.seats;
                this.roomState.version = data.room.version || 1;

                this.saveRoomToLocalStorage();
                this.broadcastRoomMessage({ type: "ROOM_UPDATED", roomState: this.roomState });
                this.startRoomPolling();
                this.updateRoomBadgeUI();

                // If room is already in turn_order_quiz or playing, jump right in!
                if (data.room.status === "turn_order_quiz" && data.room.gameState) {
                    this.hideWaitingScreenAndShowHUD();
                    this.applySerializedGameState(data.room.gameState, true);
                    if (data.room.openingQuiz) {
                        this.startOpeningSpeedQuizModal(data.room.openingQuiz);
                    }
                    return;
                } else if (data.room.status === "playing" && data.room.gameState) {
                    this.hideWaitingScreenAndShowHUD();
                    this.applySerializedGameState(data.room.gameState, true);
                    return;
                }

                this.renderWaitingScreen();
                this.showToast(`🎉 Đã vào "${this.roomState.roomName}" [${this.roomState.code}]!`);
                return;
            } else {
                sessionStorage.removeItem("golden_active_room_code");
                this.showToast(`⚠️ ${data && data.error ? data.error : "Không tìm thấy phòng!"}`);
                return;
            }
        } catch (err) {
            this.showToast("⚠️ Lỗi kết nối khi vào phòng!");
        }
    }

    async hostAddBotToSeat(seatIdx) {
        if (!this.roomState.code || !this.roomState.isHost) return;
        try {
            const resp = await fetch("/api/room/update-seat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: this.roomState.code,
                    seatIndex: seatIdx,
                    action: "add_bot"
                })
            });
            const data = await resp.json();
            if (data && data.ok && data.room) {
                this.roomState.seats = data.room.seats;
                this.roomState.version = data.room.version;
                this.broadcastRoomMessage({ type: "ROOM_UPDATED", roomState: this.roomState });
                this.renderWaitingScreen();
                this.showToast(`🤖 Đã thêm Tàu Máy (Bot) vào Slot #${seatIdx + 1}!`);
            }
        } catch (e) {}
    }

    async hostClearSeat(seatIdx) {
        if (!this.roomState.code || !this.roomState.isHost) return;
        try {
            const resp = await fetch("/api/room/update-seat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: this.roomState.code,
                    seatIndex: seatIdx,
                    action: "clear_seat"
                })
            });
            const data = await resp.json();
            if (data && data.ok && data.room) {
                this.roomState.seats = data.room.seats;
                this.roomState.version = data.room.version;
                this.broadcastRoomMessage({ type: "ROOM_UPDATED", roomState: this.roomState });
                this.renderWaitingScreen();
                this.showToast(`🪑 Đã làm trống Vị trí #${seatIdx + 1}.`);
            }
        } catch (e) {}
    }

    async leaveMultiplayerRoom() {
        return this.returnToMainMenu({ confirmIfPlaying: true });
    }

    copyRoomCode() {
        if (!this.roomState.code) return;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(this.roomState.code);
        }
        this.showToast(`📋 Đã sao chép Mã Phòng: ${this.roomState.code}`);
    }

    copyPublicOnlineUrl() {
        const url = this.publicOnlineUrl || window.location.origin;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url);
        }
        this.showToast(`🌐 Đã sao chép Link Online gửi cho bạn bè: ${url}`);
    }

    copyInviteLink() {
        if (!this.roomState.code) return;
        const base = this.publicOnlineUrl || window.location.origin;
        const link = `${base}/?room=${this.roomState.code}`;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(link);
        }
        this.showToast(`🔗 Đã sao chép Link mời vào phòng: ${link}`);
    }

    // ========================================================================
    // PHASE 0: OPENING TURN-ORDER SPEED QUIZ (ĐẦU TRẬN XẾP THỨ TỰ LƯỢT CHƠI)
    // ========================================================================
    pickRandomOpeningSpeedQuiz() {
        const allPools = [
            ...(window.GAME_DATA.resourceQuizzes.food || []),
            ...(window.GAME_DATA.resourceQuizzes.wood || []),
            ...(window.GAME_DATA.resourceQuizzes.iron || [])
        ];
        const raw = allPools[Math.floor(Math.random() * allPools.length)] || window.GAME_DATA.resourceQuizzes.food[0];
        return this.prepareShuffledQuiz(raw);
    }

    startQuickSinglePlayerWithBots() {
        this.roomState.code = null;
        this.roomState.isHost = true;
        this.roomState.status = "turn_order_quiz";
        this.disableSandboxCreativeMode();
        this.hideWaitingScreenAndShowHUD();
        this.initializeMatchBoardAndShips(4, 1, null);

        const quiz = this.pickRandomOpeningSpeedQuiz();
        this.startOpeningSpeedQuizModal({
            quiz,
            startedAt: Date.now(),
            completed: false,
            rankings: []
        });
    }

    startSoloSandboxMode() {
        const nameEl = document.getElementById("welcome-player-name");
        if (nameEl && nameEl.value.trim()) {
            this.updateLocalPlayerName(nameEl.value.trim());
        }
        this.roomState.code = null;
        this.roomState.isHost = true;
        this.roomState.status = "playing";
        this.hideWaitingScreenAndShowHUD();
        this.initializeMatchBoardAndShips(1, 1, [{
            name: this.roomState.localPlayerName || "Thuyền Trưởng Sáng Tạo",
            isAI: false,
            archetypeId: 0,
            seatIndex: 0,
            clientId: this.clientId
        }]);
        this.enableSandboxCreativeMode(true);
        this.beginTurn();
        this.showToast("🛠️ Đã vào Chế Độ Sáng Tạo (Sandbox 1 Mình)! Tự do di chuyển vô hạn, chỉnh tài nguyên hoặc bấm Chiến Thắng ngay!");
    }

    async startRoomGameSession(enableSandbox = false) {
        const activeSeats = (this.roomState.seats || []).filter(s => s.type === "human" || s.type === "ai");
        if (activeSeats.length < 1) {
            this.showToast("⚠️ Cần tối thiểu 1 người chơi trong phòng để bắt đầu!");
            return;
        }
        if (activeSeats.length > 5) {
            this.showToast("⚠️ Tối đa 5 người chơi trong 1 phòng!");
            return;
        }

        const customConfigs = activeSeats.map(s => ({
            name: s.name,
            isAI: s.type === "ai",
            archetypeId: s.seatIndex,
            seatIndex: s.seatIndex,
            clientId: s.clientId
        }));

        const isExplicitSandbox = Boolean(enableSandbox);
        const skipQuizForSolo = Boolean(isExplicitSandbox || activeSeats.length === 1);
        this.roomState.status = skipQuizForSolo ? "playing" : "turn_order_quiz";
        this.hideWaitingScreenAndShowHUD();
        this.initializeMatchBoardAndShips(customConfigs.length, customConfigs.filter(c => !c.isAI).length, customConfigs);

        if (isExplicitSandbox) {
            this.enableSandboxCreativeMode(true);
        } else {
            this.disableSandboxCreativeMode();
        }

        const openingQuiz = this.pickRandomOpeningSpeedQuiz();
        const stateSnapshot = this.serializeGameState();

        if (this.roomState.code) {
            try {
                const resp = await fetch("/api/room/start", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        code: this.roomState.code,
                        gameState: stateSnapshot,
                        openingQuiz,
                        skipOpeningQuiz: skipQuizForSolo
                    })
                });
                const data = await resp.json();
                if (data && data.room) {
                    this.roomState.version = data.room.version;
                    this.roomState.status = data.room.status;
                    if (data.room.status === "playing") {
                        this.beginTurn();
                        if (isExplicitSandbox) {
                            this.showToast("🛠️ Đã bắt đầu phòng chơi Chế Độ Sáng Tạo (Sandbox)!");
                        }
                        return;
                    }
                    if (data.room.openingQuiz) {
                        this.startOpeningSpeedQuizModal(data.room.openingQuiz);
                    }
                }
            } catch (e) {
                if (skipQuizForSolo) {
                    this.beginTurn();
                    return;
                }
                this.startOpeningSpeedQuizModal({ quiz: openingQuiz, startedAt: Date.now(), completed: false, rankings: [] });
            }
            this.saveRoomToLocalStorage(stateSnapshot);
            this.broadcastRoomMessage({
                type: "ROOM_OPENING_QUIZ_STARTED",
                roomState: this.roomState,
                gameState: stateSnapshot,
                openingQuiz: skipQuizForSolo ? null : { quiz: openingQuiz, startedAt: Date.now(), completed: false, rankings: [] }
            });
        } else if (skipQuizForSolo) {
            this.beginTurn();
        }
    }

    startOpeningSpeedQuizModal(openingQuizObj) {
        if (!openingQuizObj || !openingQuizObj.quiz) return;
        this.openingQuizState = openingQuizObj;
        this.hasSubmittedOpeningAnswer = false;
        this.localOpeningChoice = null;
        this.localOpeningElapsedMs = 0;
        this.matchWinner = null;
        this.victoryShownForMatch = false;

        clearInterval(this.openingTimerInterval);
        clearInterval(this.preGameCountdownInterval);

        // Close any open modal so players can see the 3D S-shaped Vietnam map & their starting ship first!
        document.getElementById("modal-overlay").classList.add("hidden");

        const localP = this.getLocalPlayer();
        if (localP) {
            this.world.focusCameraOnHex(localP.q, localP.r);
        }

        // 10-Second Pre-Game Countdown before showing the Opening Turn-Order Speed Quiz
        const banner = document.getElementById("pregame-countdown-banner");
        const secEl = document.getElementById("pregame-countdown-sec");
        const barEl = document.getElementById("pregame-progress-bar");

        let remainingSec = 10;
        if (openingQuizObj.countdownEndsAt) {
            const diffSec = Math.ceil((openingQuizObj.countdownEndsAt - Date.now()) / 1000);
            if (diffSec >= 1 && diffSec <= 12) {
                remainingSec = Math.min(10, diffSec);
            }
        }

        this.isPreGameCountingDown = true;
        if (banner) {
            banner.classList.remove("hidden");
            banner.style.cursor = "pointer";
            banner.title = "Bấm để mở câu hỏi khởi động ngay lập tức";
        }
        if (secEl) secEl.textContent = String(remainingSec);
        if (barEl) barEl.style.width = `${(remainingSec / 10) * 100}%`;

        const launchQuizNow = () => {
            clearInterval(this.preGameCountdownInterval);
            this.isPreGameCountingDown = false;
            if (banner) banner.classList.add("hidden");

            this.openingQuizStartMs = Date.now();
            window.SFX.playTurnStart();
            this.renderOpeningSpeedQuizView();

            this.openingTimerInterval = setInterval(() => {
                if (this.hasSubmittedOpeningAnswer) {
                    clearInterval(this.openingTimerInterval);
                    return;
                }
                const timerEl = document.getElementById("opening-speed-timer");
                if (timerEl) {
                    const elapsedSec = ((Date.now() - this.openingQuizStartMs) / 1000).toFixed(1);
                    timerEl.textContent = `⏱️ ${elapsedSec}s`;
                }
            }, 100);
        };

        this.launchOpeningQuizNow = launchQuizNow;
        if (banner) {
            banner.onclick = () => launchQuizNow();
        }

        this.preGameCountdownInterval = setInterval(() => {
            remainingSec -= 1;
            if (remainingSec <= 0) {
                launchQuizNow();
            } else {
                if (secEl) secEl.textContent = String(remainingSec);
                if (barEl) barEl.style.width = `${Math.max(0, (remainingSec / 10) * 100)}%`;
            }
        }, 1000);
    }

    renderOpeningSpeedQuizView() {
        if (!this.openingQuizState || !this.openingQuizState.quiz) return;
        const quiz = this.openingQuizState.quiz;
        const localPlayer = this.getLocalPlayer();

        // Phase A: Local player has NOT answered yet -> Show question & clickable A/B/C/D options (60s timer!)
        if (!this.hasSubmittedOpeningAnswer) {
            // If already active & unanswered (e.g. from room poll), do NOT reset timer or reshuffle!
            if (this.activePendingQuiz && this.activePendingQuiz.type === "opening" && !this.activePendingQuiz.answered) {
                return;
            }
            const html = `
                <div class="modal-header-badge" style="background:rgba(197,155,39,0.22); border-color:#e5c365">
                    <span>⚡ THỬ THÁCH ĐẦU TRẬN: ĐUA TỐC ĐỘ XẾP THỨ TỰ LƯỢT CHƠI</span>
                    <span id="active-quiz-countdown" class="quiz-countdown-pill">⏱️ 01:00</span>
                </div>
                <h2 class="modal-title">Ai Trả Lời Đúng &amp; Nhanh Nhất Sẽ Xuất Phát Đầu Tiên!</h2>
                <p class="modal-desc">
                    Tất cả người chơi cùng trả lời câu hỏi Địa lý khởi động dưới đây trong <strong>60 giây</strong>. Thứ tự lượt đi sẽ xếp theo <strong>tốc độ trả lời chính xác</strong> của từng người.
                    ${localPlayer ? `<br/>⛵ <strong>Thuyền của bạn:</strong> <span style="color:${localPlayer.color}; font-weight:800">${localPlayer.name} (${localPlayer.vesselTitle})</span>` : ''}
                </p>
                <div class="quiz-box">
                    <div class="quiz-question">❓ ${quiz.q}</div>
                    <div class="quiz-options">
                        ${quiz.options.map((opt, idx) => `
                            <button class="quiz-opt-btn" onclick="window.GAME.submitOpeningQuizAnswer(${idx}, false)">
                                <span class="opt-letter">${String.fromCharCode(65 + idx)}</span>
                                <span>${opt}</span>
                            </button>
                        `).join("")}
                    </div>
                </div>
            `;
            this.startPendingQuiz({
                type: "opening",
                html,
                durationSec: 60,
                onTimeout: () => this.submitOpeningQuizAnswer(-1, true)
            });
            return;
        }

        // Phase B: Local player HAS answered -> Show Visual Memory Card (Answer + Photo + Citation) + Live Turn-Order Leaderboard
        const rankings = this.openingQuizState.rankings || [];
        const completed = Boolean(this.openingQuizState.completed);

        const leaderboardHtml = rankings.length === 0
            ? `<div style="color:#94a3b8; font-style:italic; padding:8px 0">⏳ Đang tổng hợp kết quả tốc độ của các thuyền trưởng...</div>`
            : rankings.map((r, idx) => `
                <div class="turn-order-leaderboard-row ${idx === 0 ? 'rank-1' : ''}">
                    <div style="display:flex; align-items:center; gap:10px">
                        <span class="slot-badge-num" style="background:${r.color}; width:26px; height:26px; font-size:12px">#${r.rank || (idx + 1)}</span>
                        <div>
                            <strong style="color:#e8eef4; font-size:13.5px">${r.name} ${r.isAI ? '🤖' : '👤'}</strong>
                            <span style="font-size:11.5px; color:#9be2b6; margin-left:6px">→ Đi lượt thứ ${r.rank || (idx + 1)}</span>
                        </div>
                    </div>
                    <div style="font-size:12.5px; font-weight:800; color:${r.correct ? '#9be2b6' : '#f2c0be'}">
                        ${r.correct ? '✅ Đúng' : '❌ Sai'} • ⏱️ ${(r.elapsedMs / 1000).toFixed(2)}s
                    </div>
                </div>
            `).join("");

        const html = `
            <div class="modal-header-badge" style="background:rgba(63,122,88,0.25); border-color:#579b73">
                <span>🏁 KẾT QUẢ XẾP THỨ TỰ LƯỢT CHƠI &amp; THẺ GHI NHỚ ĐỊA LÝ</span>
                <span class="badge-tag">${completed ? `⏱️ Tự bắt đầu sau <span id="quiz-autoclose-sec">10</span>s` : `Thời gian: ${(this.localOpeningElapsedMs / 1000).toFixed(2)}s`}</span>
            </div>
            <h2 class="modal-title">Bảng Xếp Hạng Thứ Tự Xuất Phát (Ai Nhanh Nhất Đi Trước)</h2>
            <div class="turn-order-leaderboard">
                ${leaderboardHtml}
            </div>
            ${this.renderQuizVisualMemoryCard(quiz, this.localOpeningChoice)}
            <div class="modal-actions" style="justify-content:space-between">
                <div style="font-size:12.5px; color:#a6b4c4">
                    ${completed
                        ? `✅ Đã xếp xong thứ tự lượt đi! <strong>${rankings[0] ? rankings[0].name : ''}</strong> xuất phát đầu tiên (Tự đóng sau <span id="quiz-autoclose-sec-sub">10</span>s).`
                        : `⏳ Đang chờ các người chơi khác trong phòng hoàn thành câu hỏi...`
                    }
                </div>
                ${completed ? `
                    <button class="btn-primary-gold" onclick="window.GAME.confirmStartMatchAfterOpeningQuiz()">
                        ⛵ Bắt Đầu Vòng 1 Ngay!
                    </button>
                ` : (!this.roomState.code ? `
                    <button class="btn-primary-gold" onclick="window.GAME.confirmStartMatchAfterOpeningQuiz()">
                        ⛵ Bắt Đầu Vòng 1 Ngay!
                    </button>
                ` : `
                    <button class="btn-primary-gold" onclick="window.GAME.confirmStartMatchAfterOpeningQuiz()">
                        ⛵ Vào Vòng 1 Ngay
                    </button>
                `)}
            </div>
        `;
        this.showModal(html);

        if (completed || !this.roomState.code) {
            this.startQuizResultAutoCloseTimer(10, () => {
                this.confirmStartMatchAfterOpeningQuiz();
            });
        }
    }

    async submitOpeningQuizAnswer(chosenIdx, isTimeout = false) {
        if (this.hasSubmittedOpeningAnswer || !this.openingQuizState) return;
        this.hasSubmittedOpeningAnswer = true;
        clearInterval(this.openingTimerInterval);
        this.clearPendingQuiz();

        const quiz = this.openingQuizState.quiz;
        const elapsedMs = isTimeout ? 60000 : Math.max(200, Date.now() - this.openingQuizStartMs);
        const isCorrect = !isTimeout && (chosenIdx === quiz.correct);

        this.localOpeningChoice = chosenIdx;
        this.localOpeningElapsedMs = elapsedMs;

        if (isCorrect) window.SFX.playCoin();
        else window.SFX.playClick();

        // Offline mode: simulate Bot AI speeds & sort players immediately (Human players always placed ahead of Bot AIs!)
        if (!this.roomState.code) {
            const entries = this.players.map(p => {
                if (!p.isAI) {
                    return {
                        player: p,
                        correct: isCorrect,
                        elapsedMs: elapsedMs,
                        chosenIdx
                    };
                }
                return {
                    player: p,
                    correct: Math.random() < 0.65,
                    elapsedMs: 3800 + Math.floor(Math.random() * 5200),
                    chosenIdx: 0
                };
            });

            entries.sort((a, b) => {
                if (a.player.isAI !== b.player.isAI) return a.player.isAI ? 1 : -1;
                if (a.correct !== b.correct) return a.correct ? -1 : 1;
                return a.elapsedMs - b.elapsedMs;
            });

            this.players = entries.map((e, idx) => {
                e.player.id = idx;
                e.player.turnRank = idx + 1;
                return e.player;
            });

            this.openingQuizState.completed = true;
            this.openingQuizState.rankings = entries.map((e, idx) => ({
                rank: idx + 1,
                name: e.player.name,
                color: e.player.color,
                isAI: e.player.isAI,
                correct: e.correct,
                elapsedMs: e.elapsedMs
            }));

            this.world.spawnShips(this.players, this.getLocalPlayer());
            this.updateUI();
            this.renderOpeningSpeedQuizView();
            return;
        }

        // Online Room mode: submit answer to server
        try {
            const resp = await fetch("/api/room/opening-answer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: this.roomState.code,
                    clientId: this.clientId,
                    seatIndex: this.roomState.localSeatIdx,
                    correct: isCorrect,
                    elapsedMs,
                    chosenIdx
                })
            });
            const data = await resp.json();
            if (data && data.ok && data.room) {
                this.roomState.version = data.room.version;
                this.openingQuizState = data.room.openingQuiz;
                if (data.room.gameState) {
                    this.players = data.room.gameState.players;
                    this.world.spawnShips(this.players, this.getLocalPlayer());
                    this.updateUI();
                }
            }
        } catch (e) {}

        this.renderOpeningSpeedQuizView();
    }

    async confirmStartMatchAfterOpeningQuiz() {
        clearInterval(this.preGameCountdownInterval);
        clearInterval(this.openingTimerInterval);
        clearInterval(this.quizAutoCloseInterval);
        this.currentQuizCloseCallback = null;
        this.isPreGameCountingDown = false;
        const banner = document.getElementById("pregame-countdown-banner");
        if (banner) banner.classList.add("hidden");
        if (this.openingQuizState) {
            this.openingQuizState.completed = true;
            this.openingQuizState.matchStarted = true;
        }

        this.closeModal();
        this.roomState.status = "playing";
        this.activePlayerIdx = 0;

        if (this.roomState.code) {
            try {
                const resp = await fetch("/api/room/begin-play", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: this.roomState.code })
                });
                const data = await resp.json();
                if (data && data.ok && data.room && data.room.gameState) {
                    this.roomState.version = data.room.version;
                    this.players = data.room.gameState.players;
                }
            } catch (e) {}
        }

        this.ensureValidPlayerPositions();

        const firstPlayer = this.players[0];
        if (firstPlayer) {
            this.logEvent(`🏁 Đua tốc độ đầu trận hoàn tất! Thứ tự lượt đi: ${this.players.map((p, i) => `#${i + 1} ${p.name}`).join(" → ")}.`);
            this.showToast(`⛵ ${firstPlayer.name} xuất phát Lượt 1! Hãy bấm vào các ô nước trên biển để di chuyển thuyền!`);
        }

        this.world.spawnShips(this.players, this.getLocalPlayer());
        this.beginTurn();
        this.announceLocalPlayerSpawnAndFocus();
    }

    // ========================================================================
    // REAL-TIME ROOM SYNC, SHARED MAP & LIVE QUIZ BROADCAST
    // ========================================================================
    startRoomPolling() {
        clearInterval(this.roomPollTimer);
        if (!this.roomState.code) return;
        this.connectRoomChatStream(this.roomState.code);
        this.isPollingRoom = false;

        this.roomPollTimer = setInterval(async () => {
            if (!this.roomState.code || this.isPollingRoom) return;
            this.isPollingRoom = true;
            try {
                const resp = await fetch(`/api/room/status?code=${this.roomState.code}&v=${this.roomState.version || 0}&clientId=${encodeURIComponent(this.clientId || "")}`);
                const data = await resp.json();
                if (data && data.publicUrl) {
                    this.publicOnlineUrl = data.publicUrl;
                }
                if (data && data.roomClosed) {
                    sessionStorage.removeItem("golden_active_room_code");
                    clearInterval(this.roomPollTimer);
                    this.roomState.code = null;
                    this.roomState.isHost = false;
                    this.roomState.status = "waiting";
                    this.lobbySubView = "welcome";
                    this.updateRoomBadgeUI();
                    this.showWaitingScreen();
                    this.showToast("ℹ️ Phòng chơi đã được đóng.");
                    return;
                }
                if (data && data.unchanged) {
                    return;
                }
                if (data && data.ok && data.room) {
                    const r = data.room;
                    const prevStatus = this.roomState.status;
                    const prevWasHost = this.roomState.isHost;
                    const versionChanged = r.version !== this.roomState.version;
                    this.roomState.version = r.version;
                    this.roomState.roomName = r.roomName || this.roomState.roomName;
                    this.roomState.isPrivate = Boolean(r.isPrivate);
                    this.roomState.seats = r.seats;
                    this.roomState.status = r.status;

                    // Update local seat & check if Host role was transferred to this player!
                    const mySeat = (r.seats || []).find(s => s.clientId === this.clientId);
                    if (mySeat) {
                        this.roomState.localSeatIdx = mySeat.seatIndex;
                        this.roomState.isHost = Boolean(mySeat.isHost);
                        if (!prevWasHost && this.roomState.isHost) {
                            this.logEvent("👑 Quyền Chủ phòng đã tự động chuyển sang bạn để điều phối trận đấu & các Tàu Máy (Bot).");
                            this.showToast("👑 Chủ phòng trước đã rời đi — Quyền Chủ phòng đã được chuyển cho bạn!");
                        }
                    } else if (!this.isGameStarted) {
                        // Local player was removed from seat by host
                        sessionStorage.removeItem("golden_active_room_code");
                        clearInterval(this.roomPollTimer);
                        this.roomState.code = null;
                        this.roomState.isHost = false;
                        this.lobbySubView = "welcome";
                        this.renderWaitingScreen();
                        this.showToast("ℹ️ Bạn đã rời khỏi phòng chờ.");
                        return;
                    }

                    if (Array.isArray(r.chatHistory) && r.chatHistory.length > 0) {
                        this.handleIncomingChatMessages(r.chatHistory, this.roomChatMessages.length === 0);
                    }

                    // Log any new Bot Takeover / Handover events (1 line to Nhật Ký + Toast)
                    if (Array.isArray(r.takeoverEvents) && r.takeoverEvents.length > 0) {
                        if (!this._seenTakeoverEventIds) this._seenTakeoverEventIds = new Set();
                        r.takeoverEvents.forEach(ev => {
                            if (ev && ev.id && !this._seenTakeoverEventIds.has(ev.id)) {
                                this._seenTakeoverEventIds.add(ev.id);
                                this.logEvent(ev.text);
                                this.showToast(ev.text);
                            }
                        });
                    }

                    // 1. Still on Waiting Screen -> Check if Host started Opening Speed Quiz or Match
                    if (!this.isGameStarted) {
                        if (r.status === "turn_order_quiz" && r.gameState) {
                            this.hideWaitingScreenAndShowHUD();
                            this.applySerializedGameState(r.gameState, true);
                            if (r.openingQuiz) {
                                this.startOpeningSpeedQuizModal(r.openingQuiz);
                            }
                            this.showToast(`⚡ Bắt đầu Câu Hỏi Tốc Độ Đầu Trận [Phòng ${this.roomState.code}]!`);
                        } else if (r.status === "playing" && r.gameState) {
                            this.hideWaitingScreenAndShowHUD();
                            this.applySerializedGameState(r.gameState, true);
                            this.showToast(`🚀 Trận đấu Phòng [${this.roomState.code}] đã bắt đầu!`);
                        } else if (versionChanged) {
                            this.renderWaitingScreen();
                        }
                        return;
                    }

                    // 2. Currently in Opening Speed Quiz phase
                    if (r.status === "turn_order_quiz") {
                        if (r.openingQuiz) {
                            this.openingQuizState = r.openingQuiz;
                            if (r.gameState && r.gameState.players) {
                                this.players = r.gameState.players;
                                this.world.syncShipsSmoothly(this.players, this.getLocalPlayer());
                                this.updateUI();
                            }
                            if (this.hasSubmittedOpeningAnswer) {
                                this.renderOpeningSpeedQuizView();
                            }
                        }
                        return;
                    }

                    // 3. Transitioned from Opening Speed Quiz -> Playing
                    if (prevStatus === "turn_order_quiz" && r.status === "playing" && r.gameState) {
                        this.closeModal();
                        this.applySerializedGameState(r.gameState, false);
                        const myP = this.getLocalPlayer() || this.players[0];
                        const firstP = this.players[0];
                        if (myP) {
                            this.world.focusCameraOnHex(myP.q, myP.r);
                        }
                        if (firstP) {
                            this.showToast(`⛵ Vòng 1 bắt đầu! Lượt đầu tiên thuộc về ${firstP.name}!`);
                        }
                        return;
                    }

                    // 3b. Transitioned from Playing -> Waiting (After 15s Victory Celebration)
                    if (prevStatus !== "waiting" && r.status === "waiting") {
                        clearInterval(this.victoryCountdownInterval);
                        document.getElementById("modal-overlay").classList.add("hidden");
                        this.showWaitingScreen();
                        this.showToast("🏁 Ván đấu đã kết thúc — Toàn bộ người chơi đã trở lại Phòng chờ!");
                        return;
                    }

                    // 4. Live Match Synchronization (Shared Map + Live Spectator Quiz + Bot Takeover Turn Kickoff)
                    if (r.status === "playing" && r.gameState && versionChanged && !this.isBusy) {
                        this.applySerializedGameState(r.gameState, false);
                    } else if (r.status === "playing" && this.roomState.isHost && !this.isBusy && !this.matchWinner) {
                        this.scheduleHostBotTurnIfNeeded();
                    }
                }
            } catch (e) {
            } finally {
                this.isPollingRoom = false;
            }
        }, 850);
    }

    serializeGameState() {
        const resourceCooldowns = {};
        const lockedMonuments = [];
        let rareNPCHex = null;
        this.world.hexTiles.forEach(t => {
            if (t.resourceCooldown > 0) {
                resourceCooldowns[`${t.q},${t.r}`] = t.resourceCooldown;
            }
            if (t.monumentId && t.monumentLocked) {
                lockedMonuments.push(t.monumentId);
            }
            if (t.hasNPC) {
                rareNPCHex = { q: t.q, r: t.r };
            }
        });

        return {
            roundNumber: this.roundNumber,
            activePlayerIdx: this.activePlayerIdx,
            sandboxMode: Boolean(this.sandboxMode),
            monumentAssignments: this.monumentAssignments,
            lockedMonuments,
            exhaustedTiersNotified: Array.from(this.exhaustedTiersNotified || []),
            players: this.players,
            marketListings: this.marketListings,
            buyOrders: this.buyOrders || [],
            barterOrders: this.barterOrders || [],
            tradeBulletinNotices: this.tradeBulletinNotices,
            portInventories: this.portInventories,
            portResetRemainingSec: this.portResetRemainingSec,
            portResourceStock: this.portResourceStock,
            portResResetRemainingSec: this.portResResetRemainingSec,
            activePublicQuests: this.activePublicQuests || [],
            matchStats: this.matchStats || { portTrades: {}, portVisits: {}, totalP2P: 0, disasterDamage: 0, stormReefDamage: 0 },
            matchElapsedSec: this.matchElapsedSec,
            isMatchClockFrozen: Boolean(this.isMatchClockFrozen),
            currentWeatherPhase: this.currentWeatherPhase,
            blockedMineIds: this.blockedMineIds || [],
            resourceCooldowns,
            rareNPCHex,
            liveQuizState: this.liveQuizState,
            lastEmoteEvent: this.lastEmoteEvent || null,
            matchWinner: this.matchWinner
        };
    }

    applySerializedGameState(state, rebuildBoard = false) {
        if (!state || !state.players) return;

        if (!state.sandboxMode) {
            this.disableSandboxCreativeMode();
        }

        const prevActiveIdx = this.activePlayerIdx;
        const prevRound = this.roundNumber;

        if (rebuildBoard && state.monumentAssignments) {
            this.monumentAssignments = state.monumentAssignments;
            this.world.buildBoard(this.monumentAssignments);
            this.startMatchClockAndWeatherEngine();
        }

        if (Array.isArray(state.lockedMonuments) && this.world && this.world.hexTiles) {
            const lockedSet = new Set(state.lockedMonuments);
            this.world.hexTiles.forEach(t => {
                if (t.monumentId) t.monumentLocked = lockedSet.has(t.monumentId);
            });
        }
        if (Array.isArray(state.exhaustedTiersNotified)) {
            this.exhaustedTiersNotified = new Set(state.exhaustedTiersNotified);
        }
        if (Array.isArray(state.blockedMineIds)) {
            this.blockedMineIds = [...state.blockedMineIds];
            if (this.world && Array.isArray(this.world.hexTiles)) {
                const blockedSet = new Set(this.blockedMineIds);
                this.world.hexTiles.forEach(t => {
                    t.stormRestricted = Boolean(t.resourceType && blockedSet.has(`${t.q},${t.r}`));
                });
                this.world.updateResourceVisuals();
            }
        }
        this.roundNumber = state.roundNumber;
        this.activePlayerIdx = state.activePlayerIdx;
        this.marketListings = state.marketListings || this.marketListings;
        if (Array.isArray(state.buyOrders)) {
            this.buyOrders = state.buyOrders;
        }
        if (Array.isArray(state.barterOrders)) {
            this.barterOrders = state.barterOrders;
        }
        if (Array.isArray(state.tradeBulletinNotices)) {
            this.tradeBulletinNotices = state.tradeBulletinNotices;
        }
        if (state.portInventories && typeof state.portInventories === "object") {
            this.portInventories = state.portInventories;
        }
        if (typeof state.portResetRemainingSec === "number") {
            this.portResetRemainingSec = state.portResetRemainingSec;
        }
        if (state.portResourceStock && typeof state.portResourceStock === "object") {
            this.portResourceStock = state.portResourceStock;
        }
        if (typeof state.portResResetRemainingSec === "number") {
            this.portResResetRemainingSec = state.portResResetRemainingSec;
        }
        if (Array.isArray(state.activePublicQuests)) {
            this.activePublicQuests = state.activePublicQuests;
        }
        if (state.matchStats && typeof state.matchStats === "object") {
            this.matchStats = state.matchStats;
        }
        if (state.lastEmoteEvent && state.lastEmoteEvent.id && state.lastEmoteEvent.id !== this._lastRenderedEmoteId) {
            this._lastRenderedEmoteId = state.lastEmoteEvent.id;
            if (Date.now() - (state.lastEmoteEvent.ts || 0) < 6000 && this.world && this.world.showShipEmoteBubble) {
                this.world.showShipEmoteBubble(state.lastEmoteEvent.shipKey, state.lastEmoteEvent.text, 3500);
            }
        }
        if (typeof state.matchElapsedSec === "number" && !this.roomState.isHost) {
            this.matchElapsedSec = state.matchElapsedSec;
        }
        if (typeof state.isMatchClockFrozen === "boolean" && !this.roomState.isHost) {
            this.isMatchClockFrozen = state.isMatchClockFrozen;
        }
        if (state.currentWeatherPhase && state.currentWeatherPhase !== this.currentWeatherPhase) {
            this.applyWeatherPhase(state.currentWeatherPhase, false);
        }
        this.players = state.players;
        this.ensureValidPlayerPositions();

        if (state.resourceCooldowns) {
            this.world.hexTiles.forEach(t => {
                t.resourceCooldown = state.resourceCooldowns[`${t.q},${t.r}`] || 0;
            });
            this.world.updateResourceVisuals();
        }
        this.syncMonumentVisuals3D();

        // Rebuild ships only on initial load; otherwise smoothly glide ships so spectator camera is never disturbed!
        if (rebuildBoard || this.world.shipMeshes.size !== this.players.length) {
            this.world.spawnShips(this.players, this.getLocalPlayer());
        } else {
            this.world.syncShipsSmoothly(this.players, this.getLocalPlayer());
        }

        // Check if someone won the match (Total Public + Secret >= 15) -> Reveal Secret Points & Show Victory Screen!
        const winnerFromState = state.matchWinner || this.players.find(pl => this.getTotalProsperity(pl) >= 15);
        if (winnerFromState && !this.victoryShownForMatch) {
            this.matchWinner = winnerFromState;
            this.refreshReachableHexes();
            this.updateUI();
            this.showVictoryScreen(winnerFromState);
            return;
        }

        // If turn switched OR active player was just taken over by Bot, ensure Host drives the Bot turn!
        const activeP = this.getActivePlayer();
        if (prevActiveIdx !== this.activePlayerIdx || prevRound !== this.roundNumber) {
            this.showingSpectatorQuizId = null;
            this.showingAnsweredSpectatorQuizId = null;
            this.syncAfkAutoNoticeUI();
            this.spectatorClosedAskingQuizId = null;
            this.spectatorHiddenAnsweredQuizId = null;
            this.lastSpectatorQuizSnapshot = null;

            if (activeP && this.isMyTurn()) {
                const myP = this.getLocalPlayer() || activeP;
                window.SFX.playTurnStart();
                this.world.focusCameraOnHex(myP.q, myP.r);
                this.showToast(`🎯 Đã tới lượt của bạn (${myP.name})! Bạn có ${myP.ap} AP (Tối đa 3 AP di chuyển).`);
            }
        }
        if (activeP && activeP.isAI && (!this.roomState.code || this.roomState.isHost)) {
            this.scheduleHostBotTurnIfNeeded();
        }

        // Handle Live Shared Quiz Broadcast for Spectators (with 10s Auto-Close or Instant Close)
        this.liveQuizState = state.liveQuizState || null;
        if (!this.isMyTurn() && this.liveQuizState) {
            this.renderSpectatorLiveQuiz(this.liveQuizState);
        }

        this.refreshReachableHexes();
        this.updateUI();
    }

    scheduleHostBotTurnIfNeeded() {
        if (!this.isGameStarted || this.isBusy || this.matchWinner) return;
        if (this.roomState.code && !this.roomState.isHost) return;
        const activeP = this.getActivePlayer();
        if (!activeP || !activeP.isAI || activeP.eliminated) return;

        const key = `${this.roundNumber}_${this.activePlayerIdx}_${activeP.id}_${activeP.name}`;
        if (this._scheduledBotTurnKey === key) return;
        this._scheduledBotTurnKey = key;

        setTimeout(() => {
            if (this.isGameStarted && !this.isBusy && !this.matchWinner) {
                const curP = this.getActivePlayer();
                if (curP && curP.isAI && !curP.eliminated && (!this.roomState.code || this.roomState.isHost)) {
                    this.executeAITurn();
                }
            }
        }, 750);
    }

    async syncMultiplayerGameState() {
        if (!this.roomState.code) return;
        const snapshot = this.serializeGameState();
        this.saveRoomToLocalStorage(snapshot);
        try {
            const resp = await fetch("/api/room/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: this.roomState.code, clientId: this.clientId, gameState: snapshot })
            });
            const data = await resp.json();
            if (data && data.version) {
                this.roomState.version = data.version;
            }
        } catch (e) {}
        this.broadcastRoomMessage({
            type: "ROOM_STATE_SYNC",
            code: this.roomState.code,
            version: this.roomState.version,
            gameState: snapshot
        });
    }

    saveRoomToLocalStorage(gameState = null) {
        if (!this.roomState.code) return;
        try {
            sessionStorage.setItem("golden_active_room_code", this.roomState.code);
            const payload = { ...this.roomState, gameState };
            localStorage.setItem(`golden_room_${this.roomState.code}`, JSON.stringify(payload));
        } catch (e) {}
    }

    broadcastRoomMessage(msg) {
        if (this.roomChannel) {
            try {
                this.roomChannel.postMessage(msg);
            } catch (e) {}
        }
    }

    handleRoomBroadcast(data) {
        if (!data || !this.roomState.code) return;
        if (data.type === "ROOM_UPDATED" && data.roomState && data.roomState.code === this.roomState.code) {
            this.roomState.seats = data.roomState.seats;
            this.roomState.version = data.roomState.version;
            this.updateRoomBadgeUI();
            if (!this.isGameStarted) {
                this.renderWaitingScreen();
            }
        } else if (data.type === "ROOM_OPENING_QUIZ_STARTED" && data.roomState && data.roomState.code === this.roomState.code) {
            this.roomState.status = "turn_order_quiz";
            this.hideWaitingScreenAndShowHUD();
            this.applySerializedGameState(data.gameState, true);
            if (data.openingQuiz) {
                this.startOpeningSpeedQuizModal(data.openingQuiz);
            }
        } else if (data.type === "QUICK_EMOTE" && data.code === this.roomState.code && data.emote) {
            if (data.emote.id !== this._lastRenderedEmoteId) {
                this._lastRenderedEmoteId = data.emote.id;
                this.lastEmoteEvent = data.emote;
                if (this.world && this.world.showShipEmoteBubble) {
                    this.world.showShipEmoteBubble(data.emote.shipKey, data.emote.text, 3500);
                }
            }
        } else if (data.type === "ROOM_STATE_SYNC" && data.code === this.roomState.code) {
            if (!this.isBusy) {
                this.applySerializedGameState(data.gameState, false);
            }
        }
    }

    updateRoomBadgeUI() {
        const pill = document.getElementById("room-code-pill");
        if (!pill) return;
        if (this.roomState.code) {
            pill.textContent = `🔑 Phòng: ${this.roomState.code}`;
            pill.classList.remove("hidden");
        } else {
            pill.classList.add("hidden");
        }
    }

    // ------------------------------------------------------------------------
    // SPECTATOR LIVE QUIZ RENDERER & 10-SECOND AUTO-CLOSE / INSTANT CLOSE
    // - Spectators can close the asking quiz at any time to interact with map/market.
    // - Once answered ("answered"), the result modal shows for 10s then auto-closes,
    //   or can be closed immediately at any time (no reopen/review button).
    // ------------------------------------------------------------------------
    renderSpectatorLiveQuiz(liveQuiz) {
        if (!liveQuiz || !liveQuiz.quiz) return;
        this.showingSpectatorQuizId = liveQuiz.id;
        const quiz = liveQuiz.quiz;

        if (liveQuiz.phase === "asking") {
            if (this.spectatorClosedAskingQuizId === liveQuiz.id) {
                return;
            }

            const html = `
                <div class="spectator-quiz-banner">
                    <span>👁️ ĐANG XEM LƯỢT CỦA <strong>${liveQuiz.actorName.toUpperCase()}</strong></span>
                    <span class="badge-tag">Chỉ ${liveQuiz.actorName} được chọn đáp án</span>
                </div>
                <div class="modal-header-badge" style="background:${liveQuiz.badgeColor || '#2d6878'}33; border-color:${liveQuiz.badgeColor || '#5c9ead'}">
                    <span>${liveQuiz.badgeTitle || '❓ CÂU HỎI ĐỊA LÝ TRỰC TIẾP TRÊN BẢN ĐỒ CHUNG'}</span>
                </div>
                <h2 class="modal-title">${liveQuiz.title}</h2>
                <p class="modal-desc">${liveQuiz.desc}</p>
                <div class="quiz-box">
                    <div class="quiz-question">❓ ${quiz.q}</div>
                    <div class="quiz-options">
                        ${quiz.options.map((opt, idx) => `
                            <button class="quiz-opt-btn spectator-disabled" disabled>
                                <span class="opt-letter">${String.fromCharCode(65 + idx)}</span>
                                <span>${opt}</span>
                            </button>
                        `).join("")}
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-top:10px">
                    <div style="font-size:12px; color:#e5c365; font-weight:700">
                        ⏳ Đang chờ ${liveQuiz.actorName} suy nghĩ và chọn đáp án...
                    </div>
                    <button class="btn-secondary" onclick="window.GAME.spectatorCloseQuizDuringAsking('${liveQuiz.id}')">
                        ✕ Đóng Cửa Sổ Ngay
                    </button>
                </div>
            `;
            this.showModal(html);
        } else if (liveQuiz.phase === "answered") {
            if (this.spectatorHiddenAnsweredQuizId === liveQuiz.id || this.showingAnsweredSpectatorQuizId === liveQuiz.id) {
                return;
            }
            this.showingAnsweredSpectatorQuizId = liveQuiz.id;

            const chosenIdx = liveQuiz.chosenIdx;
            const isCorrect = (chosenIdx === quiz.correct);
            const chosenLetter = String.fromCharCode(65 + chosenIdx);

            const html = `
                <div class="spectator-quiz-banner">
                    <span>👁️ KẾT QUẢ TRẢ LỜI CỦA <strong>${liveQuiz.actorName.toUpperCase()}</strong>: Chọn phương án <strong>${chosenLetter}</strong> (${isCorrect ? '✅ CHÍNH XÁC' : '❌ CHƯA ĐÚNG'})</span>
                    <span class="badge-tag">⏱️ Tự đóng sau <span id="quiz-autoclose-sec">10</span>s</span>
                </div>
                <h2 class="modal-title">${liveQuiz.outcomeTitle || `Kết Quả Khảo Nghiệm Của ${liveQuiz.actorName}`}</h2>
                ${this.renderQuizVisualMemoryCard(quiz, chosenIdx, liveQuiz.actorName)}
                <div class="modal-actions" style="justify-content:space-between">
                    <span style="font-size:12px; color:#fbbf24; font-weight:700">⏳ Tự động đóng cửa sổ sau <span id="quiz-autoclose-sec-sub">10</span> giây...</span>
                    <button class="btn-primary-gold" onclick="window.GAME.spectatorHideAnsweredQuiz('${liveQuiz.id}')">
                        ✕ Đóng Ngay Lập Tức
                    </button>
                </div>
            `;
            this.showModal(html);
            this.startQuizResultAutoCloseTimer(10, () => {
                this.spectatorHideAnsweredQuiz(liveQuiz.id);
            });
        }
    }

    startQuizResultAutoCloseTimer(seconds = 10, onAutoClose = null) {
        clearInterval(this.quizAutoCloseInterval);
        let secLeft = seconds;
        this.currentQuizCloseCallback = onAutoClose || (() => this.closeModal());

        this.quizAutoCloseInterval = setInterval(() => {
            secLeft -= 1;
            const el1 = document.getElementById("quiz-autoclose-sec");
            const el2 = document.getElementById("quiz-autoclose-sec-sub");
            if (el1) el1.textContent = String(Math.max(0, secLeft));
            if (el2) el2.textContent = String(Math.max(0, secLeft));
            if (secLeft <= 0) {
                clearInterval(this.quizAutoCloseInterval);
                if (this.currentQuizCloseCallback) {
                    const cb = this.currentQuizCloseCallback;
                    this.currentQuizCloseCallback = null;
                    cb();
                } else {
                    this.closeModal();
                }
            }
        }, 1000);
    }

    closeQuizResultNow() {
        clearInterval(this.quizAutoCloseInterval);
        if (this.currentQuizCloseCallback) {
            const cb = this.currentQuizCloseCallback;
            this.currentQuizCloseCallback = null;
            cb();
        } else {
            this.closeModal();
        }
    }

    spectatorCloseQuizDuringAsking(quizId) {
        clearInterval(this.quizAutoCloseInterval);
        this.spectatorClosedAskingQuizId = quizId;
        document.getElementById("modal-overlay").classList.add("hidden");
        const actorName = (this.liveQuizState && this.liveQuizState.actorName) ? this.liveQuizState.actorName : "người chơi trong lượt";
        this.showToast(`👁️ Đã đóng cửa sổ câu hỏi. Cửa sổ đáp án sẽ hiện lên khi ${actorName} trả lời xong!`);
    }

    spectatorHideAnsweredQuiz(quizId) {
        clearInterval(this.quizAutoCloseInterval);
        this.spectatorHiddenAnsweredQuizId = quizId;
        this.currentQuizCloseCallback = null;
        document.getElementById("modal-overlay").classList.add("hidden");
    }

    updateSpectatorQuizPillUI() {
        // Review button removed per user request (replaced by 10s auto-close / instant close)
    }

    // ------------------------------------------------------------------------
    // COLLAPSIBLE / MINIMIZABLE HUD WINDOWS & CLEAN VIEW MODE
    // ------------------------------------------------------------------------
    togglePanel(panelId) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        panel.classList.toggle("collapsed");
        const btn = panel.querySelector(".panel-collapse-btn");
        if (btn) {
            btn.textContent = panel.classList.contains("collapsed") ? "＋" : "✕";
            btn.title = panel.classList.contains("collapsed") ? "Mở lại cửa sổ" : "Đóng / Thu gọn cửa sổ";
        }
    }

    toggleAllPanelsCleanMode() {
        this.cleanUIMode = !this.cleanUIMode;
        const panels = ["panel-regions", "panel-roster", "panel-captain", "panel-log"];
        panels.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (this.cleanUIMode) {
                el.classList.add("collapsed");
            } else {
                el.classList.remove("collapsed");
            }
            const btn = el.querySelector(".panel-collapse-btn");
            if (btn) btn.textContent = this.cleanUIMode ? "＋" : "✕";
        });
        const toggleBtn = document.getElementById("btn-toggle-clean-ui");
        if (toggleBtn) {
            toggleBtn.innerHTML = this.cleanUIMode ? "👁️ Hiện Cửa Sổ" : "👁️ Thu Gọn UI";
        }
    }

    // ------------------------------------------------------------------------
    // QUIZ SHUFFLER + POST-QUIZ VISUAL MEMORY CARD (WITH QUESTION RECAP & CITATIONS)
    // ------------------------------------------------------------------------
    prepareShuffledQuiz(rawQuiz) {
        const indexedOptions = rawQuiz.options.map((text, idx) => ({
            text,
            isCorrect: idx === rawQuiz.correct
        }));
        for (let i = indexedOptions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indexedOptions[i], indexedOptions[j]] = [indexedOptions[j], indexedOptions[i]];
        }
        const newCorrectIdx = indexedOptions.findIndex(o => o.isCorrect);
        const correctLetter = String.fromCharCode(65 + newCorrectIdx);
        return {
            q: rawQuiz.q,
            options: indexedOptions.map(o => o.text),
            correct: newCorrectIdx,
            correctLetter: correctLetter,
            correctText: indexedOptions[newCorrectIdx].text,
            explanation: rawQuiz.explanation,
            visualImg: rawQuiz.visualImg || "assets/monuments/halong.jpg",
            visualCaption: rawQuiz.visualCaption || "Hình ảnh thực tế minh họa kiến thức Địa lý Việt Nam.",
            visualCredit: rawQuiz.visualCredit || "Nguồn ảnh: Wikimedia Commons • Tham khảo: SGK Địa lý 12 (NXB Giáo dục Việt Nam)"
        };
    }

    renderQuizVisualMemoryCard(quiz, chosenIdx, actorLabel = null) {
        const isCorrect = (chosenIdx === quiz.correct);
        const chosenLetter = String.fromCharCode(65 + chosenIdx);
        const chosenText = quiz.options[chosenIdx] || "";
        const whoText = actorLabel ? `<strong>${actorLabel}</strong> đã chọn` : `<strong>Bạn</strong> đã chọn`;

        return `
            <div class="quiz-memory-card">
                <div class="memory-question-recap">
                    ❓ <strong>Câu hỏi:</strong> ${quiz.q}
                </div>
                <div class="answer-verdict-strip ${isCorrect ? 'verdict-correct' : 'verdict-wrong'}">
                    <div class="verdict-user-choice">
                        ${isCorrect
                            ? `🎯 ${whoText} chính xác: <strong>Phương án ${chosenLetter}. ${chosenText}</strong>`
                            : `⚠️ ${whoText}: <strong>${chosenLetter}. ${chosenText}</strong> <em>(Chưa chính xác)</em>`
                        }
                    </div>
                    <div class="verdict-correct-box">
                        ✅ <strong>ĐÁP ÁN ĐÚNG CẦN GHI NHỚ:</strong>
                        <span class="correct-highlight">${quiz.correctLetter}. ${quiz.correctText}</span>
                    </div>
                </div>

                <div class="visual-memory-grid">
                    <div class="visual-memory-photo-wrap">
                        <img src="${quiz.visualImg}" alt="Hình minh họa kiến thức Địa lý" class="visual-memory-img atlas-zoomable-img"
                             title="Bấm để phóng to hình ảnh &amp; xem nguồn gốc"
                             onclick="window.GAME && window.GAME.openAtlasLightboxByVisual(this.getAttribute('src'), this.dataset.caption, this.dataset.credit)"
                             data-caption="${String(quiz.visualCaption || '').replace(/"/g, '&quot;')}"
                             data-credit="${String(quiz.visualCredit || '').replace(/"/g, '&quot;')}" />
                        <div class="visual-memory-caption">
                            📸 <strong>Minh họa thực tế:</strong> ${quiz.visualCaption}
                        </div>
                        <div class="visual-memory-credit">
                            ⚖️ <strong>Nguồn ảnh &amp; Trích dẫn:</strong> ${quiz.visualCredit}
                        </div>
                    </div>

                    <div class="visual-memory-explanation">
                        <div class="memory-exp-title">📘 Giải Thích &amp; Ghi Nhớ Kiến Thức Địa Lý</div>
                        <p class="memory-exp-text">${quiz.explanation}</p>
                        <div class="memory-tip-box">
                            💡 <strong>Mẹo ghi nhớ nhanh:</strong> Hãy quan sát hình ảnh thực tế bên cạnh gắn liền với từ khóa <em>"${quiz.correctText}"</em> để nhớ lâu kiến thức vùng kinh tế này!
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    randomizeMonumentTiers() {
        // 9 Di tích tỷ lệ 2 Cấp 1 – 4 Cấp 2 – 3 Cấp 3, rải đều 3 miền Bắc – Trung – Nam!
        const zones = [
            ["mon_sapa", "mon_halong", "mon_vanmieu"],
            ["mon_phongnha", "mon_hue", "mon_myson"],
            ["mon_taynguyen", "mon_bennharong", "mon_cairang"]
        ];
        // Pick 1 random zone to hold [2, 2, 3], while the other 2 zones hold [1, 2, 3] => Total: 2x Tier1, 4x Tier2, 3x Tier3
        const noTier1ZoneIdx = Math.floor(Math.random() * 3);
        const map = {};
        zones.forEach((zoneIds, zIdx) => {
            const zTiers = (zIdx === noTier1ZoneIdx) ? [2, 2, 3] : [1, 2, 3];
            for (let i = zTiers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [zTiers[i], zTiers[j]] = [zTiers[j], zTiers[i]];
            }
            zoneIds.forEach((id, idx) => {
                map[id] = zTiers[idx];
            });
        });
        return map;
    }

    isEarlyGameMonumentLockActive() {
        return !this.sandboxMode && (this.matchElapsedSec || 0) < 510; // 00:00 – 08:30 (510s)
    }

    getMaxCargo(player) {
        return (player && player.maxCargo) ? player.maxCargo : 12;
    }

    getRegionShortName(regionId) {
        const names = {
            0: "Bắc Bộ",
            1: "Sông Hồng",
            2: "Miền Trung",
            3: "Tây Nguyên",
            4: "Đông Nam Bộ (Tự Do)",
            5: "Cửu Long"
        };
        return names[regionId] !== undefined ? names[regionId] : "Tự Do";
    }

    getPortCharterOwner(regionId) {
        // Vùng 4 (Đông Nam Bộ) luôn là Vùng Tự Do (Thuế 0 Xu)
        if (regionId === 4 || regionId === null || regionId === undefined) return null;
        return (this.players || []).find(pl => !pl.eliminated && pl.charterRegionId === regionId) || null;
    }

    // ------------------------------------------------------------------------
    // KEY-1: KIỂM TRA CẤP DI TÍCH CÒN KHẢ DỤNG & KHÓA TỨC THÌ KHI CHINH PHỤC HẾT
    // ------------------------------------------------------------------------
    isTierExhausted(tier) {
        const tNum = Number(tier);
        if (![1, 2, 3].includes(tNum)) return true;
        if (!this.world || !Array.isArray(this.world.hexTiles) || this.world.hexTiles.length === 0) return false;
        const tierTiles = this.world.hexTiles.filter(t => t.monumentId && t.monumentTier === tNum);
        if (tierTiles.length === 0) return true;

        // 1. Nếu toàn bộ Di tích của cấp này đã bị khóa (VD: Cấp 3 có 3 Di tích đều đã giải) -> Hết cấp!
        if (tierTiles.every(t => Boolean(t.monumentLocked))) return true;

        // 2. Quét trên toàn bộ người chơi còn sống: nếu KHÔNG còn ai có thể chinh phục thêm Di tích cấp này -> Hết cấp!
        const alivePlayers = (this.players || []).filter(pl => !pl.eliminated);
        if (alivePlayers.length === 0) return false;

        if (tNum === 1 && alivePlayers.every(pl => (pl.tier1Visited || 0) >= 1)) {
            return true;
        }
        const anyConquerableLeft = tierTiles.some(tile => {
            if (tile.monumentLocked) return false;
            return alivePlayers.some(pl => {
                if (tNum === 1 && (pl.tier1Visited || 0) >= 1) return false;
                return !(pl.relics || []).some(r => r.id === tile.monumentId);
            });
        });
        return !anyConquerableLeft;
    }

    getActiveMonumentTiers() {
        return [1, 2, 3].filter(tier => !this.isTierExhausted(tier));
    }

    checkAndNotifyExhaustedMonumentTier(tier) {
        const tNum = Number(tier);
        if (![1, 2, 3].includes(tNum)) return;
        if (!this.exhaustedTiersNotified) this.exhaustedTiersNotified = new Set();
        if (this.isTierExhausted(tNum) && !this.exhaustedTiersNotified.has(tNum)) {
            this.exhaustedTiersNotified.add(tNum);
            const msg = `🏛️ Toàn bộ Di tích Cấp ${tNum} đã được chinh phục! Các Thương Cảng ngừng bán Key ${tNum}.`;
            this.logEvent(msg);
            this.addTradeBulletinNotice(msg);
            this.showToast(msg);
        }
    }

    syncMonumentVisuals3D() {
        if (!this.world || typeof this.world.updateMonumentVisuals !== "function") return;
        const earlyLock = this.isEarlyGameMonumentLockActive();
        const conquerorsMap = {};
        if (Array.isArray(this.world.hexTiles)) {
            this.world.hexTiles.forEach(t => {
                if (t.monumentId && t.monumentConqueror && t.monumentConqueror.name) {
                    conquerorsMap[t.monumentId] = t.monumentConqueror;
                }
            });
        }
        (this.players || []).forEach(pl => {
            (pl.relics || []).forEach(r => {
                if (r && r.id && !conquerorsMap[r.id]) {
                    conquerorsMap[r.id] = { name: pl.name, color: pl.color };
                }
            });
        });
        this.world.updateMonumentVisuals(earlyLock, conquerorsMap);
    }

    syncPortOwnershipVisuals3D() {
        if (!this.world || typeof this.world.updatePortOwnershipVisuals !== "function") return;
        const viewer = this.getLocalPlayer() || this.getActivePlayer();
        const viewerCoins = viewer ? (viewer.coins || 0) : 0;
        const states = {};
        for (let regId = 0; regId < 6; regId++) {
            const owner = this.getPortCharterOwner(regId);
            if (!owner) {
                states[regId] = { mode: "free", ownerName: "", ownerColor: "#38bdf8", needsCoinWarning: false };
            } else if (viewer && owner.id === viewer.id) {
                states[regId] = { mode: "mine", ownerName: owner.name, ownerColor: owner.color, needsCoinWarning: false };
            } else {
                states[regId] = {
                    mode: "other",
                    ownerName: owner.name,
                    ownerColor: owner.color,
                    needsCoinWarning: viewerCoins < 1
                };
            }
        }
        this.world.updatePortOwnershipVisuals(states);
    }

    focusCameraOnOwnCharterPort() {
        const localP = this.getLocalPlayer() || this.getActivePlayer();
        if (!localP || localP.charterRegionId === undefined || localP.charterRegionId === null) {
            this.showToast("🌐 Bạn chưa có Cảng Thương quyền riêng!");
            return;
        }
        if (!this.world || !Array.isArray(this.world.hexTiles)) return;
        const portTile = this.world.hexTiles.find(t => t.isPort && t.regionId === localP.charterRegionId);
        if (!portTile) return;
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        this.world.focusCameraOnHex(portTile.q, portTile.r);
        this.showToast(`👑 Đã đưa góc nhìn về Cảng nhà: ${portTile.portName}`);
    }

    cycleMapLabelMode() {
        const order = ["compact", "full", "regions-blockade", "hidden"];
        const cur = (this.world && this.world.htmlLabelMode) || "compact";
        const next = order[(order.indexOf(cur) + 1) % order.length];
        if (this.world && typeof this.world.setHtmlLabelMode === "function") {
            this.world.setHtmlLabelMode(next);
        }
        const meta = {
            compact: { btnText: "🏷️ Gọn", label: "Gọn (Chỉ huy hiệu)" },
            full: { btnText: "🏷️ Đầy đủ", label: "Đầy đủ (Tên Cảng, Di tích & 6 Vùng)" },
            "regions-blockade": { btnText: "🏷️ Vùng & Bão", label: "Vùng & Bão (Chỉ 6 Vùng Kinh Tế & mỏ Phong Tỏa)" },
            hidden: { btnText: "🏷️ Ẩn", label: "Ẩn (Chỉ giữ tên tàu)" }
        }[next];
        const btn = document.getElementById("btn-map-label-mode");
        if (btn) {
            btn.textContent = meta.btnText;
            btn.title = `Chế độ nhãn bản đồ (Phím L): Gọn / Đầy đủ / Vùng & Bão / Ẩn — Hiện tại: ${meta.label}`;
        }
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        this.showToast(`🏷️ Nhãn bản đồ: ${meta.label}`);
    }

    getPlayerProsperity(player) {
        return player ? (player.prosperityPoints || 0) : 0;
    }

    getPlayerSecretPoints(player) {
        return player ? (player.secretPoints || 0) : 0;
    }

    getTotalProsperity(player) {
        return this.getPlayerProsperity(player) + this.getPlayerSecretPoints(player);
    }

    comparePlayersForRanking(a, b, includeSecret = false) {
        if (Boolean(a.eliminated) !== Boolean(b.eliminated)) return a.eliminated ? 1 : -1;
        // Tầng 1: Tổng Điểm Thịnh Vượng (Công khai + Bí mật khi tổng kết)
        const scoreA = includeSecret ? this.getTotalProsperity(a) : this.getPlayerProsperity(a);
        const scoreB = includeSecret ? this.getTotalProsperity(b) : this.getPlayerProsperity(b);
        if (scoreB !== scoreA) return scoreB - scoreA;
        // Tầng 2: Số Di tích đã chinh phục nhiều hơn
        const rDiff = ((b.relics && b.relics.length) || 0) - ((a.relics && a.relics.length) || 0);
        if (rDiff !== 0) return rDiff;
        // Tầng 3: Tổng số câu Quiz Địa lý trả lời đúng nhiều hơn
        const quizDiff = (b.quizCorrect || 0) - (a.quizCorrect || 0);
        if (quizDiff !== 0) return quizDiff;
        // Tầng 4: Tổng lượng Xu vàng + tổng số tài nguyên/đặc sản còn trong kho
        const wealthA = (a.coins || 0) + this.getCargoCount(a);
        const wealthB = (b.coins || 0) + this.getCargoCount(b);
        return wealthB - wealthA;
    }

    getTieBreakerReason(first, second) {
        if (!first || !second) return "";
        if (this.getTotalProsperity(first) !== this.getTotalProsperity(second)) return "";
        const mon1 = (first.relics || []).length, mon2 = (second.relics || []).length;
        if (mon1 !== mon2) {
            return `⚖️ Phá hòa Tầng 2: ${first.name} thắng nhờ chinh phục nhiều Di tích hơn (${mon1} so với ${mon2} Di tích).`;
        }
        const q1 = first.quizCorrect || 0, q2 = second.quizCorrect || 0;
        if (q1 !== q2) {
            return `⚖️ Phá hòa Tầng 3: ${first.name} thắng nhờ trả lời đúng nhiều câu Quiz Địa lý hơn (${q1} so với ${q2} câu đúng).`;
        }
        const w1 = (first.coins || 0) + this.getCargoCount(first);
        const w2 = (second.coins || 0) + this.getCargoCount(second);
        if (w1 !== w2) {
            return `⚖️ Phá hòa Tầng 4: ${first.name} thắng nhờ tổng Xu + hàng trong kho cao hơn (${w1} so với ${w2}).`;
        }
        return `⚖️ Bằng điểm cả 4 chỉ số phụ — xếp hạng theo thứ tự xuất phát.`;
    }

    checkSprint12Alerts() {
        if (!this.isGameStarted || !Array.isArray(this.players)) return;
        if (!this.sprint12NotifiedIds) this.sprint12NotifiedIds = new Set();
        this.players.forEach(pl => {
            if (!pl || pl.eliminated) return;
            const pubPts = this.getPlayerProsperity(pl);
            if (pubPts >= 12 && !this.sprint12NotifiedIds.has(pl.id)) {
                this.sprint12NotifiedIds.add(pl.id);
                const msg = `🔥 ${pl.name} đã đạt ${pubPts}/15 ⭐ Thịnh Vượng — Trận đấu bước vào giai đoạn nước rút!`;
                this.logEvent(msg);
                this.addTradeBulletinNotice(msg);
                this.showToast(msg);
            }
        });
    }

    // ========================================================================
    // QUEST SYSTEM V3: 3 PUBLIC QUESTS + 2 PERSONAL SECRET QUESTS (HIDDEN PTS)
    // ========================================================================
    drawPublicQuest(excludeIds = new Set()) {
        const pool = (window.GAME_DATA && window.GAME_DATA.publicQuestsPool) || [];
        if (pool.length === 0) return null;
        const candidates = pool.filter(q => !excludeIds.has(q.id));
        const list = candidates.length > 0 ? candidates : pool;
        const picked = list[Math.floor(Math.random() * list.length)];
        return { ...picked, instanceId: `pq_${Date.now()}_${Math.floor(Math.random() * 10000)}` };
    }

    drawSecretQuest(excludeIds = new Set()) {
        const pool = (window.GAME_DATA && window.GAME_DATA.secretQuestsPool) || [];
        if (pool.length === 0) return null;
        const candidates = pool.filter(q => !excludeIds.has(q.id));
        const list = candidates.length > 0 ? candidates : pool;
        const picked = list[Math.floor(Math.random() * list.length)];
        return {
            ...picked,
            instanceId: `sq_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            progress: 0,
            trackedValues: []
        };
    }

    initPublicAndSecretQuests() {
        this.activePublicQuests = [];
        const usedPub = new Set();
        for (let i = 0; i < 3; i++) {
            const q = this.drawPublicQuest(usedPub);
            if (q) {
                usedPub.add(q.id);
                this.activePublicQuests.push(q);
            }
        }
        (this.players || []).forEach(pl => {
            pl.secretPoints = pl.secretPoints || 0;
            pl.secretQuests = [];
            const usedSec = new Set();
            for (let j = 0; j < 2; j++) {
                const sq = this.drawSecretQuest(usedSec);
                if (sq) {
                    usedSec.add(sq.id);
                    pl.secretQuests.push(sq);
                }
            }
        });
    }

    canSubmitPublicQuest(player, quest) {
        if (!player || !quest || player.eliminated) return false;
        const tile = this.getCurrentTile(player);
        if (!tile || !tile.isPort || tile.regionId !== quest.portRegionId) return false;
        const req = quest.req || {};
        if ((req.food || 0) > (player.food || 0)) return false;
        if ((req.wood || 0) > (player.wood || 0)) return false;
        if ((req.iron || 0) > (player.iron || 0)) return false;
        if (req.otherSpec) {
            const otherSpecs = (player.specialties || []).filter(s => s.regionId !== quest.portRegionId);
            if (otherSpecs.length < req.otherSpec) return false;
        }
        return true;
    }

    submitPublicQuest(instanceId, fromBot = false) {
        const p = fromBot ? this.getActivePlayer() : (this.getLocalPlayer() || this.getActivePlayer());
        if (!p) return false;
        if (!fromBot && !this.isMyTurn()) {
            this.showToast("⏳ Chỉ có thể nộp Nhiệm Vụ Chung trong lượt của bạn!");
            return false;
        }
        const idx = (this.activePublicQuests || []).findIndex(q => q.instanceId === instanceId);
        if (idx === -1) return false;
        const quest = this.activePublicQuests[idx];
        if (!this.canSubmitPublicQuest(p, quest)) {
            if (!fromBot) this.showToast(`⚠️ Cần đậu đúng tại ${quest.portLabel} và mang đủ ${quest.reqText}!`);
            return false;
        }

        // Deduct required goods
        const req = quest.req || {};
        if (req.food) p.food -= req.food;
        if (req.wood) p.wood -= req.wood;
        if (req.iron) p.iron -= req.iron;
        if (req.otherSpec) {
            for (let k = 0; k < req.otherSpec; k++) {
                const sIdx = p.specialties.findIndex(s => s.regionId !== quest.portRegionId);
                if (sIdx >= 0) p.specialties.splice(sIdx, 1);
            }
        }

        // Award Public Prosperity Points + Coins
        p.prosperityPoints = (p.prosperityPoints || 0) + (quest.rewardPoints || 0);
        if (quest.rewardCoins) {
            p.coins = Math.min(30, (p.coins || 0) + quest.rewardCoins);
        }

        // Replace submitted quest with a new one from the pool
        const activeIds = new Set(this.activePublicQuests.map(q => q.id));
        const replacement = this.drawPublicQuest(activeIds);
        if (replacement) {
            this.activePublicQuests.splice(idx, 1, replacement);
        } else {
            this.activePublicQuests.splice(idx, 1);
        }

        window.SFX.playRelicFanfare();
        this.world.triggerBurstAnimation(p.q, p.r, 0xfbbf24, 26);
        const msg = `📋 ${p.name} hoàn thành Nhiệm Vụ Chung [${quest.title}] (+${quest.rewardPoints} ⭐ Công khai${quest.rewardCoins ? `, +${quest.rewardCoins} 💰 Xu` : ''})!`;
        this.logEvent(msg);
        this.addTradeBulletinNotice(msg);
        if (!fromBot) this.showToast(`✅ ${msg}`);

        if (this.getTotalProsperity(p) >= 15) {
            this.matchWinner = p;
            this.updateUI();
            this.syncMultiplayerGameState();
            this.showVictoryScreen(p);
            return true;
        }

        this.updateUI();
        this.syncMultiplayerGameState();
        if (!fromBot && this.isModalOpen()) {
            this.openQuestsModal();
        }
        return true;
    }

    recordSecretQuestProgress(player, eventType, uniqueVal = null) {
        if (!player || !Array.isArray(player.secretQuests)) return;
        let newlyReady = false;
        player.secretQuests.forEach(sq => {
            if (!sq || sq.type !== eventType || sq.progress >= sq.target) return;
            if (uniqueVal !== null && uniqueVal !== undefined) {
                if (!Array.isArray(sq.trackedValues)) sq.trackedValues = [];
                if (!sq.trackedValues.includes(uniqueVal)) {
                    sq.trackedValues.push(uniqueVal);
                    sq.progress = Math.min(sq.target, sq.trackedValues.length);
                    if (sq.progress >= sq.target) newlyReady = true;
                }
            } else {
                sq.progress = Math.min(sq.target, (sq.progress || 0) + 1);
                if (sq.progress >= sq.target) newlyReady = true;
            }
        });
        if (newlyReady && this.getLocalPlayer() && player.id === this.getLocalPlayer().id) {
            this.showToast("🕵️ Bạn đã hoàn thành 1 Nhiệm Vụ Bí Mật! Bấm 📋 Nhiệm Vụ để nhận Điểm Ẩn!");
        }
    }

    claimSecretQuest(instanceId) {
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p || !Array.isArray(p.secretQuests)) return;
        const idx = p.secretQuests.findIndex(sq => sq.instanceId === instanceId);
        if (idx === -1) return;
        const sq = p.secretQuests[idx];
        if ((sq.progress || 0) < sq.target) {
            this.showToast("⚠️ Nhiệm Vụ Bí Mật này chưa đạt đủ tiến độ!");
            return;
        }

        p.secretPoints = (p.secretPoints || 0) + (sq.rewardPoints || 2);
        const existingIds = new Set(p.secretQuests.map(q => q.id));
        const nextCard = this.drawSecretQuest(existingIds);
        if (nextCard) {
            p.secretQuests.splice(idx, 1, nextCard);
        } else {
            p.secretQuests.splice(idx, 1);
        }

        window.SFX.playRelicFanfare();
        this.showToast(`🕵️ Nhận thành công +${sq.rewardPoints} ⭐ Điểm Bí Mật (Ẩn)! Tổng bí mật hiện có: +${p.secretPoints} Ẩn.`);
        this.logEvent(`🕵️ ${p.name} vừa hoàn thành 1 Nhiệm Vụ Bí Mật (Điểm được giấu kín trên Bảng Xếp Hạng).`);

        if (this.getTotalProsperity(p) >= 15) {
            this.matchWinner = p;
            this.updateUI();
            this.syncMultiplayerGameState();
            this.showVictoryScreen(p);
            return;
        }

        this.updateUI();
        this.syncMultiplayerGameState();
        this.openQuestsModal();
    }

    hasAnyClaimableQuest(player) {
        if (!player || player.eliminated) return false;
        const canPublic = this.isMyTurn() && (this.activePublicQuests || []).some(q => this.canSubmitPublicQuest(player, q));
        const canSecret = (player.secretQuests || []).some(sq => (sq.progress || 0) >= sq.target);
        return canPublic || canSecret;
    }

    openQuestsModal() {
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return;
        const myTurn = this.isMyTurn();
        const pubPts = this.getPlayerProsperity(p);
        const secPts = this.getPlayerSecretPoints(p);

        const publicHtml = (this.activePublicQuests || []).map(q => {
            const ready = myTurn && this.canSubmitPublicQuest(p, q);
            return `
                <div class="quest-card ${ready ? 'ready-claim' : ''}">
                    <div>
                        <div class="quest-card-title">⚓ ${q.title}</div>
                        <div class="quest-card-meta" style="margin-top:3px">
                            📍 <strong>${q.portLabel}</strong><br/>
                            📦 Yêu cầu: <strong style="color:#fde68a">${q.reqText}</strong>
                        </div>
                        <div class="quest-card-meta" style="margin-top:4px; font-style:italic; color:#94a3b8">${q.flavor}</div>
                    </div>
                    <div style="margin-top:6px; display:flex; flex-direction:column; gap:6px">
                        <div class="quest-reward-strip">
                            ⭐ +${q.rewardPoints} Điểm Công Khai ${q.rewardCoins ? `• 💰 +${q.rewardCoins} Xu` : ''}
                        </div>
                        <button class="btn-trade-action ${ready ? 'gold' : ''}" ${ready ? '' : 'disabled'}
                            onclick="window.GAME.submitPublicQuest('${q.instanceId}', false)">
                            ${ready ? '✅ Nộp Đơn Ngay (0 AP)' : (myTurn ? '⛵ Cần đậu đúng Cảng & đủ hàng' : '⏳ Chờ tới lượt bạn')}
                        </button>
                    </div>
                </div>
            `;
        }).join("");

        const secretHtml = (p.secretQuests || []).map(sq => {
            const prog = Math.min(sq.target, sq.progress || 0);
            const pct = Math.round((prog / Math.max(1, sq.target)) * 100);
            const done = prog >= sq.target;
            return `
                <div class="quest-card secret-card ${done ? 'ready-claim' : ''}">
                    <div>
                        <div class="quest-card-title">${sq.icon} ${sq.title}</div>
                        <div class="quest-card-meta" style="margin-top:3px">${sq.desc}</div>
                        <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:6px; color:#e9d5ff; font-weight:700">
                            <span>Tiến độ tự động</span>
                            <span>${prog}/${sq.target} (${pct}%)</span>
                        </div>
                        <div class="quest-progress-track">
                            <div class="quest-progress-fill" style="width:${pct}%"></div>
                        </div>
                    </div>
                    <div style="margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:8px">
                        <span class="quest-reward-strip secret-reward">🕵️ +${sq.rewardPoints} ⭐ Điểm Ẩn</span>
                        <button class="btn-trade-action ${done ? 'gold' : ''}" ${done ? '' : 'disabled'}
                            onclick="window.GAME.claimSecretQuest('${sq.instanceId}')">
                            ${done ? '🎁 Nhận Điểm Ẩn' : 'Đang tiến hành...'}
                        </button>
                    </div>
                </div>
            `;
        }).join("");

        const html = `
            <div class="modal-header-badge" style="background:#0f2942; border-color:#e6b84a; color:#fde68a">
                <span>📋 BẢNG NHIỆM VỤ CHIẾN THUẬT — HÀNH TRÌNH VÀNG SON V3</span>
                <span class="badge-tag">Tổng điểm thực tế của bạn: ${pubPts} + ${secPts} bí mật = ${pubPts + secPts}/15 ⭐</span>
            </div>

            <div class="quest-section-heading">
                <span>🌐 1. NHIỆM VỤ CHUNG (3 Đơn Công Khai — Tranh Tài Toàn Phòng)</span>
                <span style="font-size:11px; color:var(--ink-secondary)">Ai nộp trước nhận Điểm Công Khai &amp; rút đơn mới</span>
            </div>
            <div class="quest-cards-grid">
                ${publicHtml}
            </div>

            <div class="quest-section-heading">
                <span>🕵️ 2. NHIỆM VỤ BÍ MẬT CỦA RIÊNG BẠN (2 Thẻ — Giấu Điểm Chống Cô Lập)</span>
                <span style="font-size:11px; color:#7e22ce">Chỉ mình bạn thấy • Tự lật khi đạt tổng 15đ hoặc hết 45p</span>
            </div>
            <div class="quest-cards-grid secret-grid">
                ${secretHtml}
            </div>

            <div class="modal-actions" style="justify-content:flex-end; margin-top:8px">
                <button class="btn-primary-gold" onclick="window.GAME.closeModal()">Đóng Bảng Nhiệm Vụ</button>
            </div>
        `;
        this.showModal(html);
    }

    // ========================================================================
    // POWER REWARD: CHUỖI THÔNG THÁI (5 CÂU ĐÚNG LIÊN TIẾP -> +1 AP LƯỢT SAU)
    // ========================================================================
    recordQuizStreak(player, isCorrect) {
        if (!player) return;
        if (isCorrect) {
            player.quizStreak = (player.quizStreak || 0) + 1;
            if (player.quizStreak >= 5) {
                player.quizStreak = 0;
                player.bonusApNextTurn = (player.bonusApNextTurn || 0) + 1;
                window.SFX.playRelicFanfare();
                if (this.world) this.world.triggerBurstAnimation(player.q, player.r, 0x38bdf8, 28);
                const msg = `⛵ Thuận Buồm Xuôi Gió (+1 AP)! ${player.name} đạt Chuỗi Thông Thái 5/5 câu đúng liên tiếp → Lượt sau tự động được 6 AP!`;
                this.logEvent(msg);
                this.addTradeBulletinNotice(msg);
                this.showToast(msg);
            }
        } else {
            player.quizStreak = 0;
        }
    }

    // ========================================================================
    // REAL-TIME ROOM CHAT (LOBBY + IN-MATCH SSE STREAM + SANDBOX LOCAL CHAT)
    // ========================================================================
    connectRoomChatStream(code) {
        const cleanCode = String(code || "").trim().toUpperCase();
        if (!cleanCode) return;
        if (this.chatEventSource && this.chatStreamRoomCode === cleanCode && this.chatEventSource.readyState !== 2) {
            return;
        }
        this.disconnectRoomChatStream();
        if (typeof EventSource !== "function") return;
        try {
            const es = new EventSource(`/api/room/chat/stream?code=${encodeURIComponent(cleanCode)}`);
            this.chatEventSource = es;
            this.chatStreamRoomCode = cleanCode;

            es.addEventListener("room_chat_history", (ev) => {
                try {
                    const list = JSON.parse(ev.data || "[]");
                    this.handleIncomingChatMessages(list, true);
                } catch (e) {}
            });

            es.addEventListener("room_chat_message", (ev) => {
                try {
                    const msg = JSON.parse(ev.data || "null");
                    if (msg) this.handleIncomingChatMessages([msg], false);
                } catch (e) {}
            });
        } catch (e) {
            this.chatEventSource = null;
            this.chatStreamRoomCode = null;
        }
    }

    disconnectRoomChatStream() {
        if (this.chatEventSource) {
            try { this.chatEventSource.close(); } catch (e) {}
            this.chatEventSource = null;
        }
        this.chatStreamRoomCode = null;
    }

    resetRoomChatState() {
        this.disconnectRoomChatStream();
        clearInterval(this.chatSpamTimer);
        this.chatSpamTimer = null;
        this.chatConsecutiveCount = 0;
        this.chatSpamCooldownUntil = 0;
        this.lastChatSentAt = 0;
        this.roomChatMessages = [];
        this.roomChatSeenIds = new Set();
        this.roomChatUnreadCount = 0;
        this.isInMatchChatOpen = false;
        this.closeAllQuickChatPopovers();
        const panel = document.getElementById("inmatch-chat-panel");
        if (panel) panel.classList.add("hidden");
        const inList = document.getElementById("inmatch-chat-messages");
        if (inList) inList.textContent = "";
        const lobList = document.getElementById("lobby-chat-messages");
        if (lobList) lobList.textContent = "";
        const inInp = document.getElementById("inmatch-chat-input");
        if (inInp) inInp.value = "";
        this.updateChatCharCounter("inmatch", "");
        this.updateChatCharCounter("lobby", "");
        this.updateChatSpamCooldownUI();
        this.updateChatUnreadBadgeUI();
    }

    toggleQuickChatPopover(scope = "inmatch", ev = null) {
        if (ev) ev.stopPropagation();
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        const pop = document.getElementById(`${scope}-quick-popover`);
        const btn = document.getElementById(`btn-${scope}-quick-toggle`);
        if (!pop) return;
        const willOpen = pop.classList.contains("hidden");
        this.closeAllQuickChatPopovers();
        if (willOpen) {
            pop.classList.remove("hidden");
            if (btn) btn.classList.add("is-open");
        }
    }

    closeAllQuickChatPopovers() {
        ["inmatch", "lobby"].forEach(scope => {
            const pop = document.getElementById(`${scope}-quick-popover`);
            const btn = document.getElementById(`btn-${scope}-quick-toggle`);
            if (pop) pop.classList.add("hidden");
            if (btn) btn.classList.remove("is-open");
        });
    }

    updateChatCharCounter(scope = "inmatch", val = "") {
        const counter = document.getElementById(`${scope}-chat-counter`);
        if (!counter) return;
        const len = String(val || "").length;
        if (len === 0) {
            counter.classList.add("hidden");
            counter.classList.remove("is-warn", "is-max");
            counter.textContent = "0/250";
            return;
        }
        counter.classList.remove("hidden");
        counter.textContent = `${len}/250`;
        counter.classList.toggle("is-warn", len >= 210 && len < 250);
        counter.classList.toggle("is-max", len >= 250);
    }

    startChatSpamCooldown(seconds = 10) {
        const sec = Math.max(1, Math.ceil(Number(seconds) || 10));
        this.chatSpamCooldownUntil = Date.now() + sec * 1000;
        this.chatConsecutiveCount = 0;
        this.closeAllQuickChatPopovers();
        clearInterval(this.chatSpamTimer);
        this.updateChatSpamCooldownUI();
        this.chatSpamTimer = setInterval(() => {
            if (Date.now() >= (this.chatSpamCooldownUntil || 0)) {
                clearInterval(this.chatSpamTimer);
                this.chatSpamTimer = null;
                this.chatSpamCooldownUntil = 0;
                this.chatConsecutiveCount = 0;
            }
            this.updateChatSpamCooldownUI();
        }, 250);
    }

    updateChatSpamCooldownUI() {
        const nowMs = Date.now();
        const remainingMs = Math.max(0, (this.chatSpamCooldownUntil || 0) - nowMs);
        const isLocked = remainingMs > 0;
        const sec = Math.max(1, Math.ceil(remainingMs / 1000));
        const warnText = `⏳ Bạn nhắn quá nhanh (tối đa 4 tin liên tiếp) — Vui lòng chờ ${sec}s`;

        ["inmatch", "lobby"].forEach(scope => {
            const warnEl = document.getElementById(`${scope}-chat-spam-warn`);
            if (warnEl) {
                if (isLocked) {
                    warnEl.textContent = warnText;
                    warnEl.classList.remove("hidden");
                } else {
                    warnEl.textContent = "";
                    warnEl.classList.add("hidden");
                }
            }
            const sendBtn = document.getElementById(`btn-${scope}-chat-send`);
            if (sendBtn) sendBtn.disabled = isLocked;
        });

        if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
            document.querySelectorAll(".chat-quick-chip").forEach(btn => {
                btn.disabled = isLocked;
            });
        }
    }

    handleIncomingChatMessages(list, isInitialHistory = false) {
        if (!Array.isArray(list) || list.length === 0) return;
        let addedAny = false;
        let unreadDelta = 0;

        for (let i = 0; i < list.length; i++) {
            const msg = list[i];
            if (!msg || !msg.id) continue;
            if (this.roomChatSeenIds.has(msg.id)) continue;
            this.roomChatSeenIds.add(msg.id);
            this.roomChatMessages.push(msg);
            addedAny = true;

            if (!isInitialHistory && !msg.isSystem && msg.senderId !== this.clientId) {
                // Another player spoke -> reset local consecutive spam counter!
                this.chatConsecutiveCount = 0;
                if (this.isGameStarted && !this.isInMatchChatOpen) {
                    unreadDelta += 1;
                }
            }
        }

        if (this.roomChatMessages.length > 60) {
            this.roomChatMessages = this.roomChatMessages.slice(-60);
        }

        if (unreadDelta > 0) {
            this.roomChatUnreadCount += unreadDelta;
            this.updateChatUnreadBadgeUI();
        }
        if (addedAny) {
            this.renderRoomChatMessages("both");
        }
    }

    updateChatUnreadBadgeUI() {
        const badge = document.getElementById("chat-unread-badge");
        if (!badge) return;
        if (this.roomChatUnreadCount > 0 && !this.isInMatchChatOpen) {
            badge.textContent = this.roomChatUnreadCount > 9 ? "9+" : String(this.roomChatUnreadCount);
            badge.classList.remove("hidden");
        } else {
            badge.textContent = "0";
            badge.classList.add("hidden");
        }
    }

    renderRoomChatMessages(target = "both") {
        const containers = [];
        if (target === "both" || target === "lobby") {
            const lob = document.getElementById("lobby-chat-messages");
            if (lob) containers.push(lob);
        }
        if (target === "both" || target === "inmatch") {
            const inm = document.getElementById("inmatch-chat-messages");
            if (inm) containers.push(inm);
        }
        if (containers.length === 0) return;

        containers.forEach((box) => {
            box.textContent = "";
            if (this.roomChatMessages.length === 0) {
                const hint = document.createElement("div");
                hint.className = "chat-empty-hint";
                hint.textContent = this.roomState && this.roomState.code
                    ? "Chưa có tin nhắn nào. Hãy gửi lời chào các Thuyền trưởng!"
                    : "Bắt đầu nhắn tin thử nghiệm tại đây...";
                box.appendChild(hint);
                return;
            }

            this.roomChatMessages.forEach((msg) => {
                const row = document.createElement("div");
                const isMe = Boolean(!msg.isSystem && msg.senderId === this.clientId);
                row.className = "chat-msg-row" + (msg.isSystem ? " is-system" : (isMe ? " is-me" : ""));

                if (msg.isSystem) {
                    const textSpan = document.createElement("span");
                    textSpan.className = "chat-msg-text";
                    textSpan.textContent = String(msg.message || "");
                    const timeSpan = document.createElement("span");
                    timeSpan.className = "chat-msg-time";
                    timeSpan.textContent = String(msg.timeStr || "");
                    row.appendChild(textSpan);
                    row.appendChild(timeSpan);
                } else {
                    const meta = document.createElement("div");
                    meta.className = "chat-msg-meta";

                    const senderWrap = document.createElement("span");
                    senderWrap.className = "chat-sender-wrap";

                    const nameEl = document.createElement("span");
                    nameEl.className = "chat-sender-name";
                    if (msg.senderColor) nameEl.style.color = msg.senderColor;
                    nameEl.textContent = String(msg.senderName || "Thuyền Trưởng");
                    senderWrap.appendChild(nameEl);

                    if (isMe) {
                        const meTag = document.createElement("span");
                        meTag.className = "chat-sender-tag";
                        meTag.textContent = "[Bạn]";
                        senderWrap.appendChild(meTag);
                    }
                    if (msg.isHost) {
                        const hostTag = document.createElement("span");
                        hostTag.className = "chat-sender-tag is-host";
                        hostTag.textContent = "[Chủ phòng]";
                        senderWrap.appendChild(hostTag);
                    }

                    const timeEl = document.createElement("span");
                    timeEl.className = "chat-msg-time";
                    timeEl.textContent = String(msg.timeStr || "");

                    meta.appendChild(senderWrap);
                    meta.appendChild(timeEl);

                    const bodyEl = document.createElement("div");
                    bodyEl.className = "chat-msg-text";
                    bodyEl.textContent = String(msg.message || "");

                    row.appendChild(meta);
                    row.appendChild(bodyEl);
                }

                box.appendChild(row);
            });

            box.scrollTop = box.scrollHeight;
        });
    }

    toggleInMatchChatBox(ev) {
        if (ev) ev.stopPropagation();
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        if (this.isMyTurn()) this.recordPlayerInteraction();

        const panel = document.getElementById("inmatch-chat-panel");
        if (!panel) return;
        const willOpen = panel.classList.contains("hidden");
        if (!willOpen) {
            this.closeInMatchChatBox();
            return;
        }
        this.isInMatchChatOpen = true;
        this.roomChatUnreadCount = 0;
        this.updateChatUnreadBadgeUI();

        const roomTag = document.getElementById("inmatch-chat-room-tag");
        if (roomTag) {
            roomTag.textContent = this.roomState && this.roomState.code
                ? `Phòng ${this.roomState.code}`
                : (this.sandboxMode ? "Sandbox" : "Cục bộ");
        }
        const sbNote = document.getElementById("inmatch-chat-sandbox-note");
        if (sbNote) {
            sbNote.classList.toggle("hidden", !(this.sandboxMode || !this.roomState || !this.roomState.code));
        }

        panel.classList.remove("hidden");
        this.renderRoomChatMessages("inmatch");
        const inp = document.getElementById("inmatch-chat-input");
        if (inp) setTimeout(() => inp.focus(), 30);
    }

    closeInMatchChatBox() {
        this.isInMatchChatOpen = false;
        this.closeAllQuickChatPopovers();
        const panel = document.getElementById("inmatch-chat-panel");
        if (panel) panel.classList.add("hidden");
        const inp = document.getElementById("inmatch-chat-input");
        if (inp && typeof document !== "undefined" && document.activeElement === inp) {
            inp.blur();
        }
        this.updateChatUnreadBadgeUI();
    }

    submitLobbyChat() {
        const inp = document.getElementById("lobby-chat-input");
        if (!inp) return;
        const text = inp.value;
        if (Date.now() < (this.chatSpamCooldownUntil || 0)) {
            this.updateChatSpamCooldownUI();
            return;
        }
        if (!String(text || "").trim()) return;
        inp.value = "";
        this.updateChatCharCounter("lobby", "");
        this.sendRoomChatMessage(text);
        inp.focus();
    }

    submitInMatchChat() {
        const inp = document.getElementById("inmatch-chat-input");
        if (!inp) return;
        const text = inp.value;
        if (Date.now() < (this.chatSpamCooldownUntil || 0)) {
            this.updateChatSpamCooldownUI();
            return;
        }
        if (!String(text || "").trim()) return;
        inp.value = "";
        this.updateChatCharCounter("inmatch", "");
        this.sendRoomChatMessage(text);
        inp.focus();
    }

    sendQuickChatPreset(text) {
        this.closeAllQuickChatPopovers();
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        this.sendRoomChatMessage(text);
    }

    async sendRoomChatMessage(rawText) {
        const clean = String(rawText || "").trim().slice(0, 250);
        if (!clean) return;

        const nowMs = Date.now();
        if (nowMs < (this.chatSpamCooldownUntil || 0)) {
            this.updateChatSpamCooldownUI();
            return;
        }
        // Reset consecutive counter if paused > 10s
        if (nowMs - (this.lastChatSentAt || 0) > 10000) {
            this.chatConsecutiveCount = 0;
        }
        // Max 4 consecutive messages -> 5th triggers 10s spam cooldown!
        if ((this.chatConsecutiveCount || 0) >= 4) {
            this.startChatSpamCooldown(10);
            return;
        }
        if (nowMs - (this.lastChatSentAt || 0) < 250) {
            return;
        }
        this.lastChatSentAt = nowMs;
        this.chatConsecutiveCount = (this.chatConsecutiveCount || 0) + 1;

        if (this.isMyTurn()) {
            this.recordPlayerInteraction();
        }

        const localP = this.getLocalPlayer();
        const senderName = (localP && localP.name) || (this.roomState && this.roomState.localPlayerName) || "Thuyền Trưởng";
        const senderColor = (localP && localP.color) || "#F2C96B";

        if (!this.roomState || !this.roomState.code) {
            const d = new Date(nowMs);
            const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            this.handleIncomingChatMessages([{
                id: `local_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
                roomCode: "LOCAL",
                senderId: this.clientId,
                senderName,
                senderColor,
                isHost: true,
                isSystem: false,
                message: clean,
                timeStr,
                timestamp: nowMs
            }], false);
            return;
        }

        try {
            const resp = await fetch("/api/room/chat/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomCode: this.roomState.code,
                    clientId: this.clientId,
                    senderName,
                    message: clean
                })
            });
            const data = await resp.json();
            if (data && data.ok && data.message) {
                this.handleIncomingChatMessages([data.message], false);
            } else if (data && data.spamCooldown) {
                this.startChatSpamCooldown(data.remainingSec || 10);
            } else if (data && data.rateLimited) {
                this.showToast("⏳ Bạn nhắn hơi nhanh, vui lòng đợi chút!");
            }
        } catch (e) {
            this.showToast("⚠️ Không thể gửi tin nhắn lúc này, vui lòng thử lại.");
        }
    }

    // ========================================================================
    // QUICK EMOTES ON THE SEA (💬 -> REAL-TIME ROOM CHAT PANEL)
    // ========================================================================
    toggleEmoteMenu(ev) {
        return this.toggleInMatchChatBox(ev);
    }

    sendQuickEmote(text) {
        const menu = document.getElementById("quick-emote-menu");
        if (menu) menu.classList.add("hidden");
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p || !text) return;

        window.SFX.playClick();
        const shipKey = World3D.getPlayerShipKey(p);
        const emoteObj = {
            id: `em_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            shipKey,
            playerName: p.name,
            text,
            ts: Date.now()
        };
        this.lastEmoteEvent = emoteObj;
        this._lastRenderedEmoteId = emoteObj.id;

        if (this.world && this.world.showShipEmoteBubble) {
            this.world.showShipEmoteBubble(shipKey, text, 3500);
        }
        this.logEvent(`💬 ${p.name}: "${text}"`);
        this.broadcastRoomMessage({ type: "QUICK_EMOTE", code: this.roomState.code, emote: emoteObj });
        this.syncMultiplayerGameState();
    }

    generateFairOuterRimSpawns(count) {
        // Use the pre-calibrated fair anchorages along the S-shaped Vietnam coast
        // (Each anchorage is 3-4 water hexes from the nearest Port, Monument, and Resource node)
        const anchors = (this.world.fairSpawnAnchors && this.world.fairSpawnAnchors.length >= 5)
            ? this.world.fairSpawnAnchors
            : this.world.hexTiles.filter(t => t.isSpawnRim && t.navigable);

        // Pick `count` evenly spaced anchorages from North to South so players don't crowd the same bay
        const indexPatterns = {
            1: [2],
            2: [1, 3],
            3: [0, 2, 4],
            4: [0, 1, 3, 4],
            5: [0, 1, 2, 3, 4]
        };
        const pattern = indexPatterns[Math.min(5, Math.max(1, count))] || [0, 1, 2, 3, 4];

        const chosen = pattern.map(idx => {
            const a = anchors[idx % anchors.length];
            const tile = this.world.hexMap.get(`${a.q},${a.r}`) || a;
            return {
                q: tile.q,
                r: tile.r,
                regionName: tile.region ? tile.region.name : "Hải Phận Việt Nam"
            };
        });

        // Randomly shuffle which player gets which balanced anchorage
        for (let i = chosen.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
        }
        return chosen;
    }

    // ------------------------------------------------------------------------
    // MỤC 4A: BALANCED CHARTER-BASED SPAWN SELECTION (5+1 REGIONS)
    // ------------------------------------------------------------------------
    pickRegionalVesselTitle(regionId, usedVesselTitles = new Set()) {
        const pools = (window.GAME_DATA && window.GAME_DATA.regionVesselNames) || {
            0: ["Tàu Than Cái Lân", "Tàu Vịnh Hạ Long", "Tàu Hải Trình Vân Đồn"],
            1: ["Tàu Bạch Đằng", "Tàu Cảng Hải Phòng", "Tàu Viễn Dương Hồng Hà"],
            2: ["Tàu Tiên Sa", "Tàu Sông Hàn", "Tàu Nghinh Phong Miền Trung"],
            3: ["Tàu Thị Nại", "Tàu Hàng Quy Nhơn", "Tàu Cao Nguyên Hướng Biển"],
            4: ["Tàu Hàng Cái Mép", "Tàu Cửa Thị Vải", "Tàu Viễn Hải Sài Gòn"],
            5: ["Tàu Tây Đô", "Tàu Hậu Giang", "Tàu Phương Nam Cửu Long"]
        };
        const targetRegion = (regionId !== undefined && regionId !== null && pools[regionId]) ? regionId : 4;
        const primaryPool = pools[targetRegion] || pools[4] || ["Tàu Viễn Hải Sài Gòn"];
        const availablePrimary = primaryPool.filter(name => !usedVesselTitles.has(name));
        let chosen = null;
        if (availablePrimary.length > 0) {
            chosen = availablePrimary[Math.floor(Math.random() * availablePrimary.length)];
        } else {
            const allNames = Object.values(pools).flat();
            const availableAny = allNames.filter(name => !usedVesselTitles.has(name));
            chosen = availableAny.length > 0
                ? availableAny[Math.floor(Math.random() * availableAny.length)]
                : primaryPool[0];
        }
        usedVesselTitles.add(chosen);
        return chosen;
    }

    findBalancedSpawnHexForRegion(regionId, occupiedHexes = new Set()) {
        const tiles = (this.world && Array.isArray(this.world.hexTiles)) ? this.world.hexTiles : [];
        const targetRegionId = (regionId !== undefined && regionId !== null) ? regionId : 4; // Fallback: Đông Nam Bộ (Cái Mép)
        const portTile = tiles.find(t => t.isPort && t.regionId === targetRegionId)
            || tiles.find(t => t.isPort && t.regionId === 4)
            || tiles.find(t => t.isPort);

        const tier1Monuments = tiles.filter(t => t.monumentId && t.monumentTier === 1);
        const protectedMonuments = [...tier1Monuments];
        // Đặc biệt tránh đặt tàu Vùng 2 sát Phong Nha hoặc tàu Vùng 4/5 sát Bến Nhà Rồng
        const extraGuardIds = targetRegionId === 2 ? ["mon_phongnha"] : ((targetRegionId === 4 || targetRegionId === 5) ? ["mon_bennharong"] : []);
        extraGuardIds.forEach(mId => {
            const mt = tiles.find(t => t.monumentId === mId);
            if (mt && !protectedMonuments.includes(mt)) protectedMonuments.push(mt);
        });

        const resourceNodes = tiles.filter(t => Boolean(t.resourceType));

        const isCleanSeaHex = (t) => Boolean(
            t &&
            t.navigable &&
            !t.isReef &&
            !t.monumentId &&
            !t.isPort &&
            !t.resourceType &&
            !t.hasNPC &&
            !occupiedHexes.has(`${t.q},${t.r}`)
        );

        const countOpenSeaNeighbors = (t) => {
            if (!this.world || !this.world.hexMap) return 0;
            const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
            let cnt = 0;
            for (const [dq, dr] of dirs) {
                const nb = this.world.hexMap.get(`${t.q + dq},${t.r + dr}`);
                if (nb && nb.navigable && !nb.isReef) cnt++;
            }
            return cnt;
        };

        const minDistTo = (t, list) => {
            if (!list || list.length === 0) return 99;
            let best = 99;
            for (const item of list) {
                const d = this.hexDistance(t.q, t.r, item.q, item.r);
                if (d < best) best = d;
            }
            return best;
        };

        const hasResourceInBand = (t, minR, maxR) => {
            return resourceNodes.some(rn => {
                const d = this.hexDistance(t.q, t.r, rn.q, rn.r);
                return d >= minR && d <= maxR;
            });
        };

        const cleanSeaTiles = tiles.filter(isCleanSeaHex);
        if (!portTile || cleanSeaTiles.length === 0) {
            const fallback = this.generateFairOuterRimSpawns(1)[0] || { q: 0, r: 0 };
            occupiedHexes.add(`${fallback.q},${fallback.r}`);
            return fallback;
        }

        const scoreCandidate = (t, distPort) => {
            let sc = 0;
            // Ưu tiên cách cảng nhà đúng 1 ô bước đi (tối đa 2 ô nếu ô kề bị vướng)
            sc += (distPort === 1) ? 60 : (distPort === 2 ? 32 : Math.max(0, 20 - distPort * 5));
            // Ưu tiên hướng lệch ra ngoài khơi (+X / nhiều ô biển mở xung quanh)
            if (typeof t.x === "number" && typeof portTile.x === "number" && t.x > portTile.x) {
                sc += 24;
            }
            sc += countOpenSeaNeighbors(t) * 6;
            if (hasResourceInBand(t, 2, 4)) sc += 25;
            return sc;
        };

        // Pass 1 (Chuẩn đầy đủ): Cách Cảng 1–2 ô, cách tất cả Di tích Cấp 1 (và điểm bảo vệ) >= 3 ô, có >= 1 mỏ trong bán kính 2–4 ô
        const pickBestFrom = (filterFn) => {
            let bestTile = null;
            let bestScore = -Infinity;
            for (const t of cleanSeaTiles) {
                const dPort = this.hexDistance(t.q, t.r, portTile.q, portTile.r);
                if (!filterFn(t, dPort)) continue;
                const sc = scoreCandidate(t, dPort);
                if (sc > bestScore) {
                    bestScore = sc;
                    bestTile = t;
                }
            }
            return bestTile;
        };

        let chosen =
            pickBestFrom((t, dPort) => dPort >= 1 && dPort <= 2 && minDistTo(t, protectedMonuments) >= 3 && hasResourceInBand(t, 2, 4)) ||
            pickBestFrom((t, dPort) => dPort >= 1 && dPort <= 2 && minDistTo(t, protectedMonuments) >= 3) ||
            pickBestFrom((t, dPort) => dPort >= 1 && dPort <= 3 && minDistTo(t, protectedMonuments) >= 3) ||
            pickBestFrom((t, dPort) => dPort >= 1 && dPort <= 3) ||
            cleanSeaTiles[0];

        occupiedHexes.add(`${chosen.q},${chosen.r}`);
        return {
            q: chosen.q,
            r: chosen.r,
            regionId: targetRegionId,
            portName: portTile.portName || "Thương Cảng"
        };
    }

    announceLocalPlayerSpawnAndFocus() {
        const localP = this.getLocalPlayer() || this.getActivePlayer();
        if (!localP) return;
        if (this.world && typeof this.world.focusCameraOnHex === "function") {
            this.world.focusCameraOnHex(localP.q, localP.r);
        }
        const regId = (localP.charterRegionId !== undefined && localP.charterRegionId !== null) ? localP.charterRegionId : 4;
        const regName = this.getRegionShortName(regId);
        const portTile = (this.world && Array.isArray(this.world.hexTiles))
            ? this.world.hexTiles.find(t => t.isPort && t.regionId === regId)
            : null;
        const shortPortMap = { 0: "Cái Lân", 1: "Hải Phòng", 2: "Tiên Sa", 3: "Quy Nhơn", 4: "Cái Mép", 5: "Cần Thơ" };
        const portShort = shortPortMap[regId] || (portTile ? portTile.portName : "Thương Cảng");

        const msg = (localP.charterRegionId !== undefined && localP.charterRegionId !== null)
            ? `⛵ Xuất phát tại vùng biển ${regName} — Cảng nhà của bạn: 👑 ${portShort} (Miễn thuế 0💰)`
            : `⛵ Xuất phát tại vùng biển Đông Nam Bộ — Cảng Tự Do: 🌐 ${portShort} (Miễn thuế 0💰)`;
        this.showToast(msg);
    }

    initializeMatchBoardAndShips(totalPlayers = 4, humanCount = 1, customConfigs = null) {
        this.roundNumber = 1;
        this.activePlayerIdx = 0;
        this.isBusy = false;
        this.liveQuizState = null;

        this.matchElapsedSec = 0;
        this.earlyLockReleased = Boolean(this.sandboxMode);
        this.exhaustedTiersNotified = new Set();
        this.blockedMineIds = [];
        this.finalFiveMinNotified = false;
        this.sprint12NotifiedIds = new Set();
        this.sandboxAllowTimeout = false;
        // Mục 4D: Chống AFK 50s (45s + 5s cảnh báo), Đóng băng đồng hồ 45:00 & Tự chuyển lượt 5s khi 0 AP
        this.lastInteractionAt = Date.now();
        this.lastGameplayActionAt = Date.now();
        this.isMatchClockFrozen = false;
        this.afkWarningRemainingSec = null;
        this.afkAutoNoticeShown = false;
        this.afkAutoNoticeShownAt = 0;
        this.hideAfkAutoNotice();
        this.zeroApCountdownSec = null;
        this.zeroApCountdownInterval = null;
        this.currentWeatherPhase = "sunny";
        this.thunderstormChallengeTriggered = false;
        this.portResetRemainingSec = this.portResetIntervalSec;
        this.portResResetRemainingSec = this.portResResetIntervalSec;

        this.nextNPCSpawnRound = 4 + Math.floor(Math.random() * 2);

        this.monumentAssignments = this.randomizeMonumentTiers();
        this.world.buildBoard(this.monumentAssignments);
        this.world.setWeatherMode("sunny");
        this.syncMonumentVisuals3D();
        this.resetAllPortInventories(false);
        this.resetAllPortResourceStocks(false);
        this.startMatchClockAndWeatherEngine();

        const fairSpawns = this.generateFairOuterRimSpawns(totalPlayers);

        // Randomly shuffle all 5 ship archetypes so each player gets a RANDOM ship (not tied to lobby slot!)
        const randomArchIndices = window.GAME_DATA.shipArchetypes.map((_, idx) => idx);
        for (let i = randomArchIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [randomArchIndices[i], randomArchIndices[j]] = [randomArchIndices[j], randomArchIndices[i]];
        }

        this.players = [];
        // Mục 3B-1 & 4A: Chia ngẫu nhiên Thương quyền 5 vùng (0, 1, 2, 3, 5) cho các tàu và đặt mỗi tàu tại ô biển cân bằng gần Cảng nhà!
        // Riêng Vùng 4 (Đông Nam Bộ) luôn là "🌐 Vùng Tự Do (Thuế 0 Xu)"!
        const charterPool = [0, 1, 2, 3, 5];
        for (let ci = charterPool.length - 1; ci > 0; ci--) {
            const cj = Math.floor(Math.random() * (ci + 1));
            [charterPool[ci], charterPool[cj]] = [charterPool[cj], charterPool[ci]];
        }
        const occupiedSpawnHexes = new Set();
        const usedVesselTitles = new Set();

        for (let i = 0; i < totalPlayers; i++) {
            const archIdx = randomArchIndices[i % randomArchIndices.length];
            const arch = window.GAME_DATA.shipArchetypes[archIdx];
            const isAI = customConfigs ? customConfigs[i].isAI : (i >= humanCount);
            const pName = customConfigs ? customConfigs[i].name : (i === 0 ? (this.roomState.localPlayerName || arch.name) : arch.name);
            const seatIdx = customConfigs && customConfigs[i].seatIndex !== undefined ? customConfigs[i].seatIndex : i;
            const clientId = (customConfigs && customConfigs[i].clientId)
                ? customConfigs[i].clientId
                : (!isAI ? this.clientId : null);
            const shipKey = clientId ? `client_${clientId}` : `seat_${seatIdx}`;
            const assignedCharter = charterPool[i] !== undefined ? charterPool[i] : null;
            const balancedSpawn = this.findBalancedSpawnHexForRegion(assignedCharter, occupiedSpawnHexes);
            const vesselTitle = this.pickRegionalVesselTitle(assignedCharter, usedVesselTitles);

            this.players.push({
                id: i,
                seatIndex: seatIdx,
                clientId: clientId,
                shipKey: shipKey,
                name: pName,
                vesselTitle: vesselTitle,
                archetypeId: archIdx,
                color: arch.color,
                isAI: isAI,
                eliminated: false,
                q: balancedSpawn.q,
                r: balancedSpawn.r,
                hp: 5,
                maxHp: 5,
                coins: 3,
                charterRegionId: assignedCharter,
                ap: 5,
                moveApSpent: 0,
                hexMoveCredits: 0,
                interactiveApUsed: false,
                repairedThisTurn: 0,
                tier1Visited: 0,
                hasSerpentCoin: false,
                yagiWrongCount: 0,
                yagiQuizTriggeredThisTurn: false,
                food: 1,
                wood: 1,
                iron: 0,
                keys: { 1: 0, 2: 0, 3: 0 },
                specialties: [],
                relics: [],
                prosperityPoints: 0,
                secretPoints: 0,
                secretQuests: [],
                stormDamagedThisPhase: false,
                maxCargo: 12,
                quizCorrect: 0,
                quizTotal: 0,
                quizStreak: 0,
                bonusApNextTurn: 0,
                maxTurnAp: 5,
                damageTaken: 0,
                p2pTrades: 0
            });
        }
        this.matchStats = { portTrades: {}, portVisits: {}, totalP2P: 0, disasterDamage: 0, stormReefDamage: 0 };
        this.initPublicAndSecretQuests();

        this.ensureValidPlayerPositions();
        this.seedInitialMarketListings();
        this.world.spawnShips(this.players, this.getLocalPlayer());
        this.refreshReachableHexes();

        const roomTag = this.roomState.code ? ` [Phòng: ${this.roomState.code}]` : "";
        const charterSummary = this.players.map(pl => `${pl.name} (${pl.vesselTitle}): ${this.getRegionShortName(pl.charterRegionId)}`).join(" • ");
        this.logEvent(`⚓ Khởi tạo bản đồ chung${roomTag} (${totalPlayers} Hải đội • Vốn 3 Xu • Kho 12→16 ô • Trần 30 Xu)!`);
        this.logEvent(`📜 Thương quyền 5+1: ${charterSummary} | 🌐 Đông Nam Bộ luôn là Vùng Tự Do (Thuế 0 Xu)!`);
        this.updateUI();
    }

    // Ensure every player's ship is on a valid navigable water hex with open sea routes
    ensureValidPlayerPositions() {
        if (!this.players || !this.world || !this.world.hexMap) return;
        const validAnchors = (this.world.fairSpawnAnchors && this.world.fairSpawnAnchors.length > 0)
            ? this.world.fairSpawnAnchors
            : this.world.hexTiles.filter(t => t.navigable && t.terrain === "sea");

        this.players.forEach((pl, idx) => {
            const curTile = this.world.hexMap.get(`${pl.q},${pl.r}`);
            const hasRoute = curTile && curTile.navigable && this.computeNavigablePaths(pl.q, pl.r, 2).size > 0;
            if (!hasRoute) {
                // Find nearest navigable sea/coast hex with open routes
                let bestTile = null;
                let bestDist = Infinity;
                for (let i = 0; i < this.world.hexTiles.length; i++) {
                    const cand = this.world.hexTiles[i];
                    if (!cand.navigable || cand.isReef) continue;
                    if (cand.monumentId || cand.isPort || cand.resourceType) continue;
                    const d = Math.abs(cand.q - (pl.q || 0)) + Math.abs(cand.r - (pl.r || 0));
                    if (d < bestDist && this.computeNavigablePaths(cand.q, cand.r, 2).size >= 3) {
                        bestDist = d;
                        bestTile = cand;
                    }
                }
                if (!bestTile && validAnchors.length > 0) {
                    const anc = validAnchors[idx % validAnchors.length];
                    bestTile = this.world.hexMap.get(`${anc.q},${anc.r}`) || anc;
                }
                if (bestTile) {
                    pl.q = bestTile.q;
                    pl.r = bestTile.r;
                }
            }
        });
    }

    seedInitialMarketListings() {
        this.buyOrders = [];
        this.barterOrders = [];
        this.marketListings = [
            {
                id: this.nextListingId++,
                sellerId: -1,
                sellerName: "🎭 Thương nhân ẩn danh",
                anonymous: true,
                itemType: "specialty",
                regionId: 0,
                name: "Chè Shan & Than Quảng Ninh",
                icon: "🍃",
                qty: 1,
                price: 2
            },
            {
                id: this.nextListingId++,
                sellerId: -1,
                sellerName: "🎭 Thương nhân ẩn danh",
                anonymous: true,
                itemType: "specialty",
                regionId: 3,
                name: "Cà Phê Đất Đỏ Bazan",
                icon: "☕",
                qty: 1,
                price: 2
            },
            {
                id: this.nextListingId++,
                sellerId: -1,
                sellerName: "🎭 Thương nhân ẩn danh",
                anonymous: true,
                itemType: "specialty",
                regionId: 5,
                name: "Ngọc Thực Gạo ST25",
                icon: "🌾",
                qty: 1,
                price: 2
            }
        ];
        this.tradeBulletinNotices = [
            {
                id: "init_1",
                round: 1,
                text: "⚓ 6 Thương Cảng mở bán Đặc sản (2 Xu), Bảo Hiểm Hàng Hải (10 Xu) & Chìa Khóa Di Tích — Lúa/Gỗ/Sắt chỉ khai thác Mỏ hoặc mua Chợ P2P!"
            },
            {
                id: "init_2",
                round: 1,
                text: "📢 Kho hàng 6 Cảng tự động làm mới mỗi 08:30 (2 Cảng Key 1 • 2 Cảng Key 2 • 2 Cảng Key 3 sau 08:30) • Chợ P2P miễn phí 0 AP."
            }
        ];
    }

    addTradeBulletinNotice(text) {
        if (!this.tradeBulletinNotices) this.tradeBulletinNotices = [];
        this.tradeBulletinNotices.unshift({
            id: Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            round: this.roundNumber || 1,
            text
        });
        if (this.tradeBulletinNotices.length > 10) {
            this.tradeBulletinNotices.length = 10;
        }
    }

    getCargoCount(player) {
        // Luật Mục 3A: CHỈ tính Lúa, Gỗ, Sắt và Đặc sản vào sức chứa kho. Chìa khóa (Key 1/2/3) & Bảo Hiểm chiếm 0 ô kho.
        return (player.food || 0) + (player.wood || 0) + (player.iron || 0) + ((player.specialties && player.specialties.length) || 0);
    }

    getActivePlayer() {
        return this.players[this.activePlayerIdx];
    }

    getCurrentTile(player) {
        return this.world.hexMap.get(`${player.q},${player.r}`);
    }

    // ------------------------------------------------------------------------
    // DAMAGE & SERPENT COIN (🐍 BẢO HIỂM HÀNG HẢI QUỐC TẾ: HỒI 2 HP KHI MÁU VỀ 0)
    // ------------------------------------------------------------------------
    applyPlayerDamage(player, damageAmount, reason = "Sát thương trên biển") {
        if (!player || player.eliminated || damageAmount <= 0) return;
        window.SFX.playDamage();
        player.hp = Math.max(0, player.hp - damageAmount);
        player.damageTaken = (player.damageTaken || 0) + damageAmount;
        player.stormDamagedThisPhase = true;
        if (!this.matchStats) this.matchStats = { portTrades: {}, portVisits: {}, totalP2P: 0, disasterDamage: 0, stormReefDamage: 0 };
        this.matchStats.disasterDamage = (this.matchStats.disasterDamage || 0) + damageAmount;
        if (/Bão|Sét|Đá Ngầm/i.test(String(reason || ""))) {
            this.matchStats.stormReefDamage = (this.matchStats.stormReefDamage || 0) + damageAmount;
        }
        this.logEvent(`💥 ${player.name} chịu -${damageAmount} ❤️ HP (${reason}) → Còn ${player.hp}/${player.maxHp} HP.`);

        if (player.hp <= 0) {
            if (player.hasSerpentCoin) {
                player.hasSerpentCoin = false;
                player.hp = 2;
                player.eliminated = false;
                window.SFX.playRelicFanfare();
                this.world.triggerBurstAnimation(player.q, player.r, 0xec4899, 32);
                this.logEvent(`🛡️ BẢO HIỂM HÀNG HẢI QUỐC TẾ KÍCH HOẠT! Thuyền của ${player.name} thoát khỏi cảnh đắm tàu và tự động hồi phục 2 ❤️ HP!`);
                this.showToast(`🛡️ Bảo Hiểm Hàng Hải Quốc Tế kích hoạt! ${player.name} được hồi sinh ngay với 2 ❤️ HP!`);
            } else {
                player.hp = 0;
                player.eliminated = true;
                const shipMesh = this.world.shipMeshes.get(World3D.getPlayerShipKey(player));
                if (shipMesh) shipMesh.visible = false;
                this.logEvent(`☠️ Thuyền của ${player.name} đã bị đắm (0 HP) và BỊ LOẠI khỏi hành trình!`);
                this.showToast(`☠️ Thuyền của ${player.name} đã bị đắm (0 HP)!`);
            }
        }
    }

    // ------------------------------------------------------------------------
    // VIII. STANDARD TURN STRUCTURE — PHASE 1: START OF TURN (5 AP, MAX 3 MOVE)
    // ------------------------------------------------------------------------
    beginTurn() {
        clearTimeout(this.autoEndTurnTimer);
        this.clearZeroApAutoPassCountdown();
        this.lastInteractionAt = Date.now();
        this.lastGameplayActionAt = Date.now();
        this.isMatchClockFrozen = false;
        this.hideAfkWarningBanner();
        const p = this.getActivePlayer();
        this.syncAfkAutoNoticeUI();
        if (!p) return;
        if (p.eliminated) {
            this.advanceToNextPlayer();
            return;
        }

        const bonusAp = p.bonusApNextTurn || 0;
        p.ap = 5 + bonusAp;
        p.maxTurnAp = p.ap;
        p.bonusApNextTurn = 0;
        p.moveApSpent = 0;
        if (bonusAp > 0) {
            this.logEvent(`⛵ [Thuận Buồm Xuôi Gió] ${p.name} khởi đầu lượt với ${p.ap} AP (+${bonusAp} AP miễn phí từ Chuỗi Thông Thái 5/5)!`);
            if (this.isMyTurn()) {
                this.showToast(`⛵ Thuận Buồm Xuôi Gió! Lượt này bạn được thưởng +${bonusAp} AP miễn phí (Tổng ${p.ap} AP)!`);
            }
        }
        p.hexMoveCredits = 0;
        p.interactiveApUsed = false;
        p.repairedThisTurn = 0;
        p.yagiQuizTriggeredThisTurn = false;
        this.portApDeducted = false;
        this.portTaxPaidThisTurn = false;
        this.liveQuizState = null;

        window.SFX.playTurnStart();

        // Always focus camera on the local player's own ship when it's their turn (or in solo/offline mode)
        const localP = this.getLocalPlayer() || p;
        if (this.isMyTurn() || !this.roomState.code) {
            this.world.focusCameraOnHex(localP.q, localP.r);
        }

        this.refreshReachableHexes();
        this.updateUI();
        this.syncMultiplayerGameState();

        // Only Host executes Bot turns so all clients stay 100% synchronized!
        this._scheduledBotTurnKey = null;
        if (p.isAI && !this.isBusy && (!this.roomState.code || this.roomState.isHost)) {
            this.scheduleHostBotTurnIfNeeded();
        }
    }

    clearZeroApAutoPassCountdown() {
        clearTimeout(this.autoEndTurnTimer);
        this.autoEndTurnTimer = null;
        clearInterval(this.zeroApCountdownInterval);
        this.zeroApCountdownInterval = null;
        this.zeroApCountdownSec = null;
        this.zeroApCountdownMode = null;
        const endTurnBtn = document.getElementById("btn-end-turn");
        if (endTurnBtn) {
            endTurnBtn.textContent = "⏭️ Xong Lượt";
            endTurnBtn.title = "Kết thúc lượt hiện tại";
            endTurnBtn.classList.remove("is-countdown");
        }
    }

    recordPlayerInteraction() {
        this.lastInteractionAt = Date.now();
        if (this.afkWarningRemainingSec !== null) {
            this.hideAfkWarningBanner();
        }
    }

    recordGameplayAction() {
        this.lastInteractionAt = Date.now();
        this.lastGameplayActionAt = Date.now();
        if (this.isMatchClockFrozen) {
            this.isMatchClockFrozen = false;
            this.updateClockAndTickerUI();
        }
        if (this.afkWarningRemainingSec !== null) {
            this.hideAfkWarningBanner();
        }
    }

    hideAfkWarningBanner() {
        this.afkWarningRemainingSec = null;
        const banner = document.getElementById("afk-warning-banner");
        if (banner) banner.classList.add("hidden");
    }

    showAfkAutoNotice() {
        if (!this.afkAutoNoticeShown) {
            this.afkAutoNoticeShown = true;
            this.afkAutoNoticeShownAt = Date.now();
        }
        const notice = document.getElementById("afk-auto-notice");
        if (notice) notice.classList.remove("hidden");
    }

    hideAfkAutoNotice() {
        this.afkAutoNoticeShown = false;
        this.afkAutoNoticeShownAt = 0;
        const notice = document.getElementById("afk-auto-notice");
        if (notice) notice.classList.add("hidden");
    }

    syncAfkAutoNoticeUI() {
        const notice = document.getElementById("afk-auto-notice");
        const localP = this.getLocalPlayer();
        const activeP = this.getActivePlayer();
        const shouldShow = Boolean(
            this.isGameStarted &&
            !this.sandboxMode &&
            !this.matchWinner &&
            localP &&
            !localP.eliminated &&
            localP.afkBotTakeover &&
            activeP &&
            activeP.id === localP.id
        );
        if (shouldShow) {
            if (!this.afkAutoNoticeShown) {
                this.afkAutoNoticeShown = true;
                this.afkAutoNoticeShownAt = Date.now();
            }
            if (notice) notice.classList.remove("hidden");
        } else {
            this.afkAutoNoticeShown = false;
            this.afkAutoNoticeShownAt = 0;
            if (notice) notice.classList.add("hidden");
        }
    }

    confirmStillPlayingFromAFK() {
        this.recordPlayerInteraction();
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        this.showToast("✅ Đã xác nhận bạn vẫn đang chơi!");
    }

    triggerAfkBotTakeover(player) {
        if (!player || player.isAI || player.eliminated) return;
        this.hideAfkWarningBanner();
        this.clearZeroApAutoPassCountdown();
        this.cancelLockedMovePath(false);
        player.afkBotTakeover = true;
        player.isAI = true;
        const localP = this.getLocalPlayer();
        const isLocalTarget = Boolean(localP && localP.id === player.id);
        if (isLocalTarget) {
            this.showAfkAutoNotice();
        }
        const msg = `🤖 ${player.name} đứng yên quá 50s — Tàu Máy tạm tiếp quản điều khiển (không phạt Xu/HP)!`;
        this.logEvent(msg);
        this.addTradeBulletinNotice(msg);
        if (!isLocalTarget) {
            this.showToast(msg);
        }
        this.updateUI();
        this.syncMultiplayerGameState();
        if (!this.roomState.code || this.roomState.isHost) {
            this._scheduledBotTurnKey = null;
            this.scheduleHostBotTurnIfNeeded();
        }
    }

    reclaimControlFromAFKBot() {
        this.hideAfkAutoNotice();
        const localP = this.getLocalPlayer();
        if (!localP || !localP.afkBotTakeover) return;
        localP.afkBotTakeover = false;
        localP.isAI = false;
        // Dừng hẳn luồng tự lái của Bot nếu đang chờ hoặc vừa kết thúc bước đi
        clearTimeout(this.aiTurnTimer);
        clearTimeout(this.aiPostMoveTimer);
        this._scheduledBotTurnKey = null;
        this.clearZeroApAutoPassCountdown();
        this.lastInteractionAt = Date.now();
        this.lastGameplayActionAt = Date.now();
        this.isMatchClockFrozen = false;
        this.hideAfkWarningBanner();
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        const msg = "✋ Bạn đã bấm vào màn hình — Đã lấy lại quyền lái!";
        this.logEvent(`✋ ${localP.name} đã tương tác trở lại và lấy lại quyền tự điều khiển tàu!`);
        this.showToast(msg);
        this.refreshReachableHexes();
        this.updateUI();
        this.syncMultiplayerGameState();
    }

    isMovementExhaustedAtSea(player) {
        if (!player || player.isAI || player.eliminated) return false;
        // (d) Không có Quiz đang chờ trả lời (kể cả khi thu gọn) và không đang mở cửa sổ Thương Cảng
        if (this.hasActiveUnansweredQuiz() || this.currentPortTile) return false;

        // (a) Đã dùng hết AP tối đa cho phép di chuyển trong lượt HOẶC không còn ô biển hợp lệ nào đi tiếp được
        const remainingSteps = this.getRemainingHexSteps(player);
        if (remainingSteps > 0) {
            const reach = this.computeNavigablePaths(player.q, player.r, remainingSteps);
            if (reach && reach.size > 0) return false;
        }

        // (c) KHÔNG loại trừ nút Sửa Tàu (vẫn chạy nhịp 5s chờ + 5s đếm ngược để người chơi chọn sửa hoặc bỏ qua)

        // (b) Tàu đang đứng ở ô biển trống — không có tương tác khả dụng tại chỗ (Mỏ / Cảng / Di tích / Tàu FDI)
        const curTile = this.getCurrentTile(player);
        if (curTile) {
            const canInteractAP = this.canSpendInteractiveAP(player);

            // Thương Cảng tại chỗ (bị chặn thuế 0 Xu coi như trống)
            if (curTile.isPort && (canInteractAP || this.portApDeducted)) {
                const owner = this.getPortCharterOwner(curTile.regionId);
                const needsTax = Boolean(owner && owner.id !== player.id && !this.portTaxPaidThisTurn);
                if (!needsTax || (player.coins || 0) >= 1) return false;
            }

            // Mỏ tài nguyên tại chỗ (mỏ bị Giông Bão phong tỏa, đang hồi cooldown, hoặc kho đầy coi như trống)
            if (curTile.resourceType && canInteractAP) {
                const mineBlocked = this.isMineBlockedByStorm(curTile);
                const onCooldown = (curTile.resourceCooldown || 0) > 0;
                const cargoFull = this.getCargoCount(player) >= this.getMaxCargo(player);
                if (!mineBlocked && !onCooldown && !cargoFull) return false;
            }

            // Di tích tại chỗ (khóa 08:30, đã chinh phục, hoặc chưa đủ Key/tài nguyên coi như trống)
            if (curTile.monumentId && canInteractAP && !curTile.monumentLocked) {
                const tier = curTile.monumentTier || 1;
                const earlyLocked = (tier >= 2 && this.isEarlyGameMonumentLockActive());
                const tier1Blocked = (tier === 1 && (player.tier1Visited || 0) >= 1);
                const alreadyOwned = (player.relics || []).some(r => r.id === curTile.monumentId);
                const feeCoins = tier === 1 ? 2 : (tier === 2 ? 3 : 6);
                const feeFood = tier;
                const feeIron = tier === 3 ? 1 : 0;
                const hasReqs = (player.keys && (player.keys[tier] || 0) >= 1) &&
                    (player.coins || 0) >= feeCoins &&
                    (player.food || 0) >= feeFood &&
                    (player.iron || 0) >= feeIron;
                if (!earlyLocked && !tier1Blocked && !alreadyOwned && hasReqs) return false;
            }

            // Sự kiện Tàu FDI tại chỗ
            if (curTile.hasNPC && canInteractAP) return false;
        }

        return true;
    }

    hasNoRemainingTurnActions(player) {
        return this.isMovementExhaustedAtSea(player);
    }

    checkAutoEndTurnIfNoAP(forceRestart = false) {
        if (!this.isGameStarted || this.isBusy) {
            this.clearZeroApAutoPassCountdown();
            return;
        }
        if (this.sandboxInfiniteMove) {
            this.clearZeroApAutoPassCountdown();
            return;
        }
        if (!this.isMyTurn()) {
            this.clearZeroApAutoPassCountdown();
            return;
        }

        const p = this.getActivePlayer();
        if (!p || p.isAI || p.eliminated) {
            this.clearZeroApAutoPassCountdown();
            return;
        }

        // During Super Typhoon Yagi, spending 4 AP triggers the mandatory Yagi Storm Quiz!
        if (!this.isModalOpen() && this.currentWeatherPhase === "super_typhoon_yagi" && ((p.maxTurnAp || 5) - p.ap) >= 4 && !p.yagiQuizTriggeredThisTurn) {
            this.clearZeroApAutoPassCountdown();
            this.triggerYagiTurnQuiz(p);
            return;
        }

        // Tự chuyển lượt chỉ chạy ở chế độ PvP (tắt trong Sandbox) & tạm hoãn khi đang mở Thương Cảng / chờ Quiz
        if (this.sandboxMode || this.hasActiveUnansweredQuiz() || this.currentPortTile) {
            this.clearZeroApAutoPassCountdown();
            return;
        }

        // TRƯỜNG HỢP 1: Hết sạch toàn bộ AP (AP === 0) & không mở modal -> Đếm ngược 5 giây
        if (p.ap <= 0 && p.hexMoveCredits <= 0) {
            if (this.isModalOpen()) {
                this.clearZeroApAutoPassCountdown();
                return;
            }
            this.clearZeroApAutoPassCountdown();
            this.zeroApCountdownMode = "zero_ap";
            this.zeroApCountdownSec = 5;
            const updateBtn5 = () => {
                const endTurnBtn = document.getElementById("btn-end-turn");
                if (endTurnBtn && this.zeroApCountdownSec !== null) {
                    endTurnBtn.textContent = `⏭️ 0 AP • ${this.zeroApCountdownSec}s`;
                    endTurnBtn.title = `Đã dùng hết 0 AP — Tự động chuyển lượt sau ${this.zeroApCountdownSec}s`;
                    endTurnBtn.classList.add("is-countdown");
                }
            };
            updateBtn5();
            this.zeroApCountdownInterval = setInterval(() => {
                if (!this.isMyTurn() || this.isBusy || this.hasActiveUnansweredQuiz() || this.currentPortTile || this.isModalOpen() || this.sandboxMode || this.sandboxInfiniteMove) {
                    this.clearZeroApAutoPassCountdown();
                    return;
                }
                const curP = this.getActivePlayer();
                if (!curP || curP.ap > 0 || curP.hexMoveCredits > 0) {
                    this.clearZeroApAutoPassCountdown();
                    return;
                }
                this.zeroApCountdownSec -= 1;
                if (this.zeroApCountdownSec <= 0) {
                    this.clearZeroApAutoPassCountdown();
                    this.cancelLockedMovePath(false);
                    this.showToast(`⏭️ ${curP.name} đã hết AP — Tự động chuyển lượt!`);
                    this.endPlayerTurn(true);
                } else {
                    updateBtn5();
                }
            }, 1000);
            return;
        }

        // TRƯỜNG HỢP 2: Còn AP dư (AP > 0) nhưng đã hết AP di chuyển giữa biển trống -> 5s chờ im + 5s hiện đếm ngược!
        if (p.ap > 0 && this.isMovementExhaustedAtSea(p)) {
            if (!forceRestart && this.zeroApCountdownMode === "sea_exhausted" && (this.autoEndTurnTimer || this.zeroApCountdownInterval)) {
                return; // Giữ nguyên nhịp 5s chờ + 5s đếm ngược đang chạy
            }
            this.clearZeroApAutoPassCountdown();
            this.zeroApCountdownMode = "sea_exhausted";

            // Giai đoạn 1 (0s -> 5s): Chờ im 5 giây (nút giữ nguyên "⏭️ Xong Lượt" để người chơi thoải mái bấm Sửa Tàu hoặc Xong Lượt)
            this.autoEndTurnTimer = setTimeout(() => {
                this.autoEndTurnTimer = null;
                if (!this.isMyTurn() || this.isBusy || this.sandboxMode || this.sandboxInfiniteMove) {
                    this.clearZeroApAutoPassCountdown();
                    return;
                }
                const curP = this.getActivePlayer();
                if (!curP || curP.ap <= 0 || !this.isMovementExhaustedAtSea(curP)) {
                    this.clearZeroApAutoPassCountdown();
                    return;
                }

                // Giai đoạn 2 (5s -> 10s): Bật hiển thị đếm ngược 5 -> 4 -> 3 -> 2 -> 1 ngay trên nút Xong Lượt
                this.zeroApCountdownSec = 5;
                const updateBtnSea = () => {
                    const endTurnBtn = document.getElementById("btn-end-turn");
                    if (endTurnBtn && this.zeroApCountdownSec !== null) {
                        endTurnBtn.textContent = `⏭️ Tự xong ${this.zeroApCountdownSec}s`;
                        endTurnBtn.title = `Đã hết AP di chuyển ở vùng biển trống — Tự động kết thúc lượt sau ${this.zeroApCountdownSec}s`;
                        endTurnBtn.classList.add("is-countdown");
                    }
                };
                updateBtnSea();

                this.zeroApCountdownInterval = setInterval(() => {
                    if (!this.isMyTurn() || this.isBusy || this.sandboxMode || this.sandboxInfiniteMove) {
                        this.clearZeroApAutoPassCountdown();
                        return;
                    }
                    const liveP = this.getActivePlayer();
                    if (!liveP || liveP.ap <= 0 || !this.isMovementExhaustedAtSea(liveP)) {
                        this.clearZeroApAutoPassCountdown();
                        return;
                    }
                    this.zeroApCountdownSec -= 1;
                    if (this.zeroApCountdownSec <= 0) {
                        this.clearZeroApAutoPassCountdown();
                        this.cancelLockedMovePath(false);
                        if (this.isModalOpen()) this.closeModal();
                        const logMsg = `⏭️ ${liveP.name} đã hết AP di chuyển giữa biển — Tự động chuyển lượt.`;
                        this.logEvent(logMsg);
                        this.showToast(logMsg);
                        this.endPlayerTurn(true);
                    } else {
                        updateBtnSea();
                    }
                }, 1000);
            }, 5000);
            return;
        }

        this.clearZeroApAutoPassCountdown();
    }

    // ------------------------------------------------------------------------
    // REALISTIC SEA PATHFINDING (5 AP TOTAL, MAX 3 AP FOR MOVEMENT)
    // - Normal Weather: 1 AP = 2 hexes (Max 6 hexes/turn)
    // - Super Typhoon Yagi: 1 AP = 1 hex (Max 3 hexes/turn)
    // - Single-click pathfinding does NOT avoid Reefs (-1 HP if sailed through)
    // - Double-click + Hold-drag lets players draw a custom path around Reefs!
    // ------------------------------------------------------------------------
    getStepsPerMoveAP() {
        return this.currentWeatherPhase === "super_typhoon_yagi" ? 1 : 2;
    }

    getRemainingHexSteps(player) {
        if (this.sandboxInfiniteMove && !player.isAI) {
            return 999;
        }
        // Strict rule: Out of 5 total AP, at most 3 AP may be spent on movement!
        const remainingMoveAP = Math.max(0, Math.min(3 - (player.moveApSpent || 0), player.ap));
        const stepsPerAp = this.getStepsPerMoveAP();
        return player.hexMoveCredits + remainingMoveAP * stepsPerAp;
    }

    hexDistance(q1, r1, q2, r2) {
        return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
    }

    computeNavigablePaths(startQ, startR, maxSteps) {
        const reachable = new Map();
        if (maxSteps <= 0) return reachable;

        const startKey = `${startQ},${startR}`;
        const queue = [{ q: startQ, r: startR, steps: 0, path: [] }];
        const bestDist = new Map([[startKey, 0]]);
        const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

        while (queue.length > 0) {
            const cur = queue.shift();
            if (cur.steps >= maxSteps) continue;

            for (const [dq, dr] of dirs) {
                const nq = cur.q + dq;
                const nr = cur.r + dr;
                const key = `${nq},${nr}`;
                const nextTile = this.world.hexMap.get(key);

                if (!nextTile || !nextTile.navigable) continue;

                const nextSteps = cur.steps + 1;
                if (!bestDist.has(key) || bestDist.get(key) > nextSteps) {
                    bestDist.set(key, nextSteps);
                    const nextPath = [...cur.path, nextTile];
                    reachable.set(key, { steps: nextSteps, path: nextPath });

                    // REALISTIC MARITIME NAVIGATION:
                    // Ships can dock at a Monument, Trading Port, Resource Extraction Node, or Rare NPC tile
                    // as their final destination, but CANNOT sail straight *through* them to reach another hex!
                    // Note: Reefs (`nextTile.isReef`) ARE passed straight through by automatic single-click pathfinding!
                    // To avoid Reefs, players use Double-Click + Hold-Drag manual path drawing!
                    const isDockOnlyPOI = Boolean(
                        nextTile.monumentId ||
                        nextTile.isPort ||
                        nextTile.resourceType ||
                        nextTile.hasNPC
                    );
                    if (!isDockOnlyPOI || this.sandboxInfiniteMove) {
                        queue.push({ q: nq, r: nr, steps: nextSteps, path: nextPath });
                    }
                }
            }
        }
        return reachable;
    }

    refreshReachableHexes() {
        this.ensureValidPlayerPositions();
        const p = this.getActivePlayer();
        if (!p) return;
        const maxSteps = this.getRemainingHexSteps(p);
        // Only show green reachable path highlights to the player whose turn it is!
        const reachable = (this.isMyTurn() && maxSteps > 0)
            ? this.computeNavigablePaths(p.q, p.r, maxSteps)
            : new Map();

        this.world.updateReachableHighlights(reachable, `${p.q},${p.r}`);
    }

    // ------------------------------------------------------------------------
    // PATH PREVIEW METADATA (AP COST, REEF HITS, PORT TAX & DRAG NEIGHBORS)
    // ------------------------------------------------------------------------
    buildPathPreviewMeta(pathTiles, isCustomDrawn = false) {
        const p = this.getActivePlayer();
        const startTile = p ? this.getCurrentTile(p) : null;
        let fullPath = Array.isArray(pathTiles) ? [...pathTiles] : [];

        // Ensure hover paths start cleanly from the ship's current hex
        if (startTile && fullPath.length > 0 && (fullPath[0].q !== startTile.q || fullPath[0].r !== startTile.r)) {
            fullPath = [startTile, ...fullPath];
        }

        const stepTiles = fullPath.length > 1 ? fullPath.slice(1) : [];
        const steps = stepTiles.length;
        const stepsPerAp = this.currentWeatherPhase === "super_typhoon_yagi" ? 1 : 2;
        const apCost = this.sandboxInfiniteMove ? 0 : Math.ceil(steps / stepsPerAp);
        const reefHits = stepTiles.filter(t => t && t.isReef).length;

        let portTaxMode = "none";
        const dest = stepTiles.length > 0 ? stepTiles[stepTiles.length - 1] : null;
        if (dest && dest.isPort && p) {
            const owner = this.getPortCharterOwner(dest.regionId);
            if (owner && owner.id !== p.id) {
                portTaxMode = (p.coins || 0) < 1 ? "blocked0" : "pay1";
            }
        }

        // Compute valid adjacent sea tiles when custom dragging so player sees where they can drag next
        const nextNeighbors = [];
        if (isCustomDrawn && p && this.world && this.world.hexMap) {
            const maxSteps = this.getRemainingHexSteps(p);
            const remaining = maxSteps - steps;
            const lastTile = fullPath.length > 0 ? fullPath[fullPath.length - 1] : startTile;
            const isDockStop = Boolean(
                lastTile &&
                steps > 0 &&
                !this.sandboxInfiniteMove &&
                (lastTile.monumentId || lastTile.isPort || lastTile.resourceType || lastTile.hasNPC)
            );
            if (lastTile && remaining > 0 && !isDockStop) {
                const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
                dirs.forEach(([dq, dr]) => {
                    const nb = this.world.hexMap.get(`${lastTile.q + dq},${lastTile.r + dr}`);
                    if (!nb || !nb.navigable) return;
                    if (fullPath.some(pt => pt.q === nb.q && pt.r === nb.r)) return;
                    nextNeighbors.push(nb);
                });
            }
        }

        return {
            fullPath,
            steps,
            apCost,
            isInfiniteMove: Boolean(this.sandboxInfiniteMove),
            reefHits,
            portTaxMode,
            nextNeighbors,
            isLocked: Boolean(this.lockedMovePath && (!this.world || !this.world.isDrawingCustomPath))
        };
    }

    lockMovePath(stepTiles, mode = "auto") {
        const p = this.getActivePlayer();
        if (!p || !Array.isArray(stepTiles) || stepTiles.length === 0) {
            this.cancelLockedMovePath(false);
            return false;
        }
        const startTile = this.getCurrentTile(p);
        const destTile = stepTiles[stepTiles.length - 1];
        this.lockedMovePath = {
            mode: mode === "custom" ? "custom" : "auto",
            startTile,
            path: [...stepTiles],
            destTile
        };
        if (this.world) {
            this.world.isPathLocked = true;
            this.world.isDrawingCustomPath = false;
            this.world.showPathPreview(startTile ? [startTile, ...stepTiles] : [...stepTiles], mode === "custom");
        }
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        return true;
    }

    cancelLockedMovePath(showFeedback = false) {
        const hadLocked = Boolean(this.lockedMovePath);
        this.lockedMovePath = null;
        this.lockedMovePath = null;
        if (this.world) this.world.isPathLocked = false;
        this.customDrawnPath = [];
        if (this.world) {
            this.world.isPathLocked = false;
            this.world.isDrawingCustomPath = false;
            this.world.isClickDrawMode = false;
            this.world.clearPathPreview();
        }
        if (showFeedback && hadLocked) {
            window.SFX && window.SFX.playClick && window.SFX.playClick();
            this.showToast("↩️ Đã hủy đường đi đang chọn.");
        }
    }

    // ------------------------------------------------------------------------
    // DOUBLE-CLICK + HOLD-DRAG MANUAL PATH DRAWING (STEER AROUND REEFS!)
    // ------------------------------------------------------------------------
    startCustomPathDrag(firstTile) {
        if (!this.isGameStarted || this.isBusy) return false;
        if (this.hasActiveUnansweredQuiz()) {
            this.showToast("⏳ Bạn đang có câu hỏi Quiz chưa trả lời! Hãy bấm '❓ Mở Lại Quiz' để hoàn thành trước khi di chuyển.");
            return false;
        }
        if (this.isPreGameCountingDown || this.roomState.status === "turn_order_quiz") {
            const modalEl = document.getElementById("modal-overlay");
            if (modalEl && !modalEl.classList.contains("hidden")) {
                return false;
            }
            if (this.preGameCountdownTimer) {
                clearInterval(this.preGameCountdownTimer);
                this.preGameCountdownTimer = null;
            }
            this.isPreGameCountingDown = false;
            this.roomState.status = "playing";
        }
        if (!this.isMyTurn()) return false;

        const p = this.getActivePlayer();
        if (!p || !firstTile || !firstTile.navigable) return false;

        const maxSteps = this.getRemainingHexSteps(p);
        if (maxSteps <= 0) {
            this.showToast("⛵ Bạn đã hết lượt di chuyển trong lượt này (Tối đa 3 AP di chuyển)!");
            return false;
        }

        this.lockedMovePath = null;
        if (this.world) this.world.isPathLocked = false;
        this.customDrawnPath = [];
        const distFromShip = this.hexDistance(p.q, p.r, firstTile.q, firstTile.r);

        if (distFromShip === 1) {
            this.customDrawnPath.push(firstTile);
        } else if (distFromShip > 1) {
            const navInfo = this.getNavigablePathTo(p, firstTile.q, firstTile.r);
            if (navInfo && navInfo.path && navInfo.path.length <= maxSteps) {
                this.customDrawnPath.push(...navInfo.path);
            } else {
                this.showToast("✏️ Hãy nhấp đúp (2 lần) hoặc giữ kéo từ ô thuyền đang đứng / ô kế bên để vẽ đường đi!");
                return false;
            }
        }

        const startTile = this.getCurrentTile(p);
        this.world.showPathPreview(startTile ? [startTile, ...this.customDrawnPath] : [...this.customDrawnPath], true);
        this.showToast(`✏️ Đang tùy chỉnh đường đi (${this.customDrawnPath.length}/${maxSteps} ô) — Kéo chuột qua từng ô muốn đi rồi thả chuột!`);
        return true;
    }

    stepCustomPathDrag(tile) {
        if (!this.isGameStarted || !this.isMyTurn() || !tile || !tile.navigable) return;

        const p = this.getActivePlayer();
        if (!p) return;
        const maxSteps = this.getRemainingHexSteps(p);

        // Ignore if dragging on current ship hex when path is empty
        if (this.customDrawnPath.length === 0 && tile.q === p.q && tile.r === p.r) return;

        // Allow backtracking if dragging back onto the previous hex in customDrawnPath
        if (this.customDrawnPath.length >= 2) {
            const prevTile = this.customDrawnPath[this.customDrawnPath.length - 2];
            if (prevTile.q === tile.q && prevTile.r === tile.r) {
                this.customDrawnPath.pop();
                const startTile = this.getCurrentTile(p);
                this.world.showPathPreview(startTile ? [startTile, ...this.customDrawnPath] : [...this.customDrawnPath], true);
                return;
            }
        } else if (this.customDrawnPath.length === 1 && tile.q === p.q && tile.r === p.r) {
            this.customDrawnPath.pop();
            const startTile = this.getCurrentTile(p);
            if (startTile) {
                this.world.showPathPreview([startTile], true);
            } else {
                this.world.clearPathPreview();
            }
            return;
        }

        const lastNode = this.customDrawnPath.length > 0
            ? this.customDrawnPath[this.customDrawnPath.length - 1]
            : { q: p.q, r: p.r };

        if (lastNode.q === tile.q && lastNode.r === tile.r) return;

        // If the previous node in the path is already a dock-only POI, cannot drag through it unless sandboxInfiniteMove
        if (this.customDrawnPath.length > 0 && !this.sandboxInfiniteMove) {
            const prev = this.customDrawnPath[this.customDrawnPath.length - 1];
            if (prev.monumentId || prev.isPort || prev.resourceType || prev.hasNPC) {
                return;
            }
        }

        const remainingSteps = maxSteps - this.customDrawnPath.length;
        if (remainingSteps <= 0) return;

        const stepDist = this.hexDistance(lastNode.q, lastNode.r, tile.q, tile.r);
        if (stepDist === 1) {
            if (!this.customDrawnPath.some(t => t.q === tile.q && t.r === tile.r)) {
                this.customDrawnPath.push(tile);
                const startTile = this.getCurrentTile(p);
                this.world.showPathPreview(startTile ? [startTile, ...this.customDrawnPath] : [...this.customDrawnPath], true);
            }
        } else if (stepDist > 1 && stepDist <= remainingSteps) {
            // Smoothly bridge intermediate hexes if the user drags the mouse fast across hexes
            const subPaths = this.computeNavigablePaths(lastNode.q, lastNode.r, remainingSteps);
            const bridge = subPaths.get(`${tile.q},${tile.r}`);
            if (bridge && bridge.path && bridge.path.length <= remainingSteps) {
                for (const bt of bridge.path) {
                    if (!this.customDrawnPath.some(t => t.q === bt.q && t.r === bt.r) && !(bt.q === p.q && bt.r === p.r)) {
                        this.customDrawnPath.push(bt);
                    }
                }
                const startTile = this.getCurrentTile(p);
                this.world.showPathPreview(startTile ? [startTile, ...this.customDrawnPath] : [...this.customDrawnPath], true);
            }
        }
    }

    commitCustomPathDrag() {
        const p = this.getActivePlayer();
        if (!p || !this.customDrawnPath || this.customDrawnPath.length === 0) {
            this.cancelLockedMovePath(false);
            return;
        }
        const path = [...this.customDrawnPath];
        this.customDrawnPath = [];
        // Releasing drag LOCKS the custom drawn path on board (does NOT move ship immediately!)
        this.lockMovePath(path, "custom");
    }

    handleHexClick(tile) {
        if (!this.isGameStarted || this.isBusy) return;
        if (this.hasActiveUnansweredQuiz()) {
            this.showToast("⏳ Bạn đang có câu hỏi Quiz chưa trả lời! Hãy bấm '❓ Mở Lại Quiz' để hoàn thành trước khi di chuyển.");
            return;
        }
        const p = this.getActivePlayer();
        if (!p) return;

        // If the player clicks on the map while the pre-game countdown is still running
        // or after closing the Opening Speed Quiz modal, immediately transition to "playing" so they can move!
        if (this.isPreGameCountingDown || this.roomState.status === "turn_order_quiz") {
            if (!this.isModalOpen()) {
                this.confirmStartMatchAfterOpeningQuiz();
            } else {
                return;
            }
        }

        // Strictly prevent non-active players from moving or acting during another player's turn!
        if (!this.isMyTurn()) {
            this.showToast(`👁️ Đang là lượt của [${p.name}]! Bạn có thể xoay/phóng to camera tự do để quan sát bản đồ.`);
            return;
        }

        if (!tile.navigable) {
            this.showToast("⛰️ Vùng đất liền / núi cao này không thể đi xuyên qua! Hãy điều khiển thuyền đi vòng trên biển.");
            return;
        }

        const key = `${tile.q},${tile.r}`;
        if (tile.q === p.q && tile.r === p.r) {
            this.cancelLockedMovePath(false);
            this.triggerContextualActionOnCurrentHex();
            return;
        }

        // Sandbox Click-to-Teleport mode: instantly teleport ship to clicked water hex!
        if (this.sandboxTeleport) {
            this.cancelLockedMovePath(false);
            p.q = tile.q;
            p.r = tile.r;
            this.world.syncShipsSmoothly(this.players, this.getLocalPlayer());
            this.world.triggerBurstAnimation(tile.q, tile.r, 0xfbbf24, 24);
            window.SFX.playClick();
            this.refreshReachableHexes();
            this.updateUI();
            this.syncMultiplayerGameState();
            this.showToast(`⚡ [Sáng Tạo] Đã dịch chuyển tức thời tới ô (${tile.q}, ${tile.r})!`);
            return;
        }

        // STEP 2 CONFIRMATION: Clicking the EXACT destination hex of the lockedMovePath executes the move!
        if (this.lockedMovePath && this.lockedMovePath.destTile &&
            this.lockedMovePath.destTile.q === tile.q && this.lockedMovePath.destTile.r === tile.r) {
            const confirmed = this.lockedMovePath;
            this.cancelLockedMovePath(false);
            this.movePlayerAlongRoute(p, confirmed.destTile, confirmed.path.length, confirmed.path);
            return;
        }

        // Guarantee reachablePaths is freshly computed for the active player before checking!
        if ((!this.world.reachablePaths || this.world.reachablePaths.size === 0) && this.getRemainingHexSteps(p) > 0) {
            this.refreshReachableHexes();
        }

        if (!this.world.reachablePaths.has(key)) {
            const maxMoveDesc = this.currentWeatherPhase === "super_typhoon_yagi"
                ? "Trong Siêu Bão Yagi: 1 AP = 1 ô (Tối đa 3 AP = 3 ô)"
                : "Tối đa 3 AP = 6 ô nước cho việc di chuyển";
            this.showToast(`⛵ Ô này nằm ngoài tầm di chuyển hiện tại (${maxMoveDesc})!`);
            return;
        }

        // STEP 1 LOCK: Compute shortest path and lock preview on map (do NOT move immediately!)
        const routeInfo = this.world.reachablePaths.get(key);
        this.lockMovePath(routeInfo.path, "auto");
    }

    movePlayerAlongRoute(player, targetTile, stepsRequired, pathTiles, onAfterMove = null) {
        if (!player.isAI) {
            this.cancelLockedMovePath(false);
            this.recordGameplayAction();
        }
        const stepsPerAp = this.getStepsPerMoveAP();
        if (this.sandboxInfiniteMove && !player.isAI) {
            player.ap = Math.max(5, player.ap);
            player.moveApSpent = 0;
            player.hexMoveCredits = 0;
        } else {
            let needed = stepsRequired;
            if (player.hexMoveCredits >= needed) {
                player.hexMoveCredits -= needed;
                needed = 0;
            } else {
                needed -= player.hexMoveCredits;
                player.hexMoveCredits = 0;
                const apToSpend = Math.ceil(needed / stepsPerAp);
                player.ap = Math.max(0, player.ap - apToSpend);
                player.moveApSpent += apToSpend;
                player.hexMoveCredits = (apToSpend * stepsPerAp) - needed;
            }
        }

        player.q = targetTile.q;
        player.r = targetTile.r;
        this.isBusy = true;

        this.world.animateShipAlongPath(player, pathTiles, player.id, this.players.length, () => {
            this.isBusy = false;

            // Check if the ship sailed through or landed on any Reef (Bãi Đá Ngầm -> -1 HP per Reef!)
            const reefHits = (pathTiles || []).filter(t => t && (t.isReef || t.terrain === "reef"));
            if (reefHits.length > 0) {
                reefHits.forEach(rt => {
                    this.world.triggerBurstAnimation(rt.q, rt.r, 0xf43f5e, 22);
                });
                this.applyPlayerDamage(player, reefHits.length, `Đi qua ${reefHits.length} Bãi Đá Ngầm (Nhấp đúp giữ kéo để vẽ đường né!)`);
                if (!player.eliminated) {
                    this.showToast(`⚠️ Thuyền của ${player.name} va phải Bãi Đá Ngầm (-${reefHits.length} ❤️ HP)! Mẹo: Nhấp đúp & giữ kéo để tự vẽ đường né!`);
                }
            }

            this.refreshReachableHexes();
            this.updateUI();
            this.syncMultiplayerGameState();
            if (onAfterMove) onAfterMove();
            this.checkAutoEndTurnIfNoAP();
        });
    }

    // ------------------------------------------------------------------------
    // INTERACTIVE ACTIONS (1 Mandatory Interactive AP)
    // ------------------------------------------------------------------------
    canSpendInteractiveAP(player) {
        if (this.sandboxInfiniteMove && !player.isAI) return true;
        return player.ap >= 1;
    }

    spendInteractiveAP(player) {
        if (this.sandboxInfiniteMove && !player.isAI) {
            player.ap = Math.max(5, player.ap);
            this.refreshReachableHexes();
            this.updateUI();
            return;
        }
        player.ap = Math.max(0, player.ap - 1);
        player.interactiveApUsed = true;
        if (player.ap <= 0 && player.hexMoveCredits <= 0) {
            player.ap = 0;
        }
        this.refreshReachableHexes();
        this.updateUI();
    }

    triggerContextualActionOnCurrentHex() {
        const p = this.getActivePlayer();
        if (!this.isMyTurn()) {
            return;
        }
        const tile = this.getCurrentTile(p);
        if (!tile) return;

        if (!tile.monumentId && !tile.isPort && !tile.resourceType && !tile.hasNPC) {
            this.showToast("⛵ Hãy di chuyển thuyền đến ô Thương Cảng, Di Tích, Mỏ Tài Nguyên hoặc Tàu FDI để tương tác!");
            return;
        }

        if (!this.canSpendInteractiveAP(p)) {
            this.showToast("Bạn đã hết Điểm Hành Động (AP) trong lượt này!");
            this.checkAutoEndTurnIfNoAP();
            return;
        }

        if (tile.monumentId) {
            this.openMonumentModal(tile);
        } else if (tile.isPort) {
            this.openTradePortModal(tile);
        } else if (tile.resourceType) {
            this.openResourceMiningModal(tile);
        } else if (tile.hasNPC) {
            this.openNPCMinigameModal(tile);
        }
    }

    // ------------------------------------------------------------------------
    // III. IN-SITU SHIP REPAIR (1 AP + 1 Coin + 1 Wood = +1 HP, max +2 HP/turn)
    // ------------------------------------------------------------------------
    actionRepairShip() {
        const p = this.getActivePlayer();
        if (!this.isMyTurn()) {
            this.showToast(`👁️ Chỉ được sửa tàu khi đang trong lượt của bạn!`);
            return;
        }
        if (!this.canSpendInteractiveAP(p)) {
            this.showToast("Cần ít nhất 1 AP để sửa thuyền tại chỗ!");
            return;
        }
        if (p.hp >= p.maxHp) {
            this.showToast("Thuyền đang đầy máu (5/5 HP)!");
            return;
        }
        if (p.repairedThisTurn >= 2) {
            this.showToast("Luật giới hạn tối đa hồi phục 2 HP mỗi lượt!");
            return;
        }
        if (p.coins < 1 || p.wood < 1) {
            this.showToast("Sửa thuyền tại chỗ cần: 1 AP + 1 Xu + 1 Gỗ!");
            return;
        }

        this.spendInteractiveAP(p);
        this.recordGameplayAction();
        p.coins -= 1;
        p.wood -= 1;
        p.hp = Math.min(p.maxHp, p.hp + 1);
        p.repairedThisTurn += 1;

        window.SFX.playMine();
        this.world.triggerBurstAnimation(p.q, p.r, 0x4b8b64, 16);
        this.logEvent(`🛠️ ${p.name} đã sửa thuyền tại chỗ (+1 HP → ${p.hp}/${p.maxHp} HP).`);
        this.showToast(`🛠️ Đã sửa thuyền +1 HP (${p.hp}/${p.maxHp} HP)!`);
        this.updateUI();
        this.syncMultiplayerGameState();
        // Reset nhịp 5s chờ + 5s đếm ngược sau khi bấm Sửa Tàu (hoặc chuyển ngay sang đếm ngược 5s nếu AP về 0)
        this.checkAutoEndTurnIfNoAP(true);
    }

    // ------------------------------------------------------------------------
    // V & VII.1 RESOURCE MINING (NO COINS FROM MINING — RESOURCES ONLY!)
    // - Correct answer: +2 Resource (0 Xu)
    // - Wrong answer: +1 Resource (0 Xu; during Yagi also triggers -1 HP Lightning!)
    // - Sunset / Starry Night: Cooldown reduced by 1 round (-1 vòng)
    // ------------------------------------------------------------------------
    openResourceMiningModal(tile) {
        const p = this.getActivePlayer();
        if (!this.isMyTurn()) return;
        if (this.isMineBlockedByStorm(tile)) {
            this.showToast("⛈️ Mỏ này đang bị Giông Bão phong tỏa! Chờ trời quang hoặc tìm mỏ khác.");
            return;
        }
        if (!this.canSpendInteractiveAP(p)) {
            this.showToast("Cần 1 AP Tương Tác để khai thác tài nguyên!");
            return;
        }
        if (tile.resourceCooldown > 0) {
            this.showToast(`Mỏ tài nguyên đang tái tạo sinh thái! Còn ${tile.resourceCooldown} vòng nữa mới phục hồi 100%.`);
            return;
        }
        if (this.getCargoCount(p) >= this.getMaxCargo(p)) {
            this.showToast(`Khoang tàu đã đầy (Tối đa ${this.getMaxCargo(p)} ô hàng)! Hãy bán bớt hoặc sử dụng tài nguyên.`);
            return;
        }
        this.recordGameplayAction();

        const quizPool = window.GAME_DATA.resourceQuizzes[tile.resourceType] || window.GAME_DATA.resourceQuizzes.food;
        const rawQuiz = quizPool[Math.floor(Math.random() * quizPool.length)];
        const quiz = this.prepareShuffledQuiz(rawQuiz);

        const isNightOrSunsetBonus = (this.currentWeatherPhase === "sunset" || this.currentWeatherPhase === "night");
        const resLabels = {
            food: { name: "Lương Thực (Lúa Gạo / Thủy Sản)", icon: "🌾", cd: isNightOrSunsetBonus ? 1 : 2 },
            wood: { name: "Gỗ Lâm Nghiệp Đóng Tàu", icon: "🌲", cd: isNightOrSunsetBonus ? 2 : 3 },
            iron: { name: "Quặng Sắt & Đinh Đóng Tàu", icon: "⛏️", cd: isNightOrSunsetBonus ? 3 : 4 }
        };
        const rMeta = resLabels[tile.resourceType];

        // Broadcast Live Quiz to all other players in the room so they can watch!
        this.liveQuizState = {
            id: "qz_res_" + Date.now(),
            phase: "asking",
            actorId: p.id,
            actorName: p.name,
            badgeColor: tile.region.color,
            badgeTitle: `${rMeta.icon} KHAI THÁC TÀI NGUYÊN & ĐỐ VUI ĐỊA LÝ (${tile.region.name})`,
            title: `${p.name} Đang Khai Thác ${rMeta.name}`,
            desc: `Câu hỏi Địa lý vùng ${tile.region.name}. Chỉ ${p.name} (người đang trong lượt) mới có thể bấm chọn đáp án!`,
            quiz,
            chosenIdx: null,
            outcomeTitle: null
        };
        this.syncMultiplayerGameState();

        const yagiWarnHtml = this.currentWeatherPhase === "super_typhoon_yagi"
            ? `<div style="color:#fca5a5; font-weight:700; margin-top:4px">⚡ Cảnh báo Siêu Bão Yagi: Nếu trả lời SAI câu hỏi khai thác, thuyền sẽ bị Sét Đánh (-1 ❤️ HP)!</div>`
            : "";

        const modalHtml = `
            <div class="modal-header-badge" style="background:${tile.region.color}33; border-color:${tile.region.color}">
                <span>${rMeta.icon} KHAI THÁC TÀI NGUYÊN &amp; ĐỐ VUI ĐỊA LÝ (${tile.region.name})</span>
                <span id="active-quiz-countdown" class="quiz-countdown-pill">⏱️ 01:00</span>
            </div>
            <h2 class="modal-title">Khai Thác ${rMeta.name}</h2>
            <p class="modal-desc">
                📦 <strong>Luật Khai Thác:</strong> Trả lời trong <strong>60 giây</strong>:<br/>
                • Trả lời <strong>ĐÚNG</strong>: Nhận <strong>+2 ${rMeta.icon} ${rMeta.name}</strong>!<br/>
                • Trả lời <strong>SAI / HẾT GIỜ</strong>: Nhận <strong>+1 ${rMeta.icon} ${rMeta.name}</strong>.${yagiWarnHtml}
            </p>
            <div class="quiz-box">
                <div class="quiz-question">❓ ${quiz.q}</div>
                <div class="quiz-options">
                    ${quiz.options.map((opt, idx) => `
                        <button class="quiz-opt-btn" onclick="window.GAME.resolveResourceQuiz(${idx}, false)">
                            <span class="opt-letter">${String.fromCharCode(65 + idx)}</span>
                            <span>${opt}</span>
                        </button>
                    `).join("")}
                </div>
            </div>
        `;
        this.pendingResourceContext = { tile, quiz, rMeta };
        this.startPendingQuiz({
            type: "resource",
            html: modalHtml,
            durationSec: 60,
            onTimeout: () => this.resolveResourceQuiz(-1, true)
        });
    }

    resolveResourceQuiz(chosenIdx, isTimeout = false) {
        const ctx = this.pendingResourceContext;
        if (!ctx) return;
        this.pendingResourceContext = null;
        this.clearPendingQuiz();
        const { tile, quiz, rMeta } = ctx;
        const p = this.getActivePlayer();

        this.spendInteractiveAP(p);

        const isCorrect = !isTimeout && (chosenIdx === quiz.correct);
        p.quizTotal = (p.quizTotal || 0) + 1;
        if (isCorrect) p.quizCorrect = (p.quizCorrect || 0) + 1;
        this.recordQuizStreak(p, isCorrect);
        const freeSpace = Math.max(0, this.getMaxCargo(p) - this.getCargoCount(p));
        const resGain = Math.max(1, Math.min(freeSpace, isCorrect ? 2 : 1));
        p[tile.resourceType] += resGain;
        this.recordSecretQuestProgress(p, "mine_types", tile.resourceType);
        if (isCorrect) this.recordSecretQuestProgress(p, "quiz_correct");

        tile.resourceCooldown = rMeta.cd;
        this.world.updateResourceVisuals();

        window.SFX.playMine();
        this.world.triggerBurstAnimation(tile.q, tile.r, isCorrect ? 0x34d399 : 0x5c9ead, 20);

        let yagiPenaltyNote = "";
        if (!isCorrect && this.currentWeatherPhase === "super_typhoon_yagi") {
            this.world.triggerLightningStrikeEffect(tile.q, tile.r);
            this.applyPlayerDamage(p, 1, "Sét đánh khi trả lời sai khai thác trong Siêu Bão Yagi");
            yagiPenaltyNote = " • ⚡ Bị Sét Đánh -1 ❤️ HP do trả lời sai trong Siêu Bão Yagi!";
        }

        this.logEvent(`${rMeta.icon} ${p.name} khai thác +${resGain} ${rMeta.name} (Hồi sau ${rMeta.cd} vòng)${yagiPenaltyNote}.`);

        // Broadcast answered state + Visual Memory Card to all spectators!
        if (this.liveQuizState) {
            this.liveQuizState.phase = "answered";
            this.liveQuizState.chosenIdx = chosenIdx;
            this.liveQuizState.outcomeTitle = isCorrect
                ? `${p.name} Trả Lời Chính Xác! (+${resGain} ${rMeta.icon} ${rMeta.name})`
                : `${p.name} Hoàn Thành Khai Thác (+${resGain} ${rMeta.icon}${yagiPenaltyNote})`;
        }

        const resultHtml = `
            <div class="modal-header-badge" style="background:${isCorrect ? '#2e6f4033' : '#9e5a2b33'}; border-color:${isCorrect ? '#4b9b68' : '#c58b43'}">
                <span>${isCorrect ? `✅ TRẢ LỜI CHÍNH XÁC! (+${resGain} ${rMeta.icon})` : `💡 CỦNG CỐ KIẾN THỨC ĐỊA LÝ (+${resGain} ${rMeta.icon})`}</span>
                <span class="badge-tag">+${resGain} ${rMeta.icon} ${rMeta.name} • ⏱️ Tự đóng <span id="quiz-autoclose-sec">10</span>s</span>
            </div>
            <h2 class="modal-title">${isCorrect ? `Xuất Sắc! Bạn Nhận +${resGain} ${rMeta.icon} ${rMeta.name}` : `Hoàn Thành Khai Thác (+${resGain} ${rMeta.icon})${yagiPenaltyNote}`}</h2>
            ${this.renderQuizVisualMemoryCard(quiz, chosenIdx)}
            <p class="modal-desc" style="margin-top:10px; margin-bottom:4px">
                ⏳ <strong>Tái tạo sinh thái:</strong> Ô tài nguyên này sẽ tự động phục hồi 100% trữ lượng sau <strong>${rMeta.cd} vòng</strong>.
            </p>
            <div class="modal-actions" style="justify-content:space-between">
                <span style="font-size:12px; color:#fbbf24; font-weight:700">⏳ Tự động đóng sau <span id="quiz-autoclose-sec-sub">10</span> giây...</span>
                <button class="btn-primary-gold" onclick="window.GAME.closeQuizResultNow()">✕ Đóng Ngay Lập Tức</button>
            </div>
        `;
        this.showModal(resultHtml);
        this.startQuizResultAutoCloseTimer(10);
        this.updateUI();
        this.syncMultiplayerGameState();
    }

    // ------------------------------------------------------------------------
    // IV & V. 8M30S PORT MARKET RESET, 6 PORTS INSPECTOR & P2P MARKETPLACE
    // - Every 8m30s (510s), each of the 6 Ports refreshes:
    //   + Sells ONLY 1 random Key tier (Key 1, Key 2, or Key 3)
    //   + Sells Specialty (1 Xu -> Sell 1 region away = 2 Xu [+1 Xu], 2+ regions = 3 Xu [+2 Xu])
    //   + Standard resource exchange: 1 Xu = 2 Lúa | 1 Xu = 3 Gỗ | 1 Xu = 1 Sắt
    //   + Randomized port resource batch deals
    //   + 🛡️ Bảo Hiểm Hàng Hải Quốc Tế (10 Xu: Passive revival to 2 HP when HP hits 0)
    // ------------------------------------------------------------------------
    resetAllPortInventories(notify = true) {
        this.portResetRemainingSec = this.portResetIntervalSec;
        const portNames = [
            "Thương Cảng Cái Lân (Quảng Ninh)",
            "Thương Cảng Hải Phòng",
            "Thương Cảng Tiên Sa (Đà Nẵng)",
            "Thương Cảng Liên Vùng Tây Nguyên – Quy Nhơn",
            "Thương Cảng Quốc Tế Cái Mép – Sài Gòn",
            "Thương Cảng Cần Thơ – Cửu Long"
        ];
        // KEY-2: Thuật toán phân bổ Key khan hiếm (có nơi bán, nơi trống) mỗi 08:30
        const earlyLocked = this.isEarlyGameMonumentLockActive();
        const portIndices = [0, 1, 2, 3, 4, 5];
        for (let i = portIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [portIndices[i], portIndices[j]] = [portIndices[j], portIndices[i]];
        }
        const keyDistribution = [null, null, null, null, null, null];

        if (earlyLocked) {
            // Trước phút 08:30 (PvP — chỉ mở Di tích Cấp 1):
            // Còn Di tích Cấp 1 -> đúng 3 cảng bán Key 1, 3 cảng trống (null). Hết Cấp 1 -> cả 6 cảng trống.
            if (!this.isTierExhausted(1)) {
                for (let k = 0; k < 3; k++) {
                    keyDistribution[portIndices[k]] = 1;
                }
            }
        } else {
            // Từ phút 08:30 trở đi (và Sandbox): phân bổ theo danh sách cấp Di tích còn khả dụng
            const activeTiers = this.getActiveMonumentTiers();
            if (activeTiers.length === 3) {
                // Còn 3 cấp (1, 2, 3): chọn 3 hoặc 4 cảng bán Key (mỗi cấp ít nhất 1 cảng); 2-3 cảng trống
                const assigned = [...activeTiers];
                if (Math.random() < 0.5) {
                    assigned.push(activeTiers[Math.floor(Math.random() * activeTiers.length)]);
                }
                for (let k = 0; k < assigned.length; k++) {
                    keyDistribution[portIndices[k]] = assigned[k];
                }
            } else if (activeTiers.length === 2) {
                // Còn 2 cấp: chọn 3 cảng bán Key (mỗi cấp ít nhất 1 cảng); 3 cảng trống
                const assigned = [
                    activeTiers[0],
                    activeTiers[1],
                    activeTiers[Math.floor(Math.random() * 2)]
                ];
                for (let k = 0; k < assigned.length; k++) {
                    keyDistribution[portIndices[k]] = assigned[k];
                }
            } else if (activeTiers.length === 1) {
                // Còn 1 cấp: chọn 2 cảng bán Key cấp đó; 4 cảng trống
                keyDistribution[portIndices[0]] = activeTiers[0];
                keyDistribution[portIndices[1]] = activeTiers[0];
            }
            // Còn 0 cấp (hết 9/9 Di tích): cả 6 cảng để null
        }

        const keyPrices = { 1: 2, 2: 4, 3: 6 };

        this.portInventories = {};
        for (let regId = 0; regId < 6; regId++) {
            const keyTier = keyDistribution[regId];
            const randFoodQty = 2 + Math.floor(Math.random() * 2); // 2 or 3
            const randWoodQty = 3 + Math.floor(Math.random() * 2); // 3 or 4
            const randIronQty = 1 + Math.floor(Math.random() * 2); // 1 or 2
            this.portInventories[regId] = {
                regionId: regId,
                portName: portNames[regId],
                availableKeyTier: keyTier,
                keyPrice: keyTier !== null ? keyPrices[keyTier] : 0,
                keyStock: keyTier !== null ? 1 : 0,
                specialtyStock: 3,
                randomBatches: [
                    { resType: "food", icon: "🌾", name: "Lô Lúa Tiếp Tế", qty: randFoodQty, cost: 1 },
                    { resType: "wood", icon: "🌲", name: "Lô Gỗ Đóng Tàu", qty: randWoodQty, cost: 1 },
                    { resType: "iron", icon: "⛏️", name: "Lô Quặng Sắt", qty: randIronQty, cost: randIronQty }
                ]
            };
        }

        if (notify && this.isGameStarted) {
            const shortNames = ["Cái Lân", "Hải Phòng", "Tiên Sa", "Quy Nhơn", "Cái Mép", "Cần Thơ"];
            const stockedEntries = [];
            for (let rId = 0; rId < 6; rId++) {
                const kt = this.portInventories[rId].availableKeyTier;
                if (kt !== null && kt !== undefined) {
                    stockedEntries.push(`${shortNames[rId]} (Key ${kt})`);
                }
            }
            let intelText = "";
            if (stockedEntries.length > 0) {
                intelText = `📡 Tin cảng: Đợt này ${stockedEntries.join(", ")} có nhập Chìa Khóa; các cảng còn lại tạm trống!`;
            } else {
                intelText = earlyLocked
                    ? "📡 Tin cảng: Toàn bộ Di tích Cấp 1 đã được chinh phục — cả 6 Thương Cảng tạm trống Chìa Khóa!"
                    : "📡 Tin cảng: Toàn bộ 9 Di tích đã được chinh phục — cả 6 Thương Cảng ngừng nhập Chìa Khóa!";
            }
            this.logEvent(`🔄 [Chu kỳ 08:30] ${intelText}`);
            this.addTradeBulletinNotice(intelText);
            this.showToast(intelText);
            this.updateUI();
        }
    }

    resetAllPortResourceStocks(notify = true) {
        this.portResResetRemainingSec = this.portResResetIntervalSec || 300;
        // Mục 3B-2: Mỗi cảng chọn ngẫu nhiên 2/3 loại tài nguyên (ưu tiên thế mạnh miền đó),
        // số lượng ngẫu nhiên 1..3 đơn vị; loại không mở bán để stock = 0. Giá mua cố định 2 Xu/đơn vị.
        const regionalStrength = {
            0: "iron", 1: "iron",  // Miền Bắc: Sắt
            2: "wood", 3: "wood",  // Miền Trung & Tây Nguyên: Gỗ
            4: "food", 5: "food"   // Miền Nam: Lúa
        };
        const allTypes = ["food", "wood", "iron"];
        this.portResourceStock = {};
        for (let regId = 0; regId < 6; regId++) {
            const primary = regionalStrength[regId] || "food";
            const others = allTypes.filter(t => t !== primary);
            const secondary = others[Math.floor(Math.random() * others.length)];
            const stock = { food: 0, wood: 0, iron: 0, offeredTypes: [primary, secondary] };
            stock[primary] = 1 + Math.floor(Math.random() * 3);   // 1..3
            stock[secondary] = 1 + Math.floor(Math.random() * 3); // 1..3
            this.portResourceStock[regId] = stock;
        }

        if (notify && this.isGameStarted) {
            const msg = "📦 6 Thương Cảng vừa nhập lô tài nguyên mới — số lượng có hạn!";
            this.logEvent(`📦 [Chu kỳ 05:00] ${msg}`);
            this.addTradeBulletinNotice(msg);
            this.showToast(msg);
            this.updateUI();
        }
    }

    getPortResourceStock(regionId) {
        const rId = regionId || 0;
        if (!this.portResourceStock || !this.portResourceStock[rId]) {
            this.resetAllPortResourceStocks(false);
        }
        return this.portResourceStock[rId] || { food: 0, wood: 0, iron: 0, offeredTypes: [] };
    }

    canInspectPortDetails(player, regionId) {
        if (!player) return false;
        // (b) Cảng thuộc Thương quyền của chính mình
        if (player.charterRegionId !== undefined && player.charterRegionId !== null && player.charterRegionId === regionId) {
            return true;
        }
        // (a) Cảng mình đang đậu
        const curTile = this.getCurrentTile(player);
        if (curTile && curTile.isPort && curTile.regionId === regionId) {
            return true;
        }
        return false;
    }

    getPortInventory(regionId) {
        const earlyLocked = this.isEarlyGameMonumentLockActive();
        const rId = regionId || 0;
        if (!this.portInventories || !this.portInventories[rId]) {
            this.resetAllPortInventories(false);
        }
        const inv = this.portInventories[rId];
        if (!inv) {
            return {
                regionId: rId,
                portName: (window.GAME_DATA.regions[rId] && window.GAME_DATA.regions[rId].portName) || `Thương Cảng ${rId + 1}`,
                availableKeyTier: null,
                keyPrice: 0,
                keyStock: 0,
                specialtyStock: 3
            };
        }
        if (earlyLocked && inv.availableKeyTier !== null && inv.availableKeyTier !== undefined && inv.availableKeyTier > 1) {
            return { ...inv, availableKeyTier: 1, keyPrice: 2 };
        }
        return inv;
    }

    openTradePortModal(tile) {
        const p = this.getActivePlayer();
        if (!this.isMyTurn()) return;
        if (!this.canSpendInteractiveAP(p) && !this.portApDeducted) {
            this.showToast("Cần 1 AP Tương Tác để giao dịch tại Thương Cảng!");
            return;
        }

        const region = tile.region;
        this.recordGameplayAction();
        this.clearZeroApAutoPassCountdown();
        const charterOwner = this.getPortCharterOwner(region.id);
        const mustPayTax = Boolean(charterOwner && charterOwner.id !== p.id);

        // Mục 3B-1: Luật Thuế Cập Bến Bắt Buộc (chỉ thu 1 lần trong lượt; 0 Xu -> CHẶN KHÔNG CHO VÀO CẢNG)
        if (mustPayTax && !this.portTaxPaidThisTurn) {
            if ((p.coins || 0) < 1) {
                this.showToast(`⛔ Cần tối thiểu 1 💰 Xu đóng thuế cập bến để vào cảng của ${charterOwner.name}! Hãy ghé cảng của bạn, Vùng Tự Do Đông Nam Bộ hoặc giao dịch trên Chợ P2P.`);
                return;
            }
            p.coins -= 1;
            charterOwner.coins = Math.min(30, (charterOwner.coins || 0) + 1);
            this.portTaxPaidThisTurn = true;
            window.SFX.playCoin();
            this.logEvent(`💰 [Thuế Cập Bến] ${p.name} đóng 1 Xu thuế cập bến tại ${tile.portName} cho Chủ thương quyền ${charterOwner.name}!`);
            this.addTradeBulletinNotice(`💰 ${p.name} đóng 1 Xu thuế cảng cho ${charterOwner.name} (${this.getRegionShortName(region.id)})`);
            this.showToast(`💰 Đã đóng 1 Xu thuế cập bến cho Chủ thương quyền ${charterOwner.name}!`);
            this.updateUI();
            this.syncMultiplayerGameState();
        }

        const charterBadgeHtml = charterOwner
            ? (charterOwner.id === p.id
                ? `<span class="port-tax-pill free">👑 Cảng Nhà (${charterOwner.name}) • Miễn thuế 0 Xu</span>`
                : `<span class="port-tax-pill paid">📜 Chủ quyền: ${charterOwner.name} • Thuế cập bến: 1 Xu — Đã đóng</span>`)
            : `<span class="port-tax-pill free">🌐 Vùng Tự Do • Miễn thuế 0 Xu</span>`;

        if (!this.matchStats) this.matchStats = { portTrades: {}, portVisits: {}, totalP2P: 0, disasterDamage: 0, stormReefDamage: 0 };
        if (!this.matchStats.portVisits) this.matchStats.portVisits = {};
        if (!this.portApDeducted) {
            this.matchStats.portVisits[region.id] = (this.matchStats.portVisits[region.id] || 0) + 1;
        }
        const spec = region.specialty;
        const portInv = this.getPortInventory(region.id);

        // Chỉ hiển thị các Đặc sản vùng khác đang có trên tàu kèm nút Bán + số Xu thu về
        const sellableSpecs = (p.specialties || [])
            .map((item, idx) => ({ item, idx, dist: Math.abs(region.id - item.regionId) }))
            .filter(entry => entry.dist >= 1);

        const sellableSpecsHtml = sellableSpecs.map(({ item, idx, dist }) => {
            const payout = dist === 1 ? 3 : (dist === 2 ? 5 : 7);
            const profit = payout - 2;
            const originReg = window.GAME_DATA.regions[item.regionId];
            return `
                <div class="port-spec-sell-row">
                    <div class="port-spec-sell-info">
                        <strong>${item.icon} ${item.name}</strong>
                        <small>Từ ${originReg ? originReg.name : 'vùng khác'} (cách ${dist} vùng • lãi +${profit} Xu)</small>
                    </div>
                    <button class="btn-trade-action gold" onclick="window.GAME.sellSpecialtyAtPort(${idx}, ${payout})">
                        💰 Bán (+${payout} Xu)
                    </button>
                </div>
            `;
        }).join("");

        const earlyLock = this.isEarlyGameMonumentLockActive();
        const rawKeyTier = portInv ? portInv.availableKeyTier : null;
        const kTier = (rawKeyTier === null || rawKeyTier === undefined) ? null : (earlyLock ? 1 : rawKeyTier);
        const kCost = (kTier === null) ? 0 : (earlyLock ? 2 : portInv.keyPrice);
        const allMonumentsExhausted = this.getActiveMonumentTiers().length === 0;
        const isKeyExhausted = (kTier !== null) && this.isTierExhausted(kTier);
        const hasMaxThisKey = (kTier !== null) && ((p.keys[kTier] || 0) >= 1);
        const keyBtnDisabled = allMonumentsExhausted || (kTier === null) || isKeyExhausted || hasMaxThisKey;
        const keyResetStr = this.formatMMSS(this.portResetRemainingSec || 0);

        let keyTitleHtml = "";
        let keySubHtml = "";
        let keyBtnLabel = "";
        if (allMonumentsExhausted) {
            keyTitleHtml = `🏛️ Toàn bộ Di tích đã được chinh phục`;
            keySubHtml = `<span style="color:#cbd5e1">Cả 6 Thương Cảng đã ngừng cung ứng Chìa Khóa</span>`;
            keyBtnLabel = `🏛️ Đã chinh phục 9/9 Di tích`;
        } else if (kTier === null) {
            keyTitleHtml = `📭 Đợt này cảng không nhập Chìa Khóa`;
            keySubHtml = `<span style="color:#cbd5e1">Làm mới sau <strong>${keyResetStr}</strong></span>`;
            keyBtnLabel = `📭 Tạm trống Key`;
        } else if (isKeyExhausted) {
            keyTitleHtml = `🗝️ Key ${kTier}`;
            keySubHtml = `<strong style="color:#fca5a5">🔒 Ngừng bán (Đã hết Di tích Cấp ${kTier})</strong>`;
            keyBtnLabel = `🔒 Ngừng bán (Đã hết Di tích Cấp ${kTier})`;
        } else if (hasMaxThisKey) {
            keyTitleHtml = `🗝️ Key ${kTier} ${earlyLock ? '<small>(00:00–08:30)</small>' : ''}`;
            keySubHtml = `<strong style="color:#6ee7b7">✅ Đã sở hữu 1/1</strong>`;
            keyBtnLabel = `✅ Đã sở hữu 1/1`;
        } else {
            keyTitleHtml = `🗝️ Key ${kTier} ${earlyLock ? '<small>(00:00–08:30)</small>' : ''}`;
            keySubHtml = `Giá bán: <strong>${kCost} 💰 Xu</strong> • Chưa sở hữu (0/1)`;
            keyBtnLabel = `Mua Key ${kTier} (${kCost} 💰 Xu)`;
        }
        const resStock = this.getPortResourceStock(region.id);
        const resResetStr = this.formatMMSS(this.portResResetRemainingSec || 0);
        const canFloorExport = (!charterOwner || charterOwner.id === p.id);

        // Chỉ hiển thị các loại tài nguyên đang mở bán của cảng này (2 loại/đợt) dạng thẻ ngang gọn
        const allResMeta = {
            food: { type: "food", icon: "🌾", name: "Lúa Gạo" },
            wood: { type: "wood", icon: "🌲", name: "Gỗ Đóng Tàu" },
            iron: { type: "iron", icon: "⛏️", name: "Quặng Sắt" }
        };
        const activeOfferedTypes = (Array.isArray(resStock.offeredTypes) && resStock.offeredTypes.length > 0)
            ? resStock.offeredTypes
            : ["food", "wood", "iron"].filter(t => (resStock[t] || 0) > 0);

        const resRowsHtml = activeOfferedTypes.map(type => {
            const item = allResMeta[type];
            if (!item) return "";
            const qty = resStock[type] || 0;
            const inStock = qty > 0;
            return `
                <div class="port-res-row ${inStock ? '' : 'out-of-stock'}">
                    <div class="port-res-name">${item.icon} <strong>${item.name}</strong></div>
                    <div class="port-res-qty">${inStock ? `Còn: <strong>${qty}/3</strong>` : `<span class="port-oos-text">Hết hàng • ${resResetStr}</span>`}</div>
                    <button class="btn-trade-action ${inStock ? 'gold' : ''}" ${!inStock ? 'disabled' : ''} onclick="window.GAME.buyLimitedResourceAtPort('${type}')">
                        ${inStock ? `Mua 2 💰 Xu` : `Hết hàng`}
                    </button>
                </div>
            `;
        }).join("");

        // Phần Xuất Khẩu Thô (CHỈ hiện ở cảng nhà & Vùng Tự Do Đông Nam Bộ)
        const floorExportSectionHtml = canFloorExport ? `
            <div class="port-floor-export-bar">
                <div class="port-floor-export-head">
                    <strong>📤 Xuất Khẩu Thô</strong>
                    <span>Giá sàn xoay vốn (1 💰 Xu / 1 món)</span>
                </div>
                <div class="port-floor-export-btns">
                    <button class="btn-trade-action" ${(p.food || 0) < 1 ? 'disabled' : ''} onclick="window.GAME.exportRawResourceAtPort('food')">
                        🌾 Bán 1 Lúa (+1 Xu) • Có ${p.food || 0}
                    </button>
                    <button class="btn-trade-action" ${(p.wood || 0) < 1 ? 'disabled' : ''} onclick="window.GAME.exportRawResourceAtPort('wood')">
                        🌲 Bán 1 Gỗ (+1 Xu) • Có ${p.wood || 0}
                    </button>
                    <button class="btn-trade-action" ${(p.iron || 0) < 1 ? 'disabled' : ''} onclick="window.GAME.exportRawResourceAtPort('iron')">
                        ⛏️ Bán 1 Sắt (+1 Xu) • Có ${p.iron || 0}
                    </button>
                </div>
            </div>
        ` : "";

        // Khối 3 — Nộp Nhiệm Vụ Chung (CHỈ hiển thị khi có đơn Nhiệm Vụ Chung khớp cảng đang đậu)
        const matchingQuests = (this.activePublicQuests || []).filter(q => q.portRegionId === region.id);
        const questBlockHtml = matchingQuests.length > 0 ? `
            <div class="port-v3-block port-quest-block">
                <div class="port-v3-block-head">
                    <h3>📋 Nộp Nhiệm Vụ Chung Tại Cảng Này</h3>
                    <span class="port-v3-subtag">${matchingQuests.length} đơn đang mở</span>
                </div>
                <div class="port-quest-list">
                    ${matchingQuests.map(q => {
                        const ready = this.canSubmitPublicQuest(p, q);
                        return `
                            <div class="port-quest-row ${ready ? 'ready' : ''}">
                                <div class="port-quest-info">
                                    <strong>${q.title}</strong>
                                    <div class="port-quest-req">Yêu cầu: <strong>${q.reqText}</strong> &nbsp;•&nbsp; Thưởng: <strong style="color:#fde047">+${q.rewardPoints} ⭐</strong>${q.rewardCoins ? ` + <strong style="color:#a7f3d0">${q.rewardCoins} 💰 Xu</strong>` : ''}</div>
                                </div>
                                <button class="btn-trade-action ${ready ? 'gold' : ''}" ${!ready ? 'disabled' : ''} onclick="if (window.GAME.submitPublicQuest('${q.instanceId}') && window.GAME.currentPortTile && !window.GAME.matchWinner) window.GAME.openTradePortModal(window.GAME.currentPortTile)">
                                    ${ready ? '✅ Nộp Ngay' : '⏳ Chưa đủ hàng'}
                                </button>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        ` : "";

        const html = `
            <div class="modal-header-badge port-v3-top-badge" style="background:${region.color}2b; border-color:${region.color}">
                <div class="port-v3-title-group">
                    <span class="port-v3-name">⚓ ${tile.portName.toUpperCase()}</span>
                    <span class="port-v3-region">${region.name}</span>
                </div>
                <div class="port-v3-header-meta">
                    ${charterBadgeHtml}
                </div>
            </div>

            <div class="port-wallet-bar port-v3-wallet">
                <div class="wallet-coin-pill">💰 <strong>${p.coins}/30 Xu</strong></div>
                <div class="wallet-cargo-pill">
                    📦 <strong>${this.getCargoCount(p)}/${this.getMaxCargo(p)} ô</strong>
                    &nbsp;•&nbsp; 🌾 <strong>${p.food}</strong>
                    &nbsp;•&nbsp; 🌲 <strong>${p.wood}</strong>
                    &nbsp;•&nbsp; ⛏️ <strong>${p.iron}</strong>
                    &nbsp;•&nbsp; 🗝️ <strong>${p.keys[1] || 0}/${p.keys[2] || 0}/${p.keys[3] || 0}</strong> (0 ô)
                    ${p.hasSerpentCoin ? '&nbsp;•&nbsp; <strong style="color:#7dd3fc">🛡️ Bảo Hiểm</strong>' : ''}
                </div>
            </div>

            <div class="port-v3-sections">
                <!-- KHỐI 1: GIAO THƯƠNG & TÀI NGUYÊN -->
                <div class="port-v3-block">
                    <div class="port-v3-block-head">
                        <h3>📦 1. Giao Thương &amp; Tài Nguyên</h3>
                        <span class="port-v3-subtag">📦 Nhập mới sau ${resResetStr}</span>
                    </div>

                    <div class="port-spec-split ${sellableSpecs.length > 0 ? 'has-sell' : ''}">
                        <div class="port-spec-buy-card">
                            <div class="port-spec-buy-title">${spec.icon} <strong>${spec.name}</strong></div>
                            <div class="port-spec-buy-desc">Bán cách 1v: <strong>3 Xu</strong> • 2v: <strong>5 Xu</strong> • ≥3v: <strong>7 Xu</strong></div>
                            <button class="btn-trade-action gold" onclick="window.GAME.buySpecialtyAtPort(${region.id})">
                                🛒 Mua Đặc Sản (2 💰 Xu)
                            </button>
                        </div>
                        ${sellableSpecs.length > 0 ? `
                            <div class="port-spec-sell-col">
                                <div class="port-spec-sell-label">💰 Đặc sản trên tàu có thể bán ngay (${sellableSpecs.length}):</div>
                                ${sellableSpecsHtml}
                            </div>
                        ` : ''}
                    </div>

                    <div class="port-res-list">
                        ${resRowsHtml}
                    </div>

                    ${floorExportSectionHtml}
                </div>

                <!-- KHỐI 2: CHÌA KHÓA & BẢO HIỂM -->
                <div class="port-v3-block">
                    <div class="port-v3-block-head">
                        <h3>🗝️ 2. Chìa Khóa &amp; Bảo Hiểm (0 Ô Kho)</h3>
                        <span class="port-v3-subtag">🔄 Đổi Key sau ${this.formatMMSS(this.portResetRemainingSec)}</span>
                    </div>
                    <div class="port-key-ins-grid">
                        <div class="port-ki-card key-card">
                            <div class="port-ki-title">${keyTitleHtml}</div>
                            <div class="port-ki-sub">${keySubHtml}</div>
                            <button class="btn-trade-action gold" ${keyBtnDisabled ? 'disabled' : ''} onclick="window.GAME.buyKeyAtPort(${kTier === null ? 'null' : kTier}, ${kCost})">
                                ${keyBtnLabel}
                            </button>
                        </div>
                        <div class="port-ki-card ins-card">
                            <div class="port-ki-title">🛡️ Bảo Hiểm Hàng Hải Quốc Tế</div>
                            <div class="port-ki-sub">Tự cứu đắm &amp; hồi <strong>2 ❤️ HP</strong> khi máu về 0</div>
                            <button class="btn-trade-action gold" ${p.hasSerpentCoin ? 'disabled' : ''} onclick="window.GAME.buySerpentCoinAtPort()">
                                ${p.hasSerpentCoin ? '✅ Đã Sở Hữu' : '🛡️ Mua Bảo Hiểm (10 💰 Xu)'}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- KHỐI 3: NỘP NHIỆM VỤ CHUNG (CHỈ HIỆN KHI KHỚP CẢNG ĐANG ĐẬU) -->
                ${questBlockHtml}
            </div>

            <div class="modal-actions" style="justify-content:flex-end">
                <button class="btn-primary-gold" onclick="window.GAME.finishPortVisit()">⛵ Rời Thương Cảng</button>
            </div>
        `;

        this.currentPortTile = tile;
        this.showModal(html);
    }

    openMaritimeMarketModal(tabOverride = null, filterOverride = null, postTypeOverride = null) {
        if (tabOverride === "floor" || tabOverride === "buy_orders" || tabOverride === "post") {
            this.activeMarketTab = tabOverride;
        }
        if (filterOverride !== null) {
            this.activeMarketFilter = filterOverride;
        }
        if (postTypeOverride !== null) {
            this.activePostFormType = postTypeOverride;
        }
        const activeTab = this.activeMarketTab || "floor";
        const activeFilter = this.activeMarketFilter || "all";
        const activePostType = this.activePostFormType || "sell";

        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return;

        const sellList = this.marketListings || [];
        const buyList = this.buyOrders || [];
        const barterList = this.barterOrders || [];
        const floorTotal = sellList.length + barterList.length;

        // Helper: Build <option> list for all allowed P2P items (food, wood, iron, 6 regional specialties)
        const buildAllItemOptionsHtml = (selectedVal = "resource:food") => {
            const opts = [
                { val: "resource:food", label: "🌾 Lúa Gạo" },
                { val: "resource:wood", label: "🌲 Gỗ Đóng Tàu" },
                { val: "resource:iron", label: "⛏️ Quặng Sắt" },
                ...(window.GAME_DATA.regions || []).map(r => ({
                    val: `specialty:${r.id}`,
                    label: `${r.specialty.icon} Đặc sản: ${r.specialty.shortName} (${this.getRegionShortName(r.id)})`
                }))
            ];
            return opts.map(o => `<option value="${o.val}" ${o.val === selectedVal ? 'selected' : ''}>${o.label}</option>`).join("");
        };

        const buildOwnedItemOptionsHtml = () => {
            const opts = [];
            if ((p.food || 0) > 0) opts.push({ val: "resource:food", label: `🌾 Lúa Gạo (Có: ${p.food})` });
            if ((p.wood || 0) > 0) opts.push({ val: "resource:wood", label: `🌲 Gỗ Đóng Tàu (Có: ${p.wood})` });
            if ((p.iron || 0) > 0) opts.push({ val: "resource:iron", label: `⛏️ Quặng Sắt (Có: ${p.iron})` });
            const specCounts = new Map();
            (p.specialties || []).forEach(s => {
                specCounts.set(s.regionId, (specCounts.get(s.regionId) || 0) + 1);
            });
            specCounts.forEach((cnt, rId) => {
                const reg = window.GAME_DATA.regions[rId];
                if (reg && reg.specialty) {
                    opts.push({ val: `specialty:${rId}`, label: `${reg.specialty.icon} ${reg.specialty.shortName} (Có: ${cnt})` });
                }
            });
            if (opts.length === 0) {
                return `<option value="">— Khoang tàu chưa có hàng để đăng —</option>`;
            }
            return opts.map(o => `<option value="${o.val}">${o.label}</option>`).join("");
        };

        let tabBodyHtml = "";

        if (activeTab === "floor") {
            const filters = [
                { key: "all", label: "Tất cả" },
                { key: "food", label: "🌾 Lúa" },
                { key: "wood", label: "🌲 Gỗ" },
                { key: "iron", label: "⛏️ Sắt" },
                { key: "specialty", label: "📦 Đặc sản" },
                { key: "barter", label: "🔄 Đổi ngang" }
            ];
            const filterBarHtml = `
                <div class="mkt-v3-filters">
                    ${filters.map(f => `
                        <button class="mkt-filter-pill ${activeFilter === f.key ? 'active' : ''}" onclick="window.GAME.openMaritimeMarketModal('floor', '${f.key}')">
                            ${f.label}
                        </button>
                    `).join("")}
                </div>
            `;

            const matchFilterForSell = (l) => {
                if (activeFilter === "all") return true;
                if (activeFilter === "barter") return false;
                if (activeFilter === "specialty") return l.itemType === "specialty";
                return l.itemType === "resource" && l.resType === activeFilter;
            };
            const matchFilterForBarter = (b) => {
                if (activeFilter === "all" || activeFilter === "barter") return true;
                const checkItem = (it) => activeFilter === "specialty"
                    ? it.itemType === "specialty"
                    : (it.itemType === "resource" && it.resType === activeFilter);
                return checkItem(b.offerItem) || checkItem(b.wantItem);
            };

            const sellRowsHtml = sellList.filter(matchFilterForSell).map(l => {
                const isOwn = (l.sellerId === p.id);
                const qty = l.qty || 1;
                const regNote = l.itemType === "specialty" && window.GAME_DATA.regions[l.regionId]
                    ? `<small>Vùng: ${this.getRegionShortName(l.regionId)}</small>`
                    : `<small>Tài nguyên thô</small>`;
                return `
                    <div class="mkt-v3-row-4col">
                        <div class="mkt-col-item">
                            <strong>${qty}× ${l.icon} ${l.name}</strong>
                            ${regNote}
                        </div>
                        <div class="mkt-col-poster anon">
                            🎭 Thương nhân ẩn danh
                        </div>
                        <div class="mkt-col-price coin">
                            ${l.price} 💰 Xu
                        </div>
                        <div class="mkt-col-action">
                            ${isOwn
                                ? `<span class="mkt-own-badge">Của bạn</span><button class="btn-trade-action mkt-btn-sm" onclick="window.GAME.cancelMarketListing(${l.id}, false)">Thu hồi</button>`
                                : `<button class="btn-trade-action gold mkt-btn-sm" onclick="window.GAME.buyMarketListing(${l.id}, false)">🛒 Mua Ngay</button>`
                            }
                        </div>
                    </div>
                `;
            }).join("");

            const barterRowsHtml = barterList.filter(matchFilterForBarter).map(b => {
                const isOwn = (b.creatorId === p.id);
                const off = b.offerItem;
                const wnt = b.wantItem;
                return `
                    <div class="mkt-v3-row-4col barter-row">
                        <div class="mkt-col-item">
                            <strong>${off.qty}× ${off.icon} ${off.name} <span class="mkt-swap-arrow">⇄</span> ${wnt.qty}× ${wnt.icon} ${wnt.name}</strong>
                            <small>Bạn nhận ${off.qty}${off.icon} • Bạn giao ${wnt.qty}${wnt.icon}</small>
                        </div>
                        <div class="mkt-col-poster public">
                            <span class="mkt-color-dot" style="background:${b.creatorColor || '#38bdf8'}"></span>
                            <div>
                                <strong>${b.creatorName}</strong>
                                <small>📜 ${b.creatorCharter || 'Vùng Tự Do'}</small>
                            </div>
                        </div>
                        <div class="mkt-col-price barter">
                            🔄 0 Xu
                        </div>
                        <div class="mkt-col-action">
                            ${isOwn
                                ? `<span class="mkt-own-badge">Của bạn</span><button class="btn-trade-action mkt-btn-sm" onclick="window.GAME.cancelBarterOrder(${b.id}, true)">Thu hồi</button>`
                                : `<button class="btn-trade-action gold mkt-btn-sm" onclick="window.GAME.fulfillBarterOrder(${b.id}, true)">🤝 Đổi Ngay</button>`
                            }
                        </div>
                    </div>
                `;
            }).join("");

            const combinedRows = barterRowsHtml + sellRowsHtml;
            tabBodyHtml = `
                ${filterBarHtml}
                <div class="mkt-v3-list">
                    ${combinedRows || `<div class="mkt-empty-state">Chưa có đơn hàng nào khớp bộ lọc này. Hãy sang tab <strong>➕ Đăng Tin</strong> để mở kèo!</div>`}
                </div>
            `;
        } else if (activeTab === "buy_orders") {
            const buyRowsHtml = buyList.map(o => {
                const isOwn = (o.buyerId === p.id);
                const qty = o.qty || 1;
                const regNote = o.itemType === "specialty" && window.GAME_DATA.regions[o.regionId]
                    ? `<small>Đặc sản ${this.getRegionShortName(o.regionId)}</small>`
                    : `<small>Tài nguyên thô</small>`;
                return `
                    <div class="mkt-v3-row-4col">
                        <div class="mkt-col-item">
                            <strong>Cần ${qty}× ${o.icon} ${o.name}</strong>
                            ${regNote}
                        </div>
                        <div class="mkt-col-poster anon">
                            🎭 Thương nhân ẩn danh
                        </div>
                        <div class="mkt-col-price coin">
                            Trả ${o.offerPrice} 💰 Xu
                        </div>
                        <div class="mkt-col-action">
                            ${isOwn
                                ? `<span class="mkt-own-badge">Của bạn</span><button class="btn-trade-action mkt-btn-sm" onclick="window.GAME.cancelBuyOrder(${o.id}, true)">Thu hồi</button>`
                                : `<button class="btn-trade-action gold mkt-btn-sm" onclick="window.GAME.fulfillBuyOrder(${o.id}, true)">🤝 Giao Hàng</button>`
                            }
                        </div>
                    </div>
                `;
            }).join("");

            tabBodyHtml = `
                <div class="mkt-v3-list">
                    ${buyRowsHtml || `<div class="mkt-empty-state">Hiện chưa có Đơn Cần Mua nào. Sang tab <strong>➕ Đăng Tin</strong> để đặt mua ẩn danh!</div>`}
                </div>
            `;
        } else {
            // TAB 3: ĐĂNG TIN GIAO DỊCH (3 chế độ: Bán ẩn danh / Cần mua ẩn danh / Đổi hàng Barter công khai)
            const postSwitchHtml = `
                <div class="mkt-post-switch">
                    <button class="mkt-post-type-btn ${activePostType === 'sell' ? 'active' : ''}" onclick="window.GAME.openMaritimeMarketModal('post', null, 'sell')">
                        💰 Đăng Bán lấy Xu <small>(Ẩn danh)</small>
                    </button>
                    <button class="mkt-post-type-btn ${activePostType === 'buy' ? 'active' : ''}" onclick="window.GAME.openMaritimeMarketModal('post', null, 'buy')">
                        📣 Đăng Đơn Cần Mua <small>(Ẩn danh)</small>
                    </button>
                    <button class="mkt-post-type-btn ${activePostType === 'barter' ? 'active' : ''}" onclick="window.GAME.openMaritimeMarketModal('post', null, 'barter')">
                        🔄 Đổi Hàng Barter 0 Xu <small>(Công khai)</small>
                    </button>
                </div>
            `;

            let formBodyHtml = "";
            if (activePostType === "sell") {
                formBodyHtml = `
                    <div class="mkt-post-form">
                        <div class="mkt-form-note anon">🎭 <strong>Ẩn danh hoàn toàn:</strong> Đối thủ chỉ thấy "Thương nhân ẩn danh". Hàng sẽ trừ khỏi kho ngay khi treo bán (hoàn lại nếu thu hồi).</div>
                        <div class="mkt-form-grid">
                            <label>Vật phẩm muốn bán:
                                <select id="mkt-sell-item">${buildOwnedItemOptionsHtml()}</select>
                            </label>
                            <label>Số lượng:
                                <input id="mkt-sell-qty" type="number" min="1" max="12" value="1" />
                            </label>
                            <label>Giá bán (1–15 💰 Xu):
                                <input id="mkt-sell-price" type="number" min="1" max="15" value="3" />
                            </label>
                        </div>
                        <button class="btn-trade-action gold mkt-submit-btn" onclick="window.GAME.submitMarketSellForm()">📢 Treo Bán Ẩn Danh (0 AP)</button>
                    </div>
                `;
            } else if (activePostType === "buy") {
                formBodyHtml = `
                    <div class="mkt-post-form">
                        <div class="mkt-form-note anon">🎭 <strong>Ẩn danh • Tạm giữ Xu:</strong> Hệ thống sẽ tạm giữ ngay <strong id="mkt-buy-escrow-preview">3 💰 Xu</strong> từ ngân khố khi đăng (hoàn 100% nếu bạn hủy đơn).</div>
                        <div class="mkt-form-grid">
                            <label>Vật phẩm cần mua:
                                <select id="mkt-buy-item">${buildAllItemOptionsHtml("resource:food")}</select>
                            </label>
                            <label>Số lượng:
                                <input id="mkt-buy-qty" type="number" min="1" max="8" value="1" />
                            </label>
                            <label>Số Xu trả (1–15 💰 Xu):
                                <input id="mkt-buy-price" type="number" min="1" max="15" value="3" oninput="const el=document.getElementById('mkt-buy-escrow-preview'); if(el) el.textContent=(Math.max(1,Math.min(15,parseInt(this.value,10)||1)))+' 💰 Xu';" />
                            </label>
                        </div>
                        <button class="btn-trade-action gold mkt-submit-btn" onclick="window.GAME.submitMarketBuyForm()">📣 Đăng Đơn Cần Mua Ẩn Danh (0 AP)</button>
                    </div>
                `;
            } else {
                formBodyHtml = `
                    <div class="mkt-post-form">
                        <div class="mkt-form-note public">👁️ <strong>Công khai hoàn toàn (0 💰 Xu):</strong> Hiển thị rõ Tên, màu tàu &amp; Thương quyền của bạn để dễ thương lượng đổi hàng trực tiếp!</div>
                        <div class="mkt-barter-grid">
                            <div class="mkt-barter-box">
                                <div class="mkt-barter-box-title">📤 Vật phẩm bạn ĐƯA RA:</div>
                                <select id="mkt-barter-offer-item">${buildOwnedItemOptionsHtml()}</select>
                                <label>Số lượng đưa ra: <input id="mkt-barter-offer-qty" type="number" min="1" max="12" value="1" /></label>
                            </div>
                            <div class="mkt-barter-arrow">⇄</div>
                            <div class="mkt-barter-box">
                                <div class="mkt-barter-box-title">📥 Vật phẩm bạn MUỐN NHẬN:</div>
                                <select id="mkt-barter-want-item">${buildAllItemOptionsHtml("resource:wood")}</select>
                                <label>Số lượng muốn nhận: <input id="mkt-barter-want-qty" type="number" min="1" max="12" value="1" /></label>
                            </div>
                        </div>
                        <button class="btn-trade-action gold mkt-submit-btn" onclick="window.GAME.submitMarketBarterForm()">🔄 Đăng Kèo Đổi Hàng 0 Xu (0 AP)</button>
                    </div>
                `;
            }

            tabBodyHtml = `${postSwitchHtml}${formBodyHtml}`;
        }

        const html = `
            <div class="modal-header-badge mkt-v3-header">
                <span>⚖️ CHỢ HÀNG HẢI P2P • 0 AP (MỌI LƯỢT)</span>
                <span class="badge-tag">Cấm giao dịch Key &amp; Bảo Hiểm</span>
            </div>

            <div class="mkt-v3-strip">
                <span class="mkt-strip-pill gold">💰 <strong>${p.coins}/30</strong></span>
                <span class="mkt-strip-pill sky">📦 <strong>${this.getCargoCount(p)}/${this.getMaxCargo(p)} ô</strong></span>
                <span class="mkt-strip-pill">🌾 Lúa: <strong>${p.food || 0}</strong></span>
                <span class="mkt-strip-pill">🌲 Gỗ: <strong>${p.wood || 0}</strong></span>
                <span class="mkt-strip-pill">⛏️ Sắt: <strong>${p.iron || 0}</strong></span>
                <span class="mkt-strip-pill">📦 Đặc sản: <strong>${(p.specialties || []).length}</strong></span>
            </div>

            <div class="mkt-v3-tabs">
                <button class="mkt-tab-btn ${activeTab === 'floor' ? 'active' : ''}" onclick="window.GAME.openMaritimeMarketModal('floor')">
                    🛒 Sàn Bán &amp; Đổi Hàng (${floorTotal})
                </button>
                <button class="mkt-tab-btn ${activeTab === 'buy_orders' ? 'active' : ''}" onclick="window.GAME.openMaritimeMarketModal('buy_orders')">
                    📣 Đơn Cần Mua (${buyList.length})
                </button>
                <button class="mkt-tab-btn ${activeTab === 'post' ? 'active' : ''}" onclick="window.GAME.openMaritimeMarketModal('post')">
                    ➕ Đăng Tin Giao Dịch
                </button>
            </div>

            <div class="mkt-v3-body">
                ${tabBodyHtml}
            </div>

            <div class="modal-actions" style="justify-content:flex-end">
                <button class="btn-primary-gold" onclick="window.GAME.closeModal(true)">✕ Đóng Chợ</button>
            </div>
        `;
        this.showModal(html);
    }

    submitMarketSellForm() {
        const val = (document.getElementById("mkt-sell-item") || {}).value || "";
        if (!val.includes(":")) {
            this.showToast("Khoang tàu chưa có hàng để đăng bán!");
            return;
        }
        const [itemType, key] = val.split(":");
        const qty = parseInt((document.getElementById("mkt-sell-qty") || {}).value, 10) || 1;
        const price = parseInt((document.getElementById("mkt-sell-price") || {}).value, 10) || 2;
        if (this.listMarketSellOrder(itemType, key, qty, price, false)) {
            this.openMaritimeMarketModal("floor", "all");
        }
    }

    submitMarketBuyForm() {
        const val = (document.getElementById("mkt-buy-item") || {}).value || "";
        if (!val.includes(":")) return;
        const [itemType, key] = val.split(":");
        const qty = parseInt((document.getElementById("mkt-buy-qty") || {}).value, 10) || 1;
        const price = parseInt((document.getElementById("mkt-buy-price") || {}).value, 10) || 2;
        if (this.createBuyOrder(itemType, key, qty, price, false)) {
            this.openMaritimeMarketModal("buy_orders");
        }
    }

    submitMarketBarterForm() {
        const offerVal = (document.getElementById("mkt-barter-offer-item") || {}).value || "";
        const wantVal = (document.getElementById("mkt-barter-want-item") || {}).value || "";
        if (!offerVal.includes(":") || !wantVal.includes(":")) {
            this.showToast("Vui lòng chọn đủ vật phẩm đưa ra và vật phẩm muốn nhận!");
            return;
        }
        const [offType, offKey] = offerVal.split(":");
        const [wntType, wntKey] = wantVal.split(":");
        const offQty = parseInt((document.getElementById("mkt-barter-offer-qty") || {}).value, 10) || 1;
        const wntQty = parseInt((document.getElementById("mkt-barter-want-qty") || {}).value, 10) || 1;
        if (this.createBarterOrder(offType, offKey, offQty, wntType, wntKey, wntQty, false)) {
            this.openMaritimeMarketModal("floor", "barter");
        }
    }

    listResourceWithCustomPrice(resType) {
        const priceEl = document.getElementById("custom-p2p-price");
        const price = Math.max(1, Math.min(15, parseInt(priceEl ? priceEl.value : "3", 10) || 3));
        this.listResourceOnPlayerMarket(resType, price, true, 1);
    }

    // ------------------------------------------------------------------------
    // MỤC 3C-1: P2P MARKET ENGINE (0 AP, ANY TURN)
    // - Allowed items ONLY: food, wood, iron, specialty (NO Keys / Insurance!)
    // - Coin trades (marketListings & buyOrders): 100% ANONYMOUS ("🎭 Thương nhân ẩn danh")
    // - Barter trades (barterOrders, 0 Xu): 100% PUBLIC (name, color, charter)
    // ------------------------------------------------------------------------
    isAllowedP2PItem(itemType, resType = null) {
        if (itemType === "resource") {
            return resType === "food" || resType === "wood" || resType === "iron";
        }
        if (itemType === "specialty") return true;
        return false;
    }

    buildP2PItemDescriptor(itemType, resOrRegionId, qty = 1) {
        const cleanQty = Math.max(1, Math.min(16, parseInt(qty, 10) || 1));
        if (itemType === "resource") {
            if (!this.isAllowedP2PItem("resource", resOrRegionId)) return null;
            const meta = {
                food: { name: "Lúa Gạo", icon: "🌾" },
                wood: { name: "Gỗ Đóng Tàu", icon: "🌲" },
                iron: { name: "Quặng Sắt", icon: "⛏️" }
            }[resOrRegionId];
            return { itemType: "resource", resType: resOrRegionId, regionId: null, name: meta.name, icon: meta.icon, qty: cleanQty };
        }
        if (itemType === "specialty") {
            const rId = parseInt(resOrRegionId, 10);
            const reg = (window.GAME_DATA && window.GAME_DATA.regions) ? window.GAME_DATA.regions[rId] : null;
            if (!reg || !reg.specialty) return null;
            return { itemType: "specialty", resType: null, regionId: reg.id, name: reg.specialty.shortName, icon: reg.specialty.icon, qty: cleanQty };
        }
        return null;
    }

    countPlayerP2PItem(player, spec) {
        if (!player || !spec) return 0;
        if (spec.itemType === "resource") {
            return player[spec.resType] || 0;
        }
        if (spec.itemType === "specialty") {
            const list = player.specialties || [];
            if (spec.regionId !== null && spec.regionId !== undefined) {
                return list.filter(s => s.regionId === spec.regionId).length;
            }
            return list.length;
        }
        return 0;
    }

    deductPlayerP2PItem(player, spec) {
        if (!player || !spec) return false;
        const qty = spec.qty || 1;
        if (this.countPlayerP2PItem(player, spec) < qty) return false;
        if (spec.itemType === "resource") {
            player[spec.resType] = Math.max(0, (player[spec.resType] || 0) - qty);
            return true;
        }
        if (spec.itemType === "specialty") {
            for (let k = 0; k < qty; k++) {
                const idx = player.specialties.findIndex(s =>
                    (spec.regionId === null || spec.regionId === undefined) ? true : (s.regionId === spec.regionId)
                );
                if (idx >= 0) player.specialties.splice(idx, 1);
            }
            return true;
        }
        return false;
    }

    addPlayerP2PItem(player, spec) {
        if (!player || !spec) return;
        const qty = spec.qty || 1;
        if (spec.itemType === "resource") {
            player[spec.resType] = (player[spec.resType] || 0) + qty;
        } else if (spec.itemType === "specialty") {
            if (!Array.isArray(player.specialties)) player.specialties = [];
            for (let k = 0; k < qty; k++) {
                player.specialties.push({
                    regionId: spec.regionId,
                    name: spec.name,
                    icon: spec.icon
                });
            }
        }
    }

    recordP2PMatchPair(pA, pB) {
        if (pA) {
            pA.p2pTrades = (pA.p2pTrades || 0) + 1;
            this.recordSecretQuestProgress(pA, "p2p_count");
        }
        if (pB) {
            pB.p2pTrades = (pB.p2pTrades || 0) + 1;
            this.recordSecretQuestProgress(pB, "p2p_count");
        }
        if (!this.matchStats) this.matchStats = { portTrades: {}, portVisits: {}, totalP2P: 0, disasterDamage: 0, stormReefDamage: 0 };
        this.matchStats.totalP2P = (this.matchStats.totalP2P || 0) + 1;
    }

    renderSharedMarketListingsHtml(viewerPlayer, insidePortModal = false) {
        const p = viewerPlayer || this.getLocalPlayer() || this.getActivePlayer();
        if (this.marketListings.length === 0) {
            return `<div style="color:#94a3b8; font-style:italic; padding:8px 0">Hiện chưa có lô hàng nào đang rao bán trên sàn.</div>`;
        }
        return this.marketListings.map(listing => {
            const isOwn = p && (listing.sellerId === p.id);
            const qty = listing.qty || 1;
            const regionInfo = listing.itemType === "specialty" && window.GAME_DATA.regions[listing.regionId]
                ? ` • Xuất xứ: ${window.GAME_DATA.regions[listing.regionId].name}`
                : "";
            // Luật 3C-1: Đơn giao dịch bằng Xu ẨN DANH hoàn toàn cho người khác!
            const sellerDisplay = isOwn ? "Đơn của bạn" : "🎭 Thương nhân ẩn danh";
            return `
                <div class="trade-row-card">
                    <div>
                        <strong style="color:#e5c365">${qty}× ${listing.icon} ${listing.name}</strong>
                        <div style="font-size:12px; color:#cbd5e1">
                            Người bán: <strong>${sellerDisplay}</strong>${regionInfo} • Giá: <strong style="color:#68b684">${listing.price} 💰 Xu</strong> <span style="font-size:10.5px; color:#9be2b6">(0 AP)</span>
                        </div>
                    </div>
                    <div>
                        ${isOwn
                            ? `<button class="btn-trade-action" style="background:#475569" onclick="window.GAME.cancelMarketListing(${listing.id}, ${insidePortModal})">Thu hồi về tàu (0 AP)</button>`
                            : `<button class="btn-trade-action gold" onclick="window.GAME.buyMarketListing(${listing.id}, ${insidePortModal})">🛒 Mua Ngay (${listing.price} 💰 Xu • 0 AP)</button>`
                        }
                    </div>
                </div>
            `;
        }).join("");
    }

    async syncMarketTransaction() {
        if (!this.roomState.code) return;
        const snapshot = this.serializeGameState();
        this.saveRoomToLocalStorage(snapshot);
        const marketPlayersPayload = (this.players || []).map(pl => ({
            id: pl.id,
            shipKey: pl.shipKey,
            clientId: pl.clientId,
            coins: pl.coins,
            food: pl.food,
            wood: pl.wood,
            iron: pl.iron,
            specialties: pl.specialties,
            p2pTrades: pl.p2pTrades || 0,
            secretQuests: pl.secretQuests || [],
            secretPoints: pl.secretPoints || 0,
            prosperityPoints: pl.prosperityPoints || 0,
            maxCargo: pl.maxCargo || 12,
            charterRegionId: pl.charterRegionId
        }));
        try {
            const resp = await fetch("/api/room/market-tx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: this.roomState.code,
                    clientId: this.clientId,
                    players: marketPlayersPayload,
                    updatedPlayers: marketPlayersPayload,
                    marketListings: this.marketListings,
                    buyOrders: this.buyOrders || [],
                    barterOrders: this.barterOrders || [],
                    portResourceStock: this.portResourceStock,
                    portResResetRemainingSec: this.portResResetRemainingSec,
                    tradeBulletinNotices: this.tradeBulletinNotices,
                    matchStats: this.matchStats
                })
            });
            const data = await resp.json();
            if (data && data.version) {
                this.roomState.version = data.version;
            }
        } catch (e) {}
        this.broadcastRoomMessage({
            type: "ROOM_STATE_SYNC",
            code: this.roomState.code,
            version: this.roomState.version,
            gameState: snapshot
        });
    }

    // 1. SÀN ĐANG BÁN (ANONYMOUS, 1–15 XU, HỖ TRỢ SỐ LƯỢNG)
    listMarketSellOrder(itemType, resOrRegionId, qty = 1, price = 2, fromMarketModal = true) {
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return false;
        const spec = this.buildP2PItemDescriptor(itemType, resOrRegionId, qty);
        if (!spec) {
            this.showToast("⛔ Chợ P2P chỉ giao dịch 🌾 Lúa, 🌲 Gỗ, ⛏️ Sắt & 📦 Đặc sản (cấm Key và Bảo Hiểm)!");
            return false;
        }
        const clampedPrice = Math.max(1, Math.min(15, parseInt(price, 10) || 2));
        if (this.countPlayerP2PItem(p, spec) < spec.qty) {
            this.showToast(`Không đủ ${spec.qty}× ${spec.icon} ${spec.name} trong khoang để đăng bán!`);
            return false;
        }
        this.deductPlayerP2PItem(p, spec);
        this.marketListings.unshift({
            id: Date.now() + Math.floor(Math.random() * 10000),
            sellerId: p.id,
            sellerName: "🎭 Thương nhân ẩn danh",
            anonymous: true,
            itemType: spec.itemType,
            resType: spec.resType,
            regionId: spec.regionId,
            name: spec.name,
            icon: spec.icon,
            qty: spec.qty,
            price: clampedPrice
        });
        window.SFX.playClick();
        this.logEvent(`🎭 [Chợ Ẩn Danh] Thương nhân ẩn danh treo bán [${spec.qty}× ${spec.icon} ${spec.name}] giá ${clampedPrice} 💰 Xu (0 AP).`);
        this.addTradeBulletinNotice(`🎭 Sàn Bán: [${spec.qty}× ${spec.icon} ${spec.name}] giá ${clampedPrice} Xu`);
        this.updateUI();
        this.syncMarketTransaction();
        if (fromMarketModal) this.openMaritimeMarketModal();
        return true;
    }

    listSpecialtyOnPlayerMarket(specIdx, price, fromMarketModal = false) {
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return false;
        const item = (p.specialties || [])[specIdx];
        if (!item) return false;
        return this.listMarketSellOrder("specialty", item.regionId, 1, price, fromMarketModal || !this.isMyTurn());
    }

    listResourceOnPlayerMarket(resType, price, fromMarketModal = false, qty = 1) {
        if (!this.isAllowedP2PItem("resource", resType)) {
            this.showToast("⛔ Chợ P2P chỉ giao dịch 🌾 Lúa, 🌲 Gỗ, ⛏️ Sắt & 📦 Đặc sản!");
            return false;
        }
        return this.listMarketSellOrder("resource", resType, qty, price, fromMarketModal || !this.isMyTurn());
    }

    buyMarketListing(listingId, insidePortModal = false, fromHudBulletin = false, actorOverride = null) {
        const buyer = actorOverride || this.getLocalPlayer() || this.getActivePlayer();
        if (!buyer) return false;
        const idx = this.marketListings.findIndex(l => l.id === listingId);
        if (idx === -1) return false;
        const listing = this.marketListings[idx];
        if (listing.sellerId === buyer.id) return false;
        const qty = listing.qty || 1;

        if ((buyer.coins || 0) < listing.price) {
            if (!actorOverride) this.showToast(`Không đủ Xu! Cần ${listing.price} 💰 Xu để mua lô hàng này.`);
            return false;
        }
        if (this.getCargoCount(buyer) + qty > this.getMaxCargo(buyer)) {
            if (!actorOverride) this.showToast(`Khoang tàu không đủ chỗ (cần ${qty} ô, hiện ${this.getCargoCount(buyer)}/${this.getMaxCargo(buyer)} ô)!`);
            return false;
        }

        buyer.coins -= listing.price;
        if (listing.sellerId >= 0) {
            const seller = this.players.find(pl => pl.id === listing.sellerId);
            if (seller) {
                seller.coins = Math.min(30, (seller.coins || 0) + listing.price);
                this.recordP2PMatchPair(seller, buyer);
            }
        }
        this.addPlayerP2PItem(buyer, {
            itemType: listing.itemType,
            resType: listing.resType,
            regionId: listing.regionId,
            name: listing.name,
            icon: listing.icon,
            qty
        });

        this.marketListings.splice(idx, 1);
        window.SFX.playCoin();
        this.logEvent(`🎭 [Chợ Ẩn Danh] Đã chốt đơn [${qty}× ${listing.icon} ${listing.name}] với giá ${listing.price} 💰 Xu (0 AP)!`);
        this.addTradeBulletinNotice(`🎭 Chốt Sàn Bán: [${qty}× ${listing.icon} ${listing.name}] (${listing.price} Xu)`);
        if (!actorOverride) this.showToast(`🛒 Đã mua [${qty}× ${listing.icon} ${listing.name}] (-${listing.price} 💰 Xu • 0 AP)!`);
        this.updateUI();
        this.syncMarketTransaction();

        if (!actorOverride && !fromHudBulletin) {
            this.openMaritimeMarketModal();
        }
        return true;
    }

    cancelMarketListing(listingId, insidePortModal = false, fromHudBulletin = false) {
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return false;
        const idx = this.marketListings.findIndex(l => l.id === listingId);
        if (idx === -1) return false;
        const listing = this.marketListings[idx];
        if (listing.sellerId !== p.id) return false;
        const qty = listing.qty || 1;

        if (this.getCargoCount(p) + qty > this.getMaxCargo(p)) {
            this.showToast(`Khoang tàu không đủ ${qty} ô trống (${this.getCargoCount(p)}/${this.getMaxCargo(p)} ô), chưa thể thu hồi hàng!`);
            return false;
        }

        this.addPlayerP2PItem(p, {
            itemType: listing.itemType,
            resType: listing.resType,
            regionId: listing.regionId,
            name: listing.name,
            icon: listing.icon,
            qty
        });

        this.marketListings.splice(idx, 1);
        this.showToast(`↩️ Đã thu hồi [${qty}× ${listing.icon} ${listing.name}] về khoang tàu!`);
        this.updateUI();
        this.syncMarketTransaction();
        if (!fromHudBulletin) this.openMaritimeMarketModal();
        return true;
    }

    // 2. ĐƠN CẦN MUA (ANONYMOUS, ESCROW 1–15 XU)
    createBuyOrder(itemType, resOrRegionId, qty = 1, offerPrice = 2, refreshModal = true) {
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return false;
        const spec = this.buildP2PItemDescriptor(itemType, resOrRegionId, qty);
        if (!spec) {
            this.showToast("⛔ Chỉ được đặt mua 🌾 Lúa, 🌲 Gỗ, ⛏️ Sắt hoặc 📦 Đặc sản (cấm Key và Bảo Hiểm)!");
            return false;
        }
        const clampedOffer = Math.max(1, Math.min(15, parseInt(offerPrice, 10) || 2));
        if ((p.coins || 0) < clampedOffer) {
            this.showToast(`Không đủ Xu tạm giữ! Cần ${clampedOffer} 💰 Xu để đăng Đơn Cần Mua.`);
            return false;
        }
        p.coins -= clampedOffer; // Escrow immediately
        if (!Array.isArray(this.buyOrders)) this.buyOrders = [];
        this.buyOrders.unshift({
            id: Date.now() + Math.floor(Math.random() * 10000),
            buyerId: p.id,
            buyerName: "🎭 Thương nhân ẩn danh",
            anonymous: true,
            itemType: spec.itemType,
            resType: spec.resType,
            regionId: spec.regionId,
            name: spec.name,
            icon: spec.icon,
            qty: spec.qty,
            offerPrice: clampedOffer
        });
        window.SFX.playClick();
        this.logEvent(`🎭 [Đơn Cần Mua] Thương nhân ẩn danh đặt mua [${spec.qty}× ${spec.icon} ${spec.name}] với giá ${clampedOffer} 💰 Xu (tạm giữ).`);
        this.addTradeBulletinNotice(`🎭 Cần Mua: [${spec.qty}× ${spec.icon} ${spec.name}] trả ${clampedOffer} Xu`);
        this.updateUI();
        this.syncMarketTransaction();
        if (refreshModal) this.openMaritimeMarketModal();
        return true;
    }

    cancelBuyOrder(orderId, refreshModal = true) {
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p || !Array.isArray(this.buyOrders)) return false;
        const idx = this.buyOrders.findIndex(o => o.id === orderId);
        if (idx === -1) return false;
        const order = this.buyOrders[idx];
        if (order.buyerId !== p.id) return false;

        p.coins = Math.min(30, (p.coins || 0) + order.offerPrice);
        this.buyOrders.splice(idx, 1);
        window.SFX.playCoin();
        this.showToast(`↩️ Đã hủy Đơn Cần Mua và hoàn lại ${order.offerPrice} 💰 Xu!`);
        this.updateUI();
        this.syncMarketTransaction();
        if (refreshModal) this.openMaritimeMarketModal();
        return true;
    }

    fulfillBuyOrder(orderId, refreshModal = true, actorOverride = null) {
        const seller = actorOverride || this.getLocalPlayer() || this.getActivePlayer();
        if (!seller || !Array.isArray(this.buyOrders)) return false;
        const idx = this.buyOrders.findIndex(o => o.id === orderId);
        if (idx === -1) return false;
        const order = this.buyOrders[idx];
        if (order.buyerId === seller.id) return false;

        const buyer = this.players.find(pl => pl.id === order.buyerId);
        if (!buyer || buyer.eliminated) return false;
        const qty = order.qty || 1;

        if (this.countPlayerP2PItem(seller, order) < qty) {
            if (!actorOverride) this.showToast(`Bạn không đủ ${qty}× ${order.icon} ${order.name} để khớp Đơn Cần Mua này!`);
            return false;
        }
        if (this.getCargoCount(buyer) + qty > this.getMaxCargo(buyer)) {
            if (!actorOverride) this.showToast("⚠️ Khoang tàu của người đặt mua hiện đã đầy, chưa thể giao hàng!");
            return false;
        }

        this.deductPlayerP2PItem(seller, order);
        this.addPlayerP2PItem(buyer, order);
        seller.coins = Math.min(30, (seller.coins || 0) + order.offerPrice);
        this.recordP2PMatchPair(seller, buyer);

        this.buyOrders.splice(idx, 1);
        window.SFX.playCoin();
        this.logEvent(`🎭 [Đơn Cần Mua] Đã khớp đơn [${qty}× ${order.icon} ${order.name}] thu ${order.offerPrice} 💰 Xu (0 AP)!`);
        this.addTradeBulletinNotice(`🎭 Khớp Cần Mua: [${qty}× ${order.icon} ${order.name}] (${order.offerPrice} Xu)`);
        if (!actorOverride) this.showToast(`💰 Đã giao [${qty}× ${order.icon} ${order.name}] và nhận ngay +${order.offerPrice} 💰 Xu!`);
        this.updateUI();
        this.syncMarketTransaction();
        if (!actorOverride && refreshModal) this.openMaritimeMarketModal();
        return true;
    }

    // 3. ĐỔI HÀNG BARTER 0 XU (CÔNG KHAI HOÀN TOÀN: TÊN, MÀU TÀU, THƯƠNG QUYỀN)
    createBarterOrder(offerType, offerKey, offerQty, wantType, wantKey, wantQty, refreshModal = true) {
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return false;
        const offerItem = this.buildP2PItemDescriptor(offerType, offerKey, offerQty);
        const wantItem = this.buildP2PItemDescriptor(wantType, wantKey, wantQty);
        if (!offerItem || !wantItem) {
            this.showToast("⛔ Barter chỉ cho phép đổi 🌾 Lúa, 🌲 Gỗ, ⛏️ Sắt & 📦 Đặc sản (cấm Key và Bảo Hiểm)!");
            return false;
        }
        if (this.countPlayerP2PItem(p, offerItem) < offerItem.qty) {
            this.showToast(`Bạn không đủ ${offerItem.qty}× ${offerItem.icon} ${offerItem.name} để đưa ra đổi!`);
            return false;
        }

        this.deductPlayerP2PItem(p, offerItem);
        const charterLabel = (p.charterRegionId !== undefined && p.charterRegionId !== null)
            ? this.getRegionShortName(p.charterRegionId)
            : "Vùng Tự Do";

        if (!Array.isArray(this.barterOrders)) this.barterOrders = [];
        this.barterOrders.unshift({
            id: Date.now() + Math.floor(Math.random() * 10000),
            creatorId: p.id,
            creatorName: p.name,
            creatorColor: p.color,
            creatorCharter: charterLabel,
            anonymous: false,
            offerItem,
            wantItem
        });
        window.SFX.playClick();
        this.logEvent(`🔄 [Barter 0 Xu] ${p.name} (${charterLabel}) đăng đổi [${offerItem.qty}× ${offerItem.icon} ${offerItem.name}] ⇄ [${wantItem.qty}× ${wantItem.icon} ${wantItem.name}]!`);
        this.addTradeBulletinNotice(`🔄 Barter: ${p.name} đổi ${offerItem.qty}${offerItem.icon} ⇄ ${wantItem.qty}${wantItem.icon}`);
        this.updateUI();
        this.syncMarketTransaction();
        if (refreshModal) this.openMaritimeMarketModal();
        return true;
    }

    cancelBarterOrder(orderId, refreshModal = true) {
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p || !Array.isArray(this.barterOrders)) return false;
        const idx = this.barterOrders.findIndex(o => o.id === orderId);
        if (idx === -1) return false;
        const order = this.barterOrders[idx];
        if (order.creatorId !== p.id) return false;

        const offerQty = order.offerItem.qty || 1;
        if (this.getCargoCount(p) + offerQty > this.getMaxCargo(p)) {
            this.showToast(`Khoang tàu không đủ ${offerQty} ô trống để thu hồi hàng Barter!`);
            return false;
        }
        this.addPlayerP2PItem(p, order.offerItem);
        this.barterOrders.splice(idx, 1);
        this.showToast(`↩️ Đã thu hồi đơn Barter [${offerQty}× ${order.offerItem.icon} ${order.offerItem.name}] về kho!`);
        this.updateUI();
        this.syncMarketTransaction();
        if (refreshModal) this.openMaritimeMarketModal();
        return true;
    }

    fulfillBarterOrder(orderId, refreshModal = true, actorOverride = null) {
        const responder = actorOverride || this.getLocalPlayer() || this.getActivePlayer();
        if (!responder || !Array.isArray(this.barterOrders)) return false;
        const idx = this.barterOrders.findIndex(o => o.id === orderId);
        if (idx === -1) return false;
        const order = this.barterOrders[idx];
        if (order.creatorId === responder.id) return false;

        const creator = this.players.find(pl => pl.id === order.creatorId);
        if (!creator || creator.eliminated) return false;

        const offerQty = order.offerItem.qty || 1;
        const wantQty = order.wantItem.qty || 1;

        if (this.countPlayerP2PItem(responder, order.wantItem) < wantQty) {
            if (!actorOverride) this.showToast(`Bạn không đủ ${wantQty}× ${order.wantItem.icon} ${order.wantItem.name} để đổi!`);
            return false;
        }
        // Kiểm tra sức chứa kho cả 2 bên sau khi hoán đổi!
        const responderAfterCargo = this.getCargoCount(responder) - wantQty + offerQty;
        if (responderAfterCargo > this.getMaxCargo(responder)) {
            if (!actorOverride) this.showToast(`Khoang tàu của bạn sẽ vượt quá giới hạn (${responderAfterCargo}/${this.getMaxCargo(responder)} ô)!`);
            return false;
        }
        const creatorAfterCargo = this.getCargoCount(creator) + wantQty;
        if (creatorAfterCargo > this.getMaxCargo(creator)) {
            if (!actorOverride) this.showToast(`⚠️ Khoang tàu của ${creator.name} hiện đã đầy, chưa thể hoàn tất đổi hàng!`);
            return false;
        }

        // Hoán đổi trực tiếp 0 Xu
        this.deductPlayerP2PItem(responder, order.wantItem);
        this.addPlayerP2PItem(responder, order.offerItem);
        this.addPlayerP2PItem(creator, order.wantItem);
        this.recordP2PMatchPair(creator, responder);

        this.barterOrders.splice(idx, 1);
        window.SFX.playCoin();
        this.logEvent(`🔄 [Barter 0 Xu] ${responder.name} đã đổi [${wantQty}× ${order.wantItem.icon} ${order.wantItem.name}] lấy [${offerQty}× ${order.offerItem.icon} ${order.offerItem.name}] của ${creator.name}!`);
        this.addTradeBulletinNotice(`🔄 Barter xong: ${responder.name} ⇄ ${creator.name} (0 Xu)`);
        if (!actorOverride) this.showToast(`🔄 Hoán đổi thành công với ${creator.name} (0 💰 Xu)!`);
        this.updateUI();
        this.syncMarketTransaction();
        if (!actorOverride && refreshModal) this.openMaritimeMarketModal();
        return true;
    }

    // 4. BOT TƯƠNG TÁC CHỢ P2P (Tự khớp đơn giá hợp lý trên Sàn Bán / Đơn Cần Mua)
    tryBotP2PTrade(ai) {
        if (!ai || !ai.isAI || ai.eliminated) return false;
        if (Math.random() > 0.38) return false;

        // Ưu tiên 1: Khớp Đơn Cần Mua giá hợp lý (>= 2 Xu/món) nếu Bot có sẵn hàng
        const goodBuy = (this.buyOrders || []).find(o => {
            if (o.buyerId === ai.id) return false;
            const buyer = this.players.find(pl => pl.id === o.buyerId);
            if (!buyer || buyer.eliminated) return false;
            const unitVal = (o.offerPrice || 0) / Math.max(1, o.qty || 1);
            return unitVal >= 2 && this.countPlayerP2PItem(ai, o) >= (o.qty || 1) && (this.getCargoCount(buyer) + (o.qty || 1) <= this.getMaxCargo(buyer));
        });
        if (goodBuy) {
            return this.fulfillBuyOrder(goodBuy.id, false, ai);
        }

        // Ưu tiên 2: Mua lô hàng giá hời (<= 3 Xu/món) trên Sàn Đang Bán nếu Bot đủ tiền & còn kho
        const goodSell = (this.marketListings || []).find(l => {
            if (l.sellerId === ai.id || l.sellerId < 0) return false;
            const qty = l.qty || 1;
            const unitPrice = (l.price || 99) / Math.max(1, qty);
            return unitPrice <= 3 && (ai.coins || 0) >= l.price && (this.getCargoCount(ai) + qty <= this.getMaxCargo(ai) - 1);
        });
        if (goodSell) {
            return this.buyMarketListing(goodSell.id, false, true, ai);
        }
        return false;
    }

    ensurePortApDeducted() {
        const p = this.getActivePlayer();
        if (!this.portApDeducted && p.ap >= 1) {
            this.spendInteractiveAP(p);
            this.portApDeducted = true;
        }
    }

    buySpecialtyAtPort(regionId = null) {
        if (!this.isMyTurn()) return;
        const p = this.getActivePlayer();
        if (p.coins < 2) {
            this.showToast("Không đủ Xu! Cần 2 Xu để mua Đặc sản vùng.");
            return;
        }
        if (this.getCargoCount(p) >= this.getMaxCargo(p)) {
            this.showToast(`Khoang tàu đã đạt giới hạn ${this.getMaxCargo(p)} ô hàng!`);
            return;
        }
        this.ensurePortApDeducted();
        const rId = regionId !== null ? regionId : (this.currentPortTile ? this.currentPortTile.regionId : 0);
        const reg = window.GAME_DATA.regions[rId] || window.GAME_DATA.regions[0];
        if (!this.matchStats) this.matchStats = { portTrades: {}, totalP2P: 0, disasterDamage: 0 };
        this.matchStats.portTrades[reg.id] = (this.matchStats.portTrades[reg.id] || 0) + 1;
        p.coins -= 2;
        p.specialties.push({
            regionId: reg.id,
            name: reg.specialty.shortName,
            icon: reg.specialty.icon
        });
        this.recordSecretQuestProgress(p, "buy_spec");
        this.recordSecretQuestProgress(p, "visit_ports", reg.id);
        window.SFX.playCoin();
        this.logEvent(`📦 ${p.name} mua đặc sản [${reg.specialty.icon} ${reg.specialty.shortName}] tại ${reg.name} với giá 2 Xu.`);
        this.addTradeBulletinNotice(`📦 ${p.name} nhập [${reg.specialty.icon} ${reg.specialty.shortName}] tại ${reg.name} (2 Xu)`);
        this.updateUI();
        this.syncMultiplayerGameState();
        this.openTradePortModal(this.currentPortTile);
    }

    sellSpecialtyAtPort(specIndex, coinPrice = null) {
        if (!this.isMyTurn()) return;
        const p = this.getActivePlayer();
        const item = p.specialties[specIndex];
        if (!item) return;

        const portRegId = this.currentPortTile ? this.currentPortTile.regionId : 0;
        if (!this.matchStats) this.matchStats = { portTrades: {}, totalP2P: 0, disasterDamage: 0 };
        this.matchStats.portTrades[portRegId] = (this.matchStats.portTrades[portRegId] || 0) + 1;
        const dist = Math.abs(portRegId - item.regionId);
        // Luật Mục 3A: Mua 2 Xu -> cách 1 vùng thu 3 Xu (+1), cách 2 vùng thu 5 Xu (+3), xuyên Việt >=3 vùng thu 7 Xu (+5)
        const calcPayout = dist <= 1 ? 3 : (dist === 2 ? 5 : 7);
        const finalPayout = coinPrice !== null ? coinPrice : calcPayout;
        const netProfit = finalPayout - 2;

        this.ensurePortApDeducted();
        p.specialties.splice(specIndex, 1);
        p.coins = Math.min(30, p.coins + finalPayout);
        this.recordSecretQuestProgress(p, "sell_spec_regions", portRegId);
        this.recordSecretQuestProgress(p, "visit_ports", portRegId);

        window.SFX.playCoin();
        this.world.triggerBurstAnimation(p.q, p.r, 0xd4af37, 22);
        this.logEvent(`💰 ${p.name} bán đặc sản [${item.icon} ${item.name}] (cách ${dist} vùng) thu về ${finalPayout} Xu (Lãi +${netProfit} Xu)!`);
        this.addTradeBulletinNotice(`💰 ${p.name} bán [${item.icon} ${item.name}] thu ${finalPayout} Xu (Lãi +${netProfit} Xu)`);
        this.updateUI();
        this.syncMultiplayerGameState();
        this.openTradePortModal(this.currentPortTile);
    }

    buyKeyAtPort(keyLevel, cost = null) {
        if (!this.isMyTurn()) return;
        const p = this.getActivePlayer();
        if (keyLevel === null || keyLevel === undefined) {
            this.showToast("⛔ Thương Cảng này hiện không mở bán Chìa khóa!");
            return;
        }
        if (this.isTierExhausted(keyLevel)) {
            this.showToast(`🏛️ Toàn bộ Di tích Cấp ${keyLevel} đã được chinh phục! Các Thương Cảng đã ngừng bán Key ${keyLevel}.`);
            return;
        }
        if (this.isEarlyGameMonumentLockActive() && keyLevel > 1) {
            this.showToast("🔒 Key 2 & Key 3 chỉ mở bán sau phút 08:30!");
            return;
        }
        const actualCost = cost !== null ? cost : (keyLevel * 2);
        if ((p.keys[keyLevel] || 0) >= 1) {
            this.showToast(`⚠️ Trong kho chỉ có thể chứa tối đa 1 Chìa khóa mỗi loại (Key ${keyLevel} đã đầy 1/1)!`);
            return;
        }
        if (p.coins < actualCost) {
            this.showToast(`Không đủ Xu! Cần ${actualCost} Xu để mua Key ${keyLevel}.`);
            return;
        }
        // Luật Mục 3A: Chìa khóa chiếm 0 ô kho!
        this.ensurePortApDeducted();
        p.coins -= actualCost;
        p.keys[keyLevel] = 1;
        window.SFX.playCoin();
        this.logEvent(`🗝️ ${p.name} đã mua Key ${keyLevel} (1/1 • 0 ô kho) tại cảng với giá ${actualCost} Xu.`);
        this.showToast(`🗝️ Đã mua Key ${keyLevel} (0 ô kho • Tối đa 1/1)!`);
        this.updateUI();
        this.syncMultiplayerGameState();
        this.openTradePortModal(this.currentPortTile);
    }

    buyLimitedResourceAtPort(resType) {
        if (!this.isMyTurn() || !this.currentPortTile) return;
        const p = this.getActivePlayer();
        const regionId = this.currentPortTile.regionId;
        const stockObj = this.getPortResourceStock(regionId);
        if ((stockObj[resType] || 0) <= 0) {
            this.showToast(`Hết hàng • Nhập mới sau ${this.formatMMSS(this.portResResetRemainingSec || 0)}!`);
            return;
        }
        if ((p.coins || 0) < 2) {
            this.showToast("Không đủ Xu! Cần 2 💰 Xu để mua 1 đơn vị tài nguyên.");
            return;
        }
        if (this.getCargoCount(p) >= this.getMaxCargo(p)) {
            this.showToast(`Khoang tàu đã đầy (${this.getMaxCargo(p)}/${this.getMaxCargo(p)} ô)!`);
            return;
        }
        this.ensurePortApDeducted();
        p.coins -= 2;
        p[resType] = (p[resType] || 0) + 1;
        stockObj[resType] -= 1;

        const labels = { food: "🌾 Lúa", wood: "🌲 Gỗ", iron: "⛏️ Sắt" };
        window.SFX.playCoin();
        this.logEvent(`🛒 ${p.name} mua 1 ${labels[resType]} tại ${this.currentPortTile.portName} (2 Xu • Tồn kho còn ${stockObj[resType]}).`);
        this.showToast(`🛒 Đã mua 1 ${labels[resType]} (-2 💰 Xu • Còn lại: ${stockObj[resType]})!`);
        this.updateUI();
        this.syncMultiplayerGameState();
        this.openTradePortModal(this.currentPortTile);
    }

    exportRawResourceAtPort(resType) {
        if (!this.isMyTurn() || !this.currentPortTile) return;
        const p = this.getActivePlayer();
        const regionId = this.currentPortTile.regionId;
        const charterOwner = this.getPortCharterOwner(regionId);
        if (charterOwner && charterOwner.id !== p.id) {
            this.showToast("🔒 Xuất khẩu thô giá sàn (1 Xu) chỉ kích hoạt tại Cảng Thương quyền của bạn hoặc Vùng Tự Do Đông Nam Bộ!");
            return;
        }
        if ((p[resType] || 0) < 1) {
            this.showToast("Bạn không có sẵn tài nguyên này trong khoang để xuất khẩu!");
            return;
        }
        if ((p.coins || 0) >= 30) {
            this.showToast("Ngân khố đã đạt trần tối đa (30/30 Xu)!");
            return;
        }
        this.ensurePortApDeducted();
        p[resType] -= 1;
        p.coins = Math.min(30, (p.coins || 0) + 1);

        const labels = { food: "🌾 Lúa", wood: "🌲 Gỗ", iron: "⛏️ Sắt" };
        window.SFX.playCoin();
        this.logEvent(`📤 ${p.name} xuất khẩu thô 1 ${labels[resType]} tại ${this.currentPortTile.portName} thu giá sàn +1 💰 Xu (${p.coins}/30 Xu).`);
        this.showToast(`📤 Đã xuất khẩu 1 ${labels[resType]} (+1 💰 Xu xoay vốn)!`);
        this.updateUI();
        this.syncMultiplayerGameState();
        this.openTradePortModal(this.currentPortTile);
    }

    buyPortResourceBundle(resType, qty, cost) {
        this.showToast("💎 Thương Cảng chỉ bán Tài nguyên Giới Hạn (2 Xu/món, tối đa 3 đơn vị, reset mỗi 05:00)!");
    }

    buySupplyAtPort(type, cost) {
        const defaultQty = type === "food" ? 2 : (type === "wood" ? 3 : 1);
        this.buyPortResourceBundle(type, defaultQty, cost);
    }

    buySerpentCoinAtPort() {
        if (!this.isMyTurn()) return;
        const p = this.getActivePlayer();
        if (p.hasSerpentCoin) {
            this.showToast("🛡️ Bạn đang sở hữu Bảo Hiểm Hàng Hải Quốc Tế trên tàu rồi!");
            return;
        }
        if (p.coins < 10) {
            this.showToast("Không đủ Xu! Cần 10 Xu để mua 🛡️ Bảo Hiểm Hàng Hải Quốc Tế.");
            return;
        }
        this.ensurePortApDeducted();
        p.coins -= 10;
        p.hasSerpentCoin = true;
        window.SFX.playRelicFanfare();
        this.world.triggerBurstAnimation(p.q, p.r, 0x38bdf8, 28);
        this.logEvent(`🛡️ ${p.name} đã mua [Bảo Hiểm Hàng Hải Quốc Tế] với giá 10 Xu! (Tự động hồi 2 HP khi máu về 0).`);
        this.showToast("🛡️ Đã trang bị Bảo Hiểm Hàng Hải Quốc Tế! Tự động hồi 2 HP nếu máu giảm về 0!");
        this.updateUI();
        this.syncMultiplayerGameState();
        this.openTradePortModal(this.currentPortTile);
    }

    finishPortVisit() {
        this.portApDeducted = false;
        this.closeModal();
        this.updateUI();
        this.checkAutoEndTurnIfNoAP();
    }

    // ------------------------------------------------------------------------
    // V. RARE GOLDEN / SILVER AXE NPC MINIGAME + LIVE SHARED QUIZ BROADCAST
    // ------------------------------------------------------------------------
    openNPCMinigameModal(tile) {
        const p = this.getActivePlayer();
        if (!this.isMyTurn()) return;
        if (!this.canSpendInteractiveAP(p)) {
            this.showToast("Cần 1 AP Tương Tác để gặp gỡ Thương Đoàn Quốc Tế (Tàu FDI)!");
            return;
        }

        const rawEv = window.GAME_DATA.npcEvents[Math.floor(Math.random() * window.GAME_DATA.npcEvents.length)];
        const shuffledQuiz = this.prepareShuffledQuiz(rawEv);
        this.pendingNPCContext = { tile, rawEv, shuffledQuiz };

        this.liveQuizState = {
            id: "qz_npc_" + Date.now(),
            phase: "asking",
            actorId: p.id,
            actorName: p.name,
            badgeColor: "#c59b27",
            badgeTitle: `🧙‍♂️ SỰ KIỆN HIẾM: ${rawEv.npcName.toUpperCase()}`,
            title: `${p.name} Gặp ${rawEv.title}`,
            desc: rawEv.story,
            quiz: shuffledQuiz,
            chosenIdx: null,
            outcomeTitle: null
        };
        this.syncMultiplayerGameState();

        const html = `
            <div class="modal-header-badge" style="background:#c59b2728; border-color:#c59b27">
                <span>🚢 SỰ KIỆN HIẾM (4–5 VÒNG 1 LẦN): ${rawEv.npcName.toUpperCase()}</span>
                <span id="active-quiz-countdown" class="quiz-countdown-pill">⏱️ 01:00</span>
            </div>
            <h2 class="modal-title">${rawEv.title}</h2>
            <p class="modal-desc">${rawEv.story}</p>
            <div class="quiz-box">
                <div class="quiz-question">❓ ${shuffledQuiz.q}</div>
                <div class="quiz-options">
                    ${shuffledQuiz.options.map((opt, idx) => `
                        <button class="quiz-opt-btn" onclick="window.GAME.resolveNPCMinigame(${idx}, false)">
                            <span class="opt-letter">${String.fromCharCode(65 + idx)}</span>
                            <span>${opt}</span>
                        </button>
                    `).join("")}
                </div>
            </div>
        `;
        this.startPendingQuiz({
            type: "npc_fdi",
            html,
            durationSec: 60,
            onTimeout: () => this.resolveNPCMinigame(-1, true)
        });
    }

    resolveNPCMinigame(chosenIdx, isTimeout = false) {
        const ctx = this.pendingNPCContext;
        if (!ctx) return;
        this.pendingNPCContext = null;
        this.clearPendingQuiz();
        const { tile, rawEv, shuffledQuiz } = ctx;
        const p = this.getActivePlayer();

        this.spendInteractiveAP(p);
        const isCorrect = !isTimeout && (chosenIdx === shuffledQuiz.correct);
        p.quizTotal = (p.quizTotal || 0) + 1;
        if (isCorrect) {
            p.quizCorrect = (p.quizCorrect || 0) + 1;
            this.recordSecretQuestProgress(p, "quiz_correct");
        }
        this.recordQuizStreak(p, isCorrect);
        const reward = isTimeout ? 0 : (isCorrect ? 3 : 2);
        if (reward > 0) {
            p.coins = Math.min(30, p.coins + reward);
        }

        this.world.despawnRareNPC();
        this.nextNPCSpawnRound = this.roundNumber + 4 + Math.floor(Math.random() * 2);

        if (reward > 0) window.SFX.playCoin();
        else window.SFX.playClick();
        this.world.triggerBurstAnimation(tile.q, tile.r, isTimeout ? 0x64748b : 0xd4af37, 24);
        this.logEvent(isTimeout
            ? `⌛ ${p.name} hết giờ (60s) khảo sát cùng ${rawEv.npcName} → Không nhận thưởng! Tàu FDI sẽ tái xuất ở Vòng ${this.nextNPCSpawnRound}.`
            : `🚢 ${p.name} hoàn thành khảo sát hợp tác cùng ${rawEv.npcName}, nhận +${reward} Xu! Tàu FDI sẽ tái xuất ở Vòng ${this.nextNPCSpawnRound}.`);

        if (this.liveQuizState) {
            this.liveQuizState.phase = "answered";
            this.liveQuizState.chosenIdx = chosenIdx;
            this.liveQuizState.outcomeTitle = isTimeout
                ? `${p.name} Hết Giờ Khảo Sát ${rawEv.npcName} (0 Xu)!`
                : `${p.name} Nhận +${reward} Xu Tài Trợ Từ ${rawEv.npcName}!`;
        }

        const html = `
            <div class="modal-header-badge" style="background:${isTimeout ? '#9e5a2b33' : '#2e6f4033'}; border-color:${isTimeout ? '#c58b43' : '#4b9b68'}">
                <span>${isTimeout ? '⌛ HẾT GIỜ KHẢO SÁT TÀU FDI (0 XU)' : `🎁 TÀI TRỢ THƯƠNG ĐOÀN QUỐC TẾ (FDI): +${reward} XU VÀNG`}</span>
                <span class="badge-tag">⏱️ Tự đóng <span id="quiz-autoclose-sec">10</span>s</span>
            </div>
            <h2 class="modal-title">${isTimeout ? 'Hết 60 Giây — Thương Đoàn Rời Cảng (Không Nhận Thưởng)!' : (isCorrect ? 'Đối Tác Chiến Lược Xuất Sắc (+3 Xu)!' : 'Hỗ Trợ Kết Nối Thương Mại (+2 Xu)!')}</h2>
            ${this.renderQuizVisualMemoryCard(shuffledQuiz, chosenIdx)}
            <p class="modal-desc" style="margin-top:10px; margin-bottom:4px">
                🌊 <em>Thương Đoàn Quốc Tế (Tàu FDI) đã nhổ neo rời hải phận và sẽ quay lại khảo sát tại một vùng biển khác sau 4–5 vòng nữa!</em>
            </p>
            <div class="modal-actions" style="justify-content:space-between">
                <span style="font-size:12px; color:#fbbf24; font-weight:700">⏳ Tự động đóng sau <span id="quiz-autoclose-sec-sub">10</span> giây...</span>
                <button class="btn-primary-gold" onclick="window.GAME.closeQuizResultNow()">✕ Đóng Ngay Lập Tức</button>
            </div>
        `;
        this.showModal(html);
        this.startQuizResultAutoCloseTimer(10);
        this.updateUI();
        this.syncMultiplayerGameState();
    }

    // ------------------------------------------------------------------------
    // VI. CONQUERING MONUMENTS + TRAP PENALTIES + TIER 1 VISIT LIMIT (MAX 1)
    // ------------------------------------------------------------------------
    openMonumentModal(tile) {
        const p = this.getActivePlayer();
        const mon = window.GAME_DATA.monuments.find(m => m.id === tile.monumentId);
        if (!mon) return;

        const tier = tile.monumentTier;
        const tierMeta = {
            1: {
                name: "CẤP 1 – TRẠM BƯỚC ĐỆM (EASY)",
                keyReq: "1 🗝️ Key 1",
                foodCost: 1,
                ironCost: 0,
                coinCost: 2,
                rewardCoins: 4,
                rewardPoints: 1,
                rewardDesc: "+1 ⭐ Điểm, +4 💰 Xu, Kho 8→10 ô, +1 Key 2 (hoặc +3 Xu)",
                trapDesc: "🏹 Bẫy Mũi Tên (-1 HP nếu trả lời sai)",
                color: "#3f7a58"
            },
            2: {
                name: "CẤP 2 – TRUNG BÌNH (MEDIUM)",
                keyReq: "1 🗝️ Key 2",
                foodCost: 2,
                ironCost: 0,
                coinCost: 3,
                rewardCoins: 4,
                rewardPoints: 3,
                rewardDesc: "+3 ⭐ Điểm Thịnh Vượng & +4 💰 Xu",
                trapDesc: "🪨 Bẫy Đá Lăn (-2 HP nếu trả lời sai)",
                color: "#b8862d"
            },
            3: {
                name: "CẤP 3 – KHÓ (HARD)",
                keyReq: "1 🗝️ Key 3",
                foodCost: 3,
                ironCost: 1,
                coinCost: 6,
                rewardCoins: 5,
                rewardPoints: 5,
                rewardDesc: "+5 ⭐ Điểm Thịnh Vượng & +5 💰 Xu (Khóa vĩnh viễn sau khi giải)",
                trapDesc: "⚡🪨 Bẫy Sét Đánh & Đá Lăn (-3 HP & đẩy lùi nếu trả lời sai)",
                color: "#a8423f"
            }
        }[tier];

        const earlyLocked = (tier >= 2 && this.isEarlyGameMonumentLockActive());
        const alreadyConqueredByPlayer = p ? p.relics.some(r => r.id === mon.id) : false;
        const tier1LimitReached = Boolean(tier === 1 && p && (p.tier1Visited || 0) >= 1 && !alreadyConqueredByPlayer);
        const hasMatchingKey = p ? ((p.keys[tier] || 0) > 0) : false;
        const hasDockingFee = p ? ((p.food >= tierMeta.foodCost) && (p.iron >= tierMeta.ironCost) && (p.coins >= tierMeta.coinCost)) : false;
        const isPlayerAtMonument = p ? (p.q === tile.q && p.r === tile.r) : false;
        const canChallenge = this.isGameStarted && this.isMyTurn() && isPlayerAtMonument && !earlyLocked && !tile.monumentLocked && !alreadyConqueredByPlayer && !tier1LimitReached && hasMatchingKey && hasDockingFee && this.canSpendInteractiveAP(p);

        let statusNotice = "";
        if (!this.isGameStarted) {
            statusNotice = `<div class="alert-banner warning">ℹ️ Bạn đang xem hồ sơ Di tích từ Cẩm Nang. Hãy bắt đầu ván đấu để lái tàu tới chinh phục Điểm Thịnh Vượng!</div>`;
        } else if (earlyLocked) {
            const remStr = this.formatMMSS(Math.max(0, 510 - (this.matchElapsedSec || 0)));
            statusNotice = `<div class="alert-banner danger">🔒 <strong>Đang khai quật — Mở lúc 08:30</strong> (Còn ${remStr}). Trong 08:30 đầu trận, chỉ 2 Di tích Cấp 1 mở cửa; hãy tích lũy vốn và chinh phục Trạm Bước Đệm Cấp 1 trước!</div>`;
        } else if (!this.isMyTurn()) {
            statusNotice = `<div class="alert-banner warning">👁️ Bạn đang xem hồ sơ Di tích trong lượt của <strong>${p ? p.name : ''}</strong>. Khi tới lượt của mình, hãy lái thuyền đến đây để mở cổng!</div>`;
        } else if (tile.monumentLocked) {
            statusNotice = `<div class="alert-banner danger">🔒 Di tích Cấp 3 này đã được chinh phục và KHÓA VĨNH VIỄN trong ván đấu này!</div>`;
        } else if (alreadyConqueredByPlayer) {
            statusNotice = `<div class="alert-banner success">⭐ Bạn đã chinh phục thành công Di tích <strong>${mon.name}</strong>!</div>`;
        } else if (tier1LimitReached) {
            statusNotice = `<div class="alert-banner danger">⛔ <strong>Giới hạn Trạm Bước Đệm Cấp 1:</strong> Mỗi người chơi chỉ được chinh phục Di tích Cấp 1 tối đa <strong>1 lần</strong> (Đã dùng ${p.tier1Visited}/1). Hãy tiến lên Di tích Cấp 2 hoặc Cấp 3!</div>`;
        } else if (!isPlayerAtMonument) {
            statusNotice = `<div class="alert-banner warning">⛵ Hãy điều khiển thuyền cập bến ô <strong>${mon.name}</strong> để mở cổng nhận <strong>${tierMeta.rewardDesc}</strong>!</div>`;
        } else if (!hasMatchingKey || !hasDockingFee) {
            statusNotice = `
                <div class="alert-banner warning">
                    ⚠️ <strong>Điều kiện Mở Cổng &amp; Phí Cập Bến (${tierMeta.name}):</strong><br/>
                    • Chìa khóa yêu cầu: <strong>${tierMeta.keyReq}</strong> (Đang có: Key ${tier}: ${p.keys[tier] || 0}/1)<br/>
                    • Phí cập bến: <strong>${tierMeta.foodCost} Lương thực ${tierMeta.ironCost ? `+ ${tierMeta.ironCost} Sắt ` : ''}+ ${tierMeta.coinCost} Xu</strong>
                    (Hiện có: ${p.food} Lương thực, ${p.iron} Sắt, ${p.coins} Xu)<br/>
                    • Phần thưởng khi giải đúng: <strong>${tierMeta.rewardDesc}</strong><br/>
                    • Cơ chế phòng vệ cổ đại: <strong>${tierMeta.trapDesc}</strong>
                </div>
            `;
        } else {
            statusNotice = `
                <div class="alert-banner success">
                    ✅ <strong>Đủ điều kiện mở cổng (${tierMeta.name}):</strong> Phí <strong>${tierMeta.foodCost} Lúa ${tierMeta.ironCost ? `+ ${tierMeta.ironCost} Sắt ` : ''}+ ${tierMeta.coinCost} Xu + 1 Key ${tier}</strong> • Thưởng: <strong>${tierMeta.rewardDesc}</strong>
                </div>
            `;
        }

        const html = `
            <div class="modal-header-badge" style="background:${tierMeta.color}33; border-color:${tierMeta.color}">
                <span>🏛️ DI TÍCH LỊCH SỬ – ĐỊA LÝ: ${tierMeta.name}</span>
                <span class="badge-tag">${mon.province} (${tile.region.name})</span>
            </div>

            <div class="monument-showcase-layout">
                <div class="monument-photo-frame">
                    <img src="${mon.image}" alt="${mon.name}" class="monument-real-img atlas-zoomable-img"
                         title="Bấm để phóng to hình ảnh &amp; xem nguồn gốc"
                         onclick="window.GAME && window.GAME.openAtlasLightboxByMonument('${mon.id}')" />
                    <div class="photo-caption">
                        <div>📸 <strong>Ảnh thực tế:</strong> ${mon.name} (${mon.province})</div>
                        <div class="copyright-cite-box">
                            ${(mon.photoAuthor || mon.photoLicense) ? `<div>✍️ ${[mon.photoAuthor, mon.photoLicense].filter(Boolean).join(" • ")}</div>` : ""}
                            ${(mon.photoSourceUrl && /^https?:\/\//i.test(mon.photoSourceUrl)) ? `<div>🔗 <strong>Trang nguồn gốc:</strong> <a href="${mon.photoSourceUrl}" target="_blank" rel="noopener noreferrer" class="cite-link">${mon.photoSourceUrl} ↗</a></div>` : ""}
                            ${(mon.articleSourceCite || mon.sourceCite) ? `<div>📰 ${mon.articleSourceCite || mon.sourceCite}</div>` : ""}
                        </div>
                    </div>
                </div>

                <div class="monument-lore-column">
                    <h2 class="modal-title" style="margin-top:0">${mon.name}</h2>
                    <div class="npc-storyteller-card">
                        <div class="npc-avatar">🧓</div>
                        <div>
                            <div style="font-weight:700; color:#e5c365">${mon.npcName} – ${mon.npcRole}</div>
                            <div style="font-size:12.5px; color:#d8e1e8; margin-top:2px">
                                "Di tích ${mon.name} trong ván này có độ khó <strong>${tierMeta.name}</strong> (${tierMeta.trapDesc}). Hãy đọc kỹ hồ sơ Địa lý chính thống dưới đây trước khi bước vào khảo nghiệm!"
                            </div>
                        </div>
                    </div>

                    <div class="geography-lesson-card">
                        <div class="lesson-headline">📘 ${mon.geographyLesson.headline}</div>
                        <p class="lesson-summary">${mon.geographyLesson.summary}</p>
                        <ul class="lesson-bullets">
                            ${mon.geographyLesson.keyFacts.map(f => `<li>${f}</li>`).join("")}
                        </ul>
                        <div class="lesson-source-footer">
                            📚 <strong>Trích dẫn học thuật &amp; Báo chí:</strong> ${mon.sourceCite}
                        </div>
                    </div>
                </div>
            </div>

            ${statusNotice}

            <div class="modal-actions" style="justify-content:space-between">
                <button class="btn-secondary" onclick="window.GAME.closeModal()">Đóng Cửa Sổ</button>
                ${canChallenge ? `
                    <button class="btn-primary-gold" onclick="window.GAME.startMonumentChallenge('${tile.monumentId}')">
                        🗝️ Nộp Phí &amp; Giải Đố Cấp ${tier} (+${tierMeta.rewardPoints} ⭐ Điểm &amp; +${tierMeta.rewardCoins} Xu)
                    </button>
                ` : ''}
            </div>
        `;
        this.currentMonumentTile = tile;
        this.showModal(html);
    }

    startMonumentChallenge(monumentId) {
        if (!this.isMyTurn()) return;
        const tile = this.currentMonumentTile;
        const p = this.getActivePlayer();
        const mon = window.GAME_DATA.monuments.find(m => m.id === monumentId);
        const tier = tile.monumentTier;

        if (tier >= 2 && this.isEarlyGameMonumentLockActive()) {
            this.showToast("🔒 Di tích Cấp 2–3 đang khai quật — Mở lúc 08:30!");
            return;
        }
        if (tier === 1 && (p.tier1Visited || 0) >= 1) {
            this.showToast("⛔ Mỗi người chơi chỉ được chinh phục Trạm Bước Đệm Cấp 1 tối đa 1 lần!");
            return;
        }

        const tierMeta = {
            1: { foodCost: 1, ironCost: 0, coinCost: 2, rewardCoins: 4, rewardPoints: 1, trapName: "🏹 Bẫy Mũi Tên (-1 HP)" },
            2: { foodCost: 2, ironCost: 0, coinCost: 3, rewardCoins: 4, rewardPoints: 3, trapName: "🪨 Bẫy Đá Lăn (-2 HP)" },
            3: { foodCost: 3, ironCost: 1, coinCost: 6, rewardCoins: 5, rewardPoints: 5, trapName: "⚡🪨 Bẫy Sét Đánh & Đá Lăn (-3 HP)" }
        }[tier];

        this.spendInteractiveAP(p);
        p.keys[tier] = Math.max(0, (p.keys[tier] || 0) - 1);
        p.food -= tierMeta.foodCost;
        p.iron -= tierMeta.ironCost;
        p.coins -= tierMeta.coinCost;
        if (tier === 1) {
            p.tier1Visited = (p.tier1Visited || 0) + 1;
        }
        this.updateUI();

        const tierPool = (mon.tieredQuizzes && mon.tieredQuizzes[tier]) ? mon.tieredQuizzes[tier] : mon.tieredQuizzes[1];
        const rawQuiz = tierPool[Math.floor(Math.random() * tierPool.length)];
        const quiz = this.prepareShuffledQuiz(rawQuiz);

        this.pendingMonumentQuiz = { tile, mon, tier, tierMeta, quiz };

        // Broadcast Monument Quiz live to all players in the room!
        this.liveQuizState = {
            id: "qz_mon_" + Date.now(),
            phase: "asking",
            actorId: p.id,
            actorName: p.name,
            badgeColor: "#c59b27",
            badgeTitle: `👑 KHẢO NGHIỆM DI TÍCH CẤP ${tier}: ${mon.name.toUpperCase()}`,
            title: `${p.name} Đang Chinh Phục Bảo Vật Tại ${mon.name}`,
            desc: `Thử thách Cấp ${tier} tại ${mon.province}. Chỉ ${p.name} mới có quyền chọn đáp án; các thuyền trưởng khác cùng theo dõi trực tiếp!`,
            quiz,
            chosenIdx: null,
            outcomeTitle: null
        };
        this.syncMultiplayerGameState();

        const html = `
            <div class="modal-header-badge" style="background:#b8862d33; border-color:#c59b27">
                <span>👑 KHẢO NGHIỆM DI TÍCH (CẤP ${tier}): ${mon.name.toUpperCase()}</span>
                <span id="active-quiz-countdown" class="quiz-countdown-pill">⏱️ 01:00</span>
            </div>
            <h2 class="modal-title">${mon.npcName} Đặt Câu Hỏi Địa Lý Cấp ${tier}</h2>
            <p class="modal-desc">
                Trả lời chính xác câu hỏi Cấp ${tier} trong <strong>60 giây</strong> để nhận ngay <strong>+${tierMeta.rewardPoints || (tier === 1 ? 1 : (tier === 2 ? 3 : 5))} ⭐ Điểm Thịnh Vượng</strong> và <strong>+${tierMeta.rewardCoins} Xu Vàng</strong>!<br/>
                <span style="color:#fca5a5; font-weight:700">⚠️ CẢNH BÁO CƠ QUAN PHÒNG VỆ DI TÍCH (${tierMeta.trapName}):</span> Nếu trả lời SAI hoặc HẾT GIỜ, cơ quan bẫy cổ đại sẽ kích hoạt khiến thuyền mất <strong>-${tier} HP</strong>!
            </p>
            <div class="quiz-box">
                <div class="quiz-question">❓ ${quiz.q}</div>
                <div class="quiz-options">
                    ${quiz.options.map((opt, idx) => `
                        <button class="quiz-opt-btn" onclick="window.GAME.resolveMonumentChallenge(${idx}, false)">
                            <span class="opt-letter">${String.fromCharCode(65 + idx)}</span>
                            <span>${opt}</span>
                        </button>
                    `).join("")}
                </div>
            </div>
        `;
        this.startPendingQuiz({
            type: "monument",
            html,
            durationSec: 60,
            onTimeout: () => this.resolveMonumentChallenge(-1, true)
        });
    }

    resolveMonumentChallenge(chosenIdx, isTimeout = false) {
        const ctx = this.pendingMonumentQuiz;
        if (!ctx) return;
        this.pendingMonumentQuiz = null;
        this.clearPendingQuiz();
        const { tile, mon, tier, tierMeta, quiz } = ctx;
        const p = this.getActivePlayer();
        const isCorrect = !isTimeout && (chosenIdx === quiz.correct);
        p.quizTotal = (p.quizTotal || 0) + 1;
        if (isCorrect) p.quizCorrect = (p.quizCorrect || 0) + 1;
        this.recordQuizStreak(p, isCorrect);

        if (this.liveQuizState) {
            this.liveQuizState.phase = "answered";
            this.liveQuizState.chosenIdx = chosenIdx;
            this.liveQuizState.outcomeTitle = isCorrect
                ? `👑 ${p.name} Chinh Phục Thành Công [${mon.relicIcon} ${mon.relicName}]!`
                : `💥 ${p.name} Kích Hoạt Bẫy Cổ Đại Tại ${mon.name} (-${tier} HP)`;
        }

        if (isCorrect) {
            this.recordSecretQuestProgress(p, "quiz_correct");
            const rewardPts = tierMeta.rewardPoints || (tier === 1 ? 1 : (tier === 2 ? 3 : 5));
            p.prosperityPoints = (p.prosperityPoints || 0) + rewardPts;
            p.coins = Math.min(30, p.coins + tierMeta.rewardCoins);
            p.relics.push({ id: mon.id, name: mon.relicName, icon: mon.relicIcon, monumentName: mon.name, tier });

            let tier1BonusText = "";
            // Mục 3B-1: Chinh phục thành công BẤT KỲ Di tích đầu tiên nào (Cấp 1/2/3) đều nâng vĩnh viễn kho 12->16 ô (1 lần duy nhất)
            if ((p.maxCargo || 12) < 16) {
                p.maxCargo = 16;
                tier1BonusText += " • 📦 Nâng khoang tàu vĩnh viễn 12→16 ô!";
            }
            if (tier === 1) {
                if ((p.keys[2] || 0) < 1) {
                    p.keys[2] = 1;
                    tier1BonusText += " • 🗝️ Tặng 1 Key 2!";
                } else {
                    p.coins = Math.min(30, p.coins + 3);
                    tier1BonusText += " • 💰 Đổi Key 2 trùng thành +3 Xu!";
                }
            }

            if (tier === 3) {
                tile.monumentLocked = true;
            }
            tile.monumentConqueror = { name: p.name, color: p.color };
            // KEY-1: Quét & khóa tức thì Key cấp tương ứng nếu toàn bộ Di tích cấp này vừa bị chinh phục hết!
            this.checkAndNotifyExhaustedMonumentTier(tier);
            this.syncMonumentVisuals3D();

            window.SFX.playRelicFanfare();
            this.world.triggerBurstAnimation(tile.q, tile.r, 0xd4af37, 36);
            this.logEvent(`⭐ CHIẾN CÔNG LỊCH SỬ! ${p.name} chinh phục [${mon.name} - Cấp ${tier}], nhận +${rewardPts} Điểm Thịnh Vượng (Tổng: ${p.prosperityPoints}/15 ⭐) & +${tierMeta.rewardCoins} Xu${tier1BonusText}`);

            if (this.getTotalProsperity(p) >= 15) {
                this.matchWinner = p;
                this.updateUI();
                this.syncMultiplayerGameState();
                this.showVictoryScreen(p, quiz, chosenIdx);
                return;
            }

            const html = `
                <div class="modal-header-badge" style="background:#2e6f4033; border-color:#4b9b68">
                    <span>⭐ CHINH PHỤC DI TÍCH THÀNH CÔNG! (+${rewardPts} ĐIỂM • TỔNG ${p.prosperityPoints}/15 ⭐)</span>
                    <span class="badge-tag">⏱️ Tự đóng <span id="quiz-autoclose-sec">10</span>s</span>
                </div>
                <h2 class="modal-title">${mon.relicIcon} ${mon.name}: +${rewardPts} ⭐ Điểm Thịnh Vượng &amp; +${tierMeta.rewardCoins} Xu!</h2>
                ${tier1BonusText ? `<div class="alert-banner success" style="margin-bottom:8px">🎁 <strong>Thưởng Trạm Bước Đệm Cấp 1:</strong>${tier1BonusText}</div>` : ''}
                ${this.renderQuizVisualMemoryCard(quiz, chosenIdx)}
                <div class="modal-actions" style="justify-content:space-between">
                    <span style="font-size:12px; color:#fbbf24; font-weight:700">⏳ Tự động đóng sau <span id="quiz-autoclose-sec-sub">10</span> giây...</span>
                    <button class="btn-primary-gold" onclick="window.GAME.closeQuizResultNow()">✕ Đóng Ngay Lập Tức</button>
                </div>
            `;
            this.showModal(html);
            this.startQuizResultAutoCloseTimer(10);
        } else {
            // Trigger 3D Monument Trap Animation (Tier 1: Arrow Volley, Tier 2: Rolling Boulders, Tier 3: Lightning + Boulders)
            this.world.triggerMonumentTrapEffect(tile.q, tile.r, tier);

            const trapLabels = {
                1: "🏹 Bẫy Mũi Tên Cổ Đại (Di tích Cấp 1 - Easy)",
                2: "🪨 Bẫy Đá Lăn Sườn Núi (Di tích Cấp 2 - Medium)",
                3: "⚡🪨 Bẫy Sét Đánh & Đá Lăn (Di tích Cấp 3 - Hard)"
            };
            const trapName = trapLabels[tier] || "Bẫy Di Tích";

            this.applyPlayerDamage(p, tier, `${trapName} tại ${mon.name}`);
            if (tier === 3 && !p.eliminated) {
                this.pushShipBack(p);
            }

            const penaltyDesc = `💥 <strong>${trapName} đã kích hoạt!</strong> Thuyền của bạn chịu phạt <strong>-${tier} ❤️ HP</strong> (Hiện còn ${p.hp}/${p.maxHp} HP)${tier === 3 ? ' và bị sóng xung kích đẩy lùi ra biển' : ''}!`;

            const html = `
                <div class="modal-header-badge" style="background:#8c2d2d33; border-color:#c95b5b">
                    <span>💥 CƠ QUAN BẪY DI TÍCH KÍCH HOẠT (-${tier} HP) — XEM ĐÁP ÁN ĐÚNG</span>
                    <span class="badge-tag">⏱️ Tự đóng <span id="quiz-autoclose-sec">10</span>s</span>
                </div>
                <h2 class="modal-title">Ghi Nhớ Kiến Thức Địa Lý Tại ${mon.name}</h2>
                <p class="modal-desc">${penaltyDesc}</p>
                ${this.renderQuizVisualMemoryCard(quiz, chosenIdx)}
                <div class="modal-actions" style="justify-content:space-between">
                    <span style="font-size:12px; color:#fbbf24; font-weight:700">⏳ Tự động đóng sau <span id="quiz-autoclose-sec-sub">10</span> giây...</span>
                    <button class="btn-primary-gold" onclick="window.GAME.closeQuizResultNow()">✕ Đóng Ngay Lập Tức</button>
                </div>
            `;
            this.showModal(html);
            this.startQuizResultAutoCloseTimer(10);
        }

        this.updateUI();
        this.syncMultiplayerGameState();
    }

    pushShipBack(player) {
        const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        for (const [dq, dr] of dirs) {
            const adj = this.world.hexMap.get(`${player.q + dq},${player.r + dr}`);
            if (adj && adj.navigable && adj.terrain === "sea") {
                player.q = adj.q;
                player.r = adj.r;
                this.world.animateShipAlongPath(player, [adj], player.id, this.players.length);
                break;
            }
        }
    }

    // ------------------------------------------------------------------------
    // VII. IN-GAME CLOCK, PHASED WEATHER TIMELINE, GIÔNG BÃO READING & YAGI QUIZ
    // ------------------------------------------------------------------------
    startMatchClockAndWeatherEngine() {
        clearInterval(this.matchClockInterval);
        this.updateClockAndTickerUI();
        this.matchClockInterval = setInterval(() => {
            this.tickMatchClockAndWeather();
        }, 1000);
    }

    getWeatherPhaseMeta(phaseKey) {
        const map = {
            sunny: {
                key: "sunny",
                label: "☀️ Nắng Biển Đông",
                timeRange: "00:00–15:00",
                effectText: "Biển êm (1 AP = 2 ô • Tối đa 6 ô/lượt)",
                nextLabel: "🌧️ Mưa Nhiệt Đới lúc 15:00"
            },
            tropical_rain: {
                key: "tropical_rain",
                label: "🌧️ Mưa Nhiệt Đới",
                timeRange: "15:00–20:00",
                effectText: "Mưa rào cảnh báo trước Giông Bão (1 AP = 2 ô)",
                nextLabel: "⛈️ Giông Bão lúc 20:00"
            },
            thunderstorm: {
                key: "thunderstorm",
                label: "⛈️ Giông Bão",
                timeRange: "20:00–27:00",
                effectText: "Đọc hiểu 1p30s (Sai/Hết giờ -2 HP) • Cấm vào 4 ô tài nguyên!",
                nextLabel: "🌅 Hoàng Hôn lúc 27:00"
            },
            sunset: {
                key: "sunset",
                label: "🌅 Hoàng Hôn",
                timeRange: "27:00–29:00",
                effectText: "Khai thác dễ dàng hơn: Giảm 1 vòng hồi tài nguyên!",
                nextLabel: "🌌 Đêm Sao lúc 29:00"
            },
            night: {
                key: "night",
                label: "🌌 Đêm Sao",
                timeRange: "29:00–34:00",
                effectText: "Đêm thuận lợi: Giảm 1 vòng hồi tài nguyên!",
                nextLabel: "🌀 Siêu Bão Yagi lúc 34:00"
            },
            super_typhoon_yagi: {
                key: "super_typhoon_yagi",
                label: "🌀 Siêu Bão Yagi",
                timeRange: "34:00–45:00",
                effectText: "BÁO ĐỘNG ĐỎ: 1 AP = 1 ô • Hết 4 AP hỏi Quiz (Đúng +1 Xu, Sai sét đánh -1/-2/-3 HP)!",
                nextLabel: "🏁 Cuối trận (45:00)"
            }
        };
        return map[phaseKey] || map.sunny;
    }

    computePhaseKeyFromElapsed(sec) {
        if (sec < 900) return "sunny";               // 00:00 - 15:00
        if (sec < 1200) return "tropical_rain";      // 15:00 - 20:00
        if (sec < 1620) return "thunderstorm";       // 20:00 - 27:00 (7 mins)
        if (sec < 1740) return "sunset";             // 27:00 - 29:00 (2 mins)
        if (sec < 2040) return "night";              // 29:00 - 34:00 (5 mins)
        return "super_typhoon_yagi";                 // 34:00 - 45:00 (11 mins)
    }

    tickMatchClockAndWeather() {
        if (!this.isGameStarted || this.matchWinner) return;

        // Mục 4D (Chỉ chạy ở chế độ PvP — tự tắt ở Sandbox):
        // 1) Đóng băng đồng hồ trận 45:00 nếu đứng yên quá 45s chưa có hành động gameplay thực tế
        // 2) Phát hiện AFK 50s (45s không tương tác + 5s cảnh báo trực diện -> Tàu Máy tạm tiếp quản)
        const now = Date.now();
        const activeP = this.getActivePlayer();
        const isPvPActiveHumanTurn = Boolean(
            !this.sandboxMode &&
            !this.isPreGameCountingDown &&
            this.roomState.status !== "turn_order_quiz" &&
            activeP &&
            !activeP.isAI &&
            !activeP.eliminated
        );

        if (isPvPActiveHumanTurn) {
            if (this.hasActiveUnansweredQuiz()) {
                // Tạm dừng bộ đếm AFK & không đóng băng khi đang đọc/trả lời Quiz 60s/90s
                this.lastInteractionAt = now;
                this.lastGameplayActionAt = now;
                this.isMatchClockFrozen = false;
                this.hideAfkWarningBanner();
            } else {
                // Bộ đếm 2: Đóng băng đồng hồ 45:00 sau 45s chưa có hành động thực tế (dù vẫn bấm UI)
                const gameplayIdleSec = (now - (this.lastGameplayActionAt || now)) / 1000;
                this.isMatchClockFrozen = gameplayIdleSec >= 45;

                // Bộ đếm 1: AFK tổng 50s (chỉ cảnh báo & tự tiếp quản trên máy của chính người chơi đang tới lượt)
                if (this.isMyTurn()) {
                    const uiIdleSec = (now - (this.lastInteractionAt || now)) / 1000;
                    if (uiIdleSec >= 50) {
                        this.triggerAfkBotTakeover(activeP);
                    } else if (uiIdleSec >= 45) {
                        const secLeft = Math.max(1, Math.ceil(50 - uiIdleSec));
                        this.afkWarningRemainingSec = secLeft;
                        const banner = document.getElementById("afk-warning-banner");
                        const txt = document.getElementById("afk-warning-text");
                        if (txt) {
                            txt.textContent = `⚠️ BẠN ĐANG ĐỨNG YÊN! Tàu Máy sẽ tạm tiếp quản sau ${secLeft}s — Bấm nút hoặc thao tác bất kỳ để tiếp tục`;
                        }
                        if (banner) banner.classList.remove("hidden");
                    } else if (this.afkWarningRemainingSec !== null) {
                        this.hideAfkWarningBanner();
                    }
                }
            }
        } else {
            this.isMatchClockFrozen = false;
            if (this.afkWarningRemainingSec !== null) this.hideAfkWarningBanner();
        }

        if (!this.isMatchClockFrozen) {
            this.matchElapsedSec = (this.matchElapsedSec || 0) + 1;
            this.portResetRemainingSec = Math.max(0, (this.portResetRemainingSec || this.portResetIntervalSec) - 1);
            this.portResResetRemainingSec = Math.max(0, (this.portResResetRemainingSec || this.portResResetIntervalSec) - 1);
        }

        // Đúng chu kỳ 05:00 (300s): Tự động nhập lô tài nguyên giới hạn mới tại 6 Thương Cảng (độc lập với 08:30 Key)!
        if (this.portResResetRemainingSec <= 0) {
            this.portResResetRemainingSec = this.portResResetIntervalSec || 300;
            if (!this.roomState.code || this.roomState.isHost) {
                this.resetAllPortResourceStocks(true);
                this.syncMultiplayerGameState();
            }
        }

        // Đúng phút 08:30 (510s): Mở khóa toàn bộ 7 Di tích Cấp 2–3 & làm mới Key khan hiếm tại 6 Cảng!
        if (!this.earlyLockReleased && this.matchElapsedSec >= 510) {
            this.earlyLockReleased = true;
            this.syncMonumentVisuals3D();
            const unlockMsg = "🔓 [08:30] Toàn bộ 7 Di tích Cấp 2–3 đã hoàn tất khai quật & 6 Thương Cảng mở đợt phân bổ Key 1–2–3!";
            this.logEvent(unlockMsg);
            this.addTradeBulletinNotice(unlockMsg);
            if (!this.roomState.code || this.roomState.isHost) {
                this.resetAllPortInventories(true);
                this.syncMultiplayerGameState();
            } else {
                this.showToast(unlockMsg);
                this.updateUI();
            }
        }

        if (this.portResetRemainingSec <= 0) {
            this.portResetRemainingSec = this.portResetIntervalSec;
            if (!this.roomState.code || this.roomState.isHost) {
                this.resetAllPortInventories(true);
                this.syncMultiplayerGameState();
            }
        }

        const expectedPhase = this.computePhaseKeyFromElapsed(this.matchElapsedSec);
        if (expectedPhase !== this.currentWeatherPhase) {
            this.applyWeatherPhase(expectedPhase, true);
        }

        // Mục 4C: Cảnh báo đúng mốc còn 05:00 cuối trận (2400s / 2700s)
        const remainingSec = Math.max(0, 2700 - this.matchElapsedSec);
        if (remainingSec <= 300 && remainingSec > 0 && !this.finalFiveMinNotified) {
            this.finalFiveMinNotified = true;
            const sprintMsg = "⏳ 5 PHÚT CUỐI TRẬN! Dồn lực cán mốc 15 ⭐ Thịnh Vượng hoặc tối ưu tổng điểm!";
            this.logEvent(sprintMsg);
            this.addTradeBulletinNotice(sprintMsg);
            this.showToast(sprintMsg);
        }

        // Hết giờ 45:00 (2700s): Dừng mọi lượt đi, đóng Quiz/Cảng/Chợ, lật toàn bộ Điểm Bí Mật & phá hòa 4 tầng!
        if (this.matchElapsedSec >= 2700 && (!this.sandboxMode || this.sandboxAllowTimeout) && !this.victoryShownForMatch) {
            this.sandboxAllowTimeout = false;
            this.isBusy = true;
            clearTimeout(this.autoEndTurnTimer);
            this.cancelLockedMovePath(false);
            if (typeof this.clearActivePendingQuiz === "function") {
                this.clearActivePendingQuiz();
            } else {
                this.activePendingQuiz = null;
            }
            this.closeModal();

            const ranked = [...this.players].sort((a, b) => this.comparePlayersForRanking(a, b, true));
            const topWinner = ranked[0];
            if (topWinner) {
                this.matchWinner = topWinner;
                this.logEvent(`⏱️ HẾT GIỜ 45:00! Lật toàn bộ Điểm Bí Mật — ${topWinner.name} dẫn đầu với ${this.getTotalProsperity(topWinner)} ⭐ Điểm Thịnh Vượng và giành chiến thắng!`);
                this.updateUI();
                this.syncMultiplayerGameState();
                this.showVictoryScreen(topWinner, null, null, "timeout");
                return;
            }
        }

        this.updateClockAndTickerUI();
    }

    // ------------------------------------------------------------------------
    // MỤC 4B: FAIR 4-MINE STORM BLOCKADE (NEVER LOCKS 100% OF ANY TYPE, SPREAD ACROSS MAP)
    // ------------------------------------------------------------------------
    isMineBlockedByStorm(tile) {
        if (!tile || !tile.resourceType) return false;
        if (tile.stormRestricted) return true;
        return Array.isArray(this.blockedMineIds) && this.blockedMineIds.includes(`${tile.q},${tile.r}`);
    }

    triggerStormMineBlockade(notify = true) {
        if (!this.world || !Array.isArray(this.world.hexTiles)) return [];
        const allMines = this.world.hexTiles.filter(t => Boolean(t.resourceType));
        allMines.forEach(t => { t.stormRestricted = false; });

        const totalByType = { food: 0, wood: 0, iron: 0 };
        allMines.forEach(t => {
            if (totalByType[t.resourceType] !== undefined) totalByType[t.resourceType]++;
        });

        // Shuffle all resource mines
        const pool = [...allMines];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const getMacroZone = (regId) => (regId <= 1 ? "north" : (regId <= 3 ? "central" : "south"));
        const picked = [];
        const pickedByType = { food: 0, wood: 0, iron: 0 };
        const pickedByZone = { north: 0, central: 0, south: 0 };

        const canPick = (mine, maxPerType, maxPerZone) => {
            const tp = mine.resourceType;
            const total = totalByType[tp] || 0;
            // Tuyệt đối KHÔNG phong tỏa sạch 100% bất kỳ loại tài nguyên nào (luôn giữ >= 1 mỏ mở cho mỗi loại)
            if ((total - (pickedByType[tp] + 1)) < 1) return false;
            if (pickedByType[tp] >= maxPerType) return false;
            const z = getMacroZone(mine.regionId || 0);
            if (pickedByZone[z] >= maxPerZone) return false;
            return true;
        };

        // Pass 1 (Chuẩn 2-2-2 & rải đều 3 miền Bắc / Trung / Nam: tối đa 2 mỏ/loại & 2 mỏ/miền)
        for (const mine of pool) {
            if (picked.length >= 6) break;
            if (!canPick(mine, 2, 2)) continue;
            picked.push(mine);
            pickedByType[mine.resourceType]++;
            pickedByZone[getMacroZone(mine.regionId || 0)]++;
        }
        // Pass 2: giữ 2 mỏ/loại, nới giới hạn miền lên 3 nếu 1 miền có nhiều mỏ
        if (picked.length < 6) {
            for (const mine of pool) {
                if (picked.length >= 6) break;
                if (picked.includes(mine)) continue;
                if (!canPick(mine, 2, 3)) continue;
                picked.push(mine);
                pickedByType[mine.resourceType]++;
                pickedByZone[getMacroZone(mine.regionId || 0)]++;
            }
        }
        // Pass 3 (bù sang loại còn dư nhiều mỏ nếu 1 loại có quá ít mỏ, vẫn giữ >= 1 mỏ mở cho mọi loại!)
        if (picked.length < 6) {
            for (const mine of pool) {
                if (picked.length >= 6) break;
                if (picked.includes(mine)) continue;
                if (!canPick(mine, 6, 6)) continue;
                picked.push(mine);
                pickedByType[mine.resourceType]++;
                pickedByZone[getMacroZone(mine.regionId || 0)]++;
            }
        }

        picked.forEach(t => { t.stormRestricted = true; });
        this.blockedMineIds = picked.map(t => `${t.q},${t.r}`);
        this.world.updateResourceVisuals();

        if (notify && picked.length > 0 && this.isGameStarted) {
            const msg = "⛈️ GIÔNG BÃO ĐỔ BỘ! 6 mỏ tài nguyên đang bị phong tỏa tạm thời — Hãy chuyển hướng khai thác hoặc giao dịch trên Chợ P2P!";
            this.logEvent(msg);
            this.addTradeBulletinNotice(msg);
            this.showToast(msg);
        }
        if (!this.roomState.code || this.roomState.isHost) {
            this.syncMultiplayerGameState();
        }
        return this.blockedMineIds;
    }

    clearStormMineBlockade(notify = true) {
        const hadBlocked = Array.isArray(this.blockedMineIds) && this.blockedMineIds.length > 0;
        this.blockedMineIds = [];
        if (this.world && Array.isArray(this.world.hexTiles)) {
            this.world.hexTiles.forEach(t => { t.stormRestricted = false; });
            this.world.updateResourceVisuals();
        }
        if (notify && hadBlocked && this.isGameStarted) {
            const msg = "☀️ Giông bão đã tan — Toàn bộ mỏ tài nguyên hoạt động trở lại bình thường!";
            this.logEvent(msg);
            this.addTradeBulletinNotice(msg);
            this.showToast(msg);
        }
        if (hadBlocked && (!this.roomState.code || this.roomState.isHost)) {
            this.syncMultiplayerGameState();
        }
    }

    applyWeatherPhase(phaseKey, notify = true) {
        const prevPhase = this.currentWeatherPhase;
        if ((prevPhase === "thunderstorm" || prevPhase === "super_typhoon_yagi") && phaseKey !== prevPhase) {
            (this.players || []).forEach(pl => {
                if (!pl.eliminated && !pl.stormDamagedThisPhase) {
                    this.recordSecretQuestProgress(pl, "survive_storm");
                }
            });
        }
        if (phaseKey === "thunderstorm" || phaseKey === "super_typhoon_yagi") {
            (this.players || []).forEach(pl => { pl.stormDamagedThisPhase = false; });
        }
        this.currentWeatherPhase = phaseKey;
        this.world.setWeatherMode(phaseKey);

        const yagiBanner = document.getElementById("yagi-red-alert-banner");
        if (yagiBanner) {
            if (phaseKey === "super_typhoon_yagi") {
                yagiBanner.classList.remove("hidden");
            } else {
                yagiBanner.classList.add("hidden");
            }
        }

        // Mục 4B: Giông Bão / Siêu Bão Yagi -> phong tỏa công bằng 4 mỏ tài nguyên; hết bão -> mở lại toàn bộ!
        if (phaseKey === "thunderstorm" || phaseKey === "super_typhoon_yagi") {
            if (!this.roomState.code || this.roomState.isHost) {
                this.triggerStormMineBlockade(notify);
            }
        } else {
            this.clearStormMineBlockade(notify);
        }

        this.world.updateResourceVisuals();
        this.refreshReachableHexes();

        const meta = this.getWeatherPhaseMeta(phaseKey);
        if (notify) {
            this.logEvent(`🌦️ [THỜI TIẾT CHUYỂN PHA] ${meta.label} (${meta.timeRange}): ${meta.effectText}`);
            this.addTradeBulletinNotice(`🌦️ Thời tiết chuyển sang ${meta.label}: ${meta.effectText}`);
            this.showToast(`🌦️ Thời tiết biển chuyển sang: ${meta.label} — ${meta.effectText}`);
        }

        if (phaseKey === "thunderstorm" && !this.thunderstormChallengeTriggered) {
            this.thunderstormChallengeTriggered = true;
            this.triggerThunderstormReadingChallenge();
        }

        this.updateClockAndTickerUI();
    }

    formatMMSS(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const mm = String(Math.floor(s / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${mm}:${ss}`;
    }

    updateClockAndTickerUI() {
        const clockTimeEl = document.getElementById("hud-clock-time");
        const weatherPhaseEl = document.getElementById("hud-weather-phase");
        const portResetMiniEl = document.getElementById("hud-port-reset-mini");

        const meta = this.getWeatherPhaseMeta(this.currentWeatherPhase);
        const clockStr = this.formatMMSS(this.matchElapsedSec || 0);
        const portResetStr = this.formatMMSS(this.portResetRemainingSec || 0);

        if (clockTimeEl) {
            clockTimeEl.textContent = this.isMatchClockFrozen ? `⏱️ ${clockStr} ⏸️` : `⏱️ ${clockStr}`;
            clockTimeEl.title = this.isMatchClockFrozen
                ? "Đồng hồ trận tạm dừng do tàu chưa hành động quá 45 giây"
                : "Thời gian thực trong ván (45:00)";
            const isFinal5Min = (!this.isMatchClockFrozen && this.matchElapsedSec >= 2400 && this.matchElapsedSec < 2700);
            clockTimeEl.classList.toggle("final-sprint-pulse", isFinal5Min);
        }
        if (weatherPhaseEl) weatherPhaseEl.textContent = meta.label;
        if (portResetMiniEl) portResetMiniEl.textContent = `⚓ Reset: ${portResetStr}`;

        const tickerTrack = document.getElementById("live-ticker-track");
        if (tickerTrack) {
            const resResetStr = this.formatMMSS(this.portResResetRemainingSec || 0);
            const latestTrade = (this.tradeBulletinNotices && this.tradeBulletinNotices[0])
                ? this.tradeBulletinNotices[0].text
                : "Giao thương tự do giữa các thuyền trưởng (0 AP)";

            const tickerMsg = `⏱️ Giờ biển: ${clockStr}/45:00 — Đang ở pha [${meta.label}]: ${meta.effectText} &nbsp;|&nbsp; ⏭️ Sắp tới: ${meta.nextLabel} &nbsp;|&nbsp; 🗝️ Reset Key: ${portResetStr} • 📦 Nhập Tài Nguyên: ${resResetStr} &nbsp;|&nbsp; 📢 ${latestTrade}`;
            if (this._lastTickerSnapshot !== tickerMsg) {
                this._lastTickerSnapshot = tickerMsg;
                tickerTrack.innerHTML = `<span class="ticker-item">${tickerMsg}</span><span class="ticker-item">${tickerMsg}</span>`;
            }
        }
    }

    toggleLiveTicker() {
        window.SFX.playClick();
        const wrap = document.getElementById("bottom-live-ticker-wrap");
        if (!wrap) return;
        this.tickerCollapsed = !this.tickerCollapsed;
        wrap.classList.toggle("collapsed", this.tickerCollapsed);
    }

    // ------------------------------------------------------------------------
    // THUNDERSTORM (⛈️ GIÔNG BÃO) SHARED READING PASSAGE + 1M30S TIMER (-2 HP)
    // ------------------------------------------------------------------------
    triggerThunderstormReadingChallenge() {
        if (!this.isGameStarted || this.matchWinner) return;
        const passages = window.GAME_DATA.stormReadingPassages || [];
        if (passages.length === 0) return;

        const passage = passages[Math.floor(Math.random() * passages.length)];
        const localP = this.getLocalPlayer() || this.getActivePlayer() || this.players[0];
        const qIdx = (localP ? localP.id : 0) % passage.questions.length;
        const rawQ = passage.questions[qIdx];
        const shuffledQuiz = this.prepareShuffledQuiz({
            ...rawQ,
            visualImg: "assets/monuments/halong.jpg",
            visualCaption: passage.title,
            visualCredit: passage.source
        });

        this.pendingStormReading = {
            passage,
            shuffledQuiz,
            targetPlayer: localP,
            answered: false
        };

        clearInterval(this.stormReadingTimerInterval);

        const html = `
            <div class="modal-header-badge" style="background:rgba(185,28,28,0.28); border-color:#f87171">
                <span>⛈️ THỬ THÁCH ĐỌC HIỂU GIÔNG BÃO TOÀN BẢN ĐỒ (4 Ô TÀI NGUYÊN ĐANG BỊ PHONG TỎA)</span>
                <span id="active-quiz-countdown" class="quiz-countdown-pill">⏱️ 01:30</span>
            </div>
            <h2 class="modal-title">${passage.title}</h2>
            <p class="modal-desc">
                ⛈️ <strong>Giông Bão đang đổ bộ trên toàn vùng biển!</strong> Toàn bộ người chơi cùng đọc văn bản Địa lý dưới đây, nhưng <strong>mỗi thuyền trưởng nhận 1 câu hỏi riêng biệt</strong> trong thời gian <strong>1 phút 30 giây</strong>. Nếu trả lời <strong>SAI hoặc HẾT GIỜ</strong>, thuyền sẽ bị <strong>Sét Đánh (-2 ❤️ HP)</strong>!
            </p>
            <div class="storm-passage-box">
                <div class="storm-passage-title">📖 Tư Liệu Đọc Hiểu Chung Toàn Bản Đồ:</div>
                <div>${passage.passage}</div>
                <div style="font-size:11px; color:#94a3b8; margin-top:6px">📚 Nguồn trích dẫn: ${passage.source}</div>
            </div>
            <div class="quiz-box">
                <div class="quiz-question">❓ Câu hỏi dành riêng cho thuyền ${localP ? localP.name : 'của bạn'}: ${shuffledQuiz.q}</div>
                <div class="quiz-options">
                    ${shuffledQuiz.options.map((opt, idx) => `
                        <button class="quiz-opt-btn" onclick="window.GAME.resolveThunderstormReadingQuiz(${idx}, false)">
                            <span class="opt-letter">${String.fromCharCode(65 + idx)}</span>
                            <span>${opt}</span>
                        </button>
                    `).join("")}
                </div>
            </div>
        `;
        // GIỮ NGUYÊN 90 GIÂY (1 phút 30 giây) cho Quiz Đọc Hiểu Giông Bão!
        this.startPendingQuiz({
            type: "storm_reading",
            html,
            durationSec: 90,
            onTimeout: () => this.resolveThunderstormReadingQuiz(-1, true)
        });
    }

    resolveThunderstormReadingQuiz(chosenIdx, isTimeout = false) {
        clearInterval(this.stormReadingTimerInterval);
        this.clearPendingQuiz();
        const ctx = this.pendingStormReading;
        if (!ctx || ctx.answered) return;
        ctx.answered = true;

        const { shuffledQuiz, targetPlayer } = ctx;
        const p = targetPlayer || this.getLocalPlayer() || this.getActivePlayer();
        const isCorrect = !isTimeout && (chosenIdx === shuffledQuiz.correct);

        if (isCorrect) {
            window.SFX.playCoin();
            if (p) this.world.triggerBurstAnimation(p.q, p.r, 0x38bdf8, 22);
            this.logEvent(`⛈️ ${p ? p.name : 'Thuyền trưởng'} vượt qua bài Đọc Hiểu Giông Bão an toàn!`);
        } else {
            if (p) {
                this.world.triggerLightningStrikeEffect(p.q, p.r);
                this.applyPlayerDamage(p, 2, isTimeout ? "Hết giờ (1p30s) đọc hiểu Giông Bão ⛈️" : "Trả lời sai đọc hiểu Giông Bão ⛈️");
            }
        }

        const html = `
            <div class="modal-header-badge" style="background:${isCorrect ? '#2e6f4033' : '#8c2d2d33'}; border-color:${isCorrect ? '#4b9b68' : '#c95b5b'}">
                <span>${isCorrect ? '✅ VƯỢT QUA GIÔNG BÃO AN TOÀN!' : '⚡ SÉT ĐÁNH GIÔNG BÃO (-2 HP)!'}</span>
                <span class="badge-tag">⏱️ Tự đóng <span id="quiz-autoclose-sec">10</span>s</span>
            </div>
            <h2 class="modal-title">
                ${isCorrect
                    ? 'Chính Xác! Thuyền Của Bạn Vững Vàng Vượt Qua Cơn Giông!'
                    : (isTimeout ? 'Hết Thời Gian 1 Phút 30 Giây — Sét Đánh Trúng Thuyền (-2 HP)!' : 'Chưa Chính Xác — Sét Đánh Trúng Thuyền (-2 HP)!')}
            </h2>
            ${this.renderQuizVisualMemoryCard(shuffledQuiz, isTimeout ? -1 : chosenIdx)}
            <div class="modal-actions" style="justify-content:space-between">
                <span style="font-size:12px; color:#fbbf24; font-weight:700">⏳ Tự động đóng sau <span id="quiz-autoclose-sec-sub">10</span> giây...</span>
                <button class="btn-primary-gold" onclick="window.GAME.closeQuizResultNow()">✕ Đóng Ngay Lập Tức</button>
            </div>
        `;
        this.showModal(html);
        this.startQuizResultAutoCloseTimer(10);
        this.updateUI();
        this.syncMultiplayerGameState();
    }

    // ------------------------------------------------------------------------
    // SUPER TYPHOON YAGI (🌀 SIÊU BÃO YAGI) MANDATORY QUIZ AFTER 4 AP SPENT
    // - Correct: +1 Coin (max 15)
    // - Wrong: Stacking Lightning Strike (-1 HP -> -2 HP -> -3 HP max)
    // ------------------------------------------------------------------------
    triggerYagiTurnQuiz(player) {
        if (!player || player.yagiQuizTriggeredThisTurn) return;
        player.yagiQuizTriggeredThisTurn = true;

        const rawQuiz = this.pickRandomOpeningSpeedQuiz();
        this.pendingYagiQuiz = { player, quiz: rawQuiz };
        const nextWrongDmg = Math.min(3, (player.yagiWrongCount || 0) + 1);

        const html = `
            <div class="modal-header-badge" style="background:rgba(220,38,38,0.32); border-color:#ef4444">
                <span>🌀 KHẢO NGHIỆM SINH TỒN SIÊU BÃO YAGI (SAU KHI DÙNG 4 AP)</span>
                <span id="active-quiz-countdown" class="quiz-countdown-pill">⏱️ 01:00</span>
            </div>
            <h2 class="modal-title">🚨 Thử Thách Vượt Tâm Bão Yagi Của ${player.name}</h2>
            <p class="modal-desc">
                Bạn đã sử dụng 4 AP trong lượt dưới sức gió của <strong>Siêu Bão Yagi</strong>! Hãy trả lời trong <strong>60 giây</strong>:<br/>
                • Trả lời <strong>ĐÚNG</strong>: Thưởng <strong>+1 💰 Xu</strong>.<br/>
                • Trả lời <strong>SAI / HẾT GIỜ</strong>: <strong>Sét Đánh -${nextWrongDmg} ❤️ HP</strong> (lũy tiến -1, -2, tối đa -3 HP)!
            </p>
            <div class="quiz-box">
                <div class="quiz-question">❓ ${rawQuiz.q}</div>
                <div class="quiz-options">
                    ${rawQuiz.options.map((opt, idx) => `
                        <button class="quiz-opt-btn" onclick="window.GAME.resolveYagiTurnQuiz(${idx}, false)">
                            <span class="opt-letter">${String.fromCharCode(65 + idx)}</span>
                            <span>${opt}</span>
                        </button>
                    `).join("")}
                </div>
            </div>
        `;
        this.startPendingQuiz({
            type: "yagi",
            html,
            durationSec: 60,
            onTimeout: () => this.resolveYagiTurnQuiz(-1, true)
        });
    }

    resolveYagiTurnQuiz(chosenIdx, isTimeout = false) {
        const ctx = this.pendingYagiQuiz;
        if (!ctx) return;
        const { player, quiz } = ctx;
        this.pendingYagiQuiz = null;
        this.clearPendingQuiz();

        const isCorrect = !isTimeout && (chosenIdx === quiz.correct);
        if (player) {
            player.quizTotal = (player.quizTotal || 0) + 1;
            if (isCorrect) player.quizCorrect = (player.quizCorrect || 0) + 1;
        }
        let outcomeBanner = "";

        if (isCorrect) {
            player.coins = Math.min(30, player.coins + 1);
            window.SFX.playCoin();
            this.world.triggerBurstAnimation(player.q, player.r, 0xfbbf24, 24);
            this.logEvent(`🌀 ${player.name} trả lời ĐÚNG câu hỏi Siêu Bão Yagi → Thưởng +1 Xu (${player.coins}/30 Xu)!`);
            outcomeBanner = `✅ Chúc mừng! Bạn trả lời chính xác và nhận được <strong>+1 💰 Xu</strong> giữa tâm bão Yagi!`;
        } else {
            player.yagiWrongCount = (player.yagiWrongCount || 0) + 1;
            const dmg = Math.min(3, player.yagiWrongCount);
            this.world.triggerLightningStrikeEffect(player.q, player.r);
            this.applyPlayerDamage(player, dmg, `Sét đánh Siêu Bão Yagi (Lần sai thứ ${player.yagiWrongCount})`);
            outcomeBanner = `⚡ <strong>SÉT ĐÁNH TÂM BÃO YAGI (Lần sai thứ ${player.yagiWrongCount})!</strong> Thuyền của bạn bị phạt <strong>-${dmg} ❤️ HP</strong> (Còn ${player.hp}/${player.maxHp} HP)!`;
        }

        const html = `
            <div class="modal-header-badge" style="background:${isCorrect ? '#2e6f4033' : '#8c2d2d33'}; border-color:${isCorrect ? '#4b9b68' : '#c95b5b'}">
                <span>${isCorrect ? '🌀 VƯỢT TÂM BÃO YAGI THÀNH CÔNG (+1 XU)' : '⚡ SÉT ĐÁNH TÂM BÃO YAGI'}</span>
                <span class="badge-tag">⏱️ Tự đóng <span id="quiz-autoclose-sec">10</span>s</span>
            </div>
            <h2 class="modal-title">${isCorrect ? 'Bản Lĩnh Thuyền Trưởng Giữa Siêu Bão (+1 Xu)!' : 'Sét Đánh Trúng Cột Buồm Giữa Siêu Bão!'}</h2>
            <p class="modal-desc">${outcomeBanner}</p>
            ${this.renderQuizVisualMemoryCard(quiz, chosenIdx)}
            <div class="modal-actions" style="justify-content:space-between">
                <span style="font-size:12px; color:#fbbf24; font-weight:700">⏳ Tự động đóng sau <span id="quiz-autoclose-sec-sub">10</span> giây...</span>
                <button class="btn-primary-gold" onclick="window.GAME.closeQuizResultNow()">✕ Đóng Ngay Lập Tức</button>
            </div>
        `;
        this.showModal(html);
        this.startQuizResultAutoCloseTimer(10);
        this.updateUI();
        this.syncMultiplayerGameState();
    }

    // ------------------------------------------------------------------------
    // VIII. PHASE 3: END OF TURN & RARE NPC SPAWNING (4-5 ROUNDS)
    // ------------------------------------------------------------------------
    endPlayerTurn(isAuto = false) {
        clearTimeout(this.autoEndTurnTimer);
        this.clearZeroApAutoPassCountdown();
        this.hideAfkWarningBanner();
        this.hideAfkAutoNotice();
        if (this.isBusy) return;
        if (!isAuto && this.hasActiveUnansweredQuiz()) {
            this.showToast("⏳ Bạn đang có câu hỏi Quiz chưa trả lời! Hãy bấm '❓ Mở Lại Quiz' để hoàn thành trước khi kết thúc lượt.");
            return;
        }
        this.cancelLockedMovePath(false);
        const p = this.getActivePlayer();
        if (!p) return;

        // If human turn, only the active player can end their turn
        if (!p.isAI && !this.isMyTurn()) {
            this.showToast(`👁️ Đang là lượt của ${p.name}! Bạn không thể bấm Kết thúc lượt hộ người khác.`);
            return;
        }

        if (p.ap > 0 && !isAuto) {
            this.logEvent(`⏭️ ${p.name} chủ động kết thúc lượt (hủy ${p.ap} AP còn dư).`);
        } else if (isAuto) {
            this.logEvent(`⏭️ ${p.name} đã dùng hết AP và hoàn tất lượt đi.`);
        }
        p.ap = 0;
        p.hexMoveCredits = 0;
        this.liveQuizState = null;

        if (p.hp >= p.maxHp && !p.eliminated) {
            this.recordSecretQuestProgress(p, "full_hp_turns");
        }

        const maxCap = this.getMaxCargo(p);
        while (this.getCargoCount(p) > maxCap) {
            if (p.wood > 0) p.wood--;
            else if (p.food > 0) p.food--;
            else break;
        }

        if (this.getTotalProsperity(p) >= 15) {
            this.matchWinner = p;
            this.syncMultiplayerGameState();
            this.showVictoryScreen(p);
            return;
        }

        this.advanceToNextPlayer();
    }

    advanceToNextPlayer() {
        const alivePlayers = this.players.filter(pl => !pl.eliminated);
        if (alivePlayers.length === 0) {
            this.showToast("Tất cả các thuyền đều đã bị đắm! Hãy bắt đầu ván mới.");
            return;
        }

        let nextIdx = (this.activePlayerIdx + 1) % this.players.length;
        if (nextIdx <= this.activePlayerIdx) {
            this.advanceGlobalRound();
        }
        this.activePlayerIdx = nextIdx;

        if (this.players[this.activePlayerIdx].eliminated) {
            this.advanceToNextPlayer();
            return;
        }

        this.beginTurn();
    }

    advanceGlobalRound() {
        this.roundNumber += 1;

        this.world.hexTiles.forEach(tile => {
            if (tile.resourceCooldown > 0) {
                tile.resourceCooldown -= 1;
                if (tile.resourceCooldown === 0) {
                    this.logEvent(`🌱 Tài nguyên tại vùng [${tile.region.name}] đã tái tạo 100% trữ lượng!`);
                }
            }
        });
        this.world.updateResourceVisuals();

        if (this.roundNumber >= this.nextNPCSpawnRound) {
            const spawnedTile = this.world.spawnRareNPCOnRandomSeaHex();
            if (spawnedTile) {
                this.logEvent(`🚢 [Sự Kiện Hiếm Vòng ${this.roundNumber}] Thương Đoàn Quốc Tế (Tàu FDI) vừa xuất hiện ngẫu nhiên trên vùng biển [${spawnedTile.region.name}]!`);
                this.showToast(`🚢 Thương Đoàn Quốc Tế (Tàu FDI) vừa xuất hiện tại vùng biển ${spawnedTile.region.name}!`);
            }
            this.nextNPCSpawnRound = this.roundNumber + 4 + Math.floor(Math.random() * 2);
        }
    }

    // ------------------------------------------------------------------------
    // SMART AI COMMANDER ENGINE (RUNS ON HOST & SYNCS TO ALL PLAYERS)
    // ------------------------------------------------------------------------
    executeAITurn() {
        if (this.roomState.code && !this.roomState.isHost) return;
        const ai = this.getActivePlayer();
        if (!ai || !ai.isAI || ai.eliminated) return;

        // Mục 3C-1: Bot thi thoảng tự khớp đơn giá hợp lý trên Chợ P2P (0 AP)
        this.tryBotP2PTrade(ai);

        const maxSteps = this.getRemainingHexSteps(ai);
        const reachableMap = this.computeNavigablePaths(ai.q, ai.r, maxSteps);
        const curTile = this.getCurrentTile(ai);
        const candidates = [{ tile: curTile, steps: 0, path: [] }];
        reachableMap.forEach((info, key) => {
            const t = this.world.hexMap.get(key);
            if (t) candidates.push({ tile: t, steps: info.steps, path: info.path });
        });

        let bestChoice = candidates[0];
        let bestScore = -999;

        candidates.forEach(cand => {
            const t = cand.tile;
            let score = -cand.steps * 1.2;
            const reefCount = (cand.path || []).filter(step => step.isReef).length;
            score -= reefCount * 18;

            if (t.monumentId && !t.monumentLocked && !ai.relics.some(r => r.id === t.monumentId)) {
                const tier = t.monumentTier;
                const tier1Blocked = (tier === 1 && (ai.tier1Visited || 0) >= 1);
                const hasKey = (ai.keys[tier] || 0) > 0;
                const feeCoins = tier === 1 ? 2 : (tier === 2 ? 3 : 6);
                const feeFood = tier;
                const feeIron = tier === 3 ? 1 : 0;
                if (!tier1Blocked && hasKey && ai.coins >= feeCoins && ai.food >= feeFood && ai.iron >= feeIron) {
                    score += 130;
                } else if (!tier1Blocked) {
                    score += 10;
                }
            }

            if (t.isPort) {
                const portOwner = this.getPortCharterOwner(t.regionId);
                const needsTax = Boolean(portOwner && portOwner.id !== ai.id);
                if (needsTax && (ai.coins || 0) < 1) {
                    // Mục 3B-1: Bot có 0 Xu tuyệt đối không tìm đường vào cảng người khác!
                    score -= 80;
                } else {
                    const pInv = this.getPortInventory(t.regionId);
                    const pKeyTier = pInv ? pInv.availableKeyTier : null;
                    const canBuyNeededKey = (
                        pKeyTier !== null &&
                        pKeyTier !== undefined &&
                        !this.isTierExhausted(pKeyTier) &&
                        pInv.keyStock > 0 &&
                        (ai.keys[pKeyTier] || 0) === 0 &&
                        ai.coins >= (pInv.keyPrice + (needsTax ? 1 : 0))
                    );
                    if (ai.specialties.some(s => Math.abs(s.regionId - t.regionId) >= 1)) {
                        score += 65;
                    } else if (canBuyNeededKey) {
                        // KEY-3: Bot chỉ ưu tiên tìm đường đến cảng có key !== null và cấp Key đó chưa bị chinh phục hết
                        score += 50;
                    } else if (ai.coins >= (needsTax ? 3 : 2) && this.getCargoCount(ai) < this.getMaxCargo(ai) - 1) {
                        score += 32;
                    }
                }
            }

            if (t.resourceType && t.resourceCooldown === 0 && !t.stormRestricted && this.getCargoCount(ai) < this.getMaxCargo(ai) - 1) {
                score += 28;
            }

            if (t.hasNPC && ai.coins < 28) {
                score += 45;
            }

            if (score > bestScore) {
                bestScore = score;
                bestChoice = cand;
            }
        });

        const afterMove = () => {
            // Nếu người chơi vừa chạm/bấm lấy lại quyền lái giữa chừng -> dừng hẳn luồng Bot & trả quyền sạch sẽ!
            if (!ai.isAI || ai.eliminated || this.matchWinner) {
                this.refreshReachableHexes();
                this.updateUI();
                this.syncMultiplayerGameState();
                return;
            }
            const destTile = this.getCurrentTile(ai);
            if (ai.ap >= 1 && destTile && !ai.eliminated) {
                this.performAIInteractiveAction(ai, destTile);
            }
            this.syncMultiplayerGameState();
            clearTimeout(this.aiPostMoveTimer);
            this.aiPostMoveTimer = setTimeout(() => {
                if (!ai.isAI || ai.eliminated || this.matchWinner) return;
                if (this.getPlayerProsperity(ai) < 15) {
                    this.endPlayerTurn(true);
                }
            }, 650);
        };

        if (bestChoice && bestChoice.steps > 0) {
            this.movePlayerAlongRoute(ai, bestChoice.tile, bestChoice.steps, bestChoice.path, afterMove);
        } else {
            afterMove();
        }
    }

    performAIInteractiveAction(ai, tile) {
        if (tile.monumentId && !tile.monumentLocked && !ai.relics.some(r => r.id === tile.monumentId)) {
            const tier = tile.monumentTier;
            const earlyLocked = (tier >= 2 && this.isEarlyGameMonumentLockActive());
            const tier1Blocked = (tier === 1 && (ai.tier1Visited || 0) >= 1);
            const hasKey = (ai.keys[tier] || 0) > 0;
            const feeCoins = tier === 1 ? 2 : (tier === 2 ? 3 : 6);
            const feeFood = tier;
            const feeIron = tier === 3 ? 1 : 0;

            if (!earlyLocked && !tier1Blocked && hasKey && ai.coins >= feeCoins && ai.food >= feeFood && ai.iron >= feeIron) {
                this.spendInteractiveAP(ai);
                ai.keys[tier] = Math.max(0, (ai.keys[tier] || 0) - 1);
                ai.coins -= feeCoins;
                ai.food -= feeFood;
                ai.iron -= feeIron;
                if (tier === 1) ai.tier1Visited = (ai.tier1Visited || 0) + 1;

                const mon = window.GAME_DATA.monuments.find(m => m.id === tile.monumentId);
                const rewardCoins = tier === 1 ? 4 : (tier === 2 ? 4 : 5);
                const rewardPts = tier === 1 ? 1 : (tier === 2 ? 3 : 5);
                ai.prosperityPoints = (ai.prosperityPoints || 0) + rewardPts;
                ai.coins = Math.min(30, ai.coins + rewardCoins);
                if ((ai.maxCargo || 12) < 16) {
                    ai.maxCargo = 16;
                }
                if (tier === 1) {
                    if ((ai.keys[2] || 0) < 1) ai.keys[2] = 1;
                    else ai.coins = Math.min(30, ai.coins + 3);
                }
                ai.relics.push({ id: mon.id, name: mon.relicName, icon: mon.relicIcon, monumentName: mon.name, tier });
                if (tier === 3) tile.monumentLocked = true;
                tile.monumentConqueror = { name: ai.name, color: ai.color };
                this.checkAndNotifyExhaustedMonumentTier(tier);
                this.syncMonumentVisuals3D();

                window.SFX.playRelicFanfare();
                this.world.triggerBurstAnimation(tile.q, tile.r, 0xd4af37, 30);
                this.logEvent(`🤖 [Tàu Máy] ${ai.name} chinh phục [${mon.name} - Cấp ${tier}] (+${rewardPts} ⭐ Điểm Thịnh Vượng • Tổng ${ai.prosperityPoints}/15 ⭐)!`);

                if (this.getTotalProsperity(ai) >= 15) {
                    this.matchWinner = ai;
                    this.syncMultiplayerGameState();
                    this.showVictoryScreen(ai);
                }
                return;
            }
        }

        if (tile.isPort) {
            const charterOwner = this.getPortCharterOwner(tile.regionId);
            const mustPayTax = Boolean(charterOwner && charterOwner.id !== ai.id);
            if (mustPayTax) {
                if ((ai.coins || 0) < 1) {
                    this.logEvent(`⛔ [Tàu Máy] ${ai.name} không đủ 1 Xu thuế cập bến để vào ${tile.portName} của ${charterOwner.name}.`);
                    return;
                }
                ai.coins -= 1;
                charterOwner.coins = Math.min(30, (charterOwner.coins || 0) + 1);
                this.logEvent(`💰 [Thuế Cập Bến] ${ai.name} đóng 1 Xu cho Chủ thương quyền ${charterOwner.name} tại ${tile.portName}!`);
                this.addTradeBulletinNotice(`💰 ${ai.name} đóng 1 Xu thuế cảng cho ${charterOwner.name}`);
            }
            if (!this.matchStats) this.matchStats = { portTrades: {}, portVisits: {}, totalP2P: 0, disasterDamage: 0, stormReefDamage: 0 };
            if (!this.matchStats.portVisits) this.matchStats.portVisits = {};
            this.matchStats.portVisits[tile.regionId] = (this.matchStats.portVisits[tile.regionId] || 0) + 1;
            // Bot tự động nộp Nhiệm Vụ Chung nếu đang ở đúng Cảng và có đủ hàng!
            const readyPubQuest = (this.activePublicQuests || []).find(q => this.canSubmitPublicQuest(ai, q));
            if (readyPubQuest) {
                this.submitPublicQuest(readyPubQuest.instanceId, true);
                if (this.matchWinner) return;
            }
            this.spendInteractiveAP(ai);
            for (let i = ai.specialties.length - 1; i >= 0; i--) {
                const sp = ai.specialties[i];
                const dist = Math.abs(sp.regionId - tile.regionId);
                if (dist >= 1) {
                    ai.specialties.splice(i, 1);
                    const gain = dist === 1 ? 3 : (dist === 2 ? 5 : 7);
                    ai.coins = Math.min(30, ai.coins + gain);
                    this.logEvent(`🤖 [Tàu Máy] ${ai.name} bán đặc sản [${sp.icon} ${sp.name}] tại ${tile.portName} thu về +${gain} Xu!`);
                    this.addTradeBulletinNotice(`💰 ${ai.name} bán [${sp.icon} ${sp.name}] tại ${tile.portName} (+${gain} Xu)`);
                }
            }

            const portInv = this.getPortInventory(tile.regionId);
            const kTier = portInv ? portInv.availableKeyTier : null;
            if (kTier !== null && kTier !== undefined && !this.isTierExhausted(kTier) && portInv.keyStock > 0 && (ai.keys[kTier] || 0) === 0 && ai.coins >= portInv.keyPrice) {
                ai.coins -= portInv.keyPrice;
                ai.keys[kTier] = 1;
                portInv.keyStock = 0;
                this.logEvent(`🤖 [Tàu Máy] ${ai.name} mua Key ${kTier} tại ${tile.portName}.`);
            } else if (ai.coins >= 2 && this.getCargoCount(ai) < this.getMaxCargo(ai) - 1 && portInv.specialtyStock > 0) {
                ai.coins -= 2;
                portInv.specialtyStock -= 1;
                const specItem = {
                    regionId: tile.regionId,
                    name: tile.region.specialty.shortName,
                    icon: tile.region.specialty.icon
                };
                if (Math.random() < 0.35 && this.marketListings.length < 6) {
                    this.marketListings.unshift({
                        id: this.nextListingId++,
                        sellerId: ai.id,
                        sellerName: ai.name,
                        itemType: "specialty",
                        regionId: specItem.regionId,
                        name: specItem.name,
                        icon: specItem.icon,
                        price: 3
                    });
                    this.logEvent(`📢 [AI] ${ai.name} vừa đăng bán đặc sản [${specItem.icon} ${specItem.name}] lên Sàn Giao Thương Chung (Giá 3 Xu)!`);
                    this.addTradeBulletinNotice(`📢 ${ai.name} rao bán [${specItem.icon} ${specItem.name}] giá 3 Xu`);
                } else {
                    ai.specialties.push(specItem);
                    this.logEvent(`🤖 [Tàu Máy] ${ai.name} mua đặc sản [${specItem.icon} ${specItem.name}] tại ${tile.portName} (2 Xu).`);
                    this.addTradeBulletinNotice(`📦 ${ai.name} nhập [${specItem.icon} ${specItem.name}] tại ${tile.portName}`);
                }
            }
            return;
        }

        if (tile.resourceType && tile.resourceCooldown === 0 && !tile.stormRestricted && this.getCargoCount(ai) < this.getMaxCargo(ai)) {
            this.spendInteractiveAP(ai);
            const space = Math.max(0, this.getMaxCargo(ai) - this.getCargoCount(ai));
            const gainAmt = Math.min(space, 2);
            ai[tile.resourceType] += gainAmt;
            const cds = { food: 2, wood: 3, iron: 4 };
            const cdBonus = (this.currentWeatherPhase === "sunset" || this.currentWeatherPhase === "night") ? 1 : 0;
            tile.resourceCooldown = Math.max(1, cds[tile.resourceType] - cdBonus);
            this.world.updateResourceVisuals();
            this.world.triggerBurstAnimation(tile.q, tile.r, 0x5c9ead, 16);
            this.logEvent(`🤖 [Tàu Máy] ${ai.name} khai thác +${gainAmt} tài nguyên tại ${tile.region.name}.`);
            return;
        }

        if (tile.hasNPC) {
            this.spendInteractiveAP(ai);
            ai.coins = Math.min(30, ai.coins + 3);
            this.world.despawnRareNPC();
            this.nextNPCSpawnRound = this.roundNumber + 4 + Math.floor(Math.random() * 2);
            this.logEvent(`🤖 [Tàu Máy] ${ai.name} gặp Thương Đoàn Quốc Tế (Tàu FDI) (+3 Xu). Tàu FDI sẽ tái xuất ở Vòng ${this.nextNPCSpawnRound}!`);
            return;
        }
    }

    // ------------------------------------------------------------------------
    // VICTORY SCREEN V3 (15 ĐIỂM THỊNH VƯỢNG + HUY HIỆU + PHẢN TƯ + 25s RETURN)
    // ------------------------------------------------------------------------
    showVictoryScreen(winner, lastQuiz = null, lastChosenIdx = null, winMode = "points") {
        if (!winner) return;
        this.victoryShownForMatch = true;
        this.matchWinner = winner;
        clearTimeout(this.autoEndTurnTimer);
        clearInterval(this.victoryCountdownInterval);
        this.hideAfkWarningBanner();
        this.hideAfkAutoNotice();
        this.cancelLockedMovePath(false);

        window.SFX.playRelicFanfare();

        const getProsperityPoints = (pl) => this.getTotalProsperity(pl);

        const sortedStandings = [...this.players].sort((a, b) => {
            if (a.id === winner.id) return -1;
            if (b.id === winner.id) return 1;
            return this.comparePlayersForRanking(a, b, true);
        });

        const tieReasonText = sortedStandings.length >= 2 ? this.getTieBreakerReason(sortedStandings[0], sortedStandings[1]) : "";
        const tieBannerHtml = tieReasonText
            ? `<div style="margin:6px 0 10px; padding:7px 11px; border-radius:8px; background:rgba(217,119,6,0.22); border:1px solid #fde047; color:#fef08a; font-size:12px; font-weight:800; text-align:center">${tieReasonText}</div>`
            : "";

        const standingsHtml = sortedStandings.map((pl, idx) => {
            const totalPts = getProsperityPoints(pl);
            const pubPts = this.getPlayerProsperity(pl);
            const secPts = this.getPlayerSecretPoints(pl);
            const monCount = (pl.relics || []).length;
            const quizOk = pl.quizCorrect || 0;
            const wealth = (pl.coins || 0) + this.getCargoCount(pl);
            const completedSecrets = (pl.secretQuests || []).filter(sq => sq.claimed);
            const secretCardsText = completedSecrets.length > 0
                ? completedSecrets.map(sq => `${sq.title} (+${sq.rewardPoints || 2}⭐)`).join(" • ")
                : "Chưa hoàn thành thẻ bí mật";
            return `
            <div class="turn-order-leaderboard-row ${pl.id === winner.id ? 'rank-1' : ''}" style="flex-direction:column; align-items:stretch; gap:4px; padding:7px 10px">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%">
                    <div style="display:flex; align-items:center; gap:8px; min-width:0">
                        <span class="slot-badge-num" style="background:${pl.color}; color:#fff; width:24px; height:24px; font-size:11.5px; flex-shrink:0">#${idx + 1}</span>
                        <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                            <strong style="color:#f8fafc; font-size:13px">${pl.name}</strong>
                            <span style="color:#cbd5e1; font-size:11px">(${pl.vesselTitle})</span>
                            ${pl.id === winner.id ? '<span style="color:#fde68a; font-weight:800; margin-left:5px; font-size:11.5px">🏆 VÔ ĐỊCH</span>' : ''}
                        </div>
                    </div>
                    <div style="font-size:11.5px; font-weight:800; color:#fde68a; white-space:nowrap">
                        [Công khai: ${pubPts}] + [<span style="color:#e9d5ff">🎭 Bí mật: +${secPts}</span>] = <strong style="color:#fef08a">⭐ ${totalPts}/15</strong>
                    </div>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:10.5px; color:#cbd5e1; border-top:1px solid rgba(255,255,255,0.08); padding-top:3px">
                    <span style="color:#d8b4fe; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">🎭 Thẻ Bí Mật đã lật: <strong>${secretCardsText}</strong></span>
                    <span style="white-space:nowrap; flex-shrink:0">🏛️ ${monCount} Di tích • 📚 ${quizOk} Quiz đúng • 💰+📦 ${wealth}</span>
                </div>
            </div>
            `;
        }).join("");

        // 1. Honor Badges (3 compact horizontal cards)
        const quizLeader = [...this.players].sort((a, b) => {
            const rA = a.quizTotal ? (a.quizCorrect / a.quizTotal) : 0;
            const rB = b.quizTotal ? (b.quizCorrect / b.quizTotal) : 0;
            if (rB !== rA) return rB - rA;
            return (b.quizCorrect || 0) - (a.quizCorrect || 0);
        })[0] || winner;
        const quizPct = quizLeader.quizTotal ? Math.round((quizLeader.quizCorrect / quizLeader.quizTotal) * 100) : 100;
        const quizStatText = quizLeader.quizTotal
            ? `Đúng ${quizLeader.quizCorrect}/${quizLeader.quizTotal} câu (${quizPct}%)`
            : `Chinh phục ${(quizLeader.relics || []).length} Di tích`;

        const tradeLeader = [...this.players].sort((a, b) => (b.p2pTrades || 0) - (a.p2pTrades || 0) || (b.coins || 0) - (a.coins || 0))[0] || winner;
        const tradeStatText = (tradeLeader.p2pTrades || 0) > 0
            ? `${tradeLeader.p2pTrades} giao dịch P2P thành công`
            : `Ngân khố ${tradeLeader.coins} Xu vàng`;

        const hpLeader = [...this.players].sort((a, b) => (a.damageTaken || 0) - (b.damageTaken || 0) || (b.hp || 0) - (a.hp || 0))[0] || winner;
        const hpStatText = `Mất ${hpLeader.damageTaken || 0} HP • Còn ${hpLeader.hp}/${hpLeader.maxHp} ❤️`;

        // 2. Geographic Debrief Summary (3 real match stats)
        const stats = this.matchStats || { portTrades: {}, portVisits: {}, totalP2P: 0, disasterDamage: 0, stormReefDamage: 0 };
        const visitMap = (stats.portVisits && Object.keys(stats.portVisits).length > 0) ? stats.portVisits : (stats.portTrades || {});
        let topPortName = "Cảng Hải Phòng – Cái Lân";
        let topPortCount = 0;
        Object.entries(visitMap).forEach(([regId, cnt]) => {
            if (cnt > topPortCount) {
                topPortCount = cnt;
                const regObj = window.GAME_DATA.regions[Number(regId)];
                if (regObj) topPortName = regObj.portName || regObj.name;
            }
        });
        const topPortDisplay = topPortCount > 0 ? `${topPortName} (${topPortCount} lượt cập bến)` : `${topPortName} (Khởi hành)`;
        const totalP2PDisplay = `${stats.totalP2P || 0} giao dịch liên vùng`;
        const stormReefDmg = (stats.stormReefDamage !== undefined) ? stats.stormReefDamage : (stats.disasterDamage || 0);
        const totalDmgDisplay = `${stormReefDmg} ❤️ HP (Bão & Đá ngầm)`;

        const html = `
            <div class="modal-header-badge" style="background:#0f2942; border-color:#e6b84a; color:#fde68a">
                <span>🏆 MÀN HÌNH PHẢN TƯ &amp; CHÚC MỪNG CHIẾN THẮNG — HÀNH TRÌNH VÀNG SON V3</span>
                <span class="badge-tag">Chạm Mốc 15 Điểm Thịnh Vượng</span>
            </div>

            <div class="victory-ribbon-banner">
                <h2 class="victory-ribbon-title">
                    🎉👑 CHÚC MỪNG ${winner.name.toUpperCase()} (${winner.vesselTitle}) GIÀNH CHIẾN THẮNG! 👑🎉
                </h2>
            </div>

            <p class="victory-sub-desc">
                ${winMode === "timeout"
                    ? `Hết giờ <strong>45:00</strong>! Sau khi lật toàn bộ <strong>Thẻ Nhiệm Vụ Bí Mật</strong>, Thuyền trưởng <strong>${winner.name}</strong> dẫn đầu bảng xếp hạng với <strong>${getProsperityPoints(winner)} ⭐ ĐIỂM THỊNH VƯỢNG</strong>!`
                    : `Thuyền trưởng <strong>${winner.name}</strong> đã xuất sắc vượt qua sóng gió Biển Đông, giao thương liên vùng dọc <strong>6 Vùng Kinh Tế Việt Nam</strong> và chạm mốc <strong>15 ĐIỂM THỊNH VƯỢNG</strong>!`}
            </p>
            ${tieBannerHtml}

            <div class="victory-section-label">🏅 Huy Hiệu Vinh Danh Cuối Trận</div>
            <div class="victory-badges-grid">
                <div class="victory-honor-card">
                    <div class="victory-honor-icon">🎓</div>
                    <div class="victory-honor-title">Bách Khoa Địa Lý</div>
                    <div class="victory-honor-winner">${quizLeader.name}</div>
                    <div class="victory-honor-stat">${quizStatText}</div>
                </div>
                <div class="victory-honor-card">
                    <div class="victory-honor-icon">🤝</div>
                    <div class="victory-honor-title">Bậc Thầy Thương Lượng</div>
                    <div class="victory-honor-winner">${tradeLeader.name}</div>
                    <div class="victory-honor-stat">${tradeStatText}</div>
                </div>
                <div class="victory-honor-card">
                    <div class="victory-honor-icon">🛡️</div>
                    <div class="victory-honor-title">Thuyền Trưởng Thép</div>
                    <div class="victory-honor-winner">${hpLeader.name}</div>
                    <div class="victory-honor-stat">${hpStatText}</div>
                </div>
            </div>

            <div class="victory-debrief-box">
                <div class="victory-debrief-title">📘 Góc Nhìn Lại Hành Trình Địa Lý</div>
                <div class="victory-debrief-grid">
                    <div class="victory-debrief-item">
                        <small>⚓ Cảng Cập Bến Nhiều Nhất</small>
                        <strong>${topPortDisplay}</strong>
                    </div>
                    <div class="victory-debrief-item">
                        <small>🤝 Tổng Giao Dịch P2P Toàn Trận</small>
                        <strong>${totalP2PDisplay}</strong>
                    </div>
                    <div class="victory-debrief-item">
                        <small>⛈️ Thiệt Hại Do Bão &amp; Đá Ngầm</small>
                        <strong>${totalDmgDisplay}</strong>
                    </div>
                </div>
            </div>

            <div class="turn-order-leaderboard" style="margin:6px 0">
                ${standingsHtml}
            </div>

            ${lastQuiz !== null ? this.renderQuizVisualMemoryCard(lastQuiz, lastChosenIdx, winner.name) : ''}

            <div class="victory-countdown-box">
                <span>⏳ Tự động đưa toàn bộ thuyền trưởng về <strong>Phòng Chờ</strong> sau:</span>
                <span id="victory-countdown-sec" class="victory-countdown-sec">25s</span>
            </div>

            <div class="modal-actions" style="justify-content:center; gap:10px; margin-top:10px; flex-wrap:wrap">
                ${this.roomState && this.roomState.code ? `
                    <button class="btn-primary-gold" onclick="window.GAME.returnToRoomLobbyAfterVictory()">
                        🚪 Về Phòng Chờ
                    </button>
                ` : ''}
                <button class="${this.roomState && this.roomState.code ? 'btn-secondary' : 'btn-primary-gold'}" onclick="window.GAME.returnToMainMenu()">
                    🏠 Về Màn Hình Chính
                </button>
            </div>
        `;
        this.showModal(html);

        let secLeft = 25;
        this.victoryCountdownInterval = setInterval(() => {
            secLeft -= 1;
            const secEl = document.getElementById("victory-countdown-sec");
            if (secEl) secEl.textContent = `${Math.max(0, secLeft)}s`;
            if (secLeft <= 0) {
                clearInterval(this.victoryCountdownInterval);
                this.returnToRoomLobbyAfterVictory();
            }
        }, 1000);
    }

    async returnToRoomLobbyAfterVictory() {
        clearInterval(this.victoryCountdownInterval);
        clearTimeout(this.autoEndTurnTimer);
        this.matchWinner = null;
        this.liveQuizState = null;

        if (this.roomState.code) {
            try {
                const resp = await fetch("/api/room/return-to-lobby", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: this.roomState.code })
                });
                const data = await resp.json();
                if (data && data.room) {
                    this.roomState.status = "waiting";
                    this.roomState.seats = data.room.seats || this.roomState.seats;
                    this.roomState.version = data.room.version || (this.roomState.version + 1);
                }
            } catch (e) {
                this.roomState.status = "waiting";
            }
        } else {
            this.roomState.status = "waiting";
        }

        document.getElementById("modal-overlay").classList.add("hidden");
        this.showWaitingScreen();
        this.showToast("🏁 Ván đấu đã khép lại! Đã đưa bạn về lại Phòng chờ ban đầu.");
    }

    // ------------------------------------------------------------------------
    // UI UPDATES (ALWAYS DISPLAY LOCAL PLAYER'S OWN STATS IN #panel-captain)
    // ------------------------------------------------------------------------
    focusOnPlayerShip(playerId) {
        const pl = this.players.find(item => item.id === playerId);
        if (!pl) return;
        window.SFX.playClick();
        this.world.focusCameraOnHex(pl.q, pl.r);
        this.showToast(`🔭 Đã di chuyển góc nhìn tới thuyền của [${pl.name}] (${pl.vesselTitle})!`);
    }

    updateUI() {
        const p = this.getActivePlayer();
        if (!p) return;
        const localP = this.getLocalPlayer() || p;
        const myTurn = this.isMyTurn();
        const activeTile = this.getCurrentTile(p);

        this.world.setCameraLockTarget(localP);
        this.updateClockAndTickerUI();
        this.syncAfkAutoNoticeUI();

        document.getElementById("hud-round").textContent = `🌀 V${this.roundNumber}`;

        const mktBadge = document.getElementById("market-count-badge");
        if (mktBadge) {
            const totalOrders = (this.marketListings || []).length + (this.buyOrders || []).length + (this.barterOrders || []).length;
            mktBadge.textContent = String(totalOrders);
        }

        // Top bar: Local player's assigned ship & live turn status (click to focus on your ship!)
        const myShipEl = document.getElementById("hud-my-ship");
        if (myShipEl && localP) {
            myShipEl.style.cursor = "pointer";
            myShipEl.title = "Bấm để đưa góc nhìn về thuyền của bạn";
            myShipEl.onclick = () => this.world.focusCameraOnHex(localP.q, localP.r);
            myShipEl.innerHTML = `<span class="fleet-dot" style="background:${localP.color}"></span> ⛵ <strong>${localP.name}</strong>`;
        }

        const turnStatusEl = document.getElementById("hud-turn-status");
        if (turnStatusEl) {
            if (myTurn) {
                turnStatusEl.innerHTML = `🎯 Lượt bạn (${p.ap} AP)`;
                turnStatusEl.className = "hud-pill turn-pill my-turn";
            } else {
                turnStatusEl.innerHTML = `👁️ ${p.name}`;
                turnStatusEl.className = "hud-pill turn-pill spectator-turn";
            }
        }

        this.updateSpectatorQuizPillUI();

        // Compact banner inside #panel-captain showing who is currently taking their turn when spectating
        const specBannerEl = document.getElementById("spectator-active-turn-banner");
        if (specBannerEl) {
            if (!myTurn) {
                specBannerEl.classList.remove("hidden");
                specBannerEl.innerHTML = `👁️ Lượt: <strong>${p.name}</strong> (${p.ap}/5 AP)`;
            } else {
                specBannerEl.classList.add("hidden");
            }
        }

        // #panel-captain ALWAYS displays the LOCAL player's own ship info (`localP`)
        document.getElementById("active-player-dot").style.backgroundColor = localP.color;
        document.getElementById("active-player-name").textContent = `${localP.name} ${localP.afkBotTakeover ? '🤖 AFK' : (myTurn ? '🎯' : '⛵')}`;
        document.getElementById("active-player-vessel").textContent = localP.vesselTitle;
        const charterEl = document.getElementById("active-player-charter");
        if (charterEl) {
            if (localP.charterRegionId !== undefined && localP.charterRegionId !== null) {
                charterEl.textContent = `👑 ${this.getRegionShortName(localP.charterRegionId)}`;
                charterEl.title = "Bấm để xem Cảng Thương quyền của bạn";
                charterEl.style.cursor = "pointer";
                charterEl.onclick = (e) => {
                    if (e && e.stopPropagation) e.stopPropagation();
                    this.focusCameraOnOwnCharterPort();
                };
                charterEl.classList.remove("hidden");
            } else {
                charterEl.classList.add("hidden");
            }
        }
        this.syncPortOwnershipVisuals3D();
        this.checkSprint12Alerts();

        const moveApRemaining = myTurn
            ? Math.max(0, Math.min(3 - (localP.moveApSpent || 0), localP.ap))
            : 3;
        document.getElementById("stat-ap").textContent = this.sandboxInfiniteMove
            ? `♾️ AP`
            : (myTurn ? `${localP.ap}/${localP.maxTurnAp || 5} AP` : `Chờ lượt`);
        document.getElementById("stat-move-steps").textContent = this.sandboxInfiniteMove
            ? `Tự do`
            : (myTurn
                ? `Đi ${this.getRemainingHexSteps(localP)} ô (${moveApRemaining}/3)`
                : `Lượt ${p.name}`);
        document.getElementById("stat-hp").textContent = `${localP.hp}/${localP.maxHp}`;
        document.getElementById("stat-coins").textContent = `${localP.coins}/30`;
        document.getElementById("stat-cargo").textContent = `${this.getCargoCount(localP)}/${this.getMaxCargo(localP)}`;
        const pubPtsLocal = this.getPlayerProsperity(localP);
        const secPtsLocal = this.getPlayerSecretPoints(localP);
        document.getElementById("stat-relics").innerHTML = secPtsLocal > 0
            ? `${pubPtsLocal}/15 <span class="secret-pts-inline">+${secPtsLocal} Ẩn</span>`
            : `${pubPtsLocal}/15`;

        const questDotEl = document.getElementById("quest-notify-dot");
        if (questDotEl) {
            questDotEl.classList.toggle("hidden", !this.hasAnyClaimableQuest(localP));
        }

        const streakChip = document.getElementById("stat-streak-chip");
        if (streakChip) {
            const st = localP.quizStreak || 0;
            const hasBonus = (localP.bonusApNextTurn || 0) > 0;
            streakChip.textContent = hasBonus ? `⛵ +1 AP (${st}/5)` : `🔥 ${st}/5`;
            streakChip.classList.toggle("armed-bonus", hasBonus);
        }

        document.getElementById("inv-food").textContent = localP.food;
        document.getElementById("inv-wood").textContent = localP.wood;
        document.getElementById("inv-iron").textContent = localP.iron;
        document.getElementById("inv-k1").textContent = `${localP.keys[1] || 0}/1`;
        document.getElementById("inv-k2").textContent = `${localP.keys[2] || 0}/1`;
        document.getElementById("inv-k3").textContent = `${localP.keys[3] || 0}/1`;

        const serpentChip = document.getElementById("inv-serpent-chip");
        if (serpentChip) {
            serpentChip.classList.toggle("hidden", !localP.hasSerpentCoin);
        }

        const specContainer = document.getElementById("inv-specialties");
        if (localP.specialties.length === 0) {
            specContainer.innerHTML = `<span class="empty-tag">0 Đặc sản</span>`;
        } else {
            specContainer.innerHTML = localP.specialties.map(s => `<span class="spec-badge">${s.icon} ${s.name}</span>`).join("");
        }

        const relicContainer = document.getElementById("inv-relics-list");
        if (localP.relics.length === 0) {
            relicContainer.innerHTML = ``;
        } else {
            relicContainer.innerHTML = localP.relics.map(r => `<span class="relic-badge">${r.icon} ${r.name}</span>`).join("");
        }

        const ctxBtn = document.getElementById("btn-context-action");
        const repairBtn = document.getElementById("btn-repair-ship");
        const endTurnBtn = document.getElementById("btn-end-turn");

        // #btn-end-turn and #btn-repair-ship are anchored in the header of #panel-captain so they are NEVER pushed outside!
        if (!myTurn) {
            if (ctxBtn) ctxBtn.classList.add("hidden");
            if (repairBtn) repairBtn.disabled = true;
            if (endTurnBtn) endTurnBtn.disabled = true;
        } else {
            if (repairBtn) repairBtn.disabled = false;
            if (endTurnBtn) endTurnBtn.disabled = this.hasActiveUnansweredQuiz();
            if (activeTile && ctxBtn) {
                if (activeTile.monumentId) {
                    const mon = window.GAME_DATA.monuments.find(m => m.id === activeTile.monumentId);
                    ctxBtn.innerHTML = `🏛️ Mở ${mon.name} (1 AP)`;
                    ctxBtn.disabled = false;
                    ctxBtn.classList.remove("hidden");
                } else if (activeTile.isPort) {
                    ctxBtn.innerHTML = `⚓ Cảng ${activeTile.portName} (1 AP)`;
                    ctxBtn.disabled = false;
                    ctxBtn.classList.remove("hidden");
                } else if (activeTile.resourceType) {
                    const cdText = activeTile.resourceCooldown > 0 ? ` (Hồi ${activeTile.resourceCooldown}v)` : ` (1 AP)`;
                    ctxBtn.innerHTML = `⛏️ Khai Thác${cdText}`;
                    ctxBtn.disabled = activeTile.resourceCooldown > 0 || activeTile.stormRestricted || !this.canSpendInteractiveAP(p);
                    ctxBtn.classList.remove("hidden");
                } else if (activeTile.hasNPC) {
                    ctxBtn.innerHTML = `🚢 Gặp Tàu FDI (1 AP)`;
                    ctxBtn.disabled = !this.canSpendInteractiveAP(p);
                    ctxBtn.classList.remove("hidden");
                } else {
                    ctxBtn.classList.add("hidden");
                }
            }
        }

        // Sleek, Compact Leaderboard sorted by Prosperity Points -> Monuments -> P2P -> Coins -> Turn Order
        const rosterEl = document.getElementById("fleet-roster");
        if (rosterEl) {
            const rankedPlayers = this.players.map((pl, turnIdx) => ({ pl, turnIdx })).sort((a, b) => {
                const cmp = this.comparePlayersForRanking(a.pl, b.pl);
                if (cmp !== 0) return cmp;
                return a.turnIdx - b.turnIdx;
            });

            const rankMedals = ["🥇", "🥈", "🥉", "#4", "#5"];
            const compactRegionMap = {
                0: "TD&MN Bắc Bộ",
                1: "ĐB Sông Hồng",
                2: "DH Miền Trung",
                3: "Tây Nguyên",
                4: "Đông Nam Bộ",
                5: "ĐB Sông Cửu Long"
            };
            rosterEl.innerHTML = rankedPlayers.map((entry, rankIdx) => {
                const { pl, turnIdx } = entry;
                const isMe = localP && (World3D.getPlayerShipKey(pl) === World3D.getPlayerShipKey(localP));
                const isTurn = (turnIdx === this.activePlayerIdx);
                const medal = rankMedals[rankIdx] || `#${rankIdx + 1}`;
                const hasCharter = pl.charterRegionId !== undefined && pl.charterRegionId !== null;
                const charterShort = hasCharter
                    ? `📜 ${compactRegionMap[pl.charterRegionId] || this.getRegionShortName(pl.charterRegionId)}`
                    : `🌐 Tự Do`;
                const leftStatsHtml = pl.eliminated
                    ? `☠️ Đắm tàu`
                    : `❤️ ${pl.hp}/${pl.maxHp} • 💰 ${pl.coins}/30${pl.hasSerpentCoin ? ' • 🛡️' : ''}`;
                return `
                    <div class="lb-row-card ${isTurn ? 'active-turn' : ''} ${isMe ? 'is-me' : ''} ${pl.eliminated ? 'eliminated' : ''}"
                         title="Bấm để xem vị trí ${pl.vesselTitle || 'tàu'} của ${pl.name}"
                         onclick="window.GAME.focusOnPlayerShip(${pl.id})">
                        <div class="lb-row-top">
                            <div class="lb-row-top-left">
                                <span class="lb-rank-badge">${medal}</span>
                                <span class="lb-color-dot" style="background:${pl.color}"></span>
                                <span class="lb-name-text">${pl.name}${pl.afkBotTakeover ? ' 🤖' : ''}</span>
                                ${isMe ? '<span class="lb-me-tag">[Bạn]</span>' : ''}
                                ${isTurn ? '<span class="lb-turn-indicator" title="Đang tới lượt">🎯</span>' : ''}
                            </div>
                            <div class="lb-relic-pill" title="Điểm Thịnh Vượng Công Khai (15 = Thắng)">
                                ⭐ ${this.getPlayerProsperity(pl)}/15
                            </div>
                        </div>
                        ${pl.vesselTitle ? `<div class="lb-vessel-sub" title="${pl.vesselTitle}">⛵ ${pl.vesselTitle}</div>` : ''}
                        <div class="lb-row-bottom">
                            <span class="lb-stats-left">${leftStatsHtml}</span>
                            <span class="lb-charter-right" title="${charterShort}">${charterShort}</span>
                        </div>
                    </div>
                `;
            }).join("");
        }
    }

    // ------------------------------------------------------------------------
    // HOVER TOOLTIP: ONLY ON INTERACTIVE POIs (MONUMENT, PORT, RESOURCE, NPC)
    // AND ONLY AFTER HOVERING FOR 0.5 SECONDS (500ms)
    // ------------------------------------------------------------------------
    handleHexHover(tile, clientX, clientY) {
        const tooltip = document.getElementById("hex-tooltip");
        this.lastHoverMouseX = clientX;
        this.lastHoverMouseY = clientY;

        const isInteractivePOI = Boolean(
            this.isGameStarted &&
            tile &&
            (tile.monumentId || tile.isPort || tile.resourceType || tile.hasNPC)
        );

        if (!isInteractivePOI) {
            clearTimeout(this.hoverTooltipTimer);
            this.hoverTooltipTimer = null;
            this.hoveredPOITileKey = null;
            if (tooltip) tooltip.classList.add("hidden");
            return;
        }

        const poiKey = `${tile.q},${tile.r}`;
        if (this.hoveredPOITileKey !== poiKey) {
            clearTimeout(this.hoverTooltipTimer);
            this.hoveredPOITileKey = poiKey;
            if (tooltip) tooltip.classList.add("hidden");

            this.hoverTooltipTimer = setTimeout(() => {
                if (this.hoveredPOITileKey === poiKey) {
                    this.renderPOITooltip(tile, this.lastHoverMouseX, this.lastHoverMouseY);
                }
            }, 500);
        } else if (tooltip && !tooltip.classList.contains("hidden")) {
            tooltip.style.left = `${Math.min(window.innerWidth - 310, clientX + 16)}px`;
            tooltip.style.top = `${Math.min(window.innerHeight - 150, clientY + 16)}px`;
        }
    }

    renderPOITooltip(tile, clientX, clientY) {
        const tooltip = document.getElementById("hex-tooltip");
        if (!tooltip || !this.isGameStarted || !tile) return;

        let title = "";
        let details = "";

        if (tile.monumentId) {
            const mon = window.GAME_DATA.monuments.find(m => m.id === tile.monumentId);
            const tier = tile.monumentTier;
            const earlyLocked = (tier >= 2 && this.isEarlyGameMonumentLockActive());
            const tierMeta = this.getMonumentTierMeta(tier);
            const rewardPts = (tierMeta && tierMeta.rewardPoints) || (tier === 1 ? 1 : (tier === 2 ? 3 : 5));
            const starBadgeMap = {
                1: { stars: "★ CẤP 1", bg: "#059669", border: "#34d399" },
                2: { stars: "★★ CẤP 2", bg: "#d97706", border: "#fde047" },
                3: { stars: "★★★ CẤP 3", bg: "#dc2626", border: "#fb923c" }
            };
            const sStyle = starBadgeMap[tier] || starBadgeMap[1];
            const reqMap = {
                1: {
                    badge: "🟢 Cấp 1 – Trạm Bước Đệm (Tối đa 1 lần)",
                    reqText: "1 🗝️ Key 1 + 1 🌾 Lúa + 2 💰 Xu + 1 AP",
                    rewardText: `+${rewardPts} ⭐ Điểm, +4 💰 Xu, Kho 12→16 ô, +1 Key 2 (hoặc +3 Xu)`,
                    foodReq: 1, ironReq: 0, coinReq: 2
                },
                2: {
                    badge: "🟡 Cấp 2 – Trung Bình (Medium)",
                    reqText: "1 🗝️ Key 2 + 2 🌾 Lúa + 3 💰 Xu + 1 AP",
                    rewardText: `+${rewardPts} ⭐ Điểm Thịnh Vượng & +4 💰 Xu (Sai: 🪨 -2 HP)`,
                    foodReq: 2, ironReq: 0, coinReq: 3
                },
                3: {
                    badge: "🔴 Cấp 3 – Khó (Hard • Khóa sau khi giải)",
                    reqText: "1 🗝️ Key 3 + 3 🌾 Lúa + 1 ⛏️ Sắt + 6 💰 Xu + 1 AP",
                    rewardText: `+${rewardPts} ⭐ Điểm Thịnh Vượng & +5 💰 Xu (Sai: ⚡🪨 -3 HP)`,
                    foodReq: 3, ironReq: 1, coinReq: 6
                }
            }[tier];

            const refPlayer = this.getLocalPlayer() || this.getActivePlayer();
            let playerCheckHtml = "";
            if (earlyLocked) {
                playerCheckHtml = `<div style="margin-top:5px; padding:4px 7px; border-radius:6px; background:rgba(71,85,105,0.45); border:1px solid #94a3b8; color:#e2e8f0; font-weight:800">🔒 Đang khai quật — Mở lúc 08:30</div>`;
            } else if (refPlayer) {
                const tier1Blocked = (tier === 1 && (refPlayer.tier1Visited || 0) >= 1);
                const hasKey = (refPlayer.keys[tier] || 0) >= 1;
                const hasFood = refPlayer.food >= reqMap.foodReq;
                const hasIron = refPlayer.iron >= reqMap.ironReq;
                const hasCoins = refPlayer.coins >= reqMap.coinReq;
                const allReady = !tier1Blocked && hasKey && hasFood && hasIron && hasCoins;
                playerCheckHtml = `
                    <div style="margin-top:5px; padding-top:4px; border-top:1px dashed rgba(197,155,39,0.35); font-size:10.5px; color:${allReady ? '#88e2a8' : '#f4b4b2'}">
                        ${tier1Blocked
                            ? '⛔ <strong>Bạn đã chinh phục Trạm Bước Đệm Cấp 1 đủ 1/1 lần!</strong>'
                            : (allReady ? '✅ <strong>Thuyền bạn đã ĐỦ tài nguyên mở Di tích này!</strong>' : '⚠️ <strong>Khoang tàu bạn hiện có:</strong>')
                        }<br/>
                        🗝️ Key ${tier}: <strong>${refPlayer.keys[tier] || 0}/1</strong> • 🌾 Lúa: <strong>${refPlayer.food}/${reqMap.foodReq}</strong>${reqMap.ironReq ? ` • ⛏️ Sắt: <strong>${refPlayer.iron}/${reqMap.ironReq}</strong>` : ''} • 💰 Xu: <strong>${refPlayer.coins}/${reqMap.coinReq}</strong>
                    </div>
                `;
            }

            title = `${earlyLocked ? '🔒 ' : '🏛️ '}${mon.name} (${mon.province})`;
            details = `
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:5px">
                    <span style="display:inline-block; padding:2px 7px; border-radius:6px; background:${earlyLocked ? '#475569' : sStyle.bg}; border:1.5px solid ${earlyLocked ? '#94a3b8' : sStyle.border}; color:#fff; font-weight:900; font-size:11px">${earlyLocked ? `🔒 CẤP ${tier} • 08:30` : sStyle.stars}</span>
                    <span style="color:#fde68a; font-weight:800">Cần 🗝️ Key ${tier}</span>
                    <span style="color:#86efac; font-weight:900">+${rewardPts} ⭐ Thịnh Vượng</span>
                </div>
                <div style="background:rgba(197,155,39,0.16); border:1px solid rgba(229,195,101,0.45); border-radius:6px; padding:4px 7px; margin:4px 0">
                    📋 <strong>Yêu cầu mở cổng Di tích:</strong><br/>
                    <span style="color:#ffd54f; font-weight:800">${reqMap.reqText}</span>
                </div>
                <div>🎁 Phần thưởng: <strong>${reqMap.rewardText}</strong></div>
                ${playerCheckHtml}
            `;
        } else if (tile.isPort) {
            const portInv = this.getPortInventory(tile.regionId);
            const viewer = this.getLocalPlayer() || this.getActivePlayer();
            const canSee = this.canInspectPortDetails(viewer, tile.regionId);
            const keyInfoHtml = !canSee
                ? `<strong>🔒 Cập bến hoặc giữ Thương quyền để xem Key & Kho</strong>`
                : (portInv && portInv.availableKeyTier !== null && portInv.availableKeyTier !== undefined && !this.isTierExhausted(portInv.availableKeyTier))
                    ? `<strong>🗝️ Key ${portInv.availableKeyTier} (${portInv.keyStock}/1)</strong>`
                    : `<strong>🗝️ Tạm trống Chìa Khóa</strong>`;
            title = `⚓ ${tile.portName} (${tile.region.name})`;
            details = `Mua Đặc sản: ${tile.region.specialty.icon} ${tile.region.specialty.shortName} (2 Xu) • 🛡️ Bảo Hiểm Hàng Hải (10 Xu)<br/>📦 Tình trạng Key: ${keyInfoHtml}`;
        } else if (tile.resourceType) {
            const rMap = { food: "🌾 Vựa Lúa / Ngư Trường (Hồi 2 vòng)", wood: "🌲 Lâm Trường Gỗ (Hồi 3 vòng)", iron: "⛏️ Mỏ Khoáng Sản Sắt (Hồi 4 vòng)" };
            title = rMap[tile.resourceType];
            if (tile.stormRestricted) {
                details = `⛔ <strong>Đang bị phong tỏa bởi Giông Bão (Không thể vào khai thác)!</strong>`;
            } else if (tile.resourceCooldown > 0) {
                details = `⏳ Đang tái tạo sinh thái: Còn ${tile.resourceCooldown} vòng`;
            } else {
                details = `✅ Sẵn sàng khai thác (Đúng +2 Tài nguyên / Sai +1 Tài nguyên • Không nhận Xu)`;
            }
        } else if (tile.hasNPC) {
            title = `🚢 Thương Đoàn Quốc Tế — Tàu FDI (Sự kiện hiếm)`;
            details = `✨ Xuất hiện 4–5 vòng 1 lần! Đến gặp để giải đố nhận <strong>+2 đến +3 Xu Vàng</strong>!`;
        }

        const routeInfo = this.world.reachablePaths.get(`${tile.q},${tile.r}`);
        if (routeInfo && this.isMyTurn() && this.getActivePlayer()) {
            const stepsPerAp = this.getStepsPerMoveAP();
            const apCost = this.sandboxInfiniteMove
                ? 0
                : Math.ceil(Math.max(0, routeInfo.steps - this.getActivePlayer().hexMoveCredits) / stepsPerAp);
            details += `<br/><span style="color:#e5c365">⛵ Nhấn để lái tàu (${routeInfo.steps} ô • Tốn ${apCost} AP) hoặc Nhấp đúp + Kéo để tự vẽ đường</span>`;
        }

        tooltip.innerHTML = `<div class="tt-title">${title}</div><div class="tt-body">${details}</div>`;
        tooltip.style.left = `${Math.min(window.innerWidth - 310, clientX + 16)}px`;
        tooltip.style.top = `${Math.min(window.innerHeight - 150, clientY + 16)}px`;
        tooltip.classList.remove("hidden");
    }

    // ------------------------------------------------------------------------
    // UPGRADED VISUAL 6-REGION ATLAS (7 TABS + LIVE SEARCH + ACADEMIC CARDS)
    // ------------------------------------------------------------------------
    getAtlasRegionMeta(regionId) {
        const metaMap = {
            0: {
                shortTab: "TD&MN Bắc Bộ",
                portName: "Cảng Cái Lân",
                tips: [
                    "<strong>Từ khóa Quiz dễ gặp:</strong> <strong>Quảng Ninh</strong> là tỉnh duy nhất của vùng có biển; dẫn đầu cả nước về <strong>khoáng sản (than Antraxit)</strong>, <strong>thủy điện</strong> và <strong>chè Shan tuyết</strong>.",
                    "<strong>Liên kết giao thương:</strong> Ôm <em>Chè Shan &amp; Than Quảng Ninh</em> từ Cảng Cái Lân xuôi Nam sang Miền Trung / Nam Bộ ăn chênh lệch tới <span class=\"hl-mint\">+5 💰 Xu</span>!"
                ]
            },
            1: {
                shortTab: "ĐB Sông Hồng",
                portName: "Cảng Hải Phòng",
                tips: [
                    "<strong>Từ khóa Quiz dễ gặp:</strong> Phù sa hệ thống sông Hồng – Thái Bình, có <strong>hệ thống đê ngăn lũ</strong>; khí hậu có mùa đông lạnh giúp phát triển <strong>vụ Đông</strong> thành vụ chính và <strong>năng suất lúa cao nhất cả nước</strong>.",
                    "<strong>Liên kết giao thương:</strong> Cảng Hải Phòng kết nối nhanh với Cái Lân &amp; tuyến xuyên Việt — trung tâm trao đổi <em>Gốm Bát Tràng &amp; Lụa cổ</em>."
                ]
            },
            2: {
                shortTab: "BTB & DH Miền Trung",
                portName: "Cảng Tiên Sa",
                tips: [
                    "<strong>Từ khóa Quiz dễ gặp:</strong> Lãnh thổ hẹp ngang; mùa hạ chịu <strong>gió Phơn Tây Nam khô nóng (Gió Lào)</strong>; mùa mưa bão <strong>lệch về thu – đông</strong>; thế mạnh <strong>kinh tế biển tổng hợp &amp; Con đường Di sản</strong>.",
                    "<strong>Liên kết giao thương:</strong> Vị trí bản lề giữa Bắc – Nam giúp Cảng Tiên Sa xoay vòng Đặc sản hai đầu đất nước cực nhanh."
                ]
            },
            3: {
                shortTab: "Tây Nguyên",
                portName: "Cảng Quy Nhơn",
                tips: [
                    "<strong>Từ khóa Quiz dễ gặp:</strong> <strong>Vùng duy nhất không giáp biển</strong>, địa hình cao nguyên xếp tầng phủ <strong>đất đỏ bazan</strong>; đứng số 1 cả nước về <strong>cà phê</strong>, trữ lượng <strong>quặng Bô-xít</strong> khổng lồ.",
                    "<strong>Liên kết giao thương:</strong> Xuất khẩu <em>Cà phê Buôn Ma Thuột &amp; Hồ tiêu</em> ra biển qua cửa ngõ <strong>Cảng Quy Nhơn</strong> sang hai miền Bắc – Nam."
                ]
            },
            4: {
                shortTab: "Đông Nam Bộ",
                portName: "Cảng Cái Mép – Sài Gòn",
                tips: [
                    "<strong>Từ khóa Quiz dễ gặp:</strong> <strong>Đầu tàu kinh tế số 1 Việt Nam</strong> (dẫn đầu GDP, công nghiệp công nghệ cao, FDI); thủ phủ <strong>cây cao su</strong> và khai thác <strong>dầu khí thềm lục địa</strong>.",
                    "<strong>Liên kết giao thương:</strong> Trong game, Đông Nam Bộ luôn là <span class=\"hl-mint\">🌐 Vùng Tự Do (Thuế cập bến 0 💰)</span> — bến đỗ an toàn nhất khi kẹt Xu!"
                ]
            },
            5: {
                shortTab: "ĐB Sông Cửu Long",
                portName: "Cảng Cần Thơ – Cửu Long",
                tips: [
                    "<strong>Từ khóa Quiz dễ gặp:</strong> Đồng bằng châu thổ rộng nhất (~40.000 km²), <strong>vựa lúa số 1 Việt Nam</strong> (&gt;50% sản lượng lúa, &gt;90% xuất khẩu gạo ST25) và dẫn đầu <strong>thủy sản, trái cây nhiệt đới</strong>.",
                    "<strong>Liên kết giao thương:</strong> Gần kề Đông Nam Bộ (kết nối chế biến – xuất khẩu) và cực lời khi chở <em>Gạo thơm ST25</em> ngược ra Miền Bắc bán giá <span class=\"hl-mint\">7 💰 Xu</span>!"
                ]
            }
        };
        return metaMap[regionId] || { shortTab: "Vùng", portName: "Thương Cảng", tips: [] };
    }

    highlightAtlasKeywords(text, kind = "terrain") {
        let out = String(text || "");
        const pairs = kind === "terrain" ? [
            [/Hoàng Liên Sơn|Karst|đất đỏ bazan|phù sa|châu thổ|hẹp ngang|dãy Trường Sơn|bán bình nguyên|40\.000 km²|đê ngăn lũ/gi, '<span class="hl-sky">$&</span>'],
            [/cao nguyên xếp tầng|vũng vịnh nước sâu|sông Tiền - sông Hậu/gi, '<span class="hl-gold">$&</span>']
        ] : kind === "climate" ? [
            [/mùa đông lạnh|gió mùa Đông Bắc|gió Phơn Tây Nam khô nóng|bão nhiệt đới|lệch về thu - đông/gi, '<span class="hl-rose">$&</span>'],
            [/vụ Đông|hai mùa mưa - khô|mùa nước nổi|Cận xích đạo|rất ít chịu ảnh hưởng trực tiếp của bão/gi, '<span class="hl-sky">$&</span>']
        ] : [
            [/số 1 cả nước|số 1 Việt Nam|lớn nhất|cao nhất|dẫn đầu|Chè|Cà phê|Bô-xít|dầu khí|Cao su|>50% sản lượng lúa|>90% xuất khẩu gạo|FDI/gi, '<span class="hl-mint">$&</span>'],
            [/than Quảng Ninh|thủy điện|thâm canh lúa nước|Kinh tế biển tổng hợp|Con đường Di sản Thế giới|thủy sản/gi, '<span class="hl-gold">$&</span>']
        ];
        pairs.forEach(([rx, rep]) => {
            out = out.replace(rx, rep);
        });
        return out;
    }

    renderAtlasMonumentCard(m) {
        const lesson = m.geographyLesson || {};
        const keyFacts = Array.isArray(lesson.keyFacts) ? lesson.keyFacts : [];
        const factsHtml = keyFacts.map(f => {
            const idx = f.indexOf(":");
            if (idx > 0 && idx < 42) {
                return `<li><strong style="color:#fde68a">${f.slice(0, idx + 1)}</strong>${f.slice(idx + 1)}</li>`;
            }
            return `<li>${f}</li>`;
        }).join("");

        const hasValidUrl = Boolean(m.photoSourceUrl && /^https?:\/\//i.test(String(m.photoSourceUrl).trim()));
        const inlineSourceParts = [m.photoAuthor, m.photoLicense].filter(Boolean);
        const citeLines = [];
        if (inlineSourceParts.length > 0) citeLines.push(`📸 ${inlineSourceParts.join(" • ")}`);
        if (hasValidUrl) {
            const cleanUrl = String(m.photoSourceUrl).trim();
            citeLines.push(`🔗 Trang nguồn gốc: <a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="atlas-lb-source-link">${cleanUrl} ↗</a>`);
        }
        if (m.articleSourceCite) citeLines.push(`📚 ${m.articleSourceCite}`);

        return `
            <div class="atlas-mon-card">
                <div class="atlas-mon-top">
                    <div class="atlas-mon-thumb-col">
                        <div class="atlas-mon-thumb-wrap" onclick="window.GAME && window.GAME.openAtlasLightboxByMonument('${m.id}')" title="Bấm để phóng to ảnh &amp; xem nguồn gốc">
                            <img src="${m.image}" alt="${m.name}" class="atlas-mon-thumb" />
                            <span class="atlas-zoom-hint-badge">🔍 Phóng to</span>
                        </div>
                        ${(inlineSourceParts.length > 0 || hasValidUrl) ? `
                            <div class="atlas-inline-credit">
                                ${m.photoAuthor ? `<div>${m.photoAuthor}</div>` : ""}
                                ${hasValidUrl ? `<a href="${String(m.photoSourceUrl).trim()}" target="_blank" rel="noopener noreferrer">Trang nguồn gốc ↗</a>` : ""}
                            </div>
                        ` : ""}
                    </div>
                    <div class="atlas-mon-info">
                        <div class="atlas-mon-head-row">
                            <span class="atlas-mon-name">🏛️ ${m.name} <span style="font-size:12px; color:#cbd5e1; font-weight:700">(${m.province})</span></span>
                            <span class="atlas-mon-relic-pill">${m.relicIcon || "✨"} ${m.relicName || "Báu Vật"}</span>
                        </div>
                        <div class="atlas-mon-headline">${lesson.headline || ""}</div>
                        ${this.isGameStarted ? `
                            <div class="atlas-mon-btn-row">
                                <button type="button" class="atlas-mon-inspect-btn" onclick="window.GAME.previewMonumentEncyclopedia('${m.id}')">
                                    🔍 Xem Di Tích
                                </button>
                            </div>
                        ` : ""}
                    </div>
                </div>
                <details class="atlas-mon-accordion">
                    <summary>📖 Tóm tắt kiến thức Địa lý &amp; Nguồn học thuật</summary>
                    <div class="atlas-mon-lesson-body">
                        <div>${lesson.summary || ""}</div>
                        ${factsHtml ? `<ul class="atlas-mon-facts">${factsHtml}</ul>` : ""}
                        ${citeLines.length > 0 ? `<div class="atlas-mon-cite">${citeLines.join("<br/>")}</div>` : ""}
                    </div>
                </details>
            </div>
        `;
    }

    // ------------------------------------------------------------------------
    // ATLAS IMAGE LIGHTBOX (EXACT VERIFIED SOURCE METADATA — ZERO FABRICATION)
    // ------------------------------------------------------------------------
    openAtlasLightboxByMonument(monId) {
        const monuments = (window.GAME_DATA && window.GAME_DATA.monuments) || [];
        const regions = (window.GAME_DATA && window.GAME_DATA.regions) || [];
        const mon = monuments.find(m => m.id === monId);
        if (!mon || !mon.image) return;
        const reg = regions.find(r => r.id === mon.regionId);
        const subParts = [mon.province, reg ? reg.name : ""].filter(Boolean);
        this.openAtlasLightbox({
            src: mon.image,
            title: mon.name || "",
            subtitle: subParts.join(" • "),
            photoAuthor: mon.photoAuthor || "",
            photoLicense: mon.photoLicense || "",
            photoSourceUrl: mon.photoSourceUrl || "",
            articleSourceCite: mon.articleSourceCite || "",
            visualCredit: ""
        });
    }

    openAtlasLightboxByVisual(imgSrc, visualCaption = "", visualCredit = "") {
        const cleanSrc = String(imgSrc || "").trim();
        if (!cleanSrc) return;
        const monuments = (window.GAME_DATA && window.GAME_DATA.monuments) || [];
        const regions = (window.GAME_DATA && window.GAME_DATA.regions) || [];
        // Match against existing monuments by exact image path or filename to surface verified metadata
        const baseName = cleanSrc.split("/").pop();
        const matchedMon = monuments.find(m =>
            m.image === cleanSrc || (baseName && m.image && m.image.split("/").pop() === baseName)
        );
        const reg = matchedMon ? regions.find(r => r.id === matchedMon.regionId) : null;
        const title = (matchedMon && matchedMon.name) || visualCaption || "Hình minh họa Địa lý";
        const subParts = [];
        if (matchedMon && matchedMon.province) subParts.push(matchedMon.province);
        if (reg && reg.name) subParts.push(reg.name);
        if (visualCaption && visualCaption !== title) subParts.push(visualCaption);

        this.openAtlasLightbox({
            src: cleanSrc,
            title,
            subtitle: subParts.join(" • "),
            photoAuthor: (matchedMon && matchedMon.photoAuthor) || "",
            photoLicense: (matchedMon && matchedMon.photoLicense) || "",
            photoSourceUrl: (matchedMon && matchedMon.photoSourceUrl) || "",
            articleSourceCite: (matchedMon && matchedMon.articleSourceCite) || "",
            visualCredit: String(visualCredit || "").trim()
        });
    }

    openAtlasLightbox(payload) {
        if (!payload || !payload.src) return;
        const overlay = document.getElementById("atlas-lightbox-overlay");
        const imgEl = document.getElementById("atlas-lb-img");
        const titleEl = document.getElementById("atlas-lb-title");
        const subEl = document.getElementById("atlas-lb-sub");
        const metaEl = document.getElementById("atlas-lb-meta");
        if (!overlay || !imgEl || !metaEl) return;

        window.SFX && window.SFX.playClick && window.SFX.playClick();
        imgEl.src = payload.src;
        imgEl.alt = payload.title || "";
        if (titleEl) titleEl.textContent = payload.title || "";
        if (subEl) {
            subEl.textContent = payload.subtitle || "";
            subEl.style.display = payload.subtitle ? "" : "none";
        }

        // Render ONLY verified non-empty fields via safe DOM APIs (NEVER fabricate missing data)
        metaEl.textContent = "";
        const appendTextLine = (icon, label, value) => {
            const cleanVal = String(value || "").trim();
            if (!cleanVal) return;
            const line = document.createElement("div");
            line.className = "atlas-lb-meta-line";
            const lbl = document.createElement("span");
            lbl.className = "atlas-lb-meta-label";
            lbl.textContent = label ? `${icon} ${label}: ` : `${icon} `;
            const val = document.createElement("span");
            val.textContent = cleanVal;
            line.appendChild(lbl);
            line.appendChild(val);
            metaEl.appendChild(line);
        };

        const authorLic = [payload.photoAuthor, payload.photoLicense]
            .map(s => String(s || "").trim())
            .filter(Boolean)
            .join(" • ");
        if (authorLic) appendTextLine("📸", "", authorLic);

        const rawUrl = String(payload.photoSourceUrl || "").trim();
        if (/^https?:\/\//i.test(rawUrl)) {
            const line = document.createElement("div");
            line.className = "atlas-lb-meta-line";
            const lbl = document.createElement("span");
            lbl.className = "atlas-lb-meta-label";
            lbl.textContent = "🔗 Trang nguồn gốc: ";
            const a = document.createElement("a");
            a.className = "atlas-lb-source-link";
            a.href = rawUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = `${rawUrl} ↗`;
            line.appendChild(lbl);
            line.appendChild(a);
            metaEl.appendChild(line);
        }

        if (payload.visualCredit) appendTextLine("⚖️", "Trích dẫn ảnh", payload.visualCredit);
        if (payload.articleSourceCite) appendTextLine("📚", "", payload.articleSourceCite);

        metaEl.style.display = metaEl.childNodes.length > 0 ? "" : "none";
        overlay.classList.remove("hidden");
    }

    closeAtlasLightbox() {
        const overlay = document.getElementById("atlas-lightbox-overlay");
        if (overlay) overlay.classList.add("hidden");
    }

    isAtlasLightboxOpen() {
        const overlay = document.getElementById("atlas-lightbox-overlay");
        return Boolean(overlay && !overlay.classList.contains("hidden"));
    }

    renderAtlasBodyHtml(activeTab = "all", searchQuery = "") {
        const allRegions = (window.GAME_DATA && window.GAME_DATA.regions) || [];
        const allMonuments = (window.GAME_DATA && window.GAME_DATA.monuments) || [];
        const normQ = this.normalizeRuleSearch(searchQuery);

        // LIVE CROSS-ATLAS SEARCH MODE
        if (normQ) {
            const matchedRegions = allRegions.filter(r => {
                const meta = this.getAtlasRegionMeta(r.id);
                const hay = this.normalizeRuleSearch(
                    `${r.name} ${r.enName} ${r.code} ${meta.portName} ${r.terrainDesc} ${r.climateDesc} ${r.strengths} ${r.specialty.name} ${r.specialty.shortName} ${r.specialty.desc} ${meta.tips.join(" ")}`
                );
                return hay.includes(normQ);
            });
            const matchedMons = allMonuments.filter(m => {
                const lesson = m.geographyLesson || {};
                const hay = this.normalizeRuleSearch(
                    `${m.name} ${m.enName || ""} ${m.province} ${m.relicName || ""} ${lesson.headline || ""} ${lesson.summary || ""} ${(lesson.keyFacts || []).join(" ")}`
                );
                return hay.includes(normQ);
            });

            const totalHits = matchedRegions.length + matchedMons.length;
            if (totalHits === 0) {
                return `
                    <div class="rule-visual-card" style="text-align:center; padding:24px 16px; margin-bottom:12px">
                        <div style="font-size:24px; margin-bottom:6px">🔍</div>
                        <div style="font-weight:800; color:#fde68a">Không tìm thấy Vùng, Đặc sản hoặc Di tích khớp với "${searchQuery.replace(/[<>&"]/g, "")}"</div>
                        <div style="font-size:12px; color:#9cc4d4; margin-top:4px">Thử tìm: <strong>Hạ Long, Cà phê, Bazan, Gió Lào, ST25, Quy Nhơn, Hải Phòng</strong></div>
                    </div>
                `;
            }

            return `
                <div style="font-size:12px; font-weight:800; color:#123142; margin-bottom:9px">
                    🔎 Tìm thấy <strong>${totalHits}</strong> kết quả (${matchedRegions.length} Vùng/Đặc sản • ${matchedMons.length} Di tích):
                </div>
                ${matchedRegions.length > 0 ? `
                    <div class="atlas-overview-grid">
                        ${matchedRegions.map(r => {
                            const meta = this.getAtlasRegionMeta(r.id);
                            const mons = allMonuments.filter(m => m.regionId === r.id);
                            return `
                                <div class="atlas-ov-card" onclick="window.GAME.openAtlasModal('${r.id}')" title="Bấm để xem chi tiết ${r.name}">
                                    <div class="atlas-ov-colorbar" style="background:${r.color}"></div>
                                    <div class="atlas-ov-body">
                                        <div class="atlas-ov-top">
                                            <span class="atlas-ov-name">${r.id + 1}. ${r.name}</span>
                                            <span class="atlas-code-pill">${r.code}</span>
                                        </div>
                                        <div class="atlas-ov-badges">
                                            <div class="atlas-ov-line"><strong>⚓ Cảng:</strong> <span>${meta.portName}</span></div>
                                            <div class="atlas-ov-line"><strong>📦 Đặc sản:</strong> <span>${r.specialty.icon} ${r.specialty.shortName}</span></div>
                                            <div class="atlas-ov-line"><strong>🏛️ Di tích (${mons.length}):</strong> <span>${mons.map(m => m.name).join(" • ")}</span></div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                ` : ""}
                ${matchedMons.length > 0 ? `
                    <div class="atlas-section-title">🏛️ Di Tích Khớp Từ Khóa (${matchedMons.length})</div>
                    <div class="atlas-mon-list">
                        ${matchedMons.map(m => this.renderAtlasMonumentCard(m)).join("")}
                    </div>
                ` : ""}
            `;
        }

        // TAB 0: 🇻🇳 TOÀN CẢNH 6 VÙNG (NORTH -> SOUTH OVERVIEW GRID)
        if (activeTab === "all") {
            return `
                <div class="atlas-overview-grid">
                    ${allRegions.map(r => {
                        const meta = this.getAtlasRegionMeta(r.id);
                        const mons = allMonuments.filter(m => m.regionId === r.id);
                        return `
                            <div class="atlas-ov-card" onclick="window.GAME.openAtlasModal('${r.id}')" title="Bấm để mở hồ sơ chi tiết ${r.name}">
                                <div class="atlas-ov-colorbar" style="background:${r.color}"></div>
                                <div class="atlas-ov-body">
                                    <div class="atlas-ov-top">
                                        <span class="atlas-ov-name">${r.id + 1}. ${r.name}</span>
                                        <span class="atlas-code-pill">${r.code}</span>
                                    </div>
                                    <div class="atlas-ov-badges">
                                        <div class="atlas-ov-line"><strong>⚓ Cảng:</strong> <span>${meta.portName}</span></div>
                                        <div class="atlas-ov-line"><strong>📦 Đặc sản:</strong> <span>${r.specialty.icon} ${r.specialty.shortName}</span></div>
                                        <div class="atlas-ov-line"><strong>🏛️ Di tích (${mons.length}):</strong> <span>${mons.map(m => m.name).join(" • ")}</span></div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            `;
        }

        // DETAIL TAB FOR REGION 0..5
        const r = allRegions.find(reg => String(reg.id) === String(activeTab)) || allRegions[0];
        if (!r) return "";
        const meta = this.getAtlasRegionMeta(r.id);
        const mons = allMonuments.filter(m => m.regionId === r.id);

        return `
            <div class="atlas-hero-strip" style="border-left-color:${r.color}">
                <div class="atlas-hero-top">
                    <div>
                        <h3 class="atlas-hero-title">${r.id + 1}. ${r.name}</h3>
                        <div class="atlas-hero-en">${r.enName}</div>
                    </div>
                    <span class="atlas-code-pill">${r.code}</span>
                </div>
                <div class="atlas-hero-pills">
                    <span class="atlas-meta-pill">⚓ ${meta.portName}</span>
                    <span class="atlas-meta-pill is-gold">${r.specialty.icon} Đặc sản: ${r.specialty.shortName}</span>
                    <span class="atlas-meta-pill">🏛️ ${mons.length} Di tích</span>
                </div>
            </div>

            <div class="atlas-3pillar-grid">
                <div class="atlas-pillar-card">
                    <div class="atlas-pillar-head"><span>⛰️</span><span>Địa Hình &amp; Thổ Nhưỡng</span></div>
                    <div>${this.highlightAtlasKeywords(r.terrainDesc, "terrain")}</div>
                </div>
                <div class="atlas-pillar-card">
                    <div class="atlas-pillar-head"><span>🌦️</span><span>Khí Hậu &amp; Thủy Văn</span></div>
                    <div>${this.highlightAtlasKeywords(r.climateDesc, "climate")}</div>
                </div>
                <div class="atlas-pillar-card">
                    <div class="atlas-pillar-head"><span>🏭</span><span>Thế Mạnh Kinh Tế</span></div>
                    <div>${this.highlightAtlasKeywords(r.strengths, "strengths")}</div>
                </div>
            </div>

            <div class="atlas-spec-banner">
                <div class="atlas-spec-big-icon">${r.specialty.icon}</div>
                <div class="atlas-spec-content">
                    <div class="atlas-spec-title">📦 Đặc Sản Vùng: ${r.specialty.name}</div>
                    <div class="atlas-spec-desc">${r.specialty.desc}</div>
                    <div class="atlas-spec-trade-strip">
                        <span>Giá gốc tại cảng: <span class="hl-gold">2 💰</span></span>
                        <span>•</span>
                        <span>Chiến thuật: Mua tại <strong>${meta.portName}</strong> → Chở sang vùng khác bán ăn chênh lệch (<span class="hl-mint">+1 đến +5 💰</span>) hoặc trả Nhiệm Vụ Chung.</span>
                    </div>
                </div>
            </div>

            <div class="atlas-section-title">🏛️ Di Tích Lịch Sử – Địa Lý Của Vùng (${mons.length})</div>
            <div class="atlas-mon-list">
                ${mons.map(m => this.renderAtlasMonumentCard(m)).join("")}
            </div>

            <details class="rule-accordion">
                <summary>💡 Mẹo Giao Thương &amp; Ghi Nhớ Nhanh Vùng Này</summary>
                <div class="rule-accordion-body">
                    ${meta.tips.map(t => `<div>• ${t}</div>`).join("")}
                </div>
            </details>
        `;
    }

    filterAtlasSearch(val) {
        this.atlasSearchQuery = String(val || "");
        const bodyEl = document.getElementById("atlas-dynamic-body");
        const clearBtn = document.getElementById("atlas-search-clear");
        if (clearBtn) clearBtn.classList.toggle("hidden", !this.atlasSearchQuery.trim());
        if (bodyEl) {
            bodyEl.innerHTML = this.renderAtlasBodyHtml(this.selectedAtlasTab || "all", this.atlasSearchQuery);
        }
    }

    clearAtlasSearch() {
        const inp = document.getElementById("atlas-search-input");
        if (inp) {
            inp.value = "";
            inp.focus();
        }
        this.filterAtlasSearch("");
    }

    openAtlasModal(regionFilter = "all") {
        const allRegions = (window.GAME_DATA && window.GAME_DATA.regions) || [];
        const activeTab = (regionFilter === undefined || regionFilter === null) ? "all" : String(regionFilter);
        this.selectedAtlasTab = activeTab;
        this.atlasSearchQuery = "";

        const navTabs = [
            { id: "all", shortLabel: "Toàn Cảnh", label: "🇻🇳 Toàn Cảnh 6 Vùng", color: null },
            ...allRegions.map(r => {
                const meta = this.getAtlasRegionMeta(r.id);
                return { id: String(r.id), shortLabel: meta.shortTab, label: meta.shortTab, color: r.color };
            })
        ];
        const curIdx = Math.max(0, navTabs.findIndex(t => t.id === activeTab));
        const prevTab = curIdx > 0 ? navTabs[curIdx - 1] : null;
        const nextTab = curIdx < navTabs.length - 1 ? navTabs[curIdx + 1] : null;
        const posLabel = curIdx === 0 ? "Toàn cảnh" : `Vùng ${curIdx}/6`;

        const html = `
            <div class="modal-sticky-top">
                <div class="rule-header-bar">
                    <div>
                        <div class="modal-header-badge" style="background:#123142; border-color:#e6b84a; color:#fde68a; margin-bottom:2px">
                            <span>🗺️ CẨM NANG 6 VÙNG KINH TẾ VIỆT NAM — ATLAS HẢI TRÌNH</span>
                        </div>
                    </div>
                    <div class="rule-search-wrap">
                        <input type="text" id="atlas-search-input" class="rule-search-input"
                               placeholder="🔍 Tìm nhanh: Hạ Long, Cà phê, Bazan, Gió Lào, ST25..."
                               oninput="window.GAME && window.GAME.filterAtlasSearch(this.value)" />
                        <button type="button" id="atlas-search-clear" class="rule-search-clear hidden"
                                title="Xóa tìm kiếm" onclick="window.GAME && window.GAME.clearAtlasSearch()">✕</button>
                    </div>
                </div>
                <div class="rule-cat-tabs">
                    ${navTabs.map(t => `
                        <button class="rule-cat-tab ${activeTab === t.id ? 'active' : ''}"
                                onclick="window.GAME.openAtlasModal('${t.id}')">
                            ${t.color ? `<span class="atlas-tab-dot" style="background:${t.color}"></span>` : ""}${t.label}
                        </button>
                    `).join("")}
                </div>
            </div>

            <div id="atlas-dynamic-body">
                ${this.renderAtlasBodyHtml(activeTab, "")}
            </div>

            <div class="rule-footer-nav">
                <div class="rule-nav-left-right">
                    <button type="button" class="btn-secondary" ${prevTab ? '' : 'disabled'}
                            onclick="${prevTab ? `window.GAME.openAtlasModal('${prevTab.id}')` : ''}">
                        ← Trước
                    </button>
                    <div class="rule-progress-dots" title="${posLabel}">
                        ${navTabs.map((t, i) => `<span class="rule-pdot ${i === curIdx ? 'active' : ''}" onclick="window.GAME.openAtlasModal('${t.id}')" title="${t.label}"></span>`).join("")}
                        <span style="margin-left:4px">${posLabel}</span>
                    </div>
                </div>
                <div class="rule-nav-left-right">
                    ${nextTab ? `
                        <button type="button" class="btn-secondary" onclick="window.GAME.openAtlasModal('${nextTab.id}')">
                            Tiếp theo: ${nextTab.shortLabel} →
                        </button>
                    ` : ''}
                    <button type="button" class="btn-primary-gold" onclick="window.GAME.closeModal()">
                        ⚓ Đóng Cẩm Nang
                    </button>
                </div>
            </div>
        `;
        this.showModal(html);

        const searchInp = document.getElementById("atlas-search-input");
        if (searchInp) {
            searchInp.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    if (searchInp.value) {
                        this.clearAtlasSearch();
                    } else {
                        this.closeModal();
                    }
                }
            });
        }
    }

    previewMonumentEncyclopedia(monId) {
        const tile = this.world.hexTiles.find(t => t.monumentId === monId);
        if (tile) {
            this.openMonumentModal(tile);
        }
    }

    // ------------------------------------------------------------------------
    // VISUAL 5-TAB RULEBOOK MODAL (V3 — SPACIOUS, COLOR-CODED, STICKY HEADER)
    // ------------------------------------------------------------------------
    // UPGRADED STRATEGY RULEBOOK (5 VISUAL TABS + LIVE SEARCH + QUICK NAV)
    // ------------------------------------------------------------------------
    normalizeRuleSearch(str) {
        return String(str || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .trim();
    }

    getRulebookCatalog() {
        const tabs = [
            { id: "overview", shortLabel: "Chơi Trong 30s", label: "🚀 Chơi Trong 30s" },
            { id: "movement_reef", shortLabel: "Lái Tàu & Điều Khiển", label: "⛵ Lái Tàu & Điều Khiển" },
            { id: "port_market", shortLabel: "Cảng & Chợ P2P", label: "⚖️ Cảng & Chợ P2P" },
            { id: "monuments_quests", shortLabel: "Di Tích & Nhiệm Vụ", label: "🏛️ Di Tích & Nhiệm Vụ" },
            { id: "weather_events", shortLabel: "Thời Tiết & Sự Kiện", label: "⛈️ Thời Tiết & Sự Kiện" }
        ];

        // Searchable individual cards across all 5 tabs (also used for live cross-tab search!)
        const searchableCards = [
            // TAB 1
            {
                tabId: "overview",
                keywords: "thang 15 sao 45 phut bi mat hoa diem di tich p2p xu muc tieu",
                html: `
                    <div class="rule-hero-banner">
                        <div>
                            <h3>🏆 Mục Tiêu Chiến Thắng</h3>
                            <p>Chạm mốc <span class="hl-gold">15 ⭐ Thịnh Vượng</span> trước — HOẶC dẫn đầu khi hết <span class="hl-sky">45:00</span> (cộng điểm <strong>Lật Bài Nhiệm Vụ Bí Mật</strong>; hòa xét: Di tích → P2P → Xu).</p>
                        </div>
                    </div>
                `
            },
            {
                tabId: "overview",
                keywords: "chi so ap mau hp xu von kho hang 12 16 o 30 xu 5 ap 3 ap di chuyen",
                html: `
                    <div class="rule-stat-strip">
                        <div class="rule-stat-box"><span class="rs-icon">⚡</span><strong>5 AP/lượt</strong><small>Max 3 AP đi</small></div>
                        <div class="rule-stat-box"><span class="rs-icon">❤️</span><strong>5 HP</strong><small>Độ bền tàu</small></div>
                        <div class="rule-stat-box"><span class="rs-icon">💰</span><strong>3 → 30 Xu</strong><small>Vốn đầu → Trần</small></div>
                        <div class="rule-stat-box"><span class="rs-icon">📦</span><strong>12 → 16 Ô</strong><small>Nâng sau Di tích 1</small></div>
                        <div class="rule-stat-box"><span class="rs-icon">⭐</span><strong>15 Điểm</strong><small>Mốc Chiến Thắng</small></div>
                    </div>
                `
            },
            {
                tabId: "overview",
                keywords: "luot choi 4 buoc lai tau khai thac giao thuong di tich nhiem vu xong luot",
                html: `
                    <div class="rule-flow-steps">
                        <div class="rule-flow-step"><strong>1️⃣ Lái Tàu</strong><small>Đi tối đa <span class="hl-sky">6 ô</span> (3 AP) né đá ngầm.</small></div>
                        <div class="rule-flow-arrow">→</div>
                        <div class="rule-flow-step"><strong>2️⃣ Khai Thác / Cảng</strong><small>Đào mỏ hoặc mua bán Đặc sản, Key.</small></div>
                        <div class="rule-flow-arrow">→</div>
                        <div class="rule-flow-step"><strong>3️⃣ Di Tích / Nhiệm Vụ</strong><small>Giải Quiz ăn ⭐ &amp; nâng kho 16 ô.</small></div>
                        <div class="rule-flow-arrow">→</div>
                        <div class="rule-flow-step"><strong>4️⃣ Xong Lượt</strong><small>Bấm Xong Lượt hoặc chờ tự chuyển.</small></div>
                    </div>
                `
            },
            // TAB 2
            {
                tabId: "movement_reef",
                keywords: "di chuyen 2 buoc da ngam lai tau keo chuot chuot phai huy duong toc do 1 ap 2 o",
                html: `
                    <div class="rule-visual-card">
                        <div class="rule-card-head">
                            <span class="rule-card-icon">🧭</span>
                            <h4>Di Chuyển 2 Bước &amp; Né Đá Ngầm</h4>
                        </div>
                        <ul class="rule-formula-list">
                            <li>📍 <strong>Bấm lần 1:</strong> Khóa đường đi dự kiến (hoặc <strong>giữ kéo chuột</strong> vẽ đường lách né Bãi Đá Ngầm).</li>
                            <li>⛵ <strong>Bấm lần 2 / thả chuột:</strong> Tàu chạy; bấm <span class="rule-kbd">Chuột phải</span> hoặc <span class="rule-kbd">Esc</span> để hủy đường.</li>
                            <li>⚡ <strong>Tốc độ:</strong> Ngày thường <span class="hl-sky">1 AP = 2 ô</span> (max 6 ô) • Siêu Bão Yagi <span class="hl-rose">1 AP = 1 ô</span>.</li>
                            <li>🪨 <strong>Bãi Đá Ngầm:</strong> Đi ngang hoặc dừng lên mất <span class="hl-rose">-1 ❤️ HP</span> mỗi ô.</li>
                        </ul>
                    </div>
                `
            },
            {
                tabId: "movement_reef",
                keywords: "afk 50s 45s 5s may dang tu dong tu chuyen luot 0 ap bien trong dong bang dong ho bot",
                html: `
                    <div class="rule-visual-card">
                        <div class="rule-card-head">
                            <span class="rule-card-icon">🤖</span>
                            <h4>Tự Chuyển Lượt &amp; Chống AFK 50s</h4>
                        </div>
                        <ul class="rule-formula-list">
                            <li>⏭️ <strong>Hết sạch 0 AP:</strong> Tự chuyển lượt sau <span class="hl-gold">5s</span> (PvP).</li>
                            <li>🌊 <strong>Hết AP đi ở biển trống:</strong> Chờ <span class="hl-sky">5s</span> (đủ bấm Sửa tàu) → đếm ngược <span class="hl-gold">5s</span> tự xong lượt.</li>
                            <li>🤖 <strong>AFK 50s (45s + 5s):</strong> Bot lái thay (<span class="hl-mint">0 phạt Xu/HP</span>), hiện bảng <strong>"Máy đang tự động"</strong>.</li>
                            <li>✋ <strong>Lấy lại quyền lái:</strong> Chạm/bấm bất kỳ đâu trên màn hình (đồng hồ 45:00 tự <code>⏸️</code> sau 45s đứng yên).</li>
                        </ul>
                    </div>
                `
            },
            {
                tabId: "movement_reef",
                keywords: "phim tat l nhan ban do esc sua tau bao hiem hang hai 10 xu hoi 2 hp",
                html: `
                    <div class="rule-visual-card full-span">
                        <div class="rule-card-head">
                            <span class="rule-card-icon">⌨️</span>
                            <h4>Phím Tắt, Hiển Thị &amp; Sinh Tồn</h4>
                        </div>
                        <ul class="rule-formula-list">
                            <li>🏷️ Phím <span class="rule-kbd">L</span>: Xoay 4 chế độ nhãn bản đồ (<span class="hl-sky">Gọn → Đầy đủ → Vùng &amp; Bão → Ẩn</span>) • <span class="rule-kbd">Esc</span>: Đóng cửa sổ / hủy đường.</li>
                            <li>🛠️ <strong>Sửa tàu:</strong> <span class="hl-gold">1 AP + 1 💰 + 1 🌲 = +1 ❤️ HP</span> • <strong>🛡️ Bảo Hiểm Hàng Hải</strong> (<span class="hl-gold">10 💰</span>): Tự hồi <span class="hl-mint">+2 ❤️ HP</span> khi máu về 0 (<span class="hl-mint">0 ô kho</span>).</li>
                        </ul>
                    </div>
                `
            },
            // TAB 3
            {
                tabId: "port_market",
                keywords: "cang thuong quyen thue 1 xu 0 xu tu do dong nam bo p2p barter 0% thue 0 ap dac san xuat khau 5 phut",
                html: `
                    <div class="rule-vs-grid">
                        <div class="rule-visual-card">
                            <div class="rule-card-head">
                                <span class="rule-card-icon">⚓</span>
                                <h4>6 Thương Cảng</h4>
                            </div>
                            <ul class="rule-formula-list">
                                <li>👑 <strong>Thuế cập bến:</strong> Miễn thuế Cảng nhà &amp; Đông Nam Bộ; cảng đối thủ tốn <span class="hl-rose">1 💰</span> (0 Xu bị chặn).</li>
                                <li>📦 <strong>Kho cảng:</strong> Tối đa <span class="hl-sky">3/món</span>, tự làm mới mỗi <span class="hl-gold">5 phút</span> (Key làm mới mỗi <span class="hl-sky">08:30</span>).</li>
                                <li>💎 <strong>Đặc sản &amp; Xuất khẩu:</strong> Mua <span class="hl-gold">2 💰</span> → bán xa lãi tới <span class="hl-mint">+5 💰</span>; xuất thô <span class="hl-gold">1 💰</span> tại cảng nhà.</li>
                            </ul>
                        </div>
                        <div class="rule-vs-badge">VS</div>
                        <div class="rule-visual-card">
                            <div class="rule-card-head">
                                <span class="rule-card-icon">🤝</span>
                                <h4>Chợ P2P Tự Do</h4>
                            </div>
                            <ul class="rule-formula-list">
                                <li>⚡ <strong>Chi phí:</strong> <span class="hl-mint">0% Thuế</span> • <span class="hl-mint">0 AP</span> • Giao dịch mọi lúc kể cả <strong>ngoài lượt</strong>!</li>
                                <li>🔄 <strong>3 Loại kèo:</strong> Bán lấy Xu (ẩn danh), Đăng Mua Xu (ẩn danh), Đổi Hàng Barter (công khai).</li>
                                <li>🌾 <strong>Hàng hóa:</strong> Lúa, Gỗ, Sắt &amp; Đặc sản (không giao dịch Key &amp; Bảo Hiểm).</li>
                            </ul>
                        </div>
                    </div>
                `
            },
            // TAB 4
            {
                tabId: "monuments_quests",
                keywords: "di tich cap 1 cap 2 cap 3 quiz khoa 12 16 o bay tru hp",
                html: `
                    <div class="rule-tier-3grid">
                        <div class="rule-tier-card tier-1">
                            <div class="rule-tier-head"><span>★ Di Tích Cấp 1</span><span>2 Ô</span></div>
                            <div>🔑 Phí: <span class="hl-gold">Key 1 + 1🌾 + 2💰</span></div>
                            <div>🎁 Đúng: <span class="hl-mint">+1 ⭐, +4 💰, +Key 2</span></div>
                            <div>⚠️ Sai: <span class="hl-rose">-1 ❤️ HP</span> (max 1 lần)</div>
                        </div>
                        <div class="rule-tier-card tier-2">
                            <div class="rule-tier-head"><span>★★ Di Tích Cấp 2</span><span>4 Ô</span></div>
                            <div>🔑 Phí: <span class="hl-gold">Key 2 + 2🌾 + 3💰</span></div>
                            <div>🎁 Đúng: <span class="hl-mint">+3 ⭐, +4 💰</span></div>
                            <div>⚠️ Sai: <span class="hl-rose">-2 ❤️ HP</span> (mở 08:30)</div>
                        </div>
                        <div class="rule-tier-card tier-3">
                            <div class="rule-tier-head"><span>★★★ Di Tích Cấp 3</span><span>3 Ô</span></div>
                            <div>🔑 Phí: <span class="hl-gold">Key 3 + 3🌾 + 1⛏️ + 6💰</span></div>
                            <div>🎁 Đúng: <span class="hl-mint">+5 ⭐, +5 💰</span></div>
                            <div>⚠️ Sai: <span class="hl-rose">-3 ❤️ HP</span> &amp; khóa ô</div>
                        </div>
                    </div>
                `
            },
            {
                tabId: "monuments_quests",
                keywords: "key khan hiem 1 key cap 0 o kho khoa mua chinh phuc het 08:30 nang kho 16",
                html: `
                    <div class="rule-visual-card">
                        <div class="rule-card-head">
                            <span class="rule-card-icon">🔑</span>
                            <h4>Key Khan Hiếm &amp; Nâng Kho 16 Ô</h4>
                        </div>
                        <ul class="rule-formula-list">
                            <li>🗝️ <strong>Giới hạn Key:</strong> Tối đa <span class="hl-gold">1 Key/cấp</span> (<span class="hl-mint">0 ô kho</span>); trước <span class="hl-sky">08:30</span> chỉ bán Key 1.</li>
                            <li>🔒 <strong>Khóa tự động:</strong> Chinh phục hết Di tích cấp nào → Key cấp đó <strong>khóa mua ngay</strong> tại mọi cảng.</li>
                            <li>📦 <strong>Nâng kho vĩnh viễn:</strong> Ăn <strong>Di tích đầu tiên</strong> (mọi cấp) nâng ngay kho <span class="hl-mint">12 → 16 ô</span>!</li>
                        </ul>
                    </div>
                `
            },
            {
                tabId: "monuments_quests",
                keywords: "nhiem vu chung bi mat chuoi thong thai 5/5 +1 ap 6 ap",
                html: `
                    <div class="rule-visual-card">
                        <div class="rule-card-head">
                            <span class="rule-card-icon">📋</span>
                            <h4>Nhiệm Vụ &amp; Chuỗi Thông Thái</h4>
                        </div>
                        <ul class="rule-formula-list">
                            <li>📋 <strong>Nhiệm Vụ Chung:</strong> <span class="hl-gold">3 đơn công khai</span> — trả tại cảng lấy <span class="hl-gold">+2~3 ⭐</span> &amp; Xu.</li>
                            <li>🕵️ <strong>Nhiệm Vụ Bí Mật:</strong> <span class="hl-sky">2 thẻ giấu điểm</span> — chỉ lật bài cộng điểm khi chốt thắng / hết 45:00.</li>
                            <li>🔥 <strong>Chuỗi Thông Thái 5/5:</strong> Đúng 5 Quiz liên tiếp → tặng <span class="hl-mint">+1 AP miễn phí</span> (6 AP) lượt sau!</li>
                        </ul>
                    </div>
                `
            },
            // TAB 5
            {
                tabId: "weather_events",
                keywords: "thoi tiet 6 pha nang mua giong bao hoang hon dem sao sieu bao yagi",
                html: `
                    <div class="rule-weather-timeline">
                        <div class="rule-wphase-node"><span class="rw-ic">☀️</span><strong>Nắng</strong><small>00–15p</small></div>
                        <div class="rule-wphase-node"><span class="rw-ic">🌧️</span><strong>Mưa</strong><small>15–20p</small></div>
                        <div class="rule-wphase-node is-storm"><span class="rw-ic">⛈️</span><strong>Giông Bão</strong><small>20–27p</small></div>
                        <div class="rule-wphase-node"><span class="rw-ic">🌅</span><strong>Hoàng Hôn</strong><small>27–29p</small></div>
                        <div class="rule-wphase-node"><span class="rw-ic">🌌</span><strong>Đêm Sao</strong><small>29–34p</small></div>
                        <div class="rule-wphase-node is-yagi"><span class="rw-ic">🌀</span><strong>Bão Yagi</strong><small>34–45p</small></div>
                    </div>
                `
            },
            {
                tabId: "weather_events",
                keywords: "giong bao phong toa 6 mo lua go sat doc hieu 1 phut 30 giay set danh",
                html: `
                    <div class="rule-visual-card alert-storm">
                        <div class="rule-card-head">
                            <span class="rule-card-icon">⛈️</span>
                            <h4>Cảnh Báo: Giông Bão (20:00–27:00)</h4>
                        </div>
                        <ul class="rule-formula-list">
                            <li>⛔ <strong>Phong tỏa công bằng 6 mỏ:</strong> Khóa đều <span class="hl-gold">2 Lúa – 2 Gỗ – 2 Sắt</span> (vẫn chừa mỏ mở; đi ngang được).</li>
                            <li>📖 <strong>Đọc Hiểu Địa Lý chung:</strong> Cả phòng đọc chung 1 bài (<span class="hl-rose">01:30</span>), sai/hết giờ mất <span class="hl-rose">-2 ❤️ HP</span>.</li>
                        </ul>
                    </div>
                `
            },
            {
                tabId: "weather_events",
                keywords: "sieu bao yagi 1 ap 1 o 4 ap cau hoi bao set danh luy tien -1 -2 -3 hp",
                html: `
                    <div class="rule-visual-card alert-yagi">
                        <div class="rule-card-head">
                            <span class="rule-card-icon">🌀</span>
                            <h4>Báo Động Đỏ: Siêu Bão Yagi (34:00–45:00)</h4>
                        </div>
                        <ul class="rule-formula-list">
                            <li>🌊 <strong>Sóng dữ cực chậm:</strong> <span class="hl-rose">1 AP = 1 ô</span> (max 3 ô/lượt); đào mỏ sai bị Sét đánh <span class="hl-rose">-1 ❤️ HP</span>.</li>
                            <li>⚡ <strong>Câu Hỏi Tâm Bão (hết 4 AP):</strong> Đúng <span class="hl-gold">+1 💰</span> • Sai bị Sét đánh lũy tiến <span class="hl-rose">-1 → -2 → -3 ❤️ HP</span>!</li>
                        </ul>
                    </div>
                `
            },
            {
                tabId: "weather_events",
                keywords: "tau fdi thuong doan quoc te 2 3 xu quiz thu gon dong ho dem nguoc",
                html: `
                    <div class="rule-visual-card full-span">
                        <div class="rule-card-head">
                            <span class="rule-card-icon">🚢</span>
                            <h4>Thương Đoàn Quốc Tế (Tàu FDI) &amp; Quiz Thu Gọn</h4>
                        </div>
                        <ul class="rule-formula-list">
                            <li>🚢 <strong>Tàu FDI:</strong> Xuất hiện trên biển mỗi 4–5 vòng — trả lời đúng khảo sát nhận ngay <span class="hl-gold">+2 đến +3 💰</span>!</li>
                            <li>⏱️ <strong>Quiz Thu Gọn:</strong> Mọi câu hỏi đều có đồng hồ đếm ngược &amp; nút <strong>Thu gọn</strong> để soi bản đồ rồi bấm mở lại.</li>
                        </ul>
                    </div>
                `
            }
        ];

        const tabAccordions = {
            overview: `
                <details class="rule-accordion">
                    <summary>💡 Mẹo cho ván đầu tiên</summary>
                    <div class="rule-accordion-body">
                        <div>• <strong>Ưu tiên mở Di tích đầu tiên:</strong> Chinh phục bất kỳ Di tích nào sẽ lập tức nâng kho vĩnh viễn <span class="hl-mint">12 → 16 ô</span> giúp ôm hàng cực khỏe.</div>
                        <div>• <strong>Tận dụng Chợ P2P (0% thuế, 0 AP):</strong> Đổi hàng với đối thủ ngay cả khi chưa tới lượt mình để gom đủ nguyên liệu mở Di tích!</div>
                    </div>
                </details>
            `,
            movement_reef: `
                <details class="rule-accordion">
                    <summary>💡 Mẹo lái tàu &amp; quan sát bản đồ chuẩn</summary>
                    <div class="rule-accordion-body">
                        <div>• <strong>Chế độ nhãn Vùng &amp; Bão:</strong> Khi vào pha Giông Bão, bấm <span class="rule-kbd">L</span> chuyển sang <em>Vùng &amp; Bão</em> để thấy rõ 6 mỏ bị phong tỏa.</div>
                        <div>• <strong>Vẽ đường né Đá Ngầm:</strong> Giữ chuột trái kéo từng ô nước quanh đá ngầm thay vì bấm thẳng 1 phát vào đích!</div>
                    </div>
                </details>
            `,
            port_market: `
                <details class="rule-accordion">
                    <summary>💡 Chi tiết 6 Vùng Kinh Tế &amp; Thương Quyền 5+1</summary>
                    <div class="rule-accordion-body">
                        <div>• <strong>Thương Quyền 5+1:</strong> Đầu trận chia ngẫu nhiên 5 vùng (Cái Lân, Hải Phòng, Tiên Sa, Quy Nhơn, Cần Thơ) cho 5 tàu; riêng <strong>Đông Nam Bộ (Cái Mép)</strong> luôn là <span class="hl-mint">Vùng Tự Do (Thuế 0 Xu)</span>.</div>
                        <div>• <strong>Lãi buôn Đặc sản xuyên Việt:</strong> Mua <span class="hl-gold">2 💰</span> → cách 1 vùng bán <span class="hl-mint">3 💰 (+1)</span> • cách 2 vùng <span class="hl-mint">5 💰 (+3)</span> • ≥ 3 vùng <span class="hl-mint">7 💰 (+5)</span>!</div>
                        <div>• <strong>Khai thác Mỏ (1 AP):</strong> Đúng <span class="hl-mint">+2 tài nguyên</span> / Sai <span class="hl-gold">+1 tài nguyên</span> (hồi: Lúa 2v, Gỗ 3v, Sắt 4v).</div>
                    </div>
                </details>
            `,
            monuments_quests: `
                <details class="rule-accordion">
                    <summary>💡 Mẹo tối ưu Di Tích &amp; Giấu Điểm Bí Mật</summary>
                    <div class="rule-accordion-body">
                        <div>• <strong>Tầm nhìn Key:</strong> Bạn chỉ soi được kho Key của <em>Cảng đang đậu</em> và <em>Cảng Thương Quyền nhà</em> — hãy ghé sớm sau mốc <span class="hl-sky">08:30</span>.</div>
                        <div>• <strong>Cú lật kèo cuối trận:</strong> 2 thẻ Nhiệm Vụ Bí Mật cộng tới <span class="hl-gold">+4 ⭐</span> ẩn — giữ kín tới phút 45:00 để bứt top bất ngờ!</div>
                    </div>
                </details>
            `,
            weather_events: `
                <details class="rule-accordion">
                    <summary>💡 Mẹo tận dụng Hoàng Hôn / Đêm Sao &amp; vượt Bão Yagi</summary>
                    <div class="rule-accordion-body">
                        <div>• <strong>Giờ vàng hồi mỏ (27:00–34:00):</strong> Trong pha Hoàng Hôn &amp; Đêm Sao, mọi mỏ tài nguyên được <span class="hl-mint">giảm 1 vòng hồi phục</span>.</div>
                        <div>• <strong>Sống sót qua Bão Yagi:</strong> Giữ sẵn <strong>🛡️ Bảo Hiểm Hàng Hải</strong> hoặc dừng ở 3 AP khi máu yếu để tránh kích hoạt Câu Hỏi Tâm Bão ở mốc 4 AP!</div>
                    </div>
                </details>
            `
        };

        return { tabs, searchableCards, tabAccordions };
    }

    renderRulebookBodyHtml(activeTab, searchQuery = "") {
        const { tabs, searchableCards, tabAccordions } = this.getRulebookCatalog();
        const normQ = this.normalizeRuleSearch(searchQuery);

        if (normQ) {
            const matched = searchableCards.filter(c => {
                const hay = this.normalizeRuleSearch(`${c.keywords} ${c.html.replace(/<[^>]+>/g, " ")}`);
                return hay.includes(normQ);
            });
            if (matched.length === 0) {
                return `
                    <div class="rule-visual-card" style="text-align:center; padding:24px 16px; margin-bottom:12px">
                        <div style="font-size:24px; margin-bottom:6px">🔍</div>
                        <div style="font-weight:800; color:#fde68a">Không tìm thấy quy tắc khớp với "${searchQuery.replace(/[<>&"]/g, "")}"</div>
                        <div style="font-size:12px; color:#9cc4d4; margin-top:4px">Thử các từ khóa như: <strong>Yagi, Key, AFK, Thuế, P2P, Đá ngầm, 15, Bảo hiểm</strong></div>
                    </div>
                `;
            }
            const tabMap = new Map(tabs.map(t => [t.id, t.label]));
            return `
                <div style="font-size:12px; font-weight:800; color:#123142; margin-bottom:8px">
                    🔎 Tìm thấy <strong>${matched.length}</strong> mục luật khớp trên cả 5 tab:
                </div>
                <div class="rule-visual-cards-grid single-wide">
                    ${matched.map(c => `
                        <div>
                            <div style="display:flex; justify-content:flex-end; margin-bottom:4px">
                                <span class="rule-search-tag" style="background:#123142; color:#fde68a; border-color:#b58b42">${tabMap.get(c.tabId) || ""}</span>
                            </div>
                            ${c.html}
                        </div>
                    `).join("")}
                </div>
            `;
        }

        const tabCards = searchableCards.filter(c => c.tabId === activeTab);
        if (activeTab === "overview" || activeTab === "port_market") {
            return `${tabCards.map(c => c.html).join("")}${tabAccordions[activeTab] || ""}`;
        }
        if (activeTab === "monuments_quests") {
            const [tierBlock, ...rest] = tabCards;
            return `
                ${tierBlock ? tierBlock.html : ""}
                <div class="rule-visual-cards-grid">${rest.map(c => c.html).join("")}</div>
                ${tabAccordions[activeTab] || ""}
            `;
        }
        if (activeTab === "weather_events") {
            const [timelineBlock, ...rest] = tabCards;
            return `
                ${timelineBlock ? timelineBlock.html : ""}
                <div class="rule-visual-cards-grid">${rest.map(c => c.html).join("")}</div>
                ${tabAccordions[activeTab] || ""}
            `;
        }
        return `
            <div class="rule-visual-cards-grid">${tabCards.map(c => c.html).join("")}</div>
            ${tabAccordions[activeTab] || ""}
        `;
    }

    filterRulebookSearch(val) {
        this.rulebookSearchQuery = String(val || "");
        const bodyEl = document.getElementById("rulebook-dynamic-body");
        const clearBtn = document.getElementById("rulebook-search-clear");
        if (clearBtn) clearBtn.classList.toggle("hidden", !this.rulebookSearchQuery.trim());
        if (bodyEl) {
            bodyEl.innerHTML = this.renderRulebookBodyHtml(this.selectedRuleCategory || "overview", this.rulebookSearchQuery);
        }
    }

    clearRulebookSearch() {
        const inp = document.getElementById("rulebook-search-input");
        if (inp) {
            inp.value = "";
            inp.focus();
        }
        this.filterRulebookSearch("");
    }

    openRulebookModal(category = "overview") {
        const aliasMap = { storage_keys: "port_market", monuments_traps: "monuments_quests" };
        const { tabs } = this.getRulebookCatalog();
        const activeTab = aliasMap[category] || (category || "overview");
        this.selectedRuleCategory = activeTab;
        this.rulebookSearchQuery = "";

        const curIdx = Math.max(0, tabs.findIndex(t => t.id === activeTab));
        const prevTab = curIdx > 0 ? tabs[curIdx - 1] : null;
        const nextTab = curIdx < tabs.length - 1 ? tabs[curIdx + 1] : null;

        const html = `
            <div class="modal-sticky-top">
                <div class="rule-header-bar">
                    <div>
                        <div class="modal-header-badge" style="background:#123142; border-color:#e6b84a; color:#fde68a; margin-bottom:2px">
                            <span>📜 CẨM NANG HẢI TRÌNH — ĐỌC 30 GIÂY CHƠI NGAY</span>
                        </div>
                    </div>
                    <div class="rule-search-wrap">
                        <input type="text" id="rulebook-search-input" class="rule-search-input"
                               placeholder="🔍 Tìm nhanh: Yagi, Key, AFK, Thuế..."
                               oninput="window.GAME && window.GAME.filterRulebookSearch(this.value)" />
                        <button type="button" id="rulebook-search-clear" class="rule-search-clear hidden"
                                title="Xóa tìm kiếm" onclick="window.GAME && window.GAME.clearRulebookSearch()">✕</button>
                    </div>
                </div>
                <div class="rule-cat-tabs">
                    ${tabs.map((t, i) => `
                        <button class="rule-cat-tab ${activeTab === t.id ? 'active' : ''}"
                                onclick="window.GAME.openRulebookModal('${t.id}')">
                            ${i + 1}. ${t.label}
                        </button>
                    `).join("")}
                </div>
            </div>

            <div id="rulebook-dynamic-body">
                ${this.renderRulebookBodyHtml(activeTab, "")}
            </div>

            <div class="rule-footer-nav">
                <div class="rule-nav-left-right">
                    <button type="button" class="btn-secondary" ${prevTab ? '' : 'disabled'}
                            onclick="${prevTab ? `window.GAME.openRulebookModal('${prevTab.id}')` : ''}">
                        ← Trước
                    </button>
                    <div class="rule-progress-dots" title="Trang ${curIdx + 1}/${tabs.length}">
                        ${tabs.map((t, i) => `<span class="rule-pdot ${i === curIdx ? 'active' : ''}" onclick="window.GAME.openRulebookModal('${t.id}')" title="${t.label}"></span>`).join("")}
                        <span style="margin-left:4px">${curIdx + 1}/${tabs.length}</span>
                    </div>
                </div>
                <div class="rule-nav-left-right">
                    ${nextTab ? `
                        <button type="button" class="btn-secondary" onclick="window.GAME.openRulebookModal('${nextTab.id}')">
                            Tiếp theo: ${nextTab.shortLabel} →
                        </button>
                    ` : ''}
                    <button type="button" class="btn-primary-gold" onclick="window.GAME.closeModal()">
                        ⚓ Đã Hiểu — Ra Khơi!
                    </button>
                </div>
            </div>
        `;
        this.showModal(html);

        const searchInp = document.getElementById("rulebook-search-input");
        if (searchInp) {
            searchInp.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    if (searchInp.value) {
                        this.clearRulebookSearch();
                    } else {
                        this.closeModal();
                    }
                }
            });
        }
    }

    // ------------------------------------------------------------------------
    // MODAL SYSTEM WITH TOP-RIGHT CLOSE BUTTON ON EVERY WINDOW
    // ------------------------------------------------------------------------
    showModal(innerHTML) {
        this.cancelLockedMovePath(false);
        clearInterval(this.quizAutoCloseInterval);
        const overlay = document.getElementById("modal-overlay");
        const content = document.getElementById("modal-content");
        const topRightCloseBtn = `<button type="button" class="modal-top-close-btn" onclick="window.GAME.handleTopRightModalClose()" title="Đóng cửa sổ (Góc phải đầu trang)">✕</button>`;
        content.innerHTML = topRightCloseBtn + innerHTML;
        content.style.transform = "translate(0px, 0px)";
        content.dataset.dragX = "0";
        content.dataset.dragY = "0";
        overlay.classList.remove("hidden");

        // Make the modal header badge draggable so players can move any modal window out of the way!
        const headerBadge = content.querySelector(".modal-header-badge") || content.querySelector(".spectator-quiz-banner");
        if (headerBadge) {
            headerBadge.style.cursor = "grab";
            headerBadge.title = "Giữ chuột trái để kéo di chuyển cửa sổ này sang vị trí khác";
            headerBadge.dataset.dragTarget = "modal-content";
            headerBadge.classList.add("draggable-handle");
        }
    }

    // ------------------------------------------------------------------------
    // UNIFIED PENDING QUIZ ENGINE (60S STANDARD / 90S STORM + MINIMIZE/REOPEN)
    // ------------------------------------------------------------------------
    hasActiveUnansweredQuiz() {
        return Boolean(this.activePendingQuiz && !this.activePendingQuiz.answered);
    }

    startPendingQuiz({ type, html, durationSec = 60, onTimeout = null }) {
        clearInterval(this.activeQuizTimerInterval);
        const now = Date.now();
        this.activePendingQuiz = {
            type,
            html,
            durationSec,
            expiresAt: now + durationSec * 1000,
            answered: false,
            minimized: false,
            onTimeout
        };
        const reopenBtn = document.getElementById("reopen-quiz-btn");
        if (reopenBtn) reopenBtn.classList.add("hidden");

        this.showModal(html);
        this.updatePendingQuizTimerUI();
        this.updateUI();

        this.activeQuizTimerInterval = setInterval(() => {
            if (!this.activePendingQuiz || this.activePendingQuiz.answered) {
                clearInterval(this.activeQuizTimerInterval);
                return;
            }
            const remainingMs = this.activePendingQuiz.expiresAt - Date.now();
            if (remainingMs <= 0) {
                const cb = this.activePendingQuiz.onTimeout;
                this.activePendingQuiz.answered = true;
                clearInterval(this.activeQuizTimerInterval);
                this.activePendingQuiz = null;
                const rb = document.getElementById("reopen-quiz-btn");
                if (rb) rb.classList.add("hidden");
                this.updateUI();
                if (typeof cb === "function") cb();
                return;
            }
            this.updatePendingQuizTimerUI();
        }, 250);
    }

    updatePendingQuizTimerUI() {
        if (!this.activePendingQuiz || this.activePendingQuiz.answered) return;
        const remSec = Math.max(0, Math.ceil((this.activePendingQuiz.expiresAt - Date.now()) / 1000));
        const isUrgent = remSec <= 10;
        const formatted = this.formatMMSS(remSec);

        const pillEl = document.getElementById("active-quiz-countdown");
        if (pillEl) {
            pillEl.textContent = `⏱️ ${formatted}`;
            if (pillEl.classList) pillEl.classList.toggle("urgent", isUrgent);
        }
        const reopenBtn = document.getElementById("reopen-quiz-btn");
        if (reopenBtn && this.activePendingQuiz.minimized) {
            reopenBtn.textContent = `❓ Mở Lại Quiz (${remSec}s)`;
            if (reopenBtn.classList) {
                reopenBtn.classList.remove("hidden");
                reopenBtn.classList.toggle("urgent", isUrgent);
            }
        }
    }

    minimizePendingQuiz() {
        if (!this.hasActiveUnansweredQuiz()) return;
        this.activePendingQuiz.minimized = true;
        document.getElementById("modal-overlay").classList.add("hidden");
        this.updatePendingQuizTimerUI();
        this.showToast("📌 Đã thu gọn Quiz! Đồng hồ vẫn chạy — bấm '❓ Mở Lại Quiz' trên HUD để trả lời trước khi hết giờ.");
    }

    reopenPendingQuiz() {
        if (!this.hasActiveUnansweredQuiz()) {
            const rb = document.getElementById("reopen-quiz-btn");
            if (rb) rb.classList.add("hidden");
            return;
        }
        window.SFX.playClick();
        this.activePendingQuiz.minimized = false;
        const rb = document.getElementById("reopen-quiz-btn");
        if (rb) rb.classList.add("hidden");
        this.showModal(this.activePendingQuiz.html);
        this.updatePendingQuizTimerUI();
    }

    clearPendingQuiz() {
        clearInterval(this.activeQuizTimerInterval);
        this.activeQuizTimerInterval = null;
        if (this.activePendingQuiz) {
            this.activePendingQuiz.answered = true;
        }
        this.activePendingQuiz = null;
        const rb = document.getElementById("reopen-quiz-btn");
        if (rb) rb.classList.add("hidden");
    }

    handleTopRightModalClose() {
        window.SFX.playClick();
        // Nếu đang có Quiz chưa trả lời và cửa sổ Quiz đang mở -> CHỈ THU GỌN, KHÔNG HỦY CÂU HỎI & KHÔNG DỪNG ĐỒNG HỒ!
        if (this.hasActiveUnansweredQuiz() && !this.activePendingQuiz.minimized) {
            this.minimizePendingQuiz();
            return;
        }
        if (this.currentQuizCloseCallback) {
            this.closeQuizResultNow();
            return;
        }
        // If closing the Opening Speed Quiz modal with the top-right ✕ button,
        // immediately finalize and start Round 1 so the match never gets stuck in "turn_order_quiz"!
        if (this.isGameStarted && (this.roomState.status === "turn_order_quiz" || (this.openingQuizState && !this.openingQuizState.matchStarted))) {
            this.confirmStartMatchAfterOpeningQuiz();
            return;
        }
        if (!this.isMyTurn() && this.liveQuizState) {
            if (this.liveQuizState.phase === "asking") {
                this.spectatorCloseQuizDuringAsking(this.liveQuizState.id);
                return;
            }
            if (this.liveQuizState.phase === "answered") {
                this.spectatorHideAnsweredQuiz(this.liveQuizState.id);
                return;
            }
        }
        if (this.currentPortTile) {
            this.currentPortTile = null;
            this.finishPortVisit();
            return;
        }
        this.closeModal();
    }

    closeModal(fromSpectatorSync = false) {
        clearInterval(this.quizAutoCloseInterval);
        this.currentQuizCloseCallback = null;
        document.getElementById("modal-overlay").classList.add("hidden");
        // If active player closes their quiz modal (not while a quiz is minimized!), clear liveQuizState on server
        if (!fromSpectatorSync && this.isMyTurn() && this.liveQuizState && !this.hasActiveUnansweredQuiz()) {
            this.liveQuizState = null;
            this.syncMultiplayerGameState();
        }
        // Check if active player now has 0 AP after closing modal -> Auto-end turn!
        if (!fromSpectatorSync && this.isMyTurn()) {
            this.checkAutoEndTurnIfNoAP();
        }
    }

    // ------------------------------------------------------------------------
    // MINECRAFT-STYLE SANDBOX / CREATIVE MODE CONTROLS (STRICTLY SANDBOX ONLY!)
    // Outside of Sandbox mode, all creative/cheat features & UI are hidden & disabled!
    // ------------------------------------------------------------------------
    disableSandboxCreativeMode() {
        this.sandboxMode = false;
        this.sandboxInfiniteMove = false;
        this.sandboxTeleport = false;
        const sbBtn = document.getElementById("btn-toggle-sandbox");
        if (sbBtn) sbBtn.classList.add("hidden");
        const sbExitBtn = document.getElementById("btn-sandbox-exit");
        if (sbExitBtn) sbExitBtn.classList.add("hidden");
        const openRoomBtn = document.getElementById("btn-open-room");
        if (openRoomBtn) openRoomBtn.classList.remove("hidden");
        const sbPanel = document.getElementById("sandbox-creative-panel");
        if (sbPanel) sbPanel.classList.add("hidden");
    }

    enableSandboxCreativeMode(openPanel = true) {
        this.sandboxMode = true;
        this.sandboxInfiniteMove = true;
        const sbBtn = document.getElementById("btn-toggle-sandbox");
        if (sbBtn) sbBtn.classList.remove("hidden");
        const sbExitBtn = document.getElementById("btn-sandbox-exit");
        if (sbExitBtn) sbExitBtn.classList.remove("hidden");
        const openRoomBtn = document.getElementById("btn-open-room");
        if (openRoomBtn) openRoomBtn.classList.add("hidden");
        const infBtn = document.getElementById("btn-sb-inf-move") || document.getElementById("sb-btn-inf-move");
        if (infBtn) {
            infBtn.classList.add("active");
            infBtn.innerHTML = "♾️ Di Chuyển &amp; AP Vô Hạn: <strong>BẬT</strong>";
        }
        const sbPanel = document.getElementById("sandbox-creative-panel");
        if (sbPanel && openPanel) {
            sbPanel.classList.remove("hidden");
        }
        this.refreshReachableHexes();
        this.updateUI();
    }

    toggleSandboxPanel(forceState = undefined) {
        if (!this.sandboxMode) return;
        window.SFX.playClick();
        const sbPanel = document.getElementById("sandbox-creative-panel");
        if (!sbPanel) return;
        const willOpen = forceState !== undefined ? Boolean(forceState) : sbPanel.classList.contains("hidden");
        if (willOpen) {
            sbPanel.classList.remove("hidden");
        } else {
            sbPanel.classList.add("hidden");
        }
    }

    toggleSandboxInfiniteMove() {
        if (!this.sandboxMode) return;
        window.SFX.playClick();
        this.sandboxInfiniteMove = !this.sandboxInfiniteMove;
        const btn = document.getElementById("btn-sb-inf-move") || document.getElementById("sb-btn-inf-move");
        if (btn) {
            btn.classList.toggle("active", this.sandboxInfiniteMove);
            btn.innerHTML = `♾️ Di Chuyển &amp; AP Vô Hạn: <strong>${this.sandboxInfiniteMove ? 'BẬT' : 'TẮT'}</strong>`;
        }
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (p && this.sandboxInfiniteMove) {
            p.ap = 5;
            p.moveApSpent = 0;
        }
        this.refreshReachableHexes();
        this.updateUI();
        this.showToast(this.sandboxInfiniteMove
            ? "♾️ Đã BẬT Di Chuyển & AP Vô Hạn! Bạn có thể lái thuyền tới bất kỳ ô nước nào trên bản đồ!"
            : "⛵ Đã TẮT Di Chuyển Vô Hạn (Quay về luật 5 AP tiêu chuẩn).");
    }

    toggleSandboxTeleport() {
        if (!this.sandboxMode) return;
        window.SFX.playClick();
        this.sandboxTeleport = !this.sandboxTeleport;
        const btn = document.getElementById("btn-sb-teleport") || document.getElementById("sb-btn-teleport");
        if (btn) {
            btn.classList.toggle("active", this.sandboxTeleport);
            btn.innerHTML = `⚡ Click Ô Để Dịch Chuyển: <strong>${this.sandboxTeleport ? 'BẬT' : 'TẮT'}</strong>`;
        }
        this.showToast(this.sandboxTeleport
            ? "⚡ Đã BẬT Dịch Chuyển Tức Thời! Bấm vào bất kỳ ô biển/cảng/di tích nào để bay tới ngay!"
            : "⛵ Đã TẮT Dịch Chuyển Tức Thời.");
    }

    sandboxTriggerInstantWin() {
        if (!this.sandboxMode) return;
        window.SFX.playRelicFanfare();
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return;
        const allMons = window.GAME_DATA.monuments || [];
        p.prosperityPoints = 15;
        p.relics = allMons.slice(0, 3).map(m => ({
            id: m.id,
            name: m.relicName,
            icon: m.relicIcon,
            monumentName: m.name
        }));
        this.matchWinner = p;
        this.updateUI();
        this.syncMultiplayerGameState();
        this.showVictoryScreen(p);
    }

    sandboxAdjustStat(stat, delta) {
        if (!this.sandboxMode) return;
        window.SFX.playCoin();
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return;
        if (stat === "coins") {
            p.coins = Math.max(0, Math.min(30, (p.coins || 0) + delta));
        } else if (stat === "hp") {
            p.maxHp = Math.max(5, p.maxHp || 5);
            p.hp = Math.max(1, Math.min(20, (p.hp || 5) + delta));
            if (p.hp > p.maxHp) p.maxHp = p.hp;
            p.eliminated = false;
        } else if (stat === "ap") {
            p.ap = Math.max(0, (p.ap || 0) + delta);
            p.moveApSpent = 0;
        } else if (stat === "food" || stat === "wood" || stat === "iron") {
            p[stat] = Math.max(0, (p[stat] || 0) + delta);
        }
        this.refreshReachableHexes();
        this.updateUI();
        this.syncMultiplayerGameState();
    }

    sandboxAdjustKeys(delta) {
        if (!this.sandboxMode) return;
        window.SFX.playCoin();
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return;
        [1, 2, 3].forEach(k => {
            p.keys[k] = Math.max(0, Math.min(1, (p.keys[k] || 0) + delta));
        });
        this.updateUI();
        this.syncMultiplayerGameState();
        this.showToast(`🗝️ [Sáng Tạo] Key 1/2/3 hiện tại (Tối đa 1 mỗi loại): ${p.keys[1]}/${p.keys[2]}/${p.keys[3]}`);
    }

    sandboxGrantSerpentCoin() {
        if (!this.sandboxMode) return;
        window.SFX.playRelicFanfare();
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return;
        p.hasSerpentCoin = true;
        this.updateUI();
        this.syncMultiplayerGameState();
        this.showToast("🛡️ [Sáng Tạo] Đã trang bị Bảo Hiểm Hàng Hải Quốc Tế (Tự động hồi 2 HP khi máu về 0)!");
    }

    sandboxResetPortMarket() {
        if (!this.sandboxMode) return;
        window.SFX.playCoin();
        this.resetAllPortInventories(true);
        this.resetAllPortResourceStocks(true);
        this.updateUI();
        this.syncMultiplayerGameState();
    }

    sandboxSetWeatherPhase(phaseKey) {
        if (!this.sandboxMode) return;
        window.SFX.playClick();
        const startSecondsMap = {
            sunny: 0,
            tropical_rain: 900,
            thunderstorm: 1200,
            sunset: 1620,
            night: 1740,
            super_typhoon_yagi: 2040
        };
        this.matchElapsedSec = startSecondsMap[phaseKey] !== undefined ? startSecondsMap[phaseKey] : 0;
        if (phaseKey === "thunderstorm") {
            this.thunderstormChallengeTriggered = false;
        }
        this.applyWeatherPhase(phaseKey, true);
        this.updateUI();
        this.syncMultiplayerGameState();
    }

    sandboxToggleStormBlockade() {
        if (!this.sandboxMode) return;
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        if (Array.isArray(this.blockedMineIds) && this.blockedMineIds.length > 0) {
            this.applyWeatherPhase("sunny", true);
        } else {
            this.applyWeatherPhase("thunderstorm", true);
        }
        this.updateUI();
    }

    sandboxFastForwardToFinal10s() {
        if (!this.sandboxMode) return;
        window.SFX && window.SFX.playClick && window.SFX.playClick();
        this.victoryShownForMatch = false;
        this.matchWinner = null;
        this.finalFiveMinNotified = false;
        this.sandboxAllowTimeout = true;
        this.matchElapsedSec = 2690; // 44:50 -> còn 00:10 cuối trận!
        this.updateClockAndTickerUI();
        this.showToast("⏱️ [Sáng Tạo] Đã tua đồng hồ về 00:10 cuối trận — chuẩn bị test hết giờ, Lật Bài Bí Mật & Phản Tư!");
    }

    sandboxAdjustRelic(delta) {
        if (!this.sandboxMode) return;
        window.SFX.playRelicFanfare();
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (!p) return;
        p.prosperityPoints = Math.max(0, (p.prosperityPoints || 0) + delta);
        if (delta > 0 && p.prosperityPoints >= 15) {
            this.matchWinner = p;
            this.updateUI();
            this.syncMultiplayerGameState();
            this.showVictoryScreen(p);
            return;
        }
        this.updateUI();
        this.syncMultiplayerGameState();
        this.showToast(`⭐ [Sáng Tạo] Điểm Thịnh Vượng: ${p.prosperityPoints}/15 ⭐`);
    }

    sandboxResetCooldowns() {
        if (!this.sandboxMode) return;
        window.SFX.playMine();
        this.world.hexTiles.forEach(t => {
            t.resourceCooldown = 0;
            t.monumentLocked = false;
            t.monumentConqueror = null;
        });
        this.exhaustedTiersNotified = new Set();
        this.world.updateResourceVisuals();
        this.syncMonumentVisuals3D();
        const p = this.getLocalPlayer() || this.getActivePlayer();
        if (p) {
            p.tier1Visited = 0;
            // Also grant 1 specialty from each region if cargo has space
            window.GAME_DATA.regions.forEach(reg => {
                if (p.specialties.length < 6 && !p.specialties.some(s => s.regionId === reg.id)) {
                    p.specialties.push({
                        regionId: reg.id,
                        name: reg.specialty.shortName,
                        icon: reg.specialty.icon
                    });
                }
            });
        }
        this.updateUI();
        this.syncMultiplayerGameState();
        this.showToast("🌱 [Sáng Tạo] Đã hồi 100% các Mỏ Tài Nguyên, mở khóa toàn bộ Di tích & tặng Đặc sản 6 Vùng!");
    }

    sandboxSpawnNPC() {
        if (!this.sandboxMode) return;
        window.SFX.playCoin();
        const tile = this.world.spawnRareNPCOnRandomSeaHex();
        if (tile) {
            this.updateUI();
            this.syncMultiplayerGameState();
            this.world.focusCameraOnHex(tile.q, tile.r);
            this.showToast(`🚢 [Sáng Tạo] Đã triệu hồi Thương Đoàn Quốc Tế (Tàu FDI) tại ô biển (${tile.q}, ${tile.r})!`);
        }
    }

    logEvent(msg) {
        const logBox = document.getElementById("game-log-list");
        if (!logBox) return;
        const item = document.createElement("div");
        const txt = String(msg || "");
        let catClass = "";
        if (/⛈️|🌀|💥|⚡|☠️|Bão|Sét|Đá Ngầm|Bẫy/i.test(txt)) {
            catClass = " log-storm";
        } else if (/⭐|👑|🏛️|⛵|🚢|🕵️|Di tích|Thịnh Vượng|Thuận Buồm|FDI/i.test(txt)) {
            catClass = " log-monument";
        } else if (/🤝|🛒|📦|💰|⚓|📋|Cảng|Giao dịch|Đặc sản|Nhiệm Vụ/i.test(txt)) {
            catClass = " log-trade";
        }
        item.className = `log-entry${catClass}`;
        item.innerHTML = `<span class="log-turn">[V${this.roundNumber}]</span> ${msg}`;
        logBox.prepend(item);
    }

    showToast(msg) {
        const toast = document.getElementById("toast-banner");
        toast.textContent = msg;
        toast.classList.remove("hidden");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.add("hidden"), 4000);
    }

    initDraggableWindows() {
        let activeTarget = null;
        let startPointerX = 0;
        let startPointerY = 0;
        let initialOffsetX = 0;
        let initialOffsetY = 0;

        window.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            // Ignore clicks on buttons or inputs inside the header
            if (e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) return;

            const handle = e.target.closest(".draggable-handle");
            if (!handle) return;

            const targetId = handle.dataset.dragTarget;
            const targetEl = targetId ? document.getElementById(targetId) : handle.closest(".glass-panel");
            if (!targetEl) return;

            activeTarget = targetEl;
            startPointerX = e.clientX;
            startPointerY = e.clientY;
            initialOffsetX = parseFloat(targetEl.dataset.dragX || "0") || 0;
            initialOffsetY = parseFloat(targetEl.dataset.dragY || "0") || 0;
            handle.style.cursor = "grabbing";
            e.preventDefault();
        });

        window.addEventListener("pointermove", (e) => {
            if (!activeTarget) return;
            const dx = e.clientX - startPointerX;
            const dy = e.clientY - startPointerY;
            const nextX = initialOffsetX + dx;
            const nextY = initialOffsetY + dy;
            activeTarget.dataset.dragX = String(nextX);
            activeTarget.dataset.dragY = String(nextY);
            activeTarget.style.transform = `translate(${nextX}px, ${nextY}px)`;
        });

        const stopDrag = () => {
            if (!activeTarget) return;
            const handles = activeTarget.querySelectorAll(".draggable-handle");
            handles.forEach(h => { h.style.cursor = "grab"; });
            activeTarget = null;
        };

        window.addEventListener("pointerup", stopDrag);
        window.addEventListener("pointercancel", stopDrag);
    }

    bindUIEvents() {
        this.initDraggableWindows();

        // Mục 4D: Theo dõi tương tác UI / bản đồ của người chơi:
        // - Khi bảng "Máy đang tự động" đang mở (afkAutoNoticeShown) hoặc đang bị Tàu Máy lái thay -> chỉ tắt & lấy lại quyền lái khi bấm/chạm vào màn hình!
        // - Khi đang trong lượt tự lái -> reset bộ đếm AFK 50s (KHÔNG reset bộ đếm lastGameplayActionAt của đồng hồ 45:00!)
        if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
            const onScreenTapOrClick = () => {
                if (!this.isGameStarted || this.sandboxMode || this.matchWinner) return;
                const localP = this.getLocalPlayer();
                if (this.afkAutoNoticeShown || (localP && localP.afkBotTakeover && !localP.eliminated)) {
                    // Tránh tắt bảng ngay tức thì do chính thao tác sát mốc bật AFK
                    if (this.afkAutoNoticeShown && (Date.now() - (this.afkAutoNoticeShownAt || 0)) < 200) {
                        return;
                    }
                    this.reclaimControlFromAFKBot();
                    return;
                }
                if (this.isMyTurn()) {
                    this.recordPlayerInteraction();
                }
            };
            const onLocalKeyDown = (e) => {
                if (!this.isGameStarted || this.sandboxMode || this.matchWinner) return;
                if (e && e.repeat) return;
                const ignoredKeys = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock"]);
                if (e && ignoredKeys.has(e.key)) return;
                const localP = this.getLocalPlayer();
                if (this.afkAutoNoticeShown || (localP && localP.afkBotTakeover && !localP.eliminated)) {
                    if (this.afkAutoNoticeShown && (Date.now() - (this.afkAutoNoticeShownAt || 0)) < 200) {
                        return;
                    }
                    this.reclaimControlFromAFKBot();
                    return;
                }
                if (this.isMyTurn()) {
                    this.recordPlayerInteraction();
                }
            };
            document.addEventListener("pointerdown", onScreenTapOrClick, { passive: true });
            document.addEventListener("touchstart", onScreenTapOrClick, { passive: true });
            document.addEventListener("keydown", onLocalKeyDown, { passive: true });
        }

        const inmatchChatInp = document.getElementById("inmatch-chat-input");
        if (inmatchChatInp) {
            inmatchChatInp.addEventListener("keydown", (e) => {
                if (this.isMyTurn()) this.recordPlayerInteraction();
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.submitInMatchChat();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    this.closeInMatchChatBox();
                }
            });
        }
        const mmNameInp = document.getElementById("mm-captain-name-input");
        if (mmNameInp) {
            mmNameInp.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.saveMainMenuNameEdit();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    const disp = document.getElementById("mm-name-display-row");
                    const edit = document.getElementById("mm-name-edit-row");
                    if (edit) edit.classList.add("hidden");
                    if (disp) disp.classList.remove("hidden");
                }
            });
        }
        if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
            document.addEventListener("click", (e) => {
                const pop = document.getElementById("mm-settings-popover");
                const btn = document.getElementById("btn-mm-settings");
                if (pop && !pop.classList.contains("hidden") && !pop.contains(e.target) && (!btn || !btn.contains(e.target))) {
                    pop.classList.add("hidden");
                }
                ["inmatch", "lobby"].forEach(scope => {
                    const qPop = document.getElementById(`${scope}-quick-popover`);
                    const qBtn = document.getElementById(`btn-${scope}-quick-toggle`);
                    if (qPop && !qPop.classList.contains("hidden") && !qPop.contains(e.target) && (!qBtn || !qBtn.contains(e.target))) {
                        qPop.classList.add("hidden");
                        if (qBtn) qBtn.classList.remove("is-open");
                    }
                });
            });
            document.addEventListener("keydown", (e) => {
                if ((e.key === "Escape" || e.code === "Escape") && this.isAtlasLightboxOpen()) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.closeAtlasLightbox();
                    return;
                }
            }, true);
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" || e.code === "Escape") {
                    this.closeAllQuickChatPopovers();
                }
            });
        }

        document.getElementById("btn-context-action").addEventListener("click", () => {
            window.SFX.playClick();
            this.triggerContextualActionOnCurrentHex();
        });
        document.getElementById("btn-repair-ship").addEventListener("click", () => {
            window.SFX.playClick();
            this.actionRepairShip();
        });
        document.getElementById("btn-end-turn").addEventListener("click", () => {
            window.SFX.playClick();
            this.endPlayerTurn(false);
        });
        const marketBtn = document.getElementById("btn-open-market");
        if (marketBtn) {
            marketBtn.addEventListener("click", () => {
                window.SFX.playClick();
                this.openMaritimeMarketModal();
            });
        }
        const questBtn = document.getElementById("btn-open-quests");
        if (questBtn) {
            questBtn.addEventListener("click", () => {
                window.SFX.playClick();
                this.openQuestsModal();
            });
        }
        const clockWeatherEl = document.getElementById("hud-clock-weather");
        if (clockWeatherEl) {
            clockWeatherEl.style.cursor = "pointer";
            clockWeatherEl.addEventListener("click", () => {
                window.SFX.playClick();
                this.openRulebookModal("weather_events");
            });
        }
        const tickerToggleBtn = document.getElementById("btn-toggle-ticker");
        if (tickerToggleBtn) {
            tickerToggleBtn.addEventListener("click", () => {
                this.toggleLiveTicker();
            });
        }
        document.getElementById("btn-open-atlas").addEventListener("click", () => {
            window.SFX.playClick();
            this.openAtlasModal();
        });
        document.getElementById("btn-open-rules").addEventListener("click", () => {
            window.SFX.playClick();
            this.openRulebookModal();
        });
        document.getElementById("btn-open-room").addEventListener("click", () => {
            window.SFX.playClick();
            this.openInMatchLobbyOverlay();
        });
        const roomPill = document.getElementById("room-code-pill");
        if (roomPill) {
            roomPill.addEventListener("click", () => {
                window.SFX.playClick();
                this.openInMatchLobbyOverlay();
            });
        }
        const waitOverlay = document.getElementById("waiting-screen-overlay");
        if (waitOverlay) {
            waitOverlay.addEventListener("click", (e) => {
                if (e.target === waitOverlay && this.isInMatchLobbyOverlayOpen) {
                    this.closeInMatchLobbyOverlay();
                }
            });
        }
        if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
            document.addEventListener("keydown", (e) => {
                if ((e.key === "Escape" || e.code === "Escape") && this.isInMatchLobbyOverlayOpen) {
                    this.closeInMatchLobbyOverlay();
                }
            });
        }
        const camLockBtn = document.getElementById("btn-camera-lock");
        if (camLockBtn) {
            camLockBtn.addEventListener("click", () => {
                window.SFX.playClick();
                const targetP = this.getLocalPlayer() || this.getActivePlayer();
                const locked = this.world.toggleCameraLock(targetP);
                camLockBtn.textContent = locked ? "🔒 Cam: Bật" : "🔒 Cam: Tắt";
                camLockBtn.classList.toggle("active-lock-btn", locked);
                this.showToast(locked
                    ? "🔒 Đã BẬT Khóa Góc Nhìn! Camera sẽ tự động di chuyển bám theo thuyền của bạn!"
                    : "🔓 Đã TẮT Khóa Góc Nhìn (Camera di chuyển tự do).");
            });
        }
        const graphicsBtn = document.getElementById("btn-graphics-quality");
        if (graphicsBtn) {
            const syncGraphicsBtn = (mode) => {
                const isSmooth = mode === "smooth";
                graphicsBtn.textContent = isSmooth ? "⚡ Siêu Mượt" : "✨ Đẹp (Tối ưu)";
                graphicsBtn.classList.toggle("active-minimalist-btn", isSmooth);
            };
            if (this.world && this.world.graphicsQuality) {
                syncGraphicsBtn(this.world.graphicsQuality);
            }
            graphicsBtn.addEventListener("click", () => {
                window.SFX.playClick();
                if (!this.world || !this.world.toggleGraphicsQuality) return;
                const mode = this.world.toggleGraphicsQuality();
                syncGraphicsBtn(mode);
                this.showToast(mode === "smooth"
                    ? "⚡ Đã chuyển sang chế độ SIÊU MƯỢT (PixelRatio=1, tắt đổ bóng, ẩn mây/chim/cá)!"
                    : "✨ Đã chuyển sang chế độ ĐẸP (Tối ưu)!");
            });
        }
        const minModeBtn = document.getElementById("btn-minimalist-mode");
        if (minModeBtn) {
            minModeBtn.addEventListener("click", () => {
                window.SFX.playClick();
                const minimal = this.world.toggleMinimalistMode();
                minModeBtn.textContent = minimal ? "🌿 Tối Giản: Bật" : "🌿 Tối Giản";
                minModeBtn.classList.toggle("active-minimalist-btn", minimal);
                this.showToast(minimal
                    ? "🌿 Đã BẬT Chế Độ Tối Giản!"
                    : "✨ Đã TẮT Chế Độ Tối Giản!");
            });
        }
        const cloudsBtn = document.getElementById("btn-toggle-clouds");
        if (cloudsBtn) {
            cloudsBtn.addEventListener("click", () => {
                window.SFX.playClick();
                const visible = this.world.toggleClouds();
                cloudsBtn.textContent = visible ? "☁️ Mây" : "☁️ Mây: Tắt";
                cloudsBtn.classList.toggle("active-cloud-btn", visible);
                this.showToast(visible ? "☁️ Đã BẬT hiển thị các đám mây trên bầu trời!" : "🌤️ Đã TẮT toàn bộ đám mây trên trời để nhìn bản đồ thoáng hơn!");
            });
        }
        const sandboxBtn = document.getElementById("btn-toggle-sandbox");
        if (sandboxBtn) {
            sandboxBtn.addEventListener("click", () => {
                this.toggleSandboxPanel();
            });
        }
        const cleanBtn = document.getElementById("btn-toggle-clean-ui");
        if (cleanBtn) {
            cleanBtn.addEventListener("click", () => {
                window.SFX.playClick();
                this.toggleAllPanelsCleanMode();
            });
        }
        const settingsBtn = document.getElementById("btn-hud-settings");
        const settingsMenu = document.getElementById("hud-settings-menu");
        if (settingsBtn && settingsMenu) {
            settingsBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                window.SFX.playClick();
                settingsMenu.classList.toggle("hidden");
            });
            document.addEventListener("click", (e) => {
                if (!settingsMenu.classList.contains("hidden") &&
                    !settingsMenu.contains(e.target) &&
                    e.target !== settingsBtn) {
                    settingsMenu.classList.add("hidden");
                }
            });
        }
        document.getElementById("btn-toggle-audio").addEventListener("click", (e) => {
            const muted = window.SFX.toggleMute();
            e.currentTarget.textContent = muted ? "🔇 Âm Thanh: Tắt" : "🔊 Âm Thanh";
        });
        document.getElementById("btn-reset-cam").addEventListener("click", (e) => {
            if (e) e.stopPropagation();
            const localP = this.getLocalPlayer() || this.getActivePlayer();
            if (localP) this.world.focusCameraOnHex(localP.q, localP.r);
        });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    window.GAME = new GoldenJourneyGame();
});
