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
        if (sectionId === "section-map" && dashboardMap) {
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
        });
    });

    if (sectionCards.length > 0) {
        showSection(sectionCards[0].id);
    }

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

        const hourlyCanvas = document.getElementById("hourlyLoadingChart");
        if (hourlyCanvas) {
            const hourlyLabels = Array.from({ length: 24 }, function (_, i) {
                return `${i + 1}:00`;
            });
            const hourlyData = [82000, 80000, 77000, 73000, 70000, 68000, 73000, 75000, 76000, 89000, 98000, 101000, 100500, 99500, 101000, 102000, 100500, 98000, 106000, 107000, 102000, 97000, 93000, 90000];
            const highlightIndex = 17;
            const hourlyScale = getScaleBounds(hourlyData, {
                beginAtZero: true,
                minPadding: 1000,
                paddingRatio: 0.12
            });
            registerChart(new Chart(hourlyCanvas, {
                type: "bar",
                data: {
                    labels: hourlyLabels,
                    datasets: [{
                        label: "Peak Load (kW)",
                        data: hourlyData,
                        backgroundColor: hourlyData.map(function (_, i) {
                            return i === highlightIndex ? "#f4d03f" : "#1f77b4";
                        }),
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
                                maxRotation: 45,
                                minRotation: 0,
                                padding: 6
                            }
                        },
                        y: Object.assign({}, hourlyScale, {
                            title: { display: true, text: "Peak Load (kW)" },
                            ticks: { callback: numberTick }
                        })
                    }
                }
            }));
        }

        const capacityCanvas = document.getElementById("capacityDemandChart");
        if (capacityCanvas) {
            const years = Array.from({ length: 29 }, function (_, i) { return String(2007 + i); });
            const capacity = [70, 70, 70, 70, 80, 80, 80, 75, 75, 80, 130, 130, 140, 145, 155, 165, 165, 165, 170, 230, 250, 250, 250, 250, 250, 250, 250, 250, 250];
            const demand = [50, 52, 55, 57, 60, 62, 65, 70, 74, 78, 84, 90, 96, 95, 99, 103, 112, 122, 131, 139, 147, 155, 162, 169, 176, 183, 190, 197, 205];
            const capacityScale = getScaleBounds([capacity, demand], {
                beginAtZero: true,
                minPadding: 5
            });
            registerChart(new Chart(capacityCanvas, {
                data: {
                    labels: years,
                    datasets: [
                        {
                            type: "bar",
                            order: 3,
                            label: "S/S Capacity",
                            data: capacity,
                            backgroundColor: "#1f77b4",
                            borderRadius: 2
                        },
                        {
                            type: "line",
                            order: 1,
                            label: "Demand",
                            data: demand,
                            borderColor: "#0b1e55",
                            backgroundColor: "#0b1e55",
                            borderWidth: 3,
                            tension: 0.25,
                            pointRadius: 4,
                            pointHoverRadius: 5,
                            pointBackgroundColor: "#ef4444",
                            pointBorderColor: "#ffffff",
                            pointBorderWidth: 1.5,
                            clip: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 14,
                                maxRotation: 0,
                                padding: 6
                            }
                        },
                        y: Object.assign({}, capacityScale, {
                            title: { display: true, text: "Demand in MW" },
                            ticks: { callback: numberTick }
                        })
                    }
                }
            }));
        }

        const monthlyCanvas = document.getElementById("monthlyProfileChart");
        if (monthlyCanvas) {
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const monthly2026 = [112, 113, null, null, null, null, null, null, null, null, null, null];
            const monthly2024 = [101, 97, 102, 114, 121, 123, 113, 120, 116, 120, 111, 112];
            const monthly2025 = [106, 105, 110, 123, 124, 127, 122, 124, 119, 122, 120, 118];
            const monthlyScale = getScaleBounds([monthly2026, monthly2024, monthly2025], {
                minPadding: 2
            });
            registerChart(new Chart(monthlyCanvas, {
                data: {
                    labels: months,
                    datasets: [
                        {
                            type: "bar",
                            order: 3,
                            label: "2026",
                            data: monthly2026,
                            backgroundColor: "#1f77b4",
                            borderRadius: 2
                        },
                        {
                            type: "line",
                            order: 1,
                            label: "2024",
                            data: monthly2024,
                            borderColor: "#d7d400",
                            backgroundColor: "#d7d400",
                            borderWidth: 3,
                            tension: 0.25,
                            pointRadius: 4,
                            pointHoverRadius: 5,
                            pointBackgroundColor: "#d7d400",
                            pointBorderColor: "#ffffff",
                            pointBorderWidth: 1.5,
                            clip: false
                        },
                        {
                            type: "line",
                            order: 0,
                            label: "2025",
                            data: monthly2025,
                            borderColor: "#ff0000",
                            backgroundColor: "#ff0000",
                            borderWidth: 3,
                            tension: 0.25,
                            pointRadius: 4,
                            pointHoverRadius: 5,
                            pointBackgroundColor: "#ff0000",
                            pointBorderColor: "#ffffff",
                            pointBorderWidth: 1.5,
                            clip: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 12,
                                padding: 6
                            }
                        },
                        y: Object.assign({}, monthlyScale, {
                            title: { display: true, text: "Demand in MW" },
                            ticks: { callback: numberTick }
                        })
                    }
                }
            }));
        }

        const lossCanvas = document.getElementById("systemsLossChart");
        if (lossCanvas) {
            const yearsLoss = Array.from({ length: 19 }, function (_, i) { return String(2007 + i); });
            const lossPct = [31, 20, 18, 19, 18, 22, 29, 27, 26.5, 26, 24, 23, 23, 24, 25, 26, 26, 23, 22];
            const lossScale = getScaleBounds(lossPct, {
                beginAtZero: true,
                minPadding: 0.5,
                paddingRatio: 0.08
            });
            registerChart(new Chart(lossCanvas, {
                type: "bar",
                data: {
                    labels: yearsLoss,
                    datasets: [{ label: "SL", data: lossPct, backgroundColor: "#1f77b4", borderRadius: 2 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    scales: {
                        x: {
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 12,
                                padding: 6
                            }
                        },
                        y: Object.assign({}, lossScale, {
                            ticks: {
                                callback: function (value) { return `${value}%`; }
                            }
                        })
                    }
                }
            }));
        }

        const forecastCanvas = document.getElementById("forecastSupplyDemandChart");
        if (forecastCanvas) {
            const labels = [];
            const baseRps = [];
            const baseload = [];
            const rec = [];
            const erc = [];
            const demand = [];
            for (let y = 2026; y <= 2035; y++) {
                for (let m = 1; m <= 12; m++) {
                    labels.push(`${y}-${String(m).padStart(2, "0")}`);
                    const progress = (y - 2026) * 12 + (m - 1);
                    baseRps.push(30 + progress * 0.18);
                    baseload.push(progress < 24 ? 0 : 14);
                    rec.push(26 + progress * 0.13);
                    erc.push(38 + progress * 0.08);
                    demand.push(118 + progress * 0.7 + (Math.sin(progress / 2) * 9));
                }
            }
            const supplyTotals = labels.map(function (_, index) {
                return (erc[index] || 0) + (baseload[index] || 0) + (baseRps[index] || 0) + (rec[index] || 0);
            });
            const forecastScale = getScaleBounds([supplyTotals, demand], {
                beginAtZero: true,
                minPadding: 5,
                paddingRatio: 0.08
            });
            registerChart(new Chart(forecastCanvas, {
                data: {
                    labels: labels,
                    datasets: [
                        { type: "bar", order: 3, stack: "supply", label: "ERC Case No. 2025-121 RC", data: erc, backgroundColor: "#f08c2e" },
                        { type: "bar", order: 3, stack: "supply", label: "Baseload 2028", data: baseload, backgroundColor: "#f4b400" },
                        { type: "bar", order: 3, stack: "supply", label: "Intermediate RE for RPS", data: baseRps, backgroundColor: "#4c77c9" },
                        { type: "bar", order: 3, stack: "supply", label: "Retail Electricity Suppliers MW", data: rec, backgroundColor: "#8aa5d6" },
                        {
                            type: "line",
                            order: 1,
                            label: "Coincident Peak MW",
                            data: demand,
                            borderColor: "#111",
                            backgroundColor: "#111",
                            borderWidth: 2.8,
                            tension: 0.25,
                            yAxisID: "y",
                            pointRadius: 0,
                            clip: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 10, right: 12, bottom: 4, left: 6 } },
                    scales: {
                        x: {
                            stacked: true,
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 12,
                                callback: function (_, index) {
                                    const label = labels[index];
                                    return label && label.endsWith("-01") ? label.slice(0, 4) : "";
                                }
                            }
                        },
                        y: Object.assign({}, forecastScale, {
                            stacked: true,
                            title: { display: true, text: "MW" },
                            ticks: { callback: numberTick }
                        })
                    }
                }
            }));
        }

        const generationMixCanvas = document.getElementById("generationMixChart");
        if (generationMixCanvas) {
            const generationMixPercentPlugin = {
                id: "generationMixPercentPlugin",
                afterDatasetsDraw: function (chart) {
                    const dataset = chart.data.datasets[0];
                    const meta = chart.getDatasetMeta(0);
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.font = "700 16px Segoe UI";
                    ctx.fillStyle = "#ffffff";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    meta.data.forEach(function (arc, index) {
                        const p = arc.getProps(
                            ["x", "y", "startAngle", "endAngle", "innerRadius", "outerRadius"],
                            true
                        );
                        const angle = (p.startAngle + p.endAngle) / 2;
                        const radius = (p.innerRadius + p.outerRadius) / 2;
                        const x = p.x + Math.cos(angle) * radius;
                        const y = p.y + Math.sin(angle) * radius;
                        ctx.fillText(`${dataset.data[index]}%`, x, y);
                    });
                    ctx.restore();
                }
            };
            registerChart(new Chart(generationMixCanvas, {
                type: "pie",
                plugins: [generationMixPercentPlugin],
                data: {
                    labels: ["Therma Luzon, Inc.", "Masinloc Power Co. Ltd.", "WESM"],
                    datasets: [{
                        data: [37, 37, 26],
                        backgroundColor: ["#4a74c1", "#ec8630", "#a3a3a3"],
                        borderColor: "#ffffff",
                        borderWidth: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 8, right: 8, bottom: 8, left: 8 } },
                    plugins: {
                        legend: {
                            display: true,
                            position: "bottom",
                            labels: {
                                boxWidth: 14,
                                boxHeight: 14,
                                padding: 12,
                                color: "#334155",
                                font: {
                                    size: 12,
                                    weight: "600"
                                }
                            }
                        }
                    }
                }
            }));
        }
    }

    const mapElement = document.getElementById("map");
    const branchSelect = document.getElementById("branchSelect");
    const levelLegend = document.getElementById("levelLegend");
    const levelEditor = document.getElementById("levelEditor");
    const locationDetails = document.getElementById("locationDetails");

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
                                lyr.bringToFront();
                            }
                        });
                        if (locationDetails) {
                            locationDetails.innerHTML =
                                `<h3>${match.name}</h3>` +
                                `<p><strong>Type:</strong> ${match.type}</p>` +
                                `<p><strong>Branch:</strong> Branch ${branchKey}</p>` +
                                `<p><strong>Electrification:</strong> ${LEVELS[match.level].label}</p>`;
                        }
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
            renderLegend(branchKey);
            renderEditor(branchKey);
            renderMap(branchKey, true);

            if (locationDetails) {
                locationDetails.innerHTML =
                    "<h3>Location Details</h3>" +
                    "<p>Click a location on the map to see details.</p>";
            }
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

        renderBranch(currentBranch);

        fetch(albayGeoJsonUrl)
            .then(function (response) {
                if (!response.ok) throw new Error("Failed to load map data");
                return response.json();
            })
            .then(function (data) {
                albayGeoJsonData = data;
                displayGeoJson = buildDisplayGeoJson(data);
                onMapPanelShown = function () {
                    renderBranch(currentBranch);
                };
                renderBranch(currentBranch);
            })
            .catch(function () {
                if (locationDetails) {
                    locationDetails.innerHTML =
                        "<h3>Map Data Error</h3><p>Unable to load Albay boundary data right now.</p>";
                }
            });

        setTimeout(function () {
            map.invalidateSize();
        }, 120);
    }
});

