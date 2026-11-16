"use client";
import { useEffect, useRef, useState } from "react";

const links = [["Games", "/#games"], ["Top-ups", "/#popular"], ["How it works", "/#how-it-works"]] as const;

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setIsOpen(false); toggleRef.current?.focus(); }
    }
    function closeOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [isOpen]);
  return (
    <div ref={menuRef} className="store-mobile-nav" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
      <button ref={toggleRef} type="button" aria-label={isOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={isOpen} aria-controls="store-mobile-menu" onClick={() => setIsOpen((open) => !open)} className="store-menu-toggle">
        <span aria-hidden="true">{isOpen ? "×" : "☰"}</span>
      </button>
      <nav id="store-mobile-menu" aria-label="Mobile navigation" hidden={!isOpen}>
        {links.map(([label, href]) => <a key={label} href={href} onClick={() => setIsOpen(false)}>{label}</a>)}
      </nav>
    </div>
  );
}
