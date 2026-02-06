import React, { useEffect, useRef } from 'react';
import maplibregl, { Map, NavigationControl, ScaleControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useGameStore } from '../state/store';
import { useUiStore } from '../state/ui';
import type { BubbleType } from '../state/types';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PostProcessEffect } from '@deck.gl/core';
import { ScatterplotLayer, ArcLayer } from '@deck.gl/layers';
import { GL } from '@luma.gl/constants';
import HOSPITALS from '../assets/nyc-hospitals.json';
import { playBubble } from '../audio/sfx';
import { makeBubblesLayer } from './layers/bubbles';
import { makeHospitalsLayer } from './layers/hospitals';
import { makeFlowsLayer, makeFlowSparksLayer, makeBridgePathsLayer, makeBridgeSparksLayer } from './layers/flows';
import { routesFor } from './bridges';

const NYC_CENTER: [number, number] = [-74.006, 40.7128];
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.3, 40.45], // SW
  [-73.65, 40.95], // NE
];

function rasterFallbackStyle() {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  } as any;
}

function buildStyle() {
  const key = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
  if (key) {
    // Prefer a dark vector style for in-game visuals
    const styleName = (import.meta.env.VITE_MAP_STYLE as string | undefined) || 'dataviz-dark';
    return `https://api.maptiler.com/maps/${styleName}/style.json?key=${key}`;
  }
  // Raster fallback using OSM tiles via MapLibre style schema
  return rasterFallbackStyle();
}

export function NycMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const storeRef = useRef(returnNull as any);
  const idMapRef = useRef<Record<string, number | string>>({});
  const nameMapRef = useRef<Record<string, string>>({});
  const centroidRef = useRef<Record<string, [number, number]>>({});
  // cache of simple bounds per borough key for quick fitBounds
  const boundsRef = useRef<Record<string, [[number, number], [number, number]]>>({});
  // deck.gl overlay state
  const deckRef = useRef<MapboxOverlay | null>(null);
  const bubblesRef = useRef<Array<{ id: number; ll: [number, number]; type: 'dna'|'ops'|'cure'; amount: number; ttl: number; born: number }>>([]);
  const hoodNodesRef = useRef<any[]>([]);
  const hoodNodesByBoroRef = useRef<Record<string, any[]>>({});
  const animRef = useRef<number>(0);
  const idCounterRef = useRef<number>(1);
  const hospitalNodesRef = useRef<Array<{ id: number; boroKey: string; name: string; ll: [number, number]; capacity: number }>>([]);
  const policyDotsRef = useRef<Array<{ id: number; ll: [number, number]; damp: number }>>([]);
  const lastDeckUpdateRef = useRef<number>(0);
  const lastFlowsUpdateRef = useRef<number>(0);
  const lastPolicyUpdateRef = useRef<number>(0);
  const cameraLockRef = useRef<number>(0);
  const arcFlowsCacheRef = useRef<Array<{ source: [number,number]; target: [number,number]; daily: number; iPrev: number }>>([]);
  const bridgeFlowsCacheRef = useRef<Array<{ path: [number,number][]; daily: number; iPrev: number }>>([]);
  const effectsRef = useRef<any[]>([]);
  const uiObstaclesRef = useRef<Array<{ left: number; top: number; right: number; bottom: number }>>([]);
  const lastUiObstaclesUpdateRef = useRef<number>(0);

  function returnNull() {}

  const slug = (name: string): string => name.toLowerCase().replace(/\s+/g, '_');

  useEffect(() => {
    if (!ref.current) return;
    const style = buildStyle();
    const fallback = rasterFallbackStyle();
      const map = new maplibregl.Map({
        container: ref.current,
        style,
        center: NYC_CENTER,
        zoom: 11.5,
        pitch: 38,
        bearing: -15,
        minZoom: 9.5,
        maxZoom: 17,
        maxBounds: NYC_BOUNDS as any,
        renderWorldCopies: false,
        hash: false,
      });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new ScaleControl({ unit: 'imperial' }), 'bottom-left');
    // expose reset view for UI button
    (window as any).resetNYCView = () => {
      try { map.fitBounds(NYC_BOUNDS as any, { padding: 24, duration: 600 }); } catch {}
    };

    map.once('load', () => {
      // If vector style, try to add subtle 3D buildings if missing
      if (typeof style === 'string') {
        const styleObj = map.getStyle();
        const hasExtrusion = styleObj.layers?.some(l => l.type === 'fill-extrusion');
        const hasVectorBuilding = styleObj.layers?.some(l => l.id.includes('building'));
        // Try to add a subtle extrusion from vector tiles if available
        if (!hasExtrusion) {
          try {
            // Common MapTiler source id is 'openmaptiles' and source-layer 'building'
            map.addLayer({
              id: '3d-buildings',
              type: 'fill-extrusion',
              source: 'openmaptiles',
              'source-layer': 'building',
              minzoom: 14,
              paint: {
                'fill-extrusion-color': '#334155',
                'fill-extrusion-opacity': 0.25,
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 20],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0]
              }
            } as any, styleObj.layers?.[styleObj.layers.length-1]?.id);
          } catch {}
        }
      }
      // Expose map globally for minimap sync and utilities
      try { (window as any).nycMap = map; } catch {}
      // Constrain and fit to NYC bounds
      map.setMaxBounds(NYC_BOUNDS as any);
      map.fitBounds(NYC_BOUNDS as any, { padding: 24, duration: 0 });
      // Lock rotation to avoid disorientation
      // Keep user rotation disabled to avoid disorientation; we animate bearing programmatically
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      const lockNow = () => { cameraLockRef.current = performance.now(); };
      map.on('movestart', lockNow);
      map.on('dragstart', lockNow);
      map.on('zoomstart', lockNow);
      map.on('rotatestart', lockNow);

      // Add borough polygons from a public GeoJSON
      const boroughUrl = 'https://raw.githubusercontent.com/dwillis/nyc-maps/master/boroughs.geojson';
      // Use promoteId to make feature-state updates reliable
      map.addSource('boroughs', { type: 'geojson', data: boroughUrl, promoteId: 'BoroCode' });

      // Build a dimming mask for everything outside NYC, and precompute feature id map
      fetch(boroughUrl).then(r => r.json()).then((data) => {
        try {
          // Map store keys -> feature ids (BoroCode)
          const newMap: Record<string, number | string> = {};
          for (const f of data.features || []) {
            const id = f.properties?.BoroCode;
            const boro = f.properties && (f.properties.BoroName || f.properties.borough || f.properties.name);
            if (boro && id != null) {
              const s = slug(String(boro));
              newMap[s] = id as any;
              nameMapRef.current[s] = String(boro);
              // approximate centroid from polygon vertices
              const geom = f.geometry;
              const avg = (pts: [number, number][]) => {
                let sx = 0, sy = 0; for (const p of pts) { sx += p[0]; sy += p[1]; }
                const n = Math.max(1, pts.length);
                return [sx / n, sy / n] as [number, number];
              };
              let c: [number, number] = NYC_CENTER;
              if (geom?.type === 'Polygon' && geom.coordinates?.[0]) c = avg(geom.coordinates[0] as any);
              else if (geom?.type === 'MultiPolygon' && geom.coordinates?.[0]?.[0]) c = avg(geom.coordinates[0][0] as any);
              centroidRef.current[s] = c;

              // compute simple lon/lat bounds for the feature to support fit-to-bounds zooming
              const extent = (g: any): [[number, number], [number, number]] | null => {
                try {
                  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                  const visit = (arr: any) => {
                    for (const v of arr) {
                      if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number') {
                        const x = v[0] as number, y = v[1] as number;
                        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
                      } else if (Array.isArray(v)) {
                        visit(v);
                      }
                    }
                  };
                  if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') visit(g.coordinates);
                  if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
                    return [[minX, minY], [maxX, maxY]];
                  }
                } catch {}
                return null;
              };
              const b = extent(geom);
              if (b) boundsRef.current[s] = b;
            }
          }
          idMapRef.current = newMap;

          const outer: [number, number][] = [
            [-180, -85], [-180, 85], [180, 85], [180, -85], [-180, -85]
          ];
          const holes: [number, number][][] = [];
          for (const f of data.features || []) {
            const geom = f.geometry;
            if (!geom) continue;
            if (geom.type === 'MultiPolygon') {
              for (const poly of geom.coordinates) {
                if (poly && poly[0]) holes.push(poly[0]);
              }
            } else if (geom.type === 'Polygon') {
              if (geom.coordinates && geom.coordinates[0]) holes.push(geom.coordinates[0]);
            }
          }
          const mask = {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [outer, ...holes] },
              }
            ],
          } as any;
          map.addSource('nyc-mask', { type: 'geojson', data: mask });
          const dimLayer = {
            id: 'nyc-dim',
            type: 'fill' as const,
            source: 'nyc-mask',
            paint: {
              'fill-color': '#0b0f14',
              'fill-opacity': 0.55,
            }
          };
          const before = map.getLayer('borough-fills') ? 'borough-fills' : undefined;
          // Insert below the choropleth if available so red overlay stays visible
          // @ts-ignore maplibre types allow beforeId as 2nd param
          map.addLayer(dimLayer as any, before as any);

          // Initial paint with current store values
          applyInfectionToMap();
          applySelectionToMap();
        } catch {}
      }).catch(() => {});

      // Neighborhood nodes (centroids) layer for zoomed-in detail
      const neighborhoodsUrlCandidates = [
        'https://raw.githubusercontent.com/dwillis/nyc-maps/master/nta2010.geojson',
        'https://raw.githubusercontent.com/dwillis/nyc-maps/master/nynta2010.geojson',
      ];
      const pickNeighborhoodUrl = async (): Promise<string|undefined> => {
        for (const u of neighborhoodsUrlCandidates) {
          try {
            const r = await fetch(u, { method: 'HEAD' });
            if (r.ok) return u;
          } catch {}
        }
        return undefined;
      };
      (async () => {
        try {
          const url = await pickNeighborhoodUrl();
          if (!url) return;
          const data = await fetch(url).then(r => r.json());
          const pts: any[] = [];
          const byBoro: Record<string, any[]> = {};
          const centroidOf = (geom: any): [number, number] | null => {
            try {
              if (!geom) return null;
              const avg = (arr: [number, number][]) => {
                let sx = 0, sy = 0; const n = arr.length || 1; for (const p of arr) { sx += p[0]; sy += p[1]; }
                return [sx / n, sy / n] as [number, number];
              };
              if (geom.type === 'Polygon') {
                const ring = geom.coordinates?.[0];
                if (Array.isArray(ring) && ring.length) return avg(ring as any);
              } else if (geom.type === 'MultiPolygon') {
                const ring = geom.coordinates?.[0]?.[0];
                if (Array.isArray(ring) && ring.length) return avg(ring as any);
              }
            } catch {}
            return null;
          };
          for (const f of data.features || []) {
            const p = f.properties || {};
            const boroRaw = p.BoroName || p.borough || p.boro || p.BORO || p.BORONAME || p.boroname || p.BORONM || '';
            const boro = String(boroRaw || '').trim();
            const hood = p.NTAName || p.neighborhood || p.NEIGHBORHO || p.NTAName || p.NTA || p.name || '';
            const c = centroidOf(f.geometry);
            if (!c) continue;
            const feature = { type: 'Feature', properties: { boro, name: String(hood || '').trim() }, geometry: { type: 'Point', coordinates: c } };
            pts.push(feature);
            const key = slug(boro);
            if (!byBoro[key]) byBoro[key] = [];
            byBoro[key].push(feature);
          }
          hoodNodesRef.current = pts;
          hoodNodesByBoroRef.current = byBoro;
          map.addSource('hood-nodes', { type: 'geojson', data: { type: 'FeatureCollection', features: pts } as any });
          map.addLayer({
            id: 'hood-nodes',
            type: 'circle',
            source: 'hood-nodes',
            minzoom: 12.3,
            paint: {
              'circle-radius': 4.0,
              'circle-color': '#f59e0b',
              'circle-stroke-color': '#111827',
              'circle-stroke-width': 1.2,
              'circle-opacity': 0.9,
            }
          });
          map.addLayer({
            id: 'hood-labels',
            type: 'symbol',
            source: 'hood-nodes',
            minzoom: 13.5,
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 11,
              'text-offset': [0, 1.0],
              'text-anchor': 'top',
            },
            paint: {
              'text-color': '#e5e7eb',
              'text-halo-color': '#0b0f14',
              'text-halo-width': 1.2,
            }
          });
          // hover popup for hoods
          const hoodPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
          map.on('mousemove', 'hood-nodes', (e: any) => {
            const f = e.features?.[0];
            if (!f) { hoodPopup.remove(); return; }
            (map.getCanvas() as HTMLCanvasElement).style.cursor = 'pointer';
            const name = f.properties?.name || '';
            hoodPopup.setLngLat(e.lngLat).setHTML(`<div style="font: 12px system-ui;">${name}</div>`).addTo(map);
          });
          map.on('mouseleave', 'hood-nodes', () => { (map.getCanvas() as HTMLCanvasElement).style.cursor = ''; hoodPopup.remove(); });

          // Build hospital nodes: prefer real locations from asset, fallback to synthetic centroids
          const st = useGameStore.getState();
          const capPerPerson = (st.params.hospCapacityPerK / 1000);
          const byBoroHosp: Record<string, any[]> = {};
          const assetHospitals = (HOSPITALS as any[]).filter(h => h && h.boroKey && Array.isArray(h.ll) && h.ll.length === 2);
          for (const h of assetHospitals) {
            const key = String(h.boroKey);
            if (!byBoroHosp[key]) byBoroHosp[key] = [];
            byBoroHosp[key].push(h);
          }
          const hospitals: Array<{ id: number; boroKey: string; name: string; ll: [number, number]; capacity: number; beds?: number }> = [];
          for (const boroKey of Object.keys(st.countries)) {
            const totalCapBoro = capPerPerson * st.countries[boroKey].pop;
            const list = byBoroHosp[boroKey];
            if (list && list.length) {
              const totalBeds = list.reduce((s, h: any) => s + (Number(h.beds) || 1), 0) || list.length;
              for (const h of list) {
                const weight = (Number(h.beds) || 1) / totalBeds;
                const capacity = totalCapBoro * weight;
                hospitals.push({ id: idCounterRef.current++, boroKey, name: String(h.name), ll: h.ll as [number, number], capacity, beds: Number(h.beds) || undefined });
              }
            } else {
              // Fallback: place a few synthetic facilities using neighborhood nodes/centroids
              const boroName = nameMapRef.current[boroKey] || boroKey;
              const nodes = byBoro[boroKey] || [];
              const count = Math.max(2, Math.min(5, Math.floor((st.countries[boroKey].pop / 400_000))));
              for (let i=0;i<count;i++) {
                let ll = centroidRef.current[boroKey] || NYC_CENTER;
                if (nodes.length) {
                  const pick = nodes[(i * 7) % nodes.length];
                  const coords = pick?.geometry?.coordinates;
                  if (Array.isArray(coords) && coords.length >= 2) ll = coords as [number, number];
                }
                const capacity = totalCapBoro / count;
                hospitals.push({ id: idCounterRef.current++, boroKey, name: `${boroName} Hospital ${i+1}`, ll, capacity });
              }
            }
          }
          hospitalNodesRef.current = hospitals;
          // seed policy dots from hood nodes; damp value will be updated in render loop
          const dots = pts.map((f, idx) => ({ id: idx + 1, ll: f.geometry.coordinates as [number, number], damp: 0 }));
          policyDotsRef.current = dots;
        } catch {}
      })();

      // Ensure hospitals are available even if neighborhood fetch fails
      (async () => {
        try {
          if (hospitalNodesRef.current.length) return;
          const st = useGameStore.getState();
          const capPerPerson = (st.params.hospCapacityPerK / 1000);
          const byBoroHosp: Record<string, any[]> = {};
          const assetHospitals = (HOSPITALS as any[]).filter(h => h && h.boroKey && Array.isArray(h.ll) && h.ll.length === 2);
          for (const h of assetHospitals) {
            const key = String(h.boroKey);
            if (!byBoroHosp[key]) byBoroHosp[key] = [];
            byBoroHosp[key].push(h);
          }
          const hospitals: Array<{ id: number; boroKey: string; name: string; ll: [number, number]; capacity: number; beds?: number }> = [];
          for (const boroKey of Object.keys(st.countries)) {
            const totalCapBoro = capPerPerson * st.countries[boroKey].pop;
            const list = byBoroHosp[boroKey] || [];
            if (list.length) {
              const totalBeds = list.reduce((s, h: any) => s + (Number(h.beds) || 1), 0) || list.length;
              for (const h of list) {
                const weight = (Number(h.beds) || 1) / totalBeds;
                const capacity = totalCapBoro * weight;
                hospitals.push({ id: idCounterRef.current++, boroKey, name: String(h.name), ll: h.ll as [number, number], capacity, beds: Number(h.beds) || undefined });
              }
            } else {
              const boroName = nameMapRef.current[boroKey] || boroKey;
              let ll = centroidRef.current[boroKey] || NYC_CENTER;
              const capacity = totalCapBoro;
              hospitals.push({ id: idCounterRef.current++, boroKey, name: `${boroName} Hospital`, ll, capacity });
            }
          }
          hospitalNodesRef.current = hospitals;
        } catch {}
      })();

      // Attempt live hospital fetch (NYC Open Data) with localStorage caching; fall back to bundled JSON
      (async () => {
        try {
          const cacheKey = 'nycHospitalsLiveV1';
          const cached = localStorage.getItem(cacheKey);
          let parsed: any[] | null = null;
          if (cached) {
            try {
              const { ts, data } = JSON.parse(cached);
              if (Date.now() - (ts || 0) < 24 * 3600 * 1000 && Array.isArray(data)) parsed = data;
            } catch {}
          }
          const useData = async () => {
            if (parsed && parsed.length) return parsed;
            // Candidate endpoints (Socrata). We try HHC facilities first; this includes public hospitals.
            const candidates = [
              'https://data.cityofnewyork.us/resource/kxmf-j285.json?$limit=500',
              'https://data.cityofnewyork.us/resource/ymhw-9cz9.json?$limit=500'
            ];
            for (const u of candidates) {
              try {
                const r = await fetch(u);
                if (!r.ok) continue;
                const rows = await r.json();
                if (!Array.isArray(rows) || rows.length === 0) continue;
                const out: any[] = [];
                for (const row of rows) {
                  const name = row.Facility_Name || row.facility_name || row.name || row.Facility || row.site_name;
                  const boro = (row.Borough || row.borough || row.boro || row.county || '').toString();
                  const lat = Number(row.latitude || row.Latitude || row.location?.latitude || row.the_geom?.coordinates?.[1]);
                  const lon = Number(row.longitude || row.Longitude || row.location?.longitude || row.the_geom?.coordinates?.[0]);
                  const type = (row.Facility_Type || row.facility_type || '').toString().toLowerCase();
                  if (!name || !boro || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                  if (type && !type.includes('hospital')) continue;
                  out.push({ name: String(name), boroKey: (boro || '').toLowerCase().replace(/\s+/g, '_'), ll: [lon, lat] as [number, number] });
                }
                if (out.length) {
                  try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: out })); } catch {}
                  return out;
                }
              } catch {}
            }
            return [];
          };
          const live = await useData();
          if (Array.isArray(live) && live.length) {
            const st = useGameStore.getState();
            const capPerPerson = (st.params.hospCapacityPerK / 1000);
            const grouped: Record<string, any[]> = {};
            for (const h of live) { const k = String(h.boroKey); if (!grouped[k]) grouped[k] = []; grouped[k].push(h); }
            const hospitals: Array<{ id: number; boroKey: string; name: string; ll: [number, number]; capacity: number; beds?: number }> = [];
            for (const boroKey of Object.keys(st.countries)) {
              const totalCapBoro = capPerPerson * st.countries[boroKey].pop;
              const list = grouped[boroKey] || [];
              const total = list.length || 1;
              for (const h of list) {
                const capacity = totalCapBoro / total;
                hospitals.push({ id: idCounterRef.current++, boroKey, name: String(h.name), ll: h.ll as [number, number], capacity });
              }
            }
            if (hospitals.length) hospitalNodesRef.current = hospitals;
          }
        } catch {}
      })();

      // Thematic fill (red) as overlay on boroughs (opacity maps to infections per capita)
      map.addLayer({
        id: 'borough-fills',
        type: 'fill',
        source: 'boroughs',
        paint: {
          'fill-color': '#ff2d2d',
          'fill-opacity': [
            'interpolate', ['linear'],
            // iRate = I / pop; show subtle signal even at very low prevalence
            ['coalesce', ['feature-state', 'iRate'], 0],
            0.0, 0.0,
            0.000001, 0.08,
            0.000005, 0.18,
            0.00001, 0.26,
            0.00005, 0.42,
            0.0002, 0.60,
            0.001, 0.82
          ],
        }
      });
      map.addLayer({
        id: 'borough-outlines',
        type: 'line',
        source: 'boroughs',
        paint: {
          'line-color': '#2a3342',
          'line-width': 1.5,
        }
      });
      map.addLayer({
        id: 'borough-selected',
        type: 'line',
        source: 'boroughs',
        paint: {
          'line-color': '#10b981',
          'line-width': 3,
        },
        filter: ['==', ['get', 'BoroName'], ''],
      });

      // We now populate id map via fetch; no sourcedata handler required

      // Click to select borough / Patient Zero placement
      map.on('click', 'borough-fills', (ev: any) => {
        const f = ev.features?.[0];
        if (!f) return;
        const boro = f.properties?.BoroName as string | undefined;
        if (boro) {
          const key = slug(boro);
          const gs = useGameStore.getState();
          if (gs.awaitingPatientZero) {
            const amt = (gs as any).patientZeroSeedAmount || 8000;
            if (gs.mode === 'architect') {
              // Seed into Exposed for a slower onset
              gs.actions.seedExposure(key, amt, `Patient Zero established in ${gs.countries[key].name}`);
            } else {
              // Controller: the click determines both outbreak origin and the initial focus.
              gs.actions.seedExposure(key, amt, `Outbreak detected in ${gs.countries[key].name}`);
              gs.actions.addEvent(`Starting focus: ${gs.countries[key].name}`);
            }
            gs.actions.selectCountry(key);
            gs.actions.setAwaitingPatientZero(false);
            // The actual "start": unpause once the player has picked.
            gs.actions.setPaused(false);
            return;
          }
          gs.actions.selectCountry(key);
          // Smoothly fit the camera to the full borough bounds so it is fully visible
          const b = boundsRef.current[key];
          if (b) {
            try {
              // avoid stacking multiple animations in quick succession
              const nowTs = performance.now();
              if (nowTs - cameraLockRef.current < 180) map.stop();
              cameraLockRef.current = nowTs;
              map.fitBounds(b as any, { padding: 56, duration: 700, maxZoom: 14.5, linear: false } as any);
            } catch {
              const c = centroidRef.current[key] || NYC_CENTER;
              const nowTs2 = performance.now();
              if (nowTs2 - cameraLockRef.current < 180) map.stop();
              cameraLockRef.current = nowTs2;
              map.flyTo({ center: c as any, zoom: Math.max(map.getZoom(), 12.8), duration: 650, curve: 1.5, easing: (t: number) => 1 - Math.pow(1 - t, 3) } as any);
            }
          } else {
            const c = centroidRef.current[key] || NYC_CENTER;
            const nowTs3 = performance.now();
            if (nowTs3 - cameraLockRef.current < 180) map.stop();
            cameraLockRef.current = nowTs3;
            map.flyTo({ center: c as any, zoom: Math.max(map.getZoom(), 12.8), duration: 650, curve: 1.5, easing: (t: number) => 1 - Math.pow(1 - t, 3) } as any);
          }
        }
      });
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      map.on('mousemove', 'borough-fills', (ev: any) => {
        const f = ev.features?.[0];
        (map.getCanvas() as HTMLCanvasElement).style.cursor = f ? 'pointer' : '';
        if (f) {
          const boro = f.properties?.BoroName as string | undefined;
          if (boro) {
            const key = slug(boro);
            const st = useGameStore.getState();
            const c = st.countries[key];
            if (c) {
              const per100k = (c.I / c.pop) * 100_000;
              const html = `<div style="font: 12px system-ui;">
                <div style="font-weight:600; margin-bottom:2px;">${c.name}</div>
                <div>I: ${c.I.toFixed(0)} <span style="color:#94a3b8">(${per100k.toFixed(1)} /100k)</span></div>
                <div style="color:#94a3b8">Policy: ${c.policy}</div>
              </div>`;
              popup.setLngLat(ev.lngLat).setHTML(html).addTo(map);
            }
          }
        } else {
          popup.remove();
        }
      });
      map.on('mouseleave', 'borough-fills', () => popup.remove());

      // deck.gl overlay for bubbles, hospitals, flows
      const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
      try { (map as any).addControl(overlay); } catch {}
      deckRef.current = overlay;
      // Lightweight post effects: soft vignette to draw focus; mild bloom-like lift
      try {
        const vignetteFs = `
          uniform sampler2D texture;
          varying vec2 uv;
          void main() {
            vec4 color = texture2D(texture, uv);
            float d = distance(uv, vec2(0.5));
            float vig = smoothstep(0.5, 0.95, d);
            color.rgb *= (1.0 - 0.18 * vig);
            gl_FragColor = color;
          }
        `;
        const vignette = new PostProcessEffect(vignetteFs as any, 'vignette');
        effectsRef.current = [vignette];
      } catch {}

      // Bubble spawning + lifecycle via deck.gl
      const colorOf = (type: 'dna'|'ops'|'cure'): [number, number, number, number] =>
        type === 'cure' ? [96, 165, 250, 220] : type === 'ops' ? [52, 211, 153, 220] : [255, 105, 97, 220];

      let last = performance.now();
      let elapsedSinceSpawn = 0;
      let elapsedSinceBlot = 0;
      let elapsedSinceDust = 0;

      const MAX_ACTIVE_BUBBLES = 10;
      const SAFE_PAD_PX = 18;
      const OBSTACLE_PAD_PX = 12;
      const PICKUP_TTL_MS = 10_000;

      const updateUiObstacles = () => {
        const root = ref.current;
        if (!root) return;
        const now = performance.now();
        if (now - lastUiObstaclesUpdateRef.current < 250) return;
        lastUiObstaclesUpdateRef.current = now;

        const containerRect = root.getBoundingClientRect();
        const selectors = [
          '.cmd-bar',
          '.left-panel',
          '.bottom-ticker',
          '.overlay-chips',
          '.sheet-right',
          '.sheet-overlay',
          '.isl-panel',
          '.objectives-panel',
          '.pickup-tray',
        ];
        const rects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
        try {
          for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el) => {
              const r = (el as HTMLElement).getBoundingClientRect();
              const left = r.left - containerRect.left - OBSTACLE_PAD_PX;
              const top = r.top - containerRect.top - OBSTACLE_PAD_PX;
              const right = r.right - containerRect.left + OBSTACLE_PAD_PX;
              const bottom = r.bottom - containerRect.top + OBSTACLE_PAD_PX;
              // Ignore offscreen rects.
              if (right < 0 || bottom < 0) return;
              if (left > containerRect.width || top > containerRect.height) return;
              rects.push({ left, top, right, bottom });
            });
          }
        } catch {}
        uiObstaclesRef.current = rects;
      };

      const pointObstructed = (x: number, y: number, w: number, h: number) => {
        if (x < SAFE_PAD_PX || y < SAFE_PAD_PX) return true;
        if (x > w - SAFE_PAD_PX || y > h - SAFE_PAD_PX) return true;
        for (const r of uiObstaclesRef.current) {
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
        }
        return false;
      };

      const pickSafeBubbleLL = (st: ReturnType<typeof useGameStore.getState>) => {
        const keys = Object.keys(st.countries);
        if (!keys.length) return null;
        const w = ref.current?.clientWidth || 0;
        const h = ref.current?.clientHeight || 0;
        if (w <= 0 || h <= 0) return null;

        // Try multiple samples so we almost never spawn under UI.
        for (let attempt = 0; attempt < 10; attempt++) {
          const weights = keys.map(k => Math.max(1, st.countries[k].I));
          const sum = weights.reduce((a,b)=>a+b,0);
          let r = Math.random() * sum, acc = 0, choice = keys[0];
          for (let i=0;i<keys.length;i++){ acc += weights[i]; if (r <= acc){ choice = keys[i]; break; } }
          const boroName = nameMapRef.current[choice] || '';
          let ll = centroidRef.current[choice] || NYC_CENTER;
          const hoodList = hoodNodesByBoroRef.current[slug(boroName)] || [];
          if (hoodList.length) {
            const pick = hoodList[Math.floor(Math.random() * hoodList.length)];
            const coords = pick?.geometry?.coordinates;
            if (Array.isArray(coords) && coords.length >= 2) ll = coords as [number, number];
          }
          const pt = map.project(ll as any);
          if (!pointObstructed(pt.x, pt.y, w, h)) return ll;
        }
        return null;
      };

      const loop = () => {
        const now = performance.now();
        const dt = now - last;
        last = now;
        const st = useGameStore.getState();
        const ui = useUiStore.getState();
        const actions = useGameStore.getState().actions;
        updateUiObstacles();
        if (!st.paused) {
          // TTL
          bubblesRef.current = bubblesRef.current.filter(b => { b.ttl -= dt; return b.ttl > 0; });
          const isUiBlocking = ui.showUpgrades || !ui.mapOverlays?.bubbles;

          // If the UI opens on top of existing pickups, bank them so they never become
          // "unclickable under menus". Auto-collect also clears the map immediately.
          if (bubblesRef.current.length) {
            const w = ref.current?.clientWidth || 0;
            const h = ref.current?.clientHeight || 0;

            if (st.autoCollectBubbles) {
              for (const b of bubblesRef.current) {
                const amt = b.type === 'cure'
                  ? Math.min(b.amount, 0.45)
                  : Math.max(1, Math.floor(b.amount * 0.8));
                actions.collectPickup(b.type as BubbleType, amt);
              }
              bubblesRef.current = [];
            } else if (isUiBlocking) {
              for (const b of bubblesRef.current) actions.bankPickup(b.type as BubbleType, b.amount);
              bubblesRef.current = [];
            } else if (w > 0 && h > 0) {
              const keep: typeof bubblesRef.current = [];
              for (const b of bubblesRef.current) {
                const pt = map.project(b.ll as any);
                if (pointObstructed(pt.x, pt.y, w, h)) actions.bankPickup(b.type as BubbleType, b.amount);
                else keep.push(b);
              }
              bubblesRef.current = keep;
            }
          }

          // Spawn cadence
          elapsedSinceSpawn += dt;
          const spawnEvery = st.bubbleSpawnMs || 1400;
          // Avoid "catch-up spam" after tab switches or jank frames.
          elapsedSinceSpawn = Math.min(elapsedSinceSpawn, spawnEvery * 2.5);
          let spawnedThisFrame = 0;
          while (elapsedSinceSpawn >= spawnEvery) {
            elapsedSinceSpawn -= spawnEvery;
            if (spawnedThisFrame++ >= 2) break;
            // spawn bubble
            const type: 'dna'|'ops'|'cure' = st.mode === 'controller' ? (Math.random() < 0.8 ? 'ops' : 'cure') : (Math.random() < 0.85 ? 'dna' : 'cure');
            if (type === 'cure' && st.mode === 'architect' && st.cureProgress < 5) continue;

            // Amount is stored per pickup so banked + map pickups behave consistently.
            const baseAmount = type === 'cure' ? 0.6 : (Math.random() < 0.5 ? 2 : 3);
            if (st.autoCollectBubbles) {
              // Accessibility: auto-collect with a small penalty.
              const amt = type === 'cure' ? 0.45 : Math.max(1, Math.floor(baseAmount * 0.8));
              actions.collectPickup(type as BubbleType, amt);
              continue;
            }

            if (isUiBlocking) {
              actions.bankPickup(type as BubbleType, baseAmount);
              continue;
            }

            if (bubblesRef.current.length >= MAX_ACTIVE_BUBBLES) continue;

            const ll = pickSafeBubbleLL(st);
            if (!ll) {
              actions.bankPickup(type as BubbleType, baseAmount);
              continue;
            }
            bubblesRef.current.push({ id: idCounterRef.current++, ll, type, amount: baseAmount, ttl: PICKUP_TTL_MS, born: now });
          }
        }

        // Compute hospital occupancy snapshot per borough
        const state = useGameStore.getState();
        const perBoroH = Object.fromEntries(Object.keys(state.countries).map(k => [k, state.countries[k].H]));
        const hospData = hospitalNodesRef.current.map(h => {
          const Hboro = perBoroH[h.boroKey] || 0;
          const sameBoro = hospitalNodesRef.current.filter(x => x.boroKey === h.boroKey);
          const totalCap = sameBoro.reduce((s, x) => s + (x.capacity || 0), 0) || 1;
          const weight = (h.capacity || 1) / totalCap;
          const occupancy = Hboro * weight;
          return { ...h, occupancy };
        });

        // Flows along travel edges (intensity scaled by mobility and infectivity)
        let arcFlows: Array<{ source: [number,number]; target: [number,number]; daily: number; iPrev: number }> = arcFlowsCacheRef.current;
        let bridgeFlows: Array<{ path: [number,number][]; daily: number; iPrev: number }> = bridgeFlowsCacheRef.current;
        const sinceFlows = now - (lastFlowsUpdateRef.current || 0);
        if (sinceFlows > 120) {
          const edges = (state as any).travel || [];
          const flowsRaw = edges.map((e: any) => {
            const fromKey = e.from; const toKey = e.to;
            const fromLL = centroidRef.current[fromKey] || NYC_CENTER;
            const toLL = centroidRef.current[toKey] || NYC_CENTER;
            const from = state.countries[fromKey];
            const p = state.params as any;
            const policyBase = from.policy === 'open' ? 1.0 : from.policy === 'advisory' ? 0.6 : from.policy === 'restrictions' ? 0.3 : 0.1;
            const policyResistMulUp = 1; // approximate (we don't recompute full upgrade stack here)
            let fromMul = 1 - (1 - policyBase) / policyResistMulUp;
            const severity = Math.min(1, (p.symFrac * from.I + from.H) / Math.max(1, from.pop));
            fromMul *= 1 - Math.min(0.9, severity * p.severityMobilityFactor);
            const daily = e.daily * p.mobilityScale * fromMul;
            const iPrev = (from.I / Math.max(1, from.pop));
            return { fromKey, toKey, source: fromLL as [number,number], target: toLL as [number,number], daily, iPrev };
          });
          // Split flows into bridge-aligned and arc fallback
          const bridgeFlowsNew: Array<{ path: [number,number][], daily: number, iPrev: number }> = [];
          const arcFlowsNew: Array<{ source: [number,number], target: [number,number], daily: number, iPrev: number }> = [];
          // route weight overrides from UI
          const routeOverrides = (useUiStore.getState() as any).routeWeights || {};
          for (const f of flowsRaw) {
            const routes = routesFor(f.fromKey, f.toKey, routeOverrides);
            if (routes.length && f.daily > 0) {
              const sumW = routes.reduce((s, r) => s + (r.weight || 1), 0) || 1;
              for (const r of routes) {
                const share = (r.weight || 1) / sumW;
                bridgeFlowsNew.push({ path: r.path as any, daily: f.daily * share, iPrev: f.iPrev });
              }
            } else {
              arcFlowsNew.push({ source: f.source, target: f.target, daily: f.daily, iPrev: f.iPrev });
            }
          }
          arcFlowsCacheRef.current = arcFlows = arcFlowsNew;
          bridgeFlowsCacheRef.current = bridgeFlows = bridgeFlowsNew;
          lastFlowsUpdateRef.current = now;
        }

        // Infection speckles (neighborhood blots) for creeping feel at low prevalence
        elapsedSinceBlot += dt;
        let speckleLayer: any = null;
        let dustLayer: any = null;
        let deathMaskLayer: any = null;
        if (elapsedSinceBlot >= 200) {
          elapsedSinceBlot = 0;
          const speckles: Array<{ ll: [number, number]; alpha: number; r: number }> = [];
          const dust: Array<{ ll: [number, number]; alpha: number; r: number }> = [];
          const deaths: Array<{ ll: [number, number]; alpha: number; r: number }> = [];
          try {
            for (const [boroKey, c] of Object.entries(state.countries)) {
              const N = Math.max(1, (c as any).pop || 1);
              const iRate = Math.max(0, (c as any).I / N);
              const dRate = Math.max(0, (c as any).D / N);
              const hoodList = hoodNodesByBoroRef.current[boroKey] || [];
              if (!hoodList.length || iRate <= 0) continue;
              const norm = Math.min(1, iRate / 0.005); // scale up to 0.5%
              const count = Math.max(1, Math.floor(norm * 16));
              for (let i = 0; i < count; i++) {
                const pick = hoodList[Math.floor(Math.random() * hoodList.length)];
                const coords = pick?.geometry?.coordinates;
                if (!Array.isArray(coords) || coords.length < 2) continue;
                const baseA = 50 + Math.floor(norm * 140);
                const baseR = 6 + Math.floor(norm * 24);
                speckles.push({ ll: coords as [number, number], alpha: baseA, r: baseR });
              }
              // atmospheric dust around centroid
              const center = centroidRef.current[boroKey] || NYC_CENTER;
              const dustCount = Math.max(2, Math.floor(norm * 22));
              for (let i=0; i<dustCount; i++) {
                const jitterLon = (Math.random() - 0.5) * 0.01; // ~small
                const jitterLat = (Math.random() - 0.5) * 0.01;
                const a = 15 + Math.floor(norm * 50);
                const r = 3 + Math.floor(norm * 5);
                dust.push({ ll: [center[0] + jitterLon, center[1] + jitterLat] as [number, number], alpha: a, r });
              }
              // darken high-death areas with soft mask
              if (dRate > 0) {
                const normD = Math.min(1, dRate / 0.0008);
                const dCount = Math.max(1, Math.floor(normD * 12));
                for (let i=0; i<dCount; i++) {
                  const pick = hoodList[Math.floor(Math.random() * hoodList.length)];
                  const coords = pick?.geometry?.coordinates;
                  if (!Array.isArray(coords) || coords.length < 2) continue;
                  const a = 40 + Math.floor(normD * 120);
                  const r = 10 + Math.floor(normD * 28);
                  deaths.push({ ll: coords as [number, number], alpha: a, r });
                }
              }
            }
          } catch {}
          speckleLayer = new ScatterplotLayer({
            id: 'infection-speckles',
            data: speckles,
            getPosition: (d: any) => d.ll,
            getFillColor: (d: any) => [255, 66, 66, d.alpha],
            getRadius: (d: any) => d.r,
            radiusUnits: 'pixels',
            stroked: false,
            pickable: false,
            parameters: {
              // additive blending to make dots bloom together
              blend: true,
              blendFunc: [GL.SRC_ALPHA, GL.ONE, GL.ONE, GL.ONE_MINUS_SRC_ALPHA],
              blendEquation: GL.FUNC_ADD,
            } as any,
            updateTriggers: { data: performance.now() },
          }) as any;
          dustLayer = new ScatterplotLayer({
            id: 'atmo-dust',
            data: dust,
            getPosition: (d: any) => d.ll,
            getFillColor: (d: any) => [255, 180, 120, d.alpha],
            getRadius: (d: any) => d.r,
            radiusUnits: 'pixels',
            stroked: false,
            pickable: false,
            parameters: {
              blend: true,
              blendFunc: [GL.SRC_ALPHA, GL.ONE, GL.ONE, GL.ONE_MINUS_SRC_ALPHA],
              blendEquation: GL.FUNC_ADD,
            } as any,
            updateTriggers: { data: performance.now() },
          }) as any;
          deathMaskLayer = new ScatterplotLayer({
            id: 'death-mask',
            data: deaths,
            getPosition: (d: any) => d.ll,
            getFillColor: (d: any) => [30, 30, 30, d.alpha],
            getRadius: (d: any) => d.r,
            radiusUnits: 'pixels',
            stroked: false,
            pickable: false,
            updateTriggers: { data: performance.now() },
          }) as any;
        }

        // Render deck layers
        const t = now;
        const bubbleLayer = makeBubblesLayer({
          data: bubblesRef.current as any,
          t,
          onClick: (d) => {
            bubblesRef.current = bubblesRef.current.filter(b => b.id !== d.id);
            try { playBubble(d.type); } catch {}
            const gs = useGameStore.getState();
            gs.actions.collectPickup(d.type as BubbleType, d.amount);
          }
        });
        const hospitalLayer = makeHospitalsLayer({
          data: hospData as any,
          onClick: (obj) => {
            const [lng, lat] = obj.ll as [number, number];
            const nowTs = performance.now();
            if (nowTs - cameraLockRef.current < 180) map.stop();
            cameraLockRef.current = nowTs;
            try { map.flyTo({ center: [lng, lat] as any, zoom: Math.min(16, Math.max(13, map.getZoom() + 1.2)), duration: 600, curve: 1.6, easing: (t: number) => 1 - Math.pow(1 - t, 3) } as any); } catch {}
            try {
              const st = useGameStore.getState();
              const load = obj.capacity > 0 ? (obj.occupancy / obj.capacity) : 0;
              const pct = load > 0 && load < 0.001 ? '<0.1' : (load * 100).toFixed(1);
              st.actions.addEvent(`Hospital: ${obj.name} — Load ${pct}%`);
            } catch {}
          }
        });
        const flowLayer = makeFlowsLayer({ data: arcFlows as any, t: now });
        const flowSparksLayer = makeFlowSparksLayer({ data: arcFlows as any, t: now });
        const bridgePathsLayer = makeBridgePathsLayer({ data: bridgeFlows as any });
        const bridgeSparksLayer = makeBridgeSparksLayer({ data: bridgeFlows as any, t: now });

        // Policy heat layer (damping due to policy + severity per borough applied to hood dots)
        const stCur = useGameStore.getState();
        // Compute policy resist multiplier from purchased upgrades (approx)
        let policyResistMulUp = 1;
        for (const u of Object.values(stCur.upgrades)) {
          if (!u.purchased) continue;
          if ((u.effects as any).policyResistMul) policyResistMulUp *= (u.effects as any).policyResistMul;
        }
        const pParams: any = stCur.params;
        const symFracEff = Math.max(0, Math.min(1, pParams.symFrac));
        const sevFactor = Math.max(0, pParams.severityMobilityFactor);
        const policyDots: any[] = (policyDotsRef.current || []).map((pt: any) => {
          // approximate boro by nearest centroid
          const entries = Object.entries(centroidRef.current);
          let minD = Infinity, boroKey = entries[0]?.[0] || 'manhattan';
          for (const [k, cLL] of entries) {
            const dx = (pt.ll[0] - (cLL as any)[0]); const dy = (pt.ll[1] - (cLL as any)[1]);
            const d = dx*dx + dy*dy; if (d < minD) { minD = d; boroKey = k; }
          }
          const c = stCur.countries[boroKey];
          const N = Math.max(1, c?.pop || 1);
          const base = c?.policy === 'open' ? 1.0 : c?.policy === 'advisory' ? 0.6 : c?.policy === 'restrictions' ? 0.3 : 0.1;
          let mul = 1 - (1 - base) / policyResistMulUp;
          const severity = Math.min(1, (symFracEff * (c?.I || 0) + (c?.H || 0)) / N);
          mul *= 1 - Math.min(0.9, severity * sevFactor);
          const damp = Math.max(0, Math.min(1, 1 - mul));
          return { ...pt, damp };
        });
        const policyHeatLayer = new ScatterplotLayer({
          id: 'policy-heat-layer',
          data: policyDots,
          radiusUnits: 'meters',
          getPosition: (d: any) => d.ll,
          getRadius: (d: any) => 260,
          stroked: false,
          pickable: false,
          getFillColor: (d: any) => {
            const t = d.damp || 0; // 0 open, 1 fully damped
            const r = Math.floor(64 + t * 191);
            const g = Math.floor(200 - t * 140);
            const b = 80;
            const a = Math.floor(60 + t * 120);
            return [r, g, b, a];
          }
        });

        // Throttle heavy computations and deck updates
        const layers: any[] = [];
        // infection visuals (additive) first
        if (dustLayer) layers.push(dustLayer);
        if (speckleLayer) layers.push(speckleLayer);
        if (ui.mapOverlays.policy) layers.push(policyHeatLayer);
        // then death mask to darken severe areas
        if (deathMaskLayer) layers.push(deathMaskLayer);
        // then routes/flows
        if (ui.mapOverlays.flows) {
          if (arcFlows.length) { layers.push(flowLayer); layers.push(flowSparksLayer); }
          if (bridgeFlows.length) { layers.push(bridgePathsLayer); layers.push(bridgeSparksLayer); }
        }
        // hospitals above routes, bubbles on top
        if (hospitalLayer) layers.push(hospitalLayer);
        if (ui.mapOverlays.bubbles) layers.push(bubbleLayer);
        const sinceDeck = now - (lastDeckUpdateRef.current || 0);
        if (sinceDeck >= 33) { // ~30 FPS
          const getTooltip = (info: any) => {
            if (!info?.object) return null;
            if (info.layer && info.layer.id === 'hospitals-layer') {
              const obj = info.object as any;
              const occ = Number(obj.occupancy || 0);
              const cap = Math.max(1, Number(obj.capacity || 0));
              const pct = Math.min(999, (occ / cap) * 100);
              const pctLabel = pct > 0 && pct < 0.1 ? '<0.1' : pct.toFixed(1);
              return {
                text: `${obj.name}\nLoad ${pctLabel}% (${Math.round(occ).toLocaleString()} / ${Math.round(cap).toLocaleString()})`,
              } as any;
            }
            return null;
          };
          overlay.setProps({ layers, effects: effectsRef.current, getTooltip });
          lastDeckUpdateRef.current = now;
        }

        // Cinematic camera drift (gentle bearing oscillation) if enabled
        try {
          const ui = useUiStore.getState() as any;
          if (ui.cinematic && !st.paused && !ui.hudHovering) {
            const sinceLock = now - (cameraLockRef.current || 0);
            if (sinceLock > 1200) {
              const m = mapRef.current;
              if (m) {
                const b = m.getBearing();
                // oscillate around initial bearing
                const t = now * 0.00006; // speed
                const target = -15 + Math.sin(t) * 6; // degrees
                const delta = target - b;
                const step = Math.max(-0.12, Math.min(0.12, delta * 0.04));
                if (Math.abs(step) > 0.001) m.setBearing(b + step, { duration: 0 } as any);
              }
            }
          }
        } catch {}

        animRef.current = requestAnimationFrame(loop) as unknown as number;
      };
      loop();
    });

    // Fallback to raster if vector style fails to load
    if (typeof style === 'string') {
      map.on('error', (ev) => {
        const msg = String((ev as any)?.error?.message ?? '');
        if (msg && /style|Unauthorized|403|Failed/i.test(msg)) {
          try { map.setStyle(fallback as any); } catch {}
        }
      });
    }

    // Subscribe to store changes to update choropleth
    storeRef.current = useGameStore.subscribe(() => {
      applyInfectionToMap();
      applySelectionToMap();
    });

    function applyInfectionToMap() {
      const m = mapRef.current;
      if (!m) return;
      const idMap = idMapRef.current;
      const st = useGameStore.getState();
      for (const [key, featureId] of Object.entries(idMap)) {
        const c = st.countries[key];
        if (!c) continue;
        // infections per person; clamp to avoid NaN
        const iRate = Math.max(0, (c.I || 0) / Math.max(1, c.pop || 1));
        try {
          m.setFeatureState({ source: 'boroughs', id: featureId as any }, { iRate });
        } catch {}
      }
    }

    function applySelectionToMap() {
      const m = mapRef.current;
      if (!m) return;
      const st = useGameStore.getState();
      const selected = st.selectedCountryId || '';
      const selectedName = nameMapRef.current[selected] || '';
      try {
        m.setFilter('borough-selected', ['==', ['get', 'BoroName'], selectedName]);
      } catch {}
      try {
        // filter neighborhood nodes to selected borough; show all when none selected
        const filter = selectedName ? (['==', ['get', 'boro'], selectedName] as any) : null;
        if (m.getLayer('hood-nodes')) (m as any).setFilter('hood-nodes', filter);
        if (m.getLayer('hood-labels')) (m as any).setFilter('hood-labels', filter);
      } catch {}
    }

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      if (storeRef.current) storeRef.current();
      try { if (animRef.current) cancelAnimationFrame(animRef.current); } catch {}
      try { deckRef.current?.finalize(); deckRef.current = null; } catch {}
    };
  }, []);

  return <div ref={ref} className="nyc-map" aria-label="NYC map" />;
}
