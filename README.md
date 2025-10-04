# Voronoi Maze Generator

A modern single-page Voronoi maze generator that uses D3's Delaunay/Voronoi utilities to create organic-looking tilings and then carves a perfect maze via Kruskal's algorithm.

## Features

- Adjustable maze structure (cell count, canvas size, Lloyd relaxation, passage width)
- Deterministic generation via optional random seed input
- Rich styling controls for cell outlines, fills, markers, and background colors
- Animated breadth-first search solver with smooth spline rendering
- Responsive layout with debounced UI updates and device-pixel-aware canvas drawing

## Getting Started

1. Open `index.html` in any modern browser.
2. Tune the controls in the left panel and click **Generate New Maze** to rebuild the maze.
3. Optionally enter a seed value to reproduce a maze deterministically.
4. Click **Solve Maze** to animate the path from the automatically selected start/end points.

No build step is required—the project is entirely static.

## Project Structure

```
index.html        # Application markup and control layout
styles/main.css   # Visual styling for the page and controls
scripts/main.js   # Maze generation, solving, and drawing logic
```

## Attribution

Voronoi diagram computations are powered by [D3.js](https://d3js.org/).
