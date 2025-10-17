/**
 * CVRP Heuristics: Clarke–Wright Savings + 2-opt per route
 *
 * Data model
 * - depot: { id?:string, x:number, y:number }
 * - depots?: Array<depot>
 * - customers: Array<{ id:number|string, x:number, y:number, demand:number, earliest?:number, latest?:number, serviceTime?:number }>
 * - capacity: number
 */

// Geometry
function euclideanDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
}

function buildDistanceMatrix(depot, customers) {
    const n = customers.length;
    const nodes = [depot, ...customers];
    const dist = Array.from({ length: n + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= n; i++) {
        for (let j = i + 1; j <= n; j++) {
            const d = euclideanDistance(nodes[i], nodes[j]);
            dist[i][j] = d;
            dist[j][i] = d;
        }
    }
    return dist;
}

// Clarke–Wright Savings
function clarkeWright(depot, customers, capacity, distanceMatrix) {
    const n = customers.length;
    const indexOf = new Map(); // customer id -> position in customers array (1..n)
    for (let i = 0; i < n; i++) indexOf.set(String(customers[i].id), i + 1);

    // Initial routes: each customer alone [0, i, 0]
    /** @type {Array<{stops:number[], load:number}>} */
    const routes = customers.map((c, idx) => ({
        stops: [0, idx + 1, 0],
        load: c.demand
    }));

    // Savings list
    const savings = [];
    for (let i = 1; i <= n; i++) {
        for (let j = i + 1; j <= n; j++) {
            const s = distanceMatrix[0][i] + distanceMatrix[0][j] - distanceMatrix[i][j];
            savings.push({ i, j, s });
        }
    }
    savings.sort((a, b) => b.s - a.s);

    // Helper to find route index containing a customer at non-depot end
    function findRouteAndEnd(customerIdx) {
        for (let r = 0; r < routes.length; r++) {
            const stops = routes[r].stops;
            if (stops[1] === customerIdx) return { r, end: 'start' };
            if (stops[stops.length - 2] === customerIdx) return { r, end: 'end' };
        }
        return null;
    }

    for (const { i, j } of savings) {
        const left = findRouteAndEnd(i);
        const right = findRouteAndEnd(j);
        if (!left || !right) continue;
        if (left.r === right.r) continue; // already in same route

        const r1 = routes[left.r];
        const r2 = routes[right.r];
        const combinedLoad = r1.load + r2.load;
        if (combinedLoad > capacity) continue;

        // Merge rules: connect open ends without creating inner depot
        let newStops = null;
        if (left.end === 'start' && right.end === 'end') {
            // r2 ... j - 0 and 0 - i ... r1 => r2(without tail 0) + r1(without head 0)
            newStops = r2.stops.slice(0, -1).concat(r1.stops.slice(1));
        } else if (left.end === 'end' && right.end === 'start') {
            newStops = r1.stops.slice(0, -1).concat(r2.stops.slice(1));
        } else if (left.end === 'start' && right.end === 'start') {
            // reverse r2 body to align
            const r2Body = r2.stops.slice(1, -1).reverse();
            newStops = r2.stops.slice(0, 1).concat(r2Body, r1.stops.slice(1));
        } else if (left.end === 'end' && right.end === 'end') {
            const r2Body = r2.stops.slice(1, -1).reverse();
            newStops = r1.stops.slice(0, -1).concat(r2Body, r2.stops.slice(-1));
        }

        if (!newStops) continue;

        // Validate new route has single depot at ends
        if (newStops[0] !== 0 || newStops[newStops.length - 1] !== 0) continue;

        // Commit merge
        routes[left.r] = { stops: newStops, load: combinedLoad };
        routes.splice(right.r, 1);
    }

    return routes;
}

// 2-opt for a single route (excluding depot indices 0 at both ends)
function twoOptRoute(stops, distanceMatrix) {
    const n = stops.length;
    if (n <= 4) return stops; // nothing to optimize
    let improved = true;
    while (improved) {
        improved = false;
        for (let i = 1; i < n - 2; i++) {
            for (let k = i + 1; k < n - 1; k++) {
                const a = stops[i - 1];
                const b = stops[i];
                const c = stops[k];
                const d = stops[k + 1];
                const before = distanceMatrix[a][b] + distanceMatrix[c][d];
                const after = distanceMatrix[a][c] + distanceMatrix[b][d];
                if (after + 1e-9 < before) {
                    const newStops = stops.slice(0, i).concat(stops.slice(i, k + 1).reverse(), stops.slice(k + 1));
                    stops = newStops;
                    improved = true;
                }
            }
        }
    }
    return stops;
}

function totalDistanceOfRoute(stops, distanceMatrix) {
    let sum = 0;
    for (let i = 0; i < stops.length - 1; i++) sum += distanceMatrix[stops[i]][stops[i + 1]];
    return sum;
}

function indexToNode(idx, depot, customers) {
    return idx === 0 ? depot : customers[idx - 1];
}

// Compute schedule with time windows, return { feasible, arrivalTimes, violationIndex }
function computeSchedule(stops, depot, customers, distanceMatrix) {
    const timeWindows = new Map();
    const serviceTimes = new Map();
    // Depot window is wide open
    timeWindows.set(0, { earliest: 0, latest: Number.POSITIVE_INFINITY });
    serviceTimes.set(0, 0);
    for (let i = 0; i < customers.length; i++) {
        const c = customers[i];
        const idx = i + 1;
        timeWindows.set(idx, { earliest: c.earliest ?? 0, latest: c.latest ?? Number.POSITIVE_INFINITY });
        serviceTimes.set(idx, c.serviceTime ?? 0);
    }
    const arrivals = Array(stops.length).fill(0);
    let t = 0;
    for (let s = 1; s < stops.length; s++) {
        const prev = stops[s - 1];
        const curr = stops[s];
        t += distanceMatrix[prev][curr];
        const tw = timeWindows.get(curr);
        const service = serviceTimes.get(curr) || 0;
        if (t < tw.earliest) t = tw.earliest; // wait until window opens
        arrivals[s] = t;
        if (t > tw.latest + 1e-9) return { feasible: false, arrivalTimes: arrivals, violationIndex: s };
        t += service; // perform service
    }
    return { feasible: true, arrivalTimes: arrivals, violationIndex: -1 };
}

/**
 * Solve CVRP with Clarke–Wright + 2-opt, plus simple TW splitting.
 */
function solveCVRP(input) {
    const { depot, depots, customers, capacity, maxRouteStops, distanceMatrixProvider } = input;
    const depotsList = Array.isArray(depots) && depots.length > 0 ? depots : (depot ? [depot] : []);
    if (depotsList.length === 0 || !Array.isArray(customers) || customers.length === 0) {
        throw new Error('Invalid input: missing depots or customers');
    }
    if (typeof capacity !== 'number' || capacity <= 0) {
        throw new Error('Invalid capacity');
    }

    // Assign customers to nearest depot
    const depotToCustomers = new Map();
    depotsList.forEach(d => depotToCustomers.set(d, []));
    for (const c of customers) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < depotsList.length; i++) {
            const d = euclideanDistance(depotsList[i], c);
            if (d < bestD) { bestD = d; best = i; }
        }
        depotToCustomers.get(depotsList[best]).push(c);
    }

    /** @type {Array<{stops:number[], load:number, cost:number, depot:any, customers:any[]}>} */
    const allRoutes = [];
    let grandTotal = 0;

    for (const d of depotsList) {
        const custs = depotToCustomers.get(d) || [];
        if (custs.length === 0) continue;
        const dist = typeof distanceMatrixProvider === 'function' ? distanceMatrixProvider(d, custs) : buildDistanceMatrix(d, custs);
        let routes = clarkeWright(d, custs, capacity, dist);

        // Optional: maxRouteStops split
        if (typeof maxRouteStops === 'number' && maxRouteStops > 0) {
            const splitRoutes = [];
            for (const r of routes) {
                if (r.stops.length - 2 <= maxRouteStops) {
                    splitRoutes.push(r);
                } else {
                    let body = r.stops.slice(1, -1);
                    while (body.length) {
                        const chunk = body.splice(0, maxRouteStops);
                        const load = chunk.reduce((s, idx) => s + custs[idx - 1].demand, 0);
                        splitRoutes.push({ stops: [0, ...chunk, 0], load });
                    }
                }
            }
            routes = splitRoutes;
        }

        // 2-opt per route
        routes = routes.map(r => ({ load: r.load, stops: twoOptRoute(r.stops.slice(), dist) }));

        // Enforce time windows by splitting at first violation
        const feasibleRoutes = [];
        for (const r of routes) {
            let queue = [r.stops];
            while (queue.length) {
                const curr = queue.shift();
                const sched = computeSchedule(curr, d, custs, dist);
                if (sched.feasible) {
                    const cost = totalDistanceOfRoute(curr, dist);
                    feasibleRoutes.push({ stops: curr, load: curr.slice(1, -1).reduce((s, idx) => s + custs[idx - 1].demand, 0), cost });
                } else {
                    // Split at violation index into two routes
                    const v = sched.violationIndex;
                    const left = curr.slice(0, v).concat([0]);
                    const right = [0].concat(curr.slice(v, curr.length));
                    if (left.length > 2) queue.push(left);
                    if (right.length > 2) queue.push(right);
                }
            }
        }

        // Accumulate
        for (const fr of feasibleRoutes) {
            allRoutes.push({ ...fr, depot: d, customers: custs });
            grandTotal += fr.cost;
        }
    }

    return { routes: allRoutes, totalCost: grandTotal };
}

// Export to window for app.js
window.CVRP = {
    solveCVRP,
    buildDistanceMatrix,
    euclideanDistance,
    indexToNode,
    totalDistanceOfRoute
};


