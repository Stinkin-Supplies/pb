import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #c9a84c; }

  .admin-shell {
    display: grid;
    grid-template-columns: 220px 1fr;
    min-height: 100vh;
    background: #f5f0e8;
    color: #1a1208;
    font-family: var(--font-stencil), sans-serif;
  }

  /* ── SIDEBAR ── */
  .admin-sidebar {
    background: #ffffff;
    border-right: 1px solid #e6dcc0;
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .sidebar-logo {
    padding: 20px 18px 16px;
    border-bottom: 1px solid #e6dcc0;
  }
  .sidebar-logo-title {
    font-family: var(--font-caesar), sans-serif;
    font-size: 18px;
    letter-spacing: 0.08em;
    color: #1a1208;
    line-height: 1;
  }
  .sidebar-logo-title span { color: #c9a84c; }
  .sidebar-logo-sub {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    color: #c9a84c;
    letter-spacing: 0.2em;
    margin-top: 4px;
  }

  .sidebar-section {
    padding: 16px 0 4px;
  }
  .sidebar-section-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    color: #9c8a6a;
    letter-spacing: 0.2em;
    padding: 0 18px;
    margin-bottom: 4px;
  }

  .sidebar-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 18px;
    font-family: var(--font-stencil), monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    color: #7a6a4f;
    text-decoration: none;
    transition: all 0.15s;
    border-left: 2px solid transparent;
    position: relative;
  }
  .sidebar-link:hover {
    color: #1a1208;
    background: rgba(201,168,76,0.05);
    border-left-color: #ddd0b8;
  }
  .sidebar-link.active {
    color: #a3822c;
    background: rgba(201,168,76,0.12);
    border-left-color: #c9a84c;
  }
  .sidebar-link-icon {
    font-size: 13px;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .sidebar-footer {
    margin-top: auto;
    padding: 14px 18px;
    border-top: 1px solid #e6dcc0;
  }
  .sidebar-footer-email {
    font-family: var(--font-stencil), monospace;
    font-size: 8px;
    color: #9c8a6a;
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
    color: #7a6a4f;
    letter-spacing: 0.12em;
    text-decoration: none;
    transition: color 0.15s;
  }
  .sidebar-footer-link:hover { color: #a3822c; }

  /* ── MAIN CONTENT ── */
  .admin-main {
    overflow-y: auto;
    min-height: 100vh;
  }

  /* ── TOP BAR ── */
  .admin-topbar {
    background: #ffffff;
    border-bottom: 1px solid #e6dcc0;
    padding: 12px 28px;
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
    color: #7a6a4f;
    letter-spacing: 0.15em;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .topbar-breadcrumb span { color: #1a1208; }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .topbar-store-link {
    font-family: var(--font-stencil), monospace;
    font-size: 9px;
    color: #7a6a4f;
    letter-spacing: 0.12em;
    text-decoration: none;
    border: 1px solid #ddd0b8;
    padding: 5px 12px;
    border-radius: 2px;
    transition: all 0.15s;
  }
  .topbar-store-link:hover { border-color: #c9a84c; color: #a3822c; }

  @media (max-width: 768px) {
    .admin-shell { grid-template-columns: 1fr; }
    .admin-sidebar { display: none; }
  }
`;

export default async function AdminLayout({ children }) {
  const NAV = [
    {
      section: "OVERVIEW",
      links: [
        { href: "/admin/build-tracker", icon: "⌁", label: "BUILD TRACKER" },
        { href: "/admin/database", icon: "◫", label: "DATABASE SNAPSHOT" },
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
        { href: "/admin/fitment",      icon: "⇌", label: "FITMENT & OEM"      },
        { href: "/admin/catalog",      icon: "◧", label: "CATALOG"             },
        { href: "/admin/sync",         icon: "↺", label: "SYNC"                },
        { href: "/admin/products",     icon: "▤", label: "PRODUCTS"            },
        { href: "/admin/oem-crossref", icon: "⇄", label: "OEM CROSS-REF"       },
        { href: `/admin/canonical-matches?token=${process.env.ADMIN_SECRET}`, icon: "⇆", label: "CANONICAL MATCHES" },
        { href: `/admin/parts-timeline?token=${process.env.ADMIN_SECRET}`, icon: "▬", label: "PARTS TIMELINE"     },
        { href: `/admin/review-queue?token=${process.env.ADMIN_SECRET}`, icon: "⚑", label: "REVIEW QUEUE"        },
      ],
    },
    {
      section: "STORE",
      links: [
        { href: "/browse", icon: "↗", label: "VIEW STORE" },
        { href: "/garage", icon: "⌂", label: "MY GARAGE"  },
      ],
    },
  ];
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth?next=/admin");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name, last_name, email, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/garage");

  return (
    <>
      <style>{css}</style>
      <div className="admin-shell">

          {/* SIDEBAR */}
          <aside className="admin-sidebar">
            <div className="sidebar-logo">
              <div className="sidebar-logo-title">STINKIN<span>&apos;</span> SUPPLIES</div>
              <div className="sidebar-logo-sub">ADMIN PANEL</div>
            </div>

            {NAV.map(({ section, links }) => (
              <div key={section} className="sidebar-section">
                <div className="sidebar-section-label">{section}</div>
                {links.map(({ href, icon, label }) => (
                  <Link key={href} href={href} className="sidebar-link">
                    <span className="sidebar-link-icon">{icon}</span>
                    {label}
                  </Link>
                ))}
              </div>
            ))}

            <div className="sidebar-footer">
              <div className="sidebar-footer-email">{profile?.email ?? user.email}</div>
              <Link href="/auth/signout" className="sidebar-footer-link">SIGN OUT →</Link>
            </div>
          </aside>

          {/* MAIN */}
          <div className="admin-main">
            <div className="admin-topbar">
              <div className="topbar-breadcrumb">
                ADMIN <span style={{ color: "#9c8a6a" }}>/ </span>
                <span>STINKIN&apos; SUPPLIES</span>
              </div>
              <div className="topbar-right">
                <Link href="/database" className="topbar-store-link">◌ PUBLIC SNAPSHOT</Link>
                <Link href="/browse" className="topbar-store-link">↗ VIEW STORE</Link>
              </div>
            </div>

            {children}
          </div>

        </div>
    </>
  );
}
