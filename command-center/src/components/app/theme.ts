"use client";
export function getTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
export function setTheme(t: "dark" | "light") {
  document.documentElement.classList.toggle("dark", t === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#06070b" : "#f4f5f8");
  try {
    localStorage.setItem("cc.theme", t);
  } catch {}
}
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('cc.theme')||'dark';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark')}})();`;
