// เลือกตำแหน่งด้วย Leaflet + OpenStreetMap (ฟรี ไม่ต้องขอ API Key / ไม่ต้องผูกบัตรเครดิต)
// ใช้ Nominatim (nominatim.openstreetmap.org) สำหรับค้นหาสถานที่และ reverse geocoding
import { T } from "./i18n.js";

let leafletLoadPromise = null;

function loadLeaflet() {
  if (leafletLoadPromise) return leafletLoadPromise;
  leafletLoadPromise = new Promise((resolve, reject) => {
    if (window.L) return resolve();
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`${T.mapLoadErrorLine1} ${T.mapLoadErrorLine2}`));
    document.head.appendChild(script);
  });
  return leafletLoadPromise;
}

const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 }; // Bangkok

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=th`
    );
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

async function searchPlaces(query) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=th&accept-language=th&limit=6`
    );
    return await res.json();
  } catch {
    return [];
  }
}

export class MapPicker {
  constructor({ mapElId, searchInputEl, onLocationChange }) {
    this.mapElId = mapElId;
    this.searchInputEl = searchInputEl;
    this.onLocationChange = onLocationChange;
    this.map = null;
    this.marker = null;
    this.resultsBox = null;
    this.searchTimeout = null;
  }

  async init(initialLatLng) {
    try {
      await loadLeaflet();
    } catch (e) {
      document.getElementById(this.mapElId).innerHTML =
        `<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px;">${T.mapLoadErrorLine1}<br>${T.mapLoadErrorLine2}</div>`;
      return;
    }

    const center = initialLatLng || DEFAULT_CENTER;
    this.map = L.map(this.mapElId).setView([center.lat, center.lng], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map);

    this.marker = L.marker([center.lat, center.lng], { draggable: true }).addTo(this.map);

    this.marker.on("dragend", () => {
      const { lat, lng } = this.marker.getLatLng();
      this._handleLatLngChange(lat, lng);
    });

    this.map.on("click", (e) => {
      this.marker.setLatLng(e.latlng);
      this._handleLatLngChange(e.latlng.lat, e.latlng.lng);
    });

    if (this.searchInputEl) this._setupSearch();

    if (initialLatLng) this._handleLatLngChange(center.lat, center.lng);
  }

  _setupSearch() {
    this.resultsBox = document.createElement("div");
    this.resultsBox.className = "map-search-results";
    this.searchInputEl.parentElement.style.position = "relative";
    this.searchInputEl.parentElement.appendChild(this.resultsBox);

    this.searchInputEl.addEventListener("input", () => {
      clearTimeout(this.searchTimeout);
      const q = this.searchInputEl.value.trim();
      if (q.length < 3) {
        this.resultsBox.innerHTML = "";
        return;
      }
      this.searchTimeout = setTimeout(async () => {
        const results = await searchPlaces(q);
        this._renderResults(results);
      }, 500);
    });
  }

  _renderResults(results) {
    if (!results.length) {
      this.resultsBox.innerHTML = `<div class="map-search-item hint">${T.mapNoResults}</div>`;
      return;
    }
    this.resultsBox.innerHTML = results
      .map(
        (r, i) =>
          `<div class="map-search-item" data-idx="${i}">${r.display_name}</div>`
      )
      .join("");
    this.resultsBox.querySelectorAll(".map-search-item[data-idx]").forEach((el, i) => {
      el.addEventListener("click", () => {
        const r = results[i];
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        this.map.setView([lat, lng], 17);
        this.marker.setLatLng([lat, lng]);
        this.searchInputEl.value = r.display_name;
        this.resultsBox.innerHTML = "";
        this.onLocationChange({ lat, lng, address: r.display_name });
      });
    });
  }

  panToCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        this.map.setView([lat, lng], 17);
        this.marker.setLatLng([lat, lng]);
        this._handleLatLngChange(lat, lng);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async _handleLatLngChange(lat, lng) {
    const address = await reverseGeocode(lat, lng);
    this.onLocationChange({ lat, lng, address });
  }

  resize() {
    if (this.map) setTimeout(() => this.map.invalidateSize(), 50);
  }
}
