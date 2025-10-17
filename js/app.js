(function () {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const metricsEl = document.getElementById('metrics');
    const routesEl = document.getElementById('routes');
    const legendEl = document.getElementById('legend');

    const capacityEl = document.getElementById('vehicleCapacity');
    const maxRouteStopsEl = document.getElementById('maxRouteStops');
    const useLeafletEl = document.getElementById('useLeaflet');
    const distanceSourceEl = document.getElementById('distanceSource');
    const runBtn = document.getElementById('runBtn');
    const clearBtn = document.getElementById('clearBtn');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const fileInput = document.getElementById('fileInput');
    const loadSampleBtn = document.getElementById('loadSampleBtn');
    const loadTwSampleBtn = document.getElementById('loadTwSampleBtn');
    const jsonInput = document.getElementById('jsonInput');
    const useJsonBtn = document.getElementById('useJsonBtn');
    const csvInput = document.getElementById('csvInput');
    const useCsvBtn = document.getElementById('useCsvBtn');
    const rapidKeyEl = document.getElementById('rapidApiKey');
    const geocodeJsonBtn = document.getElementById('geocodeJsonBtn');

    let data = {
        depot: { x: 0, y: 0 },
        depots: undefined,
        customers: [],
        capacity: 100
    };

    // Visualization sizing helper
    function computeBounds(depot, customers) {
        const pts = [depot, ...customers];
        const xs = pts.map(p => p.x);
        const ys = pts.map(p => p.y);
        let minX = Math.min(...xs), maxX = Math.max(...xs);
        let minY = Math.min(...ys), maxY = Math.max(...ys);
        const spanX = maxX - minX || 1;
        const spanY = maxY - minY || 1;
        const span = Math.max(spanX, spanY);
        const pad = Math.max(span * 0.08, 0.0005); // 8% padding, with a tiny floor for lat/lng
        return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
    }

    function makeProjector(bounds) {
        const { minX, maxX, minY, maxY } = bounds;
        const w = canvas.width, h = canvas.height;
        const scaleX = w / (maxX - minX || 1);
        const scaleY = h / (maxY - minY || 1);
        const scale = Math.min(scaleX, scaleY);
        const offX = (w - (maxX - minX) * scale) / 2;
        const offY = (h - (maxY - minY) * scale) / 2;
        return (pt) => ({
            x: (pt.x - minX) * scale + offX,
            y: h - ((pt.y - minY) * scale + offY)
        });
    }

    function clearCanvas() {
        ctx.fillStyle = '#0b0e19';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawPoint(p, color, r) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawLabel(p, text, color) {
        ctx.fillStyle = color || '#e5e7ef';
        ctx.font = '12px ui-monospace, Consolas, monospace';
        ctx.fillText(text, p.x + 5, p.y - 5);
    }

    function drawLine(a, b, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width || 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }

    function randomPalette(n) {
        const hues = [];
        const golden = 0.61803398875;
        let h = Math.random();
        for (let i = 0; i < n; i++) {
            h += golden; h %= 1;
            const s = 60 + Math.random() * 20; // 60-80%
            const l = 45 + Math.random() * 20; // 45-65%
            hues.push(`hsl(${Math.floor(h * 360)} ${s}% ${l}%)`);
        }
        return hues;
    }

    function renderSolution({ routes, totalCost }) {
        routesEl.innerHTML = '';
        legendEl.innerHTML = '';
        const colors = randomPalette(routes.length);

        const mapEl = document.getElementById('map');
        const useMap = !!useLeafletEl.checked;
        if (useMap) {
            mapEl.classList.remove('hidden');
            document.getElementById('canvas').classList.add('hidden');
            // Initialize map
            mapEl._leaflet_id && mapEl._leaflet_id !== null && (mapEl.innerHTML = '');
            const allPts = [];
            const allCustomers = new Map();
            // If depots array exists, include them; else single depot
            const depots = data.depots && data.depots.length ? data.depots : [data.depot];
            depots.forEach(d => allPts.push([d.y, d.x]));
            data.customers.forEach(c => { allPts.push([c.y, c.x]); allCustomers.set(c.id, c); });
            const center = allPts[0] || [0,0];
            const map = L.map('map').setView(center, 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);

            // Fit bounds
            if (allPts.length > 1) {
                const bounds = L.latLngBounds(allPts);
                map.fitBounds(bounds.pad(0.2));
            }

            // Draw depots
            depots.forEach((d, i) => {
                L.circleMarker([d.y, d.x], { radius: 6, color: '#2ecc71' }).addTo(map).bindTooltip(`Depot ${d.id || i+1}`);
            });

            // Draw customers
            data.customers.forEach(c => {
                const label = `${c.id} (${c.demand}${c.earliest!=null?`, [${c.earliest},${c.latest}]`:''})`;
                L.circleMarker([c.y, c.x], { radius: 4, color: '#6ea8fe' }).addTo(map).bindTooltip(label);
            });

            // Draw routes
            routes.forEach((route, idx) => {
                const color = colors[idx];
                const dep = route.depot || (data.depots && data.depots.length ? data.depots[0] : data.depot);
                const latlngs = route.stops.map(i => {
                    const node = CVRP.indexToNode(i, dep, route.customers || data.customers);
                    return [node.y, node.x];
                });
                L.polyline(latlngs, { color }).addTo(map);
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.innerHTML = `<span class="swatch" style="background:${color}"></span>R${idx + 1}`;
                legendEl.appendChild(tag);

                const card = document.createElement('div');
                card.className = 'route-card';
                const seq = route.stops.slice(1, -1).map(i => (route.customers || data.customers)[i - 1].id).join(' → ');
                card.innerHTML = `
                    <div><strong>Route ${idx + 1}</strong>${route.depot?` <span class="meta">Depot: ${route.depot.id||''}</span>`:''}</div>
                    <div>Sequence: [ ${seq} ]</div>
                    <div class="meta">Load: ${route.load.toFixed(2)} | Cost: ${route.cost.toFixed(2)}</div>
                `;
                routesEl.appendChild(card);
            });
        } else {
            // Canvas mode
            mapEl.classList.add('hidden');
            const canvas = document.getElementById('canvas');
            canvas.classList.remove('hidden');
            const depots = data.depots && data.depots.length ? data.depots : [data.depot];
            // Compute bounds over depots + customers for proper scaling
            const allPts = [...depots, ...data.customers];
            const xs = allPts.map(p => p.x);
            const ys = allPts.map(p => p.y);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const spanX = maxX - minX || 1;
            const spanY = maxY - minY || 1;
            const span = Math.max(spanX, spanY);
            const pad = Math.max(span * 0.08, 0.0005);
            const boundsForProject = { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
            const project = makeProjector(boundsForProject);
            clearCanvas();
            depots.forEach((d, i) => {
                const p = project(d);
                drawPoint(p, '#72e0a8', 6);
                drawLabel(p, `Depot ${d.id || i+1}`, '#72e0a8');
            });
            const custPts = data.customers.map(c => project(c));
            for (let i = 0; i < custPts.length; i++) {
                const c = data.customers[i];
                drawPoint(custPts[i], '#6ea8fe', 4);
                const tw = (c.earliest!=null && c.latest!=null) ? ` [${c.earliest},${c.latest}]` : '';
                drawLabel(custPts[i], `${c.id} (${c.demand})${tw}`, '#9aa1b2');
            }
            routes.forEach((route, idx) => {
                const color = colors[idx];
                const dep = route.depot || (data.depots && data.depots.length ? data.depots[0] : data.depot);
                const stops = route.stops.map(i => CVRP.indexToNode(i, dep, route.customers || data.customers)).map(project);
                for (let i = 0; i < stops.length - 1; i++) drawLine(stops[i], stops[i + 1], color, 2);
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.innerHTML = `<span class="swatch" style="background:${color}"></span>R${idx + 1}`;
                legendEl.appendChild(tag);
                const card = document.createElement('div');
                card.className = 'route-card';
                const seq = route.stops.slice(1, -1).map(i => (route.customers || data.customers)[i - 1].id).join(' → ');
                card.innerHTML = `
                    <div><strong>Route ${idx + 1}</strong>${route.depot?` <span class=\"meta\">Depot: ${route.depot.id||''}</span>`:''}</div>
                    <div>Sequence: [ ${seq} ]</div>
                    <div class="meta">Load: ${route.load.toFixed(2)} | Cost: ${route.cost.toFixed(2)}</div>
                `;
                routesEl.appendChild(card);
            });
        }

        metricsEl.innerHTML = `
            <div><strong>Total distance</strong>: ${totalCost.toFixed(2)}</div>
            <div><strong>Vehicles</strong>: ${routes.length}</div>
            <div><strong>Customers</strong>: ${data.customers.length}</div>
        `;
    }

    async function buildDistanceMatrixExternal(depot, customers) {
        const key = (rapidKeyEl.value || '').trim();
        if (!key) throw new Error('RapidAPI key required');
        const nodes = [depot, ...customers];
        const n = nodes.length;
        const dist = Array.from({ length: n }, () => Array(n).fill(0));
        async function fetchDistance(a, b) {
            const payload = {
                StartLocation: { LatLong: { Latitude: a.y, Longitude: a.x } },
                FinishLocation: { LatLong: { Latitude: b.y, Longitude: b.x } },
                DistanceUnit: 0
            };
            const res = await fetch('https://rdrunnerxx-trackservice.p.rapidapi.com/distance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-rapidapi-key': key,
                    'x-rapidapi-host': 'rdrunnerxx-trackservice.p.rapidapi.com'
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Distance API error');
            const j = await res.json();
            const d = (j && (j.Distance || j.distance || j.Result || j.result)) ?? null;
            return typeof d === 'number' ? d : Math.hypot(a.x - b.x, a.y - b.y);
        }
        const tasks = [];
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                tasks.push((async () => {
                    const d = await fetchDistance(nodes[i], nodes[j]);
                    dist[i][j] = d; dist[j][i] = d;
                })());
            }
        }
        await Promise.all(tasks);
        return dist;
    }

    async function geocodeCustomersInJson() {
        const key = (rapidKeyEl.value || '').trim();
        if (!key) { alert('RapidAPI key required'); return; }
        const custs = data.customers || [];
        for (const c of custs) {
            if (typeof c.x === 'number' && typeof c.y === 'number') continue;
            const payload = { IsNeedMatchCode: false, Addresses: [
                { Street: c.street || (c.address && c.address.street) || '', City: c.city || (c.address && c.address.city) || '', State: c.state || (c.address && c.address.state) || '', PostalCode: c.postalCode || (c.address && c.address.postalCode) || '', Country: c.country || (c.address && c.address.country) || 'US' }
            ] };
            try {
                const res = await fetch('https://rdrunnerxx-trackservice.p.rapidapi.com/geocode', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-rapidapi-key': key,
                        'x-rapidapi-host': 'rdrunnerxx-trackservice.p.rapidapi.com'
                    },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error('Geocode API error');
                const j = await res.json();
                const first = (j && j.Addresses && j.Addresses[0]) || j[0] || j.Result || j.result || null;
                const lat = first && (first.Latitude || (first.LatLong && first.LatLong.Latitude));
                const lng = first && (first.Longitude || (first.LatLong && first.LatLong.Longitude));
                if (typeof lat === 'number' && typeof lng === 'number') { c.y = lat; c.x = lng; }
            } catch (e) {
                console.warn('Geocode failed for', c.id, e);
            }
        }
        runSolver();
    }

    async function runSolver() {
        try {
            const capacity = Number(capacityEl.value);
            const maxRouteStops = maxRouteStopsEl.value ? Number(maxRouteStopsEl.value) : undefined;
            const useRapid = distanceSourceEl && distanceSourceEl.value === 'rapidapi';
            const provider = useRapid ? await buildDistanceMatrixExternal : undefined;
            const { routes, totalCost } = CVRP.solveCVRP({
                depot: data.depot,
                depots: data.depots,
                customers: data.customers,
                capacity,
                maxRouteStops,
                distanceMatrixProvider: provider
            });
            renderSolution({ routes, totalCost });
        } catch (e) {
            alert(e.message || String(e));
        }
    }

    function clearAll() {
        data = { depot: { x: 0, y: 0 }, customers: [], capacity: Number(capacityEl.value) };
        routesEl.innerHTML = '';
        legendEl.innerHTML = '';
        metricsEl.innerHTML = '';
        clearCanvas();
    }

    function parseCsv(text) {
        const lines = text.trim().split(/\r?\n/);
        const header = lines[0].split(',').map(s => s.trim().toLowerCase());
        const find = (name) => header.indexOf(name);
        const idx = {
            type: find('type'), id: find('id'), x: find('x'), y: find('y'), demand: find('demand'),
            earliest: find('earliest'), latest: find('latest'), servicetime: find('servicetime')
        };
        if (idx.type < 0 || idx.id < 0 || idx.x < 0 || idx.y < 0 || idx.demand < 0) throw new Error('Headers required: type,id,x,y,demand,[earliest,latest,serviceTime]');
        const rows = lines.slice(1).filter(Boolean).map(line => line.split(',').map(s => s.trim()));
        const depots = [];
        const customers = [];
        for (const cols of rows) {
            const type = cols[idx.type];
            const rec = {
                id: cols[idx.id],
                x: Number(cols[idx.x]),
                y: Number(cols[idx.y])
            };
            if (type.toLowerCase() === 'depot') {
                depots.push(rec);
            } else {
                customers.push({
                    ...rec,
                    demand: Number(cols[idx.demand]),
                    earliest: idx.earliest>=0 && cols[idx.earliest]!=='' ? Number(cols[idx.earliest]) : undefined,
                    latest: idx.latest>=0 && cols[idx.latest]!=='' ? Number(cols[idx.latest]) : undefined,
                    serviceTime: idx.servicetime>=0 && cols[idx.servicetime]!=='' ? Number(cols[idx.servicetime]) : undefined
                });
            }
        }
        const depot = depots[0] || { x: 0, y: 0 };
        return { depot, depots, customers };
    }

    function exportJson() {
        const blob = new Blob([JSON.stringify({ depot: data.depot, customers: data.customers }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'cvrp-data.json'; a.click();
        URL.revokeObjectURL(url);
    }

    function exportCsv() {
        const rows = [ 'id,x,y,demand' ];
        rows.push(`0,${data.depot.x},${data.depot.y},0`);
        data.customers.forEach(c => rows.push(`${c.id},${c.x},${c.y},${c.demand}`));
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'cvrp-data.csv'; a.click();
        URL.revokeObjectURL(url);
    }

    // Wire events
    runBtn.addEventListener('click', runSolver);
    clearBtn.addEventListener('click', clearAll);
    exportJsonBtn.addEventListener('click', exportJson);
    exportCsvBtn.addEventListener('click', exportCsv);
    loadSampleBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('sample/sample.json');
            const sample = await res.json();
            data.depot = sample.depot; data.depots = sample.depots; data.customers = sample.customers;
            capacityEl.value = String(sample.capacity || 100);
            runSolver();
        } catch (e) {
            alert('Failed to load sample: ' + (e.message || String(e)));
        }
    });

    loadTwSampleBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('sample/sample_tw_multi.json');
            const sample = await res.json();
            data.depot = sample.depot; data.depots = sample.depots; data.customers = sample.customers;
            capacityEl.value = String(sample.capacity || 100);
            runSolver();
        } catch (e) {
            alert('Failed to load TW sample: ' + (e.message || String(e)));
        }
    });

    useJsonBtn.addEventListener('click', () => {
        try {
            const obj = JSON.parse(jsonInput.value);
            if (!obj.depot || !Array.isArray(obj.customers)) throw new Error('JSON must include depot and customers');
            data.depot = obj.depot; data.depots = obj.depots; data.customers = obj.customers;
            runSolver();
        } catch (e) {
            alert('Invalid JSON: ' + (e.message || String(e)));
        }
    });

    useCsvBtn.addEventListener('click', () => {
        try {
            const parsed = parseCsv(csvInput.value);
            data.depot = parsed.depot; data.depots = parsed.depots; data.customers = parsed.customers;
            runSolver();
        } catch (e) {
            alert('Invalid CSV: ' + (e.message || String(e)));
        }
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
            if (file.name.endsWith('.json')) {
                const obj = JSON.parse(text);
                data.depot = obj.depot; data.depots = obj.depots; data.customers = obj.customers;
                runSolver();
            } else if (file.name.endsWith('.csv')) {
                const parsed = parseCsv(text);
                data.depot = parsed.depot; data.depots = parsed.depots; data.customers = parsed.customers;
                runSolver();
            } else {
                alert('Unsupported file. Use .json or .csv');
            }
        } catch (err) {
            alert('Failed to parse file: ' + (err.message || String(err)));
        } finally {
            fileInput.value = '';
        }
    });

    geocodeJsonBtn && geocodeJsonBtn.addEventListener('click', geocodeCustomersInJson);

    // Initial paint
    clearAll();
})();


