import React, { useEffect, useRef } from 'react';
import maplibregl, { Map, NavigationControl, ScaleControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useGameStore } from '../state/store';
import { useUiStore } from '../state/ui';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, ArcLayer } from '@deck.gl/layers';
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
  const bubblesRef = useRef<Array<{ id: number; ll: [number, number]; type: 'dna'|'ops'|'cure'; ttl: number; born: number }>>([]);
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
      pitch: 0,
      bearing: 0,
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
        const hasBuildings = map.getStyle().layers?.some(l => l.id.includes('building'));
        if (!hasBuildings) {
          // No-op; many MapTiler styles already include buildings.
        }
      }
      // Constrain and fit to NYC bounds
      map.setMaxBounds(NYC_BOUNDS as any);
      map.fitBounds(NYC_BOUNDS as any, { padding: 24, duration: 0 });
      // Lock rotation to avoid disorientation
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();

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
            0.000001, 0.10,
            0.000005, 0.20,
            0.00001, 0.30,
            0.00005, 0.50,
            0.0002, 0.70,
            0.001, 0.90
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
            const amt = (gs as any).patientZeroSeedAmount || 10000;
            gs.actions.seedInfection(key, amt);
            gs.actions.selectCountry(key);
            gs.actions.setAwaitingPatientZero(false);
            gs.actions.addEvent(`Patient Zero established in ${gs.countries[key].name}`);
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

      // Bubble spawning + lifecycle via deck.gl
      const colorOf = (type: 'dna'|'ops'|'cure'): [number, number, number, number] =>
        type === 'cure' ? [96, 165, 250, 220] : type === 'ops' ? [52, 211, 153, 220] : [255, 105, 97, 220];

      let last = performance.now();
      let elapsedSinceSpawn = 0;
      const loop = () => {
        const now = performance.now();
        const dt = now - last;
        last = now;
        const st = useGameStore.getState();
        if (!st.paused) {
          // TTL
          bubblesRef.current = bubblesRef.current.filter(b => { b.ttl -= dt; return b.ttl > 0; });
          // Spawn cadence
          elapsedSinceSpawn += dt;
          const spawnEvery = st.bubbleSpawnMs || 1400;
          while (elapsedSinceSpawn >= spawnEvery) {
            elapsedSinceSpawn -= spawnEvery;
            // spawn bubble
            const type: 'dna'|'ops'|'cure' = st.mode === 'controller' ? (Math.random() < 0.8 ? 'ops' : 'cure') : (Math.random() < 0.85 ? 'dna' : 'cure');
            if (!(type === 'cure' && st.cureProgress < 5)) {
              const keys = Object.keys(st.countries);
              if (keys.length) {
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
                bubblesRef.current.push({ id: idCounterRef.current++, ll, type, ttl: 8000, born: now });
              }
            }
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
        const bridgeFlows: Array<{ path: [number,number][], daily: number, iPrev: number }> = [];
        const arcFlows: Array<{ source: [number,number], target: [number,number], daily: number, iPrev: number }> = [];
        // route weight overrides from UI
        const routeOverrides = (useUiStore.getState() as any).routeWeights || {};
        for (const f of flowsRaw) {
          const routes = routesFor(f.fromKey, f.toKey, routeOverrides);
          if (routes.length && f.daily > 0) {
            const sumW = routes.reduce((s, r) => s + (r.weight || 1), 0) || 1;
            for (const r of routes) {
              const share = (r.weight || 1) / sumW;
              bridgeFlows.push({ path: r.path as any, daily: f.daily * share, iPrev: f.iPrev });
            }
          } else {
            arcFlows.push({ source: f.source, target: f.target, daily: f.daily, iPrev: f.iPrev });
          }
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
            if (d.type === 'cure') gs.actions.adjustCure(-0.6);
            else gs.actions.addDNA(Math.random() < 0.5 ? 2 : 3);
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
        const ui = useUiStore.getState();
        const layers: any[] = [];
        if (ui.mapOverlays.flows) {
          if (arcFlows.length) { layers.push(flowLayer); layers.push(flowSparksLayer); }
          if (bridgeFlows.length) { layers.push(bridgePathsLayer); layers.push(bridgeSparksLayer); }
        }
        if (ui.mapOverlays.policy) layers.push(policyHeatLayer);
        if (ui.mapOverlays.hospitals) layers.push(hospitalLayer);
        if (ui.mapOverlays.bubbles) layers.push(bubbleLayer);
        const sinceDeck = now - (lastDeckUpdateRef.current || 0);
        if (sinceDeck >= 33) { // ~30 FPS
          overlay.setProps({ layers });
          lastDeckUpdateRef.current = now;
        }

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
