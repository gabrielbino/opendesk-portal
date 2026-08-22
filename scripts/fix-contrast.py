"""
Fix contrast issues across the entire project.
Strategy:
1. text-white that is INSIDE a gradient/blue bg context (same line or parent) -> KEEP
2. text-white that is standalone (no dark bg on same element) -> change to text-foreground
3. text-blue-300/400, text-cyan-300/400 -> change to text-primary (darker, better contrast)
4. text-white/XX opacity variants -> change to appropriate semantic colors
5. bg-slate-* remnants -> semantic equivalents
6. Status badge colors: light-300 variants -> darker 600/700 for light mode
"""

import re
import glob
import os

# Files to skip (they have intentional dark backgrounds)
SKIP_FILES = {'LoadingDemo.tsx'}

# Files where text-white is VALID because they have gradient/blue bg containers
# We need to be smart: text-white is fine when it's inside a blue/dark container
# But NOT fine when it's in a card/modal with white/light bg

def should_skip(filepath):
    basename = os.path.basename(filepath)
    return basename in SKIP_FILES

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # === PATTERN 1: Low contrast blue/cyan text -> darker versions ===
    # text-blue-300 -> text-blue-700 (good contrast on white)
    content = re.sub(r'\btext-blue-300\b', 'text-blue-700', content)
    # text-blue-400 -> text-blue-700
    content = re.sub(r'\btext-blue-400\b', 'text-blue-700', content)
    # text-cyan-300 -> text-cyan-700
    content = re.sub(r'\btext-cyan-300\b', 'text-cyan-700', content)
    # text-cyan-400 -> text-cyan-700
    content = re.sub(r'\btext-cyan-400\b', 'text-cyan-700', content)
    
    # === PATTERN 2: bg-blue-500/10 text-blue-400 badges -> darker text ===
    # Already handled by pattern 1
    
    # === PATTERN 3: Semi-transparent white text -> semantic ===
    # These are always problematic on light backgrounds
    content = re.sub(r'\btext-white/90\b', 'text-foreground/90', content)
    content = re.sub(r'\btext-white/80\b', 'text-foreground/80', content)
    content = re.sub(r'\btext-white/70\b', 'text-muted-foreground', content)
    content = re.sub(r'\btext-white/60\b', 'text-muted-foreground', content)
    content = re.sub(r'\btext-white/50\b', 'text-muted-foreground/70', content)
    content = re.sub(r'\btext-white/40\b', 'text-muted-foreground/50', content)
    content = re.sub(r'\btext-white/30\b', 'text-muted-foreground/40', content)
    content = re.sub(r'\btext-white/20\b', 'text-muted-foreground/30', content)
    
    # === PATTERN 4: Standalone text-white in non-gradient contexts ===
    # We need to be careful: text-white is fine when paired with bg-blue-*, bg-primary, gradient, etc.
    # Process line by line for context awareness
    lines = content.split('\n')
    new_lines = []
    for line in lines:
        if 'text-white' in line:
            # Check if this line has a dark background that justifies white text
            has_dark_bg = bool(re.search(
                r'bg-(?:gradient|blue-[5-9]|primary|brand|sidebar|destructive|emerald-[5-9]|green-[5-9]|red-[5-9]|amber-[5-9]|orange-[5-9]|purple-[5-9]|indigo-[5-9]|teal-[5-9]|rose-[5-9]|violet-[5-9]|cyan-[5-9]|slate-[7-9]|gray-[7-9]|zinc-[7-9]|neutral-[7-9])|from-(?:blue|cyan|indigo|purple|slate|gray|zinc)',
                line
            ))
            
            if not has_dark_bg:
                # Replace standalone text-white with text-foreground
                line = re.sub(r'\btext-white\b(?!/)', 'text-foreground', line)
        
        new_lines.append(line)
    
    content = '\n'.join(new_lines)
    
    # === PATTERN 5: Status badge colors for light mode ===
    # text-green-300 -> text-green-700
    content = re.sub(r'\btext-green-300\b', 'text-green-700', content)
    content = re.sub(r'\btext-green-400\b', 'text-green-700', content)
    # text-yellow-300 -> text-amber-700
    content = re.sub(r'\btext-yellow-300\b', 'text-amber-700', content)
    content = re.sub(r'\btext-yellow-400\b', 'text-amber-700', content)
    # text-red-300 -> text-red-700
    content = re.sub(r'\btext-red-300\b', 'text-red-700', content)
    content = re.sub(r'\btext-red-400\b', 'text-red-600', content)
    # text-orange-300 -> text-orange-700
    content = re.sub(r'\btext-orange-300\b', 'text-orange-700', content)
    content = re.sub(r'\btext-orange-400\b', 'text-orange-600', content)
    # text-purple-300 -> text-purple-700
    content = re.sub(r'\btext-purple-300\b', 'text-purple-700', content)
    content = re.sub(r'\btext-purple-400\b', 'text-purple-700', content)
    # text-indigo-300 -> text-indigo-700
    content = re.sub(r'\btext-indigo-300\b', 'text-indigo-700', content)
    content = re.sub(r'\btext-indigo-400\b', 'text-indigo-700', content)
    # text-emerald-300 -> text-emerald-700
    content = re.sub(r'\btext-emerald-300\b', 'text-emerald-700', content)
    content = re.sub(r'\btext-emerald-400\b', 'text-emerald-700', content)
    # text-teal-300 -> text-teal-700
    content = re.sub(r'\btext-teal-300\b', 'text-teal-700', content)
    content = re.sub(r'\btext-teal-400\b', 'text-teal-700', content)
    # text-amber-300 -> text-amber-700
    content = re.sub(r'\btext-amber-300\b', 'text-amber-700', content)
    
    # === PATTERN 6: bg-*-500/20 badge backgrounds -> lighter for light mode ===
    # bg-blue-500/20 -> bg-blue-100
    content = re.sub(r'\bbg-blue-500/20\b', 'bg-blue-100', content)
    content = re.sub(r'\bbg-blue-500/10\b', 'bg-blue-50', content)
    content = re.sub(r'\bbg-blue-500/15\b', 'bg-blue-100', content)
    # bg-green-500/20 -> bg-green-100
    content = re.sub(r'\bbg-green-500/20\b', 'bg-green-100', content)
    content = re.sub(r'\bbg-green-500/10\b', 'bg-green-50', content)
    # bg-yellow-500/20 -> bg-amber-100
    content = re.sub(r'\bbg-yellow-500/20\b', 'bg-amber-100', content)
    content = re.sub(r'\bbg-yellow-500/10\b', 'bg-amber-50', content)
    # bg-red-500/20 -> bg-red-100
    content = re.sub(r'\bbg-red-500/20\b', 'bg-red-100', content)
    content = re.sub(r'\bbg-red-500/10\b', 'bg-red-50', content)
    # bg-orange-500/20 -> bg-orange-100
    content = re.sub(r'\bbg-orange-500/20\b', 'bg-orange-100', content)
    content = re.sub(r'\bbg-orange-500/10\b', 'bg-orange-50', content)
    # bg-purple-500/20 -> bg-purple-100
    content = re.sub(r'\bbg-purple-500/20\b', 'bg-purple-100', content)
    content = re.sub(r'\bbg-purple-500/10\b', 'bg-purple-50', content)
    # bg-cyan-500/20 -> bg-cyan-100
    content = re.sub(r'\bbg-cyan-500/20\b', 'bg-cyan-100', content)
    content = re.sub(r'\bbg-cyan-500/10\b', 'bg-cyan-50', content)
    # bg-emerald-500/20 -> bg-emerald-100
    content = re.sub(r'\bbg-emerald-500/20\b', 'bg-emerald-100', content)
    content = re.sub(r'\bbg-emerald-500/10\b', 'bg-emerald-50', content)
    # bg-indigo-500/20 -> bg-indigo-100
    content = re.sub(r'\bbg-indigo-500/20\b', 'bg-indigo-100', content)
    content = re.sub(r'\bbg-indigo-500/10\b', 'bg-indigo-50', content)
    # bg-amber-500/20 -> bg-amber-100
    content = re.sub(r'\bbg-amber-500/20\b', 'bg-amber-100', content)
    content = re.sub(r'\bbg-amber-500/10\b', 'bg-amber-50', content)
    
    # === PATTERN 7: border-*-500/20 -> lighter borders ===
    content = re.sub(r'\bborder-blue-500/20\b', 'border-blue-200', content)
    content = re.sub(r'\bborder-blue-500/30\b', 'border-blue-300', content)
    content = re.sub(r'\bborder-green-500/20\b', 'border-green-200', content)
    content = re.sub(r'\bborder-green-500/30\b', 'border-green-300', content)
    content = re.sub(r'\bborder-yellow-500/20\b', 'border-amber-200', content)
    content = re.sub(r'\bborder-red-500/20\b', 'border-red-200', content)
    content = re.sub(r'\bborder-red-500/30\b', 'border-red-300', content)
    content = re.sub(r'\bborder-orange-500/20\b', 'border-orange-200', content)
    content = re.sub(r'\bborder-purple-500/20\b', 'border-purple-200', content)
    content = re.sub(r'\bborder-cyan-500/20\b', 'border-cyan-200', content)
    content = re.sub(r'\bborder-cyan-500/30\b', 'border-cyan-300', content)
    content = re.sub(r'\bborder-emerald-500/20\b', 'border-emerald-200', content)
    content = re.sub(r'\bborder-indigo-500/20\b', 'border-indigo-200', content)
    content = re.sub(r'\bborder-amber-500/20\b', 'border-amber-200', content)
    
    # === PATTERN 8: hover:bg-*-500/30 -> lighter hovers ===
    content = re.sub(r'\bhover:bg-blue-500/30\b', 'hover:bg-blue-200', content)
    content = re.sub(r'\bhover:bg-red-500/30\b', 'hover:bg-red-200', content)
    content = re.sub(r'\bhover:bg-green-500/30\b', 'hover:bg-green-200', content)
    content = re.sub(r'\bhover:bg-cyan-500/30\b', 'hover:bg-cyan-200', content)
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

# Process all TSX files
files = glob.glob('client/src/**/*.tsx', recursive=True)
changed = 0
for filepath in sorted(files):
    if should_skip(filepath):
        continue
    if fix_file(filepath):
        changed += 1
        print(f'✓ {os.path.basename(filepath)}')

print(f'\nTotal files changed: {changed}')
