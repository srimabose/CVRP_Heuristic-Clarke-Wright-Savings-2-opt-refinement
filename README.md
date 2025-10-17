# CVRP Solver (Static Website) [CVRP Solver (Heuristic)](https://cvrpsolverheurestic.netlify.app)

Heuristic solver for the Capacitated Vehicle Routing Problem (CVRP): Clarke–Wright Savings with 2‑opt refinement. Includes a canvas visualization and CSV/JSON import/export.

## Quick Start

1. Open `index.html` in a modern browser (Chrome, Edge, Firefox).
2. Click "Load Sample" or import your own JSON/CSV.
3. Set vehicle capacity and optional max route stops.
4. Click "Run Solver" to see routes and metrics.

For time windows and multiple depots, click "Load TW+Multi-Depot Sample". To view on a basemap, toggle "Use Leaflet basemap".

## Data Formats

JSON:

```json
{
  "depot": { "x": 0, "y": 0 },
  "customers": [ { "id": 1, "x": 20, "y": 30, "demand": 10 } ]
}
```

JSON with multiple depots and time windows:

```json
{
  "depots": [{ "id": "D1", "x": -77.2, "y": 38.9 }],
  "capacity": 60,
  "customers": [
    { "id": 1, "x": -77.18, "y": 38.92, "demand": 10, "earliest": 0, "latest": 240, "serviceTime": 5 }
  ]
}
```

CSV (first row is depot with id=0):

```csv
type,id,x,y,demand,earliest,latest,serviceTime
depot,D1,50,50,0,0,100000,0
customer,1,20,20,10,0,600,5
customer,2,80,20,20,0,600,5
```

## Notes

- Distances are Euclidean. Coordinates are in arbitrary units.
- The heuristic is not guaranteed to be optimal but is fast and reasonable for medium sizes.
- 2‑opt is applied per route (intra‑route). Cross‑route exchanges are not implemented.
- Time windows are enforced by splitting routes at the first violation; this is a simple heuristic to recover feasibility.
- Multiple depots are supported by assigning each customer to the nearest depot, then solving per depot.

## License

MIT





