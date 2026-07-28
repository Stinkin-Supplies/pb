import { redirect } from "next/navigation";

export const metadata = { title: "Orders | Redirecting..." };

export default function AccountOrdersPage() {
  redirect("/garage?tab=ORDERS");
}
