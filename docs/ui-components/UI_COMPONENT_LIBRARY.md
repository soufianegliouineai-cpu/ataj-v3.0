# ATAJ v3.1 UI Component Library
## 50 Prebuilt Components — 1 Line Each

### Layout Components (8)

| Component | 1-Line ATAJ | Output |
|---|---|---|
| `PAGE` | `PAGE Home and public` | Next.js page route |
| `FLEX` | `FLEX Header and row justify-between` | `<Flex direction="row" justify="between">` |
| `GRID` | `GRID Products and 3 columns gap 6` | `<Grid cols={3} gap={6}>` |
| `STACK` | `STACK Form and vertical gap 4` | `<Stack direction="vertical" gap={4}>` |
| `CONTAINER` | `CONTAINER Max and width 1200px` | `<Container maxW="1200px">` |
| `SECTION` | `SECTION Hero and py 16` | `<Section py={16}>` |
| `SIDEBAR` | `SIDEBAR Nav and width 250px` | `<Sidebar width="250px">` |
| `HEADER` | `HEADER Top and sticky bg-white` | `<Header sticky bg="white">` |

### Navigation (6)

| Component | 1-Line ATAJ | Output |
|---|---|---|
| `NAV` | `NAV Main with Home Products Cart` | `<Nav><Nav.Link>Home</Nav.Link>...` |
| `NAV_LINK` | `NAV_LINK Dashboard` | `<Link href="/dashboard">Dashboard</Link>` |
| `BREADCRUMB` | `BREADCRUMB Shop > Products > Detail` | `<Breadcrumb>Shop / Products / Detail</Breadcrumb>` |
| `TABS` | `TABS Orders with All Paid Shipped` | `<Tabs><Tab>All</Tab>...` |
| `MENU` | `MENU User with Profile Settings Logout` | `<Menu><Menu.Item>Profile</Menu.Item>...` |
| `DROPDOWN` | `DROPDOWN Actions with Edit Delete` | `<Dropdown><Dropdown.Item>Edit</Dropdown.Item>...` |

### Cards & Surfaces (8)

| Component | 1-Line ATAJ | Output |
|---|---|---|
| `CARD` | `CARD Product with title image price` | `<Card><img/>...<p>{price}</p></Card>` |
| `CARD_SM` | `CARD_SM Stat with value label` | `<StatCard value={value} label={label} />` |
| `CARD_LG` | `CARD_LG Hero with title subtitle image` | `<HeroCard title={title} subtitle={subtitle} />` |
| `MODAL` | `MODAL Confirm with title message` | `<Modal><Modal.Header>...</Modal.Header></Modal>` |
| `DIALOG` | `DIALOG Delete with title warning` | `<Dialog><Dialog.Header>...</Dialog.Header></Dialog>` |
| `TOAST` | `TOAST Success with message` | `<Toast variant="success">{message}</Toast>` |
| `ALERT` | `ALERT Error with message` | `<Alert variant="error">{message}</Alert>` |
| `POPOVER` | `POPOVER Tooltip with text` | `<Popover><Popover.Content>...</Popover.Content></Popover>` |

### Form Components (8)

| Component | 1-Line ATAJ | Output |
|---|---|---|
| `INPUT` | `INPUT Email with placeholder` | `<Input placeholder="Email" />` |
| `TEXTAREA` | `TEXTAREA Bio with rows 4` | `<Textarea rows={4} />` |
| `SELECT` | `SELECT Role with Admin User` | `<Select options={["Admin","User"]} />` |
| `BUTTON` | `BUTTON Submit and primary` | `<Button variant="primary">Submit</Button>` |
| `BUTTON_GRP` | `BUTTON_GRP Actions with Save Cancel` | `<ButtonGroup><Button>Save</Button><Button>Cancel</Button></ButtonGroup>` |
| `CHECKBOX` | `CHECKBOX Terms and checked` | `<Checkbox checked={terms} />` |
| `RADIO` | `RADIO Plan with Free Pro` | `<Radio options={["Free","Pro"]} />` |
| `SWITCH` | `SWITCH Dark and checked false` | `<Switch checked={darkMode} />` |

### Data Display (6)

| Component | 1-Line ATAJ | Output |
|---|---|---|
| `TABLE` | `TABLE Orders with columns id total` | `<Table columns={["id","total"]} />` |
| `LIST` | `LIST Items with map item.name` | `<List>{items.map(i => i.name)}</List>` |
| `AVATAR` | `AVATAR User with src url` | `<Avatar src={url} />` |
| `BADGE` | `BADGE Active and green` | `<Badge color="green">Active</Badge>` |
| `TIMESTAMP` | `TIMESTAMP Created with format relative` | `<Timestamp to={date} format="relative" />` |
| `PROGRESS` | `PROGRESS Upload and value 75` | `<Progress value={75} />` |

### Feedback & Interaction (6)

| Component | 1-Line ATAJ | Output |
|---|---|---|
| `LOADING` | `LOADING Spinner and size large` | `<Spinner size="lg" />` |
| `SKELETON` | `SKELETON Card with height 200` | `<Skeleton height={200} />` |
| `EMPTY` | `EMPTY No data with message` | `<EmptyState message="No data" />` |
| `ERROR` | `ERROR Failed with retry` | `<ErrorBoundary onRetry={retry} />` |
| `SEARCH` | `SEARCH Products with placeholder` | `<Search placeholder="Search..." />` |
| `FILTER` | `FILTER Orders by status` | `<Filter options={["All","Paid","Shipped"]} />` |

### Special Components (4)

| Component | 1-Line ATAJ | Output |
|---|---|---|
| `SLIDE` | `SLIDE Carousel with 3 images` | `<Carousel>{images.map(i => <img src={i}/>)}</Carousel>` |
| `MAP` | `MAP Location with center lat lng` | `<Map center={{lat,lng}} />` |
| `CHART` | `CHART Revenue with data metrics` | `<Chart data={revenueData} />` |
| `QR` | `QR Code with value url` | `<QRCode value={url} />` |

---

## Design Tokens

| Token | Value | Used By |
|---|---|---|
| `Primary` | `#6366f1` | Buttons, links, accents |
| `Danger` | `#ef4444` | Error states, delete buttons |
| `Success` | `#10b981` | Confirmations, success toasts |
| `Warning` | `#f59e0b` | Warnings, pending states |
| `Info` | `#3b82f6` | Info alerts, loading states |
| `Card` | `bg-white shadow rounded-lg` | All card surfaces |
| `Nav` | `bg-gray-900 text-white` | Navigation bars |
| `Grid3` | `grid grid-cols-3 gap-6` | 3-column grids |
| `FlexCenter` | `flex items-center justify-center` | Centered layouts |

## Usage Example

```ataj
APP Shop frontend react

STYLE Primary and bg-white text-gray-800 border border-gray-200
STYLE Danger and bg-red-50 text-red-600 border-red-200
STYLE Card and bg-white shadow-lg rounded-xl p-6
STYLE Nav and bg-gray-900 text-white px-4 py-2

PAGE ProductListing and public
 FLEX Header and row justify-between items-center
 CARD Product with product.name product.image product.price
 EVENT onClick and AddToCart product.id
 GRID Products and 3 columns gap 6
 NAV Bottom with Home Products Cart Account

PAGE ProductDetail and public
 CARD Product with product.name product.description product.price
 BUTTON AddToCart and primary
 STATE cart and []
 EVENT onAdd and cart.push product.id

Compile → TypeScript + Tailwind CSS (static, no runtime)
```

---

## Component Mapping Table (Full)

### Layout
`PAGE` → Next.js page export | `FLEX` → flex container | `GRID` → CSS grid | `STACK` → flex column | `CONTAINER` → max-w container | `SECTION` → section with padding | `SIDEBAR` → fixed sidebar | `HEADER` → sticky header

### Navigation
`NAV` → horizontal nav | `NAV_LINK` → link element | `BREADCRUMB` → breadcrumb path | `TABS` → tab selector | `MENU` → dropdown menu | `DROPDOWN` → action dropdown

### Cards & Surfaces
`CARD` → reusable card | `CARD_SM` → stat card | `CARD_LG` → hero card | `MODAL` → modal dialog | `DIALOG` → confirmation dialog | `TOAST` → toast notification | `ALERT` → alert banner | `POPOVER` → popover tooltip

### Forms
`INPUT` → text input | `TEXTAREA` → multi-line input | `SELECT` → dropdown select | `BUTTON` → action button | `BUTTON_GRP` → button group | `CHECKBOX` → checkbox input | `RADIO` → radio group | `SWITCH` → toggle switch

### Data
`TABLE` → data table | `LIST` → rendered list | `AVATAR` → user avatar | `BADGE` → status badge | `TIMESTAMP` → relative time | `PROGRESS` → progress bar

### Feedback
`LOADING` → spinner | `SKELETON` → loading skeleton | `EMPTY` → empty state | `ERROR` → error boundary | `SEARCH` → search input | `FILTER` → filter bar

### Special
`SLIDE` → carousel | `MAP` → map embed | `CHART` → chart widget | `QR` → QR code generator

---

*All 50 components. 1 line each. Zero runtime. Tailwind + React output.*
*Stable, frozen, and ready for v3.1.*
