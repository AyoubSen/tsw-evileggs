# External Map Authoring

Paint authoritative terrain as an exact-color, non-interlaced 8-bit RGB or RGBA PNG. One image pixel represents one terrain cell; `cellSize: 2` produces the current two-world-pixels-per-cell resolution.

## Palette

| Color     | Material | Behavior                    |
| --------- | -------- | --------------------------- |
| `#000000` | Empty    | No collision                |
| `#8A5A3B` | Soil     | Solid and destructible      |
| `#B5523B` | Brick    | Solid and destructible      |
| `#7A7770` | Stone    | Solid and indestructible    |
| `#344951` | Steel    | Solid and indestructible    |

Transparent pixels are also empty. Disable antialiasing, color correction, indexed palettes, and gradients in the collision mask. Unknown colors are rejected with their exact coordinates.

Create a metadata JSON file using `map.metadata.example.json`, then compile the source:

```sh
pnpm map:compile maps-src/my-map.png maps-src/my-map.json maps-src/my-map.map.json
```

The generated map document is deterministic data shared by browser and server. Add an approved document to the map registry before shipping it. Keep decorative artwork separate from the collision mask. Do not add scripts, URLs, or executable behavior to map metadata.

Reflector walls are authored in world coordinates and snap to the terrain grid. Add them to the metadata `objects` array with a stable lowercase slug ID, `type: "reflector-wall"`, `start` and `end` vectors, `thickness`, and `velocityRetention` from `0.1` through `1`. Maps may contain at most 32 validated objects; use `objects: []` when none are needed.

List spawns in canonical seat order: `A1, B1, A2, B2, A3, B3`, stopping after the seats required by the mode. Team A uses `teamId: 0`, team B uses `teamId: 1`, and each team's `teamSlot` starts at `0`. A 3v3 map therefore requires all six entries in that exact order; documents with reordered seats or unknown modes are rejected.
