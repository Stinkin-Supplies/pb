"use client";

import FilterGroupLinks from "@/components/FilterGroupLinks";
import { useRouter } from "next/navigation";

export default function ModelShop() {
  const router = useRouter();

  function handleSelect(familyName: string) {
    router.push(`/harley/${familyName.toLowerCase()}`);
  }

  return (
    <main style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <FilterGroupLinks onSelect={handleSelect} />
    </main>
  );
}
