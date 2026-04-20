import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = {
  // Base backgrounds
  'bg-gray-950': 'bg-[#050505]',
  'bg-gray-900': 'bg-[#0f172a]',
  'bg-gray-900/50': 'bg-[#0f172a]/50',

  // Borders
  'border-white/10': 'border-[#1e293b]',
  'ring-white/10': 'ring-[#1e293b]',
  'ring-gray-700': 'ring-[#1e293b]',

  // Primary colors (Indigo -> Cyan)
  'bg-indigo-600': 'bg-[#00f3ff] text-black shadow-[0_0_10px_rgba(0,243,255,0.4)]',
  'bg-indigo-500': 'bg-[#00f3ff] text-black shadow-[0_0_10px_rgba(0,243,255,0.4)]',
  'hover:bg-indigo-500': 'hover:bg-[#00f3ff] hover:text-black',
  'hover:bg-indigo-400': 'hover:bg-[#00f3ff]/80',
  'text-indigo-400': 'text-[#00f3ff]',
  'text-indigo-500': 'text-[#00f3ff]',
  'focus:ring-indigo-500': 'focus:ring-[#00f3ff]',
  'focus-visible:outline-indigo-500': 'focus-visible:outline-[#00f3ff]',

  // Surface Text
  'text-gray-400': 'text-[#00f3ff]/70',
  'text-white': 'text-white',

  // Radii
  'rounded-xl': 'rounded-none',
  'rounded-lg': 'rounded-none',
  'rounded-md': 'rounded-none',
  'rounded-sm': 'rounded-none',

  // Shadows
  'shadow-sm': 'shadow-[0_0_10px_rgba(0,243,255,0.2)]',
  'shadow-2xl': 'shadow-[0_0_20px_rgba(0,243,255,0.15)]',

  // Typography for headers / chat (we'll ensure font-mono covers JetBrains Mono)
  'font-sans': 'font-sans',
};

for (const [key, value] of Object.entries(replacements)) {
  const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  content = content.replace(regex, value);
}

// Add the font-mono to headers (where tracking-widest uppercase might be)
content = content.replace(/font-semibold uppercase tracking-wider/g, 'font-mono font-bold uppercase tracking-widest');
// Also add Space mono / JetBrains mono to chat bubbles:
content = content.replace(/<p className="text-\[13px\] leading-relaxed">/g, '<p className="text-[13px] leading-relaxed font-mono">');
content = content.replace(/<h1 className="text-lg font-sans /g, '<h1 className="text-lg font-mono font-bold ');

fs.writeFileSync('src/App.tsx', content);
console.log("Refactored App.tsx for Cyberpunk Bold Neon");
