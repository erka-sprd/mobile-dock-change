import React, { useState } from "react";
import { Drawer } from "vaul";

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quantities: Record<string, number>;
  setQuantities: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  unitPrice: number;
  outOfStock?: string[];
  sizes?: readonly string[];
  onAddToCart?: () => void;
}

export default function SizeSelection({ open, onOpenChange, quantities, setQuantities, unitPrice, outOfStock = [], sizes = DEFAULT_SIZES, onAddToCart }: Props) {
  const totalQty = sizes.reduce((a, k) => a + (quantities[k] ?? 0), 0);
  const totalPrice = (totalQty * unitPrice).toFixed(2).replace(".", ",") + " €";
  const hasAny = totalQty > 0;
  const [scrolled, setScrolled] = useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }} />
        <Drawer.Content style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16,
          outline: "none", fontFamily: '"Inter Variable", sans-serif',
          display: "flex", flexDirection: "column", height: "calc(100dvh - 32px)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 16px 12px", boxShadow: scrolled ? "0 2px 8px rgba(0,0,0,0.08)" : "none", transition: "box-shadow 0.2s ease" }}>
            <span className="font-outer-sans" style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>Select size and quantity</span>
            <img src="/icons/icon-close-x.svg" alt="Close" style={{ width: 24, height: 24, cursor: "pointer" }} onClick={() => onOpenChange(false)} />
          </div>
          <div style={{ width: "100%", height: 1, background: "#e8e8e8" }} />

          {/* Sizes list */}
          <div style={{ overflowY: "auto", flex: 1 }} onScroll={e => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 0)}>
            {sizes.map((size: string, i: number) => {
              const qty = quantities[size] ?? 0;
              const oos = outOfStock.indexOf(size) !== -1;
              return (
                <div key={size}>
                  <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 56 }}>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: oos ? "#aaa" : "#111" }}>{size}</span>
                    {oos && <span style={{ fontSize: 13, color: "#DC2626", marginRight: 16 }}>Out of stock</span>}
                    <div style={{ display: "flex", alignItems: "center", gap: 0, opacity: oos ? 0.3 : 1 }}>
                      <button
                        type="button"
                        disabled={oos || qty === 0}
                        onClick={() => setQuantities(q => ({ ...q, [size]: Math.max(0, (q[size] ?? 0) - 1) }))}
                        style={{ width: 36, height: 36, borderRadius: 0, border: "1px solid #d0d0d0", background: "#fff", fontSize: 22, fontWeight: 300, display: "flex", alignItems: "center", justifyContent: "center", cursor: qty === 0 || oos ? "default" : "pointer", color: "#111" }}
                      >−</button>
                      <span style={{ width: 36, height: 36, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 15, fontWeight: 600, borderTop: "1px solid #d0d0d0", borderBottom: "1px solid #d0d0d0", borderLeft: "none", borderRight: "none" }}>{qty}</span>
                      <button
                        type="button"
                        disabled={oos}
                        onClick={() => setQuantities(q => ({ ...q, [size]: (q[size] ?? 0) + 1 }))}
                        style={{ width: 36, height: 36, borderRadius: 0, border: "1px solid #d0d0d0", background: "#fff", fontSize: 22, fontWeight: 300, display: "flex", alignItems: "center", justifyContent: "center", cursor: oos ? "default" : "pointer", color: "#111" }}
                      >+</button>
                    </div>
                  </div>
                  {i < sizes.length - 1 && <div style={{ height: 1, background: "#f0f0f0", margin: "0 16px" }} />}
                </div>
              );
            })}
          </div>

          {/* Shipping note */}
          <div style={{ padding: "10px 16px", background: "#f7f7f7", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#555" }}>🚚 Apr. 16–20 or faster</span>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 16px 12px", borderTop: "1px solid #e8e8e8" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{totalPrice}</span>
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>VAT included, excl. shipping</div>
            <button
              type="button"
              disabled={!hasAny}
              onClick={() => { if (!hasAny) return; onAddToCart?.(); onOpenChange(false); }}
              style={{ width: "100%", height: 52, borderRadius: 999, border: "none", background: hasAny ? "#111" : "#ccc", color: "#fff", fontSize: 16, fontWeight: 700, cursor: hasAny ? "pointer" : "default" }}
            >
              Add to cart
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
