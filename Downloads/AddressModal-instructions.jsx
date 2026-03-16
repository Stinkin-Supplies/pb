// ============================================================
// ADD THIS to app/account/AccountClient.jsx
// ============================================================
// 1. Add this import at the top:
//      import AddressAutocomplete from "@/components/AddressAutocomplete";
//
// 2. Add this state inside AccountClient:
//      const [showAddAddr, setShowAddAddr] = useState(false);
//      const [newAddr, setNewAddr] = useState({
//        first_name:"", last_name:"", address_line1:"",
//        address_line2:"", city:"", state:"", zip:"", country:"US",
//        is_default: false,
//      });
//      const [savingAddr, setSavingAddr] = useState(false);
//
// 3. Replace the "+ ADD ADDRESS" button onClick with:
//      onClick={() => setShowAddAddr(true)}
//
// 4. Add the handleSaveAddress function:
//
//   const handleSaveAddress = async () => {
//     setSavingAddr(true);
//     const { data, error } = await supabase
//       .from("user_addresses")
//       .insert({ ...newAddr, user_id: user.id })
//       .select()
//       .single();
//     setSavingAddr(false);
//     if (!error) {
//       setAddresses(prev => [data, ...prev]);
//       setShowAddAddr(false);
//       setNewAddr({ first_name:"", last_name:"", address_line1:"",
//         address_line2:"", city:"", state:"", zip:"", country:"US", is_default:false });
//       showToast("Address saved");
//     }
//   };
//
// 5. Add the modal JSX (below) inside the ADDRESSES tab section,
//    right before the closing </div> of acc-section-body:
// ============================================================

// ADDRESS MODAL JSX — paste inside ADDRESSES tab:
`
{showAddAddr && (
  <div style={{
    position:"fixed", inset:0, zIndex:300,
    background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)",
    display:"flex", alignItems:"center", justifyContent:"center",
    padding:"20px",
  }}>
    <div style={{
      background:"#111010", border:"1px solid #2a2828",
      borderRadius:4, padding:28, width:"100%", maxWidth:520,
      position:"relative",
    }}>
      {/* Header */}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:"0.05em"}}>
          ADD <span style={{color:"#e8621a"}}>ADDRESS</span>
        </div>
        <button onClick={() => setShowAddAddr(false)} style={{background:"none", border:"none", color:"#8a8784", fontSize:18, cursor:"pointer"}}>✕</button>
      </div>

      {/* Name row */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
        <div>
          <label className="field-label">FIRST NAME</label>
          <input className="field-input" value={newAddr.first_name}
            onChange={e => setNewAddr(a => ({...a, first_name: e.target.value}))}
            placeholder="John"/>
        </div>
        <div>
          <label className="field-label">LAST NAME</label>
          <input className="field-input" value={newAddr.last_name}
            onChange={e => setNewAddr(a => ({...a, last_name: e.target.value}))}
            placeholder="Doe"/>
        </div>
      </div>

      {/* Autocomplete street */}
      <div style={{marginBottom:12}}>
        <label className="field-label">STREET ADDRESS</label>
        <AddressAutocomplete
          placeholder="Start typing your address..."
          onSelect={(parsed) => setNewAddr(a => ({
            ...a,
            address_line1: parsed.address_line1,
            city:          parsed.city,
            state:         parsed.state,
            zip:           parsed.zip,
            country:       parsed.country || "US",
          }))}
        />
      </div>

      {/* Apt / Suite */}
      <div style={{marginBottom:12}}>
        <label className="field-label">APT / SUITE (OPTIONAL)</label>
        <input className="field-input" value={newAddr.address_line2}
          onChange={e => setNewAddr(a => ({...a, address_line2: e.target.value}))}
          placeholder="Apt 4B"/>
      </div>

      {/* City / State / Zip */}
      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:12, marginBottom:12}}>
        <div>
          <label className="field-label">CITY</label>
          <input className="field-input" value={newAddr.city}
            onChange={e => setNewAddr(a => ({...a, city: e.target.value}))}
            placeholder="Palm Coast"/>
        </div>
        <div>
          <label className="field-label">STATE</label>
          <input className="field-input" value={newAddr.state}
            onChange={e => setNewAddr(a => ({...a, state: e.target.value}))}
            placeholder="FL" maxLength={2}/>
        </div>
        <div>
          <label className="field-label">ZIP</label>
          <input className="field-input" value={newAddr.zip}
            onChange={e => setNewAddr(a => ({...a, zip: e.target.value}))}
            placeholder="32137"/>
        </div>
      </div>

      {/* Default toggle */}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", borderTop:"1px solid #1a1919", marginBottom:16}}>
        <span style={{fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#8a8784", letterSpacing:"0.12em"}}>SET AS DEFAULT ADDRESS</span>
        <div
          onClick={() => setNewAddr(a => ({...a, is_default: !a.is_default}))}
          style={{width:32, height:18, borderRadius:9, background: newAddr.is_default?"#e8621a":"#2a2828", position:"relative", cursor:"pointer", transition:"background 0.2s"}}
        >
          <div style={{position:"absolute", top:2, left: newAddr.is_default?14:2, width:14, height:14, borderRadius:"50%", background:"#f0ebe3", transition:"left 0.2s"}}/>
        </div>
      </div>

      {/* Actions */}
      <div style={{display:"flex", gap:10}}>
        <button onClick={() => setShowAddAddr(false)} style={{flex:1, background:"transparent", border:"1px solid #2a2828", color:"#8a8784", fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:"0.1em", padding:"10px", borderRadius:2, cursor:"pointer"}}>
          CANCEL
        </button>
        <button
          onClick={handleSaveAddress}
          disabled={savingAddr || !newAddr.address_line1 || !newAddr.city}
          style={{flex:2, background:"#e8621a", border:"none", color:"#0a0909", fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:"0.1em", padding:"10px", borderRadius:2, cursor:"pointer", opacity: savingAddr?"0.5":1}}
        >
          {savingAddr ? "SAVING..." : "SAVE ADDRESS"}
        </button>
      </div>
    </div>
  </div>
)}
`
