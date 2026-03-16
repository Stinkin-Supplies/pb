import { redirect } from "next/navigation";

export const metadata = { title: "Wishlist | Redirecting..." };

export default function WishlistPage() {
  redirect("/garage");
}
