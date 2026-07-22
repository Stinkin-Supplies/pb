"use client";
// components/admin/AdminSidebarNav.jsx
// Renders the admin sidebar's nav links with active-state highlighting.
// Split out from app/admin/layout.jsx (a server component, needed for the
// Supabase auth check) since usePathname() requires a client component.

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminSidebarNav({ nav }) {
  const pathname = usePathname();

  return (
    <>
      {nav.map(({ section, links }) => (
        <div key={section} className="sidebar-section">
          <div className="sidebar-section-label">{section}</div>
          {links.map(({ href, icon, label }) => {
            // Match on the path only (ignore query strings like ?token=),
            // exact for "/admin" itself so it doesn't light up for every
            // sub-route, prefix match otherwise.
            const path = href.split("?")[0];
            const active = path === "/admin"
              ? pathname === "/admin"
              : pathname === path || pathname.startsWith(path + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`sidebar-link${active ? " active" : ""}`}
              >
                <span className="sidebar-link-icon">{icon}</span>
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}
