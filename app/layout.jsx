import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #f2ede4; }
  ::-webkit-scrollbar-thumb { background: rgba(184,146,42,0.4); border-radius: 2px; }

  .admin-shell {
    display: grid;
    grid-template-columns: 210px 1fr;
    min-height: 100vh;
    background: #faf7f2;
    color: #2a1f0e;
    font-family: var(--font-stencil), monospace;
  }

  /* ── SIDEBAR ── */
  .admin-sidebar {
    background: #2a1f0e;
    border-right: 1px solid rgba(184,146,42,0.2);
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .sidebar-logo {
    padding: 20px 18px 16px;
    border-bottom: 1px solid rgba(184,146,42,0.15);
  }
  .sidebar-logo-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: 17px;
    letter-spacing: 0.08em;
    color: #f5f0e8;
    line-height: 1;
  }
  .sidebar-logo-title span { color: #b8922a; }
  .sidebar-logo-sub {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    color: rgba(184,146,42,0.6);
    letter-spacing: 0.22em;
    margin-top: 5px;
    text-transform: uppercase;
  }

  .sidebar-section {
    padding: 14px 0 2px;
  }
  .sidebar-section-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    color: rgba(184,146,42,0.35);
    letter-spacing: 0.22em;
    padding: 0 18px;
    margin-bottom: 3px;
    text-transform: uppercase;
  }

  .sidebar-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 18px;
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    color: rgba(245,240,232,0.5);
    text-decoration: none;
    transition: all 0.15s;
    border-left: 2px solid transparent;
    text-transform: uppercase;
  }
  .sidebar-link:hover {
    color: #f5f0e8;
    background: rgba(184,146,42,0.06);
    border-left-color: rgba(184,146,42,0.3);
  }
  .sidebar-link.active {
    color: #b8922a;
    background: rgba(184,146,42,0.1);
    border-left-color: #b8922a;
  }
  .sidebar-link-icon {
    font-size: 12px;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .sidebar-footer {
    margin-top: auto;
    padding: 14px 18px;
    border-top: 1px solid rgba(184,146,42,0.15);
  }
  .sidebar-footer-email {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    color: rgba(184,146,42,0.4);
    letter-spacing: 0.1em;
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sidebar-footer-link {
    display: block;
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    color: rgba(245,240,232,0.4);
    letter-spacing: 0.12em;
    text-decoration: none;
    transition: color 0.15s;
    text-transform: uppercase;
  }
  .sidebar-footer-link:hover { color: #b8922a; }

  /* ── MAIN CONTENT ── */
  .admin-main {
    overflow-y: auto;
    min-height: 100vh;
    background: #faf7f2;
  }

  /* ── TOP BAR ── */
  .admin-topbar {
    background: #ffffff;
    border-bottom: 1px solid rgba(184,146,42,0.2);
    padding: 11px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .topbar-breadcrumb {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    color: #b8922a;
    letter-spacing: 0.18em;
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
  }
  .topbar-breadcrumb span { color: #2a1f0e; }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .topbar-store-link {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    color: #8a7a5a;
    letter-spacing: 0.12em;
    text-decoration: none;
    border: 1px solid rgba(184,146,42,0.3);
    padding: 5px 12px;
    border-radius: 2px;
    transition: all 0.15s;
    text-transform: uppercase;
  }
  .topbar-store-link:hover { border-color: #b8922a; color: #b8922a; }

  @media (max-width: 768px) {
    .admin-shell { grid-template-columns: 1fr; }
    .admin-sidebar { display: none; }
  }
`;

const NAV = [
  {
    section: "OVERVIEW",
    links: [
      { href: "/admin/build-tracker", icon: "⌁", label: "BUILD TRACKER" },
      { href: "/admin",         icon: "◈", label: "DASHBOARD"   },
    ],
  },
  {
    section: "COMMERCE",
    links: [
      { href: "/admin/orders",  icon: "◫", label: "ORDERS"      },
      { href: "/admin/points",  icon: "★", label: "POINTS"      },
    ],
  },
  {
    section: "PRICING",
    links: [
      { href: "/admin/map",        icon: "⚑", label: "MAP COMPLIANCE"  },
      { href: "/admin/competitors", icon: "◎", label: "COMPETITOR PRICING" },
    ],
  },
  {
    section: "VENDOR",
    links: [
      { href: "/admin/fitment",      icon: "⇌", label: "FITMENT & OEM"  },
      { href: "/admin/catalog",      icon: "◧", label: "CATALOG"        },
      { href: "/admin/sync",         icon: "↺", label: "SYNC"           },
      { href: "/admin/products",     icon: "▤", label: "PRODUCTS"       },
      { href: "/admin/oem-crossref", icon: "⇄", label: "OEM CROSS-REF"  },
    ],
  },
  {
    section: "STORE",
    links: [
      { href: "/browse",   icon: "↗", label: "VIEW STORE"  },
      { href: "/garage", icon: "⌂", label: "MY GARAGE"   },
    ],
  },
];

export default async function AdminLayout({ children, params }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth?next=/admin");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name, last_name, email, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/garage");

  // Get current path for active link highlighting
  // We pass it down via a data attribute trick since this is a server component
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || user.email;

  return (
    <>
      <style>{css}</style>
      <div className="admin-shell">

          {/* SIDEBAR */}
          <aside className="admin-sidebar">
            <div className="sidebar-logo">
              <div className="sidebar-logo-title">STINKIN<span>'</span> SUPPLIES</div>
              <div className="sidebar-logo-sub">ADMIN PANEL</div>
            </div>

            {NAV.map(({ section, links }) => (
              <div key={section} className="sidebar-section">
                <div className="sidebar-section-label">{section}</div>
                {links.map(({ href, icon, label }) => (
                  <a key={href} href={href} className="sidebar-link">
                    <span className="sidebar-link-icon">{icon}</span>
                    {label}
                  </a>
                ))}
              </div>
            ))}

            <div className="sidebar-footer">
              <div className="sidebar-footer-email">{profile?.email ?? user.email}</div>
              <a href="/auth/signout" className="sidebar-footer-link">SIGN OUT →</a>
            </div>
          </aside>

          {/* MAIN */}
          <div className="admin-main">
            <div className="admin-topbar">
              <div className="topbar-breadcrumb">
                ADMIN <span style={{ color: "#3a3838" }}>/ </span>
                <span>STINKIN' SUPPLIES</span>
              </div>
              <div className="topbar-right">
                <a href="/browse" className="topbar-store-link">↗ VIEW STORE</a>
              </div>
            </div>

            {children}
          </div>

        </div>
    </>
  );
}
