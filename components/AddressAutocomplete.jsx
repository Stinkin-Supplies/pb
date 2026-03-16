"use client";
// ============================================================
// components/AddressAutocomplete.jsx
// ============================================================
// Uses Google Places Autocomplete to suggest real addresses.
// Parses the result into structured fields (street, city,
// state, zip, country) and calls onSelect with the object.
//
// Usage:
//   <AddressAutocomplete onSelect={(addr) => setAddress(addr)} />
//
// Requires:
//   NEXT_PUBLIC_GOOGLE_MAPS_KEY in your .env / Vercel env vars
//   Google Cloud Console → Places API enabled
// ============================================================

import { useEffect, useRef, useState } from "react";

const css = `
  .addr-wrap { position:relative; }
  .addr-input {
    background:#1a1919; border:1px solid #2a2828;
    color:#f0ebe3; font-family:'Barlow Condensed',sans-serif;
    font-size:15px; font-weight:500;
    padding:10px 12px; border-radius:2px;
    outline:none; width:100%;
    transition:border-color 0.2s;
  }
  .addr-input:focus { border-color:#e8621a; }
  .addr-input::placeholder { color:#3a3838; }
  .addr-dropdown {
    position:absolute; top:100%; left:0; right:0; z-index:200;
    background:#1a1919; border:1px solid #2a2828;
    border-top:none; border-radius:0 0 2px 2px;
    overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.5);
  }
  .addr-option {
    padding:10px 14px; cursor:pointer;
    transition:background 0.15s;
    border-bottom:1px solid #111;
  }
  .addr-option:last-child { border-bottom:none; }
  .addr-option:hover { background:#2a2828; }
  .addr-option-main { font-size:14px;font-weight:600;color:#f0ebe3; }
  .addr-option-sub { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.08em;margin-top:2px; }
  .addr-loading { padding:10px 14px;font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em; }
  .addr-powered { padding:6px 14px;font-family:'Share Tech Mono',monospace;font-size:7px;color:#3a3838;letter-spacing:0.1em;text-align:right; }
`;

// Parse Google Places address_components into structured fields
function parseAddressComponents(components) {
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
  const [input,       setInput]       = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [open,        setOpen]        = useState(false);
  const autocompleteService = useRef(null);
  const placesService       = useRef(null);
  const debounceTimer       = useRef(null);
  const containerRef        = useRef(null);

  // Load Google Maps script once
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) { console.warn("NavBar: NEXT_PUBLIC_GOOGLE_MAPS_KEY not set"); return; }
    if (window.google?.maps?.places) { initServices(); return; }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.onload = initServices;
    document.head.appendChild(script);

    return () => {};
  }, []);

  function initServices() {
    if (!window.google?.maps?.places) return;
    autocompleteService.current = new window.google.maps.places.AutocompleteService();
    // PlacesService needs a DOM element
    const div = document.createElement("div");
    placesService.current = new window.google.maps.places.PlacesService(div);
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInput = (e) => {
    const val = e.target.value;
    setInput(val);
    clearTimeout(debounceTimer.current);

    if (onChange) onChange(val);

    if (val.length < 3) { setSuggestions([]); setOpen(false); return; }

    debounceTimer.current = setTimeout(() => {
      if (!autocompleteService.current) return;
      setLoading(true);

      autocompleteService.current.getPlacePredictions(
        {
          input: val,
          componentRestrictions: { country: ["us", "ca"] }, // US + Canada
          types: ["address"],
        },
        (predictions, status) => {
          setLoading(false);
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setSuggestions([]); setOpen(false); return;
          }
          setSuggestions(predictions);
          setOpen(true);
        }
      );
    }, 300);
  };

  const handleSelect = (prediction) => {
    setInput(prediction.description);
    setOpen(false);
    setSuggestions([]);

    if (!placesService.current) return;

    // Get full details to parse components
    placesService.current.getDetails(
      { placeId: prediction.place_id, fields: ["address_components", "formatted_address"] },
      (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place) return;
        const parsed = parseAddressComponents(place.address_components);
        setInput(parsed.address_line1); // show just street in the input
        onSelect?.(parsed);
        if (onChange) onChange(parsed.address_line1);
      }
    );
  };

  return (
    <>
      <style>{css}</style>
      <div className="addr-wrap" ref={containerRef}>
        <input
          className="addr-input"
          type="text"
          placeholder={placeholder}
          value={input}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {open && (
          <div className="addr-dropdown">
            {loading ? (
              <div className="addr-loading">SEARCHING...</div>
            ) : (
              suggestions.map(pred => {
                const main = pred.structured_formatting?.main_text ?? pred.description;
                const sub  = pred.structured_formatting?.secondary_text ?? "";
                return (
                  <div key={pred.place_id} className="addr-option" onMouseDown={() => handleSelect(pred)}>
                    <div className="addr-option-main">{main}</div>
                    {sub && <div className="addr-option-sub">{sub}</div>}
                  </div>
                );
              })
            )}
            <div className="addr-powered">POWERED BY GOOGLE</div>
          </div>
        )}
      </div>
    </>
  );
}
