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
                mapElement.classList.toggle("hidden", !!useBranchImage);
            }
            if (branchImageMap) {
                branchImageMap.classList.toggle("hidden", !useBranchImage);
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
                        bindBranch3Events();
                        rebuildBranch3HitMap(true);
                        renderBranch3Overlay(branchByName);
                    }
                });
                return;
            }

            bindBranch3Events();
            rebuildBranch3HitMap(false);
            renderBranch3Overlay(branchByName);
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

            renderMap(branchKey, true);
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

        const branchData = {
            "1": [
                { name: "Tabaco City", type: "City", level: "90-100", description: "" },
                { name: "Santo Domingo", type: "Municipality", level: "90-100", description: "" },
                { name: "Tiwi", type: "Municipality", level: "80-89", description: "" },
                { name: "Malinao", type: "Municipality", level: "80-89", description: "" },
                { name: "Malilipot", type: "Municipality", level: "80-89", description: "" },
                { name: "Bacacay", type: "Municipality", level: "70-79", description: "" }
            ],
            "2": [
                { name: "Daraga", type: "Municipality", level: "90-100", description: "" },
                { name: "Legazpi City", type: "City", level: "90-100", description: "" },
                { name: "Camalig", type: "Municipality", level: "80-89", description: "" },
                { name: "Manito", type: "Municipality", level: "80-89", description: "" },
                { name: "Rapu-Rapu", type: "Municipality", level: "60-69", description: "" }
            ],
            "3": [
                { name: "Polangui", type: "Municipality", level: "90-100", description: "" },
                { name: "Ligao City", type: "City", level: "90-100", description: "" },
                { name: "Guinobatan", type: "Municipality", level: "90-100", description: "" },
                { name: "Libon", type: "Municipality", level: "80-89", description: "" },
                { name: "Oas", type: "Municipality", level: "80-89", description: "" },
                { name: "Pio Duran", type: "Municipality", level: "70-79", description: "" },
                { name: "Jovellar", type: "Municipality", level: "70-79", description: "" }
            ]
        };

        const defaultLocationMarkup = locationDetails ? locationDetails.innerHTML : "";

        function normalizeName(name) {
            return String(name || "")
                .toLowerCase()
                .replace("city of ", "")
                .replace(" city", "")
                .replace(/[^a-z0-9]/g, "");
        }

        const locationIndex = new Map();
        Object.keys(branchData).forEach(function (branchKey) {
            branchData[branchKey].forEach(function (loc) {
                loc.branch = branchKey;
                locationIndex.set(normalizeName(loc.name), loc);
            });
        });

        const mapContexts = [];
        let selectedLocationKey = null;
        let currentBranch = branchSelect ? branchSelect.value : "3";

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
            locationDetails.innerHTML =
                `<h3>${loc.name}</h3>` +
                `<p><strong>Type:</strong> ${loc.type}</p>` +
                `<p><strong>Branch:</strong> Branch ${loc.branch}</p>` +
                `<p><strong>Electrification:</strong> ${LEVELS[loc.level].label}</p>`;
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
            renderEditor(branchKey);
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
            const cleaned = String(fileName || "").replace(/\.svg$/i, "");
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
            if (!safeBase) return fileName;
            return `${safeBase}/${encodeURIComponent(fileName)}`;
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

        function tagRegionShape(shape, areaName) {
            if (!shape.classList.contains("map-region")) {
                shape.classList.add("map-region");
            }
            if (!shape.hasAttribute("data-name")) {
                shape.setAttribute("data-name", areaName);
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

        function appendSvgArea(overlay, svgText, areaName) {
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
                            tagRegionShape(shape, regionName);
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
                            tagRegionShape(part, regionName);
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
                        tagRegionShape(part, areaName);
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
                    const url = buildAreaUrl(areaBase, fileName);
                    return fetch(url)
                        .then(function (response) {
                            if (!response.ok) {
                                throw new Error("Unable to load SVG area");
                            }
                            return response.text();
                        })
                        .then(function (svgText) {
                            appendSvgArea(overlay, svgText, areaName);
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
                    region.dataset.branch = loc.branch;
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
                const description = region.getAttribute("data-description") || (loc && loc.description) || "No description available.";
                title.textContent = name;
                if (loc && LEVELS[loc.level]) {
                    const levelLabel = LEVELS[loc.level].label;
                    body.innerHTML =
                        `<div>${description}</div>` +
                        `<div><strong>Electrification:</strong> ${levelLabel}</div>`;
                } else {
                    body.textContent = description;
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

        initInteractiveMaps().then(function () {
            applyBranch(currentBranch);
        });

        if (branchSelect) {
            branchSelect.addEventListener("change", function () {
                applyBranch(branchSelect.value);
            });
        }
    }

    if (!mapElement) {
        initSvgOverlayMap();
    }
});

