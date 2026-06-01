document.addEventListener("DOMContentLoaded", function () {
    const navLinks = Array.from(document.querySelectorAll(".nav-link"));
    const sectionCards = Array.from(document.querySelectorAll(".section-card"));
    const dashboardCharts = [];
    let dashboardMap = null;
    let onMapPanelShown = null;

    function registerChart(chart) {
        dashboardCharts.push(chart);
        return chart;
    }

    function resizeDashboardCharts() {
        dashboardCharts.forEach(function (chart) {
            chart.resize();
        });
    }

    const dashboardShell = document.getElementById("dashboardShell");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const mobileSidebarToggle = document.getElementById("mobileSidebarToggle");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    const mobileQuery = window.matchMedia("(max-width: 900px)");

    const setMobileSidebarOpen = function (open) {
        if (!dashboardShell) {
            return;
        }
        dashboardShell.classList.toggle("is-mobile-open", open);
        if (document.body && document.body.classList) {
            document.body.classList.toggle("is-sidebar-open", open);
        }
        if (sidebarOverlay) {
            sidebarOverlay.setAttribute("aria-hidden", open ? "false" : "true");
        }
        if (mobileSidebarToggle) {
            mobileSidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
        }
        if (sidebarToggle && mobileQuery.matches) {
            sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
        }
    };

    const applyDesktopSidebarState = function () {
        if (!dashboardShell || !sidebarToggle) {
            return;
        }
        let collapsed = false;
        try {
            collapsed = localStorage.getItem("sidebar_collapsed") === "1";
        } catch (err) {
            collapsed = false;
        }
        if (collapsed) {
            dashboardShell.classList.add("is-collapsed");
            sidebarToggle.setAttribute("aria-expanded", "false");
        } else {
            dashboardShell.classList.remove("is-collapsed");
            sidebarToggle.setAttribute("aria-expanded", "true");
        }
    };

    if (dashboardShell && sidebarToggle) {
        if (!mobileQuery.matches) {
            applyDesktopSidebarState();
        } else {
            dashboardShell.classList.remove("is-collapsed");
        }

        const handleSidebarToggle = function () {
            if (mobileQuery.matches) {
                const isOpen = dashboardShell.classList.contains("is-mobile-open");
                setMobileSidebarOpen(!isOpen);
                return;
            }
            const isCollapsed = dashboardShell.classList.toggle("is-collapsed");
            sidebarToggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
            try {
                localStorage.setItem("sidebar_collapsed", isCollapsed ? "1" : "0");
            } catch (err) {
                return;
            }
            setTimeout(resizeDashboardCharts, 200);
        };

        sidebarToggle.addEventListener("click", handleSidebarToggle);

        if (mobileSidebarToggle) {
            mobileSidebarToggle.addEventListener("click", function () {
                const isOpen = dashboardShell.classList.contains("is-mobile-open");
                setMobileSidebarOpen(!isOpen);
            });
        }

        if (sidebarOverlay) {
            sidebarOverlay.addEventListener("click", function () {
                setMobileSidebarOpen(false);
            });
        }

        if (navLinks.length) {
            navLinks.forEach(function (link) {
                link.addEventListener("click", function () {
                    if (mobileQuery.matches) {
                        setMobileSidebarOpen(false);
                    }
                });
            });
        }

        if (mobileQuery.matches) {
            setMobileSidebarOpen(false);
        }

        const handleBreakpointChange = function (event) {
            if (event.matches) {
                dashboardShell.classList.remove("is-collapsed");
                setMobileSidebarOpen(false);
            } else {
                setMobileSidebarOpen(false);
                applyDesktopSidebarState();
            }
            setTimeout(resizeDashboardCharts, 200);
        };

        if (typeof mobileQuery.addEventListener === "function") {
            mobileQuery.addEventListener("change", handleBreakpointChange);
        } else if (typeof mobileQuery.addListener === "function") {
            mobileQuery.addListener(handleBreakpointChange);
        }
    }

    function collectNumericValues(value, bucket) {
        if (Array.isArray(value)) {
            value.forEach(function (item) {
                collectNumericValues(item, bucket);
            });
            return;
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            bucket.push(value);
        }
    }

    function getScaleBounds(values, options) {
        const settings = Object.assign({
            beginAtZero: false,
            minFloor: null,
            maxCeiling: null,
            paddingRatio: 0.1,
            minPadding: 1
        }, options || {});
        const numbers = [];
        collectNumericValues(values, numbers);
        if (numbers.length === 0) {
            return {};
        }

        let min = Math.min.apply(null, numbers);
        let max = Math.max.apply(null, numbers);
        const spread = max - min;
        const padding = Math.max(spread * settings.paddingRatio, settings.minPadding);

        if (spread === 0) {
            min -= padding;
            max += padding;
        } else {
            min -= padding;
            max += padding;
        }

        if (settings.beginAtZero && min > 0) {
            min = 0;
        }
        if (settings.minFloor !== null) {
            min = Math.max(settings.minFloor, min);
        }
        if (settings.maxCeiling !== null) {
            max = Math.min(settings.maxCeiling, max);
        }
        if (max <= min) {
            max = min + settings.minPadding;
        }

        return { suggestedMin: min, suggestedMax: max };
    }

    function numberTick(value) {
        return Number(value).toLocaleString();
    }

    function getStoredToken() {
        try {
            return localStorage.getItem("access_token") || "";
        } catch (err) {
            return "";
        }
    }

    function setStoredTokens(accessToken, refreshToken) {
        try {
            if (accessToken) {
                localStorage.setItem("access_token", accessToken);
            }
            if (refreshToken) {
                localStorage.setItem("refresh_token", refreshToken);
            }
        } catch (err) {
            return;
        }
    }

    function clearStoredTokens() {
        try {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
        } catch (err) {
            return;
        }
    }

    function apiFetch(url, options) {
        const settings = Object.assign({ credentials: "include" }, options || {});
        const token = getStoredToken();
        if (token) {
            settings.headers = Object.assign({}, settings.headers || {}, {
                Authorization: `Bearer ${token}`
            });
        }
        return fetch(url, settings);
    }

    function fetchJson(url, options) {
        const settings = Object.assign({}, options || {});
        settings.headers = Object.assign({ Accept: "application/json" }, settings.headers || {});
        return apiFetch(url, settings).then(function (response) {
            if (response.status === 401) {
                clearStoredTokens();
                const loginPath = getLoginPath();
                if (!window.location.pathname.endsWith(loginPath)) {
                    window.location.href = loginPath;
                }
            }
            return response.json().then(function (payload) {
                return { ok: response.ok, status: response.status, payload: payload || {} };
            }).catch(function () {
                return { ok: response.ok, status: response.status, payload: {} };
            });
        });
    }

    function waitFor(ms) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
        });
    }

    function isLikelyNoDataMessage(message) {
        const text = String(message || "").trim().toLowerCase();
        if (!text) return false;
        if (!text.includes("no")) return false;
        return text.includes("data") || text.includes("matching") || text.includes("not found");
    }

    function fetchJsonWithRetry(url, options, retryOptions) {
        const settings = Object.assign({
            retries: 0,
            delayMs: 350,
            shouldRetry: null,
            onRetry: null
        }, retryOptions || {});

        let attempt = 0;

        function run() {
            attempt += 1;
            return fetchJson(url, options)
                .then(function (result) {
                    const canRetry = attempt <= settings.retries;
                    const shouldRetry = typeof settings.shouldRetry === "function"
                        ? !!settings.shouldRetry(result, attempt)
                        : false;
                    if (canRetry && shouldRetry) {
                        if (typeof settings.onRetry === "function") {
                            try {
                                settings.onRetry({
                                    attempt: attempt,
                                    retries: settings.retries,
                                    delayMs: settings.delayMs,
                                    result: result
                                });
                            } catch (_err) {
                                // Ignore onRetry callback errors.
                            }
                        }
                        return waitFor(settings.delayMs).then(run);
                    }
                    return result;
                })
                .catch(function (error) {
                    const canRetry = attempt <= settings.retries;
                    if (canRetry) {
                        if (typeof settings.onRetry === "function") {
                            try {
                                settings.onRetry({
                                    attempt: attempt,
                                    retries: settings.retries,
                                    delayMs: settings.delayMs,
                                    error: error
                                });
                            } catch (_err) {
                                // Ignore onRetry callback errors.
                            }
                        }
                        return waitFor(settings.delayMs).then(run);
                    }
                    throw error;
                });
        }

        return run();
    }

    function isStaticSite() {
        return !!(document.body && document.body.dataset && document.body.dataset.static === "true");
    }

    function getLoginPath() {
        return isStaticSite() ? "/login.html" : "/login";
    }

    function getDashboardPath() {
        return isStaticSite() ? "/index.html" : "/dashboard";
    }

    function showSection(sectionId) {
        sectionCards.forEach(function (card) {
            card.classList.toggle("active-panel", card.id === sectionId);
        });
        navLinks.forEach(function (link) {
            const isActive = link.getAttribute("href") === `#${sectionId}`;
            link.classList.toggle("active", isActive);
        });
        setTimeout(function () {
            resizeDashboardCharts();
        }, 90);
        if ((sectionId === "section-system-data" || sectionId === "section-map") && dashboardMap) {
            setTimeout(function () {
                dashboardMap.invalidateSize();
                if (onMapPanelShown) {
                    onMapPanelShown();
                }
            }, 120);
        }
    }

    navLinks.forEach(function (link) {
        link.addEventListener("click", function (event) {
            const targetId = link.getAttribute("href").replace("#", "");
            const target = document.getElementById(targetId);
            if (!target) return;
            event.preventDefault();
            showSection(targetId);
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, "", `#${targetId}`);
            } else {
                window.location.hash = `#${targetId}`;
            }
        });
    });

    function showInitialSection() {
        if (sectionCards.length === 0) return;
        const hash = window.location.hash || "";
        const targetId = hash.startsWith("#") ? hash.slice(1) : "";
        const target = targetId && document.getElementById(targetId) ? targetId : sectionCards[0].id;
        showSection(target);
    }

    showInitialSection();

    window.addEventListener("hashchange", function () {
        showInitialSection();
    });

    window.addEventListener("resize", function () {
        resizeDashboardCharts();
    });

    const networkImage = document.querySelector(".network-image");
    if (networkImage) {
        const ZOOM_SCALE = 2;
        const imageCard = networkImage.closest(".network-image-card");
        let isZoomed = false;
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragOriginX = 0;
        let dragOriginY = 0;

        networkImage.draggable = false;
        networkImage.addEventListener("dragstart", function (event) {
            event.preventDefault();
        });

        function getMaxTranslate(scale) {
            const baseRect = imageCard ? imageCard.getBoundingClientRect() : networkImage.getBoundingClientRect();
            return {
                x: Math.max(0, (baseRect.width * (scale - 1)) / 2),
                y: Math.max(0, (baseRect.height * (scale - 1)) / 2)
            };
        }

        function clampTranslate(x, y, scale) {
            const limits = getMaxTranslate(scale);
            return {
                x: Math.min(limits.x, Math.max(-limits.x, x)),
                y: Math.min(limits.y, Math.max(-limits.y, y))
            };
        }

        function applyTransform(scale) {
            networkImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        }

        networkImage.addEventListener("dblclick", function (event) {
            event.preventDefault();
            const rect = networkImage.getBoundingClientRect();

            if (!isZoomed) {
                const offsetX = event.clientX - rect.left;
                const offsetY = event.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                translateX = (1 - ZOOM_SCALE) * (offsetX - centerX);
                translateY = (1 - ZOOM_SCALE) * (offsetY - centerY);
                const clamped = clampTranslate(translateX, translateY, ZOOM_SCALE);
                translateX = clamped.x;
                translateY = clamped.y;

                networkImage.style.transformOrigin = "50% 50%";
                applyTransform(ZOOM_SCALE);
                networkImage.classList.add("zoomed");
                isZoomed = true;
                return;
            }

            isDragging = false;
            translateX = 0;
            translateY = 0;
            networkImage.style.transformOrigin = "50% 50%";
            applyTransform(1);
            networkImage.classList.remove("zoomed");
            networkImage.classList.remove("dragging");
            isZoomed = false;
        });

        networkImage.addEventListener("mousedown", function (event) {
            if (!isZoomed) return;
            event.preventDefault();
            isDragging = true;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            dragOriginX = translateX;
            dragOriginY = translateY;
            networkImage.classList.add("dragging");
        });

        window.addEventListener("mousemove", function (event) {
            if (!isZoomed || !isDragging) return;
            const deltaX = event.clientX - dragStartX;
            const deltaY = event.clientY - dragStartY;
            const clamped = clampTranslate(
                dragOriginX + deltaX,
                dragOriginY + deltaY,
                ZOOM_SCALE
            );
            translateX = clamped.x;
            translateY = clamped.y;
            applyTransform(ZOOM_SCALE);
        });

        window.addEventListener("mouseup", function () {
            if (!isDragging) return;
            isDragging = false;
            networkImage.classList.remove("dragging");
        });
    }

    if (window.Chart) {
        Chart.defaults.font.family = "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
        Chart.defaults.color = "#334155";
        Chart.defaults.animation = false;
        Chart.defaults.animations = false;
        if (Chart.defaults.transitions && Chart.defaults.transitions.active && Chart.defaults.transitions.active.animation) {
            Chart.defaults.transitions.active.animation.duration = 0;
        }

        // System Loss charts are rendered from EDD uploads later.
    }

    const mapElement = document.getElementById("map");
    const branchSelect = document.getElementById("branchSelect");
    const energizationYearSelect = document.getElementById("energizationYearSelect");
    const energizationMonthSelect = document.getElementById("energizationMonthSelect");
    const levelLegend = document.getElementById("levelLegend");
    const levelEditor = document.getElementById("levelEditor");
    const locationDetails = document.getElementById("locationDetails");
    const branchImageMap = document.getElementById("branchImageMap");
    const branchBaseImage = document.getElementById("branchBaseImage");
    const branchMaskCanvas = document.getElementById("branchMaskCanvas");
    const branchHoverLabel = document.getElementById("branchHoverLabel");

    if (mapElement && window.L) {
        const LEVELS = {
            "90-100": { label: "90% to 100%", className: "level-green", markerColor: "#6aa84f" },
            "80-89": { label: "80% to 89%", className: "level-yellow", markerColor: "#f4b400" },
            "70-79": { label: "70% to 79%", className: "level-orange", markerColor: "#ef8a30" },
            "60-69": { label: "60% to 69%", className: "level-red", markerColor: "#f4511e" }
        };
        const LEVEL_ORDER = ["90-100", "80-89", "70-79", "60-69"];

        const branchData = {
            "1": [
                { name: "Tabaco City", type: "City", coords: [13.3593077, 123.7302007], level: "90-100" },
                { name: "Santo Domingo", type: "Municipality", coords: [13.2377089, 123.7780984], level: "90-100" },
                { name: "Tiwi", type: "Municipality", coords: [13.4569196, 123.6796912], level: "80-89" },
                { name: "Malinao", type: "Municipality", coords: [13.3974574, 123.7049776], level: "80-89" },
                { name: "Malilipot", type: "Municipality", coords: [13.3190483, 123.7392658], level: "80-89" },
                { name: "Bacacay", type: "Municipality", coords: [13.2926072, 123.7912494], level: "70-79" }
            ],
            "2": [
                { name: "Daraga", type: "Municipality", coords: [13.1479697, 123.7120775], level: "90-100" },
                { name: "Legazpi City", type: "City", coords: [13.1388505, 123.7345746], level: "90-100" },
                { name: "Camalig", type: "Municipality", coords: [13.1815738, 123.6552668], level: "80-89" },
                { name: "Manito", type: "Municipality", coords: [13.1204, 123.8694], level: "80-89" },
                { name: "Rapu-Rapu", type: "Municipality", coords: [13.1856583, 124.1267772], level: "60-69" }
            ],
            "3": [
                { name: "Polangui", type: "Municipality", coords: [13.293769, 123.4843893], level: "90-100" },
                { name: "Ligao City", type: "City", coords: [13.2402789, 123.5365227], level: "90-100" },
                { name: "Guinobatan", type: "Municipality", coords: [13.1904597, 123.5999458], level: "90-100" },
                { name: "Libon", type: "Municipality", coords: [13.2988701, 123.4360839], level: "80-89" },
                { name: "Oas", type: "Municipality", coords: [13.2570425, 123.5001669], level: "80-89" },
                { name: "Pio Duran", type: "Municipality", coords: [13.0296985, 123.4431423], level: "70-79" },
                { name: "Jovellar", type: "Municipality", coords: [13.0693487, 123.6002707], level: "70-79" }
            ]
        };

        const branch3MaskFiles = {
            polangui: "/static/imgs/Polangui.png",
            ligao: "/static/imgs/Ligao.png",
            guinobatan: "/static/imgs/Guinobatan.png",
            libon: "/static/imgs/Libon.png",
            oas: "/static/imgs/Oas.png",
            pioduran: "/static/imgs/Pio%20Duran.png",
            jovellar: "/static/imgs/Jovellar.png"
        };
        const BRANCH3_MASK_ALPHA_MIN = 18;
        const BRANCH3_MASK_WHITE_SUM = 360;
        const BRANCH3_BASE_DARK_SUM = 600;
        const BRANCH3_ALIGN_TWEAK = {
            scaleX: 1,
            scaleY: 1,
            offsetX: 0,
            offsetY: 0
        };

        const map = L.map("map", {
            minZoom: 8,
            maxZoom: 13,
            zoomControl: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
            dragging: false,
            touchZoom: false
        });
        dashboardMap = map;

        let geoLayer = null;
        let albayGeoJsonData = null;
        let displayGeoJson = null;
        let currentBranch = "1";
        let currentBounds = null;
        const albayGeoJsonUrl = "/static/data/albay_municities.json";
        let branch3AssetsReady = false;
        let branch3AssetsFailed = false;
        let branch3LoadPromise = null;
        let branch3EventsBound = false;
        let branch3HitMap = null;
        let branch3MapWidth = 0;
        let branch3MapHeight = 0;
        let branch3HoverName = null;
        let branch3SelectedName = null;
        let branch3PaintCanvas = null;
        let branch3PaintCtx = null;
        let branch3MaskTransform = null;
        const branch3MaskEntries = [];
        const branch3EntryByName = {};

        function normalizeName(name) {
            return String(name || "")
                .toLowerCase()
                .replace("city of ", "")
                .replace(" city", "")
                .replace(/[^a-z0-9]/g, "");
        }

        function getFeatureName(feature) {
            const p = feature && feature.properties ? feature.properties : {};
            return p.__name_override || p.adm3_en || p.ADM3_EN || p.name || "";
        }

        function getBranchLocations(branchKey) {
            if (branchKey !== "all") {
                return branchData[branchKey] || [];
            }
            const merged = new Map();
            ["1", "2", "3"].forEach(function (key) {
                (branchData[key] || []).forEach(function (loc) {
                    const id = normalizeName(loc.name);
                    if (!merged.has(id)) {
                        merged.set(id, loc);
                    }
                });
            });
            return Array.from(merged.values());
        }

        function polygonLonLatCenter(polygonCoords) {
            const ring = polygonCoords && polygonCoords[0] ? polygonCoords[0] : [];
            if (!ring.length) return null;
            let lon = 0;
            let lat = 0;
            ring.forEach(function (pt) {
                lon += pt[0];
                lat += pt[1];
            });
            return [lon / ring.length, lat / ring.length];
        }

        function buildDisplayGeoJson(source) {
            const out = { type: "FeatureCollection", features: [] };
            (source.features || []).forEach(function (feature) {
                const rawName = getFeatureName(feature);
                const normalized = normalizeName(rawName);
                const geom = feature.geometry || {};

                if (geom.type === "MultiPolygon" && normalized === "tabaco") {
                    geom.coordinates.forEach(function (polyCoords) {
                        const center = polygonLonLatCenter(polyCoords);
                        let mappedName = rawName;
                        let suppressLabel = false;
                        if (center && center[0] > 123.75) {
                            mappedName = "Bacacay";
                            suppressLabel = true;
                        }
                        out.features.push({
                            type: "Feature",
                            properties: Object.assign({}, feature.properties, {
                                __name_override: mappedName,
                                __suppress_label: suppressLabel
                            }),
                            geometry: { type: "Polygon", coordinates: polyCoords }
                        });
                    });
                    return;
                }

                out.features.push(feature);
            });
            return out;
        }

        function setLocationDetailsContent(match, branchKey) {
            if (!locationDetails || !match) return;
            locationDetails.innerHTML =
                `<h3>${match.name}</h3>` +
                `<p><strong>Type:</strong> ${match.type}</p>` +
                `<p><strong>Branch:</strong> Branch ${branchKey}</p>` +
                `<p><strong>Electrification:</strong> ${LEVELS[match.level].label}</p>`;
        }

        function setMapMode(useBranchImage) {
            if (mapElement) {
                if (useBranchImage) {
                    mapElement.classList.add("is-hidden");
                } else {
                    mapElement.classList.remove("is-hidden");
                }
            }
            if (branchImageMap) {
                if (useBranchImage) {
                    branchImageMap.classList.remove("is-hidden");
                } else {
                    branchImageMap.classList.add("is-hidden");
                }
            }
            if (!useBranchImage && branchHoverLabel) {
                branchHoverLabel.classList.remove("visible");
            }
        }

        function clearBranch3HoverUi() {
            branch3HoverName = null;
            if (branchHoverLabel) {
                branchHoverLabel.classList.remove("visible");
            }
            if (branchImageMap) {
                branchImageMap.style.cursor = "default";
            }
        }

        function loadImageAsset(src) {
            return new Promise(function (resolve, reject) {
                const img = new Image();
                img.onload = function () { resolve(img); };
                img.onerror = function () { reject(new Error(`Failed to load ${src}`)); };
                img.src = src;
            });
        }

        function ensureBranchBaseImage() {
            return new Promise(function (resolve, reject) {
                if (!branchBaseImage) {
                    reject(new Error("Missing branch base image element"));
                    return;
                }
                if (branchBaseImage.complete && branchBaseImage.naturalWidth > 0) {
                    resolve(branchBaseImage);
                    return;
                }
                branchBaseImage.addEventListener("load", function () {
                    resolve(branchBaseImage);
                }, { once: true });
                branchBaseImage.addEventListener("error", function () {
                    reject(new Error("Failed to load base image"));
                }, { once: true });
            });
        }

        function ensureBranch3Assets() {
            if (branch3AssetsReady) {
                return Promise.resolve(true);
            }
            if (branch3AssetsFailed) {
                return Promise.resolve(false);
            }
            if (!branchImageMap || !branchBaseImage || !branchMaskCanvas) {
                branch3AssetsFailed = true;
                return Promise.resolve(false);
            }
            if (branch3LoadPromise) {
                return branch3LoadPromise;
            }

            const sources = [];
            (branchData["3"] || []).forEach(function (loc) {
                const normalized = normalizeName(loc.name);
                const src = branch3MaskFiles[normalized];
                if (!src) return;
                sources.push({
                    normalized: normalized,
                    location: loc,
                    src: src
                });
            });

            if (sources.length === 0) {
                branch3AssetsFailed = true;
                return Promise.resolve(false);
            }

            branch3LoadPromise = Promise.all(sources.map(function (item) {
                return loadImageAsset(item.src).then(function (img) {
                    return { normalized: item.normalized, location: item.location, image: img, scaledMask: null };
                });
            }))
                .then(function (entries) {
                    return ensureBranchBaseImage().then(function () {
                        branch3MaskEntries.length = 0;
                        entries.forEach(function (entry) {
                            branch3MaskEntries.push(entry);
                            branch3EntryByName[entry.normalized] = entry;
                        });
                        branch3AssetsReady = true;
                        branch3AssetsFailed = false;
                        branch3LoadPromise = null;
                        return true;
                    });
                })
                .catch(function () {
                    branch3AssetsReady = false;
                    branch3AssetsFailed = true;
                    branch3LoadPromise = null;
                    return false;
                });

            return branch3LoadPromise;
        }

        function getBranch3LocationsByName() {
            const out = {};
            (branchData["3"] || []).forEach(function (loc) {
                out[normalizeName(loc.name)] = loc;
            });
            return out;
        }

        function unionBounds(a, b) {
            if (!a) return b;
            if (!b) return a;
            const minX = Math.min(a.x, b.x);
            const minY = Math.min(a.y, b.y);
            const maxX = Math.max(a.x + a.width - 1, b.x + b.width - 1);
            const maxY = Math.max(a.y + a.height - 1, b.y + b.height - 1);
            return {
                x: minX,
                y: minY,
                width: (maxX - minX + 1),
                height: (maxY - minY + 1)
            };
        }

        function findPixelBounds(pixels, width, height, isMatch) {
            let minX = width;
            let minY = height;
            let maxX = -1;
            let maxY = -1;

            for (let y = 0, p = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1, p += 4) {
                    if (!isMatch(pixels, p)) continue;
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }

            if (maxX < 0 || maxY < 0) return null;
            return {
                x: minX,
                y: minY,
                width: (maxX - minX + 1),
                height: (maxY - minY + 1)
            };
        }

        function computeBranch3Alignment(width, height, scratchCtx) {
            if (!branchBaseImage) {
                return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
            }

            scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
            scratchCtx.clearRect(0, 0, width, height);
            scratchCtx.drawImage(branchBaseImage, 0, 0, width, height);
            const basePixels = scratchCtx.getImageData(0, 0, width, height).data;
            let baseBounds = findPixelBounds(basePixels, width, height, function (pixels, idx) {
                return pixels[idx + 3] > BRANCH3_MASK_ALPHA_MIN;
            });
            if (baseBounds && baseBounds.width > (width * 0.98) && baseBounds.height > (height * 0.98)) {
                const darkBounds = findPixelBounds(basePixels, width, height, function (pixels, idx) {
                    const alpha = pixels[idx + 3];
                    if (alpha <= BRANCH3_MASK_ALPHA_MIN) return false;
                    const rgbSum = pixels[idx] + pixels[idx + 1] + pixels[idx + 2];
                    return rgbSum < BRANCH3_BASE_DARK_SUM;
                });
                if (darkBounds) {
                    baseBounds = darkBounds;
                }
            }

            let maskBounds = null;
            branch3MaskEntries.forEach(function (entry) {
                scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
                scratchCtx.clearRect(0, 0, width, height);
                scratchCtx.drawImage(entry.image, 0, 0, width, height);
                const pixels = scratchCtx.getImageData(0, 0, width, height).data;
                const entryBounds = findPixelBounds(pixels, width, height, function (pix, idx) {
                    const alpha = pix[idx + 3];
                    if (alpha <= BRANCH3_MASK_ALPHA_MIN) return false;
                    const rgbSum = pix[idx] + pix[idx + 1] + pix[idx + 2];
                    return rgbSum > BRANCH3_MASK_WHITE_SUM;
                });
                maskBounds = unionBounds(maskBounds, entryBounds);
            });

            if (!baseBounds || !maskBounds || maskBounds.width <= 0 || maskBounds.height <= 0) {
                return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
            }

            const scaleX = baseBounds.width / maskBounds.width;
            const scaleY = baseBounds.height / maskBounds.height;
            const offsetX = baseBounds.x - (maskBounds.x * scaleX);
            const offsetY = baseBounds.y - (maskBounds.y * scaleY);

            return {
                scaleX: scaleX * BRANCH3_ALIGN_TWEAK.scaleX,
                scaleY: scaleY * BRANCH3_ALIGN_TWEAK.scaleY,
                offsetX: offsetX + BRANCH3_ALIGN_TWEAK.offsetX,
                offsetY: offsetY + BRANCH3_ALIGN_TWEAK.offsetY
            };
        }

        function rebuildBranch3HitMap(force) {
            if (!branch3AssetsReady || !branchMaskCanvas || !branchBaseImage) return;

            const width = Math.round(branchBaseImage.clientWidth || 0);
            const height = Math.round(branchBaseImage.clientHeight || 0);
            if (width <= 0 || height <= 0) return;
            if (!force && branch3HitMap && width === branch3MapWidth && height === branch3MapHeight) return;

            branch3MapWidth = width;
            branch3MapHeight = height;
            branchMaskCanvas.width = width;
            branchMaskCanvas.height = height;
            branchMaskCanvas.style.width = `${width}px`;
            branchMaskCanvas.style.height = `${height}px`;

            const scratchCanvas = document.createElement("canvas");
            scratchCanvas.width = width;
            scratchCanvas.height = height;
            const scratchCtx = scratchCanvas.getContext("2d", { willReadFrequently: true });
            if (!scratchCtx) return;

            const pixelCount = width * height;
            branch3HitMap = new Int16Array(pixelCount);
            branch3HitMap.fill(-1);

            const alignment = computeBranch3Alignment(width, height, scratchCtx);
            branch3MaskTransform = alignment;

            branch3MaskEntries.forEach(function (entry, entryIndex) {
                scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
                scratchCtx.clearRect(0, 0, width, height);
                scratchCtx.setTransform(
                    alignment.scaleX,
                    0,
                    0,
                    alignment.scaleY,
                    alignment.offsetX,
                    alignment.offsetY
                );
                scratchCtx.drawImage(entry.image, 0, 0, width, height);
                scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
                const pixels = scratchCtx.getImageData(0, 0, width, height).data;
                const fillMask = new Uint8ClampedArray(pixels.length);

                for (let i = 0, p = 0; i < pixelCount; i += 1, p += 4) {
                    const alpha = pixels[p + 3];
                    const rgbSum = pixels[p] + pixels[p + 1] + pixels[p + 2];
                    if (alpha > BRANCH3_MASK_ALPHA_MIN && rgbSum > BRANCH3_MASK_WHITE_SUM) {
                        branch3HitMap[i] = entryIndex;
                        fillMask[p] = 255;
                        fillMask[p + 1] = 255;
                        fillMask[p + 2] = 255;
                        fillMask[p + 3] = 255;
                    }
                }

                const scaledCanvas = document.createElement("canvas");
                scaledCanvas.width = width;
                scaledCanvas.height = height;
                const scaledCtx = scaledCanvas.getContext("2d");
                if (scaledCtx) {
                    const fillMaskImage = new ImageData(fillMask, width, height);
                    scaledCtx.putImageData(fillMaskImage, 0, 0);
                    entry.scaledMask = scaledCanvas;
                }
            });

            branch3PaintCanvas = document.createElement("canvas");
            branch3PaintCanvas.width = width;
            branch3PaintCanvas.height = height;
            branch3PaintCtx = branch3PaintCanvas.getContext("2d");
        }

        function rgbaFromHex(hexColor, alpha) {
            const clean = String(hexColor || "").replace("#", "").trim();
            const full = clean.length === 3
                ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
                : clean;
            const r = parseInt(full.slice(0, 2), 16) || 0;
            const g = parseInt(full.slice(2, 4), 16) || 0;
            const b = parseInt(full.slice(4, 6), 16) || 0;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        function drawBranch3Mask(targetCtx, entry, color, alpha) {
            if (!targetCtx || !entry || !entry.scaledMask || !branch3PaintCanvas || !branch3PaintCtx) return;
            branch3PaintCtx.clearRect(0, 0, branch3PaintCanvas.width, branch3PaintCanvas.height);
            branch3PaintCtx.drawImage(entry.scaledMask, 0, 0);
            branch3PaintCtx.globalCompositeOperation = "source-in";
            branch3PaintCtx.fillStyle = rgbaFromHex(color, alpha);
            branch3PaintCtx.fillRect(0, 0, branch3PaintCanvas.width, branch3PaintCanvas.height);
            branch3PaintCtx.globalCompositeOperation = "source-over";
            targetCtx.drawImage(branch3PaintCanvas, 0, 0);
        }

        function renderBranch3Overlay(branchByName) {
            if (!branch3AssetsReady || !branchMaskCanvas) return;
            rebuildBranch3HitMap(false);
            if (!branch3HitMap || branchMaskCanvas.width === 0 || branchMaskCanvas.height === 0) return;

            const ctx = branchMaskCanvas.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, branchMaskCanvas.width, branchMaskCanvas.height);

            const selected = branch3SelectedName ? branch3EntryByName[branch3SelectedName] : null;
            const hovered = branch3HoverName ? branch3EntryByName[branch3HoverName] : null;

            branch3MaskEntries.forEach(function (entry) {
                const loc = branchByName[entry.normalized];
                if (!loc) return;
                drawBranch3Mask(ctx, entry, LEVELS[loc.level].markerColor, 0.34);
            });

            if (selected) {
                const selectedLoc = branchByName[selected.normalized];
                if (selectedLoc) {
                    drawBranch3Mask(ctx, selected, LEVELS[selectedLoc.level].markerColor, 0.56);
                }
            }
            if (hovered) {
                const hoveredLoc = branchByName[hovered.normalized];
                if (hoveredLoc) {
                    const isSame = selected && hovered.normalized === selected.normalized;
                    drawBranch3Mask(ctx, hovered, LEVELS[hoveredLoc.level].markerColor, isSame ? 0.74 : 0.66);
                }
            }
        }

        function getBranch3HitFromEvent(event, branchByName) {
            if (!branch3HitMap || !branchBaseImage || !branch3MapWidth || !branch3MapHeight) return null;

            const rect = branchBaseImage.getBoundingClientRect();
            if (!rect.width || !rect.height) return null;
            if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
            ) {
                return null;
            }

            const x = Math.max(0, Math.min(
                branch3MapWidth - 1,
                Math.floor(((event.clientX - rect.left) / rect.width) * branch3MapWidth)
            ));
            const y = Math.max(0, Math.min(
                branch3MapHeight - 1,
                Math.floor(((event.clientY - rect.top) / rect.height) * branch3MapHeight)
            ));

            const hitIndex = branch3HitMap[(y * branch3MapWidth) + x];
            if (hitIndex < 0 || hitIndex >= branch3MaskEntries.length) {
                return null;
            }

            const hitEntry = branch3MaskEntries[hitIndex];
            return branchByName[hitEntry.normalized] ? hitEntry.normalized : null;
        }

        function updateBranch3HoverLabel(normalizedName, event) {
            if (!branchHoverLabel || !branchImageMap || !event) return;
            if (!normalizedName) {
                branchHoverLabel.classList.remove("visible");
                return;
            }

            const loc = getBranch3LocationsByName()[normalizedName];
            if (!loc) {
                branchHoverLabel.classList.remove("visible");
                return;
            }

            const frameRect = branchImageMap.getBoundingClientRect();
            const x = Math.max(8, Math.min(frameRect.width - 8, event.clientX - frameRect.left));
            const y = Math.max(8, Math.min(frameRect.height - 8, event.clientY - frameRect.top));

            branchHoverLabel.textContent = loc.name;
            branchHoverLabel.style.left = `${x}px`;
            branchHoverLabel.style.top = `${y}px`;
            branchHoverLabel.classList.add("visible");
        }

        function bindBranch3Events() {
            if (branch3EventsBound || !branchImageMap) return;
            branch3EventsBound = true;

            branchImageMap.addEventListener("mousemove", function (event) {
                if (currentBranch !== "3" || !branch3AssetsReady) return;
                const branchByName = getBranch3LocationsByName();
                const hitName = getBranch3HitFromEvent(event, branchByName);
                if (hitName !== branch3HoverName) {
                    branch3HoverName = hitName;
                    renderBranch3Overlay(branchByName);
                }
                branchImageMap.style.cursor = hitName ? "pointer" : "default";
                updateBranch3HoverLabel(hitName, event);
            });

            branchImageMap.addEventListener("mouseleave", function () {
                if (currentBranch !== "3") return;
                clearBranch3HoverUi();
                renderBranch3Overlay(getBranch3LocationsByName());
            });

            branchImageMap.addEventListener("click", function (event) {
                if (currentBranch !== "3" || !branch3AssetsReady) return;
                const branchByName = getBranch3LocationsByName();
                const hitName = getBranch3HitFromEvent(event, branchByName);
                if (!hitName) return;
                branch3SelectedName = hitName;
                renderBranch3Overlay(branchByName);
                const loc = branchByName[hitName];
                if (loc) {
                    setLocationDetailsContent(loc, "3");
                }
            });
        }

        function renderBranch3ImageMap() {
            const branchByName = getBranch3LocationsByName();
            setMapMode(true);

            if (geoLayer) {
                map.removeLayer(geoLayer);
                geoLayer = null;
            }
            currentBounds = null;
            map.setMaxBounds(null);

            if (!branch3AssetsReady) {
                ensureBranch3Assets().then(function (loaded) {
                    if (loaded && currentBranch === "3") {
                        requestAnimationFrame(function () {
                            bindBranch3Events();
                            rebuildBranch3HitMap(true);
                            renderBranch3Overlay(branchByName);
                        });
                    }
                });
                return;
            }

            requestAnimationFrame(function () {
                bindBranch3Events();
                rebuildBranch3HitMap(false);
                renderBranch3Overlay(branchByName);
            });
        }

        function renderLegend(branchKey) {
            const locations = getBranchLocations(branchKey);
            const grouped = {};
            LEVEL_ORDER.forEach(function (level) {
                grouped[level] = locations.filter(function (loc) { return loc.level === level; });
            });

            levelLegend.innerHTML = "";
            LEVEL_ORDER.forEach(function (level) {
                if (grouped[level].length === 0) return;

                const block = document.createElement("div");
                block.className = "legend-group";

                const title = document.createElement("div");
                title.className = `legend-title ${LEVELS[level].className}`;
                title.textContent = LEVELS[level].label;
                title.style.color = LEVELS[level].markerColor;

                const list = document.createElement("ul");
                list.className = "legend-items";
                grouped[level].forEach(function (loc) {
                    const item = document.createElement("li");
                    item.textContent = loc.name;
                    item.style.color = LEVELS[level].markerColor;
                    list.appendChild(item);
                });

                block.appendChild(title);
                block.appendChild(list);
                levelLegend.appendChild(block);
            });
        }

        function renderEditor(branchKey) {
            const locations = getBranchLocations(branchKey);
            levelEditor.innerHTML = "";

            locations.forEach(function (loc) {
                const row = document.createElement("div");
                row.className = "editor-row";

                const label = document.createElement("label");
                label.textContent = loc.name;

                const select = document.createElement("select");
                LEVEL_ORDER.forEach(function (level) {
                    const option = document.createElement("option");
                    option.value = level;
                    option.textContent = LEVELS[level].label;
                    if (loc.level === level) option.selected = true;
                    select.appendChild(option);
                });

                select.addEventListener("change", function () {
                    loc.level = select.value;
                    renderLegend(branchKey);
                    renderMap(branchKey, false);
                });

                row.appendChild(label);
                row.appendChild(select);
                levelEditor.appendChild(row);
            });
        }

        function renderMap(branchKey, fitToBranch) {
            if (branchKey === "3" && branchImageMap && branchBaseImage && branchMaskCanvas) {
                renderBranch3ImageMap();
                return;
            }

            setMapMode(false);
            clearBranch3HoverUi();

            if (!albayGeoJsonData) return;
            const locations = getBranchLocations(branchKey);
            const branchByName = {};
            let selectedName = null;
            locations.forEach(function (loc) {
                branchByName[normalizeName(loc.name)] = loc;
            });

            if (geoLayer) {
                map.removeLayer(geoLayer);
            }

            const renderGeoJson = displayGeoJson || buildDisplayGeoJson(albayGeoJsonData);
            function styleForFeature(feature) {
                const rawName = getFeatureName(feature);
                const normalized = normalizeName(rawName);
                const match = branchByName[normalized];
                const isSelected = selectedName && selectedName === normalized;
                return {
                    color: isSelected ? "#0b1220" : "#475569",
                    weight: isSelected ? 3 : 1.2,
                    fillColor: LEVELS[match.level].markerColor,
                    fillOpacity: isSelected ? 0.78 : 0.6
                };
            }

            geoLayer = L.geoJSON(renderGeoJson, {
                filter: function (feature) {
                    const rawName = getFeatureName(feature);
                    return !!branchByName[normalizeName(rawName)];
                },
                style: styleForFeature,
                onEachFeature: function (feature, layer) {
                    const rawName = getFeatureName(feature);
                    const normalized = normalizeName(rawName);
                    const match = branchByName[normalized];
                    const displayName = rawName.replace("City of ", "") || "Unknown";
                    const featureProps = feature && feature.properties ? feature.properties : {};
                    const suppressLabel = !!featureProps.__suppress_label;

                    if (!suppressLabel) {
                        layer.bindTooltip(displayName, {
                            permanent: true,
                            direction: "center",
                            opacity: 0.9,
                            className: "aleco-label"
                        });
                    }
                    layer.bindPopup(
                        `<b>${match.name}</b><br>${match.type}, Albay<br>` +
                        `Electrification: ${LEVELS[match.level].label}`
                    );

                    layer.on("click", function () {
                        selectedName = normalized;

                        geoLayer.setStyle(styleForFeature);

                        geoLayer.eachLayer(function (lyr) {
                            const nm = normalizeName(getFeatureName(lyr.feature));

                            if (nm === selectedName) {
                                lyr.setStyle({
                                    weight: 3,
                                    color: "#0b1220",
                                    fillOpacity: 0.78
                                });

                                lyr.bringToFront();
                            }
                        });

    setLocationDetailsContent(match, branchKey);
});
                }
            }).addTo(map);

            const branchPolygons = geoLayer.getLayers().filter(function (layer) {
                const rawName = getFeatureName(layer.feature);
                return !!branchByName[normalizeName(rawName)];
            });

            if (branchPolygons.length === 0) return;
            currentBounds = L.featureGroup(branchPolygons).getBounds().pad(0.04);
            map.setMinZoom(6);
            map.setMaxZoom(13);
            map.fitBounds(currentBounds, {
                animate: false,
                paddingTopLeft: [20, 20],
                paddingBottomRight: [20, 20]
            });
            const lockedZoom = map.getZoom();
            map.setMinZoom(lockedZoom);
            map.setMaxZoom(lockedZoom);
            map.setMaxBounds(currentBounds);
            map.options.maxBoundsViscosity = 1.0;
        }

        function renderBranch(branchKey) {
            currentBranch = branchKey;
            if (branchKey !== "3") {
                branch3SelectedName = null;
            }
            clearBranch3HoverUi();
            renderLegend(branchKey);
            renderEditor(branchKey);

            if (locationDetails) {
                locationDetails.innerHTML =
                    "<h3>Location Details</h3>" +
                    "<p>Click a location on the map to see details.</p>";
            }

            requestAnimationFrame(function () {
                renderMap(branchKey, true);
            });
        }

        map.on("drag", function () {
            if (currentBounds) {
                map.panInsideBounds(currentBounds, { animate: false });
            }
        });

        if (branchSelect) {
            branchSelect.addEventListener("change", function () {
                renderBranch(branchSelect.value);
            });
        }

        window.addEventListener("resize", function () {
            if (currentBranch === "3" && branch3AssetsReady) {
                rebuildBranch3HitMap(true);
                renderBranch3Overlay(getBranch3LocationsByName());
            }
        });

        onMapPanelShown = function () {
            renderBranch(currentBranch);
        };

        renderBranch(currentBranch);
        ensureBranch3Assets();

        fetch(albayGeoJsonUrl)
            .then(function (response) {
                if (!response.ok) throw new Error("Failed to load map data");
                return response.json();
            })
            .then(function (data) {
                albayGeoJsonData = data;
                displayGeoJson = buildDisplayGeoJson(data);
                renderBranch(currentBranch);
            })
            .catch(function () {
                if (locationDetails && currentBranch !== "3") {
                    locationDetails.innerHTML =
                        "<h3>Map Data Error</h3><p>Unable to load Albay boundary data right now.</p>";
                }
            });

        setTimeout(function () {
            map.invalidateSize();
        }, 120);
    }

    function initSvgOverlayMap() {
        const mapContainers = Array.from(document.querySelectorAll("[data-interactive-map]"));
        if (mapContainers.length === 0) return;

        const LEVELS = {
            "90-100": { label: "90% to 100%", markerColor: "#6aa84f" },
            "80-89": { label: "80% to 89%", markerColor: "#f4b400" },
            "70-79": { label: "70% to 79%", markerColor: "#ef8a30" },
            "60-69": { label: "60% to 69%", markerColor: "#f4511e" }
        };
        const LEVEL_ORDER = ["90-100", "80-89", "70-79", "60-69"];

        let branchData = {
            "1": [],
            "2": [],
            "3": []
        };

        const defaultLocationMarkup = locationDetails ? locationDetails.innerHTML : "";

        function normalizeName(name) {
            return String(name || "")
                .toLowerCase()
                .replace("city of ", "")
                .replace(" city", "")
                .replace(/[^a-z0-9]/g, "");
        }

        function formatPercent(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return "";
            return numeric.toFixed(2);
        }

        function formatCount(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return "N/A";
            return Math.round(numeric).toLocaleString();
        }

        function levelFromPercent(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return "60-69";
            if (numeric >= 90) return "90-100";
            if (numeric >= 80) return "80-89";
            if (numeric >= 70) return "70-79";
            return "60-69";
        }

        const locationIndex = new Map();

        function resetLocationCatalog() {
            branchData = {
                "1": [],
                "2": [],
                "3": []
            };
            locationIndex.clear();
        }

        function ensureLocationEntry(raw) {
            if (!raw || !raw.name) return null;
            const key = normalizeName(raw.name);
            if (!key) return null;

            const branchKey = String(raw.branch || "");
            if (locationIndex.has(key)) {
                const existing = locationIndex.get(key);
                if (raw.type) existing.type = raw.type;
                if (branchData[branchKey] && existing.branch !== branchKey) {
                    if (branchData[existing.branch]) {
                        branchData[existing.branch] = branchData[existing.branch].filter(function (item) {
                            return normalizeName(item.name) !== key;
                        });
                    }
                    existing.branch = branchKey;
                    branchData[branchKey].push(existing);
                }
                return existing;
            }

            if (!branchData[branchKey]) return null;
            const entry = {
                name: String(raw.name),
                type: raw.type || "Municipality",
                branch: branchKey,
                level: "60-69",
                description: "No uploaded Energization data yet."
            };
            branchData[branchKey].push(entry);
            locationIndex.set(key, entry);
            return entry;
        }

        function setLocationCatalog(locations) {
            resetLocationCatalog();
            (locations || []).forEach(function (item) {
                ensureLocationEntry(item);
            });
        }

        function loadEnergizationLocationCatalog() {
            if (isStaticSite()) return Promise.resolve(false);
            return fetchJson("/api/energization-locations")
                .then(function (result) {
                    if (!result.ok) return false;
                    const payload = result.payload || {};
                    const locations = Array.isArray(payload.locations) ? payload.locations : [];
                    if (locations.length === 0) return false;
                    setLocationCatalog(locations);
                    return true;
                })
                .catch(function () {
                    return false;
                });
        }

        const mapContexts = [];
        const mapPanels = Array.from(document.querySelectorAll(".map-panel"));
        const mapImageElements = mapContainers
            .map(function (map) { return map.querySelector(".map-image"); })
            .filter(function (img) { return !!img; });
        const branchImageByKey = {
            all: "/static/imgs/branch 11.png",
            "1": "/static/imgs/branch 1.png",
            "2": "/static/imgs/branch 2.png",
            "3": "/static/imgs/branch 3.png"
        };
        const branchImageAltByKey = {
            all: "Albay service map - All Branches",
            "1": "Albay service map - Branch 1",
            "2": "Albay service map - Branch 2",
            "3": "Albay service map - Branch 3"
        };
        let selectedLocationKey = null;
        let currentBranch = branchSelect ? branchSelect.value : "1";
        let energizationMonthItems = [];
        let selectedEnergizationUploadId = "";

        function setMapImageForBranch(branchKey) {
            if (mapImageElements.length === 0) return;
            const normalizedBranch = Object.prototype.hasOwnProperty.call(branchImageByKey, branchKey)
                ? branchKey
                : "all";
            const nextSrc = branchImageByKey[normalizedBranch];
            const nextAlt = branchImageAltByKey[normalizedBranch] || branchImageAltByKey.all;
            mapImageElements.forEach(function (img) {
                if (img.getAttribute("src") !== nextSrc) {
                    img.setAttribute("src", nextSrc);
                }
                if (nextAlt) {
                    img.setAttribute("alt", nextAlt);
                }
            });
        }

        function syncMapPanelVisibility(branchKey) {
            if (mapPanels.length === 0) return;
            const showAll = !branchKey || branchKey === "all";
            mapPanels.forEach(function (panel) {
                const panelBranch = panel.getAttribute("data-branch");
                const visible = showAll || !panelBranch || panelBranch === branchKey;
                panel.classList.toggle("is-hidden", !visible);
            });
        }

        function getBranchLocations(branchKey) {
            if (!branchKey || branchKey === "all") {
                return Array.from(locationIndex.values());
            }
            return branchData[branchKey] || [];
        }

        function applyLevelStyles(region, levelKey) {
            const level = LEVELS[levelKey];
            if (!level) return;
            region.style.setProperty("--region-color", level.markerColor);
            region.dataset.level = levelKey;
        }

        function updateLocationDetails(loc) {
            if (!locationDetails) return;
            if (!loc) {
                locationDetails.innerHTML = defaultLocationMarkup ||
                    "<h3>Location Details</h3><p>Click a location on the map to see details.</p>";
                return;
            }
            const hhElectrificationLevel = Number.isFinite(Number(loc.hhElectrificationLevel))
                ? `${formatPercent(loc.hhElectrificationLevel)}%`
                : (Number.isFinite(Number(loc.electrificationPercent)) ? `${formatPercent(loc.electrificationPercent)}%` : "N/A");
            locationDetails.innerHTML =
                `<h3>${loc.name}</h3>` +
                `<p><strong>Type:</strong> ${loc.type}</p>` +
                `<p><strong>Branch:</strong> Branch ${loc.branch}</p>` +
                `<p><strong>HH Electrification Level:</strong> ${hhElectrificationLevel}</p>` +
                `<p><strong>HHS Projected Potential 2024:</strong> ${formatCount(loc.households)}</p>` +
                `<p><strong>Energized HHS:</strong> ${formatCount(loc.energizedHouseholds)}</p>` +
                `<p><strong>Unenergized HHS:</strong> ${formatCount(loc.unenergizedHouseholds)}</p>` +
                `<p><strong>Electrification Band:</strong> ${LEVELS[loc.level].label}</p>`;
        }

        function applyEnergizationMapPayload(payload) {
            if (!payload || !Array.isArray(payload.locations)) return false;

            let changed = 0;
            payload.locations.forEach(function (incoming) {
                const loc = ensureLocationEntry(incoming);
                if (!loc) return;

                const percent = Number(incoming.electrification_percent);
                const hhElectrificationLevel = Number(incoming.hh_electrification_level);
                const households = Number(incoming.households);
                const energizedHouseholds = Number(incoming.energized_households);
                const unenergizedHouseholdsRaw = Number(incoming.unenergized_households);
                const levelFromPayload = LEVELS[incoming.level] ? incoming.level : null;

                if (Number.isFinite(percent)) {
                    loc.electrificationPercent = percent;
                    loc.level = levelFromPayload || levelFromPercent(percent);
                } else if (levelFromPayload) {
                    loc.level = levelFromPayload;
                }
                if (Number.isFinite(hhElectrificationLevel)) {
                    loc.hhElectrificationLevel = hhElectrificationLevel;
                } else if (Number.isFinite(percent)) {
                    loc.hhElectrificationLevel = percent;
                }
                if (Number.isFinite(households)) {
                    loc.households = households;
                }
                if (Number.isFinite(energizedHouseholds)) {
                    loc.energizedHouseholds = energizedHouseholds;
                }
                if (Number.isFinite(households) && Number.isFinite(energizedHouseholds)) {
                    loc.unenergizedHouseholds = households - energizedHouseholds;
                } else if (Number.isFinite(unenergizedHouseholdsRaw)) {
                    loc.unenergizedHouseholds = unenergizedHouseholdsRaw;
                }

                const descriptionParts = [];
                if (Number.isFinite(Number(loc.hhElectrificationLevel))) {
                    descriptionParts.push(`HH Electrification Level: ${formatPercent(loc.hhElectrificationLevel)}%`);
                }
                if (
                    Number.isFinite(Number(loc.households)) &&
                    Number.isFinite(Number(loc.energizedHouseholds)) &&
                    Number.isFinite(Number(loc.unenergizedHouseholds))
                ) {
                    descriptionParts.push(
                        `HHs: ${formatCount(loc.households)}, Energized: ${formatCount(loc.energizedHouseholds)}, Unenergized: ${formatCount(loc.unenergizedHouseholds)}`
                    );
                }
                if (payload.label) {
                    descriptionParts.push(`Source: ${payload.label}`);
                }
                loc.description = descriptionParts.join(" | ") || loc.description;
                changed += 1;
            });

            if (changed === 0) return false;

            mapContexts.forEach(function (context) {
                context.regions.forEach(function (region) {
                    const key = normalizeName(region.getAttribute("data-name"));
                    const loc = locationIndex.get(key);
                    if (!loc) return;
                    if (loc.branch) {
                        region.dataset.branch = loc.branch;
                    }
                    applyLevelStyles(region, loc.level);
                });
            });

            renderLegend(currentBranch);
            if (selectedLocationKey) {
                updateLocationDetails(locationIndex.get(selectedLocationKey));
            }
            return true;
        }

        function getYearItems(yearValue) {
            if (!yearValue) {
                return energizationMonthItems.slice();
            }
            return energizationMonthItems.filter(function (item) {
                return String(item.year || "") === String(yearValue);
            });
        }

        function fillEnergizationMonthSelect(yearValue, preferredUploadId) {
            if (!energizationMonthSelect) {
                selectedEnergizationUploadId = preferredUploadId || "";
                return selectedEnergizationUploadId;
            }

            const previousValue = energizationMonthSelect.value;
            const yearItems = getYearItems(yearValue);
            energizationMonthSelect.innerHTML = "";

            if (yearItems.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No months found";
                energizationMonthSelect.appendChild(option);
                energizationMonthSelect.disabled = true;
                selectedEnergizationUploadId = "";
                return "";
            }

            energizationMonthSelect.disabled = false;
            yearItems.forEach(function (item) {
                const option = document.createElement("option");
                option.value = item.id || "";
                option.textContent = item.label || item.month_label || item.display_name || "Unknown";
                energizationMonthSelect.appendChild(option);
            });

            const availableValues = Array.from(energizationMonthSelect.options).map(function (opt) { return opt.value; });
            const candidate = preferredUploadId || previousValue || (yearItems[0] && yearItems[0].id) || "";
            energizationMonthSelect.value = availableValues.indexOf(candidate) !== -1 ? candidate : availableValues[0];
            selectedEnergizationUploadId = energizationMonthSelect.value || "";
            return selectedEnergizationUploadId;
        }

        function populateEnergizationSelectors(items, preferredUploadId) {
            energizationMonthItems = Array.isArray(items) ? items.slice() : [];

            if (!energizationYearSelect) {
                return fillEnergizationMonthSelect("", preferredUploadId);
            }

            const previousYear = energizationYearSelect.value || "";
            const years = Array.from(new Set(
                energizationMonthItems
                    .map(function (item) { return item.year; })
                    .filter(function (year) { return Number.isFinite(Number(year)); })
                    .map(function (year) { return String(year); })
            )).sort(function (a, b) { return Number(b) - Number(a); });

            energizationYearSelect.innerHTML = "";
            if (years.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No years found";
                energizationYearSelect.appendChild(option);
                energizationYearSelect.disabled = true;
                return fillEnergizationMonthSelect("", preferredUploadId);
            }

            energizationYearSelect.disabled = false;
            years.forEach(function (yearValue) {
                const option = document.createElement("option");
                option.value = yearValue;
                option.textContent = yearValue;
                energizationYearSelect.appendChild(option);
            });

            let selectedYear = years.indexOf(previousYear) !== -1 ? previousYear : years[0];
            if (preferredUploadId) {
                const preferred = energizationMonthItems.find(function (item) {
                    return item.id === preferredUploadId && Number.isFinite(Number(item.year));
                });
                if (preferred) {
                    selectedYear = String(preferred.year);
                }
            }
            energizationYearSelect.value = selectedYear;
            return fillEnergizationMonthSelect(selectedYear, preferredUploadId);
        }

        function loadEnergizationMapByUploadId(uploadId) {
            const selectedId = String(uploadId || "").trim();
            selectedEnergizationUploadId = selectedId;
            if (!selectedId || isStaticSite()) return Promise.resolve(false);

            return fetchJson(`/api/energization-map?upload_id=${encodeURIComponent(selectedId)}`)
                .then(function (result) {
                    if (!result.ok) return false;
                    return applyEnergizationMapPayload(result.payload || {});
                })
                .catch(function () {
                    return false;
                });
        }

        function refreshEnergizationMapData(preferredUploadId) {
            if (isStaticSite()) return Promise.resolve(false);
            return fetchJson("/api/energization-map-options")
                .then(function (result) {
                    if (!result.ok) return false;
                    const payload = result.payload || {};
                    const selectedId = populateEnergizationSelectors(payload.items || [], preferredUploadId || selectedEnergizationUploadId);
                    if (!selectedId) return false;
                    return loadEnergizationMapByUploadId(selectedId);
                })
                .catch(function () {
                    return false;
                });
        }

        function renderLegend(branchKey) {
            if (!levelLegend) return;
            const locations = getBranchLocations(branchKey);
            const grouped = {};
            LEVEL_ORDER.forEach(function (level) {
                grouped[level] = locations.filter(function (loc) { return loc.level === level; });
            });

            levelLegend.innerHTML = "";
            LEVEL_ORDER.forEach(function (level) {
                if (grouped[level].length === 0) return;

                const block = document.createElement("div");
                block.className = "legend-group";

                const title = document.createElement("div");
                title.className = "legend-title";
                title.textContent = LEVELS[level].label;
                title.style.color = LEVELS[level].markerColor;

                const list = document.createElement("ul");
                list.className = "legend-items";
                grouped[level].forEach(function (loc) {
                    const item = document.createElement("li");
                    item.textContent = loc.name;
                    item.style.color = LEVELS[level].markerColor;
                    list.appendChild(item);
                });

                block.appendChild(title);
                block.appendChild(list);
                levelLegend.appendChild(block);
            });
        }

        function renderEditor(branchKey) {
            if (!levelEditor) return;
            const locations = getBranchLocations(branchKey);
            levelEditor.innerHTML = "";

            locations.forEach(function (loc) {
                const row = document.createElement("div");
                row.className = "editor-row";

                const label = document.createElement("label");
                label.textContent = loc.name;

                const select = document.createElement("select");
                LEVEL_ORDER.forEach(function (level) {
                    const option = document.createElement("option");
                    option.value = level;
                    option.textContent = LEVELS[level].label;
                    if (loc.level === level) option.selected = true;
                    select.appendChild(option);
                });

                select.addEventListener("change", function () {
                    loc.level = select.value;
                    mapContexts.forEach(function (context) {
                        const key = normalizeName(loc.name);
                        const regions = context.regionsByName.get(key) || [];
                        regions.forEach(function (region) {
                            applyLevelStyles(region, loc.level);
                        });
                    });
                    renderLegend(branchKey);
                    if (selectedLocationKey === normalizeName(loc.name)) {
                        updateLocationDetails(loc);
                    }
                });

                row.appendChild(label);
                row.appendChild(select);
                levelEditor.appendChild(row);
            });
        }

        function applyBranch(branchKey) {
            currentBranch = branchKey;
            syncMapPanelVisibility(branchKey);
            setMapImageForBranch(branchKey);
            mapContexts.forEach(function (context) {
                context.regions.forEach(function (region) {
                    const visible = branchKey === "all" || !region.dataset.branch || region.dataset.branch === branchKey;
                    region.style.display = visible ? "" : "none";
                    if (!visible && context.activeRegions.indexOf(region) !== -1) {
                        context.clearActive();
                    }
                });
            });
            renderLegend(branchKey);
            selectedLocationKey = null;
            updateLocationDetails(null);
        }

        function parseAreaFiles(rawList) {
            if (!rawList) return [];
            return rawList
                .split(",")
                .map(function (entry) { return entry.trim(); })
                .filter(function (entry) { return entry.length > 0; });
        }

        function displayNameFromFilename(fileName) {
            const baseName = String(fileName || "").split(/[\\/]/).pop() || "";
            const cleaned = baseName.replace(/\.svg$/i, "");
            let decoded = cleaned;
            try {
                decoded = decodeURIComponent(cleaned);
            } catch (error) {
                decoded = cleaned;
            }
            return decoded
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .replace(/[_-]+/g, " ")
                .trim();
        }

        function buildAreaUrl(base, fileName) {
            const safeBase = String(base || "").replace(/\/$/, "");
            const normalizedFile = String(fileName || "").replace(/^\/+/, "");
            if (!safeBase) return normalizedFile;
            if (/^https?:\/\//i.test(normalizedFile)) {
                return normalizedFile;
            }
            const segments = normalizedFile
                .split("/")
                .filter(function (segment) { return segment.length > 0; })
                .map(function (segment) { return encodeURIComponent(segment); });
            return `${safeBase}/${segments.join("/")}`;
        }

        function inferBranchFromAreaFile(fileName) {
            const match = String(fileName || "").match(/branch\s*([123])\b/i);
            if (!match) return "";
            return match[1];
        }

        function stripInlinePaintStyles(shape) {
            shape.removeAttribute("fill");
            shape.removeAttribute("stroke");
            shape.style.removeProperty("fill");
            shape.style.removeProperty("stroke");
            shape.style.removeProperty("fill-opacity");
            shape.style.removeProperty("stroke-opacity");
            shape.style.removeProperty("stroke-width");
        }

        function tagRegionShape(shape, areaName, branchKey) {
            if (!shape.classList.contains("map-region")) {
                shape.classList.add("map-region");
            }
            if (!shape.hasAttribute("data-name")) {
                shape.setAttribute("data-name", areaName);
            }
            if (branchKey && !shape.hasAttribute("data-branch")) {
                shape.setAttribute("data-branch", branchKey);
            }
            stripInlinePaintStyles(shape);
        }

        function splitPathIntoShapes(shape) {
            if (!shape || shape.nodeName.toLowerCase() !== "path") {
                return [shape];
            }
            const d = shape.getAttribute("d");
            if (!d) {
                return [shape];
            }
            const parts = d.match(/M[^M]*/g);
            if (!parts || parts.length <= 1) {
                return [shape];
            }
            const parent = shape.parentNode;
            if (!parent) {
                return [shape];
            }
            const clones = parts.map(function (part) {
                const clone = shape.cloneNode(false);
                clone.setAttribute("d", part.trim());
                clone.removeAttribute("id");
                parent.insertBefore(clone, shape);
                return clone;
            });
            parent.removeChild(shape);
            return clones;
        }

        function appendSvgArea(overlay, svgText, areaName, branchKey) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, "image/svg+xml");
            const svgEl = doc.documentElement;
            if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg") {
                return;
            }

            if (!overlay.getAttribute("viewBox") && svgEl.getAttribute("viewBox")) {
                overlay.setAttribute("viewBox", svgEl.getAttribute("viewBox"));
            }

            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.setAttribute("data-area", areaName);
            if (branchKey) {
                group.setAttribute("data-branch", branchKey);
            }

            while (svgEl.childNodes.length) {
                group.appendChild(svgEl.childNodes[0]);
            }

            overlay.appendChild(group);

            const namedRegions = Array.from(group.querySelectorAll("[data-name]")).filter(function (el) {
                return !el.closest("defs");
            });

            if (namedRegions.length > 0) {
                namedRegions.forEach(function (region) {
                    const regionName = region.getAttribute("data-name") || areaName;
                    const isShape = region.matches && region.matches("path, polygon, polyline, rect, circle, ellipse");
                    if (isShape) {
                        splitPathIntoShapes(region).forEach(function (shape) {
                            tagRegionShape(shape, regionName, branchKey);
                        });
                        return;
                    }
                    const regionShapes = Array.from(
                        region.querySelectorAll("path, polygon, polyline, rect, circle, ellipse")
                    ).filter(function (el) {
                        return !el.closest("defs");
                    });
                    regionShapes.forEach(function (shape) {
                        splitPathIntoShapes(shape).forEach(function (part) {
                            tagRegionShape(part, regionName, branchKey);
                        });
                    });
                });
                return;
            }

            const shapes = Array.from(
                group.querySelectorAll("path, polygon, polyline, rect, circle, ellipse")
            ).filter(function (el) {
                return !el.closest("defs");
            });

            if (shapes.length > 0) {
                shapes.forEach(function (shape) {
                    splitPathIntoShapes(shape).forEach(function (part) {
                        tagRegionShape(part, areaName, branchKey);
                    });
                });
            }
        }

        function loadSingleOverlaySvg(overlay, src) {
            if (!src) {
                return Promise.resolve();
            }
            return fetch(src)
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error("Unable to load SVG overlay");
                    }
                    return response.text();
                })
                .then(function (svgText) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(svgText, "image/svg+xml");
                    const svgEl = doc.documentElement;
                    if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg") {
                        return;
                    }
                    if (!overlay.getAttribute("viewBox") && svgEl.getAttribute("viewBox")) {
                        overlay.setAttribute("viewBox", svgEl.getAttribute("viewBox"));
                    }
                    overlay.innerHTML = svgEl.innerHTML;
                })
                .catch(function () {
                });
        }

        function loadOverlaySvg(overlay) {
            const areaFiles = parseAreaFiles(
                overlay.getAttribute("data-area-files") || overlay.getAttribute("data-areas")
            );
            const areaBase = overlay.getAttribute("data-area-base") || "";
            const src = overlay.getAttribute("data-src");

            if (areaFiles.length > 0) {
                overlay.innerHTML = "";
                const loaders = areaFiles.map(function (fileName) {
                    const areaName = displayNameFromFilename(fileName);
                    const branchKey = inferBranchFromAreaFile(fileName);
                    const url = buildAreaUrl(areaBase, fileName);
                    return fetch(url)
                        .then(function (response) {
                            if (!response.ok) {
                                throw new Error("Unable to load SVG area");
                            }
                            return response.text();
                        })
                        .then(function (svgText) {
                            appendSvgArea(overlay, svgText, areaName, branchKey);
                        })
                        .catch(function () {
                            // Skip missing/invalid area files and continue loading others.
                        });
                });

                return Promise.allSettled(loaders).then(function () {
                    if (!overlay.querySelector("[data-name]")) {
                        return loadSingleOverlaySvg(overlay, src);
                    }
                    return;
                });
            }

            return loadSingleOverlaySvg(overlay, src);
        }

        function setupInteractiveMap(map, overlay, tooltip, title, body) {
            const regions = Array.from(overlay.querySelectorAll("[data-name]"));
            const regionsByName = new Map();
            let hoverKey = null;
            let hoverLayer = overlay.querySelector(".map-hover-layer");
            if (!hoverLayer) {
                hoverLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
                hoverLayer.classList.add("map-hover-layer");
                overlay.appendChild(hoverLayer);
            }
            let activeLayer = overlay.querySelector(".map-active-layer");
            if (!activeLayer) {
                activeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
                activeLayer.classList.add("map-active-layer");
                overlay.appendChild(activeLayer);
            }

            regions.forEach(function (region) {
                const key = normalizeName(region.getAttribute("data-name"));
                if (!regionsByName.has(key)) {
                    regionsByName.set(key, []);
                }
                regionsByName.get(key).push(region);

                const loc = locationIndex.get(key);
                if (loc) {
                    if (loc.branch) {
                        region.dataset.branch = loc.branch;
                    } else if (region.dataset.branch) {
                        loc.branch = region.dataset.branch;
                    }
                    if (!region.dataset.description && loc.description) {
                        region.dataset.description = loc.description;
                    }
                    applyLevelStyles(region, loc.level);
                }
            });

            const context = {
                map: map,
                overlay: overlay,
                tooltip: tooltip,
                title: title,
                body: body,
                regions: regions,
                regionsByName: regionsByName,
                activeRegions: [],
                activeKey: null,
                clearActive: null
            };

            function clearActiveRegions() {
                if (context.activeRegions.length > 0) {
                    context.activeRegions.forEach(function (region) {
                        region.classList.remove("is-active");
                    });
                }
                context.activeRegions = [];
                context.activeKey = null;
            }

            function clearActive() {
                clearActiveRegions();
                clearActiveLayer();
                tooltip.classList.remove("is-visible");
                tooltip.setAttribute("aria-hidden", "true");
            }

            context.clearActive = clearActive;

            function bringRegionsToFront(list) {
                const handledGroups = new Set();
                list.forEach(function (region) {
                    const group = region.closest("[data-area]");
                    if (group && group.parentNode) {
                        if (!handledGroups.has(group)) {
                            handledGroups.add(group);
                            group.parentNode.appendChild(group);
                        }
                    }
                    if (region.parentNode) {
                        region.parentNode.appendChild(region);
                    }
                });
                if (hoverLayer && hoverLayer.parentNode) {
                    hoverLayer.parentNode.appendChild(hoverLayer);
                }
                if (activeLayer && activeLayer.parentNode) {
                    activeLayer.parentNode.appendChild(activeLayer);
                }
            }

            function clearHoverLayer() {
                if (hoverLayer) {
                    hoverLayer.innerHTML = "";
                }
                hoverKey = null;
            }

            function renderHoverLayer(groupRegions) {
                if (!hoverLayer) return;
                hoverLayer.innerHTML = "";
                groupRegions.forEach(function (region) {
                    const clone = region.cloneNode(true);
                    if (clone.hasAttribute("id")) {
                        clone.removeAttribute("id");
                    }
                    hoverLayer.appendChild(clone);
                });
            }

            function clearActiveLayer() {
                if (activeLayer) {
                    activeLayer.innerHTML = "";
                }
            }

            function renderActiveLayer(groupRegions) {
                if (!activeLayer) return;
                activeLayer.innerHTML = "";
                groupRegions.forEach(function (region) {
                    const clone = region.cloneNode(true);
                    if (clone.hasAttribute("id")) {
                        clone.removeAttribute("id");
                    }
                    activeLayer.appendChild(clone);
                });
            }

            function setHover(region) {
                if (!region) {
                    clearHoverLayer();
                    return;
                }
                const key = normalizeName(region.getAttribute("data-name"));
                if (key === hoverKey) return;
                hoverKey = key;
                const groupRegions = regionsByName.get(key) || [region];
                renderHoverLayer(groupRegions);
                bringRegionsToFront(groupRegions);
            }

            function setActive(region) {
                if (!region) return;
                const key = normalizeName(region.getAttribute("data-name"));
                const groupRegions = regionsByName.get(key) || [region];
                if (context.activeKey !== key) {
                    clearActiveRegions();
                }
                groupRegions.forEach(function (item) {
                    item.classList.add("is-active");
                });
                context.activeRegions = groupRegions;
                context.activeKey = key;
                bringRegionsToFront(groupRegions);
                renderActiveLayer(groupRegions);
            }

            function getPoint(event, region) {
                if (event && typeof event.clientX === "number" && typeof event.clientY === "number") {
                    return { x: event.clientX, y: event.clientY };
                }
                const rect = region.getBoundingClientRect();
                return {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
            }

            function positionTooltip(point) {
                const mapRect = map.getBoundingClientRect();
                const tipRect = tooltip.getBoundingClientRect();
                const padding = 12;

                let left = point.x - mapRect.left + padding;
                let top = point.y - mapRect.top + padding;

                const maxLeft = mapRect.width - tipRect.width - padding;
                const maxTop = mapRect.height - tipRect.height - padding;

                if (left > maxLeft) left = maxLeft;
                if (top > maxTop) top = maxTop;
                if (left < padding) left = padding;
                if (top < padding) top = padding;

                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
            }

            function showTooltip(region, event) {
                const name = region.getAttribute("data-name") || "Unknown";
                const key = normalizeName(region.getAttribute("data-name"));
                const loc = locationIndex.get(key);
                title.textContent = name;
                if (loc && LEVELS[loc.level]) {
                    const hhElectrificationLevel = Number.isFinite(Number(loc.hhElectrificationLevel))
                        ? `${formatPercent(loc.hhElectrificationLevel)}%`
                        : (Number.isFinite(Number(loc.electrificationPercent)) ? `${formatPercent(loc.electrificationPercent)}%` : "N/A");
                    body.innerHTML =
                        `<div><strong>HH Electrification Level:</strong> ${hhElectrificationLevel}</div>` +
                        `<div><strong>HHS Projected Potential 2024:</strong> ${formatCount(loc.households)}</div>` +
                        `<div><strong>Energized HHS:</strong> ${formatCount(loc.energizedHouseholds)}</div>` +
                        `<div><strong>Unenergized HHS:</strong> ${formatCount(loc.unenergizedHouseholds)}</div>`;
                } else {
                    body.textContent = "No description available.";
                }
                tooltip.classList.add("is-visible");
                tooltip.setAttribute("aria-hidden", "false");
                const point = getPoint(event, region);
                requestAnimationFrame(function () {
                    positionTooltip(point);
                });
            }

            overlay.addEventListener("mouseover", function (event) {
                const region = event.target.closest("[data-name]");
                if (!region || !overlay.contains(region)) return;
                setHover(region);
            });

            overlay.addEventListener("mouseleave", function () {
                clearHoverLayer();
            });

            map.addEventListener("click", function (event) {
                const region = event.target.closest("[data-name]");
                if (!region || !overlay.contains(region)) {
                    clearActive();
                    return;
                }
                event.stopPropagation();
                setActive(region);
                showTooltip(region, event);
                const key = normalizeName(region.getAttribute("data-name"));
                selectedLocationKey = key;
                updateLocationDetails(locationIndex.get(key));
            });

        document.addEventListener("click", function (event) {
            if (map.contains(event.target)) return;
            clearActive();
        });

            mapContexts.push(context);
        }

        function initInteractiveMaps() {
            const loaders = mapContainers.map(function (map) {
                const overlay = map.querySelector("[data-map-overlay]");
                const tooltip = map.querySelector("[data-map-tooltip]");
                const title = map.querySelector("[data-map-tooltip-title]");
                const body = map.querySelector("[data-map-tooltip-body]");

                if (!overlay || !tooltip || !title || !body) return Promise.resolve();

                return loadOverlaySvg(overlay).then(function () {
                    setupInteractiveMap(map, overlay, tooltip, title, body);
                });
            });

            return Promise.all(loaders);
        }

        loadEnergizationLocationCatalog()
            .then(function () {
                return initInteractiveMaps();
            })
            .then(function () {
                applyBranch(currentBranch);
                return refreshEnergizationMapData();
            });

        if (branchSelect) {
            branchSelect.addEventListener("change", function () {
                applyBranch(branchSelect.value);
            });
        }
        if (energizationYearSelect) {
            energizationYearSelect.addEventListener("change", function () {
                const selectedId = fillEnergizationMonthSelect(energizationYearSelect.value || "", "");
                if (!selectedId) return;
                loadEnergizationMapByUploadId(selectedId);
            });
        }
        if (energizationMonthSelect) {
            energizationMonthSelect.addEventListener("change", function () {
                const selectedId = energizationMonthSelect.value || "";
                if (!selectedId) return;
                loadEnergizationMapByUploadId(selectedId);
            });
        }
        window.refreshEnergizationMapData = refreshEnergizationMapData;
    }

    function initLoginForm() {
        const form = document.getElementById("loginForm");
        if (!form) return;
        const errorText = document.getElementById("loginError");

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            const username = String(form.querySelector("#username")?.value || "").trim();
            const password = String(form.querySelector("#password")?.value || "");
            if (!username || !password) {
                if (errorText) {
                    errorText.textContent = "Username and password are required.";
                }
                return;
            }
            if (errorText) {
                errorText.textContent = "";
            }
            fetchJson("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username, password: password })
            }).then(function (result) {
                if (!result.ok) {
                    if (errorText) {
                        errorText.textContent = result.payload.error || "Invalid username or password.";
                    }
                    return;
                }
                if (result.payload && result.payload.access_token) {
                    setStoredTokens(result.payload.access_token, result.payload.refresh_token);
                }
                window.location.href = getDashboardPath();
            });
        });
    }

    function initPasswordToggles() {
        document.querySelectorAll(".password-field").forEach(function (field) {
            const input = field.querySelector('input[type="password"], input[type="text"]');
            const toggle = field.querySelector(".password-toggle");
            if (!input || !toggle) return;

            toggle.addEventListener("click", function () {
                const isVisible = input.type === "text";
                input.type = isVisible ? "password" : "text";
                toggle.classList.toggle("is-visible", !isVisible);
                toggle.setAttribute("aria-pressed", !isVisible ? "true" : "false");
                toggle.setAttribute("aria-label", !isVisible ? "Hide password" : "Show password");
                input.focus();
            });
        });
    }

    function initLogoutLink() {
        const logoutLink = document.getElementById("logoutLink");
        if (!logoutLink) return;
        logoutLink.addEventListener("click", function (event) {
            event.preventDefault();
            fetchJson("/api/logout", { method: "POST" }).then(function () {
                clearStoredTokens();
                window.location.href = getLoginPath();
            });
        });
    }

    function setUploadError(message) {
        const errorBox = document.getElementById("uploadError");
        if (!errorBox) return;
        errorBox.textContent = message || "";
        errorBox.classList.toggle("is-visible", !!message);
    }

    function normalizeUploadNameForMatch(name) {
        return String(name || "")
            .toLowerCase()
            .replace(/\.[^.]+$/, "")
            .replace(/[_\-.]+/g, " ");
    }

    function matchesEnergizationFilename(name) {
        const base = String(name || "").trim().replace(/\.[^.]+$/, "");
        return /^\d{2}-MSE_ALECO_(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/i.test(base);
    }

    function normalizeUploadCategory(value) {
        const cleaned = String(value || "").trim().toLowerCase();
        if (!cleaned) return "";
        if (cleaned === "hourly") return "hourly_kwh";
        if (cleaned === "hourly_kwh" || cleaned === "hourly_kw" || cleaned === "edd" || cleaned === "energization" || cleaned === "dashboard_metrics" || cleaned === "other") {
            return cleaned;
        }
        return cleaned;
    }

    function inferUploadCategoryFromName(name) {
        const normalized = normalizeUploadNameForMatch(name);
        if (matchesEnergizationFilename(name) || normalized.includes("energization")) {
            return "energization";
        }
        if (normalized.includes("edd")) {
            return "edd";
        }
        if (normalized.includes("dashboard") || normalized.includes("metrics")) {
            return "dashboard_metrics";
        }
        if (/\bkwh\b/.test(normalized)) {
            return "hourly_kwh";
        }
        if (/\bkw\b/.test(normalized)) {
            return "hourly_kw";
        }
        if (normalized.includes("hourly")) {
            return "hourly_kwh";
        }
        return "other";
    }

    function getUploadValidationMessage(category, files) {
        if (normalizeUploadCategory(category) !== "energization") {
            return "";
        }
        const invalidFile = (files || []).find(function (file) {
            return !matchesEnergizationFilename(file.name);
        });
        if (!invalidFile) {
            return "";
        }
        return 'Energization files must use the format "01-MSE_ALECO_Jan 2026".';
    }

    function getUploadCategory(item) {
        if (!item) return "other";
        const normalized = normalizeUploadCategory(item.category);
        if (normalized) {
            return normalized;
        }
        const name = item.original_name || item.display_name || item.stored_name || "";
        return inferUploadCategoryFromName(name);
    }

    function buildUploadItem(item) {
        const listItem = document.createElement("li");
        listItem.className = "upload-item";
        if (item && item.id) {
            listItem.setAttribute("data-upload-id", item.id);
        }
        const category = getUploadCategory(item);
        if (category) {
            listItem.setAttribute("data-category", category);
        }

        const meta = document.createElement("div");
        meta.className = "upload-meta";

        const name = document.createElement("div");
        name.className = "upload-name";
        name.textContent = item.display_name || item.original_name || "Untitled";

        const sub = document.createElement("div");
        sub.className = "upload-sub";
        sub.textContent = item.uploaded_at_display ? `Uploaded ${item.uploaded_at_display}` : "Uploaded";

        meta.appendChild(name);
        meta.appendChild(sub);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ghost-btn";
        remove.textContent = "Remove";
        remove.addEventListener("click", function () {
            deleteUpload(item.id);
        });

        listItem.appendChild(meta);
        listItem.appendChild(remove);

        return listItem;
    }

    function renderRecentUploads(items) {
        const list = document.getElementById("recentUploadsList");
        const empty = document.getElementById("recentUploadsEmpty");
        if (!list) return;
        list.innerHTML = "";
        const rows = Array.isArray(items) ? items.slice(0, 4) : [];
        rows.forEach(function (item) {
            list.appendChild(buildUploadItem(item));
        });
        if (empty) {
            empty.style.display = rows.length === 0 ? "block" : "none";
        }
    }

    function renderAllUploads(groups) {
        const container = document.getElementById("allUploadsContainer");
        const empty = document.getElementById("allUploadsEmpty");
        if (!container) return;
        container.innerHTML = "";
        const items = Array.isArray(groups) ? groups : [];
        items.forEach(function (group) {
            const wrapper = document.createElement("div");
            wrapper.className = "upload-year-group";
            wrapper.setAttribute("data-year", group.year);

            const year = document.createElement("div");
            year.className = "upload-year";
            year.textContent = group.year;

            const list = document.createElement("ul");
            list.className = "upload-items";

            (group.items || []).forEach(function (item) {
                list.appendChild(buildUploadItem(item));
            });

            wrapper.appendChild(year);
            wrapper.appendChild(list);
            container.appendChild(wrapper);
        });
        if (empty) {
            empty.style.display = items.length === 0 ? "block" : "none";
        }
    }

    function renderUploadYearFilter(groups) {
        const filter = document.getElementById("uploadYearFilter");
        if (!filter) return;
        const previous = filter.value || "all";
        filter.innerHTML = "";

        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "All years";
        filter.appendChild(allOption);

        (groups || []).forEach(function (group) {
            const option = document.createElement("option");
            option.value = String(group.year);
            option.textContent = String(group.year);
            filter.appendChild(option);
        });

        const availableValues = Array.from(filter.options).map(function (opt) { return opt.value; });
        if (availableValues.indexOf(previous) !== -1) {
            filter.value = previous;
        } else {
            filter.value = "all";
        }

        filter.dispatchEvent(new Event("change"));
    }

    function renderPeakYearSelect(groups) {
        const select = document.getElementById("peakYearSelect");
        if (!select) return;
        const previous = select.value || "";
        select.innerHTML = "";

        const years = (groups || []).filter(function (group) {
            return group.year !== "Unsorted";
        }).map(function (group) {
            return group.year;
        });

        if (years.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No uploads yet";
            select.appendChild(option);
            select.disabled = true;
            return;
        }

        select.disabled = false;
        years.forEach(function (year) {
            const option = document.createElement("option");
            option.value = String(year);
            option.textContent = String(year);
            select.appendChild(option);
        });

        const availableValues = Array.from(select.options).map(function (opt) { return opt.value; });
        if (availableValues.indexOf(previous) !== -1) {
            select.value = previous;
        } else {
            select.value = String(years[0]);
        }

        select.dispatchEvent(new Event("change"));
    }

    function getFactSheetRowsFromTable() {
        const table = document.getElementById("factSheetTable");
        if (!table) return [];
        return Array.from(table.querySelectorAll("tr")).map(function (row) {
            const cells = row.querySelectorAll("td");
            if (!cells || cells.length < 2) return null;
            return {
                label: String(cells[0].textContent || "").trim(),
                value: String(cells[1].textContent || "").trim()
            };
        }).filter(function (item) {
            return !!(item && item.label);
        });
    }

    function setFactSheetRowsToTable(rows) {
        const table = document.getElementById("factSheetTable");
        if (!table || !Array.isArray(rows)) return;
        const valueByLabel = {};
        rows.forEach(function (item) {
            if (!item || !item.label) return;
            valueByLabel[String(item.label).trim()] = String(item.value || "");
        });
        Array.from(table.querySelectorAll("tr")).forEach(function (row) {
            const cells = row.querySelectorAll("td");
            if (!cells || cells.length < 2) return;
            const label = String(cells[0].textContent || "").trim();
            if (Object.prototype.hasOwnProperty.call(valueByLabel, label)) {
                cells[1].textContent = valueByLabel[label];
            }
        });
    }

    function formatFactSheetDateText(isoValue) {
        const raw = String(isoValue || "").trim();
        if (!raw) return "";
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return "";
        return parsed.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function setFactSheetLastEdited(lastEdited, displayText) {
        const timeNode = document.getElementById("factSheetLastEditedTime");
        if (!timeNode) return;
        const isoText = String(lastEdited || "").trim();
        const fallbackText = String(timeNode.textContent || "").trim();
        const resolvedText = String(displayText || "").trim() || formatFactSheetDateText(isoText) || fallbackText;
        if (resolvedText) {
            timeNode.textContent = resolvedText;
        }
        if (isoText) {
            timeNode.setAttribute("datetime", isoText);
        }
    }

    function applyFactSheetPayload(payload) {
        if (!payload || typeof payload !== "object") return;
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        if (rows.length > 0) {
            setFactSheetRowsToTable(rows);
        }
        setFactSheetLastEdited(payload.last_edited, payload.last_edited_display);
    }

    function renderBootstrap(payload) {
        if (!payload) return;
        const groups = payload.upload_groups || [];
        const recent = payload.recent_uploads || [];
        renderRecentUploads(recent);
        renderAllUploads(groups);
        renderUploadYearFilter(groups);
        renderPeakYearSelect(groups);
        if (payload.fact_sheet) {
            applyFactSheetPayload(payload.fact_sheet);
        }
        if (typeof window.applyUploadFilters === "function") {
            window.applyUploadFilters();
        }
        // Load dashboard metrics data
        if (typeof window.refreshDashboardMetrics === "function") {
            window.refreshDashboardMetrics();
        }
    }

    function loadBootstrap() {
        if (!document.body || !document.body.classList.contains("dashboard-page")) {
            return Promise.resolve(null);
        }
        return fetchJson("/data").then(function (result) {
            if (result.status === 401) {
                window.location.href = getLoginPath();
                return null;
            }
            if (!result.ok) {
                return null;
            }
            renderBootstrap(result.payload);
            return result.payload;
        });
    }

    function initFactSheetEditor(initialPayload) {
        const editButton = document.getElementById("factSheetEditBtn");
        const cancelButton = document.getElementById("factSheetCancelBtn");
        const table = document.getElementById("factSheetTable");
        const errorBox = document.getElementById("factSheetError");
        const localSheetKey = "fact_sheet_cache_v1";
        let inlineEditing = false;
        let originalRowsSnapshot = [];

        if (!editButton || !table) {
            return;
        }

        function setError(message) {
            if (!errorBox) return;
            errorBox.textContent = message || "";
            errorBox.classList.toggle("is-visible", !!message);
        }

        function renderEditButtonState(isEditing) {
            editButton.classList.toggle("is-active", isEditing);
            editButton.setAttribute("aria-label", isEditing ? "Save fact sheet" : "Edit fact sheet");
            editButton.setAttribute("title", isEditing ? "Save Fact Sheet" : "Edit Fact Sheet");
            editButton.innerHTML = isEditing
                ? '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>'
                : '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>';
            if (cancelButton) {
                cancelButton.classList.toggle("is-hidden", !isEditing);
            }
        }

        function getValueCells() {
            return Array.from(table.querySelectorAll("tr")).map(function (row) {
                const cells = row.querySelectorAll("td");
                if (!cells || cells.length < 2) return null;
                return cells[1];
            }).filter(function (cell) {
                return !!cell;
            });
        }

        function setInlineEditable(open) {
            getValueCells().forEach(function (cell) {
                if (open) {
                    cell.setAttribute("contenteditable", "true");
                    cell.setAttribute("spellcheck", "false");
                    cell.setAttribute("tabindex", "0");
                    cell.classList.add("fact-sheet-inline-cell");
                } else {
                    cell.removeAttribute("contenteditable");
                    cell.removeAttribute("spellcheck");
                    cell.removeAttribute("tabindex");
                    cell.classList.remove("fact-sheet-inline-cell");
                }
            });
        }

        function persistLocalFactSheet(payload) {
            try {
                localStorage.setItem(localSheetKey, JSON.stringify(payload || {}));
            } catch (err) {
                return;
            }
        }

        function loadLocalFactSheet() {
            try {
                const raw = localStorage.getItem(localSheetKey);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === "object" ? parsed : null;
            } catch (err) {
                return null;
            }
        }

        function applySheetPayload(payload) {
            applyFactSheetPayload(payload);
        }

        function startEditing() {
            setError("");
            originalRowsSnapshot = getFactSheetRowsFromTable();
            inlineEditing = true;
            setInlineEditable(true);
            renderEditButtonState(true);
            const cells = getValueCells();
            if (cells.length > 0) {
                cells[0].focus();
            }
        }

        function stopEditing(resetRows) {
            if (resetRows && originalRowsSnapshot.length > 0) {
                setFactSheetRowsToTable(originalRowsSnapshot);
            }
            inlineEditing = false;
            setInlineEditable(false);
            renderEditButtonState(false);
            setError("");
        }

        function saveEditing() {
            setError("");
            const rows = getFactSheetRowsFromTable();
            if (rows.length === 0) {
                setError("No Fact Sheet rows to save.");
                return;
            }

            editButton.disabled = true;
            if (cancelButton) cancelButton.disabled = true;

            const localTimestamp = new Date().toISOString();
            const localPayload = {
                rows: rows,
                last_edited: localTimestamp,
                last_edited_display: formatFactSheetDateText(localTimestamp)
            };

            const finalizeSave = function (payload) {
                applySheetPayload(payload);
                persistLocalFactSheet(payload);
                stopEditing(false);
            };

            if (isStaticSite()) {
                finalizeSave(localPayload);
                editButton.disabled = false;
                if (cancelButton) cancelButton.disabled = false;
                return;
            }

            fetchJson("/api/fact-sheet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: rows })
            }).then(function (result) {
                if (!result.ok) {
                    setError((result.payload && result.payload.error) || "Unable to save Fact Sheet.");
                    return;
                }
                const payload = result.payload && result.payload.fact_sheet ? result.payload.fact_sheet : localPayload;
                finalizeSave(payload);
            }).catch(function () {
                setError("Unable to save Fact Sheet.");
            }).finally(function () {
                editButton.disabled = false;
                if (cancelButton) cancelButton.disabled = false;
            });
        }

        editButton.addEventListener("click", function () {
            if (!inlineEditing) {
                startEditing();
                return;
            }
            saveEditing();
        });

        if (cancelButton) {
            cancelButton.addEventListener("click", function () {
                stopEditing(true);
            });
        }

        if (initialPayload && initialPayload.fact_sheet) {
            applySheetPayload(initialPayload.fact_sheet);
        } else if (isStaticSite()) {
            const localPayload = loadLocalFactSheet();
            if (localPayload) {
                applySheetPayload(localPayload);
            }
        } else {
            fetchJson("/api/fact-sheet").then(function (result) {
                if (!result.ok || !result.payload) return;
                applySheetPayload(result.payload);
            });
        }

        renderEditButtonState(false);
        setInlineEditable(false);
    }

    function deleteUpload(uploadId) {
        if (!uploadId) return;
        setUploadError("");
        fetchJson(`/delete/${uploadId}`, { method: "DELETE" }).then(function (result) {
            if (!result.ok) {
                setUploadError(result.payload.error || "Unable to delete upload.");
                return;
            }
            const nodes = document.querySelectorAll(`[data-upload-id="${uploadId}"]`);
            nodes.forEach(function (node) {
                if (node && node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            });
            loadBootstrap();
            if (typeof window.refreshHourlyDayChartMonths === "function") {
                window.refreshHourlyDayChartMonths();
            }
            if (typeof window.refreshHourlyDayKwChartMonths === "function") {
                window.refreshHourlyDayKwChartMonths();
            }
            if (typeof window.refreshSystemLossYears === "function") {
                window.refreshSystemLossYears();
            }
            if (typeof window.refreshSalesYears === "function") {
                window.refreshSalesYears();
            }
            if (typeof window.refreshEnergizationMapData === "function") {
                window.refreshEnergizationMapData();
            }
            if (typeof window.refreshDashboardMetrics === "function") {
                window.refreshDashboardMetrics();
            }
            if (typeof window.refreshDashboardMetricsCharts === "function") {
                window.refreshDashboardMetricsCharts();
            }
        });
    }

    function initUploadPanel() {
        const uploadForm = document.querySelector(".upload-form");
        if (!uploadForm) return;

        const fileInput = uploadForm.querySelector("#uploadFiles");
        const categorySelect = uploadForm.querySelector("#uploadCategory");
        const selectedList = document.getElementById("uploadSelectedList");
        const selectedEmpty = document.getElementById("uploadSelectedEmpty");
        const errorBox = document.getElementById("uploadError");
        const submitButton = document.getElementById("uploadSubmit");
        let selectedFiles = [];

        function fileKey(file) {
            return `${file.name}::${file.size}::${file.lastModified}`;
        }

        function syncInputFiles() {
            if (!fileInput) return;
            const dataTransfer = new DataTransfer();
            selectedFiles.forEach(function (file) {
                dataTransfer.items.add(file);
            });
            fileInput.files = dataTransfer.files;
        }

        function renderSelectedFiles() {
            if (selectedList) {
                selectedList.innerHTML = "";
                selectedFiles.forEach(function (file) {
                    const item = document.createElement("li");
                    item.className = "upload-selected-item";

                    const name = document.createElement("span");
                    name.className = "upload-selected-name";
                    name.textContent = file.name;

                    const remove = document.createElement("button");
                    remove.type = "button";
                    remove.className = "upload-remove";
                    remove.textContent = "x";
                    remove.addEventListener("click", function () {
                        selectedFiles = selectedFiles.filter(function (entry) {
                            return fileKey(entry) !== fileKey(file);
                        });
                        renderSelectedFiles();
                    });

                    item.appendChild(name);
                    item.appendChild(remove);
                    selectedList.appendChild(item);
                });
            }

            if (selectedEmpty) {
                selectedEmpty.style.display = selectedFiles.length === 0 ? "block" : "none";
            }

            const validationMessage = getUploadValidationMessage(
                categorySelect ? categorySelect.value : "",
                selectedFiles
            );

            if (submitButton) {
                submitButton.disabled = selectedFiles.length === 0 || !!validationMessage;
            }

            if (selectedFiles.length === 0) {
                setUploadError("");
            } else {
                setUploadError(validationMessage);
            }

            syncInputFiles();
        }

        function mergeFiles(newFiles) {
            const existingKeys = new Set(selectedFiles.map(fileKey));
            newFiles.forEach(function (file) {
                const key = fileKey(file);
                if (existingKeys.has(key)) return;
                existingKeys.add(key);
                selectedFiles.push(file);
            });
            renderSelectedFiles();
        }

        if (fileInput) {
            fileInput.addEventListener("change", function () {
                const incoming = Array.from(fileInput.files || []);
                mergeFiles(incoming);
            });
        }
        if (categorySelect) {
            categorySelect.addEventListener("change", renderSelectedFiles);
        }

        uploadForm.addEventListener("submit", function (event) {
            event.preventDefault();
            if (selectedFiles.length === 0) {
                if (errorBox) {
                    errorBox.textContent = "Please select at least one file before uploading.";
                    errorBox.classList.add("is-visible");
                }
                return;
            }
            const validationMessage = getUploadValidationMessage(
                categorySelect ? categorySelect.value : "",
                selectedFiles
            );
            if (validationMessage) {
                setUploadError(validationMessage);
                if (submitButton) {
                    submitButton.disabled = true;
                }
                return;
            }
            if (submitButton) {
                submitButton.disabled = true;
            }
            syncInputFiles();
            const formData = new FormData(uploadForm);
            fetchJson("/upload", {
                method: "POST",
                body: formData
            }).then(function (result) {
                if (!result.ok) {
                    setUploadError(result.payload.error || "Unable to upload files.");
                    if (submitButton) {
                        submitButton.disabled = false;
                    }
                    return;
                }
                selectedFiles = [];
                renderSelectedFiles();
                if (result.payload && result.payload.upload_groups) {
                    renderBootstrap(result.payload);
                } else {
                    loadBootstrap();
                }
                if (typeof window.refreshHourlyDayChartMonths === "function") {
                    window.refreshHourlyDayChartMonths();
                }
                if (typeof window.refreshHourlyDayKwChartMonths === "function") {
                    window.refreshHourlyDayKwChartMonths();
                }
                if (typeof window.refreshSystemLossYears === "function") {
                    window.refreshSystemLossYears();
                }
                if (typeof window.refreshSalesYears === "function") {
                    window.refreshSalesYears();
                }
                if (typeof window.refreshEnergizationMapData === "function") {
                    window.refreshEnergizationMapData();
                }
                if (typeof window.refreshDashboardMetrics === "function") {
                    window.refreshDashboardMetrics();
                }
                if (typeof window.refreshDashboardMetricsCharts === "function") {
                    window.refreshDashboardMetricsCharts();
                }
                if (submitButton) {
                    submitButton.disabled = false;
                }
            });
        });

        renderSelectedFiles();
    }

    function initUploadFilter() {
        const yearFilter = document.getElementById("uploadYearFilter");
        const typeFilter = document.getElementById("uploadTypeFilter");
        if (!yearFilter && !typeFilter) return;

        function applyFilter() {
            const yearValue = yearFilter ? yearFilter.value : "all";
            const typeValue = typeFilter ? typeFilter.value : "all";
            const groups = Array.from(document.querySelectorAll(".upload-year-group"));
            let anyVisible = false;

            groups.forEach(function (group) {
                const year = group.getAttribute("data-year");
                let groupHasVisible = false;
                const items = Array.from(group.querySelectorAll(".upload-item"));
                items.forEach(function (item) {
                    const itemType = normalizeUploadCategory(item.getAttribute("data-category"));
                    const matchesType = typeValue === "all" || itemType === typeValue;
                    item.style.display = matchesType ? "" : "none";
                    if (matchesType) {
                        groupHasVisible = true;
                    }
                });
                const matchesYear = yearValue === "all" || yearValue === year;
                const visible = matchesYear && groupHasVisible;
                group.style.display = visible ? "" : "none";
                if (visible) {
                    anyVisible = true;
                }
            });

            const allEmpty = document.getElementById("allUploadsEmpty");
            if (allEmpty) {
                allEmpty.style.display = anyVisible ? "none" : "block";
            }

            const recentList = document.getElementById("recentUploadsList");
            const recentEmpty = document.getElementById("recentUploadsEmpty");
            if (recentList && recentEmpty) {
                const hasRecent = recentList.querySelectorAll(".upload-item").length > 0;
                recentEmpty.style.display = hasRecent ? "none" : "block";
            }
        }

        if (yearFilter) {
            yearFilter.addEventListener("change", applyFilter);
        }
        if (typeFilter) {
            typeFilter.addEventListener("change", applyFilter);
        }
        window.applyUploadFilters = applyFilter;
        applyFilter();
    }

    function initEddPurchasesChart() {
        const select = document.getElementById("eddMonthSelect");
        const canvas = document.getElementById("eddPurchasesChart");
        const shareCanvas = document.getElementById("eddShareChart");
        const status = document.getElementById("eddChartStatus");
        const table = document.getElementById("eddTable");
        const tableBody = table ? table.querySelector("tbody") : null;
        const metricHeader = document.getElementById("eddMetricHeader");
        if (!select || !canvas || !window.Chart) return;

        let chart = null;
        let shareChart = null;

        function setStatus(message) {
            if (!status) return;
            status.textContent = message || "";
            status.classList.toggle("is-visible", !!message);
        }

        function updateBarChart(payload) {
            const labels = payload.labels || [];
            const values = payload.values || [];
            const metric = payload.metric || "Value";

            if (chart) {
                chart.data.labels = labels;
                chart.data.datasets[0].label = metric;
                chart.data.datasets[0].data = values;
                chart.update();
                return;
            }

            chart = registerChart(new Chart(canvas, {
                type: "bar",
                data: {
                    labels: labels,
                    datasets: [{
                        label: metric,
                        data: values,
                        backgroundColor: "#2563eb",
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: false,
                                maxRotation: 45,
                                minRotation: 0,
                                padding: 6
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { callback: numberTick }
                        }
                    }
                }
            }));
        }

        function updateShareChart(payload) {
            if (!shareCanvas) return;
            const labels = payload.labels || [];
            const values = payload.values || [];

            const items = labels.map(function (label, index) {
                return { label: label, value: Number(values[index]) || 0 };
            }).filter(function (item) {
                return item.value > 0;
            });

            if (items.length === 0) {
                if (shareChart) {
                    shareChart.destroy();
                    shareChart = null;
                }
                return;
            }

            items.sort(function (a, b) { return b.value - a.value; });
            const topCount = 6;
            const topItems = items.slice(0, topCount);
            const othersTotal = items.slice(topCount).reduce(function (sum, item) { return sum + item.value; }, 0);
            if (othersTotal > 0) {
                topItems.push({ label: "Others", value: othersTotal });
            }

            const shareLabels = topItems.map(function (item) { return item.label; });
            const shareValues = topItems.map(function (item) { return item.value; });
            const colors = ["#1d4ed8", "#0ea5e9", "#22c55e", "#f97316", "#facc15", "#a855f7", "#94a3b8"];

            if (shareChart) {
                shareChart.data.labels = shareLabels;
                shareChart.data.datasets[0].data = shareValues;
                shareChart.update();
                return;
            }

            shareChart = registerChart(new Chart(shareCanvas, {
                type: "doughnut",
                data: {
                    labels: shareLabels,
                    datasets: [{
                        data: shareValues,
                        backgroundColor: shareLabels.map(function (_, index) {
                            return colors[index % colors.length];
                        }),
                        borderWidth: 2,
                        borderColor: "#ffffff"
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: "bottom",
                            labels: {
                                boxWidth: 12,
                                boxHeight: 12,
                                padding: 12
                            }
                        }
                    }
                }
            }));
        }

        function updateTable(payload) {
            if (!tableBody) return;
            const labels = payload.labels || [];
            const values = payload.values || [];
            const metric = payload.metric || "Value";

            if (metricHeader) {
                metricHeader.textContent = metric;
            }

            tableBody.innerHTML = "";
            labels.forEach(function (label, index) {
                const row = document.createElement("tr");
                const nameCell = document.createElement("td");
                const valueCell = document.createElement("td");
                nameCell.textContent = label;
                const value = Number(values[index]);
                valueCell.textContent = Number.isFinite(value) ? value.toLocaleString() : "-";
                row.appendChild(nameCell);
                row.appendChild(valueCell);
                tableBody.appendChild(row);
            });
        }

        function loadData(uploadId) {
            if (!uploadId) {
                setStatus("Upload a file to view this chart.");
                return;
            }
            setStatus("");
            fetch(`/api/edd-purchases/${uploadId}`)
                .then(function (response) { return response.json(); })
                .then(function (payload) {
                    if (payload && payload.error) {
                        setStatus(payload.error);
                        return;
                    }
                    if (!payload || !payload.labels || payload.labels.length === 0) {
                        setStatus("No usable data found in that file.");
                        return;
                    }
                    updateBarChart(payload);
                    updateShareChart(payload);
                    updateTable(payload);
                })
                .catch(function () {
                    setStatus("Unable to load chart data.");
                });
        }

        select.addEventListener("change", function () {
            loadData(select.value);
        });

        loadData(select.value);
    }

    function initHourlyUploadChart() {
        const select = document.getElementById("hourlyYearSelect");
        const canvas = document.getElementById("hourlyUploadChart");
        const status = document.getElementById("hourlyChartStatus");
        if (!select || !canvas || !window.Chart) return;

        let chart = null;

        function setStatus(message) {
            if (!status) return;
            status.textContent = message || "";
            status.classList.toggle("is-visible", !!message);
        }

        function updateChart(payload) {
            const labels = payload.labels || [];
            const datasets = payload.datasets || [];
            const metric = payload.metric || "Energy (kWh)";

            const colors = ["#1d4ed8", "#0ea5e9", "#22c55e", "#f97316", "#facc15", "#a855f7", "#94a3b8"];
            const chartDatasets = datasets.map(function (series, index) {
                return {
                    label: series.label,
                    data: series.values || [],
                    backgroundColor: colors[index % colors.length],
                    borderRadius: 2
                };
            });

            if (chart) {
                chart.data.labels = labels;
                chart.data.datasets = chartDatasets;
                chart.options.plugins.legend.display = chartDatasets.length > 1;
                chart.update();
                return;
            }

            chart = registerChart(new Chart(canvas, {
                type: "bar",
                data: {
                    labels: labels,
                    datasets: chartDatasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    plugins: { legend: { display: chartDatasets.length > 1 } },
                    scales: {
                        x: {
                            stacked: false,
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 12,
                                padding: 6
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: metric },
                            ticks: { callback: numberTick }
                        }
                    }
                }
            }));
        }

        function loadData(year) {
            if (!year) {
                setStatus("Upload a file to view this chart.");
                return;
            }
            setStatus("");
            fetch(`/api/edd-hourly-year/${year}`)
                .then(function (response) { return response.json(); })
                .then(function (payload) {
                    if (payload && payload.error) {
                        setStatus(payload.error);
                        return;
                    }
                    if (!payload || !payload.labels || payload.labels.length === 0 || !payload.datasets || payload.datasets.length === 0) {
                        setStatus("No usable data found for that year.");
                        return;
                    }
                    updateChart(payload);
                })
                .catch(function () {
                    setStatus("Unable to load chart data.");
                });
        }

        select.addEventListener("change", function () {
            loadData(select.value);
        });

        loadData(select.value);
    }

    function initHourlyDayChart() {
        const monthSelect = document.getElementById("hourlyMonthSelect");
        const daySelect = document.getElementById("hourlyDaySelect");
        const canvas = document.getElementById("hourlyDayChart");
        const status = document.getElementById("hourlyDayStatus");
        if (!monthSelect || !daySelect || !canvas || !window.Chart) return;

        let chart = null;
        let monthItems = [];
        const daysCache = new Map();
        const payloadCache = new Map();
        const MAX_HIGHLIGHT = "#facc15";
        const DEFAULT_BAR = "#1d4ed8";
        let dayRequestToken = 0;
        let daysRequestToken = 0;

        function buildBarColors(values) {
            const safeValues = Array.isArray(values) ? values : [];
            let maxIndex = -1;
            let maxValue = -Infinity;

            safeValues.forEach(function (val, idx) {
                if (typeof val !== "number" || !Number.isFinite(val)) return;
                if (val > maxValue) {
                    maxValue = val;
                    maxIndex = idx;
                }
            });

            if (maxIndex < 0 || !Number.isFinite(maxValue) || maxValue <= 0) {
                return safeValues.map(function () { return DEFAULT_BAR; });
            }

            return safeValues.map(function (_val, idx) {
                return idx === maxIndex ? MAX_HIGHLIGHT : DEFAULT_BAR;
            });
        }

        function setStatus(message) {
            if (!status) return;
            status.textContent = message || "";
            status.classList.toggle("is-visible", !!message);
        }

        function updateChart(payload) {
            const labels = payload.labels || [];
            const values = payload.values || [];
            const metric = payload.metric || "Energy (kWh)";
            const colors = buildBarColors(values);

            if (chart) {
                chart.data.labels = labels;
                chart.data.datasets[0].label = metric;
                chart.data.datasets[0].data = values;
                chart.data.datasets[0].backgroundColor = colors;
                chart.update();
                return;
            }

            chart = registerChart(new Chart(canvas, {
                type: "bar",
                data: {
                    labels: labels,
                    datasets: [{
                        label: metric,
                        data: values,
                        backgroundColor: colors,
                        borderRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 12,
                                padding: 6
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: metric },
                            ticks: { callback: numberTick }
                        }
                    }
                }
            }));
        }

        function formatDayLabel(value) {
            const text = String(value || "");
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
            if (match) {
                return `${match[2]}/${match[3]}/${match[1]}`;
            }
            return text;
        }

        function populateDays(days) {
            daySelect.innerHTML = "";
            if (!days || days.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No days available";
                daySelect.appendChild(option);
                daySelect.disabled = true;
                return;
            }

            daySelect.disabled = false;
            const allOption = document.createElement("option");
            allOption.value = "all";
            allOption.textContent = "All days (max)";
            daySelect.appendChild(allOption);
            days.forEach(function (day) {
                const option = document.createElement("option");
                option.value = String(day);
                option.textContent = formatDayLabel(day);
                daySelect.appendChild(option);
            });
        }

        function parseMonthValue(value) {
            const parts = String(value || "").split("|");
            if (parts.length !== 3) {
                return null;
            }
            return {
                id: parts[0],
                start: parts[1],
                end: parts[2]
            };
        }

        function loadDay(monthValue, day) {
            const parsed = parseMonthValue(monthValue);
            if (!parsed || !day) {
                setStatus("Select a month and day (or All days) to view data.");
                return;
            }
            setStatus("");
            const cacheKey = `${monthValue}|${day}`;
            const cached = payloadCache.get(cacheKey);
            if (cached) {
                updateChart(cached);
                return;
            }
            const requestToken = ++dayRequestToken;
            const endpoint = day === "all"
                ? `/api/edd-hourly-month/${parsed.id}?start=${parsed.start}&end=${parsed.end}`
                : `/api/edd-hourly-day/${parsed.id}?date=${day}`;
            fetchJsonWithRetry(endpoint, null, {
                retries: 2,
                delayMs: 350,
                shouldRetry: function (result) {
                    const payload = result.payload || {};
                    if (!result.ok && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    if (payload.error && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    return !!(result.ok && (!payload.labels || payload.labels.length === 0));
                },
                onRetry: function () {
                    if (requestToken !== dayRequestToken) return;
                    setStatus("No data yet. Retrying...");
                }
            })
                .then(function (result) {
                    if (requestToken !== dayRequestToken) return;
                    const payload = result.payload || {};
                    if (!result.ok) {
                        setStatus(payload.error || "Unable to load chart data.");
                        return;
                    }
                    if (payload.error) {
                        setStatus(payload.error);
                        return;
                    }
                    if (!payload.labels || payload.labels.length === 0) {
                        setStatus("No usable data found.");
                        return;
                    }
                    setStatus("");
                    payloadCache.set(cacheKey, payload);
                    updateChart(payload);
                })
                .catch(function () {
                    if (requestToken !== dayRequestToken) return;
                    setStatus("Unable to load chart data.");
                });
        }

        function loadDays(monthValue) {
            const parsed = parseMonthValue(monthValue);
            if (!parsed) {
                setStatus("Upload a file to view this chart.");
                populateDays([]);
                return;
            }
            setStatus("");
            if (daysCache.has(monthValue)) {
                const cachedDays = daysCache.get(monthValue);
                populateDays(cachedDays);
                if (cachedDays.length > 0) {
                    loadDay(monthValue, "all");
                }
                return;
            }
            const requestToken = ++daysRequestToken;
            fetchJsonWithRetry(`/api/edd-hourly-days/${parsed.id}?start=${parsed.start}&end=${parsed.end}`, null, {
                retries: 2,
                delayMs: 350,
                shouldRetry: function (result) {
                    const payload = result.payload || {};
                    if (!result.ok && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    if (payload.error && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    const dates = payload.dates || [];
                    return !!(result.ok && Array.isArray(dates) && dates.length === 0);
                },
                onRetry: function () {
                    if (requestToken !== daysRequestToken) return;
                    setStatus("Checking month data... retrying...");
                }
            })
                .then(function (result) {
                    if (requestToken !== daysRequestToken) return;
                    const payload = result.payload || {};
                    if (!result.ok) {
                        setStatus(payload.error || "Unable to load available days.");
                        populateDays([]);
                        return;
                    }
                    if (payload.error) {
                        setStatus(payload.error);
                        populateDays([]);
                        return;
                    }
                    const days = payload.dates || [];
                    setStatus("");
                    daysCache.set(monthValue, days);
                    populateDays(days);
                    if (days.length > 0) {
                        loadDay(monthValue, "all");
                    }
                })
                .catch(function () {
                    if (requestToken !== daysRequestToken) return;
                    setStatus("Unable to load available days.");
                    populateDays([]);
                });
        }

        monthSelect.addEventListener("change", function () {
            loadDays(monthSelect.value);
        });

        daySelect.addEventListener("change", function () {
            loadDay(monthSelect.value, daySelect.value);
        });

        function populateMonthOptions() {
            monthSelect.innerHTML = "";
            if (monthItems.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No months available";
                monthSelect.appendChild(option);
                monthSelect.disabled = true;
                populateDays([]);
                return;
            }
            monthSelect.disabled = false;
            monthItems.sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });
            monthItems.forEach(function (item) {
                const option = document.createElement("option");
                option.value = `${item.id}|${item.start}|${item.end}`;
                option.textContent = item.label || item.start || "";
                monthSelect.appendChild(option);
            });
            loadDays(monthSelect.value);
        }

        function populateMonths() {
            monthSelect.innerHTML = "";
            const loading = document.createElement("option");
            loading.value = "";
            loading.textContent = "Loading months...";
            monthSelect.appendChild(loading);

            fetchJson("/api/edd-hourly-months")
                .then(function (result) {
                    const payload = result.payload || {};
                    if (!result.ok) {
                        monthSelect.innerHTML = "";
                        const option = document.createElement("option");
                        option.value = "";
                        option.textContent = "Unable to load months";
                        monthSelect.appendChild(option);
                        populateDays([]);
                        return;
                    }
                    const items = payload.items || [];
                    monthItems = items;
                    if (items.length === 0) {
                        monthSelect.innerHTML = "";
                        const option = document.createElement("option");
                        option.value = "";
                        option.textContent = "No uploads yet";
                        monthSelect.appendChild(option);
                        yearSelect.innerHTML = "";
                        const yearOption = document.createElement("option");
                        yearOption.value = "";
                        yearOption.textContent = "No years available";
                        yearSelect.appendChild(yearOption);
                        yearSelect.disabled = true;
                        monthSelect.disabled = true;
                        populateDays([]);
                        return;
                    }
                    populateMonthOptions();
                })
                .catch(function () {
                    monthSelect.innerHTML = "";
                    const option = document.createElement("option");
                    option.value = "";
                    option.textContent = "Unable to load months";
                    monthSelect.appendChild(option);
                    populateDays([]);
                });
        }

        window.refreshHourlyDayChartMonths = populateMonths;
        populateMonths();
    }

    function initHourlyDayKwChart() {
        const monthSelect = document.getElementById("hourlyKwMonthSelect");
        const daySelect = document.getElementById("hourlyKwDaySelect");
        const canvas = document.getElementById("hourlyKwChart");
        const status = document.getElementById("hourlyKwStatus");
        const tableBody = document.getElementById("hourlyKwTableBody");
        if (!monthSelect || !daySelect || !canvas || !window.Chart) return;

        let chart = null;
        let monthItems = [];
        const daysCache = new Map();
        const payloadCache = new Map();
        const MAX_HIGHLIGHT = "#facc15";
        const DEFAULT_BAR = "#1d4ed8";
        let dayRequestToken = 0;
        let daysRequestToken = 0;

        function buildBarColors(values) {
            const numbers = (values || []).filter(function (val) {
                return typeof val === "number" && Number.isFinite(val);
            });
            if (numbers.length === 0) {
                return values.map(function () { return DEFAULT_BAR; });
            }
            const maxValue = Math.max.apply(null, numbers);
            if (!Number.isFinite(maxValue) || maxValue <= 0) {
                return values.map(function () { return DEFAULT_BAR; });
            }
            return values.map(function (val) {
                if (typeof val !== "number" || !Number.isFinite(val)) return DEFAULT_BAR;
                return Math.abs(val - maxValue) < 1e-6 ? MAX_HIGHLIGHT : DEFAULT_BAR;
            });
        }

        function setStatus(message) {
            if (!status) return;
            status.textContent = message || "";
            status.classList.toggle("is-visible", !!message);
        }

        function renderTable(labels, values) {
            if (!tableBody) return;
            tableBody.innerHTML = "";
            if (!labels || labels.length === 0) {
                const row = document.createElement("tr");
                const cell = document.createElement("td");
                cell.colSpan = 2;
                cell.textContent = "No data available.";
                row.appendChild(cell);
                tableBody.appendChild(row);
                return;
            }
            labels.forEach(function (label, idx) {
                const row = document.createElement("tr");
                const hourCell = document.createElement("td");
                hourCell.textContent = label;
                const valueCell = document.createElement("td");
                const value = values[idx];
                valueCell.textContent = (typeof value === "number" && Number.isFinite(value))
                    ? numberTick(value)
                    : "-";
                row.appendChild(hourCell);
                row.appendChild(valueCell);
                tableBody.appendChild(row);
            });
        }

        function updateChart(payload) {
            const labels = payload.labels || [];
            const values = payload.values || [];
            const metric = payload.metric || "Load (kW)";
            const colors = buildBarColors(values);
            renderTable(labels, values);

            if (chart) {
                chart.data.labels = labels;
                chart.data.datasets[0].label = metric;
                chart.data.datasets[0].data = values;
                chart.data.datasets[0].backgroundColor = colors;
                chart.update();
                return;
            }

            chart = registerChart(new Chart(canvas, {
                type: "bar",
                data: {
                    labels: labels,
                    datasets: [{
                        label: metric,
                        data: values,
                        backgroundColor: colors,
                        borderRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 12,
                                padding: 6
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: metric },
                            ticks: { callback: numberTick }
                        }
                    }
                }
            }));
        }

        function formatDayLabel(value) {
            const text = String(value || "");
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
            if (match) {
                return `${match[2]}/${match[3]}/${match[1]}`;
            }
            return text;
        }

        function populateDays(days) {
            daySelect.innerHTML = "";
            if (!days || days.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No days available";
                daySelect.appendChild(option);
                daySelect.disabled = true;
                return;
            }

            daySelect.disabled = false;
            const allOption = document.createElement("option");
            allOption.value = "all";
            allOption.textContent = "All days (max)";
            daySelect.appendChild(allOption);
            days.forEach(function (day) {
                const option = document.createElement("option");
                option.value = String(day);
                option.textContent = formatDayLabel(day);
                daySelect.appendChild(option);
            });
        }

        function parseMonthValue(value) {
            const parts = String(value || "").split("|");
            if (parts.length !== 3) {
                return null;
            }
            return {
                id: parts[0],
                start: parts[1],
                end: parts[2]
            };
        }

        function loadDay(monthValue, day) {
            const parsed = parseMonthValue(monthValue);
            if (!parsed || !day) {
                setStatus("Select a month and day (or All days) to view data.");
                renderTable([], []);
                return;
            }
            setStatus("");
            const cacheKey = `${monthValue}|${day}`;
            const cached = payloadCache.get(cacheKey);
            if (cached) {
                updateChart(cached);
                return;
            }
            const requestToken = ++dayRequestToken;
            const endpoint = day === "all"
                ? `/api/edd-hourly-kw-month/${parsed.id}?start=${parsed.start}&end=${parsed.end}`
                : `/api/edd-hourly-kw-day/${parsed.id}?date=${day}`;
            fetchJsonWithRetry(endpoint, null, {
                retries: 2,
                delayMs: 350,
                shouldRetry: function (result) {
                    const payload = result.payload || {};
                    if (!result.ok && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    if (payload.error && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    return !!(result.ok && (!payload.labels || payload.labels.length === 0));
                },
                onRetry: function () {
                    if (requestToken !== dayRequestToken) return;
                    setStatus("No kW data yet. Retrying...");
                }
            })
                .then(function (result) {
                    if (requestToken !== dayRequestToken) return;
                    const payload = result.payload || {};
                    if (!result.ok) {
                        setStatus(payload.error || "Unable to load chart data.");
                        renderTable([], []);
                        return;
                    }
                    if (payload.error) {
                        setStatus(payload.error);
                        renderTable([], []);
                        return;
                    }
                    if (!payload.labels || payload.labels.length === 0) {
                        setStatus("No usable data found.");
                        renderTable([], []);
                        return;
                    }
                    setStatus("");
                    payloadCache.set(cacheKey, payload);
                    updateChart(payload);
                })
                .catch(function () {
                    if (requestToken !== dayRequestToken) return;
                    setStatus("Unable to load chart data.");
                    renderTable([], []);
                });
        }

        function loadDays(monthValue) {
            const parsed = parseMonthValue(monthValue);
            if (!parsed) {
                setStatus("Upload a file to view this chart.");
                populateDays([]);
                renderTable([], []);
                return;
            }
            setStatus("");
            if (daysCache.has(monthValue)) {
                const cachedDays = daysCache.get(monthValue);
                populateDays(cachedDays);
                if (cachedDays.length > 0) {
                    loadDay(monthValue, "all");
                }
                return;
            }
            const requestToken = ++daysRequestToken;
            fetchJsonWithRetry(`/api/edd-hourly-kw-days/${parsed.id}?start=${parsed.start}&end=${parsed.end}`, null, {
                retries: 2,
                delayMs: 350,
                shouldRetry: function (result) {
                    const payload = result.payload || {};
                    if (!result.ok && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    if (payload.error && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    const dates = payload.dates || [];
                    return !!(result.ok && Array.isArray(dates) && dates.length === 0);
                },
                onRetry: function () {
                    if (requestToken !== daysRequestToken) return;
                    setStatus("Checking kW month data... retrying...");
                }
            })
                .then(function (result) {
                    if (requestToken !== daysRequestToken) return;
                    const payload = result.payload || {};
                    if (!result.ok) {
                        setStatus(payload.error || "Unable to load available days.");
                        populateDays([]);
                        return;
                    }
                    if (payload.error) {
                        setStatus(payload.error);
                        populateDays([]);
                        return;
                    }
                    const days = payload.dates || [];
                    setStatus("");
                    daysCache.set(monthValue, days);
                    populateDays(days);
                    if (days.length > 0) {
                        loadDay(monthValue, "all");
                    }
                })
                .catch(function () {
                    if (requestToken !== daysRequestToken) return;
                    setStatus("Unable to load available days.");
                    populateDays([]);
                });
        }

        monthSelect.addEventListener("change", function () {
            loadDays(monthSelect.value);
        });

        daySelect.addEventListener("change", function () {
            loadDay(monthSelect.value, daySelect.value);
        });

        function populateMonthOptions() {
            monthSelect.innerHTML = "";
            if (monthItems.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No months available";
                monthSelect.appendChild(option);
                monthSelect.disabled = true;
                populateDays([]);
                return;
            }
            monthSelect.disabled = false;
            monthItems.sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });
            monthItems.forEach(function (item) {
                const option = document.createElement("option");
                option.value = `${item.id}|${item.start}|${item.end}`;
                option.textContent = item.label || item.start || "";
                monthSelect.appendChild(option);
            });
            loadDays(monthSelect.value);
        }

        function populateMonths() {
            monthSelect.innerHTML = "";
            const loading = document.createElement("option");
            loading.value = "";
            loading.textContent = "Loading months...";
            monthSelect.appendChild(loading);

            fetchJson("/api/edd-hourly-kw-months")
                .then(function (result) {
                    const payload = result.payload || {};
                    if (!result.ok) {
                        monthSelect.innerHTML = "";
                        const option = document.createElement("option");
                        option.value = "";
                        option.textContent = "Unable to load months";
                        monthSelect.appendChild(option);
                        populateDays([]);
                        return;
                    }
                    const items = payload.items || [];
                    monthItems = items;
                    if (items.length === 0) {
                        monthSelect.innerHTML = "";
                        const option = document.createElement("option");
                        option.value = "";
                        option.textContent = "No uploads yet";
                        monthSelect.appendChild(option);
                        monthSelect.disabled = true;
                        populateDays([]);
                        return;
                    }
                    populateMonthOptions();
                })
                .catch(function () {
                    monthSelect.innerHTML = "";
                    const option = document.createElement("option");
                    option.value = "";
                    option.textContent = "Unable to load months";
                    monthSelect.appendChild(option);
                    populateDays([]);
                });
        }

        window.refreshHourlyDayKwChartMonths = populateMonths;
        populateMonths();
    }

    function initAnnualKwChart() {
        const select = document.getElementById("annualKwYearSelect");
        const peakSelect = document.getElementById("annualKwPeakSelect");
        const canvas = document.getElementById("annualKwChart");
        const status = document.getElementById("annualKwStatus");
        const tableBody = document.getElementById("annualKwTableBody");
        if (!select || !peakSelect || !canvas || !window.Chart) return;

        let chart = null;
        const monthlyCanvas = document.getElementById("monthlyKwChart");
        const monthlyStatus = document.getElementById("monthlyKwStatus");
        const monthlyTableBody = document.getElementById("monthlyKwTableBody");
        const monthlyTitle = document.getElementById("monthlyKwTitle");
        let monthlyCard = document.getElementById("monthlyKwCard");
        if (monthlyCanvas) {
            const canvasCard = monthlyCanvas.closest(".graph-card");
            if (canvasCard) {
                monthlyCard = canvasCard;
            }
        }
        let monthlyChart = null;
        let selectedMonth = null;
        let annualRequestToken = 0;
        let monthlyRequestToken = 0;
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        function setStatus(message) {
            if (!status) return;
            status.textContent = message || "";
            status.classList.toggle("is-visible", !!message);
        }

        function renderTable(labels, values, peak) {
            if (!tableBody) return;
            tableBody.innerHTML = "";
            if (!labels || labels.length === 0) {
                const row = document.createElement("tr");
                const cell = document.createElement("td");
                cell.colSpan = 2;
                cell.textContent = "No data available.";
                row.appendChild(cell);
                tableBody.appendChild(row);
                return;
            }
            const highlightIndex = getPeakHighlightIndex(values, peak);
            labels.forEach(function (label, idx) {
                const row = document.createElement("tr");
                const monthCell = document.createElement("td");
                monthCell.textContent = toShortMonth(label);
                const valueCell = document.createElement("td");
                const value = values[idx];
                if (highlightIndex === idx) {
                    monthCell.classList.add("table-highlight-text");
                }
                valueCell.textContent = (typeof value === "number" && Number.isFinite(value))
                    ? numberTick(value)
                    : "-";
                row.appendChild(monthCell);
                row.appendChild(valueCell);
                tableBody.appendChild(row);
            });
        }

        function normalizePeak(value) {
            const cleaned = String(value || "").trim().toLowerCase();
            return cleaned === "lowest" ? "lowest" : "highest";
        }

        function peakLabel(peak) {
            return peak === "lowest" ? "Lowest Peak" : "Highest Peak";
        }

        function peakColor(peak) {
            return "#fde68a";
        }

        function getPeakHighlightIndex(values, peak) {
            const numeric = [];
            (values || []).forEach(function (value, index) {
                if (typeof value === "number" && Number.isFinite(value)) {
                    numeric.push({ value: value, index: index });
                }
            });
            if (numeric.length === 0) return null;

            const targetValue = normalizePeak(peak) === "lowest"
                ? Math.min.apply(null, numeric.map(function (item) { return item.value; }))
                : Math.max.apply(null, numeric.map(function (item) { return item.value; }));
            const target = numeric.find(function (item) {
                return Math.abs(item.value - targetValue) < 1e-6;
            });
            return target ? target.index : null;
        }

        function setMonthlyStatus(message) {
            if (!monthlyStatus) return;
            monthlyStatus.textContent = message || "";
            monthlyStatus.classList.toggle("is-visible", !!message);
        }

        function renderMonthlyTable(labels, values, highlightIndex) {
            if (!monthlyTableBody) return;
            monthlyTableBody.innerHTML = "";
            if (!labels || labels.length === 0) {
                const row = document.createElement("tr");
                const cell = document.createElement("td");
                cell.colSpan = 2;
                cell.textContent = "No data available.";
                row.appendChild(cell);
                monthlyTableBody.appendChild(row);
                return;
            }
            labels.forEach(function (label, idx) {
                const row = document.createElement("tr");
                const hourCell = document.createElement("td");
                hourCell.textContent = label;
                if (typeof highlightIndex === "number" && idx === highlightIndex) {
                    hourCell.classList.add("table-highlight-text");
                }
                const valueCell = document.createElement("td");
                const value = values[idx];
                valueCell.textContent = (typeof value === "number" && Number.isFinite(value))
                    ? numberTick(value)
                    : "-";
                row.appendChild(hourCell);
                row.appendChild(valueCell);
                monthlyTableBody.appendChild(row);
            });
        }

        function updateMonthlyChart(payload) {
            if (!monthlyCanvas || !window.Chart) return;
            const labels = payload.labels || [];
            const values = payload.values || [];
            const metric = payload.metric || "Load (kW)";
            const highlightIndex = typeof payload.peak_hour_index === "number" ? payload.peak_hour_index : null;
            renderMonthlyTable(labels, values, highlightIndex);

            const barColors = labels.map(function (_, idx) {
                if (typeof highlightIndex === "number" && idx === highlightIndex) {
                    return "#fde68a";
                }
                return "#2563eb";
            });

            if (monthlyTitle && payload.label && payload.year) {
                const peakLabelText = normalizePeak(payload.peak) === "lowest" ? "Lowest Peak" : "Highest Peak";
                const dayText = formatDayLabel(payload.day || "");
                const daySuffix = dayText ? ` (${dayText})` : "";
                monthlyTitle.textContent = `Monthly Hourly Loading (kW) - ${payload.label}${daySuffix} ${payload.year} (${peakLabelText})`;
            }
            if (monthlyCard) {
                monthlyCard.hidden = false;
                monthlyCard.classList.remove("is-hidden");
            }

            if (monthlyChart) {
                monthlyChart.data.labels = labels;
                monthlyChart.data.datasets[0].label = metric;
                monthlyChart.data.datasets[0].data = values;
                monthlyChart.data.datasets[0].backgroundColor = barColors;
                monthlyChart.update();
                return;
            }

            monthlyChart = registerChart(new Chart(monthlyCanvas, {
                type: "bar",
                data: {
                    labels: labels,
                    datasets: [{
                        label: metric,
                        data: values,
                        backgroundColor: barColors,
                        borderRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 12,
                                padding: 6
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: metric },
                            ticks: { callback: numberTick }
                        }
                    }
                }
            }));
        }

        function loadMonthly(monthIndex) {
            if (!monthlyCanvas) return;
            const yearValue = select.value;
            if (!yearValue) {
                setMonthlyStatus("Select a year to view monthly data.");
                renderMonthlyTable([], []);
                return;
            }
            selectedMonth = monthIndex;
            if (monthlyCard) {
                monthlyCard.hidden = true;
                monthlyCard.classList.add("is-hidden");
            }
            setMonthlyStatus("Loading monthly data...");
            const peak = normalizePeak(peakSelect.value);
            const requestToken = ++monthlyRequestToken;
            fetchJsonWithRetry(`/api/edd-hourly-kw-month-series/${yearValue}/${monthIndex}?peak=${encodeURIComponent(peak)}`, null, {
                retries: 2,
                delayMs: 350,
                shouldRetry: function (result) {
                    const payload = result.payload || {};
                    if (!result.ok && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    if (payload.error && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    return !!(result.ok && (!payload.labels || payload.labels.length === 0));
                },
                onRetry: function () {
                    if (requestToken !== monthlyRequestToken) return;
                    setMonthlyStatus("No data yet for this month. Retrying...");
                }
            })
                .then(function (result) {
                    if (requestToken !== monthlyRequestToken) return;
                    const payload = result.payload || {};
                    if (!result.ok || payload.error) {
                        setMonthlyStatus(payload.error || "Unable to load monthly data.");
                        renderMonthlyTable([], []);
                        return;
                    }
                    if (!payload || !payload.labels || payload.labels.length === 0) {
                        setMonthlyStatus("No hourly kW data found for that month.");
                        renderMonthlyTable([], []);
                        return;
                    }
                    setMonthlyStatus("");
                    updateMonthlyChart(payload);
                })
                .catch(function () {
                    if (requestToken !== monthlyRequestToken) return;
                    setMonthlyStatus("Unable to load monthly data.");
                    renderMonthlyTable([], []);
                });
        }

        function resetMonthly() {
            selectedMonth = null;
            if (monthlyTitle) {
                monthlyTitle.textContent = "Monthly Hourly Loading (kW)";
            }
            setMonthlyStatus("Click a month in the Annual System Demand chart to load data.");
            renderMonthlyTable([], []);
            if (monthlyCard) {
                monthlyCard.hidden = true;
                monthlyCard.classList.add("is-hidden");
            }
        }

        function toShortMonth(label) {
            const text = String(label || "").trim();
            if (!text) return text;
            const map = {
                january: "JAN",
                february: "FEB",
                march: "MAR",
                april: "APR",
                may: "MAY",
                june: "JUN",
                july: "JUL",
                august: "AUG",
                september: "SEP",
                october: "OCT",
                november: "NOV",
                december: "DEC"
            };
            const lower = text.toLowerCase();
            if (map[lower]) return map[lower];
            if (lower.length >= 3) return lower.slice(0, 3).toUpperCase();
            return text.toUpperCase();
        }

        function formatDayLabel(value) {
            const text = String(value || "");
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
            if (match) {
                return `${match[2]}/${match[3]}/${match[1]}`;
            }
            return text;
        }

        function updateChart(payload) {
            const labels = payload.labels || [];
            const displayLabels = labels.map(toShortMonth);
            const values = payload.values || [];
            const metric = payload.metric || "Load (kW)";
            const peak = normalizePeak(payload.peak || peakSelect.value);
            const highlightIndex = getPeakHighlightIndex(values, peak);
            const colors = displayLabels.map(function (_, index) {
                return index === highlightIndex ? peakColor(peak) : "#94a3b8";
            });
            const datasetLabel = `${peakLabel(peak)} ${metric}`;
            renderTable(labels, values, peak);

            if (chart) {
                chart.data.labels = displayLabels;
                chart.data.datasets[0].label = datasetLabel;
                chart.data.datasets[0].data = values;
                chart.data.datasets[0].backgroundColor = colors;
                chart.options.onClick = handleAnnualBarClick;
                if (chart.options && chart.options.scales && chart.options.scales.y) {
                    chart.options.scales.y.title.text = metric;
                }
                chart.update();
                return;
            }

            chart = registerChart(new Chart(canvas, {
                type: "bar",
                data: {
                    labels: displayLabels,
                    datasets: [{
                        label: datasetLabel,
                        data: values,
                        backgroundColor: colors,
                        borderRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    plugins: { legend: { display: false } },
                    onClick: handleAnnualBarClick,
                    scales: {
                        x: {
                            ticks: { padding: 6 }
                        },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: metric },
                            ticks: { callback: numberTick }
                        }
                    }
                }
            }));
        }

        function loadData(year) {
            if (!year) {
                setStatus("Upload a file to view this chart.");
                renderTable([], []);
                resetMonthly();
                return;
            }
            setStatus("");
            const peak = normalizePeak(peakSelect.value);
            const requestToken = ++annualRequestToken;
            fetchJsonWithRetry(`/api/edd-hourly-kw-annual/${year}?peak=${encodeURIComponent(peak)}`, null, {
                retries: 2,
                delayMs: 350,
                shouldRetry: function (result) {
                    const payload = result.payload || {};
                    if (!result.ok && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    if (payload.error && isLikelyNoDataMessage(payload.error)) {
                        return true;
                    }
                    return !!(result.ok && (!payload.labels || payload.labels.length === 0));
                },
                onRetry: function () {
                    if (requestToken !== annualRequestToken) return;
                    setStatus("No annual kW data yet. Retrying...");
                }
            })
                .then(function (result) {
                    if (requestToken !== annualRequestToken) return;
                    const payload = result.payload || {};
                    if (!result.ok || payload.error) {
                        setStatus(payload.error || "Unable to load chart data.");
                        renderTable([], []);
                        resetMonthly();
                        return;
                    }
                    if (!payload || !payload.labels || payload.labels.length === 0) {
                        setStatus("No hourly kW data found for that year.");
                        renderTable([], []);
                        resetMonthly();
                        return;
                    }
                    setStatus("");
                    updateChart(payload);
                })
                .catch(function () {
                    if (requestToken !== annualRequestToken) return;
                    setStatus("Unable to load chart data.");
                    renderTable([], []);
                    resetMonthly();
                });
        }

        function handleAnnualBarClick(event) {
            if (!chart) return;
            const points = chart.getElementsAtEventForMode(event, "nearest", { intersect: true }, true);
            if (!points || points.length === 0) return;
            const index = points[0].index;
            loadMonthly(index + 1);
        }

        function populateYears(years) {
            select.innerHTML = "";
            if (!years || years.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No years available";
                select.appendChild(option);
                select.disabled = true;
                peakSelect.disabled = true;
                setStatus("Upload a file to view this chart.");
                return;
            }
            select.disabled = false;
            peakSelect.disabled = false;
            years.forEach(function (year) {
                const option = document.createElement("option");
                option.value = String(year);
                option.textContent = String(year);
                select.appendChild(option);
            });
            loadData(select.value);
        }

        function loadYears() {
            select.innerHTML = "";
            const loading = document.createElement("option");
            loading.value = "";
            loading.textContent = "Loading years...";
            select.appendChild(loading);
            peakSelect.disabled = true;

            fetch("/api/edd-hourly-kw-years")
                .then(function (response) { return response.json(); })
                .then(function (payload) {
                    const years = payload.years || [];
                    populateYears(years);
                })
                .catch(function () {
                    select.innerHTML = "";
                    const option = document.createElement("option");
                    option.value = "";
                    option.textContent = "Unable to load years";
                    select.appendChild(option);
                    peakSelect.disabled = true;
                    setStatus("Unable to load years.");
                });
        }

        select.addEventListener("change", function () {
            resetMonthly();
            loadData(select.value);
        });

        peakSelect.addEventListener("change", function () {
            resetMonthly();
            loadData(select.value);
        });

        resetMonthly();
        loadYears();
    }

    function initSystemLossCharts() {
        const yearSelect = document.getElementById("systemLossYearSelect");
        const comparisonYearSelect = document.getElementById("systemLossComparisonYearSelect");
        const compareYearSelect = document.getElementById("systemLossCompareYearSelect");
        const barCanvas = document.getElementById("systemLossBarChart");
        const lineCanvas = document.getElementById("systemLossLineChart");
        const compareRow = document.getElementById("systemLossCompareCharts");
        const compareBarCanvas = document.getElementById("systemLossCompareBarChart");
        const comparePercentCanvas = document.getElementById("systemLossComparePercentChart");
        const status = document.getElementById("systemLossStatus");
        if (!yearSelect || !comparisonYearSelect || !compareYearSelect || !barCanvas || !lineCanvas || !window.Chart) return;

        let barChart = null;
        let lineChart = null;
        let compareBarChart = null;
        let comparePercentChart = null;

        function setStatus(message) {
            if (!status) return;
            status.textContent = message || "";
            status.classList.toggle("is-visible", !!message);
        }

        function isNumeric(value) {
            return typeof value === "number" && Number.isFinite(value);
        }

        function toShortMonth(label) {
            const text = String(label || "").trim();
            if (!text) return text;
            const map = {
                january: "JAN",
                february: "FEB",
                march: "MAR",
                april: "APR",
                may: "MAY",
                june: "JUN",
                july: "JUL",
                august: "AUG",
                september: "SEP",
                october: "OCT",
                november: "NOV",
                december: "DEC"
            };
            const lower = text.toLowerCase();
            if (map[lower]) return map[lower];
            if (lower.length >= 3) return lower.slice(0, 3).toUpperCase();
            return text.toUpperCase();
        }

        function updateCharts(payload, comparePayload) {
            const labels = payload.labels || [];
            const displayLabels = labels.map(toShortMonth);
            const values = payload.values || [];
            const percents = payload.percents || [];
            const valueMetric = payload.value_metric || "System Loss";
            const percentMetric = payload.percent_metric || "System Loss (%)";

            const valueNumbers = values.filter(isNumeric);
            const percentNumbers = percents.filter(isNumeric);
            if (valueNumbers.length === 0 && percentNumbers.length === 0) {
                setStatus("No System Loss data found for that year.");
                return;
            }

            const yearLabel = payload.year ? String(payload.year) : "";
            const valueDatasets = [{
                label: yearLabel ? `${valueMetric} ${yearLabel}` : valueMetric,
                data: values,
                backgroundColor: "#0f172a",
                borderRadius: 2
            }];
            const percentDatasets = [{
                label: yearLabel ? `${percentMetric} ${yearLabel}` : percentMetric,
                data: percents,
                backgroundColor: "#2563eb",
                borderRadius: 2
            }];

            const barScale = valueNumbers.length
                ? getScaleBounds(values, { beginAtZero: true, minPadding: 1, paddingRatio: 0.12 })
                : {};
            const lineScale = percentNumbers.length
                ? getScaleBounds(percents, { beginAtZero: true, minPadding: 0.5, paddingRatio: 0.12 })
                : {};

            if (barChart) {
                barChart.data.labels = displayLabels;
                barChart.data.datasets = valueDatasets;
                barChart.options.scales.y = Object.assign({}, barChart.options.scales.y || {}, barScale, {
                    title: { display: true, text: valueMetric },
                    ticks: { callback: numberTick }
                });
                barChart.update();
            } else {
                barChart = registerChart(new Chart(barCanvas, {
                    type: "bar",
                    data: {
                        labels: displayLabels,
                        datasets: valueDatasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                        plugins: { legend: { display: true } },
                        scales: {
                            x: {
                                ticks: {
                                    autoSkip: true,
                                    maxTicksLimit: 12,
                                    padding: 6
                                }
                            },
                            y: Object.assign({}, barScale, {
                                title: { display: true, text: valueMetric },
                                ticks: { callback: numberTick }
                            })
                        }
                    }
                }));
            }

            if (lineChart) {
                lineChart.data.labels = displayLabels;
                lineChart.data.datasets = percentDatasets;
                lineChart.options.scales.y = Object.assign({}, lineChart.options.scales.y || {}, lineScale, {
                    title: { display: true, text: percentMetric },
                    ticks: { callback: function (value) { return `${value}%`; } }
                });
                lineChart.update();
            } else {
                lineChart = registerChart(new Chart(lineCanvas, {
                    type: "bar",
                    data: {
                        labels: displayLabels,
                        datasets: percentDatasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                        plugins: { legend: { display: true } },
                        scales: {
                            x: {
                                ticks: {
                                    autoSkip: true,
                                    maxTicksLimit: 12,
                                    padding: 6
                                }
                            },
                            y: Object.assign({}, lineScale, {
                                title: { display: true, text: percentMetric },
                                ticks: { callback: function (value) { return `${value}%`; } }
                            })
                        }
                    }
                }));
            }
        }

        function updateCompareCharts(payload, comparePayload) {
            if (!compareRow || !compareBarCanvas || !comparePercentCanvas) return;
            const hasCompare = !!(comparePayload && comparePayload.labels && comparePayload.labels.length);
            compareRow.hidden = !hasCompare;
            if (!hasCompare) {
                return;
            }

            const labels = payload.labels || comparePayload.labels || [];
            const displayLabels = labels.map(toShortMonth);
            const valueMetric = payload.value_metric || "System Loss";
            const percentMetric = payload.percent_metric || "System Loss (%)";
            const yearLabel = payload.year ? String(payload.year) : "Selected";
            const compareYearLabel = comparePayload.year ? String(comparePayload.year) : "Compare";
            const valueDatasets = [
                {
                    label: `${valueMetric} ${yearLabel}`,
                    data: payload.values || [],
                    backgroundColor: "#0f172a",
                    borderRadius: 2
                },
                {
                    label: `${valueMetric} ${compareYearLabel}`,
                    data: comparePayload.values || [],
                    backgroundColor: "#9333ea",
                    borderRadius: 2
                }
            ];
            const percentDatasets = [
                {
                    label: `${percentMetric} ${yearLabel}`,
                    data: payload.percents || [],
                    backgroundColor: "#2563eb",
                    borderRadius: 2
                },
                {
                    label: `${percentMetric} ${compareYearLabel}`,
                    data: comparePayload.percents || [],
                    backgroundColor: "#10b981",
                    borderRadius: 2
                }
            ];
            const valueScale = Object.assign({}, getScaleBounds([payload.values || [], comparePayload.values || []], { beginAtZero: true, minPadding: 1, paddingRatio: 0.12 }), {
                title: { display: true, text: valueMetric },
                ticks: { callback: numberTick }
            });
            const percentScale = Object.assign({}, getScaleBounds([payload.percents || [], comparePayload.percents || []], { beginAtZero: true, minPadding: 0.5, paddingRatio: 0.12 }), {
                title: { display: true, text: percentMetric },
                ticks: { callback: function (value) { return `${value}%`; } }
            });

            if (compareBarChart) {
                compareBarChart.data.labels = displayLabels;
                compareBarChart.data.datasets = valueDatasets;
                compareBarChart.options.scales.y = valueScale;
                compareBarChart.update();
            } else {
                compareBarChart = registerChart(new Chart(compareBarCanvas, {
                    type: "bar",
                    data: { labels: displayLabels, datasets: valueDatasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                        plugins: { legend: { display: true } },
                        scales: {
                            x: { ticks: { autoSkip: true, maxTicksLimit: 12, padding: 6 } },
                            y: valueScale
                        }
                    }
                }));
            }

            if (comparePercentChart) {
                comparePercentChart.data.labels = displayLabels;
                comparePercentChart.data.datasets = percentDatasets;
                comparePercentChart.options.scales.y = percentScale;
                comparePercentChart.update();
            } else {
                comparePercentChart = registerChart(new Chart(comparePercentCanvas, {
                    type: "bar",
                    data: { labels: displayLabels, datasets: percentDatasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                        plugins: { legend: { display: true } },
                        scales: {
                            x: { ticks: { autoSkip: true, maxTicksLimit: 12, padding: 6 } },
                            y: percentScale
                        }
                    }
                }));
            }
        }

        function loadData(year) {
            if (!year) {
                setStatus("Upload a file to view this chart.");
                return;
            }
            setStatus("");
            fetchJson(`/api/edd-system-loss-year/${year}`)
                .then(function (result) {
                    const payload = result.payload || {};
                    if (!result.ok) {
                        setStatus(payload.error || "Unable to load chart data.");
                        return;
                    }
                    if (!payload || !payload.labels || payload.labels.length === 0) {
                        setStatus("No System Loss data found for that year.");
                        return;
                    }

                    updateCharts(payload, null);
                })
                .catch(function () {
                    setStatus("Unable to load chart data.");
                });
        }

        function loadComparisonData(year, compareYear) {
            if (compareRow) {
                compareRow.hidden = true;
            }
            if (!year || !compareYear || compareYear === year) {
                return;
            }
            fetchJson(`/api/edd-system-loss-year/${year}`)
                .then(function (result) {
                    const payload = result.payload || {};
                    if (!result.ok || !payload || !payload.labels || payload.labels.length === 0) {
                        setStatus(payload.error || `No data found for comparison year ${year}.`);
                        return null;
                    }
                    return fetchJson(`/api/edd-system-loss-year/${compareYear}`)
                        .then(function (compareResult) {
                            const comparePayload = compareResult.payload || {};
                            if (compareResult.ok && comparePayload && comparePayload.labels && comparePayload.labels.length) {
                                updateCompareCharts(payload, comparePayload);
                            } else {
                                setStatus(`No data found for compare year ${compareYear}.`);
                            }
                        });
                })
                .catch(function () {
                    setStatus("Unable to load comparison chart data.");
                });
        }

        function populateYears(years) {
            const previous = yearSelect.value || "";
            const previousComparison = comparisonYearSelect.value || "";
            const previousCompare = compareYearSelect.value || "";
            yearSelect.innerHTML = "";
            comparisonYearSelect.innerHTML = "";
            compareYearSelect.innerHTML = "";

            const noneOption = document.createElement("option");
            noneOption.value = "";
            noneOption.textContent = "None";
            compareYearSelect.appendChild(noneOption);

            if (!years || years.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No uploads yet";
                yearSelect.appendChild(option);
                yearSelect.disabled = true;
                comparisonYearSelect.disabled = true;
                compareYearSelect.disabled = true;
                setStatus("Upload a file to view this chart.");
                return;
            }

            yearSelect.disabled = false;
            comparisonYearSelect.disabled = false;
            compareYearSelect.disabled = false;
            years.forEach(function (year) {
                const option = document.createElement("option");
                option.value = String(year);
                option.textContent = String(year);
                yearSelect.appendChild(option);

                const comparisonOption = document.createElement("option");
                comparisonOption.value = String(year);
                comparisonOption.textContent = String(year);
                comparisonYearSelect.appendChild(comparisonOption);

                const compareOption = document.createElement("option");
                compareOption.value = String(year);
                compareOption.textContent = String(year);
                compareYearSelect.appendChild(compareOption);
            });

            const available = Array.from(yearSelect.options).map(function (opt) { return opt.value; });
            const availableComparison = Array.from(comparisonYearSelect.options).map(function (opt) { return opt.value; });
            const availableCompare = Array.from(compareYearSelect.options).map(function (opt) { return opt.value; });
            if (available.indexOf(previous) !== -1) {
                yearSelect.value = previous;
            } else {
                yearSelect.value = String(years[0]);
            }
            if (availableComparison.indexOf(previousComparison) !== -1) {
                comparisonYearSelect.value = previousComparison;
            } else {
                comparisonYearSelect.value = yearSelect.value;
            }
            if (availableCompare.indexOf(previousCompare) !== -1) {
                compareYearSelect.value = previousCompare;
            } else {
                compareYearSelect.value = "";
            }

            loadData(yearSelect.value);
            loadComparisonData(comparisonYearSelect.value, compareYearSelect.value);
        }

        function loadYears() {
            yearSelect.innerHTML = "";
            comparisonYearSelect.innerHTML = "";
            compareYearSelect.innerHTML = "";
            const loading = document.createElement("option");
            loading.value = "";
            loading.textContent = "Loading years...";
            yearSelect.appendChild(loading);
            yearSelect.disabled = true;
            comparisonYearSelect.disabled = true;
            compareYearSelect.disabled = true;

            fetchJson("/api/edd-system-loss-years")
                .then(function (result) {
                    const payload = result.payload || {};
                    if (!result.ok) {
                        yearSelect.innerHTML = "";
                        comparisonYearSelect.innerHTML = "";
                        compareYearSelect.innerHTML = "";
                        const option = document.createElement("option");
                        option.value = "";
                        option.textContent = "Unable to load years";
                        yearSelect.appendChild(option);
                        yearSelect.disabled = true;
                        comparisonYearSelect.disabled = true;
                        const noneOption = document.createElement("option");
                        noneOption.value = "";
                        noneOption.textContent = "None";
                        compareYearSelect.appendChild(noneOption);
                        compareYearSelect.disabled = true;
                        setStatus(payload.error || "Unable to load years.");
                        return;
                    }
                    populateYears(payload.years || []);
                })
                .catch(function () {
                    yearSelect.innerHTML = "";
                    comparisonYearSelect.innerHTML = "";
                    compareYearSelect.innerHTML = "";
                    const option = document.createElement("option");
                    option.value = "";
                    option.textContent = "Unable to load years";
                    yearSelect.appendChild(option);
                    yearSelect.disabled = true;
                    const noneOption = document.createElement("option");
                    noneOption.value = "";
                    noneOption.textContent = "None";
                    compareYearSelect.appendChild(noneOption);
                    compareYearSelect.disabled = true;
                    setStatus("Unable to load years.");
                });
        }

        yearSelect.addEventListener("change", function () {
            loadData(yearSelect.value);
        });

        comparisonYearSelect.addEventListener("change", function () {
            loadComparisonData(comparisonYearSelect.value, compareYearSelect.value);
        });

        compareYearSelect.addEventListener("change", function () {
            loadComparisonData(comparisonYearSelect.value, compareYearSelect.value);
        });

        window.refreshSystemLossYears = loadYears;
        loadYears();
    }

    function loadDashboardMetricsData() {
        return fetchJson("/data").then(function (result) {
            if (!result.ok || !result.payload) return;
            const uploads = Array.isArray(result.payload.items) ? result.payload.items : [];
            const dashboardMetricsUploads = uploads
                .filter(function (item) {
                    return String(item.category || "").toLowerCase() === "dashboard_metrics";
                })
                .sort(function (a, b) {
                    const aDate = Date.parse(a.uploaded_at || "") || 0;
                    const bDate = Date.parse(b.uploaded_at || "") || 0;
                    return bDate - aDate;
                });

            if (dashboardMetricsUploads.length === 0) {
                window.dashboardMetricsPayload = null;
                return null;
            }

            const latestMetricsUpload = dashboardMetricsUploads[0];
            const data = latestMetricsUpload.json_data || {};
            const metrics = data.dashboard_metrics || {};
            window.dashboardMetricsPayload = metrics;
            window.dashboardMetricsUpload = latestMetricsUpload;

            if (typeof window.refreshSalesYears === "function") {
                window.refreshSalesYears();
            }
            if (typeof window.refreshSystemLossYears === "function") {
                window.refreshSystemLossYears();
            }
            if (typeof window.refreshAnnualKwYears === "function") {
                window.refreshAnnualKwYears();
            }
            return metrics;
        }).catch(function (error) {
            console.warn("Failed to load dashboard metrics:", error);
            return null;
        });
    }

    function extractMonthlyValues(metricData) {
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        const values = [];
        const rows = metricData.data || [];

        // Get the latest row with data
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            if (row && row.data) {
                months.forEach(function (month) {
                    values.push(row.data[month]);
                });
                break;
            }
        }

        return {
            labels: months,
            values: values
        };
    }

    function parseDashboardYear(period) {
        const text = String(period || "").trim();
        const match = text.match(/\b(19|20)\d{2}\b/);
        return match ? String(match[0]) : null;
    }

    function parseDashboardNumber(value) {
        if (value === null || value === undefined || value === "") {
            return null;
        }
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : null;
        }
        const cleaned = String(value).replace(/,/g, "").trim();
        if (!cleaned) {
            return null;
        }
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : null;
    }

    function extractMetricYears(rows) {
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        const years = [];
        (rows || []).forEach(function (row) {
            if (!row || !row.period) {
                return;
            }
            const year = parseDashboardYear(row.period);
            if (!year) {
                return;
            }
            const data = row.data || {};
            const hasValues = months.some(function (month) {
                return parseDashboardNumber(data[month]) !== null;
            });
            if (!hasValues) {
                return;
            }
            if (years.indexOf(year) === -1) {
                years.push(year);
            }
        });
        return years.sort(function (a, b) {
            return Number(b) - Number(a);
        });
    }

    function updateLoadCurveChart(metricData) {
        const select = document.getElementById("annualKwYearSelect");
        const canvas = document.getElementById("annualKwChart");
        if (!select || !canvas || !window.Chart) return;

        const monthlyData = extractMonthlyValues(metricData);

        // Create a simple bar chart
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Clear existing chart if any
        if (canvas.chart) {
            canvas.chart.destroy();
        }

        canvas.chart = new window.Chart(ctx, {
            type: "bar",
            data: {
                labels: monthlyData.labels,
                datasets: [{
                    label: "Load Curve (kW)",
                    data: monthlyData.values,
                    backgroundColor: "rgba(54, 162, 235, 0.8)",
                    borderColor: "rgba(54, 162, 235, 1)",
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true },
                    title: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });

        // Populate year select with available years from rows that actually contain data.
        const years = extractMetricYears(metricData.data || []);

        select.innerHTML = "";
        years.forEach(function (year) {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            select.appendChild(option);
        });
    }

    function updateSalesChart(metricData) {
        const select = document.getElementById("salesYearSelect");
        const canvas = document.getElementById("salesLineChart");
        if (!select || !canvas || !window.Chart) return;

        const monthlyData = extractMonthlyValues(metricData);

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        if (canvas.chart) {
            canvas.chart.destroy();
        }

        canvas.chart = new window.Chart(ctx, {
            type: "line",
            data: {
                labels: monthlyData.labels,
                datasets: [{
                    label: "Total KWH Sold",
                    data: monthlyData.values,
                    borderColor: "rgba(75, 192, 75, 1)",
                    backgroundColor: "rgba(75, 192, 75, 0.1)",
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });

        const years = extractMetricYears(metricData.data || []);

        select.innerHTML = "";
        years.forEach(function (year) {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            select.appendChild(option);
        });
    }

    function updateSystemLossChart(systemLossKwhData, systemLossPercentData) {
        const yearSelect = document.getElementById("systemLossYearSelect");
        const compareYearSelect = document.getElementById("systemLossCompareYearSelect");
        if (!yearSelect || !compareYearSelect) return;

        const rows = Array.isArray(systemLossKwhData && systemLossKwhData.data) ? systemLossKwhData.data : [];
        const years = extractMetricYears(rows);

        yearSelect.innerHTML = "";
        compareYearSelect.innerHTML = "";

        years.forEach(function (year) {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });

        const noneOption = document.createElement("option");
        noneOption.value = "";
        noneOption.textContent = "None";
        compareYearSelect.appendChild(noneOption);
        years.forEach(function (year) {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            compareYearSelect.appendChild(option);
        });
    }

    function getDashboardMetricYears(metrics, keys) {
        const years = [];
        const rows = [];
        (keys || []).forEach(function (key) {
            const metricRows = (metrics && metrics[key] && metrics[key].data) || [];
            if (Array.isArray(metricRows)) {
                metricRows.forEach(function (row) {
                    rows.push(row);
                });
            }
        });
        extractMetricYears(rows).forEach(function (year) {
            const numericYear = Number(year);
            if (Number.isFinite(numericYear) && years.indexOf(numericYear) === -1) {
                years.push(numericYear);
            }
        });
        return years.sort(function (a, b) { return b - a; });
    }

    function getDashboardMetricForYear(metricData, year) {
        const rows = (metricData && metricData.data) || [];
        const selected = rows.find(function (row) {
            return parseInt(String(row.period || "").match(/\d{4}/), 10) === Number(year);
        });
        if (!selected) return null;
        return { data: [selected] };
    }

    function updateInterruptionCharts(saidiData, saifiData, maifiData) {
        function toShortMonth(label) {
            const text = String(label || "").trim();
            if (!text) return text;
            const map = {
                january: "JAN",
                february: "FEB",
                march: "MAR",
                april: "APR",
                may: "MAY",
                june: "JUN",
                july: "JUL",
                august: "AUG",
                september: "SEP",
                october: "OCT",
                november: "NOV",
                december: "DEC"
            };
            const lower = text.toLowerCase();
            if (map[lower]) return map[lower];
            if (lower.length >= 3) return lower.slice(0, 3).toUpperCase();
            return text.toUpperCase();
        }

        const interruptionMetrics = [
            { data: saidiData, id: "saidiChart", label: "SAIDI" },
            { data: saifiData, id: "saifiChart", label: "SAIFI" },
            { data: maifiData, id: "maifiChart", label: "MAIFI" }
        ];

        interruptionMetrics.forEach(function (metric) {
            if (!metric.data) return;
            const canvas = document.getElementById(metric.id);
            if (!canvas || !window.Chart) return;
            const monthlyData = extractMonthlyValues(metric.data);
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            if (canvas.chart) {
                canvas.chart.destroy();
            }

            canvas.chart = new window.Chart(ctx, {
                type: "line",
                data: {
                    labels: monthlyData.labels.map(toShortMonth),
                    datasets: [{
                        label: metric.label,
                        data: monthlyData.values,
                        borderColor: metric.label === "SAIDI" ? "#ef4444" : metric.label === "SAIFI" ? "#2563eb" : "#f59e0b",
                        backgroundColor: metric.label === "SAIDI" ? "rgba(239, 68, 68, 0.2)" : metric.label === "SAIFI" ? "rgba(37, 99, 235, 0.15)" : "rgba(245, 158, 11, 0.18)",
                        tension: 0.3,
                        fill: true,
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: true }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        });
    }

    function updateInterruptionCompareCharts(selectedYear, compareYear, selectedMetrics, compareMetrics) {
        const compareRow = document.getElementById("interruptionCompareCharts");
        if (!compareRow || !window.Chart) return;
        const hasCompare = !!(
            compareYear &&
            selectedMetrics &&
            compareMetrics &&
            selectedMetrics.saidi &&
            selectedMetrics.saifi &&
            selectedMetrics.maifi &&
            compareMetrics.saidi &&
            compareMetrics.saifi &&
            compareMetrics.maifi
        );
        compareRow.hidden = !hasCompare;
        if (!hasCompare) return;

        function toShortMonth(label) {
            const text = String(label || "").trim();
            if (!text) return text;
            return text.length >= 3 ? text.slice(0, 3).toUpperCase() : text.toUpperCase();
        }

        [
            { key: "saidi", id: "saidiCompareChart", label: "SAIDI", first: "#ef4444", second: "#991b1b" },
            { key: "saifi", id: "saifiCompareChart", label: "SAIFI", first: "#2563eb", second: "#1e40af" },
            { key: "maifi", id: "maifiCompareChart", label: "MAIFI", first: "#f59e0b", second: "#b45309" }
        ].forEach(function (metric) {
            const canvas = document.getElementById(metric.id);
            if (!canvas) return;
            const selectedData = extractMonthlyValues(selectedMetrics[metric.key]);
            const compareData = extractMonthlyValues(compareMetrics[metric.key]);
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            if (canvas.chart) {
                canvas.chart.destroy();
            }
            canvas.chart = new window.Chart(ctx, {
                type: "bar",
                data: {
                    labels: selectedData.labels.map(toShortMonth),
                    datasets: [
                        {
                            label: `${metric.label} ${selectedYear}`,
                            data: selectedData.values,
                            backgroundColor: metric.first,
                            borderRadius: 2
                        },
                        {
                            label: `${metric.label} ${compareYear}`,
                            data: compareData.values,
                            backgroundColor: metric.second,
                            borderRadius: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    plugins: { legend: { display: true } },
                    scales: {
                        x: { ticks: { autoSkip: true, maxTicksLimit: 12, padding: 6 } },
                        y: { beginAtZero: true }
                    }
                }
            });
        });
    }

    function initDashboardMetricsInterruptionCharts() {
        const yearSelect = document.getElementById("interruptionYearSelect");
        const comparisonYearSelect = document.getElementById("interruptionComparisonYearSelect");
        const compareYearSelect = document.getElementById("interruptionCompareYearSelect");
        const status = document.getElementById("interruptionStatus");
        const mainChartsRow = document.getElementById("interruptionMainCharts");
        if (!yearSelect || !comparisonYearSelect || !compareYearSelect || !window.Chart) return;

        function setStatus(message) {
            if (!status) return;
            status.textContent = message || "";
            status.classList.toggle("is-visible", !!message);
        }

        function showMainCharts(show) {
            if (!mainChartsRow) return;
            mainChartsRow.hidden = !show;
        }

        function buildMetricSet(metrics, year) {
            return {
                saidi: getDashboardMetricForYear(metrics.saidi, year),
                saifi: getDashboardMetricForYear(metrics.saifi, year),
                maifi: getDashboardMetricForYear(metrics.maifi, year)
            };
        }

        function renderComparisonCharts(baseYear, compareYear) {
            if (!baseYear || !compareYear || baseYear === compareYear) {
                updateInterruptionCompareCharts("", "", null, null);
                return;
            }
            const metrics = window.dashboardMetricsPayload || {};
            const baseMetrics = buildMetricSet(metrics, baseYear);
            const compareMetrics = buildMetricSet(metrics, compareYear);
            if (!baseMetrics.saidi || !baseMetrics.saifi || !baseMetrics.maifi || !compareMetrics.saidi || !compareMetrics.saifi || !compareMetrics.maifi) {
                updateInterruptionCompareCharts("", "", null, null);
                return;
            }
            updateInterruptionCompareCharts(baseYear, compareYear, baseMetrics, compareMetrics);
        }

        function renderMainCharts(year) {
            const metrics = window.dashboardMetricsPayload || {};
            if (!year || !metrics.saidi || !metrics.saifi || !metrics.maifi) {
                showMainCharts(false);
                setStatus("Upload Dashboard Metrics to view interruption charts.");
                updateInterruptionCompareCharts("", "", null, null);
                return;
            }
            const selectedMetrics = buildMetricSet(metrics, year);
            if (!selectedMetrics.saidi || !selectedMetrics.saifi || !selectedMetrics.maifi) {
                showMainCharts(false);
                setStatus("No interruption data found for selected year.");
                updateInterruptionCompareCharts("", "", null, null);
                return;
            }
            setStatus("");
            showMainCharts(true);
            updateInterruptionCharts(selectedMetrics.saidi, selectedMetrics.saifi, selectedMetrics.maifi);
            renderComparisonCharts(comparisonYearSelect.value, compareYearSelect.value);
        }

        function refresh() {
            setStatus("Loading Dashboard Metrics...");
            yearSelect.disabled = true;
            comparisonYearSelect.disabled = true;
            compareYearSelect.disabled = true;
            loadDashboardMetricsData().then(function () {
                const metrics = window.dashboardMetricsPayload || {};
                const years = getDashboardMetricYears(metrics, ["saidi", "saifi", "maifi"]);
                const previous = yearSelect.value || "";
                const previousComparison = comparisonYearSelect.value || "";
                const previousCompare = compareYearSelect.value || "";
                yearSelect.innerHTML = "";
                comparisonYearSelect.innerHTML = "";
                compareYearSelect.innerHTML = "";
                const noneOption = document.createElement("option");
                noneOption.value = "";
                noneOption.textContent = "None";
                compareYearSelect.appendChild(noneOption);
                if (years.length === 0) {
                    const option = document.createElement("option");
                    option.value = "";
                    option.textContent = "No uploads yet";
                    yearSelect.appendChild(option);
                    yearSelect.disabled = true;
                    comparisonYearSelect.disabled = true;
                    compareYearSelect.disabled = true;
                    showMainCharts(false);
                    updateInterruptionCompareCharts("", "", null, null);
                    setStatus("Upload Dashboard Metrics to view interruption charts.");
                    return;
                }
                years.forEach(function (year) {
                    const option = document.createElement("option");
                    option.value = String(year);
                    option.textContent = String(year);
                    yearSelect.appendChild(option);

                    const comparisonOption = document.createElement("option");
                    comparisonOption.value = String(year);
                    comparisonOption.textContent = String(year);
                    comparisonYearSelect.appendChild(comparisonOption);

                    const compareOption = document.createElement("option");
                    compareOption.value = String(year);
                    compareOption.textContent = String(year);
                    compareYearSelect.appendChild(compareOption);
                });
                yearSelect.disabled = false;
                comparisonYearSelect.disabled = false;
                compareYearSelect.disabled = false;
                yearSelect.value = years.map(String).indexOf(previous) !== -1 ? previous : String(years[0]);
                comparisonYearSelect.value = years.map(String).indexOf(previousComparison) !== -1 ? previousComparison : String(years[0]);
                compareYearSelect.value = years.map(String).indexOf(previousCompare) !== -1 ? previousCompare : "";
                renderMainCharts(yearSelect.value);
            }).catch(function () {
                yearSelect.innerHTML = "";
                comparisonYearSelect.innerHTML = "";
                compareYearSelect.innerHTML = "";
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "Unable to load years";
                yearSelect.appendChild(option);
                yearSelect.disabled = true;
                comparisonYearSelect.disabled = true;
                compareYearSelect.disabled = true;
                showMainCharts(false);
                updateInterruptionCompareCharts("", "", null, null);
                setStatus("Unable to load Dashboard Metrics.");
            });
        }

        yearSelect.addEventListener("change", function () {
            renderMainCharts(yearSelect.value);
        });

        comparisonYearSelect.addEventListener("change", function () {
            renderComparisonCharts(comparisonYearSelect.value, compareYearSelect.value);
        });

        compareYearSelect.addEventListener("change", function () {
            renderComparisonCharts(comparisonYearSelect.value, compareYearSelect.value);
        });

        window.refreshDashboardMetricsCharts = refresh;
        refresh();
    }

    window.refreshDashboardMetrics = function () {
        loadDashboardMetricsData();
    };

    function initSalesChart() {
        const yearSelect = document.getElementById("salesYearSelect");
        const monthSelect = document.getElementById("salesMonthSelect");
        const canvas = document.getElementById("salesLineChart");
        const status = document.getElementById("salesChartStatus");
        if (!yearSelect || !monthSelect || !canvas || !window.Chart) return;

        let chart = null;
        let activePayload = null;

        function setStatus(message) {
            if (!status) return;
            status.textContent = message || "";
            status.classList.toggle("is-visible", !!message);
        }

        function isNumeric(value) {
            return typeof value === "number" && Number.isFinite(value);
        }

        function toShortMonth(label) {
            const text = String(label || "").trim();
            if (!text) return text;
            const map = {
                january: "JAN",
                february: "FEB",
                march: "MAR",
                april: "APR",
                may: "MAY",
                june: "JUN",
                july: "JUL",
                august: "AUG",
                september: "SEP",
                october: "OCT",
                november: "NOV",
                december: "DEC"
            };
            const lower = text.toLowerCase();
            if (map[lower]) return map[lower];
            if (lower.length >= 3) return lower.slice(0, 3).toUpperCase();
            return text.toUpperCase();
        }

        function selectedMonthNumber() {
            const raw = String(monthSelect.value || "all").trim().toLowerCase();
            if (raw === "all") return null;
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) return null;
            return parsed;
        }

        function renderMonthOptions(payload) {
            const previous = monthSelect.value || "all";
            const labels = payload.labels || [];
            const values = payload.values || [];
            monthSelect.innerHTML = "";

            const allOption = document.createElement("option");
            allOption.value = "all";
            allOption.textContent = "All months";
            monthSelect.appendChild(allOption);

            labels.forEach(function (label, index) {
                const value = values[index];
                if (!isNumeric(value)) return;
                const option = document.createElement("option");
                option.value = String(index + 1);
                option.textContent = label;
                monthSelect.appendChild(option);
            });

            const available = Array.from(monthSelect.options).map(function (option) { return option.value; });
            monthSelect.value = available.indexOf(previous) !== -1 ? previous : "all";
            monthSelect.disabled = monthSelect.options.length <= 1;
        }

        function buildPointStyles(values) {
            const selectedMonth = selectedMonthNumber();
            return {
                radius: values.map(function (_item, index) {
                    if (!selectedMonth) return 4;
                    return index === (selectedMonth - 1) ? 6 : 3;
                }),
                backgroundColor: values.map(function (_item, index) {
                    if (!selectedMonth) return "#2563eb";
                    return index === (selectedMonth - 1) ? "#f97316" : "#2563eb";
                })
            };
        }

        function selectMonthFromIndex(pointIndex) {
            if (!activePayload) return;
            const monthValue = String(pointIndex + 1);
            const available = Array.from(monthSelect.options).map(function (option) { return option.value; });
            if (available.indexOf(monthValue) === -1) return;
            monthSelect.value = monthValue;
            updateChart(activePayload);
            showTooltipForIndex(pointIndex);
            displaySalesTable(pointIndex);
        }

        function displaySalesTable(pointIndex) {
            const container = document.getElementById("salesTableContainer");
            if (!container || !activePayload) return;

            const labels = activePayload.labels || [];
            const values = activePayload.values || [];
            const year = activePayload.year || yearSelect.value || "";
            const monthLabel = labels[pointIndex] || "";
            const kwhValue = values[pointIndex];

            if (!isNumeric(kwhValue)) {
                container.innerHTML = "";
                return;
            }

            const html = `
                <div class="sales-details">
                    <h3>Sales Details</h3>
                    <table class="sales-table">
                        <tr>
                            <td class="sales-label">Month:</td>
                            <td class="sales-value">${monthLabel}</td>
                        </tr>
                        <tr>
                            <td class="sales-label">Year:</td>
                            <td class="sales-value">${year}</td>
                        </tr>
                        <tr>
                            <td class="sales-label">Total KWH Sold:</td>
                            <td class="sales-value">${formatSalesValue(kwhValue)} kWh</td>
                        </tr>
                    </table>
                </div>
            `;

            container.innerHTML = html;
        }

        function getPointIndexFromEvent(event) {
            if (!chart || !activePayload) return null;
            const values = activePayload.values || [];
            const candidates = [
                chart.getElementsAtEventForMode(event, "index", { intersect: false, axis: "x" }, true),
                chart.getElementsAtEventForMode(event, "nearest", { intersect: false, axis: "x" }, true)
            ];

            for (let i = 0; i < candidates.length; i += 1) {
                const points = candidates[i];
                if (!points || points.length === 0) continue;
                for (let j = 0; j < points.length; j += 1) {
                    const index = points[j].index;
                    const value = values[index];
                    if (isNumeric(value)) {
                        return index;
                    }
                }
            }
            return null;
        }

        function formatSalesValue(value) {
            if (!isNumeric(value)) return "-";
            const hasDecimals = Math.abs(value - Math.round(value)) > 0.00001;
            return value.toLocaleString(undefined, hasDecimals ? { maximumFractionDigits: 3 } : undefined);
        }

        function clearTooltip() {
            if (!chart) return;
            chart.setActiveElements([]);
            if (chart.tooltip && typeof chart.tooltip.setActiveElements === "function") {
                chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            }
            chart.update();
        }

        function showTooltipForIndex(pointIndex) {
            if (!chart || !activePayload) return;
            const values = activePayload.values || [];
            const value = values[pointIndex];
            if (!isNumeric(value)) return;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || !meta.data[pointIndex]) return;
            const point = meta.data[pointIndex];
            const active = [{ datasetIndex: 0, index: pointIndex }];
            chart.setActiveElements(active);
            if (chart.tooltip && typeof chart.tooltip.setActiveElements === "function") {
                chart.tooltip.setActiveElements(active, { x: point.x, y: point.y });
            }
            chart.update();
        }

        function updateChart(payload) {
            const labels = payload.labels || [];
            const displayLabels = labels.map(toShortMonth);
            const values = payload.values || [];
            const metric = payload.metric || "Total KWH Sold";
            const pointStyles = buildPointStyles(values);
            const yScale = Object.assign({}, getScaleBounds(values, { beginAtZero: true, minPadding: 1, paddingRatio: 0.12 }), {
                title: { display: true, text: metric },
                ticks: { callback: numberTick }
            });

            if (chart) {
                chart.data.labels = displayLabels;
                chart.data.datasets[0].label = metric;
                chart.data.datasets[0].data = values;
                chart.data.datasets[0].pointRadius = pointStyles.radius;
                chart.data.datasets[0].pointBackgroundColor = pointStyles.backgroundColor;
                chart.options.scales.y = yScale;
                chart.update();
                return;
            }

            chart = registerChart(new Chart(canvas, {
                type: "line",
                data: {
                    labels: displayLabels,
                    datasets: [{
                        label: metric,
                        data: values,
                        borderColor: "#2563eb",
                        backgroundColor: "rgba(37, 99, 235, 0.18)",
                        pointRadius: pointStyles.radius,
                        pointHoverRadius: 9,
                        pointHitRadius: 20,
                        pointBackgroundColor: pointStyles.backgroundColor,
                        borderWidth: 2,
                        tension: 0.25,
                        spanGaps: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    interaction: {
                        mode: "index",
                        intersect: false,
                        axis: "x"
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            mode: "index",
                            intersect: false,
                            displayColors: false,
                            callbacks: {
                                label: function (context) {
                                    const value = context.parsed && typeof context.parsed.y === "number" ? context.parsed.y : null;
                                    return `Total KWH Sold: ${formatSalesValue(value)} kWh`;
                                },
                                title: function (items) {
                                    const item = items && items[0] ? items[0] : null;
                                    if (!item || !activePayload) return "";
                                    const labels = activePayload.labels || [];
                                    const index = item.dataIndex;
                                    const monthLabel = labels[index] || item.label || "";
                                    const yearLabel = activePayload.year || yearSelect.value || "";
                                    return yearLabel ? `${monthLabel} ${yearLabel}` : monthLabel;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 12,
                                padding: 6
                            }
                        },
                        y: yScale
                    }
                }
            }));
        }

        function loadData(year) {
            if (!year) {
                activePayload = null;
                monthSelect.innerHTML = "";
                const option = document.createElement("option");
                option.value = "all";
                option.textContent = "All months";
                monthSelect.appendChild(option);
                monthSelect.disabled = true;
                clearTooltip();
                setStatus("Upload an EDD file to view this chart.");
                return;
            }

            setStatus("");
            fetchJson(`/api/edd-sales-year/${year}`)
                .then(function (result) {
                    const payload = result.payload || {};
                    if (!result.ok) {
                        activePayload = null;
                        monthSelect.disabled = true;
                        clearTooltip();
                        setStatus(payload.error || "Unable to load chart data.");
                        return;
                    }

                    if (!payload || !payload.labels || payload.labels.length === 0) {
                        activePayload = null;
                        monthSelect.disabled = true;
                        clearTooltip();
                        setStatus("No Sales data found for that year.");
                        return;
                    }

                    activePayload = payload;
                    renderMonthOptions(payload);
                    updateChart(payload);
                    const selected = selectedMonthNumber();
                    if (selected) {
                        showTooltipForIndex(selected - 1);
                    } else {
                        clearTooltip();
                    }
                })
                .catch(function () {
                    activePayload = null;
                    monthSelect.disabled = true;
                    clearTooltip();
                    setStatus("Unable to load chart data.");
                });
        }

        function populateYears(years) {
            const previous = yearSelect.value || "";
            yearSelect.innerHTML = "";
            if (!years || years.length === 0) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No years available";
                yearSelect.appendChild(option);
                yearSelect.disabled = true;
                loadData("");
                return;
            }

            yearSelect.disabled = false;
            years.forEach(function (year) {
                const option = document.createElement("option");
                option.value = String(year);
                option.textContent = String(year);
                yearSelect.appendChild(option);
            });

            const available = Array.from(yearSelect.options).map(function (option) { return option.value; });
            yearSelect.value = available.indexOf(previous) !== -1 ? previous : String(years[0]);
            loadData(yearSelect.value);
        }

        function loadYears() {
            yearSelect.innerHTML = "";
            const loading = document.createElement("option");
            loading.value = "";
            loading.textContent = "Loading years...";
            yearSelect.appendChild(loading);
            yearSelect.disabled = true;
            monthSelect.disabled = true;
            clearTooltip();

            fetchJson("/api/edd-sales-years")
                .then(function (result) {
                    const payload = result.payload || {};
                    if (!result.ok) {
                        yearSelect.innerHTML = "";
                        const option = document.createElement("option");
                        option.value = "";
                        option.textContent = "Unable to load years";
                        yearSelect.appendChild(option);
                        yearSelect.disabled = true;
                        monthSelect.disabled = true;
                        setStatus(payload.error || "Unable to load years.");
                        return;
                    }
                    setStatus("");
                    populateYears(payload.years || []);
                })
                .catch(function () {
                    yearSelect.innerHTML = "";
                    const option = document.createElement("option");
                    option.value = "";
                    option.textContent = "Unable to load years";
                    yearSelect.appendChild(option);
                    yearSelect.disabled = true;
                    monthSelect.disabled = true;
                    setStatus("Unable to load years.");
                });
        }

        yearSelect.addEventListener("change", function () {
            loadData(yearSelect.value);
        });

        monthSelect.addEventListener("change", function () {
            if (!activePayload) return;
            updateChart(activePayload);
            const selected = selectedMonthNumber();
            if (selected) {
                showTooltipForIndex(selected - 1);
            } else {
                clearTooltip();
            }
        });

        canvas.addEventListener("click", function (event) {
            const index = getPointIndexFromEvent(event);
            if (index === null) return;
            selectMonthFromIndex(index);
        });

        canvas.addEventListener("mousemove", function (event) {
            const index = getPointIndexFromEvent(event);
            canvas.style.cursor = index === null ? "default" : "pointer";
        });

        canvas.addEventListener("mouseleave", function () {
            canvas.style.cursor = "default";
        });

        window.refreshSalesYears = loadYears;
        loadYears();
    }

    function initPeakLoadChart() {
        const select = document.getElementById("peakYearSelect");
        const canvas = document.getElementById("peakLoadChart");
        const status = document.getElementById("peakLoadStatus");
        if (!select || !canvas || !window.Chart) return;

        let chart = null;

        function setStatus(message) {
            if (!status) return;
            status.textContent = message || "";
            status.classList.toggle("is-visible", !!message);
        }

        function updateChart(payload) {
            const labels = payload.labels || [];
            const values = payload.values || [];
            const metric = payload.metric || "Peak Load (kW)";

            if (chart) {
                chart.data.labels = labels;
                chart.data.datasets[0].label = metric;
                chart.data.datasets[0].data = values;
                chart.update();
                return;
            }

            chart = registerChart(new Chart(canvas, {
                type: "bar",
                data: {
                    labels: labels,
                    datasets: [{
                        label: metric,
                        data: values,
                        backgroundColor: "#0f172a",
                        borderRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 12,
                                padding: 6
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: metric },
                            ticks: { callback: numberTick }
                        }
                    }
                }
            }));
        }

        function loadData(year) {
            if (!year) {
                setStatus("Upload a file to view this chart.");
                return;
            }
            setStatus("");
            fetch(`/api/edd-peak-load-year/${year}`)
                .then(function (response) { return response.json(); })
                .then(function (payload) {
                    if (payload && payload.error) {
                        setStatus(payload.error);
                        return;
                    }
                    if (!payload || !payload.labels || payload.labels.length === 0) {
                        setStatus("No Peak Load data found for that year.");
                        return;
                    }
                    updateChart(payload);
                })
                .catch(function () {
                    setStatus("Unable to load chart data.");
                });
        }

        select.addEventListener("change", function () {
            loadData(select.value);
        });

        loadData(select.value);
    }

    initPasswordToggles();
    initLoginForm();
    initLogoutLink();

    const isDashboard = document.body && document.body.classList.contains("dashboard-page");
    const bootstrapPromise = isDashboard ? loadBootstrap() : Promise.resolve(null);
    bootstrapPromise.then(function (bootstrapPayload) {
        if (!isDashboard) return;
        initFactSheetEditor(bootstrapPayload || null);
        initUploadPanel();
        initUploadFilter();
        initEddPurchasesChart();
        initHourlyUploadChart();
        initSystemLossCharts();
        initSalesChart();
        initPeakLoadChart();
        initHourlyDayChart();
        initHourlyDayKwChart();
        initAnnualKwChart();
        initDashboardMetricsInterruptionCharts();

        if (!mapElement) {
            initSvgOverlayMap();
        }
    });
});

