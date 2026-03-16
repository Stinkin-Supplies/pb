import { redirect } from "next/navigation";

export const metadata = { title: "Account | Stinkin' Supplies" };

export default function AccountPage() {
  redirect("/garage");
}
