"use client";

import { useEffect } from "react";
import { useCart } from "@/components/CartContext";
import Link from "next/link";

export default function CheckoutSuccessPage() {
  const { clearCart } = useCart();

  useEffect(() => {
    clearCart();
    try { localStorage.removeItem("ss_cart"); } catch (_) {}
  }, [clearCart]);

  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  });

  return (
    <div style={{
      background: 'var(--coal)',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    }}>

      {/* Receipt */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: '#faf7ee',
        position: 'relative',
        boxShadow: '0 4px 0 rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.35)',
        backgroundImage: 'linear-gradient(transparent, transparent 23px, rgba(0,0,80,0.04) 23px, rgba(0,0,80,0.04) 24px)',
        backgroundSize: '100% 24px',
      }}>

        {/* Perforated top */}
        <div style={{
          height: 16,
          background: 'radial-gradient(circle at 50% 0%, var(--coal) 6px, transparent 6px) top center / 18px 9px repeat-x, #faf7ee',
        }} />

        {/* Receipt content */}
        <div style={{ padding: '4px 36px 0' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{
              fontFamily: 'var(--font-tanker)',
              fontSize: 20,
              letterSpacing: '0.06em',
              color: '#1a1208',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}>
              STINKIN&apos; SUPPLIES
            </div>
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 8,
              letterSpacing: '0.10em',
              color: '#6a5a3a',
              textTransform: 'uppercase',
              lineHeight: 1.7,
            }}>
              AUTHORIZED H-D AFTERMARKET PARTS<br />
              DAYTONA BEACH, FL  ·  (386) 555-0148
            </div>
          </div>

          <div style={{ border: 'none', borderTop: '1px dashed rgba(139,110,44,0.35)', margin: '0 0 12px' }} />

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-stencil)',
            fontSize: 9,
            letterSpacing: '0.10em',
            color: '#6a5a3a',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}>
            <span>PARTS WORK ORDER</span>
            <span>DATE: {today}</span>
          </div>

          <div style={{ border: 'none', borderTop: '1px dashed rgba(139,110,44,0.35)', margin: '0 0 24px' }} />

          {/* PAID stamp — centered, rotated */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, position: 'relative' }}>
            <div style={{
              display: 'inline-block',
              transform: 'rotate(-4deg)',
              border: '4px solid #3a7a3a',
              padding: '8px 20px',
              position: 'relative',
            }}>
              {/* Inner double border */}
              <div style={{
                position: 'absolute',
                inset: 3,
                border: '1px solid rgba(58,122,58,0.35)',
                pointerEvents: 'none',
              }} />
              <div style={{
                fontFamily: 'var(--font-tanker)',
                fontSize: 48,
                letterSpacing: '0.08em',
                color: '#3a7a3a',
                lineHeight: 1,
                textTransform: 'uppercase',
                opacity: 0.85,
              }}>
                PAID
              </div>
              <div style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 8,
                letterSpacing: '0.14em',
                color: '#3a7a3a',
                textAlign: 'center',
                opacity: 0.70,
                marginTop: 2,
              }}>
                ORDER CONFIRMED
              </div>
            </div>
          </div>

          <div style={{ border: 'none', borderTop: '1px dashed rgba(139,110,44,0.35)', margin: '0 0 20px' }} />

          {/* Confirmation message */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 10,
              letterSpacing: '0.12em',
              color: '#3a2a10',
              textTransform: 'uppercase',
              lineHeight: 1.8,
            }}>
              YOUR PARTS ORDER HAS BEEN PLACED<br />
              SUCCESSFULLY. YOU WILL RECEIVE<br />
              AN EMAIL CONFIRMATION SHORTLY.
            </div>
          </div>

          <div style={{ border: 'none', borderTop: '1px dashed rgba(139,110,44,0.35)', margin: '0 0 20px' }} />

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
            <Link
              href="/browse"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '13px',
                background: '#1a1208',
                border: '2px solid #1a1208',
                color: '#c9a84c',
                fontFamily: 'var(--font-stencil)',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
            >
              CONTINUE SHOPPING →
            </Link>
            <Link
              href="/garage?tab=ORDERS"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '12px',
                background: 'transparent',
                border: '1px dashed rgba(139,110,44,0.40)',
                color: '#6a5a3a',
                fontFamily: 'var(--font-stencil)',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              VIEW YOUR ORDERS
            </Link>
          </div>

          <div style={{ border: 'none', borderTop: '1px dashed rgba(139,110,44,0.35)', margin: '20px 0 10px' }} />

          {/* Receipt footer */}
          <div style={{
            textAlign: 'center',
            fontFamily: 'var(--font-stencil)',
            fontSize: 8,
            letterSpacing: '0.10em',
            color: '#8a7050',
            textTransform: 'uppercase',
            lineHeight: 1.8,
            paddingBottom: 4,
          }}>
            <div>● RETAIN THIS COPY FOR YOUR RECORDS</div>
            <div>THANK YOU FOR YOUR BUSINESS</div>
          </div>
        </div>

        {/* Perforated bottom */}
        <div style={{
          height: 16,
          background: 'radial-gradient(circle at 50% 100%, var(--coal) 6px, transparent 6px) bottom center / 18px 9px repeat-x, #faf7ee',
        }} />
      </div>
    </div>
  );
}
