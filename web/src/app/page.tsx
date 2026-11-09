const games = [
  {
    name: "Mobile Legends",
    category: "MOBA",
    short: "MLBB",
    gradient: "from-[#5943a5] via-[#30265c] to-[#171717]",
    symbol: "ML",
  },
  {
    name: "PUBG Mobile",
    category: "BATTLE ROYALE",
    short: "PUBG",
    gradient: "from-[#a66a32] via-[#51331f] to-[#171717]",
    symbol: "PUBG",
  },
  {
    name: "Free Fire",
    category: "BATTLE ROYALE",
    short: "FREE FIRE",
    gradient: "from-[#c94d28] via-[#67271e] to-[#171717]",
    symbol: "FF",
  },
  {
    name: "Roblox",
    category: "GAMING",
    short: "ROBLOX",
    gradient: "from-[#64717c] via-[#343c43] to-[#171717]",
    symbol: "R",
  },
  {
    name: "Steam",
    category: "PC GAMING",
    short: "STEAM",
    gradient: "from-[#315b86] via-[#20334a] to-[#171717]",
    symbol: "S",
  },
];

const products = [
  {
    name: "Mobile Legends Diamonds",
    type: "GAME TOP-UP",
    game: "MLBB",
    gradient: "from-[#7861cf] to-[#292044]",
    symbol: "💎",
  },
  {
    name: "PUBG Mobile UC",
    type: "GAME TOP-UP",
    game: "PUBG MOBILE",
    gradient: "from-[#c27b3c] to-[#49301e]",
    symbol: "⚡",
  },
  {
    name: "Free Fire Diamonds",
    type: "GAME TOP-UP",
    game: "FREE FIRE",
    gradient: "from-[#d65a37] to-[#54251f]",
    symbol: "♦",
  },
  {
    name: "Steam Wallet",
    type: "DIGITAL VOUCHER",
    game: "STEAM",
    gradient: "from-[#4779a5] to-[#202e43]",
    symbol: "S",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#171717] text-[#F2F0E9]">
      {/* Announcement */}
      <div className="bg-[#C6F36B] px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-[#171717] sm:text-xs">
        Your local gaming marketplace. Shop with confidence.
      </div>

      {/* Navigation */}
      <header className="relative z-10 border-b border-white/10 bg-[#171717]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
          <a href="#" className="text-2xl font-black italic tracking-[-0.08em] sm:text-3xl">
            RUANG<span className="text-[#C6F36B]">.</span>
            <span className="ml-1 text-[#F2F0E9]">DIGITAL</span>
          </a>

          <nav className="hidden items-center gap-8 text-xs font-bold uppercase tracking-wider text-white/60 md:flex">
            <a href="#games" className="transition hover:text-[#C6F36B]">Games</a>
            <a href="#popular" className="transition hover:text-[#C6F36B]">Top-ups</a>
            <a href="#how-it-works" className="transition hover:text-[#C6F36B]">How it works</a>
          </nav>

          <a
            href="#games"
            className="rounded-full bg-[#C6F36B] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-[#171717] transition hover:bg-white sm:text-xs"
          >
            Explore store ↗
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative border-b border-white/10">
        <div className="pointer-events-none absolute -right-40 -top-32 h-[500px] w-[500px] rounded-full bg-[#8D72F5]/15 blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-40 -left-32 h-[400px] w-[400px] rounded-full bg-[#C6F36B]/10 blur-[120px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:py-28 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-32">
          <div>
            <div className="mb-7 flex items-center gap-3">
              <span className="h-px w-8 bg-[#C6F36B]" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#C6F36B]">
                Brunei's digital gaming marketplace
              </span>
            </div>

            <h1 className="max-w-3xl text-5xl font-black uppercase leading-[0.92] tracking-[-0.065em] sm:text-7xl lg:text-[82px]">
              Your game.
              <br />
              Your world.
              <br />
              <span className="text-[#C6F36B]">Your space.</span>
            </h1>

            <p className="mt-8 max-w-lg text-sm leading-7 text-white/55 sm:text-base">
              Your favourite games, digital items and top-ups in one space.
              Shop smarter, play harder and leave the worries behind.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href="#games"
                className="rounded-full bg-[#C6F36B] px-7 py-4 text-xs font-black uppercase tracking-wider text-[#171717] transition hover:scale-[1.03] hover:bg-white"
              >
                Explore games <span className="ml-2">↗</span>
              </a>
              <a
                href="#how-it-works"
                className="px-4 py-4 text-xs font-bold uppercase tracking-wider text-white/65 transition hover:text-[#C6F36B]"
              >
                How it works →
              </a>
            </div>

            <div className="mt-14 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/10 pt-7">
              <div>
                <p className="text-lg font-black text-[#F2F0E9]">LOCAL</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">Brunei focused</p>
              </div>
              <div>
                <p className="text-lg font-black text-[#F2F0E9]">DIGITAL</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">Convenient shopping</p>
              </div>
              <div>
                <p className="text-lg font-black text-[#F2F0E9]">CONFIDENT</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">Shop with peace of mind</p>
              </div>
            </div>
          </div>

          {/* Hero graphic */}
          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -right-3 -top-5 h-full w-full rotate-3 rounded-[2rem] border border-[#8D72F5]/30" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#242424] p-6 sm:p-8">
              <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#C6F36B]/15 blur-[80px]" />
              <div className="relative flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">THE PLAYER'S SPACE</span>
                <span className="rounded-full border border-[#C6F36B]/30 px-3 py-1 text-[9px] font-bold text-[#C6F36B]">RD / 001</span>
              </div>

              <div className="relative py-14 text-center sm:py-20">
                <div className="mx-auto flex h-36 w-36 rotate-[-8deg] items-center justify-center rounded-[2rem] border border-[#C6F36B]/40 bg-gradient-to-br from-[#C6F36B]/20 via-[#8D72F5]/20 to-transparent shadow-[0_0_80px_rgba(198,243,107,0.12)] sm:h-44 sm:w-44">
                  <span className="text-7xl font-black italic tracking-[-0.12em] text-[#C6F36B] sm:text-8xl">RD</span>
                </div>
                <p className="mt-9 text-3xl font-black uppercase italic tracking-[-0.06em] sm:text-4xl">
                  PLAY YOUR WAY<span className="text-[#C6F36B]">.</span>
                </p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
                  More than just a marketplace
                </p>
              </div>

              <div className="relative flex items-center justify-between border-t border-white/10 pt-5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">RUANG DIGITAL / BRUNEI</span>
                <span className="text-xs font-black italic text-[#C6F36B]">EST. RD</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Games */}
      <section id="games" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#C6F36B]">Find your next move</p>
            <h2 className="text-3xl font-black uppercase tracking-[-0.055em] sm:text-5xl">
              Choose your <span className="text-white/35">game.</span>
            </h2>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">01 / GAME DIRECTORY</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {games.map((game, index) => (
            <a
              key={game.name}
              href="#popular"
              className={`group relative flex min-h-52 flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${game.gradient} p-5 transition duration-300 hover:-translate-y-1 hover:border-[#C6F36B]/60`}
            >
              <span className="absolute -right-5 -top-7 text-8xl font-black italic text-white/[0.07] transition group-hover:scale-110">
                {game.symbol}
              </span>
              <div className="relative flex items-center justify-between">
                <span className="text-[9px] font-black tracking-widest text-white/50">0{index + 1}</span>
                <span className="text-lg text-[#C6F36B]">↗</span>
              </div>
              <div className="relative">
                <p className="mb-2 text-[9px] font-black tracking-[0.16em] text-white/45">{game.category}</p>
                <h3 className="text-lg font-black uppercase leading-tight tracking-tight">{game.name}</h3>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-white/10 bg-[#202020]">
        <div className="mx-auto grid max-w-7xl gap-7 px-5 py-9 sm:grid-cols-3 lg:px-8">
          <div className="flex items-center gap-4">
            <span className="text-2xl text-[#C6F36B]">✳</span>
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Shop with confidence</p>
              <p className="mt-1 text-[10px] text-white/40">A marketplace built around trust.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-2xl text-[#C6F36B]">◇</span>
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Clear product details</p>
              <p className="mt-1 text-[10px] text-white/40">Know what you're purchasing.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-2xl text-[#C6F36B]">↗</span>
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Local marketplace</p>
              <p className="mt-1 text-[10px] text-white/40">Made with Brunei gamers in mind.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular products */}
      <section id="popular" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#C6F36B]">Level up your experience</p>
            <h2 className="text-3xl font-black uppercase tracking-[-0.055em] sm:text-5xl">
              Popular <span className="text-white/35">right now.</span>
            </h2>
          </div>
          <a href="#games" className="text-[10px] font-black uppercase tracking-widest text-[#C6F36B] hover:text-white">
            Browse games ↗
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product, index) => (
            <a
              href="#games"
              key={product.name}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-[#202020] transition hover:-translate-y-1 hover:border-[#C6F36B]/50"
            >
              <div className={`relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br ${product.gradient}`}>
                <span className="absolute -right-5 -top-10 text-9xl font-black italic text-white/10">{product.game}</span>
                <span className="relative text-6xl drop-shadow-lg transition duration-300 group-hover:scale-110">{product.symbol}</span>
                <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/20 px-3 py-1 text-[8px] font-black tracking-widest text-white/75">
                  {product.type}
                </span>
              </div>
              <div className="p-5">
                <p className="text-[9px] font-black tracking-[0.16em] text-[#C6F36B]">{product.game}</p>
                <h3 className="mt-2 text-sm font-black uppercase tracking-tight">{product.name}</h3>
                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">View options</span>
                  <span className="text-lg text-[#C6F36B] transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative overflow-hidden border-y border-white/10 bg-[#202020]">
        <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-[#8D72F5]/10 blur-[100px]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-2 lg:px-8 lg:py-24">
          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#C6F36B]">Simple. Straightforward.</p>
            <h2 className="max-w-lg text-4xl font-black uppercase leading-[0.95] tracking-[-0.06em] sm:text-6xl">
              Less worry.
              <br />
              <span className="text-[#C6F36B]">More gaming.</span>
            </h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-white/50">
              Find what you need, review the details and place your order.
              A better way to shop for your digital gaming needs.
            </p>
          </div>

          <div className="space-y-0">
            {[
              ["01", "Find your product", "Choose a game, top-up or digital item."],
              ["02", "Review your order", "Check the product details before proceeding."],
              ["03", "Place your order", "Follow the checkout instructions to complete your purchase."],
            ].map(([number, title, description]) => (
              <div key={number} className="flex gap-5 border-b border-white/10 py-6 first:pt-0 last:border-0">
                <span className="pt-1 text-sm font-black text-[#C6F36B]">{number}</span>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">{title}</h3>
                  <p className="mt-2 text-xs leading-6 text-white/45">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing banner */}
      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#C6F36B] px-7 py-12 text-[#171717] sm:px-12 sm:py-16">
          <div className="absolute -right-12 -top-24 h-72 w-72 rounded-full border-[35px] border-black/[0.06]" />
          <div className="relative max-w-2xl">
            <p className="mb-4 text-[10px] font-black uppercase tracking-[0.22em]">Your space starts here</p>
            <h2 className="text-4xl font-black uppercase leading-[0.95] tracking-[-0.06em] sm:text-6xl">
              Skip the scams.
              <br />
              Shop with confidence.
            </h2>
            <a
              href="#games"
              className="mt-8 inline-flex rounded-full bg-[#171717] px-7 py-4 text-xs font-black uppercase tracking-wider text-[#F2F0E9] transition hover:bg-[#8D72F5]"
            >
              Start exploring ↗
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#141414]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-9 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <a href="#" className="text-xl font-black italic tracking-[-0.08em]">
              RUANG<span className="text-[#C6F36B]">.</span>DIGITAL
            </a>
            <p className="mt-2 text-[10px] text-white/35">Your game. Your world. Your space.</p>
          </div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">
© 2026 Ruang Digital. All rights reserved.          </p>
        </div>
      </footer>
    </main>
  );
}