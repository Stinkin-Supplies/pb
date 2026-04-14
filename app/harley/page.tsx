import HarleySearchClient from "./HarleySearchClient";
import { HARLEY_STYLES } from "@/lib/harley/config";

export default async function HarleyPage() {
  return <HarleySearchClient initialStyles={HARLEY_STYLES} />;
}

export const metadata = {
  title: "Harley Shop | Stinkin' Supplies",
  description: "Harley-first shopping with style, model, and submodel selection.",
};
