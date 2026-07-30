#!/bin/bash
# Quick ATAJ syntax fixer for the most critical issues
# Applied directly to the most problematic files

set -e

echo "🔧 ATAJ Syntax Fixer v2.0"

echo ""
echo "🔍 Fixing most critical syntax issues..."

# Fix api/reviews.ataj - most problematic
if [ -f "api/reviews.ataj" ]; then
    cp api/reviews.ataj api/reviews.ataj.backup
    sed -i 's/DORe/DO/g' api/reviews.ataj
    sed -i 's/DO\.Emit/DO Emit/g' api/reviews.ataj
    echo "✅ Fixed api/reviews.ataj"
fi

# Fix api/analytics.ataj  
if [ -f "api/analytics.ataj" ]; then
    cp api/analytics.ataj api/analytics.ataj.backup
    sed -i 's/DO\.Emit/DO Emit/g' api/analytics.ataj
    echo "✅ Fixed api/analytics.ataj"
fi

# Fix all .ataj files - convert CALL to DO Call (critical for .ataj language)
for file in $(find . -name "*.ataj" -type f); do
    if grep -q "^CALL " "$file" 2>/dev/null; then
        cp "$file" "$file.backup"
        sed -i 's/^CALL /DO Call /g' "$file"
        echo "✅ Fixed CALL → DO Call in $file"
    fi
    
    if grep -q "FOR each" "$file"; then
        sed -i 's/FOR each/FOR EACH/g' "$file"
        echo "✅ Fixed FOR each → FOR EACH in $file"
    fi

done

echo ""
echo "🎉 Syntax fixes applied!

echo "These changes:
• Convert CALL to DO Call (extension keyword now officially supported)
• Fix DO.Emit spacing inconsistencies  
• Standardize FOR EACH casing
• Maintain 8-keyword language core
• Use only 8 core keywords (APP, HAVE, SHOW, DO, WHEN, ON, USE, AGENT)

The .ataj files now properly implement the 8-keyword ATAJ programming language with extension keyword CALL."