export default function StoreIcon({ name, size = 24 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    home: "M3 11 12 3l9 8v10h-6v-7H9v7H3Z",
    games: "M7 7h10c3 0 5 10 3 12-2 1-4-3-5-3H9c-1 0-3 4-5 3C2 17 4 7 7 7ZM6 11h5m-2.5-2.5v5M16 11h.01M19 13h.01",
    cart: "M2 3h3l3 12h10l3-9H6M9 20h.01M18 20h.01",
    orders: "M6 3h12v18H6ZM9 7h6M9 11h6M9 15h4",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Zm-4 10 3 3 5-6",
    support: "M4 13v-2a8 8 0 0 1 16 0v2M4 12H2v7h4v-7Zm16 0h2v7h-4v-7ZM20 19c0 3-4 3-7 3",
    bolt: "m14 1-11 13h8l-1 9L21 9h-8Z",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === "bolt" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.games} /></svg>;
}
