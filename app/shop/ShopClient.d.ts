import type { ComponentType } from "react";

export type NormalizedProduct = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  was: number | null;
  badge: string | null;
  inStock: boolean;
  fitmentIds: number[] | null;
  image: string | null;
  mapPrice: number | null;
};

export type ShopClientProps = {
  initialProducts?: NormalizedProduct[];
  availableBrands?: string[];
  availableCategories?: string[];
  initialCategory?: string | null;
  initialBrand?: string | null;
  fetchError?: string | null;
};

declare const ShopClient: ComponentType<ShopClientProps>;
export default ShopClient;
