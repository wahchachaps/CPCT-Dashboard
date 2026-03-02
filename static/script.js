document.addEventListener("DOMContentLoaded", function () {
    const shell = document.getElementById("dashboardShell");
    const sidebarToggle = document.getElementById("sidebarToggle");

    if (shell && sidebarToggle) {
        sidebarToggle.addEventListener("click", function () {
            shell.classList.toggle("menu-collapsed");
            const isCollapsed = shell.classList.contains("menu-collapsed");
            sidebarToggle.textContent = isCollapsed ? ">" : "<";
            sidebarToggle.setAttribute(
                "aria-label",
                isCollapsed ? "Expand sidebar" : "Collapse sidebar"
            );
        });
    }

    const mainContent = document.querySelector(".main-content");
    const cardsGrid = document.querySelector(".cards-grid");
    const navLinks = Array.from(document.querySelectorAll(".nav-link"));
    const sectionCards = Array.from(document.querySelectorAll(".section-card"));
    let dashboardMap = null;

    function setSectionFocusMode(sectionId) {
        if (!cardsGrid) return;
        cardsGrid.classList.toggle("map-focus", sectionId === "section-map");
        if (sectionId === "section-map" && dashboardMap) {
            setTimeout(function () {
                dashboardMap.invalidateSize();
            }, 120);
        }
    }

    function setActiveNav(sectionId) {
        navLinks.forEach(function (link) {
            const isActive = link.getAttribute("href") === `#${sectionId}`;
            link.classList.toggle("active", isActive);
        });
        setSectionFocusMode(sectionId);
    }

    navLinks.forEach(function (link) {
        link.addEventListener("click", function (event) {
            const targetId = link.getAttribute("href").replace("#", "");
            const target = document.getElementById(targetId);
            if (!target || !mainContent) return;
            event.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            setActiveNav(targetId);
        });
    });

    if (mainContent && sectionCards.length > 0) {
        const useInternalScroll = getComputedStyle(mainContent).overflowY === "auto";
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    setActiveNav(entry.target.id);
                }
            });
        }, {
            root: useInternalScroll ? mainContent : null,
            rootMargin: "-30% 0px -55% 0px",
            threshold: 0.01
        });

        sectionCards.forEach(function (section) {
            observer.observe(section);
        });
        setActiveNav(sectionCards[0].id);
    }

    const loadCanvas = document.getElementById("loadChart");
    if (loadCanvas && window.Chart) {
        new Chart(loadCanvas, {
            type: "line",
            data: {
                labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                datasets: [
                    {
                        label: "Load (MW)",
                        data: [31, 35, 33, 38, 40, 36, 34],
                        borderColor: "#0ea5e9",
                        backgroundColor: "rgba(14, 165, 233, 0.15)",
                        tension: 0.35,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                }
            }
        });
    }

    const outageCanvas = document.getElementById("outageChart");
    if (outageCanvas && window.Chart) {
        new Chart(outageCanvas, {
            type: "doughnut",
            data: {
                labels: ["Weather", "Maintenance", "Line Fault", "Unknown"],
                datasets: [
                    {
                        data: [28, 22, 34, 16],
                        backgroundColor: ["#0369a1", "#0ea5e9", "#38bdf8", "#7dd3fc"]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    const mapElement = document.getElementById("map");
    const branchSelect = document.getElementById("branchSelect");
    const statusTitle = document.getElementById("statusTitle");
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
            maxZoom: 13
        });
        dashboardMap = map;

        let geoLayer = null;
        let albayGeoJsonData = null;
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
                        if (center && center[0] > 123.75) {
                            mappedName = "Bacacay";
                        }
                        out.features.push({
                            type: "Feature",
                            properties: Object.assign({}, feature.properties, { __name_override: mappedName }),
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
            const locations = branchData[branchKey];
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

                const list = document.createElement("ul");
                list.className = "legend-items";
                grouped[level].forEach(function (loc) {
                    const item = document.createElement("li");
                    item.textContent = loc.name;
                    list.appendChild(item);
                });

                block.appendChild(title);
                block.appendChild(list);
                levelLegend.appendChild(block);
            });
        }

        function renderEditor(branchKey) {
            const locations = branchData[branchKey];
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
            const locations = branchData[branchKey];
            const branchByName = {};
            let selectedName = null;
            locations.forEach(function (loc) {
                branchByName[normalizeName(loc.name)] = loc;
            });

            if (geoLayer) {
                map.removeLayer(geoLayer);
            }

            const renderGeoJson = buildDisplayGeoJson(albayGeoJsonData);
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

                    layer.bindTooltip(displayName, {
                        sticky: true,
                        className: "aleco-label"
                    });
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
                                `<p><strong>Branch:</strong> ${branchKey}</p>` +
                                `<p><strong>Electrification:</strong> ${LEVELS[match.level].label}</p>`;
                        }
                    });
                }
            }).addTo(map);

            const branchPolygons = geoLayer.getLayers().filter(function (layer) {
                const rawName = getFeatureName(layer.feature);
                return !!branchByName[normalizeName(rawName)];
            });

            const points = [];
            branchPolygons.forEach(function (layer) {
                const b = layer.getBounds();
                points.push([b.getSouthWest().lat, b.getSouthWest().lng]);
                points.push([b.getNorthEast().lat, b.getNorthEast().lng]);
            });

            if (points.length === 0) {
                currentBounds = geoLayer.getBounds().pad(0.08);
            } else {
                currentBounds = L.latLngBounds(points).pad(0.12);
            }
            map.setMaxBounds(currentBounds);
            map.options.maxBoundsViscosity = 1.0;
            if (fitToBranch) {
                map.fitBounds(currentBounds);
            }
        }

        function renderBranch(branchKey) {
            currentBranch = branchKey;
            statusTitle.textContent = `ELECTRIFICATION STATUS : Branch ${branchKey} Level of Energization`;
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
