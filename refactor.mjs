import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = {
  'bg-surface': 'bg-gray-900',
  'bg-background': 'bg-gray-950',
  'border-border': 'border-white/10',
  'text-text-high': 'text-white',
  'text-text-med': 'text-gray-400',
  'text-primary': 'text-indigo-400',
  'bg-primary': 'bg-indigo-600',
  'text-error': 'text-red-400',
  'bg-error': 'bg-red-500',
  'text-success': 'text-green-400',
  'bg-success': 'bg-green-500',
  'text-warning': 'text-yellow-400',
  'bg-warning': 'bg-yellow-500',
  'rounded-card': 'rounded-xl ring-1 ring-inset ring-white/10 shadow-sm',
  'rounded-button': 'rounded-md shadow-sm',
  'rounded-input': 'rounded-md shadow-sm',
  'btn-base': 'inline-flex items-center justify-center gap-x-1.5 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 hover:bg-white/20 transition-colors disabled:opacity-50 ring-1 ring-inset ring-gray-700',
  'btn-active': 'bg-indigo-500 text-white hover:bg-indigo-400 ring-transparent shadow-sm focus-visible:outline-indigo-500 border-transparent',
  'btn-danger': 'bg-red-500 text-white hover:bg-red-400 ring-transparent shadow-sm focus-visible:outline-red-500 border-transparent',
  'column-header': 'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-white/10 bg-gray-900/50',
  'font-display': 'font-sans',
};

for (const [key, value] of Object.entries(replacements)) {
  const regex = new RegExp(`\\b${key}\\b`, 'g');
  content = content.replace(regex, value);
}

fs.writeFileSync('src/App.tsx', content);
console.log("Replaced colors and classes in App.tsx");
