import { redirect } from "next/navigation";

export const metadata = { title: "Points | Redirecting..." };

export default function PointsPage() {
  redirect("/garage");
}
