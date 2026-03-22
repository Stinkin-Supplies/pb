import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #e8621a; }

  .admin-shell {
    display: grid;
    grid-template-columns: 220px 1fr;
    min-height: 100vh;
    background: #0a0909;
    color: #f0ebe3;
    font-family: 'Barlow Condensed', sans-serif;
  }

  /* ── SIDEBAR ── */
  .admin-sidebar {
    background: #0d0c0c;
    border-right: 1px solid #1a1919;
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .sidebar-logo {
    padding: 20px 18px 16px;
    border-bottom: 1px solid #1a1919;
  }
  .sidebar-logo-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 18px;
    letter-spacing: 0.08em;
    color: #f0ebe3;
    line-height: 1;
  }
  .sidebar-logo-title span { color: #e8621a; }
  .sidebar-logo-sub {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px;
    color: #e8621a;
    letter-spacing: 0.2em;
    margin-top: 4px;
  }

  .sidebar-section {
    padding: 16px 0 4px;
  }
  .sidebar-section-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px;
    color: #3a3838;
    letter-spacing: 0.2em;
    padding: 0 18px;
    margin-bottom: 4px;
  }

  .sidebar-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 18px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    color: #8a8784;
    text-decoration: none;
    transition: all 0.15s;
    border-left: 2px solid transparent;
    position: relative;
  }
  .sidebar-link:hover {
    color: #f0ebe3;
    background: rgba(255,255,255,0.02);
    border-left-color: #2a2828;
  }
  .sidebar-link.active {
    color: #e8621a;
    background: rgba(232,98,26,0.06);
    border-left-color: #e8621a;
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
    border-top: 1px solid #1a1919;
  }
  .sidebar-footer-email {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px;
    color: #3a3838;
    letter-spacing: 0.1em;
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sidebar-footer-link {
    display: block;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: #8a8784;
    letter-spacing: 0.12em;
    text-decoration: none;
    transition: color 0.15s;
  }
  .sidebar-footer-link:hover { color: #e8621a; }

  /* ── MAIN CONTENT ── */
  .admin-main {
    overflow-y: auto;
    min-height: 100vh;
  }

  /* ── TOP BAR ── */
  .admin-topbar {
    background: #0d0c0c;
    border-bottom: 1px solid #1a1919;
    padding: 12px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .topbar-breadcrumb {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: #8a8784;
    letter-spacing: 0.15em;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .topbar-breadcrumb span { color: #f0ebe3; }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .topbar-store-link {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    color: #8a8784;
    letter-spacing: 0.12em;
    text-decoration: none;
    border: 1px solid #2a2828;
    padding: 5px 12px;
    border-radius: 2px;
    transition: all 0.15s;
  }
  .topbar-store-link:hover { border-color: #e8621a; color: #e8621a; }

  @media (max-width: 768px) {
    .admin-shell { grid-template-columns: 1fr; }
    .admin-sidebar { display: none; }
  }
`;

const NAV = [
  {
    section: "OVERVIEW",
    links: [
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
      { href: "/admin/sync",    icon: "↺", label: "SYNC"         },
      { href: "/admin/products",icon: "▤", label: "PRODUCTS"     },
    ],
  },
  {
    section: "STORE",
    links: [
      { href: "/shop",   icon: "↗", label: "VIEW STORE"  },
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
                <a href="/shop" className="topbar-store-link">↗ VIEW STORE</a>
              </div>
            </div>

            {children}
          </div>

        </div>
    </>
  );
}