#!/bin/bash
# update_runtime.sh - Add restaurant and menu APIs to ATAJ runtime

echo "🔧 Updating ATAJ Runtime with Restaurant & Menu APIs"

cd /var/minis/workspace/atajv3

# Read the new .ataj files
RESTAURANT_CONTENT=$(cat api/restaurant.ataj)
MENU_CONTENT=$(cat api/menu.ataj)

# Create a Node.js script to update the runtime
cat > update_runtime.js << 'EOF'
const fs = require('fs');
const path = require('path');

// Read the runtime file
const runtimePath = path.join(__dirname, 'api/ataj-runtime.js');
let runtime = fs.readFileSync(runtimePath, 'utf8');

// Read the new .ataj files
const restaurantContent = fs.readFileSync(path.join(__dirname, 'api/restaurant.ataj'), 'utf8');
const menuContent = fs.readFileSync(path.join(__dirname, 'api/menu.ataj'), 'utf8');

// Escape the content for embedding in JavaScript string
const escapedRestaurant = restaurantContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
const escapedMenu = menuContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

// Add the new entries to ATAJ_SOURCES
const newSources = `
  "restaurant.ataj": \`${escapedRestaurant}\`,

  "menu.ataj": \`${escapedMenu}\`,
`;

// Insert before the closing brace of ATAJ_SOURCES
runtime = runtime.replace(
  /(const ATAJ_SOURCES = \{)/,
  '$1\n' + newSources
);

// Update the buildResponse function to handle new apps
const newCases = `
    case app.includes('EspaceYafaRestaurant') || app.includes('Restaurant'):
      return {
        restaurant: {
          id: 'espace-yafa-casa',
          name: 'Espace Yafa',
          name_ar: 'فضاء يافا',
          address: 'HF98+VPM, Casablanca 20250, Morocco',
          phone: '+212 522-123456',
          email: 'info@espaceyafa.ma',
          description: 'Authentic Moroccan cuisine in the heart of Casablanca'
        },
        keywords: keywordList
      };
    case app.includes('EspaceYafaMenu') || app.includes('Menu'):
      return {
        categories: [
          { id: 1, name: 'Appetizers', name_ar: 'المقبلات', items: [] },
          { id: 2, name: 'Main Courses', name_ar: 'الأطباق الرئيسية', items: [] },
          { id: 3, name: 'Tagines', name_ar: 'الطاجين', items: [] }
        ],
        menu_items: [
          { id: 'item_001', name: 'Harira Soup', name_ar: 'حساء الحريرة', price: 45.00, category: 1, image_url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd' },
          { id: 'item_002', name: 'Chicken Pastilla', name_ar: 'بسطيلة الدجاج', price: 120.00, category: 2, image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a7ae38' },
          { id: 'item_003', name: 'Lamb Tagine with Prunes', name_ar: 'طاجين لحم بالبرقوق', price: 180.00, category: 3, image_url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836' }
        ],
        keywords: keywordList
      };
`;

// Insert new cases before the default case in buildResponse
runtime = runtime.replace(
  /(case app\.includes\('GDPR'\):[\s\S]*?return \{[^}]*\};)/,
  '$1\n' + newCases
);

// Write the updated runtime
fs.writeFileSync(runtimePath, runtime);
console.log('✅ Runtime updated successfully!');
EOF

# Run the update script
node update_runtime.js

# Clean up
rm update_runtime.js

echo ""
echo "✅ ATAJ Runtime updated with:"
echo "  - api/restaurant.ataj"
echo "  - api/menu.ataj"
echo ""
echo "Next steps:"
echo "1. Run: ./deploy.sh production"
echo "2. Visit: https://atajv3.vercel.app/api/restaurant"
echo "3. Visit: https://atajv3.vercel.app/api/menu"
