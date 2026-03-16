"use client";
// ============================================================
// components/AddressAutocomplete.jsx
// ============================================================
// Replaces the legacy Google Maps Autocomplete widget with the
// new GMPX place picker. This custom element loads Maps + Places
// internally and exposes structured place data via `value`.
//
// Props:
//   onSelect(addr) → called once a place is chosen; `addr` matches
//                     {address_line1, city, state, zip, country}.
//   onChange(value) → called whenever the text value changes (typing or select).
// ============================================================

import { useEffect, useRef, useState } from "react";

const css = `
  .addr-wrap { position:relative; }
  .addr-wrap gmpx-api-loader { display:none; }
  .addr-wrap gmpx-place-picker {
    width:100%;
    border-radius:2px;
    background:#1a1919;
    border:1px solid #2a2828;
    font-family:'Barlow Condensed',sans-serif;
    font-size:15px;
    font-weight:500;
    color:#f0ebe3;
  }
  .addr-wrap gmpx-place-picker::part(input) {
    padding:10px 12px;
    color:#f0ebe3;
  }
  .addr-wrap gmpx-place-picker::part(listbox) {
    background:#111010;
    border:1px solid #2a2828;
  }
`;

// Parse Google Maps address_components into structured fields
function parseAddressComponents(components = []) {
  const get = (type) =>
    components.find(c => c.types.includes(type))?.long_name ?? "";
  const getShort = (type) =>
    components.find(c => c.types.includes(type))?.short_name ?? "";

  return {
    address_line1: `${get("street_number")} ${get("route")}`.trim(),
    address_line2: "",
    city:    get("locality") || get("sublocality") || get("postal_town"),
    state:   getShort("administrative_area_level_1"),
    zip:     get("postal_code"),
    country: getShort("country"),
  };
}

export default function AddressAutocomplete({ onSelect, onChange, placeholder = "Start typing your address..." }) {
  const pickerRef = useRef(null);
  const loaderRef = useRef(null);
  const [, setLoaded] = useState(false);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  useEffect(() => {
    if (!loaderRef.current) return;
    if (key) loaderRef.current.setAttribute("key", key);
    loaderRef.current.setAttribute("solution-channel", "GMP_GE_placepicker_v2");
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.customElements?.get("gmpx-place-picker")) {
      setLoaded(true);
      return;
    }
    const existing = document.querySelector('script[data-gmpx-loader]');
    const handleLoad = () => setLoaded(true);
    if (existing) {
      existing.addEventListener("load", handleLoad);
      return () => existing.removeEventListener("load", handleLoad);
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://ajax.googleapis.com/ajax/libs/@googlemaps/extended-component-library/0.6.11/index.min.js";
    script.setAttribute("data-gmpx-loader", "1");
    script.addEventListener("load", handleLoad);
    document.head.appendChild(script);
    return () => {
      script.removeEventListener("load", handleLoad);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let cleanup = () => {};

    const attach = () => {
      const picker = pickerRef.current;
      if (!picker) return;

      const handleInput = (event) => {
        const val = event.target?.value ?? "";
        onChange?.(val);
      };

      const handlePlaceChange = () => {
        const place = picker.value;
        if (!place) {
          onChange?.("");
          return;
        }
        const parsed = parseAddressComponents(place.address_components);
        onSelect?.(parsed);
        onChange?.(parsed.address_line1 || place.formatted_address || place.name || "");
      };

      picker.addEventListener("input", handleInput);
      picker.addEventListener("gmpx-placechange", handlePlaceChange);

      cleanup = () => {
        picker.removeEventListener("input", handleInput);
        picker.removeEventListener("gmpx-placechange", handlePlaceChange);
      };
    };

    const init = async () => {
      if (window.customElements?.whenDefined) {
        try {
          await window.customElements.whenDefined("gmpx-place-picker");
        } catch (error) {
          console.warn("AddressAutocomplete: unable to wait for gmpx-place-picker", error);
        }
      }
      if (!mounted) return;
      attach();
    };

    init();
    return () => {
      mounted = false;
      cleanup();
    };
  }, [onChange, onSelect]);

  useEffect(() => {
    if (!key) console.warn("AddressAutocomplete: NEXT_PUBLIC_GOOGLE_MAPS_KEY is missing");
  }, [key]);

  return (
    <>
      <style>{css}</style>
      <div className="addr-wrap">
        <gmpx-api-loader ref={loaderRef}></gmpx-api-loader>
        <gmpx-place-picker
          ref={pickerRef}
          placeholder={placeholder}
          autofocus="off"
          country="us"
        />
      </div>
    </>
  );
}
